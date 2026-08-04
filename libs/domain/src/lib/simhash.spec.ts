import {
  CONFIGURACAO_SIMHASH_PADRAO,
  DISTANCIA_HAMMING_MAXIMA,
  distanciaHamming,
  paraBigintAssinado,
  paraSimhashSemSinal,
  simhash,
} from './simhash';
import { normalizarTitulo } from './titulo';

const MAIOR_INT64_ASSINADO = 2n ** 63n - 1n;

describe('simhash', () => {
  it('is deterministic', () => {
    const texto = 'copom mantem selic 15 ano';
    expect(simhash(texto)).toBe(simhash(texto));
  });

  it('produces a value that fits in 64 bits', () => {
    const h = simhash('copom mantem selic 15 ano');
    expect(h).toBeGreaterThanOrEqual(0n);
    expect(h).toBeLessThan(2n ** 64n);
  });

  it('returns 0n for empty text', () => {
    expect(simhash('')).toBe(0n);
    expect(simhash('   ')).toBe(0n);
  });

  it('weights a repeated word more heavily than a competing one', () => {
    // Com uma unica feature, repetir nao muda nada: o sinal de cada bit e o
    // mesmo com peso 1 ou 3. A repeticao pesa quando ha outra feature para
    // superar — e e nesse caso que ela precisa importar.
    expect(simhash('selic')).toBe(simhash('selic selic selic'));
    expect(simhash('selic dolar')).not.toBe(simhash('selic selic selic dolar'));
  });

  it('does not lose a text shorter than the shingle window', () => {
    const h = simhash('selic', { tamanhoShingle: 3 });
    expect(h).not.toBe(0n);
  });

  it('defaults to single-word shingles', () => {
    expect(CONFIGURACAO_SIMHASH_PADRAO.tamanhoShingle).toBe(1);
  });
});

describe('distanciaHamming', () => {
  it('is zero for identical hashes', () => {
    expect(distanciaHamming(0n, 0n)).toBe(0);
    expect(distanciaHamming(123456789n, 123456789n)).toBe(0);
  });

  it('counts a single differing bit', () => {
    expect(distanciaHamming(0n, 1n)).toBe(1);
    expect(distanciaHamming(0n, 1n << 63n)).toBe(1);
  });

  it('counts all 64 bits', () => {
    expect(distanciaHamming(0n, 2n ** 64n - 1n)).toBe(64);
  });

  it('is symmetric', () => {
    const a = simhash('copom mantem selic');
    const b = simhash('dolar fecha queda');
    expect(distanciaHamming(a, b)).toBe(distanciaHamming(b, a));
  });

  it('is unchanged by the signed conversion Postgres requires', () => {
    const a = simhash('copom mantem selic 15 ano');
    const b = simhash('copom mantem selic 15 ano novamente');
    expect(distanciaHamming(paraBigintAssinado(a), paraBigintAssinado(b))).toBe(
      distanciaHamming(a, b),
    );
  });
});

describe('conversao para bigint do Postgres', () => {
  it('brings a value above 2^63-1 into the signed range', () => {
    const semSinal = 2n ** 64n - 1n;
    const assinado = paraBigintAssinado(semSinal);
    expect(assinado).toBe(-1n);
    expect(assinado).toBeLessThanOrEqual(MAIOR_INT64_ASSINADO);
    expect(assinado).toBeGreaterThanOrEqual(-(2n ** 63n));
  });

  it('round-trips', () => {
    for (const valor of [
      0n,
      1n,
      MAIOR_INT64_ASSINADO,
      2n ** 63n,
      2n ** 64n - 1n,
    ]) {
      expect(paraSimhashSemSinal(paraBigintAssinado(valor))).toBe(valor);
    }
  });

  it('keeps a value already inside the signed range untouched', () => {
    expect(paraBigintAssinado(42n)).toBe(42n);
  });
});

// ---------------------------------------------------------------------------
// Baseline medido na Onda 1.
//
// Estes numeros nao sao arbitrarios: foram medidos e fixados para que uma
// mudanca em `normalizarTitulo`, nas stopwords ou no tamanho do shingle apareca
// como teste vermelho, e nao como queda silenciosa de precisao do clustering na
// Onda 4.
//
// A leitura importante: com titulo curto, Hamming <= 3 alcanca praticamente so o
// que a normalizacao ja tornou identico. Isso e coerente com o CONTEXTO.md
// secao 5 — SimHash e a camada barata para republicacao de agencia, e o
// significado e trabalho do embedding. Recalibrar isto e da Onda 4, contra o
// corpus rotulado, com o numero antes e depois em docs/METRICAS.md.
// ---------------------------------------------------------------------------
describe('distancia entre titulos reais', () => {
  // Cada titulo e normalizado com o dominio da **sua** fonte: e o dominio que
  // localiza o sufixo do veiculo. Usar um dominio so para os dois deixa o sufixo
  // do outro dentro do texto e infla a distancia.
  const distanciaEntre = (
    a: readonly [titulo: string, dominio: string],
    b: readonly [titulo: string, dominio: string],
  ): number =>
    distanciaHamming(
      simhash(normalizarTitulo(a[0], a[1])),
      simhash(normalizarTitulo(b[0], b[1])),
    );

  const mesmoDominio = (a: string, b: string): number =>
    distanciaEntre([a, 'x.com'], [b, 'x.com']);

  // Criterio de aceite da Onda 1: dois textos quase identicos com distancia <= 3.
  it('is within the dedup threshold when two outlets frame a fact the same way', () => {
    const d = distanciaEntre(
      ['Copom mantém a Selic em 15% - InfoMoney', 'infomoney.com.br'],
      ['Copom mantem Selic em 15% | Investing.com', 'br.investing.com'],
    );
    expect(d).toBe(0);
    expect(d).toBeLessThanOrEqual(DISTANCIA_HAMMING_MAXIMA);
  });

  it('is within the threshold when only a stopword differs', () => {
    const d = mesmoDominio(
      'Copom mantém a Selic em 15%',
      'Copom mantém Selic em 15%',
    );
    expect(d).toBe(0);
    expect(d).toBeLessThanOrEqual(DISTANCIA_HAMMING_MAXIMA);
  });

  it('is within the threshold when only accents and punctuation differ', () => {
    const d = mesmoDominio(
      'Copom mantém Selic em 15%',
      'Copom mantem Selic em 15%!',
    );
    expect(d).toBe(0);
    expect(d).toBeLessThanOrEqual(DISTANCIA_HAMMING_MAXIMA);
  });

  it('is above the threshold for one extra significant word in a short title', () => {
    expect(
      mesmoDominio(
        'Copom mantém Selic em 15% ao ano',
        'Copom mantém Selic em 15% ao ano novamente',
      ),
    ).toBe(12);
  });

  it('is above the threshold for one swapped word', () => {
    expect(
      mesmoDominio(
        'Copom mantém Selic em 15% ao ano',
        'Copom manteve Selic em 15% ao ano',
      ),
    ).toBe(16);
  });

  it('is far apart for genuinely different facts', () => {
    const d = mesmoDominio(
      'Copom mantém Selic em 15% ao ano',
      'Dólar fecha em queda de 0,8% com exterior',
    );
    expect(d).toBe(35);
    expect(d).toBeGreaterThan(DISTANCIA_HAMMING_MAXIMA);
  });
});
