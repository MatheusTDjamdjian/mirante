// Normalizacao de titulo.
//
// Alimenta o simhash (dedup aproximada) e a busca. CONTEXTO.md secao 5:
// "extracao de titulo limpo (remove sufixo ` - InfoMoney`)".
//
// A qualidade desta funcao decide a qualidade do clustering, e o clustering
// decide se o produto existe (CONTEXTO.md secao 10). A Onda 4 mede precisao e
// recall contra o corpus rotulado, e o PROMPT_ONDAS.md manda investigar **esta
// funcao primeiro** quando o numero nao bate — antes do limiar, antes da janela,
// antes de trocar o modelo de embedding.

import { ehStopword } from './stopwords';

/**
 * Separadores que veiculo usa antes do proprio nome no fim do titulo.
 * Ordem nao importa; o casamento e pela ultima ocorrencia de qualquer um.
 */
const SEPARADORES_DE_SUFIXO = [' - ', ' – ', ' — ', ' | ', ' · ', ' :: '];

/** Rotulos de dominio publico que nao identificam o veiculo. */
const ROTULOS_GENERICOS = new Set([
  'com',
  'br',
  'net',
  'org',
  'gov',
  'edu',
  'co',
  'info',
  'io',
  'app',
  'news',
]);

/** Remove acento sem remover a letra: `ç` vira `c`, `ã` vira `a`. */
export function removerAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function simplificar(texto: string): string {
  return removerAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Deriva o nome do veiculo a partir do dominio, para reconhecer o sufixo do
 * titulo sem manter uma tabela de nomes por fonte.
 *
 * `infomoney.com.br` -> `infomoney`
 * `br.investing.com` -> `investing`
 * `agenciabrasil.ebc.com.br` -> `agenciabrasil`
 *
 * Escolhe o rotulo mais longo que nao seja sufixo publico nem prefixo curto de
 * regiao, porque e esse que carrega a marca.
 */
export function rotuloDoVeiculo(dominio: string): string {
  const rotulos = simplificarDominio(dominio)
    .split('.')
    .filter((rotulo) => rotulo !== '' && !ROTULOS_GENERICOS.has(rotulo))
    // `br` em `br.investing.com` e prefixo de regiao, nao marca.
    .filter((rotulo) => rotulo.length > 2);

  let maisLongo = '';
  for (const rotulo of rotulos) {
    if (rotulo.length > maisLongo.length) maisLongo = rotulo;
  }
  return maisLongo;
}

function simplificarDominio(dominio: string): string {
  const semEsquema = dominio.replace(/^[a-z]+:\/\//i, '');
  const semCaminho = semEsquema.split('/')[0] ?? '';
  const semPorta = semCaminho.split(':')[0] ?? '';
  return removerAcento(semPorta)
    .toLowerCase()
    .replace(/^www\./, '');
}

/**
 * Remove o sufixo de veiculo do fim do titulo, repetidamente.
 *
 * Repete porque titulo real traz cadeia: `Copom mantem Selic - Mercados -
 * InfoMoney`. Cada passada remove no maximo um sufixo, e so remove quando o
 * trecho apos o separador **comeca com** o rotulo do veiculo — `Investing.com`
 * simplifica para `investingcom`, que comeca com `investing`.
 */
export function removerSufixoDeVeiculo(
  titulo: string,
  dominio: string,
): string {
  const rotulo = rotuloDoVeiculo(dominio);
  if (rotulo === '') return titulo;

  let atual = titulo.trim();

  // Limite de passadas: titulo com muitos separadores nao vira laco infinito.
  for (let passada = 0; passada < 4; passada += 1) {
    let cortou = false;

    for (const separador of SEPARADORES_DE_SUFIXO) {
      const posicao = atual.lastIndexOf(separador);
      if (posicao <= 0) continue;

      const cauda = atual.slice(posicao + separador.length);
      if (!simplificar(cauda).startsWith(rotulo)) continue;

      atual = atual.slice(0, posicao).trim();
      cortou = true;
      break;
    }

    if (!cortou) break;
  }

  return atual;
}

/**
 * Normaliza um titulo para dedup aproximada.
 *
 * Nesta ordem: remove sufixo de veiculo (antes da pontuacao, porque o separador
 * **e** pontuacao e e ele que localiza o sufixo), minusculas, remove acento,
 * troca o que nao e alfanumerico por espaco, descarta stopword, colapsa espaco.
 *
 * Devolve string vazia quando nao sobra nada — titulo vazio, ou titulo composto
 * apenas de stopword. Chamador deve tratar vazio como "sem sinal": item sem
 * titulo normalizado nao entra em dedup aproximada.
 */
export function normalizarTitulo(titulo: string, dominio: string): string {
  const semVeiculo = removerSufixoDeVeiculo(titulo, dominio);

  return removerAcento(semVeiculo)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((palavra) => palavra !== '' && !ehStopword(palavra))
    .join(' ');
}
