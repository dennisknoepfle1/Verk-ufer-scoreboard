-- Teamziel fürs ganze Haus und Kundenzufriedenheit (1 bis 5 Sterne je Verkauf, vom Admin eingetragen).

alter table public.sales
  add column customer_rating smallint check (customer_rating between 1 and 5);

create table public.team_goals (
  month date primary key check (extract(day from month) = 1),
  target_vehicles integer not null check (target_vehicles >= 0)
);
alter table public.team_goals enable row level security;
create policy "Freigegebene Nutzer lesen Teamziel" on public.team_goals
  for select using (public.is_active_user());
create policy "Admins setzen Teamziel" on public.team_goals
  for all using (public.is_admin()) with check (public.is_admin());

-- Verkäufer bewerten sich nicht selbst: beim Eintragen ohne Admin-Rechte wird die Bewertung verworfen.
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
    select * into r from commission_rates where valid_from <= now() order by valid_from desc, id desc limit 1;
    if r.id is null then
      raise exception 'Es sind noch keine Provisionssätze hinterlegt';
    end if;
  else
    if auth.uid() is not null and not is_admin() then
      raise exception 'Nur Admins dürfen Verkäufe ändern';
    end if;
    select * into r from commission_rates where id = old.rate_id;
  end if;
  new.rate_id := r.id;
  new.commission := calc_commission(new.bank_commission, new.winter_wheels_price, new.registration_price, r);
  return new;
end;
$$;
revoke execute on function public.compute_sale_commission() from public, anon, authenticated;

-- Ø Bewertung je Verkäufer im Monat, als eigene Kennzahl neben der Rangliste
-- (die Reihenfolge der Rangliste bleibt nach verkauften Fahrzeugen).
create function public.seller_ratings(p_month date default date_trunc('month', current_date)::date)
returns table (seller_id uuid, avg_rating numeric, rating_count integer)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as start)
  select s.seller_id, round(avg(s.customer_rating), 1), count(s.customer_rating)::integer
  from sales s, m
  where s.customer_rating is not null
    and s.sold_on >= m.start and s.sold_on < (m.start + interval '1 month')
    and is_active_user()
  group by s.seller_id;
$$;
revoke execute on function public.seller_ratings(date) from public, anon;
grant execute on function public.seller_ratings(date) to authenticated;

-- Fortschritt Teamziel: Ziel und verkaufte Fahrzeuge aller aktiven Verkäufer im Monat.
create function public.team_progress(p_month date default date_trunc('month', current_date)::date)
returns table (target_vehicles integer, vehicles integer)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as start)
  select
    (select t.target_vehicles from team_goals t, m where t.month = m.start),
    (select count(*)::integer from sales s join profiles p on p.id = s.seller_id, m
      where p.status = 'active' and p.role = 'seller'
        and s.sold_on >= m.start and s.sold_on < (m.start + interval '1 month'))
  where is_active_user();
$$;
revoke execute on function public.team_progress(date) from public, anon;
grant execute on function public.team_progress(date) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.team_goals;
  end if;
end $$;
