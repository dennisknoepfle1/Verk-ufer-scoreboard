-- Umsatz, Wareneinsatz, Gewinn (Dennis 2026-10-18): neue Asana-Felder „Auszahlung VB / EK“ und „Bankprovision gesamt“.
-- Gerechnet wird über die im Monat ausgelieferten Fahrzeuge (gleiche Menge wie delivered_summary).
alter table public.asana_deliveries add column if not exists purchase_price numeric;
alter table public.asana_deliveries add column if not exists bank_commission numeric;

create or replace function public.asana_replace(p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int; t timestamptz := clock_timestamp();
begin
  insert into public.asana_deliveries (task_gid, name, section, stage, due_on, permalink_url, created_at, created_by, completed, amount, deal_type, purchase_price, bank_commission, synced_at)
  select r->>'task_gid', coalesce(r->>'name', ''), coalesce(r->>'section', ''), r->>'stage',
         nullif(r->>'due_on', '')::date, r->>'permalink_url',
         nullif(r->>'created_at', '')::timestamptz, nullif(r->>'created_by', ''), coalesce((r->>'completed')::boolean, false),
         case when jsonb_typeof(r->'amount') = 'number' then (r->>'amount')::numeric end, nullif(r->>'deal_type', ''),
         case when jsonb_typeof(r->'purchase_price') = 'number' then (r->>'purchase_price')::numeric end,
         case when jsonb_typeof(r->'bank_commission') = 'number' then (r->>'bank_commission')::numeric end, t
  from jsonb_array_elements(p_rows) r
  on conflict (task_gid) do update set name = excluded.name, section = excluded.section, stage = excluded.stage,
    due_on = excluded.due_on, permalink_url = excluded.permalink_url, created_at = excluded.created_at,
    created_by = excluded.created_by, completed = excluded.completed, amount = excluded.amount,
    deal_type = excluded.deal_type, purchase_price = excluded.purchase_price, bank_commission = excluded.bank_commission,
    synced_at = excluded.synced_at;
  get diagnostics n = row_count;
  update public.asana_sync s set last_attempt_at = t, last_success_at = t, last_error = null, task_count = n where s.id;
  return n;
end;
$$;

-- Je Monat (aktuell und Vormonat): Summen der ausgelieferten Fahrzeuge und wie viele davon ein Feld nicht gepflegt haben.
-- Umsatz = Verkaufspreis + Bankprovision, Wareneinsatz = Auszahlung VB / EK; Gewinn rechnet die App (minus 500.000 € Kosten).
create or replace function public.finance_summary()
returns table (month date, vehicles int, sale_total numeric, bank_total numeric, purchase_total numeric,
               missing_sale int, missing_purchase int, missing_bank int)
language sql stable set search_path = '' as $$
  with m as (select date_trunc('month', now() at time zone 'Europe/Berlin')::date as cur)
  select x.month, coalesce(c.n, 0)::int, coalesce(c.sale, 0), coalesce(c.bank, 0), coalesce(c.purchase, 0),
         coalesce(c.ms, 0)::int, coalesce(c.mp, 0)::int, coalesce(c.mb, 0)::int
  from m, lateral (values (m.cur), ((m.cur - interval '1 month')::date)) as x(month)
  left join lateral (
    select count(*) as n, sum(d.amount) as sale, sum(d.bank_commission) as bank, sum(d.purchase_price) as purchase,
           count(*) filter (where d.amount is null) as ms, count(*) filter (where d.purchase_price is null) as mp,
           count(*) filter (where d.bank_commission is null) as mb
    from public.asana_lead_times l
    join public.asana_current() d on d.task_gid = l.task_gid
    where l.delivered_at is not null and d.section not ilike '%storno%'
      and l.delivered_from ~* '(auslieferung|fertig|werkstatt|disposition)'
      and date_trunc('month', l.delivered_at at time zone 'Europe/Berlin')::date = x.month
  ) c on true
  order by x.month desc;
$$;

revoke all on function public.finance_summary() from public, anon;
grant execute on function public.finance_summary() to authenticated;
