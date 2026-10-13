-- Standzeit je Fahrzeug: vom Eingang (erstes Mal in Spalte „FZG.-Administration“) bis ausgeliefert
-- (erstes Mal in „Auszahlung/ Prüfung“, sonst „Buchhaltung“/„Abgeschlossen“). Die Zeitpunkte stammen aus dem
-- Verlauf der Asana-Aufgabe. Die Edge Function asana-sync liest den Verlauf nur neu, wenn sich die Spalte geändert hat.
create table public.asana_lead_times (
  task_gid text primary key,
  eingang_at timestamptz,
  ausgeliefert_at timestamptz,
  section_seen text not null default '',
  checked_at timestamptz not null default now()
);
alter table public.asana_lead_times enable row level security;
create policy "Admins lesen Standzeiten" on public.asana_lead_times for select using (public.is_admin());

-- Ø Standzeit je Monat der Auslieferung (deutsche Zeit). Nur Fahrzeuge mit Eingang über die Administration, ohne Stornos.
create function public.lead_time_months() returns table (month date, vehicles int, avg_days numeric, median_days numeric, max_days numeric)
language sql stable set search_path = '' as $$
  with t as (
    select date_trunc('month', l.ausgeliefert_at at time zone 'Europe/Berlin')::date as month,
           extract(epoch from (l.ausgeliefert_at - l.eingang_at)) / 86400 as days
    from public.asana_lead_times l
    join public.asana_current() d on d.task_gid = l.task_gid
    where l.eingang_at is not null and l.ausgeliefert_at is not null and d.section not ilike '%storno%'
  )
  select month, count(*)::int, round(avg(days)::numeric, 1),
         round((percentile_cont(0.5) within group (order by days))::numeric, 1), round(max(days)::numeric, 1)
  from t group by month order by month desc;
$$;

-- Fahrzeuge, die gerade stehen: eingegangen, noch nicht ausgeliefert, mit laufenden Tagen.
create function public.lead_time_open() returns table (task_gid text, name text, section text, eingang_at timestamptz, days numeric, permalink_url text)
language sql stable set search_path = '' as $$
  select d.task_gid, d.name, d.section, l.eingang_at,
         round((extract(epoch from (now() - l.eingang_at)) / 86400)::numeric, 1), d.permalink_url
  from public.asana_lead_times l
  join public.asana_current() d on d.task_gid = l.task_gid
  where l.eingang_at is not null and l.ausgeliefert_at is null and not d.completed
    and d.section not ilike '%storno%'
    and d.section !~* '(auszahlung|prüfung|pruefung|buchhaltung|abgeschlossen)'
  order by l.eingang_at;
$$;

-- Wie weit der Verlauf schon ausgewertet ist (beim ersten Mal dauert es ein paar Abrufe).
create function public.lead_time_status() returns table (tasks int, checked int)
language sql stable set search_path = '' as $$
  select (select count(*)::int from public.asana_current() d where d.section not ilike '%storno%'),
         (select count(*)::int from public.asana_lead_times l join public.asana_current() d on d.task_gid = l.task_gid
          where d.section not ilike '%storno%');
$$;

revoke all on function public.lead_time_months() from public, anon;
revoke all on function public.lead_time_open() from public, anon;
revoke all on function public.lead_time_status() from public, anon;
grant execute on function public.lead_time_months() to authenticated;
grant execute on function public.lead_time_open() to authenticated;
grant execute on function public.lead_time_status() to authenticated;
