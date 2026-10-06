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

  // Deferimento e indeferimento têm o mesmo texto, mudando só o verbo (e colunas opcionais no deferimento).
  function pedidoSobre(id, nome, verbo, extras) {
    return {
      id: id,
      nome: nome,
      campos: [
        { id: 'processo', rotulo: 'Nº do processo', tipo: 'texto', exemplo: '26.17.000003900-3' },
        { id: 'pedido', rotulo: 'Pedido', tipo: 'texto', padrao: 'Licença para Curso',
          opcoes: ['Licença para Curso', 'Licença sem Vencimentos', 'Licença Prêmio', 'Dispensa de Estágio Probatório'] },
        { id: 'fundamento', rotulo: 'Fundamentos adotados', tipo: 'texto',
          padrao: function (c) { return 'despacho d' + locativo(c.secretaria).replace(/^n/, ''); },
          ajuda: 'ex.: parecer da Assessoria Jurídica da Secretaria Municipal de Educação' }
      ].concat(extras),
      gerar: function (c) {
        var colunas = ['Nº Processo', 'Nome do Servidor', 'Matrícula', 'Secretaria de Origem'];
        var linha = [c.v('processo'), c.nome, c.matricula, semPalavraSecretaria(c.secretaria)];
        if (c.tem('decenio')) { colunas.push('Decênio'); linha.push(c.v('decenio')); }
        if (c.tem('periodo')) { colunas.push('Período de Gozo'); linha.push(c.v('periodo')); }
        return [
          { t: 'p', texto: '**CONSIDERANDO** a existência do requerimento individual formulado ' + c.g.pelo + ' ' + c.g.servidor +
            ' abaixo ' + c.g.discriminado + '.' },
          { t: 'p', texto: '**RESOLVE:**' },
          { t: 'p', texto: '**Art. 1º. ' + verbo + '** o pedido de **' + c.v('pedido') + '**, adotando integralmente os fundamentos ' +
            'elencados no ' + c.v('fundamento') + ', ' + c.g.do_ + ' ' + c.g.servidor + ' abaixo:' },
          { t: 'tabela', colunas: colunas, linha: linha },
          { t: 'p', texto: '**Art. 2º.** Esta Portaria entra em vigor a partir da data de sua publicação.' }
        ];
      }
    };
  }

  // ---------- modelos ----------
  // campos: o que a pessoa preenche além do servidor. padrao pode ser função de (dados) para valores que dependem do servidor.
  // gerar(c): c.v(id) = valor do campo (ou "[rótulo]" se faltar), c.g = palavras no gênero do servidor,
  //   c.nome, c.matricula, c.cargo, c.secretaria, c.pendente(id) = campo obrigatório vazio.
  var TIPOS = [
    {
      id: 'exoneracao',
      nome: 'Exoneração a pedido',
      campos: [
        { id: 'requerimento', rotulo: 'Nº do requerimento', tipo: 'texto', exemplo: '26.17.000004682-4' },
        { id: 'dataRequerimento', rotulo: 'Data do requerimento', tipo: 'data' },
        { id: 'tipoCargo', rotulo: 'Tipo do cargo', tipo: 'texto', padrao: 'efetivo', ajuda: 'efetivo, em comissão…' },
        { id: 'baseLegal', rotulo: 'Fundamento legal', tipo: 'texto', padrao: 'art. 54, inciso I, da Lei 224/96' },
        { id: 'efeitos', rotulo: 'Retroagir efeitos a (opcional)', tipo: 'data', opcional: true }
      ],
      gerar: function (c) {
        return [
          { t: 'p', texto: 'Considerando a solicitação ' + c.g.da + ' ' + c.g.servidor + ' através do requerimento nº ' +
            c.v('requerimento') + ', datado de ' + c.v('dataRequerimento') + '.' },
          { t: 'p', texto: '**RESOLVE:**' },
          { t: 'p', texto: '**Art. 1º. EXONERAR** a pedido ' + c.g.o + ' ' + c.g.servidor + ' **' + c.nome + '**, matrícula nº **' +
            c.matricula + '**, do Cargo ' + c.v('tipoCargo') + ' de ' + c.cargo + ', ' + c.g.lotado + ' ' + locativo(c.secretaria) +
            ', de acordo com o ' + c.v('baseLegal') + '.' },
          { t: 'p', texto: '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação' +
            (c.tem('efeitos') ? ', retroagindo seus efeitos a ' + c.v('efeitos') : '') + '.' }
        ];
      }
    },
    pedidoSobre('deferimento', 'Deferimento de pedido (licença, dispensa…)', 'DEFERIR', [
      { id: 'decenio', rotulo: 'Decênio (opcional)', tipo: 'texto', opcional: true, exemplo: '2013/2023', ajuda: 'cria a coluna Decênio' },
      { id: 'periodo', rotulo: 'Período de gozo (opcional)', tipo: 'texto', opcional: true, exemplo: '01.04.2026 a 30.04.2026', ajuda: 'cria a coluna Período de Gozo' }
    ]),
    pedidoSobre('indeferimento', 'Indeferimento de pedido (licença, dispensa…)', 'INDEFERIR', []),
    {
      id: 'readaptacao',
      nome: 'Readaptação de função',
      campos: [
        { id: 'oficio', rotulo: 'Ofício da Junta Médica', tipo: 'texto', exemplo: 'GPM nº 134/2026' },
        { id: 'dias', rotulo: 'Período (dias)', tipo: 'numero', padrao: '180' },
        { id: 'baseLegal', rotulo: 'Fundamento legal', tipo: 'texto', padrao: 'art. 51 da Lei 224/96' },
        { id: 'efeitos', rotulo: 'Retroagir efeitos a (opcional)', tipo: 'data', opcional: true }
      ],
      gerar: function (c) {
        return [
          { t: 'p', texto: '**CONSIDERANDO** o Parecer da Junta Médica Municipal conforme Ofício ' + c.v('oficio') + '.' },
          { t: 'p', texto: '**RESOLVE:**' },
          { t: 'p', texto: '**Art. 1º. CONCEDER** temporariamente **Readaptação de Função**, pelo período de **' + dias(c.v('dias')) +
            '**, ' + c.g.a_ + ' ' + c.g.servidor + ' **' + c.nome + '**, mat. ' + c.matricula + ' ' + c.g.lotado + ' ' +
            locativo(c.secretaria) + ', no cargo de ' + c.cargo + ', para desempenhar suas atividades em áreas administrativas, ' +
            'nos termos do ' + c.v('baseLegal') + '.' },
          { t: 'p', texto: '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação' +
            (c.tem('efeitos') ? ', retroagindo seus efeitos a ' + c.v('efeitos') : '') + '.' }
        ];
      }
    }
  ];

  function tipoPorId(id) {
    return TIPOS.filter(function (t) { return t.id === id; })[0] || null;
  }

  // Palavras no gênero do servidor (sexo: 'F' = feminino; qualquer outro valor = masculino).
  function genero(sexo) {
    var f = sexo === 'F';
    return {
      servidor: f ? 'servidora' : 'servidor',
      o: f ? 'a' : 'o', a_: f ? 'à' : 'ao', da: f ? 'da' : 'do', do_: f ? 'da' : 'do', pelo: f ? 'pela' : 'pelo',
      lotado: f ? 'lotada' : 'lotado', discriminado: f ? 'discriminada' : 'discriminado'
    };
  }

  /*
   * Monta a Portaria.
   * dados: { tipo, numero, data: {a,m,d}, servidor: { nome, matricula, cargo, secretaria, sexo },
   *          formatoMatricula, campos: { id: texto | {a,m,d} }, config: { preambulo, assinanteNome, assinanteCargo } }
   * Devolve { titulo, preambulo, blocos, local, assinatura: { nome, cargo }, faltando: [rótulos dos campos vazios] }.
   * Campo obrigatório vazio aparece no texto como "[rótulo]" e entra em "faltando".
   */
  function gerarPortaria(dados) {
    var tipo = tipoPorId(dados.tipo);
    if (!tipo) throw new Error('Modelo de portaria desconhecido: ' + dados.tipo);
    var config = Object.assign({}, PADRAO, dados.config || {});
    var s = dados.servidor || {};
    var faltando = [];
    var contexto = {
      nome: s.nome || '[servidor]', matricula: formatarMatricula(s.matricula, dados.formatoMatricula) || '[matrícula]',
      cargo: s.cargo || '[cargo]', secretaria: s.secretaria || '[secretaria]', g: genero(s.sexo)
    };
    function campo(id) { return tipo.campos.filter(function (x) { return x.id === id; })[0]; }
    function bruto(id) {
      var c = campo(id), valor = dados.campos ? dados.campos[id] : null;
      if (valor && typeof valor === 'object') return valor;
      valor = String(valor == null ? '' : valor).trim();
      if (!valor && c && c.padrao != null) valor = typeof c.padrao === 'function' ? c.padrao(contexto) : c.padrao;
      return valor;
    }
    contexto.tem = function (id) { return !!bruto(id); };
    contexto.v = function (id) {
      var valor = bruto(id), c = campo(id);
      if (!valor) {
        if (!c.opcional && faltando.indexOf(c.rotulo) < 0) faltando.push(c.rotulo);
        return '[' + c.rotulo.toLowerCase() + ']';
      }
      if (typeof valor === 'object') return dataPontos(valor);
      return valor;
    };
    var blocos = tipo.gerar(contexto);
    if (!dados.numero) faltando.unshift('Número da portaria');
    return {
      titulo: tituloPortaria(dados.numero ? String(dados.numero).trim() : '', dados.data),
      preambulo: config.preambulo,
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
    gerarPortaria: gerarPortaria
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Portarias = api;
})(this);
