import assert from 'node:assert/strict';
import test from 'node:test';

import { badgeIcons, groupBadges } from '../src/lib/badges.ts';

test('Abzeichen werden je Verkäufer gebündelt und sortiert', () => {
  const g = groupBadges([
    { seller_id: 'a', badge: 'ziel' },
    { seller_id: 'a', badge: 'durchstarter' },
    { seller_id: 'a', badge: 'ziel' },
    { seller_id: 'b', badge: 'unbekannt' },
  ]);
  assert.deepEqual(g.a, ['durchstarter', 'ziel']);
  assert.equal(g.b, undefined);
  assert.equal(badgeIcons(g.a), '🚀 🎯');
  assert.equal(badgeIcons(undefined), '');
});
