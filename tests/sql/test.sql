-- Läuft nach auth_stub.sql und der Migration gegen eine leere lokale Datenbank.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x', '{"full_name":"Dennis"}'),
  ('00000000-0000-0000-0000-000000000001', 'a@x', '{"full_name":"Jonas"}'),
  ('00000000-0000-0000-0000-000000000002', 'b@x', '{"full_name":"Laura"}'),
  ('00000000-0000-0000-0000-000000000003', 'c@x', '{"full_name":"Neu"}');

-- Profile wurden angelegt, alle pending
do $$ begin
  assert (select count(*) from profiles where status = 'pending') = 4, 'Profile fehlen';
end $$;

-- SQL-Editor (kein Login) macht Dennis zum Admin und gibt zwei Verkäufer frei
update profiles set role = 'admin', status = 'active' where id = '00000000-0000-0000-0000-00000000000a';
update profiles set status = 'active' where full_name in ('Jonas', 'Laura');

set role authenticated;

-- Jonas: zwei Verkäufe, Provision 100 + 20% von 500 + 10% von 1000 + 10% von 200 = 320
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
insert into sales (vehicle, bank_commission, winter_wheels_price, registration_price) values ('Golf', 500, 1000, 200);
insert into sales (vehicle, seller_id) values ('Polo', '00000000-0000-0000-0000-000000000002'); -- seller_id wird überschrieben
do $$ begin
  assert (select commission from sales where vehicle = 'Golf') = 320, 'Provision falsch';
  assert (select seller_id from sales where vehicle = 'Polo') = '00000000-0000-0000-0000-000000000001', 'Fremder Verkäufer';
  assert (select count(*) from leaderboard()) = 2, 'Rangliste sollte 2 aktive Verkäufer zeigen';
  assert (select rank from leaderboard() where full_name = 'Jonas') = 1, 'Jonas sollte Platz 1 sein';
end $$;

-- Jonas darf weder Rolle ändern noch Verkäufe korrigieren
do $$ begin
  begin
    update profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000001';
    assert false, 'Rollenwechsel hätte scheitern müssen';
  exception when raise_exception then null; end;
  begin
    update sales set bank_commission = 9999 where vehicle = 'Golf';
    -- RLS filtert die Zeile weg (0 Zeilen) oder Trigger wirft: beides ok
  exception when raise_exception then null; end;
  assert (select bank_commission from sales where vehicle = 'Golf') = 500, 'Verkauf wurde verändert';
end $$;

-- Laura sieht Jonas' Verkäufe nicht einzeln, aber in der Rangliste
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false) is not null as login \gset
do $$ begin
  assert (select count(*) from sales) = 0, 'Laura sieht fremde Verkäufe';
  assert (select vehicles from leaderboard() where full_name = 'Jonas') = 2, 'Rangliste falsch';
end $$;

-- Nicht freigegebenes Konto: darf nichts eintragen, sieht keine Rangliste
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false) is not null as login \gset
do $$ begin
  begin
    insert into sales (vehicle) values ('Tiguan');
    assert false, 'Pending-Nutzer hätte nicht eintragen dürfen';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from leaderboard()) = 0, 'Pending-Nutzer sieht Rangliste';
end $$;

-- Admin: neue Sätze, Ziel setzen, alter Verkauf behält alte Sätze bei Korrektur
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
insert into commission_rates (base_amount, bank_pct, winter_wheels_pct, registration_pct)
  values (200, 50, 0, 0);
insert into monthly_goals (seller_id, month, target_vehicles)
  values ('00000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date, 8);
update sales set registration_price = 0 where vehicle = 'Golf';
insert into sales (vehicle, bank_commission, seller_id) values ('Tiguan', 100, '00000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select commission from sales where vehicle = 'Golf') = 300, 'Korrektur sollte alte Sätze nutzen';
  assert (select commission from sales where vehicle = 'Tiguan') = 250, 'Neuer Verkauf sollte neue Sätze nutzen';
  assert (select target_vehicles from leaderboard() where full_name = 'Jonas') = 8, 'Ziel fehlt';
  assert (select seller_id from sales where vehicle = 'Tiguan') = '00000000-0000-0000-0000-000000000002', 'Admin darf für andere eintragen';
end $$;

select 'ALLE SQL-TESTS OK' as result;
