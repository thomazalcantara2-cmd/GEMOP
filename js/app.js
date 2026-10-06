/* Interface: carrega as planilhas, busca o servidor e preenche o requerimento. */
(function () {
  'use strict';

  var D = window.Dados;
  var P = window.Planilhas;
  var CHAVE_CONFIG = 'gemop-requerimento-config-v3';
  var CHAVE_CONFIG_ANTIGA = 'gemop-requerimento-config-v2';

  var PADRAO = {
    complementares: [
      '{faltas}',
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
    // versão anterior: aproveita a regra do órgão de origem; o texto das informações complementares mudou
    if (!Object.keys(cfg).length) {
      try {
        var antiga = JSON.parse(localStorage.getItem(CHAVE_CONFIG_ANTIGA) || '{}') || {};
        if (antiga.orgaosCessao != null) cfg.orgaosCessao = antiga.orgaosCessao;
      } catch (e) { /* ignora */ }
    }
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

  // ---------- leitura das planilhas (js/planilhas.js, compartilhado com o programa de Portarias) ----------
  // opcoes.ignorarDesconhecidos: na leitura da pasta, arquivos que não são as planilhas esperadas são ignorados.
  function carregarArquivos(lista, opcoes) {
    opcoes = opcoes || {};
    if (!lista || !lista.length) return Promise.resolve();
    mostrarErro('');
    return P.ler(lista).then(function (res) {
      var naoReconhecidos = [];
      // na leitura da pasta, a lista de fichas é refeita; arrastando arquivos, as fichas se somam
      if (opcoes.ignorarDesconhecidos) estado.fichas = [];
      res.forEach(function (x) {
        var r = x.resultado;
        if (!r) naoReconhecidos.push(x.nome);
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
          '. Envie a "FichaContabilis" (antigo INDICE CEDIDOS SAD, aba SERVIDORES) e o "relFichaCadastralCompleta" (aba Lotacoes).');
      }
      reconstruirBase();
    }).catch(function (e) {
      mostrarErro('Não foi possível ler a planilha: ' + e.message);
    });
  }

  // ---------- pasta das planilhas (Chrome/Edge: File System Access API) ----------
  var BANCO = 'gemop-requerimento';

  // ---------- modo aplicativo local (Requerimento.bat + servidor.ps1) ----------
  function carregarDoServidorLocal() {
    return P.doServidorLocal().then(function (info) {
      $('bloco-pasta').hidden = false;
      $('escolher-pasta').hidden = true;
      $('recarregar').hidden = false;
      $('recarregar').textContent = 'Recarregar planilhas';
      $('pasta-nome').textContent = 'Pasta: ' + info.pasta;
      if (!info.arquivos.length) {
        mostrarErro('Nenhuma planilha .xlsx encontrada na pasta ' + info.pasta + '. Salve lá a FichaContabilis e o relFichaCadastralCompleta.');
        return;
      }
      return carregarArquivos(info.arquivos, { ignorarDesconhecidos: true }).then(function () {
        if (!estado.indice || !estado.ficha) {
          mostrarErro('Na pasta ' + info.pasta + ' não foi encontrado: ' +
            [!estado.indice && 'FichaContabilis', !estado.ficha && 'relFichaCadastralCompleta'].filter(Boolean).join(' e ') + '.');
        }
      });
    });
  }

  function carregarDaPasta(pasta, pedirPermissao) {
    var permissao = pedirPermissao ? pasta.requestPermission({ mode: 'read' }) : pasta.queryPermission({ mode: 'read' });
    return permissao.then(function (estadoPermissao) {
      if (estadoPermissao !== 'granted') { mostrarPasta(pasta, false); return; }
      mostrarPasta(pasta, true);
      return P.arquivosDaPasta(pasta).then(function (arquivos) {
        if (!arquivos.length) { mostrarErro('Nenhuma planilha .xlsx encontrada na pasta "' + pasta.name + '".'); return; }
        return carregarArquivos(arquivos, { ignorarDesconhecidos: true }).then(function () {
          if (!estado.indice || !estado.ficha) {
            mostrarErro('Na pasta "' + pasta.name + '" não foi encontrado: ' +
              [!estado.indice && 'FichaContabilis', !estado.ficha && 'relFichaCadastralCompleta'].filter(Boolean).join(' e ') + '.');
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
      P.bancoPasta(BANCO, 'gravar', pasta);
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
    P.bancoPasta(BANCO, 'ler').then(function (pasta) { if (pasta) carregarDaPasta(pasta, false); });
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
    // o quadro "Planilhas carregadas" abre sozinho enquanto faltar alguma planilha e fecha quando as duas carregam
    if (!i || !f) $('det-planilhas').open = true;
    else if (!estado.quadroFechado) { $('det-planilhas').open = false; estado.quadroFechado = true; }
    var anoMes = i && i.anoMes ? String(Math.round(i.anoMes)) : '';
    $('status-indice').className = 'arquivo ' + (i ? 'ok' : '');
    $('status-indice').innerHTML = i
      ? '<b>Ficha Contabilis</b> — ' + esc(i.nome) + '<br><small>' + i.linhas.length + ' servidores' +
        (anoMes ? ' · competência ' + anoMes.slice(4) + '/' + anoMes.slice(0, 4) : '') + modificadoEm(i) + '</small>'
      : '<b>Ficha Contabilis</b> — aguardando arquivo';
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

  // Nomes das planilhas de onde cada informação foi tirada (exibidos abaixo do nome do campo)
  var FONTE_CONTABILIS = 'Contabilis';
  var FONTE_FICHA = 'Ficha Cadastral Completa';

  // célula do quadro-resumo (dados pessoais e funcionais)
  function celula(rotulo, valorHTML, fonte, classe) {
    return '<div class="cel' + (classe ? ' ' + classe : '') + '"><span class="rot">' + esc(rotulo) + '</span>' +
      '<b contenteditable>' + valorHTML + '</b>' +
      (fonte ? '<span class="fonte" contenteditable>' + esc(fonte) + '</span>' : '') + '</div>';
  }

  function linhaDado(rotulo, valorHTML, classe, observacao, fonte) {
    // a fonte (planilha de onde veio a informação) sai pequena, abaixo do nome do campo
    return '<div class="linha3' + (classe ? ' ' + classe : '') + '"><span class="rot">' + esc(rotulo) +
      (fonte ? '<span class="fonte" contenteditable>' + esc(fonte) + '</span>' : '') + '</span>' +
      '<div class="val" contenteditable>' + valorHTML + '</div>' +
      '<div class="obs" contenteditable>' + esc(observacao || '') + '</div></div>';
  }

  function renderizar() {
    var s = estado.selecionado;
    var dataDoc = dataInput('cfg-data') || D.paraData(hojeISO());
    var avisos = [];
    // observações que vão na coluna "Observações" da linha correspondente
    var obs = {};

    if (s) {
      if (!estado.ficha) avisos.push('Carregue a Ficha Cadastral Completa para preencher Lotação e Órgão de origem pelo histórico.');
      else if (s.semFicha) {
        avisos.push('ATENÇÃO: servidor não encontrado na Ficha Cadastral Completa — afastamentos, férias e faltas NÃO puderam ser verificados e os itens "NÃO CONSTA" podem estar incorretos. Gere a Ficha Cadastral incluindo este servidor.');
        obs.origem = 'Servidor não encontrado na Ficha Cadastral Completa.';
        obs.lotacao = 'Obtida da Ficha Contabilis (servidor não está na Ficha Cadastral).';
        obs.afast = 'Não verificados: servidor não está na Ficha Cadastral.';
      } else if (!s.origemEncontrada) {
        obs.origem = 'Não há órgão anterior à Secretaria de Administração no histórico; foi usado o órgão atual — conferir.';
      }
      if (s.origemPeriodo) {
        obs.origem = 'Órgão de origem obtido da lotação de ' + D.dataBR(s.origemPeriodo.inicio) + ' a ' +
          (s.origemPeriodo.fim ? D.dataBR(s.origemPeriodo.fim) : 'atual') + ' (' + s.origemPeriodo.local + ').';
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
            var rotulo = '<strong>' + esc(D.rotuloAfastamento(g.descricao)) + ':</strong>';
            // um período: na mesma linha; mais de um: um abaixo do outro
            if (g.periodos.length < 2) return '<span>' + rotulo + ' ' + esc(D.periodosTexto(g)) + '</span>';
            return '<span>' + rotulo + '<br>' + esc(D.periodosTexto(g)).split('; ').join(';<br>') + '</span>';
          }).join('') + '</div>'
        : 'x - x - x';
    }
    var complementares = D.informacoesComplementares(cfg('complementares'), s, dataDoc);
    // histórico de lotação agrupado pelos campos marcados no painel (só esses campos viram colunas)
    var campos = camposHistorico();
    var blocos = s ? D.historicoLotacao(s.historico, campos) : [];
    var historico = blocos.length
      ? blocos.map(function (b) {
          return '<tr><td class="per ini">' + esc(D.dataBR(b.inicio)) + '</td><td class="per fim">' + esc(b.fim ? D.dataBR(b.fim) : 'atual') + '</td>' +
            campos.map(function (c) { return '<td>' + esc(b[c]) + '</td>'; }).join('') + '</tr>';
        }).join('')
      : '<tr><td colspan="' + (2 + campos.length) + '" class="vazio">' + (s ? 'Sem histórico de lotação na Ficha Cadastral Completa.' : '') + '</td></tr>';
    // fontes: dados pessoais e funcionais da Contabilis; histórico (lotação, origem, afastamentos) da Ficha Cadastral
    var temFicha = !!(s && estado.ficha && !s.semFicha);
    var fonte = function (f) { return s ? f : ''; };

    $('folha').innerHTML =
      '<div class="faixa"><i style="background:#00953a"></i><i style="background:#fbb900"></i><i style="background:#0033a0"></i><i style="background:#00953a"></i></div>' +
      '<div class="corpo">' +
        '<header class="cab">' +
          '<img src="assets/logo-jaboatao.png" alt="Prefeitura do Jaboatão dos Guararapes">' +
          '<div class="orgao"><div>Secretaria Municipal de Administração</div><div>Secretaria Executiva de Gestão de Pessoas</div></div>' +
        '</header>' +
        '<div class="titulo"><h1>Dados do Servidor</h1>' +
          '<div class="data"><span class="rot">Data de emissão</span><b contenteditable>' + esc(D.dataBR(dataDoc)) + '</b></div></div>' +
        '<div class="cartao">' +
          '<div class="nome"><span class="rot">Nome</span><b contenteditable>' + v(s && s.nome) + '</b></div>' +
          '<div class="resumo">' +
            celula('Matrícula', v(s && s.matriculaFormatada), fonte(FONTE_CONTABILIS)) +
            celula('CPF', v(s && s.cpf), fonte(FONTE_CONTABILIS)) +
            celula('Nascimento', v(s && D.dataBR(s.nascimento)), fonte(FONTE_CONTABILIS)) +
            celula('Admissão', v(s && D.dataBR(s.admissao)), fonte(FONTE_CONTABILIS)) +
            celula('Tempo de serviço', v(tempo), fonte(FONTE_CONTABILIS + ' (calculado)')) +
            celula('Cargo', v(s && s.cargo), fonte(FONTE_CONTABILIS), 'dupla') +
            celula('Vínculo', v(s && s.vinculo), fonte(temFicha ? FONTE_FICHA + ' + ' + FONTE_CONTABILIS : FONTE_CONTABILIS)) +
          '</div>' +
          '<div class="linha3 titulos"><span class="rot">Campo</span><span class="rot">Informação</span><span class="rot">Observações</span></div>' +
          linhaDado('Órgão de origem', v(s && s.orgaoOrigem), '', obs.origem, fonte(temFicha ? FONTE_FICHA : '')) +
          linhaDado('Lotação atual', v(s && s.lotacao), '', obs.lotacao, fonte(temFicha ? FONTE_FICHA : FONTE_CONTABILIS)) +
          linhaDado('Afastamentos', afast, '', obs.afast, fonte(temFicha ? FONTE_FICHA : '')) +
        '</div>' +
        '<div class="cartao hist"><div class="compl-tit">Histórico de lotação' +
          (s && temFicha ? '<small>' + esc(FONTE_FICHA) + '</small>' : '') + '</div>' +
          '<table><colgroup><col class="c-ini"><col class="c-fim">' + campos.map(function () { return '<col>'; }).join('') + '</colgroup>' +
          '<thead><tr><th colspan="2" class="per-tit">Período</th>' +
          campos.map(function (c) { return '<th rowspan="2">' + TITULOS_LOTACAO[c] + '</th>'; }).join('') +
          '</tr><tr><th class="sub ini">Início</th><th class="sub fim">Fim</th></tr></thead>' +
          '<tbody contenteditable>' + historico + '</tbody></table>' +
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
    var ajustaveis = folha.querySelectorAll('.afast, .compl ol, .hist table, .linha3 > .obs');
    ajustaveis.forEach(function (el) { el.style.fontSize = ''; });
    while (corpo.scrollHeight > corpo.clientHeight + 1 && tamanho > 5.5) {
      tamanho -= 0.25;
      ajustaveis.forEach(function (el) {
        el.style.fontSize = (el.tagName === 'TABLE' || el.classList.contains('obs') ? Math.max(5.5, Math.min(7, tamanho - 1.5)) : tamanho - 0.5) + 'pt';
      });
      corpo.style.fontSize = tamanho + 'pt';
    }
  }

  // ---------- campos usados para agrupar o histórico de lotação ----------
  var CHAVE_HISTORICO = 'gemop-requerimento-historico-campos';
  var TITULOS_LOTACAO = { orgao: 'Órgão', unidade: 'Unidade orçamentária', local: 'Local de trabalho' };

  function camposHistorico() {
    return ['orgao', 'unidade', 'local'].filter(function (c) { return $('hist-' + c).checked; });
  }

  function iniciarCamposHistorico() {
    var salvos = null;
    try { salvos = JSON.parse(localStorage.getItem(CHAVE_HISTORICO) || 'null'); } catch (e) { salvos = null; }
    ['orgao', 'unidade', 'local'].forEach(function (c) {
      var el = $('hist-' + c);
      el.checked = !salvos || salvos.indexOf(c) >= 0;
      el.addEventListener('change', function () {
        if (!camposHistorico().length) el.checked = true; // pelo menos um campo
        try { localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(camposHistorico())); } catch (e) { /* ignora */ }
        renderizar();
      });
    });
    if (!camposHistorico().length) ['orgao', 'unidade', 'local'].forEach(function (c) { $('hist-' + c).checked = true; });
  }

  // ---------- painel lateral retrátil ----------
  var CHAVE_PAINEL = 'gemop-requerimento-painel-recolhido';

  function definirPainel(recolhido) {
    $('app').classList.toggle('recolhida', recolhido);
    var b = $('alternar-painel');
    b.textContent = recolhido ? '›' : '‹';
    b.title = recolhido ? 'Mostrar painel' : 'Recolher painel';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-expanded', String(!recolhido));
    try { localStorage.setItem(CHAVE_PAINEL, recolhido ? '1' : ''); } catch (e) { /* ignora */ }
  }

  function iniciarPainel() {
    var recolhido = false;
    try { recolhido = localStorage.getItem(CHAVE_PAINEL) === '1'; } catch (e) { /* ignora */ }
    definirPainel(recolhido);
    $('alternar-painel').addEventListener('click', function () {
      definirPainel(!$('app').classList.contains('recolhida'));
    });
  }

  // ---------- eventos ----------
  function iniciar() {
    lerConfig();
    $('cfg-data').value = hojeISO();

    iniciarPasta();
    $('arquivos').addEventListener('change', function (e) { carregarArquivos(e.target.files); e.target.value = ''; });

    iniciarPainel();
    iniciarCamposHistorico();

    // arrastar as planilhas para qualquer lugar da página
    ['dragenter', 'dragover'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); document.body.classList.add('arrastando'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'drop' || !e.relatedTarget) document.body.classList.remove('arrastando');
      });
    });
    document.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length && !e.target.closest('#zona')) carregarArquivos(e.dataTransfer.files);
    });

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
