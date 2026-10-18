-- Wie finance_summary(), zusätzlich Ertrag pro Fahrzeug (Dennis 2026-10-18): nur Fahrzeuge mit Verkaufspreis UND
-- Auszahlung VB / EK zählen; Ertrag = Verkaufspreis + Bankprovision (fehlend = 0) − Einkauf, vor den Fixkosten.
-- Neue Funktion statt geänderter Rückgabe, weil DROP über die Supabase-Verbindung hängt.
create or replace function public.finance_months()
returns table (month date, vehicles int, sale_total numeric, bank_total numeric, purchase_total numeric,
               missing_sale int, missing_purchase int, missing_bank int, complete_vehicles int, complete_margin numeric)
language sql stable set search_path = '' as $$
  with m as (select date_trunc('month', now() at time zone 'Europe/Berlin')::date as cur)
  select x.month, coalesce(c.n, 0)::int, coalesce(c.sale, 0), coalesce(c.bank, 0), coalesce(c.purchase, 0),
         coalesce(c.ms, 0)::int, coalesce(c.mp, 0)::int, coalesce(c.mb, 0)::int, coalesce(c.cn, 0)::int, coalesce(c.cm, 0)
  from m, lateral (values (m.cur), ((m.cur - interval '1 month')::date)) as x(month)
  left join lateral (
    select count(*) as n, sum(d.amount) as sale, sum(d.bank_commission) as bank, sum(d.purchase_price) as purchase,
           count(*) filter (where d.amount is null) as ms, count(*) filter (where d.purchase_price is null) as mp,
           count(*) filter (where d.bank_commission is null) as mb,
           count(*) filter (where d.amount is not null and d.purchase_price is not null) as cn,
           sum(d.amount + coalesce(d.bank_commission, 0) - d.purchase_price) as cm
    from public.asana_lead_times l
    join public.asana_current() d on d.task_gid = l.task_gid
    where l.delivered_at is not null and d.section not ilike '%storno%'
      and l.delivered_from ~* '(auslieferung|fertig|werkstatt|disposition)'
      and date_trunc('month', l.delivered_at at time zone 'Europe/Berlin')::date = x.month
  ) c on true
  order by x.month desc;
$$;

revoke all on function public.finance_months() from public, anon;
grant execute on function public.finance_months() to authenticated;
