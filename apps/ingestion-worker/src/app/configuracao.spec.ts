import { ConfiguracaoInvalidaError, lerConfiguracao } from './configuracao';

const MINIMO = {
  DATABASE_URL: 'postgresql://u:s@localhost:5435/mirante',
  REDIS_URL: 'redis://localhost:6381',
};

describe('lerConfiguracao', () => {
  it('accepts the minimum set and applies defaults', () => {
    const c = lerConfiguracao(MINIMO);
    expect(c.INTERVALO_COLETA_MS).toBe(300_000);
    expect(c.TIMEOUT_FONTE_MS).toBe(10_000);
    expect(c.LOG_NIVEL).toBe('info');
    expect(c.NODE_ENV).toBe('development');
  });

  it('coerces numeric values that arrive as strings from the env', () => {
    const c = lerConfiguracao({ ...MINIMO, INTERVALO_COLETA_MS: '60000' });
    expect(c.INTERVALO_COLETA_MS).toBe(60_000);
    expect(typeof c.INTERVALO_COLETA_MS).toBe('number');
  });

  it('accepts postgres:// as well as postgresql://', () => {
    expect(() =>
      lerConfiguracao({ ...MINIMO, DATABASE_URL: 'postgres://u:s@h/db' }),
    ).not.toThrow();
  });

  it('accepts rediss:// for TLS', () => {
    expect(() =>
      lerConfiguracao({ ...MINIMO, REDIS_URL: 'rediss://h:6379' }),
    ).not.toThrow();
  });

  // O ponto de existir validacao de env: derrubar o boot com mensagem, em vez de
  // virar `undefined` que estoura no driver meia hora depois.
  it('rejects a missing DATABASE_URL', () => {
    expect(() => lerConfiguracao({ REDIS_URL: MINIMO.REDIS_URL })).toThrow(
      ConfiguracaoInvalidaError,
    );
  });

  it('rejects a missing REDIS_URL', () => {
    expect(() =>
      lerConfiguracao({ DATABASE_URL: MINIMO.DATABASE_URL }),
    ).toThrow(ConfiguracaoInvalidaError);
  });

  it('rejects a DATABASE_URL with the wrong scheme', () => {
    expect(() =>
      lerConfiguracao({ ...MINIMO, DATABASE_URL: 'mysql://u:s@h/db' }),
    ).toThrow(ConfiguracaoInvalidaError);
  });

  it('rejects a non-positive interval', () => {
    expect(() =>
      lerConfiguracao({ ...MINIMO, INTERVALO_COLETA_MS: '0' }),
    ).toThrow(ConfiguracaoInvalidaError);
    expect(() =>
      lerConfiguracao({ ...MINIMO, INTERVALO_COLETA_MS: '-1' }),
    ).toThrow(ConfiguracaoInvalidaError);
  });

  it('rejects a non-numeric interval', () => {
    expect(() =>
      lerConfiguracao({ ...MINIMO, INTERVALO_COLETA_MS: 'cinco minutos' }),
    ).toThrow(ConfiguracaoInvalidaError);
  });

  it('rejects an unknown log level', () => {
    expect(() => lerConfiguracao({ ...MINIMO, LOG_NIVEL: 'verboso' })).toThrow(
      ConfiguracaoInvalidaError,
    );
  });

  it('names every offending variable in the message', () => {
    try {
      lerConfiguracao({ LOG_NIVEL: 'verboso' });
      throw new Error('deveria ter lancado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(ConfiguracaoInvalidaError);
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain('DATABASE_URL');
      expect(mensagem).toContain('REDIS_URL');
      expect(mensagem).toContain('LOG_NIVEL');
      expect(mensagem).toContain('.env.example');
    }
  });

  it('never leaks the connection string into the error message', () => {
    try {
      lerConfiguracao({
        ...MINIMO,
        DATABASE_URL: 'mysql://usuario:senhasecreta@host/db',
      });
      throw new Error('deveria ter lancado');
    } catch (erro) {
      expect((erro as Error).message).not.toContain('senhasecreta');
    }
  });
});
