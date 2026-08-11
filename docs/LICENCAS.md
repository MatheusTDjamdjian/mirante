# LICENCAS.md — Matriz de licença por fonte

Regra de ouro do projeto, de `CONTEXTO.md` seção 3: o Mirante armazena e exibe
**metadado**, nunca conteúdo. `resumo_origem` jamais chega à interface.

Isso muda o que esta matriz precisa decidir. A pergunta não é "podemos republicar
esta matéria" — nunca podemos, e nunca quisemos. A pergunta é mais estreita:

- **armazenar** título, URL canônica, domínio, data, idioma, e o `resumo_origem`
  que o próprio feed entrega, para uso interno em embedding e clustering;
- **exibir** título representativo, nome do veículo, tempo relativo, e link de
  saída para a matéria original.

Nenhuma fonte abaixo é usada além disso, e é por isso que fonte de licença
indeterminada continua utilizável: a política mais restritiva do projeto já é a
política padrão dele.

## Como ler a coluna `licenca`

| Valor          | Significado                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `permissiva`   | Os termos autorizam reprodução, tipicamente com condição que o produto já cumpre |
| `restrita`     | Os termos proíbem ou limitam de forma que exige tratamento especial              |
| `desconhecida` | Não foi possível determinar. Tratada com a política mais restritiva              |

## Matriz

| Fonte                   | `licenca`      | Termos consultados                                                                                                                       | Data       |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Agência Brasil Economia | `permissiva`   | [ebc.com.br/termos-de-uso-e-condicoes-gerais-do-portal-da-ebc](https://www.ebc.com.br/termos-de-uso-e-condicoes-gerais-do-portal-da-ebc) | 2026-08-10 |
| Agência Gov             | `permissiva`   | mesmos termos da EBC, acima                                                                                                              | 2026-08-10 |
| InfoMoney               | `desconhecida` | não localizados — ver nota                                                                                                               | 2026-08-10 |
| Investing.com Ações     | `desconhecida` | inacessíveis — ver nota                                                                                                                  | 2026-08-10 |
| Investing.com Câmbio    | `desconhecida` | inacessíveis — ver nota                                                                                                                  | 2026-08-10 |
| Investing.com Macro     | `desconhecida` | inacessíveis — ver nota                                                                                                                  | 2026-08-10 |
| GDELT DOC 2.0           | `desconhecida` | não localizados — ver nota                                                                                                               | 2026-08-10 |

---

## EBC — Agência Brasil e Agência Gov

**`permissiva`**

Os Termos de Uso do Portal EBC trazem, na seção 1, item (e), a autorização
explícita: _"Reprodução autorizada mediante indicação da fonte."_

O mesmo documento reserva, na seção 4, a propriedade intelectual do Portal à EBC,
e o rodapé do site traz `© Todos os direitos reservados pela EBC`. Há tensão
entre a autorização e a reserva, e não sou a pessoa certa para resolvê-la — mas
ela não precisa ser resolvida para este produto:

- **permitido armazenar:** título, URL, domínio, data, idioma, `resumo_origem`;
- **permitido exibir:** título, veículo, tempo relativo, link de saída.

A condição da autorização é indicação da fonte, e o Mirante exibe o veículo em
todo card por decisão de arquitetura, não por conformidade. A condição está
satisfeita por construção.

Confirma a nota do `CONTEXTO.md` §2, que marcava a licença da Agência Brasil como
permissiva e pedia confirmação dos termos vigentes. Confirmado.

## InfoMoney

**`desconhecida`**

Não há página de termos de uso de conteúdo publicada nos caminhos verificados.
`infomoney.com.br/termos-de-uso/` **redireciona para a política de privacidade**,
que trata de dado pessoal e não de licença de conteúdo. A home não expõe link de
termos no HTML servido.

Consequência prática: nenhuma. O tratamento é o mais restritivo, que é o padrão do
produto — metadado, veículo visível, link de saída.

Um ponto específico desta fonte, medido e tratado: o feed entrega o **corpo
integral** da matéria em `<content:encoded>`, 195 KB dos 205 KB da resposta. O
esquema Zod do adaptador **não extrai o campo** (ADR-020), então o corpo não entra
em memória como dado de domínio, não é persistido e não alimenta embedding. Numa
fonte de licença indeterminada, ignorar o corpo não é escrúpulo — é o único
comportamento defensável.

## Investing.com

**`desconhecida`**

A home de `br.investing.com` responde **403** ao cliente do Mirante, e as páginas
de termos não foram alcançadas. Não troquei o user agent para contornar o
bloqueio: circundar a política de bot de uma fonte para ler os termos dela seria
contraditório.

O que existe é um sinal na direção oposta: a própria Investing.com publica uma
página de índice de feeds RSS em `br.investing.com/webmaster-tools/rss`,
descrevendo como consumi-los em leitores. Oferecer feed RSS num diretório para
webmasters é convite a sindicalizar. Isso **não** é licença, e não foi tratado
como tal — a fonte continua `desconhecida`.

Os feeds não entregam corpo de matéria (verificado: nenhum `content:encoded`),
então o que chega já é apenas metadado mais o resumo do próprio feed.

## GDELT DOC 2.0

**`desconhecida`**

A página `gdeltproject.org/about.html` tem uma seção intitulada "Terms of Use",
mas o texto dos termos não foi localizado ali nem em link a partir dela. O acesso
à API ficou indisponível durante a consulta (ver relatório da Onda 3), o que
impediu concluir a verificação.

Observação sobre a natureza da fonte, que não substitui os termos: o GDELT não
entrega corpo de matéria. O modo `ArtList` devolve `title`, `url`, `domain`,
`seendate`, `language` e `sourcecountry` — exatamente o conjunto que o
`CONTEXTO.md` §3 autoriza armazenar e exibir. O produto usa o GDELT como índice de
cobertura, e o link de saída aponta para o veículo original, não para o GDELT.

---

## Pendente

- **GDELT:** reconferir os termos quando o acesso voltar, e trocar para
  `permissiva` ou `restrita` conforme o que disserem.
- **InfoMoney e Investing.com:** decidir se vale contato direto pedindo
  autorização por escrito. É decisão do humano, e o produto funciona sem ela.
- Toda linha desta matriz tem data de consulta porque termos mudam. Reconferir
  antes de publicar (Onda 9).
