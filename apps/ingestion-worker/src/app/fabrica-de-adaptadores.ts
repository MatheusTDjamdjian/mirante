// Fabrica de adaptadores.
//
// CLAUDE.md secao 5: "sem condicional por tipo de fonte fora da fabrica". Este e
// o unico lugar do projeto onde existe `switch` por `fonte.tipo` — e por isso
// que adicionar uma fonte na Onda 3 nao espalha `if` pelo ciclo de coleta.
//
// A URL do feed nao mora na tabela `fonte`: o schema canonico nao tem coluna para
// ela (CONTEXTO.md secao 4), e o schema esta fechado. Ela vem do catalogo abaixo,
// casado por `(dominio, nome)`.

import type { AdaptadorFonte } from '@mirante/adapters';
import { AdaptadorGdelt, AdaptadorRss } from '@mirante/adapters';
import type { CodigoIdioma, RegiaoDeItem } from '@mirante/domain';
import type { FonteLinha } from '@mirante/persistence';

export interface EntradaDeCatalogo {
  readonly nome: string;
  readonly dominio: string;
  /** URL do feed. Ignorada para `tipo: 'gdelt'`, que monta a propria. */
  readonly url: string;
  readonly idioma: CodigoIdioma;
  readonly regiao: RegiaoDeItem;
  /** Secoes editoriais de interesse. Ausente desliga o filtro. */
  readonly categoriasPermitidas?: readonly string[];
  /** Consultas tematicas. So para `tipo: 'gdelt'`. */
  readonly consultas?: readonly string[];
  /**
   * Teto de artigos por consulta do GDELT.
   *
   * Calibra o balanco entre cobertura brasileira e global. Ver ADR-026.
   */
  readonly maxrecords?: number;
}

export class FonteSemCatalogoError extends Error {
  constructor(fonte: FonteLinha) {
    super(
      `Fonte "${fonte.nome}" (${fonte.dominio}) esta no banco mas nao no catalogo. ` +
        'Adicione a entrada em fabrica-de-adaptadores.ts ou desative a fonte.',
    );
    this.name = 'FonteSemCatalogoError';
  }
}

export class TipoDeFonteNaoSuportadoError extends Error {
  constructor(tipo: string) {
    super(`Tipo de fonte sem adaptador: ${tipo}`);
    this.name = 'TipoDeFonteNaoSuportadoError';
  }
}

function chave(dominio: string, nome: string): string {
  return `${dominio}|${nome}`;
}

export class FabricaDeAdaptadores {
  private readonly catalogo: Map<string, EntradaDeCatalogo>;

  /**
   * Uma instancia de adaptador por fonte, reutilizada entre ciclos.
   *
   * **Isto nao e cache por desempenho.** O adaptador e sem estado exceto por uma
   * coisa: o circuit breaker. Criar instancia nova a cada ciclo faz o breaker
   * nascer `fechado` sempre, e ele passa a proteger apenas *dentro* de um ciclo —
   * entre as seis consultas do GDELT, por exemplo.
   *
   * O aceite da Onda 3 exige mais: "GDELT devolvendo 429 abre o circuito, **e o
   * ciclo seguinte nao tenta antes do Retry-After**". Sem reuso da instancia, o
   * ciclo seguinte tenta — e foi o que descobri medindo, nao lendo: o teste do
   * breaker passava porque chamava `coletar` duas vezes no mesmo objeto, o que a
   * producao nao fazia.
   *
   * Limite conhecido: reinicio do processo zera o breaker. Estado durável entre
   * reinicios exigiria Redis, que e para onde o painel de saude vai — anotado no
   * BACKLOG.md, nao resolvido aqui.
   */
  private readonly instancias = new Map<string, AdaptadorFonte>();

  constructor(
    entradas: readonly EntradaDeCatalogo[],
    private readonly timeoutMs: number,
  ) {
    this.catalogo = new Map(
      entradas.map((entrada) => [
        chave(entrada.dominio, entrada.nome),
        entrada,
      ]),
    );
  }

  criar(fonte: FonteLinha): AdaptadorFonte {
    const existente = this.instancias.get(fonte.id);
    if (existente !== undefined) return existente;

    const nova = this.construir(fonte);
    this.instancias.set(fonte.id, nova);
    return nova;
  }

  private construir(fonte: FonteLinha): AdaptadorFonte {
    const entrada = this.catalogo.get(chave(fonte.dominio, fonte.nome));
    if (entrada === undefined) throw new FonteSemCatalogoError(fonte);

    switch (fonte.tipo) {
      case 'rss':
      case 'oficial':
        // `oficial` (Agencia Brasil, Agencia Gov) tambem entrega RSS. O que
        // muda entre os dois e a licenca, nao o protocolo.
        return new AdaptadorRss({
          fonteId: fonte.id,
          nome: fonte.nome,
          dominio: fonte.dominio,
          url: entrada.url,
          idioma: entrada.idioma,
          regiao: entrada.regiao,
          timeoutMs: this.timeoutMs,
          ...(entrada.categoriasPermitidas !== undefined
            ? { categoriasPermitidas: entrada.categoriasPermitidas }
            : {}),
        });
      case 'gdelt':
        return new AdaptadorGdelt({
          fonteId: fonte.id,
          nome: fonte.nome,
          dominio: fonte.dominio,
          timeoutMs: this.timeoutMs,
          ...(entrada.consultas !== undefined
            ? { consultas: entrada.consultas }
            : {}),
          ...(entrada.maxrecords !== undefined
            ? { maxrecords: entrada.maxrecords }
            : {}),
        });
      default:
        throw new TipoDeFonteNaoSuportadoError(String(fonte.tipo));
    }
  }
}
