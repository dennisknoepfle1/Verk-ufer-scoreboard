// Morgen-Push an die Admins (Dennis, 21.11.2026): jeden Morgen um 7 Uhr, aber nur wenn im Prozessboard etwas rot ist.
// Gleiche Rechenlogik wie die App: process-checks.ts und mobile-match.ts werden beim Bereitstellen aus src/lib
// hierher kopiert (siehe shared.txt und den Workflow „Supabase einspielen“).
// Aufruf per pg_cron um 5 und 6 Uhr UTC; die Funktion schickt nur, wenn es in Berlin 7 Uhr ist, und höchstens einmal am Tag.
// {test:true} rechnet nur und schickt nichts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

import { digestMessage, runChecks, type BoardListing, type BoardTask, type TaskTimes } from './process-checks.ts';

const VAPID_PUBLIC_KEY = 'BH42_DGCFNcdejwm2vopNYSysc8SGay3uBS4C5ouaaoudK_-43AUjSBmNoEmu4yj1VPHZkO7IwB8ZuAFcRsp1l4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function loadAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

const berlin = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

async function checks() {
  const { data: a } = await db.from('asana_sync').select('last_success_at').maybeSingle();
  const { data: m } = await db.from('mobile_sync').select('last_success_at').maybeSingle();
  if (!a?.last_success_at) throw new Error('Asana noch nicht abgerufen');
  const [tasks, times, listings] = await Promise.all([
    loadAll<BoardTask>((f, t) => db.from('asana_deliveries').select('*').eq('synced_at', a.last_success_at).order('task_gid').range(f, t)),
    loadAll<TaskTimes>((f, t) => db.from('asana_lead_times').select('task_gid, eingang_at, section_since').order('task_gid').range(f, t)),
    m?.last_success_at
      ? loadAll<BoardListing>((f, t) => db.from('mobile_listings').select('*').eq('synced_at', m.last_success_at).order('ad_id').range(f, t))
      : Promise.resolve(null),
  ]);
  return runChecks({ tasks, times, listings, mobileReady: listings != null });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST' }, 405);
  const { test } = await req.json().catch(() => ({}));
  const now = berlin(new Date());

  if (test === true) {
    const c = await checks();
    return json({ ok: true, message: digestMessage(c) });
  }
  if (now.hour !== 7) return json({ ok: true, skipped: 'nicht 7 Uhr' });

  // Höchstens einmal am Tag (auch wenn der Aufruf doppelt kommt).
  const { data: claimed } = await db
    .from('process_digest')
    .update({ last_sent_on: now.day })
    .eq('id', true)
    .or(`last_sent_on.is.null,last_sent_on.lt.${now.day}`)
    .select('id')
    .maybeSingle();
  if (!claimed) return json({ ok: true, skipped: 'heute schon gesendet' });

  let message;
  try {
    message = digestMessage(await checks());
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
  if (!message) return json({ ok: true, sent: 0, clean: true });

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, profiles!inner(status, role)')
    .eq('profiles.status', 'active')
    .eq('profiles.role', 'admin');
  const { data: key } = await db.rpc('push_vapid_private_key');
  if (!key) return json({ ok: false, error: 'VAPID-Schlüssel fehlt' });
  webpush.setVapidDetails('https://verkaeufer-scoreboard.expo.app', VAPID_PUBLIC_KEY, key as string);
  const payload = JSON.stringify({ ...message, url: '/admin/prozesse', tag: `prozessboard-${now.day}` });
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      console.error('push failed', (e as { statusCode?: number }).statusCode, (e as Error).message);
    }
  }
  return json({ ok: true, sent });
});
