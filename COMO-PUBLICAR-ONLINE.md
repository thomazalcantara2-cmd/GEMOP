# Portarias online (planilha lida do Google Drive)

Na versão online a página fica na internet **sem nenhum dado dentro**. Cada pessoa clica em
**"Entrar com Google e abrir a planilha"**, escolhe a FichaContabilis no próprio Drive e o programa lê o arquivo
**com a conta dela**: quem não tem acesso à planilha no Google não consegue abrir nada. Os dados vão do Google
direto para o navegador da pessoa; nada é guardado em servidor. A página só enxerga o arquivo que a pessoa escolheu.

A planilha pode continuar sendo o `.xlsx` (como vem do sistema de RH) ou uma Planilha Google. Para dar acesso a mais gente,
basta compartilhar o arquivo (ou a pasta) com o Gmail dela. Para tirar o acesso, é só descompartilhar.

## Parte 1 — criar a "chave" no Google (uma vez só, grátis, uns 10 minutos)

Use o Gmail que vai ser o responsável pelo programa.

1. Entre em https://console.cloud.google.com e crie um projeto (nome livre, ex.: "Portarias SEGEP").
2. Menu **APIs e serviços → Biblioteca**: procure e ative **Google Drive API** e **Google Picker API**.
3. **APIs e serviços → Tela de permissão OAuth** (ou "Google Auth Platform"):
   - Tipo de usuário: **Externo**. Nome do app: "Portarias SEGEP". E-mail de suporte: o seu.
   - Em **Escopos**, não precisa adicionar nada de especial (o programa usa só `drive.file`, que não exige verificação do Google).
   - Em **Usuários de teste**, acrescente o Gmail de cada pessoa que vai usar (até 100). Enquanto o app estiver em "Teste", só essas pessoas entram.
     Ao entrar, o Google mostra o aviso "app não verificado": é só clicar em **Avançado → Continuar**.
4. **Credenciais → Criar credenciais → ID do cliente OAuth**: tipo **Aplicativo da Web**.
   Em **Origens JavaScript autorizadas** coloque o endereço onde a página vai ficar (ex.: `https://portarias-segep.vercel.app`).
   Copie o **ID do cliente**.
5. **Credenciais → Criar credenciais → Chave de API**. Em "Restrições da chave", escolha "Sites" e coloque o mesmo endereço; restrinja à **Google Picker API**. Copie a chave.
6. Em **Configurações do projeto**, copie o **Número do projeto** (só números).

## Parte 2 — colocar os 3 códigos no programa

Abra `js/google-config.js` e preencha:

```js
window.GOOGLE_CONFIG = {
  clientId: '...apps.googleusercontent.com',
  apiKey: '...',
  appId: '123456789012'
};
```

Esses códigos são públicos (qualquer página com login Google os tem); a proteção vem do login e do compartilhamento da planilha.

## Parte 3 — publicar a página

Sirva os arquivos da pasta do projeto num endereço `https` (por exemplo na Vercel: importar o repositório, sem configuração extra).
O arquivo `.vercelignore` já deixa de fora planilhas, testes e os `.bat`. A página inicial abre direto as Portarias.
**Nunca coloque planilhas na pasta publicada.**

Endereço atual: `https://portarias-segep.vercel.app`. No Vercel, a branch de produção (Settings → Environments → Production → Branch Tracking) deve ser `claude/ecstatic-keller-izldna`.

## No dia a dia

1. A pessoa abre o endereço e clica em **Entrar com Google e abrir a planilha**.
2. Escolhe a FichaContabilis (abas "Meu Drive", "Compartilhados comigo" ou "Drives compartilhados").
3. Nas próximas vezes, o mesmo botão já abre a planilha escolhida da última vez. **Escolher outra planilha** troca o arquivo.
   Quando sair uma planilha nova, basta salvá-la no Drive (no mesmo arquivo ou em outro) e clicar em **Recarregar planilha** ou escolher o novo arquivo.

## Cuidados

- São dados pessoais de servidores (LGPD): quem pode ver é quem tem acesso à planilha. Combine com a TI quem entra no compartilhamento.
- O aplicativo local (`Portarias.bat`) continua funcionando como sempre; com `google-config.js` em branco a versão online fica desligada.
- O arquivo único (`Portarias (arquivo unico).html`) não usa o Google: ele é só para abrir do disco.

## Planilha fixa (abre sozinha depois do login)

Se o campo `arquivoId` de `js/google-config.js` estiver preenchido (é o trecho do link do Google Planilhas entre `/d/` e `/edit`), a página não pede para escolher arquivo:
a pessoa só entra com o Google e essa planilha é carregada sozinha. Quem já entrou antes é reconhecido e a planilha carrega sem clicar em nada.
Nesse modo o programa pede ao Google a permissão **somente leitura do Drive** (`drive.readonly`), porque precisa baixar um arquivo que a pessoa não escolheu na hora.
Quem não tiver acesso à planilha no Google recebe a mensagem de que a conta não tem acesso. Com `arquivoId` vazio, volta o modo de escolher o arquivo no Drive.
Se o Google reclamar do escopo, em **Google Auth Platform → Acesso a dados** adicione `https://www.googleapis.com/auth/drive.readonly`.

### Tela de entrada

Com a planilha fixa, o endereço do site abre primeiro a tela **Entrar** (`entrar.html`). Depois do login a pessoa vai direto para as Portarias, sem o quadro "Carregar a planilha".
Quem já entrou antes e abre as Portarias de novo é reconhecido sozinho; se o Google não reconhecer, volta para a tela Entrar. O botão **Sair** (barra amarela) encerra a conta neste navegador.
Se o Google recusar a leitura (conta sem acesso ou "Google Drive API" desligada), a mensagem na tela traz o detalhe do Google.
