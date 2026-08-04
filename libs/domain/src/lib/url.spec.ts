import { canonicalizarUrl, hashUrl, UrlInvalidaError } from './url';

describe('canonicalizarUrl', () => {
  it('forces https', () => {
    expect(canonicalizarUrl('http://infomoney.com.br/mercados')).toBe(
      'https://infomoney.com.br/mercados',
    );
  });

  it('lowercases the host and drops www.', () => {
    expect(canonicalizarUrl('https://WWW.InfoMoney.com.BR/Mercados')).toBe(
      'https://infomoney.com.br/Mercados',
    );
  });

  it('drops a trailing dot in the host', () => {
    expect(canonicalizarUrl('https://infomoney.com.br./a')).toBe(
      'https://infomoney.com.br/a',
    );
  });

  it('keeps path casing, because path is case sensitive', () => {
    expect(canonicalizarUrl('https://x.com/Copom-Mantem-Selic')).toBe(
      'https://x.com/Copom-Mantem-Selic',
    );
  });

  it('strips the fragment', () => {
    expect(canonicalizarUrl('https://x.com/a#comentarios')).toBe(
      'https://x.com/a',
    );
  });

  it('strips embedded credentials', () => {
    expect(canonicalizarUrl('https://user:senha@x.com/a')).toBe(
      'https://x.com/a',
    );
  });

  it('drops the default https port and keeps a non-default one', () => {
    expect(canonicalizarUrl('https://x.com:443/a')).toBe('https://x.com/a');
    expect(canonicalizarUrl('https://x.com:8443/a')).toBe(
      'https://x.com:8443/a',
    );
  });

  it('strips the trailing slash except at the root', () => {
    expect(canonicalizarUrl('https://x.com/a/')).toBe('https://x.com/a');
    expect(canonicalizarUrl('https://x.com/')).toBe('https://x.com/');
    expect(canonicalizarUrl('https://x.com')).toBe('https://x.com/');
  });

  it('removes tracking parameters and keeps the meaningful ones', () => {
    expect(
      canonicalizarUrl(
        'https://x.com/a?utm_source=news&utm_medium=email&gclid=abc&fbclid=def&id=7',
      ),
    ).toBe('https://x.com/a?id=7');
  });

  it('removes tracking parameters case insensitively', () => {
    expect(canonicalizarUrl('https://x.com/a?UTM_Source=x&GCLID=y&p=1')).toBe(
      'https://x.com/a?p=1',
    );
  });

  it('drops the question mark when nothing survives', () => {
    expect(canonicalizarUrl('https://x.com/a?utm_source=x')).toBe(
      'https://x.com/a',
    );
  });

  it('is deterministic regardless of parameter order', () => {
    const umaOrdem = canonicalizarUrl('https://x.com/a?b=2&a=1&c=3');
    const outraOrdem = canonicalizarUrl('https://x.com/a?c=3&a=1&b=2');
    expect(umaOrdem).toBe(outraOrdem);
    expect(umaOrdem).toBe('https://x.com/a?a=1&b=2&c=3');
  });

  // Caso de borda exigido pelo aceite da Onda 1.
  it('collapses an exactly repeated parameter pair', () => {
    expect(canonicalizarUrl('https://x.com/a?id=7&id=7')).toBe(
      'https://x.com/a?id=7',
    );
  });

  it('keeps a repeated parameter with different values, sorted', () => {
    expect(canonicalizarUrl('https://x.com/a?id=9&id=7')).toBe(
      'https://x.com/a?id=7&id=9',
    );
  });

  it('is idempotent', () => {
    const uma = canonicalizarUrl(
      'http://WWW.x.com:443/a/?utm_source=z&b=1#frag',
    );
    expect(canonicalizarUrl(uma)).toBe(uma);
  });

  it('rejects an empty string', () => {
    expect(() => canonicalizarUrl('   ')).toThrow(UrlInvalidaError);
  });

  it('rejects a relative URL', () => {
    expect(() => canonicalizarUrl('/mercados/feed')).toThrow(UrlInvalidaError);
  });

  it('rejects a non-http protocol', () => {
    expect(() => canonicalizarUrl('ftp://x.com/a')).toThrow(UrlInvalidaError);
    expect(() => canonicalizarUrl('javascript:alert(1)')).toThrow(
      UrlInvalidaError,
    );
  });

  it('exposes the original URL on the error, for structured logging', () => {
    try {
      canonicalizarUrl('ftp://x.com/a');
      expect.unreachable('deveria ter lancado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(UrlInvalidaError);
      expect((erro as UrlInvalidaError).urlOriginal).toBe('ftp://x.com/a');
    }
  });
});

describe('hashUrl', () => {
  it('returns 64 lowercase hex characters', () => {
    expect(hashUrl('https://x.com/a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same hash for the raw and the canonical form', () => {
    const bruta = 'http://WWW.x.com/a/?utm_source=z#frag';
    expect(hashUrl(bruta)).toBe(hashUrl(canonicalizarUrl(bruta)));
  });

  it('gives different hashes for different URLs', () => {
    expect(hashUrl('https://x.com/a')).not.toBe(hashUrl('https://x.com/b'));
  });

  it('propagates UrlInvalidaError instead of hashing garbage', () => {
    expect(() => hashUrl('nao-e-url')).toThrow(UrlInvalidaError);
  });
});
