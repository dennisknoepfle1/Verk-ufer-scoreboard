-- Arbeitsanweisungen nicht umgehbar: Solange ein Verkäufer eine aktive Anweisung nicht bestätigt hat,
-- nimmt die Datenbank von ihm keine Verkäufe und kein Lob an (auch nicht über Offline-Warteschlange oder direkte Aufrufe).
-- Neue Anweisung -> Push-Nachricht an alle aktiven Verkäufer (über die Edge Function notify-sale).

create function public.has_open_instructions(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    join work_instructions w on w.archived_at is null
    where p.id = p_user and p.role = 'seller'
      and not exists (select 1 from instruction_acks a where a.instruction_id = w.id and a.user_id = p.id)
  );
$$;
revoke execute on function public.has_open_instructions(uuid) from public, anon;
grant execute on function public.has_open_instructions(uuid) to authenticated;

create function public.require_instructions_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and has_open_instructions(auth.uid()) then
    raise exception 'Arbeitsanweisung offen: bitte zuerst lesen und bestätigen' using errcode = 'P0A01';
  end if;
  return new;
end;
$$;
revoke execute on function public.require_instructions_confirmed() from public, anon, authenticated;

create trigger sales_require_instructions before insert on public.sales
  for each row execute function public.require_instructions_confirmed();
create trigger kudos_require_instructions before insert on public.kudos
  for each row execute function public.require_instructions_confirmed();

-- Admin-Übersicht zusätzlich: hat der Verkäufer Benachrichtigungen auf mindestens einem Gerät an?
drop function public.instruction_status();
create function public.instruction_status()
returns table (instruction_id bigint, user_id uuid, full_name text, confirmed_at timestamptz, has_push boolean)
language sql stable security definer set search_path = public as $$
  select w.id, p.id, p.full_name, a.confirmed_at,
    exists (select 1 from push_subscriptions s where s.user_id = p.id)
  from work_instructions w
  cross join profiles p
  left join instruction_acks a on a.instruction_id = w.id and a.user_id = p.id
  where is_admin() and p.role = 'seller' and p.status = 'active'
  order by w.id, a.confirmed_at nulls first, p.full_name;
$$;
revoke execute on function public.instruction_status() from public, anon;
grant execute on function public.instruction_status() to authenticated;

-- Push genau einmal je Anweisung.
alter table public.work_instructions add column push_sent_at timestamptz;

create function public.notify_new_instruction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://utivqklwuotsnhunassd.supabase.co/functions/v1/notify-sale',
    body := jsonb_build_object('instruction_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new; -- Ein Push-Fehler darf nie das Veröffentlichen verhindern.
end;
$$;
revoke all on function public.notify_new_instruction() from public, anon, authenticated;

create trigger work_instructions_notify_push after insert on public.work_instructions
  for each row execute function public.notify_new_instruction();
