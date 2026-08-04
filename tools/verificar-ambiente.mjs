#!/usr/bin/env node
// Portao de ambiente. Roda antes de qualquer coisa no hook de pre-push.
//
// Existe por causa de duas falhas reais da Onda 0, e as duas se manifestavam
// como stack trace do Node em vez de mensagem util:
//
//   1. Node fora do intervalo de `engines` (Angular 22 tem piso duro).
//   2. node_modules instalado em outro sistema operacional. O Nx distribui
//      binario nativo por plataforma; com o binario errado, ele quebra em
//      `isAiAgent is not a function` e nada indica a causa.
//
// Este script nao conserta nada. Ele diz o que esta errado e o que fazer.

import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';
import semver from 'semver';

const DIRETORIO_NX = 'node_modules/@nx';

// Token de plataforma e de arquitetura como o Nx os nomeia nos seus pacotes
// nativos (@nx/nx-win32-x64-msvc, @nx/nx-linux-x64-gnu, @nx/nx-darwin-arm64).
const TOKEN_PLATAFORMA = {
  win32: 'win32',
  darwin: 'darwin',
  linux: 'linux',
  freebsd: 'freebsd',
};

const problemas = [];

function lerPackageJson() {
  try {
    return JSON.parse(readFileSync('package.json', 'utf8'));
  } catch {
    problemas.push(
      'package.json nao encontrado. Rode o hook da raiz do repositorio.',
    );
    return undefined;
  }
}

function verificarNode(pkg) {
  const intervalo = pkg?.engines?.node;
  if (!intervalo) return;

  const atual = process.versions.node;
  if (semver.satisfies(atual, intervalo)) return;

  problemas.push(
    `Node ${atual} nao atende engines do projeto (${intervalo}).\n` +
      `        Angular 22 tem piso duro nessas versoes; abaixo delas o build nao e suportado.\n` +
      `        A versao de desenvolvimento esta fixada em .nvmrc. Rode: nvm use`,
  );
}

function verificarBinarioNativoDoNx() {
  const plataforma = TOKEN_PLATAFORMA[process.platform];
  if (!plataforma) {
    problemas.push(`Plataforma ${process.platform} nao e suportada pelo Nx.`);
    return;
  }

  let instalados = [];
  try {
    instalados = readdirSync(DIRETORIO_NX).filter((nome) =>
      nome.startsWith('nx-'),
    );
  } catch {
    problemas.push('node_modules/@nx nao existe. Rode: npm install');
    return;
  }

  const compativel = instalados.some(
    (nome) => nome.includes(plataforma) && nome.includes(process.arch),
  );
  if (compativel) return;

  problemas.push(
    `Nenhum binario nativo do Nx para ${process.platform}-${process.arch}.\n` +
      `        Instalado: ${instalados.join(', ') || '(nenhum)'}\n` +
      `        O node_modules foi instalado em outro sistema operacional. O Nx nao\n` +
      `        funciona assim, e a falha aparece como "isAiAgent is not a function".\n` +
      `        Escolha UM sistema para este repositorio: os dois nao coexistem no\n` +
      `        mesmo node_modules. Para trocar, rode no sistema escolhido:\n` +
      `          rm -rf node_modules && npm ci\n` +
      `        O package-lock.json ja lista os binarios de todas as plataformas e\n` +
      `        NAO deve ser apagado.`,
  );
}

const pkg = lerPackageJson();
verificarNode(pkg);
verificarBinarioNativoDoNx();

if (problemas.length > 0) {
  console.error('Ambiente incompativel com este repositorio:\n');
  for (const problema of problemas) {
    console.error(`  - ${problema}\n`);
  }
  process.exit(1);
}
