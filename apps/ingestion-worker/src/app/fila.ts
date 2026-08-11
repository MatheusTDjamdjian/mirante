// Fila BullMQ do ciclo de coleta.
//
// CLAUDE.md secao 5: todo job e idempotente, retry com backoff exponencial e
// jitter, e job que falha tres vezes vai para dead-letter com payload preservado.
//
// A idempotencia deste job nao vem de um flag: vem de `url_hash` unico e da
// requisicao condicional. Rodar o mesmo job duas vezes coleta os mesmos itens e
// grava zero.
//
// **Dois agendamentos, nao um.** Os feeds de noticia rodam a cada 5 min; o GDELT,
// a cada 30. Motivo medido: o GDELT permite uma requisicao a cada 5 s, e seis
// consultas tematicas espacadas consomem ~33 s — na cadencia do RSS ele sozinho
// dominaria o orcamento de 90 s do ciclo, para trazer quase nada de novo numa
// janela movel de tres meses. Ver ADR-026.

import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import {
  executarCiclo,
  TIPOS_GDELT,
  TIPOS_RSS,
  type ResumoDoCiclo,
} from './ciclo-unico';
import type { Aplicacao } from './montar';

export const NOME_DA_FILA = 'coleta';

/** Um nome de job por cadencia. O `data` do job carrega o recorte. */
export const JOB_RSS = 'coletar-rss';
export const JOB_GDELT = 'coletar-gdelt';

interface DadosDoJob {
  readonly recorte: 'rss' | 'gdelt';
}

export interface FilaDeColeta {
  readonly fila: Queue;
  readonly worker: Worker;
  encerrar(): Promise<void>;
}

function criarRedis(url: string): IORedis {
  return new IORedis(url, {
    // Exigencia do BullMQ: sem isto, comando bloqueante do worker falha depois
    // de N tentativas em vez de esperar.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export async function iniciarFila(app: Aplicacao): Promise<FilaDeColeta> {
  const conexaoFila = criarRedis(app.configuracao.REDIS_URL);
  const conexaoWorker = criarRedis(app.configuracao.REDIS_URL);

  const fila = new Queue(NOME_DA_FILA, {
    connection: conexaoFila,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      // Dead-letter: job que esgotou as tentativas fica retido com o payload,
      // em vez de desaparecer. `removeOnFail: false` e o que preserva isso.
      removeOnFail: false,
      removeOnComplete: { count: 100 },
    },
  });

  // Id fixo por agendamento: impede duplicar o agendamento a cada boot.
  await fila.upsertJobScheduler(
    'ciclo-rss',
    { every: app.configuracao.INTERVALO_COLETA_MS },
    { name: JOB_RSS, data: { recorte: 'rss' } satisfies DadosDoJob },
  );

  await fila.upsertJobScheduler(
    'ciclo-gdelt',
    { every: app.configuracao.INTERVALO_GDELT_MS },
    { name: JOB_GDELT, data: { recorte: 'gdelt' } satisfies DadosDoJob },
  );

  const worker = new Worker<DadosDoJob, ResumoDoCiclo>(
    NOME_DA_FILA,
    async (job: Job<DadosDoJob>) => {
      const log = app.logger.child({
        job_id: job.id,
        job_nome: job.name,
        tentativa: job.attemptsMade + 1,
      });
      log.debug('job iniciado');

      return job.data.recorte === 'gdelt'
        ? executarCiclo(app, { tipos: TIPOS_GDELT, rotulo: 'gdelt' })
        : executarCiclo(app, { tipos: TIPOS_RSS, rotulo: 'rss' });
    },
    {
      connection: conexaoWorker,
      // Uma coleta por vez, mesmo com dois agendamentos: um ciclo de RSS e um de
      // GDELT simultaneos competiriam pelo pool do Postgres, e foi estouro de
      // `connectionTimeoutMillis` que derrubou um ciclo inteiro na Onda 3
      // (ADR-025).
      concurrency: 1,
    },
  );

  worker.on('failed', (job, erro) => {
    const esgotou = (job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 3);
    app.logger.error(
      {
        job_id: job?.id,
        job_nome: job?.name,
        tentativa: job?.attemptsMade,
        dead_letter: esgotou,
        motivo: erro.message,
      },
      esgotou ? 'job esgotou as tentativas' : 'job falhou, vai tentar de novo',
    );
  });

  worker.on('error', (erro) => {
    app.logger.error({ motivo: erro.message }, 'erro no worker da fila');
  });

  app.logger.info(
    {
      fila: NOME_DA_FILA,
      intervalo_rss_ms: app.configuracao.INTERVALO_COLETA_MS,
      intervalo_gdelt_ms: app.configuracao.INTERVALO_GDELT_MS,
    },
    'fila de coleta iniciada',
  );

  return {
    fila,
    worker,
    async encerrar() {
      await worker.close();
      await fila.close();
      conexaoFila.disconnect();
      conexaoWorker.disconnect();
    },
  };
}
