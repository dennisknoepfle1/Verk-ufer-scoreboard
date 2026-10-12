-- Für die automatische Überwachung: beantwortet ohne Login eine echte Datenbank-Abfrage, gibt aber nichts preis.
create function public.health() returns boolean
language sql stable set search_path = '' as $$ select true $$;
revoke all on function public.health() from public;
grant execute on function public.health() to anon, authenticated;
