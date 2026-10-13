// Holt die Fahrzeug-Aufgaben aus Asana (offen + in diesem Monat erledigt, nur lesend) und speichert den Stand in Supabase.
// Läuft alle 15 Minuten (pg_cron) und sofort, wenn der Admin das Projekt ändert oder „Jetzt abrufen“ drückt.
// Schlüssel: Edge-Function-Secret ASANA_TOKEN. Projekt: Tabelle asana_settings (Link oder ID).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { monthStartIso, projectGid, toRow } from './logic.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
  });

async function fail(message: string) {
  await db.from('asana_sync').update({ last_attempt_at: new Date().toISOString(), last_error: message }).eq('id', true);
  return json({ ok: false, error: message });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'POST' }, 405);

  // Nicht öfter als alle 20 Sekunden (schützt vor Dauer-Aufrufen).
  const { data: sync } = await db.from('asana_sync').select('last_attempt_at').maybeSingle();
  if (sync?.last_attempt_at && Date.now() - new Date(sync.last_attempt_at).getTime() < 20_000) {
    return json({ ok: true, skipped: 'zu früh' });
  }

  const token = Deno.env.get('ASANA_TOKEN');
  if (!token) return fail('Kein Asana-Schlüssel hinterlegt');
  const { data: settings } = await db.from('asana_settings').select('project_ref').maybeSingle();
  const gid = projectGid(settings?.project_ref ?? '');
  if (!gid) return fail('Kein Asana-Projekt eingetragen');

  const monthStart = monthStartIso(new Date());
  const rows: ReturnType<typeof toRow>[] = [];
  let offset: string | undefined;
  try {
    for (let page = 0; page < 20; page++) {
      const url = new URL(`https://app.asana.com/api/1.0/projects/${gid}/tasks`);
      url.searchParams.set('completed_since', monthStart); // offene + in diesem Monat erledigte (Einkäufer-Challenge)
      url.searchParams.set('limit', '100');
      url.searchParams.set('opt_fields', 'name,due_on,due_at,permalink_url,memberships.project.gid,memberships.section.name,custom_fields.name,custom_fields.type,custom_fields.date_value,custom_fields.number_value,custom_fields.enum_value.name,created_at,created_by.name,completed');
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 401) return fail('Asana-Schlüssel ungültig oder abgelaufen');
      if (res.status === 403 || res.status === 404) return fail('Asana-Projekt nicht gefunden oder kein Zugriff');
      if (!res.ok) return fail(`Asana antwortet mit Status ${res.status}`);
      const body = await res.json();
      for (const t of body.data ?? []) rows.push(toRow(t, gid));
      offset = body.next_page?.offset;
      if (!offset) break;
    }
  } catch (e) {
    return fail(`Asana nicht erreichbar: ${(e as Error).message}`);
  }

  const { data: n, error } = await db.rpc('asana_replace', { p_rows: rows });
  if (error) return fail(`Speichern fehlgeschlagen: ${error.message}`);
  return json({ ok: true, tasks: n });
});
