// Offline eintragen: Verkäufe ohne Netz landen in einer Warteschlange im Browser und werden später übertragen.
// Jeder Eintrag hat eine feste client_id. Die Datenbank lässt jede client_id nur einmal zu, so wird nichts doppelt gezählt.

export type PendingSale = {
  client_id: string;
  user_id: string;
  vehicle: string;
  bank_commission: number;
  winter_wheels_price: number;
  registration_price: number;
  sold_on: string; // Tag der Eingabe, nicht der Übertragung
  queued_at: string;
  error?: string; // vom Server abgelehnt (nicht Netzwerk): bleibt stehen, bis es klappt oder gelöscht wird
};

export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type SendResult = 'ok' | 'duplicate' | 'offline' | { error: string };

const KEY = 'pendingSales';

export function readQueue(kv: KV): PendingSale[] {
  try {
    const list = JSON.parse(kv.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeQueue(kv: KV, list: PendingSale[]) {
  kv.setItem(KEY, JSON.stringify(list));
}

export function enqueue(kv: KV, sale: PendingSale) {
  const list = readQueue(kv).filter((s) => s.client_id !== sale.client_id);
  writeQueue(kv, [...list, sale]);
}

export function removeFromQueue(kv: KV, clientId: string) {
  writeQueue(kv, readQueue(kv).filter((s) => s.client_id !== clientId));
}

/** Überträgt alle wartenden Verkäufe dieses Nutzers der Reihe nach. Bricht ab, sobald das Netz fehlt. */
export async function flushQueue(kv: KV, userId: string, send: (s: PendingSale) => Promise<SendResult>) {
  let sent = 0;
  for (const sale of readQueue(kv).filter((s) => s.user_id === userId)) {
    const r = await send(sale);
    if (r === 'offline') break;
    if (r === 'ok' || r === 'duplicate') {
      removeFromQueue(kv, sale.client_id);
      if (r === 'ok') sent++;
    } else {
      writeQueue(kv, readQueue(kv).map((s) => (s.client_id === sale.client_id ? { ...s, error: r.error } : s)));
    }
  }
  return sent;
}

/** Fehler ohne Antwort vom Server (kein Netz, Funkloch) statt einer Ablehnung durch die Datenbank. */
export function isNetworkError(e: { message?: string; code?: string } | null | undefined, online = true) {
  if (!online) return true;
  if (!e) return false;
  return !e.code && /fetch|network|load failed|timed? ?out|offline/i.test(e.message ?? '');
}

export function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
