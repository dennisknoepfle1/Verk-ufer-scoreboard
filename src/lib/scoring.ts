// Reine Rechenlogik ohne Abhängigkeiten, damit sie in App und Tests gleich läuft.
// Die verbindliche Provision rechnet die Datenbank; hier nur die Vorschau im Formular.

export type Rates = {
  base_amount: number;
  bank_pct: number;
  winter_wheels_pct: number;
  registration_pct: number;
};

export type SaleInput = {
  bank_commission: number;
  winter_wheels_price: number;
  registration_price: number;
};

export type BoardRow = {
  seller_id: string;
  full_name: string;
  vehicles: number;
  commission: number;
  target_vehicles: number | null;
  rank: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcCommission(sale: SaleInput, r: Rates): number {
  return round2(
    r.base_amount +
      (sale.bank_commission * r.bank_pct) / 100 +
      (sale.winter_wheels_price * r.winter_wheels_pct) / 100 +
      (sale.registration_price * r.registration_pct) / 100,
  );
}

/** Wie viele Fahrzeuge fehlen bis zum nächstbesseren Platz. null = schon Platz 1. */
export function gapToNextRank(
  rows: BoardRow[],
  sellerId: string,
): { vehiclesNeeded: number; target: BoardRow } | null {
  const me = rows.find((r) => r.seller_id === sellerId);
  if (!me) return null;
  const ahead = rows.filter((r) => r.vehicles > me.vehicles);
  if (ahead.length === 0) return null;
  // Der direkt vor mir ist der mit den wenigsten Fahrzeugen unter denen, die vor mir liegen.
  const target = ahead.reduce((a, b) => (b.vehicles < a.vehicles ? b : a));
  return { vehiclesNeeded: target.vehicles - me.vehicles + 1, target };
}

export function goalProgress(vehicles: number, target: number | null) {
  if (!target || target <= 0) return null;
  return {
    percent: Math.round((vehicles / target) * 100),
    remaining: Math.max(0, target - vehicles),
    reached: vehicles >= target,
  };
}

/** Parst Eingaben wie "1.250,50" oder "1250.5". Leer oder ungültig ergibt 0. */
export function parseEuro(input: string): number {
  const s = input.trim().replace(/\s|€/g, '');
  if (!s) return 0;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export type RaceLane = { seller_id: string; full_name: string; vehicles: number; finish: number; progress: number; finished: boolean; rank: number };

/**
 * Autorennen: Jeder fährt auf sein eigenes Monatsziel zu (Ziellinie = 100 %).
 * Ohne eigenes Ziel gilt das höchste Ziel im Team, sonst der Spitzenwert.
 */
export function raceLanes(rows: BoardRow[]): RaceLane[] {
  const fallback = Math.max(0, ...rows.map((r) => r.target_vehicles ?? 0)) || Math.max(1, ...rows.map((r) => r.vehicles));
  return rows.map((r) => {
    const finish = r.target_vehicles && r.target_vehicles > 0 ? r.target_vehicles : fallback;
    return {
      seller_id: r.seller_id,
      full_name: r.full_name,
      vehicles: r.vehicles,
      finish,
      progress: Math.min(1, r.vehicles / finish),
      finished: r.vehicles >= finish,
      rank: r.rank,
    };
  });
}
