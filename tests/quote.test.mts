import assert from 'node:assert/strict';
import test from 'node:test';

import { quoteOfDay } from '../src/lib/quote.ts';

const q = [3, 1, 2].map((id) => ({ id, text: `Spruch ${id}` }));

test('Spruch des Tages wechselt täglich und ist für alle gleich', () => {
  const a = quoteOfDay(q, new Date(2026, 9, 12, 8));
  const b = quoteOfDay(q, new Date(2026, 9, 12, 23));
  const c = quoteOfDay(q, new Date(2026, 9, 13, 8));
  assert.equal(a?.id, b?.id);
  assert.notEqual(a?.id, c?.id);
  assert.equal(quoteOfDay(q, new Date(2026, 9, 15))?.id, a?.id); // nach 3 Tagen wieder von vorn
  assert.equal(quoteOfDay([]), null);
});
