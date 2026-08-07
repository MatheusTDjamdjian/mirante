// Fila BullMQ do ciclo de coleta.
//
// CLAUDE.md secao 5: todo job e idempotente, retry com backoff exponencial e
// jitter, e job que falha tres vezes vai para dead-letter com payload preservado.
//
// A idempotencia deste job nao vem de um flag: vem de `url_hash` unico e da
// requisicao condicional. Rodar o mesmo job duas vezes coleta os mesmos itens e
// grava zero — o que e exatamente o criterio de aceite central da onda.

import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { executarCiclo, type ResumoDoCiclo } from './ciclo-unico';
import type { Aplicacao } from './montar';

export const NOME_DA_FILA = 'coleta';
export const NOME_DO_JOB = 'coletar-fonte';

/** Job repetido: um id fixo impede duplicar o agendamento a cada boot. */
const ID_DO_AGENDAMENTO = 'ciclo-periodico';

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

  await fila.upsertJobScheduler(
    ID_DO_AGENDAMENTO,
    { every: app.configuracao.INTERVALO_COLETA_MS },
    { name: NOME_DO_JOB, data: {} },
  );

  const worker = new Worker<unknown, ResumoDoCiclo>(
    NOME_DA_FILA,
    async (job: Job) => {
      const log = app.logger.child({
        job_id: job.id,
        tentativa: job.attemptsMade + 1,
      });
      log.debug('job iniciado');
      return executarCiclo(app);
    },
    {
      connection: conexaoWorker,
      // Uma coleta por vez: duas coletas simultaneas da mesma fonte gastariam
      // requisicao para gravar zero, e aumentariam o risco de 429.
      concurrency: 1,
    },
  );

  worker.on('failed', (job, erro) => {
    const esgotou = (job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 3);
    app.logger.error(
      {
        job_id: job?.id,
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
      intervalo_ms: app.configuracao.INTERVALO_COLETA_MS,
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
