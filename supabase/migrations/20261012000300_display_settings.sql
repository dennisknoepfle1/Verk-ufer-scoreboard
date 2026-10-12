-- Einstellungen der Büro-Anzeige (eine Zeile). Der Admin wählt, was der Bildschirm zeigt.
create table public.display_settings (
  id boolean primary key default true check (id),
  view text not null default 'wechsel' check (view in ('wechsel', 'liste', 'rennen')),
  updated_at timestamptz not null default now()
);
insert into public.display_settings (id) values (true);

alter table public.display_settings enable row level security;
create policy "Freigegebene Nutzer lesen Anzeige-Einstellung" on public.display_settings
  for select using (public.is_active_user());
create policy "Admins ändern Anzeige-Einstellung" on public.display_settings
  for update using (public.is_admin()) with check (public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.display_settings;
  end if;
end $$;
