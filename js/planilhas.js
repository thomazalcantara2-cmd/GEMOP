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
          var bytes = new Uint8Array(leitor.result), wb;
          // A aba AFASTAMENTO tem mais de 100 mil linhas e pesa na leitura: fica de fora e só é lida quando a portaria precisar dela
          var nomes = global.XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames || [];
          var aba = nomes.filter(function (n) { var x = D.normalizar(n); return x === 'AFASTAMENTO' || x === 'AFASTAMENTOS'; })[0];
          if (aba && nomes.length > 1) {
            wb = global.XLSX.read(bytes, { type: 'array', sheets: nomes.filter(function (n) { return n !== aba; }) });
            wb.__afastamentos = { nome: aba, bytes: bytes };
          } else wb = global.XLSX.read(bytes, { type: 'array' });
          resolve(wb);
        } catch (e) { reject(e); }
      };
      leitor.onerror = function () { reject(leitor.error); };
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  function linhasDaAba(wb, nome) {
    var alvo = D.normalizar(nome);
    var aba = wb.SheetNames.filter(function (n) { return D.normalizar(n) === alvo; })[0];
    return aba && wb.Sheets[aba] ? global.XLSX.utils.sheet_to_json(wb.Sheets[aba], { raw: true, defval: null }) : null;   // aba deixada de fora na leitura (AFASTAMENTO) = não existe aqui
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
        // aba AFASTAMENTO (opcional): vira um índice por matrícula só com o que pesa na licença prêmio (a aba tem >100 mil linhas)
        var abaAfast = linhasDaAba(wb, 'AFASTAMENTO') || linhasDaAba(wb, 'AFASTAMENTOS'), adiada = wb.__afastamentos;
        return { tipo: 'indice', nome: nomeArquivo, linhas: linhas, anoMes: linhas[0].dt_anoMes,
          afastamentos: abaAfast && global.Afastamentos ? global.Afastamentos.indexar(abaAfast) : null,
          // aba lida sob demanda: devolve (em Promise) o índice por matrícula
          carregarAfastamentos: adiada && global.Afastamentos ? function () {
            return new Promise(function (ok, no) {
              setTimeout(function () {   // deixa a tela mostrar o aviso antes de travar na leitura
                try {
                  var w = global.XLSX.read(adiada.bytes, { type: 'array', sheets: [adiada.nome] });
                  ok(global.Afastamentos.indexar(global.XLSX.utils.sheet_to_json(w.Sheets[adiada.nome], { raw: true, defval: null })));
                } catch (e) { no(e); }
              }, 40);
            });
          } : null };
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
