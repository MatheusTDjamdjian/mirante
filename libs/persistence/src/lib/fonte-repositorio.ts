// Repositorio de `fonte`.
//
// Classe simples com o executor no construtor, sem decorator de framework: o app
// Nest provê a instancia por factory, e o teste de integracao instancia direto.
// Passar uma `Transaction<Banco>` no lugar do `Kysely<Banco>` funciona, porque
// transacao satisfaz a mesma interface — e e assim que a atomicidade do ciclo de
// coleta e obtida sem o repositorio saber que esta numa transacao.

import type { EstadoDeColeta, Licenca, TipoDeFonte } from '@mirante/domain';
import type { Kysely, Selectable } from 'kysely';
import type { Banco, TabelaFonte } from './banco';

export type FonteLinha = Selectable<TabelaFonte>;

export interface FonteParaSemear {
  readonly nome: string;
  readonly dominio: string;
  readonly tipo: TipoDeFonte;
  readonly licenca: Licenca;
  readonly peso_base: number;
  readonly ativa?: boolean;
}

export class FonteRepositorio {
  constructor(private readonly db: Kysely<Banco>) {}

  async buscarAtivas(): Promise<readonly FonteLinha[]> {
    return (
      this.db
        .selectFrom('fonte')
        .selectAll()
        .where('ativa', '=', true)
        // Ordem estavel: o log do ciclo fica comparavel entre execucoes.
        .orderBy('nome', 'asc')
        .execute()
    );
  }

  async buscarPorId(id: string): Promise<FonteLinha | undefined> {
    return this.db
      .selectFrom('fonte')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async buscarPorDominioENome(
    dominio: string,
    nome: string,
  ): Promise<FonteLinha | undefined> {
    return this.db
      .selectFrom('fonte')
      .selectAll()
      .where('dominio', '=', dominio)
      .where('nome', '=', nome)
      .executeTakeFirst();
  }

  /** Estado de cache condicional para a proxima requisicao desta fonte. */
  async estadoDeColeta(id: string): Promise<EstadoDeColeta> {
    const linha = await this.db
      .selectFrom('fonte')
      .select(['etag', 'last_modified'])
      .where('id', '=', id)
      .executeTakeFirst();

    return {
      etag: linha?.etag ?? null,
      lastModified: linha?.last_modified ?? null,
    };
  }

  /**
   * Guarda os headers devolvidos pela fonte e marca a coleta.
   *
   * Chamado tambem quando a resposta foi `304`: `ultima_coleta_em` avanca porque
   * a fonte **foi** consultada, e o painel de saude da Onda 3 precisa distinguir
   * "nao mudou" de "nao consultei".
   */
  async registrarColeta(
    id: string,
    estado: EstadoDeColeta,
    quando: Date,
  ): Promise<void> {
    await this.db
      .updateTable('fonte')
      .set({
        etag: estado.etag,
        last_modified: estado.lastModified,
        ultima_coleta_em: quando,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Insere a fonte se ainda nao existir, e devolve o id em qualquer caso.
   *
   * Idempotente porque o seed roda mais de uma vez na vida do projeto.
   * `(dominio, nome)` e o par que identifica a fonte: `dominio` sozinho nao
   * serve, porque InfoMoney Mercados e InfoMoney Economia compartilham dominio.
   */
  async semear(
    fonte: FonteParaSemear,
  ): Promise<{ id: string; criada: boolean }> {
    const existente = await this.buscarPorDominioENome(
      fonte.dominio,
      fonte.nome,
    );
    if (existente !== undefined) return { id: existente.id, criada: false };

    const inserida = await this.db
      .insertInto('fonte')
      .values({
        nome: fonte.nome,
        dominio: fonte.dominio,
        tipo: fonte.tipo,
        licenca: fonte.licenca,
        peso_base: fonte.peso_base,
        ativa: fonte.ativa ?? true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return { id: inserida.id, criada: true };
  }
}
