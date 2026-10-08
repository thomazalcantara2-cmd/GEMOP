/* Interface das Portarias: carrega a FichaContabilis, busca o servidor e monta a folha A4. */
(function () {
  'use strict';

  var D = window.Dados;
  var P = window.Planilhas;
  var R = window.Portarias;
  var G = window.GoogleDrive;
  var SEI = window.SeiProcesso;
  var ZIP = window.ZipLeitura;
  var CHAVE_CONFIG = 'gemop-portarias-config-v1';
  var CHAVE_PAINEL = 'gemop-portarias-painel-recolhido';
  var BANCO = 'gemop-portarias';
  var ESCALA_TELA = 0.9;
  var CAMPOS_CONFIG = ['preambulo', 'assinanteNome', 'assinanteCargo'];

  var estado = {
    indice: null,       // { nome, linhas, anoMes }
    base: [],
    secretarias: {},    // código do centro de custo -> nome da secretaria
    selecionados: [],   // servidores da portaria, na ordem escolhida
    valores: {},        // campos comuns, por tipo de portaria: { idDoCampo: texto }
    escolhaSecretaria: {}, // matrícula -> 'municipal' | 'trabalho'
    sei: [],            // processos do SEI lidos (um cartão cada)
    valoresServ: {}     // campos de cada servidor: 'matrícula|tipo' -> { idDoCampo: texto }. Só nesta sessão; nada é gravado
  };

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Escapa o texto, transforma **trecho** em negrito e destaca [campos que faltam] em amarelo.
  function textoFormatado(texto) {
    return esc(texto).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]<]+)\]/g, '<span class="falta">[$1]</span>');
  }

  function hojeISO() {
    var h = new Date();
    return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0') + '-' + String(h.getDate()).padStart(2, '0');
  }

  // ---------- configurações (somente textos fixos; nunca dados de servidores) ----------
  function lerConfig() {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(CHAVE_CONFIG) || '{}') || {}; } catch (e) { cfg = {}; }
    CAMPOS_CONFIG.forEach(function (k) { $('cfg-' + k).value = cfg[k] != null ? cfg[k] : R.PADRAO[k]; });
    $('v-matricula').value = cfg.formatoMatricula || 'nove';
    if (cfg.tipo && R.tipoPorId(cfg.tipo)) $('tipo').value = cfg.tipo;
  }

  function salvarConfig() {
    var cfg = { formatoMatricula: $('v-matricula').value, tipo: $('tipo').value };
    CAMPOS_CONFIG.forEach(function (k) { cfg[k] = $('cfg-' + k).value; });
    try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(cfg)); } catch (e) { /* armazenamento indisponível */ }
  }

  // ---------- leitura da planilha (js/planilhas.js, o mesmo leitor do Requerimento) ----------
  function mostrarErro(msg) {
    $('erro').textContent = msg;
    $('erro').hidden = !msg;
    if (msg && !estado.indice && !estado.modoGoogle) mostrarCarregamento(true);
  }

  // Só a FichaContabilis é usada; outras planilhas (Ficha Cadastral) são ignoradas.
  function carregarArquivos(lista, opcoes) {
    opcoes = opcoes || {};
    if (!lista || !lista.length) return Promise.resolve();
    mostrarErro('');
    return P.ler(lista).then(function (res) {
      var naoReconhecidos = [];
      res.forEach(function (x) {
        if (!x.resultado) naoReconhecidos.push(x.nome);
        else if (x.resultado.tipo === 'indice') estado.indice = x.resultado;
      });
      if (naoReconhecidos.length && !opcoes.ignorarDesconhecidos) {
        mostrarErro('Arquivo não reconhecido: ' + naoReconhecidos.join(', ') +
          '. Envie a "FichaContabilis" (antigo INDICE CEDIDOS SAD, aba SERVIDORES).');
      }
      reconstruirBase();
    }).catch(function (e) {
      mostrarErro('Não foi possível ler a planilha: ' + e.message);
    });
  }

  function aposCarregarPasta(onde) {
    if (!estado.indice) mostrarErro('Em ' + onde + ' não foi encontrada a FichaContabilis.');
  }

  function carregarDoServidorLocal() {
    return P.doServidorLocal(false).then(function (info) {
      $('bloco-pasta').hidden = false;
      $('escolher-pasta').hidden = true;
      $('recarregar').hidden = false;
      $('recarregar').textContent = 'Recarregar planilha';
      $('pasta-nome').textContent = 'Pasta: ' + info.pasta;
      if (!info.arquivos.length) {
        mostrarErro('Nenhuma planilha .xlsx encontrada na pasta ' + info.pasta + '. Salve lá a FichaContabilis.');
        return;
      }
      return carregarArquivos(info.arquivos, { ignorarDesconhecidos: true }).then(function () {
        aposCarregarPasta('a pasta ' + info.pasta);
      });
    });
  }

  function carregarDaPasta(pasta, pedirPermissao) {
    var permissao = pedirPermissao ? pasta.requestPermission({ mode: 'read' }) : pasta.queryPermission({ mode: 'read' });
    return permissao.then(function (liberada) {
      if (liberada !== 'granted') { mostrarPasta(pasta, false); mostrarCarregamento(true); return; }
      mostrarPasta(pasta, true);
      return P.arquivosDaPasta(pasta, false).then(function (arquivos) {
        if (!arquivos.length) { mostrarErro('Nenhuma planilha .xlsx encontrada na pasta "' + pasta.name + '".'); return; }
        return carregarArquivos(arquivos, { ignorarDesconhecidos: true }).then(function () {
          aposCarregarPasta('a pasta "' + pasta.name + '"');
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

  // ---------- versão online: planilha lida do Google Drive de quem entra (js/google.js) ----------
  function abrirGoogle(escolherOutra, silencioso) {
    estado.carregando = true;
    mostrarErro('');
    ['entrar-google', 'trocar-google', 'recarregar'].forEach(function (id) { $(id).disabled = true; });
    atualizarStatus();
    return G.abrir(escolherOutra, silencioso).then(function (arquivo) {
      return carregarArquivos([arquivo]);
    }).catch(function (e) {
      if (!silencioso && (!e || !e.cancelado)) mostrarErro(e && e.message ? e.message : 'Não foi possível abrir a planilha do Google Drive.');
    }).then(function () {
      estado.carregando = false;
      ['entrar-google', 'trocar-google', 'recarregar'].forEach(function (id) { $(id).disabled = false; });
      var l = G.lembrado();
      $('google-nome').textContent = l ? 'Planilha: ' + l.nome : '';
      $('trocar-google').hidden = !l;
      $('recarregar').hidden = !estado.indice;
      $('recarregar').textContent = 'Recarregar planilha';
      atualizarStatus();
      if (!estado.indice) mostrarCarregamento(true);
    });
  }

  function iniciarGoogle() {
    estado.modoGoogle = true;
    $('bloco-pasta').hidden = true;
    $('bloco-google').hidden = false;
    $('entrar-google').addEventListener('click', function () { abrirGoogle(false); });
    $('trocar-google').addEventListener('click', function () { abrirGoogle(true); });
    var l = G.lembrado();
    if (l) { $('google-nome').textContent = 'Planilha: ' + l.nome; $('trocar-google').hidden = false; }
    mostrarCarregamento(true);
  }

  // Planilha fixa: o login é feito na página anterior (entrar.html). Aqui a planilha carrega sozinha, sem o quadro de carregar.
  // Sem entrada válida (nem login recente nesta aba, nem entrada anterior para reconhecer), volta para a tela de entrada.
  function carregarGoogleFixo(silencioso) {
    estado.carregando = true;
    mostrarErro('');
    $('recarregar').disabled = true;
    atualizarStatus();
    G.abrir(false, silencioso).then(function (arquivo) {
      return carregarArquivos([arquivo]);
    }).then(function () {
      estado.carregando = false;
      $('recarregar').disabled = false;
      atualizarStatus();
    }, function (e) {
      if (e && e.cancelado && silencioso) { location.replace('entrar.html'); return; }
      estado.carregando = false;
      $('recarregar').disabled = false;
      atualizarStatus();
      if (!e || !e.cancelado) mostrarErro(e && e.message ? e.message : 'Não foi possível abrir a planilha do Google.');
    });
  }

  function iniciarGoogleFixo() {
    estado.modoGoogle = true;
    estado.googleFixo = true;
    $('bloco-pasta').hidden = true;
    $('recarregar').hidden = false;
    $('sair-google').hidden = false;
    $('sair-google').addEventListener('click', function () { G.sair(); location.href = 'entrar.html'; });
    if (!G.temSessao() && !G.jaEntrou()) { location.replace('entrar.html'); return; }
    carregarGoogleFixo(true);
  }

  function iniciarPasta() {
    $('recarregar').addEventListener('click', function () {
      if (estado.googleFixo) {
        carregarGoogleFixo(false);
      } else if (estado.modoGoogle) {
        abrirGoogle(false);
      } else if (estado.modoLocal) {
        carregarDoServidorLocal().catch(function (e) { mostrarErro('Não foi possível ler a planilha: ' + e.message); });
      } else if (estado.pasta) carregarDaPasta(estado.pasta, true);
    });
    if (G && G.disponivel() && location.protocol === 'https:') { if (G.fixo) iniciarGoogleFixo(); else iniciarGoogle(); return; }
    if (/^https?:$/.test(location.protocol)) {
      // leitura automática da pasta: enquanto carrega, a barra amarela avisa e nada de "inserir planilha" aparece na tela;
      // o quadro de carregar só aparece se a planilha não for encontrada
      estado.modoLocal = true;
      estado.carregando = true;
      atualizarStatus();
      carregarDoServidorLocal().then(function () {
        estado.carregando = false;
        atualizarStatus();
        if (!estado.indice) mostrarCarregamento(true);
      }).catch(function () { estado.carregando = false; estado.modoLocal = false; iniciarSeletorPasta(); });
      return;
    }
    iniciarSeletorPasta();
  }

  function iniciarSeletorPasta() {
    // sem leitura automática possível (arquivo aberto direto, sem pasta lembrada): mostra logo o quadro de carregar
    if (!('showDirectoryPicker' in window)) { $('bloco-pasta').hidden = true; mostrarCarregamento(true); return; }
    $('escolher-pasta').addEventListener('click', escolherPasta);
    P.bancoPasta(BANCO, 'ler').then(function (pasta) { if (pasta) carregarDaPasta(pasta, false); else mostrarCarregamento(true); });
  }

  function reconstruirBase() {
    atualizarStatus();
    if (!estado.indice) { estado.base = []; return; }
    // sem Ficha Cadastral: só os dados da FichaContabilis (nome, matrícula, cargo, sexo, centro de custo)
    estado.base = D.montarBase(estado.indice.linhas, { servidores: [], lotacoes: [] });
    estado.secretarias = R.mapaSecretarias(estado.base);
    $('busca').disabled = false;
    $('arquivos-sei').disabled = false;
    $('busca').placeholder = 'Digite o nome, matrícula ou CPF (' + estado.base.length + ' servidores)';
    estado.selecionados = estado.selecionados.map(function (x) {
      return estado.base.filter(function (s) { return s.matricula === x.matricula; })[0] || x;
    });
    atualizarBusca();
    montarServidores();
    renderizar();
  }

  // O quadro de carregar a planilha fica escondido: a planilha é lida sozinha da pasta. Ele só aparece se ela não for achada
  // (ou der erro); a situação normal fica resumida na barra superior.
  function mostrarCarregamento(sim) {
    $('det-planilhas').hidden = !sim;
    if (sim) $('det-planilhas').open = true;
  }

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // "Dados extraídos do mês setembro/2026 - Contabilis de 06/10/2026" (mês de referência da planilha e data do arquivo)
  function textoDaPlanilha(i) {
    var anoMes = i.anoMes ? String(Math.round(i.anoMes)) : '';
    var mes = /^\d{6}$/.test(anoMes) && +anoMes.slice(4) >= 1 && +anoMes.slice(4) <= 12 ? MESES[+anoMes.slice(4) - 1] + '/' + anoMes.slice(0, 4) : '';
    var data = i.modificado ? i.modificado.toLocaleDateString('pt-BR') : '';
    return 'Dados extraídos do ' + (mes ? 'mês ' + mes : 'mês da planilha') + (data ? ' - Contabilis de ' + data : '');
  }

  function atualizarStatus() {
    var i = estado.indice;
    $('topo-sub').textContent = i ? textoDaPlanilha(i) : (estado.carregando ? 'SEGEP · carregando a planilha…' : 'SEGEP · preenchimento automático pela FichaContabilis');
    $('topo-sub').title = i ? 'Arquivo: ' + i.nome + ' · ' + i.linhas.length + ' servidores' : '';
    $('status-indice').className = 'arquivo ' + (i ? 'ok' : '');
    $('status-indice').innerHTML = i ? '<b>Ficha Contabilis</b> — ' + esc(i.nome) : '<b>Ficha Contabilis</b> — aguardando arquivo';
    if (i) mostrarCarregamento(false);
  }

  // ---------- busca ----------
  // Secretaria usada no texto: a Secretaria Municipal ou onde o servidor trabalha, conforme a escolha no quadro dele.
  function secretariaDe(s) { return R.secretariaEscolhida(s, estado.secretarias, estado.escolhaSecretaria[s.matricula]); }

  function selecionado(s) {
    return estado.selecionados.some(function (x) { return x.matricula === s.matricula; });
  }

  function atualizarBusca() {
    var termo = $('busca').value;
    var lista = $('resultados');
    var achados = termo.trim() ? D.buscar(estado.base, termo) : [];
    lista.innerHTML = achados.slice(0, 30).map(function (s, i) {
      return '<li role="option" data-i="' + i + '" class="' + (selecionado(s) ? 'sel' : '') + '"><b>' + esc(s.nome) +
        '</b><small>Mat. ' + esc(s.matriculaFormatada) + ' · ' + esc(R.capitalizar(s.cargoNome)) + ' · ' + esc(secretariaDe(s)) +
        (selecionado(s) ? ' · já está na portaria' : '') + '</small></li>';
    }).join('') + (termo.trim() && !achados.length ? '<li class="vazio">Nenhum servidor encontrado.</li>' : '');
    lista.hidden = !termo.trim();
    lista._achados = achados;
  }

  function selecionar(s) {
    if (!selecionado(s)) estado.selecionados.push(s);
    $('busca').value = '';
    $('resultados').hidden = true;
    montarServidores();
    renderizar();
  }

  function retirar(matricula) {
    estado.selecionados = estado.selecionados.filter(function (s) { return s.matricula !== matricula; });
    montarServidores();
    renderizar();
  }

  // Resumo (matrícula · cargo · secretaria) que aparece embaixo do nome do servidor.
  function resumoDoServidor(s) {
    return 'Mat. ' + s.matriculaFormatada + ' · ' + R.capitalizar(s.cargoNome) + ' · ' + secretariaDe(s);
  }

  // Um cartão para cada servidor escolhido: nome, resumo e, logo abaixo, os campos dele (nº do processo, decênio…).
  function montarServidores() {
    var tipo = tipoAtual();
    var porServidor = tipo.campos.filter(function (c) { return c.porServidor; });
    $('lista-servidores').innerHTML = estado.selecionados.map(function (s, i) {
      return '<li><div class="servidor-topo"><span><b>' + esc(s.nome) + '</b><small id="resumo-' + i + '">' + esc(resumoDoServidor(s)) + '</small></span>' +
        '<button type="button" data-mat="' + esc(s.matricula) + '" title="Retirar da portaria" aria-label="Retirar ' + esc(s.nome) + ' da portaria">✕</button></div>' +
        '<div class="servidor-campos">' + campoSecretaria(s, i) + camposHTML('s' + i + '-', porServidor) + '</div></li>';
    }).join('');
    estado.selecionados.forEach(function (s, i) {
      var sel = $('s' + i + '-secretaria');
      if (sel) {
        sel.value = estado.escolhaSecretaria[s.matricula] || 'municipal';
        sel.addEventListener('change', function () {
          estado.escolhaSecretaria[s.matricula] = sel.value;
          $('resumo-' + i).textContent = resumoDoServidor(s);
          renderizar();
        });
      }
      var guardados = estado.valoresServ[s.matricula + '|' + tipo.id] = estado.valoresServ[s.matricula + '|' + tipo.id] || {};
      porServidor.forEach(function (c) { ligarCampo($('s' + i + '-' + c.id), guardados, c.id); });
    });
  }

  // ---------- campos do modelo escolhido ----------
  function tipoAtual() { return R.tipoPorId($('tipo').value) || R.TIPOS[0]; }

  // Campos de escolha cujas alternativas dependem dos servidores (ex.: "de quem foi" o fundamento): refaz a lista com os
  // nomes atuais, mantém a escolha e só deixa digitar o emissor quando a escolha é "Outro".
  function atualizarOpcoesDinamicas(servidores) {
    tipoAtual().campos.forEach(function (c) {
      if (c.dinamica !== 'origemFundamento') return;
      var el = $('c-' + c.id);
      if (!el) return;
      var opcoes = R.opcoesOrigemFundamento(servidores, c.padraoEscolha);
      var chave = JSON.stringify(opcoes);
      if (el._opcoes !== chave) {
        var atual = el.value || (estado.valores[tipoAtual().id] || {})[c.id] || '';
        el.innerHTML = opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('');
        el._opcoes = chave;
        el.value = opcoes.some(function (o) { return o[0] === atual; }) ? atual : opcoes[0][0];
      }
      var bloco = $('w-c-fundamentoOrigem');
      if (bloco) bloco.hidden = el.value !== 'outro';
    });
  }

  // Valor lido de um campo da tela (data vira {a,m,d}; vazio = '').
  function lerCampo(el, c) {
    var v = el.value.trim();
    return c.tipo === 'data' ? (v ? D.paraData(v) : null) : v;
  }

  function campoHTML(prefixo, c) {
    var entrada = c.tipo === 'data' ? 'date' : (c.tipo === 'numero' ? 'number' : 'text');
    var rotulo = '<label class="campo" for="' + prefixo + c.id + (c.tipo === 'decenio' ? '-a' : '') + '">' + esc(c.rotulo) +
      (c.ajuda ? ' <small>(' + esc(c.ajuda) + ')</small>' : '') + '</label>';
    if (c.tipo === 'decenio') {
      // dois anos (só números); a barra entre eles é automática. O valor junto (AAAA/AAAA) fica no campo escondido.
      var caixa = function (lado, dica) {
        return '<input id="' + prefixo + c.id + '-' + lado + '" class="ano" type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="' + dica + '" aria-label="' + esc(c.rotulo) + ' (' + (lado === 'a' ? 'ano inicial' : 'ano final') + ')">';
      };
      return rotulo + '<div class="decenio-caixas">' + caixa('a', 'aaaa') + '<span class="barra">/</span>' + caixa('b', 'aaaa') +
        '</div><input id="' + prefixo + c.id + '" type="hidden" data-decenio="1">';
    }
    if (c.tipo === 'selecao') {
      return rotulo + '<select id="' + prefixo + c.id + '">' + c.opcoes.map(function (o) {
        return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    }
    return rotulo + '<input id="' + prefixo + c.id + '" type="' + entrada + '"' + (c.exemplo ? ' placeholder="ex.: ' + esc(c.exemplo) + '"' : '') + '>';
  }

  // Monta os campos; os que têm a mesma "linha" (e ficam um ao lado do outro na lista) vão juntos na mesma linha da tela,
  // com larguras proporcionais. Cada campo fica num bloco com id "w-<id do campo>" (para poder esconder).
  function camposHTML(prefixo, lista) {
    function bloco(c) { return '<div class="campo-col" id="w-' + prefixo + c.id + '">' + campoHTML(prefixo, c) + '</div>'; }
    var saida = '', i = 0;
    while (i < lista.length) {
      var c = lista[i], grupo = [];
      if (!c.linha) { saida += bloco(c); i++; continue; }
      while (i < lista.length && lista[i].linha === c.linha) grupo.push(lista[i++]);
      saida += '<div class="linha-campos" style="grid-template-columns:' +
        grupo.map(function (g) { return 'minmax(0,' + (g.largura || 1) + 'fr)'; }).join(' ') + '">' + grupo.map(bloco).join('') + '</div>';
    }
    return saida;
  }

  // Decênio: duas caixas só com números (4 dígitos cada); a barra é automática e o foco passa sozinho para o segundo ano.
  function ligarDecenio(el, guardados, id) {
    var A = $(el.id + '-a'), B = $(el.id + '-b');
    var partes = (guardados[id] || '').split('/');
    A.value = /^\d{4}$/.test(partes[0]) ? partes[0] : '';
    B.value = /^\d{4}$/.test(partes[1]) ? partes[1] : '';
    function atualizar() {
      A.value = A.value.replace(/\D/g, '').slice(0, 4);
      B.value = B.value.replace(/\D/g, '').slice(0, 4);
      B.placeholder = A.value.length === 4 ? String(+A.value + 10) : 'aaaa';   // sugestão (cinza); não vira valor sozinha
      el.value = guardados[id] = (A.value || B.value) ? (A.value || '____') + '/' + (B.value || '____') : '';
      renderizar();
    }
    A.addEventListener('input', function () { atualizar(); if (A.value.length === 4) B.focus(); });
    B.addEventListener('input', atualizar);
    el.value = guardados[id] || '';
  }

  function ligarCampo(el, guardados, id) {
    if (el.dataset.decenio) { ligarDecenio(el, guardados, id); return; }
    el.value = guardados[id] || (el.tagName === 'SELECT' ? el.options[0].value : '');
    el.addEventListener('input', function () { guardados[id] = el.value; renderizar(); });
  }

  // Campos comuns da portaria (e a caixa "Indeferida", logo abaixo do tipo).
  function montarCamposDoTipo() {
    var tipo = tipoAtual();
    var guardados = estado.valores[tipo.id] = estado.valores[tipo.id] || {};
    var caixas = tipo.campos.filter(function (c) { return c.tipo === 'caixa'; });
    var comuns = tipo.campos.filter(function (c) { return c.tipo !== 'caixa' && !c.porServidor; });
    $('opcao-tipo').innerHTML = caixas.map(function (c) {
      return '<label><input id="c-' + c.id + '" type="checkbox"> <span><b>' + esc(c.rotulo) + '</b>' +
        (c.ajuda ? ' <small>(' + esc(c.ajuda) + ')</small>' : '') + '</span></label>';
    }).join('');
    caixas.forEach(function (c) {
      var el = $('c-' + c.id);
      el.checked = !!guardados[c.id];
      el.addEventListener('change', function () { guardados[c.id] = el.checked; renderizar(); });
    });
    $('campos-tipo').innerHTML = camposHTML('c-', comuns);
    comuns.forEach(function (c) { ligarCampo($('c-' + c.id), guardados, c.id); });
    montarServidores();
  }

  // Escolha da secretaria que sai no texto: a Secretaria Municipal ou onde o servidor trabalha (só se forem diferentes).
  function campoSecretaria(s, i) {
    var opcoes = R.opcoesSecretaria(s, estado.secretarias);
    if (opcoes.length < 2) return '';
    return '<label class="campo" for="s' + i + '-secretaria">Secretaria (no texto e na coluna Secretaria de Origem)</label><select id="s' + i + '-secretaria">' +
      opcoes.map(function (o) { return '<option value="' + o.id + '">' + esc(o.rotulo + ': ' + o.nome) + '</option>'; }).join('') + '</select>';
  }

  // Padrão de cada campo aparece como sugestão (placeholder) e vale quando o campo fica vazio.
  function sugerirPadroes(servidores) {
    tipoAtual().campos.forEach(function (c) {
      if (c.padrao == null) return;
      var padrao = R.valorPadrao(c, servidores);
      if (c.porServidor) {
        servidores.forEach(function (x, i) { var el = $('s' + i + '-' + c.id); if (el) el.placeholder = padrao; });
      } else if ($('c-' + c.id)) $('c-' + c.id).placeholder = padrao;
    });
  }

  function valoresDosCampos() {
    var campos = {};
    tipoAtual().campos.forEach(function (c) {
      if (c.porServidor) return;
      if (c.tipo === 'caixa') { campos[c.id] = $('c-' + c.id).checked; return; }
      campos[c.id] = lerCampo($('c-' + c.id), c);
    });
    return campos;
  }

  // ---------- folha ----------
  // Cargo, secretaria e sexo vêm da planilha; para corrigir, edite direto o texto da folha.
  function dadosDoServidor(s, i) {
    var campos = {};
    tipoAtual().campos.forEach(function (c) {
      if (c.porServidor) campos[c.id] = lerCampo($('s' + i + '-' + c.id), c);
    });
    return { nome: s.nome, matricula: s.matricula, cargo: R.capitalizar(s.cargoNome), secretaria: secretariaDe(s), sexo: s.sexo, campos: campos,
      opcoesSecretaria: R.opcoesSecretaria(s, estado.secretarias) };
  }

  function avisosDoServidor(s, varios) {
    var avisos = [], quem = varios ? s.nome + ': ' : '';
    if (s.sexo !== 'F' && s.sexo !== 'M') {
      avisos.push(quem + 'a planilha não informa o sexo: o texto saiu no masculino. Corrija direto no texto da folha, se preciso.');
    }
    if (R.ehCedido(s)) {
      avisos.push(quem + 'consta como CEDIDO (SEGEPE - Cedidos): a secretaria foi tirada da lotação na planilha, que pode não ser a de origem. Confira em "Secretaria no texto" ou direto na folha.');
    }
    if (!s.codCentroCusto) {
      avisos.push(quem + 'sem centro de custo na planilha: confira a secretaria na folha.');
    }
    return avisos;
  }

  function configAtual() {
    var cfg = {};
    CAMPOS_CONFIG.forEach(function (k) { cfg[k] = $('cfg-' + k).value; });
    return cfg;
  }

  function renderizar() {
    var escolhidos = estado.selecionados;
    var dataDoc = D.paraData($('v-data').value) || D.paraData(hojeISO());
    var servidores = escolhidos.map(dadosDoServidor);
    atualizarOpcoesDinamicas(servidores);
    sugerirPadroes(servidores.length ? servidores : [{ secretaria: '' }]);

    var portaria = R.gerarPortaria({
      tipo: tipoAtual().id,
      numero: $('v-numero').value.trim(),
      data: dataDoc,
      servidores: servidores.length ? servidores : [{ nome: '', matricula: '', cargo: '', secretaria: '', sexo: 'M', campos: {} }],
      formatoMatricula: $('v-matricula').value,
      campos: valoresDosCampos(),
      config: configAtual()
    });

    var avisos = [];
    escolhidos.forEach(function (s) { avisos = avisos.concat(avisosDoServidor(s, escolhidos.length > 1)); });
    if (tipoAtual().unico && escolhidos.length > 1) {
      avisos.push('Este modelo é para um servidor só: foi usado apenas o primeiro (' + escolhidos[0].nome + '). Retire os demais ou faça outra portaria.');
    }
    if (escolhidos.length && portaria.faltando.length) avisos.push('Falta preencher: ' + portaria.faltando.join('; ') + '.');
    $('avisos').innerHTML = avisos.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('');
    $('avisos').hidden = !avisos.length;

    var blocos = portaria.blocos.map(function (b) {
      if (b.t === 'tabela') {
        return '<table><thead><tr>' + b.colunas.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead>' +
          '<tbody>' + b.linhas.map(function (l) {
            return '<tr>' + l.map(function (c, i) {
              var classe = ((b.semQuebra || []).indexOf(i) >= 0 ? 'nw ' : '') + ((b.esquerda || []).indexOf(i) >= 0 ? 'e' : '');
              return '<td' + (classe ? ' class="' + classe.trim() + '"' : '') + '>' + textoFormatado(c) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table>';
      }
      return '<p>' + textoFormatado(b.texto) + '</p>';
    }).join('');

    $('folha').innerHTML =
      '<header class="cab">' +
        '<img src="assets/logo-jaboatao.png" alt="Prefeitura do Jaboatão dos Guararapes">' +
        '<div class="org">SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO</div>' +
        '<div class="end">Estr. da Batalha, 1200 - Bairro Prazeres - CEP 54315-570 - Jaboatão dos Guararapes - PE</div>' +
        '<div class="end">Complexo Administrativo</div>' +
      '</header>' +
      '<div id="portaria-texto">' +
        '<h1>' + esc(portaria.titulo) + '</h1>' +
        '<div class="texto" contenteditable><p>' + textoFormatado(portaria.preambulo) + '</p>' + blocos + '</div>' +
        '<p class="local" contenteditable>' + esc(portaria.local) + '</p>' +
        '<p class="assina nome" contenteditable>' + esc(portaria.assinatura.nome) + '</p>' +
        '<p class="assina" contenteditable>' + esc(portaria.assinatura.cargo) + '</p>' +
      '</div>';

    atualizarResumos(escolhidos, dataDoc);
    ajustarEscala();
    $('imprimir').disabled = !escolhidos.length;
    $('copiar').disabled = !escolhidos.length;
    $('baixar-word').disabled = !escolhidos.length;
    document.title = escolhidos.length ? 'Portaria - ' + escolhidos.map(function (x) { return x.nome; }).join(', ') : 'Portarias';
  }

  // Na tela, se a barra lateral deixar pouco espaço, a folha encolhe para caber sem rolagem lateral (a impressão não muda).
  function ajustarEscala() {
    var folha = $('folha'), area = document.querySelector('main');
    if (!folha || !area) return;
    folha.style.zoom = '';
    var estilo = window.getComputedStyle(area);
    var disponivel = area.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight), largura = folha.offsetWidth;
    // na tela a folha aparece a 90% (mais compacta) e encolhe mais se faltar espaço; a impressão sempre sai em tamanho normal
    if (largura > 0 && disponivel > 0) folha.style.zoom = Math.min(ESCALA_TELA, disponivel / largura).toFixed(3);
  }

  // ---------- copiar o texto (para colar no editor do SEI) ----------
  // Copia o texto da portaria (título, texto, tabela, data e assinatura — sem o logotipo/cabeçalho) como texto formatado
  // e também como texto simples, para colar tanto no SEI quanto no Word ou no Bloco de Notas.
  function conteudoParaCopiar() {
    var copia = $('portaria-texto').cloneNode(true);
    copia.removeAttribute('id');
    copia.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); });
    // fonte, alinhamento e espaçamentos ficam no próprio texto (em pt), pois o editor de destino (SEI, Word) não tem o CSS da página
    var CALIBRI = 'font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:150%;';
    var TIMES = 'font-family:\'Times New Roman\',Times,serif;';
    copia.querySelectorAll('h1').forEach(function (h) { h.setAttribute('style', 'text-align:center;margin:25pt 0;' + TIMES + 'font-size:12.5pt;font-weight:bold'); });
    copia.querySelectorAll('.texto').forEach(function (t) { t.setAttribute('style', 'text-align:justify;' + CALIBRI); });
    copia.querySelectorAll('.texto > p').forEach(function (t) { t.setAttribute('style', 'text-align:justify;margin:0 0 14pt;' + CALIBRI); });
    copia.querySelectorAll('p.local').forEach(function (t) { t.setAttribute('style', 'text-align:center;margin:34pt 0 0;' + CALIBRI); });
    copia.querySelectorAll('p.assina').forEach(function (t) {
      t.setAttribute('style', t.classList.contains('nome')
        ? 'text-align:center;margin:23pt 0 0;' + TIMES + 'font-size:11pt;line-height:150%;font-weight:bold'
        : 'text-align:center;margin:0;' + CALIBRI);
    });
    // tabelas no formato mais simples (atributos antigos + estilo), que o editor do SEI e o Word mantêm ao colar
    copia.querySelectorAll('table').forEach(function (t) {
      t.setAttribute('border', '1'); t.setAttribute('cellspacing', '0'); t.setAttribute('cellpadding', '4'); t.setAttribute('width', '100%');
      t.setAttribute('style', 'width:100%;border-collapse:collapse;border:1px solid #000;font-family:"Times New Roman",serif;font-size:10.5pt');
      // o Word ignora a margem da tabela: o espaço depois dela vai no parágrafo seguinte
      var seguinte = t.nextElementSibling;
      if (seguinte && seguinte.tagName === 'P') seguinte.style.marginTop = '17pt';
    });
    copia.querySelectorAll('th, td').forEach(function (c) {
      var esq = c.classList.contains('e');
      c.removeAttribute('class');
      c.setAttribute('align', esq ? 'left' : 'center');
      c.setAttribute('valign', 'middle');
      c.setAttribute('style', 'border:1px solid #000;padding:4px;text-align:' + (esq ? 'left' : 'center') + (c.tagName === 'TH' ? ';font-weight:bold' : ''));
    });
    copia.querySelectorAll('.falta').forEach(function (f) { f.setAttribute('style', 'background:#fff1a8'); });
    var texto = $('portaria-texto').innerText.replace(/\n{3,}/g, '\n\n').trim();
    return { html: copia.outerHTML, texto: texto };
  }

  // Plano B (navegadores sem a API nova): seleciona o texto da folha e usa o comando antigo de copiar,
  // entregando o texto formatado e o texto simples no próprio evento de copiar.
  function copiarPeloComando(c) {
    var entregue = false;
    function aoCopiar(e) {
      e.clipboardData.setData('text/html', c.html);
      e.clipboardData.setData('text/plain', c.texto);
      e.preventDefault();
      entregue = true;
    }
    var selecao = window.getSelection();
    var intervalo = document.createRange();
    intervalo.selectNodeContents($('portaria-texto'));
    selecao.removeAllRanges();
    selecao.addRange(intervalo);
    document.addEventListener('copy', aoCopiar);
    try { document.execCommand('copy'); } catch (e) { entregue = false; }
    document.removeEventListener('copy', aoCopiar);
    selecao.removeAllRanges();
    return entregue;
  }

  function avisoDeCopia(ok) {
    avisoDeCopia.mensagem(ok ? 'Texto e tabelas copiados. No SEI ou no Word, cole com Ctrl+V.'
      : 'Não foi possível copiar sozinho. Clique no texto da folha, use Ctrl+A e depois Ctrl+C.');
  }
  avisoDeCopia.mensagem = function (texto) {
    $('copiado').textContent = texto;
    $('copiado').hidden = false;
    clearTimeout(avisoDeCopia._t);
    avisoDeCopia._t = setTimeout(function () { $('copiado').hidden = true; }, 5000);
  };

  function copiarTexto() {
    var c = conteudoParaCopiar();
    var plano = function () { avisoDeCopia(copiarPeloComando(c)); };
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([c.html], { type: 'text/html' }),
        'text/plain': new Blob([c.texto], { type: 'text/plain' })
      })]).then(function () { avisoDeCopia(true); }, plano);
    } else plano();
  }

  // ---------- baixar em Word (.docx) ----------
  // Lê o texto da folha (com as edições feitas nela) e entrega à js/docx.js.
  function trechos(no, base, saida) {
    Array.prototype.forEach.call(no.childNodes, function (n) {
      if (n.nodeType === 3) {
        var t = n.nodeValue.replace(/\s+/g, ' ');
        if (t) saida.push({ texto: t, negrito: base.negrito, italico: base.italico, destaque: base.destaque });
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { saida.push({ texto: '\n' }); return; }
        trechos(n, {
          negrito: base.negrito || n.tagName === 'B' || n.tagName === 'STRONG',
          italico: base.italico || n.tagName === 'I' || n.tagName === 'EM',
          destaque: base.destaque || n.classList.contains('falta')
        }, saida);
      }
    });
    return saida;
  }

  function estruturaDaFolha() {
    var raiz = $('portaria-texto');
    var blocos = [];
    Array.prototype.forEach.call(raiz.querySelector('.texto').children, function (el) {
      if (el.tagName === 'TABLE') {
        blocos.push({ t: 'tabela', linhas: Array.prototype.map.call(el.rows, function (tr) {
          return Array.prototype.map.call(tr.cells, function (c) {
            return { runs: trechos(c, {}, []), alinhar: c.classList.contains('e') ? 'left' : 'center', negrito: c.tagName === 'TH' };
          });
        }) });
      } else blocos.push({ t: 'p', runs: trechos(el, {}, []) });
    });
    var cab = document.querySelector('#folha .cab');
    var texto = function (sel) { var e = raiz.querySelector(sel); return e ? e.textContent.trim() : ''; };
    return {
      cabecalho: cab ? { org: cab.querySelector('.org').textContent.trim(),
        enderecos: Array.prototype.map.call(cab.querySelectorAll('.end'), function (e) { return e.textContent.trim(); }), logo: null } : null,
      titulo: texto('h1'), blocos: blocos, local: texto('p.local'), assinaNome: texto('p.assina.nome'),
      assinaCargo: texto('p.assina:not(.nome)')
    };
  }

  function nomeDoArquivo() {
    var n = document.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (n || 'Portaria') + '.docx';
  }

  function baixarWord() {
    var est = estruturaDaFolha();
    var img = document.querySelector('#folha .cab img');
    var logo = img ? fetch(img.src).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var bytes = new Uint8Array(buf), t = window.DocxPortaria.tamanhoPNG(bytes);
      return t ? { bytes: bytes, largura: t.largura, altura: t.altura } : null;
    }).catch(function () { return null; }) : Promise.resolve(null);
    logo.then(function (l) {
      if (est.cabecalho) est.cabecalho.logo = l;
      var bytes = window.DocxPortaria.construirDocx(est);
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      var a = document.createElement('a');
      a.href = url; a.download = nomeDoArquivo();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      avisoDeCopia.mensagem('Arquivo do Word baixado: ' + a.download);
    }).catch(function (e) { avisoDeCopia.mensagem('Não foi possível gerar o arquivo do Word: ' + e.message); });
  }

  // ---------- cartões 1, 2 e 3 retráteis ----------
  var CHAVE_PASSOS = 'gemop-portarias-passos-fechados';
  var PASSOS = ['passo-sei', 'passo-tipo', 'passo-servidores', 'passo-dados'];

  // Resumo que aparece ao lado do título quando o cartão está fechado.
  function atualizarResumos(escolhidos, dataDoc) {
    var indeferida = $('c-indeferido') && $('c-indeferido').checked;
    $('res-tipo').textContent = tipoAtual().nome + (indeferida ? ' · indeferida' : '');
    $('res-servidores').textContent = escolhidos.length
      ? escolhidos.length + (escolhidos.length === 1 ? ' servidor: ' : ' servidores: ') + escolhidos.map(function (s) { return s.nome; }).join(', ')
      : 'nenhum servidor';
    var numero = $('v-numero').value.trim();
    $('res-dados').textContent = (numero ? 'Nº ' + numero + ' · ' : 'sem número · ') + D.dataBR(dataDoc);
  }

  // Lembra neste computador quais cartões ficaram fechados (só a aparência; nada de servidor).
  function iniciarPassos() {
    var fechados = [];
    try { fechados = JSON.parse(localStorage.getItem(CHAVE_PASSOS) || '[]') || []; } catch (e) { fechados = []; }
    PASSOS.forEach(function (id) {
      var el = $(id);
      if (fechados.indexOf(id) >= 0) el.open = false;
      el.addEventListener('toggle', function () {
        var f = PASSOS.filter(function (x) { return !$(x).open; });
        try { localStorage.setItem(CHAVE_PASSOS, JSON.stringify(f)); } catch (e) { /* ignora */ }
      });
    });
  }

  // ---------- painel lateral retrátil ----------
  function definirPainel(recolhido) {
    $('app').classList.toggle('recolhida', recolhido);
    var b = $('alternar-painel');
    b.textContent = recolhido ? '›' : '‹';
    b.title = recolhido ? 'Mostrar painel' : 'Recolher painel';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-expanded', String(!recolhido));
    try { localStorage.setItem(CHAVE_PAINEL, recolhido ? '1' : ''); } catch (e) { /* ignora */ }
    ajustarEscala();
  }

  function iniciarPainel() {
    var recolhido = false;
    try { recolhido = localStorage.getItem(CHAVE_PAINEL) === '1'; } catch (e) { /* ignora */ }
    definirPainel(recolhido);
    $('alternar-painel').addEventListener('click', function () {
      definirPainel(!$('app').classList.contains('recolhida'));
    });
  }

  // ---------- importar do processo SEI (js/sei.js e js/zip.js) ----------
  // Lê os documentos .html do processo (Ficha Funcional, despachos…), sugere decisão, decênio, período e fundamento e mostra
  // um cartão por processo para o usuário conferir. Só depois de "Montar portaria" os campos são preenchidos.
  var FUND_TIPOS = [['despacho', 'Despacho'], ['parecer', 'Parecer'], ['parecer-juridico', 'Parecer Jurídico'],
    ['ci', 'Comunicação Interna (CI)'], ['oficio', 'Ofício'], ['informacao', 'Informação']];

  function erroSei(msg) { $('sei-erro').textContent = msg; $('sei-erro').hidden = !msg; }

  // Os documentos do SEI vêm em ISO-8859-1 (com entidades); só usa UTF-8 se o próprio arquivo disser.
  function decodificarHtml(bytes) {
    var inicio = new TextDecoder('windows-1252').decode(bytes.subarray(0, 2000));
    return new TextDecoder(/charset=["']?utf-8/i.test(inicio) ? 'utf-8' : 'windows-1252').decode(bytes);
  }

  function arquivosDoSei(lista) {
    return Promise.all(Array.prototype.map.call(lista, function (f) {
      var ler = f.arrayBuffer ? f.arrayBuffer() : new Promise(function (ok, no) {
        var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; r.readAsArrayBuffer(f);
      });
      return ler.then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (/\.zip$/i.test(f.name)) {
          return ZIP.lerZip(bytes).then(function (entradas) {
            return entradas.filter(function (e) { return /\.html?$/i.test(e.nome); })
              .map(function (e) { return { nome: e.nome, html: decodificarHtml(e.dados) }; });
          });
        }
        return /\.html?$/i.test(f.name) ? [{ nome: f.name, html: decodificarHtml(bytes) }] : [];
      });
    })).then(function (listas) { return [].concat.apply([], listas); });
  }

  function iniciais(p) {
    var achado = p.servidor ? SEI.acharServidor(estado.base, p.servidor) : { servidor: null, aviso: 'Sem Ficha Funcional.' };
    var forasteiro = !p.assuntoLP;
    return {
      p: p, servidor: achado.servidor, aviso: achado.aviso,
      incluir: !!achado.servidor && !forasteiro && !p.bloqueio && !!p.decisao,
      decisao: p.decisao || 'deferida',
      decenio: p.decenioSugerido,
      inicio: p.periodo ? SEI.iso(p.periodo.inicio) : '',
      meses: p.periodo && p.periodo.meses != null ? p.periodo.meses : '',
      fundTipo: p.fundamento ? p.fundamento.tipo : 'despacho',
      fundNumero: p.fundamento ? p.fundamento.id : '',
      fundSecretaria: p.fundamento ? R.capitalizar(p.fundamento.secretaria) : ''
    };
  }

  function fimDoItem(it) {
    var ini = it.inicio ? D.paraData(it.inicio) : null;
    return ini && +it.meses > 0 ? SEI.iso(SEI.fimDoGozo(ini, +it.meses)) : '';
  }

  function importarSei(lista) {
    erroSei('');
    if (!estado.base.length) { erroSei('Carregue a planilha primeiro: o programa precisa dela para achar os servidores.'); return Promise.resolve(); }
    return arquivosDoSei(lista).then(function (arquivos) {
      var procs = SEI.lerProcessos(arquivos);
      if (!procs.length) { erroSei('Não achei documentos do SEI (.html) nos arquivos enviados. Envie o .zip exportado do processo.'); return; }
      procs.forEach(function (p) {
        var novo = iniciais(p);
        var i = estado.sei.map(function (x) { return x.p.processo; }).indexOf(p.processo);
        if (i >= 0) estado.sei[i] = novo; else estado.sei.push(novo);
      });
      desenharSei();
    }).catch(function (e) { erroSei('Não foi possível ler os arquivos: ' + e.message); });
  }

  function opcoesSei(lista, atual) {
    return lista.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === atual ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }

  function cartaoSei(it, i) {
    var p = it.p, nome = it.servidor ? it.servidor.nome : (p.servidor ? p.servidor.nome : 'Servidor não identificado');
    var indef = it.decisao === 'indeferida';
    var campos;
    if (indef) {
      campos = '<div><label>Documento do indeferimento</label><select data-c="fundTipo">' + opcoesSei(FUND_TIPOS, it.fundTipo) + '</select></div>' +
        '<div><label>Nº (SEI)</label><input data-c="fundNumero" type="text" value="' + esc(it.fundNumero) + '"></div>' +
        '<div style="grid-column:span 2"><label>Secretaria do documento</label><input data-c="fundSecretaria" type="text" value="' + esc(it.fundSecretaria) + '"></div>';
    } else {
      var decs = p.decenios.map(function (d) { return [d.ini + '/' + d.fim, d.ini + '/' + d.fim + ' (gozou ' + d.gozou + ')']; });
      var campoDec = decs.length
        ? '<select data-c="decenio">' + opcoesSei(decs, it.decenio) + '</select>'
        : '<input data-c="decenio" type="text" placeholder="aaaa/aaaa" value="' + esc(it.decenio) + '">';
      campos = '<div><label>Decênio</label>' + campoDec + '</div>' +
        '<div><label>Início</label><input data-c="inicio" type="date" value="' + esc(it.inicio) + '"></div>' +
        '<div><label>Meses (30 dias cada)</label><input data-c="meses" type="number" min="1" max="12" value="' + esc(it.meses) + '"></div>' +
        '<div><label>Fim</label><div class="sei-fim" data-fim="' + i + '">' + esc(fimDoItem(it) ? SEI.br(D.paraData(fimDoItem(it))) : '—') + '</div></div>';
    }
    var avisos = (p.bloqueio ? ['Não incluir: ' + p.bloqueio + '.'] : []).map(function (t) { return '<li class="bloq">' + esc(t) + '</li>'; });
    if (it.aviso) avisos.push('<li>' + esc(it.aviso) + '</li>');
    p.alertas.forEach(function (t) { avisos.push('<li>' + esc(t) + '</li>'); });
    var busca = it.servidor ? '' : '<div class="sei-sub"><input data-busca="' + i + '" type="search" placeholder="Buscar o servidor na planilha (nome ou matrícula)"></div><ul class="sei-busca-res" id="sei-res-' + i + '"></ul>';
    return '<li class="sei-item' + (indef ? ' indef' : '') + (p.bloqueio ? ' bloq' : '') + (it.incluir ? '' : ' fora') + '" data-i="' + i + '">' +
      '<div class="sei-topo"><label><input type="checkbox" data-c="incluir"' + (it.incluir ? ' checked' : '') + (it.servidor ? '' : ' disabled') + '> ' + esc(nome) + '</label>' +
      '<select data-c="decisao" aria-label="Decisão"><option value="deferida"' + (indef ? '' : ' selected') + '>Deferida</option><option value="indeferida"' + (indef ? ' selected' : '') + '>Indeferida</option></select>' +
      '<button type="button" data-tirar="' + i + '" title="Tirar da lista" aria-label="Tirar da lista">✕</button></div>' +
      '<div class="sei-sub">Processo ' + esc(p.processo) + (it.servidor ? ' · Mat. ' + esc(it.servidor.matriculaFormatada) : '') + (p.saldo != null ? ' · saldo na Ficha: ' + p.saldo + ' mês(es)' : '') + '</div>' +
      busca + '<div class="sei-campos">' + campos + '</div>' +
      (avisos.length ? '<ul class="sei-avisos">' + avisos.join('') + '</ul>' : '') + '</li>';
  }

  function resumoSei() {
    var marcados = estado.sei.filter(function (x) { return x.incluir && x.servidor; });
    $('sei-resumo').textContent = marcados.length + ' de ' + estado.sei.length + ' marcado(s)';
    $('res-sei').textContent = estado.sei.length ? estado.sei.length + (estado.sei.length === 1 ? ' processo lido' : ' processos lidos') : '';
    $('sei-montar').disabled = !marcados.length;
  }

  function desenharSei() {
    $('sei-lista').innerHTML = estado.sei.map(cartaoSei).join('');
    $('sei-acoes').hidden = !estado.sei.length;
    resumoSei();
  }

  function ligarSei() {
    var lista = $('sei-lista');
    lista.addEventListener('change', function (e) {
      var li = e.target.closest('.sei-item'); if (!li) return;
      var it = estado.sei[+li.dataset.i], c = e.target.dataset.c;
      if (!c) return;
      if (c === 'incluir') { it.incluir = e.target.checked; li.classList.toggle('fora', !it.incluir); resumoSei(); return; }
      it[c] = e.target.value;
      if (c === 'decisao') desenharSei();
    });
    lista.addEventListener('input', function (e) {
      var li = e.target.closest('.sei-item');
      if (li && e.target.dataset.c && ['inicio', 'meses', 'fundNumero', 'fundSecretaria', 'decenio'].indexOf(e.target.dataset.c) >= 0) {
        var it = estado.sei[+li.dataset.i];
        it[e.target.dataset.c] = e.target.value;
        var fim = li.querySelector('[data-fim]');
        if (fim) fim.textContent = fimDoItem(it) ? SEI.br(D.paraData(fimDoItem(it))) : '—';
      }
      if (e.target.dataset.busca != null) {
        var i = +e.target.dataset.busca, termo = e.target.value;
        var achados = termo.trim() ? D.buscar(estado.base, termo).slice(0, 6) : [];
        $('sei-res-' + i).innerHTML = achados.map(function (s, k) {
          return '<li><button type="button" data-escolher="' + i + ':' + k + '">' + esc(s.nome) + ' · Mat. ' + esc(s.matriculaFormatada) + '</button></li>';
        }).join('');
        $('sei-res-' + i)._achados = achados;
      }
    });
    lista.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.tirar != null) { estado.sei.splice(+t.dataset.tirar, 1); desenharSei(); return; }
      if (t.dataset.escolher != null) {
        var par = t.dataset.escolher.split(':'), it = estado.sei[+par[0]];
        it.servidor = $('sei-res-' + par[0])._achados[+par[1]];
        it.aviso = ''; it.incluir = !!it.p.decisao && it.p.assuntoLP && !it.p.bloqueio;
        desenharSei();
      }
    });
    $('arquivos-sei').addEventListener('change', function (e) { importarSei(e.target.files); e.target.value = ''; });
    var zona = $('zona-sei');
    ['dragenter', 'dragover'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('arrastando'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('arrastando'); }); });
    zona.addEventListener('drop', function (e) { importarSei(e.dataTransfer.files); });
    $('sei-montar').addEventListener('click', montarDoSei);
  }

  function juntarLista(itens) {
    return itens.length < 2 ? (itens[0] || '') : itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
  }
  function unicos(lista) { return lista.filter(function (x, i) { return lista.indexOf(x) === i; }); }

  // Preenche a portaria de licença prêmio com os processos marcados (um servidor por processo).
  function montarDoSei() {
    var itens = estado.sei.filter(function (x) { return x.incluir && x.servidor; });
    if (!itens.length) return;
    var decisoes = unicos(itens.map(function (x) { return x.decisao; }));
    if (decisoes.length > 1) { erroSei('Marque só deferimentos ou só indeferimentos: cada portaria tem um verbo só (conceder ou indeferir). Monte uma de cada vez.'); return; }
    var matriculas = itens.map(function (x) { return x.servidor.matricula; });
    if (unicos(matriculas).length < matriculas.length) { erroSei('Há dois processos do mesmo servidor marcados: deixe só um.'); return; }
    erroSei('');
    var id = 'licenca-premio', indef = decisoes[0] === 'indeferida';
    var comuns = estado.valores[id] = estado.valores[id] || {};
    comuns.indeferido = indef;
    var avisoFinal = '';
    if (indef) {
      var tipos = unicos(itens.map(function (x) { return x.fundTipo; }));
      if (tipos.length > 1) avisoFinal = ' Os documentos são de tipos diferentes: conferi só o primeiro tipo em "Fundamentos".';
      comuns.fundamentoTipo = itens[0].fundTipo;
      comuns.fundamentoNumero = juntarLista(unicos(itens.map(function (x) { return x.fundNumero; }).filter(Boolean)));
      var iguais = itens.every(function (x) {
        return x.fundSecretaria && D.normalizar(x.fundSecretaria) === D.normalizar(R.capitalizar(secretariaDe(x.servidor)));
      });
      if (iguais) comuns.fundamentoOrigemEscolha = 'servidor';
      else {
        var secs = unicos(itens.map(function (x) { return x.fundSecretaria; }).filter(Boolean));
        comuns.fundamentoOrigemEscolha = 'outro';
        comuns.fundamentoOrigem = secs.length === 1 ? secs[0] : (secs.length ? 'respectivas secretarias' : '');
      }
    }
    estado.selecionados = itens.map(function (x) { return x.servidor; });
    itens.forEach(function (x) {
      var v = { processo: x.p.processo };
      if (!indef) {
        v.decenio = x.decenio || '';
        v.periodoIni = x.inicio || '';
        v.periodoFim = fimDoItem(x);
      }
      estado.valoresServ[x.servidor.matricula + '|' + id] = v;
    });
    $('tipo').value = id;
    salvarConfig();
    montarCamposDoTipo();
    renderizar();
    $('sei-resumo').textContent = 'Portaria montada com ' + itens.length + (itens.length === 1 ? ' servidor' : ' servidores') + '. Confira os campos e o texto.' + avisoFinal;
  }

  // ---------- eventos ----------
  function iniciar() {
    // tipos agrupados por assunto
    $('tipo').innerHTML = R.grupos().map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + R.TIPOS.filter(function (t) { return t.grupo === g; }).map(function (t) {
        return '<option value="' + t.id + '">' + esc(t.nome) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    $('v-matricula').innerHTML = R.FORMATOS_MATRICULA.map(function (f) { return '<option value="' + f.id + '">' + esc(f.rotulo) + '</option>'; }).join('');
    lerConfig();
    $('v-data').value = hojeISO();
    montarCamposDoTipo();

    iniciarPasta();
    $('arquivos').addEventListener('change', function (e) { carregarArquivos(e.target.files); e.target.value = ''; });
    ligarSei();
    iniciarPainel();
    iniciarPassos();

    // arrastar a planilha para qualquer lugar da página
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
      if (!e.dataTransfer || !e.dataTransfer.files.length || e.target.closest('#zona') || e.target.closest('#zona-sei')) return;
      var todos = Array.prototype.slice.call(e.dataTransfer.files);
      var doSei = todos.filter(function (f) { return /\.(zip|html?)$/i.test(f.name); });
      var planilhas = todos.filter(function (f) { return !/\.(zip|html?)$/i.test(f.name); });
      if (planilhas.length) carregarArquivos(planilhas);
      if (doSei.length) importarSei(doSei);
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

    $('lista-servidores').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mat]');
      if (b) retirar(b.dataset.mat);
    });
    $('tipo').addEventListener('change', function () { salvarConfig(); montarCamposDoTipo(); renderizar(); });
    ['v-numero', 'v-data', 'v-matricula'].forEach(function (id) {
      $(id).addEventListener('input', function () { if (id === 'v-matricula') salvarConfig(); renderizar(); });
    });
    CAMPOS_CONFIG.forEach(function (k) {
      $('cfg-' + k).addEventListener('input', function () { salvarConfig(); renderizar(); });
    });
    $('restaurar').addEventListener('click', function () {
      try { localStorage.removeItem(CHAVE_CONFIG); } catch (e) { /* ignora */ }
      lerConfig();
      renderizar();
    });
    $('imprimir').addEventListener('click', function () { window.print(); });
    $('copiar').addEventListener('click', copiarTexto);
    $('baixar-word').addEventListener('click', baixarWord);

    window.addEventListener('resize', ajustarEscala);
    atualizarStatus();
    renderizar();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
