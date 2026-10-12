-- Spruch des Tages: eigene Verkaufssprüche, täglich wechselnd. Der Admin ergänzt oder entfernt Sprüche.
-- Hinweis: Dennis hat den Spruch des Tages am 2026-10-12 wieder herausgenommen; die Tabelle bleibt ungenutzt bestehen.
create table public.quotes (
  id bigint generated always as identity primary key,
  text text not null check (length(trim(text)) between 3 and 200),
  created_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
create policy "Freigegebene Nutzer lesen Sprüche" on public.quotes
  for select using (public.is_active_user());
create policy "Admins pflegen Sprüche" on public.quotes
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.quotes (text) values
  ('Der Kunde kauft nicht das Auto. Er kauft dich. Also verkauf dich gut.'),
  ('Kein Abschluss ist auch eine Entscheidung. Nur nicht deine.'),
  ('Wer nicht fragt, verkauft nicht. Frag nach dem Abschluss!'),
  ('Heute ist kein Tag zum Zögern. Heute ist Zahltag.'),
  ('Ein Nein ist nur ein Ja, das noch Gründe braucht.'),
  ('Das Telefon wählt sich nicht von allein. Hörer in die Hand!'),
  ('Die Konkurrenz schläft nicht. Du aber auch nicht.'),
  ('Begeisterung ist ansteckend. Steck deine Kunden an.'),
  ('Jeder Händedruck ist eine Chance. Lass keine liegen.'),
  ('Du bist nicht hier, um Prospekte zu verteilen. Du bist hier, um zu verkaufen.'),
  ('Winterräder und Zulassung gehören dazu. Immer anbieten!'),
  ('Die Finanzierung macht den Deal rund. Sprich sie an.'),
  ('Zweifel verkaufen keine Autos. Überzeugung schon.'),
  ('Wer wartet, bis der Kunde kommt, wartet lange.'),
  ('Platz 1 wird nicht verschenkt. Er wird verkauft.'),
  ('Der beste Moment für den Abschluss? Jetzt.'),
  ('Mach heute den Verkauf, über den morgen alle reden.'),
  ('Hör zu, dann verkauf. In dieser Reihenfolge.'),
  ('Jeder Kunde, der ohne Schlüssel rausgeht, ist eine verpasste Chance.'),
  ('Ziele sind da, um sie zu zerlegen.'),
  ('Keine Ausreden. Nur Abschlüsse.'),
  ('Du willst mehr Provision? Dann hol sie dir.'),
  ('Ein guter Verkäufer löst Probleme. Ein großartiger verkauft gleich die Lösung.'),
  ('Heute nicht verkauft ist morgen nicht verdient.'),
  ('Gib dem Kunden einen Grund, heute zu unterschreiben.'),
  ('Mut zum Preis. Wer überzeugt ist, muss nicht rabattieren.'),
  ('Am Ende des Monats zählt nur eins: die Zahl auf der Tafel.'),
  ('Schlüssel übergeben, Hand schütteln, nächster Kunde.'),
  ('Ein Lächeln öffnet die Tür. Der Abschluss schließt sie.'),
  ('Sei der Grund, warum der Kunde heute nicht woanders kauft.');
