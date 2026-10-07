# Reuniões no Lar · IMMB

App para registrar as reuniões realizadas no lar de membros da Igreja Messiânica Mundial do Brasil. Funciona no celular e no notebook, com os mesmos dados nos dois. Começa com o **Johrei Center Aricanduva** e já está pronto para outras unidades.

## O que cada reunião registra

- Data, horário de início e de término
- Responsável pela reunião e responsável pelo lar (e endereço, opcional)
- Quantas pessoas participaram
- Johreis ministrados para **Membros**, **Frequentadores** e **1ª vez** (com o total)
- Observações

## Perfis de acesso

| Perfil | O que pode fazer |
|---|---|
| **Membro** | Registra reuniões e vê/corrige apenas as que ele mesmo registrou. |
| **Supervisor** | Também vê e corrige **todas as reuniões da sua unidade**, filtrando por período. |
| **Administrador** | Vê as reuniões de **todas as unidades**, dá acesso às pessoas e cadastra unidades. |
| **Suspenso** | Perde o acesso (os registros dele continuam guardados). |

Essas regras são garantidas pelo servidor (`firestore.rules`), não só pela tela.

Em **Reuniões**, cada pessoa filtra por período (de/até, ou atalhos como "Este mês" e "Este ano") e vê os totais: reuniões, participantes e Johreis por tipo. Também dá para **baixar uma planilha (CSV)** ou **imprimir o relatório**.

## Como as pessoas ganham acesso

1. O administrador abre **Administração → Dar acesso a uma pessoa** e cadastra nome, e-mail, perfil e unidade.
2. Envia à pessoa o endereço do app.
3. A pessoa toca em **Primeiro acesso**, digita o e-mail e escolhe uma senha.
4. Ela recebe um e-mail de confirmação, toca no link e volta ao app (**Já confirmei meu e-mail**).
5. Nas próximas vezes, entra com e-mail e senha. Se esquecer a senha, usa **Esqueci minha senha**.

E-mails que não foram cadastrados pelo administrador não conseguem entrar.

## Sem internet

O app abre e registra reuniões mesmo sem sinal. Os registros ficam guardados no aparelho e são enviados automaticamente quando a internet volta. Enquanto isso, a lista mostra "⏳ Há alterações aguardando internet".

## Instalar no celular

Abra o endereço do app no navegador:
- **Android (Chrome):** menu ⋮ → *Adicionar à tela inicial*.
- **iPhone (Safari):** botão Compartilhar → *Adicionar à Tela de Início*.

## Colocar no ar (uma vez só)

O app usa o [Firebase](https://firebase.google.com) (Google) para login e banco de dados. O plano gratuito (Spark) é suficiente para o volume de uma ou algumas unidades.

1. **Criar o projeto:** em <https://console.firebase.google.com>, clique em *Criar projeto* (ex.: `immb-reunioes`). O Google Analytics não é necessário.
2. **Login:** *Authentication → Começar → Método de login →* ative **E-mail/senha** (só a primeira opção; não precisa do "link do e-mail").
   Em *Authentication → Modelos*, mude o idioma dos e-mails para **Português**.
3. **Banco de dados:** *Firestore Database → Criar banco de dados →* modo de **produção**, local `southamerica-east1 (São Paulo)`.
4. **Configuração do app:** *Configurações do projeto → Seus apps →* ícone **Web** (`</>`) → registre o app → copie os valores de `firebaseConfig` para o arquivo [`config.js`](config.js).
5. **Publicar:** no computador, com [Node.js](https://nodejs.org) instalado, na pasta do repositório:
   ```sh
   npm install
   npx firebase login
   npx firebase use --add        # escolha o projeto criado
   npm run deploy                # publica o site, as regras de segurança e os índices
   ```
   O app fica disponível em `https://<seu-projeto>.web.app`.
6. **Primeiro administrador** (você): no console, em *Firestore Database → Iniciar coleção*:
   - ID da coleção: `convites`
   - ID do documento: **seu e-mail em letras minúsculas**
   - Campos: `nome` (string, seu nome), `email` (string, o mesmo e-mail), `papel` (string, `admin`), `unidadeId` (null), `criadoEm` (string, pode ficar vazio)

   Depois abra o app, faça o **Primeiro acesso** com esse e-mail e, em **Administração**, cadastre a unidade **Johrei Center Aricanduva** (já vem sugerida). A partir daí, todo o resto é feito pelo app.

### Limites do plano gratuito

Por dia, o Firebase gratuito permite 1.000 e-mails de confirmação, 150 de "esqueci minha senha", 50 mil leituras e 20 mil gravações no banco. Isso é bem mais do que algumas unidades usam.

## Para quem for mexer no código

O app é HTML/CSS/JavaScript puro, sem etapa de build:

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Telas |
| `app.js` | Interface e regras de tela |
| `servidor.js` | Todo o acesso ao Firebase (login e banco) |
| `config.js` | Configuração do projeto Firebase |
| `sw.js` | Cache para abrir sem internet |
| `../firestore.rules` | Quem pode ler/gravar o quê |

Testar localmente com os emuladores do Firebase (precisa de Java instalado):

```sh
npm install
npm run dev               # emuladores + site em http://localhost:5000
npm run demo:admin        # (em outro terminal) libera admin@teste.com como administrador
npm test                  # testa as regras de segurança
```

Abrindo pelo `localhost`, o app usa automaticamente os emuladores (projeto `demo-immb`) e mostra uma faixa "Modo de teste". Como nenhum e-mail é enviado de verdade, os links aparecem na própria tela.
