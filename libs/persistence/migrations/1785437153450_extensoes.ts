import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Extensoes de que o schema canonico depende.
 *
 * `vector` (pgvector) sustenta `item.embedding vector(384)` e o indice HNSW da
 * Onda 1. Localmente a extensao ja e criada pelo entrypoint de init do
 * docker-compose; aqui ela e recriada de forma idempotente porque em producao
 * (Railway) nao existe entrypoint de init, e a migracao e o unico caminho.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('vector', { ifNotExists: true });
}

/**
 * `down` deliberadamente vazio.
 *
 * `DROP EXTENSION vector` derruba, em cascata, toda coluna `vector` do banco —
 * e migracao destrutiva, que o CLAUDE.md secao 1 proibe sem confirmacao humana
 * explicita no momento. Reverter esta migracao nao pode ser um efeito colateral
 * silencioso de `npm run db:reverter`. Para remover a extensao, faca a mao e
 * com intencao.
 */
export async function down(): Promise<void> {
  // sem operacao, por decisao. Ver comentario acima.
}
