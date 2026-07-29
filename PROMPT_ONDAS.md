# PROMPT_ONDAS.md — Plano de Execução do Mirante

## Como usar este arquivo

Você é o agente responsável por construir o Mirante. Antes de qualquer coisa,
leia `CONTEXTO.md` (produto, fontes, schema, restrições) e `CLAUDE.md`
(constituição de engenharia). Este arquivo define a ordem.

**Regras de execução:**

1. Uma onda por vez. Você não começa a onda N+1 antes de o humano confirmar que
   a onda N passou.
2. Cada onda tem critério de aceite verificável. Você **verifica**, não presume.
   Rodar o comando e mostrar a saída conta; dizer "deve funcionar" não conta.
3. O bloco "Não faça nesta onda" é vinculante. Adiantar trabalho de onda futura é
   retrabalho garantido, porque as ondas seguintes dependem de números que as
   anteriores produzem.
4. Ao terminar, entregue o relatório de onda: o que foi construído, os números
   medidos, itens `VERIFICAR` pendentes, e decisões que precisam do humano.
5. Você nunca executa git. Sugere o comando, o humano executa.

**A ordem não é arbitrária.** O schema vem antes da coleta porque é o que não se
refaz. Uma fonte inteira vem antes de cinco porque valida o contrato do
adaptador. O clustering vem antes da interface porque se o agrupamento for ruim
não existe produto para desenhar. E o corpus rotulado vem antes de qualquer ajuste
de limiar, porque sem baseline medida você não sabe se melhorou ou piorou.

---

## Onda 0 — Fundação

**Objetivo.** Ambiente reproduzível e trilhos de qualidade. Nenhuma feature.

**Entregáveis.**

- Workspace Nx com npm. Apps vazios: `web` (Angular standalone + SSR), `api`
  (NestJS), `ingestion-worker` (NestJS). Libs vazias: `domain`, `adapters`,
  `persistence`, `ui`.
- Tags Nx e `@nx/enforce-module-boundaries` ativos conforme seção 3 do
  `CLAUDE.md`, com um teste que prova que a violação é barrada.
- TypeScript `strict: true` e `noUncheckedIndexedAccess: true` em todo o
  workspace.
- ESLint e Prettier configurados. Husky com hook `pre-push` rodando
  `npx nx affected -t lint test build`. Nenhum arquivo em `.github/`.
- `docker-compose.yml` local com Postgres (extensão `pgvector` habilitada) e
  Redis. Script `npm run dev:infra`.
- Ferramenta de migração escolhida e configurada, com uma migração de smoke test
  que cria e reverte uma tabela descartável.
- `.env.example` com placeholders. `docs/` com `LICENCAS.md`, `DECISOES.md`,
  `METRICAS.md`, `BACKLOG.md` criados vazios com cabeçalho.

**Aceite.**

- `npx nx run-many -t lint test build` passa limpo do zero.
- `npm run dev:infra` sobe, e uma query verifica `CREATE EXTENSION vector` ativa.
- Tentativa de importar `persistence` dentro de `ui` falha no lint.
- Hook de pre-push barra um push com lint quebrado propositalmente.

**Não faça nesta onda.** Nenhuma tabela real, nenhum adaptador, nenhuma tela,
nenhuma dependência de UI além do esqueleto.

---

## Onda 1 — Domínio canônico

**Objetivo.** O coração testável do sistema, em TypeScript puro. Esta é a onda
que decide a qualidade de todas as outras.

**Entregáveis em `libs/domain`.**

- Tipos e enums do schema da seção 4 do `CONTEXTO.md`. Fonte única de verdade.
- `canonicalizarUrl(url)`: remove `utm_*`, `gclid`, `fbclid`, fragmento,
  normaliza barra final e host, resolve `http`→`https`. Determinística.
- `hashUrl(url)`: sha256 da URL canonicalizada.
- `normalizarTitulo(titulo, dominio)`: minúsculas, remove acento, remove sufixo
  de veículo (` - InfoMoney`, ` | Investing.com`), remove pontuação e stopwords
  em pt-BR e en, colapsa espaço.
- `simhash(texto)`: SimHash de 64 bits sobre shingles de palavra.
  `distanciaHamming(a, b)`.
- `calcularScore(cluster, agora, config)` implementando exatamente a fórmula da
  seção 6 do `CONTEXTO.md`, com `TAU` e `BOOST_WATCHLIST` como configuração
  injetada, não constante literal.
- `decidirCluster(item, candidatos, config)`: pura, recebe similaridades já
  calculadas e devolve `{ tipo: 'entrar', clusterId } | { tipo: 'novo' }`.
  Nenhuma chamada de modelo aqui — a decisão é testável sem embedding.
- Migrações criando o schema completo, com índices: `url_hash` único, HNSW em
  `embedding`, GIN em `busca`, B-tree em `(publicado_em desc)` e
  `(cluster_id)`.

**Aceite.**

- Teste unitário para cada função, incluindo casos de borda: URL com parâmetro
  repetido, título vazio, título só com stopword, dois simhashes de textos
  quase idênticos com distância ≤ 3 comprovada.
- `calcularScore` tem teste que prova monotonicidade: mais veículos aumenta,
  mais tempo diminui, watchlist aumenta.
- Migração sobe e reverte limpa. `EXPLAIN` de uma busca por similaridade mostra
  uso do índice HNSW.
- `libs/domain` não tem nenhuma dependência de runtime no `package.json` além de
  utilitários puros.

**Não faça nesta onda.** Nenhum HTTP, nenhum acesso a banco dentro de `domain`,
nenhum adaptador.

---

## Onda 2 — Fatia vertical: uma fonte só

**Objetivo.** Provar o contrato do adaptador ponta a ponta com **uma** fonte
antes de multiplicar o erro por cinco.

**Fonte escolhida:** InfoMoney Mercados (`/mercados/feed`). RSS bem formado,
alto volume, pt-BR.

**Entregáveis.**

- `libs/adapters`: interface `AdaptadorFonte` com `coletar(estado): Promise<ResultadoColeta>`,
  onde `estado` traz `etag` e `lastModified` e o resultado devolve os novos
  valores. Implementação `AdaptadorRss` genérica, configurada por fonte.
- Requisição condicional real com `ETag`/`If-Modified-Since`, persistindo os
  headers em `fonte`. Timeout explícito. Circuit breaker que respeita
  `Retry-After`.
- Validação Zod da resposta. Resposta malformada gera erro tipado e log, não
  exceção não tratada.
- `apps/ingestion-worker`: fila BullMQ com job `coletar-fonte` idempotente,
  agendado. Dedup exata por `url_hash` na escrita.
- Log estruturado por ciclo: `fonte_id`, coletados, novos, ignorados, duração.
- Seed com a fonte InfoMoney na tabela `fonte`.

**Aceite.**

- Rodar o worker duas vezes seguidas: a segunda execução coleta zero itens novos
  e o log mostra `304` ou dedup por hash. Isso é o teste central da onda.
- Fixtures em disco: resposta válida, resposta malformada, resposta `429`.
  Teste para cada uma.
- Banco populado com pelo menos 50 itens reais, com `titulo_normalizado`,
  `simhash` e `url_hash` preenchidos.
- Derrubar a rede no meio do ciclo não deixa o banco em estado inconsistente.

**Não faça nesta onda.** Outras fontes. Embedding. Clustering. Qualquer tela.

---

## Onda 3 — Todas as fontes

**Objetivo.** Multiplicar o contrato validado, e resolver a questão de licença
antes de qualquer exibição.

**Entregáveis.**

- Demais adaptadores RSS: InfoMoney Economia, Investing.com Brasil (feeds de
  ações, câmbio e macro), Agência Brasil, Agência Gov.
- `AdaptadorGdelt` contra `https://api.gdeltproject.org/api/v2/doc/doc`, modo
  `ArtList`, `format=json`, `sort=datedesc`, `maxrecords` respeitando o teto de
  250, `timespan` incremental. Conjunto de consultas temáticas configurável
  (juros, inflação, câmbio, tarifa, commodities, banco central), com filtro por
  `sourcelang` e `sourcecountry`. Circuit breaker obrigatório.
- **`docs/LICENCAS.md` preenchido.** Para cada fonte: URL dos Termos de Uso, data
  da consulta, o que é permitido armazenar, o que é permitido exibir, e o campo
  `licenca` correspondente na tabela `fonte`. Fonte cuja licença você não
  conseguiu determinar entra como `desconhecida` e é tratada com a política mais
  restritiva.
- Painel de saúde por fonte: último sucesso, última falha, taxa de erro. Pode ser
  endpoint JSON nesta onda; a tela vem depois.

**Aceite.**

- Ciclo completo de todas as fontes em menos de 90 segundos.
- Derrubar uma fonte propositalmente (URL inválida) não impede as outras de
  coletarem. Comprovado com log.
- GDELT devolvendo `429` abre o circuito, e o ciclo seguinte não tenta antes do
  `Retry-After`. Comprovado com teste.
- `LICENCAS.md` cobre 100% das fontes ativas, sem linha em branco.
- Banco com pelo menos 2.000 itens, misturando `regiao='br'` e `regiao='global'`.

**Não faça nesta onda.** Clustering. Enriquecimento. Interface.

---

## Onda 4 — Deduplicação e clustering

**Objetivo.** A onda que decide se o produto existe. Nada de interface até isto
estar medido.

**Entregáveis.**

- `fixtures/corpus-rotulado/`: pelo menos 1.000 itens reais extraídos do banco,
  agrupados **à mão** pelo humano em fatos. Formato JSON simples:
  `{ item_id, grupo_id }`. Esta parte é trabalho do humano, e você deve parar e
  pedir, gerando o arquivo de entrada para ele rotular.
- Script de avaliação `npm run avaliar:clustering` que roda o pipeline contra o
  corpus e reporta precisão, recall, F1 e número de clusters formados versus
  esperados.
- Camada 1 — dedup aproximada: SimHash com distância de Hamming ≤ 3, janela de
  24h. Roda antes de qualquer embedding, porque embedding custa.
- Camada 2 — embedding local: `@huggingface/transformers` com
  `multilingual-e5-small`, 384 dimensões, ONNX, dentro do worker. Modelo baixado
  uma vez e cacheado em volume.
- Clustering incremental: similaridade de cosseno via `pgvector` contra
  centróides de clusters ativos das últimas 24h, limiar inicial `0.86`,
  atualização incremental do centróide, contagem de `veiculos_distintos`.
- Calibração do limiar: varredura de `0.78` a `0.92` reportando F1 em cada ponto,
  com o resultado registrado em `docs/METRICAS.md`.

**Aceite.**

- Precisão ≥ 90% e recall ≥ 85% no corpus rotulado. **Se não bater, a onda não
  passa.** Investigue nesta ordem: qualidade da normalização de título, limiar,
  janela temporal, e só por último troque o modelo de embedding.
- A tabela de varredura de limiar está em `METRICAS.md`, com o valor escolhido e
  o motivo.
- Um caso conhecido verificado à mão: uma decisão do Copom coberta por pelo
  menos cinco veículos forma um cluster único com `veiculos_distintos = 5`.
- Custo de embedding registrado: itens por segundo e memória do worker.
- Se você trocou o modelo de embedding, há ADR em `DECISOES.md` com o número que
  motivou.

**Não faça nesta onda.** Enriquecimento por LLM. Interface. Ranking final.

---

## Onda 5 — Ranking e API de leitura

**Objetivo.** Servidor pronto para a interface consumir, com ranking explicável.

**Entregáveis.**

- Recálculo de `score` ao fim de cada ciclo de coleta, usando `calcularScore` da
  Onda 1. Nenhuma duplicação de fórmula no back-end.
- `apps/api` com endpoints de leitura, todos com validação Zod de query e DTO
  tipado:
  - `GET /clusters` — filtros: `periodo`, `regiao`, `tema`, `tickers`,
    `ordenacao`; paginação por cursor (`ultimo_visto_em` + `id`), nunca por
    offset.
  - `GET /clusters/:id` — cluster com todos os itens membros, veículo de cada um.
  - `GET /clusters/:id/explicacao` — os componentes do score: peso da fonte,
    veículos distintos, decaimento temporal, boost de watchlist, e o produto
    final.
  - `GET /fontes/saude` — painel de saúde.
  - `GET /series` e `GET /series/:codigo` — stub retornando 501 nesta onda.
- Cache HTTP com `ETag` nas respostas de leitura, e `Cache-Control` compatível
  com o Cloudflare na frente.

**Aceite.**

- Paginação por cursor testada com inserção concorrente: nenhum item duplicado e
  nenhum item perdido ao paginar enquanto novos itens entram. Este é o teste
  central da onda.
- `/clusters/:id/explicacao` devolve componentes cujo produto é exatamente o
  `score` persistido.
- `EXPLAIN ANALYZE` da query principal do feed mostra uso de índice, sem seq
  scan, com 10.000 clusters no banco.
- Resposta do feed com 50 itens em menos de 150 ms local.

**Não faça nesta onda.** Interface. Séries macro de verdade. Enriquecimento.

---

## Onda 6 — Web: o feed

**Objetivo.** A parte que é o portfólio. Aqui o rigor é maior que nas outras.

**Entregáveis.**

- Design system implementado a partir de `DESIGN_SYSTEM.md` em `libs/ui`, com
  tokens Tailwind centralizados. Nenhum valor cru de estilo em componente.
- Angular SSR com hydration incremental. Página de feed renderizada no servidor.
- Feed virtualizado, capaz de sustentar 10.000 clusters.
- **Ancoragem de scroll estável.** Item novo nunca é inserido no topo enquanto o
  usuário lê. Acumula fora da viewport, e uma pílula "17 novas" injeta ao
  clique. Usar `overflow-anchor` e reserva de altura. CLS tem que ser 0.
- Todo filtro em URL: `periodo`, `regiao`, `tema`, `tickers`, `ordenacao`.
  Estado da URL é a fonte de verdade; navegação por voltar/avançar funciona;
  link é compartilhável e o SSR respeita os filtros da URL.
- Card do cluster: título representativo, contagem de veículos, tempo relativo em
  pt-BR, tema, chips de entidade clicáveis. Sem imagem grande. Sem hero.
- Painel de explicação do ranking acessível a partir do card.
- Vista de cluster aberto: os veículos que cobriram o mesmo fato, lado a lado,
  cada um com link de saída.
- Watchlist em IndexedDB, com edição, e o boost refletido na ordenação.
- Estados vazios, de erro e de carregamento, todos em pt-BR, escritos para
  orientar e não para se desculpar.
- Polling condicional a 60 s usando `ETag`. Sem WebSocket.

**Aceite.**

- Lighthouse em 4G simulado: LCP ≤ 2,0 s, CLS = 0.
- Perfil do DevTools com 10.000 itens: INP ≤ 200 ms ao rolar, filtrar e abrir
  card.
- Chegada de 50 itens novos com o usuário no meio da lista: **zero** salto de
  layout, comprovado por gravação ou por medição de CLS.
- Navegação completa por teclado, sem armadilha de foco, com foco sempre visível.
- Bundle inicial ≤ 250 KB gzip, com o relatório do analisador em `METRICAS.md`.
- Recarregar uma URL com filtros aplicados devolve o mesmo estado, renderizado no
  servidor.

**Não faça nesta onda.** Gráfico de correlação. Enriquecimento por LLM — o card
mostra `titulo_representativo` como texto principal por enquanto.

---

## Onda 7 — Camada macro e correlação

**Objetivo.** O que diferencia o Mirante de um agregador.

**Entregáveis.**

- `AdaptadorSgs` para `api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados`.
  Cada série cadastrada em `serie_macro` com seu código verificado contra o
  catálogo do SGS. Código não verificado entra como `// VERIFICAR`.
- `AdaptadorSidra` encapsulando a API posicional do IBGE. A camada de aplicação
  pede `pib_trimestral`, nunca monta URL.
- Coleta agendada com frequência coerente com a série: diária para câmbio e
  Selic, mensal para IPCA, trimestral para PIB. Não faz sentido bater na série
  mensal de hora em hora.
- `AdaptadorGdeltTimeline` usando `mode=TimelineVol` e `mode=TimelineTone` por
  tema, com `TIMELINESMOOTH`, persistindo como série em `serie_macro` /
  `serie_ponto` com fonte própria. É assim que "atenção midiática" se torna
  série temporal comparável.
- Endpoints `/series` e `/series/:codigo` implementados de verdade.
- Tela de correlação: canvas, série macro sobreposta à curva de volume de
  cobertura do mesmo tema. Downsampling por LTTB para preservar a forma da curva.
- Interação bidirecional: clicar num pico do gráfico filtra o feed para aquela
  janela; passar o mouse num card destaca o ponto correspondente no gráfico.
- Descrição textual acessível do gráfico: tabela alternativa navegável por
  teclado com os pontos da série. Gráfico em canvas é invisível para leitor de
  tela, e resolver isso é obrigatório.

**Aceite.**

- Série de IPCA, Selic e dólar populadas com pelo menos 5 anos, conferidas contra
  o valor publicado no site do BCB para três datas escolhidas ao acaso.
- Gráfico com 5.000 pontos renderiza e responde a interação com INP ≤ 200 ms.
- Clique no pico filtra o feed corretamente, e a URL reflete o filtro.
- Tabela alternativa do gráfico navegável por teclado e anunciada corretamente.
- Nenhum código de série no repositório sem verificação, ou todos os pendentes
  listados no relatório da onda.

**Não faça nesta onda.** Nenhuma inferência de causalidade. O produto mostra duas
curvas lado a lado e deixa a leitura para o usuário. Nenhum texto na interface
sugere que a cobertura causou o indicador ou vice-versa.

---

## Onda 8 — Enriquecimento por LLM

**Objetivo.** O resumo autoral e as entidades, com custo sob controle.

**Entregáveis.**

- Job `enriquecer-cluster`, disparado por cluster e **nunca** por item.
- Uma chamada por cluster, com saída estruturada em JSON, retornando: resumo de
  duas frases em pt-BR, tema, região, e lista de entidades com tipo, valor e
  confiança autodeclarada.
- Cache por `enrich_hash` (hash do conjunto ordenado de membros). Reprocessa só
  quando entra veículo que muda o conjunto de forma relevante, com regra
  explícita de "relevante" documentada.
- Guardrails no prompt, verificados por teste:
  - o resumo não pode reproduzir fraseado dos títulos de origem além do
    inevitável (nome próprio, número);
  - proibido emitir juízo sobre ativo, projeção de preço ou recomendação;
  - proibido inventar entidade não presente nos títulos;
  - saída fora do schema é rejeitada e o job vai para retry, não é salva
    parcialmente.
- Substituição do texto do card: `resumo_gerado` quando existe,
  `titulo_representativo` como fallback. A transição não pode causar salto de
  layout — reserve a altura.
- `docs/METRICAS.md` com o custo mensal projetado: por cluster, total sem cache,
  total com cache, e a taxa de acerto do cache.

**Aceite.**

- 200 clusters enriquecidos, revisados por amostragem de 20 pelo humano: nenhum
  caso de recomendação de investimento, nenhuma entidade inventada, nenhum
  resumo que copie um título.
- Taxa de acerto do cache medida e documentada.
- Chamada com resposta fora do schema não corrompe o banco. Comprovado com teste.
- Custo por cluster documentado em reais.

**Não faça nesta onda.** Nenhum uso de LLM em caminho síncrono de request. O
usuário nunca espera por um modelo.

---

## Onda 9 — Endurecimento e publicação

**Objetivo.** Transformar o que funciona em algo defensável.

**Entregáveis.**

- Auditoria de acessibilidade com leitor de tela real (NVDA ou VoiceOver) no
  feed com atualização automática, na tela de correlação e na watchlist.
  Gravação curta de tela como evidência.
- `axe` rodando em teste automatizado nas rotas principais, integrado ao hook de
  pre-push.
- Verificação dos tetos da seção 7 do `CLAUDE.md`, todos medidos e registrados.
- Caça a vazamento de memória: sessão de uma hora com polling ativo, comparação
  de heap snapshots. Vazamento na primeira versão de app com atualização
  periódica é praticamente garantido, e achar o seu é uma boa seção de README.
- Caos deliberado: derrubar o Postgres no meio de um ciclo, throttle para 3G
  lento, colocar a máquina para dormir e acordar. Nenhum estado inconsistente,
  nenhuma tela travada em carregamento eterno.
- Deploy: `web` na Vercel com SSR, `api` e `ingestion-worker` no Railway, DNS e
  HTTPS no Cloudflare. Migração rodando de forma controlada, nunca automática no
  boot.
- README final. Não descreve funcionalidade. Descreve: a tese do produto, a
  matriz de licença de conteúdo e por que ela moldou a arquitetura, as decisões
  com seus trade-offs, os números antes e depois de cada otimização, os
  resultados de precisão e recall do clustering, e o que você faria diferente.
- `docs/DECISOES.md` fechado, com pelo menos os ADRs de: SSE versus polling,
  embedding local versus API, signals versus NgRx, cluster versus item no
  enriquecimento, e watchlist local versus autenticada.

**Aceite.**

- Todas as métricas da seção 9 do `CONTEXTO.md` medidas e no README, incluindo as
  que não bateram o alvo — com a explicação do porquê.
- Aplicação no ar, funcionando, com dado real fluindo.
- Um estranho consegue ler o README e entender em cinco minutos qual era o
  problema difícil e como você o resolveu.

**Não faça nesta onda.** Feature nova. Se aparecer ideia, vai para
`docs/BACKLOG.md`.

---

## Fora de escopo permanente

Estas são as tentações previsíveis, e todas ficam de fora do MVP. Se você as
propor, você está inflando escopo:

autenticação e conta de usuário; alerta por e-mail ou push; aplicativo mobile;
backtest de estratégia; qualquer forma de recomendação de compra ou venda;
projeção de preço; comentário, curtida ou qualquer social; tradução da interface;
white-label; painel administrativo além do painel de saúde de fontes.

Se sobrar energia depois da Onda 9, ela vai para acessibilidade e para os números
do `METRICAS.md`. Nunca para uma décima tela.
