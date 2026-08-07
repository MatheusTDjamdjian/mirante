// Circuit breaker por endpoint.
//
// CONTEXTO.md secao 2, sobre o GDELT: "responde 429 sem aviso e respeita
// Retry-After. O adaptador precisa de circuit breaker por endpoint, nao so
// retry." Retry cego contra uma fonte que esta pedindo pausa transforma um
// bloqueio temporario em bloqueio permanente.
//
// Relogio injetado de proposito: sem isso o teste dependeria de `setTimeout` e
// levaria segundos reais para provar comportamento que e pura aritmetica de
// tempo.

export type EstadoDoCircuito = 'fechado' | 'aberto' | 'meio-aberto';

export interface ConfiguracaoCircuito {
  /** Falhas consecutivas para abrir. */
  readonly falhasParaAbrir: number;
  /** Espera da primeira abertura, em ms. Dobra a cada reabertura. */
  readonly esperaBaseMs: number;
  /** Teto da espera, em ms. */
  readonly esperaMaximaMs: number;
  /** Fracao de jitter aplicada a espera calculada. 0 desliga. */
  readonly jitter: number;
}

export const CONFIGURACAO_CIRCUITO_PADRAO: ConfiguracaoCircuito = {
  falhasParaAbrir: 3,
  esperaBaseMs: 30_000,
  esperaMaximaMs: 15 * 60_000,
  jitter: 0.2,
};

export interface DependenciasCircuito {
  readonly agora: () => Date;
  /** 0..1. Injetavel para o teste ser determinista. */
  readonly aleatorio: () => number;
}

export class ConfiguracaoCircuitoInvalidaError extends Error {
  constructor(motivo: string) {
    super(`Configuracao de circuito invalida: ${motivo}`);
    this.name = 'ConfiguracaoCircuitoInvalidaError';
  }
}

/**
 * Valida a configuracao e lanca.
 *
 * Lanca em vez de corrigir de proposito, e no construtor em vez de na primeira
 * falha: `jitter` maior ou igual a 1 faz a espera colapsar em zero, e o circuito
 * para de abrir — o breaker continua ali, aparentemente configurado, sem proteger
 * nada. Um worker que nao sobe e um problema visivel; um breaker desarmado em
 * producao nao e.
 */
function validar(configuracao: ConfiguracaoCircuito): void {
  if (
    !Number.isInteger(configuracao.falhasParaAbrir) ||
    configuracao.falhasParaAbrir < 1
  ) {
    throw new ConfiguracaoCircuitoInvalidaError(
      `falhasParaAbrir deve ser inteiro >= 1, recebido ${configuracao.falhasParaAbrir}`,
    );
  }
  if (!(configuracao.esperaBaseMs > 0)) {
    throw new ConfiguracaoCircuitoInvalidaError(
      `esperaBaseMs deve ser > 0, recebido ${configuracao.esperaBaseMs}`,
    );
  }
  if (configuracao.esperaMaximaMs < configuracao.esperaBaseMs) {
    throw new ConfiguracaoCircuitoInvalidaError(
      `esperaMaximaMs (${configuracao.esperaMaximaMs}) menor que esperaBaseMs (${configuracao.esperaBaseMs})`,
    );
  }
  if (!(configuracao.jitter >= 0) || configuracao.jitter >= 1) {
    throw new ConfiguracaoCircuitoInvalidaError(
      `jitter deve estar em [0, 1), recebido ${configuracao.jitter}`,
    );
  }
}

export class Circuito {
  private estado: EstadoDoCircuito = 'fechado';
  private falhasConsecutivas = 0;
  private aberturas = 0;
  private abertoAte: Date | null = null;

  constructor(
    private readonly rotulo: string,
    private readonly configuracao: ConfiguracaoCircuito = CONFIGURACAO_CIRCUITO_PADRAO,
    private readonly dependencias: DependenciasCircuito = {
      agora: () => new Date(),
      aleatorio: () => Math.random(),
    },
  ) {
    validar(configuracao);
  }

  get nome(): string {
    return this.rotulo;
  }

  /**
   * Estado atual, ja considerando a passagem do tempo.
   *
   * Chamar isto e o que promove `aberto` para `meio-aberto` quando a espera
   * termina — nao existe temporizador rodando, o que mantem a classe sem efeito
   * colateral e sem handle para vazar.
   */
  situacao(): EstadoDoCircuito {
    if (this.estado === 'aberto' && this.abertoAte !== null) {
      if (this.dependencias.agora().getTime() >= this.abertoAte.getTime()) {
        this.estado = 'meio-aberto';
      }
    }
    return this.estado;
  }

  /** `false` quando o breaker esta aberto e a espera ainda nao venceu. */
  permitido(): boolean {
    return this.situacao() !== 'aberto';
  }

  /** Quando vale tentar de novo. `null` quando ja pode. */
  tentarApos(): Date | null {
    return this.situacao() === 'aberto' ? this.abertoAte : null;
  }

  registrarSucesso(): void {
    this.estado = 'fechado';
    this.falhasConsecutivas = 0;
    this.aberturas = 0;
    this.abertoAte = null;
  }

  /**
   * Falha comum: abre depois de `falhasParaAbrir` consecutivas.
   *
   * Uma falha em `meio-aberto` reabre na hora, sem esperar a contagem — a
   * tentativa de sondagem ja era a evidencia que faltava.
   */
  registrarFalha(): void {
    if (this.situacao() === 'meio-aberto') {
      this.abrir(this.esperaCalculada());
      return;
    }

    this.falhasConsecutivas += 1;
    if (this.falhasConsecutivas >= this.configuracao.falhasParaAbrir) {
      this.abrir(this.esperaCalculada());
    }
  }

  /**
   * `429`. Abre imediatamente, sem contar falhas.
   *
   * Quando a fonte manda `Retry-After`, a espera e **exatamente** a dela, sem
   * jitter e sem backoff: ela disse quando pode, e negociar isso e o caminho para
   * o bloqueio permanente. Sem `Retry-After`, cai no backoff normal.
   */
  registrarLimiteDeTaxa(tentarApos: Date | null): void {
    if (tentarApos !== null) {
      const esperaMs =
        tentarApos.getTime() - this.dependencias.agora().getTime();
      this.abrir(Math.max(esperaMs, 0));
      return;
    }
    this.abrir(this.esperaCalculada());
  }

  private abrir(esperaMs: number): void {
    this.estado = 'aberto';
    this.aberturas += 1;
    this.falhasConsecutivas = 0;
    this.abertoAte = new Date(this.dependencias.agora().getTime() + esperaMs);
  }

  private esperaCalculada(): number {
    const expoente = Math.max(this.aberturas, 0);
    const bruta = this.configuracao.esperaBaseMs * 2 ** expoente;
    const limitada = Math.min(bruta, this.configuracao.esperaMaximaMs);

    if (this.configuracao.jitter <= 0) return limitada;

    // Jitter simetrico: evita que varias fontes que falharam juntas voltem
    // juntas e derrubem o proximo ciclo em bloco.
    const amplitude = limitada * this.configuracao.jitter;
    const deslocamento = (this.dependencias.aleatorio() * 2 - 1) * amplitude;
    return Math.max(limitada + deslocamento, 0);
  }
}

/**
 * Le `Retry-After`, que vem em segundos ou como data HTTP.
 *
 * Devolve `null` quando o header nao existe ou nao da para interpretar — e nesse
 * caso o breaker usa o backoff proprio, em vez de assumir um numero.
 */
export function lerRetryAfter(valor: string | null, agora: Date): Date | null {
  if (valor === null) return null;

  const texto = valor.trim();
  if (texto === '') return null;

  if (/^\d+$/.test(texto)) {
    return new Date(agora.getTime() + Number(texto) * 1000);
  }

  const comoData = new Date(texto);
  return Number.isNaN(comoData.getTime()) ? null : comoData;
}
