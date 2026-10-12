// Web-Push: Benachrichtigung auf dem Handy, sobald jemand einen Verkauf einträgt.
// Auf dem iPhone geht das nur in der App vom Home-Bildschirm (ab iOS 16.4), nicht im normalen Safari-Tab.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import { base64UrlToBytes, pushState, VAPID_PUBLIC_KEY, type PushEnv, type PushState } from './push-state';

export type { PushState };

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';

function browserEnv(): Omit<PushEnv, 'subscribed'> {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { hasPush, isIos, standalone, permission: hasPush ? Notification.permission : 'default' };
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
}

async function save(userId: string, sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, user_id: userId, p256dh: j.keys?.p256dh, auth: j.keys?.auth });
  if (error) throw new Error(error.message);
}

/** Benachrichtigungen auf diesem Gerät einschalten (fragt nach Erlaubnis). */
export async function enablePush(userId: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) as BufferSource }));
  await save(userId, sub);
  return 'on';
}

/** Benachrichtigungen auf diesem Gerät ausschalten. */
export async function disablePush(): Promise<void> {
  if (!isWeb() || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export function usePush(userId: string | undefined) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!isWeb()) return setState('unsupported');
    const env = browserEnv();
    let subscribed = false;
    if (env.hasPush) {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager?.getSubscription();
      subscribed = !!sub;
      // Abo dem angemeldeten Nutzer zuordnen (z. B. nach Neuinstallation oder Nutzerwechsel).
      if (sub && userId && env.permission === 'granted') save(userId, sub).catch(() => {});
    }
    setState(pushState({ ...env, subscribed }));
  }, [userId]);

  useEffect(() => {
    check().catch(() => setState('unsupported'));
  }, [check]);

  const toggle = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        setState(await enablePush(userId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [state, userId]);

  return { state, busy, error, toggle };
}
