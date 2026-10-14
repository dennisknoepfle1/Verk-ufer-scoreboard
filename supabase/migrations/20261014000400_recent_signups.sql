-- Hilfsfunktion (live angelegt, derzeit ungenutzt): Wie viele Konten wurden in der letzten Stunde angelegt? Nur der Service-Schlüssel darf fragen.
create or replace function public.recent_signups() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from auth.users where created_at > now() - interval '1 hour';
$$;
revoke all on function public.recent_signups() from public, anon, authenticated;
grant execute on function public.recent_signups() to service_role;
