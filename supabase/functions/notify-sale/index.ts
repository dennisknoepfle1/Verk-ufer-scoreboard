// Schickt bei einem neuen Verkauf eine Push-Nachricht an alle aktiven Nutzer außer dem Verkäufer.
// Aufgerufen vom Datenbank-Trigger sales_notify_push mit { sale_id }.
// Kein Login nötig: die Funktion prüft selbst, dass der Verkauf frisch ist und noch nicht gemeldet wurde.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC_KEY = 'BH42_DGCFNcdejwm2vopNYSysc8SGay3uBS4C5ouaaoudK_-43AUjSBmNoEmu4yj1VPHZkO7IwB8ZuAFcRsp1l4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST' }, 405);
  const { sale_id, selftest } = await req.json().catch(() => ({}));

  // Selbsttest ohne Versand: Schlüssel laden und eine Nachricht verschlüsseln.
  if (selftest === true) {
    const { data: key } = await db.rpc('push_vapid_private_key');
    if (!key) return json({ ok: false, error: 'VAPID-Schlüssel fehlt' }, 500);
    const k = webpush.generateVAPIDKeys();
    const auth = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const details = webpush.generateRequestDetails(
      { endpoint: 'https://example.invalid/push', keys: { p256dh: k.publicKey, auth } },
      'test',
      { vapidDetails: { subject: 'https://verkaeufer-scoreboard.expo.app', publicKey: VAPID_PUBLIC_KEY, privateKey: key as string } },
    );
    return json({ ok: true, bytes: (details.body as Uint8Array).length, signed: !!details.headers.Authorization });
  }

  if (!Number.isInteger(sale_id)) return json({ error: 'sale_id' }, 400);

  // Genau einmal je Verkauf und nur für frische Verkäufe (älter als 10 Minuten: ignorieren).
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: sale, error } = await db
    .from('sales')
    .update({ push_sent_at: new Date().toISOString() })
    .eq('id', sale_id)
    .is('push_sent_at', null)
    .gte('created_at', since)
    .select('id, vehicle, seller_id, profiles!sales_seller_id_fkey(full_name)')
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!sale) return json({ sent: 0, skipped: true });

  const { data: key } = await db.rpc('push_vapid_private_key');
  if (!key) return json({ error: 'VAPID-Schlüssel fehlt' }, 500);
  webpush.setVapidDetails('https://verkaeufer-scoreboard.expo.app', VAPID_PUBLIC_KEY, key as string);

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id, profiles!inner(status)')
    .eq('profiles.status', 'active')
    .neq('user_id', sale.seller_id);

  const name = (sale.profiles as { full_name?: string } | null)?.full_name?.trim() || 'Jemand';
  const payload = JSON.stringify({
    title: 'Neuer Verkauf 🚗',
    body: sale.vehicle ? `${name} hat verkauft: ${sale.vehicle}` : `${name} hat ein Fahrzeug verkauft.`,
    url: '/',
    tag: `sale-${sale.id}`,
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint); // Abo abgelaufen oder abgemeldet
        else console.error('push failed', code, (e as Error).message);
      }
    }),
  );
  if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone);
  return json({ sent, removed: gone.length });
});
