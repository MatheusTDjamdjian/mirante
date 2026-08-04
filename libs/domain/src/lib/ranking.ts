// Funcao de ranking. CONTEXTO.md secao 6:
//
//   score = max(peso_base das fontes do cluster)
//         x log2(1 + veiculos_distintos)
//         x exp(-dt_horas / TAU)
//         x (1 + BOOST_WATCHLIST x casou_com_watchlist)
//
// Esta e a unica implementacao da formula no projeto. O back-end recalcula o
// score a cada ciclo chamando esta funcao (Onda 5) e o painel de explicacao
// (`/clusters/:id/explicacao`) devolve os componentes que ela produz. Duplicar a
// formula em SQL para "ir mais rapido" quebraria a promessa de que o painel
// explica o numero que esta no banco.

import type { Cluster } from './tipos';

/** Horas. Meia-vida efetiva do interesse por um fato. */
export const TAU_PADRAO = 18;

/** Quanto um fato que casa com a watchlist sobe. */
export const BOOST_WATCHLIST_PADRAO = 0.6;

/**
 * De qual timestamp o decaimento conta.
 *
 * `ultimo_visto_em` — um fato ainda sendo coberto continua fresco.
 * `primeiro_visto_em` — a idade do fato, independente de cobertura nova.
 *
 * O CONTEXTO.md nao especifica qual. O default e `ultimo_visto_em`, porque a
 * pergunta que a tela responde e "o que esta mexendo agora", e um fato que
 * segue rendendo materia esta mexendo agora. **Decisao pendente de confirmacao
 * humana** — ver docs/DECISOES.md.
 */
export type AncoraTemporal = 'ultimo_visto_em' | 'primeiro_visto_em';

export interface ConfiguracaoRanking {
  readonly tau: number;
  readonly boostWatchlist: number;
  readonly ancoraTemporal: AncoraTemporal;
}

export const CONFIGURACAO_RANKING_PADRAO: ConfiguracaoRanking = {
  tau: TAU_PADRAO,
  boostWatchlist: BOOST_WATCHLIST_PADRAO,
  ancoraTemporal: 'ultimo_visto_em',
};

/**
 * Entrada do ranking.
 *
 * Nao e a linha `cluster` crua: `peso_base` mora em `fonte`, e o casamento com a
 * watchlist depende do cliente. Quem chama junta as tres coisas.
 */
export interface ClusterParaRanking extends Pick<
  Cluster,
  'veiculos_distintos' | 'primeiro_visto_em' | 'ultimo_visto_em'
> {
  /** Maior `peso_base` entre as fontes dos itens do cluster. 0..1. */
  readonly pesoBaseMaximo: number;
  readonly casouComWatchlist: boolean;
}

/** Componentes do score, na ordem da formula. O produto dos quatro e o score. */
export interface ExplicacaoDeScore {
  readonly pesoDaFonte: number;
  readonly fatorVeiculos: number;
  readonly fatorTemporal: number;
  readonly fatorWatchlist: number;
  readonly score: number;
  /** Idade usada no decaimento, em horas. Ja com o piso em zero aplicado. */
  readonly idadeHoras: number;
  readonly ancoraTemporal: AncoraTemporal;
}

const MILISSEGUNDOS_POR_HORA = 3_600_000;

function idadeEmHoras(
  cluster: ClusterParaRanking,
  agora: Date,
  ancora: AncoraTemporal,
): number {
  const referencia =
    ancora === 'ultimo_visto_em'
      ? cluster.ultimo_visto_em
      : cluster.primeiro_visto_em;

  const bruta =
    (agora.getTime() - referencia.getTime()) / MILISSEGUNDOS_POR_HORA;

  // Piso em zero. Feed publica data no futuro por erro de fuso com frequencia
  // desconfortavel; sem o piso, `exp(-dt/TAU)` com dt negativo passa de 1 e
  // premia justamente o item com metadado errado.
  return bruta < 0 ? 0 : bruta;
}

/**
 * Calcula o score e devolve seus componentes.
 *
 * Uma funcao so, devolvendo tudo, de proposito: o endpoint de explicacao precisa
 * dos componentes, e o ciclo de coleta precisa do produto. Se fossem duas
 * funcoes, elas divergiriam.
 */
export function explicarScore(
  cluster: ClusterParaRanking,
  agora: Date,
  configuracao: ConfiguracaoRanking = CONFIGURACAO_RANKING_PADRAO,
): ExplicacaoDeScore {
  const idadeHoras = idadeEmHoras(cluster, agora, configuracao.ancoraTemporal);

  const pesoDaFonte = cluster.pesoBaseMaximo;
  // log2(1 + n): 1 veiculo da fator 1, e cada dobra de veiculos soma 1. Cresce
  // sempre, mas com retorno decrescente — o vigesimo veiculo diz menos que o
  // segundo.
  const fatorVeiculos = Math.log2(1 + cluster.veiculos_distintos);
  const fatorTemporal = Math.exp(-idadeHoras / configuracao.tau);
  const fatorWatchlist =
    1 + configuracao.boostWatchlist * (cluster.casouComWatchlist ? 1 : 0);

  return {
    pesoDaFonte,
    fatorVeiculos,
    fatorTemporal,
    fatorWatchlist,
    score: pesoDaFonte * fatorVeiculos * fatorTemporal * fatorWatchlist,
    idadeHoras,
    ancoraTemporal: configuracao.ancoraTemporal,
  };
}

/** Atalho para quando so o numero interessa. */
export function calcularScore(
  cluster: ClusterParaRanking,
  agora: Date,
  configuracao: ConfiguracaoRanking = CONFIGURACAO_RANKING_PADRAO,
): number {
  return explicarScore(cluster, agora, configuracao).score;
}
