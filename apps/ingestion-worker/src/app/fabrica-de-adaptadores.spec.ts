import type { FonteLinha } from '@mirante/persistence';
import { CATALOGO, FONTES_PARA_SEMEAR } from './catalogo-de-fontes';
import {
  FabricaDeAdaptadores,
  FonteSemCatalogoError,
  TipoDeFonteNaoSuportadoError,
  type EntradaDeCatalogo,
} from './fabrica-de-adaptadores';

function fonte(sobrescrita: Partial<FonteLinha> = {}): FonteLinha {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    nome: 'InfoMoney',
    dominio: 'infomoney.com.br',
    tipo: 'rss',
    licenca: 'desconhecida',
    peso_base: 0.8,
    ativa: true,
    etag: null,
    last_modified: null,
    ultima_coleta_em: null,
    ...sobrescrita,
  };
}

const ENTRADA: EntradaDeCatalogo = {
  nome: 'InfoMoney',
  dominio: 'infomoney.com.br',
  url: 'https://www.infomoney.com.br/feed/',
  idioma: 'pt',
  regiao: 'br',
  categoriasPermitidas: ['Mercados'],
};

describe('FabricaDeAdaptadores', () => {
  it('builds an RSS adapter for a catalogued source', () => {
    const fabrica = new FabricaDeAdaptadores([ENTRADA], 10_000);
    const adaptador = fabrica.criar(fonte());

    expect(adaptador.fonteId).toBe('11111111-1111-1111-1111-111111111111');
    expect(adaptador.nome).toBe('InfoMoney');
  });

  it('treats tipo oficial as RSS, because the difference is licence not protocol', () => {
    const fabrica = new FabricaDeAdaptadores([ENTRADA], 10_000);
    expect(() => fabrica.criar(fonte({ tipo: 'oficial' }))).not.toThrow();
  });

  // Fonte no banco e fora do catalogo e erro de configuracao, e tem de aparecer
  // como tal — nao como coleta que devolve zero item para sempre.
  it('fails loudly for a source that is in the database but not catalogued', () => {
    const fabrica = new FabricaDeAdaptadores([], 10_000);
    expect(() => fabrica.criar(fonte())).toThrow(FonteSemCatalogoError);
  });

  it('matches the catalogue by domain AND name', () => {
    const fabrica = new FabricaDeAdaptadores([ENTRADA], 10_000);
    // Mesmo dominio, nome diferente: InfoMoney Mercados e InfoMoney Economia
    // compartilham dominio, entao o dominio sozinho nao identifica a fonte.
    expect(() => fabrica.criar(fonte({ nome: 'InfoMoney Economia' }))).toThrow(
      FonteSemCatalogoError,
    );
  });

  it('builds a GDELT adapter for tipo gdelt', () => {
    const fabrica = new FabricaDeAdaptadores(
      [{ ...ENTRADA, nome: 'GDELT', dominio: 'gdeltproject.org' }],
      10_000,
    );
    const adaptador = fabrica.criar(
      fonte({ tipo: 'gdelt', nome: 'GDELT', dominio: 'gdeltproject.org' }),
    );
    expect(adaptador.nome).toBe('GDELT');
  });

  // O aceite da Onda 3 exige que o ciclo SEGUINTE nao tente antes do
  // Retry-After. O circuit breaker vive na instancia do adaptador, entao criar
  // instancia nova a cada ciclo faria o breaker nascer fechado sempre e proteger
  // so dentro do ciclo. Descoberto medindo, nao lendo.
  it('reuses the same adapter instance across cycles, so the breaker survives', () => {
    const fabrica = new FabricaDeAdaptadores([ENTRADA], 10_000);
    const primeira = fabrica.criar(fonte());
    const segunda = fabrica.criar(fonte());
    expect(segunda).toBe(primeira);
  });

  it('keeps one instance per source, not one shared by all', () => {
    const fabrica = new FabricaDeAdaptadores(
      [ENTRADA, { ...ENTRADA, nome: 'Outra' }],
      10_000,
    );
    const a = fabrica.criar(fonte({ id: 'aaa' }));
    const b = fabrica.criar(fonte({ id: 'bbb', nome: 'Outra' }));
    expect(b).not.toBe(a);
    // Circuito de uma fonte nao pode calar outra: fonte quebrada nao derruba as
    // demais (CONTEXTO.md secao 10).
    expect(a.fonteId).toBe('aaa');
    expect(b.fonteId).toBe('bbb');
  });

  it('refuses a tipo with no adapter', () => {
    const fabrica = new FabricaDeAdaptadores([ENTRADA], 10_000);
    expect(() =>
      // Tipo fora do enum: erro explicito e melhor que adaptador errado.
      fabrica.criar(fonte({ tipo: 'inexistente' as never })),
    ).toThrow(TipoDeFonteNaoSuportadoError);
  });
});

describe('CATALOGO da Onda 3', () => {
  it('has six verified RSS sources plus GDELT', () => {
    expect(CATALOGO).toHaveLength(7);
    expect(
      CATALOGO.filter((e) => e.dominio !== 'gdeltproject.org'),
    ).toHaveLength(6);
  });

  it('has exactly one global source, and it is GDELT', () => {
    // O GDELT e o unico lugar do projeto que produz `regiao='global'`.
    const globais = CATALOGO.filter((e) => e.regiao === 'global');
    expect(globais).toHaveLength(1);
    expect(globais[0]?.dominio).toBe('gdeltproject.org');
  });

  it('keeps GDELT maxrecords well below the ceiling, for balance', () => {
    // Seis consultas com o teto de 250 trariam ate 1.500 artigos por ciclo
    // contra ~20 itens novos dos seis feeds RSS, e o feed viraria cobertura
    // estrangeira com apendice brasileiro. Ver ADR-026.
    const gdelt = CATALOGO.find((e) => e.dominio === 'gdeltproject.org');
    expect(gdelt?.maxrecords).toBeDefined();
    expect(gdelt?.maxrecords).toBeLessThanOrEqual(50);
  });

  it('every entry has a unique name', () => {
    // O par (dominio, nome) identifica a fonte, e as tres do Investing
    // compartilham dominio — entao o nome tem de discriminar.
    expect(new Set(CATALOGO.map((e) => e.nome)).size).toBe(CATALOGO.length);
  });

  // Toda URL abaixo foi verificada contra a fonte real. As tres primeiras
  // asserções guardam correções ao CONTEXTO.md secao 2.
  it('avoids the InfoMoney category feeds, which return zero items', () => {
    const infomoney = CATALOGO.find((e) => e.dominio === 'infomoney.com.br');
    expect(infomoney?.url).toBe('https://www.infomoney.com.br/feed/');
    expect(infomoney?.url).not.toContain('/mercados/');
    expect(infomoney?.url).not.toContain('/economia/');
  });

  // rss.xml da Agencia Brasil e endpoint abandonado: 200, RSS valido,
  // Last-Modified de hoje, conteudo de 2020. Ver ADR-022.
  it('avoids the abandoned Agencia Brasil rss.xml', () => {
    const ab = CATALOGO.find((e) => e.dominio === 'agenciabrasil.ebc.com.br');
    expect(ab?.url).toBe(
      'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
    );
    expect(ab?.url).not.toMatch(/\/rss\.xml$/);
  });

  // A Agencia Gov nao tem indice de feeds — /feed/ e 404 — e o rss.xml dela esta
  // vivo, com itens do dia.
  it('keeps rss.xml for Agencia Gov, which has no section feeds', () => {
    const ag = CATALOGO.find((e) => e.dominio === 'agenciagov.ebc.com.br');
    expect(ag?.url).toBe('https://agenciagov.ebc.com.br/rss.xml');
  });

  it('takes the three Investing feeds CONTEXTO.md asks for', () => {
    const doInvesting = CATALOGO.filter(
      (e) => e.dominio === 'br.investing.com',
    ).map((e) => e.url);
    expect(doInvesting).toEqual([
      'https://br.investing.com/rss/stock.rss',
      'https://br.investing.com/rss/forex.rss',
      'https://br.investing.com/rss/market_overview.rss',
    ]);
  });

  it('only filters by category where the feed actually has categories', () => {
    // Medido: so o InfoMoney traz <category>. Filtro ligado numa fonte sem
    // categoria descartaria 100% dos itens em silencio.
    for (const entrada of CATALOGO) {
      if (entrada.dominio === 'infomoney.com.br') {
        expect(entrada.categoriasPermitidas).toBeDefined();
      } else {
        expect(entrada.categoriasPermitidas).toBeUndefined();
      }
    }
  });

  it('every catalogued source resolves to an adapter', () => {
    const fabrica = new FabricaDeAdaptadores(CATALOGO, 10_000);
    for (const entrada of CATALOGO) {
      expect(() =>
        fabrica.criar(
          fonte({
            nome: entrada.nome,
            dominio: entrada.dominio,
            tipo: entrada.dominio.endsWith('ebc.com.br') ? 'oficial' : 'rss',
          }),
        ),
      ).not.toThrow();
    }
  });
});

describe('FONTES_PARA_SEMEAR', () => {
  it('mirrors the catalogue one to one', () => {
    expect(FONTES_PARA_SEMEAR).toHaveLength(CATALOGO.length);
    expect(FONTES_PARA_SEMEAR.map((f) => f.nome)).toEqual(
      CATALOGO.map((e) => e.nome),
    );
  });

  it('derives tipo from the domain', () => {
    // `oficial` nas agencias da EBC: o que as distingue de `rss` e a licenca, nao
    // o protocolo — as duas entregam RSS e usam o mesmo adaptador.
    for (const fonte of FONTES_PARA_SEMEAR) {
      const esperado =
        fonte.dominio === 'gdeltproject.org'
          ? 'gdelt'
          : fonte.dominio.endsWith('ebc.com.br')
            ? 'oficial'
            : 'rss';
      expect(fonte.tipo).toBe(esperado);
    }
  });

  // Licenca conforme docs/LICENCAS.md, verificada contra os termos de cada fonte.
  it('marks the EBC agencies permissive, per their own terms', () => {
    // "Reproducao autorizada mediante indicacao da fonte" — Termos de Uso do
    // Portal EBC, secao 1(e), consultado em 2026-08-10.
    for (const fonte of FONTES_PARA_SEMEAR) {
      if (fonte.dominio.endsWith('ebc.com.br')) {
        expect(fonte.licenca).toBe('permissiva');
      }
    }
  });

  // PROMPT_ONDAS.md Onda 3: fonte cuja licenca nao foi determinada entra como
  // `desconhecida` e e tratada com a politica mais restritiva.
  it('leaves the undetermined sources as desconhecida', () => {
    for (const fonte of FONTES_PARA_SEMEAR) {
      if (!fonte.dominio.endsWith('ebc.com.br')) {
        expect(fonte.licenca).toBe('desconhecida');
      }
    }
  });

  it('covers every active source in docs/LICENCAS.md', () => {
    // O aceite da Onda 3 exige 100% das fontes ativas cobertas. Este teste guarda
    // o inverso do esquecimento: fonte nova no catalogo sem entrada de licenca
    // cairia no default `desconhecida` em silencio, e aqui isso fica visivel.
    const dominiosCobertos = new Set([
      'agenciabrasil.ebc.com.br',
      'agenciagov.ebc.com.br',
      'infomoney.com.br',
      'br.investing.com',
      'gdeltproject.org',
    ]);
    for (const entrada of CATALOGO) {
      expect(dominiosCobertos.has(entrada.dominio)).toBe(true);
    }
  });

  it('keeps peso_base uniform until the human orders the sources', () => {
    // Ordenar veiculos por credibilidade editorial e juizo do humano, nao
    // decisao de implementacao. Uniforme nao afeta nada antes da Onda 5.
    expect(new Set(FONTES_PARA_SEMEAR.map((f) => f.peso_base)).size).toBe(1);
  });
});
