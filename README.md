# GEMOP — Requerimento do Servidor (Cedidos SAD)

Página que preenche automaticamente o **Requerimento do Servidor** a partir de duas planilhas
exportadas do sistema de RH:

| Planilha | Aba usada | Campos |
|---|---|---|
| `INDICE CEDIDOS SAD` | `SERVIDORES` | Nome, Matrícula, CPF, Data de admissão, Data de nascimento, Cargo (+ nível), Tipo de vínculo, Salário (Informações financeiras) |
| `relFichaCadastralCompleta` | `Lotacoes`, `Afastamentos`, `Ferias`, `Faltas` (e `Servidores`) | Lotação atual, Órgão de origem, Tipo de afastamento, Informações complementares, Status funcional |

## Aplicativo local (recomendado no Windows)

1. Salve os relatórios na pasta `planilhas` (ou escreva em `pasta.txt` o caminho da pasta onde você já os salva,
   por exemplo `C:\Users\seu.usuario\Downloads`).
2. Dê dois cliques em **`Requerimento.bat`**. Abre uma janela preta (o aplicativo) e o navegador já com as
   planilhas carregadas — sempre o arquivo mais recente de cada tipo. Deixe a janela aberta enquanto usar;
   feche-a para encerrar. O botão **Recarregar planilhas** relê a pasta sem reiniciar.
3. Para ter um ícone na Área de Trabalho: botão direito em `Requerimento.bat` → *Enviar para* → *Área de trabalho (criar atalho)*.

Não precisa instalar nada: usa o Windows PowerShell que já vem no Windows. O `servidor.ps1` só atende
este computador (`127.0.0.1`), só entrega as planilhas `.xlsx` da pasta configurada e os arquivos da página,
e nenhum dado sai do computador.

## Como usar sem o aplicativo

1. Abra o arquivo `index.html` no Chrome ou no Edge (duplo clique; não precisa de internet nem instalação).
2. Clique em **Escolher pasta das planilhas** e selecione a pasta onde ficam os relatórios (só na primeira vez).
   Nas próximas vezes a página lê a pasta sozinha ao abrir — se o navegador pedir, clique em
   **Carregar da pasta** e em **Permitir** (no Chrome, escolha "Permitir em todas as visitas").
   Na pasta, usa o arquivo mais recente cujo nome contém `INDICE`/`CEDIDOS` e o mais recente com
   `FichaCadastral`. Também é possível arrastar as duas planilhas `.xlsx` para a área indicada.
3. Digite o nome do servidor (também aceita matrícula ou CPF) e escolha na lista.
4. Preencha o protocolo e confira as datas.
5. Clique em **Imprimir / Salvar PDF**. Qualquer campo da folha pode ser corrigido clicando sobre ele antes de imprimir.

As planilhas são lidas apenas no navegador: nenhum dado de servidor é enviado para a internet
ou gravado. Apenas os textos fixos do formulário (DE, PARA, assinaturas, informações
complementares) ficam salvos no computador.

## Regras de preenchimento

- **Tempo de serviço**: da data de admissão até a *Data de emissão* (padrão: hoje), em anos, meses e dias.
  Ex.: admissão 01/11/2016, emissão 16/09/2026 → `09 ANOS, 10 MESES E 15 DIAS.`
- **Lotação**: `Local de Trabalho (descrição)` da lotação mais recente (maior data de início) na aba `Lotacoes`.
- **Órgão de origem**: percorre o histórico da aba `Lotacoes` do mais recente para o mais antigo e usa o
  primeiro `Órgão (descrição)` que **não** seja a Secretaria Municipal de Administração
  (`SECRETARIA MUNICIPAL DE ADMINISTRACAO` ou `SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO, GOVERNO DIGITAL E INOVAÇÃO`).
  Se o servidor sempre esteve na Administração, usa o órgão atual e mostra um aviso.
  A lista de órgãos ignorados pode ser alterada na seção *Regra do órgão de origem*.
- **Tipo de afastamento**: todos os afastamentos da aba `Afastamentos`, agrupados por tipo (`Descrição (descrição)`)
  em ordem cronológica, com os períodos. Períodos seguidos do mesmo tipo são unidos
  (ex.: 01/01/2025 a 31/12/2025 + 01/01/2026 a 31/12/2026 → 01/01/2025 a 31/12/2026).
  Sem afastamentos, o campo fica com `x - x - x`.
- **Informações complementares** (o texto de cada item pode ser ajustado na tela; os marcadores entre chaves
  são preenchidos automaticamente):
  - `{faltas}` — aba `Faltas`: sem registros → `NÃO CONSTAM faltas...`; com registros → `CONSTAM faltas...` e as datas.
  - `{estagio}` — admissão + 3 anos (admitidos até 07/03/1996: + 2 anos), comparado com a data de emissão:
    já terminou → `O servidor **CONCLUIU** o estágio probatório em dd/mm/aaaa.`;
    ainda em curso → `Servidor em estágio probatório, com término previsto em dd/mm/aaaa (faltam ...)`.
  - `{ferias_licencas}` — férias: último registro da aba `Ferias` (maior *Início Gozo*), com Início/Fim Gozo e
    quantidade de dias; licença-prêmio e licença para estudos: último período na aba `Afastamentos`.
    Cada item que consta fica numa linha (`**CONSTA** gozo de ...`); os que não constam ficam juntos numa
    linha só (`NÃO CONSTA gozo de ...`).
  - `CONSTA`, `CONSTAM`, `NÃO CONSTA` e `NÃO CONSTAM` (em maiúsculas) saem sempre em negrito;
    no texto configurável, `**trecho**` também sai em negrito.
- **Matrícula**: `002076671` → `20.766-7.1`.
- **Tipo de vínculo**: `Status Funcional` da ficha + situação do INDICE, ex.: `ESTATUTARIO ATIVO/CARGO EFETIVO`.
- **Informações financeiras**: `vl_salario` do INDICE, com valor por extenso.

## Estrutura

- `Requerimento.bat` / `servidor.ps1` — aplicativo local (servidor só para este computador, PowerShell 5.1+)
- `pasta.txt` — caminho opcional da pasta das planilhas; `planilhas/` — pasta padrão
- `index.html` — interface e layout da folha A4
- `js/dados.js` — regras de extração (funções puras, testadas)
- `js/app.js` — leitura das planilhas, busca e montagem da folha
- `vendor/xlsx.full.min.js` — [SheetJS](https://sheetjs.com) 0.18.5 (Apache-2.0), leitura de `.xlsx`
- `tests/` — testes das regras: `node --test`

> As planilhas contêm dados pessoais (CPF, endereço etc.). O `.gitignore` impede que arquivos
> `.xlsx`/`.pdf` sejam enviados ao repositório — mantenha-as fora dele.
