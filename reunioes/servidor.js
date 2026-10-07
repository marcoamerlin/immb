// Acesso ao Firebase (login e banco de dados). A interface (app.js) só fala com este arquivo.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, initializeFirestore, onSnapshot, orderBy,
  persistentLocalCache, persistentMultipleTabManager, query, setDoc, updateDoc, where,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

export const MODO_DEMO = firebaseConfig.projectId.startsWith('demo-');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'pt-BR';
// Cache local: o app abre e registra reuniões mesmo sem internet;
// tudo é enviado automaticamente quando a conexão volta.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (MODO_DEMO) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8080);
}

const lista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ---------- Login ----------
// Acesso por convite: o admin cadastra o e-mail; no primeiro acesso a pessoa
// escolhe a senha e confirma o e-mail pelo link que recebe.

export const normalizarEmail = (email) => String(email || '').trim().toLowerCase();
const voltarParaApp = () => ({ url: new URL(location.pathname, location.origin).href });

export const aoMudarUsuario = (cb) => onAuthStateChanged(auth, cb);
export const entrar = (email, senha) => signInWithEmailAndPassword(auth, normalizarEmail(email), senha);
export const sair = () => signOut(auth);
export const criarConta = (email, senha) => createUserWithEmailAndPassword(auth, normalizarEmail(email), senha);
export const excluirContaAtual = () => deleteUser(auth.currentUser);
export const enviarConfirmacao = () => sendEmailVerification(auth.currentUser, voltarParaApp());
export const redefinirSenha = (email) => sendPasswordResetEmail(auth, normalizarEmail(email), voltarParaApp());

// Recarrega o usuário (e o token) para saber se ele já confirmou o e-mail.
export async function atualizarLogin() {
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

// ---------- Usuários e convites ----------

export function observarPerfil(uid, cb, erro) {
  // Ignora gravações locais ainda não confirmadas: as permissões só valem
  // depois que o servidor tem o perfil.
  return onSnapshot(doc(db, 'usuarios', uid), { includeMetadataChanges: true }, (s) => {
    if (!s.metadata.hasPendingWrites) cb(s.exists() ? { id: s.id, ...s.data() } : null);
  }, erro);
}

export async function conviteExiste(email) {
  return (await getDoc(doc(db, 'convites', normalizarEmail(email)))).exists();
}

// Primeiro acesso: cria o perfil a partir do convite. Retorna false se não houver convite.
export async function criarPerfilDoConvite(user) {
  const email = normalizarEmail(user.email);
  const convite = await getDoc(doc(db, 'convites', email));
  if (!convite.exists()) return false;
  const c = convite.data();
  await setDoc(doc(db, 'usuarios', user.uid), {
    nome: c.nome, email, papel: c.papel, unidadeId: c.unidadeId ?? null, criadoEm: new Date().toISOString(),
  });
  return true;
}

export const observarUsuarios = (cb, erro) =>
  onSnapshot(query(collection(db, 'usuarios'), orderBy('nome')), (s) => cb(lista(s)), erro);
export const atualizarUsuario = (uid, campos) => updateDoc(doc(db, 'usuarios', uid), campos);

export const observarConvites = (cb, erro) =>
  onSnapshot(query(collection(db, 'convites'), orderBy('nome')), (s) => cb(lista(s)), erro);

export function salvarConvite({ nome, email, papel, unidadeId }) {
  const e = normalizarEmail(email);
  return setDoc(doc(db, 'convites', e), {
    nome, email: e, papel, unidadeId: unidadeId || null, criadoEm: new Date().toISOString(),
  });
}
export const excluirConvite = (email) => deleteDoc(doc(db, 'convites', normalizarEmail(email)));

// ---------- Unidades ----------

export const observarUnidades = (cb, erro) =>
  onSnapshot(query(collection(db, 'unidades'), orderBy('nome')), (s) => cb(lista(s)), erro);
export const criarUnidade = (nome) => addDoc(collection(db, 'unidades'), { nome });
export const renomearUnidade = (id, nome) => updateDoc(doc(db, 'unidades', id), { nome });

// ---------- Reuniões ----------

// filtro: { de, ate } (AAAA-MM-DD) e opcionalmente autorUid ou unidadeId.
export function observarReunioes(filtro, cb, erro) {
  const condicoes = [];
  if (filtro.autorUid) condicoes.push(where('autorUid', '==', filtro.autorUid));
  if (filtro.unidadeId) condicoes.push(where('unidadeId', '==', filtro.unidadeId));
  if (filtro.de) condicoes.push(where('data', '>=', filtro.de));
  if (filtro.ate) condicoes.push(where('data', '<=', filtro.ate));
  const q = query(collection(db, 'reunioes'), ...condicoes, orderBy('data', 'desc'));
  return onSnapshot(q, { includeMetadataChanges: true }, (s) => cb(lista(s), s.metadata.hasPendingWrites), erro);
}

export const novoIdReuniao = () => doc(collection(db, 'reunioes')).id;

// Não espere estas promessas para seguir em frente: sem internet elas só
// terminam quando a conexão volta, mas a alteração já vale localmente.
export const salvarReuniao = (id, dados) => setDoc(doc(db, 'reunioes', id), dados);
export const excluirReuniao = (id) => deleteDoc(doc(db, 'reunioes', id));
