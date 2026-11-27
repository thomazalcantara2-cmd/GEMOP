// ==UserScript==
// @name         Portarias SEI (GEMOP)
// @namespace    https://github.com/thomazalcantara2-cmd/GEMOP
// @version      1.9.0
// @description  Lê o processo no SEI, monta a portaria com as regras do gerador de Portarias (GEMOP) e cria o documento "Portaria" no processo, sem assinatura.
// @author       SEGEP · Prefeitura do Jaboatão dos Guararapes
// @match        *://*/sei/*
// @match        *://sei.jaboatao.pe.gov.br/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/thomazalcantara2-cmd/GEMOP/claude/sei-portarias/sei/portarias-sei.user.js
// @downloadURL  https://raw.githubusercontent.com/thomazalcantara2-cmd/GEMOP/claude/sei-portarias/sei/portarias-sei.user.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js
// @grant        GM_getResourceText
// @resource     GEMOP_PORTARIAS https://raw.githubusercontent.com/thomazalcantara2-cmd/GEMOP/claude/sei-portarias/dist/portarias-embutida.html
// ==/UserScript==

/*
 * Portarias SEI — independente do Archivist e de qualquer servidor.
 *  - O painel é o próprio gerador de Portarias (dist/portarias-embutida.html, gerado por build_standalone.py), aberto num iframe
 *    do SEI: mesmos tipos, campos, regras e textos da página de Portarias. A planilha (FichaContabilis) é lida da pasta escolhida
 *    uma vez, só neste navegador.
 *  - Este script cuida do que só existe no SEI: ler os documentos do processo (sem abri-lo na tela) e, ao confirmar, criar o
 *    documento "Portaria" pelas mesmas telas do SEI (sem clicar), com o corpo montado pelo gerador. Nasce SEM assinatura.
 * Os links do SEI levam um hash de sessão (infra_hash): são lidos da árvore do processo, nunca montados à mão.
 */
(function () {
  'use strict';

  const IS_TOP = window === window.top;
  const TOP = (() => { try { void window.top.document; return window.top; } catch { return window; } })();
  const rootDoc = TOP.document;
  const UI = 'data-gemop-ui';                         // tudo o que criamos na página leva este atributo
  const TIMEOUT_MS = 300000;
  const VERSION = '1.9.0';

  // ── utilidades ──
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const compact = (t) => String(t == null ? '' : t).replace(/[\s ]+/g, ' ').trim();
  const fold = (t) => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const errText = (e) => String((e && e.message) || e || 'erro desconhecido');
  const decode = (s) => String(s || '').replace(/&amp;/g, '&');
  const param = (name, href) => { try { return new URL(href).searchParams.get(name); } catch { return null; } };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ── rede (sessão do usuário; o SEI responde em ISO-8859-1) ──
  let trace = null;   // medição: páginas abertas por documento
  async function requestRaw(url, opts = {}) {
    const T = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, { credentials: 'same-origin', signal: ctrl.signal, ...opts });
      if (!resp.ok) throw new Error('o SEI respondeu ' + resp.status);
      const buf = await resp.arrayBuffer();
      if (trace) trace.push({ a: (String(url).match(/acao=([^&]*)/) || [])[1] || '?', ms: Date.now() - T, kb: Math.round(buf.byteLength / 1024), t: (resp.headers.get('content-type') || '').split(';')[0] });
      return { buf, url: resp.url || url, type: resp.headers.get('content-type') || '' };
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('o SEI demorou demais para responder');
      throw e;
    } finally { clearTimeout(timer); }
  }
  async function request(url, opts = {}) {
    const r = await requestRaw(url, opts);
    return { html: new TextDecoder('windows-1252').decode(r.buf), url: r.url, type: r.type };
  }

  // Corpo de formulário em ISO-8859-1. O que passa de U+00FF (travessão, aspas curvas) vira referência numérica nos campos de HTML.
  const KEEP = /[A-Za-z0-9\-_.*]/;
  function encode(text, htmlMode) {
    let out = '';
    const put = (ch) => { out += KEEP.test(ch) ? ch : (ch === ' ' ? '+' : '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')); };
    for (const ch of String(text == null ? '' : text)) {
      const cp = ch.codePointAt(0);
      if (cp <= 0xff) { put(ch); continue; }
      if (htmlMode) { for (const c of '&#' + cp + ';') put(c); continue; }
      const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      for (const c of ([...base].every(x => x.codePointAt(0) <= 0xff) && base) ? base : '?') put(c);
    }
    return out;
  }
  const body = (pairs, htmlNames = []) => pairs.map(([k, v]) => encode(k, false) + '=' + encode(v, htmlNames.includes(k))).join('&');

  function formOf(html, selector, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.querySelector(selector);
    if (!el) return null;
    return { doc, el, action: new URL(decode(el.getAttribute('action') || ''), baseUrl).href, fd: new FormData(el) };
  }
  let lastDebug = '';
  const post = (form, htmlNames = []) => request(form.action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: (lastDebug = 'POST ' + (form.action.match(/acao=[^&]*/) || [''])[0] + ' · campos enviados: ' + [...form.fd.entries()].filter(([, v]) => typeof v === 'string').map(([k]) => k).join(','), body([...form.fd.entries()].filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v]), htmlNames)) });   // campos de arquivo não vão: o SEI trata a presença deles como anexo
  // Envio "como o navegador": multipart, com o campo de arquivo presente e vazio (o SEI da unidade pode exigir isso na Portaria)
  const postMultipart = (form) => {
    const fd = new FormData();
    for (const [k, v] of form.fd.entries()) fd.append(k, v);
    const arquivos = [...form.el.querySelectorAll('input[type=file]')].map(i => i.getAttribute('name')).filter(Boolean);
    for (const n of arquivos) if (!fd.has(n)) fd.append(n, new File([], ''));
    lastDebug = 'POST(multipart) ' + (form.action.match(/acao=[^&]*/) || [''])[0] + ' · arquivos: ' + (arquivos.join(',') || 'nenhum');
    return request(form.action, { method: 'POST', body: fd });
  };
  const alertOf = (html) => { const m = /alert\(\s*['"]([^'"]{3,240})['"]/.exec(html); return m ? m[1] : ''; };

  // Link de uma ação (do processo, sem id_documento) dentro de um texto da árvore
  function actionLink(html, acao, idProc) {
    const re = new RegExp('controlador\\.php\\?acao=' + acao + '&[^"\'\\s\\\\<>]*', 'g');
    for (const m of html.match(re) || []) {
      const href = decode(m);
      let p; try { p = new URL(href, 'http://x/').searchParams; } catch { continue; }
      if (p.has('id_documento')) continue;
      if (idProc && p.get('id_procedimento') && p.get('id_procedimento') !== String(idProc)) continue;
      return href;
    }
    return null;
  }

  // Árvore do processo { arvore, arvoreUrl, sigiloso }. item: { id, href } (lista do Controle) ou { id, arvoreUrl } (processo aberto).
  async function readTree(item) {
    let arvoreUrl, arvore;
    if (item.arvoreUrl) { arvoreUrl = item.arvoreUrl; arvore = (await request(arvoreUrl)).html; }
    else {
      const t = (await request(item.href)).html;
      const src = new DOMParser().parseFromString(t, 'text/html').querySelector('#ifrArvore')?.getAttribute('src');
      arvoreUrl = src ? new URL(decode(src), item.href).href : (/acao=procedimento_visualizar/.test(t) ? item.href : null);
      if (!arvoreUrl) throw new Error('não achei a árvore do processo (acesso negado ou tela diferente)');
      arvore = src ? (await request(arvoreUrl)).html : t;
    }
    const todas = (arvore.match(/controlador\.php\?acao=procedimento_visualizar&[^"'\s\\<>]*abrir_pastas=1[^"'\s\\<>]*/) || [])[0];
    if (todas) { try { const u = new URL(decode(todas), arvoreUrl).href; arvore = (await request(u)).html; arvoreUrl = u; } catch { /* segue com a inicial */ } }
    const raiz = (arvore.match(/Nos\[0\]\s*=\s*new infraArvoreNo\([^\n]*/) || [''])[0];
    return { arvore, arvoreUrl, sigiloso: /sigil/i.test(raiz) };
  }

  // Documentos da árvore: [{ id, href, title }]
  function treeDocs(arvore, arvoreUrl) {
    const re = /new infraArvoreNo\(\s*"DOCUMENTO"\s*,\s*"(\d+)"\s*,[^,]*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"[^"]*"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
    const out = []; let m;
    while ((m = re.exec(arvore))) {
      let href = '';
      try { href = new URL(decode(m[2].replace(/\\\//g, '/')), arvoreUrl).href; } catch { continue; }
      out.push({ id: m[1], href, title: m[3].replace(/\\(.)/g, '$1') });
    }
    return out;
  }

  // ── leitura dos documentos (HTML do corpo de cada documento interno) ──
  const SAFE = /acao=(arvore_visualizar|documento_visualizar)(&|$)/;
  async function docHtml(url, wantId, depth = 0, seen = new Set()) {
    seen.add(url);
    const raw = await requestRaw(url);
    if (/pdf/i.test(raw.type)) return { pdf: raw.buf, inner: true };                 // anexo em PDF: o texto sai em pdfText()
    if (!/html/i.test(raw.type)) return null;
    const r = { html: new TextDecoder('windows-1252').decode(raw.buf), url: raw.url, type: raw.type };
    const doc = new DOMParser().parseFromString(r.html, 'text/html');
    if (depth < 3) {
      const cand = new Set();
      for (const f of doc.querySelectorAll('iframe')) { const src = f.getAttribute('src'); if (src && !/ifrDownload|ifrPasta/i.test(f.id || f.name || '')) cand.add(src); }
      for (const u of r.html.match(/controlador\.php\?acao=[a-z_]+[^"'\s<>]*id_documento=\d+[^"'\s<>]*/g) || []) cand.add(decode(u));
      for (const c of cand) {
        let next; try { next = new URL(c, url).href; } catch { continue; }
        const nid = param('id_documento', next);
        if (wantId && nid && nid !== wantId) continue;
        if (seen.has(next) || next === url || !/acao=[a-z_]*(visualizar|conteudo|exibir|download_anexo)[a-z_]*(&|$)/.test(next)) continue;
        if (/(excluir|assinar|cancelar|alterar|remover|enviar|concluir|gerar|incluir|consultar|cadastrar)/.test(next.split('?')[0] + '?' + (next.match(/acao=[^&]*/) || [''])[0])) continue;
        const inner = await docHtml(next, wantId, depth + 1, seen).catch(() => null);
        if (inner && inner.pdf) return inner;
        if (inner && inner.inner && compact(inner.html.replace(/<[^>]*>/g, ' ')).length > 40) return inner;
      }
    }
    return { html: r.html, inner: depth > 0 };
  }

  // Texto de um PDF com camada de texto (pdf.js, no navegador). PDF digitalizado (só imagem) devolve '' — não há OCR aqui.
  async function pdfText(buf) {
    if (typeof pdfjsLib === 'undefined') return '';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    let out = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    const letras = out.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length;
    return letras >= 40 ? out : '';
  }
  const htmlOfText = (t) => '<html><body>' + String(t).split(/\n+/).map(l => compact(l)).filter(Boolean).map(l => '<p>' + esc(l) + '</p>').join('') + '</body></html>';

  // Nomes no estilo do zip do SEI ("[03]-1110422_Ficha_Funcional.html"), que o gerador já sabe ler
  function fileName(i, doc) {
    const m = /^(.*?)\s*\((\d{3,})\)\s*$/.exec(doc.title) || [null, doc.title, doc.id];
    return '[' + String(i + 1).padStart(2, '0') + ']-' + m[2] + '_' + compact(m[1]).replace(/[^A-Za-z0-9ÀÁÂÃÇÉÊÍÓÔÕÚàáâãçéêíóôõú]+/g, '_') + '.html';
  }
  // Cadastro do processo ("Consultar/Alterar Processo"): tipo, especificação e interessados — de onde sai o servidor quando só há PDFs
  async function readMeta(t, item) {
    try {
      const link = actionLink(t.arvore, 'procedimento_alterar', item.id);
      if (!link) return { contexto: '', interessados: [] };
      const r = await request(new URL(link, t.arvoreUrl).href);
      const doc = new DOMParser().parseFromString(r.html, 'text/html');
      const tipo = doc.querySelector('#selTipoProcedimento option[selected], #selTipoProcedimento option:checked');
      const txt = (doc.querySelector('#txtDescricao') || {}).value || '';
      const inter = [...doc.querySelectorAll('#selInteressados option')].map(o => compact(o.textContent)).filter(Boolean);
      return { contexto: [tipo && compact(tipo.textContent), compact(txt)].filter(Boolean).join(' · '), interessados: inter };
    } catch { return { contexto: '', interessados: [] }; }
  }

  // ── ZIP do processo: o SEI monta e entrega todos os documentos de uma vez (bem mais rápido que abrir página por página) ──
  const ZIP_LIMITE_MS = 150000;   // passou disso: cai na leitura documento por documento (que num processo grande leva ainda mais)
  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
  async function inflar(dados) {
    if (typeof DecompressionStream === 'undefined') throw new Error('o navegador não abre ZIP compactado');
    return new Uint8Array(await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  async function lerZip(bytes) {
    let fim = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error('o arquivo não parece um ZIP');
    const total = u16(bytes, fim + 10); let pos = u32(bytes, fim + 16); const entradas = [];
    for (let n = 0; n < total; n++) {
      if (u32(bytes, pos) !== 0x02014b50) break;
      const flags = u16(bytes, pos + 8), metodo = u16(bytes, pos + 10), tam = u32(bytes, pos + 20);
      const tn = u16(bytes, pos + 28), te = u16(bytes, pos + 30), tc = u16(bytes, pos + 32), local = u32(bytes, pos + 42);
      entradas.push({ nome: new TextDecoder((flags & 0x800) ? 'utf-8' : 'windows-1252').decode(bytes.subarray(pos + 46, pos + 46 + tn)), metodo, tam, local });
      pos += 46 + tn + te + tc;
    }
    const out = [];
    for (const e of entradas) {
      if (/\/$/.test(e.nome) || !/\.(html?|pdf)$/i.test(e.nome)) continue;   // só o que interessa: documentos e PDFs
      const ini = e.local + 30 + u16(bytes, e.local + 26) + u16(bytes, e.local + 28), comp = bytes.subarray(ini, ini + e.tam);
      if (e.metodo === 0) out.push({ nome: e.nome, dados: comp });
      else if (e.metodo === 8) out.push({ nome: e.nome, dados: await inflar(comp) });
      else throw new Error('compressão de ZIP não suportada');
    }
    return out;
  }
  function htmlDoZip(bytes) {   // o SEI entrega ISO-8859-1; só usa UTF-8 se o próprio arquivo disser
    const inicio = new TextDecoder('windows-1252').decode(bytes.subarray(0, 2000));
    return new TextDecoder(/charset=["']?utf-8/i.test(inicio) ? 'utf-8' : 'windows-1252').decode(bytes);
  }
  // Pede o ZIP ("Gerar Arquivo ZIP do Processo", todos os documentos) e devolve { buf, ms: {...} }. Lança se algo falhar.
  async function baixarZip(t, item) {
    const T0 = Date.now();
    const link = actionLink(t.arvore, 'procedimento_gerar_zip', item.id);
    if (!link) throw new Error('o SEI não oferece "Gerar ZIP" neste processo');
    const telaUrl = new URL(link, t.arvoreUrl).href;
    const tela = await request(telaUrl);
    const form = new DOMParser().parseFromString(tela.html, 'text/html').querySelector('#frmProcedimentoZip');
    if (!form) throw new Error('a tela de ZIP do SEI veio diferente do esperado');
    const params = new URLSearchParams(new FormData(form));
    params.set('rdoTipo', 'T'); params.set('hdnFlagGerar', '1');
    const acaoForm = new URL(decode(form.getAttribute('action') || ''), telaUrl).href;
    const T1 = Date.now();
    const resp = await request(acaoForm, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const m = /getElementById\(\s*['"]ifrDownload['"]\s*\)\.src\s*=\s*['"]([^'"]+)['"]/.exec(resp.html);
    if (!m) throw new Error(alertOf(resp.html) ? 'o SEI recusou: ' + alertOf(resp.html) : 'o SEI não devolveu o arquivo');
    const T2 = Date.now();
    const arq = await requestRaw(new URL(decode(m[1]), acaoForm).href);
    return { buf: arq.buf, ms: { preparar: T1 - T0, gerar: T2 - T1, baixar: Date.now() - T2 } };
  }

  async function readProcess(item, onStep) {
    const T0 = Date.now();
    onStep('Lendo a árvore do processo...');
    const t = await readTree(item);
    const T1 = Date.now();
    if (t.sigiloso) throw new Error('processo sigiloso: não é lido');
    const todos = treeDocs(t.arvore, t.arvoreUrl);
    if (!todos.length) throw new Error('não achei documentos na árvore do processo');
    const docs = todos.filter(d => SAFE.test(d.href)).slice(0, 80);
    const titulos = todos.map(d => (/^(.*?)\s*\((\d{3,})\)\s*$/.exec(d.title) || [null, d.title])[1]);   // títulos de TODOS os documentos, inclusive PDFs
    const arquivos = [], pdfs = { lidos: 0, digitalizados: 0, falhas: 0 }, lentos = []; let msPdf = 0;
    // 1º: o ZIP do processo. Se falhar, passar de ZIP_LIMITE_MS ou vier sem documentos, lê documento por documento.
    let viaZip = '';
    try {
      onStep('Baixando o processo (ZIP)...');
      const z = await Promise.race([baixarZip(t, item), new Promise((_, no) => setTimeout(() => no(new Error('o ZIP demorou mais de ' + ZIP_LIMITE_MS / 1000 + ' s')), ZIP_LIMITE_MS))]);
      const P0 = Date.now();
      const entradas = await lerZip(new Uint8Array(z.buf));
      for (const e of entradas) {
        if (/\.pdf$/i.test(e.nome)) {
          try {
            const texto = await pdfText(e.dados.buffer.slice(e.dados.byteOffset, e.dados.byteOffset + e.dados.byteLength));
            if (texto) { pdfs.lidos++; arquivos.push({ nome: e.nome.replace(/\.pdf$/i, '.html'), html: htmlOfText(texto) }); } else pdfs.digitalizados++;
          } catch { pdfs.falhas++; }
        } else arquivos.push({ nome: e.nome, html: htmlDoZip(e.dados) });
      }
      msPdf = Date.now() - P0;
      if (!arquivos.length && !pdfs.digitalizados) throw new Error('o ZIP veio sem documentos');
      const sg = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
      viaZip = 'ZIP ' + (z.buf.byteLength / 1024 < 1024 ? Math.round(z.buf.byteLength / 1024) + ' KB' : (z.buf.byteLength / 1048576).toFixed(1).replace('.', ',') + ' MB') + ': preparar ' + sg(z.ms.preparar) + ' · gerar ' + sg(z.ms.gerar) + ' · baixar ' + sg(z.ms.baixar) + ' · abrir ' + sg(msPdf);
    } catch (e) {
      arquivos.length = 0; pdfs.lidos = pdfs.digitalizados = pdfs.falhas = 0; viaZip = ''; msPdf = 0;
      try { console.warn('[Portarias SEI] ZIP indisponível, lendo documento por documento: ' + errText(e)); } catch { /* ignora */ }
      var motivoZip = errText(e);
    }
    for (let i = 0; i < (viaZip ? 0 : docs.length); i++) {
      onStep('Lendo os documentos (' + (i + 1) + ' de ' + docs.length + ')...');
      const D0 = Date.now();
      trace = [];
      const h = await docHtml(docs[i].href, docs[i].id).catch(() => null);
      const reqs = trace; trace = null;
      lentos.push({ reqs, t: (/^(.*?)\s*\(\d{3,}\)\s*$/.exec(docs[i].title) || [null, docs[i].title])[1], ms: Date.now() - D0, pdf: !!(h && h.pdf) });
      if (h && h.pdf) {
        try {
          const P0 = Date.now();
          const texto = await pdfText(h.pdf);
          msPdf += Date.now() - P0; lentos[lentos.length - 1].ms += Date.now() - P0;
          if (texto) { pdfs.lidos++; arquivos.push({ nome: fileName(i, docs[i]), html: htmlOfText(texto) }); } else pdfs.digitalizados++;
        } catch { pdfs.falhas++; }
      } else if (h && h.html && h.inner) arquivos.push({ nome: fileName(i, docs[i]), html: h.html });
    }
    const T2 = Date.now();
    onStep('Lendo o cadastro do processo...');
    const meta = await readMeta(t, item);
    const T3 = Date.now(), seg = (a, b) => ((b - a) / 1000).toFixed(1).replace('.', ',') + ' s';
    const tempo = 'lido em ' + seg(T0, T3) + (viaZip ? ' pelo ZIP (árvore ' + seg(T0, T1) + ' · ' + viaZip + ' · cadastro ' + seg(T2, T3) + ')' : ' documento por documento' + (motivoZip ? ' (ZIP: ' + motivoZip + ')' : '') + ' (árvore ' + seg(T0, T1) + ' · ' + docs.length + ' documentos ' + seg(T1, T2) + (msPdf ? ', dos quais PDFs ' + seg(0, msPdf) : '') + ' · cadastro ' + seg(T2, T3) + ')');
    const relatorio = 'RELATÓRIO DE TEMPO — Portarias SEI v' + VERSION + '\n' + tempo + '\n' + lentos.map((x, i) => (i + 1) + '. ' + x.t + (x.pdf ? ' [PDF]' : '') + ' — ' + seg(0, x.ms) + ' — ' + x.reqs.length + ' pág.: ' + x.reqs.map(r => r.a + ' ' + r.ms + 'ms ' + r.kb + 'KB').join(' → ')).join('\n');
    const maisLentos = lentos.slice().sort((a, b) => b.ms - a.ms).slice(0, 5).map(x => x.t + (x.pdf ? ' [PDF]' : '') + ' ' + seg(0, x.ms)).join(' | ');
    try { console.log('[Portarias SEI] ' + tempo + ' · mais lentos: ' + maisLentos); } catch { /* ignora */ }
    return { tempo, relatorio, mediaPag: lentos.length ? (lentos.reduce((n, x) => n + x.reqs.length, 0) / lentos.length) : 0, maisLentos, arquivos, titulos, contexto: [item.contexto, meta.contexto].filter(Boolean).join(' · '), interessados: meta.interessados, processo: item.num || '', pdfs, t };
  }

  // ── criar a Portaria (tipo, cadastro Público, texto no editor) ──
  // Devolve { docId, numero, titulo, url, gravado, aviso, nota }. Depois que o documento existe, falhas voltam em "aviso" (não lançam).
  async function createPortaria(item, bodyHtml, numero) {
    const t = await readTree(item);
    if (t.sigiloso) throw new Error('processo sigiloso');
    const antes = new Set(treeDocs(t.arvore, t.arvoreUrl).map(d => d.id));
    const linkTipo = actionLink(t.arvore, 'documento_escolher_tipo', item.id);
    if (!linkTipo) throw new Error('o SEI não oferece "Incluir Documento" para você neste processo (processo fechado ou de outra unidade)');
    let r = await request(new URL(linkTipo, t.arvoreUrl).href);
    let form = formOf(r.html, '#frmDocumentoEscolherTipo', r.url);
    if (!form) throw new Error('a tela de tipos de documento do SEI veio diferente do esperado');
    if (form.fd.has('hdnFiltroSerie') && form.fd.get('hdnFiltroSerie') !== 'T') {
      form.fd.set('hdnFiltroSerie', 'T');
      r = await post(form);
      form = formOf(r.html, '#frmDocumentoEscolherTipo', r.url);
      if (!form) throw new Error('a lista completa de tipos de documento veio diferente do esperado');
    }
    const tipos = new Map();
    for (const a of form.doc.querySelectorAll("[onclick*='escolher(']")) {
      const id = /escolher\((-?\d+)\)/.exec(a.getAttribute('onclick') || '')?.[1];
      if (id && !tipos.has(id)) tipos.set(id, compact(a.textContent));
    }
    for (const a of form.doc.querySelectorAll("a[href*='id_serie=']")) {
      const id = param('id_serie', new URL(a.getAttribute('href'), r.url).href);
      if (id && !tipos.has(id)) tipos.set(id, compact(a.textContent));
    }
    const tipoId = [...tipos].find(([id, nome]) => id !== '-1' && /^portaria$/i.test(nome))?.[0];
    if (!tipoId) throw new Error('não achei o tipo "Portaria" na lista da unidade (' + [...tipos.values()].filter(Boolean).slice(0, 8).join(', ') + '…)');
    form.fd.set('hdnIdSerie', tipoId);
    r = await post(form);
    form = formOf(r.html, '#frmDocumentoCadastro', r.url);
    if (!form) throw new Error(alertOf(r.html) ? 'o SEI recusou: ' + alertOf(r.html) : 'o formulário de cadastro da Portaria veio diferente do esperado');
    if (!form.el.querySelector('input[name="rdoNivelAcesso"][value="0"]')) throw new Error('o SEI não oferece nível de acesso Público para a Portaria nesta unidade');
    form.fd.set('rdoNivelAcesso', '0');
    if (form.fd.has('hdnStaNivelAcessoLocal')) form.fd.set('hdnStaNivelAcessoLocal', '0');
    if (form.fd.has('selHipoteseLegal')) form.fd.set('selHipoteseLegal', 'null');
    if (form.fd.has('hdnIdHipoteseLegal')) form.fd.set('hdnIdHipoteseLegal', '');
    form.fd.set('rdoTextoInicial', 'N');
    // Nesta unidade o Número da Portaria é obrigatório e digitado por quem faz (ex.: 1559/2026)
    if (form.el.querySelector('[name="txtNumero"]')) {
      if (!numero) throw new Error('informe o número da Portaria (ex.: 1559/2026)');
      form.fd.set('txtNumero', numero);
    }
    form.fd.set('hdnFlagDocumentoCadastro', '2');
    // Valores de campos técnicos (sem dados de servidores) para o diagnóstico de recusas do SEI
    const diag = (f) => ['hdnAnexos', 'rdoTextoInicial', 'hdnStaDocumento', 'hdnIdTipoConferencia', 'hdnIdSerie', 'txtNumero', 'txtNomeArvore', 'txtDescricao', 'hdnIdDocumentoTextoBase', 'txtProtocoloDocumentoTextoBase', 'hdnIdTextoPadrao', 'rdoNivelAcesso', 'hdnStaNivelAcessoLocal', 'hdnIdHipoteseLegal', 'selGrauSigilo']
      .filter(k => f.fd.has(k)).map(k => k + '=' + JSON.stringify(String(f.fd.get(k)).slice(0, 40))).join(' ')
      + ' · campos(todos)=' + [...f.el.querySelectorAll('input,select,textarea')].filter(e => e.name).map(e => e.name + (e.disabled ? '(desab)' : '') + (e.type === 'hidden' ? '(h)' : '')).join(',');
    const sucesso = (c) => (/acao_origem=documento_(?:gerar|cadastrar)/.test(c.url) || /editor_montar/.test(c.html)) && (param('id_documento', c.url) || /id_documento=(\d+)/.test(c.html));
    let criado = await post(form), tentativas = [];
    // O SEI às vezes recusa por causa dos campos de anexo; tenta de novo sem eles, como o SEI Pro (que não envia campos de arquivo)
    for (const variante of ['multipart', 'mínimo']) {
      if (sucesso(criado) || !/anexo/i.test(alertOf(criado.html))) break;
      tentativas.push('[' + (tentativas.length + 1) + '] recusou: ' + alertOf(criado.html) + ' · enctype=' + (form.el.getAttribute('enctype') || '(nenhum)') + ' · arquivos=' + form.el.querySelectorAll('input[type=file]').length + ' · ' + diag(form));
      if (variante === 'multipart') criado = await postMultipart(form);
      else {
        for (const k of [...form.fd.keys()]) if (/^(hdnAnexos|hdnContatoObject|hdnContatoIdentificador|hdnAssuntoIdentificador|txtDinValor|txtRemetente|txtDestinatario|txtInteressado|txtAssunto)$/.test(k)) form.fd.delete(k);
        criado = await post(form);
      }
    }
    if (tentativas.length) lastDebug += ' · tentativas: ' + tentativas.join(' | ') + ' · final: ' + (sucesso(criado) ? 'ok' : (alertOf(criado.html) || 'sem alerta'));
    const docId = param('id_documento', criado.url) || (/id_documento=(\d+)/.exec(criado.html) || [])[1] || '';
    if (!sucesso(criado) || !docId) {
      if (!tentativas.length) lastDebug += ' · ' + diag(form);
      throw new Error(alertOf(criado.html) ? 'o SEI recusou: ' + alertOf(criado.html) : 'o SEI não confirmou a criação da Portaria');
    }
    const out = { docId, numero: '', titulo: '', url: '', aviso: '', nota: '' };
    try {
      let ed = criado;
      if (!/name="txaEditor_/.test(ed.html) && !/INFRA_EDITOR_CONFIG/.test(ed.html)) {
        const link = (ed.html.match(/controlador\.php\?acao=editor_montar&[^"'\s\\<>]*/) || [])[0];
        if (!link) throw new Error('não achei o editor da Portaria');
        ed = await request(new URL(decode(link), criado.url).href);
      }
      if (/INFRA_EDITOR_CONFIG/.test(ed.html)) throw new Error('este SEI usa o editor novo (CKEditor 5), que o script ainda não grava direto');
      if (!(await writeBody(ed, bodyHtml))) out.nota = 'o SEI aceitou o texto, mas não consegui conferir a releitura: abra a Portaria e confirme';
    } catch (e) { out.aviso = errText(e); }
    try {
      const nova = await readTree(item);
      const lista = treeDocs(nova.arvore, nova.arvoreUrl);
      const doc = lista.find(d => d.id === docId) || lista.find(d => !antes.has(d.id));
      if (doc) { out.docId = doc.id; out.url = doc.href; out.titulo = doc.title; out.numero = (/\((\d{4,})\)\s*$/.exec(doc.title) || [])[1] || ''; }
    } catch { /* a Portaria já existe; o número é só informação */ }
    return out;
  }

  // Grava o corpo no editor CKEditor 4. Devolve false se o texto foi aceito mas a releitura não bateu.
  async function writeBody(ed, bodyHtml) {
    const form = formOf(ed.html, '#frmEditor', ed.url);
    if (!form) throw new Error('a tela do editor veio diferente do esperado');
    const secoes = [...form.doc.querySelectorAll("textarea[name^='txaEditor_']")].map(t => {
      const nome = t.getAttribute('name');
      const ini = ed.html.indexOf("CKEDITOR.replace('" + nome + "'");
      const fim = ini >= 0 ? ed.html.indexOf('CKEDITOR.replace(', ini + 20) : -1;
      const cfg = ini >= 0 ? ed.html.slice(ini, fim > 0 ? fim : ini + 6000) : '';
      return { nome, titulo: /title:"([^"]*)"/.exec(cfg)?.[1] || nome, ro: /"readOnly":true/.test(cfg), html: t.value || t.textContent || '' };
    });
    const editaveis = secoes.filter(s => !s.ro);
    const corpo = editaveis.length === 1 ? editaveis[0] : editaveis.find(s => /corpo|texto do documento|conte[uú]do/i.test(s.titulo));
    if (!corpo) throw new Error(editaveis.length ? 'o modelo tem ' + editaveis.length + ' seções editáveis (' + editaveis.map(x => x.titulo).join(', ') + ') e não sei qual é o corpo' : 'o editor não tem uma seção editável');
    // o SEI põe um texto de ajuda ("Digite aqui o conteúdo do(s) anexo(s)...") no editor novo: sai
    corpo.html = String(corpo.html || '').replace(/<(p|div)\b[^>]*>(?:(?!<\/\1>)[\s\S])*?Digite aqui o conte[úu]do[\s\S]*?<\/\1>/gi, '');
    const visivel = String(corpo.html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/Digite aqui o conte[úu]do[^.]*\.*/i, '').trim();
    form.fd.set(corpo.nome, (visivel ? corpo.html : '') + bodyHtml);   // se o modelo já traz texto, o nosso vai ao final
    const resp = await post(form, secoes.map(s => s.nome));
    const resposta = compact(new DOMParser().parseFromString(resp.html, 'text/html').body?.textContent || resp.html);
    if (!/^OK/.test(resposta)) throw new Error('o SEI recusou o texto: ' + resposta.slice(0, 200));
    try {
      const conf = await request(ed.url);
      const lido = new DOMParser().parseFromString(conf.html, 'text/html').querySelector("textarea[name='" + corpo.nome + "']")?.value || '';
      const letras = (h) => fold(new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html').body.textContent).replace(/[^a-z0-9]/g, '');
      const trecho = letras(bodyHtml).slice(0, 20);
      return trecho.length < 8 || letras(lido).includes(trecho);
    } catch { return false; }
  }

  // Exclui a Portaria criada por este script (o SEI só deixa enquanto não foi assinada nem enviada)
  async function deletePortaria(item, docId) {
    const t = await readTree(item);
    const doc = treeDocs(t.arvore, t.arvoreUrl).find(d => d.id === docId);
    if (!doc) throw new Error('a Portaria não está mais na árvore do processo');
    if (!/^portaria\b/i.test(doc.title)) throw new Error('o documento não é uma Portaria (' + doc.title + '): nada foi excluído');
    const tela = await request(doc.href);
    const m = /var\s+linkExcluirDocumento\s*=\s*'([^']+)'/.exec(tela.html);
    if (!m) throw new Error('o SEI não oferece excluir esta Portaria (já assinada, enviada ou de outra unidade)');
    await request(new URL(decode(m[1]), tela.url).href);
    const depois = await readTree(item);
    if (treeDocs(depois.arvore, depois.arvoreUrl).some(d => d.id === docId)) throw new Error('o SEI não excluiu a Portaria');
  }

  // ── o que o gerador copia → corpo da Portaria (sem o título: o modelo do SEI já traz cabeçalho, título, número e data) ──
  function parseCopy(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.querySelectorAll('script,style,meta,link,iframe,object,embed,noscript').forEach(n => n.remove());
    for (const el of doc.querySelectorAll('*')) for (const at of [...el.attributes]) if (/^on/i.test(at.name) || at.name === 'contenteditable' || at.name === 'id') el.removeAttribute(at.name);
    const raiz = doc.body;
    const h1 = [...raiz.querySelectorAll('h1')].find(h => /^portaria\b/i.test(compact(h.textContent)));
    const titulo = h1 ? compact(h1.textContent) : '';
    const pendentes = raiz.querySelectorAll('.falta, [style*="fff1a8"]').length;
    if (h1) h1.remove();
    const unico = raiz.children.length === 1 ? raiz.firstElementChild : raiz;
    const corpoHtml = unico.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (compact(corpoHtml.replace(/<[^>]*>/g, ' ')).length < 40) throw new Error('a portaria está vazia: escolha o tipo e o servidor no painel');
    return { titulo, corpoHtml, pendentes, numeroGerador: ((/(\d[\d.]*\s*\/\s*\d{4})/.exec(titulo) || [])[1] || '').replace(/\s+/g, '') };
  }

  // ── interface (janela principal) ──
  const CSS = `
    .gp-dr { position:fixed; top:0; right:0; bottom:0; width:var(--gp-w,min(700px,60vw)); z-index:2147483645; background:#fff; border-left:1px solid #cbd5e1; box-shadow:-8px 0 24px rgba(15,23,42,.25); display:flex; flex-direction:column; font:13px system-ui,sans-serif; color:#0f172a; }
    .gp-dr header { background:#0f766e; color:#fff; padding:10px 14px 10px 18px; display:flex; align-items:center; gap:10px; }
    .gp-dr header b { font-size:14px; }
    .gp-dr header span { opacity:.85; font-size:12px; }
    html.gp-docked { position:relative !important; width:calc(100% - var(--gp-w)) !important; overflow-x:hidden !important; }
    .gp-dr header button.gp-dk { margin-left:auto; font-size:16px; opacity:.85; }
    .gp-dr header button.gp-dk + button { margin-left:0; }
    .gp-dr header button { margin-left:auto; background:none; border:0; color:#fff; font-size:22px; cursor:pointer; line-height:1; }
    .gp-dr iframe { flex:1; border:0; width:100%; background:#fff; }
    .gp-ld { position:absolute; inset:46px 0 0 0; background:rgba(255,255,255,.96); display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; font-size:14px; color:#0f766e; font-weight:700; }
    .gp-md { position:fixed; inset:0; z-index:2147483647; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center; font:13.5px system-ui,sans-serif; color:#0f172a; }
    .gp-bx { background:#fff; border-radius:16px; width:min(720px,94vw); max-height:92vh; overflow:auto; padding:20px 24px; box-shadow:0 24px 60px rgba(0,0,0,.4); }
    .gp-bx h2 { margin:0; font-size:17px; font-weight:800; }
    .gp-gr { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:14px 0; }
    .gp-gr > div { border:1px solid #e2e8f0; border-radius:10px; padding:9px 12px; }
    .gp-gr small { display:block; font-size:11px; color:#64748b; }
    .gp-ac { display:flex; justify-content:flex-end; gap:10px; margin-top:16px; }
    .gp-ac button { padding:9px 16px; border-radius:9px; border:1.5px solid #cbd5e1; background:#fff; color:#334155; font:700 13px system-ui,sans-serif; cursor:pointer; }
    .gp-ac button.pri { border-color:#0f766e; background:#0f766e; color:#fff; }
    .gp-ac button:disabled { opacity:.55; cursor:not-allowed; }
    .gp-av { margin-top:12px; font-size:12px; color:#92400e; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:8px 10px; line-height:1.45; }
    .gp-er { margin-top:12px; font-size:12.5px; color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 10px; line-height:1.45; }
    .gp-bt { display:inline-flex; align-items:center; gap:5px; height:26px; padding:0 9px; border-radius:7px; border:1px solid #99d5cf; background:#fff; color:#0f766e; font:700 12px/1 system-ui,sans-serif; cursor:pointer; }
    .gp-bt:hover { background:#ecfdf5; }
    @keyframes gpSpin { to { transform:rotate(360deg); } }
  `;
  const DOC_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
  function ensureCss(doc) {
    if (doc.querySelector('style[data-gemop-css]')) return;
    const st = doc.createElement('style'); st.setAttribute('data-gemop-css', ''); st.textContent = CSS; doc.head.append(st);
  }
  const el = (doc, tag, html, cls) => { const e = doc.createElement(tag); if (html != null) e.innerHTML = html; if (cls) e.className = cls; e.setAttribute(UI, ''); return e; };

  const state = { busy: false, item: null, drawer: null };

  // Encaixe ao lado: a página do SEI encolhe e o painel ocupa a faixa da direita (como o painel do Archivist)
  const DOCK_KEY = 'gemop_portarias_encaixar';
  const dockOn = () => { try { return localStorage.getItem(DOCK_KEY) !== '0'; } catch { return true; } };
  const panelW = () => Math.max(380, Math.min(700, Math.round(TOP.innerWidth * 0.4)));
  let dockWatch = null;
  function fitFrame(on) {
    const ATTR = 'data-gp-w', el = rootDoc.getElementById('ifrConteudoVisualizacao');
    if (!el) return;
    if (el.hasAttribute(ATTR)) { const [v, pr] = el.getAttribute(ATTR).split('|'); if (v) el.style.setProperty('width', v, pr || ''); else el.style.removeProperty('width'); el.removeAttribute(ATTR); }
    if (!on) return;
    const limit = TOP.innerWidth - panelW(), r = el.getBoundingClientRect();
    if (r.right <= limit + 2) return;
    el.setAttribute(ATTR, el.style.getPropertyValue('width') + '|' + el.style.getPropertyPriority('width'));
    const inner = parseFloat(TOP.getComputedStyle(el).width) || r.width;
    el.style.setProperty('width', Math.max(240, Math.floor(limit - r.left - Math.max(0, r.width - inner))) + 'px', 'important');
  }
  function applyDock(on) {
    const html = rootDoc.documentElement;
    if (dockWatch) { dockWatch.stop(); dockWatch = null; }
    html.style.setProperty('--gp-w', panelW() + 'px');
    html.classList.toggle('gp-docked', !!on);
    fitFrame(!!on);
    try { TOP.dispatchEvent(new Event('resize')); } catch { /* ignora */ }
    if (!on) { html.style.removeProperty('--gp-w'); return; }
    // o SEI refaz a largura dos quadros depois de carregar: refaz o ajuste enquanto o painel estiver encaixado
    const frame = rootDoc.getElementById('ifrConteudoVisualizacao');
    let pend = false;
    const refit = () => { if (pend) return; pend = true; TOP.requestAnimationFrame(() => { pend = false; if (html.classList.contains('gp-docked')) fitFrame(true); }); };
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null;
    if (obs) { obs.observe(html); if (frame) obs.observe(frame); }
    if (frame) frame.addEventListener('load', refit);
    TOP.addEventListener('resize', refit);
    const timers = [150, 500, 1500, 3000].map(ms => setTimeout(refit, ms));
    dockWatch = { stop() { if (obs) obs.disconnect(); if (frame) frame.removeEventListener('load', refit); TOP.removeEventListener('resize', refit); timers.forEach(clearTimeout); } };
  }

  // Abre o painel (gerador) para o processo e lê os documentos; quando o gerador avisar que está pronto, entrega o processo.
  async function openPanel(item) {
    if (state.busy) return;
    state.busy = true;
    const doc = rootDoc;
    ensureCss(doc);
    doc.querySelector('.gp-dr')?.remove();
    let recurso = '';
    try { recurso = GM_getResourceText('GEMOP_PORTARIAS'); } catch { /* sem o recurso */ }
    if (!recurso) { state.busy = false; flash('Portarias SEI: não consegui carregar o gerador (recurso do script). Reinstale o script.'); return; }
    const dr = el(doc, 'div', '<header><b>Portarias <small style="opacity:.7;font-weight:400;">v' + VERSION + '</small></b><span>processo ' + esc(item.num || item.id) + '</span><button type="button" class="gp-dk"></button><button type="button" class="gp-x" aria-label="Fechar" title="Fechar">×</button></header><iframe title="Gerador de Portarias" allow=""></iframe><div class="gp-ld"><div><div style="display:inline-block;animation:gpSpin 1s linear infinite;font-size:20px;">⏳</div><div id="gp-ld-txt" style="margin-top:8px;">Abrindo o gerador...</div></div></div>', 'gp-dr');
    doc.body.append(dr);
    state.item = item; state.drawer = dr;
    const frame = dr.querySelector('iframe'), ld = dr.querySelector('.gp-ld'), ldTxt = dr.querySelector('#gp-ld-txt');
    const close = () => { dr.remove(); window.removeEventListener('message', onMessage); state.drawer = null; applyDock(false); };
    dr.querySelector('header .gp-x').onclick = close;
    const dk = dr.querySelector('.gp-dk');
    const pintaDock = () => { const on = dockOn(); dr.style.setProperty('--gp-w', panelW() + 'px'); dk.textContent = on ? '⇥' : '⇤'; dk.title = on ? 'Encaixado ao lado (clique para sobrepor)' : 'Sobreposto (clique para encaixar ao lado)'; applyDock(on); };
    dk.onclick = () => { try { localStorage.setItem(DOCK_KEY, dockOn() ? '0' : '1'); } catch { /* ignora */ } pintaDock(); };
    pintaDock();

    let leitura = null, pronto = false, entregue = false;
    const entregar = () => {
      if (!leitura || !pronto || entregue) return;
      entregue = true;
      frame.contentWindow.postMessage({ gemop: 'processo', arquivos: leitura.arquivos, titulos: leitura.titulos, contexto: leitura.contexto, interessados: leitura.interessados, processo: leitura.processo }, '*');
      ld.remove();
    };
    const onMessage = (e) => {
      if ((e.source !== frame.contentWindow && e.origin !== location.origin) || !e.data || !e.data.gemop) return;
      if (e.data.gemop === 'pronto') { pronto = true; entregar(); }
      else if (e.data.gemop === 'criar') confirmAndCreate(item, e.data.html);
    };
    window.addEventListener('message', onMessage);
    frame.srcdoc = recurso;
    try {
      leitura = await readProcess(item, (t) => { ldTxt.textContent = t; });
      const q = leitura.pdfs, resumo = [leitura.arquivos.length + ' documento' + (leitura.arquivos.length === 1 ? '' : 's') + ' lido' + (leitura.arquivos.length === 1 ? '' : 's')];
      if (q.lidos) resumo.push(q.lidos + ' PDF' + (q.lidos > 1 ? 's' : '') + ' lido' + (q.lidos > 1 ? 's' : '') + ' pelo texto');
      if (q.digitalizados) resumo.push(q.digitalizados + ' PDF' + (q.digitalizados > 1 ? 's' : '') + ' digitalizado' + (q.digitalizados > 1 ? 's' : '') + ' (imagem) não lido' + (q.digitalizados > 1 ? 's' : ''));
      const cab = dr.querySelector('header span'); cab.textContent = 'processo ' + (item.num || item.id) + ' · ' + resumo.join(' · '); cab.title = 'Clique para copiar o relatório de tempo (' + leitura.tempo + ')'; cab.style.cursor = 'pointer';
      cab.onclick = () => { try { navigator.clipboard.writeText(leitura.relatorio).then(() => flash('Relatório de tempo copiado. Cole na conversa.'), () => flash('Não consegui copiar o relatório.')); } catch { flash('Não consegui copiar o relatório.'); } };
      ldTxt.textContent = 'Montando a portaria...';
      entregar();
    } catch (e) {
      ldTxt.innerHTML = '<span style="color:#b91c1c;">Não foi possível ler o processo: ' + esc(errText(e)) + '</span><br><br><button type="button" id="gp-seguir" style="padding:8px 14px;border-radius:9px;border:1.5px solid #0f766e;background:#fff;color:#0f766e;font-weight:700;cursor:pointer;">Abrir o gerador mesmo assim</button>';
      ldTxt.querySelector('#gp-seguir').onclick = () => ld.remove();
    }
    state.busy = false;
  }

  function flash(msg) {
    const d = el(rootDoc, 'div', esc(msg));
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0f766e;color:#fff;font:700 13px sans-serif;padding:8px 14px;text-align:center;';
    rootDoc.body.append(d); setTimeout(() => d.remove(), 8000);
  }

  // Janela de confirmação → cria → resultado (Abrir / Excluir)
  function confirmAndCreate(item, copiedHtml) {
    const doc = rootDoc;
    let p;
    try { p = parseCopy(copiedHtml); } catch (e) { flash('Portarias SEI: ' + errText(e)); return; }
    doc.querySelector('.gp-md')?.remove();
    const wrap = el(doc, 'div', '<div class="gp-bx" role="dialog" aria-modal="true" aria-label="Criar Portaria"></div>', 'gp-md');
    doc.body.append(wrap);
    const box = wrap.firstElementChild;
    let busy = false, result = null;
    const close = () => { wrap.remove(); doc.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };
    doc.addEventListener('keydown', onKey, true);
    const head = (t, s) => '<div style="display:flex;align-items:center;gap:10px;"><span style="width:34px;height:34px;border-radius:10px;background:#eff6ff;color:#1d4ed8;display:flex;align-items:center;justify-content:center;">' + DOC_ICON + '</span><div><h2>' + t + '</h2><div style="font-size:12.5px;color:#64748b;">' + s + '</div></div></div>';
    const proc = esc(item.num || item.id);
    const confirmView = () => {
      box.innerHTML = head('Criar Portaria no processo ' + proc, 'Confira antes de criar') +
        '<div class="gp-gr"><div><small>Tipo de documento</small><b>Portaria</b></div><div><small>Nível de acesso</small><b>Público</b></div>' +
        '<div><small>Número da Portaria (obrigatório no SEI)</small><input id="gp-num" value="' + esc(p.numeroGerador) + '" placeholder="ex.: 1559/2026" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:8px;font:700 13px system-ui,sans-serif;"></div><div><small>Assinatura</small><b>sem assinatura</b> <span style="color:#64748b;font-size:12px;">(você assina no SEI)</span></div></div>' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Texto que vai para o corpo da Portaria</div>' +
        '<iframe sandbox="" style="width:100%;height:250px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;" srcdoc="' + esc('<body style="margin:12px;font:12.5px/1.5 Calibri,Arial,sans-serif;">' + p.corpoHtml + '</body>') + '"></iframe>' +
        (p.pendentes ? '<div class="gp-av"><b>' + p.pendentes + ' campo(s) pendente(s)</b> (em amarelo no gerador). Complete no painel, ou crie assim mesmo e complete no SEI.</div>' : '') +
        '<div class="gp-av">Aqui vai só o corpo da Portaria (sem o título). O número que você digitar vai no campo Número do SEI.</div>' +
        '<div class="gp-ac"><button type="button" data-a="x">Cancelar</button><button type="button" class="pri" data-a="ok">' + (p.pendentes ? 'Criar assim mesmo' : 'Criar Portaria') + '</button></div>';
    };
    confirmView();
    box.addEventListener('click', async (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      if (a === 'x') { if (!busy) close(); return; }
      if (a === 'ok' && !busy) {
        const numero = (box.querySelector('#gp-num')?.value || '').replace(/\s+/g, '');
        if (!/^\d[\d.]*\/\d{4}$/.test(numero)) { let er = box.querySelector('.gp-numerr'); if (!er) { er = el(doc, 'div', '', 'gp-er gp-numerr'); box.querySelector('.gp-ac').before(er); } er.textContent = 'Digite o número no formato 1559/2026.'; return; }
        busy = true;
        box.innerHTML = head('Criando a Portaria…', 'Processo ' + proc + ' · sem abrir o processo na tela') + '<div style="margin:18px 0;display:flex;align-items:center;gap:10px;"><span style="display:inline-block;animation:gpSpin 1s linear infinite;font-size:18px;">⏳</span><span>Escolhendo o tipo, cadastrando e gravando o texto no editor...</span></div>';
        let falha = '';
        try { result = await createPortaria(item, p.corpoHtml, numero); } catch (err) { falha = errText(err); }
        busy = false;
        if (falha) { box.innerHTML = head('Não foi possível criar a Portaria', 'Processo ' + proc) + '<div class="gp-er">' + esc(falha) + '. Nada foi criado.</div><details style="margin-top:10px;font-size:11.5px;color:#64748b;"><summary>Detalhes técnicos (para enviar a quem mantém o script)</summary>Portarias SEI v' + VERSION + ' · ' + esc(lastDebug) + '</details><div class="gp-ac"><button type="button" data-a="x">Fechar</button></div>'; return; }
        if (item.arvoreUrl) { try { rootDoc.getElementById('ifrArvore')?.contentWindow.location.reload(); } catch { /* ignora */ } }
        const num = (/(\d+\/\d{4})/.exec(result.titulo || '') || [])[1] || '';
        box.innerHTML = head('Portaria' + (num ? ' ' + esc(num) : '') + (result.numero ? ' (' + esc(result.numero) + ')' : '') + ' criada', 'Processo ' + proc + ' · ainda sem assinatura') +
          '<div style="margin:14px 0;font-size:13px;line-height:1.55;color:#475569;">Próximo passo no SEI: abrir a Portaria, conferir o texto e assinar. Se foi engano, exclua agora, enquanto não foi assinada.</div>' +
          (result.aviso ? '<div class="gp-er">O texto não foi gravado: ' + esc(result.aviso) + '. A Portaria existe: abra e cole o texto no editor (use "Copiar texto" no gerador).</div>' : (result.nota ? '<div class="gp-av">' + esc(result.nota) + '</div>' : '')) +
          '<div class="gp-ac"><button type="button" data-a="del" style="border-color:#fecaca;color:#b91c1c;">Excluir esta Portaria</button><button type="button" data-a="abrir">Abrir a Portaria</button><button type="button" class="pri" data-a="x">Fechar</button></div>';
      } else if (a === 'abrir' && result && result.url) window.open(result.url, '_blank', 'noopener');
      else if (a === 'del' && result && !busy) {
        if (!window.confirm('Excluir a Portaria' + (result.numero ? ' ' + result.numero : '') + ' do processo ' + (item.num || item.id) + '?\n\nSó funciona enquanto não foi assinada nem enviada.')) return;
        busy = true; e.target.disabled = true; e.target.textContent = 'Excluindo...';
        try { await deletePortaria(item, result.docId); if (item.arvoreUrl) { try { rootDoc.getElementById('ifrArvore')?.contentWindow.location.reload(); } catch { /* ignora */ } } box.innerHTML = head('Portaria excluída', 'Processo ' + proc) + '<div class="gp-av">Nada ficou no processo. Você pode ajustar no painel e criar outra.</div><div class="gp-ac"><button type="button" data-a="x">Fechar</button></div>'; }
        catch (err) { box.insertAdjacentHTML('beforeend', '<div class="gp-er">Não foi possível excluir: ' + esc(errText(err)) + '</div>'); }
        busy = false;
      }
    });
  }

  // ── Controle de Processos: botão por linha ──
  const sigiloso0 = (rotulo, link) => /^Sigiloso\b/.test(rotulo) || /Sigiloso/.test(link.getAttribute('class') || '');   // do processo sigiloso nada é lido
  // ── processo aberto: ícone na barra de ações (o ícone avisa a janela principal por evento) ──
  const EVT = 'gemop-portarias-abrir';
  const SEL_INCLUIR = 'a[href*="acao=documento_escolher_tipo"]';
  function openItemFromScreen() {
    let arvoreUrl = '', num = '';
    const visit = (win, depth) => {
      if (depth > 5 || arvoreUrl) return;
      try {
        const f = win.document.getElementById('ifrArvore');
        if (f && f.src && /acao=procedimento_visualizar/.test(f.src)) arvoreUrl = f.src;
        else if (/acao=procedimento_visualizar/.test(win.location.href)) arvoreUrl = win.location.href;
        const m = (win.document.title || '').match(/\b\d{2}\.\d+\.\d{7,9}-\d\b|\b\d{4,7}\.\d{6,8}\/\d{4}-\d{2}\b/); if (m && !num) num = m[0];
        for (let i = 0; i < win.frames.length; i++) visit(win.frames[i], depth + 1);
      } catch { /* quadro de outra origem */ }
    };
    visit(TOP, 0);
    const id = arvoreUrl && param('id_procedimento', arvoreUrl);
    if (!id) num = num || '';
    return id ? { id, num: num || rootDoc.title.replace(/^SEI\s*[-–]\s*/i, ''), href: arvoreUrl, arvoreUrl, sigiloso: false } : null;
  }
  function docSvg(size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true" style="display:block"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#0f9488"/><path d="M14 2l6 6h-4a2 2 0 0 1-2-2z" fill="#5eead4"/><path d="M8 13h8M8 17h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  function injectToolbarIcon() {
    const incluir = document.querySelector(SEL_INCLUIR);
    if (!incluir || document.getElementById('btn-gemop-portarias')) return;
    const ref = incluir;
    const btn = ref.cloneNode(false);
    for (const at of [...btn.attributes]) if (/^(id|href|onclick|name|target|title|tabindex|accesskey|data-.*)$/i.test(at.name)) btn.removeAttribute(at.name);
    const img = ref.querySelector('img,svg'); const w = img ? img.getBoundingClientRect().width : 0; const size = w >= 16 && w <= 64 ? Math.round(w) : 32;
    btn.id = 'btn-gemop-portarias'; btn.setAttribute('href', '#'); btn.setAttribute('role', 'button'); btn.setAttribute('title', 'Gerar Portaria (Portarias SEI · GEMOP)'); btn.setAttribute('aria-label', 'Gerar Portaria');
    btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;';
    btn.innerHTML = docSvg(size);
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); try { rootDoc.dispatchEvent(new Event(EVT)); } catch { /* ignora */ } });
    let anchor = ref; while (anchor.parentElement && anchor.parentElement.querySelectorAll('a').length < 4 && anchor.parentElement !== document.body) anchor = anchor.parentElement;
    const bar = anchor.parentElement && anchor.parentElement !== document.body ? anchor.parentElement : ref.parentElement;
    const icons = [...bar.querySelectorAll('a')].filter(a => a.querySelector('img,svg'));
    const last = icons[icons.length - 1] || ref; let node = last; while (node.parentElement && node.parentElement !== bar) node = node.parentElement;
    node.parentNode.insertBefore(btn, node.nextSibling);
  }
  function watchToolbar() {
    if (IS_TOP || !/ifrConteudoVisualizacao/i.test(window.name || '')) return;
    let s = false;
    const run = () => { s = false; try { injectToolbarIcon(); } catch { /* ignora */ } };
    const sched = () => { if (!s) { s = true; setTimeout(run, 150); } };
    run();
    new MutationObserver(sched).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', sched);
  }

  // O botão pode estar num quadro; o painel mora na janela principal
  function askTop(kind, item) {
    if (IS_TOP) { openPanel(item); return; }
    try { TOP.postMessage({ gemopAbrir: item }, '*'); } catch { /* ignora */ }
  }

  if (IS_TOP) {
    window.addEventListener('message', (e) => { if (e.data && e.data.gemopAbrir) openPanel(e.data.gemopAbrir); });
    document.addEventListener(EVT, () => {
      const item = openItemFromScreen();
      if (!item) { flash('Portarias SEI: não achei o processo aberto nesta tela.'); return; }
      openPanel(item);
    });
  }
  watchToolbar();
})();
