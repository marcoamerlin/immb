import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acontecendoAgora, agoraNoFuso, destinatarios, montarAviso } from './aviso.js';

// 07/10/2026 19:30 em São Paulo (UTC-3) = 22:30 UTC
const momento = new Date('2026-10-07T22:30:00Z');
const base = { status: 'andamento', data: '2026-10-07', horaInicio: '19:30', unidadeId: 'u1', autorUid: 'ana' };

test('converte para o horário de São Paulo', () => {
  assert.deepEqual(agoraNoFuso(momento), { data: '2026-10-07', minutos: 19 * 60 + 30 });
});

test('avisa reunião iniciada agora', () => {
  assert.equal(acontecendoAgora(base, momento), true);
  assert.equal(acontecendoAgora({ ...base, horaInicio: '19:05' }, momento), true);
  assert.equal(acontecendoAgora({ ...base, horaInicio: '19:55' }, momento), true);
});

test('não avisa reunião com horário distante de agora', () => {
  assert.equal(acontecendoAgora({ ...base, horaInicio: '18:30' }, momento), false);
  assert.equal(acontecendoAgora({ ...base, horaInicio: '21:00' }, momento), false);
});

test('não avisa lançamento de outro dia', () => {
  assert.equal(acontecendoAgora({ ...base, data: '2026-10-06' }, momento), false);
});

test('não avisa reunião registrada já encerrada', () => {
  assert.equal(acontecendoAgora({ ...base, status: 'encerrada' }, momento), false);
  assert.equal(acontecendoAgora({ ...base, status: undefined }, momento), false);
});

test('destinatários: admins e supervisores da unidade, menos o autor', () => {
  const usuarios = [
    { id: 'adm', papel: 'admin', unidadeId: null },
    { id: 'sup1', papel: 'supervisor', unidadeId: 'u1' },
    { id: 'sup2', papel: 'supervisor', unidadeId: 'u2' },
    { id: 'ana', papel: 'supervisor', unidadeId: 'u1' },
    { id: 'bia', papel: 'membro', unidadeId: 'u1' },
  ];
  assert.deepEqual(destinatarios(usuarios, base), ['adm', 'sup1']);
});

test('monta o texto do aviso', () => {
  const aviso = montarAviso({ ...base, responsavelLar: 'Dona Maria', responsavelReuniao: 'Ana' }, 'Johrei Center Aricanduva', 'r1');
  assert.equal(aviso.titulo, 'Reunião iniciada no lar de Dona Maria');
  assert.equal(aviso.corpo, '19:30 · por Ana · Johrei Center Aricanduva');
  assert.ok(Object.values(aviso).every((v) => typeof v === 'string'));
});
