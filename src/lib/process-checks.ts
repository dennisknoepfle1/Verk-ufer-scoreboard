// Prozessboard: alle Prüfungen auf einen Blick (Dennis, 21.11.2026: „alle“).
// Reine Rechenlogik ohne Netz, damit testbar. Daten: Asana-Stand (asana_current), Spaltenzeiten (asana_lead_times)
// und mobile.de-Inserate (mobile_current). Jede Prüfung liefert eine Liste von Fällen; leer = grün.

import { inStock, matchListings, type AsanaVehicle, type Listing, type Match } from './mobile-match.ts';

export type BoardTask = AsanaVehicle & {
  due_on?: string | null;
  deal_type?: string | null;
  amount?: number | null;
  purchase_price?: number | null;
  bank_commission?: number | null;
};

export type TaskTimes = { task_gid: string; eingang_at: string | null; section_since: string | null };
export type BoardListing = Listing & { image_count?: number | null };

export type CaseItem = {
  key: string;
  title: string; // Fahrzeug (Asana-Titel oder Inserat)
  detail: string; // warum es auffällt
  url: string | null; // Asana-Aufgabe oder Inserat
  url2?: { label: string; url: string } | null; // zweiter Link (z. B. Inserat zur Aufgabe)
  days?: number; // für die Sortierung (länger zuerst)
  warn?: boolean; // gelb statt rot
};

export type CheckGroup = 'Einkauf und Aufbereitung' | 'Verkauf und mobile.de' | 'Auslieferung und Geld' | 'Ordnung in Asana';

export type CheckResult = {
  key: string;
  group: CheckGroup;
  title: string;
  what: string;
  items: CaseItem[];
  /** Fälle, die nur gelb sind (zählen nicht in die rote Zahl). */
  warnCount?: number;
  /** Prüfung kann gerade nicht rechnen (z. B. mobile.de noch nicht abgerufen). */
  unavailable?: string | null;
};

export const LIMITS = { adminDays: 7, workshopDays: 30, longRed: 90, longYellow: 60 };

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined, now: number) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : null);
const tageText = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
const isStorno = (t: { section: string }) => /storno/i.test(t.section);
const open = (t: BoardTask) => !t.completed && !isStorno(t);
const sec = (re: RegExp) => (t: BoardTask) => re.test(t.section);
const isAdmin = sec(/administration/i);
const isWorkshop = sec(/disposition|werkstatt/i);
const isSaleStock = sec(/verkauf \(bestand\)|\bbestand\b/i);
const isReady = sec(/fertig/i);
const isSoldFlow = sec(/disposition|werkstatt|fertig|auslieferung|auszahlung|prüfung|pruefung|buchhaltung/i);
const isBilling = sec(/auszahlung|prüfung|pruefung|buchhaltung/i);
const isClosedColumn = sec(/abgeschlossen/i);
const exportCar = (t: BoardTask) => /export/i.test(t.name);

const taskItem = (t: BoardTask, detail: string, days?: number, warn?: boolean): CaseItem => ({
  key: t.task_gid,
  title: t.name,
  detail,
  url: t.permalink_url,
  days,
  warn,
});

const byDays = (a: CaseItem, b: CaseItem) => (b.days ?? -1) - (a.days ?? -1);

export function runChecks(
  input: { tasks: BoardTask[]; times: TaskTimes[]; listings: BoardListing[] | null; mobileReady: boolean },
  now = Date.now(),
): CheckResult[] {
  const { tasks, listings } = input;
  const times = new Map(input.times.map((t) => [t.task_gid, t]));
  const since = (t: BoardTask) => times.get(t.task_gid)?.section_since ?? null;
  const eingang = (t: BoardTask) => times.get(t.task_gid)?.eingang_at ?? null;
  const live = tasks.filter(open);

  // 1) Hängt in der Administration
  const admin = live
    .filter(isAdmin)
    .map((t) => {
      const d = daysSince(since(t) ?? eingang(t) ?? t.created_at, now) ?? 0;
      return taskItem(t, `seit ${tageText(d)} in der Administration`, d);
    })
    .filter((i) => (i.days ?? 0) > LIMITS.adminDays)
    .sort(byDays);

  // 2) Werkstatt dauert zu lange
  const workshop = live
    .filter(isWorkshop)
    .map((t) => {
      const known = since(t);
      const d = daysSince(known ?? t.created_at, now) ?? 0;
      return taskItem(t, known ? `seit ${tageText(d)} in Disposition/Werkstatt` : `seit Anlage ${tageText(d)} (Spaltenwechsel noch nicht gelesen)`, d);
    })
    .filter((i) => (i.days ?? 0) > LIMITS.workshopDays)
    .sort(byDays);

  // 3) + 4) + 10) mobile.de
  let sold: CaseItem[] = [];
  let notOnline: CaseItem[] = [];
  let noImages: CaseItem[] = [];
  let unknownCount = 0;
  let unknown: CaseItem[] = [];
  let imagesKnown = false;
  if (input.mobileReady && listings) {
    const r = matchListings(listings, tasks);
    unknownCount = r.unknown.length;
    unknown = r.unknown.map((l) => ({
      key: l.ad_id,
      title: l.title,
      detail: `keine passende Asana-Aufgabe${l.internal_number ? ` · Nr. ${l.internal_number}` : ''}`,
      url: l.url,
      days: daysSince(l.first_seen_at, now) ?? undefined,
      warn: true,
    }));
    const listingFor = new Map<string, Match>();
    for (const m of [...r.ok, ...r.offline]) listingFor.set(m.task.task_gid, m);
    sold = r.offline.map((m) => ({
      key: m.listing.ad_id,
      title: m.listing.title + (m.listing.price != null ? ` · ${Math.round(Number(m.listing.price)).toLocaleString('de-DE')} €` : ''),
      detail: `Asana: ${m.task.name} · ${m.task.completed ? 'erledigt' : m.task.section}`,
      url: m.listing.url,
      url2: m.task.permalink_url ? { label: 'Asana', url: m.task.permalink_url } : null,
      days: daysSince(m.listing.first_seen_at, now) ?? undefined,
    }));
    notOnline = live
      .filter((t) => isSaleStock(t) && inStock(t) && !listingFor.has(t.task_gid))
      .map((t) => {
        const d = daysSince(since(t) ?? t.created_at, now) ?? undefined;
        return taskItem(t, `im Bestand, aber kein Inserat gefunden${exportCar(t) ? ' · EXPORT' : ''}`, d, exportCar(t));
      })
      .sort((a, b) => Number(a.warn ?? false) - Number(b.warn ?? false) || byDays(a, b));
    imagesKnown = listings.some((l) => l.image_count != null);
    noImages = listings
      .filter((l) => l.image_count === 0)
      .map((l) => ({
        key: l.ad_id,
        title: l.title,
        detail: `keine Bilder${l.internal_number ? ` · Nr. ${l.internal_number}` : ''}`,
        url: l.url,
        days: daysSince(l.first_seen_at, now) ?? undefined,
      }))
      .sort(byDays);
  }
  const mobileMissing = input.mobileReady ? null : 'mobile.de wurde noch nicht abgerufen';

  // 5) Langsteher: im Bestand, ab Eingang gezählt
  const long = live
    .filter((t) => inStock(t) && eingang(t))
    .map((t) => {
      const d = daysSince(eingang(t), now) ?? 0;
      return taskItem(t, `${tageText(d)} seit Eingang`, d, d < LIMITS.longRed);
    })
    .filter((i) => (i.days ?? 0) >= LIMITS.longYellow)
    .sort(byDays);

  // 6) Fertig ohne Auslieferungstermin
  const noDate = live.filter((t) => isReady(t) && !t.due_on).map((t) => taskItem(t, 'kein „Termin Auslieferung“ eingetragen', daysSince(since(t), now) ?? undefined)).sort(byDays);

  // 7) Verkauft ohne Datum oder Art des Geschäftes
  const soldInfo = live
    .filter((t) => isSoldFlow(t) && (!t.sold_on || !t.deal_type))
    .map((t) => {
      const miss = [!t.sold_on && '„Datum Verkauf“', !t.deal_type && '„Art des Geschäftes“'].filter(Boolean).join(' und ');
      return taskItem(t, `${miss} fehlt · ${t.section}`, daysSince(since(t), now) ?? undefined);
    })
    .sort(byDays);

  // 8) Abrechnung unvollständig
  const billing = live
    .filter((t) => isBilling(t) && (t.amount == null || t.purchase_price == null || t.bank_commission == null))
    .map((t) => {
      const miss = [t.amount == null && 'Verkaufspreis', t.purchase_price == null && 'EK (Auszahlung VB)', t.bank_commission == null && 'Bankprovision']
        .filter(Boolean)
        .join(', ');
      return taskItem(t, `fehlt: ${miss} · ${t.section}`, daysSince(since(t), now) ?? undefined);
    })
    .sort(byDays);

  // 9) Ordnung in Asana
  const hygiene = [
    ...tasks.filter((t) => t.completed && inStock({ section: t.section }) && !isStorno(t)).map((t) => taskItem(t, `abgehakt, steht aber noch in „${t.section}“`, undefined)),
    ...live.filter(isClosedColumn).map((t) => taskItem(t, 'in „Abgeschlossen“, aber nicht abgehakt', daysSince(since(t), now) ?? undefined, true)),
  ];

  return [
    { key: 'admin', group: 'Einkauf und Aufbereitung', title: 'Hängt in der Administration', what: `Länger als ${LIMITS.adminDays} Tage in „FZG.-Administration“.`, items: admin },
    { key: 'werkstatt', group: 'Einkauf und Aufbereitung', title: 'Werkstatt dauert zu lange', what: `Länger als ${LIMITS.workshopDays} Tage in „Disposition/Werkstatt“.`, items: workshop },
    {
      key: 'mobile-verkauft',
      group: 'Verkauf und mobile.de',
      title: 'Verkauft, aber noch auf mobile.de',
      what: 'Online auf mobile.de, in Asana aber nicht mehr im Bestand (alles nach „FZG.-Verkauf (Bestand)“ oder erledigt). Sofort offline nehmen.',
      items: sold,
      unavailable: mobileMissing,
    },
    {
      key: 'mobile-fehlt',
      group: 'Verkauf und mobile.de',
      title: 'Im Bestand, aber nicht online',
      what: `In „FZG.-Verkauf (Bestand)“, aber kein passendes Inserat auf mobile.de. Export-Fahrzeuge sind gelb und zählen nicht.${unknownCount ? ` ${unknownCount} Inserate konnten keiner Aufgabe zugeordnet werden, einzelne Fälle können daher auch eine falsche Nummer im Inserat sein.` : ''}`,
      items: notOnline,
      warnCount: notOnline.filter((i) => i.warn).length,
      unavailable: mobileMissing,
    },
    {
      key: 'mobile-unbekannt',
      group: 'Verkauf und mobile.de',
      title: 'Inserat ohne Asana-Aufgabe',
      what: 'Online auf mobile.de, aber weder FIN-Stellen noch Bestandsnummer passen zu einer Asana-Aufgabe der letzten 13 Monate. Bitte von Hand prüfen.',
      items: unknown,
      warnCount: unknown.length,
      unavailable: mobileMissing,
    },
    {
      key: 'mobile-bilder',
      group: 'Verkauf und mobile.de',
      title: 'Online ohne Bilder',
      what: 'Inserate auf mobile.de ohne ein einziges Bild.',
      items: noImages,
      unavailable: mobileMissing ?? (input.mobileReady && !imagesKnown ? 'mobile.de liefert die Bilderzahl erst nach dem nächsten Abruf' : null),
    },
    {
      key: 'langsteher',
      group: 'Verkauf und mobile.de',
      title: 'Langsteher',
      what: `Im Bestand seit Eingang in der Administration: ab ${LIMITS.longRed} Tagen rot, ab ${LIMITS.longYellow} Tagen gelb.`,
      items: long,
      warnCount: long.filter((i) => i.warn).length,
    },
    { key: 'termin', group: 'Auslieferung und Geld', title: 'Fertig ohne Auslieferungstermin', what: 'In „FZG.- Fertig“, aber ohne Termin Auslieferung.', items: noDate },
    { key: 'verkaufsdaten', group: 'Auslieferung und Geld', title: 'Verkauf ohne Datum oder Art', what: 'Verkauft (ab Disposition), aber „Datum Verkauf“ oder „Art des Geschäftes“ fehlt.', items: soldInfo },
    {
      key: 'abrechnung',
      group: 'Auslieferung und Geld',
      title: 'Abrechnung unvollständig',
      what: 'In Auszahlung/Prüfung oder Buchhaltung, aber Verkaufspreis, EK oder Bankprovision fehlt.',
      items: billing,
    },
    {
      key: 'asana-ordnung',
      group: 'Ordnung in Asana',
      title: 'Ordnung in Asana',
      what: 'Rot: abgehakt, aber noch im Bestand. Gelb: in „Abgeschlossen“, aber nicht abgehakt.',
      items: hygiene,
      warnCount: hygiene.filter((i) => i.warn).length,
    },
  ];
}

/** Rote Fälle einer Prüfung (gelbe zählen nicht). */
export const redCount = (c: CheckResult) => c.items.length - (c.warnCount ?? 0);

/** Morgen-Push an die Admins: nur wenn etwas rot ist. Liefert null, wenn alles sauber läuft. */
export function digestMessage(checks: CheckResult[]): { title: string; body: string } | null {
  const red = checks.filter((c) => !c.unavailable && redCount(c) > 0).sort((a, b) => redCount(b) - redCount(a));
  if (!red.length) return null;
  const lines = red.slice(0, 4).map((c) => `${c.title}: ${redCount(c)}`);
  if (red.length > 4) lines.push(`+ ${red.length - 4} weitere`);
  return {
    title: `Prozessboard: ${red.length} ${red.length === 1 ? 'Prozess' : 'Prozesse'} rot`,
    body: lines.join(' · '),
  };
}
