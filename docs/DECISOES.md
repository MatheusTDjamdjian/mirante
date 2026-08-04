# DECISOES.md — Registro de decisões (ADR)

Cada entrada tem cinco linhas: contexto, opções, escolha, custo aceito, data.
Decisão que já está fechada no `CONTEXTO.md` não vira ADR aqui — ADR é para o que
o `CONTEXTO.md` não previu.

---

## ADR-018 — `.gitattributes` com `eol=lf`, e `design/**` como binário

- **Contexto.** No meio da Onda 1, `prettier --check` reprovou 117 arquivos,
  incluindo `tsconfig.base.json`, que eu não havia tocado. Causa: o git no
  Windows converteu a árvore de trabalho para CRLF. Três consequências reais, não
  estéticas: o `prettier --check` deixou de ser sinal; `.husky/pre-push` com CRLF
  quebra sob `sh` no Linux com "bad interpreter"; e `design/Mirante.dc.html`
  cresceu 1.759 bytes (um `\r` por linha), passando de 164.806 para 166.565 bytes
  e invalidando o SHA-256 registrado no `DESIGN_SYSTEM.md` §1 — que é a única
  coisa que aquele documento existe para garantir.
- **Opções.** Pôr `endOfLine: "auto"` no Prettier e conviver; `.gitattributes`
  com `eol=lf` para tudo; `.gitattributes` com `eol=lf` mais `-text` no `design/`.
- **Escolha.** A terceira. `eol=lf` global torna a árvore determinística
  independente do `core.autocrlf` da máquina, e `design/** -text` faz o git nunca
  tocar nos bytes da especificação, porque ali o hash é o contrato. `endOfLine:
"auto"` só silenciaria o alarme, deixando o hook e o hash quebrados.
- **Custo aceito.** Arquivos já rastreados precisam de
  `git add --renormalize .` uma vez para o `.gitattributes` valer sobre eles, e
  isso produz um commit grande só de fim de linha. Os arquivos de `design/` foram
  reextraídos da fonte e voltaram ao hash registrado.
- **Data.** 2026-08-04

---

## ADR-012 — `veiculos_distintos` conta domínio, não fonte

- **Contexto.** InfoMoney Mercados e InfoMoney Economia são duas linhas em
  `fonte` com o mesmo `dominio`. O `CONTEXTO.md` diz "doze veículos distintos o
  cobriram" e trata isso como o melhor sinal de relevância sem editor humano.
- **Opções.** Contar `fonte_id` distinto; contar `fonte.dominio` distinto.
- **Escolha.** Domínio. Duas seções do mesmo veículo cobrindo o mesmo fato são um
  veículo — contar duas infla exatamente o número em que o produto se apoia, e o
  inflaria mais para as fontes de maior volume, que são as que têm mais seções.
- **Custo aceito.** `dominio` não pode ser único em `fonte`, e a contagem exige
  `count(distinct f.dominio)` com join, não um `count` na própria `item`. A query
  e o índice que a sustenta entram na Onda 5, junto com o recálculo de score.
- **Data.** 2026-08-03

---

## ADR-013 — Âncora temporal do decaimento: `ultimo_visto_em`

- **Contexto.** A fórmula de ranking usa `exp(-Δt_horas / TAU)`, e o
  `CONTEXTO.md` não diz de qual timestamp o Δt conta. `cluster` tem
  `primeiro_visto_em` e `ultimo_visto_em`.
- **Opções.** `primeiro_visto_em` (idade do fato); `ultimo_visto_em` (tempo desde
  a última cobertura nova).
- **Escolha.** `ultimo_visto_em`, exposto como `ancoraTemporal` na configuração
  injetada em vez de embutido. A pergunta que a tela responde é "o que está
  mexendo agora", e um fato que segue rendendo matéria está mexendo agora.
- **Custo aceito.** Um fato antigo que recebe uma matéria nova volta ao topo.
  Isso é desejado para desdobramento real e indesejado para republicação
  tardia — a dedup aproximada é quem tem de barrar o segundo caso. **Pendente de
  confirmação humana**; trocar é uma linha na configuração.
- **Data.** 2026-08-03

---

## ADR-014 — `@noble/hashes` para sha256 em `libs/domain`

- **Contexto.** `hashUrl` e `simhash` precisam de sha256. `libs/domain` é
  `type:util`, TS puro, e pode ser importada por `libs/ui` (Angular), logo o
  código tem de rodar em Node e no browser. O aceite da Onda 1 permite
  "utilitários puros" em `dependencies`.
- **Opções.** `node:crypto`; Web Crypto (`crypto.subtle`); sha256 escrito à mão;
  `@noble/hashes`.
- **Escolha.** `@noble/hashes` 2.2.0. `node:crypto` quebra bundle de browser;
  Web Crypto é assíncrona e contaminaria de `Promise` um pipeline que é síncrono;
  sha256 à mão é código de criptografia sem auditoria. `@noble/hashes` é puro,
  síncrono, isomórfico, auditado e sem dependência transitiva.
- **Custo aceito.** Uma dependência de runtime em `libs/domain`, declarada no
  `package.json` da lib e vigiada por `@nx/dependency-checks`. Import só resolve
  com extensão (`@noble/hashes/sha2.js`).
- **Data.** 2026-08-03

---

## ADR-015 — SimHash guardado como `bigint` assinado

- **Contexto.** O schema canônico diz `simhash bigint`. `bigint` no Postgres é
  int8 **assinado**; o SimHash usa os 64 bits, então metade dos valores
  possíveis não cabe.
- **Opções.** Trocar a coluna para `numeric` ou `bytea`; converter para a faixa
  assinada na fronteira de persistência.
- **Escolha.** Converter, com `paraBigintAssinado` e `paraSimhashSemSinal` em
  `libs/domain`. O schema canônico está fechado e `bigint` é o tipo certo para
  comparação de bits; trocar a coluna resolveria o sintoma criando um tipo pior.
- **Custo aceito.** Toda escrita e leitura de `simhash` tem de passar pela
  conversão. Sem ela a inserção falharia com "value out of range" em cerca de
  metade dos itens, de forma intermitente — o pior jeito de descobrir. Há teste
  provando que a distância de Hamming é idêntica nas duas representações.
- **Data.** 2026-08-03

---

## ADR-016 — Chave primária de `cluster_entidade`

- **Contexto.** O `CONTEXTO.md` seção 4 lista `cluster_entidade` sem chave
  primária.
- **Opções.** `id` sintético; chave natural `(cluster_id, tipo, valor)`; sem
  chave.
- **Escolha.** `(cluster_id, tipo, valor)`. Impede a mesma entidade entrar duas
  vezes no mesmo cluster quando o enriquecimento da Onda 8 reprocessa, o que é
  justamente o caso que o cache por `enrich_hash` não cobre.
- **Custo aceito.** `confianca` não entra na chave, então reprocessar com
  confiança diferente exige `ON CONFLICT ... DO UPDATE`, não um insert cego.
- **Data.** 2026-08-03

---

## ADR-017 — `down` vazio só para extensão; schema reverte de verdade

- **Contexto.** O `ADR-006` deixou `down` vazio na migração de extensão. A
  migração do schema canônico cria oito enums e seis tabelas, e a Onda 1 exige
  "migração sobe e reverte limpa".
- **Opções.** `down` vazio também no schema, por simetria; `down` completo.
- **Escolha.** `down` completo, derrubando em ordem inversa. A proibição de
  migração destrutiva do `CLAUDE.md` seção 1 é sobre perda de dado como efeito
  colateral de outra mudança, não sobre reversão deliberada disparada pelo humano
  com `npm run db:reverter`. `DROP EXTENSION vector` era diferente porque
  cascateia sobre objeto que a migração não criou.
- **Custo aceito.** `npm run db:reverter` no schema apaga todo dado coletado.
  Verificado: sobe, reverte deixando só `migracoes`, e sobe de novo limpo.
- **Data.** 2026-08-03

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

## ADR-011 — Um sistema operacional por checkout, com portão no `pre-push`

- **Contexto.** O primeiro `git push` saiu do WSL sobre `/mnt/c` e o hook quebrou
  em `TypeError: (0 , native_1.isAiAgent) is not a function`. Duas causas
  independentes: o Node daquele shell era 24.12.0, fora de `engines`
  (`^22.22.3 || ^24.15.0`); e só `@nx/nx-win32-x64-msvc` está instalado, porque o
  `npm install` rodou no Windows — o Nx distribui binário nativo por plataforma.
- **Opções.** Trabalhar só do Windows; mover o checkout para o sistema de
  arquivos do Linux e trabalhar só do WSL; manter os dois e conviver com a
  quebra.
- **Escolha.** Um sistema por checkout, sem mistura, e um portão
  (`tools/verificar-ambiente.mjs`) como primeira linha do hook, que confere
  `engines` contra o Node em uso e a presença do binário nativo do Nx para a
  plataforma atual. Ele não conserta nada — diz o que está errado, em pt-BR, em
  vez de deixar o Nx falhar com stack trace que não indica a causa.
- **Custo aceito.** Uma dependência de desenvolvimento nova (`semver`, para
  comparar contra o `engines` real em vez de duplicar o intervalo) e um script a
  mais na frente do hook. Qual sistema usar é decisão do humano, e está pendente.
- **Data.** 2026-07-31

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
