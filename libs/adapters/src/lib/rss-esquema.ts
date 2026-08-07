// Validacao Zod da resposta de um feed RSS.
//
// CLAUDE.md secao 5: "Resposta de terceiro e entrada nao confiavel — GDELT e RSS
// mudam de formato sem avisar, e o sistema precisa falhar de forma explicita e
// isolada, nao silenciosamente propagar `undefined`."
//
// A validacao tem dois niveis, de proposito diferente:
//
//   - O **envelope** e estrito. Se nao existe `rss.channel`, a resposta nao e um
//     feed e a coleta falha com categoria `formato`. Falhar aqui e correto: a
//     fonte mudou de formato e alguem precisa olhar.
//   - O **item** e tolerante. Item ruim vira `ItemDescartado` contado, e nao
//     derruba os outros noventa itens da mesma resposta. Um feed com um item
//     torto e normal; um feed que deixou de ser RSS nao e.

import { z } from 'zod';

/**
 * O fast-xml-parser devolve string quando a tag tem so texto, e objeto com
 * `#text` quando a tag tem atributo tambem. As duas formas aparecem no mesmo
 * feed, na mesma tag, dependendo do item.
 */
const TextoFlexivel = z.union([
  z.string(),
  z
    .object({ '#text': z.union([z.string(), z.number()]) })
    .transform((objeto) => String(objeto['#text'])),
  z.number().transform((numero) => String(numero)),
]);

/**
 * `<category>` vem como string quando ha uma e como array quando ha varias.
 * As duas formas aparecem no mesmo feed.
 */
const CategoriasFlexiveis = z
  .union([TextoFlexivel, z.array(TextoFlexivel)])
  .transform((valor) => (Array.isArray(valor) ? valor : [valor]));

export const EsquemaItemRss = z.object({
  title: TextoFlexivel.optional(),
  link: TextoFlexivel.optional(),
  guid: TextoFlexivel.optional(),
  pubDate: TextoFlexivel.optional(),
  description: TextoFlexivel.optional(),
  category: CategoriasFlexiveis.optional(),

  // `content:encoded` esta deliberadamente AUSENTE deste esquema.
  //
  // O feed do InfoMoney entrega o corpo integral da materia nesse campo — 95%
  // dos 205 KB da resposta. CONTEXTO.md secao 3 proibe persistir ou processar
  // corpo de materia, e a forma mais forte de garantir isso e o Zod nunca
  // extrair o campo: nao existe variavel para alguem usar por engano depois.
});

export type ItemRssValidado = z.infer<typeof EsquemaItemRss>;

export const EsquemaEnvelopeRss = z.object({
  rss: z.object({
    channel: z.object({
      // `item` ausente e feed vazio, nao feed quebrado: canal recem-criado ou
      // filtrado devolve canal sem item, e isso nao e erro.
      item: z.array(z.unknown()).optional().default([]),
    }),
  }),
});

export type EnvelopeRssValidado = z.infer<typeof EsquemaEnvelopeRss>;
