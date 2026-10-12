import assert from 'node:assert/strict';
import test from 'node:test';

import { bundlesOf, isNewVersion } from '../src/lib/version.ts';

test('erkennt neue Version am Programmpaket', () => {
  const a = bundlesOf('<script src="/_expo/static/js/web/entry-aaa.js" defer></script>');
  const b = bundlesOf('<script src="/_expo/static/js/web/entry-bbb.js" defer></script>');
  assert.deepEqual(a, ['/_expo/static/js/web/entry-aaa.js']);
  assert.equal(isNewVersion(a, a), false);
  assert.equal(isNewVersion(a, b), true);
  assert.equal(isNewVersion(a, []), false, 'Fehlerseite ohne Paket löst kein Neuladen aus');
});
