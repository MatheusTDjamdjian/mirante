import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdaptadorRss, interpretarData } from './adaptador-rss';
import type { ConfiguracaoRss } from './adaptador-rss';
import { ESTADO_DE_COLETA_VAZIO } from '@mirante/domain';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, '..', '..', 'fixtures');

function fixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf8');
}

const CONFIG: ConfiguracaoRss = {
  fonteId: '11111111-1111-1111-1111-111111111111',
  nome: 'InfoMoney (teste)',
  dominio: 'infomoney.com.br',
  url: 'https://www.infomoney.com.br/feed/',
  idioma: 'pt',
  regiao: 'br',
  timeoutMs: 1_000,
};

/**
 * Resposta falsa, para o teste nunca tocar a rede.
 *
 * 204, 205 e 304 sao "null body status" no Fetch: o construtor de `Response`
 * lanca se receber corpo, mesmo string vazia. Sem este tratamento, o teste de
 * 304 falharia como erro de rede e daria a impressao de bug no adaptador.
 */
const STATUS_SEM_CORPO = new Set([204, 205, 304]);

function resposta(
  corpo: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  return new Response(STATUS_SEM_CORPO.has(status) ? null : corpo, {
    status,
    headers: init.headers ?? {},
  });
}

describe('AdaptadorRss — resposta valida', () => {
  it('parses every item of the real fixture', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(fixture('infomoney-com-itens.xml')),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);

    expect(r.tipo).toBe('coletado');
    if (r.tipo !== 'coletado') return;

    expect(r.itens).toHaveLength(10);
    expect(r.descartados).toHaveLength(0);
  });

  it('fills every field the schema requires', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(fixture('infomoney-com-itens.xml')),
    });
    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    for (const item of r.itens) {
      expect(item.fonte_id).toBe(CONFIG.fonteId);
      expect(item.url_canonica).toMatch(/^https:\/\//);
      expect(item.url_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(item.titulo.length).toBeGreaterThan(0);
      expect(item.publicado_em.getTime()).not.toBeNaN();
      expect(item.idioma).toBe('pt');
      expect(item.regiao).toBe('br');
      expect(typeof item.simhash).toBe('bigint');
    }
  });

  it('normalizes the title, stripping the outlet suffix', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(fixture('infomoney-com-itens.xml')),
    });
    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    for (const item of r.itens) {
      expect(item.titulo_normalizado).not.toMatch(/infomoney/i);
      expect(item.titulo_normalizado).toBe(
        item.titulo_normalizado.toLowerCase(),
      );
    }
  });

  it('produces distinct url_hash per item', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(fixture('infomoney-com-itens.xml')),
    });
    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    expect(new Set(r.itens.map((i) => i.url_hash)).size).toBe(r.itens.length);
  });

  it('captures ETag and Last-Modified for the next conditional request', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () =>
        resposta(fixture('infomoney-com-itens.xml'), {
          headers: {
            etag: 'W/"3702e0640fb3d09e5993b2f662b08bbe"',
            'last-modified': 'Thu, 06 Aug 2026 14:28:31 GMT',
          },
        }),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    expect(r.estado.etag).toBe('W/"3702e0640fb3d09e5993b2f662b08bbe"');
    expect(r.estado.lastModified).toBe('Thu, 06 Aug 2026 14:28:31 GMT');
  });
});

describe('AdaptadorRss — filtro por categoria', () => {
  // Secoes de topo medidas no feed real. Ver ADR-019.
  const SECOES = ['Mercados', 'Onde Investir', 'Economia'];

  it('keeps the market items and drops the political ones', async () => {
    const adaptador = new AdaptadorRss(
      { ...CONFIG, categoriasPermitidas: SECOES },
      { buscar: async () => resposta(fixture('infomoney-com-itens.xml')) },
    );

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    // 8 de 10: os dois descartados sao os marcados apenas como Politica.
    expect(r.itens).toHaveLength(8);
    expect(r.descartados).toHaveLength(2);
    expect(
      r.descartados.every((d) => d.motivo === 'categoria-fora-do-escopo'),
    ).toBe(true);
  });

  it('does not filter when no section is configured', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(fixture('infomoney-com-itens.xml')),
    });
    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    expect(r.itens).toHaveLength(10);
  });

  it('matches ignoring accent and case', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>c</title>
      <item><title>Com acento</title><link>https://x.com/a</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate>
        <category>Ações</category></item>
      <item><title>Sem acento e caixa alta</title><link>https://x.com/b</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate>
        <category>ACOES</category></item>
      <item><title>Fora</title><link>https://x.com/c</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate>
        <category>Culinaria</category></item>
    </channel></rss>`;

    const adaptador = new AdaptadorRss(
      { ...CONFIG, categoriasPermitidas: ['acoes'] },
      { buscar: async () => resposta(xml) },
    );
    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    expect(r.itens.map((i) => i.titulo)).toEqual([
      'Com acento',
      'Sem acento e caixa alta',
    ]);
  });

  it('drops an item with no category at all when filtering is on', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>c</title>
      <item><title>Sem categoria</title><link>https://x.com/a</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate></item>
    </channel></rss>`;

    const adaptador = new AdaptadorRss(
      { ...CONFIG, categoriasPermitidas: ['mercados'] },
      { buscar: async () => resposta(xml) },
    );
    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    expect(r.itens).toHaveLength(0);
    expect(r.descartados[0]?.motivo).toBe('categoria-fora-do-escopo');
  });
});

describe('AdaptadorRss — corpo de materia', () => {
  // CONTEXTO.md secao 3: o Mirante nunca persiste nem processa corpo de materia.
  // O feed do InfoMoney entrega o corpo em <content:encoded>; a garantia e que o
  // esquema Zod nao extrai o campo, entao ele nao existe como variavel.
  it('never carries the article body into any field', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"
        xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel><title>c</title>
      <item><title>Titulo</title><link>https://x.com/a</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate>
        <description>resumo curto do feed</description>
        <content:encoded>CORPO-INTEGRAL-QUE-NAO-PODE-VAZAR</content:encoded>
      </item></channel></rss>`;

    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(xml),
    });
    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    const serializado = JSON.stringify(r.itens, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(serializado).not.toContain('CORPO-INTEGRAL-QUE-NAO-PODE-VAZAR');
    expect(r.itens[0]?.resumo_origem).toBe('resumo curto do feed');
  });
});

describe('AdaptadorRss — envelope valido sem item', () => {
  // Fixture real: https://www.infomoney.com.br/mercados/feed/ devolve 200 com
  // canal valido e zero item. Sucesso com zero item nao e falha, e nao pode ser
  // confundido com falha — mas tambem nao pode ser lido como "coletei tudo".
  it('reports success with zero items, not a failure', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(fixture('infomoney-mercados-vazio.xml')),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);

    expect(r.tipo).toBe('coletado');
    if (r.tipo !== 'coletado') return;
    expect(r.itens).toHaveLength(0);
    expect(r.descartados).toHaveLength(0);
  });
});

describe('AdaptadorRss — resposta malformada', () => {
  it('returns a typed failure instead of throwing', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(fixture('malformado.xml')),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);

    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('formato');
  });

  it('returns a typed failure when the body is not XML at all', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta('<html><body>manutencao</body></html>'),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('formato');
  });

  it('returns a typed failure for an empty body', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(''),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('formato');
  });

  it('discards a bad item without losing the good ones', async () => {
    const misto = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>c</title>
      <item><title>Bom</title><link>https://x.com/bom</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate></item>
      <item><title>Sem link</title>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate></item>
      <item><title></title><link>https://x.com/vazio</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate></item>
      <item><title>Data ruim</title><link>https://x.com/data</link>
        <pubDate>ontem de manha</pubDate></item>
      <item><title>URL ruim</title><link>nao-e-url</link>
        <pubDate>Thu, 06 Aug 2026 14:00:00 +0000</pubDate></item>
    </channel></rss>`;

    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta(misto),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]?.titulo).toBe('Bom');
    expect(r.descartados.map((d) => d.motivo).sort()).toEqual([
      'data-invalida',
      'titulo-vazio',
      'url-invalida',
      'url-invalida',
    ]);
  });
});

describe('AdaptadorRss — 429 e limite de taxa', () => {
  it('returns limite-de-taxa and honours Retry-After in seconds', async () => {
    const agora = new Date('2026-08-06T14:00:00.000Z');
    const adaptador = new AdaptadorRss(CONFIG, {
      agora: () => agora,
      buscar: async () =>
        resposta('', { status: 429, headers: { 'retry-after': '120' } }),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);

    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('limite-de-taxa');
    expect(r.erro.status).toBe(429);
    expect(r.erro.tentarApos?.toISOString()).toBe('2026-08-06T14:02:00.000Z');
  });

  it('opens the circuit so the next cycle does not even try', async () => {
    const agora = new Date('2026-08-06T14:00:00.000Z');
    let chamadas = 0;
    const adaptador = new AdaptadorRss(CONFIG, {
      agora: () => agora,
      buscar: async () => {
        chamadas += 1;
        return resposta('', {
          status: 429,
          headers: { 'retry-after': '120' },
        });
      },
    });

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(chamadas).toBe(1);

    const segunda = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    // Este e o ponto: nao houve segunda requisicao.
    expect(chamadas).toBe(1);
    expect(segunda.tipo).toBe('circuito-aberto');
    if (segunda.tipo !== 'circuito-aberto') return;
    expect(segunda.tentarApos.toISOString()).toBe('2026-08-06T14:02:00.000Z');
  });

  it('opens the circuit even without Retry-After', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta('', { status: 429 }),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    expect(adaptador.estadoDoCircuito).toBe('aberto');
  });
});

describe('AdaptadorRss — requisicao condicional', () => {
  it('sends no conditional header on the first collection', async () => {
    let capturado: HeadersInit | undefined;
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async (_url, init) => {
        capturado = init.headers;
        return resposta(fixture('infomoney-com-itens.xml'));
      },
    });

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);

    const cabecalhos = capturado as Record<string, string>;
    expect(cabecalhos['if-none-match']).toBeUndefined();
    expect(cabecalhos['if-modified-since']).toBeUndefined();
    expect(cabecalhos['user-agent']).toContain('Mirante');
  });

  it('sends If-None-Match and If-Modified-Since when it has state', async () => {
    let capturado: HeadersInit | undefined;
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async (_url, init) => {
        capturado = init.headers;
        return resposta('', { status: 304 });
      },
    });

    await adaptador.coletar({
      etag: 'W/"abc"',
      lastModified: 'Thu, 06 Aug 2026 14:28:31 GMT',
    });

    const cabecalhos = capturado as Record<string, string>;
    expect(cabecalhos['if-none-match']).toBe('W/"abc"');
    expect(cabecalhos['if-modified-since']).toBe(
      'Thu, 06 Aug 2026 14:28:31 GMT',
    );
  });

  it('returns nao-modificado for 304, without parsing anything', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta('', { status: 304 }),
    });

    const r = await adaptador.coletar({ etag: 'W/"abc"', lastModified: null });
    expect(r.tipo).toBe('nao-modificado');
  });

  it('treats 304 as success, closing an almost-open circuit', async () => {
    let status = 500;
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta('', { status }),
    });

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(adaptador.estadoDoCircuito).toBe('fechado');

    status = 304;
    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(adaptador.estadoDoCircuito).toBe('fechado');
  });
});

describe('AdaptadorRss — falha de rede e HTTP', () => {
  it('returns categoria rede when fetch rejects', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => {
        throw new Error('ECONNRESET');
      },
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('rede');
    expect(r.erro.mensagem).toContain('ECONNRESET');
  });

  it('returns categoria http for 500 and reports the status', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta('', { status: 503 }),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('http');
    expect(r.erro.status).toBe(503);
  });

  it('opens the circuit after three consecutive failures', async () => {
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async () => resposta('', { status: 500 }),
    });

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(adaptador.estadoDoCircuito).toBe('fechado');
    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(adaptador.estadoDoCircuito).toBe('fechado');
    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(adaptador.estadoDoCircuito).toBe('aberto');
  });

  it('passes an abort signal, so a hung socket cannot hold the cycle', async () => {
    let recebeuSinal = false;
    const adaptador = new AdaptadorRss(CONFIG, {
      buscar: async (_url, init) => {
        recebeuSinal = init.signal instanceof AbortSignal;
        return resposta(fixture('infomoney-com-itens.xml'));
      },
    });

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(recebeuSinal).toBe(true);
  });
});

describe('interpretarData', () => {
  it('reads RFC 822 as RSS uses it', () => {
    expect(
      interpretarData('Thu, 06 Aug 2026 14:02:14 +0000')?.toISOString(),
    ).toBe('2026-08-06T14:02:14.000Z');
  });

  it('reads the GMT form', () => {
    expect(
      interpretarData('Thu, 06 Aug 2026 14:02:14 GMT')?.toISOString(),
    ).toBe('2026-08-06T14:02:14.000Z');
  });

  it('returns null for absent, empty or unparseable', () => {
    expect(interpretarData(undefined)).toBeNull();
    expect(interpretarData('')).toBeNull();
    expect(interpretarData('   ')).toBeNull();
    expect(interpretarData('ontem de manha')).toBeNull();
  });
});
