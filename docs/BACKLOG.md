# BACKLOG.md — Fora do escopo da onda atual

> Anotação de coisa identificada como importante e que **não** entra agora,
> porque pertence a outra onda ou a nenhuma. Registrar aqui é o que permite
> continuar sem inflar escopo.
>
> Item que está em "Fora de escopo permanente" do `PROMPT_ONDAS.md` não entra
> nem aqui: autenticação, alerta por e-mail ou push, app mobile, backtest,
> recomendação de compra ou venda, projeção de preço, social, tradução da
> interface, white-label, painel administrativo além da saúde de fontes.

## Itens

### Onda 4 — SimHash com Hamming ≤ 3 alcança pouco em título curto

Medido na Onda 1, com shingle de 1 palavra, sobre títulos reais de 5 a 10 tokens
após `normalizarTitulo`:

| Par                                        | distância |
| ------------------------------------------ | --------- |
| difere só em stopword, acento ou pontuação | 0         |
| título de 10 tokens com 1 palavra a mais   | 6         |
| título de 5 tokens com 1 palavra a mais    | 12        |
| 1 palavra significativa trocada            | 16        |
| mesma informação, ordem trocada            | 18        |
| fatos diferentes                           | 35        |

Com o limiar de 3, a camada de SimHash captura essencialmente o que a
normalização já tornou idêntico. Isso **não é defeito**: o `CONTEXTO.md` seção 5
posiciona SimHash como a camada barata para republicação de agência, e o
significado é trabalho do embedding. Mas vale checar na Onda 4, contra o corpus
rotulado, se um limiar mais frouxo (6 a 8) recupera duplicata real sem gerar
falso positivo, ou se a camada pode ser substituída por hash exato de
`titulo_normalizado` — que seria mais barato e mais preciso para o mesmo alcance.

Os números acima estão fixados como asserção em
`libs/domain/src/lib/simhash.spec.ts`, então qualquer mudança na normalização
aparece como teste vermelho antes de virar queda de precisão.

### Onda 5 — índice para a contagem de veículos distintos

`veiculos_distintos` conta `fonte.dominio` distinto (ADR-012), o que exige join
de `item` com `fonte`. O índice que sustenta essa query entra na Onda 5, junto
com o recálculo de score — não agora, porque a query ainda não existe
(`CLAUDE.md` seção 5).

### Onda 6 — `tools/*.mjs` fora do lint

Os scripts de `tools/` não pertencem a nenhum projeto Nx, então
`nx run-many -t lint` não os cobre. Fechar isso exige transformar `tools` em
projeto Nx ou criar um target de lint na raiz. Decisão adiada pelo humano na
Onda 0.
