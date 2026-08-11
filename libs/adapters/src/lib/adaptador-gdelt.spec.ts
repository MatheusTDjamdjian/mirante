import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESTADO_DE_COLETA_VAZIO } from '@mirante/domain';
import {
  AdaptadorGdelt,
  CONSULTAS_TEMATICAS,
  ESPERA_ENTRE_CONSULTAS_MS,
  MAXRECORDS_TETO,
  URL_GDELT_DOC,
  type ConfiguracaoGdelt,
} from './adaptador-gdelt';
import {
  codigoDeIdioma,
  IDIOMA_NAO_MAPEADO,
  interpretarSeendate,
} from './gdelt-esquema';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, '..', '..', 'fixtures');
const fixture = (nome: string): string =>
  readFileSync(join(FIXTURES, nome), 'utf8');

// Os artigos da fixture sao de 2026-08-07. `agora` fica no mesmo dia para que o
// teto de idade nao interfira nos testes de parsing.
const AGORA = new Date('2026-08-07T20:00:00.000Z');

const CONFIG: ConfiguracaoGdelt = {
  fonteId: '22222222-2222-2222-2222-222222222222',
  nome: 'GDELT (teste)',
  dominio: 'gdeltproject.org',
  consultas: ['inflation'],
};

/** Nunca espera de verdade: o teste mediria 5s por consulta. */
const semEspera = async (): Promise<void> => undefined;

function resposta(
  corpo: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  return new Response(status === 304 ? null : corpo, {
    status,
    headers: init.headers ?? {},
  });
}

describe('interpretarSeendate', () => {
  // O formato compacto do GDELT. `new Date()` devolve Invalid Date nele, e sem
  // parsing proprio 100% dos itens teriam publicado_em invalido — em silencio,
  // porque o campo existe e parece uma data.
  it('reads the compact GDELT format', () => {
    expect(interpretarSeendate('20260807T181500Z')?.toISOString()).toBe(
      '2026-08-07T18:15:00.000Z',
    );
  });

  it('confirms plain Date cannot read it', () => {
    expect(Number.isNaN(new Date('20260807T181500Z').getTime())).toBe(true);
  });

  it('rejects anything that is not the compact format', () => {
    for (const ruim of [
      undefined,
      '',
      '   ',
      '07/08/2026 15:20',
      '2026-08-07T18:15:00Z',
      '20260807181500Z',
      '20260807T181500',
    ]) {
      expect(interpretarSeendate(ruim)).toBeNull();
    }
  });

  // `Date.UTC` nao rejeita componente fora de faixa: rola em silencio. Sem a
  // conferencia de ida-e-volta, mes 13 viraria janeiro do ano seguinte — data
  // plausivel, seis meses errada, alimentando o decaimento do ranking.
  it.each([
    ['mes 13', '20261307T181500Z'],
    ['mes 00', '20260007T181500Z'],
    ['dia 32', '20260832T181500Z'],
    ['31 de fevereiro', '20260231T181500Z'],
    ['hora 25', '20260807T251500Z'],
    ['minuto 60', '20260807T186000Z'],
    ['segundo 60', '20260807T181560Z'],
  ])('rejects an out-of-range component: %s', (_rotulo, valor) => {
    expect(interpretarSeendate(valor)).toBeNull();
  });

  it('accepts a real leap day', () => {
    expect(interpretarSeendate('20240229T120000Z')?.toISOString()).toBe(
      '2024-02-29T12:00:00.000Z',
    );
  });
});

describe('codigoDeIdioma', () => {
  it('maps the languages observed in the real response', () => {
    expect(codigoDeIdioma('English')).toBe('en');
    expect(codigoDeIdioma('Spanish')).toBe('es');
    expect(codigoDeIdioma('Portuguese')).toBe('pt');
    expect(codigoDeIdioma('Chinese')).toBe('zh');
    expect(codigoDeIdioma('Russian')).toBe('ru');
    expect(codigoDeIdioma('Korean')).toBe('ko');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(codigoDeIdioma('  ENGLISH ')).toBe('en');
  });

  it('returns the visible placeholder for an unmapped language', () => {
    // Nao descarta o item: perder noticia de mercado porque a lista de idiomas
    // esta incompleta seria trocar dado por arrumacao.
    expect(codigoDeIdioma('Kazakh')).toBe(IDIOMA_NAO_MAPEADO);
    expect(codigoDeIdioma(undefined)).toBe(IDIOMA_NAO_MAPEADO);
  });

  it('always returns exactly two characters, as the schema requires', () => {
    for (const nome of ['English', 'Kazakh', undefined, '', 'Klingon']) {
      expect(codigoDeIdioma(nome)).toHaveLength(2);
    }
  });
});

describe('AdaptadorGdelt — resposta valida', () => {
  const criar = (
    sobrescrita: Partial<ConfiguracaoGdelt> = {},
  ): AdaptadorGdelt =>
    new AdaptadorGdelt(
      { ...CONFIG, ...sobrescrita },
      {
        agora: () => AGORA,
        esperar: semEspera,
        buscar: async () => resposta(fixture('gdelt-artlist-valido.json')),
      },
    );

  it('keeps the good articles and discards the broken ones', async () => {
    const r = await criar().coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');

    // 9 artigos na fixture: 6 bons, 3 tortos (sem url, sem titulo, seendate ruim).
    expect(r.itens).toHaveLength(6);
    expect(r.descartados.map((d) => d.motivo).sort()).toEqual([
      'data-invalida',
      'titulo-vazio',
      'url-invalida',
    ]);
  });

  it('marks every item as regiao global', async () => {
    const r = await criar().coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    // O GDELT e o unico lugar do projeto que produz `global`.
    expect(r.itens.every((i) => i.regiao === 'global')).toBe(true);
  });

  it('never carries resumo_origem, because GDELT ships only metadata', async () => {
    const r = await criar().coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    expect(r.itens.every((i) => i.resumo_origem === null)).toBe(true);
  });

  it('parses seendate into publicado_em', async () => {
    const r = await criar().coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    for (const item of r.itens) {
      expect(Number.isNaN(item.publicado_em.getTime())).toBe(false);
    }
    expect(r.itens[0]?.publicado_em.toISOString()).toBe(
      '2026-08-07T18:15:00.000Z',
    );
  });

  it('maps each language to a two-letter code', async () => {
    const r = await criar().coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    const idiomas = r.itens.map((i) => i.idioma);
    expect(idiomas).toContain('en');
    expect(idiomas).toContain('es');
    expect(idiomas).toContain('pt');
    expect(idiomas).toContain('ko');
    // Kazakh nao esta mapeado, e o item foi mantido.
    expect(idiomas).toContain(IDIOMA_NAO_MAPEADO);
    for (const idioma of idiomas) expect(idioma).toHaveLength(2);
  });

  it('normalizes the title with the article domain, not the GDELT domain', async () => {
    const r = await criar().coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    for (const item of r.itens) {
      expect(item.titulo_normalizado).toBe(item.titulo_normalizado.trim());
      expect(item.titulo_normalizado).not.toContain('gdelt');
    }
  });

  it('reports an empty conditional state, because GDELT sends no ETag', async () => {
    const r = await criar().coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    expect(r.estado).toEqual({ etag: null, lastModified: null });
  });

  it('deduplicates the same URL across thematic queries', async () => {
    const adaptador = new AdaptadorGdelt(
      { ...CONFIG, consultas: ['inflation', 'juros', 'tarifa'] },
      {
        agora: () => AGORA,
        esperar: semEspera,
        buscar: async () => resposta(fixture('gdelt-artlist-valido.json')),
      },
    );

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    // Tres consultas devolvendo a mesma resposta: 6 itens, nao 18.
    expect(r.itens).toHaveLength(6);
  });
});

describe('AdaptadorGdelt — parametros da requisicao', () => {
  it('sends exactly the parameters CONTEXTO.md secao 2 documents', async () => {
    let capturada = '';
    const adaptador = new AdaptadorGdelt(CONFIG, {
      agora: () => AGORA,
      esperar: semEspera,
      buscar: async (url) => {
        capturada = url;
        return resposta(fixture('gdelt-artlist-valido.json'));
      },
    });

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    const url = new URL(capturada);

    expect(`${url.origin}${url.pathname}`).toBe(URL_GDELT_DOC);
    expect(url.searchParams.get('mode')).toBe('ArtList');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('sort')).toBe('datedesc');
    expect(url.searchParams.get('timespan')).toBe('24h');
    expect(url.searchParams.get('query')).toBe('inflation');
  });

  it('clamps maxrecords at the documented ceiling of 250', async () => {
    let capturada = '';
    const adaptador = new AdaptadorGdelt(
      { ...CONFIG, maxrecords: 1000 },
      {
        agora: () => AGORA,
        esperar: semEspera,
        buscar: async (url) => {
          capturada = url;
          return resposta(fixture('gdelt-artlist-valido.json'));
        },
      },
    );

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(new URL(capturada).searchParams.get('maxrecords')).toBe(
      String(MAXRECORDS_TETO),
    );
  });

  it('paces the queries, because GDELT allows one request every five seconds', async () => {
    const esperas: number[] = [];
    const adaptador = new AdaptadorGdelt(
      { ...CONFIG, consultas: ['a', 'b', 'c'] },
      {
        agora: () => AGORA,
        esperar: async (ms) => {
          esperas.push(ms);
        },
        buscar: async () => resposta(fixture('gdelt-artlist-valido.json')),
      },
    );

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);

    // Tres consultas, duas esperas: nao espera antes da primeira.
    expect(esperas).toEqual([
      ESPERA_ENTRE_CONSULTAS_MS,
      ESPERA_ENTRE_CONSULTAS_MS,
    ]);
    expect(ESPERA_ENTRE_CONSULTAS_MS).toBeGreaterThan(5_000);
  });

  it('ships the thematic queries CONTEXTO.md asks for', () => {
    expect(CONSULTAS_TEMATICAS.length).toBeGreaterThanOrEqual(6);
    const todas = CONSULTAS_TEMATICAS.join(' ').toLowerCase();
    for (const tema of [
      'interest rate',
      'inflation',
      'exchange rate',
      'tariff',
      'commodities',
      'central bank',
    ]) {
      expect(todas).toContain(tema);
    }
  });
});

describe('AdaptadorGdelt — 429 e limite de taxa', () => {
  // Aceite da Onda 3: "GDELT devolvendo 429 abre o circuito, e o ciclo seguinte
  // nao tenta antes do Retry-After. Comprovado com teste."
  it('returns limite-de-taxa for the real 429 body', async () => {
    const adaptador = new AdaptadorGdelt(CONFIG, {
      agora: () => AGORA,
      esperar: semEspera,
      buscar: async () => resposta(fixture('gdelt-429.txt'), { status: 429 }),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('limite-de-taxa');
    expect(r.erro.status).toBe(429);
  });

  it('opens the circuit, so the next cycle does not even try', async () => {
    let chamadas = 0;
    const adaptador = new AdaptadorGdelt(CONFIG, {
      agora: () => AGORA,
      esperar: semEspera,
      buscar: async () => {
        chamadas += 1;
        return resposta(fixture('gdelt-429.txt'), { status: 429 });
      },
    });

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(chamadas).toBe(1);
    expect(adaptador.estadoDoCircuito).toBe('aberto');

    const segunda = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    // Este e o ponto: nao houve segunda requisicao.
    expect(chamadas).toBe(1);
    expect(segunda.tipo).toBe('circuito-aberto');
  });

  it('falls back to its own backoff, because the 429 carries no Retry-After', async () => {
    // Medido na API real: o 429 nao traz Retry-After, e o content-type vem nulo.
    const adaptador = new AdaptadorGdelt(CONFIG, {
      agora: () => AGORA,
      esperar: semEspera,
      buscar: async () => resposta(fixture('gdelt-429.txt'), { status: 429 }),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'falha') throw new Error('esperava falha');
    expect(r.erro.tentarApos).toBeUndefined();

    const segunda = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (segunda.tipo !== 'circuito-aberto')
      throw new Error('esperava circuito');
    // O breaker calculou a espera sozinho: 30s de base a partir de `agora`.
    expect(segunda.tentarApos.getTime()).toBeGreaterThan(AGORA.getTime());
  });

  it('stops asking the remaining queries once the circuit opens', async () => {
    let chamadas = 0;
    const adaptador = new AdaptadorGdelt(
      { ...CONFIG, consultas: ['a', 'b', 'c', 'd', 'e', 'f'] },
      {
        agora: () => AGORA,
        esperar: semEspera,
        buscar: async () => {
          chamadas += 1;
          return resposta(fixture('gdelt-429.txt'), { status: 429 });
        },
      },
    );

    await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    // 429 abre na primeira. Insistir nas outras cinco foi o que derrubou o
    // acesso por rede durante a Onda 3.
    expect(chamadas).toBe(1);
  });
});

describe('AdaptadorGdelt — respostas ruins', () => {
  it('reports a typed failure when the body is not JSON', async () => {
    // O GDELT responde texto puro em erro de consulta, com status 200.
    const adaptador = new AdaptadorGdelt(CONFIG, {
      agora: () => AGORA,
      esperar: semEspera,
      buscar: async () => resposta('Your query was invalid.'),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('formato');
    expect(r.erro.mensagem).toContain('Your query was invalid');
  });

  it('treats a response without articles as zero items, not a failure', async () => {
    const adaptador = new AdaptadorGdelt(CONFIG, {
      agora: () => AGORA,
      esperar: semEspera,
      buscar: async () => resposta('{}'),
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('coletado');
    if (r.tipo !== 'coletado') return;
    expect(r.itens).toHaveLength(0);
  });

  it('reports categoria rede on connect timeout', async () => {
    // Foi exatamente isto que aconteceu na Onda 3: UND_ERR_CONNECT_TIMEOUT.
    const adaptador = new AdaptadorGdelt(CONFIG, {
      agora: () => AGORA,
      esperar: semEspera,
      buscar: async () => {
        throw new Error('fetch failed');
      },
    });

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
    if (r.tipo !== 'falha') return;
    expect(r.erro.categoria).toBe('rede');
  });

  it('keeps what the other queries brought when one fails', async () => {
    let chamada = 0;
    const adaptador = new AdaptadorGdelt(
      { ...CONFIG, consultas: ['boa', 'ruim'] },
      {
        agora: () => AGORA,
        esperar: semEspera,
        buscar: async () => {
          chamada += 1;
          return chamada === 1
            ? resposta(fixture('gdelt-artlist-valido.json'))
            : resposta('nao e json');
        },
      },
    );

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    // Uma consulta tematica quebrada nao descarta o que as outras trouxeram.
    expect(r.tipo).toBe('coletado');
    if (r.tipo !== 'coletado') return;
    expect(r.itens).toHaveLength(6);
  });

  it('reports the failure when every query failed', async () => {
    const adaptador = new AdaptadorGdelt(
      { ...CONFIG, consultas: ['a', 'b'] },
      {
        agora: () => AGORA,
        esperar: semEspera,
        buscar: async () => resposta('nao e json'),
      },
    );

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    expect(r.tipo).toBe('falha');
  });
});

describe('AdaptadorGdelt — teto de idade', () => {
  it('discards an article older than the ceiling', async () => {
    const adaptador = new AdaptadorGdelt(
      { ...CONFIG, idadeMaximaDias: 1 },
      {
        // Uma semana depois dos artigos da fixture.
        agora: () => new Date('2026-08-14T20:00:00.000Z'),
        esperar: semEspera,
        buscar: async () => resposta(fixture('gdelt-artlist-valido.json')),
      },
    );

    const r = await adaptador.coletar(ESTADO_DE_COLETA_VAZIO);
    if (r.tipo !== 'coletado') throw new Error('esperava coletado');
    expect(r.itens).toHaveLength(0);
    expect(
      r.descartados.filter((d) => d.motivo === 'muito-antigo').length,
    ).toBe(6);
  });
});
