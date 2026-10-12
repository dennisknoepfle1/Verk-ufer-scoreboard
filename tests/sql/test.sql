-- Läuft nach auth_stub.sql und der Migration gegen eine leere lokale Datenbank.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;

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

-- Kundenzufriedenheit: Verkäufer können sich nicht selbst bewerten, Admin schon
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
insert into sales (vehicle, customer_rating) values ('Selbstbewertung', 5);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
do $$ begin
  assert (select customer_rating from sales where vehicle = 'Selbstbewertung') is null, 'Selbstbewertung wurde gespeichert';
end $$;
update sales set customer_rating = 5 where vehicle = 'Golf';
update sales set customer_rating = 4 where vehicle = 'Polo';
insert into team_goals (month, target_vehicles) values (date_trunc('month', current_date)::date, 20);
do $$ begin
  assert (select avg_rating from seller_ratings() where seller_id = '00000000-0000-0000-0000-000000000001') = 4.5, 'Ø Bewertung falsch';
  assert (select rating_count from seller_ratings() where seller_id = '00000000-0000-0000-0000-000000000001') = 2, 'Anzahl Bewertungen falsch';
  assert (select commission from sales where vehicle = 'Golf') = 300, 'Bewertung hat Provision verändert';
  assert (select target_vehicles from team_progress()) = 20, 'Teamziel fehlt';
  assert (select vehicles from team_progress()) = 4, 'Team-Fahrzeuge falsch'; -- Golf, Polo, Selbstbewertung, Tiguan
end $$;

-- Verkäufer dürfen das Teamziel nicht ändern und Bewertungen nicht setzen
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false) is not null as login \gset
do $$ begin
  begin
    insert into team_goals (month, target_vehicles) values ('2030-01-01', 1);
    assert false, 'Verkäufer hat Teamziel gesetzt';
  exception when insufficient_privilege then null; end;
  assert (select target_vehicles from team_progress()) = 20, 'Verkäufer sieht Teamziel nicht';
end $$;

-- Büro-Anzeige: Verkäufer lesen die Einstellung, nur der Admin ändert sie
update display_settings set view = 'rennen'; -- noch als Verkäufer 2: wirkt nicht
do $$ begin
  assert (select view from display_settings) = 'wechsel', 'Verkäufer hat Anzeige geändert';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
update display_settings set view = 'rennen';
do $$ begin
  assert (select view from display_settings) = 'rennen', 'Admin konnte Anzeige nicht ändern';
end $$;

-- Sprüche: alle lesen, nur der Admin pflegt (wir sind hier noch als Admin angemeldet)
insert into quotes (text) values ('Testspruch vom Admin');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
do $$ begin
  assert (select count(*) from quotes) >= 30, 'Verkäufer sieht die Sprüche nicht';
  begin
    insert into quotes (text) values ('Verkäufer-Spruch');
    assert false, 'Verkäufer hat Spruch angelegt';
  exception when insufficient_privilege then null; end;
end $$;
delete from quotes where text = 'Testspruch vom Admin';
do $$ begin
  assert exists (select 1 from quotes where text = 'Testspruch vom Admin'), 'Verkäufer hat Spruch gelöscht';
end $$;

-- Abzeichen: Jonas (…001) hat Golf (Bewertung 5) und Polo (4) und Selbstbewertung heute -> Hattrick, Durchstarter
do $$ begin
  assert exists (select 1 from seller_badges() where seller_id = '00000000-0000-0000-0000-000000000001' and badge = 'hattrick'), 'Hattrick fehlt';
  assert exists (select 1 from seller_badges() where seller_id = '00000000-0000-0000-0000-000000000001' and badge = 'durchstarter'), 'Durchstarter fehlt';
  assert exists (select 1 from seller_badges() where seller_id = '00000000-0000-0000-0000-000000000001' and badge = 'winterkoenig'), 'Winterkönig fehlt';
  assert not exists (select 1 from seller_badges() where badge = 'serie'), 'Serie ohne Ziele';
end $$;

-- Lob: Laura (…002) lobt Jonas' Golf mit Kommentar, ihren eigenen Verkauf kann sie nicht loben
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false) is not null as login \gset
-- Verkäufer sehen fremde Verkäufe nur über den Feed
insert into kudos (sale_id, comment) select sale_id, 'Stark gemacht!' from sales_feed() where vehicle = 'Golf';
do $$ begin
  assert (select likes from sales_feed() where vehicle = 'Golf') = 1, 'Lob zählt nicht';
  assert (select liked from sales_feed() where vehicle = 'Golf'), 'liked fehlt';
  assert (select comments->0->>'comment' from sales_feed() where vehicle = 'Golf') = 'Stark gemacht!', 'Kommentar fehlt';
  begin
    insert into kudos (sale_id, user_id) select sale_id, '00000000-0000-0000-0000-000000000001' from sales_feed() where vehicle = 'Golf';
    assert false, 'Lob im Namen eines anderen';
  exception when insufficient_privilege then null; end;
end $$;
insert into sales (vehicle) values ('Lauras Auto');
do $$ begin
  begin
    insert into kudos (sale_id) select id from sales where vehicle = 'Lauras Auto';
    assert false, 'Eigenes Lob hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
end $$;

-- Offline: derselbe Verkauf (gleiche client_id) wird nur einmal gespeichert
insert into sales (vehicle, client_id) values ('Offline-Golf', '11111111-1111-1111-1111-111111111111');
do $$ begin
  begin
    insert into sales (vehicle, client_id) values ('Offline-Golf', '11111111-1111-1111-1111-111111111111');
    assert false, 'Doppelter Offline-Verkauf';
  exception when unique_violation then null; end;
  assert (select count(*) from sales where vehicle = 'Offline-Golf') = 1, 'Offline-Verkauf doppelt';
end $$;

select 'ALLE SQL-TESTS OK' as result;
