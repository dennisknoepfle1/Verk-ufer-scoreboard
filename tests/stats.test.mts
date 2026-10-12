import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTrend, perSeller, summarize, pct, stars, type StatSale } from '../src/lib/stats.ts';

const s = (seller: string, sold_on: string, bank: number, winter: number, reg: number, commission = 100): StatSale => ({
  seller_id: seller, seller_name: seller.toUpperCase(), sold_on, bank_commission: bank, winter_wheels_price: winter, registration_price: reg, commission,
});

const sales = [
  s('a', '2026-10-03', 600, 900, 0, 300),
  s('a', '2026-10-09', 0, 0, 180, 120),
  s('b', '2026-10-11', 300, 0, 0, 160),
  s('b', '2026-09-20', 400, 700, 150, 250),
  s('b', '2025-09-30', 999, 0, 0, 999), // außerhalb der 12 Monate
];

test('Verlauf: 12 Monate, leere Monate mit 0, Jahreswechsel', () => {
  const t = monthlyTrend(sales, '2026-10-01');
  assert.equal(t.length, 12);
  assert.equal(t[0].month, '2025-11-01');
  assert.equal(t[11].month, '2026-10-01');
  assert.deepEqual(t[11], { month: '2026-10-01', vehicles: 3, commission: 580 });
  assert.equal(t[10].vehicles, 1);
  assert.equal(t.reduce((a, b) => a + b.vehicles, 0), 4);
});

test('Quoten und Ø Bankprovision', () => {
  const sum = summarize(sales.slice(0, 4));
  assert.equal(sum.vehicles, 4);
  assert.equal(sum.winterRate, 0.5);
  assert.equal(sum.registrationRate, 0.5);
  assert.equal(sum.financedRate, 0.75);
  assert.equal(sum.avgBankCommission, 325);
  assert.equal(summarize([]).avgBankCommission, null);
  assert.equal(pct(null), '–');
  assert.equal(pct(0.666), '67 %');
});

test('Je Verkäufer, sortiert nach Fahrzeugen', () => {
  const rows = perSeller(sales.slice(0, 4));
  // Gleichstand bei Fahrzeugen (je 2): höhere Provision zuerst (A 420 € > B 410 €)
  assert.deepEqual(rows.map((r) => [r.seller_name, r.vehicles]), [['A', 2], ['B', 2]]);
  const a = rows.find((r) => r.seller_id === 'a')!;
  assert.equal(a.winterRate, 0.5);
  assert.equal(a.avgBankCommission, 300);
});

test('Ø Kundenbewertung zählt nur bewertete Verkäufe', () => {
  const list = [
    { ...s('a', '2026-10-01', 0, 0, 0), customer_rating: 5 },
    { ...s('a', '2026-10-02', 0, 0, 0), customer_rating: 4 },
    { ...s('a', '2026-10-03', 0, 0, 0), customer_rating: null },
  ];
  const sum = summarize(list);
  assert.equal(sum.avgRating, 4.5);
  assert.equal(sum.ratingCount, 2);
  assert.equal(summarize([s('a', '2026-10-01', 0, 0, 0)]).avgRating, null);
});

test('Sterne-Anzeige', () => {
  assert.equal(stars(null), '–');
  assert.equal(stars(4.5), '★ 4,5');
  assert.equal(stars(4), '★ 4,0');
});
