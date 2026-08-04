import {
  normalizarTitulo,
  removerAcento,
  removerSufixoDeVeiculo,
  rotuloDoVeiculo,
} from './titulo';

describe('removerAcento', () => {
  it('keeps the letter and drops the diacritic', () => {
    expect(removerAcento('inflação')).toBe('inflacao');
    expect(removerAcento('câmbio')).toBe('cambio');
    expect(removerAcento('juros à vista')).toBe('juros a vista');
    expect(removerAcento('São Paulo')).toBe('Sao Paulo');
  });
});

describe('rotuloDoVeiculo', () => {
  it.each([
    ['infomoney.com.br', 'infomoney'],
    ['www.infomoney.com.br', 'infomoney'],
    ['br.investing.com', 'investing'],
    ['agenciabrasil.ebc.com.br', 'agenciabrasil'],
    ['agenciagov.ebc.com.br', 'agenciagov'],
    ['https://www.infomoney.com.br/mercados/feed', 'infomoney'],
    ['infomoney.com.br:8080', 'infomoney'],
  ])('derives %s -> %s', (dominio, esperado) => {
    expect(rotuloDoVeiculo(dominio)).toBe(esperado);
  });

  it('returns empty when nothing identifies the outlet', () => {
    expect(rotuloDoVeiculo('com.br')).toBe('');
  });
});

describe('removerSufixoDeVeiculo', () => {
  it('removes the suffix shown in CONTEXTO.md', () => {
    expect(
      removerSufixoDeVeiculo(
        'Copom mantém Selic em 15% - InfoMoney',
        'infomoney.com.br',
      ),
    ).toBe('Copom mantém Selic em 15%');
  });

  it('removes the pipe form', () => {
    expect(
      removerSufixoDeVeiculo(
        'Dólar fecha em queda | Investing.com',
        'br.investing.com',
      ),
    ).toBe('Dólar fecha em queda');
  });

  it('removes a chain of suffixes', () => {
    expect(
      removerSufixoDeVeiculo(
        'Copom mantém Selic - Mercados - InfoMoney',
        'infomoney.com.br',
      ),
    ).toBe('Copom mantém Selic - Mercados');
  });

  it('keeps a hyphen that is part of the headline', () => {
    expect(
      removerSufixoDeVeiculo('Copom - a decisão de hoje', 'infomoney.com.br'),
    ).toBe('Copom - a decisão de hoje');
  });

  it('does not remove another outlet name', () => {
    expect(
      removerSufixoDeVeiculo('Selic sobe - InfoMoney', 'br.investing.com'),
    ).toBe('Selic sobe - InfoMoney');
  });

  it('handles en dash and em dash', () => {
    expect(
      removerSufixoDeVeiculo('Selic sobe – InfoMoney', 'infomoney.com.br'),
    ).toBe('Selic sobe');
    expect(
      removerSufixoDeVeiculo('Selic sobe — InfoMoney', 'infomoney.com.br'),
    ).toBe('Selic sobe');
  });

  it('never empties the title by removing a leading separator', () => {
    expect(removerSufixoDeVeiculo(' - InfoMoney', 'infomoney.com.br')).toBe(
      '- InfoMoney',
    );
  });
});

describe('normalizarTitulo', () => {
  it('lowercases, strips accents, punctuation and stopwords', () => {
    expect(
      normalizarTitulo(
        'O Copom manteve a Selic em 15% ao ano - InfoMoney',
        'infomoney.com.br',
      ),
    ).toBe('copom manteve selic 15 ano');
  });

  it('collapses whitespace', () => {
    expect(normalizarTitulo('Selic    sobe\n\thoje', 'x.com')).toBe(
      'selic sobe hoje',
    );
  });

  it('keeps digits, because the number is the fact', () => {
    expect(normalizarTitulo('IPCA de 0,52% em julho', 'x.com')).toBe(
      'ipca 0 52 julho',
    );
  });

  it('keeps words that carry market signal', () => {
    const normalizado = normalizarTitulo(
      'Alta do dólar e queda da bolsa após corte de juros',
      'x.com',
    );
    for (const palavra of [
      'alta',
      'dolar',
      'queda',
      'bolsa',
      'corte',
      'juros',
    ]) {
      expect(normalizado.split(' ')).toContain(palavra);
    }
  });

  it('strips English stopwords too, for GDELT titles', () => {
    expect(
      normalizarTitulo('The central bank is expected to cut rates', 'x.com'),
    ).toBe('central bank expected cut rates');
  });

  // Casos de borda exigidos pelo aceite da Onda 1.
  it('returns an empty string for an empty title', () => {
    expect(normalizarTitulo('', 'infomoney.com.br')).toBe('');
    expect(normalizarTitulo('   ', 'infomoney.com.br')).toBe('');
  });

  it('returns an empty string for a title made only of stopwords', () => {
    expect(normalizarTitulo('o a de que para com', 'x.com')).toBe('');
    expect(normalizarTitulo('the a of and to for', 'x.com')).toBe('');
  });

  it('returns an empty string for a title made only of punctuation', () => {
    expect(normalizarTitulo('--- ... !!!', 'x.com')).toBe('');
  });

  it('is deterministic', () => {
    const titulo = 'Copom mantém Selic em 15% ao ano - InfoMoney';
    expect(normalizarTitulo(titulo, 'infomoney.com.br')).toBe(
      normalizarTitulo(titulo, 'infomoney.com.br'),
    );
  });

  it('converges for the same fact framed by two outlets', () => {
    const a = normalizarTitulo(
      'Copom mantém a Selic em 15% - InfoMoney',
      'infomoney.com.br',
    );
    const b = normalizarTitulo(
      'Copom mantém Selic em 15% | Investing.com',
      'br.investing.com',
    );
    expect(a).toBe(b);
  });
});
