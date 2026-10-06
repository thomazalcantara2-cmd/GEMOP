# GEMOP — orientações para o Claude

Projeto da SEGEP (Secretaria Executiva de Gestão de Pessoas, Prefeitura do Jaboatão dos Guararapes).
O usuário fala português e não é programador: respostas em português, sem jargão, com passos práticos.

## O que existe

- **Requerimento do Servidor** ("Dados do Servidor"): página `index.html` + `js/app.js` (tela e folha A4)
  + `js/dados.js` (regras de extração, funções puras). Detalhes das regras no `README.md`.
- **Aplicativo local**: `Requerimento.bat` → `servidor.ps1` (Windows PowerShell 5.1, sem instalação; atende só
  127.0.0.1, entrega a página e as planilhas da pasta `planilhas/` ou do caminho em `pasta.txt`).
- **Versão em arquivo único**: `python3 build_standalone.py saida.html` embute scripts, logo e fontes.

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

- Testes: `node --test` (regras em `tests/dados.test.js`). Teste também no navegador (Playwright/Chromium estão
  disponíveis) e confira que a folha cabe em **uma página A4** para todos os servidores.
- Nunca commitar `.xlsx`, `.pdf` ou dados de servidores (o `.gitignore` já bloqueia).
- Ao terminar uma mudança: gerar o zip do app local
  (`git archive --format=zip --prefix="Requerimento do Servidor/" HEAD Requerimento.bat servidor.ps1 pasta.txt index.html js vendor assets planilhas README.md`)
  e o arquivo único, e enviar ao usuário.
