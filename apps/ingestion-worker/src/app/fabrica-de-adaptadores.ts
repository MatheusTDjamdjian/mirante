// Fabrica de adaptadores.
//
// CLAUDE.md secao 5: "sem condicional por tipo de fonte fora da fabrica". Este e
// o unico lugar do projeto onde existe `switch` por `fonte.tipo` — e por isso
// que adicionar uma fonte na Onda 3 nao espalha `if` pelo ciclo de coleta.
//
// A URL do feed nao mora na tabela `fonte`: o schema canonico nao tem coluna para
// ela (CONTEXTO.md secao 4), e o schema esta fechado. Ela vem do catalogo abaixo,
// casado por `(dominio, nome)`.

import type { AdaptadorFonte } from '@mirante/adapters';
import { AdaptadorRss } from '@mirante/adapters';
import type { CodigoIdioma, RegiaoDeItem } from '@mirante/domain';
import type { FonteLinha } from '@mirante/persistence';

export interface EntradaDeCatalogo {
  readonly nome: string;
  readonly dominio: string;
  readonly url: string;
  readonly idioma: CodigoIdioma;
  readonly regiao: RegiaoDeItem;
  /** Secoes editoriais de interesse. Ausente desliga o filtro. */
  readonly categoriasPermitidas?: readonly string[];
}

export class FonteSemCatalogoError extends Error {
  constructor(fonte: FonteLinha) {
    super(
      `Fonte "${fonte.nome}" (${fonte.dominio}) esta no banco mas nao no catalogo. ` +
        'Adicione a entrada em fabrica-de-adaptadores.ts ou desative a fonte.',
    );
    this.name = 'FonteSemCatalogoError';
  }
}

export class TipoDeFonteNaoSuportadoError extends Error {
  constructor(tipo: string) {
    super(`Tipo de fonte sem adaptador: ${tipo}`);
    this.name = 'TipoDeFonteNaoSuportadoError';
  }
}

function chave(dominio: string, nome: string): string {
  return `${dominio}|${nome}`;
}

export class FabricaDeAdaptadores {
  private readonly catalogo: Map<string, EntradaDeCatalogo>;

  constructor(
    entradas: readonly EntradaDeCatalogo[],
    private readonly timeoutMs: number,
  ) {
    this.catalogo = new Map(
      entradas.map((entrada) => [
        chave(entrada.dominio, entrada.nome),
        entrada,
      ]),
    );
  }

  criar(fonte: FonteLinha): AdaptadorFonte {
    const entrada = this.catalogo.get(chave(fonte.dominio, fonte.nome));
    if (entrada === undefined) throw new FonteSemCatalogoError(fonte);

    switch (fonte.tipo) {
      case 'rss':
      case 'oficial':
        // `oficial` (Agencia Brasil, Agencia Gov) tambem entrega RSS. O que
        // muda entre os dois e a licenca, nao o protocolo.
        return new AdaptadorRss({
          fonteId: fonte.id,
          nome: fonte.nome,
          dominio: fonte.dominio,
          url: entrada.url,
          idioma: entrada.idioma,
          regiao: entrada.regiao,
          timeoutMs: this.timeoutMs,
          ...(entrada.categoriasPermitidas !== undefined
            ? { categoriasPermitidas: entrada.categoriasPermitidas }
            : {}),
        });
      case 'gdelt':
        // Onda 3. Falha explicita e melhor que adaptador RSS apontado para JSON.
        throw new TipoDeFonteNaoSuportadoError(
          'gdelt (AdaptadorGdelt entra na Onda 3)',
        );
      default:
        throw new TipoDeFonteNaoSuportadoError(String(fonte.tipo));
    }
  }
}
