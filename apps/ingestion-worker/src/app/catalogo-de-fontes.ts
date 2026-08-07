// Catalogo de fontes da Onda 2.
//
// UMA fonte. PROMPT_ONDAS.md: "Provar o contrato do adaptador ponta a ponta com
// **uma** fonte antes de multiplicar o erro por cinco." As demais entram na
// Onda 3, junto com docs/LICENCAS.md preenchido.

import type { FonteParaSemear } from '@mirante/persistence';
import type { EntradaDeCatalogo } from './fabrica-de-adaptadores';

/**
 * Secoes editoriais de interesse no feed do InfoMoney.
 *
 * Medido no feed real: 8 de 10 itens caem numa destas tres. Os dois de fora
 * estavam marcados apenas como `Politica` (STF e jogos de azar).
 *
 * A lista e curta de proposito. Filtro grosseiro erra para o lado de incluir,
 * porque descartar noticia de mercado e irreversivel e ingerir uma noticia
 * politica nao e — o `tema` da Onda 8 separa ruido, mas nada recupera o que nunca
 * entrou. Ver ADR-019.
 */
export const SECOES_INFOMONEY = [
  'Mercados',
  'Onde Investir',
  'Economia',
] as const;

/**
 * URL do feed.
 *
 * NAO e a do CONTEXTO.md secao 2 (`/mercados/feed`), que devolve `200` com
 * envelope RSS valido e **zero itens** — verificado, e a fixture
 * `infomoney-mercados-vazio.xml` guarda a evidencia. O feed do site funciona, e o
 * `<category>` de cada item recupera o foco em mercado. Ver ADR-019.
 */
export const CATALOGO: readonly EntradaDeCatalogo[] = [
  {
    nome: 'InfoMoney',
    dominio: 'infomoney.com.br',
    url: 'https://www.infomoney.com.br/feed/',
    idioma: 'pt',
    regiao: 'br',
    categoriasPermitidas: SECOES_INFOMONEY,
  },
];

/**
 * Semente da tabela `fonte`.
 *
 * `licenca: 'desconhecida'` de proposito: determinar licenca e trabalho da
 * Onda 3, com `docs/LICENCAS.md`, e o PROMPT_ONDAS.md manda tratar fonte de
 * licenca indeterminada com a politica mais restritiva. Nao adianto essa decisao.
 *
 * `peso_base: 0.8` e ponto de partida, nao medicao. O CONTEXTO.md define o campo
 * como "credibilidade editorial 0..1" e nao atribui valor a nenhuma fonte. Com
 * uma fonte so, o valor e irrelevante para a ordenacao — ele passa a importar na
 * Onda 3, quando houver com o que comparar, e ai e decisao do humano.
 */
export const FONTES_PARA_SEMEAR: readonly FonteParaSemear[] = [
  {
    nome: 'InfoMoney',
    dominio: 'infomoney.com.br',
    tipo: 'rss',
    licenca: 'desconhecida',
    peso_base: 0.8,
    ativa: true,
  },
];
