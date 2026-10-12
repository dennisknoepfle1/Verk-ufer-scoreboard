import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

/**
 * Keine Anfrage darf ewig hängen (z. B. wenn das Handy nach dem Ruhezustand noch kein richtiges Netz hat).
 * Nach 15 Sekunden wird abgebrochen; die App zeigt dann einen Fehler statt endlos zu laden.
 */
export const REQUEST_TIMEOUT_MS = 15_000;
export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(url ?? 'https://not-configured.invalid', anonKey ?? 'missing', {
  global: { fetch: fetchWithTimeout },
  auth: {
    // Im Web nutzt Supabase localStorage, auf dem Handy AsyncStorage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
