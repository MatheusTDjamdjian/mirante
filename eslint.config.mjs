import nx from '@nx/eslint-plugin';

/**
 * Fronteira de modulo do Mirante — CLAUDE.md secao 3.
 *
 *   libs/domain        type:util   nao importa nada do projeto
 *   libs/adapters      type:data   so domain
 *   libs/persistence   type:data   so domain
 *   libs/ui            type:ui     so domain
 *   apps/*             type:app    tudo, menos outro app
 *
 * `type:data` nao pode importar `type:data`: adapters e persistence compartilham
 * a tag, e a prosa do CLAUDE.md diz que cada um depende apenas de domain. Tipo
 * usado pelos dois sobe para domain, que e onde ele pertence.
 *
 * Violacao aqui e erro de lint, nao sugestao.
 */
const fronteirasDeModulo = {
  enforceBuildableLibDependency: true,
  allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
  depConstraints: [
    {
      sourceTag: 'type:util',
      onlyDependOnLibsWithTags: [],
      // "TS puro. Zero dependencia de framework." Lista literal do CLAUDE.md
      // secao 3, mais os clientes de rede e de banco que a mesma regra implica.
      bannedExternalImports: [
        '@angular/*',
        '@nestjs/*',
        'prisma',
        '@prisma/*',
        'rxjs',
        'express',
        'pg',
        'ioredis',
        'bullmq',
        'kysely',
        'axios',
        'node-fetch',
        'got',
        'undici',
      ],
    },
    {
      sourceTag: 'type:data',
      onlyDependOnLibsWithTags: ['type:util'],
      bannedExternalImports: ['@angular/*'],
    },
    {
      sourceTag: 'type:ui',
      onlyDependOnLibsWithTags: ['type:util'],
      // ui nao fala com banco nem com fila, nem direto pelo cliente npm.
      bannedExternalImports: [
        '@nestjs/*',
        'pg',
        'ioredis',
        'bullmq',
        'kysely',
        'prisma',
        '@prisma/*',
      ],
    },
    {
      sourceTag: 'type:app',
      onlyDependOnLibsWithTags: ['type:util', 'type:data', 'type:ui'],
    },
  ],
};

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': ['error', fronteirasDeModulo],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      // CLAUDE.md secao 4: "Sem any. Se voce precisa de any, voce precisa de um
      // tipo que ainda nao escreveu."
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
];
