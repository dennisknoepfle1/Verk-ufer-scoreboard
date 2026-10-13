import assert from 'node:assert/strict';
import test from 'node:test';

import { missingInfo, pipelineSummary, type Delivery } from '../src/lib/deliveries.ts';
import { amountOf, dealTypeOf, monthStartIso, projectGid, stageOf, toRow } from '../supabase/functions/asana-sync/logic.ts';

const d = (due_on: string | null, stage: Delivery['stage'] = 'auslieferung'): Delivery => ({
  task_gid: Math.random().toString(), name: 'Auto', section: '', stage, due_on, permalink_url: null,
});

test('Abruf liefert Ersteller, Erstelldatum und Erledigt', () => {
  const r = toRow({ gid: '1', name: 'Golf', created_at: '2026-10-05T08:00:00.000Z', created_by: { name: ' Anna Berg ' }, completed: true }, '5');
  assert.deepEqual([r.created_at, r.created_by, r.completed], ['2026-10-05T08:00:00.000Z', 'Anna Berg', true]);
  assert.equal(toRow({ gid: '2', created_by: null }, '5').created_by, null);
  assert.equal(monthStartIso(new Date('2026-10-12T10:00:00Z')), '2026-09-29T00:00:00.000Z');
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
    { ...d('2026-10-02', 'ausgeliefert'), completed: true },
  ]);
  assert.deepEqual(s.counts.map((c) => `${c.short}:${c.count}`), ['Auszahlung/Prüfung:3', 'Auslieferung:1', 'Fertig:2']);
  assert.equal(s.total, 6);
  assert.deepEqual(s.vehicles.map((v) => v.stage), ['ausgeliefert', 'ausgeliefert', 'ausgeliefert', 'auslieferung', 'fertig', 'fertig']);
  assert.equal(s.vehicles[0].due_on, '2026-09-20');
});

test('Euro: nur direkter Ankauf zählt, fehlende Angaben werden markiert', () => {
  const t = {
    gid: '1',
    custom_fields: [
      { name: 'Verkaufspreis ', type: 'number', number_value: 21990 },
      { name: 'Art des Geschäftes', type: 'enum', enum_value: { name: 'Direkter Ankauf' } },
    ],
  };
  assert.equal(amountOf(t), 21990);
  assert.equal(dealTypeOf(t), 'Direkter Ankauf');
  assert.equal(amountOf({ gid: '2' }), null);
  const direct = { ...d(null, 'fertig'), amount: 20000, deal_type: 'Direkter Ankauf' };
  const s = pipelineSummary([
    direct,
    { ...d(null, 'ausgeliefert'), amount: 15000.5, deal_type: 'Direkter Ankauf' },
    { ...d(null, 'ausgeliefert'), amount: 30000, deal_type: 'Vermittlung' },
    { ...d(null, 'ausgeliefert'), amount: null, deal_type: 'Direkter Ankauf' },
    { ...d(null, 'auslieferung'), amount: 9000, deal_type: null },
    { ...d(null, 'auslieferung'), amount: 7000, deal_type: 'Inzahlungnahme' },
  ]);
  assert.equal(s.euro, 42000.5);
  assert.deepEqual(s.counts.map((c) => c.euro), [15000.5, 7000, 20000]);
  assert.equal(s.missing, 2);
  assert.equal(missingInfo(direct), null);
  assert.equal(missingInfo({ ...direct, amount: null }), 'Verkaufspreis fehlt');
});
