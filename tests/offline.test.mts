import assert from 'node:assert/strict';
import test from 'node:test';

import { enqueue, flushQueue, isNetworkError, readQueue, type PendingSale } from '../src/lib/offline.ts';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const sale = (id: string, user = 'u1'): PendingSale => ({
  client_id: id, user_id: user, vehicle: 'Golf', bank_commission: 0, winter_wheels_price: 0,
  registration_price: 0, sold_on: '2026-10-12', queued_at: '2026-10-12T12:00:00Z',
});

test('Warteschlange: gleicher Eintrag wird nicht doppelt gespeichert', () => {
  const kv = memory();
  enqueue(kv, sale('a'));
  enqueue(kv, sale('a'));
  assert.equal(readQueue(kv).length, 1);
});

test('Übertragen: bricht ohne Netz ab, bereits übertragene (Duplikat) fallen raus', async () => {
  const kv = memory();
  ['a', 'b', 'c'].forEach((id) => enqueue(kv, sale(id)));
  enqueue(kv, sale('x', 'anderer'));
  const answers: Record<string, 'ok' | 'duplicate' | 'offline'> = { a: 'ok', b: 'duplicate', c: 'offline' };
  const sent = await flushQueue(kv, 'u1', async (s) => answers[s.client_id]);
  assert.equal(sent, 1);
  assert.deepEqual(readQueue(kv).map((s) => s.client_id), ['c', 'x']); // c wartet weiter, fremder Nutzer bleibt unberührt
});

test('Übertragen: Ablehnung durch den Server bleibt mit Fehler stehen', async () => {
  const kv = memory();
  enqueue(kv, sale('a'));
  await flushQueue(kv, 'u1', async () => ({ error: 'kaputt' }));
  assert.equal(readQueue(kv)[0].error, 'kaputt');
});

test('Netzwerkfehler erkennen', () => {
  assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch' }), true);
  assert.equal(isNetworkError({ message: 'Load failed' }), true);
  assert.equal(isNetworkError({ message: 'violates check', code: '23514' }), false);
  assert.equal(isNetworkError(null, false), true);
});
