import assert from 'node:assert/strict';
import test from 'node:test';

import { finOf, inStock, matchListings, normalizeNumber, parseInternal, stockNumberOf, type AsanaVehicle, type Listing } from '../src/lib/mobile-match.ts';
import { adsOf, assertReadOnly, basicAuth, customerNumbers, toListing } from '../supabase/functions/mobile-sync/logic.ts';

const task = (name: string, section: string, extra: Partial<AsanaVehicle> = {}): AsanaVehicle => ({
  task_gid: Math.random().toString(), name, section, permalink_url: null, completed: false, created_at: '2026-10-01T00:00:00Z', ...extra,
});
const ad = (vin: string | null, internal_number: string | null = null, first_seen_at = '2026-11-01T00:00:00Z'): Listing => ({
  ad_id: Math.random().toString(), vin, internal_number, title: 'Auto', price: 10000, url: null, first_seen_at,
});

test('FIN-Stellen und Bestandsnummer aus echten Asana-Titeln', () => {
  assert.equal(finOf('Alena Lejko / Opel Insignia / FIN: 071474 / #85 / CT / EXPORT'), '071474');
  assert.equal(finOf('Auto1 / Ford Focus / VIN: K65782 / #275 / MP'), 'K65782');
  assert.equal(finOf('Sebastian Zwick / VW Tiguan / FIN:903191 / #556 / SW'), '903191');
  assert.equal(finOf('David Ly / Audi S5 / RS / #765 / Vin: 085082'), '085082');
  assert.equal(finOf('BMW X3 M40d / Auto1 / 052178 / #60 / CT'), '052178');
  assert.equal(finOf('BMW 118d / Luca Jan Bender / FIN:  E06123 / CT/RE / #850'), 'E06123');
  assert.equal(finOf('Angelina Vistica / Renault Clio / VIN 352290 / #269 / RE'), '352290');
  assert.equal(finOf('BMW X3/ Sabrina Stadelmann / 97040 / #157 / DS 100Euro fehlen'), '97040');
  assert.equal(finOf('Audi A1 / Auto 1 / FIN: 060145 / #... /'), '060145');
  assert.equal(finOf('VW Golf / Max Mustermann / #12'), null);
  assert.equal(stockNumberOf('Alena Lejko / Opel Insignia / FIN: 071474 / #85 / CT'), '85');
  assert.equal(stockNumberOf('Audi A1 / FIN: 060145 / #... /'), null);
  assert.equal(normalizeNumber('#085'), '85');
  assert.equal(normalizeNumber('  '), null);
});

test('Bestand: bis „FZG.-Verkauf (Bestand)“, alles danach gilt als verkauft', () => {
  for (const s of ['FZG.-Beschaffung', 'Logistik', 'FZG.-Administration', 'FZG.-Anlage', 'FZG.-Verkauf (Bestand)']) assert.equal(inStock({ section: s }), true, s);
  for (const s of ['FZG.-Disposition/ Werkstatt', 'FZG.- Fertig', 'Auslieferung', 'Auszahlung/ Prüfung', 'Buchhaltung', 'in Klärung', 'Abgeschlossen', 'Stornos'])
    assert.equal(inStock({ section: s }), false, s);
  assert.equal(inStock({ section: 'FZG.-Verkauf (Bestand)', completed: true }), false);
});

test('Abgleich: verkauft + online = muss offline', () => {
  const tasks = [
    task('Opel Insignia / FIN: 071474 / #85', 'FZG.- Fertig', { sold_on: '2026-11-18' }),
    task('VW Golf / VIN: 230372 / #35', 'FZG.-Verkauf (Bestand)'),
    task('Audi A4 / FIN: 084172 / #10', 'FZG.-Disposition/ Werkstatt'),
    task('MB C200 / FIN: 015508 / #284', 'Abgeschlossen', { completed: true }),
  ];
  const r = matchListings(
    [
      ad('W0LGT8EN0E1071474', null, '2026-11-10T00:00:00Z'),
      ad('WVWZZZ1KZ9W230372'),
      { ...ad(null, '10', '2026-11-05T00:00:00Z'), title: 'AUDI A4 Avant' }, // ohne FIN, über die interne Nummer + Marke
      ad('WDD2050421R015508', null, '2026-11-03T00:00:00Z'),
      ad('WBA00000000999999'), // gibt es in Asana nicht
    ],
    tasks,
  );
  assert.deepEqual(r.offline.map((m) => [m.task.name.split(' /')[0], m.by]), [['MB C200', 'fin'], ['Audi A4', 'nummer'], ['Opel Insignia', 'fin']]);
  assert.deepEqual(r.ok.map((m) => m.task.name.split(' /')[0]), ['VW Golf']);
  assert.equal(r.unknown.length, 1);
});

test('Abgleich: zweimal angekauft zählt die neueste Aufgabe; Nummer mit fremder FIN zählt nicht', () => {
  const tasks = [
    task('Golf / FIN: 123456 / #5', 'Abgeschlossen', { completed: true, created_at: '2026-01-01T00:00:00Z' }),
    task('Golf / FIN: 123456 / #77', 'FZG.-Verkauf (Bestand)', { created_at: '2026-10-01T00:00:00Z' }),
    task('Polo / FIN: 654321 / #9', 'Auslieferung'),
  ];
  const r = matchListings([ad('WVWZZZ00000123456'), ad('WVWZZZ00000111111', '9')], tasks);
  assert.equal(r.ok.length, 1);
  assert.equal(r.offline.length, 0);
  assert.equal(r.unknown.length, 1);
});

test('Interne Nummer wie bei euch: „2093DK / #164“ = FIN-Stellen + Bestandsnummer', () => {
  assert.deepEqual(parseInternal('2093DK / #164'), { fin: '2093', nr: '164' });
  assert.deepEqual(parseInternal('7495AV / #108'), { fin: '7495', nr: '108' });
  assert.deepEqual(parseInternal('1842DK / 543'), { fin: '1842', nr: '543' });
  assert.deepEqual(parseInternal('#085'), { fin: null, nr: '85' });
  assert.equal(finOf('Autowelt Prusseit / S400D / Vin... 198027 / #160'), '198027');
});

test('Wiederverwendete Bestandsnummer: anderes Auto wird nicht zugeordnet', () => {
  const tasks = [
    task('Audi A3 / Rößler / VIN: 060044 / #138 / EXPORT', 'Abgeschlossen', { completed: true }),
    task('Citroen C2 / Laura Pinchuk / FIN: 403460 / CT / #158', 'Abgeschlossen', { completed: true }),
    task('Audi A4 s-line / Jason Beer / FIN: 084172 / #10 / TS', 'FZG.-Disposition/ Werkstatt'),
    task('Audi A6 / Dahmen / VIN: 073833 / #195 / ST', 'FZG.-Verkauf (Bestand)'),
  ];
  const l = (title: string, nr: string): Listing => ({ ...ad(null, nr), title });
  const r = matchListings(
    [l('MERCEDES-BENZ CLA 180', '9168DK / #138'), l('BMW 118i M SPORT', '5759DK / #158'), l('AUDI A4 Limo 40 TDI', '4172DK / #10'), l('AUDI A6 Avant 50 TDI', '3833DK / #960')],
    tasks,
  );
  assert.deepEqual(r.offline.map((m) => m.task.name.split(' /')[0]), ['Audi A4 s-line']);
  assert.deepEqual(r.ok.map((m) => m.task.name.split(' /')[0]), ['Audi A6']); // Nummer vertippt, FIN + Marke passen
  assert.equal(r.unknown.length, 2);
});

test('mobile.de-Inserate lesen (Seller- und Such-API)', () => {
  const seller = toListing({ mobileAdId: '123', vin: 'wvwzzz1kz9w230372', internalNumber: 35, make: 'Volkswagen', model: 'Golf', modelDescription: 'Golf 1.4 TSI', price: { consumerPriceGross: '12990.00' } });
  assert.deepEqual(seller, { ad_id: '123', vin: 'WVWZZZ1KZ9W230372', internal_number: '35', title: 'Volkswagen Golf 1.4 TSI', price: 12990, url: 'https://suchen.mobile.de/fahrzeuge/details.html?id=123' });
  const search = toListing({ mobileAdId: 456, make: { localized: 'BMW' } as never, model: { localized: 'X3' } as never, detailPageUrl: 'https://x/1', price: { consumerPriceGross: 30000 } });
  assert.equal(search?.title, 'BMW X3');
  assert.equal(search?.vin, null);
  assert.equal(search?.url, 'https://x/1');
  assert.equal(toListing({}), null);
  assert.equal(adsOf({ ads: [{ mobileAdId: 1 }] }).length, 1);
  assert.equal(adsOf([{ mobileAdId: 1 }, { mobileAdId: 2 }]).length, 2);
  assert.equal(adsOf(null).length, 0);
  assert.deepEqual(customerNumbers('123456, 654321 ; 123456'), ['123456', '654321']);
  assert.equal(basicAuth('a', 'b'), 'Basic YTpi');
});

test('mobile.de wird nur gelesen', () => {
  assert.doesNotThrow(() => assertReadOnly('/search-api/search'));
  assert.doesNotThrow(() => assertReadOnly('/seller-api/sellers/1/ads'));
  assert.throws(() => assertReadOnly('/seller-api/sellers/1/ads', 'POST'));
  assert.throws(() => assertReadOnly('/seller-api/sellers/1/ads/2', 'DELETE'));
  assert.throws(() => assertReadOnly('/other'));
});
