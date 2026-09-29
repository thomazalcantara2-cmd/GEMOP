/* Interface: carrega as planilhas, busca o servidor e preenche o requerimento. */
(function () {
  'use strict';

  var D = window.Dados;
  var CHAVE_CONFIG = 'gemop-requerimento-config-v2';

  var PADRAO = {
    protocolo: '',
    de: 'SANDRA MOTTA\nUnidade de Gestão de Pessoas\nSecretaria Executiva de Gestão de Pessoas',
    para: 'LUIZ CARLOS AGUIAR BAYMA FILHO\nAssessoria de Movimentação de Pessoas\nSecretaria Executiva de Gestão de Pessoas',
    assunto: 'Renovação de cessão de servidor',
    complementares: [
      'FICHA financeira: {ano}.',
      '{faltas}',
      '{estagio}',
      '{ferias_licencas}',
      'NÃO CONSTA processo administrativo disciplinar, na modalidade inquérito administrativo, em andamento.',
      'NÃO CONSTA contrato de prazo determinado para atendimento de excepcional interesse público.'
    ].join('\n'),
    assinaturaEsq: '',
    assinaturaDir: 'Sandra Motta\nASSESS. Unidade Gestão de Pessoas-UGEP',
    cidade: 'Jaboatão dos Guararapes',
    orgaosCessao: D.ORGAOS_CESSAO.join('\n')
  };

  var estado = {
    indice: null,      // { nome, linhas, anoMes }
    ficha: null,       // { nome, servidores, lotacoes }
    base: [],
    selecionado: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function linhasHTML(texto) {
    return esc(texto).split('\n').join('<br>');
  }

  // Escapa o texto, transforma **trecho** em negrito e \n em quebra de linha.
  // CONSTA / CONSTAM / NÃO CONSTA / NÃO CONSTAM (em maiúsculas) saem sempre em negrito.
  function textoFormatado(texto) {
    return linhasHTML(texto).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(NÃO CONSTAM?|CONSTAM?)(?![A-ZÀ-Ú])/g, '<b>$1</b>');
  }

  function hojeISO() {
    var h = new Date();
    return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0') + '-' + String(h.getDate()).padStart(2, '0');
  }

  // ---------- configurações (somente textos do formulário; nunca dados de servidores) ----------
  function lerConfig() {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(CHAVE_CONFIG) || '{}') || {}; } catch (e) { cfg = {}; }
    Object.keys(PADRAO).forEach(function (k) {
      var el = $('cfg-' + k);
      if (el) el.value = cfg[k] != null ? cfg[k] : PADRAO[k];
    });
  }

  function salvarConfig() {
    var cfg = {};
    Object.keys(PADRAO).forEach(function (k) {
      var el = $('cfg-' + k);
      if (el) cfg[k] = el.value;
    });
    try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(cfg)); } catch (e) { /* armazenamento indisponível */ }
  }

  function cfg(k) {
    var el = $('cfg-' + k);
    return el ? el.value : PADRAO[k];
  }

  // ---------- leitura das planilhas ----------
  function lerArquivo(arquivo) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onload = function () {
        try {
          resolve(XLSX.read(new Uint8Array(leitor.result), { type: 'array' }));
        } catch (e) { reject(e); }
      };
      leitor.onerror = function () { reject(leitor.error); };
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  function linhasDaAba(wb, nome) {
    var alvo = D.normalizar(nome);
    var aba = wb.SheetNames.filter(function (n) { return D.normalizar(n) === alvo; })[0];
    return aba ? XLSX.utils.sheet_to_json(wb.Sheets[aba], { raw: true, defval: null }) : null;
  }

  function identificar(wb, nomeArquivo) {
    var lotacoes = linhasDaAba(wb, 'Lotacoes');
    if (lotacoes) {
      return { tipo: 'ficha', nome: nomeArquivo, servidores: linhasDaAba(wb, 'Servidores') || [],
        lotacoes: lotacoes, afastamentos: linhasDaAba(wb, 'Afastamentos') || [],
        ferias: linhasDaAba(wb, 'Ferias') || [], faltas: linhasDaAba(wb, 'Faltas') || [] };
    }
    for (var i = 0; i < wb.SheetNames.length; i++) {
      var linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { raw: true, defval: null });
      if (linhas.length && 'nu_matricula' in linhas[0] && 'nm_Funcionario' in linhas[0]) {
        return { tipo: 'indice', nome: nomeArquivo, linhas: linhas, anoMes: linhas[0].dt_anoMes };
      }
    }
    return null;
  }

  // opcoes.ignorarDesconhecidos: na leitura da pasta, arquivos que não são as planilhas esperadas são ignorados.
  function carregarArquivos(lista, opcoes) {
    opcoes = opcoes || {};
    // do mais antigo para o mais novo: se houver duas versões da mesma planilha, vale a mais recente
    var arquivos = Array.prototype.slice.call(lista || []).sort(function (a, b) {
      return (a.lastModified || 0) - (b.lastModified || 0);
    });
    if (!arquivos.length) return Promise.resolve();
    mostrarErro('');
    return Promise.all(arquivos.map(function (f) {
      return lerArquivo(f).then(function (wb) {
        var r = identificar(wb, f.name);
        if (r) r.modificado = f.lastModified ? new Date(f.lastModified) : null;
        return r;
      });
    })).then(function (res) {
      var naoReconhecidos = [];
      res.forEach(function (r, i) {
        if (!r) naoReconhecidos.push(arquivos[i].name);
        else if (r.tipo === 'indice') estado.indice = r;
        else estado.ficha = r;
      });
      if (naoReconhecidos.length && !opcoes.ignorarDesconhecidos) {
        mostrarErro('Arquivo não reconhecido: ' + naoReconhecidos.join(', ') +
          '. Envie o "INDICE CEDIDOS SAD" (aba SERVIDORES) e o "relFichaCadastralCompleta" (aba Lotacoes).');
      }
      reconstruirBase();
    }).catch(function (e) {
      mostrarErro('Não foi possível ler a planilha: ' + e.message);
    });
  }

  // ---------- pasta das planilhas (Chrome/Edge: File System Access API) ----------
  // O navegador não deixa uma página abrir pastas do computador sozinha: a pasta é escolhida
  // uma vez e o acesso fica guardado neste navegador (IndexedDB) para as próximas vezes.
  var BANCO = 'gemop-requerimento', LOJA = 'pasta';

  function bancoPasta(modo, valor) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open(BANCO, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(LOJA); };
        req.onerror = function () { resolve(null); };
        req.onsuccess = function () {
          try {
            var tx = req.result.transaction(LOJA, modo === 'gravar' ? 'readwrite' : 'readonly');
            var loja = tx.objectStore(LOJA);
            var op = modo === 'gravar' ? loja.put(valor, 'pasta') : loja.get('pasta');
            op.onsuccess = function () { resolve(op.result || null); };
            op.onerror = function () { resolve(null); };
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
  }

  function planilhasDaPasta(pasta) {
    var arquivos = [];
    var iterador = pasta.values();
    function proximo() {
      return iterador.next().then(function (item) {
        if (item.done) return arquivos;
        var h = item.value;
        if (h.kind !== 'file' || !/\.xlsx?$/i.test(h.name) || /^~\$/.test(h.name)) return proximo();
        return h.getFile().then(function (f) { arquivos.push(f); return proximo(); });
      });
    }
    return proximo().then(function (todos) {
      return escolherPlanilhas(todos, function (f) { return f.name; });
    });
  }

  // Lê primeiro só as planilhas com o nome esperado; se faltar alguma, lê todas para identificar pelo conteúdo.
  function escolherPlanilhas(itens, nomeDe) {
    var nome = function (x) { return D.normalizar(nomeDe(x)).replace(/[^A-Z]/g, ''); };
    var pelosNomes = itens.filter(function (x) {
      var n = nome(x);
      return n.indexOf('INDICE') >= 0 || n.indexOf('CEDIDOS') >= 0 || n.indexOf('FICHACADASTRAL') >= 0;
    });
    var temIndice = pelosNomes.some(function (x) { return /INDICE|CEDIDOS/.test(nome(x)); });
    var temFicha = pelosNomes.some(function (x) { return nome(x).indexOf('FICHACADASTRAL') >= 0; });
    return temIndice && temFicha ? pelosNomes : itens;
  }

  // ---------- modo aplicativo local (Requerimento.bat + servidor.ps1) ----------
  // O servidor local (só neste computador) entrega a lista e o conteúdo das planilhas da pasta configurada.
  function carregarDoServidorLocal() {
    return fetch('api/planilhas', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (info) {
      $('bloco-pasta').hidden = false;
      $('escolher-pasta').hidden = true;
      $('recarregar').hidden = false;
      $('recarregar').textContent = 'Recarregar planilhas';
      $('pasta-nome').textContent = 'Pasta: ' + info.pasta;
      var lista = escolherPlanilhas(info.arquivos || [], function (a) { return a.nome; });
      if (!lista.length) {
        mostrarErro('Nenhuma planilha .xlsx encontrada na pasta ' + info.pasta + '. Salve lá o INDICE CEDIDOS SAD e o relFichaCadastralCompleta.');
        return;
      }
      return Promise.all(lista.map(function (a) {
        return fetch('api/arquivo?nome=' + encodeURIComponent(a.nome), { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('não foi possível ler ' + a.nome);
          return r.blob();
        }).then(function (b) { return new File([b], a.nome, { lastModified: a.modificado }); });
      })).then(function (arquivos) {
        return carregarArquivos(arquivos, { ignorarDesconhecidos: true }).then(function () {
          if (!estado.indice || !estado.ficha) {
            mostrarErro('Na pasta ' + info.pasta + ' não foi encontrado: ' +
              [!estado.indice && 'INDICE CEDIDOS SAD', !estado.ficha && 'relFichaCadastralCompleta'].filter(Boolean).join(' e ') + '.');
          }
        });
      });
    });
  }

  function carregarDaPasta(pasta, pedirPermissao) {
    var permissao = pedirPermissao ? pasta.requestPermission({ mode: 'read' }) : pasta.queryPermission({ mode: 'read' });
    return permissao.then(function (estadoPermissao) {
      if (estadoPermissao !== 'granted') { mostrarPasta(pasta, false); return; }
      mostrarPasta(pasta, true);
      return planilhasDaPasta(pasta).then(function (arquivos) {
        if (!arquivos.length) { mostrarErro('Nenhuma planilha .xlsx encontrada na pasta "' + pasta.name + '".'); return; }
        return carregarArquivos(arquivos, { ignorarDesconhecidos: true }).then(function () {
          if (!estado.indice || !estado.ficha) {
            mostrarErro('Na pasta "' + pasta.name + '" não foi encontrado: ' +
              [!estado.indice && 'INDICE CEDIDOS SAD', !estado.ficha && 'relFichaCadastralCompleta'].filter(Boolean).join(' e ') + '.');
          }
        });
      });
    }).catch(function (e) { mostrarErro('Não foi possível ler a pasta: ' + e.message); });
  }

  function mostrarPasta(pasta, liberada) {
    estado.pasta = pasta;
    $('pasta-nome').textContent = pasta ? 'Pasta: ' + pasta.name : '';
    $('recarregar').hidden = !pasta;
    $('recarregar').textContent = liberada ? 'Recarregar da pasta' : 'Carregar da pasta "' + pasta.name + '"';
  }

  function escolherPasta() {
    window.showDirectoryPicker({ id: 'planilhas-cedidos', mode: 'read' }).then(function (pasta) {
      bancoPasta('gravar', pasta);
      return carregarDaPasta(pasta, false);
    }).catch(function (e) { if (e.name !== 'AbortError') mostrarErro('Não foi possível abrir a pasta: ' + e.message); });
  }

  function iniciarPasta() {
    $('recarregar').addEventListener('click', function () {
      if (estado.modoLocal) {
        carregarDoServidorLocal().catch(function (e) { mostrarErro('Não foi possível ler as planilhas: ' + e.message); });
      } else if (estado.pasta) carregarDaPasta(estado.pasta, true);
    });
    if (/^https?:$/.test(location.protocol)) {
      estado.modoLocal = true;
      carregarDoServidorLocal().catch(function () { estado.modoLocal = false; iniciarSeletorPasta(); });
      return;
    }
    iniciarSeletorPasta();
  }

  function iniciarSeletorPasta() {
    if (!('showDirectoryPicker' in window)) { $('bloco-pasta').hidden = true; return; }
    $('escolher-pasta').addEventListener('click', escolherPasta);
    bancoPasta('ler').then(function (pasta) { if (pasta) carregarDaPasta(pasta, false); });
  }

  function reconstruirBase() {
    atualizarStatus();
    if (!estado.indice) { estado.base = []; return; }
    var prefixos = cfg('orgaosCessao').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    estado.base = D.montarBase(estado.indice.linhas, estado.ficha || { servidores: [], lotacoes: [] },
      prefixos.length ? prefixos : null);
    $('busca').disabled = false;
    $('busca').placeholder = 'Digite o nome, matrícula ou CPF (' + estado.base.length + ' servidores)';
    if (estado.selecionado) {
      var mat = estado.selecionado.matricula;
      estado.selecionado = estado.base.filter(function (s) { return s.matricula === mat; })[0] || null;
    }
    atualizarBusca();
    renderizar();
  }

  function modificadoEm(r) {
    return r.modificado ? ' · arquivo de ' + r.modificado.toLocaleDateString('pt-BR') : '';
  }

  function atualizarStatus() {
    var i = estado.indice, f = estado.ficha;
    var anoMes = i && i.anoMes ? String(Math.round(i.anoMes)) : '';
    $('status-indice').className = 'arquivo ' + (i ? 'ok' : '');
    $('status-indice').innerHTML = i
      ? '<b>INDICE CEDIDOS SAD</b> — ' + esc(i.nome) + '<br><small>' + i.linhas.length + ' servidores' +
        (anoMes ? ' · competência ' + anoMes.slice(4) + '/' + anoMes.slice(0, 4) : '') + modificadoEm(i) + '</small>'
      : '<b>INDICE CEDIDOS SAD</b> — aguardando arquivo';
    $('status-ficha').className = 'arquivo ' + (f ? 'ok' : '');
    $('status-ficha').innerHTML = f
      ? '<b>Ficha Cadastral Completa</b> — ' + esc(f.nome) + '<br><small>' + f.lotacoes.length + ' registros de lotação' + modificadoEm(f) + '</small>'
      : '<b>Ficha Cadastral Completa</b> — aguardando arquivo';
  }

  function mostrarErro(msg) {
    $('erro').textContent = msg;
    $('erro').hidden = !msg;
  }

  // ---------- busca ----------
  function atualizarBusca() {
    var termo = $('busca').value;
    var lista = $('resultados');
    var achados = termo.trim() ? D.buscar(estado.base, termo) : [];
    lista.innerHTML = achados.slice(0, 30).map(function (s, i) {
      var sel = estado.selecionado && estado.selecionado.matricula === s.matricula;
      return '<li role="option" data-i="' + i + '" class="' + (sel ? 'sel' : '') + '"><b>' + esc(s.nome) +
        '</b><small>Mat. ' + esc(s.matriculaFormatada) + ' · ' + esc(s.lotacao) + '</small></li>';
    }).join('') + (termo.trim() && !achados.length ? '<li class="vazio">Nenhum servidor encontrado.</li>' : '');
    lista.hidden = !termo.trim();
    lista._achados = achados;
  }

  function selecionar(s) {
    estado.selecionado = s;
    $('busca').value = s.nome;
    $('resultados').hidden = true;
    renderizar();
  }

  // ---------- formulário ----------
  function dataInput(id) {
    var v = $(id).value;
    return v ? D.paraData(v) : null;
  }

  function renderizar() {
    var s = estado.selecionado;
    var dataReq = dataInput('cfg-data');
    var dataEmissao = dataInput('cfg-emissao') || dataReq;
    var avisos = [];

    var tempo = '', financeiro = '';
    if (s) {
      var t = D.tempoEntre(s.admissao, dataEmissao);
      tempo = D.formatarTempo(t);
      if (s.salario != null) financeiro = D.formatarMoeda(s.salario) + ' (' + D.valorExtenso(s.salario) + ')';
      if (!estado.ficha) avisos.push('Carregue a Ficha Cadastral Completa para preencher Lotação e Órgão de origem pelo histórico.');
      else if (s.semFicha) avisos.push('Servidor sem histórico de lotação na Ficha Cadastral — Lotação vinda do INDICE e Órgão de origem em branco.');
      else if (!s.origemEncontrada) avisos.push('Não há órgão anterior à Secretaria de Administração no histórico deste servidor. Foi usado o órgão atual — confira o Órgão de origem.');
      if (s.origemPeriodo) {
        avisos.push('Órgão de origem obtido da lotação de ' + D.dataBR(s.origemPeriodo.inicio) + ' a ' +
          (s.origemPeriodo.fim ? D.dataBR(s.origemPeriodo.fim) : 'atual') + ' (' + s.origemPeriodo.local + ').');
      }
    }
    $('avisos').innerHTML = avisos.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('');
    $('avisos').hidden = !avisos.length;

    var complementares = D.informacoesComplementares(cfg('complementares'), s, dataEmissao || D.paraData(hojeISO()));

    var de = cfg('de').split('\n');
    var para = cfg('para').split('\n');
    var afast = s ? D.formatarAfastamentos(s.afastamentos) : [];

    var v = function (x) { return s ? esc(x) : ''; };

    $('folha').innerHTML =
      '<header class="cab">' +
        '<img src="assets/logo.png" alt="Prefeitura do Jaboatão dos Guararapes">' +
        '<p>SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO<br>SECRETARIA EXECUTIVA DE GESTÃO DE PESSOAS</p>' +
      '</header>' +
      '<table class="grade topo">' +
        '<colgroup><col style="width:50%"><col style="width:30%"><col style="width:20%"></colgroup>' +
        '<tr><td class="titulo">REQUERIMENTO DO SERVIDOR</td>' +
          '<td class="centro"><b>PROTOCOLO:</b><br><span class="peq" contenteditable>' + esc(cfg('protocolo')) + '</span></td>' +
          '<td class="centro"><b>DATA:</b><br><span class="peq" contenteditable>' + esc(D.dataBR(dataReq)) + '</span></td></tr>' +
        '<tr><td><b>DE:</b><div contenteditable><b>' + esc(de[0] || '') + '</b>' +
            (de.length > 1 ? '<br>' + linhasHTML(de.slice(1).join('\n')) : '') + '</div></td>' +
          '<td colspan="2"><b>PARA:</b><div contenteditable><b>' + esc(para[0] || '') + '</b>' +
            (para.length > 1 ? '<br>' + linhasHTML(para.slice(1).join('\n')) : '') + '</div></td></tr>' +
        '<tr><td colspan="3"><b>ASSUNTO:</b> <b contenteditable>' + esc(cfg('assunto')) + '</b></td></tr>' +
      '</table>' +
      '<table class="grade dados">' +
        '<colgroup><col style="width:50%"><col style="width:50%"></colgroup>' +
        '<tr><td colspan="2"><b>NOME:</b> <b contenteditable>' + v(s && s.nome) + '</b></td></tr>' +
        '<tr><td><b>MATRÍCULA:</b> <b contenteditable>' + v(s && s.matriculaFormatada) + '</b></td>' +
          '<td><b>DATA DE ADMISSÃO:</b> <b contenteditable>' + v(s && D.dataBR(s.admissao)) + '</b></td></tr>' +
        '<tr><td><b>CPF:</b> <b contenteditable>' + v(s && s.cpf) + '</b></td>' +
          '<td><b>DATA DE NASCIMENTO:</b> <b contenteditable>' + v(s && D.dataBR(s.nascimento)) + '</b></td></tr>' +
        '<tr><td colspan="2"><b>CARGO:</b> <b contenteditable>' + v(s && s.cargo) + '</b></td></tr>' +
        '<tr><td colspan="2"><b>ÓRGÃO DE ORIGEM:</b><div class="valor" contenteditable>' + v(s && s.orgaoOrigem) + '</div></td></tr>' +
        '<tr><td colspan="2"><b>LOTAÇÃO:</b><div class="valor" contenteditable>' + v(s && s.lotacao) + '</div></td></tr>' +
        '<tr><td colspan="2"><b>TIPO DE AFASTAMENTO:</b><div class="valor' + (afast.length ? ' afast' : '') + '" contenteditable>' +
          (afast.length ? afast.map(function (a) { return '<div>' + esc(a) + '</div>'; }).join('') : '<span class="xis">' + new Array(35).join('x - ') + 'x</span>') + '</div></td></tr>' +
        '<tr><td colspan="2"><b>TIPO DE VÍNCULO:</b><div class="valor" contenteditable>' + v(s && s.vinculo) + '</div></td></tr>' +
        '<tr><td colspan="2"><b>TEMPO DE SERVIÇO:</b> <b contenteditable>' + v(tempo) + '</b></td></tr>' +
        '<tr><td colspan="2"><b>INFORMAÇÕES FINANCEIRAS:</b><div class="valor esq" contenteditable>' + v(financeiro) + '</div></td></tr>' +
      '</table>' +
      '<table class="grade compl"><tr><td><b>INFORMAÇÕES COMPLEMENTARES:</b>' +
        '<ol contenteditable>' + complementares.map(function (l) { return '<li>' + textoFormatado(l) + '</li>'; }).join('') + '</ol>' +
      '</td></tr></table>' +
      '<p class="local" contenteditable>' + esc(cfg('cidade')) + ', ' + esc(D.dataExtenso(dataEmissao)) + '.</p>' +
      '<div class="assinaturas">' +
        '<div><span class="linha"></span><div contenteditable>' + linhasHTML(cfg('assinaturaEsq')) + '</div></div>' +
        '<div><span class="linha"></span><div contenteditable>' + linhasHTML(cfg('assinaturaDir')) + '</div></div>' +
      '</div>';

    $('imprimir').disabled = !s;
    document.title = s ? 'Requerimento - ' + s.nome : 'Requerimento do Servidor';
  }

  // ---------- eventos ----------
  function iniciar() {
    lerConfig();
    $('cfg-data').value = hojeISO();
    $('cfg-emissao').value = hojeISO();

    iniciarPasta();
    $('arquivos').addEventListener('change', function (e) { carregarArquivos(e.target.files); e.target.value = ''; });

    var zona = $('zona');
    ['dragenter', 'dragover'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('arrastando'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('arrastando'); });
    });
    zona.addEventListener('drop', function (e) { carregarArquivos(e.dataTransfer.files); });

    $('busca').addEventListener('input', atualizarBusca);
    $('busca').addEventListener('focus', atualizarBusca);
    $('busca').addEventListener('keydown', function (e) {
      var achados = $('resultados')._achados || [];
      if (e.key === 'Enter' && achados.length) { e.preventDefault(); selecionar(achados[0]); }
      if (e.key === 'Escape') $('resultados').hidden = true;
    });
    $('resultados').addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); selecionar($('resultados')._achados[+li.dataset.i]); }
    });
    $('busca').addEventListener('blur', function () { setTimeout(function () { $('resultados').hidden = true; }, 150); });

    document.querySelectorAll('[id^="cfg-"]').forEach(function (el) {
      el.addEventListener('input', function () {
        salvarConfig();
        if (el.id === 'cfg-orgaosCessao') reconstruirBase(); else renderizar();
      });
    });
    $('restaurar').addEventListener('click', function () {
      try { localStorage.removeItem(CHAVE_CONFIG); } catch (e) { /* ignora */ }
      lerConfig();
      reconstruirBase();
      renderizar();
    });
    $('imprimir').addEventListener('click', function () { window.print(); });

    atualizarStatus();
    renderizar();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
