#!/usr/bin/env node
// Verificacao da infra local subida por `npm run dev:infra`.
// Confere, em ordem: conexao com o Postgres pela porta mapeada, extensao
// `vector` ativa, dicionario de busca `portuguese` disponivel, e Redis
// respondendo PONG. Sai com codigo 1 na primeira falha.
//
// Sem cor no terminal de proposito: a saida deste script vai para log e para
// relatorio de onda, e sequencia ANSI suja os dois.

import net from 'node:net';
import process from 'node:process';
import { Client } from 'pg';

function ok(mensagem, detalhe) {
  console.log(`  ok     ${mensagem}${detalhe ? ` — ${detalhe}` : ''}`);
}

function falha(mensagem, detalhe) {
  console.error(
    `  FALHA  ${mensagem}${detalhe ? `\n         ${detalhe}` : ''}`,
  );
  process.exitCode = 1;
}

function carregarEnv() {
  try {
    process.loadEnvFile('.env');
  } catch {
    console.error(
      '  FALHA  arquivo .env nao encontrado na raiz do repositorio.\n' +
        '         Copie .env.example para .env e defina POSTGRES_PASSWORD.',
    );
    process.exit(1);
  }
}

async function verificarPostgres() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    falha('DATABASE_URL nao definida no .env.');
    return;
  }

  const cliente = new Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
  });

  try {
    await cliente.connect();
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    falha(
      'Postgres nao aceitou conexao pela porta mapeada.',
      `${motivo} — a infra esta de pe? (npm run dev:infra)`,
    );
    return;
  }

  try {
    const versao = await cliente.query('select version() as v');
    ok('Postgres respondeu', String(versao.rows[0]?.v ?? '').split(',')[0]);

    // Criterio de aceite da Onda 0: extensao vector ativa no banco da aplicacao.
    const extensao = await cliente.query(
      "select extversion from pg_extension where extname = 'vector'",
    );
    if (extensao.rowCount === 0) {
      falha(
        'extensao `vector` (pgvector) nao esta instalada neste banco.',
        'Quem cria a extensao e a migracao 001. Rode: npm run db:migrar',
      );
    } else {
      const versaoPgvector = String(extensao.rows[0]?.extversion ?? '0');
      ok('extensao `vector` ativa', `pgvector ${versaoPgvector}`);

      // pgvector so aceita indice HNSW a partir da 0.5.0, e a Onda 1 exige HNSW.
      const [maior = '0', menor = '0'] = versaoPgvector.split('.');
      if (Number(maior) === 0 && Number(menor) < 5) {
        falha(
          `pgvector ${versaoPgvector} nao suporta indice HNSW.`,
          'A Onda 1 exige HNSW. Troque a imagem do Postgres por uma com pgvector >= 0.5.0.',
        );
      }
    }

    // O campo `busca tsvector` do schema canonico usa o dicionario portuguese.
    const dicionario = await cliente.query(
      "select cfgname from pg_ts_config where cfgname = 'portuguese'",
    );
    if (dicionario.rowCount === 0) {
      falha(
        'configuracao de busca textual `portuguese` nao existe neste Postgres.',
      );
    } else {
      ok('dicionario de busca `portuguese` disponivel');
    }
  } finally {
    await cliente.end();
  }
}

function verificarRedis() {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const { hostname, port } = new URL(url);
  const porta = Number(port || 6379);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port: porta }, () =>
      socket.write('PING\r\n'),
    );
    socket.setTimeout(5000);

    socket.once('data', (dados) => {
      const resposta = dados.toString('utf8').trim();
      if (resposta === '+PONG') {
        ok('Redis respondeu PONG', `${hostname}:${porta}`);
      } else {
        falha('Redis respondeu algo inesperado ao PING.', resposta);
      }
      socket.destroy();
      resolve(undefined);
    });

    socket.once('timeout', () => {
      falha('Redis nao respondeu em 5s.');
      socket.destroy();
      resolve(undefined);
    });

    socket.once('error', (erro) => {
      falha(
        'Redis nao aceitou conexao.',
        `${erro.message} — a infra esta de pe?`,
      );
      resolve(undefined);
    });
  });
}

console.log('Verificando infra local do Mirante');
carregarEnv();
await verificarPostgres();
await verificarRedis();

if (process.exitCode === 1) {
  console.error('\nInfra local incompleta. Nada acima e opcional.');
} else {
  console.log('\nInfra local pronta.');
}
