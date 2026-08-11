#!/usr/bin/env node
// Roda uma consulta SQL de leitura contra o banco local e imprime o resultado.
//
// Existe para inspecao durante o desenvolvimento, sem depender da API do Docker
// Desktop, que nesta maquina cai com 500 de tempos em tempos.
//
// Recusa qualquer coisa que nao seja leitura. Nao e teatro de seguranca: e para
// que um erro de digitacao numa sessao de investigacao nao apague dado coletado.

import process from 'node:process';
import { Client } from 'pg';

const PROIBIDO =
  /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy)\b/i;

const sql = process.argv.slice(2).join(' ').trim();

if (sql === '') {
  console.error('uso: node tools/consultar.mjs "select ... from ..."');
  process.exit(1);
}

if (PROIBIDO.test(sql)) {
  console.error(
    '  RECUSADO  esta ferramenta so executa leitura.\n' +
      '            Escrita passa por migracao (npm run db:migrar) ou pelo worker.',
  );
  process.exit(1);
}

try {
  process.loadEnvFile('.env');
} catch {
  console.error('  FALHA  .env nao encontrado. Rode da raiz do repositorio.');
  process.exit(1);
}

const cliente = new Client({
  connectionString: process.env['DATABASE_URL'],
  connectionTimeoutMillis: 5000,
});

await cliente.connect();
try {
  const r = await cliente.query(sql);
  if (r.rows.length === 0) {
    console.log('(nenhuma linha)');
  } else {
    console.table(r.rows);
  }
} finally {
  await cliente.end();
}
