// Enums de dominio do Mirante, transcritos da secao 4 do CONTEXTO.md.
//
// Os valores ficam em portugues porque sao vocabulario do negocio brasileiro
// (CLAUDE.md secao 2): traduzir `tema` ou `licenca` introduziria uma camada de
// traducao mental entre o schema, a interface e a conversa, sem ganho nenhum.
//
// Cada enum e declarado como tupla `as const` mais um tipo derivado. Nao usamos
// `enum` do TypeScript: ele gera objeto em runtime, nao e serializavel de forma
// obvia, e o que precisamos aqui e uniao de literais de string que atravesse
// HTTP e Postgres sem conversao.

export const TIPOS_DE_FONTE = ['rss', 'gdelt', 'oficial'] as const;
export type TipoDeFonte = (typeof TIPOS_DE_FONTE)[number];

export const LICENCAS = ['permissiva', 'restrita', 'desconhecida'] as const;
export type Licenca = (typeof LICENCAS)[number];

/** Regiao de um item: de onde vem a cobertura. */
export const REGIOES_DE_ITEM = ['br', 'global'] as const;
export type RegiaoDeItem = (typeof REGIOES_DE_ITEM)[number];

/**
 * Regiao de um cluster. Diferente da regiao de item de proposito: um fato pode
 * ser coberto pelos dois lados, e `ambos` e essa informacao.
 */
export const REGIOES_DE_CLUSTER = ['br', 'global', 'ambos'] as const;
export type RegiaoDeCluster = (typeof REGIOES_DE_CLUSTER)[number];

export const TEMAS = [
  'juros',
  'inflacao',
  'cambio',
  'fiscal',
  'commodities',
  'resultados',
  'imobiliario',
  'geopolitica',
  'outro',
] as const;
export type Tema = (typeof TEMAS)[number];

export const TIPOS_DE_ENTIDADE = [
  'ticker',
  'fii',
  'instituicao',
  'pessoa',
  'pais',
  'indicador',
] as const;
export type TipoDeEntidade = (typeof TIPOS_DE_ENTIDADE)[number];

export const FONTES_DE_SERIE = ['sgs', 'sidra', 'ipeadata'] as const;
export type FonteDeSerie = (typeof FONTES_DE_SERIE)[number];

export const FREQUENCIAS = ['diaria', 'mensal', 'trimestral'] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

/**
 * Guarda de tipo generica sobre as tuplas acima. Serve para validar valor que
 * chegou de fora sem repetir a lista.
 *
 * A validacao de borda externa (HTTP, RSS, fila, env) e feita com Zod nos
 * adaptadores e nos apps — `domain` e TS puro e nao carrega Zod. Isto aqui e
 * para uso interno e para teste.
 */
export function pertenceA<const T extends readonly string[]>(
  valores: T,
  valor: unknown,
): valor is T[number] {
  return (
    typeof valor === 'string' && (valores as readonly string[]).includes(valor)
  );
}
