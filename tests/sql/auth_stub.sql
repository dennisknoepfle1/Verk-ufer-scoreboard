-- Minimaler Ersatz für Supabase-Auth, nur für lokale Tests.
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated;
grant usage on schema public, auth to authenticated;
create role anon;
create role service_role;
-- Ersatz für pg_net und Vault: Aufrufe werden nur mitgeschrieben.
create schema net;
create table net.calls (url text, body jsonb);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$
  insert into net.calls values (url, body); select 1::bigint $$;
create schema vault;
create view vault.decrypted_secrets as select 'vapid_private_key'::text as name, 'test-key'::text as decrypted_secret;
grant usage on schema public to service_role;
