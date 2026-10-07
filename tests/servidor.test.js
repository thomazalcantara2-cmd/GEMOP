// Confere que o servidor local (servidor.ps1) entrega todos os tipos de arquivo usados pelas páginas
// (imagens, fontes, scripts). Falha se uma página passar a usar um tipo que o servidor não conhece.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ps = fs.readFileSync(path.join(raiz, 'servidor.ps1'), 'utf8');
const bloco = ps.slice(ps.indexOf('$tipos = @{'), ps.indexOf('}', ps.indexOf('$tipos = @{')));
const entregues = new Set([...bloco.matchAll(/'(\.[a-z0-9]+)'\s*=/g)].map((m) => m[1]));

test('servidor.ps1 entrega os tipos de arquivo usados pelas páginas', () => {
  const faltando = [];
  for (const pagina of ['index.html', 'portarias.html']) {
    const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
    const refs = new Set([
      ...[...html.matchAll(/(?:src|href)="([^"#?]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/url\("([^")]+)"\)/g)].map((m) => m[1])
    ]);
    for (const ref of refs) {
      if (/^(https?:|data:|mailto:)/.test(ref)) continue;
      assert.ok(fs.existsSync(path.join(raiz, ref)), pagina + ' usa um arquivo que não existe: ' + ref);
      if (!entregues.has(path.extname(ref).toLowerCase())) faltando.push(pagina + ' -> ' + ref);
    }
  }
  assert.deepStrictEqual(faltando, [], 'o servidor não entrega: ' + faltando.join(', '));
});

test('servidor.ps1 reconhece imagens webp e jpg (logo e faixa da barra superior)', () => {
  assert.ok(entregues.has('.webp') && entregues.has('.jpg'));
});
