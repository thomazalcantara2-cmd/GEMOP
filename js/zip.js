/*
 * Lê um arquivo .zip (como o que o SEI exporta) dentro do navegador, sem biblioteca.
 * lerZip(bytes: Uint8Array) -> Promise<[{ nome, dados: Uint8Array }]>  (pastas são ignoradas)
 * Aceita arquivos sem compressão e comprimidos (deflate), que é o que o SEI e o Windows geram.
 */
(function (global) {
  'use strict';

  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }

  function inflar(dados) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('Este navegador não consegue abrir arquivos .zip compactados. Use o Chrome ou o Edge atualizado.'));
    }
    var fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(fluxo).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  function lerZip(bytes) {
    var fim = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (u32(bytes, i) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) return Promise.reject(new Error('O arquivo não parece ser um .zip válido.'));
    var total = u16(bytes, fim + 10), pos = u32(bytes, fim + 16), entradas = [];
    for (var n = 0; n < total; n++) {
      if (u32(bytes, pos) !== 0x02014b50) break;
      var flags = u16(bytes, pos + 8), metodo = u16(bytes, pos + 10), tam = u32(bytes, pos + 20);
      var tamNome = u16(bytes, pos + 28), tamExtra = u16(bytes, pos + 30), tamComentario = u16(bytes, pos + 32), local = u32(bytes, pos + 42);
      var nome = new TextDecoder((flags & 0x800) ? 'utf-8' : 'windows-1252').decode(bytes.subarray(pos + 46, pos + 46 + tamNome));
      entradas.push({ nome: nome, metodo: metodo, tam: tam, local: local });
      pos += 46 + tamNome + tamExtra + tamComentario;
    }
    return Promise.all(entradas.filter(function (e) { return !/\/$/.test(e.nome); }).map(function (e) {
      var inicio = e.local + 30 + u16(bytes, e.local + 26) + u16(bytes, e.local + 28);
      var comprimido = bytes.subarray(inicio, inicio + e.tam);
      if (e.metodo === 0) return { nome: e.nome, dados: comprimido };
      if (e.metodo === 8) return inflar(comprimido).then(function (d) { return { nome: e.nome, dados: d }; });
      return Promise.reject(new Error('Formato de compressão do .zip não suportado em ' + e.nome + '.'));
    }));
  }

  var api = { lerZip: lerZip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ZipLeitura = api;
})(typeof window !== 'undefined' ? window : this);
