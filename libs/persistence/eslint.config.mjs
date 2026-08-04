import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            // As migracoes sao scripts executados pela CLI do node-pg-migrate,
            // nao parte da superficie publica da lib, e o import de
            // `node-pg-migrate` nelas e `import type` — sem pegada em runtime.
            // Declara-lo em dependencies desta lib seria declarar algo falso.
            '{projectRoot}/migrations/**',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
