-- Abzeichen (werden aus den Verkäufen berechnet) und Lob für Verkäufe (Daumen und kurzer Kommentar).

-- Abzeichen je Verkäufer für einen Monat:
--   durchstarter   erster Verkauf überhaupt in diesem Monat
--   hattrick       3 Verkäufe an einem Tag
--   winterkoenig   die meisten Winterräder im Monat
--   ziel           Monatsziel erreicht
--   serie          Monatsziel 3 Monate in Folge erreicht (dieser und die zwei davor)
--   kundenliebling Ø Kundenbewertung mindestens 4,5 bei mindestens 3 Bewertungen
create function public.seller_badges(p_month date default date_trunc('month', current_date)::date)
returns table (seller_id uuid, badge text)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as start),
  sellers as (select id from profiles where status = 'active' and role = 'seller'),
  ms as (
    select s.* from sales s, m
    where s.sold_on >= m.start and s.sold_on < m.start + interval '1 month'
      and s.seller_id in (select id from sellers)
  ),
  monthly as (
    select se.id as sid, mo.month,
      (select count(*) from sales s where s.seller_id = se.id
         and s.sold_on >= mo.month and s.sold_on < mo.month + interval '1 month') as vehicles,
      (select g.target_vehicles from monthly_goals g where g.seller_id = se.id and g.month = mo.month) as target
    from sellers se, m,
      lateral (select (m.start - make_interval(months => i))::date as month from generate_series(0, 2) i) mo
  ),
  reached as (select sid, month from monthly where target > 0 and vehicles >= target),
  winter as (select ms.seller_id as sid, count(*) as n from ms where winter_wheels_price > 0 group by ms.seller_id),
  badges as (
    select se.id, 'durchstarter' from sellers se, m
      where (select min(s.sold_on) from sales s where s.seller_id = se.id) >= m.start
        and exists (select 1 from ms where ms.seller_id = se.id)
    union all
    select distinct ms.seller_id, 'hattrick' from ms group by ms.seller_id, ms.sold_on having count(*) >= 3
    union all
    select w.sid, 'winterkoenig' from winter w where w.n = (select max(n) from winter)
    union all
    select r.sid, 'ziel' from reached r, m where r.month = m.start
    union all
    select r.sid, 'serie' from reached r group by r.sid having count(*) = 3
    union all
    select ms.seller_id, 'kundenliebling' from ms group by ms.seller_id
      having count(customer_rating) >= 3 and avg(customer_rating) >= 4.5
  )
  select * from badges where is_active_user();
$$;
revoke execute on function public.seller_badges(date) from public, anon;
grant execute on function public.seller_badges(date) to authenticated;

-- Lob: jeder freigegebene Nutzer kann einen fremden Verkauf einmal loben, optional mit Kommentar.
create table public.kudos (
  sale_id bigint not null references public.sales (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  comment text check (comment is null or length(trim(comment)) between 1 and 140),
  created_at timestamptz not null default now(),
  primary key (sale_id, user_id)
);
alter table public.kudos enable row level security;
create policy "Freigegebene Nutzer lesen Lob" on public.kudos
  for select using (public.is_active_user());
create policy "Fremde Verkäufe loben" on public.kudos
  for insert with check (
    user_id = auth.uid() and public.is_active_user()
    and not exists (select 1 from public.sales s where s.id = sale_id and s.seller_id = auth.uid())
  );
create policy "Eigenes Lob ändern" on public.kudos
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Eigenes Lob zurücknehmen, Admin räumt auf" on public.kudos
  for delete using (user_id = auth.uid() or public.is_admin());

-- Die neuesten Verkäufe aller aktiven Verkäufer mit ihrem Lob (Verkäufer sehen fremde Verkäufe sonst nicht).
create function public.sales_feed(p_limit integer default 20)
returns table (
  sale_id bigint, seller_id uuid, full_name text, vehicle text, created_at timestamptz,
  likes integer, liked boolean, comments jsonb
)
language sql stable security definer set search_path = public as $$
  select s.id, s.seller_id, p.full_name, s.vehicle, s.created_at,
    (select count(*)::integer from kudos k where k.sale_id = s.id),
    exists (select 1 from kudos k where k.sale_id = s.id and k.user_id = auth.uid()),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', kp.full_name, 'comment', k.comment, 'at', k.created_at) order by k.created_at)
      from kudos k join profiles kp on kp.id = k.user_id
      where k.sale_id = s.id and k.comment is not null
    ), '[]'::jsonb)
  from sales s join profiles p on p.id = s.seller_id
  where is_active_user() and p.status = 'active'
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.sales_feed(integer) from public, anon;
grant execute on function public.sales_feed(integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kudos;
  end if;
end $$;
