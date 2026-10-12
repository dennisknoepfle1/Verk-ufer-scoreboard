import assert from 'node:assert/strict';
import test from 'node:test';

import { base64UrlToBytes, pushState, VAPID_PUBLIC_KEY, type PushEnv } from '../src/lib/push-state.ts';

const env = (o: Partial<PushEnv>): PushEnv => ({ hasPush: true, isIos: false, standalone: false, permission: 'default', subscribed: false, ...o });

test('iPhone im Safari-Tab muss erst zum Home-Bildschirm', () => {
  assert.equal(pushState(env({ isIos: true, hasPush: false })), 'ios-install');
  assert.equal(pushState(env({ isIos: true, standalone: true })), 'off');
});

test('Zustände für Android/Desktop', () => {
  assert.equal(pushState(env({ hasPush: false })), 'unsupported');
  assert.equal(pushState(env({ permission: 'denied' })), 'denied');
  assert.equal(pushState(env({ permission: 'granted', subscribed: true })), 'on');
  assert.equal(pushState(env({ permission: 'default', subscribed: true })), 'off');
});

test('VAPID-Schlüssel ist ein unkomprimierter P-256-Punkt', () => {
  const b = base64UrlToBytes(VAPID_PUBLIC_KEY);
  assert.equal(b.length, 65);
  assert.equal(b[0], 4);
});
