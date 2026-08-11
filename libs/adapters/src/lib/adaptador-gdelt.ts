// Adaptador do GDELT DOC 2.0.
//
// CONTEXTO.md secao 2: gratuito, sem chave, janela movel de 3 meses, busca com
// palavra-chave em ingles sobre cobertura traduzida de 65 idiomas. E o unico eixo
// de cobertura global do produto — `regiao='global'` vem daqui e de nenhum outro
// lugar.
//
// Tudo abaixo foi medido contra a API real em 2026-08-07, e cada armadilha esta
// anotada onde importa. As tres que mudam o desenho:
//
// 1. **Uma requisicao a cada 5 segundos.** Nao e suposicao: o proprio corpo do
//    `429` diz "Please limit requests to one every 5 seconds". Cinco requisicoes
//    em rajada derrubaram o acesso por REDE — `connect timeout` que durou mais de
//    uma hora, nao apenas `429`. Por isso este adaptador espaca as proprias
//    consultas, e nao confia so no circuit breaker.
// 2. **`429` sem `Retry-After`.** O corpo e texto puro e o `content-type` vem
//    nulo. Tentar `JSON.parse` nele produz erro de formato enganoso.
// 3. **Sem ETag e sem Last-Modified.** Requisicao condicional e impossivel; a
//    dedup e inteiramente por `url_hash`.

import {
  canonicalizarUrl,
  hashUrl,
  normalizarTitulo,
  simhash,
  type EstadoDeColeta,
  type ItemColetado,
  type ItemDescartado,
  type Uuid,
} from '@mirante/domain';
import { Circuito, lerRetryAfter, type ConfiguracaoCircuito } from './circuito';
import type {
  AdaptadorFonte,
  BuscadorHttp,
  FalhaDeColeta,
  ResultadoColeta,
} from './contrato';
import {
  codigoDeIdioma,
  EsquemaArtigoGdelt,
  EsquemaRespostaGdelt,
  interpretarSeendate,
} from './gdelt-esquema';

export const URL_GDELT_DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';

/** Teto documentado no CONTEXTO.md secao 2. Nao verificado acima disso. */
export const MAXRECORDS_TETO = 250;

/**
 * Espera minima entre consultas, em ms.
 *
 * O `429` do GDELT pede uma requisicao a cada 5 segundos. 5.500 ms da margem
 * sobre o relogio deles sem custar nada relevante no ciclo.
 */
export const ESPERA_ENTRE_CONSULTAS_MS = 5_500;

/**
 * Consultas tematicas. CONTEXTO.md secao 2 lista os temas: juros, inflacao,
 * cambio, tarifa, commodities, banco central.
 *
 * Em ingles de proposito: o GDELT indexa cobertura traduzida automaticamente de
 * 65 idiomas e a busca e feita em ingles — pesquisa-se `"central bank" AND tariff`
 * e retorna materia alema, japonesa e indiana ja indexada.
 */
export const CONSULTAS_TEMATICAS: readonly string[] = [
  '"interest rate" OR "central bank"',
  'inflation OR "consumer prices"',
  '"exchange rate" OR "currency market"',
  'tariff OR "trade war"',
  'commodities OR "oil prices" OR "iron ore"',
  '"emerging markets" AND (Brazil OR "Latin America")',
];

export interface ConfiguracaoGdelt {
  readonly fonteId: Uuid;
  readonly nome: string;
  /** Dominio da fonte na tabela `fonte`, para normalizacao de titulo. */
  readonly dominio: string;
  readonly consultas?: readonly string[];
  /** Janela de busca. `24h`, `3d`, `1w`. Ver CONTEXTO.md secao 2. */
  readonly timespan?: string;
  readonly maxrecords?: number;
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  readonly circuito?: ConfiguracaoCircuito;
  readonly idadeMaximaDias?: number;
}

export interface DependenciasGdelt {
  readonly buscar?: BuscadorHttp;
  readonly agora?: () => Date;
  readonly aleatorio?: () => number;
  /** Injetavel para o teste nao esperar 5s de verdade entre consultas. */
  readonly esperar?: (ms: number) => Promise<void>;
}

const TIMEOUT_PADRAO_MS = 20_000;
const TIMESPAN_PADRAO = '24h';
const IDADE_MAXIMA_PADRAO_DIAS = 7;
const MS_POR_DIA = 86_400_000;
const USER_AGENT_PADRAO =
  'Mirante/0.1 (+https://github.com/MatheusTDjamdjian/mirante)';

export class AdaptadorGdelt implements AdaptadorFonte {
  private readonly circuito: Circuito;
  private readonly buscar: BuscadorHttp;
  private readonly agora: () => Date;
  private readonly esperar: (ms: number) => Promise<void>;

  constructor(
    private readonly configuracao: ConfiguracaoGdelt,
    dependencias: DependenciasGdelt = {},
  ) {
    this.buscar = dependencias.buscar ?? ((url, init) => fetch(url, init));
    this.agora = dependencias.agora ?? (() => new Date());
    this.esperar =
      dependencias.esperar ??
      ((ms) => new Promise((resolver) => setTimeout(resolver, ms)));

    this.circuito = new Circuito(
      `gdelt:${configuracao.nome}`,
      configuracao.circuito,
      {
        agora: this.agora,
        aleatorio: dependencias.aleatorio ?? (() => Math.random()),
      },
    );
  }

  get fonteId(): Uuid {
    return this.configuracao.fonteId;
  }

  get nome(): string {
    return this.configuracao.nome;
  }

  get estadoDoCircuito(): string {
    return this.circuito.situacao();
  }

  /**
   * Roda todas as consultas tematicas e devolve o conjunto unido.
   *
   * O parametro `estado` e ignorado: o GDELT nao manda ETag nem Last-Modified, e
   * o estado devolvido e sempre vazio. A dedup e por `url_hash` na escrita.
   */
  async coletar(_estado: EstadoDeColeta): Promise<ResultadoColeta> {
    const tentarApos = this.circuito.tentarApos();
    if (tentarApos !== null) {
      return { tipo: 'circuito-aberto', tentarApos };
    }

    const consultas = this.configuracao.consultas ?? CONSULTAS_TEMATICAS;
    const porUrlHash = new Map<string, ItemColetado>();
    const descartados: ItemDescartado[] = [];
    let algumaFalha: ResultadoColeta | null = null;

    for (const [indice, consulta] of consultas.entries()) {
      // Espacamento entre consultas, nao antes da primeira.
      if (indice > 0) await this.esperar(ESPERA_ENTRE_CONSULTAS_MS);

      // Circuito pode ter aberto por causa da consulta anterior. Nao insiste.
      if (!this.circuito.permitido()) break;

      const resultado = await this.consultar(consulta);

      if (resultado.tipo === 'falha') {
        // Guarda a primeira falha e segue: uma consulta tematica que quebrou nao
        // deve descartar o que as outras cinco trouxeram.
        algumaFalha ??= resultado;
        continue;
      }

      for (const item of resultado.itens) {
        if (!porUrlHash.has(item.url_hash)) porUrlHash.set(item.url_hash, item);
      }
      descartados.push(...resultado.descartados);
    }

    // Nenhum item e alguma falha: reporta a falha, para o painel de saude ver.
    if (porUrlHash.size === 0 && algumaFalha !== null) return algumaFalha;

    return {
      tipo: 'coletado',
      itens: [...porUrlHash.values()],
      descartados,
      estado: { etag: null, lastModified: null },
    };
  }

  private async consultar(consulta: string): Promise<
    | {
        readonly tipo: 'coletado';
        readonly itens: readonly ItemColetado[];
        readonly descartados: readonly ItemDescartado[];
      }
    | { readonly tipo: 'falha'; readonly erro: FalhaDeColeta }
  > {
    const url = new URL(URL_GDELT_DOC);
    url.searchParams.set('query', consulta);
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('format', 'json');
    url.searchParams.set('sort', 'datedesc');
    url.searchParams.set(
      'maxrecords',
      String(Math.min(this.configuracao.maxrecords ?? 75, MAXRECORDS_TETO)),
    );
    url.searchParams.set(
      'timespan',
      this.configuracao.timespan ?? TIMESPAN_PADRAO,
    );

    let resposta: Response;
    try {
      resposta = await this.buscar(url.toString(), {
        headers: {
          accept: 'application/json',
          'user-agent': this.configuracao.userAgent ?? USER_AGENT_PADRAO,
        },
        signal: AbortSignal.timeout(
          this.configuracao.timeoutMs ?? TIMEOUT_PADRAO_MS,
        ),
      });
    } catch (erro) {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'rede',
          mensagem: erro instanceof Error ? erro.message : String(erro),
        },
      };
    }

    if (resposta.status === 429) {
      // Medido: nao vem `Retry-After`. `lerRetryAfter` devolve null e o breaker
      // cai no backoff proprio, que e o comportamento correto aqui.
      const quando = lerRetryAfter(
        resposta.headers.get('retry-after'),
        this.agora(),
      );
      this.circuito.registrarLimiteDeTaxa(quando);
      return {
        tipo: 'falha',
        erro: {
          categoria: 'limite-de-taxa',
          mensagem: 'GDELT respondeu 429 (uma requisicao a cada 5s)',
          status: 429,
          ...(quando !== null ? { tentarApos: quando } : {}),
        },
      };
    }

    if (!resposta.ok) {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'http',
          mensagem: `GDELT respondeu ${resposta.status}`,
          status: resposta.status,
        },
      };
    }

    let texto: string;
    try {
      texto = await resposta.text();
    } catch (erro) {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'rede',
          mensagem: `falha lendo o corpo: ${erro instanceof Error ? erro.message : String(erro)}`,
        },
      };
    }

    // Le como texto antes de tentar JSON de proposito: o GDELT responde texto
    // puro em erro de consulta, com status 200. `resposta.json()` nesse caso
    // levanta erro de parse que nao explica que o problema foi a consulta.
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'formato',
          mensagem: `resposta nao e JSON: ${texto.slice(0, 120).replace(/\s+/g, ' ')}`,
          status: resposta.status,
        },
      };
    }

    const validada = EsquemaRespostaGdelt.safeParse(bruto);
    if (!validada.success) {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'formato',
          mensagem: `resposta do GDELT em formato inesperado: ${validada.error.issues[0]?.message ?? 'desconhecido'}`,
          status: resposta.status,
        },
      };
    }

    const itens: ItemColetado[] = [];
    const descartados: ItemDescartado[] = [];

    for (const cru of validada.data.articles) {
      const convertido = this.converterArtigo(cru);
      if ('descartado' in convertido) descartados.push(convertido.descartado);
      else itens.push(convertido.item);
    }

    this.circuito.registrarSucesso();
    return { tipo: 'coletado', itens, descartados };
  }

  private converterArtigo(
    cru: unknown,
  ): { item: ItemColetado } | { descartado: ItemDescartado } {
    const validado = EsquemaArtigoGdelt.safeParse(cru);
    if (!validado.success) {
      return {
        descartado: {
          motivo: 'campo-obrigatorio-ausente',
          detalhe:
            validado.error.issues[0]?.message ?? 'artigo em formato inesperado',
        },
      };
    }

    const { url, title, seendate, language } = validado.data;

    const titulo = (title ?? '').trim();
    if (titulo === '') {
      return {
        descartado: { motivo: 'titulo-vazio', detalhe: url ?? '(sem url)' },
      };
    }

    const endereco = (url ?? '').trim();
    if (endereco === '') {
      return { descartado: { motivo: 'url-invalida', detalhe: titulo } };
    }

    let urlCanonica: string;
    let urlHash: string;
    try {
      urlCanonica = canonicalizarUrl(endereco);
      urlHash = hashUrl(endereco);
    } catch {
      return {
        descartado: { motivo: 'url-invalida', detalhe: endereco.slice(0, 80) },
      };
    }

    const publicadoEm = interpretarSeendate(seendate);
    if (publicadoEm === null) {
      return {
        descartado: {
          motivo: 'data-invalida',
          detalhe: `${titulo.slice(0, 60)} (seendate: ${seendate ?? 'ausente'})`,
        },
      };
    }

    const teto = this.configuracao.idadeMaximaDias ?? IDADE_MAXIMA_PADRAO_DIAS;
    const idadeDias =
      (this.agora().getTime() - publicadoEm.getTime()) / MS_POR_DIA;
    if (idadeDias > teto) {
      return {
        descartado: {
          motivo: 'muito-antigo',
          detalhe: `${titulo.slice(0, 60)} (${Math.round(idadeDias)} dias, teto ${teto})`,
        },
      };
    }

    // O dominio do artigo e do veiculo original, nao do GDELT. Normalizar o
    // titulo com o dominio da fonte GDELT nao removeria sufixo nenhum; usar o
    // dominio do artigo remove o sufixo do veiculo de verdade.
    const dominioDoArtigo = validado.data.domain ?? this.configuracao.dominio;
    const tituloNormalizado = normalizarTitulo(titulo, dominioDoArtigo);

    return {
      item: {
        fonte_id: this.configuracao.fonteId,
        url_canonica: urlCanonica,
        url_hash: urlHash,
        titulo,
        titulo_normalizado: tituloNormalizado,
        // O GDELT nao entrega resumo nem corpo — so metadado. Nada a persistir
        // aqui, e nada a redigir.
        resumo_origem: null,
        publicado_em: publicadoEm,
        idioma: codigoDeIdioma(language),
        // O unico lugar do projeto que produz `global`.
        regiao: 'global',
        simhash: simhash(tituloNormalizado),
      },
    };
  }
}
