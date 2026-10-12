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
};

/** Reihenfolge: zuerst die Spalte, aus der das Geld als Nächstes kommt. */
export const PIPELINE: { stage: Exclude<Stage, 'sonstige'>; label: string; short: string }[] = [
  { stage: 'ausgeliefert', label: 'Auszahlung / Prüfung', short: 'Auszahlung/Prüfung' },
  { stage: 'auslieferung', label: 'Auslieferung', short: 'Auslieferung' },
  { stage: 'fertig', label: 'Fahrzeug fertig', short: 'Fertig' },
];

export type PipelineSummary = {
  vehicles: Delivery[];
  counts: { stage: Exclude<Stage, 'sonstige'>; label: string; short: string; count: number }[];
  total: number;
};

export function inPipeline(d: Delivery) {
  return d.stage !== 'sonstige';
}

export function pipelineSummary(rows: Delivery[]): PipelineSummary {
  const vehicles = rows.filter(inPipeline);
  const rank = (s: Stage) => PIPELINE.findIndex((p) => p.stage === s);
  vehicles.sort((a, b) => rank(a.stage) - rank(b.stage) || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.name.localeCompare(b.name));
  const counts = PIPELINE.map((p) => ({ ...p, count: vehicles.filter((v) => v.stage === p.stage).length }));
  return { vehicles, counts, total: vehicles.length };
}

/** „14.10.“ */
export function shortDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}
