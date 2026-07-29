# CLAUDE.md — Constituição de Engenharia do Mirante

Este arquivo é lei. Em qualquer conflito entre um pedido pontual e uma regra
daqui, a regra ganha, e você para e aponta o conflito em vez de resolver por
conta própria.

Leia `CONTEXTO.md` antes de escrever qualquer código. Leia `PROMPT_ONDAS.md`
para saber em que onda estamos e o que está fora de escopo agora.

---

## 1. Regras absolutas

Estas não têm exceção e não são negociáveis por argumento de conveniência.

**Git.** Você nunca executa comando git. Nem `add`, nem `commit`, nem `push`,
nem `checkout`, nem `stash`, nem `rebase`. Você sugere o comando em bloco de
código e para. O controle de versão é manual e é do humano.

**Licença de conteúdo.** O sistema armazena e exibe metadado, nunca conteúdo.
`resumo_origem` jamais chega à interface. Nenhum código faz fetch do corpo de uma
matéria. Nenhum resumo gerado reproduz fraseado do original. Se uma
implementação que você está prestes a fazer viola isso, pare e diga.

**Gerenciador de pacotes.** npm. Nunca pnpm, nunca yarn, nunca bun. Se você vir
um `pnpm-lock.yaml` no repositório, isso é um erro a ser reportado, não um sinal
para trocar.

**CI.** Sem GitHub Actions. Sem qualquer workflow em `.github/`. Qualidade é
garantida por hook Husky de `pre-push` rodando lint, teste e build afetados via
`nx affected`.

**Segredo.** Nenhuma chave, token ou string de conexão em código, em teste, em
comentário ou em arquivo de exemplo com valor real. `.env.example` só com
placeholder. Se precisar de uma variável nova, adicione ao `.env.example` e
avise.

**Migração destrutiva.** Nenhum `DROP`, nenhum `TRUNCATE`, nenhuma alteração de
coluna com perda de dado sem confirmação explícita do humano naquele momento.

**Schema canônico.** Fechado na Onda 1. Alteração posterior exige ADR em
`docs/DECISOES.md` explicando o que a decisão original não previu.

---

## 2. Idioma

Todo texto que o usuário final lê é **português do Brasil**. Interface, mensagem
de erro, estado vazio, rótulo, tooltip, resumo gerado, e-mail. Sem exceção e sem
mistura.

Código em inglês: nome de função, variável, classe, arquivo, branch. Comentário
em português quando explicar decisão de negócio; em inglês quando explicar
mecânica técnica.

Enums de domínio em português quando são vocabulário do negócio brasileiro
(`tema`, `regiao`, `licenca`), porque o domínio é brasileiro e traduzir isso
introduz uma camada de tradução mental sem ganho.

Nome de tabela e coluna em português, conforme o schema em `CONTEXTO.md`.

---

## 3. Estrutura do monorepo

Nx. Fronteira de biblioteca é respeitada via `@nx/enforce-module-boundaries`, com
tags configuradas e regra ativa desde a Onda 0.

```
libs/domain        type:util   — TS puro. Zero dependência de framework.
                                Zero import de Angular, Nest, Prisma, HTTP.
                                Testável sem browser e sem banco.
libs/adapters      type:data   — pode depender de domain. Um arquivo por fonte.
libs/persistence   type:data   — pode depender de domain.
libs/ui            type:ui     — Angular. Pode depender de domain.
apps/*             type:app    — pode depender de tudo.
```

Regra de dependência: `domain` não importa nada do projeto. `ui` não importa
`persistence`. `adapters` não importa `ui`. Violação de fronteira é erro de
lint, não sugestão.

Se uma lógica está sendo escrita dentro de um componente Angular ou de um
controller Nest e ela é regra de negócio testável, ela está no lugar errado.
Move para `domain`.

---

## 4. Front-end

**Angular standalone.** Sem NgModule novo. `ChangeDetectionStrategy.OnPush` em
todo componente, sem exceção.

**Estado.** Signals para estado de render e estado derivado. RxJS apenas na
borda: HTTP, eventos de DOM, SSE. Converta para signal na fronteira do
componente. Sem NgRx, sem Akita, sem serviço-singleton-com-BehaviorSubject
fazendo papel de store global.

**Sem `any`.** `strict: true`, `noUncheckedIndexedAccess: true`. Se você precisa
de `any`, você precisa de um tipo que ainda não escreveu.

**Estilo.** Tailwind com tokens centralizados. Nenhum valor cru de cor, espaço,
raio, sombra ou tamanho de fonte em componente — sempre token. Se o token não
existe, ele é criado no design system e depois usado. Ver `DESIGN_SYSTEM.md`
quando existir.

**Sem `<form>` nativo com submit.** Handlers explícitos.

**Formatação de número e data.** Sempre via utilitário central com locale
`pt-BR`. Nunca `toLocaleString` espalhado. Valor monetário sempre com o
timestamp de origem visível quando vier de cotação.

**Acessibilidade é critério de aceite, não polimento.**

- Foco visível em tudo que recebe foco. Nunca `outline: none` sem substituto.
- Ordem de tabulação segue a ordem visual.
- Alvo de toque mínimo de 44×44 px.
- `prefers-reduced-motion` respeitado em toda animação.
- Contraste mínimo 4,5:1 para texto, 3:1 para elemento gráfico de interface.
- Feed com atualização automática usa `aria-live="polite"` num **resumo
  agregado** com throttle. Nunca anuncie o conteúdo dos itens. Anunciar item a
  item torna o app inutilizável em leitor de tela, e isso é o erro mais comum
  desta categoria de produto.

---

## 5. Back-end

**NestJS.** Módulo por contexto. Injeção por construtor. Nenhuma regra de
negócio em controller — controller valida entrada, chama caso de uso, devolve
DTO.

**Validação de entrada.** Zod em todo limite externo: request HTTP, resposta de
API de terceiro, payload de fila, variável de ambiente. Resposta de terceiro é
entrada não confiável — GDELT e RSS mudam de formato sem avisar, e o sistema
precisa falhar de forma explícita e isolada, não silenciosamente propagar
`undefined`.

**Fila.** BullMQ. Todo job é idempotente. Retry com backoff exponencial e
jitter. Job que falha três vezes vai para dead-letter com payload preservado.

**Adaptador de fonte.** Interface única, uma implementação por fonte, sem
condicional por tipo de fonte fora da fábrica. Cada adaptador:

- respeita `ETag` / `If-Modified-Since`;
- tem timeout explícito;
- tem circuit breaker que respeita `Retry-After`;
- falha isolado, sem derrubar o ciclo;
- emite log estruturado com `fonte_id`, itens coletados, itens novos, duração.

**Banco.** Migração versionada e reversível. Índice criado junto da query que o
exige, no mesmo commit. Nenhuma query em produção sem índice que a sustente.
Consulta de similaridade vetorial usa índice HNSW.

**Log.** Estruturado, JSON, com correlação por ciclo de coleta. Nunca
`console.log`.

---

## 6. Testes

Não busque cobertura alta. Busque cobertura no lugar certo.

**Obrigatório testar:**

- tudo em `libs/domain` — normalização de URL e título, simhash, distância de
  Hamming, função de ranking, decisão de clustering;
- todo adaptador contra fixture de resposta real salva em disco, incluindo uma
  fixture de resposta malformada e uma de `429`;
- todo utilitário de formatação pt-BR.

**Não teste:** template Angular trivial, getter, DTO sem lógica.

**Corpus de clustering.** A partir da Onda 4 existe `fixtures/corpus-rotulado/`
com pelo menos 1000 itens agrupados à mão. Toda mudança em limiar, modelo de
embedding ou algoritmo de dedup roda contra ele e reporta precisão e recall antes
e depois. Mudança sem número não é mudança, é palpite.

Nada de mock de banco. Teste de integração roda contra Postgres real via
`docker compose`.

---

## 7. Orçamento de performance

Números, não intenções. Verificados na Onda 9 e vigilantes desde a Onda 6.

| Métrica | Teto |
|---|---|
| LCP (4G simulado, SSR ligado) | 2,0 s |
| INP com 10.000 itens no feed | 200 ms |
| CLS na inserção de itens novos | 0 |
| Bundle inicial | 250 KB gzip |
| Ciclo completo de coleta de todas as fontes | 90 s |

Regras derivadas:

- Lista de qualquer tamanho é virtualizada. Sem `*ngFor` sobre coleção não
  limitada.
- Série temporal com mais de 2.000 pontos vai para canvas, não SVG. Downsampling
  por LTTB, que reduz pontos preservando a forma visual da curva.
- Item novo **nunca** é inserido no topo do feed enquanto o usuário lê. Acumula
  fora da viewport e entra por ação explícita ("17 novas"). Isso não é
  preferência de UX, é o requisito de CLS zero.

---

## 8. Definição de pronto

Uma tarefa só está pronta quando **todas** valem:

1. O critério de aceite da onda correspondente está satisfeito, verificado, não
   presumido.
2. Teste escrito onde a seção 6 exige.
3. `npx nx affected -t lint test build` passa limpo.
4. Nenhum `any`, nenhum `TODO` sem issue, nenhum código comentado.
5. Nenhum valor cru de estilo — só token.
6. Navegável por teclado e com foco visível, se tocou interface.
7. Texto de usuário em pt-BR.
8. Decisão não óbvia registrada em `docs/DECISOES.md`, em cinco linhas: contexto,
   opções, escolha, custo aceito.
9. Se otimizou algo, o número antes e depois está em `docs/METRICAS.md`.

---

## 9. Como você se comporta

**Sem narração de processo.** Não anuncie o que vai fazer, não relate progresso,
não resuma o que acabou de fazer em prosa longa. Faça, e reporte o que mudou e
o que precisa de decisão.

**Sem hedge.** Quando tem recomendação, dê a recomendação. Não devolva três
opções equivalentes para o humano escolher; escolha, justifique em uma linha, e
diga o que te faria mudar de ideia.

**Pare em ambiguidade real.** Se uma decisão de arquitetura não está coberta por
`CONTEXTO.md` nem por este arquivo, não invente. Pergunte, e proponha um
default.

**Nunca invente fonte, endpoint ou código de série.** Todo código SGS, toda
tabela SIDRA, todo parâmetro de GDELT é verificado contra a documentação antes de
entrar no código. Se não conseguiu verificar, marque com
`// VERIFICAR: <o que>` e liste no relatório da onda.

**Nunca ultrapasse a onda atual.** Trabalho adiantado de onda futura é
retrabalho, porque a onda seguinte depende de números que a atual vai produzir.
Se identificar algo importante fora do escopo, anote em
`docs/BACKLOG.md` e continue.

**Ao terminar uma onda,** entregue um relatório curto: o que foi construído, os
números medidos, o que ficou `VERIFICAR`, e as decisões que precisam do humano
antes da onda seguinte.
