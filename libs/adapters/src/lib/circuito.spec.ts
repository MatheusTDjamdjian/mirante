import {
  Circuito,
  CONFIGURACAO_CIRCUITO_PADRAO,
  ConfiguracaoCircuitoInvalidaError,
  lerRetryAfter,
  type ConfiguracaoCircuito,
} from './circuito';

const INICIO = new Date('2026-08-06T14:00:00.000Z');

/** Relogio controlado: o teste avanca o tempo, nao espera por ele. */
function relogio(inicio = INICIO) {
  let atual = inicio;
  return {
    agora: () => atual,
    avancarMs: (ms: number) => {
      atual = new Date(atual.getTime() + ms);
    },
  };
}

const SEM_JITTER: ConfiguracaoCircuito = {
  ...CONFIGURACAO_CIRCUITO_PADRAO,
  jitter: 0,
};

function circuito(
  configuracao: ConfiguracaoCircuito = SEM_JITTER,
  aleatorio = () => 0.5,
) {
  const tempo = relogio();
  const c = new Circuito('teste', configuracao, {
    agora: tempo.agora,
    aleatorio,
  });
  return { c, tempo };
}

describe('Circuito — estado inicial', () => {
  it('starts closed and allows traffic', () => {
    const { c } = circuito();
    expect(c.situacao()).toBe('fechado');
    expect(c.permitido()).toBe(true);
    expect(c.tentarApos()).toBeNull();
  });
});

describe('Circuito — falhas comuns', () => {
  it('stays closed below the threshold', () => {
    const { c } = circuito();
    c.registrarFalha();
    c.registrarFalha();
    expect(c.situacao()).toBe('fechado');
    expect(c.permitido()).toBe(true);
  });

  it('opens exactly at the threshold', () => {
    const { c } = circuito();
    c.registrarFalha();
    c.registrarFalha();
    c.registrarFalha();
    expect(c.situacao()).toBe('aberto');
    expect(c.permitido()).toBe(false);
  });

  it('resets the streak on success', () => {
    const { c } = circuito();
    c.registrarFalha();
    c.registrarFalha();
    c.registrarSucesso();
    c.registrarFalha();
    c.registrarFalha();
    expect(c.situacao()).toBe('fechado');
  });

  it('reports when it is worth trying again', () => {
    const { c } = circuito();
    for (let i = 0; i < 3; i += 1) c.registrarFalha();
    expect(c.tentarApos()?.toISOString()).toBe('2026-08-06T14:00:30.000Z');
  });
});

describe('Circuito — meio-aberto', () => {
  it('becomes half-open once the wait elapses', () => {
    const { c, tempo } = circuito();
    for (let i = 0; i < 3; i += 1) c.registrarFalha();
    expect(c.situacao()).toBe('aberto');

    tempo.avancarMs(30_000);
    expect(c.situacao()).toBe('meio-aberto');
    expect(c.permitido()).toBe(true);
    expect(c.tentarApos()).toBeNull();
  });

  it('closes when the probe succeeds', () => {
    const { c, tempo } = circuito();
    for (let i = 0; i < 3; i += 1) c.registrarFalha();
    tempo.avancarMs(30_000);
    c.registrarSucesso();
    expect(c.situacao()).toBe('fechado');
  });

  it('reopens immediately when the probe fails, without recounting', () => {
    const { c, tempo } = circuito();
    for (let i = 0; i < 3; i += 1) c.registrarFalha();
    tempo.avancarMs(30_000);
    expect(c.situacao()).toBe('meio-aberto');

    // Uma falha basta: a sondagem ja era a evidencia que faltava.
    c.registrarFalha();
    expect(c.situacao()).toBe('aberto');
  });

  it('backs off exponentially on each reopening', () => {
    const { c, tempo } = circuito();
    for (let i = 0; i < 3; i += 1) c.registrarFalha();
    // 1a abertura: 30s
    expect(c.tentarApos()?.toISOString()).toBe('2026-08-06T14:00:30.000Z');

    tempo.avancarMs(30_000);
    c.registrarFalha();
    // 2a abertura: 60s a partir de 14:00:30
    expect(c.tentarApos()?.toISOString()).toBe('2026-08-06T14:01:30.000Z');

    tempo.avancarMs(60_000);
    c.registrarFalha();
    // 3a abertura: 120s a partir de 14:01:30
    expect(c.tentarApos()?.toISOString()).toBe('2026-08-06T14:03:30.000Z');
  });

  it('caps the wait at the configured maximum', () => {
    const { c, tempo } = circuito({
      falhasParaAbrir: 1,
      esperaBaseMs: 1_000,
      esperaMaximaMs: 4_000,
      jitter: 0,
    });

    let ultima = 0;
    for (let i = 0; i < 8; i += 1) {
      c.registrarFalha();
      const espera = (c.tentarApos()?.getTime() ?? 0) - tempo.agora().getTime();
      ultima = espera;
      tempo.avancarMs(espera);
    }
    expect(ultima).toBe(4_000);
  });
});

describe('Circuito — limite de taxa', () => {
  it('opens on the first 429, without counting failures', () => {
    const { c } = circuito();
    c.registrarLimiteDeTaxa(new Date('2026-08-06T14:05:00.000Z'));
    expect(c.situacao()).toBe('aberto');
    expect(c.tentarApos()?.toISOString()).toBe('2026-08-06T14:05:00.000Z');
  });

  it('uses exactly the Retry-After the source gave, with no jitter', () => {
    // Com jitter ligado: a espera do 429 continua exata. Negociar o prazo que a
    // fonte pediu e o caminho para o bloqueio permanente.
    const { c } = circuito(CONFIGURACAO_CIRCUITO_PADRAO, () => 0.99);
    c.registrarLimiteDeTaxa(new Date('2026-08-06T14:05:00.000Z'));
    expect(c.tentarApos()?.toISOString()).toBe('2026-08-06T14:05:00.000Z');
  });

  it('falls back to its own backoff when Retry-After is absent', () => {
    const { c } = circuito();
    c.registrarLimiteDeTaxa(null);
    expect(c.situacao()).toBe('aberto');
    expect(c.tentarApos()?.toISOString()).toBe('2026-08-06T14:00:30.000Z');
  });

  it('does not go back in time when Retry-After is already past', () => {
    const { c } = circuito();
    c.registrarLimiteDeTaxa(new Date('2026-08-06T13:00:00.000Z'));
    // Espera negativa vira zero: ja pode tentar, e nao "podia uma hora atras".
    expect(c.tentarApos()).toBeNull();
    expect(c.situacao()).toBe('meio-aberto');
  });
});

describe('Circuito — jitter', () => {
  it('keeps the wait inside the configured amplitude', () => {
    for (const sorteio of [0, 0.5, 1]) {
      const { c, tempo } = circuito(
        { ...CONFIGURACAO_CIRCUITO_PADRAO, jitter: 0.2 },
        () => sorteio,
      );
      for (let i = 0; i < 3; i += 1) c.registrarFalha();
      const espera = (c.tentarApos()?.getTime() ?? 0) - tempo.agora().getTime();
      // 30s +- 20%
      expect(espera).toBeGreaterThanOrEqual(24_000);
      expect(espera).toBeLessThanOrEqual(36_000);
    }
  });

  it('produces different waits for different draws', () => {
    const esperas = [0.1, 0.9].map((sorteio) => {
      const { c, tempo } = circuito(
        { ...CONFIGURACAO_CIRCUITO_PADRAO, jitter: 0.2 },
        () => sorteio,
      );
      for (let i = 0; i < 3; i += 1) c.registrarFalha();
      return (c.tentarApos()?.getTime() ?? 0) - tempo.agora().getTime();
    });
    expect(esperas[0]).not.toBe(esperas[1]);
  });

  it('always leaves the circuit actually open for some time', () => {
    // Com o pior sorteio possivel e o jitter maximo valido, a espera encolhe mas
    // nao chega a zero — ou seja, o breaker nunca abre e fecha no mesmo instante.
    const { c, tempo } = circuito(
      { ...CONFIGURACAO_CIRCUITO_PADRAO, jitter: 0.99 },
      () => 0,
    );
    for (let i = 0; i < 3; i += 1) c.registrarFalha();
    expect(c.situacao()).toBe('aberto');
    const espera = (c.tentarApos()?.getTime() ?? 0) - tempo.agora().getTime();
    expect(espera).toBeGreaterThan(0);
  });
});

describe('Circuito — configuracao invalida', () => {
  // Lanca no construtor de proposito: breaker desarmado em producao e pior que
  // worker que nao sobe.
  it.each([
    ['falhasParaAbrir zero', { falhasParaAbrir: 0 }],
    ['falhasParaAbrir fracionario', { falhasParaAbrir: 1.5 }],
    ['esperaBaseMs zero', { esperaBaseMs: 0 }],
    ['esperaMaxima menor que a base', { esperaMaximaMs: 1 }],
    ['jitter negativo', { jitter: -0.1 }],
    ['jitter igual a 1', { jitter: 1 }],
    ['jitter absurdo', { jitter: 5 }],
  ])('rejects %s', (_rotulo, sobrescrita) => {
    expect(
      () =>
        new Circuito('teste', {
          ...CONFIGURACAO_CIRCUITO_PADRAO,
          ...sobrescrita,
        }),
    ).toThrow(ConfiguracaoCircuitoInvalidaError);
  });

  it('accepts the shipped default', () => {
    expect(() => new Circuito('teste')).not.toThrow();
  });
});

describe('lerRetryAfter', () => {
  it('reads a delay in seconds', () => {
    expect(lerRetryAfter('120', INICIO)?.toISOString()).toBe(
      '2026-08-06T14:02:00.000Z',
    );
  });

  it('reads zero seconds', () => {
    expect(lerRetryAfter('0', INICIO)?.toISOString()).toBe(
      '2026-08-06T14:00:00.000Z',
    );
  });

  it('reads an HTTP date', () => {
    expect(
      lerRetryAfter('Thu, 06 Aug 2026 14:05:00 GMT', INICIO)?.toISOString(),
    ).toBe('2026-08-06T14:05:00.000Z');
  });

  it('tolerates surrounding whitespace', () => {
    expect(lerRetryAfter('  90  ', INICIO)?.toISOString()).toBe(
      '2026-08-06T14:01:30.000Z',
    );
  });

  it('returns null for absent, empty or nonsense', () => {
    expect(lerRetryAfter(null, INICIO)).toBeNull();
    expect(lerRetryAfter('', INICIO)).toBeNull();
    expect(lerRetryAfter('   ', INICIO)).toBeNull();
    expect(lerRetryAfter('logo', INICIO)).toBeNull();
    expect(lerRetryAfter('-30', INICIO)).toBeNull();
  });
});
