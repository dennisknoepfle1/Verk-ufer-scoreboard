// Reine Hilfsfunktionen für den Asana-Abruf (ohne Netz, damit testbar).

export type Stage = 'fertig' | 'auslieferung' | 'ausgeliefert' | 'sonstige';

/** Projekt-ID aus einem Asana-Link oder einer reinen Zahl lesen. */
export function projectGid(ref: string): string | null {
  const s = ref.trim();
  if (/^\d{6,}$/.test(s)) return s;
  const project = s.match(/\/project\/(\d{6,})/); // neues Format: /1/<workspace>/project/<id>/...
  if (project) return project[1];
  const old = s.match(/app\.asana\.com\/0\/(\d{6,})/); // altes Format: /0/<id>/list
  return old ? old[1] : null;
}

/** Board-Spalte -> Stand. „Auszahlung/Prüfung“ gilt als ausgeliefert, „FZG.- Fertig“ als fertig. */
export function stageOf(section: string): Stage {
  const n = section.toLowerCase();
  if (n.includes('auszahlung') || n.includes('prüfung') || n.includes('pruefung')) return 'ausgeliefert';
  if (n.includes('fertig')) return 'fertig';
  if (n.includes('auslieferung')) return 'auslieferung';
  return 'sonstige';
}

type AsanaTask = {
  gid: string;
  name?: string;
  due_on?: string | null;
  due_at?: string | null;
  permalink_url?: string;
  memberships?: { project?: { gid?: string }; section?: { name?: string } }[];
  created_at?: string;
  created_by?: { name?: string } | null;
  completed?: boolean;
  custom_fields?: {
    name?: string;
    type?: string;
    date_value?: { date?: string | null; date_time?: string | null } | null;
    number_value?: number | null;
    enum_value?: { name?: string } | null;
  }[];
};

/** Auslieferungstag: Feld „Termin Auslieferung“, sonst das Fälligkeitsdatum der Aufgabe. */
export function deliveryDate(t: AsanaTask): string | null {
  const f = t.custom_fields?.find((c) => c.type === 'date' && (c.name ?? '').toLowerCase().includes('auslieferung'));
  const v = f?.date_value?.date ?? f?.date_value?.date_time ?? null;
  if (v) return v.slice(0, 10);
  return t.due_on ?? (t.due_at ? t.due_at.slice(0, 10) : null);
}

const field = (t: AsanaTask, test: (name: string) => boolean) =>
  t.custom_fields?.find((c) => test((c.name ?? '').trim().toLowerCase()));

/** Betrag in Euro: Zahlenfeld „Verkaufspreis“. */
export function amountOf(t: AsanaTask): number | null {
  const v = field(t, (n) => n.startsWith('verkaufspreis'))?.number_value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const numberField = (t: AsanaTask, test: (name: string) => boolean) => {
  const v = t.custom_fields?.find((c) => c.type === 'number' && test((c.name ?? '').trim().toLowerCase()))?.number_value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Einkaufspreis: Zahlenfeld „Auszahlung VB / EK“ (nicht das Auswahlfeld „Auszahlung Vorbesitzer festgelegt“). */
export function purchaseOf(t: AsanaTask): number | null {
  return numberField(t, (n) => n.startsWith('auszahlung vb') || (n.startsWith('auszahlung') && /\bek\b/.test(n)));
}

/** Bankprovision des Geschäfts: Zahlenfeld „Bankprovision gesamt“. */
export function bankCommissionOf(t: AsanaTask): number | null {
  return numberField(t, (n) => n.startsWith('bankprovision'));
}

/** Verkaufstag: Datumsfeld „Datum Verkauf“ (Start der Standzeit 3 bis zur Auslieferung). */
export function soldOnOf(t: AsanaTask): string | null {
  const f = t.custom_fields?.find((c) => c.type === 'date' && (c.name ?? '').trim().toLowerCase().startsWith('datum verkauf'));
  const v = f?.date_value?.date ?? f?.date_value?.date_time ?? null;
  return v ? v.slice(0, 10) : null;
}

/** Ankaufsart: Feld „Art des Geschäftes“ (Direkter Ankauf, Vermittlung, Inzahlungnahme). */
export function dealTypeOf(t: AsanaTask): string | null {
  return field(t, (n) => n.startsWith('art des gesch'))?.enum_value?.name?.trim() || null;
}

export function toRow(t: AsanaTask, gid: string) {
  const m = t.memberships?.find((x) => x.project?.gid === gid) ?? t.memberships?.[0];
  const section = m?.section?.name ?? '';
  return {
    task_gid: t.gid,
    name: (t.name ?? '').trim(),
    section,
    stage: stageOf(section),
    due_on: deliveryDate(t),
    permalink_url: t.permalink_url ?? null,
    created_at: t.created_at ?? null,
    created_by: t.created_by?.name?.trim() || null,
    completed: t.completed === true,
    amount: amountOf(t),
    purchase_price: purchaseOf(t),
    bank_commission: bankCommissionOf(t),
    sold_on: soldOnOf(t),
    deal_type: dealTypeOf(t),
  };
}

/** Erledigte Aufgaben der letzten 13 Monate mitholen (Standzeit je Monat, Einkäufer). */
export function historyStartIso(now: Date): string {
  return new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00.000Z';
}

/** Monatsanfang (deutsche Zeit, großzügig: 2 Tage früher, damit nichts am Rand fehlt) für completed_since. */
export function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 2 * 86_400_000).toISOString();
}

// ---- Standzeit: vom Eingang (Spalte „FZG.-Administration“) bis ausgeliefert ----

type Story = { created_at?: string; resource_subtype?: string; new_section?: { name?: string } | null; old_section?: { name?: string } | null };

const isEingang = (section: string) => section.toLowerCase().includes('administration');
const isAuslieferung = (section: string) => /^\s*auslieferung\s*$/i.test(section);
/** Ausgeliefert = in „Auszahlung/ Prüfung“ (oder, falls übersprungen, „Buchhaltung“ / „Abgeschlossen“). */
export const isAusgeliefert = (section: string) => /auszahlung|prüfung|pruefung|buchhaltung|abgeschlossen/i.test(section);

/**
 * Erster Eingang und erste Auslieferung danach aus dem Verlauf einer Aufgabe (Spaltenwechsel) für die Standzeit.
 * delivered_at (für „ausgeliefert im Monat“, Wunsch Dennis): erster Wechsel in Auszahlung/Prüfung (sonst Buchhaltung/
 * Abgeschlossen), auch ohne Eingang über die Administration. delivered_from: aus welcher Spalte (für die Zählung:
 * Auslieferung, sonst Fertig/Werkstatt; direkt aus dem Bestand ist keine Auslieferung, z. B. Händlerverkauf).
 * Fehlklicks zählen nicht: Wird das Fahrzeug innerhalb von 10 Minuten wieder aus der Endspalte zurückgeschoben, gilt
 * dieser Wechsel nicht. delivered_skip: nicht aus „Auslieferung“ gekommen.
 */
export function leadTimeOf(stories: Story[]): { eingang_at: string | null; ausgeliefert_at: string | null; delivered_at: string | null; delivered_from: string | null; delivered_skip: boolean; delivered_checked: true } {
  const moves = stories
    .filter((s) => s.resource_subtype === 'section_changed' && s.created_at && s.new_section?.name)
    .sort((a, b) => a.created_at!.localeCompare(b.created_at!));
  let delivered_at: string | null = null;
  let delivered_from: string | null = null;
  let current = '';
  for (let i = 0; i < moves.length; i++) {
    const s = moves[i];
    const from = s.old_section?.name ?? current;
    current = s.new_section!.name!;
    if (isAusgeliefert(from) || !isAusgeliefert(current)) continue;
    const next = moves[i + 1];
    const misclick = next && !isAusgeliefert(next.new_section!.name!) && Date.parse(next.created_at!) - Date.parse(s.created_at!) < 10 * 60_000;
    if (misclick) continue;
    delivered_at = s.created_at!;
    delivered_from = from || null;
    break;
  }
  const delivered_skip = delivered_at != null && !isAuslieferung(delivered_from ?? '');
  const eingang = moves.find((s) => isEingang(s.new_section!.name!));
  if (!eingang) return { eingang_at: null, ausgeliefert_at: null, delivered_at, delivered_from, delivered_skip, delivered_checked: true };
  const raus = moves.find((s) => s.created_at! > eingang.created_at! && isAusgeliefert(s.new_section!.name!));
  return { eingang_at: eingang.created_at!, ausgeliefert_at: raus?.created_at ?? null, delivered_at, delivered_from, delivered_skip, delivered_checked: true };
}

/**
 * Verlauf neu lesen? Wenn noch nie gelesen, noch ohne Auslieferdatum ausgewertet (delivered_checked, einmalig nachholen)
 * oder die Spalte sich seitdem geändert hat (und noch nicht ausgeliefert).
 */
export function needsLeadTime(
  row: { section: string },
  known: { section_seen: string; ausgeliefert_at: string | null; delivered_checked?: boolean } | undefined,
) {
  if (!known) return true;
  if (known.delivered_checked === false) return true;
  if (known.ausgeliefert_at) return false;
  return known.section_seen !== row.section;
}
