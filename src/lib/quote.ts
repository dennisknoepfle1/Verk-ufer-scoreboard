// Spruch des Tages: jeden Tag der nächste aus der Sammlung, für alle Bildschirme gleich.

export type Quote = { id: number; text: string };

/** Tage seit 1.1.1970 nach Ortszeit, damit der Spruch um Mitternacht wechselt. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function quoteOfDay(quotes: Quote[], date = new Date()): Quote | null {
  if (quotes.length === 0) return null;
  const sorted = [...quotes].sort((a, b) => a.id - b.id);
  return sorted[dayNumber(date) % sorted.length];
}
