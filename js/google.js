/*
 * Versão online: lê a FichaContabilis direto do Google Drive da pessoa que está usando a página.
 * A pessoa entra com a conta Google e escolhe o arquivo numa janela do próprio Drive; a página só enxerga
 * esse arquivo (permissão "drive.file") e só se a conta tiver acesso a ele. Nada é enviado nem guardado em servidor.
 * Funciona com o .xlsx como está no Drive ou com uma Planilha Google.
 * Depende de js/google-config.js (window.GOOGLE_CONFIG).
 */
(function (global) {
  'use strict';

  var cfg = global.GOOGLE_CONFIG || {};
  var ESCOPO = 'https://www.googleapis.com/auth/drive.file';
  var CHAVE = 'gemop-google-arquivo';  // só o código e o nome do arquivo escolhido; nenhum dado de servidor
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';
  var scripts = {};
  var cliente = null;
  var token = null;   // { valor, vence }

  function disponivel() { return !!(cfg.clientId && cfg.apiKey && cfg.appId); }

  function carregarScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = resolve;
        s.onerror = function () { delete scripts[src]; reject(new Error('Não foi possível falar com o Google. Confira a conexão com a internet.')); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  function erro(msg, extra) {
    var e = new Error(msg);
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  // Pede a permissão ao Google (abre a janela de login na primeira vez) e devolve a autorização temporária.
  function autorizacao() {
    if (token && token.vence > Date.now() + 60000) return Promise.resolve(token.valor);
    return carregarScript('https://accounts.google.com/gsi/client').then(function () {
      return new Promise(function (resolve, reject) {
        cliente = cliente || global.google.accounts.oauth2.initTokenClient({
          client_id: cfg.clientId,
          scope: ESCOPO,
          callback: function () {},
          error_callback: function () {}
        });
        cliente.callback = function (r) {
          if (r.error || !r.access_token) {
            reject(erro('O Google não liberou o acesso (' + (r.error_description || r.error || 'sem resposta') + ').', { cancelado: r.error === 'access_denied' }));
            return;
          }
          token = { valor: r.access_token, vence: Date.now() + (r.expires_in || 3600) * 1000 };
          resolve(token.valor);
        };
        cliente.error_callback = function (e) {
          reject(erro(e && e.type === 'popup_closed' ? 'A janela de login foi fechada.' : 'Não foi possível entrar com o Google.', { cancelado: true }));
        };
        cliente.requestAccessToken({});
      });
    });
  }

  // Janela do Google Drive para escolher a planilha (Meu Drive, Compartilhados comigo e Drives compartilhados).
  function escolher(tk) {
    return Promise.all([
      carregarScript('https://apis.google.com/js/api.js'),
    ]).then(function () {
      return new Promise(function (resolve) { global.gapi.load('picker', resolve); });
    }).then(function () {
      return new Promise(function (resolve, reject) {
        var g = global.google.picker;
        var tipos = XLSX_MIME + ',' + SHEETS_MIME;
        var meu = new g.DocsView().setIncludeFolders(true).setMimeTypes(tipos).setLabel('Meu Drive');
        var comigo = new g.DocsView().setIncludeFolders(true).setOwnedByMe(false).setMimeTypes(tipos).setLabel('Compartilhados comigo');
        var drives = new g.DocsView().setIncludeFolders(true).setEnableDrives(true).setMimeTypes(tipos).setLabel('Drives compartilhados');
        new g.PickerBuilder()
          .setTitle('Escolha a FichaContabilis')
          .setLocale('pt-BR')
          .setAppId(cfg.appId)
          .setDeveloperKey(cfg.apiKey)
          .setOAuthToken(tk)
          .enableFeature(g.Feature.SUPPORT_DRIVES)
          .addView(meu).addView(comigo).addView(drives)
          .setCallback(function (r) {
            if (r[g.Response.ACTION] === g.Action.PICKED) {
              var d = r[g.Response.DOCUMENTS][0];
              resolve({ id: d[g.Document.ID], nome: d[g.Document.NAME] });
            } else if (r[g.Response.ACTION] === g.Action.CANCEL) {
              reject(erro('Nenhuma planilha escolhida.', { cancelado: true }));
            }
          })
          .build().setVisible(true);
      });
    });
  }

  function chamar(url, tk, tipo) {
    return fetch(url, { headers: { Authorization: 'Bearer ' + tk } }).then(function (r) {
      if (!r.ok) {
        var msg = r.status === 404 || r.status === 403
          ? 'Sua conta Google não tem acesso a esta planilha. Peça para ser incluída no compartilhamento e escolha o arquivo de novo.'
          : r.status === 401 ? 'O acesso ao Google expirou. Clique em "Recarregar planilha" para entrar de novo.'
          : 'O Google não entregou a planilha (erro ' + r.status + ').';
        throw erro(msg, { status: r.status });
      }
      return tipo === 'json' ? r.json() : r.blob();
    });
  }

  // Baixa o arquivo escolhido e devolve um File igual ao que o leitor de planilhas já espera.
  function baixar(tk, id) {
    var base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id);
    return chamar(base + '?fields=id,name,mimeType,modifiedTime&supportsAllDrives=true', tk, 'json').then(function (meta) {
      var url = meta.mimeType === SHEETS_MIME
        ? base + '/export?mimeType=' + encodeURIComponent(XLSX_MIME)
        : base + '?alt=media&supportsAllDrives=true';
      return chamar(url, tk, 'blob').then(function (blob) {
        guardar({ id: meta.id, nome: meta.name });
        var nome = /\.xlsx?$/i.test(meta.name) ? meta.name : meta.name + '.xlsx';
        return new File([blob], nome, { lastModified: meta.modifiedTime ? Date.parse(meta.modifiedTime) : Date.now() });
      });
    });
  }

  function guardar(x) { try { localStorage.setItem(CHAVE, JSON.stringify(x)); } catch (e) { /* ignora */ } }
  function lembrado() {
    try { var x = JSON.parse(localStorage.getItem(CHAVE) || 'null'); return x && x.id ? x : null; } catch (e) { return null; }
  }
  function esquecer() { try { localStorage.removeItem(CHAVE); } catch (e) { /* ignora */ } }

  /*
   * Entra com o Google e devolve a planilha como File. Usa a que foi escolhida da última vez;
   * se isso falhar ou se pedirem outra (escolherOutra), abre a janela do Drive.
   */
  function abrir(escolherOutra) {
    return autorizacao().then(function (tk) {
      var antigo = escolherOutra ? null : lembrado();
      var escolhendo = function () { return escolher(tk).then(function (x) { return baixar(tk, x.id); }); };
      if (!antigo) return escolhendo();
      return baixar(tk, antigo.id).catch(function (e) {
        if (e.status === 404 || e.status === 403) { esquecer(); return escolhendo(); }
        throw e;
      });
    });
  }

  global.GoogleDrive = { disponivel: disponivel, abrir: abrir, lembrado: lembrado };
})(this);
