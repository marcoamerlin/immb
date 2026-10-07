// Testes das regras de segurança do Firestore. Rode com: npm test
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

let env;

const reuniao = (extra = {}) => ({
  unidadeId: 'aricanduva',
  autorUid: 'ana',
  autorNome: 'Ana',
  data: '2026-10-05',
  horaInicio: '19:30',
  horaFim: '21:00',
  responsavelReuniao: 'Ana',
  responsavelLar: 'Sr. José',
  endereco: '',
  participantes: 8,
  johreiMembros: 3,
  johreiFrequentadores: 2,
  johreiPrimeiraVez: 1,
  observacoes: '',
  criadoEm: '2026-10-05T22:00:00.000Z',
  atualizadoEm: '2026-10-05T22:00:00.000Z',
  ...extra,
});

const db = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-immb',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, 'unidades/aricanduva'), { nome: 'Johrei Center Aricanduva' });
    await setDoc(doc(f, 'unidades/penha'), { nome: 'Johrei Center Penha' });
    const usuarios = {
      ana: ['membro', 'aricanduva'],
      bia: ['membro', 'aricanduva'],
      sup: ['supervisor', 'aricanduva'],
      supPenha: ['supervisor', 'penha'],
      adm: ['admin', 'aricanduva'],
      novo: ['inativo', 'aricanduva'],
    };
    for (const [uid, [papel, unidadeId]] of Object.entries(usuarios)) {
      await setDoc(doc(f, 'usuarios', uid), { nome: uid, email: `${uid}@x.com`, papel, unidadeId, criadoEm: '' });
    }
    await setDoc(doc(f, 'reunioes/r-ana'), reuniao());
    await setDoc(doc(f, 'reunioes/r-bia'), reuniao({ autorUid: 'bia', autorNome: 'Bia' }));
    await setDoc(doc(f, 'reunioes/r-penha'), reuniao({ unidadeId: 'penha', autorUid: 'supPenha' }));
  });
});

describe('convites e primeiro acesso', () => {
  const dbEmail = (uid, email, verificado = true) =>
    env.authenticatedContext(uid, { email, email_verified: verificado }).firestore();
  const perfil = (extra = {}) => ({ nome: 'Carla', email: 'carla@x.com', papel: 'membro', unidadeId: 'aricanduva', criadoEm: '', ...extra });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'convites/carla@x.com'),
      { nome: 'Carla', email: 'carla@x.com', papel: 'membro', unidadeId: 'aricanduva', criadoEm: '' }));
  });

  test('admin convida por e-mail', async () => {
    await assertSucceeds(setDoc(doc(db('adm'), 'convites/davi@x.com'),
      { nome: 'Davi', email: 'davi@x.com', papel: 'supervisor', unidadeId: 'aricanduva', criadoEm: '' }));
  });
  test('quem não é admin não convida', async () => {
    await assertFails(setDoc(doc(db('sup'), 'convites/davi@x.com'),
      { nome: 'Davi', email: 'davi@x.com', papel: 'membro', unidadeId: 'aricanduva', criadoEm: '' }));
  });
  test('convidado com e-mail verificado cria o perfil do convite', async () => {
    await assertSucceeds(setDoc(doc(dbEmail('carla', 'carla@x.com'), 'usuarios/carla'), perfil()));
  });
  test('convidado não muda o papel do convite', async () => {
    await assertFails(setDoc(doc(dbEmail('carla', 'carla@x.com'), 'usuarios/carla'), perfil({ papel: 'admin' })));
    await assertFails(setDoc(doc(dbEmail('carla', 'carla@x.com'), 'usuarios/carla'), perfil({ unidadeId: 'penha' })));
  });
  test('e-mail não verificado não cria perfil', async () => {
    await assertFails(setDoc(doc(dbEmail('carla', 'carla@x.com', false), 'usuarios/carla'), perfil()));
  });
  test('e-mail sem convite não cria perfil', async () => {
    await assertFails(setDoc(doc(dbEmail('eva', 'eva@x.com'), 'usuarios/eva'), perfil({ email: 'eva@x.com' })));
  });
  test('convidado lê só o próprio convite', async () => {
    await assertSucceeds(getDoc(doc(dbEmail('carla', 'carla@x.com'), 'convites/carla@x.com')));
    await assertFails(getDoc(doc(dbEmail('eva', 'eva@x.com'), 'convites/carla@x.com')));
  });
  test('não pode se promover', async () => {
    await assertFails(updateDoc(doc(db('ana'), 'usuarios/ana'), { papel: 'admin' }));
  });
  test('pode mudar o próprio nome', async () => {
    await assertSucceeds(updateDoc(doc(db('ana'), 'usuarios/ana'), { nome: 'Ana Souza' }));
  });
  test('não lê cadastro de outros', async () => {
    await assertFails(getDoc(doc(db('sup'), 'usuarios/ana')));
  });
  test('admin suspende usuário', async () => {
    await assertSucceeds(updateDoc(doc(db('adm'), 'usuarios/ana'), { papel: 'inativo' }));
  });
});

describe('membro', () => {
  test('registra reunião na sua unidade', async () => {
    await assertSucceeds(setDoc(doc(db('ana'), 'reunioes/nova'), reuniao()));
  });
  test('não registra em outra unidade', async () => {
    await assertFails(setDoc(doc(db('ana'), 'reunioes/nova'), reuniao({ unidadeId: 'penha' })));
  });
  test('não registra em nome de outra pessoa', async () => {
    await assertFails(setDoc(doc(db('ana'), 'reunioes/nova'), reuniao({ autorUid: 'bia' })));
  });
  test('rejeita dados inválidos', async () => {
    await assertFails(setDoc(doc(db('ana'), 'reunioes/nova'), reuniao({ participantes: -1 })));
    await assertFails(setDoc(doc(db('ana'), 'reunioes/nova'), reuniao({ responsavelLar: '' })));
    await assertFails(setDoc(doc(db('ana'), 'reunioes/nova'), reuniao({ extra: 1 })));
  });
  test('vê as próprias reuniões', async () => {
    const q = query(collection(db('ana'), 'reunioes'), where('autorUid', '==', 'ana'), orderBy('data', 'desc'));
    const snap = await assertSucceeds(getDocs(q));
    if (snap.size !== 1) throw new Error(`esperava 1, veio ${snap.size}`);
  });
  test('não vê reuniões de outros membros', async () => {
    await assertFails(getDoc(doc(db('ana'), 'reunioes/r-bia')));
    await assertFails(getDocs(query(collection(db('ana'), 'reunioes'), where('unidadeId', '==', 'aricanduva'))));
  });
  test('edita e exclui a própria reunião, não a dos outros', async () => {
    await assertSucceeds(updateDoc(doc(db('ana'), 'reunioes/r-ana'), { participantes: 10 }));
    await assertFails(updateDoc(doc(db('ana'), 'reunioes/r-bia'), { participantes: 10 }));
    await assertSucceeds(deleteDoc(doc(db('ana'), 'reunioes/r-ana')));
    await assertFails(deleteDoc(doc(db('ana'), 'reunioes/r-bia')));
  });
});

describe('inativo', () => {
  test('não registra nem lê reuniões', async () => {
    await assertFails(setDoc(doc(db('novo'), 'reunioes/nova'), reuniao({ autorUid: 'novo' })));
    await assertFails(getDocs(query(collection(db('novo'), 'reunioes'), where('autorUid', '==', 'novo'))));
  });
});

describe('supervisor', () => {
  test('vê todas as reuniões da sua unidade por período', async () => {
    const q = query(collection(db('sup'), 'reunioes'), where('unidadeId', '==', 'aricanduva'),
      where('data', '>=', '2026-10-01'), where('data', '<=', '2026-10-31'), orderBy('data', 'desc'));
    const snap = await assertSucceeds(getDocs(q));
    if (snap.size !== 2) throw new Error(`esperava 2, veio ${snap.size}`);
  });
  test('não vê reuniões de outra unidade', async () => {
    await assertFails(getDoc(doc(db('sup'), 'reunioes/r-penha')));
    await assertFails(getDocs(query(collection(db('sup'), 'reunioes'), where('unidadeId', '==', 'penha'))));
  });
  test('corrige reunião de um membro da sua unidade', async () => {
    await assertSucceeds(updateDoc(doc(db('sup'), 'reunioes/r-ana'), { participantes: 9 }));
  });
  test('não muda o autor nem a unidade', async () => {
    await assertFails(updateDoc(doc(db('sup'), 'reunioes/r-ana'), { autorUid: 'sup' }));
    await assertFails(updateDoc(doc(db('adm'), 'reunioes/r-ana'), { unidadeId: 'penha' }));
  });
  test('não gerencia usuários nem unidades', async () => {
    await assertFails(updateDoc(doc(db('sup'), 'usuarios/novo'), { papel: 'membro' }));
    await assertFails(setDoc(doc(db('sup'), 'unidades/nova'), { nome: 'Nova' }));
  });
});

describe('admin', () => {
  test('vê reuniões de todas as unidades por período', async () => {
    const q = query(collection(db('adm'), 'reunioes'),
      where('data', '>=', '2026-10-01'), where('data', '<=', '2026-10-31'), orderBy('data', 'desc'));
    const snap = await assertSucceeds(getDocs(q));
    if (snap.size !== 3) throw new Error(`esperava 3, veio ${snap.size}`);
  });
  test('cria unidades e lista usuários', async () => {
    await assertSucceeds(setDoc(doc(db('adm'), 'unidades/nova'), { nome: 'Johrei Center Nova' }));
    await assertSucceeds(getDocs(collection(db('adm'), 'usuarios')));
  });
  test('ninguém exclui unidades', async () => {
    await assertFails(deleteDoc(doc(db('adm'), 'unidades/penha')));
  });
});

describe('situação da reunião e notificações', () => {
  test('aceita reunião em andamento e encerrada', async () => {
    await assertSucceeds(setDoc(doc(db('ana'), 'reunioes/a1'), reuniao({ status: 'andamento', horaFim: '' })));
    await assertSucceeds(updateDoc(doc(db('ana'), 'reunioes/a1'), { status: 'encerrada', horaFim: '21:00' }));
  });
  test('rejeita situação desconhecida', async () => {
    await assertFails(setDoc(doc(db('ana'), 'reunioes/a2'), reuniao({ status: 'cancelada' })));
  });
  test('cada pessoa registra só os próprios aparelhos', async () => {
    await assertSucceeds(setDoc(doc(db('sup'), 'usuarios/sup/tokens/tok1'), { criadoEm: '', aparelho: 'Android' }));
    await assertFails(setDoc(doc(db('ana'), 'usuarios/sup/tokens/tok2'), { criadoEm: '', aparelho: 'Android' }));
    await assertFails(getDoc(doc(db('ana'), 'usuarios/sup/tokens/tok1')));
    await assertSucceeds(deleteDoc(doc(db('sup'), 'usuarios/sup/tokens/tok1')));
  });
});
