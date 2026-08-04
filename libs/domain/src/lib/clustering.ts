// Decisao de clustering, pura.
//
// CONTEXTO.md secao 5: similaridade de cosseno contra os centroides dos clusters
// ativos das ultimas 24h, limiar `0.86` como ponto de partida a ser calibrado
// contra o corpus rotulado. Acima do limiar, entra no mais proximo. Abaixo, abre
// cluster novo.
//
// Esta funcao **nao** calcula embedding e **nao** consulta banco: recebe as
// similaridades ja calculadas. E isso que a torna testavel sem modelo e sem
// Postgres, e e por isso que a decisao de agrupamento pode ser avaliada contra o
// corpus da Onda 4 de forma reproduzivel.
//
// A janela de 24h e responsabilidade de quem monta a lista de candidatos: duas
// noticias semanticamente identicas separadas por tres semanas sao fatos
// diferentes, nao o mesmo fato. Ver `JANELA_DEDUP_HORAS` em simhash.ts.

import type { Uuid } from './tipos';

/** Limiar inicial do CONTEXTO.md secao 5. Calibrado na Onda 4, nao antes. */
export const LIMIAR_SIMILARIDADE_PADRAO = 0.86;

export interface ConfiguracaoClustering {
  /** Similaridade de cosseno minima para entrar num cluster existente. 0..1. */
  readonly limiarSimilaridade: number;
}

export const CONFIGURACAO_CLUSTERING_PADRAO: ConfiguracaoClustering = {
  limiarSimilaridade: LIMIAR_SIMILARIDADE_PADRAO,
};

/** Cluster ativo candidato, com a similaridade contra o item em questao. */
export interface CandidatoDeCluster {
  readonly clusterId: Uuid;
  /** Cosseno entre o embedding do item e o centroide do cluster. */
  readonly similaridade: number;
}

export type DecisaoDeCluster =
  | {
      readonly tipo: 'entrar';
      readonly clusterId: Uuid;
      readonly similaridade: number;
    }
  | { readonly tipo: 'novo' };

/**
 * Decide se o item entra num cluster existente ou abre um novo.
 *
 * Escolhe o candidato de maior similaridade acima do limiar. Empate exato e
 * resolvido pelo menor `clusterId` em ordem lexicografica — nao por acaso: a
 * avaliacao da Onda 4 tem de dar o mesmo resultado a cada execucao, e ordem de
 * chegada de candidato nao e estavel quando vem do banco sem `ORDER BY`.
 *
 * Candidato com similaridade nao finita e descartado. Vetor degenerado (norma
 * zero) produz `NaN` no cosseno, e `NaN > limiar` e falso — ou seja, sem o
 * descarte explicito o item cairia em "novo" por acidente e nao por decisao.
 */
export function decidirCluster(
  candidatos: readonly CandidatoDeCluster[],
  configuracao: ConfiguracaoClustering = CONFIGURACAO_CLUSTERING_PADRAO,
): DecisaoDeCluster {
  let melhor: CandidatoDeCluster | undefined;

  for (const candidato of candidatos) {
    if (!Number.isFinite(candidato.similaridade)) continue;
    if (candidato.similaridade < configuracao.limiarSimilaridade) continue;

    if (melhor === undefined) {
      melhor = candidato;
      continue;
    }

    if (candidato.similaridade > melhor.similaridade) {
      melhor = candidato;
      continue;
    }

    if (
      candidato.similaridade === melhor.similaridade &&
      candidato.clusterId < melhor.clusterId
    ) {
      melhor = candidato;
    }
  }

  if (melhor === undefined) return { tipo: 'novo' };

  return {
    tipo: 'entrar',
    clusterId: melhor.clusterId,
    similaridade: melhor.similaridade,
  };
}

/**
 * Atualiza o centroide de um cluster de forma incremental.
 *
 * CONTEXTO.md secao 5: "o centroide e atualizado incrementalmente". Media movel
 * sobre os embeddings dos membros — com `quantidadeAnterior` membros no
 * centroide atual, o novo centroide e a media ponderada com o item que entrou.
 *
 * Incremental e nao recalculado do zero porque recalcular exigiria reler todos os
 * embeddings do cluster a cada item novo, e o ciclo de coleta tem teto de 90s.
 */
export function atualizarCentroide(
  centroideAtual: readonly number[],
  quantidadeAnterior: number,
  embeddingNovo: readonly number[],
): readonly number[] {
  if (centroideAtual.length !== embeddingNovo.length) {
    throw new Error(
      `Dimensao incompativel: centroide tem ${centroideAtual.length}, embedding tem ${embeddingNovo.length}.`,
    );
  }
  if (quantidadeAnterior < 1) {
    throw new Error(
      `quantidadeAnterior deve ser >= 1, recebido ${quantidadeAnterior}.`,
    );
  }

  const total = quantidadeAnterior + 1;
  const novo = new Array<number>(centroideAtual.length);

  for (let i = 0; i < centroideAtual.length; i += 1) {
    const anterior = centroideAtual[i] ?? 0;
    const entrando = embeddingNovo[i] ?? 0;
    novo[i] = (anterior * quantidadeAnterior + entrando) / total;
  }

  return novo;
}

/**
 * Similaridade de cosseno entre dois vetores.
 *
 * Existe aqui para o script de avaliacao da Onda 4 poder rodar o pipeline inteiro
 * sem Postgres. Em producao o calculo e do `pgvector`, com indice HNSW — os dois
 * precisam concordar, e o teste compara os dois na Onda 4.
 *
 * Devolve `NaN` quando um dos vetores tem norma zero. Nao mascara com 0: norma
 * zero e dado ruim, e `decidirCluster` descarta nao-finito de forma explicita.
 */
export function similaridadeCosseno(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length) {
    throw new Error(`Dimensao incompativel: ${a.length} e ${b.length}.`);
  }

  let produto = 0;
  let normaA = 0;
  let normaB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    produto += va * vb;
    normaA += va * va;
    normaB += vb * vb;
  }

  if (normaA === 0 || normaB === 0) return Number.NaN;

  return produto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}
