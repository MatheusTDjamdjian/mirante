#!/usr/bin/env node
// Localiza a pagina de Termos de Uso de cada fonte, seguindo os links do proprio
// site em vez de adivinhar caminhos.
//
// Existe como ferramenta e nao como script descartavel porque `docs/LICENCAS.md`
// tem de ser reconferido: termos mudam, e o documento registra a data da consulta
// justamente para que a reconferencia seja possivel.

const UA = 'Mirante/0.1 (+https://github.com/MatheusTDjamdjian/mirante)';

const PADRAO_TERMOS =
  /termos?[- ]?(de[- ])?(uso|servico)|terms[- ](and[- ])?(of[- ])?(use|service|conditions)|condicoes[- ]de[- ]uso|politica[- ]de[- ]privacidade|privacy|copyright|direitos[- ]autorais|licen[cs]a|creative[- ]commons/i;

const PAGINAS = [
  ['InfoMoney', 'https://www.infomoney.com.br/'],
  ['Investing.com BR', 'https://br.investing.com/'],
  ['Agencia Brasil', 'https://agenciabrasil.ebc.com.br/'],
  ['Agencia Gov', 'https://agenciagov.ebc.com.br/'],
  ['GDELT', 'https://www.gdeltproject.org/'],
];

for (const [nome, url] of PAGINAS) {
  console.log(`\n=== ${nome} — ${url} ===`);
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    const html = await r.text();
    console.log(`  status=${r.status}  ${html.length} bytes`);

    const encontrados = new Map();
    for (const [, href, texto] of html.matchAll(
      /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi,
    )) {
      const limpo = texto
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!PADRAO_TERMOS.test(href) && !PADRAO_TERMOS.test(limpo)) continue;
      const absoluto = new URL(href, r.url).toString();
      if (!encontrados.has(absoluto))
        encontrados.set(absoluto, limpo || '(sem texto)');
    }

    if (encontrados.size === 0) {
      console.log('  (nenhum link de termos encontrado)');
      continue;
    }
    for (const [href, texto] of [...encontrados].slice(0, 10)) {
      console.log(`  ${texto.slice(0, 46).padEnd(48)} ${href}`);
    }
  } catch (erro) {
    console.log(
      `  ERRO ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}
