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


-- Push: eigenes Abo anlegen, fremde Abos unsichtbar, Schlüssel nur für service_role, neuer Verkauf ruft notify-sale
reset role;
truncate net.calls;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push/1', '00000000-0000-0000-0000-000000000001', 'k', 'a');
do $$ begin
  begin
    insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push/x', '00000000-0000-0000-0000-000000000002', 'k', 'a');
    assert false, 'Fremdes Abo hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  begin
    perform push_vapid_private_key();
    assert false, 'Schlüssel darf nicht lesbar sein';
  exception when insufficient_privilege then null; end;
end $$;
insert into sales (vehicle) values ('Push-Test');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false) is not null as login \gset
do $$ begin
  assert (select count(*) from push_subscriptions) = 0, 'Laura sieht fremde Abos';
end $$;
reset role;
do $$ begin
  assert (select count(*) from net.calls where url like '%/functions/v1/notify-sale' and body ? 'sale_id') = 1, 'notify-sale nicht aufgerufen';
end $$;
set role service_role;
do $$ begin
  assert public.push_vapid_private_key() = 'test-key', 'service_role muss den Schlüssel lesen';
end $$;
reset role;
\echo 'PUSH OK'
set role anon;
do $$ begin assert public.health(), 'health() muss ohne Login antworten'; end $$;
reset role;
-- Asana: Verkäufer lesen Auslieferungen, aber nicht die Einstellung; nur der Admin ändert sie (stößt Abruf an).
reset role;
truncate net.calls;
set role service_role;
select public.asana_replace('[{"task_gid":"1","name":"VW Golf","section":"Auslieferung","stage":"auslieferung","due_on":"2026-10-14"},{"task_gid":"2","name":"Audi A4","section":"Fahrzeug fertig","stage":"fertig","due_on":""}]'::jsonb) = 2 as replaced \gset
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
do $$ begin
  assert (select count(*) from asana_current()) = 2, 'Verkäufer sieht Auslieferungen nicht';
  assert (select due_on from asana_deliveries where task_gid = '2') is null, 'leeres Datum muss null sein';
  assert (select task_count from asana_sync) = 2, 'Abrufstatus fehlt';
  assert (select count(*) from asana_settings) = 0, 'Verkäufer darf Einstellung nicht sehen';
  begin
    perform asana_replace('[]'::jsonb);
    assert false, 'Verkäufer darf nicht ersetzen';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
update asana_settings set project_ref = 'https://app.asana.com/0/123/list';
reset role;
set role service_role;
select public.asana_replace('[{"task_gid":"1","name":"VW Golf","section":"Auszahlung/ Prüfung","stage":"ausgeliefert","due_on":"2026-10-14","amount":18990.5,"deal_type":"Direkter Ankauf"}]'::jsonb) = 1 as replaced \gset
reset role;
do $$ begin
  assert (select count(*) from asana_current()) = 1, 'Alte Aufgaben dürfen nach neuem Abruf nicht mehr zählen';
  assert (select stage from asana_current()) = 'ausgeliefert', 'Stand nicht aktualisiert';
  assert (select amount from asana_current()) = 18990.50, 'Betrag gespeichert';
  assert (select deal_type from asana_current()) = 'Direkter Ankauf', 'Ankaufsart gespeichert';
end $$;
do $$ begin
  assert (select project_ref from asana_settings) like '%123%', 'Admin konnte Projekt nicht setzen';
  assert (select count(*) from net.calls where url like '%/asana-sync') = 1, 'Abruf nicht angestoßen';
end $$;
-- Einkäufer: Aufgaben dieses Monats je Ersteller, Stornos und Vormonat zählen nicht
set role service_role;
select public.asana_replace(jsonb_build_array(
  jsonb_build_object('task_gid','b1','name','Golf','section','FZG.-Beschaffung','stage','sonstige','created_at',now(),'created_by','Anna'),
  jsonb_build_object('task_gid','b2','name','Polo','section','FZG.-Verkauf (Bestand)','stage','sonstige','created_at',now(),'created_by','Anna','completed',true),
  jsonb_build_object('task_gid','b3','name','A3','section','FZG.-Beschaffung','stage','sonstige','created_at',now(),'created_by','Ben'),
  jsonb_build_object('task_gid','b4','name','A4','section','Stornos','stage','sonstige','created_at',now(),'created_by','Ben'),
  jsonb_build_object('task_gid','b6','name','A6','section','FZG.-Beschaffung','stage','sonstige','created_at',now(),'created_by','mario.rossi@example.de'),
  jsonb_build_object('task_gid','b5','name','A5','section','FZG.-Beschaffung','stage','sonstige','created_at',now() - interval '40 days','created_by','Ben')
)) = 6 as replaced \gset
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
do $$ begin
  -- Startliste ist gesetzt: Anna/Ben stehen nicht drauf
  assert (select count(*) from buyer_leaderboard()) = 6, 'nur die 6 Einkäufer der Liste';
  assert (select vehicles from buyer_leaderboard() where buyer = 'Cem Turan') = 0, 'Einkäufer ohne Aufgaben mit 0';
  assert (select vehicles from asana_creators() where name = 'Anna') = 2, 'Ersteller-Liste fürs Admin';
  begin
    insert into asana_buyers (name) values ('Anna');
    assert false, 'Verkäufer darf Einkäufer nicht anlegen';
  exception when insufficient_privilege then null; end;
end $$;
-- ohne Liste zählen alle Ersteller
reset role;
create temp table saved_buyers as select * from public.asana_buyers;
delete from public.asana_buyers where true;
set role authenticated;
do $$ begin
  assert (select vehicles from buyer_leaderboard() where buyer = 'Anna') = 2, 'Anna sollte 2 haben';
  assert (select vehicles from buyer_leaderboard() where buyer = 'Ben') = 1, 'Ben: Storno und Vormonat zählen nicht';
  assert (select rank from buyer_leaderboard() where buyer = 'Anna') = 1, 'Anna Platz 1';
  assert (select vehicles from buyer_leaderboard() where buyer = 'Mario Rossi') = 1, 'E-Mail wird zu Namen';
  assert (select completed from asana_current() where task_gid = 'b2'), 'erledigt muss gespeichert sein';
end $$;
reset role;
insert into public.asana_buyers select * from saved_buyers;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
set role authenticated;
insert into asana_buyers (name) values ('Anna');
do $$ begin
  assert (select vehicles from buyer_leaderboard() where buyer = 'Anna') = 2, 'Admin fügt Anna hinzu';
  assert (select rank from buyer_leaderboard() where buyer = 'Anna') = 1, 'Anna Platz 1';
end $$;
delete from asana_buyers where name = 'Anna';
reset role;
-- Standzeit: Eingang (Administration) bis ausgeliefert
insert into public.asana_lead_times (task_gid, eingang_at, ausgeliefert_at, section_seen) values
  ('b1', now() - interval '5 days', null, 'FZG.-Beschaffung'),
  ('b2', '2026-09-01T10:00:00+02', '2026-09-11T10:00:00+02', 'FZG.-Verkauf (Bestand)'),
  ('b3', '2026-09-01T10:00:00+02', '2026-09-21T10:00:00+02', 'FZG.-Beschaffung'),
  ('b4', '2026-09-01T10:00:00+02', '2026-09-02T10:00:00+02', 'Stornos'),
  ('b6', null, null, 'FZG.-Beschaffung');
set role authenticated;
do $$ begin
  assert (select count(*) from lead_time_months()) = 1, 'nur ein Monat';
  assert (select vehicles from lead_time_months()) = 2, 'Storno zählt nicht';
  assert (select avg_days from lead_time_months()) = 15.0, 'Ø 15 Tage';
  assert (select month from lead_time_months()) = '2026-09-01', 'Monat der Auslieferung';
  assert (select count(*) from lead_time_open()) = 1, 'ein Fahrzeug steht';
  assert (select days from lead_time_open()) between 4.9 and 5.1, 'laufende Tage';
  assert (select tasks from lead_time_status()) = 5 and (select checked from lead_time_status()) = 4, 'Fortschritt';
end $$;
reset role;
-- Ausgeliefert im Monat: auch ohne Eingang über die Administration, ohne Stornos
update public.asana_lead_times set delivered_at = now(), delivered_from = 'Auslieferung' where task_gid in ('b6', 'b4');
update public.asana_lead_times set delivered_at = now(), delivered_skip = true, delivered_from = 'FZG.- Fertig' where task_gid = 'b1';
update public.asana_lead_times set delivered_at = now(), delivered_skip = true, delivered_from = 'FZG.-Verkauf (Bestand)' where task_gid = 'b2';
update public.asana_lead_times set delivered_from = 'Auslieferung', delivered_at = date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin' - interval '10 days' where task_gid = 'b3';
set role authenticated;
do $$ begin
  assert (select count(*) from delivered_months()) = 2, 'dieser und Vormonat';
  assert (select vehicles from delivered_summary() order by month desc limit 1) = 2, 'über Auslieferung oder direkt aus Fertig zählt (auch ohne Eingang); aus Bestand und Storno nicht';
  assert (select vehicles from delivered_summary() order by month limit 1) = 1, 'Vormonat';
end $$;
reset role;
-- Umsatz, Wareneinsatz: Summen der ausgelieferten Fahrzeuge, fehlende Felder werden gezählt
update public.asana_deliveries set amount = 20000, purchase_price = 15000, bank_commission = 800 where task_gid = 'b6';
update public.asana_deliveries set amount = 10000, purchase_price = null, bank_commission = 300 where task_gid = 'b1';
update public.asana_deliveries set amount = 99999, purchase_price = 1, bank_commission = 1 where task_gid = 'b2';
set role authenticated;
do $$ begin
  assert (select vehicles from finance_months() order by month desc limit 1) = 2, 'gleiche Fahrzeuge wie Ausgeliefert';
  assert (select sale_total from finance_months() order by month desc limit 1) = 30000, 'Verkaufspreise';
  assert (select bank_total from finance_months() order by month desc limit 1) = 1100, 'Bankprovision';
  assert (select purchase_total from finance_months() order by month desc limit 1) = 15000, 'Einkauf';
  assert (select missing_purchase from finance_months() order by month desc limit 1) = 1, 'fehlender Einkaufspreis gezählt';
  assert (select complete_vehicles from finance_months() order by month desc limit 1) = 1, 'nur vollständige Fahrzeuge';
  assert (select complete_margin from finance_months() order by month desc limit 1) = 5800, 'Ertrag 20000 + 800 - 15000';
end $$;
reset role;
-- Standzeit 3: Verkauf bis Auslieferung; Datum nach der Auslieferung zählt als fehlend
update public.asana_deliveries set sold_on = (now() at time zone 'Europe/Berlin')::date - 12 where task_gid = 'b6';
update public.asana_deliveries set sold_on = (now() at time zone 'Europe/Berlin')::date + 3 where task_gid = 'b1';
set role authenticated;
do $$ begin
  assert (select vehicles from sale_to_delivery() order by month desc limit 1) = 2, 'gleiche Fahrzeuge wie Ausgeliefert';
  assert (select with_date from sale_to_delivery() order by month desc limit 1) = 1, 'Datum in der Zukunft zählt nicht';
  assert (select avg_days from sale_to_delivery() order by month desc limit 1) = 12, 'Tage Verkauf bis Auslieferung';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
set role authenticated;
do $$ begin
  assert (select count(*) from lead_time_months()) = 0, 'Verkäufer sieht keine Standzeiten';
  assert (select sum(vehicles) from delivered_summary()) = 0, 'Verkäufer sieht keine Auslieferungen';
  assert (select sum(sale_total) from finance_months()) = 0, 'Verkäufer sieht keine Umsätze';
  assert (select sum(vehicles) from sale_to_delivery()) = 0, 'Verkäufer sieht keine Standzeit 3';
end $$;
reset role;
-- Arbeitsanweisungen: Admin stellt ein, Verkäufer bestätigen nur für sich, Admin sieht den Stand
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
set role authenticated;
insert into work_instructions (title, body) values ('Probefahrt', 'Immer Führerschein kopieren.');
insert into work_instructions (title, body, archived_at) values ('Alt', 'Gilt nicht mehr.', now());
do $$ begin
  begin
    insert into work_instructions (title, body) values ('Leer', '');
    assert false, 'Anweisung ohne Text und Datei hätte scheitern müssen';
  exception when check_violation then null; end;
  assert (select count(*) from instruction_status() where confirmed_at is null and instruction_id = (select id from work_instructions where title = 'Probefahrt'))
    = (select count(*) from profiles where role = 'seller' and status = 'active'), 'alle Verkäufer offen';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) is not null as login \gset
set role authenticated;
do $$ begin
  begin
    insert into work_instructions (title, body) values ('Von Jonas', 'x');
    assert false, 'Verkäufer darf keine Anweisung einstellen';
  exception when insufficient_privilege then null; end;
  begin
    insert into instruction_acks (instruction_id, user_id) values ((select id from work_instructions where title = 'Probefahrt'), '00000000-0000-0000-0000-000000000002');
    assert false, 'Verkäufer darf nicht für andere bestätigen';
  exception when insufficient_privilege then null; end;
  begin
    insert into instruction_acks (instruction_id) values ((select id from work_instructions where title = 'Alt'));
    assert false, 'Zurückgezogene Anweisung muss nicht bestätigt werden';
  exception when insufficient_privilege then null; end;
  insert into instruction_acks (instruction_id, confirmed_at) values ((select id from work_instructions where title = 'Probefahrt'), '2000-01-01');
  assert (select confirmed_at from instruction_acks) > '2020-01-01', 'Zeit kommt vom Server';
  assert (select count(*) from instruction_status()) = 0, 'Verkäufer sieht keinen Gesamtstand';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false) is not null as login \gset
set role authenticated;
do $$ begin
  assert (select count(*) from instruction_acks) = 0, 'Laura sieht fremde Bestätigungen';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
set role authenticated;
do $$ begin
  assert (select count(*) from instruction_status() where full_name = 'Jonas' and confirmed_at is not null
    and instruction_id = (select id from work_instructions where title = 'Probefahrt')) = 1, 'Admin sieht Bestätigung';
end $$;
reset role;
-- Offene Anweisung sperrt auch in der Datenbank: keine Verkäufe, kein Lob, bis bestätigt
do $$ begin
  assert (select count(*) from net.calls where body ? 'instruction_id') = 2, 'Push je neuer Anweisung';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false) is not null as login \gset
set role authenticated;
do $$ begin
  assert has_open_instructions(), 'Laura hat eine offene Anweisung';
  begin
    insert into sales (vehicle) values ('Gesperrt');
    assert false, 'Verkauf trotz offener Anweisung';
  exception when sqlstate 'P0A01' then null; end;
  begin
    insert into kudos (sale_id) values ((select min(id) from sales));
    assert false, 'Lob trotz offener Anweisung';
  exception when sqlstate 'P0A01' then null; end;
  insert into instruction_acks (instruction_id) values ((select id from work_instructions where title = 'Probefahrt'));
  assert not has_open_instructions(), 'nach Bestätigung frei';
  insert into sales (vehicle) values ('Nach Bestätigung');
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) is not null as login \gset
set role authenticated;
do $$ begin
  assert (select count(*) from instruction_status() where has_push is null) = 0, 'Push-Stand je Verkäufer';
end $$;
reset role;
select 'ALLE SQL-TESTS OK' as result;
