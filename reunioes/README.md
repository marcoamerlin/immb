# Reuniões no Lar · IMMB

App para registrar as reuniões realizadas no lar de membros da Igreja Messiânica Mundial do Brasil. Funciona no celular e no notebook, com os mesmos dados nos dois. Começa com o **Johrei Center Aricanduva** e já está pronto para outras unidades.

## O que cada reunião registra

- Data, horário de início e de término
- Responsável pela reunião e responsável pelo lar (e endereço, opcional)
- Quantas pessoas participaram
- Johreis ministrados para **Membros**, **Frequentadores** e **1ª vez** (com o total)
- Observações

## Iniciar, encerrar ou registrar

- **▶ Iniciar reunião:** ao chegar no lar. A data e a hora de início vêm preenchidas (podem ser alteradas). A reunião fica **🟢 Em andamento**.
- **■ Encerrar reunião:** ao terminar, tocando na reunião em andamento. A hora de término vem preenchida, e aí se completam os números e as observações.
- **+ Registrar reunião já realizada:** para lançar uma reunião esquecida, com todos os campos de uma vez.

## Alertas de reunião iniciada

Supervisores (da unidade) e administradores recebem um alerta quando alguém **inicia** uma reunião naquele momento (data de hoje e início a até 30 minutos do horário atual). Lançamentos atrasados não geram alerta, e quem iniciou não recebe o próprio alerta.

- **Versão atual (gratuita):** o alerta chega com o **app aberto**, mesmo minimizado: aparece na tela e, se os alertas estiverem ativados em *Minha conta*, também como notificação do sistema, com som. Com o app fechado, não chega.
- **Aviso com o app fechado:** já está programado em [`functions/`](../functions), mas desligado. Exige o plano **Blaze** do Firebase, a chave "Certificados push da Web" em `config.js` (`VAPID_KEY`) e `PUBLICAR_FUNCOES: sim` na automação de publicação.

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

## Onde está publicado

- **Endereço do app:** https://immb-reunioes.web.app
- **Projeto Firebase:** `immb-reunioes` (plano gratuito Spark), em https://console.firebase.google.com/project/immb-reunioes

### Publicação automática

Toda mudança enviada ao GitHub (nos branches `main` ou de desenvolvimento) é publicada sozinha pela automação [`.github/workflows/publicar.yml`](../.github/workflows/publicar.yml). Ela:
1. Testa as regras de segurança.
2. Publica o site, as regras e os índices do banco.
3. Cadastra o primeiro administrador, se ainda não existir.

Para funcionar, o repositório precisa de:
- **Secret `FIREBASE_SERVICE_ACCOUNT`:** conteúdo do arquivo JSON gerado em *Firebase → Configurações do projeto → Contas de serviço → Gerar nova chave privada*.
- **Variáveis `ADMIN_EMAIL` e `ADMIN_NOME`** (opcionais): usadas para criar o convite do primeiro administrador.

Também dá para publicar manualmente: rode `npm install`, `npx firebase login` e `npm run deploy`.

### Como o projeto foi configurado no Firebase

1. Projeto criado em <https://console.firebase.google.com>, sem Google Analytics.
2. **Authentication:** método **E-mail/senha** ativado (sem link do e-mail) e modelos de e-mail em português.
3. **Firestore:** banco `(default)` em `southamerica-east1 (São Paulo)`, modo produção.
4. **App da Web** registrado, com a configuração copiada para [`config.js`](config.js).

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
