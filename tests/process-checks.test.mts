import assert from 'node:assert/strict';
import test from 'node:test';

import { redCount, runChecks, type BoardListing, type BoardTask } from '../src/lib/process-checks.ts';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
let n = 0;
const task = (name: string, section: string, extra: Partial<BoardTask> = {}): BoardTask => ({
  task_gid: String(++n), name, section, permalink_url: `https://app.asana.com/${n}`, completed: false, created_at: ago(10),
  sold_on: '2026-11-01', deal_type: 'Direkter Ankauf', amount: 10000, purchase_price: 8000, bank_commission: 500, due_on: '2026-11-25', ...extra,
});
const ad = (title: string, internal: string, extra: Partial<BoardListing> = {}): BoardListing => ({
  ad_id: title, vin: null, internal_number: internal, title, price: 10000, url: 'https://suchen.mobile.de/x', first_seen_at: ago(5), image_count: 8, ...extra,
});
const get = (r: ReturnType<typeof runChecks>, key: string) => r.find((c) => c.key === key)!;

test('Prozessboard: jede Prüfung findet ihre Fälle', () => {
  const tasks = [
    task('VW Golf / FIN: 111111 / #1', 'FZG.-Administration', { task_gid: 'adm' }),
    task('VW Polo / FIN: 222222 / #2', 'FZG.-Disposition/ Werkstatt', { task_gid: 'ws' }),
    task('Audi A4 / FIN: 084172 / #10', 'FZG.-Disposition/ Werkstatt', { task_gid: 'sold' }),
    task('BMW 320d / FIN: 333333 / #3', 'FZG.-Verkauf (Bestand)', { task_gid: 'stock' }),
    task('Opel Corsa / FIN: 444444 / #4 / EXPORT', 'FZG.-Verkauf (Bestand)', { task_gid: 'export' }),
    task('Seat Leon / FIN: 555555 / #5', 'FZG.-Verkauf (Bestand)', { task_gid: 'online' }),
    task('Ford Kuga / FIN: 666666 / #6', 'FZG.- Fertig', { due_on: null, sold_on: null }),
    task('Kia Ceed / FIN: 777777 / #7', 'Buchhaltung', { purchase_price: null, deal_type: null }),
    task('Mazda 3 / FIN: 888888 / #8', 'FZG.-Verkauf (Bestand)', { completed: true }),
    task('Fiat 500 / FIN: 999999 / #9', 'Abgeschlossen'),
    task('Storno Golf / #11', 'Stornos', { due_on: null }),
  ];
  const times = [
    { task_gid: 'adm', eingang_at: ago(12), section_since: ago(12) },
    { task_gid: 'ws', eingang_at: ago(80), section_since: ago(40) },
    { task_gid: 'stock', eingang_at: ago(95), section_since: ago(20) },
    { task_gid: 'online', eingang_at: ago(70), section_since: ago(20) },
  ];
  const listings = [ad('AUDI A4 Limo', '4172DK / #10'), ad('SEAT Leon FR', '5555DK / #5', { image_count: 0 }), ad('SKODA Octavia', '1234DK / #999')];
  const r = runChecks({ tasks, times, listings, mobileReady: true }, NOW);

  assert.deepEqual(get(r, 'admin').items.map((i) => i.key), ['adm']);
  assert.deepEqual(get(r, 'werkstatt').items.map((i) => i.key), ['ws']); // Audi A4 ohne Spaltenzeit: Anlage vor 10 Tagen
  assert.deepEqual(get(r, 'mobile-verkauft').items.map((i) => i.key), ['AUDI A4 Limo']);
  assert.deepEqual(get(r, 'mobile-fehlt').items.map((i) => [i.key, Boolean(i.warn)]), [['stock', false], ['export', true]]);
  assert.equal(redCount(get(r, 'mobile-fehlt')), 1);
  assert.deepEqual(get(r, 'mobile-bilder').items.map((i) => i.key), ['SEAT Leon FR']);
  assert.deepEqual(get(r, 'mobile-unbekannt').items.map((i) => i.key), ['SKODA Octavia']);
  assert.equal(redCount(get(r, 'mobile-unbekannt')), 0);
  assert.deepEqual(get(r, 'langsteher').items.map((i) => [i.key, Boolean(i.warn)]), [['stock', false], ['online', true]]);
  assert.equal(get(r, 'termin').items.length, 1);
  assert.deepEqual(get(r, 'verkaufsdaten').items.map((i) => i.detail.split(' ·')[0]), ['„Datum Verkauf“ fehlt', '„Art des Geschäftes“ fehlt']);
  assert.equal(get(r, 'abrechnung').items[0].detail, 'fehlt: EK (Auszahlung VB) · Buchhaltung');
  assert.deepEqual(get(r, 'asana-ordnung').items.map((i) => [i.title.split(' /')[0], Boolean(i.warn)]), [['Mazda 3', false], ['Fiat 500', true]]);
});

test('Prozessboard: ohne mobile.de-Abruf sind nur dessen Kacheln grau', () => {
  const r = runChecks({ tasks: [task('VW Golf / #1', 'FZG.-Administration')], times: [], listings: null, mobileReady: false }, NOW);
  assert.ok(get(r, 'mobile-verkauft').unavailable);
  assert.equal(get(r, 'admin').unavailable, undefined);
  // Bilderzahl noch unbekannt (alter Abruf ohne Bilder): Kachel grau statt grün
  const r2 = runChecks({ tasks: [], times: [], listings: [ad('X', '1/#1', { image_count: null })], mobileReady: true }, NOW);
  assert.ok(get(r2, 'mobile-bilder').unavailable);
});
