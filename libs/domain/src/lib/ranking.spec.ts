import {
  BOOST_WATCHLIST_PADRAO,
  CONFIGURACAO_RANKING_PADRAO,
  calcularScore,
  explicarScore,
  TAU_PADRAO,
  type ClusterParaRanking,
  type ConfiguracaoRanking,
} from './ranking';

const AGORA = new Date('2026-08-03T12:00:00.000Z');

function horasAtras(horas: number): Date {
  return new Date(AGORA.getTime() - horas * 3_600_000);
}

function cluster(
  sobrescrita: Partial<ClusterParaRanking> = {},
): ClusterParaRanking {
  return {
    pesoBaseMaximo: 0.8,
    veiculos_distintos: 3,
    primeiro_visto_em: horasAtras(6),
    ultimo_visto_em: horasAtras(2),
    casouComWatchlist: false,
    ...sobrescrita,
  };
}

describe('configuracao padrao', () => {
  it('matches CONTEXTO.md secao 6', () => {
    expect(TAU_PADRAO).toBe(18);
    expect(BOOST_WATCHLIST_PADRAO).toBe(0.6);
    expect(CONFIGURACAO_RANKING_PADRAO.ancoraTemporal).toBe('ultimo_visto_em');
  });
});

describe('explicarScore', () => {
  it('produces components whose product is exactly the score', () => {
    const e = explicarScore(cluster({ casouComWatchlist: true }), AGORA);
    expect(
      e.pesoDaFonte * e.fatorVeiculos * e.fatorTemporal * e.fatorWatchlist,
    ).toBe(e.score);
  });

  it('implements the formula literally', () => {
    const entrada = cluster({
      pesoBaseMaximo: 0.9,
      veiculos_distintos: 7,
      ultimo_visto_em: horasAtras(9),
      casouComWatchlist: true,
    });
    const esperado = 0.9 * Math.log2(1 + 7) * Math.exp(-9 / 18) * (1 + 0.6 * 1);
    expect(calcularScore(entrada, AGORA)).toBeCloseTo(esperado, 12);
  });

  it('gives a neutral vehicle factor for a single outlet', () => {
    // log2(1 + 1) = 1
    expect(
      explicarScore(cluster({ veiculos_distintos: 1 }), AGORA).fatorVeiculos,
    ).toBe(1);
  });

  it('gives a neutral time factor for a cluster seen right now', () => {
    expect(
      explicarScore(cluster({ ultimo_visto_em: AGORA }), AGORA).fatorTemporal,
    ).toBe(1);
  });

  it('gives a neutral watchlist factor when there is no match', () => {
    expect(
      explicarScore(cluster({ casouComWatchlist: false }), AGORA)
        .fatorWatchlist,
    ).toBe(1);
  });

  it('reports which timestamp anchored the decay', () => {
    const config: ConfiguracaoRanking = {
      ...CONFIGURACAO_RANKING_PADRAO,
      ancoraTemporal: 'primeiro_visto_em',
    };
    const e = explicarScore(cluster(), AGORA, config);
    expect(e.ancoraTemporal).toBe('primeiro_visto_em');
    expect(e.idadeHoras).toBeCloseTo(6, 9);
  });
});

// ---------------------------------------------------------------------------
// Monotonicidade — exigida explicitamente pelo aceite da Onda 1.
// ---------------------------------------------------------------------------
describe('monotonicidade do score', () => {
  it('increases with more distinct outlets', () => {
    const scores = [1, 2, 5, 12, 40].map((n) =>
      calcularScore(cluster({ veiculos_distintos: n }), AGORA),
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1] as number);
    }
  });

  it('decreases as the cluster gets older', () => {
    const scores = [0, 1, 6, 18, 48, 200].map((h) =>
      calcularScore(cluster({ ultimo_visto_em: horasAtras(h) }), AGORA),
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1] as number);
    }
  });

  it('increases when the cluster matches the watchlist', () => {
    const sem = calcularScore(cluster({ casouComWatchlist: false }), AGORA);
    const com = calcularScore(cluster({ casouComWatchlist: true }), AGORA);
    expect(com).toBeGreaterThan(sem);
    expect(com / sem).toBeCloseTo(1 + BOOST_WATCHLIST_PADRAO, 12);
  });

  it('increases with a more credible source', () => {
    const fraca = calcularScore(cluster({ pesoBaseMaximo: 0.3 }), AGORA);
    const forte = calcularScore(cluster({ pesoBaseMaximo: 0.9 }), AGORA);
    expect(forte).toBeGreaterThan(fraca);
  });
});

describe('configuracao injetada', () => {
  it('makes decay slower with a larger TAU', () => {
    const entrada = cluster({ ultimo_visto_em: horasAtras(24) });
    const rapido = calcularScore(entrada, AGORA, {
      ...CONFIGURACAO_RANKING_PADRAO,
      tau: 6,
    });
    const lento = calcularScore(entrada, AGORA, {
      ...CONFIGURACAO_RANKING_PADRAO,
      tau: 72,
    });
    expect(lento).toBeGreaterThan(rapido);
  });

  it('honours a watchlist boost of zero', () => {
    const config: ConfiguracaoRanking = {
      ...CONFIGURACAO_RANKING_PADRAO,
      boostWatchlist: 0,
    };
    expect(
      calcularScore(cluster({ casouComWatchlist: true }), AGORA, config),
    ).toBe(calcularScore(cluster({ casouComWatchlist: false }), AGORA, config));
  });

  it('is not a literal constant in the implementation', () => {
    // Se TAU estivesse embutido, mudar a configuracao nao mudaria nada.
    const entrada = cluster({ ultimo_visto_em: horasAtras(18) });
    expect(
      calcularScore(entrada, AGORA, { ...CONFIGURACAO_RANKING_PADRAO, tau: 1 }),
    ).not.toBe(calcularScore(entrada, AGORA));
  });
});

describe('casos degenerados', () => {
  it('floors a future timestamp at zero age instead of rewarding it', () => {
    const futuro = explicarScore(
      cluster({ ultimo_visto_em: new Date(AGORA.getTime() + 5 * 3_600_000) }),
      AGORA,
    );
    expect(futuro.idadeHoras).toBe(0);
    expect(futuro.fatorTemporal).toBe(1);
    // Sem o piso, exp(+5/18) daria fator > 1 e o item com data errada subiria.
    expect(futuro.fatorTemporal).toBeLessThanOrEqual(1);
  });

  it('scores zero when no outlet covered the fact', () => {
    // log2(1 + 0) = 0. Nao deveria acontecer, e se acontecer o item nao aparece.
    expect(calcularScore(cluster({ veiculos_distintos: 0 }), AGORA)).toBe(0);
  });

  it('scores zero for a source with zero weight', () => {
    expect(calcularScore(cluster({ pesoBaseMaximo: 0 }), AGORA)).toBe(0);
  });

  it('stays finite for a very old cluster', () => {
    const score = calcularScore(
      cluster({ ultimo_visto_em: horasAtras(24 * 365 * 10) }),
      AGORA,
    );
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
