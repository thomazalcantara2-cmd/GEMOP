// Testes das regras das Portarias. Execute com: node --test
// Usa só dados inventados (nunca dados reais de servidores).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/dados.js');
const P = require('../js/portarias.js');

const dt = (d, m, a) => ({ a, m, d });

// linhas no formato da FichaContabilis (aba SERVIDORES)
const linha = (nome, mat, cargo, cc, cod, sexo, local) => ({
  nm_Funcionario: nome, nu_matricula: mat, nu_cpfFunc: 12345678901, nm_cargo: cargo, nm_nivel: 'N1',
  fl_situacaoAtual: 'Ativo', nm_centroCusto: cc, cd_centroCusto: cod, tp_sexo: sexo, nm_localTrabalho: local || cc,
  dt_admissao: 42675, dt_nascimento: 31339
});

const LINHAS = [
  linha('MARIA TESTE DA SILVA', '009133641', 'PROFESSOR 2', 'SEGPPE - PROF MAG EFETIVO - ANOS FINAIS', '151022', 'F', 'ESCOLA JOSE CARNEIRO'),
  linha('JOAO TESTE LIMA', 9136921, 'PROFESSOR 1', 'SEGPPE - OUTROS SERV EFETIVOS - APOIO', '151021', 'M'),
  linha('SECRETARIA EDUCACAO LINHA', 1, 'X', 'SECRETARIA MUNICIPAL DE EDUCACAO', '151002', 'F'),
  linha('ANA SAUDE', 5, 'ANALISTA EM SAUDE', 'FMS - SEC MUN DE SAUDE - ESF', '166012', 'F'),
  linha('ANA SAUDE SEC', 6, 'ANALISTA EM SAUDE', 'FMS - SECRETARIA MUNICIPAL DE SAUDE', '166012', 'F'),
  linha('GABINETE UM', 7, 'ASSESSOR ADMINISTRATIVO 1', 'GABINETE DO PREFEITO', '111002', 'M'),
  linha('GABINETE DOIS', 8, 'ASSESSOR ADMINISTRATIVO 1', 'GABINETE DA VICE-PREFEITA', '111012', 'F'),
  linha('CEDIDO UM', 9, 'ASSESSOR ADMINISTRATIVO 1', 'SEGEPE - CEDIDOS', '131022', 'M'),
  linha('SEM CODIGO', 10, 'ASSESSOR ADMINISTRATIVO 1', '', null, null, 'ALGUM LOCAL')
];
const base = D.montarBase(LINHAS, { servidores: [], lotacoes: [] });
const por = (nome) => base.find((s) => s.nome === nome);

test('montarBase traz sexo, cargo sem nível e centro de custo', () => {
  const s = por('MARIA TESTE DA SILVA');
  assert.strictEqual(s.sexo, 'F');
  assert.strictEqual(s.cargoNome, 'PROFESSOR 2');
  assert.strictEqual(s.codCentroCusto, '151022');
  assert.strictEqual(por('SEM CODIGO').sexo, '');
});

test('capitalizar: acentos, preposições, algarismos romanos e siglas', () => {
  assert.strictEqual(P.capitalizar('SECRETARIA MUNICIPAL DE EDUCACAO'), 'Secretaria Municipal de Educação');
  assert.strictEqual(P.capitalizar('SECRETARIA EXECUTIVA DE GESTAO PEDAGOGICA E POLITICAS EDUCACIONAIS'),
    'Secretaria Executiva de Gestão Pedagógica e Políticas Educacionais');
  assert.strictEqual(P.capitalizar('PROFESSOR 2'), 'Professor 2');
  assert.strictEqual(P.capitalizar('PROFESSOR I - EIP'), 'Professor I - EIP');
  assert.strictEqual(P.capitalizar('  ASSESSOR   ADMINISTRATIVO 1 '), 'Assessor Administrativo 1');
  assert.strictEqual(P.capitalizar(''), '');
});

test('secretaria pelo código do centro de custo', () => {
  const mapa = P.mapaSecretarias(base);
  assert.strictEqual(mapa['15'], 'SECRETARIA MUNICIPAL DE EDUCACAO');
  assert.strictEqual(mapa['16'], 'SECRETARIA MUNICIPAL DE SAUDE'); // sem o "FMS - "
  assert.strictEqual(mapa['11'], 'GABINETE DO PREFEITO'); // sem "Secretaria Municipal": usa o centro de final 002
  assert.strictEqual(P.secretariaDoServidor(por('MARIA TESTE DA SILVA'), mapa), 'Secretaria Municipal de Educação');
  assert.strictEqual(P.secretariaDoServidor(por('ANA SAUDE'), mapa), 'Secretaria Municipal de Saúde');
  assert.strictEqual(P.secretariaDoServidor(por('GABINETE DOIS'), mapa), 'Gabinete do Prefeito');
  // sem código: cai no centro de custo / local de trabalho da própria planilha
  assert.strictEqual(P.secretariaDoServidor(por('SEM CODIGO'), mapa), 'Algum Local');
  assert.strictEqual(P.ehCedido(por('CEDIDO UM')), true);
  assert.strictEqual(P.ehCedido(por('JOAO TESTE LIMA')), false);
});

test('locativo e coluna Secretaria de Origem', () => {
  assert.strictEqual(P.locativo('Secretaria Municipal de Educação'), 'na Secretaria Municipal de Educação');
  assert.strictEqual(P.locativo('Gabinete do Prefeito'), 'no Gabinete do Prefeito');
  assert.strictEqual(P.semPalavraSecretaria('Secretaria Municipal de Educação'), 'Municipal de Educação');
});

test('formatos de matrícula', () => {
  assert.strictEqual(P.formatarMatricula('009133641'), '009133641');
  assert.strictEqual(P.formatarMatricula(9133641), '009133641');
  assert.strictEqual(P.formatarMatricula('002026731', 'pontos'), '0.0202673.1');
  assert.strictEqual(P.formatarMatricula('007610743', 'oficial'), '76.107-4.3');
  assert.strictEqual(P.formatarMatricula(''), '');
});

test('título da portaria', () => {
  assert.strictEqual(P.tituloPortaria('537', dt(27, 3, 2026)), 'PORTARIA Nº 537/2026, DE 27 DE MARÇO DE 2026.');
  assert.strictEqual(P.tituloPortaria('554', dt(1, 4, 2026)), 'PORTARIA Nº 554/2026, DE 1 DE ABRIL DE 2026.');
});

const servidora = { nome: 'RAPHAELA CRISTINA CARVALHO DA SILVA', matricula: '009133641', cargo: 'Professor 2',
  secretaria: 'Secretaria Municipal de Educação', sexo: 'F' };

test('exoneração a pedido: texto do modelo', () => {
  const r = P.gerarPortaria({ tipo: 'exoneracao', numero: '537', data: dt(27, 3, 2026), servidor: servidora,
    campos: { requerimento: '26.17.000004682-4', dataRequerimento: dt(3, 3, 2026), efeitos: dt(2, 3, 2026) } });
  assert.strictEqual(r.titulo, 'PORTARIA Nº 537/2026, DE 27 DE MARÇO DE 2026.');
  assert.strictEqual(r.local, 'Jaboatão dos Guararapes, 27 de março de 2026');
  assert.deepStrictEqual(r.faltando, []);
  assert.strictEqual(r.blocos[0].texto,
    'Considerando a solicitação da servidora através do requerimento nº 26.17.000004682-4, datado de 03.03.2026.');
  assert.strictEqual(r.blocos[2].texto,
    '**Art. 1º. EXONERAR** a pedido a servidora **RAPHAELA CRISTINA CARVALHO DA SILVA**, matrícula nº **009133641**, ' +
    'do Cargo efetivo de Professor 2, lotada na Secretaria Municipal de Educação, de acordo com o art. 54, inciso I, da Lei 224/96.');
  assert.strictEqual(r.blocos[3].texto,
    '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação, retroagindo seus efeitos a 02.03.2026.');
});

test('exoneração sem retroação e servidor do sexo masculino', () => {
  const r = P.gerarPortaria({ tipo: 'exoneracao', numero: '1', data: dt(2, 5, 2026),
    servidor: Object.assign({}, servidora, { sexo: 'M' }),
    campos: { requerimento: '1', dataRequerimento: dt(1, 5, 2026) } });
  assert.match(r.blocos[0].texto, /solicitação do servidor/);
  assert.match(r.blocos[2].texto, /a pedido o servidor .*lotado na/);
  assert.strictEqual(r.blocos[3].texto, '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação.');
});

test('indeferimento: texto e tabela do modelo', () => {
  const r = P.gerarPortaria({ tipo: 'licenca-curso', numero: '540', data: dt(30, 3, 2026),
    servidor: { nome: 'FULANO DE TAL', matricula: '002026731', cargo: 'Professor 1', secretaria: 'Secretaria Municipal de Educação', sexo: 'M' },
    formatoMatricula: 'pontos', campos: { indeferido: true, processo: '26.17.000003900-3' } });
  assert.deepStrictEqual(r.faltando, []);
  assert.strictEqual(r.blocos[0].texto,
    '**CONSIDERANDO** a existência do requerimento individual formulado pelo servidor abaixo discriminado.');
  assert.strictEqual(r.blocos[2].texto,
    '**Art. 1º. INDEFERIR** o pedido de **Licença para Curso**, adotando integralmente os fundamentos elencados no ' +
    'despacho da Secretaria Municipal de Educação, do servidor abaixo:');
  assert.deepStrictEqual(r.blocos[3].colunas, ['Nº Processo', 'Nome do Servidor', 'Matrícula', 'Secretaria de Origem']);
  assert.deepStrictEqual(r.blocos[3].linhas[0], ['26.17.000003900-3', 'FULANO DE TAL', '0.0202673.1', 'Municipal de Educação']);
  assert.strictEqual(r.blocos[4].texto, '**Art. 2º.** Esta Portaria entra em vigor a partir da data de sua publicação.');
});

test('indeferimento: tipo "Dispensa de Estágio Probatório", fundamento digitado; servidora', () => {
  const r = P.gerarPortaria({ tipo: 'dispensa-estagio', numero: '530', data: dt(27, 3, 2026),
    servidor: Object.assign({}, servidora, { sexo: 'F' }),
    campos: { indeferido: true, processo: '26.17.000006111-4',
      fundamento: 'parecer da Assessoria Jurídica da Secretaria Municipal de Educação' } });
  assert.match(r.blocos[0].texto, /formulado pela servidora abaixo discriminada\.$/);
  assert.match(r.blocos[2].texto, /pedido de \*\*Dispensa de Estágio Probatório\*\*.*no parecer da Assessoria Jurídica da Secretaria Municipal de Educação, da servidora abaixo:$/);
});

test('sem marcar "Indeferida" a portaria é deferida; colunas opcionais Decênio e Período', () => {
  const dados = { tipo: 'licenca-curso', numero: '522', data: dt(25, 3, 2026),
    servidor: { nome: 'FULANA DE TAL', matricula: '000927031', cargo: 'Analista em Saúde', secretaria: 'Secretaria Municipal de Saúde', sexo: 'F' },
    formatoMatricula: 'pontos', campos: { processo: '26.18.000004305-9' } };
  const simples = P.gerarPortaria(dados);
  assert.deepStrictEqual(simples.faltando, []);
  assert.strictEqual(simples.blocos[2].texto,
    '**Art. 1º. DEFERIR** o pedido de **Licença para Curso**, adotando integralmente os fundamentos elencados no ' +
    'despacho da Secretaria Municipal de Saúde, da servidora abaixo:');
  assert.deepStrictEqual(simples.blocos[3].colunas, ['Nº Processo', 'Nome do Servidor', 'Matrícula', 'Secretaria de Origem']);
  dados.campos.decenio = '96/06 e 06/16'; dados.campos.periodo = '01.04.2026 a 29.06.2026';
  const completo = P.gerarPortaria(dados);
  assert.deepStrictEqual(completo.blocos[3].colunas.slice(4), ['Decênio', 'Período de Gozo']);
  assert.deepStrictEqual(completo.blocos[3].linhas[0], ['26.18.000004305-9', 'FULANA DE TAL', '0.0092703.1', 'Municipal de Saúde', '96/06 e 06/16', '01.04.2026 a 29.06.2026']);
  dados.campos.indeferido = true;
  assert.match(P.gerarPortaria(dados).blocos[2].texto, /^\*\*Art\. 1º\. INDEFERIR\*\* o pedido de \*\*Licença para Curso\*\*/);
});

test('"Outro pedido": o pedido é digitado; Licença sem Vencimentos tem texto próprio', () => {
  const base = { numero: '518', data: dt(24, 3, 2026), servidor: servidora, campos: { indeferido: true, processo: '1' } };
  const outro = P.gerarPortaria(Object.assign({ tipo: 'outro-pedido' }, base));
  assert.deepStrictEqual(outro.faltando, ['Pedido']);
  assert.match(outro.blocos[2].texto, /pedido de \*\*\[pedido\]\*\*/);
  const sv = P.gerarPortaria(Object.assign({ tipo: 'licenca-sem-vencimentos' }, base));
  assert.deepStrictEqual(sv.faltando, []);
  assert.match(sv.blocos[2].texto, /INDEFERIR\*\* o pedido de \*\*Licença sem Vencimentos\*\*/);
});

test('readaptação de função: texto do modelo', () => {
  const r = P.gerarPortaria({ tipo: 'readaptacao', numero: '554', data: dt(1, 4, 2026),
    servidor: { nome: 'KEZIA MONTEIRO DE FIGUEIREDO LIMA DOS SANTOS', matricula: '009136921', cargo: 'Professor 1',
      secretaria: 'Secretaria Municipal de Educação', sexo: 'F' },
    formatoMatricula: 'pontos', campos: { oficio: 'GPM nº 134/2026', efeitos: dt(13, 3, 2026) } });
  assert.deepStrictEqual(r.faltando, []);
  assert.strictEqual(r.blocos[0].texto, '**CONSIDERANDO** o Parecer da Junta Médica Municipal conforme Ofício GPM nº 134/2026.');
  assert.strictEqual(r.blocos[2].texto,
    '**Art. 1º. CONCEDER** temporariamente **Readaptação de Função**, pelo período de **180 (cento e oitenta) dias**, ' +
    'à servidora **KEZIA MONTEIRO DE FIGUEIREDO LIMA DOS SANTOS**, mat. 0.0913692.1 lotada na Secretaria Municipal de Educação, ' +
    'no cargo de Professor 1, para desempenhar suas atividades em áreas administrativas, nos termos do art. 51 da Lei 224/96.');
  assert.strictEqual(r.blocos[3].texto,
    '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação, retroagindo seus efeitos a 13.03.2026.');
});

test('campos obrigatórios vazios aparecem entre colchetes e na lista de pendências', () => {
  const r = P.gerarPortaria({ tipo: 'exoneracao', numero: '', data: dt(27, 3, 2026), servidor: servidora, campos: {} });
  assert.deepStrictEqual(r.faltando, ['Número da portaria', 'Nº do requerimento', 'Data do requerimento']);
  assert.match(r.blocos[0].texto, /requerimento nº \[nº do requerimento\], datado de \[data do requerimento\]\./);
  assert.strictEqual(r.titulo, 'PORTARIA Nº ___/2026, DE 27 DE MARÇO DE 2026.');
  assert.throws(() => P.gerarPortaria({ tipo: 'nao-existe', data: dt(1, 1, 2026) }));
});

test('assinatura e preâmbulo padrão, ajustáveis', () => {
  const r = P.gerarPortaria({ tipo: 'readaptacao', numero: '1', data: dt(1, 4, 2026), servidor: servidora,
    campos: { oficio: 'x' }, config: { assinanteNome: 'OUTRA PESSOA' } });
  assert.strictEqual(r.assinatura.nome, 'OUTRA PESSOA');
  assert.strictEqual(r.assinatura.cargo, 'Secretário Executivo de Gestão de Pessoas');
  assert.match(r.preambulo, /Lei Complementar nº\. 50\/2024, de 31 de dezembro de 2024\.$/);
});

const pessoa = (nome, mat, sexo, secretaria, extra) => ({ nome, matricula: mat, cargo: 'Professor 2', sexo,
  secretaria: secretaria || 'Secretaria Municipal de Educação', campos: extra || {} });

test('vários servidores no pedido: texto no plural e uma linha para cada um (modelo da Portaria 518)', () => {
  const r = P.gerarPortaria({ tipo: 'licenca-sem-vencimentos', numero: '518', data: dt(24, 3, 2026), formatoMatricula: 'nove',
    campos: { indeferido: true }, servidores: [
      pessoa('CIRLENE SILVA DOS SANTOS RAMOS', '009119481', 'F', null, { processo: '26.17.000002021-3' }),
      pessoa('FELIPE DE LIMA SOUZA', '091888321', 'M', null, { processo: '26.17.000005868-7' }),
      pessoa('JOSÉ JEAN CAMPELO DE QUEIROZ JUNIOR', '001343921', 'M', null, { processo: '26.17.000002830-3' })] });
  assert.deepStrictEqual(r.faltando, []);
  assert.strictEqual(r.blocos[0].texto,
    '**CONSIDERANDO** a existência dos requerimentos individuais formulados pelos servidores abaixo discriminados.');
  assert.strictEqual(r.blocos[2].texto,
    '**Art. 1º. INDEFERIR** os pedidos de **Licença sem Vencimentos**, adotando integralmente os fundamentos elencados nos ' +
    'despachos da Secretaria Municipal de Educação, dos servidores abaixo:');
  assert.strictEqual(r.blocos[3].linhas.length, 3);
  assert.deepStrictEqual(r.blocos[3].linhas[1], ['26.17.000005868-7', 'FELIPE DE LIMA SOUZA', '091888321', 'Municipal de Educação']);
});

test('vários servidores: só mulheres vai para o feminino; processo faltando cita o nome', () => {
  const r = P.gerarPortaria({ tipo: 'licenca-curso', numero: '1', data: dt(1, 4, 2026), campos: {},
    servidores: [pessoa('ANA', '1', 'F', 'Secretaria Municipal de Saúde', { processo: 'x' }), pessoa('BIA', '2', 'F')] });
  assert.match(r.blocos[0].texto, /pelas servidoras abaixo discriminadas\./);
  assert.match(r.blocos[2].texto, /despachos das respectivas secretarias, das servidoras abaixo:$/);
  assert.deepStrictEqual(r.faltando, ['Nº do processo (BIA)']);
});

test('vários servidores: colunas Decênio e Período só aparecem se alguém tiver', () => {
  const r = P.gerarPortaria({ tipo: 'licenca-curso', numero: '522', data: dt(25, 3, 2026), campos: {}, servidores: [
    pessoa('ANA', '9270', 'F', null, { processo: '1', decenio: '96/06 e 06/16', periodo: '01.04.2026 a 29.06.2026' }),
    pessoa('BIA', '149276', 'F', null, { processo: '2' })] });
  assert.deepStrictEqual(r.blocos[3].colunas.slice(4), ['Decênio', 'Período de Gozo']);
  assert.deepStrictEqual(r.blocos[3].linhas[1].slice(4), ['', '']);
});

test('exoneração de vários servidores: um artigo para cada e vigência por último', () => {
  const r = P.gerarPortaria({ tipo: 'exoneracao', numero: '600', data: dt(1, 4, 2026), campos: {}, servidores: [
    pessoa('ANA', '9133641', 'F', null, { requerimento: '1', dataRequerimento: dt(3, 3, 2026), efeitos: dt(2, 3, 2026) }),
    pessoa('BRUNO', '9133642', 'M', null, { requerimento: '2', dataRequerimento: dt(4, 3, 2026) })] });
  assert.deepStrictEqual(r.faltando, []);
  const textos = r.blocos.map((b) => b.texto);
  assert.match(textos[0], /^Considerando a solicitação da servidora \*\*ANA\*\* através do requerimento nº 1, datado de 03\.03\.2026\.$/);
  assert.match(textos[1], /^Considerando a solicitação do servidor \*\*BRUNO\*\*/);
  assert.match(textos[3], /^\*\*Art\. 1º\. EXONERAR\*\* a pedido a servidora \*\*ANA\*\*.*, retroagindo seus efeitos a 02\.03\.2026\.$/);
  assert.match(textos[4], /^\*\*Art\. 2º\. EXONERAR\*\* a pedido o servidor \*\*BRUNO\*\*.*Lei 224\/96\.$/);
  assert.strictEqual(textos[5], '**Art. 3º.** Esta portaria entra em vigor na data da sua publicação.');
});

test('readaptação de vários servidores: ofício igual vira um só considerando', () => {
  const dados = { tipo: 'readaptacao', numero: '554', data: dt(1, 4, 2026), campos: {}, servidores: [
    pessoa('ANA', '9136921', 'F', null, { oficio: 'GPM nº 134/2026' }), pessoa('BRUNO', '9136922', 'M', null, { oficio: 'GPM nº 134/2026', dias: '90' })] };
  const r = P.gerarPortaria(dados);
  assert.strictEqual(r.blocos[0].texto, '**CONSIDERANDO** o Parecer da Junta Médica Municipal conforme Ofício GPM nº 134/2026.');
  assert.match(r.blocos[2].texto, /pelo período de \*\*180 \(cento e oitenta\) dias\*\*, à servidora \*\*ANA\*\*/);
  assert.match(r.blocos[3].texto, /\*\*90 \(noventa\) dias\*\*, ao servidor \*\*BRUNO\*\*/);
  dados.servidores[1].campos.oficio = 'GPM nº 200/2026';
  const r2 = P.gerarPortaria(dados);
  assert.match(r2.blocos[1].texto, /Ofício GPM nº 200\/2026, referente ao servidor BRUNO\.$/);
});

// ---------- modelos do levantamento no Diário Oficial ----------
const base1 = (tipo, campos, servidores, extra) => P.gerarPortaria(Object.assign({ tipo, numero: '1000', data: dt(6, 10, 2026), campos, servidores }, extra));
const textos = (r) => r.blocos.map((b) => b.texto || b);

test('licença prêmio deferida: concessão de gozo com decênio e período (Portaria 522)', () => {
  const r = base1('licenca-premio', {}, [
    pessoa('ANA', '9270', 'F', 'Secretaria Municipal de Saúde', { processo: '26.18.000004305-9', decenio: '96/06 e 06/16', periodo: '01.04.2026 a 29.06.2026' }),
    pessoa('BIA', '149276', 'F', null, { processo: '25.17.000018988-3', decenio: '2003/2013', periodo: '01.04.2026 a 30.04.2026' })], { formatoMatricula: 'pontos' });
  assert.deepStrictEqual(r.faltando, []);
  assert.strictEqual(r.blocos[2].texto,
    '**Art. 1º. CONCEDER** o gozo de licença prêmio, de acordo com as Informações funcionais emitida pela Unidade de Gestão de Pessoas - UGEP, ' +
    'às servidoras relacionadas abaixo, nos períodos especificados:');
  assert.deepStrictEqual(r.blocos[3].colunas, ['Nº Processo', 'Nome do Servidor', 'Matrícula', 'Secretaria de Origem', 'Decênio', 'Período de Gozo']);
  assert.deepStrictEqual(r.blocos[3].linhas[0], ['26.18.000004305-9', 'ANA', '0.0000927.0', 'Municipal de Saúde', '96/06 e 06/16', '01.04.2026 a 29.06.2026']);
  const sem = base1('licenca-premio', {}, [pessoa('CARLOS', '1', 'M', null, { processo: '1' })]);
  assert.deepStrictEqual(sem.faltando, ['Decênio', 'Período de gozo']);
  assert.match(sem.blocos[2].texto, /ao servidor relacionado abaixo, no período especificado:$/);
  const ind = base1('licenca-premio', { indeferido: true }, [pessoa('CARLOS', '1', 'M', null, { processo: '1' })]);
  assert.deepStrictEqual(ind.faltando, []);
  assert.match(ind.blocos[2].texto, /^\*\*Art\. 1º\. INDEFERIR\*\* o pedido de \*\*Licença Prêmio\*\*/);
});

test('licença por doença em pessoa da família', () => {
  const r = base1('licenca-doenca-familia', { efeitos: dt(1, 9, 2026) }, [pessoa('ANA', '161888', 'F', null, {})]);
  assert.strictEqual(r.blocos[2].texto,
    '**Art. 1º. CONCEDER** à servidora **ANA**, matrícula 000161888, Professor 2, lotada na Secretaria Municipal de Educação, Licença por Motivo de ' +
    'Doença em Pessoa da Família, pelo período de 30 (trinta) dias, nos termos do art. 91, §2º, inciso I, da Lei nº 224/96.');
  assert.strictEqual(r.blocos[3].texto, '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação, retroagindo seus efeitos a 01.09.2026.');
});

test('retorno de licença para curso (Portaria 487)', () => {
  const r = base1('retorno-licenca-curso', {}, [pessoa('WAGNER RAMOS DE AMORIM', '002132411', 'M', null,
    { requerimento: '26.17.000002583-5', dataRequerimento: dt(2, 2, 2026), efeitos: dt(1, 3, 2026) })]);
  assert.strictEqual(r.blocos[0].texto, 'Considerando a solicitação do servidor através do requerimento pessoal nº 26.17.000002583-5, datado de 02.02.2026.');
  assert.strictEqual(r.blocos[2].texto,
    '**Art. 1º. RETORNAR** da Licença para Curso, o servidor **WAGNER RAMOS DE AMORIM**, matrícula nº 002132411 Cargo Professor 2, lotado na Secretaria Municipal de Educação.');
  assert.match(r.blocos[3].texto, /retroagindo seus efeitos a 01\.03\.2026\.$/);
});

test('readaptação definitiva não tem prazo', () => {
  const r = base1('readaptacao', { definitiva: true }, [pessoa('ANA', '9136921', 'F', null, { oficio: 'GPM nº 1/2026' })]);
  assert.deepStrictEqual(r.faltando, []);
  assert.match(r.blocos[2].texto, /^\*\*Art\. 1º\. CONCEDER\*\* definitivamente \*\*Readaptação de Função\*\*, à servidora \*\*ANA\*\*, mat\. 009136921 /);
  assert.ok(!/período de/.test(r.blocos[2].texto));
});

test('redução de carga horária: tabela com data do requerimento e sem Decênio', () => {
  const r = base1('reducao-ch', { indeferido: true, fundamento: 'parecer nº 5/2026 da Gerência de Política de Pessoal', efeitos: dt(1, 9, 2026) },
    [pessoa('ANA', '9136921', 'F', null, { processo: '26.17.1-1', dataReq: dt(3, 8, 2026) })]);
  assert.deepStrictEqual(r.faltando, []);
  assert.strictEqual(r.blocos[2].texto, '**Art. 1º. INDEFERIR** o pedido de **Redução de Carga Horária**, adotando integralmente os fundamentos elencados no parecer nº 5/2026 da Gerência de Política de Pessoal:');
  assert.deepStrictEqual(r.blocos[3].colunas, ['Nº Processo', 'Nome', 'Matrícula', 'Secretaria', 'Data do Requerimento']);
  assert.strictEqual(r.blocos[3].linhas[0][4], '03.08.2026');
  assert.match(r.blocos[4].texto, /retroagindo seus efeitos a 01\.09\.2026\.$/);
  assert.deepStrictEqual(base1('reducao-ch', {}, [pessoa('ANA', '1', 'F', null, { processo: '1', dataReq: dt(1, 1, 2026) })]).faltando, ['Fundamentos adotados']);
});

test('abono de permanência deferido: de acordo com o parecer, retroagindo à data do requerimento', () => {
  const r = base1('abono-permanencia', { fundamento: 'parecer nº 77/2026 da Gerência de Política de Pessoal' },
    [pessoa('CARLOS', '1', 'M', null, { processo: '9', dataReq: dt(5, 5, 2026) })]);
  assert.strictEqual(r.blocos[2].texto, '**Art. 1º. DEFERIR** o pedido de **Abono de Permanência**, de acordo com o parecer nº 77/2026 da Gerência de Política de Pessoal, do servidor abaixo:');
  assert.strictEqual(r.blocos[4].texto, '**Art. 2º.** Esta Portaria entra em vigor a partir da data de sua publicação, retroagindo seus efeitos à data do requerimento.');
});

test('salário família: deferido sem fundamento; indeferido cita o despacho da SEGEP', () => {
  const s = [pessoa('ANA', '1', 'F', null, { processo: '9', dataReq: dt(5, 5, 2026) })];
  const def = base1('salario-familia', {}, s);
  assert.deepStrictEqual(def.faltando, []);
  assert.strictEqual(def.blocos[2].texto, '**Art. 1º. DEFERIR** o pedido de **Salário Família**:');
  const ind = base1('salario-familia', { indeferido: true }, s);
  assert.strictEqual(ind.blocos[2].texto,
    '**Art. 1º. INDEFERIR** o pedido de **Salário Família**, adotando integralmente os fundamentos elencados no despacho da Secretaria Executiva de Gestão de Pessoas:');
});

test('tornar sem efeito: uma frase para todos os servidores', () => {
  const r = base1('tornar-sem-efeito', { portaria: '1300/2026', edicao: '180', dataEdicao: dt(25, 9, 2026), objeto: 'licença prêmio' },
    [pessoa('ANA', '9270', 'F'), pessoa('BIA', '149276', 'F')]);
  assert.deepStrictEqual(r.faltando, []);
  assert.strictEqual(r.blocos[0].texto, '**RESOLVE:**');
  assert.strictEqual(r.blocos[1].texto,
    '**Art. 1º. TORNAR SEM EFEITO** a Portaria nº 1300/2026 - SEGEP, publicada no Diário Oficial nº 180, de 25.09.2026, no que se refere à concessão de ' +
    'licença prêmio às servidoras **ANA**, matrícula 000009270 e **BIA**, matrícula 000149276.');
  assert.strictEqual(r.blocos[2].texto, '**Art. 2º.** Esta portaria entra em vigor na data da sua publicação.');
});

test('encerramento de cessão e prorrogação de pós-graduação usam só o primeiro servidor', () => {
  const r = base1('encerramento-cessao', { portariaCessao: '1200/2026', dataPortariaCessao: dt(1, 2, 2026), oficio: '10/2026', dataOficio: dt(2, 9, 2026),
    orgao: 'Tribunal de Justiça', dataEncerramento: dt(30, 9, 2026), dataRetorno: dt(1, 10, 2026), efeitos: dt(30, 9, 2026) },
    [pessoa('ANA', '9270', 'F'), pessoa('BIA', '149276', 'F')]);
  assert.deepStrictEqual(r.faltando, []);
  const t = textos(r).join('\n');
  assert.ok(t.includes('ANA') && !t.includes('BIA'));
  assert.match(r.blocos[4].texto, /^\*\*Art\. 1º\. ENCERRAR\*\*, em 30\.09\.2026, a cessão da servidora \*\*ANA\*\*, matrícula 000009270, cedida ao Tribunal de Justiça\.$/);
  assert.match(r.blocos[5].texto, /^\*\*Art\. 2º\.\*\* A servidora retorna a partir de 01\.10\.2026, ficando lotada na Secretaria Municipal de Educação\.$/);
  const pos = base1('prorrogacao-pos', { requerimento: '1', parecer: '9/2026', dataParecer: dt(1, 8, 2026), curso: 'Mestrado', programa: 'Educação',
    instituicao: 'UFPE', inicio: dt(1, 9, 2026), fim: dt(31, 8, 2027) }, [pessoa('ANA', '9270', 'F')]);
  assert.deepStrictEqual(pos.faltando, []);
  assert.strictEqual(pos.blocos[pos.blocos.length - 1].texto, '**Art. 3º.** Publique-se e cumpra-se.');
});

test('enquadramento e tipos agrupados', () => {
  const r = base1('enquadramento', { processo: '26.17.1-1' }, [pessoa('ANA', '9270', 'F', null, { classe: 'B', nivel: 'II', referencia: '3' })]);
  assert.strictEqual(r.blocos[1].texto, '**CONSIDERANDO** o despacho da Secretaria Municipal de Educação;');
  assert.match(r.blocos[3].texto, /^\*\*Art\. 1º\. ENQUADRAR\*\* a servidora \*\*ANA\*\* matrícula 000009270, no cargo de Professor 2 classe B nível II referência 3\.$/);
  assert.ok(P.TIPOS.every((t) => t.grupo));
  assert.strictEqual(new Set(P.TIPOS.map((t) => t.id)).size, P.TIPOS.length);
});
