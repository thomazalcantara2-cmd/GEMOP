/*
 * Regras de extração dos dados para o Requerimento do Servidor.
 * Funções puras: recebem as linhas das planilhas (arrays de objetos gerados pelo
 * SheetJS com { raw: true }) e devolvem os campos do formulário.
 * Funciona no navegador (window.Dados) e no Node (module.exports) para testes.
 */
(function (global) {
  'use strict';

  // Órgãos para onde o servidor é movido depois de cedido. O "órgão de origem"
  // é o último órgão do histórico de lotações que NÃO está nesta lista.
  // A comparação ignora acentos e maiúsculas e é feita por prefixo, cobrindo
  // "SECRETARIA MUNICIPAL DE ADMINISTRACAO" e
  // "SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO, GOVERNO DIGITAL E INOVAÇÃO".
  var ORGAOS_CESSAO = ['SECRETARIA MUNICIPAL DE ADMINISTRACAO'];

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function soDigitos(v) {
    if (v == null) return '';
    if (typeof v === 'number') v = Math.round(v).toString();
    return String(v).replace(/\D/g, '');
  }

  function chaveMatricula(v) {
    var d = soDigitos(v);
    return d ? d.padStart(9, '0') : '';
  }

  // Datas são tratadas como {a, m, d} para evitar problemas de fuso horário.
  function paraData(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      var ms = Math.round(v) * 86400000 + Date.UTC(1899, 11, 30);
      var dt = new Date(ms);
      return { a: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
    if (v instanceof Date) {
      return { a: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
    }
    var s = String(v).trim();
    var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return { a: +br[3], m: +br[2], d: +br[1] };
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return { a: +iso[1], m: +iso[2], d: +iso[3] };
    return null;
  }

  function valorData(dt) {
    return dt ? dt.a * 10000 + dt.m * 100 + dt.d : 0;
  }

  function dataBR(dt) {
    if (!dt) return '';
    return String(dt.d).padStart(2, '0') + '/' + String(dt.m).padStart(2, '0') + '/' + dt.a;
  }

  function dataExtenso(dt) {
    return dt ? dt.d + ' de ' + MESES[dt.m - 1] + ' de ' + dt.a : '';
  }

  function diasNoMes(a, m) {
    return new Date(Date.UTC(a, m, 0)).getUTCDate();
  }

  // Diferença em anos, meses e dias (contagem civil, como no cálculo manual).
  function tempoEntre(inicio, fim) {
    if (!inicio || !fim || valorData(fim) < valorData(inicio)) return null;
    var totalMeses = (fim.a - inicio.a) * 12 + (fim.m - inicio.m);
    if (fim.d < inicio.d) totalMeses -= 1;
    // soma os meses completos à data inicial (limitando ao fim do mês) e conta os dias restantes
    var mesAlvo = inicio.m - 1 + totalMeses;
    var anoAncora = inicio.a + Math.floor(mesAlvo / 12);
    var mesAncora = (mesAlvo % 12) + 1;
    var diaAncora = Math.min(inicio.d, diasNoMes(anoAncora, mesAncora));
    var dias = Math.round((Date.UTC(fim.a, fim.m - 1, fim.d) -
      Date.UTC(anoAncora, mesAncora - 1, diaAncora)) / 86400000);
    return { anos: Math.floor(totalMeses / 12), meses: totalMeses % 12, dias: dias };
  }

  function formatarTempo(t) {
    if (!t) return '';
    function parte(n, um, varios) {
      return String(n).padStart(2, '0') + ' ' + (n === 1 ? um : varios);
    }
    return parte(t.anos, 'ANO', 'ANOS') + ', ' + parte(t.meses, 'MÊS', 'MESES') +
      ' E ' + parte(t.dias, 'DIA', 'DIAS') + '.';
  }

  // 002076671 -> 20.766-7.1
  function formatarMatricula(v) {
    var d = soDigitos(v).replace(/^0+/, '');
    if (d.length < 3) return d;
    var base = d.slice(0, -2);
    return base.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + d.slice(-2, -1) + '.' + d.slice(-1);
  }

  function formatarCPF(v) {
    var d = soDigitos(v).padStart(11, '0');
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }

  function paraNumero(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    var s = String(v).trim();
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function formatarMoeda(n) {
    if (n == null) return '';
    var partes = n.toFixed(2).split('.');
    return 'R$ ' + partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1];
  }

  var UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  var DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  var CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
    'setecentos', 'oitocentos', 'novecentos'];

  function ate999(n) {
    if (n === 100) return 'cem';
    var c = Math.floor(n / 100), r = n % 100, partes = [];
    if (c) partes.push(CENTENAS[c]);
    if (r) {
      if (r < 20) partes.push(UNIDADES[r]);
      else partes.push(DEZENAS[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNIDADES[r % 10] : ''));
    }
    return partes.join(' e ');
  }

  function inteiroExtenso(n) {
    if (n === 0) return 'zero';
    var milhoes = Math.floor(n / 1000000), milhares = Math.floor(n / 1000) % 1000, resto = n % 1000;
    var texto = '';
    function juntar(parte, valorParte) {
      if (!texto) return parte;
      // "mil e quinhentos", "mil e vinte", mas "três mil, quinhentos e noventa"
      var usaE = valorParte < 100 || valorParte % 100 === 0;
      return texto + (usaE ? ' e ' : ', ') + parte;
    }
    if (milhoes) texto = ate999(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões');
    if (milhares) texto = juntar(milhares === 1 ? 'mil' : ate999(milhares) + ' mil', milhares * 1000);
    if (resto) texto = juntar(ate999(resto), resto);
    return texto;
  }

  function valorExtenso(n) {
    if (n == null) return '';
    var centavosTotal = Math.round(n * 100);
    var reais = Math.floor(centavosTotal / 100), centavos = centavosTotal % 100;
    var partes = [];
    if (reais) {
      var r = inteiroExtenso(reais);
      var deReais = reais >= 1000000 && reais % 1000000 === 0;
      partes.push(r + (deReais ? ' de' : '') + (reais === 1 ? ' real' : ' reais'));
    }
    if (centavos) partes.push(inteiroExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos'));
    var texto = partes.join(' e ') || 'zero reais';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function ehOrgaoCessao(orgao, prefixos) {
    var n = normalizar(orgao);
    return (prefixos || ORGAOS_CESSAO).some(function (p) {
      p = normalizar(p);
      return p && n.indexOf(p) === 0;
    });
  }

  // Lotações de um servidor, da mais recente para a mais antiga.
  function ordenarLotacoes(lotacoes) {
    return lotacoes.slice().sort(function (x, y) {
      var dif = valorData(y.inicio) - valorData(x.inicio);
      if (dif) return dif;
      // mesma data de início: a que está em aberto (sem fim) vem primeiro
      return (y.fim ? valorData(y.fim) : 99999999) - (x.fim ? valorData(x.fim) : 99999999);
    });
  }

  function orgaoDeOrigem(lotacoesOrdenadas, prefixos) {
    for (var i = 0; i < lotacoesOrdenadas.length; i++) {
      var l = lotacoesOrdenadas[i];
      if (l.orgao && !ehOrgaoCessao(l.orgao, prefixos)) return l;
    }
    return null;
  }

  function diaSeguinte(dt) {
    var d = new Date(Date.UTC(dt.a, dt.m - 1, dt.d + 1));
    return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }

  /*
   * Agrupa os afastamentos por tipo (descrição), em ordem cronológica.
   * Períodos do mesmo tipo que se emendam (fim + 1 dia = próximo início, ou sobrepostos)
   * são unidos: ex. 01/01/2025 a 31/12/2025 + 01/01/2026 a 31/12/2026 -> 01/01/2025 a 31/12/2026.
   */
  function agruparAfastamentos(afastamentos) {
    var ordenados = afastamentos.filter(function (x) { return x.descricao && x.inicio; })
      .sort(function (x, y) { return valorData(x.inicio) - valorData(y.inicio); });
    var grupos = [], porTipo = {};
    ordenados.forEach(function (x) {
      var g = porTipo[x.descricao];
      if (!g) {
        g = porTipo[x.descricao] = { descricao: x.descricao, periodos: [] };
        grupos.push(g);
      }
      var ultimo = g.periodos[g.periodos.length - 1];
      if (ultimo && ultimo.fim && valorData(x.inicio) <= valorData(diaSeguinte(ultimo.fim))) {
        if (!x.fim || valorData(x.fim) > valorData(ultimo.fim)) ultimo.fim = x.fim;
      } else if (!ultimo || ultimo.fim) {
        g.periodos.push({ inicio: x.inicio, fim: x.fim });
      }
    });
    return grupos;
  }

  function formatarAfastamentos(grupos) {
    return grupos.map(function (g) {
      return g.descricao + ': ' + g.periodos.map(function (p) {
        return dataBR(p.inicio) + ' a ' + (p.fim ? dataBR(p.fim) : 'atual');
      }).join('; ') + '.';
    });
  }

  function diasEntre(inicio, fim) {
    return Math.round((Date.UTC(fim.a, fim.m - 1, fim.d) - Date.UTC(inicio.a, inicio.m - 1, inicio.d)) / 86400000) + 1;
  }

  function somarAnos(dt, anos) {
    var a = dt.a + anos;
    return { a: a, m: dt.m, d: Math.min(dt.d, diasNoMes(a, dt.m)) };
  }

  // "2 anos, 7 meses e 6 dias" (omite as partes zeradas)
  function tempoPorExtenso(t) {
    var partes = [];
    if (t.anos) partes.push(t.anos + (t.anos === 1 ? ' ano' : ' anos'));
    if (t.meses) partes.push(t.meses + (t.meses === 1 ? ' mês' : ' meses'));
    if (t.dias || !partes.length) partes.push(t.dias + (t.dias === 1 ? ' dia' : ' dias'));
    return partes.length > 1 ? partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1] : partes[0];
  }

  function listaComE(itens, conector) {
    if (itens.length < 2) return itens.join('');
    return itens.slice(0, -1).join(', ') + ' ' + conector + ' ' + itens[itens.length - 1];
  }

  // Admitidos até 07/03/1996: 2 anos de estágio probatório; depois disso, 3 anos.
  var LIMITE_ESTAGIO_2_ANOS = { a: 1996, m: 3, d: 7 };

  function estagioProbatorio(admissao) {
    if (!admissao) return null;
    var anos = valorData(admissao) <= valorData(LIMITE_ESTAGIO_2_ANOS) ? 2 : 3;
    return { anos: anos, fim: somarAnos(admissao, anos) };
  }

  function textoEstagio(admissao, referencia) {
    var e = estagioProbatorio(admissao);
    if (!e || !referencia) return 'NÃO CONSTA cumprimento de estágio probatório.';
    if (valorData(e.fim) <= valorData(referencia)) {
      return 'CONSTA cumprimento de estágio probatório, concluído em ' + dataBR(e.fim) + '.';
    }
    return 'Servidor em estágio probatório, com término previsto em ' + dataBR(e.fim) +
      ' (faltam ' + tempoPorExtenso(tempoEntre(referencia, e.fim)) + ').';
  }

  function textoFaltas(faltas) {
    if (!faltas || !faltas.length) return 'NÃO CONSTAM faltas no Sistema de Administração de Recursos Humanos.';
    return 'CONSTAM faltas no Sistema de Administração de Recursos Humanos: ' + faltas.join('; ') + '.';
  }

  function ultimoPeriodo(grupos, trecho) {
    var ultimo = null;
    (grupos || []).forEach(function (g) {
      if (normalizar(g.descricao).indexOf(trecho) < 0) return;
      g.periodos.forEach(function (p) {
        if (!ultimo || valorData(p.inicio) > valorData(ultimo.inicio)) ultimo = p;
      });
    });
    return ultimo;
  }

  function descreverPeriodo(p) {
    if (!p.fim) return 'a partir de ' + dataBR(p.inicio);
    var dias = diasEntre(p.inicio, p.fim);
    return 'de ' + dataBR(p.inicio) + ' a ' + dataBR(p.fim) + ' (' + dias + (dias === 1 ? ' dia)' : ' dias)');
  }

  /*
   * Item de férias / licença para estudos / licença-prêmio.
   * Férias: último registro da aba Ferias (maior Início Gozo).
   * Licenças: último período da aba Afastamentos.
   */
  function textoFeriasLicencas(ferias, grupos) {
    var consta = [], naoConsta = [];
    if (ferias && ferias.inicio) {
      consta.push('férias' + (ferias.exercicio ? ' (exercício ' + ferias.exercicio + ')' : '') + ' ' + descreverPeriodo(ferias));
    } else naoConsta.push('férias');
    var estudos = ultimoPeriodo(grupos, 'ESTUDO');
    if (estudos) consta.push('licença para estudos ' + descreverPeriodo(estudos));
    else naoConsta.push('licença para estudos');
    var premio = ultimoPeriodo(grupos, 'PREMIO');
    if (premio) consta.push('licença-prêmio ' + descreverPeriodo(premio));
    else naoConsta.push('licença-prêmio');

    var frases = [];
    if (consta.length) frases.push('CONSTA gozo de ' + listaComE(consta, 'e de') + '.');
    if (naoConsta.length) frases.push('NÃO CONSTA gozo de ' + listaComE(naoConsta, 'ou') + '.');
    return frases.join(' ');
  }

  // Datas de uma linha da aba Faltas (a aba vem vazia quando não há registros).
  function datasDaFalta(linha) {
    var chaves = Object.keys(linha).filter(function (k) {
      var n = normalizar(k);
      return n !== 'MATRICULA' && n !== 'NOME';
    });
    var ini = chaves.filter(function (k) { return normalizar(k).indexOf('INICIO') >= 0; })[0];
    var fim = chaves.filter(function (k) { return normalizar(k).indexOf('FIM') >= 0; })[0];
    if (ini && paraData(linha[ini])) {
      var a = paraData(linha[ini]), b = fim ? paraData(linha[fim]) : null;
      return [b && valorData(b) !== valorData(a) ? dataBR(a) + ' a ' + dataBR(b) : dataBR(a)];
    }
    var comData = chaves.filter(function (k) { return normalizar(k).indexOf('DATA') >= 0; });
    var candidatas = comData.length ? comData : chaves;
    return candidatas.map(function (k) {
      var v = linha[k];
      // números só contam como data se estiverem numa faixa plausível de datas do Excel (1954–2064)
      if (typeof v === 'number' && (v < 20000 || v > 60000)) return null;
      var dt = paraData(v);
      return dt ? dataBR(dt) : null;
    }).filter(Boolean);
  }

  /*
   * Informações complementares a partir do modelo (uma linha por item) com os marcadores:
   * {ano}, {faltas}, {estagio}, {ferias_licencas}.
   */
  function informacoesComplementares(modelo, servidor, referencia) {
    var textos = {
      ano: referencia ? String(referencia.a) : '',
      faltas: textoFaltas(servidor && servidor.faltas),
      estagio: textoEstagio(servidor && servidor.admissao, referencia),
      ferias_licencas: textoFeriasLicencas(servidor && servidor.ferias, servidor && servidor.afastamentos)
    };
    return modelo.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      return l.replace(/\{(ano|faltas|estagio|ferias_licencas)\}/g, function (_, k) { return textos[k]; });
    });
  }

  function coluna(linha, nomes) {
    var chaves = Object.keys(linha);
    for (var i = 0; i < nomes.length; i++) {
      var alvo = normalizar(nomes[i]);
      for (var j = 0; j < chaves.length; j++) {
        if (normalizar(chaves[j]) === alvo) return linha[chaves[j]];
      }
    }
    return undefined;
  }

  /*
   * Monta a base a partir das planilhas.
   * indiceLinhas: linhas da aba SERVIDORES do "INDICE CEDIDOS SAD".
   * ficha: { servidores, lotacoes, afastamentos, ferias, faltas } (linhas das abas) do "relFichaCadastralCompleta".
   * orgaosCessao (opcional): prefixos de órgão que indicam cessão (padrão ORGAOS_CESSAO).
   */
  function montarBase(indiceLinhas, ficha, orgaosCessao) {
    var fichaServidores = {};
    (ficha.servidores || []).forEach(function (l) {
      var k = chaveMatricula(coluna(l, ['Matrícula']));
      if (k) fichaServidores[k] = l;
    });

    var lotacoes = {};
    (ficha.lotacoes || []).forEach(function (l) {
      var k = chaveMatricula(coluna(l, ['Matrícula']));
      if (!k) return;
      (lotacoes[k] = lotacoes[k] || []).push({
        orgao: String(coluna(l, ['Órgão (descrição)']) || '').trim(),
        local: String(coluna(l, ['Local de Trabalho (descrição)']) || '').trim(),
        inicio: paraData(coluna(l, ['Início'])),
        fim: paraData(coluna(l, ['Fim']))
      });
    });

    var afastamentos = {};
    (ficha.afastamentos || []).forEach(function (l) {
      var k = chaveMatricula(coluna(l, ['Matrícula']));
      if (!k) return;
      (afastamentos[k] = afastamentos[k] || []).push({
        descricao: String(coluna(l, ['Descrição (descrição)']) || '').trim(),
        inicio: paraData(coluna(l, ['Início'])),
        fim: paraData(coluna(l, ['Fim']))
      });
    });

    var ferias = {};
    (ficha.ferias || []).forEach(function (l) {
      var k = chaveMatricula(coluna(l, ['Matrícula']));
      var registro = {
        exercicio: coluna(l, ['Exercício']),
        inicio: paraData(coluna(l, ['Início Gozo'])),
        fim: paraData(coluna(l, ['Fim Gozo']))
      };
      if (!k || !registro.inicio) return;
      if (!ferias[k] || valorData(registro.inicio) > valorData(ferias[k].inicio)) ferias[k] = registro;
    });

    var faltas = {};
    (ficha.faltas || []).forEach(function (l) {
      var k = chaveMatricula(coluna(l, ['Matrícula']));
      if (!k) return;
      faltas[k] = (faltas[k] || []).concat(datasDaFalta(l));
    });

    return indiceLinhas.map(function (l) {
      var matricula = chaveMatricula(coluna(l, ['nu_matricula']));
      var hist = ordenarLotacoes(lotacoes[matricula] || []);
      var origem = orgaoDeOrigem(hist, orgaosCessao);
      var cadastro = fichaServidores[matricula] || {};
      var statusFuncional = coluna(cadastro, ['Status Funcional']);
      var situacao = coluna(l, ['fl_situacaoAtual']) || coluna(cadastro, ['Situação Funcional']);
      var nivel = coluna(l, ['nm_nivel']);
      var nome = String(coluna(l, ['nm_Funcionario']) || '').trim();

      return {
        nome: nome,
        busca: normalizar(nome),
        matricula: matricula,
        matriculaFormatada: formatarMatricula(matricula),
        cpf: formatarCPF(coluna(l, ['nu_cpfFunc'])),
        admissao: paraData(coluna(l, ['dt_admissao'])),
        nascimento: paraData(coluna(l, ['dt_nascimento'])),
        cargo: String(coluna(l, ['nm_cargo']) || '').trim() + (nivel ? ' - ' + nivel : ''),
        vinculo: normalizar(statusFuncional || 'Estatutário') + ' ' + normalizar(situacao || '') + '/CARGO EFETIVO',
        salario: paraNumero(coluna(l, ['vl_salario'])),
        lotacao: hist.length ? hist[0].local : String(coluna(l, ['nm_localTrabalho']) || '').trim(),
        // Sem órgão anterior no histórico (sempre esteve na Administração): usa o órgão atual e avisa.
        orgaoOrigem: origem ? origem.orgao : (hist.length ? hist[0].orgao : ''),
        origemEncontrada: !!origem,
        origemPeriodo: origem,
        historico: hist,
        afastamentos: agruparAfastamentos(afastamentos[matricula] || []),
        ferias: ferias[matricula] || null,
        faltas: faltas[matricula] || [],
        semFicha: !hist.length
      };
    }).filter(function (s) { return s.nome; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  }

  function buscar(base, termo) {
    var t = normalizar(termo);
    var digitos = soDigitos(termo);
    if (!t) return [];
    return base.filter(function (s) {
      if (s.busca.indexOf(t) >= 0) return true;
      return digitos.length >= 4 && (s.matricula.indexOf(digitos) >= 0 || soDigitos(s.cpf).indexOf(digitos) >= 0);
    });
  }

  var api = {
    ORGAOS_CESSAO: ORGAOS_CESSAO,
    normalizar: normalizar,
    paraData: paraData,
    dataBR: dataBR,
    dataExtenso: dataExtenso,
    tempoEntre: tempoEntre,
    formatarTempo: formatarTempo,
    formatarMatricula: formatarMatricula,
    formatarCPF: formatarCPF,
    formatarMoeda: formatarMoeda,
    valorExtenso: valorExtenso,
    ordenarLotacoes: ordenarLotacoes,
    orgaoDeOrigem: orgaoDeOrigem,
    agruparAfastamentos: agruparAfastamentos,
    formatarAfastamentos: formatarAfastamentos,
    estagioProbatorio: estagioProbatorio,
    textoEstagio: textoEstagio,
    textoFaltas: textoFaltas,
    textoFeriasLicencas: textoFeriasLicencas,
    informacoesComplementares: informacoesComplementares,
    montarBase: montarBase,
    buscar: buscar
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Dados = api;
})(this);
