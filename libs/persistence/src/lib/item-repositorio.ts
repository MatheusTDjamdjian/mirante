// Repositorio de `item`. Dedup exata na escrita.
//
// CONTEXTO.md secao 5: `url_hash` unico descarta republicacao identica antes de
// qualquer custo computacional. A dedup e no banco, com `ON CONFLICT DO NOTHING`,
// e nao com um `SELECT` antes do `INSERT` — o segundo tem corrida entre a leitura
// e a escrita, e o ciclo de coleta roda concorrente por fonte.

import { paraBigintAssinado, type ItemColetado } from '@mirante/domain';
import type { Kysely } from 'kysely';
import type { Banco } from './banco';

export interface ResultadoDaEscrita {
  /** Itens que entraram no banco. */
  readonly novos: number;
  /** Itens descartados por `url_hash` que ja existia. */
  readonly duplicados: number;
  /** Duplicatas dentro do proprio lote, antes de chegar ao banco. */
  readonly duplicadosNoLote: number;
}

export class ItemRepositorio {
  constructor(private readonly db: Kysely<Banco>) {}

  /**
   * Insere o lote descartando o que ja existe.
   *
   * Deduplica por `url_hash` em memoria antes de enviar. Nao e redundante com o
   * `ON CONFLICT`: o mesmo feed repete o mesmo item na mesma resposta com alguma
   * frequencia, e depender do comportamento do Postgres para conflito dentro da
   * mesma instrucao e depender de detalhe sutil. Deduplicar antes torna o
   * resultado obvio e a contagem honesta.
   */
  async inserirIgnorandoDuplicata(
    itens: readonly ItemColetado[],
  ): Promise<ResultadoDaEscrita> {
    if (itens.length === 0) {
      return { novos: 0, duplicados: 0, duplicadosNoLote: 0 };
    }

    const porHash = new Map<string, ItemColetado>();
    for (const item of itens) {
      if (!porHash.has(item.url_hash)) porHash.set(item.url_hash, item);
    }
    const unicos = [...porHash.values()];
    const duplicadosNoLote = itens.length - unicos.length;

    const inseridos = await this.db
      .insertInto('item')
      .values(
        unicos.map((item) => ({
          fonte_id: item.fonte_id,
          url_canonica: item.url_canonica,
          url_hash: item.url_hash,
          titulo: item.titulo,
          titulo_normalizado: item.titulo_normalizado,
          resumo_origem: item.resumo_origem,
          publicado_em: item.publicado_em,
          idioma: item.idioma,
          regiao: item.regiao,
          // int8 e assinado no Postgres; ver ADR-015.
          simhash: paraBigintAssinado(item.simhash).toString(),
        })),
      )
      .onConflict((oc) => oc.column('url_hash').doNothing())
      .returning('id')
      .execute();

    return {
      novos: inseridos.length,
      duplicados: unicos.length - inseridos.length,
      duplicadosNoLote,
    };
  }

  async contar(): Promise<number> {
    const linha = await this.db
      .selectFrom('item')
      .select((eb) => eb.fn.countAll().as('total'))
      // `count` volta como bigint por causa do parser de int8 (ver conexao.ts).
      .executeTakeFirstOrThrow();
    return Number(linha.total);
  }

  async contarPorFonte(fonteId: string): Promise<number> {
    const linha = await this.db
      .selectFrom('item')
      .select((eb) => eb.fn.countAll().as('total'))
      .where('fonte_id', '=', fonteId)
      .executeTakeFirstOrThrow();
    return Number(linha.total);
  }

  async existePorHash(urlHash: string): Promise<boolean> {
    const linha = await this.db
      .selectFrom('item')
      .select('id')
      .where('url_hash', '=', urlHash)
      .executeTakeFirst();
    return linha !== undefined;
  }
}
