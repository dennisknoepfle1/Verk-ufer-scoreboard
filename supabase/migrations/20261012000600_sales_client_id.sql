-- Offline eintragen: Die App vergibt pro Verkauf eine feste ID. Wird derselbe Verkauf nach einem Funkloch
-- nochmal gesendet, lehnt die Datenbank ihn ab, statt ihn doppelt zu zählen.
alter table public.sales add column client_id uuid unique;
