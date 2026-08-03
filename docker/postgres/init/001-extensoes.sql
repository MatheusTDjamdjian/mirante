-- Executado uma unica vez, na inicializacao de um volume de dados vazio.
-- Existe para que `npm run dev:infra` entregue um banco ja utilizavel, sem
-- exigir migracao antes da primeira query.
--
-- A mesma extensao e criada de forma idempotente pela migracao 001, que e o
-- caminho valido em producao (Railway), onde nao ha entrypoint de init.
-- Local e producao convergem: aqui e conveniencia, a migracao e o contrato.

CREATE EXTENSION IF NOT EXISTS vector;
