# Verkäufer-Scoreboard

App für Autoverkäufer: Verkäufe eintragen, Provision automatisch berechnen, Rangliste und Monatsziele.
Eine Codebasis (Expo / React Native) für iPhone, Android und Web. Admin-Bereich und Büro-Anzeige laufen im Browser.

## Aufbau

| Bereich | Adresse | Wer |
| --- | --- | --- |
| Rangliste, Monatsziel | `/` | Verkäufer |
| Verkauf eintragen | `/neu` | Verkäufer |
| Verkäufe, Kennzahlen | `/admin` | Admin |
| Freigaben, Monatsziele | `/admin/team` | Admin |
| Provisionssätze | `/admin/provision` | Admin |
| Büro-Anzeige (Vollbild) | `/buero` | alle freigegebenen Konten |

Daten und Login liegen in Supabase (Postgres). Die Provision rechnet die Datenbank beim Speichern:

```
Provision = Grundprovision + Bankprovision gesamt × Anteil %
          + Verkaufspreis Winterräder × Satz % + Verkaufspreis Zulassung × Satz %
```

Sätze sind versioniert. Jeder Verkauf merkt sich die Sätze, mit denen er gerechnet wurde.
Neue Konten sind erst nach Freigabe durch einen Admin aktiv. Zugriffsregeln (RLS) stehen in `supabase/migrations/`.

## Einrichten

1. **Supabase-Projekt** (EU-Region). Im SQL-Editor die Dateien aus `supabase/migrations/` der Reihe nach ausführen.
   Das Live-Projekt ist bereits eingerichtet; seine öffentlichen Werte stehen in `.env.production`.
2. Unter *Authentication > URL Configuration* die Web-Adresse der App als Site URL eintragen.
3. Für ein eigenes Entwicklungsprojekt `.env.example` nach `.env` kopieren und URL sowie Publishable Key aus *Project Settings > API* eintragen.
4. `npm install`, dann `npm run web` (Browser) oder `npm start` (Expo Go auf dem Handy).
5. Selbst registrieren, dann im SQL-Editor zum Admin machen:

   ```sql
   update profiles set role = 'admin', status = 'active'
   where id = (select id from auth.users where email = 'DEINE@EMAIL.de');
   ```

## Veröffentlichen

- **Web** (Admin, Büro-Anzeige, Verkäufer im Browser): `npm run build:web` erzeugt `dist/`, das als statische Seite gehostet wird,
  z. B. mit `npx eas-cli@latest deploy --prod` (EAS Hosting) oder Vercel/Netlify. Alle Pfade auf `index.html` umleiten.
- **iOS / Android**: `npx eas-cli@latest build --platform all --profile production`, dann `npx eas-cli@latest submit`.
  Die Supabase-Werte als EAS-Umgebungsvariablen hinterlegen (`eas env:create`).
  Vor dem ersten Store-Build `ios.bundleIdentifier` und `android.package` in `app.json` auf die Firma anpassen sowie Icon und Splash ersetzen.
- Apple verlangt für die Prüfung ein Demo-Konto. Für eine reine Firmen-App bietet sich „Unlisted App Distribution“ an.

## Entwicklung

```bash
npm run typecheck   # TypeScript
npm test            # Rechenlogik (Provision, Abstand zum nächsten Platz, Ziele)
npm run test:db     # Schema, Provision und Zugriffsregeln gegen ein lokales Postgres (braucht Postgres-Binaries, nicht als root)
```

Hinweis: Live-Updates kommen über Supabase Realtime und respektieren die Zugriffsregeln. Verkäufer sehen fremde Verkäufe
deshalb nach spätestens einer Minute (die Ansicht lädt jede Minute neu), die Büro-Anzeige mit Admin-Login sofort.
