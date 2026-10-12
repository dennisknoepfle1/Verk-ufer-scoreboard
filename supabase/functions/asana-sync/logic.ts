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

/** Board-Spalte -> Stand. „Auszahlung/Prüfung“ gilt als ausgeliefert. */
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
};

export function toRow(t: AsanaTask, gid: string) {
  const m = t.memberships?.find((x) => x.project?.gid === gid) ?? t.memberships?.[0];
  const section = m?.section?.name ?? '';
  return {
    task_gid: t.gid,
    name: (t.name ?? '').trim(),
    section,
    stage: stageOf(section),
    due_on: t.due_on ?? (t.due_at ? t.due_at.slice(0, 10) : null),
    permalink_url: t.permalink_url ?? null,
  };
}
