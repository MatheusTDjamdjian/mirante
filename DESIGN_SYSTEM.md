# DESIGN_SYSTEM.md — Contrato de Fidelidade Visual do Mirante

> ## ⚠ STATUS: PENDENTE DE EXTRAÇÃO
>
> As tabelas de token deste documento estão **vazias**, marcadas com
> `PREENCHER`. Elas só podem ser preenchidas por **extração direta** do arquivo
> do Claude Design. Nenhum valor aqui pode ser inventado, inferido, "aproximado"
> ou trazido de outro projeto.
>
> **Enquanto este documento estiver com `PREENCHER` em qualquer linha, nenhum
> trabalho de interface pode começar.** As Ondas 6, 7 e 9 do
> `PROMPT_ONDAS.md` estão bloqueadas. Ondas 0 a 5 e 8 são back-end e domínio, e
> podem prosseguir normalmente.

---

## 1. Fonte da verdade

O design do Mirante existe em um único lugar, e este documento não é ele.

| | |
|---|---|
| Projeto | Claude Design — Mirante |
| Arquivo principal | `Mirante.dc.html` |
| Arquivo auxiliar | `support.js` |
| Local no repositório | `design/Mirante.dc.html`, `design/support.js` |
| Hash SHA-256 do arquivo principal | `PREENCHER` |
| Data da extração | `PREENCHER` |
| Extraído por | `PREENCHER` |

**Regra de ouro.** O `Mirante.dc.html` é a especificação. Este documento é
apenas a tradução dele para tokens consumíveis pelo Tailwind. Em qualquer
divergência entre os dois, **o HTML ganha e este documento é corrigido** — nunca
o contrário.

Os dois arquivos ficam versionados dentro do repositório em `design/`. Não são
referência externa, não são link, não são "consulta quando precisar". Ficam no
repositório porque são a especificação, e porque projeto do Claude Design pode
mudar debaixo dos seus pés enquanto o código não muda.

Se o design for revisado, o fluxo é: substituir o arquivo em `design/`,
recalcular o hash, reexecutar o procedimento da seção 2, registrar o diff de
tokens em `docs/DECISOES.md`. Nunca editar token direto no código porque "o
design mudou".

---

## 2. Procedimento de extração

Executar uma vez, na abertura da Onda 6, antes de escrever qualquer componente.

**Passo 1 — Fixar o artefato.** Copiar `Mirante.dc.html` e `support.js` para
`design/`. Rodar `sha256sum design/Mirante.dc.html` e registrar na tabela da
seção 1. Se o hash não confere com o registrado, o design mudou e a extração
inteira é refeita.

**Passo 2 — Inventário bruto.** Abrir o HTML e listar, sem interpretar:

- todo bloco de variável CSS (`:root`, `@theme`, `[data-theme]`, `.dark`) com
  cada propriedade e cada valor, literalmente;
- toda `font-family` declarada, com a fonte de origem de cada uma (Google Fonts,
  arquivo local, CDN) e os pesos efetivamente usados;
- toda declaração de `font-size`, `line-height`, `letter-spacing`,
  `font-weight`, `font-variant-numeric`;
- todo valor de `border-radius`, `box-shadow`, `border-width`, `outline`;
- toda `transition` e `animation`, com duração e curva;
- todo `@media` e todo breakpoint;
- todo bloco `prefers-reduced-motion` e `prefers-color-scheme`.

**Passo 3 — Cruzar com `support.js`.** Comportamento que muda estilo é parte do
design: troca de tema, classe aplicada em scroll, estado de foco gerenciado por
script, cálculo de altura, lógica de virtualização, timing de animação. Catalogar
antes de reimplementar, porque reimplementar comportamento sem catalogá-lo é como
divergência visual entra no projeto.

**Passo 4 — Preencher as tabelas** das seções 3 a 8 deste documento, com valor
literal. Onde o design usa um valor que não tem token nomeado, criar o token e
anotar na coluna de origem qual seletor do HTML o produziu.

**Passo 5 — Gerar a configuração do Tailwind** a partir das tabelas, não a partir
do HTML. As tabelas passam a ser a interface entre design e código.

**Passo 6 — Auditoria visual** conforme seção 10.

**Se algum valor do design não couber em nenhuma categoria deste documento,
pare e pergunte.** Não force o encaixe, não arredonde para o token mais próximo,
não crie exceção inline. Valor órfão significa que este documento está
incompleto, e a correção é ampliar o documento.

---

## 3. Cor

Tokens semânticos, nome em português. Um valor por tema. Nenhum nome de cor
literal (`azul`, `cinza-800`) — o nome descreve a função, não o pigmento.

| Token | Claro | Escuro | Origem no HTML | Uso |
|---|---|---|---|---|
| `fundo` | PREENCHER | PREENCHER | PREENCHER | Fundo da página |
| `superficie` | PREENCHER | PREENCHER | PREENCHER | Cartão, linha de fato |
| `superficie-elevada` | PREENCHER | PREENCHER | PREENCHER | Painel, popover, modal |
| `superficie-afundada` | PREENCHER | PREENCHER | PREENCHER | Campo, poço |
| `borda` | PREENCHER | PREENCHER | PREENCHER | Divisor padrão |
| `borda-forte` | PREENCHER | PREENCHER | PREENCHER | Divisor de seção |
| `texto-primario` | PREENCHER | PREENCHER | PREENCHER | Título, corpo |
| `texto-secundario` | PREENCHER | PREENCHER | PREENCHER | Metadado, rótulo |
| `texto-terciario` | PREENCHER | PREENCHER | PREENCHER | Legenda, marca d'água |
| `acento` | PREENCHER | PREENCHER | PREENCHER | Ação primária, seleção |
| `acento-suave` | PREENCHER | PREENCHER | PREENCHER | Fundo de estado ativo |
| `positivo` | PREENCHER | PREENCHER | PREENCHER | Variação positiva |
| `negativo` | PREENCHER | PREENCHER | PREENCHER | Variação negativa |
| `atencao` | PREENCHER | PREENCHER | PREENCHER | Dado atrasado, fonte fora do ar |
| `foco` | PREENCHER | PREENCHER | PREENCHER | Anel de foco de teclado |
| `sobreposicao` | PREENCHER | PREENCHER | PREENCHER | Véu de modal |

Adicionar linha para todo token que o design tiver e esta tabela não previu.

**Regras de cor, independentes do que o design escolheu:**

- Cor nunca é o único portador de informação. Variação positiva e negativa
  carregam sinal, seta ou rótulo além da cor.
- Contraste verificado nos dois temas: 4,5:1 para texto, 3:1 para elemento
  gráfico de interface. Se um par do design não passar, **não corrija sozinho** —
  reporte, porque isso é decisão de design, não de implementação.
- Nenhum valor de cor cru em componente. Nunca. Nem em `style`, nem em classe
  arbitrária do Tailwind, nem em SVG inline.

---

## 4. Tipografia

| Papel | Família | Pesos | Fonte de origem | Uso |
|---|---|---|---|---|
| Display | PREENCHER | PREENCHER | PREENCHER | Título de tela, usado com parcimônia |
| Texto | PREENCHER | PREENCHER | PREENCHER | Corpo, título de fato, resumo |
| Utilitária | PREENCHER | PREENCHER | PREENCHER | Número, rótulo, metadado |

**Carregamento das fontes** é parte da fidelidade e do orçamento de performance:
`font-display: swap`, `preconnect` para a origem, subsetting para `latin-ext`
(português precisa de `ã`, `ç`, `õ`), e `size-adjust` para evitar salto de layout
na troca da fonte de fallback. O peso das fontes entra na conta dos 250 KB.

| Token | Tamanho | Entrelinha | Espaçamento | Peso | Origem |
|---|---|---|---|---|---|
| `titulo-tela` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |
| `titulo-fato` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |
| `resumo` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |
| `corpo` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |
| `metadado` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |
| `rotulo` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |
| `numero-grande` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |
| `numero-tabular` | PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |

**Numeral tabular é obrigatório** em contagem de veículos, variação, valor de
série, eixo de gráfico e data. `font-variant-numeric: tabular-nums`. Coluna de
número que dança é defeito, não questão de gosto.

---

## 5. Espaçamento, raio, elevação

| Categoria | Tokens | Valores | Origem |
|---|---|---|---|
| Escala de espaçamento | PREENCHER | PREENCHER | PREENCHER |
| Raio | PREENCHER | PREENCHER | PREENCHER |
| Elevação / sombra | PREENCHER | PREENCHER | PREENCHER |
| Espessura de borda | PREENCHER | PREENCHER | PREENCHER |

A escala de espaçamento do design substitui a escala padrão do Tailwind. Não
conviva com as duas: se o design usa uma escala própria, sobrescreva
`theme.spacing` inteiro. Escala dupla é a via de entrada mais comum para
divergência visual, porque `p-4` passa a significar coisas diferentes em lugares
diferentes.

---

## 6. Movimento

| Token | Duração | Curva | Aplicação | Origem |
|---|---|---|---|---|
| PREENCHER | PREENCHER | PREENCHER | PREENCHER | PREENCHER |

Toda transição respeita `prefers-reduced-motion: reduce`, e a implementação disso
é global, num único lugar, não repetida por componente. Se o design não declarou
o bloco de redução de movimento, **implemente e reporte** — é a única categoria em
que você adiciona algo que o design não tinha, porque é requisito de
acessibilidade e não escolha estética.

---

## 7. Foco e estados

Foco é estado de primeira classe neste produto, porque o Mirante é usado por
teclado.

| Estado | Tratamento | Origem |
|---|---|---|
| `:focus-visible` | PREENCHER | PREENCHER |
| `:hover` | PREENCHER | PREENCHER |
| `:active` | PREENCHER | PREENCHER |
| `:disabled` | PREENCHER | PREENCHER |
| Selecionado | PREENCHER | PREENCHER |
| Carregando | PREENCHER | PREENCHER |
| Erro | PREENCHER | PREENCHER |

`outline: none` sem substituto visível é proibido em qualquer circunstância,
inclusive se o design fizer isso. Nesse caso específico, implemente o anel de
foco e reporte a divergência — é a segunda e última exceção à regra de fidelidade
absoluta.

---

## 8. Breakpoints

| Token | Largura | Origem |
|---|---|---|
| PREENCHER | PREENCHER | PREENCHER |

Se o design entregou desktop e mobile mas não o intervalo do meio, **não invente
o comportamento intermediário**. Reporte, e proponha a interpolação mais
conservadora enquanto espera decisão.

---

## 9. Mapa componente ↔ design

Cada componente de `libs/ui` aponta para o trecho do design que o especifica.
Preencher com o seletor, o id ou a linha aproximada do `Mirante.dc.html`.

| Componente | Trecho no design | Observação de comportamento |
|---|---|---|
| `mir-linha-fato` | PREENCHER | Hierarquia entre 12 veículos e 1 veículo |
| `mir-chip-entidade` | PREENCHER | Clicável, vira filtro na URL |
| `mir-contador-veiculos` | PREENCHER | Numeral tabular |
| `mir-pilula-novos` | PREENCHER | 3 itens vs 200 itens; comportamento no topo |
| `mir-painel-explicacao` | PREENCHER | Pesos editáveis, efeito imediato |
| `mir-controle-periodo` | PREENCHER | Estado na URL |
| `mir-seletor-tema` | PREENCHER | Ver `support.js` |
| `mir-sparkline` | PREENCHER | Canvas |
| `mir-grafico-correlacao` | PREENCHER | Canvas, LTTB, interação bidirecional |
| `mir-tabela-alternativa` | PREENCHER | Equivalente acessível do gráfico |
| `mir-badge-saude-fonte` | PREENCHER | Honesto sem ser alarmante |
| `mir-estado-vazio` | PREENCHER | Texto em pt-BR, orienta ação |
| `mir-estado-erro` | PREENCHER | Não se desculpa, diz o que fazer |

Componente que existe no design e não está nesta tabela deve ser adicionado.
Componente que está nesta tabela e não existe no design significa que uma tela
não foi entregue — pare e reporte, não improvise.

---

## 10. Auditoria de fidelidade

Critério de aceite da Onda 6. Não é revisão de gosto, é conferência.

1. **Comparação lado a lado.** Abrir `design/Mirante.dc.html` no navegador e a
   aplicação implementada, no mesmo viewport, nos dois temas. Capturar as duas e
   comparar. Divergência de cor, de peso de fonte, de espaçamento ou de raio é
   defeito a corrigir, não variação aceitável.
2. **Varredura de valor cru.** `grep` no código por padrão de cor hexadecimal,
   `rgb(`, `hsl(`, `px` em propriedade de espaçamento e classe arbitrária do
   Tailwind (`[...]`). Resultado esperado: zero ocorrências fora de
   `libs/ui/tokens`.
3. **Cobertura de token.** Todo token declarado nas seções 3 a 8 é usado em algum
   lugar, ou está justificado como reserva. Token declarado e nunca usado
   normalmente indica tela não implementada.
4. **Contraste.** Verificado nos dois temas, com ferramenta, não a olho.
5. **Teclado.** Percorrer as sete telas só com `Tab`, `Shift+Tab`, `Enter`,
   `Espaço` e setas. Foco sempre visível, ordem seguindo a ordem visual, nenhuma
   armadilha.
6. **Movimento reduzido.** Ligar a preferência no sistema e confirmar que toda
   animação para.
7. **Registro.** Toda divergência encontrada e sua resolução entram em
   `docs/DECISOES.md`. Divergência resolvida "corrigindo o design" precisa de
   justificativa explícita e da concordância do humano.

---

## 11. Proibições

Estas valem mesmo quando parecem uma boa ideia, e especialmente quando parecem
uma boa ideia.

- **Improvisar valor ausente.** Se o design não define, você não define. Pergunta.
- **Melhorar o design.** Você não é o designer aqui. Se algo parece errado,
  reporte com o motivo; não corrija em silêncio.
- **Aproximar.** `#1B1D22` não é "praticamente igual" a `#1A1A1A`. Extração é
  literal.
- **Trazer default.** Escala do Tailwind, sombra do Material, raio do shadcn,
  paleta de outro projeto. Nada disso entra.
- **Valor cru em componente.** Sempre token. Sem exceção para "esse caso é
  único".
- **Reimplementar comportamento sem ler `support.js`.** Comportamento que altera
  estilo é design.
- **Marcar `PREENCHER` como resolvido sem extração.** Preencher a tabela com
  valor plausível é a pior falha possível neste documento, porque destrói
  silenciosamente a única coisa que ele existe para garantir.

---

## 12. O que fazer agora

Este documento está incompleto por construção. Para completá-lo:

1. Colocar `Mirante.dc.html` e `support.js` em `design/`.
2. Executar o procedimento da seção 2.
3. Substituir todo `PREENCHER` por valor extraído.
4. Remover o banner de status do topo deste arquivo.
5. Só então desbloquear as Ondas 6, 7 e 9.
