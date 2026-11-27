# Portarias SEI (Tampermonkey)

Cria a **Portaria** direto no SEI, com o gerador de Portarias da GEMOP. Funciona sozinho: não precisa do Archivist,
de servidor, de banco de dados nem do `Portarias.bat`.

## Instalar em outro computador

1. Instale a extensão **Tampermonkey** (Chrome ou Edge).
2. Abra o arquivo `sei/portarias-sei.user.js` no GitHub (botão **Raw**): o Tampermonkey mostra a tela de instalação. Clique em **Instalar**.
3. Se o SEI da unidade não for `sei.jaboatao.pe.gov.br`, o script já vale para qualquer endereço com `/sei/`. Se o SEI tiver outro formato de endereço, acrescente-o nas linhas `@match` do início do script.
4. Abra o SEI. No **Controle de Processos** aparece a coluna **Portaria** com o botão **Gerar portaria**; com um processo aberto, aparece um ícone de documento verde na barra de ações.

## Como usar

1. Clique em **Gerar portaria** (na linha do processo ou no ícone da barra). O script lê os documentos do processo, **sem abri-lo na tela**, e abre o painel à direita: é a própria página de Portarias. A leitura usa o **ZIP do processo** (o SEI monta todos os documentos de uma vez, bem mais rápido); se o ZIP falhar ou passar de 150 s, lê documento por documento. O cabeçalho do painel mostra o tempo de cada etapa; clicar nele copia o relatório de tempo.
2. **Primeira vez:** no painel, escolha a **pasta das planilhas** (a que tem a FichaContabilis). Fica lembrada neste navegador; o Chrome pode pedir para permitir de novo de vez em quando. A planilha é lida só no computador.
3. Se a FichaContabilis tiver a aba **AFASTAMENTO**, o painel confere os impedimentos do decênio (licença sem vencimentos, acompanhar cônjuge, doença na família por mais de 30 dias, suspensão…), avisa e acrescenta uma **Observação** no texto da portaria. A aba é lida só quando você monta uma licença prêmio (pode levar alguns segundos). Faltas injustificadas não constam da aba: confira à parte.
3. Para **licença prêmio** e **exoneração a pedido**, o painel lê os documentos, acha o servidor na planilha e monta a portaria completa (decênio, período, decisão). Para **qualquer outro assunto**, o painel **sugere o tipo** de portaria pelas palavras do processo (tipo e especificação, títulos dos documentos, inclusive PDFs, e o texto) e **sugere o servidor** (interessado do processo, matrícula, CPF ou nome nos documentos). Você confere o tipo e o servidor no cartão do processo, clica em **Montar portaria com os marcados** e preenche os campos que faltarem (em amarelo), como na página de Portarias.
4. Confira o texto (clique nele para ajustar), digite o número da portaria se quiser ver o título pronto e clique em **Criar Portaria no SEI**.
5. Uma janela confirma: tipo **Portaria**, nível **Público**, número **automático do SEI**, **sem assinatura**. O título, o número e a data vêm do modelo da Portaria no SEI; o script grava só o corpo.
6. Depois de criada: **Abrir a Portaria** e **Excluir esta Portaria** (só enquanto não foi assinada nem enviada).

## Como funciona por dentro

- O painel é `dist/portarias-embutida.html` (arquivo único gerado por `python3 build_standalone.py dist/portarias-embutida.html portarias`), carregado pelo Tampermonkey (`@resource`) e aberto num iframe do SEI. **Sempre que mudar `js/` ou `portarias.html`, gere o arquivo de novo e envie junto.**
- A conversa entre o painel e o script usa mensagens (`gemop:pronto`, `gemop:processo`, `gemop:criar`); veja `iniciarEmbutido()` em `js/portarias-app.js`. Fora do SEI nada disso aparece.
- Para criar o documento, o script pede ao SEI as mesmas telas de quem clica (tipo "Portaria" → cadastro → editor), usando os links assinados da árvore do processo.
- Se o modelo da Portaria da unidade tiver várias seções editáveis sem uma chamada "Corpo", ou se o SEI usar o editor novo (CKEditor 5), a Portaria é criada mas o texto não é gravado: o painel avisa e dá para usar **Copiar texto** e colar.

## Limites

- Lê os documentos internos (HTML) e os **PDFs que têm texto** (por exemplo Ficha Funcional e Ficha Financeira), com a biblioteca pdf.js carregada pelo Tampermonkey. **PDFs digitalizados** (só imagem, como requerimentos escaneados e perícias) **não são lidos**: não há reconhecimento de imagem (OCR). O cabeçalho do painel informa quantos PDFs foram lidos e quantos eram digitalizados.
- Outros anexos (planilhas, imagens, ZIP) são ignorados.
- Processo sigiloso não é lido.
- A versão do painel vem da branch indicada no `@resource` (hoje `claude/sei-portarias`). Depois de unir ao ramo principal, troque o endereço no cabeçalho do script.
