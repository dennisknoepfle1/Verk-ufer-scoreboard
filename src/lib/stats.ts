// Auswertungen für den Admin-Bereich. Reine Funktionen ohne Abhängigkeiten, damit sie testbar sind.

export type StatSale = {
  seller_id: string;
  seller_name: string;
  sold_on: string; // YYYY-MM-DD
  bank_commission: number;
  winter_wheels_price: number;
  registration_price: number;
  commission: number;
  customer_rating?: number | null;
};

export type MonthBucket = { month: string; vehicles: number; commission: number };

export type Summary = {
  vehicles: number;
  winterRate: number | null; // Anteil der Verkäufe mit Winterrädern, 0..1
  registrationRate: number | null; // Anteil der Verkäufe mit Zulassung, 0..1
  financedRate: number | null; // Anteil der Verkäufe mit Bankprovision > 0
  avgBankCommission: number | null; // Ø Bankprovision je Verkauf
  winterRevenue: number; // Summe Verkaufspreise Winterräder
  registrationRevenue: number; // Summe Verkaufspreise Zulassung
  commission: number;
  avgRating: number | null; // Ø Kundenbewertung (1–5) der bewerteten Verkäufe
  ratingCount: number;
};

export type SellerStats = Summary & { seller_id: string; seller_name: string };

const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Die letzten `count` Monate bis einschließlich `lastMonth` (YYYY-MM-01), älteste zuerst, auch leere. */
export function monthlyTrend(sales: StatSale[], lastMonth: string, count = 12): MonthBucket[] {
  const [y, m] = lastMonth.split('-').map(Number);
  const buckets: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    buckets.push({ month: d.toISOString().slice(0, 10), vehicles: 0, commission: 0 });
  }
  const byMonth = new Map(buckets.map((b) => [b.month, b]));
  for (const s of sales) {
    const b = byMonth.get(monthOf(s.sold_on));
    if (b) {
      b.vehicles += 1;
      b.commission += s.commission;
    }
  }
  return buckets;
}

export function summarize(sales: StatSale[]): Summary {
  const n = sales.length;
  const rated = sales.filter((s) => s.customer_rating != null);
  const share = (pred: (s: StatSale) => boolean) => (n ? sales.filter(pred).length / n : null);
  return {
    vehicles: n,
    winterRate: share((s) => s.winter_wheels_price > 0),
    registrationRate: share((s) => s.registration_price > 0),
    financedRate: share((s) => s.bank_commission > 0),
    avgBankCommission: n ? sales.reduce((a, s) => a + s.bank_commission, 0) / n : null,
    winterRevenue: sales.reduce((a, s) => a + s.winter_wheels_price, 0),
    registrationRevenue: sales.reduce((a, s) => a + s.registration_price, 0),
    commission: sales.reduce((a, s) => a + s.commission, 0),
    avgRating: rated.length ? rated.reduce((a, s) => a + (s.customer_rating ?? 0), 0) / rated.length : null,
    ratingCount: rated.length,
  };
}

/** Kennzahlen je Verkäufer, sortiert nach Fahrzeugen. */
export function perSeller(sales: StatSale[]): SellerStats[] {
  const groups = new Map<string, StatSale[]>();
  for (const s of sales) groups.set(s.seller_id, [...(groups.get(s.seller_id) ?? []), s]);
  return [...groups.entries()]
    .map(([seller_id, list]) => ({ seller_id, seller_name: list[0].seller_name, ...summarize(list) }))
    .sort((a, b) => b.vehicles - a.vehicles || b.commission - a.commission || a.seller_name.localeCompare(b.seller_name));
}

export const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)} %`);

export const stars = (avg: number | null) => (avg == null ? '–' : `★ ${avg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);
