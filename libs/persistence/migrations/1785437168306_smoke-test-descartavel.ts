import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migracao descartavel da Onda 0. Existe apenas para provar que a ferramenta de
 * migracao sobe e reverte limpa, incluindo uma coluna `vector` — que e o ponto
 * que de fato importa checar, porque e onde ferramenta de migracao costuma
 * quebrar com pgvector.
 *
 * Nao faz parte do schema canonico. Sai na Onda 1, quando as tabelas reais
 * (`fonte`, `item`, `cluster`, ...) entrarem.
 */
const TABELA = 'smoke_test_descartavel';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(TABELA, {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    rotulo: { type: 'text', notNull: true },
    // Prova que a extensao vector esta utilizavel, nao apenas instalada.
    vetor: { type: 'vector(3)', notNull: false },
    criado_em: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex(TABELA, 'criado_em');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable(TABELA);
}
