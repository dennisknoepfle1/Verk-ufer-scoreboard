-- Push-Benachrichtigungen bei neuem Verkauf (Web-Push für die Home-Bildschirm-App).
-- Jedes Gerät, auf dem jemand Benachrichtigungen einschaltet, ist ein Abo.
-- Neuer Verkauf -> Trigger ruft die Edge Function notify-sale -> sie schickt an alle aktiven Nutzer außer dem Verkäufer.
-- Der private VAPID-Schlüssel liegt im Vault (Name vapid_private_key) und wird nicht im Repo gespeichert.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_own_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert with check (user_id = auth.uid() and public.is_active_user());
create policy push_own_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- Merkt sich, dass für einen Verkauf schon benachrichtigt wurde (nie doppelt).
alter table public.sales add column push_sent_at timestamptz;

-- Nur für die Edge Function (service_role): privater Schlüssel aus dem Vault.
create function public.push_vapid_private_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' limit 1;
$$;
revoke all on function public.push_vapid_private_key() from public, anon, authenticated;
grant execute on function public.push_vapid_private_key() to service_role;

create function public.notify_new_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://utivqklwuotsnhunassd.supabase.co/functions/v1/notify-sale',
    body := jsonb_build_object('sale_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new; -- Ein Push-Fehler darf nie das Speichern eines Verkaufs verhindern.
end;
$$;
revoke all on function public.notify_new_sale() from public, anon, authenticated;

create trigger sales_notify_push after insert on public.sales
  for each row execute function public.notify_new_sale();
