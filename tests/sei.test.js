// Testes da leitura dos processos do SEI. Usa só documentos inventados (nunca dados reais de servidores).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const S = require('../js/sei.js');
const D = require('../js/dados.js');
const Docx = require('../js/docx.js');
const Zip = require('../js/zip.js');

const dt = (d, m, a) => ({ a, m, d });

// monta um documento no estilo do SEI (entidades HTML, linhas em <p>)
const doc = (linhas) => '<html><body>' + linhas.map((l) => '<p>' + l.replace(/ç/g, '&ccedil;').replace(/ã/g, '&atilde;').replace(/ê/g, '&ecirc;')
  .replace(/é/g, '&eacute;').replace(/í/g, '&iacute;').replace(/ú/g, '&uacute;').replace(/Ç/g, '&Ccedil;').replace(/Ã/g, '&Atilde;') + '</p>').join('') + '</body></html>';

const PROC = '26.17.000000001-1';
const ficha = (extra) => doc(['SEI/PMJG - 1000001 - Ficha Funcional', 'SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO', 'INFORMAÇÕES FUNCIONAIS',
  'SEI. ' + PROC, 'ASSUNTO: LICENÇA-PRÊMIO', 'NOME : FULANA DE TESTE DA SILVA', 'MATRÍCULA: 12.345-6', 'ADMISSÃO: 01/03/2004',
  'CARGO: (10382) PROFESSOR 1', 'ÓRGÃO DE ORIGEM: SECRETARIA MUNICIPAL DE EDUCAÇÃO', 'LOTAÇÃO: ESCOLA TESTE'].concat(extra || [
  'NO DECÊNIO DE 2004/2014 GOZOU 06 MESES DE LICENÇA PRÊMIO.', 'NO DECÊNIO DE 2014/2024 GOZOU 01 MÊS DE LICENÇA PRÊMIO.',
  'A SERVIDORA TEM (05 MESES) DISPONÍVEIS PARA GOZO DE LICENÇA PRÊMIO .', PROC]));
const despacho = (id, secretaria, texto) => ({ nome: '[05]-' + id + '_Despacho.html', html: doc(['SEI/PMJG - ' + id + ' - Despacho', secretaria, 'Despacho'].concat(texto, [PROC])) });

test('texto do HTML: entidades, quebras e espaços', () => {
  assert.strictEqual(S.textoDoHtml('<p>Licen&ccedil;a&nbsp;Pr&ecirc;mio</p><p>A&#231;&Atilde;O &amp; mais</p>'), 'Licença Prêmio\nAçÃO & mais');
});

test('nome do arquivo e número do processo', () => {
  assert.deepStrictEqual(S.infoDoArquivo('[03]-1110422_Ficha_Funcional.html'), { nome: '[03]-1110422_Ficha_Funcional.html', ordem: 3, id: '1110422', tipo: 'ficha funcional', ext: 'html' });
  assert.strictEqual(S.infoDoArquivo('pasta/[14]-1164033_Portaria_1392_2026.html').tipo, 'portaria');
  assert.strictEqual(S.infoDoArquivo('[01]-0922825_Requerimento.pdf').ext, 'pdf');
  assert.strictEqual(S.numeroDoProcesso('algo 26.9.000003480-5 e 26.9.000003480-5 e 26.17.000000009-9'), '26.9.000003480-5');
});

test('cada mês vale 30 dias: fim do gozo', () => {
  const fim = (d, m, a, meses) => S.br(S.fimDoGozo(dt(d, m, a), meses));
  assert.strictEqual(fim(14, 9, 2026, 1), '13/10/2026');
  assert.strictEqual(fim(1, 9, 2026, 2), '30/10/2026');      // e não 31/10
  assert.strictEqual(fim(21, 8, 2026, 6), '16/02/2027');
  assert.strictEqual(fim(3, 11, 2026, 2), '01/01/2027');
  assert.strictEqual(fim(1, 10, 2026, 1), '30/10/2026');
});

test('período nos despachos: datas com espaços, números por extenso e mês inteiro', () => {
  const p = (t) => S.periodoDoTexto(t);
  let r = p('O requerente faz jus ao pedido de licença prêmio por 1 (um) MÊS , A PARTIR DE 14 / 09 /202 6 , de acordo com');
  assert.strictEqual(S.br(r.inicio), '14/09/2026'); assert.strictEqual(r.meses, 1); assert.strictEqual(r.dias, 30);
  r = p('licença prêmio por 2 (DOIS) MESES , A PARTIR DE 01 / 09 /202 6 ,');
  assert.strictEqual(r.meses, 2); assert.strictEqual(S.br(r.inicio), '01/09/2026');
  r = p('solicita 30 dias a partir de 14 de setembro de 2026 para o gozo');
  assert.strictEqual(S.br(r.inicio), '14/09/2026'); assert.strictEqual(r.meses, 1);
  r = p('solicita os meses de SETEMBRO e OUTUBRO de 2026 para o gozo');
  assert.strictEqual(S.br(r.inicio), '01/09/2026'); assert.strictEqual(r.meses, 2);
  r = p('DEFIRO o pedido para o mês de outubro de 2026 (por um período de 30 dias).');
  assert.strictEqual(S.br(r.inicio), '01/10/2026'); assert.strictEqual(r.meses, 1);
  r = p('deferida para o mês de outubro/2026, conforme análise');
  assert.strictEqual(S.br(r.inicio), '01/10/2026');
  assert.strictEqual(p('Para análise e pronunciamento.'), null);
});

test('Ficha: decênios, saldo e decênio sugerido (o mais antigo com saldo)', () => {
  const f = S.lerFicha(S.textoDoHtml(ficha()));
  assert.strictEqual(f.nome, 'FULANA DE TESTE DA SILVA');
  assert.strictEqual(f.matricula, '12.345-6');
  assert.deepStrictEqual(f.admissao, dt(1, 3, 2004));
  assert.deepStrictEqual(f.decenios, [{ ini: 2004, fim: 2014, gozou: 6 }, { ini: 2014, fim: 2024, gozou: 1 }]);
  assert.strictEqual(f.saldo, 5);
  const d = S.decenioSugerido(f.decenios);
  assert.strictEqual(d.ini + '/' + d.fim, '2014/2024');
  const nunca = S.lerFicha(S.textoDoHtml(ficha(['NO DECÊNIO DE 2003/2013 NÃO GOZOU LICENÇA-PRÊMIO.', 'NO DECÊNIO DE 2013/2023 NÃO GOZOU LICENÇA-PRÊMIO.', 'TEM 12 MESES DISPONÍVEIS'])));
  assert.strictEqual(S.decenioSugerido(nunca.decenios).ini, 2003);
  assert.strictEqual(nunca.saldo, 12);
});

test('processo deferido (estilo Educação): decisão, decênio, período e fim', () => {
  const r = S.lerProcesso([
    { nome: '[03]-1000001_Ficha_Funcional.html', html: ficha() },
    despacho('1000002', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', ['Licença Prêmio/Deferimento', 'O requerente faz jus ao pedido de licença prêmio por 1 (um) MÊS , A PARTIR DE 03 / 11 /202 6 , de acordo com']),
    { nome: '[01]-0999999_Requerimento.pdf', html: '' }
  ]);
  assert.strictEqual(r.processo, PROC);
  assert.strictEqual(r.decisao, 'deferida');
  assert.strictEqual(r.decenioSugerido, '2014/2024');
  assert.strictEqual(S.br(r.periodo.inicio), '03/11/2026');
  assert.strictEqual(S.br(r.periodo.fim), '02/12/2026');
  assert.strictEqual(r.fundamento, null);
  assert.deepStrictEqual(r.ignorados, ['[01]-0999999_Requerimento.pdf']);
  assert.strictEqual(r.bloqueio, '');
});

test('processo indeferido (estilo Saúde): fundamento é o despacho do INDEFIRO, com a secretaria do cabeçalho', () => {
  const r = S.lerProcesso([
    { nome: '[03]-1000001_Ficha_Funcional.html', html: ficha() },
    despacho('1000003', 'SECRETARIA MUNICIPAL DE SAÚDE', ['Considerando o NÃO atendimento aos requisitos legais, INDEFIRO o pedido de gozo da Licença Prêmio para o mês de outubro de 2026.']),
    despacho('1000004', 'SECRETARIA MUNICIPAL DE SAÚDE', ['Conforme despacho 1000003, solicitamos novo período.'])
  ]);
  assert.strictEqual(r.decisao, 'indeferida');
  assert.deepStrictEqual(r.fundamento, { id: '1000003', tipo: 'despacho', secretaria: 'SECRETARIA MUNICIPAL DE SAÚDE' });
});

test('"possibilidade de deferimento ou não" não é decisão; INDEFIRO não vira deferimento', () => {
  const r = S.lerProcesso([
    { nome: '[03]-1000001_Ficha_Funcional.html', html: ficha() },
    despacho('1000005', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', ['Informar da possibilidade de deferimento ou não.'])
  ]);
  assert.strictEqual(r.decisao, null);
  assert.ok(r.alertas.some((a) => /decisão/.test(a)));
});

test('despacho de cancelamento bloqueia o processo e não conta como período', () => {
  const r = S.lerProcesso([
    { nome: '[03]-1000001_Ficha_Funcional.html', html: ficha() },
    despacho('1000002', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', ['Licença Prêmio/Deferimento', 'faz jus ao pedido por 1 (um) MÊS, A PARTIR DE 03/11/2026,']),
    despacho('1000006', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', ['A SERVIDORA SOLICITOU O CANCELAMENTO DA LICENÇA-PRÊMIO PARA O MÊS DE NOVEMBRO/2026.'])
  ]);
  assert.ok(r.bloqueio);
  assert.strictEqual(S.br(r.periodo.inicio), '03/11/2026');
  assert.ok(!r.alertas.some((a) => /não concordam/.test(a)));
});

test('compara com a portaria já feita no processo', () => {
  const tabela = '<table><tr><td>Nº Processo</td><td>Nome</td></tr><tr><td>' + PROC + '</td><td>FULANA</td><td>0.0123456.1</td><td>Municipal de Educação</td><td>2004/2014</td><td>03.11.2026 a 01.01.2027</td></tr></table>';
  const r = S.lerProcesso([
    { nome: '[03]-1000001_Ficha_Funcional.html', html: ficha() },
    despacho('1000002', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', ['Licença Prêmio/Deferimento', 'faz jus ao pedido por 1 (um) MÊS, A PARTIR DE 03/11/2026,']),
    { nome: '[09]-1000009_Portaria_1000_2026.html', html: doc(['Portaria Nº 1000/2026, DE 01 DE outubro DE 2026.', 'Art. 1º. CONCEDER o gozo', PROC]) + tabela }
  ]);
  assert.ok(r.alertas.some((a) => /período é "03\.11\.2026 a 01\.01\.2027"/.test(a)));
  assert.ok(r.alertas.some((a) => /decênio é 2004\/2014/.test(a)));
});

test('agrupa arquivos soltos por processo', () => {
  const outro = '26.18.000000002-2';
  const lista = S.lerProcessos([
    { nome: '[03]-1000001_Ficha_Funcional.html', html: ficha() },
    { nome: '[03]-2000001_Ficha_Funcional.html', html: ficha().replace(new RegExp(PROC.replace(/\./g, '\\.'), 'g'), outro).replace('FULANA DE TESTE', 'BELTRANA DE TESTE') }
  ]);
  assert.deepStrictEqual(lista.map((p) => p.processo), [PROC, outro]);
  assert.strictEqual(lista[1].servidor.nome, 'BELTRANA DE TESTE DA SILVA');
});

test('achar o servidor na planilha: nome, matrícula em vários formatos e homônimos', () => {
  const base = D.montarBase([
    { nm_Funcionario: 'FULANA DE TESTE DA SILVA', nu_matricula: '001234561', nu_cpfFunc: 1, nm_cargo: 'X', nm_nivel: 'A', fl_situacaoAtual: 'Ativo', nm_centroCusto: 'C', cd_centroCusto: '1401', tp_sexo: 'F', nm_localTrabalho: 'C', vl_salario: 1, dt_anoMes: 202609 },
    { nm_Funcionario: 'BELTRANA OUTRA', nu_matricula: '001000011', nu_cpfFunc: 2, nm_cargo: 'X', nm_nivel: 'A', fl_situacaoAtual: 'Ativo', nm_centroCusto: 'C', cd_centroCusto: '1401', tp_sexo: 'F', nm_localTrabalho: 'C', vl_salario: 1, dt_anoMes: 202609 }
  ], { servidores: [], lotacoes: [] });
  assert.ok(S.matriculaCombina('001234561', '12.345-6'));
  assert.ok(S.matriculaCombina('001234561', '0.0123456.1'));
  assert.ok(S.matriculaCombina('001234561', '001234561'));
  assert.ok(!S.matriculaCombina('001234561', '16.204-3'));
  assert.strictEqual(S.acharServidor(base, { nome: 'Fulana de Teste da Silva', matricula: '12.345-6' }).servidor.nome, 'FULANA DE TESTE DA SILVA');
  assert.strictEqual(S.acharServidor(base, { nome: 'FULANA DE TESTE DA SILVA', matricula: '12.345-6' }).aviso, '');
  const pelaMat = S.acharServidor(base, { nome: 'FULANA T. SILVA', matricula: '12.345-6' });
  assert.strictEqual(pelaMat.servidor.nome, 'FULANA DE TESTE DA SILVA'); assert.ok(pelaMat.aviso);
  const nao = S.acharServidor(base, { nome: 'NINGUEM', matricula: '99.999-9' });
  assert.strictEqual(nao.servidor, null);
});

test('lê um .zip sem compressão e comprimido', async () => {
  const conteudo = Buffer.from('<p>ola</p>');
  const arquivos = [{ nome: '[01]-1_Despacho.html', dados: Uint8Array.from(conteudo) }];
  const parado = Docx.zip(arquivos);
  const lido = await Zip.lerZip(parado);
  assert.strictEqual(lido[0].nome, '[01]-1_Despacho.html');
  assert.strictEqual(Buffer.from(lido[0].dados).toString(), '<p>ola</p>');
  // zip com deflate montado à mão (um arquivo)
  const comp = zlib.deflateRawSync(conteudo);
  const nome = Buffer.from('a.html');
  const crc = Docx.crc32(conteudo);
  const w16 = (v) => Buffer.from([v & 255, (v >> 8) & 255]), w32 = (v) => Buffer.from([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  const local = Buffer.concat([Buffer.from([0x50, 0x4B, 3, 4]), w16(20), w16(0), w16(8), w16(0), w16(0), w32(crc), w32(comp.length), w32(conteudo.length), w16(nome.length), w16(0), nome, comp]);
  const central = Buffer.concat([Buffer.from([0x50, 0x4B, 1, 2]), w16(20), w16(20), w16(0), w16(8), w16(0), w16(0), w32(crc), w32(comp.length), w32(conteudo.length), w16(nome.length), w16(0), w16(0), w16(0), w16(0), w32(0), w32(0), nome]);
  const fim = Buffer.concat([Buffer.from([0x50, 0x4B, 5, 6]), w16(0), w16(0), w16(1), w16(1), w32(central.length), w32(local.length), w16(0)]);
  const lido2 = await Zip.lerZip(Uint8Array.from(Buffer.concat([local, central, fim])));
  assert.strictEqual(Buffer.from(lido2[0].dados).toString(), '<p>ola</p>');
});
