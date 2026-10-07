// Acesso ao Firebase (login e banco de dados). A interface (app.js) só fala com este arquivo.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, initializeFirestore, onSnapshot, orderBy,
  persistentLocalCache, persistentMultipleTabManager, query, setDoc, updateDoc, where,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  deleteToken, getMessaging, getToken, isSupported,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js';
import { firebaseConfig, MODO_TESTE, VAPID_KEY } from './config.js';

export const MODO_DEMO = MODO_TESTE;

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

// Retorna o convite do e-mail (ou null se ele não foi liberado pelo admin).
export async function buscarConvite(email) {
  const c = await getDoc(doc(db, 'convites', normalizarEmail(email)));
  return c.exists() ? c.data() : null;
}

// Nome usado nos e-mails do Firebase ("Olá, %DISPLAY_NAME%").
export const definirNomeExibido = (nome) => updateProfile(auth.currentUser, { displayName: nome });

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

// Reuniões em andamento numa data (opcionalmente de uma unidade). Chama cb só com
// as que chegaram de outros aparelhos desde a última leitura.
export function observarReunioesIniciadas({ data, unidadeId }, cb, erro) {
  const condicoes = [where('status', '==', 'andamento'), where('data', '==', data)];
  if (unidadeId) condicoes.unshift(where('unidadeId', '==', unidadeId));
  return onSnapshot(query(collection(db, 'reunioes'), ...condicoes), (snap) => {
    cb(snap.docChanges()
      .filter((c) => c.type === 'added' && !c.doc.metadata.hasPendingWrites)
      .map((c) => ({ id: c.doc.id, ...c.doc.data() })));
  }, erro);
}

export const novoIdReuniao = () => doc(collection(db, 'reunioes')).id;

// Não espere estas promessas para seguir em frente: sem internet elas só
// terminam quando a conexão volta, mas a alteração já vale localmente.
export const salvarReuniao = (id, dados) => setDoc(doc(db, 'reunioes', id), dados);
export const excluirReuniao = (id) => deleteDoc(doc(db, 'reunioes', id));

// ---------- Notificações (aviso de reunião iniciada) ----------
// O aviso é enviado pelo servidor (functions/index.js) para os aparelhos
// registrados em /usuarios/{uid}/tokens. Aqui só registramos este aparelho.

const chaveToken = (uid) => `immb-notificacao-${uid}`;

function lerLocal(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function gravarLocal(chave, valor) {
  try { if (valor) localStorage.setItem(chave, valor); else localStorage.removeItem(chave); } catch { /* sem armazenamento */ }
}

export const NOTIFICACOES_CONFIGURADAS = Boolean(VAPID_KEY) && !MODO_DEMO;

export async function notificacoesSuportadas() {
  if (MODO_DEMO || !VAPID_KEY || !('serviceWorker' in navigator) || !('Notification' in window)) return false;
  try { return await isSupported(); } catch { return false; }
}

// 'ativo' | 'inativo' | 'negado' (o usuário bloqueou no navegador)
export function estadoNotificacoes(uid) {
  if (!('Notification' in window)) return 'inativo';
  if (Notification.permission === 'denied') return 'negado';
  return Notification.permission === 'granted' && lerLocal(chaveToken(uid)) ? 'ativo' : 'inativo';
}

function descreverAparelho() {
  const ua = navigator.userAgent;
  const sistema = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua) ? 'Mac' : 'Outro';
  return `${sistema} · ${ua}`.slice(0, 200);
}

// Pede permissão (se preciso), obtém o token do aparelho e o registra para o usuário.
export async function ativarNotificacoes(uid) {
  const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permissao !== 'granted') {
    const erro = new Error('Permissão negada');
    erro.code = 'notificacao/negada';
    throw erro;
  }
  const registro = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registro });
  await setDoc(doc(db, 'usuarios', uid, 'tokens', token), { criadoEm: new Date().toISOString(), aparelho: descreverAparelho() });
  gravarLocal(chaveToken(uid), token);
  return token;
}

export async function desativarNotificacoes(uid) {
  const token = lerLocal(chaveToken(uid));
  gravarLocal(chaveToken(uid), null);
  if (token) await deleteDoc(doc(db, 'usuarios', uid, 'tokens', token)).catch(() => {});
  await deleteToken(getMessaging(app)).catch(() => {});
}
