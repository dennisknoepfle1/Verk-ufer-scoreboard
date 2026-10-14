-- Dennis: auch Fahrzeuge zählen, die „Auslieferung“ übersprungen haben, aber getrennt ausweisen (am Prozess vorbei).
alter table public.asana_lead_times add column delivered_skip boolean not null default false;

-- Verlauf der bereits ausgelieferten Fahrzeuge einmal neu auswerten lassen.
update public.asana_lead_times l set delivered_checked = false
where l.task_gid in (select d.task_gid from public.asana_deliveries d
                     where d.completed or d.section ~* '(auszahlung|prüfung|pruefung|buchhaltung|abgeschlossen)');

-- Neue Funktion statt Änderung von delivered_months (die bleibt für alte Versionen der Seite bestehen).
create function public.delivered_summary() returns table (month date, vehicles int, skipped int)
language sql stable set search_path = '' as $$
  with m as (select date_trunc('month', now() at time zone 'Europe/Berlin')::date as cur)
  select x.month, coalesce(c.n, 0)::int, coalesce(c.s, 0)::int
  from m, lateral (values (m.cur), ((m.cur - interval '1 month')::date)) as x(month)
  left join lateral (
    select count(*) as n, count(*) filter (where l.delivered_skip) as s
    from public.asana_lead_times l
    join public.asana_current() d on d.task_gid = l.task_gid
    where l.delivered_at is not null and d.section not ilike '%storno%'
      and date_trunc('month', l.delivered_at at time zone 'Europe/Berlin')::date = x.month
  ) c on true
  order by x.month desc;
$$;

revoke all on function public.delivered_summary() from public, anon;
grant execute on function public.delivered_summary() to authenticated;
