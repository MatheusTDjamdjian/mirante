// Superficie publica de @mirante/adapters.
//
// Um adaptador por fonte, contrato unico. Sem dependencia de framework: nem
// Angular, nem Nest. Quem monta os adaptadores e a fabrica, e quem os agenda e o
// ingestion-worker.

export * from './lib/contrato';
export * from './lib/circuito';
export * from './lib/rss-esquema';
export * from './lib/adaptador-rss';
