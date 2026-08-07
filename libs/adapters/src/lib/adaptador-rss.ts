// Adaptador RSS generico, configurado por fonte.
//
// Uma implementacao para todos os feeds RSS do projeto. CLAUDE.md secao 5: sem
// condicional por tipo de fonte fora da fabrica — o que varia entre InfoMoney,
// Investing e Agencia Brasil e configuracao, nao codigo.

import {
  canonicalizarUrl,
  hashUrl,
  normalizarTitulo,
  removerAcento,
  simhash,
  UrlInvalidaError,
  type CodigoIdioma,
  type EstadoDeColeta,
  type ItemColetado,
  type ItemDescartado,
  type RegiaoDeItem,
  type Uuid,
} from '@mirante/domain';
import { XMLParser } from 'fast-xml-parser';
import { Circuito, lerRetryAfter, type ConfiguracaoCircuito } from './circuito';
import type {
  AdaptadorFonte,
  FalhaDeColeta,
  ResultadoColeta,
} from './contrato';
import { EsquemaEnvelopeRss, EsquemaItemRss } from './rss-esquema';

export interface ConfiguracaoRss {
  readonly fonteId: Uuid;
  readonly nome: string;
  /** Dominio do veiculo. Usado para remover o sufixo do titulo. */
  readonly dominio: string;
  readonly url: string;
  readonly idioma: CodigoIdioma;
  readonly regiao: RegiaoDeItem;
  /**
   * Secoes editoriais de interesse. Item que nao cair em nenhuma e descartado
   * como `categoria-fora-do-escopo`.
   *
   * Ausente ou vazio desliga o filtro — feed que ja e tematico nao precisa dele.
   * A comparacao ignora acento e caixa: `Ações` casa com `acoes`.
   */
  readonly categoriasPermitidas?: readonly string[];
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  readonly circuito?: ConfiguracaoCircuito;
}

/** Injetavel para o teste rodar contra fixture em disco, sem rede. */
export type BuscadorHttp = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export interface DependenciasRss {
  readonly buscar?: BuscadorHttp;
  readonly agora?: () => Date;
  /** 0..1, para o jitter do circuito. Injetavel para teste determinista. */
  readonly aleatorio?: () => number;
}

const TIMEOUT_PADRAO_MS = 10_000;
const USER_AGENT_PADRAO =
  'Mirante/0.1 (+https://github.com/MatheusTDjamdjian/mirante)';

const analisador = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Sem conversao automatica de valor: titulo "15" tem de continuar string, e
  // pubDate nunca deve virar numero.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (_nome, caminho) => caminho === 'rss.channel.item',
});

/** Chave de comparacao de categoria: sem acento, minuscula, sem espaco duplo. */
function chaveDeCategoria(valor: string): string {
  return removerAcento(valor).toLowerCase().trim().replace(/\s+/g, ' ');
}

export class AdaptadorRss implements AdaptadorFonte {
  private readonly circuito: Circuito;
  private readonly buscar: BuscadorHttp;
  private readonly agora: () => Date;
  private readonly categoriasPermitidas: ReadonlySet<string>;

  constructor(
    private readonly configuracao: ConfiguracaoRss,
    dependencias: DependenciasRss = {},
  ) {
    this.buscar = dependencias.buscar ?? ((url, init) => fetch(url, init));
    this.agora = dependencias.agora ?? (() => new Date());
    this.categoriasPermitidas = new Set(
      (configuracao.categoriasPermitidas ?? []).map(chaveDeCategoria),
    );

    // O relogio vai para o Circuito de proposito. Sem isso o breaker mede
    // Retry-After contra o tempo real enquanto o adaptador usa o relogio
    // injetado, e a espera calculada da negativa — o circuito abre e fecha no
    // mesmo instante. Em producao os dois relogios coincidem e o defeito fica
    // invisivel; sob teste, e em replay determinista, o breaker fica cego.
    this.circuito = new Circuito(
      `rss:${configuracao.nome}`,
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

  /** Exposto para o painel de saude da Onda 3. */
  get estadoDoCircuito(): string {
    return this.circuito.situacao();
  }

  async coletar(estado: EstadoDeColeta): Promise<ResultadoColeta> {
    const tentarApos = this.circuito.tentarApos();
    if (tentarApos !== null) {
      return { tipo: 'circuito-aberto', tentarApos };
    }

    let resposta: Response;
    try {
      resposta = await this.buscar(this.configuracao.url, {
        headers: this.cabecalhos(estado),
        // Timeout explicito: sem ele um socket pendurado segura o ciclo inteiro
        // ate o teto de 90s do CONTEXTO.md secao 9.
        signal: AbortSignal.timeout(
          this.configuracao.timeoutMs ?? TIMEOUT_PADRAO_MS,
        ),
        redirect: 'follow',
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

    if (resposta.status === 304) {
      this.circuito.registrarSucesso();
      return { tipo: 'nao-modificado' };
    }

    if (resposta.status === 429) {
      const quando = lerRetryAfter(
        resposta.headers.get('retry-after'),
        this.agora(),
      );
      this.circuito.registrarLimiteDeTaxa(quando);
      const erro: FalhaDeColeta = {
        categoria: 'limite-de-taxa',
        mensagem: 'fonte respondeu 429',
        status: 429,
        ...(quando !== null ? { tentarApos: quando } : {}),
      };
      return { tipo: 'falha', erro };
    }

    if (!resposta.ok) {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'http',
          mensagem: `fonte respondeu ${resposta.status}`,
          status: resposta.status,
        },
      };
    }

    let corpo: string;
    try {
      corpo = await resposta.text();
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

    return this.interpretar(corpo, resposta);
  }

  private cabecalhos(estado: EstadoDeColeta): Record<string, string> {
    const cabecalhos: Record<string, string> = {
      accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'accept-encoding': 'gzip, deflate',
      'user-agent': this.configuracao.userAgent ?? USER_AGENT_PADRAO,
    };

    // Requisicao condicional. CONTEXTO.md secao 5: sempre, nao quando lembrar.
    if (estado.etag !== null) cabecalhos['if-none-match'] = estado.etag;
    if (estado.lastModified !== null) {
      cabecalhos['if-modified-since'] = estado.lastModified;
    }

    return cabecalhos;
  }

  private interpretar(corpo: string, resposta: Response): ResultadoColeta {
    let bruto: unknown;
    try {
      bruto = analisador.parse(corpo);
    } catch (erro) {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'formato',
          mensagem: `XML invalido: ${erro instanceof Error ? erro.message : String(erro)}`,
          status: resposta.status,
        },
      };
    }

    const envelope = EsquemaEnvelopeRss.safeParse(bruto);
    if (!envelope.success) {
      this.circuito.registrarFalha();
      return {
        tipo: 'falha',
        erro: {
          categoria: 'formato',
          // Primeira issue basta para o log; a resposta inteira nao vai para o
          // log de proposito, porque conteudo de terceiro nao e nosso para
          // guardar (CONTEXTO.md secao 3).
          mensagem: `envelope RSS invalido: ${envelope.error.issues[0]?.message ?? 'formato inesperado'}`,
          status: resposta.status,
        },
      };
    }

    const itens: ItemColetado[] = [];
    const descartados: ItemDescartado[] = [];

    for (const cru of envelope.data.rss.channel.item) {
      const convertido = this.converterItem(cru);
      if ('descartado' in convertido) {
        descartados.push(convertido.descartado);
      } else {
        itens.push(convertido.item);
      }
    }

    this.circuito.registrarSucesso();

    return {
      tipo: 'coletado',
      itens,
      descartados,
      estado: {
        etag: resposta.headers.get('etag'),
        lastModified: resposta.headers.get('last-modified'),
      },
    };
  }

  private converterItem(
    cru: unknown,
  ): { item: ItemColetado } | { descartado: ItemDescartado } {
    const validado = EsquemaItemRss.safeParse(cru);
    if (!validado.success) {
      return {
        descartado: {
          motivo: 'campo-obrigatorio-ausente',
          detalhe:
            validado.error.issues[0]?.message ?? 'item em formato inesperado',
        },
      };
    }

    const { title, link, guid, pubDate, description, category } = validado.data;

    // Filtro de secao antes de qualquer trabalho: nao vale canonicalizar URL e
    // calcular simhash de item que vai ser descartado.
    if (this.categoriasPermitidas.size > 0) {
      const doItem = (category ?? []).map(chaveDeCategoria);
      const casou = doItem.some((c) => this.categoriasPermitidas.has(c));
      if (!casou) {
        return {
          descartado: {
            motivo: 'categoria-fora-do-escopo',
            detalhe: `${(title ?? '(sem titulo)').slice(0, 80)} [${(category ?? []).join(', ')}]`,
          },
        };
      }
    }

    const titulo = (title ?? '').trim();
    if (titulo === '') {
      return {
        descartado: {
          motivo: 'titulo-vazio',
          detalhe: link ?? guid ?? '(sem link)',
        },
      };
    }

    // `link` e o normal; `guid` cobre feed que usa guid como URL permanente.
    const enderecoBruto = (link ?? guid ?? '').trim();
    if (enderecoBruto === '') {
      return { descartado: { motivo: 'url-invalida', detalhe: titulo } };
    }

    let urlCanonica: string;
    let urlHash: string;
    try {
      urlCanonica = canonicalizarUrl(enderecoBruto);
      urlHash = hashUrl(enderecoBruto);
    } catch (erro) {
      return {
        descartado: {
          motivo: 'url-invalida',
          detalhe:
            erro instanceof UrlInvalidaError ? erro.message : enderecoBruto,
        },
      };
    }

    const publicadoEm = interpretarData(pubDate);
    if (publicadoEm === null) {
      // Descarta em vez de assumir `now()`: `publicado_em` alimenta o
      // decaimento temporal do ranking, e chutar a data premiaria justamente o
      // item com metadado ruim.
      return {
        descartado: {
          motivo: 'data-invalida',
          detalhe: `${titulo} (pubDate: ${pubDate ?? 'ausente'})`,
        },
      };
    }

    const tituloNormalizado = normalizarTitulo(
      titulo,
      this.configuracao.dominio,
    );

    return {
      item: {
        fonte_id: this.configuracao.fonteId,
        url_canonica: urlCanonica,
        url_hash: urlHash,
        titulo,
        titulo_normalizado: tituloNormalizado,
        resumo_origem: description?.trim() ?? null,
        publicado_em: publicadoEm,
        idioma: this.configuracao.idioma,
        regiao: this.configuracao.regiao,
        simhash: simhash(tituloNormalizado),
      },
    };
  }
}

/** RSS usa RFC 822. `Date` do V8 aceita as variacoes que aparecem na pratica. */
export function interpretarData(valor: string | undefined): Date | null {
  if (valor === undefined) return null;
  const texto = valor.trim();
  if (texto === '') return null;

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}
