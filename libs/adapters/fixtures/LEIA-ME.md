# Fixtures dos adaptadores

Procedência de cada arquivo, porque fixture sem procedência é palpite com cara de
evidência.

## Respostas reais, capturadas da fonte

| Arquivo                        | Origem                                                  | Capturada em | Tratamento                                          |
| ------------------------------ | ------------------------------------------------------- | ------------ | --------------------------------------------------- |
| `infomoney-com-itens.xml`      | `https://www.infomoney.com.br/feed/`                    | 2026-08-06   | `<description>` e `<content:encoded>` **redigidos** |
| `infomoney-mercados-vazio.xml` | `https://www.infomoney.com.br/mercados/feed/`           | 2026-08-06   | `<description>` redigida                            |
| `gdelt-429.txt`                | corpo do `429` de `api.gdeltproject.org/api/v2/doc/doc` | 2026-08-07   | nenhum                                              |

**Por que a redação.** O feed do InfoMoney entrega o corpo integral da matéria em
`<content:encoded>` — 195 KB dos 205 KB da resposta. Este repositório é público, e
o `CONTEXTO.md` seção 3 proíbe persistir corpo de matéria. A estrutura fica
intacta (CDATA, entidades, atributos, `<category>`), então a fixture continua
exercendo todo quirk de formato; só o texto do resumo e do corpo sai.

`infomoney-mercados-vazio.xml` guarda a evidência de que o endpoint documentado no
`CONTEXTO.md` seção 2 devolve `200` com envelope válido e **zero itens** — ver
ADR-019.

## Escritas à mão

| Arquivo          | Para que serve                                                |
| ---------------- | ------------------------------------------------------------- |
| `malformado.xml` | XML que começa válido, tem tag não fechada e termina truncado |

## Reconstruída a partir de campos verificados

| Arquivo                     | Situação                      |
| --------------------------- | ----------------------------- |
| `gdelt-artlist-valido.json` | **Não é captura.** Ver abaixo |

A resposta do GDELT foi consultada com sucesso uma vez, em 2026-08-07, e os campos
e formatos foram registrados: `url`, `url_mobile`, `title`, `seendate`,
`socialimage`, `domain`, `language`, `sourcecountry`; `seendate` no formato
compacto `20260807T181500Z`; `language` por extenso (`English`, `Spanish`,
`Chinese`, `Russian`, `Korean`).

O arquivo **não foi salvo naquele momento**, e as tentativas seguintes falharam:
uma rajada de cinco requisições minhas derrubou o acesso por rede
(`UND_ERR_CONNECT_TIMEOUT`), e ele não voltou dentro da onda.

A fixture reproduz a forma verificada com conteúdo construído. Ela testa o
adaptador corretamente — parsing de `seendate`, mapeamento de idioma, descarte de
item torto — mas **não** substitui uma captura real, e por isso está marcada aqui.
Trocar por captura real assim que o acesso voltar é item aberto do relatório da
Onda 3.
