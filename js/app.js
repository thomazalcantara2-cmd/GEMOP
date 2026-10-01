/* Interface: carrega as planilhas, busca o servidor e preenche o requerimento. */
(function () {
  'use strict';

  var D = window.Dados;
  var CHAVE_CONFIG = 'gemop-requerimento-config-v2';

  var PADRAO = {
    complementares: [
      'FICHA financeira: {ano}.',
      '{faltas}',
      '{estagio}',
      '{ferias_licencas}',
      'NÃO CONSTA processo administrativo disciplinar, na modalidade inquérito administrativo, em andamento.',
      'NÃO CONSTA contrato de prazo determinado para atendimento de excepcional interesse público.'
    ].join('\n'),
    orgaosCessao: D.ORGAOS_CESSAO.join('\n')
  };

  var estado = {
    indice: null,      // { nome, linhas, anoMes }
    fichas: [],        // Fichas Cadastrais carregadas (pode haver mais de uma, ex.: GABINETE)
    ficha: null,       // as fichas combinadas (D.combinarFichas)
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
      // na leitura da pasta, a lista de fichas é refeita; arrastando arquivos, as fichas se somam
      if (opcoes.ignorarDesconhecidos) estado.fichas = [];
      res.forEach(function (r, i) {
        if (!r) naoReconhecidos.push(arquivos[i].name);
        else if (r.tipo === 'indice') estado.indice = r;
        else {
          estado.fichas = estado.fichas.filter(function (f) { return f.nome !== r.nome; });
          estado.fichas.push(r);
        }
      });
      estado.fichas.sort(function (a, b) {
        return (a.modificado ? a.modificado.getTime() : 0) - (b.modificado ? b.modificado.getTime() : 0);
      });
      estado.ficha = estado.fichas.length ? D.combinarFichas(estado.fichas) : null;
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
      ? '<b>Ficha Cadastral Completa</b>' + (f.arquivos.length > 1 ? ' (' + f.arquivos.length + ' arquivos)' : '') +
        f.arquivos.map(function (a) {
          return '<br>' + esc(a.nome) + '<br><small>' + a.servidores + (a.servidores === 1 ? ' servidor' : ' servidores') + modificadoEm(a) + '</small>';
        }).join('')
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

  function linhaDado(rotulo, valorHTML, classe) {
    return '<div class="linha3' + (classe ? ' ' + classe : '') + '"><span class="rot">' + esc(rotulo) + '</span>' +
      '<div class="val" contenteditable>' + valorHTML + '</div><div class="obs" contenteditable></div></div>';
  }

  function renderizar() {
    var s = estado.selecionado;
    var dataDoc = dataInput('cfg-data') || D.paraData(hojeISO());
    var avisos = [];

    if (s) {
      if (!estado.ficha) avisos.push('Carregue a Ficha Cadastral Completa para preencher Lotação e Órgão de origem pelo histórico.');
      else if (s.semFicha) avisos.push('ATENÇÃO: servidor não encontrado na Ficha Cadastral Completa. Lotação veio do INDICE, Órgão de origem ficou em branco e afastamentos, férias e faltas NÃO puderam ser verificados — os itens "NÃO CONSTA" podem estar incorretos. Gere a Ficha Cadastral incluindo este servidor.');
      else if (!s.origemEncontrada) avisos.push('Não há órgão anterior à Secretaria de Administração no histórico deste servidor. Foi usado o órgão atual — confira o Órgão de origem.');
      if (s.origemPeriodo) {
        avisos.push('Órgão de origem obtido da lotação de ' + D.dataBR(s.origemPeriodo.inicio) + ' a ' +
          (s.origemPeriodo.fim ? D.dataBR(s.origemPeriodo.fim) : 'atual') + ' (' + s.origemPeriodo.local + ').');
      }
    }
    $('avisos').innerHTML = avisos.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('');
    $('avisos').hidden = !avisos.length;

    var v = function (x) { return s ? esc(x) : ''; };
    var tempo = s ? D.formatarTempo(D.tempoEntre(s.admissao, dataDoc)).replace(/\.$/, '') : '';
    var afast = '';
    if (s) {
      afast = s.afastamentos.length
        ? '<div class="afast">' + s.afastamentos.map(function (g) {
            return '<span><strong>' + esc(D.rotuloAfastamento(g.descricao)) + ':</strong> ' + esc(D.periodosTexto(g)) + '</span>';
          }).join('') + '</div>'
        : 'x - x - x';
    }
    var financeiro = s && s.salario != null
      ? '<div class="valor-fin"><b>' + esc(D.formatarMoeda(s.salario)) + '</b><span>' + esc(D.valorExtenso(s.salario)) + '</span></div>'
      : '';
    var complementares = D.informacoesComplementares(cfg('complementares'), s, dataDoc);

    $('folha').innerHTML =
      '<div class="faixa"><i style="background:#00953a"></i><i style="background:#fbb900"></i><i style="background:#0033a0"></i><i style="background:#00953a"></i></div>' +
      '<div class="corpo">' +
        '<header class="cab">' +
          '<img src="assets/logo-jaboatao.png" alt="Prefeitura do Jaboatão dos Guararapes">' +
          '<div class="orgao"><div>Secretaria Municipal de Administração</div><div>Secretaria Executiva de Gestão de Pessoas</div></div>' +
        '</header>' +
        '<div class="titulo"><h1>Dados do Servidor</h1>' +
          '<div class="data"><span class="rot">Data</span><b contenteditable>' + esc(D.dataBR(dataDoc)) + '</b></div></div>' +
        '<div class="cartao">' +
          '<div class="nome"><span class="rot">Nome</span><b contenteditable>' + v(s && s.nome) + '</b></div>' +
          '<div class="linha3 titulos"><span class="rot">Campo</span><span class="rot">Informação</span><span class="rot">Observações</span></div>' +
          linhaDado('Matrícula', v(s && s.matriculaFormatada)) +
          linhaDado('CPF', v(s && s.cpf)) +
          linhaDado('Nascimento', v(s && D.dataBR(s.nascimento))) +
          linhaDado('Admissão', v(s && D.dataBR(s.admissao))) +
          linhaDado('Cargo', v(s && s.cargo)) +
          linhaDado('Órgão de origem', v(s && s.orgaoOrigem)) +
          linhaDado('Lotação', v(s && s.lotacao)) +
          linhaDado('Vínculo', v(s && s.vinculo)) +
          linhaDado('Tempo de serviço', v(tempo)) +
          linhaDado('Afastamentos', afast) +
          linhaDado('Inf. financeiras', financeiro, 'fin') +
        '</div>' +
        '<div class="cartao compl"><div class="compl-tit">Informações complementares</div>' +
          '<ol contenteditable>' + complementares.map(function (l) { return '<li>' + textoFormatado(l) + '</li>'; }).join('') + '</ol>' +
        '</div>' +
      '</div>' +
      '<div class="faixa base"><i style="background:#0033a0"></i><i style="background:#00953a"></i><i style="background:#fbb900"></i></div>';

    ajustarAoTamanhoDaFolha();
    $('imprimir').disabled = !s;
    document.title = s ? 'Dados do Servidor - ' + s.nome : 'Dados do Servidor';
  }

  // Se o conteúdo não couber em uma página A4 (muitos afastamentos), reduz a fonte do corpo aos poucos.
  function ajustarAoTamanhoDaFolha() {
    var folha = $('folha');
    var corpo = folha.querySelector('.corpo');
    var tamanho = 9.5;
    corpo.style.fontSize = '';
    folha.querySelectorAll('.afast, .compl ol').forEach(function (el) { el.style.fontSize = ''; });
    while (corpo.scrollHeight > corpo.clientHeight + 1 && tamanho > 6.5) {
      tamanho -= 0.25;
      folha.querySelectorAll('.afast, .compl ol').forEach(function (el) { el.style.fontSize = (tamanho - 0.5) + 'pt'; });
      corpo.style.fontSize = tamanho + 'pt';
    }
  }

  // ---------- eventos ----------
  function iniciar() {
    lerConfig();
    $('cfg-data').value = hojeISO();

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
