import assert from 'node:assert/strict';
import test from 'node:test';

import { pipelineSummary, type Delivery } from '../src/lib/deliveries.ts';
import { projectGid, stageOf, toRow } from '../supabase/functions/asana-sync/logic.ts';

const d = (due_on: string | null, stage: Delivery['stage'] = 'auslieferung'): Delivery => ({
  task_gid: Math.random().toString(), name: 'Auto', section: '', stage, due_on, permalink_url: null,
});

test('Spalten werden richtig zugeordnet', () => {
  assert.equal(stageOf('Fahrzeug fertig'), 'fertig');
  assert.equal(stageOf('Auslieferung'), 'auslieferung');
  assert.equal(stageOf('Auszahlung/ Prüfung'), 'ausgeliefert');
  assert.equal(stageOf('Auszahlung / Pruefung'), 'ausgeliefert');
  assert.equal(stageOf('FZG.- Fertig'), 'fertig');
  assert.equal(stageOf('FZG.-Verkauf (Bestand)'), 'sonstige');
  assert.equal(stageOf('Abgeschlossen'), 'sonstige');
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

test('Auslieferungstag kommt aus „Termin Auslieferung“, sonst Fälligkeit', () => {
  const cf = (date: string | null) => [{ name: 'Datum Verkauf', type: 'date', date_value: { date: '2026-10-01' } }, { name: 'Termin Auslieferung', type: 'date', date_value: date ? { date } : null }];
  assert.equal(toRow({ gid: '1', due_on: '2026-10-20', custom_fields: cf('2026-10-15') }, '5').due_on, '2026-10-15');
  assert.equal(toRow({ gid: '1', due_on: '2026-10-20', custom_fields: cf(null) }, '5').due_on, '2026-10-20');
  assert.equal(toRow({ gid: '1', due_on: null, custom_fields: cf(null) }, '5').due_on, null);
});

test('Cashflow: alle drei Spalten zählen, Auszahlung/Prüfung zuerst, Sonstige nicht', () => {
  const s = pipelineSummary([
    d('2026-10-12', 'fertig'), d(null, 'fertig'), d('2026-10-13', 'auslieferung'),
    d('2026-10-01', 'ausgeliefert'), d('2026-09-20', 'ausgeliefert'), d(null, 'ausgeliefert'), d(null, 'sonstige'),
  ]);
  assert.deepEqual(s.counts.map((c) => `${c.short}:${c.count}`), ['Auszahlung/Prüfung:3', 'Auslieferung:1', 'Fertig:2']);
  assert.equal(s.total, 6);
  assert.deepEqual(s.vehicles.map((v) => v.stage), ['ausgeliefert', 'ausgeliefert', 'ausgeliefert', 'auslieferung', 'fertig', 'fertig']);
  assert.equal(s.vehicles[0].due_on, '2026-09-20');
});
