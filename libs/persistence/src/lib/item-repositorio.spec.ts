// Teste de integracao contra Postgres real.
//
// CLAUDE.md secao 6: "Nada de mock de banco. Teste de integracao roda contra
// Postgres real via `docker compose`." Um mock aqui provaria que o mock funciona:
// o que precisa de prova e `ON CONFLICT (url_hash) DO NOTHING`, a transacao, e a
// conversao do simhash para int8 assinado — tres coisas que sao do Postgres, nao
// do TypeScript.
//
// Cada teste roda dentro de uma transacao com ROLLBACK, entao a suite nao deixa
// linha no banco e pode rodar contra a infra de desenvolvimento sem sujar nada.
//
// Sem `docker compose up`, a suite avisa e pula em vez de falhar. A alternativa
// seria fazer o hook de pre-push exigir Docker de pe, o que transformaria o unico
// portao de qualidade do projeto em algo que falha por motivo que nao e codigo.

import {
  paraSimhashSemSinal,
  simhash,
  type ItemColetado,
} from '@mirante/domain';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely, Transaction } from 'kysely';
import type { Banco } from './banco';
import { criarConexao, type ConexaoBanco } from './conexao';
import { FonteRepositorio } from './fonte-repositorio';
import { ItemRepositorio } from './item-repositorio';

/**
 * Le o `.env` da raiz quando `DATABASE_URL` nao veio do ambiente.
 *
 * Sem isto, `nx test persistence` pularia a suite em silencio na maquina de
 * desenvolvimento — o teste existiria e nunca rodaria, que e pior que nao existir.
 */
function urlDoBanco(): string | undefined {
  if (process.env['DATABASE_URL'] !== undefined) {
    return process.env['DATABASE_URL'];
  }
  try {
    process.loadEnvFile(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        '..',
        '.env',
      ),
    );
  } catch {
    return undefined;
  }
  return process.env['DATABASE_URL'];
}

let conexao: ConexaoBanco | undefined;
let alcancavel = false;

beforeAll(async () => {
  const url = urlDoBanco();
  if (url === undefined) return;
  try {
    conexao = criarConexao({ connectionString: url });
    await conexao.db.selectFrom('fonte').select('id').limit(1).execute();
    alcancavel = true;
  } catch {
    if (conexao !== undefined) await conexao.encerrar().catch(() => undefined);
    conexao = undefined;
  }

  if (!alcancavel) {
    console.warn(
      '\n  AVISO  teste de integracao de persistence PULADO: Postgres inalcancavel.\n' +
        '         Rode `npm run dev:infra && npm run db:migrar` para exercita-lo.\n',
    );
  }
}, 30_000);

afterAll(async () => {
  if (conexao !== undefined) await conexao.encerrar();
});

/** Roda o corpo numa transacao e desfaz sempre. */
async function emTransacaoDescartada(
  corpo: (trx: Transaction<Banco>) => Promise<void>,
): Promise<void> {
  const db = conexao?.db as Kysely<Banco>;
  const marcador = new Error('rollback proposital');
  try {
    await db.transaction().execute(async (trx) => {
      await corpo(trx);
      throw marcador;
    });
  } catch (erro) {
    if (erro !== marcador) throw erro;
  }
}

async function semearFonte(trx: Transaction<Banco>): Promise<string> {
  const { id } = await new FonteRepositorio(trx).semear({
    nome: `Fonte de teste ${Math.random().toString(36).slice(2)}`,
    dominio: 'teste.invalid',
    tipo: 'rss',
    licenca: 'desconhecida',
    peso_base: 0.5,
  });
  return id;
}

function item(fonteId: string, n: number): ItemColetado {
  const titulo = `Copom mantem Selic em ${n}%`;
  return {
    fonte_id: fonteId,
    url_canonica: `https://teste.invalid/${n}`,
    url_hash: `hash-de-teste-${n}`,
    titulo,
    titulo_normalizado: `copom mantem selic ${n}`,
    resumo_origem: 'resumo do feed',
    publicado_em: new Date('2026-08-06T14:00:00.000Z'),
    idioma: 'pt',
    regiao: 'br',
    simhash: simhash(`copom mantem selic ${n}`),
  };
}

const seAlcancavel = (): boolean => alcancavel;

describe('ItemRepositorio contra Postgres real', () => {
  it('inserts a batch and reports how many are new', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const fonteId = await semearFonte(trx);
      const r = await new ItemRepositorio(trx).inserirIgnorandoDuplicata([
        item(fonteId, 1),
        item(fonteId, 2),
        item(fonteId, 3),
      ]);
      expect(r).toEqual({ novos: 3, duplicados: 0, duplicadosNoLote: 0 });
    });
  });

  // O criterio central da Onda 2, em teste automatizado.
  it('writes nothing on the second insert of the same batch', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const fonteId = await semearFonte(trx);
      const repositorio = new ItemRepositorio(trx);
      const lote = [item(fonteId, 1), item(fonteId, 2)];

      expect((await repositorio.inserirIgnorandoDuplicata(lote)).novos).toBe(2);

      const segunda = await repositorio.inserirIgnorandoDuplicata(lote);
      expect(segunda.novos).toBe(0);
      expect(segunda.duplicados).toBe(2);
    });
  });

  it('accepts a new item alongside already-known ones', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const fonteId = await semearFonte(trx);
      const repositorio = new ItemRepositorio(trx);

      await repositorio.inserirIgnorandoDuplicata([
        item(fonteId, 1),
        item(fonteId, 2),
      ]);

      // Foi exatamente isto que a segunda execucao real fez: 1 novo, 2 dedup.
      const r = await repositorio.inserirIgnorandoDuplicata([
        item(fonteId, 1),
        item(fonteId, 2),
        item(fonteId, 3),
      ]);
      expect(r.novos).toBe(1);
      expect(r.duplicados).toBe(2);
    });
  });

  it('collapses duplicates inside the same batch', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const fonteId = await semearFonte(trx);
      const r = await new ItemRepositorio(trx).inserirIgnorandoDuplicata([
        item(fonteId, 1),
        item(fonteId, 1),
        item(fonteId, 1),
      ]);
      expect(r).toEqual({ novos: 1, duplicados: 0, duplicadosNoLote: 2 });
    });
  });

  it('does nothing for an empty batch', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const r = await new ItemRepositorio(trx).inserirIgnorandoDuplicata([]);
      expect(r).toEqual({ novos: 0, duplicados: 0, duplicadosNoLote: 0 });
    });
  });

  // ADR-015: int8 e assinado, e o simhash usa os 64 bits. Sem a conversao, cerca
  // de metade dos itens falharia com "value out of range" — de forma
  // intermitente, que e o pior jeito de descobrir.
  it('round-trips a simhash whose unsigned value exceeds 2^63-1', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const fonteId = await semearFonte(trx);
      const grande = 2n ** 64n - 1n;

      await new ItemRepositorio(trx).inserirIgnorandoDuplicata([
        { ...item(fonteId, 99), simhash: grande },
      ]);

      const linha = await trx
        .selectFrom('item')
        .select('simhash')
        .where('url_hash', '=', 'hash-de-teste-99')
        .executeTakeFirstOrThrow();

      expect(typeof linha.simhash).toBe('bigint');
      expect(paraSimhashSemSinal(linha.simhash)).toBe(grande);
    });
  });

  it('lets Postgres generate the tsvector, in portuguese', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const fonteId = await semearFonte(trx);
      await new ItemRepositorio(trx).inserirIgnorandoDuplicata([
        {
          ...item(fonteId, 7),
          titulo: 'O Copom manteve a Selic em 15% ao ano',
        },
      ]);

      const linha = await trx
        .selectFrom('item')
        .select('busca')
        .where('url_hash', '=', 'hash-de-teste-7')
        .executeTakeFirstOrThrow();

      // Stopwords em portugues cairam; o resto ficou.
      expect(linha.busca).toContain('copom');
      expect(linha.busca).toContain('selic');
      expect(linha.busca).not.toContain("'a'");
      expect(linha.busca).not.toContain("'ao'");
    });
  });

  it('counts items per source', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const fonteId = await semearFonte(trx);
      const repositorio = new ItemRepositorio(trx);
      await repositorio.inserirIgnorandoDuplicata([
        item(fonteId, 1),
        item(fonteId, 2),
      ]);
      expect(await repositorio.contarPorFonte(fonteId)).toBe(2);
      expect(typeof (await repositorio.contarPorFonte(fonteId))).toBe('number');
    });
  });
});

describe('FonteRepositorio contra Postgres real', () => {
  it('is idempotent when seeding', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const repositorio = new FonteRepositorio(trx);
      const semente = {
        nome: 'InfoMoney de teste',
        dominio: 'teste.invalid',
        tipo: 'rss' as const,
        licenca: 'desconhecida' as const,
        peso_base: 0.8,
      };

      const primeira = await repositorio.semear(semente);
      expect(primeira.criada).toBe(true);

      const segunda = await repositorio.semear(semente);
      expect(segunda.criada).toBe(false);
      expect(segunda.id).toBe(primeira.id);
    });
  });

  it('stores and returns the conditional-request state', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const repositorio = new FonteRepositorio(trx);
      const fonteId = await semearFonte(trx);

      expect(await repositorio.estadoDeColeta(fonteId)).toEqual({
        etag: null,
        lastModified: null,
      });

      await repositorio.registrarColeta(
        fonteId,
        {
          etag: 'W/"abc"',
          lastModified: 'Thu, 06 Aug 2026 14:28:31 GMT',
        },
        new Date('2026-08-06T15:00:00.000Z'),
      );

      expect(await repositorio.estadoDeColeta(fonteId)).toEqual({
        etag: 'W/"abc"',
        lastModified: 'Thu, 06 Aug 2026 14:28:31 GMT',
      });
    });
  });

  it('reads peso_base as a number, not a string', async () => {
    if (!seAlcancavel()) return;
    await emTransacaoDescartada(async (trx) => {
      const repositorio = new FonteRepositorio(trx);
      const fonteId = await semearFonte(trx);
      const fonte = await repositorio.buscarPorId(fonteId);
      // Sem o parser de numeric registrado em conexao.ts, isto seria '0.500'.
      expect(typeof fonte?.peso_base).toBe('number');
      expect(fonte?.peso_base).toBe(0.5);
    });
  });
});
