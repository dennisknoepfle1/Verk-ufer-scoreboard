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
    deal_type: dealTypeOf(t),
  };
}

/** Monatsanfang (deutsche Zeit, großzügig: 2 Tage früher, damit nichts am Rand fehlt) für completed_since. */
export function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 2 * 86_400_000).toISOString();
}
