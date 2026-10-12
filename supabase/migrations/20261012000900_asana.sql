-- Auslieferungen aus Asana (nur lesend). Jede Asana-Aufgabe ist ein Fahrzeug,
-- die Board-Spalte zeigt den Stand: Fahrzeug fertig, Auslieferung, Auszahlung/Prüfung.
-- Die Edge Function asana-sync holt alle 15 Minuten den aktuellen Stand. Jeder Abruf schreibt alle offenen
-- Aufgaben mit demselben Zeitstempel; aktuell ist, was zum letzten erfolgreichen Abruf gehört (asana_current()).
-- Der Asana-Zugangsschlüssel liegt als Edge-Function-Secret ASANA_TOKEN, nie in der Datenbank.

-- Welches Asana-Projekt gelesen wird (Admin trägt den Link ein).
create table public.asana_settings (
  id boolean primary key default true check (id),
  project_ref text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.asana_settings default values;

-- Letzter Abruf: wann, ob erfolgreich, Fehlertext.
create table public.asana_sync (
  id boolean primary key default true check (id),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  task_count int not null default 0
);
insert into public.asana_sync default values;

create table public.asana_deliveries (
  task_gid text primary key,
  name text not null,
  section text not null default '',
  stage text not null check (stage in ('fertig', 'auslieferung', 'ausgeliefert', 'sonstige')),
  due_on date,
  permalink_url text,
  synced_at timestamptz not null default now()
);

alter table public.asana_settings enable row level security;
alter table public.asana_sync enable row level security;
alter table public.asana_deliveries enable row level security;

create policy "Admins lesen Asana-Einstellung" on public.asana_settings for select using (public.is_admin());
create policy "Admins ändern Asana-Einstellung" on public.asana_settings for update using (public.is_admin()) with check (public.is_admin());
create policy "Freigegebene Nutzer lesen Abrufstatus" on public.asana_sync for select using (public.is_active_user());
create policy "Freigegebene Nutzer lesen Auslieferungen" on public.asana_deliveries for select using (public.is_active_user());

-- Nur für die Edge Function: kompletten Stand in einem Schritt speichern (nie halb aktualisiert).
create function public.asana_replace(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; t timestamptz := clock_timestamp();
begin
  insert into public.asana_deliveries (task_gid, name, section, stage, due_on, permalink_url, synced_at)
  select r->>'task_gid', coalesce(r->>'name', ''), coalesce(r->>'section', ''), r->>'stage',
         nullif(r->>'due_on', '')::date, r->>'permalink_url', t
  from jsonb_array_elements(p_rows) r
  on conflict (task_gid) do update set name = excluded.name, section = excluded.section, stage = excluded.stage,
    due_on = excluded.due_on, permalink_url = excluded.permalink_url, synced_at = excluded.synced_at;
  get diagnostics n = row_count;
  update public.asana_sync s set last_attempt_at = t, last_success_at = t, last_error = null, task_count = n where s.id;
  return n;
end;
$$;
revoke all on function public.asana_replace(jsonb) from public, anon, authenticated;
grant execute on function public.asana_replace(jsonb) to service_role;

-- Aktueller Stand = Aufgaben aus dem letzten erfolgreichen Abruf.
create function public.asana_current() returns setof public.asana_deliveries
language sql stable set search_path = '' as $$
  select d.* from public.asana_deliveries d
  where d.synced_at = (select last_success_at from public.asana_sync)
  order by d.due_on nulls last, d.name;
$$;
revoke all on function public.asana_current() from public, anon;
grant execute on function public.asana_current() to authenticated;

-- Abruf anstoßen (Zeitplan, geänderte Einstellung).
create function public.asana_trigger_sync() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://utivqklwuotsnhunassd.supabase.co/functions/v1/asana-sync',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  null; -- Ein Asana-Problem darf nie etwas anderes blockieren.
end;
$$;
revoke all on function public.asana_trigger_sync() from public, anon, authenticated;

create function public.asana_settings_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  perform public.asana_trigger_sync();
  return new;
end;
$$;
revoke all on function public.asana_settings_changed() from public, anon, authenticated;
create trigger asana_settings_sync before update on public.asana_settings
  for each row execute function public.asana_settings_changed();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.asana_sync;
  end if;
end $$;

-- Alle 15 Minuten abrufen (nur wo pg_cron verfügbar ist, also nicht in den lokalen Tests).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('asana-sync', '*/15 * * * *', 'select public.asana_trigger_sync()');
  end if;
end $$;
