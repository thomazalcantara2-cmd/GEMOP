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

  // Portaria sobre um pedido (licença, dispensa…): deferida ou indeferida, conforme a caixa "Indeferida".
  // O texto é o mesmo; muda só o verbo. Sem pedidoFixo, o pedido é digitado.
  function pedidoSobre(id, nome, pedidoFixo) {
    var campos = [{ id: 'indeferido', rotulo: 'Indeferida', tipo: 'caixa', abaixoDoTipo: true,
      ajuda: 'desmarcado = deferida (concedida)' }];
    campos.push({ id: 'processo', rotulo: 'Nº do processo', tipo: 'texto', exemplo: '26.17.000003900-3', porServidor: true });
    if (!pedidoFixo) campos.push({ id: 'pedido', rotulo: 'Pedido', tipo: 'texto', exemplo: 'Licença para Curso' });
    campos.push(
      { id: 'fundamento', rotulo: 'Fundamentos adotados', tipo: 'texto',
        padrao: function (x) {
          if (x.n > 1) return x.secretarias.length === 1 ? 'despachos d' + locativo(x.secretaria).replace(/^n/, '') : 'despachos das respectivas secretarias';
          return 'despacho d' + locativo(x.secretaria).replace(/^n/, '');
        },
        ajuda: 'ex.: parecer da Assessoria Jurídica da Secretaria Municipal de Educação; com vários servidores, no plural' },
      { id: 'decenio', rotulo: 'Decênio (opcional)', tipo: 'texto', opcional: true, exemplo: '2013/2023', ajuda: 'cria a coluna Decênio', porServidor: true },
      { id: 'periodo', rotulo: 'Período de gozo (opcional)', tipo: 'texto', opcional: true, exemplo: '01.04.2026 a 30.04.2026', ajuda: 'cria a coluna Período de Gozo', porServidor: true });
    return {
      id: id,
      nome: nome,
      campos: campos,
      gerar: function (c) {
        var plural = c.n > 1;
        var colunas = ['Nº Processo', 'Nome do Servidor', 'Matrícula', 'Secretaria de Origem'];
        var temDecenio = c.servs.some(function (x) { return x.tem('decenio'); });
        var temPeriodo = c.servs.some(function (x) { return x.tem('periodo'); });
        if (temDecenio) colunas.push('Decênio');
        if (temPeriodo) colunas.push('Período de Gozo');
        var linhas = c.servs.map(function (x) {
          var l = [x.v('processo'), x.nome, x.matricula, semPalavraSecretaria(x.secretaria)];
          if (temDecenio) l.push(x.tem('decenio') ? x.v('decenio') : '');
          if (temPeriodo) l.push(x.tem('periodo') ? x.v('periodo') : '');
          return l;
        });
        return [
          { t: 'p', texto: '**CONSIDERANDO** a existência ' + (plural ? 'dos requerimentos individuais formulados ' : 'do requerimento individual formulado ') +
            c.g.pelo + ' ' + c.g.servidor + ' abaixo ' + c.g.discriminado + '.' },
          { t: 'p', texto: '**RESOLVE:**' },
          { t: 'p', texto: '**Art. 1º. ' + (c.marcado('indeferido') ? 'INDEFERIR' : 'DEFERIR') + '** ' + (plural ? 'os pedidos' : 'o pedido') +
            ' de **' + (pedidoFixo || c.v('pedido')) + '**, adotando integralmente os fundamentos elencados ' + (plural ? 'nos ' : 'no ') +
            c.v('fundamento') + ', ' + c.g.do_ + ' ' + c.g.servidor + ' abaixo:' },
          { t: 'tabela', colunas: colunas, linhas: linhas },
          { t: 'p', texto: '**Art. 2º.** Esta Portaria entra em vigor a partir da data de sua publicação.' }
        ];
      }
    };
  }

  var TIPOS = [
    {
      id: 'exoneracao',
      nome: 'Exoneração a pedido',
      campos: [
        { id: 'requerimento', rotulo: 'Nº do requerimento', tipo: 'texto', exemplo: '26.17.000004682-4', porServidor: true },
        { id: 'dataRequerimento', rotulo: 'Data do requerimento', tipo: 'data', porServidor: true },
        { id: 'tipoCargo', rotulo: 'Tipo do cargo', tipo: 'texto', padrao: 'efetivo', ajuda: 'efetivo, em comissão…' },
        { id: 'baseLegal', rotulo: 'Fundamento legal', tipo: 'texto', padrao: 'art. 54, inciso I, da Lei 224/96' },
        { id: 'efeitos', rotulo: 'Retroagir efeitos a (opcional)', tipo: 'data', opcional: true, porServidor: true }
      ],
      gerar: function (c) {
        var unico = c.n === 1;
        var blocos = c.servs.map(function (x) {
          return { t: 'p', texto: 'Considerando a solicitação ' + x.g.da + ' ' + x.g.servidor + (unico ? '' : ' **' + x.nome + '**') +
            ' através do requerimento nº ' + x.v('requerimento') + ', datado de ' + x.v('dataRequerimento') + '.' };
        });
        blocos.push({ t: 'p', texto: '**RESOLVE:**' });
        c.servs.forEach(function (x, i) {
          blocos.push({ t: 'p', texto: '**Art. ' + (i + 1) + 'º. EXONERAR** a pedido ' + x.g.o + ' ' + x.g.servidor + ' **' + x.nome +
            '**, matrícula nº **' + x.matricula + '**, do Cargo ' + c.v('tipoCargo') + ' de ' + x.cargo + ', ' + x.g.lotado + ' ' +
            locativo(x.secretaria) + ', de acordo com o ' + c.v('baseLegal') +
            (!unico && x.tem('efeitos') ? ', retroagindo seus efeitos a ' + x.v('efeitos') : '') + '.' });
        });
        blocos.push({ t: 'p', texto: '**Art. ' + (c.n + 1) + 'º.** Esta portaria entra em vigor na data da sua publicação' +
          (unico && c.servs[0].tem('efeitos') ? ', retroagindo seus efeitos a ' + c.servs[0].v('efeitos') : '') + '.' });
        return blocos;
      }
    },
    pedidoSobre('licenca-sem-vencimentos', 'Licença sem Vencimentos', 'Licença sem Vencimentos'),
    pedidoSobre('licenca-curso', 'Licença para Curso', 'Licença para Curso'),
    pedidoSobre('licenca-premio', 'Licença Prêmio', 'Licença Prêmio'),
    pedidoSobre('dispensa-estagio', 'Dispensa de Estágio Probatório', 'Dispensa de Estágio Probatório'),
    pedidoSobre('outro-pedido', 'Outro pedido (digitar o nome)', null),
    {
      id: 'readaptacao',
      nome: 'Readaptação de função',
      campos: [
        { id: 'oficio', rotulo: 'Ofício da Junta Médica', tipo: 'texto', exemplo: 'GPM nº 134/2026', porServidor: true },
        { id: 'dias', rotulo: 'Período (dias)', tipo: 'numero', padrao: '180', porServidor: true },
        { id: 'baseLegal', rotulo: 'Fundamento legal', tipo: 'texto', padrao: 'art. 51 da Lei 224/96' },
        { id: 'efeitos', rotulo: 'Retroagir efeitos a (opcional)', tipo: 'data', opcional: true, porServidor: true }
      ],
      gerar: function (c) {
        var unico = c.n === 1;
        var oficios = dedupe(c.servs.map(function (x) { return x.v('oficio'); }));
        var blocos = [];
        if (oficios.length === 1) {
          blocos.push({ t: 'p', texto: '**CONSIDERANDO** o Parecer da Junta Médica Municipal conforme Ofício ' + oficios[0] + '.' });
        } else {
          c.servs.forEach(function (x) {
            blocos.push({ t: 'p', texto: '**CONSIDERANDO** o Parecer da Junta Médica Municipal conforme Ofício ' + x.v('oficio') +
              ', referente ' + x.g.a_ + ' ' + x.g.servidor + ' ' + x.nome + '.' });
          });
        }
        blocos.push({ t: 'p', texto: '**RESOLVE:**' });
        c.servs.forEach(function (x, i) {
          blocos.push({ t: 'p', texto: '**Art. ' + (i + 1) + 'º. CONCEDER** temporariamente **Readaptação de Função**, pelo período de **' +
            dias(x.v('dias')) + '**, ' + x.g.a_ + ' ' + x.g.servidor + ' **' + x.nome + '**, mat. ' + x.matricula + ' ' + x.g.lotado + ' ' +
            locativo(x.secretaria) + ', no cargo de ' + x.cargo + ', para desempenhar suas atividades em áreas administrativas, ' +
            'nos termos do ' + c.v('baseLegal') + (!unico && x.tem('efeitos') ? ', retroagindo seus efeitos a ' + x.v('efeitos') : '') + '.' });
        });
        blocos.push({ t: 'p', texto: '**Art. ' + (c.n + 1) + 'º.** Esta portaria entra em vigor na data da sua publicação' +
          (unico && c.servs[0].tem('efeitos') ? ', retroagindo seus efeitos a ' + c.servs[0].v('efeitos') : '') + '.' });
        return blocos;
      }
    }
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
      x.v = function (id) {
        var valor = x.bruto(id), c = campo(id);
        if (!valor) {
          var rotulo = c.rotulo + (lista.length > 1 && c.porServidor ? ' (' + x.nome + ')' : '');
          if (!c.opcional && faltando.indexOf(rotulo) < 0) faltando.push(rotulo);
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
      v: function (id) { return servs[0].v(id); },
      tem: function (id) { return servs[0].tem(id); },
      marcado: function (id) { return !!(dados.campos && dados.campos[id] === true); }
    };
    // dados de um servidor só (modelos antigos): c.nome, c.matricula…
    ['nome', 'matricula', 'cargo', 'secretaria'].forEach(function (k) { c[k] = servs[0][k]; });
    var blocos = tipo.gerar(c);
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
    valorPadrao: valorPadrao,
    gerarPortaria: gerarPortaria
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Portarias = api;
})(this);
