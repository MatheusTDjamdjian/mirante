// Tipos do banco para o Kysely.
//
// Espelham exatamente a migracao do schema canonico. Os enums vem de
// @mirante/domain, entao nao existem duas listas de `tema` para divergir.
//
// Tres coisas nao obvias sobre tipo de coluna aqui:
//
// 1. `numeric` e `bigint` chegam do node-postgres como **string** por default,
//    para nao perder precisao. `conexao.ts` registra parsers que devolvem
//    `number` e `bigint`; os tipos abaixo refletem isso. Sem esses parsers, os
//    tipos aqui estariam mentindo.
// 2. `busca` e coluna gerada. Esta tipada como impossivel de inserir e de
//    atualizar (`never`), para que a tentativa vire erro de compilacao em vez de
//    erro do Postgres em producao.
// 3. `embedding` fica como `string | null`. O pgvector serializa como
//    `'[0.1,0.2,...]'`, e a conversao para `number[]` e trabalho da Onda 4, que
//    e quem passa a escrever nessa coluna.

import type {
  FonteDeSerie,
  Frequencia,
  Licenca,
  RegiaoDeCluster,
  RegiaoDeItem,
  Tema,
  TipoDeEntidade,
  TipoDeFonte,
} from '@mirante/domain';
import type { ColumnType, Generated } from 'kysely';

/** Coluna com default no banco: opcional no insert. */
type ComDefault<T> = Generated<T>;

/** `timestamptz`: sai como Date, entra como Date. */
type Momento = ColumnType<Date, Date, Date>;
type MomentoNulo = ColumnType<Date | null, Date | null, Date | null>;

/** Coluna gerada pelo banco: leitura apenas. */
type SomenteLeitura<T> = ColumnType<T, never, never>;

/** Coluna que pode ser omitida no insert (nao so receber null). */
type Opcional<T> = ColumnType<T | null, T | null | undefined, T | null>;

export interface TabelaFonte {
  id: ComDefault<string>;
  nome: string;
  dominio: string;
  tipo: TipoDeFonte;
  licenca: ComDefault<Licenca>;
  /** 0..1 */
  peso_base: number;
  ativa: ComDefault<boolean>;
  etag: string | null;
  last_modified: string | null;
  ultima_coleta_em: MomentoNulo;
}

export interface TabelaItem {
  id: ComDefault<string>;
  fonte_id: string;
  url_canonica: string;
  url_hash: string;
  titulo: string;
  titulo_normalizado: string;
  /** REGRA DE OURO: nunca sai para a interface. Ver CONTEXTO.md secao 3. */
  resumo_origem: string | null;
  publicado_em: Momento;
  coletado_em: ComDefault<Date>;
  idioma: string;
  regiao: RegiaoDeItem;
  /**
   * Sai como `bigint` (parser de int8). Aceita string na escrita porque o
   * node-postgres nao serializa `BigInt` de forma confiavel, e string e a
   * representacao que o Postgres aceita sem ambiguidade para int8.
   */
  simhash: ColumnType<bigint, bigint | string, bigint | string>;
  /** Escrito a partir da Onda 4. Omitivel no insert ate lá. */
  embedding: Opcional<string>;
  /** Preenchido pelo clustering na Onda 4. */
  cluster_id: Opcional<string>;
  busca: SomenteLeitura<string>;
}

export interface TabelaCluster {
  id: ComDefault<string>;
  titulo_representativo: string;
  resumo_gerado: string | null;
  primeiro_visto_em: Momento;
  ultimo_visto_em: Momento;
  veiculos_distintos: ComDefault<number>;
  tema: Tema | null;
  regiao: RegiaoDeCluster;
  score: ComDefault<number>;
  enrich_hash: string | null;
  enriquecido_em: MomentoNulo;
}

export interface TabelaClusterEntidade {
  cluster_id: string;
  tipo: TipoDeEntidade;
  valor: string;
  /** 0..1, autodeclarada pelo modelo. */
  confianca: number;
}

export interface TabelaSerieMacro {
  codigo: string;
  fonte: FonteDeSerie;
  identificador_externo: string;
  nome: string;
  unidade: string;
  frequencia: Frequencia;
  atualizada_em: MomentoNulo;
}

export interface TabelaSeriePonto {
  codigo: string;
  data: ColumnType<Date, Date | string, Date | string>;
  valor: number;
}

/** Nome de tabela igual ao do banco, em portugues. */
export interface Banco {
  fonte: TabelaFonte;
  item: TabelaItem;
  cluster: TabelaCluster;
  cluster_entidade: TabelaClusterEntidade;
  serie_macro: TabelaSerieMacro;
  serie_ponto: TabelaSeriePonto;
}
