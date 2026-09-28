# GEMOP — Requerimento do Servidor (Cedidos SAD)

Página que preenche automaticamente o **Requerimento do Servidor** a partir de duas planilhas
exportadas do sistema de RH:

| Planilha | Aba usada | Campos |
|---|---|---|
| `INDICE CEDIDOS SAD` | `SERVIDORES` | Nome, Matrícula, CPF, Data de admissão, Data de nascimento, Cargo (+ nível), Tipo de vínculo, Salário (Informações financeiras) |
| `relFichaCadastralCompleta` | `Lotacoes` (e `Servidores`) | Lotação atual, Órgão de origem, Status funcional |

## Como usar

1. Abra o arquivo `index.html` no Chrome ou no Edge (duplo clique; não precisa de internet nem instalação).
2. Arraste as duas planilhas `.xlsx` para a área indicada (ou clique e selecione as duas).
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
- **Matrícula**: `002076671` → `20.766-7.1`.
- **Tipo de vínculo**: `Status Funcional` da ficha + situação do INDICE, ex.: `ESTATUTARIO ATIVO/CARGO EFETIVO`.
- **Informações financeiras**: `vl_salario` do INDICE, com valor por extenso.

## Estrutura

- `index.html` — interface e layout da folha A4
- `js/dados.js` — regras de extração (funções puras, testadas)
- `js/app.js` — leitura das planilhas, busca e montagem da folha
- `vendor/xlsx.full.min.js` — [SheetJS](https://sheetjs.com) 0.18.5 (Apache-2.0), leitura de `.xlsx`
- `tests/` — testes das regras: `node --test tests/`

> As planilhas contêm dados pessoais (CPF, endereço etc.). O `.gitignore` impede que arquivos
> `.xlsx`/`.pdf` sejam enviados ao repositório — mantenha-as fora dele.
