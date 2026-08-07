// Log estruturado.
//
// CLAUDE.md secao 5: "Estruturado, JSON, com correlacao por ciclo de coleta.
// Nunca console.log." O `ciclo_id` e o que permite reconstruir um ciclo inteiro
// a partir do log depois — sem ele, com cinco fontes coletando em paralelo, as
// linhas se misturam e nao da para dizer qual falha pertence a qual ciclo.

import { pino, type Logger } from 'pino';
import type { Configuracao } from './configuracao';

export type { Logger };

export function criarLogger(configuracao: Configuracao): Logger {
  return pino({
    level: configuracao.LOG_NIVEL,
    base: { app: 'ingestion-worker' },
    // Chave e ISO-8601: `time` numerico e ilegivel no terminal e a diferenca de
    // custo e irrelevante num worker que loga por ciclo, nao por requisicao.
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (rotulo) => ({ nivel: rotulo }),
    },
    redact: {
      // A string de conexao carrega senha. Nunca vai para o log, nem em erro.
      paths: ['DATABASE_URL', 'REDIS_URL', '*.DATABASE_URL', '*.REDIS_URL'],
      censor: '[redigido]',
    },
  });
}

/** Identificador de um ciclo. Contador em vez de aleatorio: ordena no log. */
export function criarGeradorDeCicloId(): () => string {
  let sequencia = 0;
  const inicio = Date.now();
  return () => {
    sequencia += 1;
    return `${inicio.toString(36)}-${sequencia}`;
  };
}
