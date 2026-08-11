// Catalogo de fontes.
//
// Toda URL aqui foi verificada contra a fonte real antes de entrar. Tres delas
// contradizem o CONTEXTO.md secao 2, e a contradicao esta documentada em
// ADR-019 e ADR-021 — a tabela do documento e ponto de partida, nao autorizacao,
// como o proprio documento diz.

import type { Licenca, TipoDeFonte } from '@mirante/domain';
import type { FonteParaSemear } from '@mirante/persistence';
import type { EntradaDeCatalogo } from './fabrica-de-adaptadores';

/**
 * Secoes editoriais de interesse no feed do InfoMoney.
 *
 * Medido: 8 de 10 itens caem numa destas tres. Os de fora estavam marcados
 * apenas como `Politica`. Filtro grosseiro erra para o lado de incluir, porque
 * descartar noticia de mercado e irreversivel. Ver ADR-019.
 */
export const SECOES_INFOMONEY = [
  'Mercados',
  'Onde Investir',
  'Economia',
] as const;

/**
 * Fontes RSS.
 *
 * `peso_base` esta uniforme em 0.8 de proposito. O CONTEXTO.md define o campo
 * como "credibilidade editorial 0..1" e nao atribui valor a nenhuma fonte;
 * ordenar veiculos brasileiros por credibilidade e juizo editorial, nao decisao
 * de implementacao. Uniforme nao afeta nada ate a Onda 5, que e quando o ranking
 * entra — e ai a ordenacao e do humano. Ver relatorio da Onda 3.
 */
export const CATALOGO: readonly EntradaDeCatalogo[] = [
  {
    // /mercados/feed e /economia/feed devolvem 200 com ZERO itens: todas as
    // categorias do InfoMoney estao desativadas, nao so uma. O feed do site
    // funciona, e `<category>` recupera o foco em mercado. Ver ADR-019.
    nome: 'InfoMoney',
    dominio: 'infomoney.com.br',
    url: 'https://www.infomoney.com.br/feed/',
    idioma: 'pt',
    regiao: 'br',
    categoriasPermitidas: SECOES_INFOMONEY,
  },

  // Investing.com Brasil. O CONTEXTO.md aponta a pagina de indice
  // (br.investing.com/webmaster-tools/rss), nao os feeds; os enderecos abaixo
  // sairam de la. O documento pede "acoes, cambio e macro" — sao estes tres.
  // Existem tambem commodities.rss e bonds.rss, verificados e funcionando, que
  // nao entram porque o documento pediu tres.
  //
  // As tres compartilham o dominio `br.investing.com`. E exatamente por isso que
  // `veiculos_distintos` conta dominio distinto e nao fonte distinta (ADR-012):
  // materia replicada nos tres feeds e um veiculo, nao tres.
  {
    nome: 'Investing.com Acoes',
    dominio: 'br.investing.com',
    url: 'https://br.investing.com/rss/stock.rss',
    idioma: 'pt',
    regiao: 'br',
  },
  {
    nome: 'Investing.com Cambio',
    dominio: 'br.investing.com',
    url: 'https://br.investing.com/rss/forex.rss',
    idioma: 'pt',
    regiao: 'br',
  },
  {
    nome: 'Investing.com Macro',
    dominio: 'br.investing.com',
    url: 'https://br.investing.com/rss/market_overview.rss',
    idioma: 'pt',
    regiao: 'br',
  },

  // Agencia Brasil, feed da secao Economia.
  //
  // NAO e `rss.xml`, que e endpoint legado ABANDONADO: devolve 200, RSS valido,
  // `Last-Modified` de hoje — e dez itens de abril a junho de **2020**. Seis anos
  // de materia entraram no banco em silencio antes de alguem olhar as datas.
  //
  // O caminho vivo saiu do proprio site: a pagina aponta para `rss.ebc.com.br`,
  // que redireciona para um indice de feeds por secao. Ver ADR-022.
  //
  // Este feed e tematico por construcao (secao Economia), entao nao precisa de
  // filtro de categoria — mas traz `<category>` de qualidade (`inflação`, `IPCA`,
  // `taxa Selic`), util para a Onda 8.
  {
    nome: 'Agencia Brasil Economia',
    dominio: 'agenciabrasil.ebc.com.br',
    url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
    idioma: 'pt',
    regiao: 'br',
  },

  // Agencia Gov. Mesma correcao de caminho.
  //
  // NAO envia ETag nem Last-Modified: requisicao condicional nao funciona nesta
  // fonte, e todo ciclo rebaixa o feed inteiro. O adaptador degrada sozinho
  // (nenhum header para mandar, sempre 200, dedup por url_hash resolve), mas o
  // custo de trafego e real e o painel de saude vai mostrar 0% de 304 aqui.
  //
  // O `content-type` que ela devolve e `application/atom+xml`, mas o corpo e
  // `<rss version="2.0">` com `<channel>` — rotulo errado do servidor. O
  // adaptador nao consulta content-type, entao nao ha problema.
  {
    nome: 'Agencia Gov',
    dominio: 'agenciagov.ebc.com.br',
    url: 'https://agenciagov.ebc.com.br/rss.xml',
    idioma: 'pt',
    regiao: 'br',
  },

  // GDELT DOC 2.0. Unica fonte de `regiao='global'` do projeto.
  //
  // `maxrecords: 20` por consulta, nao os 250 do teto. Ver ADR-026: seis
  // consultas com o teto trariam ate 1.500 artigos por ciclo contra ~20 itens
  // novos dos seis feeds RSS, e o feed viraria cobertura estrangeira com um
  // apendice brasileiro. 20 x 6 = ate 120 por ciclo, com cadencia de 30 min.
  //
  // Numero de partida, nao medicao — o balanco real esta em
  // `npm run estado:banco` e a calibracao e com dado.
  {
    nome: 'GDELT',
    dominio: 'gdeltproject.org',
    // Nao usada: o AdaptadorGdelt monta a URL com os parametros da consulta.
    url: 'https://api.gdeltproject.org/api/v2/doc/doc',
    idioma: 'en',
    regiao: 'global',
    maxrecords: 20,
  },
];

/**
 * Licenca por dominio, conforme `docs/LICENCAS.md`.
 *
 * `permissiva` so onde os termos autorizam de forma explicita. A EBC autoriza
 * reproducao mediante indicacao da fonte, e o Mirante exibe o veiculo em todo
 * card por arquitetura — a condicao esta satisfeita por construcao.
 *
 * As demais ficam `desconhecida`, e o PROMPT_ONDAS.md manda tratar assim com a
 * politica mais restritiva. Nao ha custo: a politica mais restritiva do produto
 * ja e a politica padrao dele.
 */
const LICENCA_POR_DOMINIO: Readonly<Record<string, Licenca>> = {
  'agenciabrasil.ebc.com.br': 'permissiva',
  'agenciagov.ebc.com.br': 'permissiva',
  'infomoney.com.br': 'desconhecida',
  'br.investing.com': 'desconhecida',
  'gdeltproject.org': 'desconhecida',
};

/**
 * `tipo` da fonte, derivado do dominio.
 *
 * `oficial` para as agencias da EBC — o que as distingue de `rss` e a licenca, nao
 * o protocolo; as duas entregam RSS e usam o mesmo adaptador. `gdelt` para o
 * GDELT, que e o unico com adaptador proprio.
 */
function tipoDaFonte(dominio: string): TipoDeFonte {
  if (dominio === 'gdeltproject.org') return 'gdelt';
  if (dominio.endsWith('ebc.com.br')) return 'oficial';
  return 'rss';
}

/** Semente da tabela `fonte`. */
export const FONTES_PARA_SEMEAR: readonly FonteParaSemear[] = CATALOGO.map(
  (entrada) => ({
    nome: entrada.nome,
    dominio: entrada.dominio,
    tipo: tipoDaFonte(entrada.dominio),
    licenca: LICENCA_POR_DOMINIO[entrada.dominio] ?? 'desconhecida',
    peso_base: 0.8,
    ativa: true,
  }),
);
