// Cadastra o primeiro administrador (convite) no projeto real, se ainda não existir.
// Usado pela publicação automática; precisa da chave da conta de serviço em
// GOOGLE_APPLICATION_CREDENTIALS. Uso: node scripts/primeiro-admin.mjs email@exemplo.com "Nome"
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const email = String(process.argv[2] || '').trim().toLowerCase();
const nome = process.argv[3] || 'Administrador';
if (!email.includes('@')) {
  console.log('Nenhum e-mail de administrador informado; nada a fazer.');
  process.exit(0);
}

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT || 'immb-reunioes' });
const db = getFirestore();
const ref = db.doc(`convites/${email}`);
// Só cria se ainda não houver convite nem usuário com esse e-mail (não desfaz mudanças feitas no app).
const [convite, usuarios] = await Promise.all([ref.get(), db.collection('usuarios').where('email', '==', email).limit(1).get()]);
if (convite.exists || !usuarios.empty) {
  console.log(`${email} já está cadastrado; nada a fazer.`);
} else {
  await ref.set({ nome, email, papel: 'admin', unidadeId: null, criadoEm: new Date().toISOString() });
  console.log(`Convite de administrador criado para ${email}.`);
}
