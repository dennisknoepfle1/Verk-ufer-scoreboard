-- Minimaler Ersatz für Supabase-Auth, nur für lokale Tests.
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated;
grant usage on schema public, auth to authenticated;
