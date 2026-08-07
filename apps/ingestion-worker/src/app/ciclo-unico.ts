// Um ciclo completo: todas as fontes ativas, uma vez.
//
// Compartilhado entre o modo `--uma-vez` e o job da fila, para que o que o
// comando manual prova seja exatamente o que o worker agendado executa.

import type { MetricaDeColeta } from '@mirante/adapters';
import type { Aplicacao } from './montar';

export interface ResumoDoCiclo {
  readonly ciclo_id: string;
  readonly fontes: number;
  readonly coletados: number;
  readonly novos: number;
  readonly duplicados: number;
  readonly descartados: number;
  readonly falhas: number;
  readonly duracao_ms: number;
}

export async function executarCiclo(app: Aplicacao): Promise<ResumoDoCiclo> {
  const cicloId = app.proximoCicloId();
  const fontes = await app.ciclo.fontesAtivas();

  app.logger.info(
    { ciclo_id: cicloId, fontes: fontes.length },
    'iniciando ciclo',
  );

  const inicio = process.hrtime.bigint();
  const metricas: MetricaDeColeta[] = [];

  // Sequencial nesta onda: com uma fonte, paralelismo nao mede nada e esconderia
  // o custo real de cada fonte no log. Ciclo paralelo, com o teto de 90s do
  // CONTEXTO.md secao 9, entra na Onda 3, quando houver seis fontes.
  for (const fonte of fontes) {
    metricas.push(await app.ciclo.coletarFonte(fonte.id, cicloId));
  }

  const resumo: ResumoDoCiclo = {
    ciclo_id: cicloId,
    fontes: metricas.length,
    coletados: soma(metricas, (m) => m.coletados),
    novos: soma(metricas, (m) => m.novos),
    duplicados: soma(metricas, (m) => m.duplicados),
    descartados: soma(metricas, (m) => m.descartados),
    falhas: metricas.filter((m) => m.resultado === 'falha').length,
    duracao_ms: Number(process.hrtime.bigint() - inicio) / 1_000_000,
  };

  app.logger.info(resumo, 'ciclo concluido');
  return resumo;
}

function soma(
  metricas: readonly MetricaDeColeta[],
  extrair: (m: MetricaDeColeta) => number,
): number {
  return metricas.reduce((total, m) => total + extrair(m), 0);
}
