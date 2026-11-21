-- Morgen-Push des Prozessboards (Dennis, 21.11.2026): jeden Morgen um 7 Uhr (Berlin) an die Admins, nur wenn etwas rot ist.
-- Die Edge Function process-digest rechnet wie die App und merkt sich hier, an welchem Tag sie zuletzt geschickt hat.
create table if not exists public.process_digest (
  id boolean primary key default true check (id),
  last_sent_on date
);
insert into public.process_digest (id) values (true) on conflict do nothing;
alter table public.process_digest enable row level security;

create or replace function public.process_digest_trigger() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://utivqklwuotsnhunassd.supabase.co/functions/v1/process-digest',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  null; -- darf nie etwas anderes blockieren
end;
$$;
revoke all on function public.process_digest_trigger() from public, anon, authenticated;

-- 5 und 6 Uhr UTC = 7 Uhr Berlin im Sommer bzw. Winter; die Funktion schickt nur um 7 Uhr Berliner Zeit.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('process-digest', '1 5,6 * * *', 'select public.process_digest_trigger()');
  end if;
end;
$$;
