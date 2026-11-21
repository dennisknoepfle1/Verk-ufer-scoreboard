// Holt die online stehenden Inserate von mobile.de (NUR lesend) und speichert den Stand in Supabase.
// Daraus zeigt das Prozessboard, welche Fahrzeuge online sind, in Asana aber schon verkauft.
// Läuft alle 15 Minuten (pg_cron) und sofort bei „Jetzt abrufen“ oder geänderter Kundennummer.
//
// Zugang: Edge-Function-Secrets MOBILE_DE_USER und MOBILE_DE_PASSWORD (API-Benutzer von mobile.de).
// Kundennummer(n): Tabelle mobile_settings (Admin trägt sie im Prozessboard ein).
// Weg: zuerst die Such-API (rein lesend), wenn der Zugang dafür nicht freigeschaltet ist, die Seller-API (nur GET).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { ACCEPT, MOBILE_BASE, adsOf, assertReadOnly, basicAuth, customerNumbers, toListing, type ListingRow } from './logic.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
  });

async function fail(message: string) {
  await db.from('mobile_sync').update({ last_attempt_at: new Date().toISOString(), last_error: message }).eq('id', true);
  return json({ ok: false, error: message });
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`Status ${status}`);
  }
}

/** Einzige Stelle, die mobile.de anspricht: nur GET. */
async function get(auth: string, path: string, params: Record<string, string> = {}) {
  assertReadOnly(path, 'GET');
  const url = new URL(MOBILE_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  const res = await fetch(url, { method: 'GET', headers: { Authorization: auth, Accept: ACCEPT, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

/** Such-API: alle Inserate einer Kundennummer, seitenweise (max. 100 je Seite, mobile.de liefert höchstens 2000). */
async function viaSearch(auth: string, customer: string): Promise<ListingRow[]> {
  const rows: ListingRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const body = await get(auth, '/search-api/search', { customerNumber: customer, 'page.size': '100', 'page.number': String(page) });
    for (const ad of adsOf(body)) {
      const r = toListing(ad);
      if (r) rows.push(r);
    }
    const max = Number((body as { maxPages?: number }).maxPages ?? 1);
    if (page >= max) break;
  }
  return rows;
}

/** Seller-API: alle Inserate aller Händler des API-Zugangs (oder nur der eingetragenen Kundennummern). */
async function viaSeller(auth: string, customers: string[]): Promise<ListingRow[]> {
  const { sellers = [] } = (await get(auth, '/seller-api/sellers')) as { sellers?: { mobileSellerId?: string | number; customerNumber?: string | number }[] };
  const chosen = sellers.filter((s) => !customers.length || customers.includes(String(s.customerNumber ?? '')));
  const rows: ListingRow[] = [];
  for (const s of chosen) {
    if (s.mobileSellerId == null) continue;
    const body = await get(auth, `/seller-api/sellers/${encodeURIComponent(String(s.mobileSellerId))}/ads`);
    for (const ad of adsOf(body)) {
      const r = toListing(ad);
      if (r) rows.push(r);
    }
  }
  return rows;
}

/** Fehlt in der Trefferliste die FIN, einmal das Einzel-Inserat lesen (FIN bleibt danach gespeichert). */
async function fillVins(auth: string, rows: ListingRow[]) {
  const { data: known } = await db.from('mobile_listings').select('ad_id, vin').not('vin', 'is', null);
  const vinById = new Map((known ?? []).map((k) => [k.ad_id as string, k.vin as string]));
  const missing = rows.filter((r) => !r.vin && !(r.vin = vinById.get(r.ad_id) ?? null));
  const deadline = Date.now() + 60_000;
  for (let i = 0; i < Math.min(missing.length, 300) && Date.now() < deadline; i += 6) {
    await Promise.all(
      missing.slice(i, i + 6).map(async (r) => {
        try {
          const ad = toListing((await get(auth, `/search-api/ad/${encodeURIComponent(r.ad_id)}`)) as Parameters<typeof toListing>[0]);
          if (ad?.vin) r.vin = ad.vin;
          if (!r.internal_number && ad?.internal_number) r.internal_number = ad.internal_number;
          if (r.image_count == null && ad?.image_count != null) r.image_count = ad.image_count;
        } catch {
          // beim nächsten Abruf erneut
        }
      }),
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'POST' }, 405);

  // Nicht öfter als alle 20 Sekunden.
  const { data: sync } = await db.from('mobile_sync').select('last_attempt_at').maybeSingle();
  if (sync?.last_attempt_at && Date.now() - new Date(sync.last_attempt_at).getTime() < 20_000) {
    return json({ ok: true, skipped: 'zu früh' });
  }

  const user = Deno.env.get('MOBILE_DE_USER');
  const password = Deno.env.get('MOBILE_DE_PASSWORD');
  if (!user || !password) return fail('Noch kein mobile.de-Zugang hinterlegt');
  const { data: settings } = await db.from('mobile_settings').select('customer_numbers').maybeSingle();
  const customers = customerNumbers(settings?.customer_numbers ?? '');
  const auth = basicAuth(user, password);

  let rows: ListingRow[];
  let source: 'search' | 'seller';
  try {
    if (customers.length) {
      try {
        rows = (await Promise.all(customers.map((c) => viaSearch(auth, c)))).flat();
        source = 'search';
      } catch (e) {
        if (!(e instanceof HttpError) || ![401, 403].includes(e.status)) throw e;
        rows = await viaSeller(auth, customers); // Zugang nur für die Seller-API freigeschaltet
        source = 'seller';
      }
    } else {
      rows = await viaSeller(auth, customers);
      source = 'seller';
    }
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return fail('mobile.de-Zugangsdaten ungültig');
    if (e instanceof HttpError && e.status === 403) return fail('mobile.de-Zugang hat keine Leserechte für diese Kundennummer');
    if (e instanceof HttpError && e.status === 404) return fail('mobile.de-Kundennummer nicht gefunden oder nicht mit dem Zugang verknüpft');
    if (e instanceof HttpError) return fail(`mobile.de antwortet mit ${e.message}`);
    return fail(`mobile.de nicht erreichbar: ${(e as Error).message}`);
  }

  // Doppelte (mehrere Kundennummern) entfernen.
  rows = [...new Map(rows.map((r) => [r.ad_id, r])).values()];
  if (source === 'search') await fillVins(auth, rows);

  const { data: n, error } = await db.rpc('mobile_replace', { p_rows: rows });
  if (error) return fail(`Speichern fehlgeschlagen: ${error.message}`);
  return json({ ok: true, listings: n, source });
});
