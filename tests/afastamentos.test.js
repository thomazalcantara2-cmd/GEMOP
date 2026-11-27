// Testes dos impedimentos da licença prêmio. Usa só dados inventados (nunca dados reais de servidores).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const A = require('../js/afastamentos.js');

const dt = (d, m, a) => ({ a, m, d });
const linha = (mat, tipo, ini, fim, sefip) => ({ Matricula: mat, Inicio: ini, Fim: fim, Afastamento: tipo, Afastamento_SEFIP: sefip || '' });

test('classificar: impede, depende, verificar e não impede', () => {
  assert.strictEqual(A.classificar('507 - LICENCA SEM VENCIMENTO').nivel, 'impede');
  assert.strictEqual(A.classificar('520 - LICENCA PARA TRATAR INTERESSE PARTICULAR').nivel, 'impede');
  assert.strictEqual(A.classificar('605 - LICENCA PARA ACOMPANHAMENTO CONJUGE').nivel, 'impede');
  assert.strictEqual(A.classificar('675 - SUSPENSÃO DISCIPLINAR').nivel, 'impede');
  assert.strictEqual(A.classificar('509 - LICENCA ACOMPANHAMENTO SAUDE FAMILIA').nivel, 'condicional');
  assert.strictEqual(A.classificar('516 - RESPONDENDO A PROCESSO ADM').nivel, 'impede');
  assert.strictEqual(A.classificar('602 - RECLUSAO COM ONUS').nivel, 'impede');
  assert.strictEqual(A.classificar('518 - CEDIDO PARA OUTRO ORGÃO COM ÔNUS PARA ÓRGÃO DE ORIGEM').nivel, 'verificar');
  ['508 - LICENCA MÉDICA - EFETIVOS', '513 - LICENCA PREMIO', '512 - LICENCA MATERNIDADE -INSS', '614 - LICENCA LUTO',
    '502 - APOSENTADORIA', '639 - DISPENSA SEM JUSTA CAUSA', '629 - LICENCA PARA EXERCICIO DE MANDATO SINDICAL'].forEach(t => assert.strictEqual(A.classificar(t).nivel, '', t));
});

test('classificar: tipo sem código usa palavras e o código SEFIP', () => {
  assert.strictEqual(A.classificar('LICENCA SEM VENCIMENTOS NOVA').nivel, 'impede');
  assert.strictEqual(A.classificar('', 'X - Licença sem vencimentos').nivel, 'impede');
  assert.strictEqual(A.classificar('', 'Y - Outros motivos de afastamento temporário').nivel, 'verificar');
  assert.strictEqual(A.classificar('', 'P1 - Afastamento temporário por motivo de doença').nivel, '');
});

test('indexar: só guarda o que pesa, pela matrícula de 9 dígitos, com datas em texto, serial do Excel ou 31/12/9999', () => {
  const idx = A.indexar([
    linha('000123456', '507 - LICENCA SEM VENCIMENTO', '03/02/2019', '02/05/2019'),
    linha(123456, '508 - LICENCA MÉDICA - EFETIVOS', '01/01/2020', '10/01/2020'),
    linha('123456', '605 - LICENCA PARA ACOMPANHAMENTO CONJUGE', 43800, '31/12/9999'),
    linha('999999999', '507 - LICENCA SEM VENCIMENTO', '', '01/01/2020')
  ]);
  assert.deepStrictEqual(Object.keys(idx), ['000123456']);
  assert.strictEqual(idx['000123456'].length, 2);
  assert.deepStrictEqual(idx['000123456'][1].inicio, dt(1, 12, 2019));
  assert.strictEqual(idx['000123456'][1].fim.a, 9999);
});

test('analisar: impedimento dentro do decênio reinicia a contagem e gera a observação', () => {
  const idx = A.indexar([linha('1', '507 - LICENCA SEM VENCIMENTO', '03/02/2019', '02/05/2019')]);
  const r = A.analisar(idx['000000001'], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026));
  assert.strictEqual(r.impedem.length, 1);
  assert.deepStrictEqual(r.reinicio, dt(2, 5, 2019));
  assert.deepStrictEqual(r.completa, dt(2, 5, 2029));
  assert.match(r.observacao, /decênio 2014\/2024/);
  assert.match(r.observacao, /impedimento por licença sem vencimentos \(03\/02\/2019 a 02\/05\/2019\)/);
  assert.match(r.observacao, /a partir de 02\/05\/2019, completando-se em 02\/05\/2029/);
});

test('analisar: afastamento fora do decênio ou que não impede não gera nada', () => {
  const idx = A.indexar([linha('1', '507 - LICENCA SEM VENCIMENTO', '03/02/2010', '02/05/2010'), linha('1', '507 - LICENCA SEM VENCIMENTO', '03/02/2025', '02/05/2025')]);
  const r = A.analisar(idx['000000001'], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026));
  assert.strictEqual(r.impedem.length, 0);
  assert.strictEqual(r.observacao, '');
  assert.strictEqual(A.analisar([], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026)).impedem.length, 0);
});

test('analisar: doença em pessoa da família só impede se passar de 30 dias (registros seguidos são somados)', () => {
  const curto = A.indexar([linha('1', '509 - LICENCA ACOMPANHAMENTO SAUDE FAMILIA', '01/03/2018', '30/03/2018')]);
  assert.strictEqual(A.analisar(curto['000000001'], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026)).impedem.length, 0);
  const longo = A.indexar([linha('1', '509 - LICENCA ACOMPANHAMENTO SAUDE FAMILIA', '01/03/2018', '20/03/2018'), linha('1', '509 - LICENCA ACOMPANHAMENTO SAUDE FAMILIA', '21/03/2018', '20/04/2018')]);
  const r = A.analisar(longo['000000001'], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026));
  assert.strictEqual(r.impedem.length, 1);
  assert.strictEqual(r.impedem[0].dias, 51);
});

test('analisar: afastamento em andamento (31/12/9999) não reinicia o decênio ainda', () => {
  const idx = A.indexar([linha('1', '605 - LICENCA PARA ACOMPANHAMENTO CONJUGE', '01/06/2023', '31/12/9999')]);
  const r = A.analisar(idx['000000001'], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026));
  assert.strictEqual(r.emCurso, true);
  assert.strictEqual(r.reinicio, null);
  assert.match(r.observacao, /desde 01\/06\/2023/);
  assert.match(r.observacao, /impede a concessão e o gozo da licença prêmio enquanto perdurar/);
});

test('analisar: inquérito administrativo em andamento impede a concessão', () => {
  const idx = A.indexar([linha('1', '516 - RESPONDENDO A PROCESSO ADM', '01/06/2020', '31/12/9999')]);
  const r = A.analisar(idx['000000001'], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026));
  assert.strictEqual(r.emCurso, true);
  assert.match(r.observacao, /impedimento por inquérito administrativo \(desde 01\/06\/2020\), e há impedimento ainda em andamento/);
});

test('analisar: o que é "verificar" vai só para os avisos; decênio ainda não completo é avisado; sem admissão ou decênio devolve null', () => {
  const idx = A.indexar([linha('1', '518 - CEDIDO PARA OUTRO ORGÃO COM ÔNUS PARA ÓRGÃO DE ORIGEM', '01/06/2020', '01/06/2021')]);
  const r = A.analisar(idx['000000001'], dt(15, 6, 2004), '2014/2024', dt(1, 3, 2026));
  assert.strictEqual(r.impedem.length, 0);
  assert.strictEqual(r.verificar.length, 1);
  assert.strictEqual(r.observacao, '');
  assert.ok(A.avisos(r).some(t => /Confira: cedido para outro órgão/.test(t)));
  const futuro = A.analisar([], dt(15, 6, 2004), '2024/2034', dt(1, 3, 2026));
  assert.strictEqual(futuro.incompleto, true);
  assert.ok(A.avisos(futuro).some(t => /só se completa em 15\/06\/2034/.test(t)));
  assert.strictEqual(A.analisar([], null, '2014/2024'), null);
  assert.strictEqual(A.analisar([], dt(15, 6, 2004), '2013/____'), null);
});
