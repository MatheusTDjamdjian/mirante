// Superficie publica de @mirante/persistence.
//
// Repositorios, tipos de tabela e a fabrica de conexao. Sem decorator de
// framework: quem usa provê a instancia. Migracoes ficam em `migrations/`, fora
// desta superficie, porque quem as executa e a CLI do node-pg-migrate.

export * from './lib/banco';
export * from './lib/conexao';
export * from './lib/fonte-repositorio';
export * from './lib/item-repositorio';
