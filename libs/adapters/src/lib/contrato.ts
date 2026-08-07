// Contrato unico de adaptador de fonte.
//
// CLAUDE.md secao 5: interface unica, uma implementacao por fonte, sem
// condicional por tipo de fonte fora da fabrica. Cada adaptador respeita ETag /
// If-Modified-Since, tem timeout explicito, tem circuit breaker que respeita
// Retry-After, falha isolado sem derrubar o ciclo, e emite log estruturado.
//
// `coletar` **nunca lanca**. Falha e variante do resultado, nao excecao. Isso nao
// e preferencia de estilo: "uma fonte quebrada nao pode derrubar o ciclo de
// coleta" (CONTEXTO.md secao 10) e uma garantia que o tipo consegue dar, e
// try/catch espalhado nao.

import type {
  EstadoDeColeta,
  ItemColetado,
  ItemDescartado,
} from '@mirante/domain';

export type CategoriaDeFalha =
  /** Timeout, DNS, conexao recusada, socket cortado. */
  | 'rede'
  /** Status HTTP de erro que nao e 429. */
  | 'http'
  /** 429. Tratado a parte porque e o unico que traz Retry-After. */
  | 'limite-de-taxa'
  /** XML invalido, ou envelope que nao passou no Zod. */
  | 'formato';

export interface FalhaDeColeta {
  readonly categoria: CategoriaDeFalha;
  readonly mensagem: string;
  readonly status?: number;
  /** Quando a fonte autorizou tentar de novo, se ela disse. */
  readonly tentarApos?: Date;
}

export type ResultadoColeta =
  /** `304`: a fonte confirmou que nada mudou. O caminho barato. */
  | { readonly tipo: 'nao-modificado' }
  | {
      readonly tipo: 'coletado';
      readonly itens: readonly ItemColetado[];
      /** ETag e Last-Modified novos, para a proxima requisicao condicional. */
      readonly estado: EstadoDeColeta;
      /** Itens da resposta que nao viraram item. Contados, nao silenciados. */
      readonly descartados: readonly ItemDescartado[];
    }
  | { readonly tipo: 'falha'; readonly erro: FalhaDeColeta }
  /** Curto-circuito: nem tentou, porque o breaker esta aberto. */
  | { readonly tipo: 'circuito-aberto'; readonly tentarApos: Date };

export interface AdaptadorFonte {
  readonly fonteId: string;
  readonly nome: string;
  coletar(estado: EstadoDeColeta): Promise<ResultadoColeta>;
}

/** Metrica de um ciclo de uma fonte. Vira log estruturado no worker. */
export interface MetricaDeColeta {
  readonly fonte_id: string;
  readonly fonte_nome: string;
  readonly resultado: ResultadoColeta['tipo'];
  readonly coletados: number;
  readonly novos: number;
  readonly duplicados: number;
  readonly descartados: number;
  readonly duracao_ms: number;
  readonly status_http?: number;
}
