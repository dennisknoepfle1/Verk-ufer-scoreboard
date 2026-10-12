import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcCommission, gapToNextRank, goalProgress, parseEuro, type BoardRow } from '../src/lib/scoring.ts';

const rates = { base_amount: 100, bank_pct: 20, winter_wheels_pct: 10, registration_pct: 10 };

test('Provision: Grund + Anteile, gleich wie in der Datenbank', () => {
  assert.equal(calcCommission({ bank_commission: 500, winter_wheels_price: 1000, registration_price: 200 }, rates), 320);
  assert.equal(calcCommission({ bank_commission: 0, winter_wheels_price: 0, registration_price: 0 }, rates), 100);
  assert.equal(calcCommission({ bank_commission: 333.33, winter_wheels_price: 0, registration_price: 0 }, rates), 166.67);
});

const row = (id: string, vehicles: number, rank: number): BoardRow => ({
  seller_id: id, full_name: id, vehicles, commission: 0, target_vehicles: null, rank,
});

test('Abstand zum nächsten Platz', () => {
  const rows = [row('a', 9, 1), row('b', 7, 2), row('c', 7, 2), row('d', 5, 4)];
  assert.equal(gapToNextRank(rows, 'a'), null);
  assert.equal(gapToNextRank(rows, 'b')?.vehiclesNeeded, 3);
  const d = gapToNextRank(rows, 'd');
  assert.equal(d?.vehiclesNeeded, 3);
  assert.equal(d?.target.rank, 2);
});

test('Zielfortschritt', () => {
  assert.equal(goalProgress(3, null), null);
  assert.deepEqual(goalProgress(6, 8), { percent: 75, remaining: 2, reached: false });
  assert.deepEqual(goalProgress(9, 8), { percent: 113, remaining: 0, reached: true });
});

test('Euro-Eingaben', () => {
  assert.equal(parseEuro('1.250,50'), 1250.5);
  assert.equal(parseEuro('1250.5'), 1250.5);
  assert.equal(parseEuro('890 €'), 890);
  assert.equal(parseEuro(''), 0);
  assert.equal(parseEuro('abc'), 0);
  assert.equal(parseEuro('-5'), 0);
});
