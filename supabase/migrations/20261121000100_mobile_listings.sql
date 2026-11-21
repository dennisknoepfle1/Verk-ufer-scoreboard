-- Prozessboard · mobile.de-Abgleich: Inserate, die auf mobile.de online stehen (nur gelesen, nie geändert).
-- Die Edge Function mobile-sync holt alle 15 Minuten den aktuellen Stand. Aktuell ist, was zum letzten
-- erfolgreichen Abruf gehört (mobile_current()). Der Abgleich mit Asana passiert in der App (src/lib/mobile-match.ts).
-- Zugangsdaten liegen als Edge-Function-Secrets MOBILE_DE_USER / MOBILE_DE_PASSWORD, nie in der Datenbank.

-- Kundennummer(n) bei mobile.de (Admin trägt sie im Prozessboard ein; mehrere mit Komma).
create table public.mobile_settings (
  id boolean primary key default true check (id),
  customer_numbers text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.mobile_settings default values;

-- Letzter Abruf: wann, ob erfolgreich, Fehlertext.
create table public.mobile_sync (
  id boolean primary key default true check (id),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  listing_count int not null default 0
);
insert into public.mobile_sync default values;

create table public.mobile_listings (
  ad_id text primary key,
  vin text,
  internal_number text,
  title text not null default '',
  price numeric(12, 2),
  url text,
  first_seen_at timestamptz not null default now(), -- seit wann online (laut unseren Abrufen)
  synced_at timestamptz not null default now()
);

alter table public.mobile_settings enable row level security;
alter table public.mobile_sync enable row level security;
alter table public.mobile_listings enable row level security;

create policy "Admins lesen mobile.de-Einstellung" on public.mobile_settings for select using (public.is_admin());
create policy "Admins ändern mobile.de-Einstellung" on public.mobile_settings for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins lesen mobile.de-Abrufstatus" on public.mobile_sync for select using (public.is_admin());
create policy "Admins lesen mobile.de-Inserate" on public.mobile_listings for select using (public.is_admin());

-- Nur für die Edge Function: kompletten Stand in einem Schritt speichern.
create function public.mobile_replace(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; t timestamptz := clock_timestamp();
begin
  insert into public.mobile_listings (ad_id, vin, internal_number, title, price, url, first_seen_at, synced_at)
  select r->>'ad_id', nullif(r->>'vin', ''), nullif(r->>'internal_number', ''), coalesce(r->>'title', ''),
         nullif(r->>'price', '')::numeric, r->>'url', t, t
  from jsonb_array_elements(p_rows) r
  where coalesce(r->>'ad_id', '') <> ''
  on conflict (ad_id) do update set vin = coalesce(excluded.vin, public.mobile_listings.vin),
    internal_number = excluded.internal_number, title = excluded.title, price = excluded.price, url = excluded.url,
    synced_at = excluded.synced_at,
    -- War das Inserat zwischendurch weg (mehr als einen Tag), zählt „online seit“ neu.
    first_seen_at = case when public.mobile_listings.synced_at < t - interval '1 day' then t else public.mobile_listings.first_seen_at end;
  get diagnostics n = row_count;
  -- Alte Inserate nach 60 Tagen wegräumen.
  delete from public.mobile_listings where synced_at < t - interval '60 days';
  update public.mobile_sync s set last_attempt_at = t, last_success_at = t, last_error = null, listing_count = n where s.id;
  return n;
end;
$$;
revoke all on function public.mobile_replace(jsonb) from public, anon, authenticated;
grant execute on function public.mobile_replace(jsonb) to service_role;

-- Aktueller Stand = Inserate aus dem letzten erfolgreichen Abruf.
create function public.mobile_current() returns setof public.mobile_listings
language sql stable set search_path = '' as $$
  select l.* from public.mobile_listings l
  where l.synced_at = (select last_success_at from public.mobile_sync)
  order by l.first_seen_at;
$$;
revoke all on function public.mobile_current() from public, anon;
grant execute on function public.mobile_current() to authenticated;

-- Abruf anstoßen (Zeitplan, geänderte Kundennummer). Ein mobile.de-Problem darf nie etwas anderes blockieren.
create function public.mobile_trigger_sync() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://utivqklwuotsnhunassd.supabase.co/functions/v1/mobile-sync',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  null;
end;
$$;
revoke all on function public.mobile_trigger_sync() from public, anon, authenticated;

create function public.mobile_settings_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  perform public.mobile_trigger_sync();
  return new;
end;
$$;
revoke all on function public.mobile_settings_changed() from public, anon, authenticated;
create trigger mobile_settings_sync before update on public.mobile_settings
  for each row execute function public.mobile_settings_changed();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mobile_sync;
  end if;
end $$;

-- Alle 15 Minuten, versetzt zum Asana-Abruf (nur wo pg_cron verfügbar ist, also nicht in den lokalen Tests).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('mobile-sync', '7,22,37,52 * * * *', 'select public.mobile_trigger_sync()');
  end if;
end $$;
