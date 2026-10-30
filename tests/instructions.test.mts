import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGateFree, openOf, storageName } from '../src/lib/instruction-rules.ts';

test('Dateiname für den Speicher ohne Umlaute und Leerzeichen', () => {
  assert.equal(storageName('Ablauf Übergabe – Größe.PDF', 1), '1-Ablauf-Ubergabe-Grosse.pdf');
  assert.equal(storageName('ohne endung', 2), '2-ohne-endung');
  assert.equal(storageName('§§§.png', 3), '3-datei.png');
});

test('Offen sind nur aktive, unbestätigte Anweisungen', () => {
  const list = [
    { id: 1, archived_at: null, confirmed_at: null },
    { id: 2, archived_at: null, confirmed_at: '2026-10-30' },
    { id: 3, archived_at: '2026-10-30', confirmed_at: null },
  ];
  assert.deepEqual(openOf(list).map((i) => i.id), [1]);
});

test('Büro-Anzeige und Anweisungen bleiben trotz offener Anweisung erreichbar', () => {
  assert.ok(isGateFree('/anweisungen'));
  assert.ok(isGateFree('/buero'));
  assert.ok(isGateFree('/dashboard/klassisch'));
  assert.ok(!isGateFree('/'));
  assert.ok(!isGateFree('/neu'));
});
