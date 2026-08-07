// Configuracao do worker, validada com Zod.
//
// CLAUDE.md secao 5: Zod em todo limite externo, e variavel de ambiente e limite
// externo. Um `DATABASE_URL` ausente tem de derrubar o boot com mensagem, nao
// virar `undefined` que estoura na primeira query, meia hora depois, com stack
// trace apontando para o driver.

import { z } from 'zod';

const Ambiente = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL e obrigatoria')
    .refine(
      (valor) =>
        valor.startsWith('postgres://') || valor.startsWith('postgresql://'),
      'DATABASE_URL deve comecar com postgres:// ou postgresql://',
    ),
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL e obrigatoria')
    .refine(
      (valor) => valor.startsWith('redis://') || valor.startsWith('rediss://'),
      'REDIS_URL deve comecar com redis:// ou rediss://',
    ),

  /**
   * Intervalo entre ciclos de coleta.
   *
   * Default de 5 minutos, medido: o feed do InfoMoney mantem 10 itens cobrindo
   * cerca de 30 minutos, ~20 itens/hora. Intervalo acima de 30 min perde item;
   * 5 min da folga de 6x sobre a janela observada.
   */
  INTERVALO_COLETA_MS: z.coerce.number().int().positive().default(300_000),

  /** Timeout de uma requisicao a uma fonte. */
  TIMEOUT_FONTE_MS: z.coerce.number().int().positive().default(10_000),

  LOG_NIVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type Configuracao = z.infer<typeof Ambiente>;

export class ConfiguracaoInvalidaError extends Error {
  constructor(problemas: readonly string[]) {
    super(
      `Configuracao de ambiente invalida:\n${problemas.map((p) => `  - ${p}`).join('\n')}\n` +
        'Copie .env.example para .env e preencha.',
    );
    this.name = 'ConfiguracaoInvalidaError';
  }
}

export function lerConfiguracao(
  fonte: NodeJS.ProcessEnv = process.env,
): Configuracao {
  const resultado = Ambiente.safeParse(fonte);

  if (!resultado.success) {
    throw new ConfiguracaoInvalidaError(
      resultado.error.issues.map(
        (issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`,
      ),
    );
  }

  return resultado.data;
}
