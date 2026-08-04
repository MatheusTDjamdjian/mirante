# METRICAS.md — Números antes e depois

> **Status: vazio por construção.** Recebe conteúdo a partir da Onda 3. Nenhuma
> otimização entra no projeto sem o número antes e o número depois nesta página.
> Mudança sem número não é mudança, é palpite.

## Índice de seções previstas

| Seção                             | Onda  | Conteúdo                                              |
| --------------------------------- | ----- | ----------------------------------------------------- |
| Ciclo de coleta                   | 3     | Duração total do ciclo de todas as fontes (teto 90 s) |
| Varredura de limiar de clustering | 4     | F1 de `0.78` a `0.92`, valor escolhido e motivo       |
| Precisão e recall do clustering   | 4     | Contra `fixtures/corpus-rotulado/`                    |
| Custo de embedding                | 4     | Itens por segundo e memória do worker                 |
| Query do feed                     | 5     | `EXPLAIN ANALYZE` e latência com 10.000 clusters      |
| Bundle inicial                    | 6     | Relatório do analisador, teto 250 KB gzip             |
| LCP, INP, CLS                     | 6 e 9 | Medidos, não estimados                                |
| Custo de enriquecimento           | 8     | Por cluster, sem cache, com cache, taxa de acerto     |

## Medições

_(sem linhas — Onda 3)_
