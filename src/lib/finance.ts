// Ergebnis der im Monat ausgelieferten Fahrzeuge (Dashboard). Reine Rechnung, damit testbar.

/** Monatliche Fixkosten, die vom Ergebnis abgezogen werden (Vorgabe Dennis 2026-10-18). */
export const MONTHLY_FIXED_COSTS = 500_000;

export type FinanceMonth = {
  vehicles: number;
  sale: number; // Summe Verkaufspreise
  bank: number; // Summe Bankprovision
  purchase: number; // Summe Auszahlung VB / EK (Wareneinsatz)
  revenue: number; // Umsatz = Verkaufspreis + Bankprovision
  profit: number; // Gewinn = Umsatz − Wareneinsatz − Fixkosten
  missingSale: number;
  missingPurchase: number;
  missingBank: number;
};

export function financeOf(r: { vehicles: number; sale_total: number | string; bank_total: number | string; purchase_total: number | string; missing_sale: number; missing_purchase: number; missing_bank: number } | undefined): FinanceMonth {
  const sale = Number(r?.sale_total ?? 0);
  const bank = Number(r?.bank_total ?? 0);
  const purchase = Number(r?.purchase_total ?? 0);
  const revenue = sale + bank;
  return {
    vehicles: r?.vehicles ?? 0,
    sale,
    bank,
    purchase,
    revenue,
    profit: revenue - purchase - MONTHLY_FIXED_COSTS,
    missingSale: r?.missing_sale ?? 0,
    missingPurchase: r?.missing_purchase ?? 0,
    missingBank: r?.missing_bank ?? 0,
  };
}
