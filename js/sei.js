/*
 * Leitura dos processos do SEI (arquivos .html exportados: Ficha Funcional, Despachos, Portarias…) para preencher a
 * Portaria de licença prêmio. Funções puras (sem tela): funcionam no navegador (window.SeiProcesso) e no Node (testes).
 *
 * Regras (conferidas em processos reais da SEGEP):
 *  - cada mês de licença vale 30 dias; o fim é o início + 30 × meses − 1 dia;
 *  - o decênio sugerido é o mais antigo com menos de 6 meses gozados (o servidor pode pedir outro: a tela deixa trocar);
 *  - a decisão (deferida/indeferida) vem do último despacho com "DEFIRO"/"INDEFIRO" e afins;
 *  - o fundamento do indeferimento é esse despacho: tipo do documento, número SEI e a secretaria do cabeçalho.
 * Nada é preenchido sem o usuário conferir.
 */
(function (global) {
  'use strict';

  var D = (typeof module !== 'undefined' && module.exports) ? require('./dados.js') : global.Dados;

  // ---------- texto do HTML ----------
  var ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ',
    hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•', deg: '°', sect: '§' };
  (function () {
    var tabela = { a: 'áàâãä', e: 'éèêë', i: 'íìîï', o: 'óòôõö', u: 'úùûü' };
    var nomes = ['acute', 'grave', 'circ', 'tilde', 'uml'];
    Object.keys(tabela).forEach(function (v) {
      tabela[v].split('').forEach(function (ch, k) {
        ENTIDADES[v + nomes[k]] = ch;
        ENTIDADES[v.toUpperCase() + nomes[k]] = ch.toUpperCase();
      });
    });
  })();

  function textoDoHtml(html) {
    return String(html || '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>|<\/t[dh]>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(#x?[0-9a-f]+|[a-z]+[0-9]*);/gi, function (m, e) {
        if (e.charAt(0) === '#') {
          var cod = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return isNaN(cod) ? m : String.fromCharCode(cod);
        }
        return Object.prototype.hasOwnProperty.call(ENTIDADES, e) ? ENTIDADES[e] : m;
      })
      .replace(/[ \t ]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  // Linhas de tabela do HTML: [[célula, célula…], …] (usado nas portarias já feitas, para conferir).
  function linhasDeTabela(html) {
    var linhas = [];
    String(html || '').replace(/<tr[\s\S]*?<\/tr>/gi, function (tr) {
      var celulas = [];
      tr.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, function (m, c) { celulas.push(textoDoHtml(c).replace(/\s+/g, ' ')); return m; });
      if (celulas.length) linhas.push(celulas);
      return tr;
    });
    return linhas;
  }

  // ---------- nome do arquivo: "[03]-1110422_Ficha_Funcional.html" ----------
  function infoDoArquivo(nome) {
    var base = String(nome || '').split(/[\\/]/).pop();
    var m = base.match(/^\[(\d+)\]-(\d+)_(.+?)\.([A-Za-z0-9]+)$/);
    if (!m) return { nome: base, ordem: 0, id: '', tipo: 'outro', ext: (base.split('.').pop() || '').toLowerCase() };
    var resto = D.normalizar(m[3]).replace(/[^A-Z0-9]+/g, ' ');
    var tipo = 'outro';
    [['ficha funcional', /^FICHA FUNCIONAL/], ['licenca premio', /^LICENCA PREMIO/], ['despacho', /^DESPACHO/], ['portaria', /^PORTARIA/],
      ['publicacao', /^PUBLICACAO/], ['requerimento', /^REQUERIMENTO/], ['oficio', /^OFICIO/], ['parecer', /^PARECER/],
      ['informacao', /^INFORMACAO/], ['ci', /^(CI|COMUNICACAO)/], ['solicitacao', /^SOLICITACAO/], ['anexo', /^ANEXO/],
      ['ficha financeira', /^FICHA FINANCEIRA/]].forEach(function (t) { if (t[1].test(resto)) tipo = t[0]; });
    return { nome: base, ordem: +m[1], id: m[2], tipo: tipo, ext: m[4].toLowerCase() };
  }

  var NUMERO_PROCESSO = /\b(\d{2}\.\d{1,2}\.\d{9}-\d)\b/g;

  // O número do processo do documento está no rodapé do SEI ("26.17.000000001-1" e, na linha seguinte, "1000001v 2").
  // Um despacho pode citar outros processos no texto; o rodapé é o que vale.
  function numeroDoRodape(texto) {
    var m = String(texto).match(/(\d{2}\.\d{1,2}\.\d{9}-\d)\s*\n\s*\d+v\s*\d+\s*$/);
    return m ? m[1] : null;
  }

  function numeroDoProcesso(texto) {
    var cont = {}, melhor = null;
    (String(texto).match(NUMERO_PROCESSO) || []).forEach(function (n) { cont[n] = (cont[n] || 0) + 1; });
    Object.keys(cont).forEach(function (n) { if (!melhor || cont[n] > cont[melhor]) melhor = n; });
    return melhor;
  }

  // ---------- datas e períodos ----------
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
    trinta: 30, sessenta: 60, noventa: 90 };

  function numeroPorExtenso(t) {
    var s = D.normalizar(String(t)).toLowerCase();
    if (/^\d+$/.test(s)) return +s;
    return Object.prototype.hasOwnProperty.call(NUMEROS, s) ? NUMEROS[s] : null;
  }

  function mesPeloNome(nome) {
    var n = D.normalizar(nome).toLowerCase();
    for (var i = 0; i < 12; i++) if (D.normalizar(MESES[i]).toLowerCase() === n) return i + 1;
    return 0;
  }

  function somarDias(data, dias) {
    var d = new Date(Date.UTC(data.a, data.m - 1, data.d + dias));
    return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }

  // Cada mês de licença vale 30 dias; o último dia é o início + dias − 1.
  function fimDoGozo(inicio, meses) { return somarDias(inicio, meses * 30 - 1); }

  function iso(d) { return d ? d.a + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0') : ''; }
  function br(d) { return d ? String(d.d).padStart(2, '0') + '/' + String(d.m).padStart(2, '0') + '/' + d.a : ''; }

  function dataDoTexto(t) {
    var m = String(t).replace(/\s+/g, '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? { a: +m[3], m: +m[2], d: +m[1] } : null;
  }

  // Início e duração a partir de um trecho de despacho. Devolve { inicio, meses, dias, regra } ou null.
  function periodoDoTexto(texto) {
    var t = String(texto).replace(/\s+/g, ' ');
    var m;
    // "por 1 (um) MÊS, A PARTIR DE 03 / 11 / 2026"  (as datas do SEI chegam com espaços no meio)
    m = t.match(/por\s+(\d+|[a-zç]+)\s*(?:\([^)]*\))?\s*(m[êe]s(?:es)?|dias)\s*,?\s*a partir de\s*([0-9 \/]{6,14})/i);
    if (m) {
      var ini = dataDoTexto(m[3]), q = numeroPorExtenso(m[1]);
      if (ini && q) return montar(ini, /dias/i.test(m[2]) ? q : null, /dias/i.test(m[2]) ? null : q, 'minuta');
    }
    // "30 dias a partir de 14 de setembro de 2026"
    m = t.match(/(\d+|[a-zç]+)\s*(?:\([^)]*\))?\s*dias\s+a partir d[eo]\s+(\d{1,2})\s*(?:º)?\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
    if (m && mesPeloNome(m[3]) && numeroPorExtenso(m[1])) {
      return montar({ a: +m[4], m: mesPeloNome(m[3]), d: +m[2] }, numeroPorExtenso(m[1]), null, 'dias a partir de');
    }
    // "meses de SETEMBRO e OUTUBRO de 2026"
    m = t.match(/meses de\s+([a-zç]+)\s+e\s+([a-zç]+)\s+de\s+(\d{4})/i);
    if (m && mesPeloNome(m[1]) && mesPeloNome(m[2])) {
      var qtd = (mesPeloNome(m[2]) - mesPeloNome(m[1]) + 12) % 12 + 1;
      return montar({ a: +m[3], m: mesPeloNome(m[1]), d: 1 }, null, qtd, 'meses citados');
    }
    // "para o mês de outubro de 2026 (por um período de 30 dias)" / "para o mês de outubro/2026"
    m = t.match(/m[êe]s de\s+([a-zç]+)\s*(?:\/|de\s+)\s*(\d{4})/i);
    if (m && mesPeloNome(m[1])) {
      var dias = t.match(/per[ií]odo de\s+(\d+)\s+dias/i);
      return montar({ a: +m[2], m: mesPeloNome(m[1]), d: 1 }, dias ? +dias[1] : null, dias ? null : 1, 'mês inteiro');
    }
    return null;
    function montar(inicio, d, ms, regra) {
      var meses = ms != null ? ms : (d % 30 === 0 ? d / 30 : null);
      var dias = d != null ? d : ms * 30;
      return { inicio: inicio, meses: meses, dias: dias, regra: regra };
    }
  }

  // ---------- Ficha Funcional ----------
  function campoRotulado(texto, rotulo) {
    var m = texto.match(new RegExp('^\\s*' + rotulo + '\\s*:\\s*(.+)$', 'mi'));
    return m ? m[1].trim() : '';
  }

  function lerFicha(texto) {
    var nome = campoRotulado(texto, 'NOME');
    if (!nome) return null;
    var decenios = [], re = /NO DEC[ÊE]NIO DE\s*(\d{4})\s*\/\s*(\d{4})\s*,?\s*(N[ÃA]O GOZOU|GOZOU\s+(\d+)\s+M[ÊE]S(?:ES)?)/gi, m;
    while ((m = re.exec(texto))) decenios.push({ ini: +m[1], fim: +m[2], gozou: m[4] ? +m[4] : 0 });
    decenios.sort(function (a, b) { return a.ini - b.ini; });
    var saldo = texto.match(/TEM\s*\(?\s*(\d+)\s*M[ÊE]S(?:ES)?\s*\)?\s*DISPON/i);
    var adm = campoRotulado(texto, 'ADMISS[ÃA]O');
    return {
      nome: nome,
      matricula: campoRotulado(texto, 'MATR[ÍI]CULA'),
      admissao: adm ? dataDoTexto(adm) : null,
      cargo: campoRotulado(texto, 'CARGO'),
      orgao: campoRotulado(texto, '[ÓO]RG[ÃA]O DE ORIGEM'),
      lotacao: campoRotulado(texto, 'LOTA[ÇC][ÃA]O'),
      assunto: campoRotulado(texto, 'ASSUNTO'),
      decenios: decenios,
      saldo: saldo ? +saldo[1] : null
    };
  }

  // Decênio sugerido: o mais antigo com menos de 6 meses gozados.
  function decenioSugerido(decenios) {
    var livres = (decenios || []).filter(function (x) { return x.gozou < 6; });
    return livres.length ? livres[0] : null;
  }
  function textoDecenio(x) { return x ? x.ini + '/' + x.fim : ''; }

  // ---------- decisão nos despachos ----------
  var RE_INDEFERE = /\bINDEFIRO\b|\bindeferid[oa]s?\b|\b(?:informo|realizo|pelo)\s+(?:o\s+)?indeferimento|pr[êe]mio\s*\/\s*indeferimento/i;
  var RE_DEFERE = /\bDEFIRO\b|\bdeferid[oa]s?\b|\b(?:informo|realizo|pelo)\s+(?:o\s+)?deferimento|pr[êe]mio\s*\/\s*deferimento|faz jus ao pedido/i;
  var RE_CANCELA = /desconsiderar|tornar sem efeito|cancelamento|cancelar/i;

  var TIPOS_DECISAO = ['despacho', 'parecer', 'oficio', 'informacao', 'ci', 'solicitacao', 'licenca premio'];

  // Secretaria do cabeçalho do documento ("SECRETARIA MUNICIPAL DE SAÚDE").
  function secretariaDoCabecalho(texto) {
    var m = texto.match(/^\s*(SECRETARIA\s+(?:MUNICIPAL|EXECUTIVA)\s+D[AEO].+)$/mi);
    return m ? m[1].trim() : '';
  }

  function tipoDeFundamento(tipo) {
    return { despacho: 'despacho', oficio: 'oficio', parecer: 'parecer', informacao: 'informacao', ci: 'ci' }[tipo] || null;
  }

  // ---------- um processo ----------
  /*
   * docs: [{ nome, html }] (só os .html; os outros arquivos entram em "ignorados").
   * Devolve { processo, servidor, decenios, saldo, decisao, fundamento, periodo, portarias, alertas, ignorados, assuntoLP }.
   */
  function lerProcesso(arquivos) {
    var docs = [], ignorados = [];
    (arquivos || []).forEach(function (a) {
      var info = infoDoArquivo(a.nome);
      if (info.ext === 'html' || info.ext === 'htm') docs.push(Object.assign(info, { html: a.html, texto: textoDoHtml(a.html) }));
      else ignorados.push(info.nome);
    });
    docs.sort(function (x, y) { return x.ordem - y.ordem; });
    var alertas = [];
    var rodapes = docs.map(function (d) { return numeroDoRodape(d.texto); }).filter(Boolean);
    var processo = rodapes.length ? numeroDoProcesso(rodapes.join('\n')) : numeroDoProcesso(docs.map(function (d) { return d.texto; }).join('\n'));

    // Ficha Funcional (ou o documento "Licença-Prêmio" do Núcleo, que traz os mesmos campos)
    var ficha = null, docFicha = null;
    docs.forEach(function (d) {
      if (d.tipo === 'ficha funcional' || d.tipo === 'licenca premio') { var f = lerFicha(d.texto); if (f) { ficha = f; docFicha = d; } }
    });
    if (!ficha) alertas.push('Não achei a Ficha Funcional neste processo (nome, decênios e saldo ficam por sua conta).');
    var assuntoLP = !ficha || /LICEN[ÇC]A[- ]*PR[ÊE]MIO/i.test(D.normalizar(ficha.assunto).replace(/-/g, ' ')) || /PREMIO/.test(D.normalizar(ficha.assunto));
    if (ficha && !assuntoLP) alertas.push('O assunto da Ficha é "' + ficha.assunto + '", e não licença prêmio: este processo não deve entrar nesta portaria.');

    // decisão e período nos despachos
    var decisoes = [], periodos = [], cancelamentos = [];
    docs.forEach(function (d) {
      if (TIPOS_DECISAO.indexOf(d.tipo) < 0 || d === docFicha) return;
      var corpo = d.texto;
      if (RE_CANCELA.test(corpo)) { cancelamentos.push(d); return; }   // despacho de cancelamento: não conta como decisão nem como período
      var ind = RE_INDEFERE.test(corpo), def = !ind && RE_DEFERE.test(corpo);
      if (ind || def) decisoes.push({ tipo: ind ? 'indeferida' : 'deferida', doc: d });
      var per = periodoDoTexto(corpo);
      if (per) periodos.push(Object.assign({ doc: d }, per));
    });

    var decisao = null, fundamento = null;
    if (decisoes.length) {
      var ultima = decisoes[decisoes.length - 1];
      decisao = ultima.tipo;
      if (decisoes.some(function (x) { return x.tipo !== decisao; })) {
        alertas.push('Há despachos com decisões diferentes (' + decisoes.map(function (x) { return x.doc.id + ': ' + x.tipo; }).join('; ') + '). Valeu o último: confira.');
      }
      if (decisao === 'indeferida') {
        var tipoDoc = tipoDeFundamento(ultima.doc.tipo);
        fundamento = { id: ultima.doc.id, tipo: tipoDoc || 'despacho', secretaria: secretariaDoCabecalho(ultima.doc.texto) };
        if (!tipoDoc) alertas.push('Não reconheci o tipo do documento do indeferimento (' + ultima.doc.id + '): confira o tipo em "Fundamentos".');
        if (!fundamento.secretaria) alertas.push('Não achei a secretaria no cabeçalho do documento ' + ultima.doc.id + ': confira em "Fundamentos".');
      }
    } else {
      alertas.push('Não achei o despacho com a decisão (deferimento ou indeferimento).');
    }
    cancelamentos.forEach(function (d) {
      alertas.push('O documento ' + d.id + ' fala em cancelar ou desconsiderar algo: leia antes de usar este processo.');
    });

    // período: vale o da minuta; senão o último encontrado
    var periodo = null;
    if (periodos.length) {
      var daMinuta = periodos.filter(function (p) { return p.regra === 'minuta'; });
      periodo = (daMinuta.length ? daMinuta : periodos)[(daMinuta.length ? daMinuta : periodos).length - 1];
      var chave = function (p) { return iso(p.inicio) + '|' + p.dias; };
      if (periodos.some(function (p) { return chave(p) !== chave(periodo); })) {
        alertas.push('Os despachos não concordam sobre o período (' + periodos.map(function (p) { return p.doc.id + ': ' + br(p.inicio) + ', ' + p.dias + ' dias'; }).join('; ') + '). Valeu o da minuta ou o último.');
      }
      if (periodo.meses == null) alertas.push('A duração (' + periodo.dias + ' dias) não é múltipla de 30: confira os meses.');
    } else if (decisao === 'deferida') {
      alertas.push('Não achei o início e a duração do gozo nos despachos: preencha o período.');
    }

    // portarias já feitas neste processo
    var portarias = [];
    docs.filter(function (d) { return d.tipo === 'portaria'; }).forEach(function (d) {
      var titulo = d.texto.match(/Portaria\s+N[ºo°]?\s*([0-9]+\/[0-9]{4})/i);
      var semEfeito = /TORNAR SEM EFEITO/i.test(d.texto), errata = /ERRATA/i.test(d.texto);
      var linha = linhasDeTabela(d.html).filter(function (l) { return l[0] && l[0].replace(/\s/g, '').indexOf(processo || '#') === 0; })[0] || null;
      portarias.push({ id: d.id, numero: titulo ? titulo[1] : '', semEfeito: semEfeito, errata: errata,
        linha: linha ? { decenio: linha[4] || '', periodo: linha[5] || '' } : null });
    });
    portarias.forEach(function (p) {
      if (p.semEfeito) alertas.push('Neste processo já existe a Portaria ' + (p.numero || p.id) + ' tornando sem efeito uma licença.');
      else if (!p.errata) alertas.push('Neste processo já existe uma portaria feita (' + (p.numero || p.id) + '): compare com o resultado.');
    });

    // conferência com a portaria feita
    var decSug = ficha ? decenioSugerido(ficha.decenios) : null;
    if (periodo && periodo.meses != null) {
      periodo.fim = fimDoGozo(periodo.inicio, periodo.meses);
      portarias.filter(function (p) { return p.linha && p.linha.periodo; }).forEach(function (p) {
        var esperado = br(periodo.inicio).replace(/\//g, '.') + ' a ' + br(periodo.fim).replace(/\//g, '.');
        if (p.linha.periodo.replace(/\s+/g, ' ') !== esperado) alertas.push('Na Portaria ' + p.numero + ' o período é "' + p.linha.periodo + '", mas pelos despachos seria "' + esperado + '".');
        if (decSug && p.linha.decenio && p.linha.decenio !== textoDecenio(decSug)) {
          alertas.push('Na Portaria ' + p.numero + ' o decênio é ' + p.linha.decenio + ', mas a sugestão pela Ficha é ' + textoDecenio(decSug) + '.');
        }
      });
    }

    if (ficha && decisao !== 'indeferida') {
      if (!ficha.decenios.length) alertas.push('A Ficha não traz os decênios: preencha o decênio.');
      var comSaldo = ficha.decenios.filter(function (x) { return x.gozou < 6; });
      if (comSaldo.length > 1) alertas.push('Há mais de um decênio com saldo (' + comSaldo.map(textoDecenio).join(', ') + '): sugeri o mais antigo, confira se o servidor pediu outro.');
      if (periodo && periodo.meses != null && ficha.saldo != null && periodo.meses > ficha.saldo) {
        alertas.push('Foram pedidos ' + periodo.meses + ' meses, mas a Ficha informa saldo de ' + ficha.saldo + '.');
      }
    }

    var bloqueio = '';
    if (portarias.some(function (p) { return p.semEfeito; })) bloqueio = 'já existe portaria tornando a licença sem efeito';
    else if (cancelamentos.length) bloqueio = 'há despacho pedindo para cancelar ou desconsiderar';
    return {
      bloqueio: bloqueio, processo: processo, servidor: ficha, decenios: ficha ? ficha.decenios : [], saldo: ficha ? ficha.saldo : null,
      decenioSugerido: textoDecenio(decSug), decisao: decisao, fundamento: fundamento, periodo: periodo, portarias: portarias,
      alertas: alertas, ignorados: ignorados, assuntoLP: assuntoLP, documentos: docs.length
    };
  }

  // Agrupa arquivos soltos por processo (o número está no rodapé de cada documento) e lê cada um.
  // arquivos: [{ nome, html }]
  function lerProcessos(arquivos) {
    var grupos = {}, ordem = [], semNumero = [];
    arquivos.forEach(function (a) {
      var info = infoDoArquivo(a.nome);
      if (info.ext !== 'html' && info.ext !== 'htm') { semNumero.push(a); return; }
      var txt = textoDoHtml(a.html);
      var n = numeroDoRodape(txt) || numeroDoProcesso(txt);
      if (!n) { semNumero.push(a); return; }
      if (!grupos[n]) { grupos[n] = []; ordem.push(n); }
      grupos[n].push(a);
    });
    return ordem.map(function (n) { return lerProcesso(grupos[n]); });
  }

  // ---------- achar o servidor na planilha ----------
  function soDigitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

  // A matrícula da Ficha ("16.204-3") é parte da de 9 dígitos da planilha ("001620431").
  function matriculaCombina(planilha, ficha) {
    var p = soDigitos(planilha), f = soDigitos(ficha);
    if (!f) return false;
    return p === f.padStart(9, '0') || p.indexOf(f) === 2;
  }

  // base: Dados.montarBase(...); servidor: { nome, matricula }. Devolve { servidor, aviso } (servidor null = não achado).
  function acharServidor(base, servidor) {
    var nome = D.normalizar(servidor.nome || '');
    var iguais = base.filter(function (s) { return D.normalizar(s.nome) === nome; });
    if (iguais.length === 1) {
      return { servidor: iguais[0], aviso: matriculaCombina(iguais[0].matricula, servidor.matricula) || !servidor.matricula ? '' :
        'A matrícula da Ficha (' + servidor.matricula + ') não combina com a da planilha (' + iguais[0].matriculaFormatada + '): confira se é a mesma pessoa.' };
    }
    if (iguais.length > 1) {
      var filtrados = iguais.filter(function (s) { return matriculaCombina(s.matricula, servidor.matricula); });
      if (filtrados.length === 1) return { servidor: filtrados[0], aviso: '' };
      return { servidor: null, aviso: 'Há mais de um servidor com o nome ' + servidor.nome + ' na planilha: escolha na busca.' };
    }
    var pelaMatricula = base.filter(function (s) { return matriculaCombina(s.matricula, servidor.matricula); });
    if (pelaMatricula.length === 1) {
      return { servidor: pelaMatricula[0], aviso: 'Achado pela matrícula; o nome na planilha é ' + pelaMatricula[0].nome + '.' };
    }
    return { servidor: null, aviso: 'Não achei ' + servidor.nome + ' na planilha: escolha na busca.' };
  }

  var api = {
    textoDoHtml: textoDoHtml, linhasDeTabela: linhasDeTabela, infoDoArquivo: infoDoArquivo, numeroDoProcesso: numeroDoProcesso,
    periodoDoTexto: periodoDoTexto, fimDoGozo: fimDoGozo, somarDias: somarDias, lerFicha: lerFicha, decenioSugerido: decenioSugerido,
    lerProcesso: lerProcesso, lerProcessos: lerProcessos, acharServidor: acharServidor, matriculaCombina: matriculaCombina,
    secretariaDoCabecalho: secretariaDoCabecalho, iso: iso, br: br
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.SeiProcesso = api;
})(typeof window !== 'undefined' ? window : this);
