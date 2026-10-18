const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurFmtCents = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const eur = (n: number) => eurFmt.format(n);
/** Kurz für enge Stellen: ab 1 Mio. „1,99 Mio. €“, sonst wie eur. */
export const eurShort = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio. €` : eur(n);
export const eurCents = (n: number) => eurFmtCents.format(n);

/** Erster Tag des Monats als YYYY-MM-DD, so wie die Datenbank Monate speichert. */
export function monthStart(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Heutiges Datum als YYYY-MM-DD (Ortszeit), wie sold_on gespeichert wird. */
export function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthStart(new Date(y, m - 1 + delta, 1));
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

export function dateLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
