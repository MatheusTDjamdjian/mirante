// Montagem da aplicacao: le configuracao, abre conexao, monta o ciclo.
//
// Existe separado do `main.ts` para que a CLI de coleta unica
// (`npm run coletar:uma-vez`) e o worker de fila usem exatamente o mesmo
// caminho de montagem. Se fossem dois, o que o teste manual prova nao seria o
// que roda em producao.

import { criarConexao, FonteRepositorio } from '@mirante/persistence';
import type { ConexaoBanco } from '@mirante/persistence';
import { CATALOGO, FONTES_PARA_SEMEAR } from './catalogo-de-fontes';
import { CicloDeColeta } from './ciclo-de-coleta';
import { lerConfiguracao, type Configuracao } from './configuracao';
import { FabricaDeAdaptadores } from './fabrica-de-adaptadores';
import { criarGeradorDeCicloId, criarLogger, type Logger } from './log';

export interface Aplicacao {
  readonly configuracao: Configuracao;
  readonly conexao: ConexaoBanco;
  readonly ciclo: CicloDeColeta;
  readonly logger: Logger;
  readonly proximoCicloId: () => string;
  encerrar(): Promise<void>;
}

export function montar(): Aplicacao {
  const configuracao = lerConfiguracao();
  const logger = criarLogger(configuracao);
  const conexao = criarConexao({ connectionString: configuracao.DATABASE_URL });

  const fabrica = new FabricaDeAdaptadores(
    CATALOGO,
    configuracao.TIMEOUT_FONTE_MS,
  );

  return {
    configuracao,
    conexao,
    logger,
    ciclo: new CicloDeColeta(conexao, fabrica, logger),
    proximoCicloId: criarGeradorDeCicloId(),
    async encerrar() {
      await conexao.encerrar();
    },
  };
}

/**
 * Sincroniza a tabela `fonte` com o catalogo. Idempotente.
 *
 * Duas direcoes:
 *
 *   catalogo -> banco   fonte nova e inserida
 *   banco -> catalogo   fonte ativa que saiu do catalogo e **desativada**
 *
 * A segunda direcao existe por experiencia concreta: quando a URL da Agencia
 * Brasil foi corrigida (ADR-022), a linha antiga ficou orfa no banco e passou a
 * produzir `FonteSemCatalogoError` em todo ciclo. Erro que repete a cada ciclo e
 * ruido, e ruido esconde o erro seguinte.
 *
 * Desativa, nao apaga: os itens ja coletados continuam explicaveis.
 */
export async function semear(app: Aplicacao): Promise<void> {
  const repositorio = new FonteRepositorio(app.conexao.db);

  for (const fonte of FONTES_PARA_SEMEAR) {
    const { id, criada } = await repositorio.semear(fonte);
    app.logger.info(
      { fonte_id: id, fonte_nome: fonte.nome, criada },
      criada ? 'fonte semeada' : 'fonte ja existia',
    );
  }

  const noCatalogo = new Set(
    FONTES_PARA_SEMEAR.map((f) => `${f.dominio}|${f.nome}`),
  );

  for (const fonte of await repositorio.buscarAtivas()) {
    if (noCatalogo.has(`${fonte.dominio}|${fonte.nome}`)) continue;
    await repositorio.desativar(fonte.id);
    app.logger.warn(
      { fonte_id: fonte.id, fonte_nome: fonte.nome, dominio: fonte.dominio },
      'fonte ativa fora do catalogo: desativada, itens preservados',
    );
  }
}
