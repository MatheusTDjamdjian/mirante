#!/usr/bin/env node
// Prova que a busca por similaridade de cosseno usa o indice HNSW.
//
// Criterio de aceite da Onda 1: "EXPLAIN de uma busca por similaridade mostra uso
// do indice HNSW". Indice vetorial so e escolhido pelo planejador quando ha
// volume — com dez linhas, seq scan e mais rapido e o EXPLAIN nao prova nada.
// Por isso o script popula, mede, e desfaz.
//
// Tudo roda dentro de uma transacao com ROLLBACK no fim: nao deixa linha no
// banco, e nao mexe no schema.
//
// `enable_seqscan` NAO e desligado de proposito. Forcar o indice provaria apenas
// que ele existe, nao que o planejador o prefere — que e a afirmacao que
// interessa.

import process from 'node:process';
import { Client } from 'pg';

const LINHAS = Number(process.env['HNSW_LINHAS'] ?? 5000);
const DIMENSOES = 384;
const LOTE = 500;
const VIZINHOS = 10;

function vetorAleatorio() {
  const valores = new Array(DIMENSOES);
  for (let i = 0; i < DIMENSOES; i += 1) {
    // Faixa [-1, 1], parecida com a de um embedding normalizado.
    valores[i] = (Math.random() * 2 - 1).toFixed(6);
  }
  return `[${valores.join(',')}]`;
}

function carregarEnv() {
  try {
    process.loadEnvFile('.env');
  } catch {
    console.error('  FALHA  .env nao encontrado. Copie de .env.example.');
    process.exit(1);
  }
}

carregarEnv();

const cliente = new Client({
  connectionString: process.env['DATABASE_URL'],
  connectionTimeoutMillis: 5000,
});

await cliente.connect();

let planoTexto = '';
let usouHnsw = false;
let duracaoMs = 0;

try {
  await cliente.query('BEGIN');

  const fonte = await cliente.query(
    `INSERT INTO fonte (nome, dominio, tipo, licenca, peso_base)
     VALUES ('Fonte de verificacao', 'verificacao.local', 'rss', 'desconhecida', 0.5)
     RETURNING id`,
  );
  const fonteId = fonte.rows[0]?.id;

  console.log(
    `Inserindo ${LINHAS} itens com embedding de ${DIMENSOES} dimensoes...`,
  );

  for (let inicio = 0; inicio < LINHAS; inicio += LOTE) {
    const quantidade = Math.min(LOTE, LINHAS - inicio);
    const valores = [];
    const parametros = [];

    for (let i = 0; i < quantidade; i += 1) {
      const n = inicio + i;
      const base = i * 4;
      valores.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, 'titulo ${n}', 'titulo ${n}', now(), 'pt', 'br', ${n}, $${base + 4}::vector)`,
      );
      parametros.push(
        fonteId,
        `https://verificacao.local/${n}`,
        `hash-verificacao-${n}`,
        vetorAleatorio(),
      );
    }

    await cliente.query(
      `INSERT INTO item
         (fonte_id, url_canonica, url_hash, titulo, titulo_normalizado,
          publicado_em, idioma, regiao, simhash, embedding)
       VALUES ${valores.join(',')}`,
      parametros,
    );
  }

  // Sem ANALYZE o planejador trabalha com estatistica de tabela vazia.
  await cliente.query('ANALYZE item');

  const alvo = vetorAleatorio();

  const inicio = process.hrtime.bigint();
  const plano = await cliente.query(
    `EXPLAIN (ANALYZE, BUFFERS)
       SELECT id FROM item
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT ${VIZINHOS}`,
    [alvo],
  );
  duracaoMs = Number(process.hrtime.bigint() - inicio) / 1_000_000;

  planoTexto = plano.rows.map((linha) => linha['QUERY PLAN']).join('\n');
  usouHnsw = planoTexto.includes('item_embedding_hnsw');
} finally {
  await cliente.query('ROLLBACK');
  await cliente.end();
}

console.log('\n--- EXPLAIN ANALYZE ---');
console.log(planoTexto);
console.log('--- fim ---\n');

if (usouHnsw) {
  console.log(
    `  ok     planejador escolheu item_embedding_hnsw com ${LINHAS} linhas (${duracaoMs.toFixed(1)} ms)`,
  );
  console.log('\nBanco revertido: nenhuma linha ficou.');
} else {
  console.error(
    `  FALHA  o plano nao usa item_embedding_hnsw com ${LINHAS} linhas.\n` +
      `         Suba HNSW_LINHAS e rode de novo, ou confira se a opclass do\n` +
      `         indice (vector_cosine_ops) casa com o operador da query (<=>).`,
  );
  process.exit(1);
}
