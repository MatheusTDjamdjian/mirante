# DECISOES.md — Registro de decisões (ADR)

Cada entrada tem cinco linhas: contexto, opções, escolha, custo aceito, data.
Decisão que já está fechada no `CONTEXTO.md` não vira ADR aqui — ADR é para o que
o `CONTEXTO.md` não previu.

---

## ADR-001 — Ferramenta de migração: `node-pg-migrate`

- **Contexto.** A Onda 0 exige ferramenta de migração escolhida, e o `CLAUDE.md`
  seção 5 exige migração **versionada e reversível**. O schema canônico usa
  `vector(384)`, `tsvector`, índice HNSW e enums.
- **Opções.** Prisma Migrate; Drizzle Kit; `node-pg-migrate`.
- **Escolha.** `node-pg-migrate` 9. Prisma e Drizzle não geram migração `down` —
  falham no requisito de reversibilidade antes de qualquer discussão sobre
  pgvector. A v9 aceita migração em TypeScript nativamente via `jiti`, sem
  loader extra.
- **Custo aceito.** Sem introspecção que gere tipos do schema; a camada de query
  da Onda 1 vai precisar dos tipos escritos à mão ou de um gerador separado.
- **Data.** 2026-07-30

---

## ADR-002 — Layout clássico do Nx, sem npm workspaces

- **Contexto.** A intenção era usar npm workspaces (setup de solução TS do Nx
  23), para que o critério de aceite da Onda 1 — "`libs/domain` não tem
  dependência de runtime no `package.json`" — fosse literalmente verificável.
- **Opções.** Setup de solução TS (project references + `package.json` por
  projeto); setup clássico (`paths` no `tsconfig.base.json`).
- **Escolha.** Clássico, **por imposição do Angular**: `@nx/angular:init` recusa
  o setup de solução com "The Angular framework doesn't support a TypeScript
  setup with project references" (angular/angular#37276). Existe flag de
  contorno (`NX_IGNORE_UNSUPPORTED_TS_SETUP`), rotulada pelo próprio Nx como
  risco, e não foi usada.
- **Custo aceito.** Nenhum, no fim: as libs buildable (`domain`, `adapters`,
  `persistence`) ganham `package.json` próprio de qualquer forma, e a regra
  `@nx/dependency-checks` falha o lint quando a lib importa pacote não declarado
  ali. O critério da Onda 1 segue verificável ao pé da letra, e a instalação de
  dependências é que passa a ser única na raiz.
- **Data.** 2026-07-30

---

## ADR-003 — `type:data` não pode importar `type:data`

- **Contexto.** `libs/adapters` e `libs/persistence` compartilham a tag
  `type:data`, e `@nx/enforce-module-boundaries` decide por tag. Sem uma regra
  explícita, não há como expressar "adapters depende só de domain".
- **Opções.** Adicionar um segundo eixo de tag (`scope:adapters`,
  `scope:persistence`); proibir `type:data` → `type:data`.
- **Escolha.** Proibir data → data. O `CLAUDE.md` seção 3 diz que cada um dos
  dois depende apenas de `domain`; a proibição expressa isso sem inventar um
  eixo de tag que o documento não previu.
- **Custo aceito.** Tipo que os dois precisarem sobe para `libs/domain`. Isso é
  o lugar correto de qualquer forma, então o custo é praticamente nulo.
- **Data.** 2026-07-30

---

## ADR-004 — Dois runners de teste: Vitest e Jest

- **Contexto.** Nada nos documentos especifica runner, e
  `nx affected -t test` precisa de um.
- **Opções.** Vitest em tudo (exigiria configurar Vitest à mão nos apps Nest, com
  `unplugin-swc` por causa de `emitDecoratorMetadata`); Jest em tudo; um runner
  por tipo de projeto.
- **Escolha.** Vitest em `libs/*` e `apps/web` (Angular via `vitest-analog`,
  que é o default do próprio preset Angular do Nx 23); Jest em `apps/api` e
  `apps/ingestion-worker`. O gerador `@nx/nest:application` aceita apenas
  `jest` ou `none` — Vitest ali seria configuração fora da trilha do Nx, que
  quebra a cada `nx migrate`.
- **Custo aceito.** Dois runners e dois formatos de relatório. Mitigado pelo
  fato de que tudo que o `CLAUDE.md` seção 6 manda testar
  (`domain`, adaptadores, formatação pt-BR) mora em `libs/*`, ou seja, no lado
  Vitest.
- **Data.** 2026-07-30

---

## ADR-005 — Quem cria a extensão `vector`

- **Contexto.** O aceite da Onda 0 pede que `npm run dev:infra` deixe a extensão
  ativa; produção (Railway) não tem entrypoint de init de container.
- **Opções.** Só no script de init do compose; só na migração; nos dois.
- **Escolha.** Nos dois. `docker/postgres/init/001-extensoes.sql` roda na criação
  do volume local, e a migração `..._extensoes.ts` faz
  `CREATE EXTENSION IF NOT EXISTS vector` — no-op local, caminho válido em
  produção.
- **Custo aceito.** A mesma instrução em dois lugares. Se o papel do Postgres no
  Railway não tiver permissão de criar extensão, a migração falha no deploy e a
  extensão precisa ser habilitada uma vez pelo painel.
- **Data.** 2026-07-30

---

## ADR-006 — `down` vazio na migração de extensão

- **Contexto.** `CLAUDE.md` seção 5 exige migração reversível; `DROP EXTENSION
vector` derruba em cascata toda coluna `vector` do banco.
- **Opções.** `down` com `DROP EXTENSION`; `down` vazio e documentado.
- **Escolha.** `down` vazio. `CLAUDE.md` seção 1 proíbe migração destrutiva sem
  confirmação humana no momento, e `npm run db:reverter` não pode disparar
  destruição em cascata como efeito colateral.
- **Custo aceito.** Uma migração do repositório não é estritamente reversível.
  A reversibilidade é provada pela migração de smoke test, que cria e derruba
  tabela com coluna `vector`.
- **Data.** 2026-07-30

---

## ADR-007 — Base do `nx affected` no hook de `pre-push`

- **Contexto.** Sem CI, o hook de `pre-push` é o único portão de qualidade. `nx
affected` sem base resolvível pode devolver conjunto vazio e passar verde sem
  ter rodado nada.
- **Opções.** `--base=origin/main` puro; `HEAD~1`; base com fallback.
- **Escolha.** `--base=origin/main` quando a ref existe, e `nx run-many` (tudo)
  quando não existe. Falso verde é o pior modo de falha de um hook, porque
  destrói a confiança nele em silêncio.
- **Custo aceito.** No primeiro push do repositório, ou sem remoto configurado,
  o hook roda o workspace inteiro e demora. Medido na Onda 0, com tudo afetado
  em relação a `origin/main`: **acima de 10 minutos** sem cache. Do segundo push
  em diante, com a fundação já em `origin/main`, o conjunto afetado passa a ser
  pequeno. Para referência, `nx affected -t lint` isolado levou **1 min 28 s**
  nesse mesmo estado.
- **Data.** 2026-07-30

---

## ADR-008 — Prova da fronteira de módulo por script, não por arquivo versionado

- **Contexto.** Dois aceites da Onda 0 em tensão: `nx run-many -t lint` passa
  limpo, **e** existe teste provando que `ui` importando `persistence` falha no
  lint. Um arquivo violador versionado quebra o primeiro.
- **Opções.** Fixture versionada com `eslintignore`; script que gera, linta e
  apaga um arquivo temporário.
- **Escolha.** Script (`npm run verificar:fronteiras`). Testa os dois lados:
  o import proibido tem de falhar **e** o import permitido
  (`ui` → `domain`) não pode falhar — sem o segundo, o teste passaria mesmo com
  uma regra que recusasse tudo.
- **Custo aceito.** A prova não roda dentro de `nx affected -t test`; é um script
  separado, que precisa ser chamado explicitamente.
- **Data.** 2026-07-30

---

## ADR-009 — Node 22.23.0

- **Contexto.** A máquina estava em Node 20.19.5. O Angular 22 exige
  `^22.22.3 || ^24.15.0 || >=26.0.0`, e o Node 20 saiu do suporte em abril de 2026.
- **Opções.** Node 22 LTS; Node 24 LTS.
- **Escolha.** Node 22.23.0, fixado em `.nvmrc`; `engines` aceita
  `^22.22.3 || ^24.15.0` para dar folga a Vercel e Railway.
- **Custo aceito.** Node 22 entra em fim de manutenção antes do 24, e o projeto
  vai precisar de uma troca de LTS durante a vida útil.
- **Data.** 2026-07-30

---

## ADR-010 — Angular zoneless

- **Contexto.** O Nx 23 gera app Angular sem `zone.js`. O `CONTEXTO.md` fixa
  Signals para estado de render e o `CLAUDE.md` exige `OnPush` em todo
  componente.
- **Opções.** Reintroduzir `zone.js`; manter zoneless.
- **Escolha.** Manter zoneless. É a consequência coerente de Signals + OnPush, e
  é o default do gerador — reintroduzir `zone.js` seria a decisão que precisaria
  de justificativa, não o contrário.
- **Custo aceito.** Biblioteca de terceiro que dependa de `zone.js` para detectar
  mudança não vai funcionar sem adaptação. Nenhuma está prevista.
- **Data.** 2026-07-30
