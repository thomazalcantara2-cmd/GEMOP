/*
 * Leitura das planilhas, compartilhada pelos programas (Requerimento do Servidor e Portarias).
 * Só cuida de ler os arquivos .xlsx e achar a pasta; as regras de extração ficam em dados.js.
 * Depende de XLSX (SheetJS) e de Dados (dados.js) já carregados.
 */
(function (global) {
  'use strict';

  var D = global.Dados;

  function lerArquivo(arquivo) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onload = function () {
        try {
          resolve(global.XLSX.read(new Uint8Array(leitor.result), { type: 'array' }));
        } catch (e) { reject(e); }
      };
      leitor.onerror = function () { reject(leitor.error); };
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  function linhasDaAba(wb, nome) {
    var alvo = D.normalizar(nome);
    var aba = wb.SheetNames.filter(function (n) { return D.normalizar(n) === alvo; })[0];
    return aba ? global.XLSX.utils.sheet_to_json(wb.Sheets[aba], { raw: true, defval: null }) : null;
  }

  // Descobre pelo conteúdo se a planilha é uma Ficha Cadastral ou a FichaContabilis (antigo INDICE).
  function identificar(wb, nomeArquivo) {
    var lotacoes = linhasDaAba(wb, 'Lotacoes');
    if (lotacoes) {
      return { tipo: 'ficha', nome: nomeArquivo, servidores: linhasDaAba(wb, 'Servidores') || [],
        lotacoes: lotacoes, afastamentos: linhasDaAba(wb, 'Afastamentos') || [],
        ferias: linhasDaAba(wb, 'Ferias') || [], faltas: linhasDaAba(wb, 'Faltas') || [] };
    }
    for (var i = 0; i < wb.SheetNames.length; i++) {
      var linhas = global.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { raw: true, defval: null });
      if (linhas.length && 'nu_matricula' in linhas[0] && 'nm_Funcionario' in linhas[0]) {
        return { tipo: 'indice', nome: nomeArquivo, linhas: linhas, anoMes: linhas[0].dt_anoMes };
      }
    }
    return null;
  }

  /*
   * Lê e identifica uma lista de arquivos (File), do mais antigo para o mais novo: se houver duas
   * versões da mesma planilha, vale a mais recente. Devolve [{ nome, resultado }] (resultado = null
   * quando o arquivo não é uma das planilhas esperadas).
   */
  function ler(lista) {
    var arquivos = Array.prototype.slice.call(lista || []).sort(function (a, b) {
      return (a.lastModified || 0) - (b.lastModified || 0);
    });
    return Promise.all(arquivos.map(function (f) {
      return lerArquivo(f).then(function (wb) {
        var r = identificar(wb, f.name);
        if (r) r.modificado = f.lastModified ? new Date(f.lastModified) : null;
        return { nome: f.name, resultado: r };
      });
    }));
  }

  // Lê primeiro só as planilhas com o nome esperado (FichaContabilis — ou o antigo INDICE/CEDIDOS — e
  // FichaCadastral); se faltar alguma, lê todas para identificar pelo conteúdo.
  // Com precisaFicha = false (programas que só usam a FichaContabilis), basta achar a FichaContabilis.
  function escolherPlanilhas(itens, nomeDe, precisaFicha) {
    var nome = function (x) { return D.normalizar(nomeDe(x)).replace(/[^A-Z]/g, ''); };
    var pelosNomes = itens.filter(function (x) {
      return /FICHACONTABILIS|INDICE|CEDIDOS|FICHACADASTRAL/.test(nome(x));
    });
    var temIndice = pelosNomes.some(function (x) { return /FICHACONTABILIS|INDICE|CEDIDOS/.test(nome(x)); });
    var temFicha = pelosNomes.some(function (x) { return nome(x).indexOf('FICHACADASTRAL') >= 0; });
    return temIndice && (temFicha || precisaFicha === false) ? pelosNomes : itens;
  }

  // ---------- modo aplicativo local (.bat + servidor.ps1) ----------
  // O servidor local (só neste computador) entrega a lista e o conteúdo das planilhas da pasta configurada.
  // Devolve { pasta, arquivos: File[] } (arquivos vazio se a pasta não tem planilhas).
  function doServidorLocal(precisaFicha) {
    return fetch('api/planilhas', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (info) {
      var lista = escolherPlanilhas(info.arquivos || [], function (a) { return a.nome; }, precisaFicha);
      return Promise.all(lista.map(function (a) {
        return fetch('api/arquivo?nome=' + encodeURIComponent(a.nome), { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('não foi possível ler ' + a.nome);
          return r.blob();
        }).then(function (b) { return new File([b], a.nome, { lastModified: a.modificado }); });
      })).then(function (arquivos) { return { pasta: info.pasta, arquivos: arquivos }; });
    });
  }

  // ---------- pasta das planilhas (Chrome/Edge: File System Access API) ----------
  // O navegador não deixa uma página abrir pastas do computador sozinha: a pasta é escolhida
  // uma vez e o acesso fica guardado neste navegador (IndexedDB) para as próximas vezes.
  var LOJA = 'pasta';

  function bancoPasta(banco, modo, valor) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open(banco, 1);
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

  function arquivosDaPasta(pasta, precisaFicha) {
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
      return escolherPlanilhas(todos, function (f) { return f.name; }, precisaFicha);
    });
  }

  global.Planilhas = {
    ler: ler,
    escolherPlanilhas: escolherPlanilhas,
    doServidorLocal: doServidorLocal,
    bancoPasta: bancoPasta,
    arquivosDaPasta: arquivosDaPasta
  };
})(this);
