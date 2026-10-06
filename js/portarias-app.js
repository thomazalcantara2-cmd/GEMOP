/* Interface das Portarias: carrega a FichaContabilis, busca o servidor e monta a folha A4. */
(function () {
  'use strict';

  var D = window.Dados;
  var P = window.Planilhas;
  var R = window.Portarias;
  var CHAVE_CONFIG = 'gemop-portarias-config-v1';
  var CHAVE_PAINEL = 'gemop-portarias-painel-recolhido';
  var BANCO = 'gemop-portarias';
  var CAMPOS_CONFIG = ['preambulo', 'assinanteNome', 'assinanteCargo'];

  var estado = {
    indice: null,       // { nome, linhas, anoMes }
    base: [],
    secretarias: {},    // código do centro de custo -> nome da secretaria
    selecionados: [],   // servidores da portaria, na ordem escolhida
    valores: {},        // campos comuns, por tipo de portaria: { idDoCampo: texto }
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
      if (liberada !== 'granted') { mostrarPasta(pasta, false); return; }
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

  function iniciarPasta() {
    $('recarregar').addEventListener('click', function () {
      if (estado.modoLocal) {
        carregarDoServidorLocal().catch(function (e) { mostrarErro('Não foi possível ler a planilha: ' + e.message); });
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
    // sem Ficha Cadastral: só os dados da FichaContabilis (nome, matrícula, cargo, sexo, centro de custo)
    estado.base = D.montarBase(estado.indice.linhas, { servidores: [], lotacoes: [] });
    estado.secretarias = R.mapaSecretarias(estado.base);
    $('busca').disabled = false;
    $('busca').placeholder = 'Digite o nome, matrícula ou CPF (' + estado.base.length + ' servidores)';
    estado.selecionados = estado.selecionados.map(function (x) {
      return estado.base.filter(function (s) { return s.matricula === x.matricula; })[0] || x;
    });
    atualizarBusca();
    montarServidores();
    montarCamposServidores();
    renderizar();
  }

  function atualizarStatus() {
    var i = estado.indice;
    // o quadro abre sozinho enquanto falta a planilha e fecha quando ela carrega
    if (!i) $('det-planilhas').open = true;
    else if (!estado.quadroFechado) { $('det-planilhas').open = false; estado.quadroFechado = true; }
    var anoMes = i && i.anoMes ? String(Math.round(i.anoMes)) : '';
    $('status-indice').className = 'arquivo ' + (i ? 'ok' : '');
    $('status-indice').innerHTML = i
      ? '<b>Ficha Contabilis</b> — ' + esc(i.nome) + '<br><small>' + i.linhas.length + ' servidores' +
        (anoMes ? ' · competência ' + anoMes.slice(4) + '/' + anoMes.slice(0, 4) : '') +
        (i.modificado ? ' · arquivo de ' + i.modificado.toLocaleDateString('pt-BR') : '') + '</small>'
      : '<b>Ficha Contabilis</b> — aguardando arquivo';
  }

  // ---------- busca ----------
  function secretariaDe(s) { return R.secretariaDoServidor(s, estado.secretarias); }

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
    montarCamposServidores();
    renderizar();
  }

  function retirar(matricula) {
    estado.selecionados = estado.selecionados.filter(function (s) { return s.matricula !== matricula; });
    montarServidores();
    montarCamposServidores();
    renderizar();
  }

  function montarServidores() {
    $('lista-servidores').innerHTML = estado.selecionados.map(function (s) {
      return '<li><span><b>' + esc(s.nome) + '</b><small>Mat. ' + esc(s.matriculaFormatada) + ' · ' + esc(R.capitalizar(s.cargoNome)) +
        ' · ' + esc(secretariaDe(s)) + '</small></span>' +
        '<button type="button" data-mat="' + esc(s.matricula) + '" title="Retirar da portaria" aria-label="Retirar ' + esc(s.nome) + ' da portaria">✕</button></li>';
    }).join('');
  }

  // ---------- campos do modelo escolhido ----------
  function tipoAtual() { return R.tipoPorId($('tipo').value) || R.TIPOS[0]; }

  // Valor lido de um campo da tela (data vira {a,m,d}; vazio = '').
  function lerCampo(el, c) {
    var v = el.value.trim();
    return c.tipo === 'data' ? (v ? D.paraData(v) : null) : v;
  }

  function campoHTML(prefixo, c) {
    var entrada = c.tipo === 'data' ? 'date' : (c.tipo === 'numero' ? 'number' : 'text');
    return '<label class="campo" for="' + prefixo + c.id + '">' + esc(c.rotulo) +
      (c.ajuda ? ' <small>(' + esc(c.ajuda) + ')</small>' : '') + '</label>' +
      '<input id="' + prefixo + c.id + '" type="' + entrada + '"' + (c.exemplo ? ' placeholder="ex.: ' + esc(c.exemplo) + '"' : '') + '>';
  }

  function ligarCampo(el, guardados, id) {
    el.value = guardados[id] || '';
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
    $('campos-tipo').innerHTML = comuns.map(function (c) { return campoHTML('c-', c); }).join('');
    comuns.forEach(function (c) { ligarCampo($('c-' + c.id), guardados, c.id); });
    montarCamposServidores();
  }

  // Campos de cada servidor (nº do processo, requerimento…): um quadro por servidor escolhido.
  function montarCamposServidores() {
    var tipo = tipoAtual();
    var porServidor = tipo.campos.filter(function (c) { return c.porServidor; });
    var varios = estado.selecionados.length > 1;
    $('campos-servidores').innerHTML = porServidor.length ? estado.selecionados.map(function (s, i) {
      return '<fieldset class="servidor-campos">' + (varios ? '<legend>' + esc(s.nome) + '</legend>' : '') +
        porServidor.map(function (c) { return campoHTML('s' + i + '-', c); }).join('') + '</fieldset>';
    }).join('') : '';
    estado.selecionados.forEach(function (s, i) {
      var guardados = estado.valoresServ[s.matricula + '|' + tipo.id] = estado.valoresServ[s.matricula + '|' + tipo.id] || {};
      porServidor.forEach(function (c) { ligarCampo($('s' + i + '-' + c.id), guardados, c.id); });
    });
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
    return { nome: s.nome, matricula: s.matricula, cargo: R.capitalizar(s.cargoNome), secretaria: secretariaDe(s), sexo: s.sexo, campos: campos };
  }

  function avisosDoServidor(s, varios) {
    var avisos = [], quem = varios ? s.nome + ': ' : '';
    if (s.sexo !== 'F' && s.sexo !== 'M') {
      avisos.push(quem + 'a planilha não informa o sexo: o texto saiu no masculino. Corrija direto no texto da folha, se preciso.');
    }
    if (R.ehCedido(s)) {
      avisos.push(quem + 'consta como CEDIDO (SEGEPE - Cedidos): a secretaria foi tirada da lotação na planilha, que pode não ser a de origem. Confira na folha.');
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
            return '<tr>' + l.map(function (c) { return '<td>' + textoFormatado(c) + '</td>'; }).join('') + '</tr>';
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

    $('imprimir').disabled = !escolhidos.length;
    $('copiar').disabled = !escolhidos.length;
    document.title = escolhidos.length ? 'Portaria - ' + escolhidos.map(function (x) { return x.nome; }).join(', ') : 'Portarias';
  }

  // ---------- copiar o texto (para colar no editor do SEI) ----------
  function copiarTexto() {
    var origem = $('portaria-texto');
    var selecao = window.getSelection();
    var intervalo = document.createRange();
    intervalo.selectNodeContents(origem);
    selecao.removeAllRanges();
    selecao.addRange(intervalo);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    selecao.removeAllRanges();
    $('copiado').textContent = ok ? 'Texto copiado. No SEI, cole com Ctrl+V.' : 'Não foi possível copiar: selecione o texto da folha e use Ctrl+C.';
    $('copiado').hidden = false;
    setTimeout(function () { $('copiado').hidden = true; }, 4000);
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
    iniciarPainel();

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

    atualizarStatus();
    renderizar();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
