#!/usr/bin/env node
// Retrato do banco: quanto foi coletado, por fonte, e o que os criterios de
// aceite das ondas medem.
//
// Consulta pela porta mapeada, com o cliente `pg` — nao via `docker compose
// exec`. Nesta maquina a API do Docker Desktop cai com 500 de tempos em tempos, e
// uma ferramenta de verificacao que depende dela para de servir justamente quando
// se precisa dela.

import process from 'node:process';
import { Client } from 'pg';

function carregarEnv() {
  if (process.env['DATABASE_URL'] !== undefined) return;
  try {
    process.loadEnvFile('.env');
  } catch {
    console.error('  FALHA  .env nao encontrado. Rode da raiz do repositorio.');
    process.exit(1);
  }
}

carregarEnv();

const cliente = new Client({
  connectionString: process.env['DATABASE_URL'],
  connectionTimeoutMillis: 5000,
});

try {
  await cliente.connect();
} catch (erro) {
  console.error(
    `  FALHA  Postgres inalcancavel: ${erro instanceof Error ? erro.message : String(erro)}`,
  );
  console.error('         A infra esta de pe? (npm run dev:infra)');
  process.exit(1);
}

try {
  const porFonte = await cliente.query(`
    select f.nome,
           f.dominio,
           f.tipo,
           f.licenca,
           f.ativa,
           f.peso_base,
           count(i.id)::int              as itens,
           (f.etag is not null)          as tem_etag,
           (f.last_modified is not null) as tem_last_modified,
           f.ultima_coleta_em
      from fonte f
      left join item i on i.fonte_id = f.id
     group by f.id
     order by f.nome
  `);

  console.log('=== por fonte ===');
  console.log(
    'fonte                      dominio                     tipo      licenca       ativa  itens  etag  l-mod',
  );
  for (const r of porFonte.rows) {
    console.log(
      [
        r.nome.padEnd(26),
        r.dominio.padEnd(27),
        r.tipo.padEnd(9),
        r.licenca.padEnd(13),
        r.ativa ? ' sim ' : ' NAO ',
        String(r.itens).padStart(5),
        r.tem_etag ? ' sim' : ' nao',
        r.tem_last_modified ? '  sim' : '  nao',
      ].join(' '),
    );
  }

  const totais = await cliente.query(`
    select count(*)::int                                          as itens,
           count(distinct url_hash)::int                          as hashes_distintos,
           count(distinct f.dominio)::int                         as veiculos,
           count(*) filter (where i.regiao = 'br')::int           as regiao_br,
           count(*) filter (where i.regiao = 'global')::int       as regiao_global,
           count(*) filter (where i.titulo_normalizado = '')::int as sem_titulo_normalizado,
           count(*) filter (where i.resumo_origem is not null)::int as com_resumo_origem,
           count(*) filter (where i.embedding is not null)::int   as com_embedding,
           count(*) filter (where i.cluster_id is not null)::int  as agrupados,
           min(i.publicado_em)                                    as mais_antigo,
           max(i.publicado_em)                                    as mais_recente
      from item i
      join fonte f on f.id = i.fonte_id
  `);

  const t = totais.rows[0] ?? {};
  console.log('\n=== totais ===');
  console.log(`  itens                    ${t.itens}`);
  console.log(`  url_hash distintos       ${t.hashes_distintos}`);
  console.log(`  veiculos (dominios)      ${t.veiculos}`);
  console.log(`  regiao br / global       ${t.regiao_br} / ${t.regiao_global}`);
  console.log(`  com resumo_origem        ${t.com_resumo_origem}`);
  console.log(`  titulo_normalizado vazio ${t.sem_titulo_normalizado}`);
  console.log(`  com embedding            ${t.com_embedding}   (Onda 4)`);
  console.log(`  em cluster               ${t.agrupados}   (Onda 4)`);
  if (t.mais_antigo !== null && t.mais_antigo !== undefined) {
    console.log(
      `  publicado_em             ${new Date(t.mais_antigo).toISOString()} .. ${new Date(t.mais_recente).toISOString()}`,
    );
  }

  // Balanco entre cobertura brasileira e global.
  //
  // A cadencia do GDELT e o `maxrecords` das consultas controlam quanto entra de
  // cada lado. O numero abaixo e o que permite calibrar isso com dado em vez de
  // intuicao. Ver ADR-026.
  console.log('\n=== balanco br / global ===');
  const totalItens = Number(t.itens ?? 0);
  if (totalItens === 0) {
    console.log('  (sem itens)');
  } else {
    const br = Number(t.regiao_br ?? 0);
    const global = Number(t.regiao_global ?? 0);
    const pct = (n) => `${((n / totalItens) * 100).toFixed(1)}%`;
    console.log(`  br      ${String(br).padStart(6)}  ${pct(br)}`);
    console.log(`  global  ${String(global).padStart(6)}  ${pct(global)}`);
    if (global > 0) {
      console.log(`  razao br:global  1 : ${(global / br).toFixed(2)}`);
    }
    if (global > br) {
      console.log(
        '\n  ATENCAO: cobertura global passou a brasileira.\n' +
          '           O publico do produto e investidor pessoa fisica brasileiro\n' +
          '           (CONTEXTO.md secao 1). Baixe `maxrecords` do GDELT no\n' +
          '           catalogo, ou espace mais INTERVALO_GDELT_MS.',
      );
    }
  }

  // Criterios de aceite que dependem de volume, e onde estamos.
  console.log('\n=== criterios de aceite por volume ===');
  const criterios = [
    ['Onda 2 (movido para a 3): >= 50 itens', t.itens >= 50, `${t.itens}/50`],
    ['Onda 3: >= 2.000 itens', t.itens >= 2000, `${t.itens}/2000`],
    [
      "Onda 3: mistura regiao='br' e 'global'",
      t.regiao_br > 0 && t.regiao_global > 0,
      `br=${t.regiao_br} global=${t.regiao_global}`,
    ],
  ];
  for (const [rotulo, bateu, detalhe] of criterios) {
    console.log(`  ${bateu ? 'ok    ' : 'FALTA '} ${rotulo}  (${detalhe})`);
  }

  if (t.regiao_global === 0) {
    console.log(
      "\n  Nota: regiao='global' vem apenas do GDELT. Sem o AdaptadorGdelt\n" +
        '        funcionando, o criterio de mistura de regiao nao fecha.',
    );
  }
} finally {
  await cliente.end();
}
