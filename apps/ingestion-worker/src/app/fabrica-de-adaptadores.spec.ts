import type { FonteLinha } from '@mirante/persistence';
import { CATALOGO } from './catalogo-de-fontes';
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

  it('refuses gdelt until the Onda 3 adapter exists', () => {
    const fabrica = new FabricaDeAdaptadores(
      [{ ...ENTRADA, nome: 'GDELT', dominio: 'gdeltproject.org' }],
      10_000,
    );
    expect(() =>
      fabrica.criar(
        fonte({ tipo: 'gdelt', nome: 'GDELT', dominio: 'gdeltproject.org' }),
      ),
    ).toThrow(TipoDeFonteNaoSuportadoError);
  });
});

describe('CATALOGO da Onda 2', () => {
  it('has exactly one source', () => {
    // PROMPT_ONDAS.md: uma fonte, para provar o contrato antes de multiplicar o
    // erro por cinco. As demais entram na Onda 3.
    expect(CATALOGO).toHaveLength(1);
  });

  it('points at the feed that actually returns items', () => {
    // /mercados/feed devolve 200 com zero itens — verificado, ver ADR-019 e a
    // fixture infomoney-mercados-vazio.xml.
    expect(CATALOGO[0]?.url).toBe('https://www.infomoney.com.br/feed/');
    expect(CATALOGO[0]?.url).not.toContain('/mercados/');
  });

  it('filters by section, so the site-wide feed keeps the market focus', () => {
    expect(CATALOGO[0]?.categoriasPermitidas).toEqual([
      'Mercados',
      'Onde Investir',
      'Economia',
    ]);
  });

  it('every catalogued source resolves to an adapter', () => {
    const fabrica = new FabricaDeAdaptadores(CATALOGO, 10_000);
    for (const entrada of CATALOGO) {
      expect(() =>
        fabrica.criar(fonte({ nome: entrada.nome, dominio: entrada.dominio })),
      ).not.toThrow();
    }
  });
});
