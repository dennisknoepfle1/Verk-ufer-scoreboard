import assert from 'node:assert/strict';
import test from 'node:test';

import { deliverySummary, type Delivery } from '../src/lib/deliveries.ts';
import { projectGid, stageOf, toRow } from '../supabase/functions/asana-sync/logic.ts';

const d = (due_on: string | null, stage: Delivery['stage'] = 'auslieferung'): Delivery => ({
  task_gid: Math.random().toString(), name: 'Auto', section: '', stage, due_on, permalink_url: null,
});

test('Spalten werden richtig zugeordnet', () => {
  assert.equal(stageOf('Fahrzeug fertig'), 'fertig');
  assert.equal(stageOf('Auslieferung'), 'auslieferung');
  assert.equal(stageOf('Auszahlung/ Prüfung'), 'ausgeliefert');
  assert.equal(stageOf('Auszahlung / Pruefung'), 'ausgeliefert');
  assert.equal(stageOf('Ideen'), 'sonstige');
});

test('Projekt-ID aus Asana-Links', () => {
  assert.equal(projectGid('https://app.asana.com/0/1201234567890123/list'), '1201234567890123');
  assert.equal(projectGid('https://app.asana.com/0/1201234567890123/board'), '1201234567890123');
  assert.equal(projectGid('https://app.asana.com/1/1100000000000001/project/1209876543210987/board/1209876543210999'), '1209876543210987');
  assert.equal(projectGid(' 1209876543210987 '), '1209876543210987');
  assert.equal(projectGid('Auslieferungen'), null);
});

test('Aufgabe -> Zeile nimmt die Spalte des richtigen Projekts', () => {
  const r = toRow({ gid: '1', name: ' Golf ', due_on: null, due_at: '2026-10-15T09:00:00.000Z',
    memberships: [{ project: { gid: '9' }, section: { name: 'Anderes' } }, { project: { gid: '5' }, section: { name: 'Fahrzeug fertig' } }] }, '5');
  assert.deepEqual([r.name, r.stage, r.due_on], ['Golf', 'fertig', '2026-10-15']);
});

test('Übersicht: 7 Tage, überfällig, später/ohne Datum, ausgelieferte zählen nicht', () => {
  const now = new Date(2026, 9, 12, 10); // Mo 12.10.2026
  const s = deliverySummary([
    d('2026-10-12'), d('2026-10-12', 'fertig'), d('2026-10-13'), d('2026-10-18'),
    d('2026-10-19'), d(null), d('2026-10-10'), d('2026-10-13', 'ausgeliefert'),
  ], now);
  assert.deepEqual(s.days.map((x) => `${x.label}:${x.count}`), ['Heute:2', 'Morgen:1', 'Mi:0', 'Do:0', 'Fr:0', 'Sa:0', 'So:1']);
  assert.equal(s.next7, 4);
  assert.equal(s.later, 2);
  assert.equal(s.overdue, 1);
  assert.equal(s.pending.length, 7);
});
