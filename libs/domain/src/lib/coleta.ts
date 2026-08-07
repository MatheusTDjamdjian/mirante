// Formas de dado que atravessam a coleta.
//
// Moram em `domain` porque `adapters` produz e `persistence` consome, e a
// fronteira do CLAUDE.md secao 3 proibe `type:data` importar `type:data`
// (ADR-003). Tipo que os dois precisam sobe para ca — que e o lugar certo de
// qualquer forma, porque isto e vocabulario do dominio, nao detalhe de HTTP nem
// de SQL.

import type { RegiaoDeItem } from './enums';
import type { CodigoIdioma, HashSha256, Uuid } from './tipos';

/**
 * Estado de cache condicional de uma fonte, entre um ciclo e o seguinte.
 *
 * CONTEXTO.md secao 5: requisicao condicional com `ETag` e `If-Modified-Since`
 * sempre, guardando os headers na tabela `fonte`. A maioria dos feeds respeita, e
 * isso derruba trafego e risco de bloqueio numa ordem de magnitude.
 */
export interface EstadoDeColeta {
  readonly etag: string | null;
  readonly lastModified: string | null;
}

export const ESTADO_DE_COLETA_VAZIO: EstadoDeColeta = {
  etag: null,
  lastModified: null,
};

/**
 * Item pronto para gravar, ja normalizado.
 *
 * Nao tem `id` nem `coletado_em`: os dois sao do banco. Nao tem `embedding` nem
 * `cluster_id`: sao das Ondas 4 em diante.
 */
export interface ItemColetado {
  readonly fonte_id: Uuid;
  readonly url_canonica: string;
  readonly url_hash: HashSha256;
  readonly titulo: string;
  readonly titulo_normalizado: string;
  /** REGRA DE OURO: persistido, nunca exibido. CONTEXTO.md secao 3. */
  readonly resumo_origem: string | null;
  readonly publicado_em: Date;
  readonly idioma: CodigoIdioma;
  readonly regiao: RegiaoDeItem;
  readonly simhash: bigint;
}

/** Motivo pelo qual um item da resposta foi descartado antes de virar candidato. */
export type MotivoDeDescarte =
  | 'url-invalida'
  | 'titulo-vazio'
  | 'data-invalida'
  | 'campo-obrigatorio-ausente'
  /**
   * Fonte publica mais que mercado, e o item nao caiu em nenhuma secao de
   * interesse. Filtro grosseiro de proposito — ver ADR-019.
   */
  | 'categoria-fora-do-escopo';

export interface ItemDescartado {
  readonly motivo: MotivoDeDescarte;
  /** O suficiente para achar o item no feed, sem despejar a resposta no log. */
  readonly detalhe: string;
}
