// Reine Logik für Web-Push (ohne Browser und Datenbank, damit testbar).

/** Öffentlicher VAPID-Schlüssel; der private liegt nur im Supabase-Vault. */
export const VAPID_PUBLIC_KEY = 'BH42_DGCFNcdejwm2vopNYSysc8SGay3uBS4C5ouaaoudK_-43AUjSBmNoEmu4yj1VPHZkO7IwB8ZuAFcRsp1l4';

export type PushState =
  | 'unsupported' // Gerät/Browser kann kein Web-Push
  | 'ios-install' // iPhone im Safari-Tab: erst zum Home-Bildschirm hinzufügen
  | 'denied' // Erlaubnis abgelehnt, nur in den Einstellungen änderbar
  | 'off'
  | 'on';

export type PushEnv = {
  hasPush: boolean;
  isIos: boolean;
  standalone: boolean;
  permission: 'default' | 'granted' | 'denied';
  subscribed: boolean;
};

/** Welcher Zustand gilt für dieses Gerät? (ohne Browser-Zugriff, damit testbar) */
export function pushState(env: PushEnv): PushState {
  if (env.isIos && !env.standalone) return 'ios-install';
  if (!env.hasPush) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return env.subscribed && env.permission === 'granted' ? 'on' : 'off';
}

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
