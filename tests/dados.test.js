// Testes das regras de extração. Execute com: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/dados.js');

const dt = (d, m, a) => ({ a, m, d });

test('tempo de serviço em anos, meses e dias', () => {
  // Caso do modelo: admissão 01/11/2016, emitido em 16/09/2026
  assert.strictEqual(D.formatarTempo(D.tempoEntre(dt(1, 11, 2016), dt(16, 9, 2026))),
    '09 ANOS, 10 MESES E 15 DIAS.');
  assert.deepStrictEqual(D.tempoEntre(dt(31, 1, 2020), dt(1, 3, 2020)), { anos: 0, meses: 1, dias: 1 });
  assert.deepStrictEqual(D.tempoEntre(dt(5, 2, 1985), dt(5, 2, 2026)), { anos: 41, meses: 0, dias: 0 });
  assert.strictEqual(D.formatarTempo({ anos: 1, meses: 1, dias: 1 }), '01 ANO, 01 MÊS E 01 DIA.');
  assert.strictEqual(D.tempoEntre(dt(2, 1, 2026), dt(1, 1, 2026)), null);
});

test('datas: serial do Excel e texto', () => {
  assert.deepStrictEqual(D.paraData(42675), dt(1, 11, 2016));
  assert.deepStrictEqual(D.paraData(31339), dt(19, 10, 1985));
  assert.deepStrictEqual(D.paraData('19/10/1985'), dt(19, 10, 1985));
  assert.strictEqual(D.dataBR(dt(1, 11, 2016)), '01/11/2016');
});

test('matrícula e CPF', () => {
  assert.strictEqual(D.formatarMatricula('002076671'), '20.766-7.1');
  assert.strictEqual(D.formatarMatricula('000816041'), '8.160-4.1');
  assert.strictEqual(D.formatarCPF(583813330), '005.838.133-30');
  assert.strictEqual(D.formatarCPF('00583813330'), '005.838.133-30');
});

test('valor por extenso', () => {
  assert.strictEqual(D.valorExtenso(3598.69),
    'Três mil, quinhentos e noventa e oito reais e sessenta e nove centavos');
  assert.strictEqual(D.valorExtenso(1500), 'Mil e quinhentos reais');
  assert.strictEqual(D.valorExtenso(1621), 'Mil, seiscentos e vinte e um reais');
  assert.strictEqual(D.valorExtenso(2000.01), 'Dois mil reais e um centavo');
  assert.strictEqual(D.valorExtenso(100), 'Cem reais');
  assert.strictEqual(D.formatarMoeda(3598.69), 'R$ 3.598,69');
});

test('órgão de origem = último órgão antes da Secretaria de Administração', () => {
  const lot = (orgao, local, ini, fim) => ({ orgao, local, inicio: D.paraData(ini), fim: D.paraData(fim) });
  const hist = D.ordenarLotacoes([
    lot('SEC MUN DE ASSISTENCIA SOCIAL E CIDADANIA', 'CRAS', '01/01/2021', '31/12/2021'),
    lot('SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO, GOVERNO DIGITAL E INOVAÇÃO', 'CCTA - MINISTERIO PUBLICO', '01/04/2026', null),
    lot('SECRETARIA MUNICIPAL DE ASSISTENCIA SOCIAL E CIDADANIA', 'SMAS', '01/02/2026', '31/03/2026'),
    lot('SECRETARIA MUNICIPAL DE ADMINISTRACAO', 'CCTA - MINISTERIO PUBLICO', '01/01/2023', '31/12/2023')
  ]);
  assert.strictEqual(hist[0].local, 'CCTA - MINISTERIO PUBLICO');
  assert.strictEqual(D.orgaoDeOrigem(hist).orgao, 'SECRETARIA MUNICIPAL DE ASSISTENCIA SOCIAL E CIDADANIA');
  assert.strictEqual(D.orgaoDeOrigem(hist.slice(0, 1)), null);
});

test('busca sem acento, por matrícula ou CPF', () => {
  const base = D.montarBase([
    { nu_matricula: '002076671', nm_Funcionario: 'JULIANA GOES MOREIRA', nu_cpfFunc: '00583813330' },
    { nu_matricula: '000816041', nm_Funcionario: 'SINÉZIA MARIA', nu_cpfFunc: 50128469404 }
  ], { servidores: [], lotacoes: [] });
  assert.strictEqual(D.buscar(base, 'sinezia')[0].matricula, '000816041');
  assert.strictEqual(D.buscar(base, '20766')[0].nome, 'JULIANA GOES MOREIRA');
  assert.strictEqual(D.buscar(base, '583.813')[0].nome, 'JULIANA GOES MOREIRA');
});
