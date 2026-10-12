-- Verkäufer-Scoreboard: Grundschema
-- Rollen: Verkäufer tragen eigene Verkäufe ein, Admins verwalten Freigaben, Ziele und Provisionssätze.

create type public.user_role as enum ('seller', 'admin');
create type public.user_status as enum ('pending', 'active', 'inactive');

-- Profil je Login. Neue Konten starten als "pending" und erscheinen erst nach Freigabe.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'seller',
  status public.user_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- Provisionssätze sind versioniert: jede Änderung ist eine neue Zeile.
-- Ein Verkauf merkt sich die Version, mit der er gerechnet wurde.
create table public.commission_rates (
  id bigint generated always as identity primary key,
  valid_from timestamptz not null default now(),
  base_amount numeric(10, 2) not null check (base_amount >= 0),
  bank_pct numeric(5, 2) not null check (bank_pct >= 0),
  winter_wheels_pct numeric(5, 2) not null check (winter_wheels_pct >= 0),
  registration_pct numeric(5, 2) not null check (registration_pct >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.sales (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  sold_on date not null default current_date,
  vehicle text not null check (length(trim(vehicle)) > 0),
  bank_commission numeric(10, 2) not null default 0 check (bank_commission >= 0),
  winter_wheels_price numeric(10, 2) not null default 0 check (winter_wheels_price >= 0),
  registration_price numeric(10, 2) not null default 0 check (registration_price >= 0),
  commission numeric(10, 2) not null default 0,
  rate_id bigint references public.commission_rates (id),
  created_at timestamptz not null default now()
);
create index sales_seller_sold_on on public.sales (seller_id, sold_on);
create index sales_sold_on on public.sales (sold_on);

-- Monatsziel: Anzahl verkaufter Fahrzeuge je Verkäufer und Monat (month = 1. des Monats).
create table public.monthly_goals (
  seller_id uuid not null references public.profiles (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  target_vehicles integer not null check (target_vehicles >= 0),
  primary key (seller_id, month)
);

-- ---------- Hilfsfunktionen ----------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create function public.calc_commission(
  p_bank numeric, p_winter numeric, p_registration numeric, r public.commission_rates
) returns numeric
language sql immutable set search_path = public as $$
  select round(
    r.base_amount
    + p_bank * r.bank_pct / 100
    + p_winter * r.winter_wheels_pct / 100
    + p_registration * r.registration_pct / 100, 2);
$$;

-- Profil automatisch anlegen, wenn sich jemand registriert.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Verkäufer dürfen an ihrem Profil nur den Namen ändern. Ohne Login (SQL-Editor) ist alles erlaubt.
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and (new.role <> old.role or new.status <> old.status or new.id <> old.id) then
    raise exception 'Nur Admins dürfen Rolle oder Status ändern';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Provision beim Speichern berechnen. Neue Verkäufe nutzen die aktuell gültigen Sätze,
-- Korrekturen rechnen mit den Sätzen, die beim ursprünglichen Speichern galten.
create function public.compute_sale_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r commission_rates;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not is_admin() then
      new.seller_id := auth.uid();
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

create trigger sales_compute_commission
  before insert or update on public.sales
  for each row execute function public.compute_sale_commission();

-- Rangliste für einen Monat. Sichtbar für alle freigegebenen Nutzer, enthält aber nur
-- Name, Stückzahl, Provision und Ziel, keine einzelnen Verkäufe anderer.
create function public.leaderboard(p_month date default date_trunc('month', current_date)::date)
returns table (
  seller_id uuid,
  full_name text,
  vehicles integer,
  commission numeric,
  target_vehicles integer,
  rank integer
)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as start),
  totals as (
    select p.id, p.full_name,
      count(s.id)::integer as vehicles,
      coalesce(sum(s.commission), 0) as commission,
      g.target_vehicles
    from profiles p
    cross join m
    left join sales s on s.seller_id = p.id
      and s.sold_on >= m.start and s.sold_on < (m.start + interval '1 month')
    left join monthly_goals g on g.seller_id = p.id and g.month = m.start
    where p.status = 'active' and p.role = 'seller'
    group by p.id, p.full_name, g.target_vehicles
  )
  select id, full_name, vehicles, commission, target_vehicles,
    (rank() over (order by vehicles desc))::integer
  from totals
  where is_active_user()
  order by vehicles desc, commission desc, full_name;
$$;

-- Letzter Verkauf für die Büro-Anzeige (nur Name und Fahrzeug).
create function public.latest_sale()
returns table (full_name text, vehicle text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.full_name, s.vehicle, s.created_at
  from sales s join profiles p on p.id = s.seller_id
  where is_active_user()
  order by s.created_at desc limit 1;
$$;

-- ---------- Zugriffsregeln ----------

alter table public.profiles enable row level security;
alter table public.commission_rates enable row level security;
alter table public.sales enable row level security;
alter table public.monthly_goals enable row level security;

create policy "Eigenes Profil oder Admin lesen" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "Eigenes Profil oder Admin ändern" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

create policy "Freigegebene Nutzer lesen Sätze" on public.commission_rates
  for select using (public.is_active_user());
create policy "Admins legen Sätze an" on public.commission_rates
  for insert with check (public.is_admin());

create policy "Eigene Verkäufe oder Admin lesen" on public.sales
  for select using (seller_id = auth.uid() or public.is_admin());
create policy "Freigegebene Verkäufer tragen ein" on public.sales
  for insert with check (public.is_active_user() and (seller_id = auth.uid() or public.is_admin()));
create policy "Admins korrigieren Verkäufe" on public.sales
  for update using (public.is_admin());
create policy "Admins löschen Verkäufe" on public.sales
  for delete using (public.is_admin());

create policy "Eigenes Ziel oder Admin lesen" on public.monthly_goals
  for select using (seller_id = auth.uid() or public.is_admin());
create policy "Admins setzen Ziele" on public.monthly_goals
  for all using (public.is_admin()) with check (public.is_admin());

-- Live-Aktualisierung für Rangliste und Büro-Anzeige.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sales, public.monthly_goals;
  end if;
end $$;

-- Startwerte (Platzhalter, im Admin-Bereich änderbar).
insert into public.commission_rates (base_amount, bank_pct, winter_wheels_pct, registration_pct)
values (100, 20, 10, 10);
