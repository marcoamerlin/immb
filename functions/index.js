// Funções do servidor (Cloud Functions for Firebase).
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { acontecendoAgora, destinatarios, montarAviso } from './aviso.js';

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 5 });

const TOKEN_INVALIDO = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

// Quando uma reunião é iniciada agora, avisa supervisores da unidade e administradores.
export const avisarInicioDeReuniao = onDocumentCreated('reunioes/{reuniaoId}', async (event) => {
  const reuniao = event.data?.data();
  if (!reuniao || !acontecendoAgora(reuniao, new Date())) return;

  const db = getFirestore();
  const [admins, supervisores, unidade] = await Promise.all([
    db.collection('usuarios').where('papel', '==', 'admin').get(),
    db.collection('usuarios').where('papel', '==', 'supervisor').where('unidadeId', '==', reuniao.unidadeId).get(),
    db.doc(`unidades/${reuniao.unidadeId}`).get(),
  ]);
  const usuarios = [...admins.docs, ...supervisores.docs].map((d) => ({ id: d.id, ...d.data() }));
  const uids = [...new Set(destinatarios(usuarios, reuniao))];
  const tokens = (await Promise.all(uids.map((uid) => db.collection(`usuarios/${uid}/tokens`).get())))
    .flatMap((s) => s.docs);
  if (!tokens.length) return;

  const aviso = montarAviso(reuniao, unidade.get('nome'), event.params.reuniaoId);
  const resposta = await getMessaging().sendEachForMulticast({
    tokens: tokens.map((t) => t.id),
    data: aviso,
    webpush: { headers: { Urgency: 'high', TTL: '3600' } },
  });
  logger.info(`Aviso da reunião ${event.params.reuniaoId}: ${resposta.successCount} enviado(s), ${resposta.failureCount} falha(s).`);

  // Aparelhos que desinstalaram o app ou bloquearam notificações: remove o registro.
  await Promise.all(resposta.responses.map((r, i) =>
    !r.success && TOKEN_INVALIDO.includes(r.error?.code) ? tokens[i].ref.delete() : null));
});
