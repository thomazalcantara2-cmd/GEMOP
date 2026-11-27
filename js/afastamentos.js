/*
 * Afastamentos do servidor (aba AFASTAMENTO da FichaContabilis) e impedimentos da licença prêmio.
 * Funções puras (sem tela): funcionam no navegador (window.Afastamentos) e no Node (testes).
 *
 * Regra (licença prêmio): em cada decênio (10 anos de efetivo exercício) o servidor perde o tempo acumulado se, no período,
 *  - tiver licença sem vencimentos / para tratar de interesses particulares, ou para acompanhar cônjuge;
 *  - tiver licença por doença em pessoa da família por mais de 30 dias;
 *  - sofrer suspensão disciplinar ou responder a inquérito administrativo, ou estar recluso (pena privativa de liberdade);
 *  - faltar mais de 30 dias sem justificativa (as faltas NÃO constam desta aba).
 * O decênio recomeça no último dia do impedimento. O programa só AVISA: quem decide é quem faz a portaria.
 */
(function (global) {
  'use strict';

  var D = (typeof module !== 'undefined' && module.exports) ? require('./dados.js') : global.Dados;

  // Códigos da coluna "Afastamento" ("507 - LICENCA SEM VENCIMENTO"): o que impede, o que depende de conferência
  var IMPEDE = {
    507: 'licença sem vencimentos', 520: 'licença para tratar de interesse particular', 691: 'licença sem vencimentos (sub judice)',
    605: 'licença para acompanhar cônjuge', 669: 'licença para acompanhar cônjuge (sem remuneração)', 675: 'suspensão disciplinar',
    // enquanto o servidor responde a inquérito administrativo ou está recluso, a licença prêmio não pode ser concedida nem usufruída
    516: 'inquérito administrativo', 602: 'reclusão'
  };
  var CONDICIONAL = { 509: 'licença por motivo de doença em pessoa da família' };   // só impede se passar de 30 dias
  var VERIFICAR = {
    518: 'cedido para outro órgão, com ônus para a origem (confira o tempo exclusivo no município)',
    519: 'cedido para outro órgão, sem ônus para a origem (confira o tempo exclusivo no município)',
    621: 'afastamento para posse em outro cargo inacumulável', 618: 'bloqueio de pagamento',
    613: 'outros motivos de afastamento temporário'
  };
  var DIAS_MAX_FAMILIA = 30;
  var SEM_FIM = 9999;   // o sistema de RH marca afastamento em aberto com 31/12/9999

  function chave(v) { var d = D.soDigitos(v); return d ? d.padStart(9, '0') : ''; }
  function norm(t) { return D.normalizar(String(t == null ? '' : t)); }
  function codigoDe(t) { var m = /^\s*(\d{3})\b/.exec(String(t == null ? '' : t)); return m ? +m[1] : 0; }
  function utc(dt) { return Date.UTC(dt.a, dt.m - 1, dt.d); }
  function diasEntre(i, f) { return Math.round((utc(f) - utc(i)) / 86400000) + 1; }   // inclusive
  function comparar(x, y) { return utc(x) - utc(y); }
  function somarAnos(dt, n) { return { a: dt.a + n, m: dt.m, d: dt.d }; }
  function hojeData() { var h = new Date(); return { a: h.getFullYear(), m: h.getMonth() + 1, d: h.getDate() }; }
  function emAberto(dt) { return !dt || dt.a >= SEM_FIM; }

  // Tipo do afastamento: { nivel: 'impede'|'condicional'|'verificar'|'', rotulo }. Primeiro o código, depois palavras, por fim o código SEFIP.
  function classificar(afastamento, sefip) {
    var cod = codigoDe(afastamento);
    if (IMPEDE[cod]) return { nivel: 'impede', rotulo: IMPEDE[cod] };
    if (CONDICIONAL[cod]) return { nivel: 'condicional', rotulo: CONDICIONAL[cod] };
    if (VERIFICAR[cod]) return { nivel: 'verificar', rotulo: VERIFICAR[cod] };
    if (cod) return { nivel: '', rotulo: '' };   // código conhecido de outro tipo (licença médica, maternidade, rescisão…): não impede
    var n = norm(afastamento);
    if (/SEM VENCIMENTO|INTERESSE PARTICULAR/.test(n)) return { nivel: 'impede', rotulo: 'licença sem vencimentos' };
    if (/ACOMPANHAMENTO.*CONJUGE/.test(n)) return { nivel: 'impede', rotulo: 'licença para acompanhar cônjuge' };
    if (/SUSPENS/.test(n)) return { nivel: 'impede', rotulo: 'suspensão disciplinar' };
    if (/SAUDE FAMILIA|DOENCA EM PESSOA DA FAMILIA/.test(n)) return { nivel: 'condicional', rotulo: CONDICIONAL[509] };
    var sf = String(sefip == null ? '' : sefip).trim().split(/\s+-\s+/)[0].toUpperCase();
    if (sf === 'X') return { nivel: 'impede', rotulo: 'licença sem vencimentos' };
    if (sf === 'Y') return { nivel: 'verificar', rotulo: VERIFICAR[613] };
    return { nivel: '', rotulo: '' };
  }

  function colunaDe(linha, nomes) {
    for (var i = 0; i < nomes.length; i++) {
      var alvo = norm(nomes[i]);
      for (var k in linha) if (norm(k) === alvo) return linha[k];
    }
    return null;
  }

  // Linhas da aba (objetos) -> { matricula: [{ inicio, fim, afastamento, sefip, nivel, rotulo }] }, só o que importa (a aba é enorme)
  function indexar(linhas) {
    var porMatricula = {};
    (linhas || []).forEach(function (l) {
      var mat = chave(colunaDe(l, ['Matricula', 'nu_matricula']));
      var inicio = D.paraData(colunaDe(l, ['Inicio']));
      if (!mat || !inicio) return;
      var tipo = colunaDe(l, ['Afastamento']), sefip = colunaDe(l, ['Afastamento_SEFIP']);
      var c = classificar(tipo, sefip);
      if (!c.nivel) return;   // só guarda o que pode pesar na licença prêmio
      (porMatricula[mat] = porMatricula[mat] || []).push({ inicio: inicio, fim: D.paraData(colunaDe(l, ['Fim'])), afastamento: String(tipo || ''), nivel: c.nivel, rotulo: c.rotulo });
    });
    return porMatricula;
  }

  // "2014/2024" -> { ini: 2014, fim: 2024 } (decênio incompleto, como 2013/____, não conta)
  function lerDecenio(t) {
    var m = /(\d{4})\D+(\d{4})/.exec(String(t || ''));
    return m && +m[2] > +m[1] ? { ini: +m[1], fim: +m[2] } : null;
  }

  // Une afastamentos seguidos do mesmo tipo (a folha de pagamento costuma quebrar um afastamento em vários registros)
  function unir(itens) {
    var ord = itens.slice().sort(function (x, y) { return comparar(x.inicio, y.inicio); }), out = [];
    ord.forEach(function (x) {
      var u = out[out.length - 1];
      var fimU = u && (emAberto(u.fim) ? null : u.fim);
      if (u && u.rotulo === x.rotulo && (emAberto(u.fim) || diasEntre(fimU, x.inicio) <= 2)) {
        if (emAberto(x.fim) || (!emAberto(u.fim) && comparar(x.fim, u.fim) > 0)) u.fim = x.fim;
      } else out.push({ inicio: x.inicio, fim: x.fim, afastamento: x.afastamento, nivel: x.nivel, rotulo: x.rotulo });
    });
    return out;
  }

  /*
   * Analisa um servidor num decênio.
   *  afastamentos: a lista do servidor em indexar(); admissao: { a, m, d }; decenio: "2014/2024"; hoje: { a, m, d } (opcional)
   * Devolve { decenio, janela:{ini,fim}, impedem:[{...,dias}], verificar:[...], reinicio, completa, emCurso, incompleto, observacao }
   * ou null se faltar admissão ou decênio.
   */
  function analisar(afastamentos, admissao, decenio, hoje) {
    var dec = lerDecenio(decenio);
    if (!dec || !admissao) return null;
    hoje = hoje || hojeData();
    var janela = { ini: { a: dec.ini, m: admissao.m, d: admissao.d }, fim: { a: dec.fim, m: admissao.m, d: admissao.d } };
    var dentro = unir((afastamentos || []).filter(function (x) {
      var fim = emAberto(x.fim) ? hoje : x.fim;
      return comparar(x.inicio, janela.fim) < 0 && comparar(fim, janela.ini) >= 0;
    }));
    var impedem = [], verificar = [];
    dentro.forEach(function (x) {
      var fimEfetivo = emAberto(x.fim) ? hoje : x.fim;
      var dias = diasEntre(x.inicio, fimEfetivo);
      var item = { inicio: x.inicio, fim: emAberto(x.fim) ? null : x.fim, rotulo: x.rotulo, dias: dias };
      if (x.nivel === 'impede') impedem.push(item);
      else if (x.nivel === 'condicional') { if (dias > DIAS_MAX_FAMILIA) impedem.push(item); }
      else verificar.push(item);
    });
    var emCurso = impedem.some(function (x) { return !x.fim; });
    var ultimo = impedem.filter(function (x) { return x.fim; }).sort(function (x, y) { return comparar(y.fim, x.fim); })[0];
    var reinicio = impedem.length && !emCurso ? ultimo.fim : null;
    var completa = reinicio ? somarAnos(reinicio, 10) : null;
    var incompleto = comparar(janela.fim, hoje) > 0;
    return { decenio: dec, janela: janela, impedem: impedem, verificar: verificar, reinicio: reinicio, completa: completa, emCurso: emCurso,
      incompleto: incompleto, observacao: textoObservacao(dec, impedem, reinicio, completa, emCurso) };
  }

  function periodoTexto(x) { return x.fim ? D.dataBR(x.inicio) + ' a ' + D.dataBR(x.fim) : 'desde ' + D.dataBR(x.inicio); }

  // Texto da portaria: só os impedimentos confirmados pela planilha (o que é "verificar" fica só no aviso da tela)
  function textoObservacao(dec, impedem, reinicio, completa, emCurso) {
    if (!impedem.length) return '';
    var lista = impedem.map(function (x) { return x.rotulo + ' (' + periodoTexto(x) + ')'; });
    var quais = lista.length === 1 ? lista[0] : lista.slice(0, -1).join('; ') + ' e ' + lista[lista.length - 1];
    var efeito = emCurso ? ', e há impedimento ainda em andamento, o que impede a concessão e o gozo da licença prêmio enquanto perdurar'
      : ', o que reinicia a contagem do decênio a partir de ' + D.dataBR(reinicio) + ', completando-se em ' + D.dataBR(completa);
    return 'constam, no decênio ' + dec.ini + '/' + dec.fim + ', ' + (impedem.length === 1 ? 'impedimento por ' : 'impedimentos por ') + quais + efeito + '.';
  }

  // Avisos para a tela (texto simples), com o que o programa NÃO consegue conferir
  function avisos(a) {
    if (!a) return [];
    var out = [];
    a.impedem.forEach(function (x) { out.push('Impedimento no decênio ' + a.decenio.ini + '/' + a.decenio.fim + ': ' + x.rotulo + ' (' + periodoTexto(x) + ').'); });
    if (a.impedem.length && !a.emCurso) out.push('O decênio recomeça em ' + D.dataBR(a.reinicio) + ' e se completa em ' + D.dataBR(a.completa) + '.');
    a.verificar.forEach(function (x) { out.push('Confira: ' + x.rotulo + ' (' + periodoTexto(x) + ').'); });
    if (a.incompleto) out.push('O decênio ' + a.decenio.ini + '/' + a.decenio.fim + ' só se completa em ' + D.dataBR(a.janela.fim) + '.');
    return out;
  }

  var api = { classificar: classificar, indexar: indexar, chave: chave, lerDecenio: lerDecenio, unir: unir, analisar: analisar, avisos: avisos, textoObservacao: textoObservacao };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Afastamentos = api;
})(typeof window !== 'undefined' ? window : this);
