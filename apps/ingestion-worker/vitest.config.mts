import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// Vitest, nao Jest. Ver ADR-004 (emenda de 2026-08-06).
//
// `@noble/hashes`, que sustenta `hashUrl` e `simhash` em libs/domain, e ESM-only.
// Sob Jest com transform CommonJS, qualquer teste deste app que importe o dominio
// quebra em "Cannot use import statement outside a module" — e um app Nest deste
// projeto importa o dominio em praticamente todo caso de uso.
//
// O gerador `@nx/nest:application` so oferece jest ou none, entao esta config e
// escrita a mao. Fora da trilha do Nx de um lado ou fronteira ESM/CJS permanente
// do outro: o segundo custa mais, e custa para sempre.

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/ingestion-worker',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'ingestion-worker',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/ingestion-worker',
      provider: 'v8' as const,
    },
  },
}));
