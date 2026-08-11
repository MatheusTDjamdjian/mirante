// Validacao Zod da resposta da API DOC 2.0 do GDELT.
//
// Campos confirmados contra a API real em 2026-08-07, modo ArtList, format=json:
//
//   { articles: [ { url, url_mobile, title, seendate, socialimage,
//                   domain, language, sourcecountry } ] }
//
// O CONTEXTO.md secao 2 lista `title`, `url`, `domain`, `seendate`, `language`,
// `sourcecountry` e `socialimage` como os campos uteis. Todos existem. O
// `url_mobile` nao esta no documento e nao e usado.
//
// Duas armadilhas medidas na resposta real:
//
// 1. `seendate` vem como `20260807T181500Z` — ISO 8601 compacto, sem separador.
//    `new Date()` NAO interpreta esse formato. Ver `interpretarSeendate`.
// 2. `language` vem por extenso (`English`, `Spanish`, `Korean`), nao como codigo
//    ISO. O schema canonico tem `idioma char(2)`. Ver `codigoDeIdioma`.

import { z } from 'zod';

export const EsquemaArtigoGdelt = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  seendate: z.string().optional(),
  domain: z.string().optional(),
  language: z.string().optional(),
  sourcecountry: z.string().optional(),
  // `socialimage` e `url_mobile` existem na resposta e nao sao extraidos: o
  // produto nao usa imagem (CONTEXTO.md secao 8: "sem imagem grande, sem hero")
  // e nao tem uso para URL mobile.
});

export type ArtigoGdelt = z.infer<typeof EsquemaArtigoGdelt>;

export const EsquemaRespostaGdelt = z.object({
  // Consulta sem resultado devolve `articles` ausente, nao lista vazia.
  articles: z.array(z.unknown()).optional().default([]),
});

/**
 * Interpreta `seendate` no formato compacto do GDELT: `20260807T181500Z`.
 *
 * Feito a mao de proposito. `new Date('20260807T181500Z')` devolve
 * `Invalid Date`, e usar `Date` aqui daria `publicado_em` invalido em 100% dos
 * itens do GDELT — de forma silenciosa, porque o campo existe e parece uma data.
 */
export function interpretarSeendate(valor: string | undefined): Date | null {
  if (valor === undefined) return null;

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(valor.trim());
  if (m === null) return null;

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const hora = Number(m[4]);
  const minuto = Number(m[5]);
  const segundo = Number(m[6]);

  const data = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
  if (Number.isNaN(data.getTime())) return null;

  // Confere o ida-e-volta. `Date.UTC` NAO rejeita componente fora de faixa: ele
  // rola em silencio, e `20261307T181500Z` (mes 13) viraria janeiro de 2027 —
  // uma data plausivel e seis meses errada. Como `publicado_em` alimenta o
  // decaimento temporal do ranking, isso corromperia a ordenacao sem deixar
  // rastro. O mesmo cobre dia 32, hora 25 e 30 de fevereiro.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia ||
    data.getUTCHours() !== hora ||
    data.getUTCMinutes() !== minuto ||
    data.getUTCSeconds() !== segundo
  ) {
    return null;
  }

  return data;
}

/**
 * Nome de idioma do GDELT para codigo ISO 639-1 de duas letras.
 *
 * O schema canonico tem `idioma char(2)` e o GDELT manda nome por extenso. A
 * lista cobre os idiomas observados na resposta real mais os de maior volume no
 * corpus do GDELT.
 *
 * Idioma nao mapeado devolve `'xx'`, e o item **e mantido**. Descartar um item de
 * mercado porque a lista de idiomas esta incompleta seria trocar dado por
 * arrumacao. `'xx'` e consultavel, entao a lacuna fica visivel em vez de virar
 * palpite silencioso.
 */
const CODIGO_POR_IDIOMA: Readonly<Record<string, string>> = {
  english: 'en',
  portuguese: 'pt',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  dutch: 'nl',
  russian: 'ru',
  ukrainian: 'uk',
  polish: 'pl',
  turkish: 'tr',
  arabic: 'ar',
  hebrew: 'he',
  persian: 'fa',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  hindi: 'hi',
  bengali: 'bn',
  indonesian: 'id',
  vietnamese: 'vi',
  thai: 'th',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  greek: 'el',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  bulgarian: 'bg',
  serbian: 'sr',
  croatian: 'hr',
  slovak: 'sk',
  slovenian: 'sl',
  catalan: 'ca',
  galician: 'gl',
  albanian: 'sq',
  macedonian: 'mk',
  estonian: 'et',
  latvian: 'lv',
  lithuanian: 'lt',
  swahili: 'sw',
  urdu: 'ur',
  tamil: 'ta',
  telugu: 'te',
  malay: 'ms',
  filipino: 'tl',
  tagalog: 'tl',
};

/** `'xx'` quando o idioma nao esta mapeado. Ver nota acima. */
export const IDIOMA_NAO_MAPEADO = 'xx';

export function codigoDeIdioma(nome: string | undefined): string {
  if (nome === undefined) return IDIOMA_NAO_MAPEADO;
  return CODIGO_POR_IDIOMA[nome.trim().toLowerCase()] ?? IDIOMA_NAO_MAPEADO;
}
