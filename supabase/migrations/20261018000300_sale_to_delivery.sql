-- Standzeit 3 (Dennis 2026-10-18): Tage vom Verkauf (Asana-Feld „Datum Verkauf“) bis zur Auslieferung, für die im
-- Monat ausgelieferten Fahrzeuge (gleiche Menge wie delivered_summary). Fahrzeuge ohne Datum werden gezählt, nicht geschätzt.
alter table public.asana_deliveries add column if not exists sold_on date;

create or replace function public.asana_replace(p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int; t timestamptz := clock_timestamp();
begin
  insert into public.asana_deliveries (task_gid, name, section, stage, due_on, permalink_url, created_at, created_by, completed, amount, deal_type, purchase_price, bank_commission, sold_on, synced_at)
  select r->>'task_gid', coalesce(r->>'name', ''), coalesce(r->>'section', ''), r->>'stage',
         nullif(r->>'due_on', '')::date, r->>'permalink_url',
         nullif(r->>'created_at', '')::timestamptz, nullif(r->>'created_by', ''), coalesce((r->>'completed')::boolean, false),
         case when jsonb_typeof(r->'amount') = 'number' then (r->>'amount')::numeric end, nullif(r->>'deal_type', ''),
         case when jsonb_typeof(r->'purchase_price') = 'number' then (r->>'purchase_price')::numeric end,
         case when jsonb_typeof(r->'bank_commission') = 'number' then (r->>'bank_commission')::numeric end,
         nullif(r->>'sold_on', '')::date, t
  from jsonb_array_elements(p_rows) r
  on conflict (task_gid) do update set name = excluded.name, section = excluded.section, stage = excluded.stage,
    due_on = excluded.due_on, permalink_url = excluded.permalink_url, created_at = excluded.created_at,
    created_by = excluded.created_by, completed = excluded.completed, amount = excluded.amount,
    deal_type = excluded.deal_type, purchase_price = excluded.purchase_price, bank_commission = excluded.bank_commission,
    sold_on = excluded.sold_on,
    synced_at = excluded.synced_at;
  get diagnostics n = row_count;
  update public.asana_sync s set last_attempt_at = t, last_success_at = t, last_error = null, task_count = n where s.id;
  return n;
end;
$$;

-- Je Monat (aktuell und Vormonat): Ø und Median der Tage, wie viele Fahrzeuge ein Datum haben und wie viele nicht.
-- Ein Verkaufsdatum nach der Auslieferung ist ein Tippfehler und zählt als fehlend.
create or replace function public.sale_to_delivery()
returns table (month date, vehicles int, with_date int, avg_days numeric, median_days numeric)
language sql stable set search_path = '' as $$
  with m as (select date_trunc('month', now() at time zone 'Europe/Berlin')::date as cur)
  select x.month, coalesce(c.n, 0)::int, coalesce(c.k, 0)::int, round(c.avg_days, 1), c.median_days
  from m, lateral (values (m.cur), ((m.cur - interval '1 month')::date)) as x(month)
  left join lateral (
    select count(*) as n, count(v.days) as k, avg(v.days)::numeric as avg_days,
           (percentile_cont(0.5) within group (order by v.days))::numeric as median_days
    from public.asana_lead_times l
    join public.asana_current() d on d.task_gid = l.task_gid
    cross join lateral (select (l.delivered_at at time zone 'Europe/Berlin')::date - d.sold_on as raw) r
    cross join lateral (select case when r.raw >= 0 then r.raw end as days) v
    where l.delivered_at is not null and d.section not ilike '%storno%'
      and l.delivered_from ~* '(auslieferung|fertig|werkstatt|disposition)'
      and date_trunc('month', l.delivered_at at time zone 'Europe/Berlin')::date = x.month
  ) c on true
  order by x.month desc;
$$;

revoke all on function public.sale_to_delivery() from public, anon;
grant execute on function public.sale_to_delivery() to authenticated;
