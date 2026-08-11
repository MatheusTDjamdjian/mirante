// Um ciclo completo: todas as fontes ativas, uma vez.
//
// Compartilhado entre o modo `--uma-vez` e o job da fila, para que o que o
// comando manual prova seja exatamente o que o worker agendado executa.
//
// Paralelismo por dominio, sequencial dentro do dominio.
//
// O teto do CONTEXTO.md secao 9 e 90s para o ciclo inteiro, e sequencial nao
// escala. Mas paralelo cego tambem nao serve: as tres fontes do Investing.com
// compartilham `br.investing.com`, e disparar tres requisicoes simultaneas contra
// o mesmo host e o comportamento que rende 429 e, como medido contra o GDELT nesta
// onda, bloqueio de conexao que dura minutos.
//
// Dominios diferentes nao competem entre si, entao correm juntos.

import type { MetricaDeColeta } from '@mirante/adapters';
import type { TipoDeFonte } from '@mirante/domain';
import type { FonteLinha } from '@mirante/persistence';
import type { Aplicacao } from './montar';

/** Tipos que rodam na cadencia dos feeds de noticia. */
export const TIPOS_RSS: readonly TipoDeFonte[] = ['rss', 'oficial'];

/** Tipos que rodam na cadencia propria, mais espacada. */
export const TIPOS_GDELT: readonly TipoDeFonte[] = ['gdelt'];

export interface ResumoDoCiclo {
  readonly ciclo_id: string;
  readonly recorte: string;
  readonly fontes: number;
  readonly dominios: number;
  readonly coletados: number;
  readonly novos: number;
  readonly duplicados: number;
  readonly descartados: number;
  readonly nao_modificados: number;
  readonly falhas: number;
  readonly circuitos_abertos: number;
  readonly duracao_ms: number;
}

/** Agrupa por dominio, preservando ordem estavel para o log ser comparavel. */
export function agruparPorDominio(
  fontes: readonly FonteLinha[],
): ReadonlyMap<string, readonly FonteLinha[]> {
  const grupos = new Map<string, FonteLinha[]>();
  for (const fonte of fontes) {
    const grupo = grupos.get(fonte.dominio);
    if (grupo === undefined) grupos.set(fonte.dominio, [fonte]);
    else grupo.push(fonte);
  }
  return grupos;
}

/**
 * Recorte de fontes de um ciclo.
 *
 * Existe porque cadencia e por tipo de fonte, nao global: os feeds RSS rodam a
 * cada 5 min e o GDELT a cada 30. Ver ADR-026.
 */
export interface RecorteDoCiclo {
  readonly tipos?: readonly TipoDeFonte[];
  /** Rotulo do recorte, para o log distinguir os dois agendamentos. */
  readonly rotulo?: string;
}

export async function executarCiclo(
  app: Aplicacao,
  recorte: RecorteDoCiclo = {},
): Promise<ResumoDoCiclo> {
  const cicloId = app.proximoCicloId();
  const todas = await app.ciclo.fontesAtivas();
  const fontes =
    recorte.tipos === undefined
      ? todas
      : todas.filter((f) => recorte.tipos?.includes(f.tipo) === true);
  const grupos = agruparPorDominio(fontes);

  app.logger.info(
    {
      ciclo_id: cicloId,
      recorte: recorte.rotulo ?? 'todas',
      fontes: fontes.length,
      dominios: grupos.size,
    },
    'iniciando ciclo',
  );

  if (fontes.length === 0) {
    // Recorte que nao casa com nenhuma fonte ativa e configuracao errada, nao
    // rotina: sem este aviso, um agendamento apontando para tipo inexistente
    // rodaria para sempre sem coletar nada e sem reclamar.
    app.logger.warn(
      { ciclo_id: cicloId, recorte: recorte.rotulo ?? 'todas' },
      'recorte nao casou com nenhuma fonte ativa',
    );
  }

  const inicio = process.hrtime.bigint();

  // `allSettled`, nao `all`.
  //
  // `Promise.all` rejeita na primeira falha e abandona os outros grupos em voo.
  // Aconteceu de verdade: um estouro de `connectionTimeoutMillis` do pool subiu
  // ate o `main`, que abortou o processo, e um grupo que ainda estava rodando
  // logou sucesso **depois** do log de aborto. Ciclo pela metade, banco com
  // escrita parcial de uma fonte e nenhuma da outra.
  //
  // Com `coletarFonte` nao lancando mais (ver ciclo-de-coleta.ts), rejeicao aqui
  // e improvavel — `allSettled` e a rede de seguranca que garante a invariante
  // mesmo assim.
  const porGrupo = await Promise.allSettled(
    [...grupos.values()].map(async (doDominio) => {
      const metricas: MetricaDeColeta[] = [];
      for (const fonte of doDominio) {
        metricas.push(await app.ciclo.coletarFonte(fonte.id, cicloId));
      }
      return metricas;
    }),
  );

  const metricas: MetricaDeColeta[] = [];
  for (const resultado of porGrupo) {
    if (resultado.status === 'fulfilled') {
      metricas.push(...resultado.value);
    } else {
      app.logger.error(
        {
          ciclo_id: cicloId,
          motivo:
            resultado.reason instanceof Error
              ? resultado.reason.message
              : String(resultado.reason),
        },
        'grupo de dominio falhou inteiro',
      );
    }
  }

  const resumo: ResumoDoCiclo = {
    ciclo_id: cicloId,
    recorte: recorte.rotulo ?? 'todas',
    fontes: metricas.length,
    dominios: grupos.size,
    coletados: soma(metricas, (m) => m.coletados),
    novos: soma(metricas, (m) => m.novos),
    duplicados: soma(metricas, (m) => m.duplicados),
    descartados: soma(metricas, (m) => m.descartados),
    nao_modificados: contar(metricas, 'nao-modificado'),
    falhas: contar(metricas, 'falha'),
    circuitos_abertos: contar(metricas, 'circuito-aberto'),
    duracao_ms: Number(process.hrtime.bigint() - inicio) / 1_000_000,
  };

  // Teto do CONTEXTO.md secao 9. Passar disso nao derruba nada, mas tem de
  // aparecer no log como aviso, nao como linha de rotina.
  if (resumo.duracao_ms > 90_000) {
    app.logger.warn(
      { ...resumo, teto_ms: 90_000 },
      'ciclo passou do teto de 90s',
    );
  } else {
    app.logger.info(resumo, 'ciclo concluido');
  }

  return resumo;
}

function soma(
  metricas: readonly MetricaDeColeta[],
  extrair: (m: MetricaDeColeta) => number,
): number {
  return metricas.reduce((total, m) => total + extrair(m), 0);
}

function contar(
  metricas: readonly MetricaDeColeta[],
  resultado: MetricaDeColeta['resultado'],
): number {
  return metricas.filter((m) => m.resultado === resultado).length;
}
