#!/usr/bin/env node
// Prova que a fronteira de modulo do CLAUDE.md secao 3 esta de fato armada.
//
// Nao existe arquivo violador versionado no repositorio de proposito: ele
// quebraria `nx run-many -t lint`, que e outro criterio de aceite da Onda 0. O
// arquivo e escrito, linted e apagado aqui.
//
// O teste tem dois lados, e os dois importam:
//   1. import proibido (libs/ui -> libs/persistence) TEM de falhar no lint;
//   2. import permitido (libs/ui -> libs/domain) NAO pode falhar.
// Sem o segundo, o teste passaria mesmo se a regra recusasse tudo.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

const REGRA = '@nx/enforce-module-boundaries';
const ARQUIVO = join('libs', 'ui', 'src', 'lib', '__violacao-fronteira.tmp.ts');

const CASOS = [
  {
    nome: 'libs/ui importando libs/persistence',
    especificador: '@mirante/persistence',
    simbolo: 'persistence',
    deveFalhar: true,
    porque: 'type:ui so pode depender de type:util',
  },
  {
    nome: 'libs/ui importando libs/domain',
    especificador: '@mirante/domain',
    simbolo: 'domain',
    deveFalhar: false,
    porque: 'type:ui -> type:util e permitido',
  },
];

function escrever(caso) {
  mkdirSync(dirname(ARQUIVO), { recursive: true });
  writeFileSync(
    ARQUIVO,
    [
      '// Arquivo temporario de tools/verificar-fronteiras.mjs. Nunca versionar.',
      `import { ${caso.simbolo} } from '${caso.especificador}';`,
      '',
      `export const alvo = ${caso.simbolo};`,
      '',
    ].join('\n'),
    'utf8',
  );
}

function lintar() {
  const resultado = spawnSync(
    'npx',
    ['eslint', ARQUIVO, '--no-warn-ignored', '--format', 'json'],
    { encoding: 'utf8', shell: true },
  );
  return {
    codigo: resultado.status,
    saida: `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`,
  };
}

function violouRegra(saida) {
  return saida.includes(REGRA);
}

let falhou = false;

console.log(
  'Verificando fronteira de modulo (@nx/enforce-module-boundaries)\n',
);

try {
  for (const caso of CASOS) {
    escrever(caso);
    const { codigo, saida } = lintar();
    const barrado = codigo !== 0 && violouRegra(saida);

    if (caso.deveFalhar && barrado) {
      console.log(`  ok     ${caso.nome} foi barrado — ${caso.porque}`);
    } else if (!caso.deveFalhar && codigo === 0) {
      console.log(`  ok     ${caso.nome} passou — ${caso.porque}`);
    } else if (caso.deveFalhar) {
      falhou = true;
      console.error(
        `  FALHA  ${caso.nome} NAO foi barrado.\n` +
          `         A fronteira nao esta armada. eslint saiu com ${codigo}.\n` +
          `         Saida: ${saida.slice(0, 800)}`,
      );
    } else {
      falhou = true;
      console.error(
        `  FALHA  ${caso.nome} foi barrado, e nao deveria.\n` +
          `         A regra esta recusando dependencia legitima. eslint saiu com ${codigo}.\n` +
          `         Saida: ${saida.slice(0, 800)}`,
      );
    }
  }
} finally {
  rmSync(ARQUIVO, { force: true });
}

if (falhou) {
  console.error('\nFronteira de modulo nao esta correta.');
  process.exit(1);
}

console.log('\nFronteira de modulo armada e discriminando corretamente.');
