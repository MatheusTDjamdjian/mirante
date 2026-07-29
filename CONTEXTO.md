# Mirante — Contexto do Projeto

> Sala de situação para o mercado financeiro e a economia: agrupa a cobertura
> jornalística brasileira e global sobre um mesmo fato, mede quanto o mercado
> está olhando para ele, e coloca isso ao lado da série macroeconômica que
> importa.

---

## 1. Tese do produto

Um leitor de notícias mostra **itens**. O Mirante mostra **fatos**.

Quando o Copom decide juros, doze veículos publicam a mesma notícia com títulos
diferentes. Um agregador comum entrega doze cards. O Mirante entrega um fato,
com a informação de que doze veículos distintos o cobriram — que é o melhor
sinal de relevância disponível sem editor humano — e ao lado dele a série da
Selic no Banco Central e a curva de volume de cobertura midiática do tema.

A pergunta que a tela responde não é "o que saiu hoje". É **"o que saiu hoje que
mexe com o que eu tenho na carteira, e o quanto o mundo está prestando atenção
nisso"**.

### Público

Investidor pessoa física com carteira própria (ações, FIIs, renda fixa
indexada), que acompanha macro por obrigação e não por diversão, e que hoje
resolve isso com quinze abas abertas.

### O que o Mirante não é

- Não é feed infinito de manchetes.
- Não é rede social, não tem comentário, não tem curtida.
- Não é robô de recomendação. Não diz o que comprar. Não emite juízo de valor
  sobre ativo, nem projeção de preço.
- Não reproduz o conteúdo dos veículos. Ver seção 3.

---

## 2. Fontes de dados

Todas gratuitas. Nenhuma exige contrato comercial no MVP.

### Notícia — Brasil (RSS)

| Fonte | Endpoint | Observação |
|---|---|---|
| InfoMoney — Mercados | `https://www.infomoney.com.br/mercados/feed` | Alto volume, foco em mercado |
| InfoMoney — Economia | `https://www.infomoney.com.br/economia/feed` | Macro e política econômica |
| Investing.com Brasil | Feeds RSS segmentados por mercado em `br.investing.com/webmaster-tools/rss` | Escolher os feeds de ações, câmbio e macro |
| Agência Brasil | RSS em `agenciabrasil.ebc.com.br` | Conteúdo oficial, licença permissiva — confirmar termos vigentes |
| Agência Gov | RSS em `agenciagov.ebc.com.br` | Divulgação de atos de governo |

> **Ação obrigatória na Onda 3:** para cada fonte, ler os Termos de Uso e
> registrar em `docs/LICENCAS.md` o que é permitido armazenar e exibir. A tabela
> acima é ponto de partida, não autorização.

### Notícia — global (GDELT DOC 2.0)

Endpoint: `https://api.gdeltproject.org/api/v2/doc/doc`

Gratuito, sem chave, sem cadastro. Janela móvel dos últimos 3 meses. Retorna
JSON. Busca com palavra-chave em inglês sobre cobertura traduzida
automaticamente de 65 idiomas — pesquisa-se `"central bank" AND tariff` e
retorna matéria alemã, japonesa e indiana já indexada.

Campos úteis do modo `ArtList`: `title`, `url`, `domain`, `seendate`,
`language`, `sourcecountry`, `socialimage`.

Modos de timeline que interessam ao produto:

- `TimelineVol` — volume relativo de cobertura do termo ao longo do tempo.
- `TimelineTone` — tom médio da cobertura ao longo do tempo.

Esses dois modos são o eixo de "atenção midiática" da tela de correlação. São
série temporal de graça, e não existe equivalente nacional.

Parâmetros de controle: `timespan`, `sourcecountry`, `sourcelang`,
`maxrecords` (teto de 250), `sort=datedesc`, `format=json`,
`TIMELINESMOOTH` para suavização.

**Cuidado operacional:** GDELT responde `429` sem aviso e respeita `Retry-After`.
O adaptador precisa de circuit breaker por endpoint, não só retry.

### Macroeconomia — Brasil

**SGS / Banco Central** — catálogo com mais de 30 mil séries identificadas por
código numérico, gratuito e sem chave:

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa
```

Séries do MVP (confirmar cada código contra o catálogo do SGS antes de fixar):
Selic meta, Selic over, CDI, IPCA mensal, IGP-M, dólar PTAX, IBC-Br.

**SIDRA / IBGE** — `https://apisidra.ibge.gov.br/values/...`. Tabelas de PIB
trimestral e desocupação (PNAD Contínua). A API é posicional e hostil; encapsular
num adaptador com os parâmetros já resolvidos por série nomeada, nunca montar
URL na camada de aplicação.

**IPEADATA** — fallback histórico quando a série do SGS tiver buraco.

### Cotação

**brapi.dev** — tier gratuito, alguns tickers funcionam sem token, delay de até
15 minutos. Irrelevante aqui: notícia não é tick, e o Mirante nunca promete
tempo real de preço.

Uso restrito a: preço de fechamento e variação do dia para os ativos da
watchlist, exibidos com timestamp visível e rótulo explícito de atraso.

---

## 3. Restrição jurídica — regra de ouro

**O Mirante armazena e exibe metadado. Nunca conteúdo.**

Isso não é cautela excessiva, é a arquitetura do sistema.

Permitido persistir e exibir: título, URL canônica, domínio do veículo, data de
publicação, idioma, região, e derivados calculados por nós (simhash, embedding,
entidades, tema, score).

Permitido persistir para processamento interno: o resumo curto que o próprio
feed RSS entrega, em campo marcado como `resumo_origem`.

**Proibido em qualquer circunstância:**

- Persistir ou exibir o texto integral ou parcial da matéria.
- Exibir `resumo_origem` na interface. Ele existe só para alimentar embedding e
  clustering.
- Fazer scraping do corpo da matéria a partir da URL.
- Gerar resumo que reproduza a estrutura ou o fraseado do original.

O texto que o usuário lê no card é **resumo gerado do cluster**, escrito a partir
do conjunto de títulos, em linguagem própria, neutro, com no máximo duas frases.
Todo card exibe o veículo e leva link de saída para a matéria original.

Isso vira seção do README. Front-end que resolveu licença de conteúdo antes de
escrever a primeira linha é um sinal técnico raro.

---

## 4. Modelo de dados canônico

O schema é a decisão que não se refaz no meio do projeto. Ele é fechado na
Onda 1 e migração posterior exige justificativa escrita.

```
fonte
  id                uuid pk
  nome              text
  dominio           text
  tipo              enum('rss','gdelt','oficial')
  licenca           enum('permissiva','restrita','desconhecida')
  peso_base         numeric        -- 0..1, credibilidade editorial
  ativa             boolean
  etag              text nullable  -- cache condicional
  last_modified     text nullable
  ultima_coleta_em  timestamptz

item
  id                uuid pk
  fonte_id          uuid fk
  url_canonica      text
  url_hash          text unique    -- sha256 da url canonicalizada
  titulo            text
  titulo_normalizado text          -- lower, sem acento, sem stopword, sem veículo
  resumo_origem     text nullable  -- NUNCA exibido
  publicado_em      timestamptz
  coletado_em       timestamptz
  idioma            char(2)
  regiao            enum('br','global')
  simhash           bigint
  embedding         vector(384) nullable
  cluster_id        uuid fk nullable
  busca             tsvector       -- to_tsvector('portuguese', titulo)

cluster
  id                uuid pk
  titulo_representativo text       -- título do item de maior peso_base
  resumo_gerado     text nullable  -- 2 frases, autoral, pt-BR
  primeiro_visto_em timestamptz
  ultimo_visto_em   timestamptz
  veiculos_distintos int
  tema              enum('juros','inflacao','cambio','fiscal','commodities',
                         'resultados','imobiliario','geopolitica','outro') nullable
  regiao            enum('br','global','ambos')
  score             numeric
  enrich_hash       text nullable  -- hash do conjunto de membros na última passada
  enriquecido_em    timestamptz nullable

cluster_entidade
  cluster_id        uuid fk
  tipo              enum('ticker','fii','instituicao','pessoa','pais','indicador')
  valor             text
  confianca         numeric        -- 0..1, autodeclarada pelo modelo

serie_macro
  codigo            text pk        -- 'selic_meta', 'ipca_mensal'
  fonte             enum('sgs','sidra','ipeadata')
  identificador_externo text       -- código SGS ou parâmetros SIDRA
  nome              text
  unidade           text
  frequencia        enum('diaria','mensal','trimestral')
  atualizada_em     timestamptz

serie_ponto
  codigo            text fk
  data              date
  valor             numeric
  pk (codigo, data)
```

Watchlist do usuário fica no cliente (IndexedDB) no MVP. Sem autenticação, sem
tabela de usuário, sem sincronização. É decisão deliberada de escopo: auth não
demonstra nada que já não esteja demonstrado em outro lugar, e adiciona
superfície de segurança que não quero manter num projeto de portfólio.

---

## 5. Pipeline

```
coleta ──► normalização ──► dedup exata ──► dedup aproximada ──► clustering
                                                                     │
                                             enriquecimento ◄────────┤
                                                    │                │
                                                    ▼                ▼
                                                 ranking ──────► API leitura
```

**Coleta.** Um worker por fonte, agendado. Requisição condicional com `ETag` e
`If-Modified-Since` sempre, guardando os headers na tabela `fonte`. A maioria
dos feeds respeita, e isso derruba tráfego e risco de bloqueio numa ordem de
magnitude.

**Normalização.** Canonicalização de URL (remove `utm_*`, `fbclid`, fragmento,
resolve redirect de encurtador), extração de título limpo (remove sufixo
` - InfoMoney`), detecção de idioma, `titulo_normalizado`.

**Dedup exata.** `url_hash` único. Descarta republicação idêntica antes de
qualquer custo computacional.

**Dedup aproximada.** SimHash de 64 bits sobre `titulo_normalizado`, distância
de Hamming ≤ 3 dentro de janela de 24h. Barato, resolve republicação de agência
e título quase idêntico. Roda antes do embedding porque embedding custa.

**Clustering.** Embedding do título, similaridade de cosseno contra centróides
de clusters ativos (últimas 24h), limiar `0.86` como ponto de partida a ser
calibrado contra o corpus rotulado. Acima do limiar, entra no cluster mais
próximo e o centróide é atualizado incrementalmente. Abaixo, abre cluster novo.

Janela temporal de 24h é obrigatória: duas notícias semanticamente idênticas
separadas por três semanas são fatos diferentes, não o mesmo fato.

**Enriquecimento.** Uma chamada de LLM **por cluster**, nunca por item. Retorna
JSON estruturado com resumo de duas frases, tema, entidades e região. Cacheado
por `enrich_hash`; só reprocessa quando entra veículo novo que muda o conjunto de
forma relevante. Essa diferença — cluster em vez de item, com cache — é o que
separa custo viável de conta absurda.

**Ranking.** Recalculado a cada ciclo de coleta.

---

## 6. Função de ranking

```
score = max(peso_base das fontes do cluster)
      × log2(1 + veiculos_distintos)
      × exp(-Δt_horas / TAU)
      × (1 + BOOST_WATCHLIST × casou_com_watchlist)
```

`TAU = 18` (horas). `BOOST_WATCHLIST = 0.6`. Ambos configuráveis na interface.

Duas exigências de produto sobre isso:

1. Os pesos são **visíveis e editáveis** pelo usuário, e o efeito é imediato.
2. O card mostra, ao hover ou em painel lateral, **por que** está naquela
   posição — quantos veículos, há quanto tempo, se casou com a watchlist.

Dashboard que explica seu próprio ranking é raro e é a coisa mais defensável da
tela numa entrevista.

---

## 7. Arquitetura

Monorepo Nx, npm.

```
apps/
  web                 Angular + SSR        → Vercel
  api                 NestJS (leitura)     → Railway
  ingestion-worker    NestJS + BullMQ      → Railway
libs/
  domain              TS puro: tipos, normalização, simhash, ranking
  adapters            um adaptador por fonte, sem dependência de framework
  persistence         repositórios, migrações, queries
  ui                  componentes Angular + design system
docs/
  LICENCAS.md         matriz de licença por fonte
  DECISOES.md         ADRs curtos
  METRICAS.md         números antes/depois
```

**Infra.** Postgres no Railway com `pgvector` (índice HNSW) e `tsvector` com
dicionário `portuguese`. Redis no Railway para fila BullMQ, janela de dedup e
cache de enriquecimento. Cloudflare para DNS e HTTPS.

**Divisão de deploy, e o motivo.** O app Angular com SSR vai para a Vercel. O
worker e a API vão para o Railway. Cron com job longo em função serverless morre
no timeout e queima dois dias de debug em cima de um bug que não é seu.

**Embedding — decisão fechada.** Modelo ONNX local no worker via
`@huggingface/transformers`, `multilingual-e5-small`, 384 dimensões. Custo zero,
funciona em pt-BR, roda dentro do container do Railway. Se a precisão do
clustering ficar abaixo de 85% no corpus rotulado da Onda 4, aí sim troca por
API paga de embedding — e essa troca, com o número que a motivou, é uma boa
entrada em `docs/DECISOES.md`.

**Enriquecimento — decisão fechada.** Claude via API, saída estruturada em JSON,
apenas por cluster.

**Estado no front.** Signals para estado de render. RxJS só na borda de HTTP e
de eventos. Sem NgRx: o estado aqui é uma lista derivada de servidor com filtros
em URL, não uma árvore de ações, e enfiar NgRx nisso é escolha difícil de
justificar.

**Tempo real — decisão fechada de não fazer.** Notícia chega por minuto, não por
segundo. Polling condicional a 60s, e no máximo um canal SSE que só avisa "há
coisa nova" sem carregar payload. Escolher explicitamente não usar WebSocket
onde ele não serve, e escrever o porquê, demonstra mais senioridade do que
implementá-lo.

---

## 8. Telas

**Feed** — lista virtualizada de clusters ordenada por score. Cada card: título
representativo, resumo gerado, contagem de veículos, tempo relativo, tema,
entidades como chips clicáveis. Sem imagem grande, sem hero. Densidade é a
proposta.

**Cluster aberto** — como cada veículo enquadrou o mesmo fato, lado a lado, com
o tom de cada um. É a visão que nenhum concorrente tem, e é o que transforma o
projeto de agregador em produto.

**Correlação** — série macro do SGS sobreposta à curva de volume de cobertura do
GDELT para o mesmo tema. Canvas. Clique num pico do gráfico filtra o feed para
aquela janela temporal; hover num card destaca o ponto correspondente. É
bidirecional.

**Watchlist** — ativos do usuário, com os clusters que os mencionaram nas
últimas 48h.

Todo filtro vive na URL. Sem exceção. Período, região, tema, tickers, ordenação.
Isso dá link compartilhável, botão de voltar funcionando e SSR de verdade.

---

## 9. Critérios de sucesso do projeto

Não são metas de produto. São os números que precisam estar no README para o
projeto ter servido ao propósito.

| Eixo | Alvo |
|---|---|
| Precisão do clustering | ≥ 90% em corpus de 1000 itens rotulado à mão |
| Recall do clustering | ≥ 85% no mesmo corpus |
| INP com 10.000 itens no feed | ≤ 200 ms |
| CLS na chegada de itens novos | 0 |
| LCP em 4G simulado, com SSR | ≤ 2,0 s |
| Bundle inicial | ≤ 250 KB gzip |
| Acessibilidade | navegação completa por teclado; feed auditado com leitor de tela real |
| Custo mensal de enriquecimento | documentado, com o número antes e depois do cache |

Os quatro documentos que precisam existir no fim: `LICENCAS.md` com a matriz de
fonte por licença, `DECISOES.md` com os ADRs, `METRICAS.md` com antes/depois de
cada otimização, e um README que explique trade-off e não funcionalidade.

---

## 10. Riscos conhecidos

**Feed muda de formato ou sai do ar.** Adaptador deve degradar isoladamente:
uma fonte quebrada não pode derrubar o ciclo de coleta. Log estruturado por
fonte e badge de saúde na interface.

**GDELT rate-limit.** Circuit breaker por endpoint, respeitando `Retry-After`.
Nunca retry cego.

**Clustering ruim é a morte do produto.** Por isso o corpus rotulado da Onda 4
vem antes do ranking e antes da interface. Sem baseline medida, não há como
saber se uma mudança de limiar melhorou ou piorou.

**Escopo inflando.** As tentações previsíveis são: autenticação, alerta por
e-mail, app mobile, backtest de estratégia. Nenhuma entra. Se sobrar energia,
ela vai para acessibilidade e para os números do `METRICAS.md`.
