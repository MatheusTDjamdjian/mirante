import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Schema canonico do Mirante — CONTEXTO.md secao 4.
 *
 * O CLAUDE.md secao 1 fecha o schema nesta onda: alteracao posterior exige ADR
 * em docs/DECISOES.md explicando o que a decisao original nao previu. Nome de
 * tabela, de coluna e de enum em portugues, igual ao documento.
 *
 * Indices criados aqui sao exatamente os que o aceite da Onda 1 exige:
 * `url_hash` unico, HNSW em `embedding`, GIN em `busca`, B-tree em
 * `(publicado_em desc)` e em `(cluster_id)`. Indice de query futura entra junto
 * com a query que o exige, no mesmo commit — CLAUDE.md secao 5.
 *
 * `down` derruba exatamente o que este arquivo cria, em ordem inversa. Isso nao
 * conflita com a proibicao de migracao destrutiva do CLAUDE.md secao 1: o que a
 * regra proibe e perda de dado como efeito colateral de outra mudanca, nao a
 * reversao deliberada de uma migracao pelo humano via `npm run db:reverter`.
 */

const ENUMS = [
  ['tipo_de_fonte', ['rss', 'gdelt', 'oficial']],
  ['licenca', ['permissiva', 'restrita', 'desconhecida']],
  ['regiao_de_item', ['br', 'global']],
  ['regiao_de_cluster', ['br', 'global', 'ambos']],
  [
    'tema',
    [
      'juros',
      'inflacao',
      'cambio',
      'fiscal',
      'commodities',
      'resultados',
      'imobiliario',
      'geopolitica',
      'outro',
    ],
  ],
  [
    'tipo_de_entidade',
    ['ticker', 'fii', 'instituicao', 'pessoa', 'pais', 'indicador'],
  ],
  ['fonte_de_serie', ['sgs', 'sidra', 'ipeadata']],
  ['frequencia', ['diaria', 'mensal', 'trimestral']],
] as const satisfies ReadonlyArray<readonly [string, readonly string[]]>;

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const [nome, valores] of ENUMS) {
    pgm.createType(nome, [...valores]);
  }

  // -------------------------------------------------------------------------
  // fonte
  // -------------------------------------------------------------------------
  // `dominio` NAO e unico de proposito: InfoMoney Mercados e InfoMoney Economia
  // sao duas fontes com o mesmo dominio. E tambem por isso que
  // `cluster.veiculos_distintos` conta dominio distinto, e nao fonte distinta —
  // duas secoes do mesmo veiculo cobrindo o mesmo fato sao um veiculo.
  pgm.createTable('fonte', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    nome: { type: 'text', notNull: true },
    dominio: { type: 'text', notNull: true },
    tipo: { type: 'tipo_de_fonte', notNull: true },
    licenca: { type: 'licenca', notNull: true, default: 'desconhecida' },
    peso_base: {
      type: 'numeric(4,3)',
      notNull: true,
      check: 'peso_base >= 0 AND peso_base <= 1',
    },
    ativa: { type: 'boolean', notNull: true, default: true },
    etag: { type: 'text' },
    last_modified: { type: 'text' },
    ultima_coleta_em: { type: 'timestamptz' },
  });

  // -------------------------------------------------------------------------
  // cluster — criado antes de `item`, que o referencia
  // -------------------------------------------------------------------------
  pgm.createTable('cluster', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    titulo_representativo: { type: 'text', notNull: true },
    resumo_gerado: { type: 'text' },
    primeiro_visto_em: { type: 'timestamptz', notNull: true },
    ultimo_visto_em: { type: 'timestamptz', notNull: true },
    veiculos_distintos: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'veiculos_distintos >= 0',
    },
    tema: { type: 'tema' },
    regiao: { type: 'regiao_de_cluster', notNull: true },
    score: { type: 'numeric', notNull: true, default: 0 },
    enrich_hash: { type: 'text' },
    enriquecido_em: { type: 'timestamptz' },
  });

  // -------------------------------------------------------------------------
  // item
  // -------------------------------------------------------------------------
  pgm.createTable('item', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    fonte_id: {
      type: 'uuid',
      notNull: true,
      references: 'fonte',
      onDelete: 'RESTRICT',
    },
    url_canonica: { type: 'text', notNull: true },
    // Dedup exata. O unico e o que descarta republicacao identica antes de
    // qualquer custo computacional (CONTEXTO.md secao 5).
    url_hash: { type: 'text', notNull: true, unique: true },
    titulo: { type: 'text', notNull: true },
    titulo_normalizado: { type: 'text', notNull: true },
    // REGRA DE OURO: nunca exibido. Existe so para alimentar embedding e
    // clustering. Nenhum DTO de leitura seleciona esta coluna.
    resumo_origem: { type: 'text' },
    publicado_em: { type: 'timestamptz', notNull: true },
    coletado_em: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    idioma: { type: 'char(2)', notNull: true },
    regiao: { type: 'regiao_de_item', notNull: true },
    // int8 assinado. O simhash e sem sinal de 64 bits; a conversao mora em
    // libs/domain/src/lib/simhash.ts (paraBigintAssinado / paraSimhashSemSinal).
    simhash: { type: 'bigint', notNull: true },
    embedding: { type: 'vector(384)' },
    cluster_id: {
      type: 'uuid',
      references: 'cluster',
      onDelete: 'SET NULL',
    },
  });

  // Coluna gerada: `to_tsvector` com regconfig literal e IMMUTABLE, entao pode
  // ser STORED. Gerada pelo banco de proposito — se a aplicacao escrevesse,
  // titulo e busca poderiam divergir.
  pgm.sql(`
    ALTER TABLE item
      ADD COLUMN busca tsvector
      GENERATED ALWAYS AS (to_tsvector('portuguese', titulo)) STORED
  `);

  // -------------------------------------------------------------------------
  // cluster_entidade
  // -------------------------------------------------------------------------
  // CONTEXTO.md nao declara chave primaria para esta tabela. `(cluster_id, tipo,
  // valor)` e a chave natural e impede a mesma entidade entrar duas vezes no
  // mesmo cluster quando o enriquecimento reprocessa. Ver docs/DECISOES.md.
  pgm.createTable('cluster_entidade', {
    cluster_id: {
      type: 'uuid',
      notNull: true,
      references: 'cluster',
      onDelete: 'CASCADE',
    },
    tipo: { type: 'tipo_de_entidade', notNull: true },
    valor: { type: 'text', notNull: true },
    confianca: {
      type: 'numeric(4,3)',
      notNull: true,
      check: 'confianca >= 0 AND confianca <= 1',
    },
  });
  pgm.addConstraint('cluster_entidade', 'cluster_entidade_pkey', {
    primaryKey: ['cluster_id', 'tipo', 'valor'],
  });

  // -------------------------------------------------------------------------
  // serie_macro e serie_ponto
  // -------------------------------------------------------------------------
  // A coluna `fonte` tem o mesmo nome da tabela `fonte`. Postgres resolve sem
  // ambiguidade e o CONTEXTO.md nomeia assim; nao renomeamos o schema canonico
  // por gosto.
  pgm.createTable('serie_macro', {
    codigo: { type: 'text', primaryKey: true },
    fonte: { type: 'fonte_de_serie', notNull: true },
    identificador_externo: { type: 'text', notNull: true },
    nome: { type: 'text', notNull: true },
    unidade: { type: 'text', notNull: true },
    frequencia: { type: 'frequencia', notNull: true },
    atualizada_em: { type: 'timestamptz' },
  });

  pgm.createTable('serie_ponto', {
    codigo: {
      type: 'text',
      notNull: true,
      references: 'serie_macro',
      onDelete: 'CASCADE',
    },
    data: { type: 'date', notNull: true },
    valor: { type: 'numeric', notNull: true },
  });
  pgm.addConstraint('serie_ponto', 'serie_ponto_pkey', {
    primaryKey: ['codigo', 'data'],
  });

  // -------------------------------------------------------------------------
  // Indices exigidos pelo aceite da Onda 1
  // -------------------------------------------------------------------------

  // Busca textual em pt-BR.
  pgm.createIndex('item', 'busca', {
    name: 'item_busca_gin',
    method: 'gin',
  });

  // Feed ordenado por recencia e paginacao por cursor (Onda 5).
  pgm.createIndex('item', [{ name: 'publicado_em', sort: 'DESC' }], {
    name: 'item_publicado_em_desc',
  });

  // Buscar os membros de um cluster, e recontar veiculos distintos.
  pgm.createIndex('item', 'cluster_id', { name: 'item_cluster_id' });

  // HNSW com opclass de cosseno: o clustering da Onda 4 usa similaridade de
  // cosseno (operador `<=>`), e o indice tem de casar com o operador da query,
  // senao o planejador o ignora em silencio.
  pgm.sql(`
    CREATE INDEX item_embedding_hnsw
      ON item
      USING hnsw (embedding vector_cosine_ops)
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS item_embedding_hnsw');
  pgm.dropIndex('item', 'cluster_id', {
    name: 'item_cluster_id',
    ifExists: true,
  });
  pgm.dropIndex('item', [{ name: 'publicado_em', sort: 'DESC' }], {
    name: 'item_publicado_em_desc',
    ifExists: true,
  });
  pgm.dropIndex('item', 'busca', { name: 'item_busca_gin', ifExists: true });

  pgm.dropTable('serie_ponto', { ifExists: true });
  pgm.dropTable('serie_macro', { ifExists: true });
  pgm.dropTable('cluster_entidade', { ifExists: true });
  pgm.dropTable('item', { ifExists: true });
  pgm.dropTable('cluster', { ifExists: true });
  pgm.dropTable('fonte', { ifExists: true });

  for (const [nome] of [...ENUMS].reverse()) {
    pgm.dropType(nome, { ifExists: true });
  }
}
