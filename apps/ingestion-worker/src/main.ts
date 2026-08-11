// Entrada do ingestion-worker.
//
// Dois modos, um build:
//
//   --uma-vez   roda um ciclo e sai. E o que prova o criterio de aceite central
//               da Onda 2 (rodar duas vezes, a segunda grava zero).
//   (default)   sobe a fila BullMQ e fica agendando.
//
// Um build so de proposito: se o comando manual tivesse entrada propria, o que
// ele prova nao seria o que roda em producao.
//
// Sem NestFactory e sem porta HTTP: este processo nao atende requisicao. O painel
// de saude por HTTP e da Onda 3.
//
// Sem `await` de topo: o webpack do @nx/nest emite CommonJS, e top-level await
// exige saida ESM. A funcao `principal` existe por isso, nao por estilo.

import type { TipoDeFonte } from '@mirante/domain';
import { executarCiclo, TIPOS_GDELT, TIPOS_RSS } from './app/ciclo-unico';
import { iniciarFila } from './app/fila';
import { montar, semear } from './app/montar';

/**
 * `--recorte=rss` ou `--recorte=gdelt`, so com `--uma-vez`.
 *
 * Existe para medir cada cadencia separadamente: o teto de 90s do CONTEXTO.md
 * secao 9 vale por ciclo, e os dois ciclos tem custo muito diferente — o do GDELT
 * e dominado pelo espacamento de 5,5s entre consultas.
 */
function lerRecorte(): { tipos?: readonly TipoDeFonte[]; rotulo?: string } {
  const argumento = process.argv.find((a) => a.startsWith('--recorte='));
  const valor = argumento?.split('=')[1];

  if (valor === 'rss') return { tipos: TIPOS_RSS, rotulo: 'rss' };
  if (valor === 'gdelt') return { tipos: TIPOS_GDELT, rotulo: 'gdelt' };
  return {};
}

async function principal(): Promise<void> {
  const umaVez = process.argv.includes('--uma-vez');
  const app = montar();

  try {
    await semear(app);

    if (umaVez) {
      await executarCiclo(app, lerRecorte());
      await app.encerrar();
      process.exit(0);
    }

    const fila = await iniciarFila(app);

    // Encerramento limpo: sem isto, um deploy no meio de um ciclo deixa job
    // travado em `active` e conexao pendurada no Redis.
    const encerrar = async (sinal: string): Promise<void> => {
      app.logger.info({ sinal }, 'encerrando');
      await fila.encerrar();
      await app.encerrar();
      process.exit(0);
    };

    process.on('SIGTERM', () => void encerrar('SIGTERM'));
    process.on('SIGINT', () => void encerrar('SIGINT'));
  } catch (erro) {
    app.logger.fatal(
      { motivo: erro instanceof Error ? erro.message : String(erro) },
      'worker abortou',
    );
    await app.encerrar();
    process.exit(1);
  }
}

void principal();
