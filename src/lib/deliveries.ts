// Cashflow aus Asana: Fahrzeuge, für die Geld kommt.
// Zählt die drei Board-Spalten „Fahrzeug fertig“, „Auslieferung“ und „Auszahlung/Prüfung“.
// Je weiter rechts, desto näher ist das Geld: „Auszahlung/Prüfung“ kommt als Nächstes.

export type Stage = 'fertig' | 'auslieferung' | 'ausgeliefert' | 'sonstige';

export type Delivery = {
  task_gid: string;
  name: string;
  section: string;
  stage: Stage;
  due_on: string | null;
  permalink_url: string | null;
  completed?: boolean;
  created_at?: string | null;
  created_by?: string | null;
  amount?: number | null; // Asana-Feld „Verkaufspreis“ in Euro
  deal_type?: string | null; // Asana-Feld „Art des Geschäftes“
};

/** Nur eigene Fahrzeuge (direkter Ankauf, Inzahlungnahme) bringen Cashflow, Vermittlungen nicht. */
export function isDirect(d: Delivery) {
  const t = (d.deal_type ?? '').trim().toLowerCase();
  return t.startsWith('direkt') || t.startsWith('inzahlung');
}

/** Was in Asana fehlt, damit der Euro-Betrag stimmt (null = alles da). */
export function missingInfo(d: Delivery): string | null {
  if (!d.deal_type) return 'Art des Geschäftes fehlt';
  if (isDirect(d) && d.amount == null) return 'Verkaufspreis fehlt';
  return null;
}

/** Reihenfolge: zuerst die Spalte, aus der das Geld als Nächstes kommt. */
export const PIPELINE: { stage: Exclude<Stage, 'sonstige'>; label: string; short: string }[] = [
  { stage: 'ausgeliefert', label: 'Auszahlung / Prüfung', short: 'Auszahlung/Prüfung' },
  { stage: 'auslieferung', label: 'Auslieferung', short: 'Auslieferung' },
  { stage: 'fertig', label: 'Fahrzeug fertig', short: 'Fertig' },
];

export type PipelineSummary = {
  vehicles: Delivery[];
  counts: { stage: Exclude<Stage, 'sonstige'>; label: string; short: string; count: number; euro: number }[];
  total: number;
  /** Summe Verkaufspreis aller eigenen Fahrzeuge (direkter Ankauf, Inzahlungnahme). */
  euro: number;
  /** Fahrzeuge, bei denen Ankaufsart oder Betrag in Asana fehlt. */
  missing: number;
};

const euroOf = (list: Delivery[]) => list.reduce((a, v) => a + (isDirect(v) && v.amount != null ? Number(v.amount) : 0), 0);

/** Erledigte Aufgaben (in Asana abgehakt) sind durch, für den Cashflow zählen nur offene. */
export function inPipeline(d: Delivery) {
  return d.stage !== 'sonstige' && !d.completed;
}

export function pipelineSummary(rows: Delivery[]): PipelineSummary {
  const vehicles = rows.filter(inPipeline);
  const rank = (s: Stage) => PIPELINE.findIndex((p) => p.stage === s);
  vehicles.sort((a, b) => rank(a.stage) - rank(b.stage) || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.name.localeCompare(b.name));
  const counts = PIPELINE.map((p) => {
    const inStage = vehicles.filter((v) => v.stage === p.stage);
    return { ...p, count: inStage.length, euro: euroOf(inStage) };
  });
  return { vehicles, counts, total: vehicles.length, euro: euroOf(vehicles), missing: vehicles.filter((v) => missingInfo(v)).length };
}

/** „14.10.“ */
export function shortDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

/** Stationen auf dem Asana-Board, in Reihenfolge von Beschaffung bis Auszahlung. */
export const STATIONS: { key: string; label: string; match: RegExp }[] = [
  { key: 'beschaffung', label: 'Beschaffung', match: /beschaffung/i },
  { key: 'logistik', label: 'Logistik', match: /logistik/i },
  { key: 'administration', label: 'Administration', match: /administration/i },
  { key: 'anlage', label: 'Anlage', match: /anlage/i },
  { key: 'bestand', label: 'Bestand', match: /verkauf|bestand/i },
  { key: 'werkstatt', label: 'Werkstatt', match: /disposition|werkstatt/i },
  { key: 'fertig', label: 'Fertig', match: /fertig/i },
  { key: 'auslieferung', label: 'Auslieferung', match: /auslieferung/i },
  { key: 'auszahlung', label: 'Auszahlung', match: /auszahlung|prüfung|pruefung/i },
];

/** Offene Fahrzeuge je Station (erledigte und andere Spalten wie Stornos, Buchhaltung zählen nicht). */
export function stationCounts(rows: Delivery[]) {
  return STATIONS.map((st) => ({ key: st.key, label: st.label, count: rows.filter((r) => !r.completed && st.match.test(r.section)).length }));
}
