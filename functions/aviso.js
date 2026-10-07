// Regras do aviso de início de reunião (sem dependências, para poder testar).

const FUSO = 'America/Sao_Paulo';

// Só avisa se o horário de início estiver a no máximo esta distância do momento atual.
export const JANELA_MINUTOS = 30;

export function agoraNoFuso(momento, fuso = FUSO) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(momento).map((p) => [p.type, p.value]));
  return { data: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

// A reunião foi iniciada "ao vivo"? (status em andamento, data de hoje e início perto de agora)
// Lançamentos de reuniões passadas, ou com data/hora alteradas, não geram aviso.
export function acontecendoAgora(reuniao, momento) {
  if (reuniao?.status !== 'andamento') return false;
  const agora = agoraNoFuso(momento);
  if (reuniao.data !== agora.data) return false;
  const [h, m] = String(reuniao.horaInicio || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  return Math.abs(h * 60 + m - agora.minutos) <= JANELA_MINUTOS;
}

// Quem recebe: administradores e supervisores da unidade, exceto quem iniciou.
export function destinatarios(usuarios, reuniao) {
  return usuarios
    .filter((u) => u.papel === 'admin' || (u.papel === 'supervisor' && u.unidadeId === reuniao.unidadeId))
    .map((u) => u.id)
    .filter((id) => id !== reuniao.autorUid);
}

// Conteúdo da notificação (todos os valores precisam ser texto para o FCM).
export function montarAviso(reuniao, nomeUnidade, reuniaoId) {
  const partes = [`${reuniao.horaInicio}`, `por ${reuniao.responsavelReuniao}`];
  if (nomeUnidade) partes.push(nomeUnidade);
  return {
    titulo: `Reunião iniciada no lar de ${reuniao.responsavelLar}`,
    corpo: partes.join(' · '),
    reuniaoId: String(reuniaoId),
    url: './',
  };
}
