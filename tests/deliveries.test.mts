import assert from 'node:assert/strict';
import test from 'node:test';

import { missingInfo, pipelineSummary, stationCounts, STATIONS, type Delivery } from '../src/lib/deliveries.ts';
import { layoutCars } from '../src/lib/autohaus-layout.ts';
import { amountOf, dealTypeOf, leadTimeOf, monthStartIso, needsLeadTime, projectGid, stageOf, toRow } from '../supabase/functions/asana-sync/logic.ts';

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

test('Standzeit: erster Eingang in Administration bis erste Auslieferung danach', () => {
  const mv = (at: string, name: string) => ({ created_at: at, resource_subtype: 'section_changed', new_section: { name } });
  const st = [
    { created_at: '2026-09-23T08:19:00Z', resource_subtype: 'added_to_project' },
    mv('2026-09-23T08:22:00Z', 'Logistik'),
    mv('2026-09-23T08:23:00Z', 'FZG.-Administration'),
    mv('2026-09-25T07:07:00Z', 'FZG.-Anlage'),
    mv('2026-09-25T07:08:00Z', 'FZG.-Administration'),
    mv('2026-10-07T10:13:00Z', 'Auszahlung/ Prüfung'),
    mv('2026-10-08T10:13:00Z', 'Buchhaltung'),
  ];
  assert.deepEqual(leadTimeOf(st), { eingang_at: '2026-09-23T08:23:00Z', ausgeliefert_at: '2026-10-07T10:13:00Z', delivered_at: '2026-10-07T10:13:00Z', delivered_skip: true, delivered_checked: true });
  assert.deepEqual(leadTimeOf([mv('2026-09-21T09:49:00Z', 'FZG.-Disposition/ Werkstatt'), mv('2026-10-07T07:34:00Z', 'Auszahlung/ Prüfung')]), { eingang_at: null, ausgeliefert_at: null, delivered_at: '2026-10-07T07:34:00Z', delivered_skip: true, delivered_checked: true });
  // ausgeliefert = erster Wechsel in Auszahlung/Buchhaltung; aus „Auslieferung“ = regulär, sonst am Prozess vorbei
  const raus = [mv('2026-10-01T08:00:00Z', 'FZG.- Fertig'), mv('2026-10-02T08:00:00Z', 'Auslieferung'), mv('2026-10-03T08:00:00Z', 'FZG.- Fertig'), mv('2026-10-04T08:00:00Z', 'Auslieferung'), mv('2026-10-06T08:00:00Z', 'Auszahlung/ Prüfung'), mv('2026-10-07T08:00:00Z', 'Buchhaltung')];
  assert.equal(leadTimeOf(raus).delivered_at, '2026-10-06T08:00:00Z');
  assert.equal(leadTimeOf(raus).delivered_skip, false);
  assert.equal(leadTimeOf([{ ...mv('2026-10-06T08:00:00Z', 'Buchhaltung'), old_section: { name: 'Auslieferung' } }]).delivered_at, '2026-10-06T08:00:00Z', 'alte Spalte direkt aus Asana');
  assert.equal(leadTimeOf([mv('2026-09-21T09:51:00Z', 'FZG.-Administration'), mv('2026-10-09T14:43:00Z', 'Buchhaltung')]).ausgeliefert_at, '2026-10-09T14:43:00Z');
  assert.equal(leadTimeOf([mv('2026-09-21T09:51:00Z', 'FZG.-Administration')]).ausgeliefert_at, null);
  assert.equal(needsLeadTime({ section: 'A' }, undefined), true);
  assert.equal(needsLeadTime({ section: 'A' }, { section_seen: 'A', ausgeliefert_at: null }), false);
  assert.equal(needsLeadTime({ section: 'B' }, { section_seen: 'A', ausgeliefert_at: null }), true);
  assert.equal(needsLeadTime({ section: 'B' }, { section_seen: 'A', ausgeliefert_at: '2026-10-01T00:00:00Z' }), false);
  assert.equal(needsLeadTime({ section: 'A' }, { section_seen: 'A', ausgeliefert_at: null, delivered_checked: false }), true, 'Auslieferdatum einmal nachholen');
});

test('Pipeline: offene Fahrzeuge je Station', () => {
  const r = (section: string, completed = false) => ({ ...d(null, 'sonstige'), section, completed });
  const s = stationCounts([
    r('FZG.-Beschaffung'), r('FZG.-Verkauf (Bestand)'), r('FZG.-Verkauf (Bestand)'), r('FZG.-Disposition/ Werkstatt'),
    r('FZG.- Fertig'), r('Auslieferung'), r('Auszahlung/ Prüfung'), r('Stornos'), r('Buchhaltung'), r('Abgeschlossen', true), r('FZG.-Anlage', true),
  ]);
  assert.deepEqual(s.map((x) => x.count), [1, 0, 0, 0, 2, 1, 1, 1, 1]);
});

test('3D-Autohaus: Fahrzeuge bekommen Stellplätze in ihrer Zone', () => {
  const cars = [
    ...Array.from({ length: 350 }, (_, i) => ({ gid: `b${String(i).padStart(3, '0')}`, section: 'FZG.-Verkauf (Bestand)', days: i === 5 ? 80 : 10 })),
    { gid: 'f1', section: 'FZG.- Fertig' },
    { gid: 's1', section: 'Stornos' },
  ];
  const { placed, counts } = layoutCars(cars, STATIONS);
  const bestand = counts.find((c) => c.zone.key === 'bestand')!;
  assert.equal(bestand.count, 350);
  assert.equal(bestand.hidden, 350 - 26 * 13);
  assert.equal(placed.filter((p) => p.zone === 'bestand').length, 26 * 13);
  assert.equal(placed.find((p) => p.gid === 'b005')!.long, true);
  assert.ok(placed.find((p) => p.gid === 'f1'));
  assert.equal(placed.find((p) => p.gid === 's1'), undefined, 'Stornos stehen nicht auf dem Hof');
  // keine zwei Autos auf demselben Platz
  assert.equal(new Set(placed.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`)).size, placed.length);
});
