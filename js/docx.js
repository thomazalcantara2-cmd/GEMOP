/*
 * Gera um arquivo Word (.docx) da Portaria, sem programas externos: monta o XML do Word e o pacote .zip à mão.
 * Funções puras (não mexem na tela). A tela (portarias-app.js) converte o texto da folha para a estrutura abaixo:
 *   { cabecalho: { org, enderecos: [texto], logo: { bytes: Uint8Array, largura, altura } | null },
 *     titulo, blocos: [ { t: 'p', runs }, { t: 'tabela', linhas: [[ { runs, alinhar: 'left'|'center', negrito } ]] } ],
 *     local, assinaNome, assinaCargo }
 * "runs" é uma lista de { texto, negrito, italico, destaque }; um texto "\n" vira quebra de linha.
 */
(function (global) {
  'use strict';

  var TIMES = 'Times New Roman';

  function xml(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- trechos de texto ----------
  function runXml(r, base) {
    base = base || {};
    var props = '';
    var fonte = base.fonte;
    if (fonte) props += '<w:rFonts w:ascii="' + fonte + '" w:hAnsi="' + fonte + '" w:cs="' + fonte + '"/>';
    if (r.negrito || base.negrito) props += '<w:b/>';
    if (r.italico) props += '<w:i/>';
    if (base.tamanho) props += '<w:sz w:val="' + base.tamanho + '"/><w:szCs w:val="' + base.tamanho + '"/>';
    if (r.destaque) props += '<w:shd w:val="clear" w:color="auto" w:fill="FFF1A8"/>';
    var rpr = props ? '<w:rPr>' + props + '</w:rPr>' : '';
    if (r.texto === '\n') return '<w:r>' + rpr + '<w:br/></w:r>';
    return '<w:r>' + rpr + '<w:t xml:space="preserve">' + xml(r.texto) + '</w:t></w:r>';
  }

  function paragrafo(runs, opc) {
    opc = opc || {};
    var ppr = '';
    if (opc.naoQuebrar) ppr += '<w:keepLines/>';
    ppr += '<w:spacing w:before="' + (opc.antes || 0) + '" w:after="' + (opc.depois || 0) + '" w:line="' + (opc.linha || 360) + '" w:lineRule="auto"/>';
    if (opc.alinhar) ppr += '<w:jc w:val="' + opc.alinhar + '"/>';
    return '<w:p><w:pPr>' + ppr + '</w:pPr>' + (runs || []).map(function (r) { return runXml(r, opc); }).join('') + '</w:p>';
  }

  // ---------- tabela ----------
  function tabela(linhas) {
    var borda = function (lado) { return '<w:' + lado + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>'; };
    var margem = function (lado, v) { return '<w:' + lado + ' w:w="' + v + '" w:type="dxa"/>'; };
    var out = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borda).join('') +
      '</w:tblBorders><w:tblLayout w:type="autofit"/><w:tblCellMar>' +
      margem('top', 100) + margem('left', 142) + margem('bottom', 100) + margem('right', 142) + '</w:tblCellMar></w:tblPr>';
    var colunas = linhas.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
    out += '<w:tblGrid>';
    for (var i = 0; i < colunas; i++) out += '<w:gridCol w:w="' + Math.floor(9638 / colunas) + '"/>';
    out += '</w:tblGrid>';
    linhas.forEach(function (l, n) {
      out += '<w:tr><w:trPr><w:cantSplit/>' + (n === 0 ? '<w:tblHeader/>' : '') + '</w:trPr>';
      l.forEach(function (c) {
        out += '<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>' +
          paragrafo(c.runs, { alinhar: c.alinhar === 'left' ? 'left' : 'center', fonte: TIMES, tamanho: 21, linha: 312, negrito: c.negrito }) + '</w:tc>';
      });
      out += '</w:tr>';
    });
    return out + '</w:tbl>' + paragrafo([], { linha: 240, depois: 0, tamanho: 12 });
  }

  // ---------- documento ----------
  function documento(est) {
    var corpo = '';
    var cab = est.cabecalho;
    if (cab) {
      if (cab.logo) {
        var alt = 864000, larg = Math.round(alt * cab.logo.largura / cab.logo.altura);
        corpo += '<w:p><w:pPr><w:spacing w:before="0" w:after="140" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
          '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + larg + '" cy="' + alt + '"/>' +
          '<wp:docPr id="1" name="Logotipo" descr="Prefeitura do Jaboatão dos Guararapes"/>' +
          '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
          '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
          '<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
          '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + larg + '" cy="' + alt + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
          '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
      }
      corpo += paragrafo([{ texto: cab.org }], { alinhar: 'center', fonte: TIMES, tamanho: 22, linha: 300 });
      (cab.enderecos || []).forEach(function (e) {
        corpo += paragrafo([{ texto: e }], { alinhar: 'center', fonte: TIMES, tamanho: 16, linha: 300 });
      });
    }
    corpo += paragrafo([{ texto: est.titulo }], { alinhar: 'center', fonte: TIMES, tamanho: 25, negrito: true, linha: 312, antes: 510, depois: 510 });
    est.blocos.forEach(function (b) {
      corpo += b.t === 'tabela' ? tabela(b.linhas) : paragrafo(b.runs, { alinhar: 'both', depois: 280 });
    });
    corpo += paragrafo([{ texto: est.local }], { alinhar: 'center', antes: 680, naoQuebrar: true });
    corpo += paragrafo([{ texto: est.assinaNome }], { alinhar: 'center', fonte: TIMES, negrito: true, antes: 454, naoQuebrar: true });
    corpo += paragrafo([{ texto: est.assinaCargo }], { alinhar: 'center', naoQuebrar: true });

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + corpo +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="794" w:right="1134" w:bottom="794" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
  }

  var ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/>' +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';

  var TIPOS_CONTEUDO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';

  var RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

  function relsDocumento(comLogo) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      (comLogo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : '') +
      '</Relationships>';
  }

  // ---------- pacote .zip (sem compressão) ----------
  var TABELA_CRC = null;
  function crc32(bytes) {
    if (!TABELA_CRC) {
      TABELA_CRC = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        TABELA_CRC[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = TABELA_CRC[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }

  // arquivos: [{ nome, dados: Uint8Array }]
  function zip(arquivos) {
    var partes = [], central = [], posicao = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    arquivos.forEach(function (a) {
      var nome = utf8(a.nome), crc = crc32(a.dados), tam = a.dados.length;
      var local = [0x50, 0x4B, 0x03, 0x04].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(tam), u32(tam), u16(nome.length), u16(0));
      partes.push(Uint8Array.from(local), nome, a.dados);
      central.push(Uint8Array.from([0x50, 0x4B, 0x01, 0x02].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(tam), u32(tam),
        u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(posicao))), nome);
      posicao += local.length + nome.length + tam;
    });
    var tamCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
    var fim = Uint8Array.from([0x50, 0x4B, 0x05, 0x06].concat(u16(0), u16(0), u16(arquivos.length), u16(arquivos.length), u32(tamCentral), u32(posicao), u16(0)));
    var todas = partes.concat(central, [fim]);
    var total = todas.reduce(function (s, p) { return s + p.length; }, 0);
    var saida = new Uint8Array(total), p = 0;
    todas.forEach(function (x) { saida.set(x, p); p += x.length; });
    return saida;
  }

  // Devolve os bytes do .docx.
  function construirDocx(est) {
    var logo = est.cabecalho && est.cabecalho.logo;
    var arquivos = [
      { nome: '[Content_Types].xml', dados: utf8(TIPOS_CONTEUDO) },
      { nome: '_rels/.rels', dados: utf8(RELS) },
      { nome: 'word/document.xml', dados: utf8(documento(est)) },
      { nome: 'word/styles.xml', dados: utf8(ESTILOS) },
      { nome: 'word/_rels/document.xml.rels', dados: utf8(relsDocumento(!!logo)) }
    ];
    if (logo) arquivos.push({ nome: 'word/media/logo.png', dados: logo.bytes });
    return zip(arquivos);
  }

  // Largura e altura de um PNG (cabeçalho IHDR).
  function tamanhoPNG(bytes) {
    if (bytes.length < 24 || bytes[1] !== 0x50) return null;
    var v = function (i) { return ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0; };
    return { largura: v(16), altura: v(20) };
  }

  var api = { construirDocx: construirDocx, documento: documento, zip: zip, crc32: crc32, tamanhoPNG: tamanhoPNG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DocxPortaria = api;
})(typeof window !== 'undefined' ? window : this);
