-- Ausgeliefert genauer (Dennis fand 43/90 zu viel): Aus welcher Spalte kam das Fahrzeug in die Endspalte?
-- Gezählt wird nur, was aus „Auslieferung“ kam (Dennis 2026-10-14: nur Fahrzeuge über Auslieferung).
-- Direkt aus dem Bestand (oder früher) ist keine Kundenauslieferung, z. B. Händlerverkauf. Fehlklicks erkennt asana-sync.
alter table public.asana_lead_times add column delivered_from text;

update public.asana_lead_times l set delivered_checked = false
where l.task_gid in (select d.task_gid from public.asana_deliveries d
                     where d.completed or d.section ~* '(auszahlung|prüfung|pruefung|buchhaltung|abgeschlossen)');

create or replace function public.delivered_summary() returns table (month date, vehicles int, skipped int)
language sql stable set search_path = '' as $$
  with m as (select date_trunc('month', now() at time zone 'Europe/Berlin')::date as cur)
  select x.month, coalesce(c.n, 0)::int, 0::int
  from m, lateral (values (m.cur), ((m.cur - interval '1 month')::date)) as x(month)
  left join lateral (
    select count(*) as n
    from public.asana_lead_times l
    join public.asana_current() d on d.task_gid = l.task_gid
    where l.delivered_at is not null and d.section not ilike '%storno%'
      and l.delivered_from ~* '^\s*auslieferung\s*$'
      and date_trunc('month', l.delivered_at at time zone 'Europe/Berlin')::date = x.month
  ) c on true
  order by x.month desc;
$$;
