// Conexao com o Postgres.
//
// Registra os parsers de tipo do node-postgres antes de qualquer query. Sem
// isso, `numeric` e `bigint` chegam como string — o que nao quebra nada de forma
// visivel, so faz `simhash` virar `'12345'` e `peso_base` virar `'0.800'`, e a
// aritmetica passar a concatenar em vez de somar.

import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { PoolConfig } from 'pg';
import type { Banco } from './banco';

/** OIDs dos tipos que precisam de parser proprio. Valores estaveis do Postgres. */
const OID = {
  int8: 20,
  numeric: 1700,
} as const;

let parsersRegistrados = false;

/**
 * Idempotente de proposito: o worker e a API criam pool no mesmo processo em
 * teste de integracao, e registrar duas vezes seria inofensivo mas confuso.
 */
export function registrarParsersDeTipo(): void {
  if (parsersRegistrados) return;

  // int8 -> bigint. Precisao importa: `simhash` usa os 64 bits, e Number
  // perderia bit a partir de 2^53. Efeito colateral conhecido: `count(*)` passa
  // a devolver bigint, e quem conta precisa de Number() explicito.
  types.setTypeParser(OID.int8, (valor) => BigInt(valor));

  // numeric -> number. `peso_base`, `score`, `confianca` e `valor` de serie
  // cabem em double sem perda relevante para este dominio.
  types.setTypeParser(OID.numeric, (valor) => Number(valor));

  parsersRegistrados = true;
}

export interface OpcoesDeConexao extends PoolConfig {
  readonly connectionString: string;
}

export interface ConexaoBanco {
  readonly db: Kysely<Banco>;
  readonly pool: Pool;
  encerrar(): Promise<void>;
}

/**
 * Cria o pool e a instancia do Kysely.
 *
 * Quem cria, encerra. Nao existe singleton global aqui de proposito: o worker e
 * a API tem ciclo de vida proprio, e pool global vaza conexao em teste.
 */
export function criarConexao(opcoes: OpcoesDeConexao): ConexaoBanco {
  registrarParsersDeTipo();

  const pool = new Pool({
    // Teto conservador: Railway limita conexao no plano gratuito, e o worker
    // roda em paralelo com a API contra o mesmo banco.
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ...opcoes,
  });

  const db = new Kysely<Banco>({
    dialect: new PostgresDialect({ pool }),
  });

  return {
    db,
    pool,
    async encerrar() {
      await db.destroy();
    },
  };
}
