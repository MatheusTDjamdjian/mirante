// Caso de uso do ciclo de coleta de uma fonte.
//
// O que garante consistencia sob falha e a ordem: a rede acontece **fora** da
// transacao, e a transacao cobre apenas as duas escritas que precisam ser
// atomicas — os itens e o estado de cache da fonte. Se a rede cai no meio do
// fetch, nada foi escrito. Se o processo morre no meio da transacao, o Postgres
// desfaz. Nao existe janela em que os itens entraram e o ETag nao, ou o inverso.
//
// Se o ETag entrasse sem os itens, o proximo ciclo receberia `304` e os itens
// estariam perdidos para sempre — silenciosamente, que e o pior modo.

import type { AdaptadorFonte, MetricaDeColeta } from '@mirante/adapters';
import type { EstadoDeColeta } from '@mirante/domain';
import {
  FonteRepositorio,
  ItemRepositorio,
  type ConexaoBanco,
  type FonteLinha,
} from '@mirante/persistence';
import type { FabricaDeAdaptadores } from './fabrica-de-adaptadores';
import type { Logger } from './log';

export class FonteInexistenteError extends Error {
  constructor(fonteId: string) {
    super(`Fonte ${fonteId} nao existe.`);
    this.name = 'FonteInexistenteError';
  }
}

export class CicloDeColeta {
  constructor(
    private readonly conexao: ConexaoBanco,
    private readonly fabrica: FabricaDeAdaptadores,
    private readonly logger: Logger,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /** Fontes ativas, na ordem em que o ciclo vai visita-las. */
  async fontesAtivas(): Promise<readonly FonteLinha[]> {
    return new FonteRepositorio(this.conexao.db).buscarAtivas();
  }

  /**
   * Coleta uma fonte. **Nunca lanca.**
   *
   * Mesma garantia que o contrato do adaptador da (`coletar` devolve variante de
   * falha em vez de excecao), agora estendida ao banco. Motivo concreto: numa
   * execucao real o pool do Postgres estourou `connectionTimeoutMillis` e a
   * excecao subiu ate o `main`, que abortou o processo — enquanto os outros
   * grupos de dominio ainda estavam em voo, e um deles logou sucesso **depois**
   * do log de aborto.
   *
   * Falha de banco numa fonte nao e diferente de falha de rede numa fonte: as
   * outras cinco tem de terminar.
   */
  async coletarFonte(
    fonteId: string,
    cicloId: string,
  ): Promise<MetricaDeColeta> {
    try {
      return await this.tentarColetarFonte(fonteId, cicloId);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(
        { ciclo_id: cicloId, fonte_id: fonteId, motivo },
        'falha inesperada na coleta',
      );
      return {
        fonte_id: fonteId,
        fonte_nome: '(desconhecida)',
        resultado: 'falha',
        coletados: 0,
        novos: 0,
        duplicados: 0,
        descartados: 0,
        duracao_ms: 0,
      };
    }
  }

  private async tentarColetarFonte(
    fonteId: string,
    cicloId: string,
  ): Promise<MetricaDeColeta> {
    const inicio = process.hrtime.bigint();
    const repositorioFonte = new FonteRepositorio(this.conexao.db);

    const fonte = await repositorioFonte.buscarPorId(fonteId);
    if (fonte === undefined) throw new FonteInexistenteError(fonteId);

    // Só `ciclo_id` no binding: `fonte_id` já vem em toda `MetricaDeColeta`, e
    // ter os dois produzia chave duplicada no JSON do log.
    const log = this.logger.child({ ciclo_id: cicloId });

    let adaptador: AdaptadorFonte;
    try {
      adaptador = this.fabrica.criar(fonte);
    } catch (erro) {
      // Fonte sem catalogo ou sem adaptador e erro de configuracao, nao de
      // coleta. Falha isolada: as outras fontes do ciclo seguem.
      const metrica = this.metricaVazia(fonte, 'falha', inicio);
      log.error(
        {
          ...metrica,
          motivo: erro instanceof Error ? erro.message : String(erro),
        },
        'fonte sem adaptador',
      );
      return metrica;
    }

    const estado = await repositorioFonte.estadoDeColeta(fonte.id);

    // --- rede, fora da transacao ---
    const resultado = await adaptador.coletar(estado);

    switch (resultado.tipo) {
      case 'circuito-aberto': {
        const metrica = this.metricaVazia(fonte, resultado.tipo, inicio);
        log.warn(
          { ...metrica, tentar_apos: resultado.tentarApos.toISOString() },
          'circuito aberto, nao tentou',
        );
        return metrica;
      }

      case 'falha': {
        const metrica: MetricaDeColeta = {
          ...this.metricaVazia(fonte, resultado.tipo, inicio),
          ...(resultado.erro.status !== undefined
            ? { status_http: resultado.erro.status }
            : {}),
        };
        // `ultima_coleta_em` NAO avanca: nao houve conversa bem-sucedida com a
        // fonte, e o painel de saude da Onda 3 precisa dessa distincao.
        log.error(
          {
            ...metrica,
            categoria: resultado.erro.categoria,
            motivo: resultado.erro.mensagem,
            ...(resultado.erro.tentarApos !== undefined
              ? { tentar_apos: resultado.erro.tentarApos.toISOString() }
              : {}),
          },
          'falha na coleta',
        );
        return metrica;
      }

      case 'nao-modificado': {
        // O caminho barato. Guarda o estado que ja tinha e avanca o timestamp:
        // a fonte respondeu, so nao mudou.
        await this.persistirNaoModificado(fonte.id, estado);
        const metrica = this.metricaVazia(fonte, resultado.tipo, inicio);
        log.info({ ...metrica, status_http: 304 }, 'nada mudou na fonte');
        return { ...metrica, status_http: 304 };
      }

      case 'coletado': {
        const escrita = await this.persistirColetado(
          fonte.id,
          resultado.itens,
          resultado.estado,
        );

        const metrica: MetricaDeColeta = {
          fonte_id: fonte.id,
          fonte_nome: fonte.nome,
          resultado: 'coletado',
          coletados: resultado.itens.length,
          novos: escrita.novos,
          duplicados: escrita.duplicados + escrita.duplicadosNoLote,
          descartados: resultado.descartados.length,
          duracao_ms: this.duracaoMs(inicio),
        };

        log.info(
          {
            ...metrica,
            // Motivos agregados, nao item a item: o log e para operar, nao para
            // guardar conteudo de terceiro.
            descartes_por_motivo: contarPorMotivo(resultado.descartados),
          },
          'ciclo de coleta concluido',
        );
        return metrica;
      }
    }
  }

  private async persistirNaoModificado(
    fonteId: string,
    estado: EstadoDeColeta,
  ): Promise<void> {
    await this.conexao.db.transaction().execute(async (trx) => {
      await new FonteRepositorio(trx).registrarColeta(
        fonteId,
        estado,
        this.agora(),
      );
    });
  }

  private async persistirColetado(
    fonteId: string,
    itens: Parameters<ItemRepositorio['inserirIgnorandoDuplicata']>[0],
    estadoNovo: EstadoDeColeta,
  ) {
    return this.conexao.db.transaction().execute(async (trx) => {
      const escrita = await new ItemRepositorio(trx).inserirIgnorandoDuplicata(
        itens,
      );
      await new FonteRepositorio(trx).registrarColeta(
        fonteId,
        estadoNovo,
        this.agora(),
      );
      return escrita;
    });
  }

  private metricaVazia(
    fonte: FonteLinha,
    resultado: MetricaDeColeta['resultado'],
    inicio: bigint,
  ): MetricaDeColeta {
    return {
      fonte_id: fonte.id,
      fonte_nome: fonte.nome,
      resultado,
      coletados: 0,
      novos: 0,
      duplicados: 0,
      descartados: 0,
      duracao_ms: this.duracaoMs(inicio),
    };
  }

  private duracaoMs(inicio: bigint): number {
    return Number(process.hrtime.bigint() - inicio) / 1_000_000;
  }
}

function contarPorMotivo(
  descartados: readonly { readonly motivo: string }[],
): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const { motivo } of descartados) {
    contagem[motivo] = (contagem[motivo] ?? 0) + 1;
  }
  return contagem;
}
