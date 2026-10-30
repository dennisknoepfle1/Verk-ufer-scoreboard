-- Arbeitsanweisungen: Der Admin stellt Anweisungen ein (Text und/oder Datei), jeder freigegebene
-- Verkäufer muss jede aktive Anweisung lesen und bestätigen, bevor er die App weiter nutzen kann.

create table public.work_instructions (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) between 1 and 160),
  body text not null default '',
  -- Datei im privaten Speicher-Bucket „arbeitsanweisungen“ (optional).
  file_path text,
  file_name text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Zurückgezogene Anweisungen müssen nicht mehr bestätigt werden, die Bestätigungen bleiben erhalten.
  archived_at timestamptz,
  check (length(trim(body)) > 0 or file_path is not null)
);

create table public.instruction_acks (
  instruction_id bigint not null references public.work_instructions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (instruction_id, user_id)
);

alter table public.work_instructions enable row level security;
alter table public.instruction_acks enable row level security;

create policy "Freigegebene Nutzer lesen Anweisungen" on public.work_instructions
  for select using (is_active_user());
create policy "Admins verwalten Anweisungen" on public.work_instructions
  for all using (is_admin()) with check (is_admin());

create policy "Eigene Bestätigungen oder Admin" on public.instruction_acks
  for select using (user_id = auth.uid() or is_admin());
-- Nur für sich selbst und nur für aktive Anweisungen bestätigen. Eine Bestätigung ist endgültig.
create policy "Selbst bestätigen" on public.instruction_acks
  for insert with check (
    user_id = auth.uid() and is_active_user()
    and exists (select 1 from work_instructions w where w.id = instruction_id and w.archived_at is null)
  );

grant select, insert, update, delete on public.work_instructions to authenticated;
grant select, insert on public.instruction_acks to authenticated;

-- Bestätigungszeit kommt immer vom Server.
create function public.stamp_instruction_ack() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.confirmed_at := now();
  return new;
end;
$$;
create trigger instruction_acks_stamp
  before insert on public.instruction_acks
  for each row execute function public.stamp_instruction_ack();
revoke execute on function public.stamp_instruction_ack() from public, anon, authenticated;

-- Admin-Übersicht: wer hat welche aktive Anweisung bestätigt (alle aktiven Verkäufer, auch ohne Bestätigung).
create function public.instruction_status()
returns table (instruction_id bigint, user_id uuid, full_name text, confirmed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, p.id, p.full_name, a.confirmed_at
  from work_instructions w
  cross join profiles p
  left join instruction_acks a on a.instruction_id = w.id and a.user_id = p.id
  where is_admin() and p.role = 'seller' and p.status = 'active'
  order by w.id, a.confirmed_at nulls first, p.full_name;
$$;
revoke execute on function public.instruction_status() from public, anon;
grant execute on function public.instruction_status() to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.work_instructions, public.instruction_acks;
  end if;
end $$;

-- Speicher für Dateien (nur auf Supabase; lokale Tests haben kein storage-Schema).
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('arbeitsanweisungen', 'arbeitsanweisungen', false, 26214400)
    on conflict (id) do nothing;
    execute $p$create policy "Anweisungen lesen" on storage.objects for select to authenticated
      using (bucket_id = 'arbeitsanweisungen' and public.is_active_user())$p$;
    execute $p$create policy "Anweisungen hochladen" on storage.objects for insert to authenticated
      with check (bucket_id = 'arbeitsanweisungen' and public.is_admin())$p$;
    execute $p$create policy "Anweisungen löschen" on storage.objects for delete to authenticated
      using (bucket_id = 'arbeitsanweisungen' and public.is_admin())$p$;
  end if;
end $$;
