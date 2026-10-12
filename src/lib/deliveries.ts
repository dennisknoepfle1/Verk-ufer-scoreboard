// Auslieferungen aus Asana: Übersicht der nächsten 7 Tage.
// Anstehend = Spalte „Fahrzeug fertig“ oder „Auslieferung“. „Auszahlung/Prüfung“ gilt als ausgeliefert.
// Ohne Datum oder später als 7 Tage: „Später / ohne Datum“.

export type Delivery = {
  task_gid: string;
  name: string;
  section: string;
  stage: 'fertig' | 'auslieferung' | 'ausgeliefert' | 'sonstige';
  due_on: string | null;
  permalink_url: string | null;
};

export type DeliveryDay = { date: string; label: string; count: number };
export type DeliverySummary = {
  pending: Delivery[];
  overdue: number;
  days: DeliveryDay[];
  next7: number;
  later: number;
};

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Datum als JJJJ-MM-TT in Ortszeit. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isPending(d: Delivery) {
  return d.stage === 'fertig' || d.stage === 'auslieferung';
}

export function deliverySummary(rows: Delivery[], now = new Date()): DeliverySummary {
  const pending = rows.filter(isPending);
  const today = isoDay(now);
  const days: DeliveryDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const date = isoDay(d);
    days.push({ date, label: i === 0 ? 'Heute' : i === 1 ? 'Morgen' : WEEKDAYS[d.getDay()], count: 0 });
  }
  const last = days[days.length - 1].date;
  let overdue = 0;
  let later = 0;
  for (const r of pending) {
    if (!r.due_on || r.due_on > last) later++;
    else if (r.due_on < today) overdue++;
    else days.find((d) => d.date === r.due_on)!.count++;
  }
  return { pending, overdue, days, next7: days.reduce((a, d) => a + d.count, 0), later };
}

/** „14.10.“ */
export function shortDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}
