/*
 * Regras das Portarias da SEGEP: modelos de texto e preenchimento a partir da FichaContabilis.
 * Funções puras (sem tela). Funciona no navegador (window.Portarias) e no Node (testes).
 * Os dados do servidor vêm de Dados.montarBase (js/dados.js); aqui só se monta o texto da Portaria.
 *
 * Marcação nos textos: **trecho** = negrito.
 */
(function (global) {
  'use strict';

  var D = (typeof module !== 'undefined' && module.exports) ? require('./dados.js') : global.Dados;

  // ---------- textos fixos (podem ser ajustados na tela) ----------
  var PADRAO = {
    preambulo: 'O **SECRETÁRIO EXECUTIVO DE GESTÃO DE PESSOAS**, por competência funcional e no uso de suas atribuições ' +
      'legais previstas no Artigo 4º, Parágrafo Único, Inciso I, Alínea “g” da Lei Complementar nº. 50/2024, de 31 de dezembro de 2024.',
    assinanteNome: 'CARLOS EDUARDO DE A. BARROS',
    assinanteCargo: 'Secretário Executivo de Gestão de Pessoas'
  };

  // ---------- nomes: caixa alta sem acento (planilha) -> Capitalizado com acento ----------
  var MINUSCULAS = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'para', 'por', 'com'];
  var SIGLAS = ['EIP', 'SME', 'SMS', 'SAD', 'SEGEP', 'SEGEPE', 'PGM', 'FMS', 'ACS', 'ACE', 'EJA', 'SAMU', 'CRAS', 'CREAS',
    'CEO', 'ESF', 'EMULTI', 'SUAS', 'PROCON', 'SEMOB', 'JARI', 'SEGPPE', 'SEGAFE', 'CVA', 'ETI', 'SEI', 'LTDA'];
  var ROMANOS = /^(I{1,3}|IV|VI{0,3}|IX|X{1,3})$/;
  var ACENTOS = {
    gestao: 'gestão', educacao: 'educação', administracao: 'administração', saude: 'saúde', seguranca: 'segurança',
    assistencia: 'assistência', pedagogica: 'pedagógica', pedagogico: 'pedagógico', politica: 'política', politicas: 'políticas',
    publicas: 'públicas', publica: 'pública', publico: 'público', contratacoes: 'contratações', comunicacao: 'comunicação',
    relacoes: 'relações', regionalizacao: 'regionalização', articulacao: 'articulação', orcamento: 'orçamento',
    captacao: 'captação', qualificacao: 'qualificação', habitacao: 'habitação', regularizacao: 'regularização',
    fundiaria: 'fundiária', conservacao: 'conservação', municipio: 'município', financas: 'finanças', familia: 'família',
    deficiencia: 'deficiência', inovacao: 'inovação', estrategicos: 'estratégicos', estrategico: 'estratégico',
    atencao: 'atenção', vigilancia: 'vigilância', ambulatorio: 'ambulatório', reabilitacao: 'reabilitação',
    farmacia: 'farmácia', laboratorio: 'laboratório', referencia: 'referência', tecnico: 'técnico', tecnica: 'técnica',
    tecnicos: 'técnicos', analise: 'análise', auxiliar: 'auxiliar', comissao: 'comissão', previdencia: 'previdência',
    infraestrutura: 'infraestrutura', fiscalizacao: 'fiscalização', tributaria: 'tributária', juridica: 'jurídica',
    juridico: 'jurídico', assessoria: 'assessoria', supervisao: 'supervisão', coordenacao: 'coordenação',
    direcao: 'direção', secretario: 'secretário', ouvidoria: 'ouvidoria', codigo: 'código', economico: 'econômico',
    economica: 'econômica', desenvolvimento: 'desenvolvimento', cidada: 'cidadã', cidadania: 'cidadania',
    cultura: 'cultura', esportes: 'esportes', saneamento: 'saneamento', mobilidade: 'mobilidade',
    pessoas: 'pessoas', nucleo: 'núcleo', centro: 'centro', professora: 'professora', professor: 'professor',
    programa: 'programa', odontologo: 'odontólogo', medico: 'médico', psicologo: 'psicólogo', engenheiro: 'engenheiro',
    agente: 'agente', combate: 'combate', endemias: 'endemias', comunitario: 'comunitário', comunitaria: 'comunitária',
    apoio: 'apoio', sup: 'sup', ensino: 'ensino', infantil: 'infantil', fundamental: 'fundamental', pedagogo: 'pedagogo'
  };

  // "SECRETARIA EXECUTIVA DE GESTAO PEDAGOGICA" -> "Secretaria Executiva de Gestão Pedagógica"
  function capitalizar(texto) {
    return String(texto == null ? '' : texto).trim().replace(/\s+/g, ' ')
      .split(/([\s\-\/()]+)/).map(function (parte, i) {
        if (i % 2 === 1 || !parte) return parte;
        var maiuscula = parte.toUpperCase();
        if (SIGLAS.indexOf(maiuscula) >= 0 || ROMANOS.test(maiuscula) || /\d/.test(parte)) return maiuscula;
        var minuscula = parte.toLowerCase();
        var acentuada = ACENTOS[D.normalizar(minuscula).toLowerCase()] || minuscula;
        if (i > 0 && MINUSCULAS.indexOf(minuscula) >= 0) return acentuada;
        return acentuada.charAt(0).toUpperCase() + acentuada.slice(1);
      }).join('');
  }

  // ---------- secretaria do servidor ----------
  // O código do centro de custo (cd_centroCusto) começa com 2 dígitos que identificam a secretaria
  // (ex.: 15… = Educação, 16… = Saúde). O nome da secretaria é o do centro de custo "SECRETARIA MUNICIPAL…"
  // (ou, se não houver, o de final 002) com o mesmo início, na própria planilha.
  function mapaSecretarias(base) {
    var principal = {}, reserva = {};
    base.forEach(function (s) {
      var cod = s.codCentroCusto || '';
      if (cod.length < 2 || !s.centroCusto) return;
      var prefixo = cod.slice(0, 2);
      var nome = s.centroCusto.replace(/^FMS\s*-\s*/i, '').trim();
      if (/^SECRETARIA MUNICIPAL/.test(D.normalizar(nome))) {
        if (!principal[prefixo]) principal[prefixo] = nome;
      } else if (/002$/.test(cod.slice(0, 6)) && !reserva[prefixo]) {
        reserva[prefixo] = nome;
      }
    });
    var mapa = {};
    Object.keys(reserva).concat(Object.keys(principal)).forEach(function (p) { mapa[p] = principal[p] || reserva[p]; });
    return mapa;
  }

  function secretariaDoServidor(s, mapa) {
    var cod = (s && s.codCentroCusto) || '';
    var nome = (mapa && cod.length >= 2 && mapa[cod.slice(0, 2)]) || (s && (s.centroCusto || s.localTrabalho)) || '';
    return capitalizar(nome);
  }

  function ehCedido(s) {
    return !!(s && /CEDIDOS/.test(D.normalizar(s.centroCusto)));
  }

  // "na Secretaria Municipal de Educação", "no Gabinete do Prefeito"
  function locativo(nome) {
    return (/^(gabinete|n[uú]cleo|conselho|escrit[oó]rio)/i.test(nome) ? 'no ' : 'na ') + nome;
  }

  // "Municipal de Educação" (coluna "Secretaria de Origem" das tabelas)
  function semPalavraSecretaria(nome) {
    return String(nome || '').replace(/^Secretaria\s+/i, '');
  }

  // ---------- formatos ----------
  var FORMATOS_MATRICULA = [
    { id: 'nove', rotulo: '009133641 (9 dígitos)' },
    { id: 'pontos', rotulo: '0.0913364.1' },
    { id: 'oficial', rotulo: '9.133-6.4 (padrão do Requerimento)' }
  ];

  function formatarMatricula(valor, formato) {
    var d = D.soDigitos(valor);
    if (!d) return '';
    d = d.padStart(9, '0');
    if (formato === 'pontos') return d.charAt(0) + '.' + d.slice(1, 8) + '.' + d.charAt(8);
    if (formato === 'oficial') return D.formatarMatricula(d);
    return d;
  }

  function dataPontos(dt) {
    return dt ? D.dataBR(dt).replace(/\//g, '.') : '';
  }

  function tituloPortaria(numero, dt) {
    return 'PORTARIA Nº ' + (numero ? numero + '/' + dt.a : '___/' + dt.a) + ', DE ' + D.dataExtenso(dt).toUpperCase() + '.';
  }

  function dias(n) {
    n = parseInt(n, 10);
    return isNaN(n) ? '' : n + ' (' + D.inteiroExtenso(n) + ') dias';
  }

  // Palavras no gênero do(s) servidor(es). sexo: 'F' = feminino (qualquer outro valor = masculino).
  // Vários servidores: feminino só se todos forem mulheres.
  function genero(sexo, plural) {
    var f = sexo === 'F', s = plural ? 's' : '';
    return {
      servidor: f ? 'servidora' + s : (plural ? 'servidores' : 'servidor'),
      o: (f ? 'a' : 'o') + s, a_: f ? (plural ? 'às' : 'à') : (plural ? 'aos' : 'ao'),
      da: (f ? 'da' : 'do') + s, do_: plural ? (f ? 'das' : 'dos') : (f ? 'da' : 'do'),
      pelo: plural ? (f ? 'pelas' : 'pelos') : (f ? 'pela' : 'pelo'),
      lotado: (f ? 'lotada' : 'lotado') + s, discriminado: (f ? 'discriminada' : 'discriminado') + s
    };
  }

  // Valor sugerido de um campo (padrao pode ser função de { secretaria, secretarias, n }).
  function valorPadrao(campo, servidores) {
    if (campo.padrao == null) return '';
    if (typeof campo.padrao !== 'function') return campo.padrao;
    var secretarias = [];
    servidores.forEach(function (s) { if (s.secretaria && secretarias.indexOf(s.secretaria) < 0) secretarias.push(s.secretaria); });
    return campo.padrao({ secretaria: secretarias[0] || '', secretarias: secretarias, n: servidores.length });
  }

  function dedupe(lista) {
    return lista.filter(function (x, i) { return lista.indexOf(x) === i; });
  }

  // ---------- modelos ----------
  // campos: o que a pessoa preenche além do servidor. porServidor = um valor para cada servidor da portaria.
  // gerar(c): c.n = nº de servidores; c.servs[i] = { nome, matricula, cargo, secretaria, g, v(id), tem(id) } (por servidor);
  //   c.g = palavras no gênero de todos; c.v(id) = campo comum (ou "[rótulo]" se faltar); c.tem(id); c.marcado(id).
  // Com vários servidores, os modelos individuais (exoneração, readaptação) repetem o artigo de cada servidor.

  // ---------- peças reaproveitadas pelos modelos ----------
  function retroInline(c, x) {
    return c.n > 1 && x.tem('efeitos') ? ', retroagindo seus efeitos a ' + x.v('efeitos') : '';
  }

  // Último artigo: vigência na publicação (com retroação se houver um só servidor e a data foi informada).
  function artigoVigencia(c, numero) {
    return { t: 'p', texto: '**Art. ' + numero + 'º.** Esta portaria entra em vigor na data da sua publicação' +
      (c.n === 1 && c.servs[0].tem('efeitos') ? ', retroagindo seus efeitos a ' + c.servs[0].v('efeitos') : '') + '.' };
  }

  var CAMPO_EFEITOS = { id: 'efeitos', rotulo: 'Retroagir efeitos a (opcional)', tipo: 'data', opcional: true, porServidor: true };

  /*
   * Ato individual: considerandos + RESOLVE + um artigo para cada servidor + artigos extras + vigência.
   * o: id, nome, grupo, campos, unico (só o 1º servidor), considerandos(c) -> [texto], artigo(x, c) -> texto
   * (sem "Art. N"), extras(c) -> [texto] (artigos depois dos servidores), semVigencia (os extras já cobrem).
   */
  function atoIndividual(o) {
    return {
      id: o.id, nome: o.nome, grupo: o.grupo, unico: !!o.unico, campos: o.campos,
      gerar: function (c) {
        var blocos = o.considerandos(c).map(function (t) { return { t: 'p', texto: t }; });
        blocos.push({ t: 'p', texto: '**RESOLVE:**' });
        var n = 0;
        function artigo(texto) {
          n++;
          // o verbo em negrito entra no mesmo trecho do "Art. N."
          blocos.push({ t: 'p', texto: texto.indexOf('**') === 0 ? '**Art. ' + n + 'º. ' + texto.slice(2) : '**Art. ' + n + 'º.** ' + texto });
        }
        c.servs.forEach(function (x) { var t = o.artigo(x, c); if (t) artigo(t); });
        (o.extras ? o.extras(c) : []).forEach(artigo);
        if (!o.semVigencia) blocos.push(artigoVigencia(c, n + 1));
        return blocos;
      }
    };
  }

  // "Considerando a solicitação do servidor [NOME] através do <doc> nº X, datado de D." (nome só com vários servidores)
  function solicitacao(c, x, doc) {
    return 'Considerando a solicitação ' + x.g.da + ' ' + x.g.servidor + (c.n === 1 ? '' : ' **' + x.nome + '**') +
      ' através do ' + doc + ' nº ' + x.v('requerimento') + ', datado de ' + x.v('dataRequerimento') + '.';
  }

  // "dd/mm/aaaa a dd/mm/aaaa" a partir dos campos início e fim do período de gozo.
  function periodoGozo(x, obrigatorio) {
    var ini = x.bruto('periodoIni'), fim = x.bruto('periodoFim');
    if (!ini && !fim && !obrigatorio) return '';
    return (ini ? D.dataBR(ini) : x.v('periodoIni', true)) + ' a ' + (fim ? D.dataBR(fim) : x.v('periodoFim', true));
  }

  var CAMPOS_REQUERIMENTO = [
    { id: 'requerimento', rotulo: 'Nº do requerimento', tipo: 'texto', exemplo: '26.17.000004682-4', porServidor: true },
    { id: 'dataRequerimento', rotulo: 'Data do requerimento', tipo: 'data', porServidor: true }
  ];

  /*
   * Portaria sobre um pedido, com tabela (licença, dispensa, abono…): deferida ou indeferida, conforme a caixa
   * "Indeferida". O texto é o mesmo; muda o verbo. Sem pedidoFixo, o pedido é digitado.
   * opts: colunaSecretaria ('Secretaria de Origem'), colunaNome ('Nome do Servidor'), dataRequerimento (coluna extra),
   *   deferido ('adotando' | 'de acordo' | 'nenhum': como o deferimento cita o fundamento), sufixoServidor (false = o artigo
   *   termina em ":"), fundamentoPadrao (texto fixo; null = sem sugestão), retroRequerimento, efeitos (data opcional).
   */
  function pedidoSobre(id, nome, pedidoFixo, opts) {
    opts = Object.assign({ colunaSecretaria: 'Secretaria de Origem', colunaNome: 'Nome do Servidor', deferido: 'adotando',
      sufixoServidor: true, grupo: 'Outros pedidos' }, opts || {});
    var campos = [{ id: 'indeferido', rotulo: 'Indeferida', tipo: 'caixa', abaixoDoTipo: true,
      ajuda: 'desmarcado = deferida (concedida)' }];
    campos.push({ id: 'processo', rotulo: 'Nº do processo', tipo: 'texto', exemplo: '26.17.000003900-3', porServidor: true });
    if (opts.dataRequerimento) campos.push({ id: 'dataReq', rotulo: 'Data do requerimento', tipo: 'data', porServidor: true });
    if (!pedidoFixo) campos.push({ id: 'pedido', rotulo: 'Pedido', tipo: 'texto', exemplo: 'Licença para Curso' });
    var fundamento = { id: 'fundamento', rotulo: 'Fundamentos adotados', tipo: 'texto',
      ajuda: 'ex.: parecer nº 123/2026 da Gerência de Política de Pessoal; com vários servidores, no plural' };
    if (opts.fundamentoPadrao) fundamento.padrao = opts.fundamentoPadrao;
    else if (opts.fundamentoPadrao !== null) {
      fundamento.padrao = function (x) {
        if (x.n > 1) return x.secretarias.length === 1 ? 'despachos d' + locativo(x.secretaria).replace(/^n/, '') : 'despachos das respectivas secretarias';
        return 'despacho d' + locativo(x.secretaria).replace(/^n/, '');
      };
    } else fundamento.exemplo = 'parecer nº 123/2026 da Gerência de Política de Pessoal';
    campos.push(fundamento);
    if (opts.efeitos) campos.push({ id: 'efeitos', rotulo: 'Retroagir efeitos a (opcional)', tipo: 'data', opcional: true });
    campos.push(
      { id: 'decenio', rotulo: 'Decênio (opcional)', tipo: 'texto', opcional: true, exemplo: '2013/2023', ajuda: 'cria a coluna Decênio', porServidor: true },
      { id: 'periodoIni', rotulo: 'Período de gozo: início', tipo: 'data', opcional: true, ajuda: 'opcional; cria a coluna Período de Gozo', porServidor: true },
      { id: 'periodoFim', rotulo: 'Período de gozo: fim', tipo: 'data', opcional: true, porServidor: true });
    if (opts.semDecenio) {
      campos = campos.filter(function (x) { return ['decenio', 'periodoIni', 'periodoFim'].indexOf(x.id) < 0; });
    }
    return {
      id: id,
      nome: nome,
      grupo: opts.grupo,
      campos: campos,
      gerar: function (c) {
        var plural = c.n > 1, indeferir = c.marcado('indeferido');
        var colunas = ['Nº Processo', opts.colunaNome, 'Matrícula', opts.colunaSecretaria];
        if (opts.dataRequerimento) colunas.push('Data do Requerimento');
        var temDecenio = !opts.semDecenio && c.servs.some(function (x) { return x.tem('decenio'); });
        var temPeriodo = !opts.semDecenio && c.servs.some(function (x) { return x.tem('periodoIni') || x.tem('periodoFim'); });
        if (temDecenio) colunas.push('Decênio');
        if (temPeriodo) colunas.push('Período de Gozo');
        var linhas = c.servs.map(function (x) {
          var l = [x.v('processo'), x.nome, x.matricula, semPalavraSecretaria(x.secretaria)];
          if (opts.dataRequerimento) l.push(x.v('dataReq'));
          if (temDecenio) l.push(x.tem('decenio') ? x.v('decenio') : '');
          if (temPeriodo) l.push(periodoGozo(x, false));
          return l;
        });
        var objeto = (plural ? 'os pedidos' : 'o pedido') + ' de **' + (pedidoFixo || c.v('pedido')) + '**';
        var fim = opts.sufixoServidor ? ', ' + c.g.do_ + ' ' + c.g.servidor + ' abaixo:' : ':';
        var fundamentos;
        if (indeferir || opts.deferido === 'adotando') {
          fundamentos = ', adotando integralmente os fundamentos elencados ' + (plural ? 'nos ' : 'no ') + c.v('fundamento');
        } else if (opts.deferido === 'de acordo') {
          fundamentos = ', de acordo com o ' + c.v('fundamento');
        } else fundamentos = '';
        var vigencia = 'Esta Portaria entra em vigor a partir da data de sua publicação';
        if (!indeferir && opts.retroRequerimento) vigencia += ', retroagindo seus efeitos à data do requerimento';
        else if (opts.efeitos && c.tem('efeitos')) vigencia += ', retroagindo seus efeitos a ' + c.v('efeitos');
        return [
          { t: 'p', texto: '**CONSIDERANDO** a existência ' + (plural ? 'dos requerimentos individuais formulados ' : 'do requerimento individual formulado ') +
            c.g.pelo + ' ' + c.g.servidor + ' abaixo ' + c.g.discriminado + '.' },
          { t: 'p', texto: '**RESOLVE:**' },
          { t: 'p', texto: '**Art. 1º. ' + (indeferir ? 'INDEFERIR' : 'DEFERIR') + '** ' + objeto + fundamentos + fim },
          { t: 'tabela', colunas: colunas, linhas: linhas, semQuebra: [0, 2] },
          { t: 'p', texto: '**Art. 2º.** ' + vigencia + '.' }
        ];
      }
    };
  }

  // Licença prêmio: sem marcar "Indeferida", é a concessão de gozo (tabela com decênio e período, Portaria 522);
  // marcada, é o indeferimento no modelo geral de pedido.
  function licencaPremio() {
    var geral = pedidoSobre('licenca-premio', 'Licença Prêmio (concessão de gozo ou indeferimento)', 'Licença Prêmio', { grupo: 'Licenças e afastamentos' });
    return {
      id: geral.id, nome: geral.nome, grupo: geral.grupo,
      campos: geral.campos.filter(function (x) { return x.id !== 'fundamento'; }).map(function (x) {
        // na concessão o decênio e o período são obrigatórios (na tabela do indeferimento, opcionais)
        if (x.id === 'decenio') return Object.assign({}, x, { rotulo: 'Decênio', ajuda: 'obrigatório na concessão' });
        if (x.id === 'periodoIni') return Object.assign({}, x, { rotulo: 'Período de gozo: início', ajuda: 'obrigatório na concessão' });
        if (x.id === 'periodoFim') return Object.assign({}, x, { rotulo: 'Período de gozo: fim' });
        return x;
      }).concat([
        { id: 'fundamento', rotulo: 'Fundamentos adotados (só se indeferida)', tipo: 'texto', opcional: true,
          padrao: function (x) { return x.n > 1 ? 'despachos das respectivas secretarias' : 'despacho d' + locativo(x.secretaria).replace(/^n/, ''); } }]),
      gerar: function (c) {
        if (c.marcado('indeferido')) return geral.gerar(c);
        var plural = c.n > 1;
        return [
          { t: 'p', texto: '**CONSIDERANDO** a existência ' + (plural ? 'dos requerimentos individuais formulados ' : 'do requerimento individual formulado ') +
            c.g.pelo + ' ' + c.g.servidor + ' abaixo ' + c.g.discriminado + '.' },
          { t: 'p', texto: '**RESOLVE:**' },
          { t: 'p', texto: '**Art. 1º. CONCEDER** o gozo de licença prêmio, de acordo com as Informações funcionais emitida pela Unidade de Gestão de ' +
            'Pessoas - UGEP, ' + c.g.a_ + ' ' + c.g.servidor + ' relacionad' + (c.g.o.charAt(0) === 'a' ? 'a' : 'o') + (plural ? 's' : '') +
            ' abaixo, ' + (plural ? 'nos períodos especificados' : 'no período especificado') + ':' },
          { t: 'tabela', colunas: ['Nº Processo', 'Nome do Servidor', 'Matrícula', 'Secretaria de Origem', 'Decênio', 'Período de Gozo'],
            linhas: c.servs.map(function (x) {
              return [x.v('processo'), x.nome, x.matricula, semPalavraSecretaria(x.secretaria), x.v('decenio', true), periodoGozo(x, true)];
            }), semQuebra: [0, 2] },
          { t: 'p', texto: '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação.' }
        ];
      }
    };
  }

  // Funções gratificadas (FGS) e de apoio e supervisão (FAS): portaria coletiva, com artigos de dispensa e de
  // concessão (Portarias 498 e 499). Cada servidor escolhe Conceder ou Dispensar; sai um artigo e uma tabela para cada ação.
  var LEI_FUNCOES = 'art. 28 da Lei Complementar nº 50/2024, alterada pela Lei Complementar nº 51/2025';
  var PREAMBULO_FUNCOES = 'O **SECRETÁRIO EXECUTIVO DE GESTÃO DE PESSOAS**, no uso de suas atribuições legais concedidas pelo ' + LEI_FUNCOES + '.';

  // o: id, nome, sigla ('FGS'), sing, plur (nome da função no singular e no plural), plurais (usa o plural com vários servidores),
  // simbolos (alternativas do campo Tipo)
  function funcaoGratificada(o) {
    return {
      id: o.id, nome: o.nome, grupo: 'Funções gratificadas', preambulo: PREAMBULO_FUNCOES,
      campos: [
        { id: 'ci', rotulo: 'CI (nº)', tipo: 'texto', exemplo: '0861336-SAD-GAB/SAD-SEGEP' },
        { id: 'baseLegal', rotulo: 'Lei citada', tipo: 'texto', padrao: LEI_FUNCOES },
        { id: 'acao', rotulo: 'Ação', tipo: 'selecao', opcoes: [['conceder', 'Conceder'], ['dispensar', 'Dispensar']], padrao: 'conceder', porServidor: true },
        { id: 'simbolo', rotulo: 'Tipo (símbolo)', tipo: 'selecao', porServidor: true,
          opcoes: [['', 'Escolha…']].concat(o.simbolos.map(function (x) { return [x, x]; })) },
        { id: 'efeito', rotulo: 'Efeito retroativo a', tipo: 'data', porServidor: true },
        { id: 'lotacao', rotulo: 'Lotação (se diferente da secretaria)', tipo: 'texto', opcional: true, exemplo: 'Executiva da Receita', porServidor: true }
      ],
      gerar: function (c) {
        var blocos = [
          { t: 'p', texto: '**CONSIDERANDO** os termos da CI nº ' + c.v('ci') + ';' },
          { t: 'p', texto: '**CONSIDERANDO** que ' + 'as ' + o.plur + ' obedecem a símbolos, valores e quantitativos de acordo com o ' +
            c.v('baseLegal') + '.' },
          { t: 'p', texto: '**RESOLVE:**' }];
        var n = 0;
        ['dispensar', 'conceder'].forEach(function (acao) {
          var grupo = c.servs.filter(function (x) { return x.v('acao') === acao; });
          if (!grupo.length) return;
          n++;
          var plural = grupo.length > 1;
          var fem = grupo.every(function (x) { return x.g.o === 'a'; });
          var listados = (fem ? 'servidora' + (plural ? 's' : '') : 'servidor' + (plural ? 'es' : '')) + ' listad' + (fem ? 'a' : 'o') + (plural ? 's' : '') + ' abaixo';
          var funcao = o.plurais && plural ? o.plur : o.sing;
          var texto;
          if (acao === 'dispensar') {
            texto = '**Art. ' + n + 'º DISPENSAR** ' + (fem ? 'a' : 'o') + (plural ? 's' : '') + ' ' + listados + ' d' + (o.plurais && plural ? 'as ' : 'a ') + funcao + ':';
          } else {
            texto = '**Art. ' + n + 'º CONCEDER** ' + (fem ? (plural ? 'às' : 'à') : (plural ? 'aos' : 'ao')) + ' ' + listados + ' ' + funcao + ' nos moldes a seguir:';
          }
          blocos.push({ t: 'p', texto: texto });
          blocos.push({ t: 'tabela', colunas: ['MATRÍCULA', 'NOME', 'LOTAÇÃO', 'EFEITO RETROATIVO A', 'TIPO'], esquerda: [1], semQuebra: [0, 3, 4],
            linhas: grupo.map(function (x) {
              return [x.matricula, x.nome, x.tem('lotacao') ? x.v('lotacao') : semPalavraSecretaria(x.secretaria), x.v('efeito'), x.v('simbolo')];
            }) });
        });
        blocos.push({ t: 'p', texto: '**Art. ' + (n + 1) + 'º** Esta Portaria entra em vigor na data da sua publicação.' });
        return blocos;
      }
    };
  }

  // ---------- modelos ----------
  var TIPOS = [
    licencaPremio(),
    pedidoSobre('licenca-sem-vencimentos', 'Licença sem Vencimentos', 'Licença sem Vencimentos', { grupo: 'Licenças e afastamentos' }),
    pedidoSobre('licenca-curso', 'Licença para Curso', 'Licença para Curso', { grupo: 'Licenças e afastamentos' }),
    atoIndividual({
      id: 'licenca-doenca-familia', nome: 'Licença por doença em pessoa da família', grupo: 'Licenças e afastamentos',
      campos: [
        { id: 'dias', rotulo: 'Período (dias)', tipo: 'numero', padrao: '30', porServidor: true },
        { id: 'baseLegal', rotulo: 'Fundamento legal', tipo: 'texto', padrao: 'art. 91, §2º, inciso I, da Lei nº 224/96' },
        CAMPO_EFEITOS],
      considerandos: function (c) {
        return ['**CONSIDERANDO** a existência ' + (c.n > 1 ? 'dos requerimentos individuais formulados ' : 'do requerimento individual formulado ') +
          c.g.pelo + ' ' + c.g.servidor + ' abaixo ' + c.g.discriminado + '.'];
      },
      artigo: function (x, c) {
        return '**CONCEDER** ' + x.g.a_ + ' ' + x.g.servidor + ' **' + x.nome + '**, matrícula ' + x.matricula + ', ' + x.cargo + ', ' + x.g.lotado + ' ' +
          locativo(x.secretaria) + ', Licença por Motivo de Doença em Pessoa da Família, pelo período de ' + dias(x.v('dias')) +
          ', nos termos do ' + c.v('baseLegal') + retroInline(c, x) + '.';
      }
    }),
    atoIndividual({
      id: 'retorno-licenca-curso', nome: 'Retorno de licença para curso', grupo: 'Licenças e afastamentos',
      campos: CAMPOS_REQUERIMENTO.concat([CAMPO_EFEITOS]),
      considerandos: function (c) { return c.servs.map(function (x) { return solicitacao(c, x, 'requerimento pessoal'); }); },
      artigo: function (x, c) {
        return '**RETORNAR** da Licença para Curso, ' + x.g.o + ' ' + x.g.servidor + ' **' + x.nome + '**, matrícula nº ' + x.matricula + ' Cargo ' +
          x.cargo + ', ' + x.g.lotado + ' ' + locativo(x.secretaria) + retroInline(c, x) + '.';
      }
    }),
    atoIndividual({
      id: 'prorrogacao-pos', nome: 'Prorrogação de licença para pós-graduação', grupo: 'Licenças e afastamentos', unico: true,
      campos: [
        { id: 'requerimento', rotulo: 'Nº do requerimento (protocolo)', tipo: 'texto', exemplo: '26.17.000001234-5' },
        { id: 'parecer', rotulo: 'Parecer Jurídico (nº/ano)', tipo: 'texto', exemplo: '123/2026' },
        { id: 'dataParecer', rotulo: 'Data do parecer', tipo: 'data' },
        { id: 'baseLegal', rotulo: 'Leis citadas', tipo: 'texto',
          padrao: 'art. 133, § 1º, da Lei Municipal nº 224/96, na Lei Municipal nº 228/96 e na Lei nº 264/2008' },
        { id: 'curso', rotulo: 'Curso', tipo: 'texto', exemplo: 'Mestrado', opcoes: ['Mestrado', 'Doutorado'] },
        { id: 'programa', rotulo: 'Programa', tipo: 'texto', exemplo: 'Educação' },
        { id: 'instituicao', rotulo: 'Instituição', tipo: 'texto', exemplo: 'Universidade Federal de Pernambuco' },
        { id: 'inicio', rotulo: 'Prorrogação a partir de', tipo: 'data' },
        { id: 'fim', rotulo: 'Prorrogação até', tipo: 'data' }],
      considerandos: function (c) {
        return ['**CONSIDERANDO** o requerimento ' + c.servs[0].g.da + ' ' + c.servs[0].g.servidor + ' protocolado sob o nº ' + c.v('requerimento') + ';',
          '**CONSIDERANDO** o Parecer Jurídico nº ' + c.v('parecer') + ', de ' + c.v('dataParecer') + ';',
          '**CONSIDERANDO** o disposto no ' + c.v('baseLegal') + ';'];
      },
      artigo: function (x, c) {
        return '**CONCEDER** ' + x.g.a_ + ' ' + x.g.servidor + ' **' + x.nome + '**, matrícula ' + x.matricula + ', ' + x.cargo + ', ' + x.g.lotado + ' ' +
          locativo(x.secretaria) + ', Prorrogação de Licença para Curso de Pós-Graduação (' + c.v('curso') + ' em ' + c.v('programa') + '), na ' +
          c.v('instituicao') + ', sem prejuízo de vencimentos.';
      },
      extras: function (c) { return ['A prorrogação vigorará de ' + c.v('inicio') + ' a ' + c.v('fim') + '.', 'Publique-se e cumpra-se.']; },
      semVigencia: true
    }),
    atoIndividual({
      id: 'readaptacao', nome: 'Readaptação de função (temporária ou definitiva)', grupo: 'Saúde e condições de trabalho',
      campos: [
        { id: 'definitiva', rotulo: 'Definitiva', tipo: 'caixa', abaixoDoTipo: true, ajuda: 'desmarcado = temporária' },
        { id: 'oficio', rotulo: 'Ofício da Junta Médica', tipo: 'texto', exemplo: 'GPM nº 134/2026', porServidor: true },
        { id: 'dias', rotulo: 'Período em dias (só se temporária)', tipo: 'numero', padrao: '180', porServidor: true, opcional: true },
        { id: 'baseLegal', rotulo: 'Fundamento legal', tipo: 'texto', padrao: 'art. 51 da Lei 224/96' },
        CAMPO_EFEITOS],
      considerandos: function (c) {
        var oficios = dedupe(c.servs.map(function (x) { return x.v('oficio'); }));
        if (oficios.length === 1) return ['**CONSIDERANDO** o Parecer da Junta Médica Municipal conforme Ofício ' + oficios[0] + '.'];
        return c.servs.map(function (x) {
          return '**CONSIDERANDO** o Parecer da Junta Médica Municipal conforme Ofício ' + x.v('oficio') + ', referente ' + x.g.a_ + ' ' + x.g.servidor + ' ' + x.nome + '.';
        });
      },
      artigo: function (x, c) {
        var regime = c.marcado('definitiva') ? '**CONCEDER** definitivamente **Readaptação de Função**,'
          : '**CONCEDER** temporariamente **Readaptação de Função**, pelo período de **' + dias(x.v('dias', true)) + '**,';
        return regime + ' ' + x.g.a_ + ' ' + x.g.servidor + ' **' + x.nome + '**, mat. ' + x.matricula + ' ' + x.g.lotado + ' ' + locativo(x.secretaria) +
          ', no cargo de ' + x.cargo + ', para desempenhar suas atividades em áreas administrativas, nos termos do ' + c.v('baseLegal') + retroInline(c, x) + '.';
      }
    }),
    pedidoSobre('reducao-ch', 'Redução de carga horária', 'Redução de Carga Horária', { grupo: 'Saúde e condições de trabalho',
      colunaSecretaria: 'Secretaria', colunaNome: 'Nome', dataRequerimento: true, sufixoServidor: false, fundamentoPadrao: null,
      efeitos: true, semDecenio: true }),
    atoIndividual({
      id: 'exoneracao', nome: 'Exoneração a pedido', grupo: 'Vínculo, lotação e carreira',
      campos: CAMPOS_REQUERIMENTO.concat([
        { id: 'tipoCargo', rotulo: 'Tipo do cargo', tipo: 'texto', padrao: 'efetivo', ajuda: 'efetivo, em comissão…' },
        { id: 'baseLegal', rotulo: 'Fundamento legal', tipo: 'texto', padrao: 'art. 54, inciso I, da Lei 224/96' },
        CAMPO_EFEITOS]),
      considerandos: function (c) { return c.servs.map(function (x) { return solicitacao(c, x, 'requerimento'); }); },
      artigo: function (x, c) {
        return '**EXONERAR** a pedido ' + x.g.o + ' ' + x.g.servidor + ' **' + x.nome + '**, matrícula nº **' + x.matricula + '**, do Cargo ' +
          c.v('tipoCargo') + ' de ' + x.cargo + ', ' + x.g.lotado + ' ' + locativo(x.secretaria) + ', de acordo com o ' + c.v('baseLegal') + retroInline(c, x) + '.';
      }
    }),
    atoIndividual({
      id: 'encerramento-cessao', nome: 'Encerramento de cessão', grupo: 'Vínculo, lotação e carreira', unico: true,
      campos: [
        { id: 'portariaCessao', rotulo: 'Portaria que autorizou a cessão (nº/ano)', tipo: 'texto', exemplo: '1234/2026' },
        { id: 'dataPortariaCessao', rotulo: 'Data dessa portaria', tipo: 'data' },
        { id: 'oficio', rotulo: 'Ofício do órgão cessionário (nº/ano)', tipo: 'texto', exemplo: '123/2026' },
        { id: 'dataOficio', rotulo: 'Data do ofício', tipo: 'data' },
        { id: 'orgao', rotulo: 'Órgão cessionário', tipo: 'texto', exemplo: 'Tribunal de Justiça de Pernambuco' },
        { id: 'dataEncerramento', rotulo: 'Cessão encerrada em', tipo: 'data' },
        { id: 'dataRetorno', rotulo: 'Retorna a partir de', tipo: 'data' },
        { id: 'lotacao', rotulo: 'Fica lotado em', tipo: 'texto', padrao: function (x) { return x.secretaria; } },
        { id: 'baseLegal', rotulo: 'Decreto citado', tipo: 'texto', padrao: 'Decreto Municipal nº 051/2019' },
        { id: 'efeitos', rotulo: 'Retroagir efeitos a', tipo: 'data' }],
      considerandos: function (c) {
        return ['**CONSIDERANDO** o disposto no ' + c.v('baseLegal') + ';',
          '**CONSIDERANDO** a Portaria nº ' + c.v('portariaCessao') + ' – SEGEP, de ' + c.v('dataPortariaCessao') + ', que autorizou a cessão;',
          '**CONSIDERANDO** o Ofício nº ' + c.v('oficio') + ' do ' + c.v('orgao') + ', de ' + c.v('dataOficio') + ';'];
      },
      artigo: function (x, c) {
        return '**ENCERRAR**, em ' + c.v('dataEncerramento') + ', a cessão ' + x.g.da + ' ' + x.g.servidor + ' **' + x.nome + '**, matrícula ' +
          x.matricula + ', cedid' + (x.g.o === 'a' ? 'a' : 'o') + ' ao ' + c.v('orgao') + '.';
      },
      extras: function (c) {
        var x = c.servs[0];
        return [(x.g.o === 'a' ? 'A servidora retorna' : 'O servidor retorna') + ' a partir de ' + c.v('dataRetorno') + ', ficando ' +
          x.g.lotado + ' na ' + c.v('lotacao') + '.',
          'Esta portaria entra em vigor na data da publicação, retroagindo seus efeitos a ' + c.v('efeitos') + '.'];
      },
      semVigencia: true
    }),
    atoIndividual({
      id: 'enquadramento', nome: 'Enquadramento (cargo, classe, nível e referência)', grupo: 'Vínculo, lotação e carreira', unico: true,
      campos: [
        { id: 'processo', rotulo: 'Nº do processo', tipo: 'texto', exemplo: '26.17.000001234-5' },
        { id: 'despacho', rotulo: 'Despacho da', tipo: 'texto', padrao: function (x) { return x.secretaria; } },
        { id: 'classe', rotulo: 'Classe', tipo: 'texto', exemplo: 'B' },
        { id: 'nivel', rotulo: 'Nível', tipo: 'texto', exemplo: 'II' },
        { id: 'referencia', rotulo: 'Referência', tipo: 'texto', exemplo: '3' },
        CAMPO_EFEITOS],
      considerandos: function (c) {
        return ['**CONSIDERANDO** o processo ' + c.servs[0].g.da + ' ' + c.servs[0].g.servidor + ' protocolado sob nº ' + c.v('processo') + ';',
          '**CONSIDERANDO** o despacho d' + locativo(c.v('despacho')).replace(/^n/, '') + ';'];
      },
      artigo: function (x, c) {
        return '**ENQUADRAR** ' + x.g.o + ' ' + x.g.servidor + ' **' + x.nome + '** matrícula ' + x.matricula + ', no cargo de ' + x.cargo +
          ' classe ' + x.v('classe') + ' nível ' + x.v('nivel') + ' referência ' + x.v('referencia') + '.';
      }
    }),
    pedidoSobre('dispensa-estagio', 'Dispensa de Estágio Probatório', 'Dispensa de Estágio Probatório', { grupo: 'Vínculo, lotação e carreira' }),
    pedidoSobre('abono-permanencia', 'Abono de permanência', 'Abono de Permanência', { grupo: 'Benefícios e pedidos',
      colunaSecretaria: 'Secretaria', colunaNome: 'Nome', dataRequerimento: true, deferido: 'de acordo', fundamentoPadrao: null,
      retroRequerimento: true, semDecenio: true }),
    pedidoSobre('salario-familia', 'Salário família', 'Salário Família', { grupo: 'Benefícios e pedidos',
      colunaSecretaria: 'Secretaria', colunaNome: 'Nome', dataRequerimento: true, deferido: 'nenhum', sufixoServidor: false,
      fundamentoPadrao: 'despacho da Secretaria Executiva de Gestão de Pessoas', semDecenio: true }),
    funcaoGratificada({ id: 'fgs', nome: 'Função Gratificada – FGS (conceder / dispensar)', sigla: 'FGS',
      sing: 'Função Gratificada – FGS', plur: 'Funções Gratificadas – FGS', plurais: false,
      simbolos: ['FGS-1', 'FGS-2', 'FGS-3', 'FGS-4', 'FGS-5'] }),
    funcaoGratificada({ id: 'fas', nome: 'Funções de Apoio e Supervisão – FAS (conceder / dispensar)', sigla: 'FAS',
      sing: 'Função de Apoio e Supervisão – FAS', plur: 'Funções de Apoio e Supervisão – FAS', plurais: true,
      simbolos: ['FAS-1', 'FAS-2', 'FAS-3'] }),
    atoIndividual({
      id: 'tornar-sem-efeito', nome: 'Tornar sem efeito', grupo: 'Correção de atos',
      campos: [
        { id: 'portaria', rotulo: 'Portaria anterior (nº/ano)', tipo: 'texto', exemplo: '1300/2026' },
        { id: 'edicao', rotulo: 'Diário Oficial nº', tipo: 'texto', exemplo: '180' },
        { id: 'dataEdicao', rotulo: 'Data da publicação', tipo: 'data' },
        { id: 'objeto', rotulo: 'Concessão de', tipo: 'texto', exemplo: 'licença prêmio' }],
      considerandos: function () { return []; },
      artigo: function (x, c) {
        // todos os servidores num só artigo (o primeiro monta a frase)
        if (x !== c.servs[0]) return null;
        var lista = c.servs.map(function (y) { return '**' + y.nome + '**, matrícula ' + y.matricula; });
        var juntos = lista.length > 1 ? lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1] : lista[0];
        return '**TORNAR SEM EFEITO** a Portaria nº ' + c.v('portaria') + ' - SEGEP, publicada no Diário Oficial nº ' + c.v('edicao') + ', de ' +
          c.v('dataEdicao') + ', no que se refere à concessão de ' + c.v('objeto') + ' ' + c.g.a_ + ' ' +
          c.g.servidor + ' ' + juntos + '.';
      }
    }),
    pedidoSobre('outro-pedido', 'Outro pedido (digitar o nome)', null, { grupo: 'Outros pedidos' })
  ];

  function tipoPorId(id) {
    return TIPOS.filter(function (t) { return t.id === id; })[0] || null;
  }

  /*
   * Monta a Portaria.
   * dados: { tipo, numero, data: {a,m,d}, servidores: [{ nome, matricula, cargo, secretaria, sexo, campos }],
   *          formatoMatricula, campos: { id: texto | {a,m,d} | true }, config: { preambulo, assinanteNome, assinanteCargo } }
   *   - campos de cada servidor (campos do servidor) valem para ele; os de dados.campos valem para todos e servem de
   *     reserva. Também aceita um só servidor em dados.servidor.
   * Devolve { titulo, preambulo, blocos, local, assinatura: { nome, cargo }, faltando: [rótulos dos campos vazios] }.
   * Campo obrigatório vazio aparece no texto como "[rótulo]" e entra em "faltando".
   */
  function gerarPortaria(dados) {
    var tipo = tipoPorId(dados.tipo);
    if (!tipo) throw new Error('Modelo de portaria desconhecido: ' + dados.tipo);
    var config = Object.assign({}, PADRAO, dados.config || {});
    var lista = (dados.servidores && dados.servidores.length) ? dados.servidores : [dados.servidor || {}];
    if (tipo.unico) lista = lista.slice(0, 1); // modelos de um servidor só usam o primeiro
    var faltando = [];
    function campo(id) { return tipo.campos.filter(function (x) { return x.id === id; })[0]; }

    var servs = lista.map(function (s) {
      var x = {
        nome: s.nome || '[servidor]', matricula: formatarMatricula(s.matricula, dados.formatoMatricula) || '[matrícula]',
        cargo: s.cargo || '[cargo]', secretaria: s.secretaria || '[secretaria]', g: genero(s.sexo, false)
      };
      x.bruto = function (id) {
        var valor = s.campos && s.campos[id] != null && s.campos[id] !== '' ? s.campos[id] : (dados.campos ? dados.campos[id] : null);
        if (valor && typeof valor === 'object') return valor;
        valor = String(valor == null ? '' : valor).trim();
        var c = campo(id);
        if (!valor && c && c.padrao != null) valor = valorPadrao(c, lista.map(function (y) { return { secretaria: y.secretaria }; }));
        return valor;
      };
      x.tem = function (id) { return !!x.bruto(id); };
      x.v = function (id, obrigatorio) {
        var valor = x.bruto(id), c = campo(id);
        if (!valor) {
          var rotulo = c.rotulo + (lista.length > 1 && c.porServidor ? ' (' + x.nome + ')' : '');
          if ((obrigatorio || !c.opcional) && faltando.indexOf(rotulo) < 0) faltando.push(rotulo);
          return '[' + c.rotulo.toLowerCase() + ']';
        }
        if (typeof valor === 'object') return dataPontos(valor);
        return valor;
      };
      return x;
    });
    var todasMulheres = lista.every(function (s) { return s.sexo === 'F'; });
    var c = {
      n: servs.length, servs: servs, g: genero(todasMulheres ? 'F' : 'M', servs.length > 1),
      v: function (id, obrigatorio) { return servs[0].v(id, obrigatorio); },
      tem: function (id) { return servs[0].tem(id); },
      marcado: function (id) { return !!(dados.campos && dados.campos[id] === true); }
    };
    // dados de um servidor só (modelos antigos): c.nome, c.matricula…
    ['nome', 'matricula', 'cargo', 'secretaria'].forEach(function (k) { c[k] = servs[0][k]; });
    var blocos = tipo.gerar(c);
    if (!dados.numero) faltando.unshift('Número da portaria');
    return {
      titulo: tituloPortaria(dados.numero ? String(dados.numero).trim() : '', dados.data),
      preambulo: tipo.preambulo || config.preambulo,
      blocos: blocos,
      local: 'Jaboatão dos Guararapes, ' + D.dataExtenso(dados.data),
      assinatura: { nome: config.assinanteNome, cargo: config.assinanteCargo },
      faltando: faltando
    };
  }

  var api = {
    PADRAO: PADRAO,
    TIPOS: TIPOS,
    FORMATOS_MATRICULA: FORMATOS_MATRICULA,
    tipoPorId: tipoPorId,
    grupos: function () { return dedupe(TIPOS.map(function (t) { return t.grupo; })); },
    capitalizar: capitalizar,
    mapaSecretarias: mapaSecretarias,
    secretariaDoServidor: secretariaDoServidor,
    ehCedido: ehCedido,
    locativo: locativo,
    semPalavraSecretaria: semPalavraSecretaria,
    formatarMatricula: formatarMatricula,
    dataPontos: dataPontos,
    tituloPortaria: tituloPortaria,
    genero: genero,
    valorPadrao: valorPadrao,
    gerarPortaria: gerarPortaria
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Portarias = api;
})(this);
