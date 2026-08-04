// SimHash de 64 bits e distancia de Hamming.
//
// CONTEXTO.md secao 5: a dedup aproximada roda **antes** do embedding, porque
// embedding custa. SimHash sobre `titulo_normalizado`, Hamming <= 3, janela de
// 24h. Resolve republicacao de agencia e titulo quase identico por uma fracao do
// custo de um modelo.
//
// A propriedade que faz isso funcionar: textos parecidos produzem hashes
// parecidos. Diferente de sha256, onde um bit de entrada muda metade da saida.

import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

const BITS = 64n;
const MASCARA_64 = (1n << BITS) - 1n;

export interface ConfiguracaoSimhash {
  /**
   * Quantas palavras consecutivas formam um shingle.
   *
   * Default 1 (palavra isolada). Titulo de mercado tem 5 a 15 palavras; com
   * shingle de 2, trocar uma palavra altera dois shingles de poucos, e a
   * distancia de Hamming estoura o limiar de 3 com facilidade. Com 1, a mudanca
   * e proporcionalmente menor e o limiar apertado continua util.
   *
   * E um parametro de calibracao da Onda 4, nao uma verdade. Mexer aqui exige o
   * numero antes e depois em docs/METRICAS.md.
   */
  readonly tamanhoShingle: number;
}

export const CONFIGURACAO_SIMHASH_PADRAO: ConfiguracaoSimhash = {
  tamanhoShingle: 1,
};

/** Hash de 64 bits de um shingle: os 8 primeiros bytes do sha256. */
function hash64(shingle: string): bigint {
  const bytes = sha256(utf8ToBytes(shingle));
  let valor = 0n;
  for (let i = 0; i < 8; i += 1) {
    valor = (valor << 8n) | BigInt(bytes[i] ?? 0);
  }
  return valor;
}

function montarShingles(texto: string, tamanho: number): readonly string[] {
  const palavras = texto.split(' ').filter((palavra) => palavra !== '');
  if (palavras.length === 0) return [];
  if (tamanho <= 1) return palavras;
  // Texto mais curto que a janela vira um shingle unico com tudo que tem, em
  // vez de nenhum — perder o item inteiro seria pior que um shingle curto.
  if (palavras.length < tamanho) return [palavras.join(' ')];

  const shingles: string[] = [];
  for (let i = 0; i + tamanho <= palavras.length; i += 1) {
    shingles.push(palavras.slice(i, i + tamanho).join(' '));
  }
  return shingles;
}

/**
 * SimHash de 64 bits, sem sinal, sobre shingles de palavra.
 *
 * Cada shingle vota em cada um dos 64 bits, com peso igual ao numero de vezes
 * que aparece: bit 1 soma, bit 0 subtrai. O bit final e 1 quando a soma e
 * positiva. Repeticao de palavra pesa mais, o que e desejado — palavra repetida
 * num titulo e assunto, nao ruido.
 *
 * Texto vazio devolve `0n`. Atencao: dois textos vazios tem distancia 0 entre
 * si, ou seja, seriam lidos como duplicata. O chamador nao deve submeter titulo
 * normalizado vazio a dedup aproximada — ver `normalizarTitulo`.
 */
export function simhash(
  texto: string,
  configuracao: ConfiguracaoSimhash = CONFIGURACAO_SIMHASH_PADRAO,
): bigint {
  const shingles = montarShingles(texto, configuracao.tamanhoShingle);
  if (shingles.length === 0) return 0n;

  const pesoPorShingle = new Map<string, number>();
  for (const shingle of shingles) {
    pesoPorShingle.set(shingle, (pesoPorShingle.get(shingle) ?? 0) + 1);
  }

  const somas = new Array<number>(64).fill(0);
  for (const [shingle, peso] of pesoPorShingle) {
    const h = hash64(shingle);
    for (let bit = 0; bit < 64; bit += 1) {
      const ligado = ((h >> BigInt(bit)) & 1n) === 1n;
      somas[bit] = (somas[bit] ?? 0) + (ligado ? peso : -peso);
    }
  }

  let resultado = 0n;
  for (let bit = 0; bit < 64; bit += 1) {
    if ((somas[bit] ?? 0) > 0) resultado |= 1n << BigInt(bit);
  }
  return resultado;
}

function contarBits32(valor: number): number {
  let v = valor - ((valor >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  v = (v + (v >> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >> 24;
}

/**
 * Numero de bits em que os dois hashes diferem, de 0 a 64.
 *
 * Funciona igual com a forma sem sinal e com a forma assinada que o Postgres
 * guarda, porque opera sobre os 64 bits e nao sobre o valor numerico.
 */
export function distanciaHamming(a: bigint, b: bigint): number {
  const diferenca = (a ^ b) & MASCARA_64;
  const baixo = Number(diferenca & 0xffffffffn);
  const alto = Number((diferenca >> 32n) & 0xffffffffn);
  return contarBits32(baixo) + contarBits32(alto);
}

/**
 * Converte para a faixa assinada de `bigint` do Postgres.
 *
 * `bigint` no Postgres e int8 **assinado**: -2^63 a 2^63-1. O simhash usa os 64
 * bits inteiros, entao metade dos valores possiveis nao cabe sem esta conversao,
 * e a insercao falharia com "value out of range" em cerca de metade dos itens —
 * de forma intermitente, que e o pior jeito de descobrir.
 */
export function paraBigintAssinado(valorSemSinal: bigint): bigint {
  return BigInt.asIntN(64, valorSemSinal);
}

/** Inverso de `paraBigintAssinado`, para o que sai do banco. */
export function paraSimhashSemSinal(valorAssinado: bigint): bigint {
  return BigInt.asUintN(64, valorAssinado);
}

/** Limiar de dedup aproximada do CONTEXTO.md secao 5. Calibravel na Onda 4. */
export const DISTANCIA_HAMMING_MAXIMA = 3;

/** Janela temporal obrigatoria da dedup e do clustering, em horas. */
export const JANELA_DEDUP_HORAS = 24;
