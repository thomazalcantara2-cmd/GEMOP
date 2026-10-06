# GEMOP — Requerimento do Servidor (Cedidos SAD) e Portarias

Este projeto tem dois programas que usam as mesmas planilhas: o **Requerimento do Servidor** (abaixo) e as
**Portarias** (seção *Portarias*, mais adiante).

Página que preenche automaticamente o **Requerimento do Servidor** a partir de duas planilhas
exportadas do sistema de RH:

| Planilha | Aba usada | Campos |
|---|---|---|
| `FichaContabilis` (antigo `INDICE CEDIDOS SAD`) | `SERVIDORES` | Nome, Matrícula, CPF, Data de admissão, Data de nascimento, Cargo (+ nível), Tipo de vínculo |
| `relFichaCadastralCompleta` | `Lotacoes`, `Afastamentos`, `Ferias`, `Faltas` (e `Servidores`) | Lotação atual, Órgão de origem, Tipo de afastamento, Informações complementares, Status funcional |

## Aplicativo local (recomendado no Windows)

1. Salve os relatórios na pasta `planilhas` (ou escreva em `pasta.txt` o caminho da pasta onde você já os salva,
   por exemplo `C:\Users\seu.usuario\Downloads`).
2. Dê dois cliques em **`Requerimento.bat`**. Abre uma janela preta (o aplicativo) e o navegador já com as
   planilhas carregadas — sempre o arquivo mais recente de cada tipo. Deixe a janela aberta enquanto usar;
   feche-a para encerrar. O botão **Recarregar planilhas** relê a pasta sem reiniciar.
   Pode haver **mais de uma Ficha Cadastral** na pasta (ex.: `relFichaCadastralCompleta.main.xlsx` e
   `relFichaCadastralCompletaGABINETE.main.xlsx`): todas com `FichaCadastral` no nome são lidas e somadas.
   Se um servidor aparecer em mais de uma, vale o arquivo mais recente (assim versões antigas na pasta não
   duplicam dados). Da FichaContabilis, vale só o arquivo mais recente.
3. Para ter um ícone na Área de Trabalho: botão direito em `Requerimento.bat` → *Enviar para* → *Área de trabalho (criar atalho)*.

Não precisa instalar nada: usa o Windows PowerShell que já vem no Windows. O `servidor.ps1` só atende
este computador (`127.0.0.1`), só entrega as planilhas `.xlsx` da pasta configurada e os arquivos da página,
e nenhum dado sai do computador.

## Como usar sem o aplicativo

1. Abra o arquivo `index.html` no Chrome ou no Edge (duplo clique; não precisa de internet nem instalação).
2. Clique em **Escolher pasta das planilhas** e selecione a pasta onde ficam os relatórios (só na primeira vez).
   Nas próximas vezes a página lê a pasta sozinha ao abrir — se o navegador pedir, clique em
   **Carregar da pasta** e em **Permitir** (no Chrome, escolha "Permitir em todas as visitas").
   Na pasta, usa o arquivo mais recente cujo nome contém `FichaContabilis` (ou o antigo `INDICE`/`CEDIDOS`)
   e todos com `FichaCadastral`. Também é possível arrastar as duas planilhas `.xlsx` para a área indicada.
3. Digite o nome do servidor (também aceita matrícula ou CPF) e escolha na lista.
4. Confira a data de emissão (é também a data final do cálculo do tempo de serviço).
5. Clique em **Imprimir / Salvar PDF**. Qualquer campo da folha pode ser corrigido clicando sobre ele antes de imprimir.

As planilhas são lidas apenas no navegador: nenhum dado de servidor é enviado para a internet
ou gravado. Apenas os textos fixos do formulário (informações complementares e a regra do órgão
de origem) ficam salvos no computador.

A folha segue o modelo **"Dados do Servidor"** (faixas nas cores da Prefeitura): nome em destaque; quadro-resumo
com matrícula, CPF, nascimento, admissão, tempo de serviço, cargo e vínculo; tabela Campo / Informação /
Observações com órgão de origem, lotação e afastamentos; **Histórico de lotação**; e informações complementares.
Abaixo do nome de cada campo, em letra pequena, aparece a planilha de onde a informação veio (**Contabilis** ou
**Ficha Cadastral Completa**); a coluna **Observações** traz os alertas do campo e pode ser digitada na tela.
Se o conteúdo não couber numa página A4, o tamanho da letra é reduzido automaticamente.

O painel da esquerda pode ser recolhido pelo botão **‹** (e reaberto pelo **›**); a escolha fica lembrada.
Os arquivos carregados, o botão de recarregar e a escolha de pasta ficam no quadro **Planilhas carregadas**,
no fim do painel — ele abre sozinho quando falta alguma planilha. As planilhas também podem ser arrastadas
para qualquer lugar da página.

## Regras de preenchimento

- **Tempo de serviço**: da data de admissão até a *Data* do documento (padrão: hoje), em anos, meses e dias.
  Ex.: admissão 01/11/2016, emissão 16/09/2026 → `09 ANOS, 10 MESES E 15 DIAS.`
- **Lotação**: `Local de Trabalho (descrição)` da lotação mais recente (maior data de início) na aba `Lotacoes`.
- **Órgão de origem**: percorre o histórico da aba `Lotacoes` do mais recente para o mais antigo e usa o
  primeiro `Órgão (descrição)` que **não** seja a Secretaria Municipal de Administração
  (`SECRETARIA MUNICIPAL DE ADMINISTRACAO` ou `SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO, GOVERNO DIGITAL E INOVAÇÃO`).
  Se o servidor sempre esteve na Administração, usa o órgão atual. De onde veio o órgão de origem (período
  e local da lotação) e esses alertas aparecem na coluna **Observações** da própria linha.
  A lista de órgãos ignorados pode ser alterada na seção *Regra do órgão de origem*.
- **Histórico de lotação**: aba `Lotacoes`, em ordem cronológica. Registros seguidos com o mesmo
  `Órgão`, `Unid. Orçamentária` e `Local de Trabalho` (a ficha traz um por ano) viram um só período (colunas
  **Início** e **Fim**), com a data
  de início do primeiro e a de fim do último (`atual` se ainda em aberto).
  No painel, em **Histórico de lotação — contar períodos por**, escolha um ou mais campos (Órgão, Unidade
  orçamentária, Local de trabalho): um novo período começa só quando muda algum dos campos marcados, e a tabela
  mostra apenas essas colunas. Ex.: marcando só *Local de trabalho*, uma troca de órgão com o mesmo local não
  quebra o período. A escolha fica lembrada no navegador.
- **Afastamentos**: todos os afastamentos da aba `Afastamentos`, agrupados por tipo (`Descrição (descrição)`)
  em ordem cronológica, com os períodos. Períodos seguidos do mesmo tipo são unidos
  (ex.: 01/01/2025 a 31/12/2025 + 01/01/2026 a 31/12/2026 → 01/01/2025 a 31/12/2026).
  O nome do tipo aparece por extenso (ex.: `LICENCA PREMIO` → **Licença-prêmio**); quando o tipo tem mais de
  um período, os períodos ficam um abaixo do outro. Sem afastamentos, o campo fica com `x - x - x`.
- **Informações complementares** (padrão: faltas; férias e licenças; processo disciplinar; contrato temporário — o texto de cada item pode ser ajustado na tela; os marcadores entre chaves
  são preenchidos automaticamente):
  - `{faltas}` — aba `Faltas`: sem registros → `NÃO CONSTAM faltas...`; com registros → `CONSTAM faltas...` e as datas.
  - `{estagio}` — **retirado do texto padrão por enquanto** (pode ser recolocado digitando `{estagio}` numa linha
    das informações complementares, na tela). Regra: admissão + 3 anos (admitidos até 07/03/1996: + 2 anos), comparado com a data do documento:
    já terminou → `O servidor **CONCLUIU** o estágio probatório em dd/mm/aaaa.`;
    ainda em curso → `Servidor em estágio probatório, com término previsto em dd/mm/aaaa (faltam ...)`.
  - `{ferias_licencas}` — férias (aba `Ferias`), comparando o *Exercício* com o ano da data do documento:
    existe o do ano atual → `CONSTA gozo de férias (exercício 2026) de ... a ... (30 dias).` — ou, se o gozo
    ainda não começou na data do documento, `CONSTA PROGRAMAÇÃO DE GOZO DE FÉRIAS (exercício 2026) de ... a ...`;
    não existe o do ano atual, mas existe o do ano seguinte →
    `CONSTA PROGRAMAÇÃO DE GOZO DE FÉRIAS (exercício 2027) de 03/05/2027 a 01/06/2027.`;
    nenhum dos dois → o último registro anterior. Licença-prêmio e licença para estudos: último período na aba `Afastamentos`.
    Cada item que consta fica numa linha (`**CONSTA** gozo de ...`); os que não constam ficam juntos numa
    linha só (`NÃO CONSTA gozo de ...`).
  - `CONSTA`, `CONSTAM`, `NÃO CONSTA` e `NÃO CONSTAM` (em maiúsculas) saem sempre em negrito;
    no texto configurável, `**trecho**` também sai em negrito.
- **Matrícula**: `002076671` → `20.766-7.1`.
- **Vínculo**: `Status Funcional` da ficha + situação da FichaContabilis, ex.: `ESTATUTÁRIO ATIVO / CARGO EFETIVO`.

## Portarias

Segundo programa do projeto: gera a **Portaria** (folha A4 no modelo da Secretaria de Administração, com cabeçalho
e assinatura do Secretário Executivo de Gestão de Pessoas) com os dados do servidor lidos da **FichaContabilis**
— só essa planilha é necessária.

**Como abrir:** dê dois cliques em **`Portarias.bat`** (mesma pasta de planilhas do Requerimento; funciona ao
mesmo tempo que ele). Sem o aplicativo, abra `portarias.html` no Chrome/Edge e escolha a pasta ou arraste a
FichaContabilis, como no Requerimento.

**Como usar:** 1) escolha o **tipo de portaria**; 2) busque o servidor (nome, matrícula ou CPF) — para **mais de um servidor
na mesma portaria**, busque e escolha um por vez (o ✕ retira); 3) digite o **nº da portaria**, a data e os campos do
modelo (processo, requerimento, ofício… — o que é de cada servidor aparece num quadro por servidor); 4) **Imprimir / Salvar PDF** ou
**Copiar texto** (para colar no SEI). Os campos que faltam aparecem em amarelo na folha e na faixa de avisos, e o
texto da folha pode ser ajustado clicando sobre ele antes de imprimir. O bloco de assinatura eletrônica
(código verificador e CRC) é colocado pelo próprio SEI e não faz parte do modelo.

| Modelo | Campos a preencher | Preenchido pela planilha |
|---|---|---|
| **Exoneração a pedido** | nº e data do requerimento; retroação (opcional); tipo do cargo e fundamento legal (já vêm preenchidos) | nome, matrícula, cargo, secretaria, servidor/servidora |
| **Licença sem Vencimentos**, **Licença para Curso**, **Licença Prêmio**, **Dispensa de Estágio Probatório** ou **Outro pedido** (digitar o nome) | caixa **Indeferida** logo abaixo do tipo (desmarcada = **deferida**, texto "DEFERIR"; marcada = "INDEFERIR"); nº do processo; fundamentos adotados (padrão: despacho da secretaria); decênio e período de gozo (opcionais, criam as colunas na tabela) | nome, matrícula, secretaria de origem |
| **Readaptação de função** | ofício da Junta Médica; período (180 dias, com extenso); retroação (opcional) | nome, matrícula, cargo, secretaria |

Regras de preenchimento:

- **Vários servidores**: o texto vai para o plural (como na Portaria 518: "os pedidos…, dos servidores abaixo") e a tabela
  ganha uma linha por servidor; sai no feminino só se todos forem mulheres. Em **Exoneração** e **Readaptação** cada
  servidor ganha o seu artigo (Art. 1º, Art. 2º…) e a vigência fica no último — esse formato é adaptação nossa, ainda
  não conferida com uma portaria publicada. Se a portaria passar de uma página, ela segue para a próxima ao imprimir.
- **Cargo, secretaria e servidor/servidora** vêm da planilha e não ficam no painel: para corrigir, edite direto o texto
  da folha antes de imprimir.
- **Cargo**: `nm_cargo` em maiúsculas e sem acento vira `Professor 2`. **Servidor/servidora** (e lotado/lotada, pelo/pela…)
  segue a coluna `tp_sexo`; se estiver vazia, sai no masculino com um aviso — o painel permite trocar.
- **Secretaria**: os 2 primeiros dígitos de `cd_centroCusto` identificam a secretaria (15… Educação, 16… Saúde…); o
  nome é o do centro de custo "SECRETARIA MUNICIPAL…" com o mesmo início, na própria planilha. Servidores
  **cedidos** (centro de custo `SEGEPE - CEDIDOS`) recebem um aviso, pois a planilha não informa o órgão de origem —
  confira o campo **Secretaria** (e **Cargo**) no painel, que podem ser corrigidos à mão.
- **Matrícula**: escolha o formato no painel — `009133641` (padrão), `0.0913364.1` ou `9.133-6.4`.
- **Textos fixos** (preâmbulo e quem assina) ficam em *Textos fixos* e são lembrados neste computador.
- O número da portaria não vem da planilha: digite-o. O ano do título é o da data da portaria.

## Estrutura

- `Requerimento.bat` / `Portarias.bat` / `servidor.ps1` — aplicativos locais (servidor só para este computador, PowerShell 5.1+)
- `pasta.txt` — caminho opcional da pasta das planilhas; `planilhas/` — pasta padrão
- `index.html` — interface e layout da folha A4; `assets/` — logo e fonte Public Sans (SIL OFL)
- `js/dados.js` — regras de extração (funções puras, testadas)
- `js/planilhas.js` — leitura dos `.xlsx`, pasta e servidor local (compartilhado pelos dois programas)
- `js/app.js` — busca e montagem da folha do Requerimento
- `portarias.html`, `js/portarias.js` (modelos e regras, testados), `js/portarias-app.js` (tela) — Portarias
- `vendor/xlsx.full.min.js` — [SheetJS](https://sheetjs.com) 0.18.5 (Apache-2.0), leitura de `.xlsx`
- `tests/` — testes das regras: `node --test`

> As planilhas contêm dados pessoais (CPF, endereço etc.). O `.gitignore` impede que arquivos
> `.xlsx`/`.pdf` sejam enviados ao repositório — mantenha-as fora dele.
