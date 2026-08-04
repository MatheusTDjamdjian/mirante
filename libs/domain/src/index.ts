// Superficie publica de @mirante/domain.
//
// CLAUDE.md secao 3: TS puro, zero dependencia de framework, testavel sem
// browser e sem banco. Se uma logica de negocio estiver sendo escrita dentro de
// um componente Angular ou de um controller Nest, ela esta no lugar errado e o
// destino dela e aqui.

export * from './lib/enums';
export * from './lib/tipos';

export * from './lib/url';
export * from './lib/titulo';
export * from './lib/stopwords';
export * from './lib/simhash';
export * from './lib/ranking';
export * from './lib/clustering';
