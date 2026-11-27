-- Neues Provisionsmodell ab November 2026 (Dennis, 27.11.2026):
-- 600 € brutto je verkauftem Fahrzeug, keine Anteile mehr an Bankprovision, Winterrädern und Zulassung.
-- Einzige Zusatzprovision: 10 % vom Verkaufspreis des Zertifikats „Zertifizierter Gebrauchtwagen“
-- (Kleinwagen 399 €, Mittelklasse 549 €, Oberklasse 799 €).
-- Winterräder und Zulassung werden weiter erfasst (Quoten, Umsätze), bringen aber kein Einzelgeld mehr.
-- Monate vor November behalten das alte Modell.

alter table public.commission_rates
  add column certified_pct numeric(5, 2) not null default 0 check (certified_pct >= 0);

alter table public.sales
  add column certified_class text check (certified_class in ('klein', 'mittel', 'ober')),
  add column certified_price numeric(10, 2) not null default 0 check (certified_price >= 0),
  add constraint sales_certified_consistent check ((certified_class is null) = (certified_price = 0));

-- Provision eines Verkaufs: alte Formel + Anteil am zertifizierten Gebrauchtwagen.
create or replace function public.sale_commission(
  p_bank numeric, p_winter numeric, p_registration numeric, p_certified numeric, r public.commission_rates
) returns numeric
language sql immutable set search_path = public as $$
  select round(
    r.base_amount
    + p_bank * r.bank_pct / 100
    + p_winter * r.winter_wheels_pct / 100
    + p_registration * r.registration_pct / 100
    + p_certified * r.certified_pct / 100, 2);
$$;

-- Neue Verkäufe nutzen die Sätze, die am Verkaufstag galten (so rechnet ein nachgetragener
-- Oktober-Verkauf noch mit dem alten Modell). Korrekturen behalten ihre Sätze.
create or replace function public.compute_sale_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r commission_rates;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not is_admin() then
      new.seller_id := auth.uid();
      new.customer_rating := null;
    end if;
    select * into r from commission_rates
      where valid_from <= least(now(), ((new.sold_on + 1)::timestamp at time zone 'Europe/Berlin'))
      order by valid_from desc, id desc limit 1;
    if r.id is null then
      select * into r from commission_rates where valid_from <= now() order by valid_from asc, id asc limit 1;
    end if;
    if r.id is null then
      raise exception 'Es sind noch keine Provisionssätze hinterlegt';
    end if;
  else
    if auth.uid() is not null and not is_admin() then
      raise exception 'Nur Admins dürfen Verkäufe ändern';
    end if;
    select * into r from commission_rates where id = coalesce(new.rate_id, old.rate_id);
  end if;
  new.rate_id := r.id;
  new.commission := sale_commission(new.bank_commission, new.winter_wheels_price, new.registration_price, new.certified_price, r);
  return new;
end;
$$;
revoke execute on function public.compute_sale_commission() from public, anon, authenticated;

-- Neues Modell gilt ab 1. November 2026, 0 Uhr deutscher Zeit.
insert into public.commission_rates (valid_from, base_amount, bank_pct, winter_wheels_pct, registration_pct, certified_pct)
  values (timestamp '2026-11-01 00:00' at time zone 'Europe/Berlin', 600, 0, 0, 0, 10);

-- Alle November-Verkäufe rückwirkend mit dem neuen Modell rechnen (Trigger rechnet neu).
update public.sales s
   set rate_id = (select id from public.commission_rates
                   where valid_from = timestamp '2026-11-01 00:00' at time zone 'Europe/Berlin'
                   order by id desc limit 1)
 where s.sold_on >= date '2026-11-01';
