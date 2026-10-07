import * as srv from './servidor.js';
import { firebaseConfig, UNIDADE_INICIAL } from './config.js';

const PAPEIS = {
  membro: { nome: 'Membro', desc: 'Registra reuniões e vê apenas as que ele mesmo registrou.' },
  supervisor: { nome: 'Supervisor', desc: 'Também vê e corrige todas as reuniões da sua unidade.' },
  admin: { nome: 'Administrador', desc: 'Vê as reuniões de todas as unidades e gerencia pessoas e unidades.' },
  inativo: { nome: 'Suspenso', desc: 'Não consegue mais entrar no app.' },
};

// ---------- Utilidades ----------

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const pad = (n) => String(n).padStart(2, '0');
const isoData = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => isoData(new Date());
const horaAtual = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const agora = () => new Date().toISOString();

function formatarData(iso, opcoes = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', opcoes);
}

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (v) => Math.min(9999, Math.max(0, parseInt(v, 10) || 0));
const totalJohrei = (r) => r.johreiMembros + r.johreiFrequentadores + r.johreiPrimeiraVez;
const slug = (s) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function mensagemErro(e) {
  const msgs = {
    'auth/invalid-credential': 'E-mail ou senha incorretos. Se é seu primeiro acesso, use o link “Primeiro acesso”.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos. Se é seu primeiro acesso, use o link “Primeiro acesso”.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/weak-password': 'Senha muito fraca. Use pelo menos 6 caracteres.',
    'auth/invalid-action-code': 'Este link expirou ou já foi usado. Peça um novo.',
    'auth/expired-action-code': 'Este link expirou. Peça um novo.',
    'auth/requires-recent-login': 'Por segurança, peça um novo link para criar a senha.',
    'auth/operation-not-allowed': 'O login por e-mail não está ativado no Firebase (veja o README).',
    'permission-denied': 'Você não tem permissão para esta ação.',
    unavailable: 'Sem conexão com o servidor.',
  };
  console.error(e);
  return msgs[e?.code] || 'Algo deu errado. Tente novamente.';
}

function mostrarErro(form, erro) {
  $('.erro', form).textContent = typeof erro === 'string' ? erro : mensagemErro(erro);
}

function ocupado(form, sim) {
  $$('button', form).forEach((b) => { b.disabled = sim; });
}

function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Estado ----------

const s = {
  user: null,
  perfil: null,
  unidades: [],
  usuarios: [],
  convites: [],
  reunioes: [],
  pendentes: false,
  cadastrando: false,
  assinaturas: {},
};

function cancelar(nome) {
  if (s.assinaturas[nome]) s.assinaturas[nome]();
  delete s.assinaturas[nome];
}

function cancelarTudo() {
  Object.keys(s.assinaturas).forEach(cancelar);
}

const nomeUnidade = (id) => s.unidades.find((u) => u.id === id)?.nome || '—';
const ehAdmin = () => s.perfil?.papel === 'admin';
const ehSupervisor = () => s.perfil?.papel === 'supervisor';

// ---------- Telas ----------

function mostrarTela(id) {
  $$('.tela').forEach((t) => { t.hidden = t.id !== id; });
  $('#app').hidden = id !== 'app';
}

$$('[data-ir]').forEach((b) => b.addEventListener('click', () => {
  const destino = $('#' + b.dataset.ir);
  const email = $('input[type=email]', b.closest('form'))?.value;
  if (email) $('input[type=email]', destino).value = email;
  $$('.erro', destino).forEach((e) => { e.textContent = ''; });
  mostrarTela(b.dataset.ir);
}));

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-acao=sair]')) srv.sair();
});

function semAcesso(msg) {
  cancelarTudo();
  $('#sem-acesso-msg').textContent = msg;
  mostrarTela('tela-sem-acesso');
}

// ---------- Login ----------

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  mostrarErro(f, '');
  ocupado(f, true);
  try {
    await srv.entrar(f.email.value, f.senha.value);
    f.senha.value = '';
  } catch (err) {
    mostrarErro(f, err);
  } finally {
    ocupado(f, false);
  }
});

$('#form-cadastro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  mostrarErro(f, '');
  if (f.senha.value.length < 6) return mostrarErro(f, 'Use pelo menos 6 caracteres na senha.');
  if (f.senha.value !== f.confirmacao.value) return mostrarErro(f, 'As senhas não são iguais.');
  ocupado(f, true);
  s.cadastrando = true;
  try {
    await srv.criarConta(f.email.value, f.senha.value);
    // Confere o convite antes de mandar o e-mail; sem convite, desfaz a conta
    // para que a pessoa possa tentar de novo depois de ser liberada.
    if (!(await srv.conviteExiste(f.email.value))) {
      await srv.excluirContaAtual();
      return mostrarErro(f, 'Este e-mail ainda não foi liberado. Confira se digitou certo ou peça ao responsável da sua unidade para cadastrá-lo.');
    }
    await srv.enviarConfirmacao();
    const email = srv.normalizarEmail(f.email.value);
    f.reset();
    mostrarVerificacao(email);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      mostrarErro(f, 'Este e-mail já tem senha cadastrada. Volte e entre com ela, ou use “Esqueci minha senha”.');
    } else {
      mostrarErro(f, err);
    }
  } finally {
    s.cadastrando = false;
    ocupado(f, false);
  }
});

function mostrarVerificacao(email) {
  $('#verificar-email').textContent = email;
  $('#cartao-verificar .erro').textContent = '';
  $('#verificar-teste').hidden = true;
  mostrarTela('tela-verificar');
  if (srv.MODO_DEMO) mostrarLinkDoEmulador(email, 'VERIFY_EMAIL', $('#verificar-teste'));
}

$('#ja-confirmei').addEventListener('click', async () => {
  const erro = $('#cartao-verificar .erro');
  erro.textContent = '';
  try {
    const user = await srv.atualizarLogin();
    if (!user.emailVerified) {
      erro.textContent = 'Ainda não recebemos a confirmação. Toque no link do e-mail e tente de novo.';
      return;
    }
    iniciarSessao(user);
  } catch (err) {
    erro.textContent = mensagemErro(err);
  }
});

$('#reenviar-confirmacao').addEventListener('click', async () => {
  try {
    await srv.enviarConfirmacao();
    toast('E-mail reenviado.');
    if (srv.MODO_DEMO) mostrarLinkDoEmulador(s.user.email, 'VERIFY_EMAIL', $('#verificar-teste'));
  } catch (err) {
    $('#cartao-verificar .erro').textContent = mensagemErro(err);
  }
});

$('#form-esqueci').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const sucesso = $('.sucesso', f);
  mostrarErro(f, '');
  sucesso.hidden = true;
  ocupado(f, true);
  try {
    await srv.redefinirSenha(f.email.value);
    sucesso.innerHTML = `Se <strong>${esc(srv.normalizarEmail(f.email.value))}</strong> tiver cadastro, você receberá
      um link para criar uma nova senha. Veja também a caixa de spam.`;
    sucesso.hidden = false;
    if (srv.MODO_DEMO) mostrarLinkDoEmulador(f.email.value, 'PASSWORD_RESET', sucesso);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      mostrarErro(f, 'Este e-mail ainda não tem senha. Use “Primeiro acesso”.');
    } else {
      mostrarErro(f, err);
    }
  } finally {
    ocupado(f, false);
  }
});

// No modo de teste nenhum e-mail é enviado: o emulador guarda o link, e mostramos aqui.
async function mostrarLinkDoEmulador(email, tipo, onde) {
  try {
    const r = await fetch(`http://${location.hostname}:9099/emulator/v1/projects/${firebaseConfig.projectId}/oobCodes`);
    const { oobCodes } = await r.json();
    const ultimo = oobCodes.filter((c) => c.email === srv.normalizarEmail(email) && c.requestType === tipo).pop();
    if (!ultimo) return;
    const link = tipo === 'PASSWORD_RESET' ? `${ultimo.oobLink}&newPassword=novaSenha1` : ultimo.oobLink;
    onde.insertAdjacentHTML('beforeend',
      `<br><a href="${esc(link)}" target="_blank" rel="noopener">[teste] Abrir o link do e-mail</a>`);
    onde.hidden = false;
  } catch { /* emulador indisponível */ }
}

srv.aoMudarUsuario((user) => {
  cancelarTudo();
  s.user = user;
  s.perfil = null;
  if (s.cadastrando) return; // o formulário de primeiro acesso cuida das próximas telas
  if (!user) return mostrarTela('tela-login');
  if (!user.emailVerified) return mostrarVerificacao(user.email);
  iniciarSessao(user);
});

function iniciarSessao(user) {
  let tentouConvite = false;
  s.assinaturas.perfil = srv.observarPerfil(user.uid, async (perfil) => {
    if (!perfil) {
      if (tentouConvite) return;
      tentouConvite = true;
      try {
        await srv.atualizarLogin();
        if (!(await srv.criarPerfilDoConvite(user))) {
          semAcesso(`O e-mail ${user.email} ainda não foi cadastrado. Peça ao responsável da sua unidade para liberar seu acesso.`);
        }
      } catch (err) {
        semAcesso(`Não foi possível liberar o acesso de ${user.email}. ${mensagemErro(err)}`);
      }
      return;
    }
    if (!PAPEIS[perfil.papel] || perfil.papel === 'inativo') {
      return semAcesso('Seu acesso está suspenso. Fale com o responsável da sua unidade.');
    }
    const primeiraVez = !s.perfil;
    const mudouPapel = s.perfil && (s.perfil.papel !== perfil.papel || s.perfil.unidadeId !== perfil.unidadeId);
    s.perfil = perfil;
    if (primeiraVez || mudouPapel) abrirApp();
    else renderConta();
  }, (err) => semAcesso(mensagemErro(err)));
}

// ---------- App ----------

function abrirApp() {
  const jaAberto = !$('#app').hidden;
  cancelar('unidades');
  cancelar('usuarios');
  cancelar('convites');
  s.assinaturas.unidades = srv.observarUnidades((u) => {
    s.unidades = u;
    renderUnidadesEmTudo();
  }, (err) => toast(mensagemErro(err)));
  if (ehAdmin()) {
    s.assinaturas.usuarios = srv.observarUsuarios((u) => { s.usuarios = u; renderUsuarios(); }, (err) => toast(mensagemErro(err)));
    s.assinaturas.convites = srv.observarConvites((c) => { s.convites = c; renderUsuarios(); }, (err) => toast(mensagemErro(err)));
  }
  $$('[data-so-admin]').forEach((el) => { el.hidden = !ehAdmin(); });
  configurarEscopo();
  renderConta();
  mostrarTela('app');
  if (!jaAberto) mostrar('reunioes');
  assinarReunioes();
}

function renderUnidadesEmTudo() {
  $('#unidade-usuario').textContent = ehAdmin() && !s.perfil.unidadeId ? 'Todas as unidades' : nomeUnidade(s.perfil.unidadeId);
  const opcoes = s.unidades.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  const fu = $('#filtro-unidade');
  const atual = fu.value;
  fu.innerHTML = '<option value="">Todas as unidades</option>' + opcoes;
  fu.value = atual;
  renderConta();
  renderLista();
  if (ehAdmin()) {
    renderUsuarios();
    renderUnidadesAdmin();
  }
}

// ---------- Navegação ----------

function mostrar(view) {
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
  $$('.tabs button').forEach((b) => {
    const ativo = b.dataset.view === view || (view === 'form' && b.dataset.view === 'reunioes');
    b.setAttribute('aria-selected', String(ativo));
  });
  window.scrollTo(0, 0);
}

let formAlterado = false;
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  if (!$('#view-form').hidden && formAlterado && !confirm('Descartar as alterações não salvas?')) return;
  formAlterado = false;
  mostrar(b.dataset.view);
}));

// ---------- Filtros e lista ----------

function configurarEscopo() {
  const opcoes = [['minhas', 'Minhas reuniões']];
  if (ehSupervisor() && s.perfil.unidadeId) opcoes.push(['unidade', 'Todas da minha unidade']);
  if (ehAdmin()) opcoes.push(['todas', 'Todas as reuniões']);
  const sel = $('#escopo');
  sel.innerHTML = opcoes.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  sel.value = opcoes[opcoes.length - 1][0];
  $('#campo-escopo').hidden = opcoes.length < 2;
  atualizarCamposFiltro();
}

function atualizarCamposFiltro() {
  $('#campo-filtro-unidade').hidden = $('#escopo').value !== 'todas';
}

function definirPeriodo(tipo) {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const intervalos = {
    mes: [new Date(y, m, 1), new Date(y, m + 1, 0)],
    'mes-anterior': [new Date(y, m - 1, 1), new Date(y, m, 0)],
    trimestre: [new Date(y, m - 2, 1), new Date(y, m + 1, 0)],
    ano: [new Date(y, 0, 1), new Date(y, 11, 31)],
  };
  const [de, ate] = intervalos[tipo];
  $('#de').value = isoData(de);
  $('#ate').value = isoData(ate);
  $$('.atalhos button').forEach((b) => b.classList.toggle('ativo', b.dataset.periodo === tipo));
}

function filtroAtual() {
  const escopo = $('#escopo').value;
  const f = { de: $('#de').value, ate: $('#ate').value };
  if (escopo === 'minhas') f.autorUid = s.user.uid;
  if (escopo === 'unidade') f.unidadeId = s.perfil.unidadeId;
  if (escopo === 'todas' && $('#filtro-unidade').value) f.unidadeId = $('#filtro-unidade').value;
  return f;
}

function assinarReunioes() {
  cancelar('reunioes');
  const f = filtroAtual();
  if (f.de && f.ate && f.de > f.ate) {
    s.reunioes = [];
    $('#status-lista').textContent = 'A data inicial está depois da data final.';
    return renderLista();
  }
  $('#status-lista').textContent = 'Carregando…';
  s.assinaturas.reunioes = srv.observarReunioes(f, (lista, pendentes) => {
    s.reunioes = lista;
    s.pendentes = pendentes;
    renderLista();
  }, (err) => {
    s.reunioes = [];
    renderLista();
    $('#status-lista').textContent = mensagemErro(err);
  });
}

$('#escopo').addEventListener('change', () => { atualizarCamposFiltro(); assinarReunioes(); });
$('#filtro-unidade').addEventListener('change', assinarReunioes);
['#de', '#ate'].forEach((sel) => $(sel).addEventListener('change', () => {
  $$('.atalhos button').forEach((b) => b.classList.remove('ativo'));
  assinarReunioes();
}));
$$('.atalhos button').forEach((b) => b.addEventListener('click', () => {
  definirPeriodo(b.dataset.periodo);
  assinarReunioes();
}));
$('#busca').addEventListener('input', () => renderLista());

function reunioesFiltradas() {
  const termo = normalizar($('#busca').value);
  return s.reunioes.filter((r) => !termo || normalizar(
    [r.responsavelReuniao, r.responsavelLar, r.endereco, r.observacoes, r.autorNome].join(' '),
  ).includes(termo));
}

function somar(lista) {
  const t = { reunioes: lista.length, participantes: 0, johreiMembros: 0, johreiFrequentadores: 0, johreiPrimeiraVez: 0 };
  for (const r of lista) {
    t.participantes += r.participantes;
    t.johreiMembros += r.johreiMembros;
    t.johreiFrequentadores += r.johreiFrequentadores;
    t.johreiPrimeiraVez += r.johreiPrimeiraVez;
  }
  t.johreiTotal = t.johreiMembros + t.johreiFrequentadores + t.johreiPrimeiraVez;
  return t;
}

function descricaoPeriodo() {
  const { de, ate } = filtroAtual();
  if (de && ate) return `${formatarData(de)} a ${formatarData(ate)}`;
  if (de) return `a partir de ${formatarData(de)}`;
  if (ate) return `até ${formatarData(ate)}`;
  return 'todo o período';
}

function renderLista() {
  if (!s.perfil) return;
  const lista = reunioesFiltradas();
  const t = somar(lista);
  const deOutros = $('#escopo').value !== 'minhas';
  const variasUnidades = $('#escopo').value === 'todas' && !$('#filtro-unidade').value;

  $('#resumo').innerHTML = `
    <div class="tile"><span>Reuniões</span><strong>${t.reunioes}</strong></div>
    <div class="tile"><span>Participantes</span><strong>${t.participantes}</strong></div>
    <div class="tile principal"><span>Johreis</span><strong>${t.johreiTotal}</strong></div>
    <div class="tile"><span>Membros</span><strong>${t.johreiMembros}</strong></div>
    <div class="tile"><span>Frequentadores</span><strong>${t.johreiFrequentadores}</strong></div>
    <div class="tile"><span>1ª vez</span><strong>${t.johreiPrimeiraVez}</strong></div>`;

  $('#titulo-lista').textContent = descricaoPeriodo();
  $('#status-lista').textContent = s.pendentes
    ? '⏳ Há alterações aguardando internet para serem enviadas.' : '';

  $('#lista').innerHTML = lista.map((r) => `
    <li class="item" data-id="${r.id}" tabindex="0" role="button">
      <div class="item-data">
        <strong>${esc(formatarData(r.data, { day: '2-digit' }))}</strong>
        <span>${esc(formatarData(r.data, { month: 'short' }).replace('.', ''))}</span>
      </div>
      <div class="item-corpo">
        <div class="item-titulo">Lar de ${esc(r.responsavelLar)}</div>
        <div class="item-meta">
          <span>🕐 ${esc(r.horaInicio)}${r.horaFim ? '–' + esc(r.horaFim) : ''}</span>
          <span>👤 ${esc(r.responsavelReuniao)}</span>
          ${r.endereco ? `<span>📍 ${esc(r.endereco)}</span>` : ''}
          ${variasUnidades ? `<span>🏛 ${esc(nomeUnidade(r.unidadeId))}</span>` : ''}
          ${deOutros && r.autorUid !== s.user.uid && r.autorNome !== r.responsavelReuniao ? `<span>✍️ ${esc(r.autorNome)}</span>` : ''}
        </div>
      </div>
      <div class="item-numeros">
        <span><strong>${r.participantes}</strong> pessoas</span>
        <span title="Membros ${r.johreiMembros} · Frequentadores ${r.johreiFrequentadores} · 1ª vez ${r.johreiPrimeiraVez}"><strong>${totalJohrei(r)}</strong> Johreis</span>
      </div>
    </li>`).join('') || '<li class="vazio">Nenhuma reunião neste período.</li>';

  const podeRegistrar = ehAdmin() || Boolean(s.perfil.unidadeId);
  $('#nova-reuniao').disabled = !podeRegistrar || !s.unidades.length;
  $('#nova-reuniao').title = podeRegistrar ? '' : 'Peça ao administrador para definir sua unidade.';
}

const abrirItem = (e) => {
  const item = e.target.closest('.item');
  if (item) abrirFormulario(item.dataset.id);
};
$('#lista').addEventListener('click', abrirItem);
$('#lista').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirItem(e); }
});

// ---------- Formulário ----------

const CAMPOS_TEXTO = ['data', 'horaInicio', 'horaFim', 'responsavelReuniao', 'responsavelLar', 'endereco', 'observacoes'];
const CAMPOS_NUMERO = ['participantes', 'johreiMembros', 'johreiFrequentadores', 'johreiPrimeiraVez'];
let editando = null;

function preencherSugestoes() {
  const unicos = (campo) => [...new Set(s.reunioes.map((r) => r[campo]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((v) => `<option value="${esc(v)}">`).join('');
  $('#lista-responsaveis').innerHTML = unicos('responsavelReuniao');
  $('#lista-lares').innerHTML = unicos('responsavelLar');
  $('#lista-enderecos').innerHTML = unicos('endereco');
}

function abrirFormulario(id = null) {
  const f = $('#form-reuniao');
  editando = id ? s.reunioes.find((r) => r.id === id) : null;
  f.reset();
  f.unidadeId.innerHTML = s.unidades.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  $('#campo-unidade-form').hidden = !ehAdmin();
  f.unidadeId.disabled = Boolean(editando);
  if (editando) {
    for (const c of CAMPOS_TEXTO) f[c].value = editando[c] || '';
    for (const c of CAMPOS_NUMERO) f[c].value = editando[c];
    f.unidadeId.value = editando.unidadeId;
  } else {
    f.data.value = hoje();
    f.horaInicio.value = horaAtual();
    f.responsavelReuniao.value = s.perfil.nome;
    f.unidadeId.value = s.perfil.unidadeId || ($('#filtro-unidade').value || s.unidades[0]?.id || '');
  }
  $('#form-titulo').textContent = editando ? 'Editar reunião' : 'Nova reunião';
  $('#form-autor').textContent = editando && editando.autorUid !== s.user.uid
    ? `Registrada por ${editando.autorNome}${ehAdmin() ? ' · ' + nomeUnidade(editando.unidadeId) : ''}` : '';
  $('#excluir').hidden = !editando;
  $('#form-erro').textContent = '';
  formAlterado = false;
  preencherSugestoes();
  atualizarTotalJohrei();
  mostrar('form');
}

function atualizarTotalJohrei() {
  const f = $('#form-reuniao');
  $('#total-johrei').textContent = num(f.johreiMembros.value) + num(f.johreiFrequentadores.value) + num(f.johreiPrimeiraVez.value);
}

$('#nova-reuniao').addEventListener('click', () => abrirFormulario());

$('#cancelar').addEventListener('click', () => {
  if (formAlterado && !confirm('Descartar as alterações não salvas?')) return;
  formAlterado = false;
  mostrar('reunioes');
});

$('#form-reuniao').addEventListener('input', () => {
  formAlterado = true;
  atualizarTotalJohrei();
});

$$('.stepper').forEach((st) => {
  const input = $('input', st);
  st.addEventListener('click', (e) => {
    const delta = Number(e.target.dataset.delta);
    if (!delta) return;
    input.value = num(num(input.value) + delta);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  input.addEventListener('focus', () => input.select());
});

function validar(f) {
  for (const [campo, msg] of [
    ['data', 'Informe a data.'],
    ['horaInicio', 'Informe o horário de início.'],
    ['responsavelReuniao', 'Informe o responsável pela reunião.'],
    ['responsavelLar', 'Informe o responsável pelo lar.'],
  ]) {
    if (!f[campo].value.trim()) return [campo, msg];
  }
  if (f.horaFim.value && f.horaFim.value <= f.horaInicio.value) return ['horaFim', 'O término deve ser depois do início.'];
  if (!f.unidadeId.value) return ['unidadeId', 'Escolha a unidade.'];
  return null;
}

$('#form-reuniao').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const erro = validar(f);
  if (erro) {
    $('#form-erro').textContent = erro[1];
    f[erro[0]].focus();
    return;
  }
  const dados = {};
  for (const c of CAMPOS_TEXTO) dados[c] = f[c].value.trim();
  for (const c of CAMPOS_NUMERO) dados[c] = num(f[c].value);

  let id;
  if (editando) {
    id = editando.id;
    Object.assign(dados, {
      unidadeId: editando.unidadeId, autorUid: editando.autorUid, autorNome: editando.autorNome,
      criadoEm: editando.criadoEm, atualizadoEm: agora(),
    });
  } else {
    id = srv.novoIdReuniao();
    Object.assign(dados, {
      unidadeId: ehAdmin() ? f.unidadeId.value : s.perfil.unidadeId,
      autorUid: s.user.uid, autorNome: s.perfil.nome, criadoEm: agora(), atualizadoEm: agora(),
    });
  }
  // Sem esperar o servidor: funciona offline e é enviado quando a internet voltar.
  srv.salvarReuniao(id, dados).catch((err) => toast('A reunião não foi salva: ' + mensagemErro(err)));
  formAlterado = false;
  toast(editando ? 'Reunião atualizada.' : 'Reunião registrada.');
  if (dados.data < $('#de').value || dados.data > $('#ate').value) {
    $('#de').value = dados.data.slice(0, 8) + '01';
    const [a, m] = dados.data.split('-').map(Number);
    $('#ate').value = isoData(new Date(a, m, 0));
    $$('.atalhos button').forEach((b) => b.classList.remove('ativo'));
    assinarReunioes();
  }
  mostrar('reunioes');
});

$('#excluir').addEventListener('click', () => {
  if (!confirm('Excluir esta reunião? Esta ação não pode ser desfeita.')) return;
  srv.excluirReuniao(editando.id).catch((err) => toast('Não foi possível excluir: ' + mensagemErro(err)));
  formAlterado = false;
  toast('Reunião excluída.');
  mostrar('reunioes');
});

window.addEventListener('beforeunload', (e) => {
  if (formAlterado && !$('#view-form').hidden) e.preventDefault();
});

// ---------- Relatórios ----------

$('#exportar-csv').addEventListener('click', () => {
  const lista = reunioesFiltradas().slice().reverse();
  if (!lista.length) return toast('Nenhuma reunião neste período.');
  const cab = ['Unidade', 'Data', 'Início', 'Término', 'Responsável pela reunião', 'Responsável pelo lar', 'Endereço',
    'Participantes', 'Johrei Membros', 'Johrei Frequentadores', 'Johrei 1ª vez', 'Johrei Total', 'Observações', 'Registrado por'];
  const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = lista.map((r) => [
    nomeUnidade(r.unidadeId), formatarData(r.data), r.horaInicio, r.horaFim,
    r.responsavelReuniao, r.responsavelLar, r.endereco, r.participantes,
    r.johreiMembros, r.johreiFrequentadores, r.johreiPrimeiraVez, totalJohrei(r), r.observacoes, r.autorNome,
  ].map(cel).join(';'));
  const { de, ate } = filtroAtual();
  // BOM + ";" para o Excel em português abrir com acentos e colunas corretas.
  baixar(`reunioes-no-lar-${de || 'inicio'}-a-${ate || 'hoje'}.csv`,
    '﻿' + [cab.map(cel).join(';'), ...linhas].join('\r\n'), 'text/csv');
});

$('#imprimir-relatorio').addEventListener('click', () => {
  const lista = reunioesFiltradas().slice().reverse();
  const t = somar(lista);
  const escopo = $('#escopo').value;
  const unidade = escopo === 'minhas' ? `Reuniões registradas por ${s.perfil.nome}`
    : escopo === 'unidade' ? nomeUnidade(s.perfil.unidadeId)
      : ($('#filtro-unidade').value ? nomeUnidade($('#filtro-unidade').value) : 'Todas as unidades');
  $('#impressao').innerHTML = `
    <h1>Reuniões no Lar</h1>
    <p>Igreja Messiânica Mundial do Brasil · ${esc(unidade)}<br>Período: ${esc(descricaoPeriodo())}</p>
    <table>
      <tr><th>Reuniões</th><th>Participantes</th><th>Johrei Membros</th><th>Johrei Frequentadores</th><th>Johrei 1ª vez</th><th>Total de Johreis</th></tr>
      <tr><td>${t.reunioes}</td><td>${t.participantes}</td><td>${t.johreiMembros}</td><td>${t.johreiFrequentadores}</td><td>${t.johreiPrimeiraVez}</td><td>${t.johreiTotal}</td></tr>
    </table>
    <h2>Reuniões</h2>
    <table>
      <tr><th>Data</th><th>Horário</th><th>Lar</th><th>Responsável</th><th>Part.</th><th>Memb.</th><th>Freq.</th><th>1ª vez</th><th>Observações</th></tr>
      ${lista.map((r) => `<tr>
        <td>${esc(formatarData(r.data, { day: '2-digit', month: '2-digit' }))}</td>
        <td>${esc(r.horaInicio)}${r.horaFim ? '–' + esc(r.horaFim) : ''}</td>
        <td>${esc(r.responsavelLar)}${r.endereco ? `<br><small>${esc(r.endereco)}</small>` : ''}</td>
        <td>${esc(r.responsavelReuniao)}</td>
        <td>${r.participantes}</td><td>${r.johreiMembros}</td><td>${r.johreiFrequentadores}</td><td>${r.johreiPrimeiraVez}</td>
        <td class="obs">${esc(r.observacoes)}</td>
      </tr>`).join('') || '<tr><td colspan="9">Nenhuma reunião registrada.</td></tr>'}
    </table>
    <p class="rodape">Emitido em ${esc(new Date().toLocaleString('pt-BR'))} por ${esc(s.perfil.nome)}</p>`;
  window.print();
});

// ---------- Administração ----------

$('#legenda-papeis').innerHTML = Object.entries(PAPEIS).filter(([p]) => p !== 'inativo')
  .map(([, p]) => `<dt>${p.nome}</dt><dd>${p.desc}</dd>`).join('');

const opcoesPapel = (atual, comInativo) => Object.entries(PAPEIS)
  .filter(([p]) => comInativo || p !== 'inativo')
  .map(([p, info]) => `<option value="${p}" ${p === atual ? 'selected' : ''}>${info.nome}</option>`).join('');

const opcoesUnidade = (atual) => '<option value="">— nenhuma —</option>' + s.unidades
  .map((u) => `<option value="${u.id}" ${u.id === atual ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');

function renderUsuarios() {
  if (!ehAdmin()) return;
  const f = $('#form-convite');
  if (!f.papel.options.length) f.papel.innerHTML = opcoesPapel('membro', false);
  const unidadeEscolhida = f.unidadeId.value || s.perfil.unidadeId || s.unidades[0]?.id;
  f.unidadeId.innerHTML = opcoesUnidade(unidadeEscolhida);

  const porEmail = new Map();
  for (const c of s.convites) porEmail.set(c.email, { email: c.email, nome: c.nome, papel: c.papel, unidadeId: c.unidadeId, convite: true });
  for (const u of s.usuarios) porEmail.set(u.email, { ...porEmail.get(u.email), ...u, uid: u.id });
  const pessoas = [...porEmail.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  $('#lista-usuarios').innerHTML = pessoas.map((p) => {
    const eu = p.uid === s.user.uid;
    const situacao = !p.uid ? '<span class="tag aguardando">Aguardando 1º acesso</span>'
      : p.papel === 'inativo' ? '<span class="tag suspenso">Suspenso</span>' : '<span class="tag">Ativo</span>';
    return `<tr data-email="${esc(p.email)}" data-uid="${esc(p.uid || '')}">
      <td>${esc(p.nome)}<br><small class="hint">${esc(p.email)}</small></td>
      <td><select data-campo="papel" aria-label="Perfil" ${eu ? 'disabled' : ''}>${opcoesPapel(p.papel, Boolean(p.uid))}</select></td>
      <td><select data-campo="unidadeId" aria-label="Unidade" ${eu ? 'disabled' : ''}>${opcoesUnidade(p.unidadeId)}</select></td>
      <td>${situacao}</td>
      <td class="acoes">${!p.uid ? '<button type="button" data-acao="cancelar-convite">Cancelar</button>' : ''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="vazio">Ninguém cadastrado ainda.</td></tr>';
}

$('#form-convite').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  mostrarErro(f, '');
  const email = srv.normalizarEmail(f.email.value);
  if (f.papel.value !== 'admin' && !f.unidadeId.value) return mostrarErro(f, 'Escolha a unidade da pessoa.');
  if (s.convites.some((c) => c.email === email) || s.usuarios.some((u) => u.email === email)) {
    return mostrarErro(f, 'Este e-mail já tem acesso. Altere o perfil na lista abaixo.');
  }
  ocupado(f, true);
  try {
    await srv.salvarConvite({ nome: f.nome.value.trim(), email, papel: f.papel.value, unidadeId: f.unidadeId.value });
    toast(`Acesso liberado para ${email}. Peça para a pessoa usar “Primeiro acesso” no app.`);
    f.nome.value = '';
    f.email.value = '';
  } catch (err) {
    mostrarErro(f, err);
  } finally {
    ocupado(f, false);
  }
});

$('#lista-usuarios').addEventListener('change', async (e) => {
  const tr = e.target.closest('tr');
  const campo = e.target.dataset.campo;
  const { email, uid } = tr.dataset;
  const novos = {
    papel: $('[data-campo=papel]', tr).value,
    unidadeId: $('[data-campo=unidadeId]', tr).value || null,
  };
  if (novos.papel !== 'admin' && novos.papel !== 'inativo' && !novos.unidadeId) {
    toast('Membros e supervisores precisam de uma unidade.');
    if (campo === 'papel') return;
  }
  try {
    if (uid) await srv.atualizarUsuario(uid, novos);
    const convite = s.convites.find((c) => c.email === email);
    if (convite) await srv.salvarConvite({ ...convite, ...novos });
    toast('Alteração salva.');
  } catch (err) {
    toast(mensagemErro(err));
    renderUsuarios();
  }
});

$('#lista-usuarios').addEventListener('click', async (e) => {
  if (e.target.dataset.acao !== 'cancelar-convite') return;
  const { email } = e.target.closest('tr').dataset;
  if (!confirm(`Cancelar o acesso de ${email}?`)) return;
  try {
    await srv.excluirConvite(email);
  } catch (err) {
    toast(mensagemErro(err));
  }
});

function renderUnidadesAdmin() {
  const contagem = {};
  for (const u of s.usuarios) contagem[u.unidadeId] = (contagem[u.unidadeId] || 0) + 1;
  $('#lista-unidades').innerHTML = s.unidades.map((u) => `<li data-id="${u.id}">
      <span>${esc(u.nome)} <small class="hint">${contagem[u.id] || 0} pessoa(s)</small></span>
      <span class="acoes"><button type="button" data-acao="renomear">Renomear</button></span>
    </li>`).join('') || '<li class="vazio">Nenhuma unidade. Cadastre a primeira abaixo.</li>';
  const input = $('#form-unidade').nome;
  if (!s.unidades.length && !input.value) input.value = UNIDADE_INICIAL;
}

$('#form-unidade').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = e.target.nome.value.trim();
  if (s.unidades.some((u) => normalizar(u.nome) === normalizar(nome))) return toast('Essa unidade já existe.');
  try {
    const ref = await srv.criarUnidade(nome);
    e.target.reset();
    toast('Unidade cadastrada.');
    // O primeiro administrador ainda não tem unidade: associa-o à primeira criada.
    if (!s.perfil.unidadeId) await srv.atualizarUsuario(s.user.uid, { unidadeId: ref.id });
  } catch (err) {
    toast(mensagemErro(err));
  }
});

$('#lista-unidades').addEventListener('click', async (e) => {
  if (e.target.dataset.acao !== 'renomear') return;
  const u = s.unidades.find((x) => x.id === e.target.closest('li').dataset.id);
  const nome = prompt('Nome da unidade', u.nome);
  if (!nome || !nome.trim()) return;
  try {
    await srv.renomearUnidade(u.id, nome.trim());
  } catch (err) {
    toast(mensagemErro(err));
  }
});

// ---------- Minha conta ----------

function renderConta() {
  if (!s.perfil) return;
  $('#dados-conta').innerHTML = `
    <dt>Nome</dt><dd>${esc(s.perfil.nome)}</dd>
    <dt>E-mail</dt><dd>${esc(s.perfil.email)}</dd>
    <dt>Perfil</dt><dd>${esc(PAPEIS[s.perfil.papel]?.nome)} — ${esc(PAPEIS[s.perfil.papel]?.desc)}</dd>
    <dt>Unidade</dt><dd>${esc(s.perfil.unidadeId ? nomeUnidade(s.perfil.unidadeId) : (ehAdmin() ? 'Todas' : '—'))}</dd>`;
  const input = $('#form-nome').nome;
  if (document.activeElement !== input) input.value = s.perfil.nome;
}

$('#form-nome').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await srv.atualizarUsuario(s.user.uid, { nome: e.target.nome.value.trim() });
    toast('Nome alterado.');
  } catch (err) {
    toast(mensagemErro(err));
  }
});

// ---------- Início ----------

$('#aviso-demo').hidden = !srv.MODO_DEMO;
definirPeriodo('mes');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
