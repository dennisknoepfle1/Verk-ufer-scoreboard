-- Wer zählt als Einkäufer? Der Admin pflegt die Liste (Admin > Einkäufer).
-- Gezählt werden weiterhin alle Fahrzeug-Aufgaben, die in diesem Monat angelegt wurden, egal in welcher Spalte.
create table public.asana_buyers (
  name text primary key check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
alter table public.asana_buyers enable row level security;
create policy "Freigegebene Nutzer lesen Einkäufer" on public.asana_buyers for select using (public.is_active_user());
create policy "Admins legen Einkäufer an" on public.asana_buyers for insert with check (public.is_admin());
create policy "Admins entfernen Einkäufer" on public.asana_buyers for delete using (public.is_admin());

-- Startliste laut Dennis (2026-10-12).
insert into public.asana_buyers (name) values
  ('Cem Turan'), ('Sebastian Wechler'), ('Mario Chirizzi'), ('Johannes Bonzol'), ('Steven Thum'), ('Max Finkbeiner')
on conflict do nothing;

-- Alle Ersteller mit ihren in diesem Monat angelegten Aufgaben (ohne Stornos), für die Auswahl im Admin.
create function public.asana_creators() returns table (name text, vehicles int)
language sql stable set search_path = '' as $$
  select case when d.created_by like '%@%' then initcap(replace(split_part(d.created_by, '@', 1), '.', ' ')) else d.created_by end,
         count(*)::int
  from public.asana_current() d
  where d.created_by is not null
    and d.section not ilike '%storno%'
    and (d.created_at at time zone 'Europe/Berlin') >= date_trunc('month', now() at time zone 'Europe/Berlin')
  group by 1;
$$;
revoke all on function public.asana_creators() from public, anon;
grant execute on function public.asana_creators() to authenticated;

-- Rangliste: nur Einkäufer aus der Liste, auch mit 0. Ist die Liste leer, zählen alle Ersteller.
create or replace function public.buyer_leaderboard() returns table (buyer text, vehicles int, rank int)
language sql stable set search_path = '' as $$
  with c as (select * from public.asana_creators()),
  rows as (
    select b.name as buyer, coalesce(c.vehicles, 0) as vehicles
    from public.asana_buyers b left join c on lower(trim(c.name)) = lower(trim(b.name))
    union all
    select c.name, c.vehicles from c where not exists (select 1 from public.asana_buyers)
  )
  select buyer, vehicles, (rank() over (order by vehicles desc))::int from rows order by vehicles desc, buyer;
$$;
