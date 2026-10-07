// Configuração do Firebase (projeto "IMMB Reunioes").
// Estes valores não são secretos: quem protege os dados são as regras em firestore.rules.
const producao = {
  apiKey: 'AIzaSyD0X6JQJ8JSifRv5bnLXIX2z2yTf6CPaLk',
  authDomain: 'immb-reunioes.firebaseapp.com',
  projectId: 'immb-reunioes',
  storageBucket: 'immb-reunioes.firebasestorage.app',
  messagingSenderId: '818378618744',
  appId: '1:818378618744:web:a0848dab8712441cf3fa8d',
};

// Rodando no próprio computador (npm run dev), o app usa os emuladores locais
// do Firebase, para que testes nunca mexam nos dados reais.
const teste = { apiKey: 'demo-api-key', authDomain: 'demo-immb.firebaseapp.com', projectId: 'demo-immb' };

export const MODO_TESTE = ['localhost', '127.0.0.1'].includes(location.hostname);
export const firebaseConfig = MODO_TESTE ? teste : producao;

// Chave pública das notificações (Firebase → Configurações do projeto → Cloud Messaging →
// Certificados push da Web). Vazia = notificações desligadas no app.
export const VAPID_KEY = '';

// Nome sugerido para a primeira unidade criada pelo administrador.
export const UNIDADE_INICIAL = 'Johrei Center Aricanduva';
