const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/docx.js');

const modelo = {
  cabecalho: { org: 'SECRETARIA TESTE', enderecos: ['Rua A, 1'], logo: null },
  titulo: 'PORTARIA Nº 1/2026',
  blocos: [
    { t: 'p', runs: [{ texto: 'Art. 1º ', negrito: true }, { texto: 'texto com <sinais> & "aspas"' }, { texto: '[falta]', destaque: true }] },
    { t: 'tabela', linhas: [
      [{ runs: [{ texto: 'Nome' }], negrito: true, alinhar: 'center' }, { runs: [{ texto: 'Cargo' }], negrito: true, alinhar: 'left' }],
      [{ runs: [{ texto: 'MARIA' }], alinhar: 'center' }, { runs: [{ texto: 'Agente' }, { texto: '\n' }, { texto: 'Administrativo' }], alinhar: 'left' }]
    ] }
  ],
  local: 'Jaboatão dos Guararapes, 1 de janeiro de 2026', assinaNome: 'FULANO', assinaCargo: 'Secretário'
};

test('crc32 confere com o valor conhecido', () => {
  assert.strictEqual(D.crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('documento escapa o texto e mantém negrito, destaque e tabela', () => {
  const x = D.documento(modelo);
  assert.ok(x.includes('texto com &lt;sinais&gt; &amp; &quot;aspas&quot;'));
  assert.ok(x.includes('<w:b/>'));
  assert.ok(x.includes('w:fill="FFF1A8"'));
  assert.strictEqual((x.match(/<w:tbl>/g) || []).length, 1);
  assert.strictEqual((x.match(/<w:tr>/g) || []).length, 2);
  assert.ok(x.includes('<w:br/>'));
  assert.ok(x.includes('<w:tblHeader/>'));
});

test('pacote .docx é um zip com os arquivos esperados', () => {
  const bytes = D.construirDocx(modelo);
  assert.strictEqual(bytes[0], 0x50); assert.strictEqual(bytes[1], 0x4B);
  const texto = Buffer.from(bytes).toString('latin1');
  ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels'].forEach((n) => assert.ok(texto.includes(n), n));
  assert.ok(!texto.includes('word/media/logo.png'));
});

test('com logotipo o pacote leva a imagem', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 1, 192, 0, 0, 0, 125])]);
  const t = D.tamanhoPNG(Uint8Array.from(png));
  assert.deepStrictEqual(t, { largura: 448, altura: 125 });
  const est = Object.assign({}, modelo, { cabecalho: { org: 'X', enderecos: [], logo: { bytes: Uint8Array.from(png), largura: 448, altura: 125 } } });
  const texto = Buffer.from(D.construirDocx(est)).toString('latin1');
  assert.ok(texto.includes('word/media/logo.png'));
  assert.ok(D.documento(est).includes('r:embed="rIdLogo"'));
});
