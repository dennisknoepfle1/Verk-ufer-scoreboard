-- Prozessboard: weitere Prüfungen (Dennis, 21.11.2026: „alle“).
-- 1) Seit wann steht ein Fahrzeug in seiner aktuellen Asana-Spalte? (für „hängt in der Administration“, „Werkstatt
--    dauert zu lange“). Kommt aus dem Verlauf der Aufgabe; section_checked = false lässt asana-sync den Verlauf
--    offener Fahrzeuge einmalig neu lesen.
alter table public.asana_lead_times add column if not exists section_since timestamptz;
alter table public.asana_lead_times add column if not exists section_checked boolean not null default false;

-- 2) Anzahl Bilder je mobile.de-Inserat (für „online ohne Bilder“). null = mobile.de hat keine Angabe geliefert.
alter table public.mobile_listings add column if not exists image_count int;

create or replace function public.mobile_replace(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; t timestamptz := clock_timestamp();
begin
  insert into public.mobile_listings (ad_id, vin, internal_number, title, price, url, image_count, first_seen_at, synced_at)
  select r->>'ad_id', nullif(r->>'vin', ''), nullif(r->>'internal_number', ''), coalesce(r->>'title', ''),
         nullif(r->>'price', '')::numeric, r->>'url', nullif(r->>'image_count', '')::int, t, t
  from jsonb_array_elements(p_rows) r
  where coalesce(r->>'ad_id', '') <> ''
  on conflict (ad_id) do update set vin = coalesce(excluded.vin, public.mobile_listings.vin),
    internal_number = excluded.internal_number, title = excluded.title, price = excluded.price, url = excluded.url,
    image_count = coalesce(excluded.image_count, public.mobile_listings.image_count),
    synced_at = excluded.synced_at,
    first_seen_at = case when public.mobile_listings.synced_at < t - interval '1 day' then t else public.mobile_listings.first_seen_at end;
  get diagnostics n = row_count;
  delete from public.mobile_listings where synced_at < t - interval '60 days';
  update public.mobile_sync s set last_attempt_at = t, last_success_at = t, last_error = null, listing_count = n where s.id;
  return n;
end;
$$;
revoke all on function public.mobile_replace(jsonb) from public, anon, authenticated;
grant execute on function public.mobile_replace(jsonb) to service_role;
