# GEMOP — orientações para o Claude

Projeto da SEGEP (Secretaria Executiva de Gestão de Pessoas, Prefeitura do Jaboatão dos Guararapes).
O usuário fala português e não é programador: respostas em português, sem jargão, com passos práticos.

## O que existe

Dois programas usam as mesmas planilhas e o mesmo `js/dados.js`: o Requerimento do Servidor e as **Portarias**.

- **Requerimento do Servidor** ("Dados do Servidor"): página `index.html` + `js/app.js` (tela e folha A4)
  + `js/dados.js` (regras de extração, funções puras). Detalhes das regras no `README.md`.
- **Portarias**: `portarias.html` + `js/portarias-app.js` (tela) + `js/portarias.js` (modelos e regras, funções puras;
  cada modelo = campos + texto, é só incluir em `TIPOS`). Usa só a FichaContabilis. `Portarias.bat` → `servidor.ps1`
  com `-Pagina portarias.html` (porta própria, 8790+). Modelos atuais: exoneração a pedido, deferimento, indeferimento, readaptação.
- **Leitura de planilhas** compartilhada: `js/planilhas.js` (`.xlsx`, pasta, servidor local).
- **Aplicativo local**: `Requerimento.bat` → `servidor.ps1` (Windows PowerShell 5.1, sem instalação; atende só
  127.0.0.1, entrega a página e as planilhas da pasta `planilhas/` ou do caminho em `pasta.txt`).
- **Versão em arquivo único**: `python3 build_standalone.py saida.html [requerimento|portarias]` embute scripts, logo e fontes.

## Planilhas (exportadas do sistema de RH; contêm dados pessoais — nunca versionar)

- **FichaContabilis** (antigo "INDICE CEDIDOS SAD"): aba `SERVIDORES`, colunas `nu_matricula`, `nm_Funcionario`,
  `nu_cpfFunc`, `dt_nascimento`, `dt_admissao` (datas como número serial do Excel), `nm_cargo`, `nm_nivel`,
  `fl_situacaoAtual`, `nm_localTrabalho`, `vl_salario`, `dt_anoMes`. Vale o arquivo mais recente.
- **relFichaCadastralCompleta** (pode haver várias, ex. `...GABINETE`; todas com `FichaCadastral` no nome são
  somadas, e o servidor repetido vem do arquivo mais recente): abas `Servidores`, `Lotacoes`, `Afastamentos`,
  `Ferias`, `Faltas`. A ligação entre as planilhas é a matrícula (9 dígitos com zeros à esquerda).
- Ao reaproveitar a leitura em outro programa (ex.: Portarias), use `js/dados.js` (`montarBase`, `paraData`,
  `formatarMatricula`, `formatarCPF`, `combinarFichas` etc.) em vez de reescrever.

## Como trabalhar

- Testes: `node --test` (regras em `tests/dados.test.js` e `tests/portarias.test.js`; usar só dados inventados). Teste também no navegador (Playwright/Chromium estão
  disponíveis) e confira que a folha cabe em **uma página A4** para todos os servidores.
- Nunca commitar `.xlsx`, `.pdf` ou dados de servidores (o `.gitignore` já bloqueia).
- Ao terminar uma mudança: gerar o zip do app local
  (`git archive --format=zip --prefix="Requerimento do Servidor/" HEAD Requerimento.bat Portarias.bat servidor.ps1 pasta.txt index.html portarias.html js vendor assets planilhas README.md`)
  e os arquivos únicos (`requerimento` e `portarias`), e enviar ao usuário.
