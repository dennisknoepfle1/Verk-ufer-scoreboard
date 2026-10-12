import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { flushQueue, isNetworkError, readQueue, removeFromQueue, type KV, type PendingSale, type SendResult } from './offline';
import { supabase } from './supabase';

const memory = new Map<string, string>();
/** Browser-Speicher; ohne Browser (native) ein Zwischenspeicher im Arbeitsspeicher. */
export const kv: KV =
  Platform.OS === 'web' && typeof localStorage !== 'undefined'
    ? localStorage
    : { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };

export const isOnline = () => (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine !== false : true);

/** Einen Verkauf an die Datenbank senden. */
export async function sendSale(s: PendingSale): Promise<SendResult & ('ok' | 'duplicate' | 'offline' | { error: string })> {
  if (!isOnline()) return 'offline';
  try {
    const { error } = await supabase.from('sales').insert({
      client_id: s.client_id,
      vehicle: s.vehicle,
      bank_commission: s.bank_commission,
      winter_wheels_price: s.winter_wheels_price,
      registration_price: s.registration_price,
      sold_on: s.sold_on,
    });
    if (!error) return 'ok';
    if (error.code === '23505') return 'duplicate';
    if (isNetworkError(error)) return 'offline';
    return { error: error.message };
  } catch (e) {
    return isNetworkError(e as Error) ? 'offline' : { error: String(e) };
  }
}

let flushing: Promise<number> | null = null;

/** Wartende Verkäufe dieses Nutzers; überträgt sie automatisch, sobald Netz da ist. */
export function usePendingSales(userId: string | undefined, onSent?: () => void) {
  const [pending, setPending] = useState<PendingSale[]>([]);
  const refresh = useCallback(() => setPending(userId ? readQueue(kv).filter((s) => s.user_id === userId) : []), [userId]);

  const flush = useCallback(async () => {
    if (!userId) return;
    // Nie zwei Übertragungen gleichzeitig, sonst könnte derselbe Eintrag doppelt losgehen.
    flushing ??= flushQueue(kv, userId, sendSale).finally(() => (flushing = null));
    const sent = await flushing;
    refresh();
    if (sent > 0) onSent?.();
  }, [userId, refresh, onSent]);

  useEffect(() => {
    refresh();
    flush();
    if (Platform.OS !== 'web') return;
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    const t = setInterval(() => readQueue(kv).some((s) => s.user_id === userId) && flush(), 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(t);
    };
  }, [flush, refresh, userId]);

  const discard = (clientId: string) => {
    removeFromQueue(kv, clientId);
    refresh();
  };
  return { pending, flush, discard };
}
