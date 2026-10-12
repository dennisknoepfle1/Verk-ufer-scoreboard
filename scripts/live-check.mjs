// Prüft eine veröffentlichte Version wie ein echter Besucher:
// Seite lädt, Anmeldemaske erscheint, keine Skriptfehler, Service Worker und Supabase erreichbar.
// Aufruf: node scripts/live-check.mjs https://verkaeufer-scoreboard.expo.app
// Endet mit Code 1, wenn etwas nicht stimmt (dann wird nicht veröffentlicht bzw. Alarm ausgelöst).
import { chromium } from 'playwright';

const base = (process.argv[2] || 'https://verkaeufer-scoreboard.expo.app').replace(/\/$/, '');
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const problems = [];

async function get(url, init) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return res;
      if (i === 2) return res;
    } catch (e) {
      if (i === 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
    console.log(`FEHLER ${name}: ${e.message}`);
  }
}

await check('Startseite antwortet', async () => {
  const res = await get(base + '/');
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const html = await res.text();
  if (!html.includes('/_expo/static/')) throw new Error('App-Code fehlt in der Seite');
});

await check('Service Worker vorhanden', async () => {
  const res = await get(base + '/sw.js');
  if (!res.ok) throw new Error(`Status ${res.status}`);
});

if (supabaseUrl && anonKey) {
  await check('Supabase Login-Dienst erreichbar', async () => {
    const res = await get(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: anonKey } });
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });
  // Echte Datenbank-Abfrage (ohne Login liefert sie nur eine leere Liste). Hält nebenbei das kostenlose Projekt aktiv.
  await check('Supabase Datenbank antwortet', async () => {
    const res = await get(`${supabaseUrl}/rest/v1/display_settings?select=view`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status} (pausiert oder gestört?)`);
  });
}

await check('Anmeldeseite erscheint im Browser ohne Fehler', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByText('Anmelden', { exact: false }).first().waitFor({ timeout: 20_000 });
    if (errors.length) throw new Error('Skriptfehler: ' + errors.join(' | '));
  } finally {
    await browser.close();
  }
});

if (problems.length) {
  console.log(`\n${problems.length} Problem(e) auf ${base}`);
  process.exit(1);
}
console.log(`\nAlles in Ordnung: ${base}`);
