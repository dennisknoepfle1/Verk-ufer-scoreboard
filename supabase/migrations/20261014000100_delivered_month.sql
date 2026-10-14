-- „Ausgeliefert im Monat“ (Dennis): erster Wechsel aus der Spalte „Auslieferung“ in die nächste (Auszahlung/ Prüfung,
-- sonst Buchhaltung/Abgeschlossen), für alle Fahrzeuge, auch die, die nie durch die Administration liefen. Stornos zählen nicht.
alter table public.asana_lead_times
  add column delivered_at timestamptz,
  add column delivered_checked boolean not null default false;

-- Verlauf einmal neu lesen nur bei Fahrzeugen, die schon hinter der Auslieferung stehen oder erledigt sind. Alle anderen
-- haben noch kein Auslieferdatum und werden beim nächsten Spaltenwechsel ohnehin neu gelesen.
update public.asana_lead_times l set delivered_checked = true
where l.task_gid in (select d.task_gid from public.asana_deliveries d
                     where not d.completed and d.section !~* '(auszahlung|prüfung|pruefung|buchhaltung|abgeschlossen)');

-- Anzahl je Monat (deutsche Zeit) für diesen und den Vormonat.
create function public.delivered_months() returns table (month date, vehicles int)
language sql stable set search_path = '' as $$
  with m as (select date_trunc('month', now() at time zone 'Europe/Berlin')::date as cur)
  select x.month, coalesce(c.n, 0)::int
  from m, lateral (values (m.cur), ((m.cur - interval '1 month')::date)) as x(month)
  left join lateral (
    select count(*) as n
    from public.asana_lead_times l
    join public.asana_current() d on d.task_gid = l.task_gid
    where l.delivered_at is not null and d.section not ilike '%storno%'
      and date_trunc('month', l.delivered_at at time zone 'Europe/Berlin')::date = x.month
  ) c on true
  order by x.month desc;
$$;

revoke all on function public.delivered_months() from public, anon;
grant execute on function public.delivered_months() to authenticated;
