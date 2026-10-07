'use strict';

const STORAGE_KEY = 'immb-reunioes';

const TIPOS_PADRAO = [
  'Culto Mensal',
  'Reunião de Ministros',
  'Reunião de Núcleo',
  'Estudo dos Ensinamentos',
  'Reunião de Jovens',
  'Reunião Administrativa',
];

const PAUTAS_MODELO = {
  'Culto Mensal': [
    ['Abertura e Oração', 10],
    ['Leitura do Ensinamento de Meishu-Sama', 10],
    ['Relato de Experiência de Fé', 15],
    ['Palestra / Orientação', 20],
    ['Avisos', 5],
    ['Oração de encerramento', 5],
  ],
  'Reunião de Ministros': [
    ['Oração inicial', 5],
    ['Leitura do Ensinamento', 10],
    ['Revisão dos encaminhamentos anteriores', 15],
    ['Planejamento das atividades', 20],
    ['Assuntos gerais', 10],
    ['Oração final', 5],
  ],
  'Reunião de Núcleo': [
    ['Oração inicial', 5],
    ['Leitura e reflexão do Ensinamento', 15],
    ['Ministração de Johrei', 20],
    ['Partilha de experiências', 15],
    ['Oração final', 5],
  ],
  'Estudo dos Ensinamentos': [
    ['Oração inicial', 5],
    ['Leitura do Ensinamento', 15],
    ['Estudo e debate em grupo', 30],
    ['Conclusões', 10],
    ['Oração final', 5],
  ],
};

// ---------- Estado ----------

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function estadoInicial() {
  return { versao: 1, membros: [], tipos: [...TIPOS_PADRAO], reunioes: [] };
}

function carregar() {
  try {
    const dados = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (dados && Array.isArray(dados.reunioes)) return { ...estadoInicial(), ...dados };
  } catch (e) {
    console.warn('Falha ao ler dados salvos', e);
  }
  return estadoInicial();
}

let estado = carregar();
let reuniaoAtualId = null;

function salvar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  } catch (e) {
    toast('Não foi possível salvar os dados neste aparelho.');
  }
}

const reuniaoAtual = () => estado.reunioes.find((r) => r.id === reuniaoAtualId);
const membroPorId = (id) => estado.membros.find((m) => m.id === id);

function tocarReuniao(r) {
  r.atualizadoEm = new Date().toISOString();
  salvar();
  $('#salvo-em').textContent = 'Salvo automaticamente às ' + new Date(r.atualizadoEm).toLocaleTimeString('pt-BR');
}

// ---------- Utilidades ----------

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ---------- Navegação ----------

function mostrar(view) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
  document.querySelectorAll('.tabs button').forEach((b) => {
    const ativo = b.dataset.view === view || (view === 'reuniao' && b.dataset.view === 'reunioes');
    b.setAttribute('aria-selected', String(ativo));
  });
  if (view === 'reunioes') renderReunioes();
  if (view === 'membros') renderMembros();
  if (view === 'dados') renderTipos();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tabs button').forEach((b) => {
  b.addEventListener('click', () => mostrar(b.dataset.view));
});

// ---------- Lista de reuniões ----------

function preencherSelectTipos(select, comTodos) {
  const atual = select.value;
  select.innerHTML = (comTodos ? '<option value="">Todos os tipos</option>' : '') +
    estado.tipos.map((t) => `<option>${esc(t)}</option>`).join('');
  if (atual) select.value = atual;
}

function cardReuniao(r) {
  const total = r.presentes.length + r.visitantes.length;
  const pendentes = r.tarefas.filter((t) => !t.feito).length;
  return `<li class="card" data-id="${r.id}" tabindex="0">
    <div class="card-data">${esc(formatarData(r.data))}${r.hora ? ' · ' + esc(r.hora) : ''}</div>
    <div class="card-titulo">${esc(r.titulo)}</div>
    <div class="card-meta">
      <span class="tag">${esc(r.tipo)}</span>
      ${r.local ? `<span>📍 ${esc(r.local)}</span>` : ''}
      <span>👥 ${total}</span>
      ${pendentes ? `<span>📌 ${pendentes} pendente(s)</span>` : ''}
    </div>
  </li>`;
}

function renderReunioes() {
  preencherSelectTipos($('#filtro-tipo'), true);
  const termo = normalizar($('#busca').value);
  const tipo = $('#filtro-tipo').value;
  const filtradas = estado.reunioes.filter((r) =>
    (!tipo || r.tipo === tipo) &&
    (!termo || normalizar([r.titulo, r.local, r.responsavel, r.ata].join(' ')).includes(termo)));

  const h = hoje();
  const proximas = filtradas.filter((r) => r.data >= h).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const realizadas = filtradas.filter((r) => r.data < h).sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));

  $('#lista-proximas').innerHTML = proximas.map(cardReuniao).join('') ||
    '<li class="vazio">Nenhuma reunião agendada.</li>';
  $('#lista-realizadas').innerHTML = realizadas.map(cardReuniao).join('') ||
    '<li class="vazio">Nenhuma reunião registrada.</li>';
}

$('#busca').addEventListener('input', renderReunioes);
$('#filtro-tipo').addEventListener('change', renderReunioes);

['#lista-proximas', '#lista-realizadas'].forEach((sel) => {
  const lista = $(sel);
  const abrir = (e) => {
    const card = e.target.closest('.card');
    if (card) abrirReuniao(card.dataset.id);
  };
  lista.addEventListener('click', abrir);
  lista.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(e); });
});

$('#nova-reuniao').addEventListener('click', () => {
  const tipo = $('#filtro-tipo').value || estado.tipos[0] || 'Reunião';
  const r = {
    id: uid(), titulo: tipo, tipo, data: hoje(), hora: '', local: '', responsavel: '',
    pauta: [], presentes: [], visitantes: [], ata: '', tarefas: [],
    criadoEm: new Date().toISOString(),
  };
  estado.reunioes.push(r);
  aplicarPautaModelo(r);
  salvar();
  abrirReuniao(r.id);
  $('#form-reuniao [name=titulo]').select();
});

// ---------- Detalhe da reunião ----------

function abrirReuniao(id) {
  reuniaoAtualId = id;
  const r = reuniaoAtual();
  if (!r) return mostrar('reunioes');
  const form = $('#form-reuniao');
  preencherSelectTipos(form.tipo, false);
  if (!estado.tipos.includes(r.tipo)) form.tipo.insertAdjacentHTML('beforeend', `<option>${esc(r.tipo)}</option>`);
  for (const campo of ['titulo', 'tipo', 'data', 'hora', 'local', 'responsavel']) form[campo].value = r[campo] || '';
  $('#ata').value = r.ata;
  $('#busca-presenca').value = '';
  $('#salvo-em').textContent = r.atualizadoEm
    ? 'Última alteração: ' + new Date(r.atualizadoEm).toLocaleString('pt-BR') : '';
  $('#membros-datalist').innerHTML = estado.membros.map((m) => `<option value="${esc(m.nome)}">`).join('');
  renderPauta();
  renderPresenca();
  renderTarefas();
  mostrar('reuniao');
}

$('#voltar').addEventListener('click', () => mostrar('reunioes'));

$('#form-reuniao').addEventListener('input', (e) => {
  const r = reuniaoAtual();
  if (!r || !e.target.name) return;
  r[e.target.name] = e.target.value;
  tocarReuniao(r);
});
$('#form-reuniao').addEventListener('submit', (e) => e.preventDefault());

$('#ata').addEventListener('input', (e) => {
  const r = reuniaoAtual();
  r.ata = e.target.value;
  tocarReuniao(r);
});

$('#excluir-reuniao').addEventListener('click', () => {
  const r = reuniaoAtual();
  if (!confirm(`Excluir a reunião "${r.titulo}"? Esta ação não pode ser desfeita.`)) return;
  estado.reunioes = estado.reunioes.filter((x) => x.id !== r.id);
  salvar();
  toast('Reunião excluída.');
  mostrar('reunioes');
});

$('#imprimir').addEventListener('click', () => {
  const r = reuniaoAtual();
  const presentes = r.presentes.map(membroPorId).filter(Boolean).map((m) => m.nome)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const lista = (itens) => itens.length ? `<ul>${itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p>—</p>';
  $('#impressao').innerHTML = `
    <h1>Ata — ${esc(r.titulo)}</h1>
    <p><strong>Igreja Messiânica Mundial do Brasil</strong></p>
    <p>${esc(r.tipo)} · ${esc(formatarData(r.data))}${r.hora ? ' às ' + esc(r.hora) : ''}${r.local ? ' · ' + esc(r.local) : ''}</p>
    ${r.responsavel ? `<p>Responsável: ${esc(r.responsavel)}</p>` : ''}
    <h2>Pauta</h2>${r.pauta.length ? `<ol>${r.pauta.map((p) => `<li>${esc(p.texto)}</li>`).join('')}</ol>` : '<p>—</p>'}
    <h2>Presentes (${presentes.length + r.visitantes.length})</h2>${lista(presentes)}
    ${r.visitantes.length ? `<h3>Visitantes</h3>${lista(r.visitantes)}` : ''}
    <h2>Registro</h2><div class="pre">${esc(r.ata) || '—'}</div>
    <h2>Encaminhamentos</h2>${lista(r.tarefas.map((t) =>
      t.descricao + (t.quem ? ` — ${t.quem}` : '') + (t.prazo ? ` (até ${formatarData(t.prazo)})` : '')))}
  `;
  window.print();
});

// Pauta

function aplicarPautaModelo(r) {
  const modelo = PAUTAS_MODELO[r.tipo];
  if (!modelo) return false;
  r.pauta = modelo.map(([texto, duracao]) => ({ id: uid(), texto, duracao, feito: false }));
  return true;
}

function renderPauta() {
  const r = reuniaoAtual();
  $('#pauta').innerHTML = r.pauta.map((p, i) => `<li data-id="${p.id}" class="${p.feito ? 'feito' : ''}">
      <label class="check"><input type="checkbox" data-acao="feito" ${p.feito ? 'checked' : ''}> <span>${esc(p.texto)}</span></label>
      ${p.duracao ? `<span class="hint">${p.duracao} min</span>` : ''}
      <span class="acoes">
        <button type="button" data-acao="subir" title="Mover para cima" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-acao="descer" title="Mover para baixo" ${i === r.pauta.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-acao="remover" title="Remover">✕</button>
      </span>
    </li>`).join('') || '<li class="vazio">Pauta vazia.</li>';
  const total = r.pauta.reduce((s, p) => s + (Number(p.duracao) || 0), 0);
  $('#pauta-total').textContent = total ? `Duração estimada: ${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}` : '';
  $('#pauta-modelo').hidden = !PAUTAS_MODELO[r.tipo];
}

$('#pauta').addEventListener('click', (e) => {
  const acao = e.target.dataset.acao;
  const li = e.target.closest('li[data-id]');
  if (!acao || !li) return;
  const r = reuniaoAtual();
  const i = r.pauta.findIndex((p) => p.id === li.dataset.id);
  if (acao === 'feito') r.pauta[i].feito = e.target.checked;
  if (acao === 'remover') r.pauta.splice(i, 1);
  if (acao === 'subir' && i > 0) [r.pauta[i - 1], r.pauta[i]] = [r.pauta[i], r.pauta[i - 1]];
  if (acao === 'descer' && i < r.pauta.length - 1) [r.pauta[i + 1], r.pauta[i]] = [r.pauta[i], r.pauta[i + 1]];
  tocarReuniao(r);
  renderPauta();
});

$('#form-pauta').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = reuniaoAtual();
  const f = e.target;
  r.pauta.push({ id: uid(), texto: f.item.value.trim(), duracao: Number(f.duracao.value) || 0, feito: false });
  f.reset();
  f.item.focus();
  tocarReuniao(r);
  renderPauta();
});

$('#pauta-modelo').addEventListener('click', () => {
  const r = reuniaoAtual();
  if (r.pauta.length && !confirm('Substituir a pauta atual pela pauta modelo?')) return;
  aplicarPautaModelo(r);
  tocarReuniao(r);
  renderPauta();
});

$('#form-reuniao').addEventListener('change', (e) => {
  if (e.target.name === 'tipo') renderPauta();
});

// Presença

function renderPresenca() {
  const r = reuniaoAtual();
  const termo = normalizar($('#busca-presenca').value);
  const membros = estado.membros
    .filter((m) => !termo || normalizar(m.nome).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#presenca').innerHTML = membros.map((m) => `<li>
      <label class="check"><input type="checkbox" value="${m.id}" ${r.presentes.includes(m.id) ? 'checked' : ''}>
        <span>${esc(m.nome)}${m.funcao ? ` <small class="hint">${esc(m.funcao)}</small>` : ''}</span></label>
    </li>`).join('') ||
    `<li class="vazio">${estado.membros.length ? 'Nenhum membro encontrado.' : 'Cadastre membros na aba "Membros" para registrar presença.'}</li>`;
  $('#visitantes').innerHTML = r.visitantes.map((v, i) =>
    `<li>${esc(v)} <button type="button" data-i="${i}" title="Remover">✕</button></li>`).join('');
  const presentesValidos = r.presentes.filter(membroPorId).length;
  $('#presenca-contagem').textContent = `${presentesValidos} membro(s) · ${r.visitantes.length} visitante(s)`;
}

$('#busca-presenca').addEventListener('input', renderPresenca);

$('#presenca').addEventListener('change', (e) => {
  const r = reuniaoAtual();
  const id = e.target.value;
  r.presentes = r.presentes.filter((x) => x !== id);
  if (e.target.checked) r.presentes.push(id);
  tocarReuniao(r);
  renderPresenca();
});

$('#marcar-todos').addEventListener('click', () => {
  const r = reuniaoAtual();
  const visiveis = [...document.querySelectorAll('#presenca input')].map((i) => i.value);
  r.presentes = [...new Set([...r.presentes, ...visiveis])];
  tocarReuniao(r);
  renderPresenca();
});

$('#desmarcar-todos').addEventListener('click', () => {
  const r = reuniaoAtual();
  r.presentes = [];
  tocarReuniao(r);
  renderPresenca();
});

$('#form-visitante').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = reuniaoAtual();
  r.visitantes.push(e.target.nome.value.trim());
  e.target.reset();
  tocarReuniao(r);
  renderPresenca();
});

$('#visitantes').addEventListener('click', (e) => {
  if (e.target.dataset.i === undefined) return;
  const r = reuniaoAtual();
  r.visitantes.splice(Number(e.target.dataset.i), 1);
  tocarReuniao(r);
  renderPresenca();
});

// Encaminhamentos

function renderTarefas() {
  const r = reuniaoAtual();
  $('#tarefas').innerHTML = r.tarefas.map((t) => `<li data-id="${t.id}" class="${t.feito ? 'feito' : ''}">
      <label class="check"><input type="checkbox" ${t.feito ? 'checked' : ''}> <span>${esc(t.descricao)}</span></label>
      <span class="hint">${t.quem ? esc(t.quem) : ''}${t.prazo ? ' · até ' + esc(formatarData(t.prazo)) : ''}</span>
      <span class="acoes"><button type="button" data-acao="remover" title="Remover">✕</button></span>
    </li>`).join('') || '<li class="vazio">Nenhum encaminhamento.</li>';
}

$('#tarefas').addEventListener('change', (e) => {
  const r = reuniaoAtual();
  const t = r.tarefas.find((x) => x.id === e.target.closest('li').dataset.id);
  t.feito = e.target.checked;
  tocarReuniao(r);
  renderTarefas();
});

$('#tarefas').addEventListener('click', (e) => {
  if (e.target.dataset.acao !== 'remover') return;
  const r = reuniaoAtual();
  r.tarefas = r.tarefas.filter((x) => x.id !== e.target.closest('li').dataset.id);
  tocarReuniao(r);
  renderTarefas();
});

$('#form-tarefa').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = reuniaoAtual();
  const f = e.target;
  r.tarefas.push({ id: uid(), descricao: f.descricao.value.trim(), quem: f.quem.value.trim(), prazo: f.prazo.value, feito: false });
  f.reset();
  tocarReuniao(r);
  renderTarefas();
});

// ---------- Membros ----------

function renderMembros() {
  const termo = normalizar($('#busca-membro').value);
  const contagem = {};
  for (const r of estado.reunioes) for (const id of r.presentes) contagem[id] = (contagem[id] || 0) + 1;
  const membros = estado.membros
    .filter((m) => !termo || normalizar([m.nome, m.funcao].join(' ')).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#lista-membros').innerHTML = membros.map((m) => `<tr data-id="${m.id}">
      <td>${esc(m.nome)}</td><td>${esc(m.funcao)}</td>
      <td>${m.telefone ? `<a href="tel:${esc(m.telefone)}">${esc(m.telefone)}</a>` : ''}</td>
      <td>${contagem[m.id] || 0}</td>
      <td class="acoes"><button data-acao="editar" title="Editar">✎</button><button data-acao="remover" title="Remover">✕</button></td>
    </tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhum membro cadastrado.</td></tr>';
}

$('#busca-membro').addEventListener('input', renderMembros);

$('#form-membro').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  estado.membros.push({ id: uid(), nome: f.nome.value.trim(), funcao: f.funcao.value.trim(), telefone: f.telefone.value.trim() });
  salvar();
  f.reset();
  f.nome.focus();
  renderMembros();
});

$('#lista-membros').addEventListener('click', (e) => {
  const acao = e.target.dataset.acao;
  const tr = e.target.closest('tr[data-id]');
  if (!acao || !tr) return;
  const m = membroPorId(tr.dataset.id);
  if (acao === 'remover') {
    if (!confirm(`Remover ${m.nome}? As presenças registradas deste membro deixarão de aparecer.`)) return;
    estado.membros = estado.membros.filter((x) => x.id !== m.id);
    for (const r of estado.reunioes) r.presentes = r.presentes.filter((id) => id !== m.id);
  }
  if (acao === 'editar') {
    const nome = prompt('Nome', m.nome);
    if (nome === null || !nome.trim()) return;
    const funcao = prompt('Função', m.funcao);
    const telefone = prompt('Telefone', m.telefone);
    Object.assign(m, { nome: nome.trim(), funcao: (funcao ?? m.funcao).trim(), telefone: (telefone ?? m.telefone).trim() });
  }
  salvar();
  renderMembros();
});

// ---------- Dados ----------

function renderTipos() {
  $('#lista-tipos').innerHTML = estado.tipos.map((t, i) =>
    `<li>${esc(t)} <button type="button" data-i="${i}" title="Remover">✕</button></li>`).join('');
}

$('#form-tipo').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = e.target.nome.value.trim();
  if (!estado.tipos.includes(nome)) estado.tipos.push(nome);
  e.target.reset();
  salvar();
  renderTipos();
});

$('#lista-tipos').addEventListener('click', (e) => {
  if (e.target.dataset.i === undefined) return;
  if (estado.tipos.length <= 1) return toast('Mantenha ao menos um tipo de reunião.');
  estado.tipos.splice(Number(e.target.dataset.i), 1);
  salvar();
  renderTipos();
});

$('#exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `immb-reunioes-${hoje()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#importar').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    const dados = JSON.parse(await arquivo.text());
    if (!Array.isArray(dados.reunioes) || !Array.isArray(dados.membros)) throw new Error('formato inválido');
    if (!confirm('Importar este backup substituirá todos os dados atuais. Continuar?')) return;
    estado = { ...estadoInicial(), ...dados };
    salvar();
    toast('Backup importado com sucesso.');
    renderTipos();
  } catch (err) {
    toast('Arquivo de backup inválido.');
  }
});

// ---------- Início ----------

mostrar('reunioes');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
