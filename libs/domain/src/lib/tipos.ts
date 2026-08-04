// Tipos do schema canonico, transcritos da secao 4 do CONTEXTO.md.
//
// Este arquivo e a fonte unica de verdade do formato do dado no projeto. O
// CLAUDE.md secao 1 fecha o schema nesta onda: alteracao posterior exige ADR em
// docs/DECISOES.md explicando o que a decisao original nao previu.
//
// Nome de coluna em portugues, igual ao banco, de proposito. Nao existe camada
// de mapeamento entre nome de campo TS e nome de coluna SQL — a ausencia dessa
// camada e o que garante que o schema e o tipo nao divirjam em silencio.
//
// Todo campo e `readonly`: o dominio nao muta dado, ele calcula.

import type {
  FonteDeSerie,
  Frequencia,
  Licenca,
  RegiaoDeCluster,
  RegiaoDeItem,
  Tema,
  TipoDeEntidade,
  TipoDeFonte,
} from './enums';

/** `uuid` no Postgres. Alias, sem marca de tipo — ver nota no fim do arquivo. */
export type Uuid = string;

/** sha256 em hexadecimal minusculo, 64 caracteres. */
export type HashSha256 = string;

/** Codigo ISO 639-1 de duas letras, minusculo. `char(2)` no Postgres. */
export type CodigoIdioma = string;

/**
 * Dimensao do embedding. Decisao fechada no CONTEXTO.md secao 7:
 * `multilingual-e5-small`, ONNX local no worker.
 */
export const DIMENSOES_EMBEDDING = 384;

/** `vector(384)`. O comprimento e conferido em runtime, nao pelo tipo. */
export type Embedding = readonly number[];

export interface Fonte {
  readonly id: Uuid;
  readonly nome: string;
  readonly dominio: string;
  readonly tipo: TipoDeFonte;
  readonly licenca: Licenca;
  /** 0..1, credibilidade editorial. Entra na funcao de ranking. */
  readonly peso_base: number;
  readonly ativa: boolean;
  /** Cache condicional. Guardado entre coletas para mandar `If-None-Match`. */
  readonly etag: string | null;
  readonly last_modified: string | null;
  readonly ultima_coleta_em: Date | null;
}

export interface Item {
  readonly id: Uuid;
  readonly fonte_id: Uuid;
  readonly url_canonica: string;
  /** sha256 da URL canonicalizada. Unico: e o dedup exato. */
  readonly url_hash: HashSha256;
  readonly titulo: string;
  /** minusculo, sem acento, sem stopword, sem sufixo de veiculo. */
  readonly titulo_normalizado: string;
  /**
   * Resumo curto que o proprio feed RSS entrega.
   *
   * REGRA DE OURO — CONTEXTO.md secao 3: este campo **nunca** chega a
   * interface. Ele existe apenas para alimentar embedding e clustering. Nenhum
   * DTO de leitura o expoe, nenhum endpoint o serializa.
   */
  readonly resumo_origem: string | null;
  readonly publicado_em: Date;
  readonly coletado_em: Date;
  readonly idioma: CodigoIdioma;
  readonly regiao: RegiaoDeItem;
  /**
   * SimHash de 64 bits sobre `titulo_normalizado`.
   *
   * `bigint` no Postgres e **assinado**. O simhash e naturalmente sem sinal, o
   * que estoura acima de 2^63-1. A conversao mora em `simhash.ts`
   * (`paraBigintAssinado` / `paraSimhashSemSinal`) e a distancia de Hamming e
   * identica nas duas representacoes, porque opera sobre os bits.
   */
  readonly simhash: bigint;
  readonly embedding: Embedding | null;
  readonly cluster_id: Uuid | null;
}

export interface Cluster {
  readonly id: Uuid;
  /** Titulo do item cuja fonte tem o maior `peso_base`. */
  readonly titulo_representativo: string;
  /** Duas frases, autoral, pt-BR. Gerado na Onda 8; nulo antes dela. */
  readonly resumo_gerado: string | null;
  readonly primeiro_visto_em: Date;
  readonly ultimo_visto_em: Date;
  /** Numero de veiculos distintos que cobriram o fato. O sinal do produto. */
  readonly veiculos_distintos: number;
  readonly tema: Tema | null;
  readonly regiao: RegiaoDeCluster;
  readonly score: number;
  /** Hash do conjunto ordenado de membros na ultima passada de enriquecimento. */
  readonly enrich_hash: string | null;
  readonly enriquecido_em: Date | null;
}

export interface ClusterEntidade {
  readonly cluster_id: Uuid;
  readonly tipo: TipoDeEntidade;
  readonly valor: string;
  /** 0..1, autodeclarada pelo modelo. Nao e probabilidade calibrada. */
  readonly confianca: number;
}

export interface SerieMacro {
  /** Codigo interno estavel: 'selic_meta', 'ipca_mensal'. Chave primaria. */
  readonly codigo: string;
  readonly fonte: FonteDeSerie;
  /** Codigo SGS ou parametros SIDRA. Verificado contra a documentacao da fonte. */
  readonly identificador_externo: string;
  readonly nome: string;
  readonly unidade: string;
  readonly frequencia: Frequencia;
  readonly atualizada_em: Date | null;
}

export interface SeriePonto {
  readonly codigo: string;
  readonly data: Date;
  readonly valor: number;
}

// ---------------------------------------------------------------------------
// Notas de transcricao
// ---------------------------------------------------------------------------
//
// 1. `item.busca tsvector` nao aparece aqui. E coluna gerada pelo Postgres
//    (`to_tsvector('portuguese', titulo)`), nunca escrita pela aplicacao.
//    Modela-la em TS convidaria alguem a tentar escrever nela.
//
// 2. `Uuid`, `HashSha256` e `CodigoIdioma` sao aliases de `string`, sem marca de
//    tipo. Marcar daria seguranca contra trocar `fonte_id` por `cluster_id`, ao
//    custo de conversao em toda fronteira. Nao esta no escopo desta onda; se
//    virar problema real, e ADR.
//
// 3. `cluster_entidade` nao tem chave primaria declarada no CONTEXTO.md. A
//    migracao usa `(cluster_id, tipo, valor)`, que e a chave natural e impede
//    entidade duplicada no mesmo cluster. Registrado em docs/DECISOES.md.
