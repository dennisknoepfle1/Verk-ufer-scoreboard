// Reine Hilfsfunktionen für den mobile.de-Abruf (ohne Netz, damit testbar).
// mobile.de wird NUR gelesen: ausschließlich GET-Anfragen, nie etwas ändern (Dennis, 21.11.2026).

export const MOBILE_BASE = 'https://services.mobile.de';
export const ACCEPT = 'application/vnd.de.mobile.api+json';

type Text = string | { localized?: string; localizedDescription?: string; description?: string; value?: string; key?: string } | null | undefined;

const text = (v: Text): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v.localized ?? v.localizedDescription ?? v.description ?? v.value ?? v.key ?? '').trim();
};

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

type Ad = {
  mobileAdId?: string | number;
  id?: string | number;
  adKey?: string | number;
  key?: string | number;
  vin?: string | null;
  internalNumber?: string | number | null;
  make?: Text;
  model?: Text;
  modelDescription?: Text;
  detailPageUrl?: string | null;
  price?: { consumerPriceGross?: unknown; gross?: unknown; amount?: unknown; consumerPrice?: { amount?: unknown } } | null;
};

export type ListingRow = {
  ad_id: string;
  vin: string | null;
  internal_number: string | null;
  title: string;
  price: number | null;
  url: string | null;
};

/** Ein Inserat aus Seller-API oder Such-API in eine Zeile umwandeln (beide nutzen fast dieselben Felder). */
export function toListing(ad: Ad): ListingRow | null {
  const id = ad.mobileAdId ?? ad.adKey ?? ad.id ?? ad.key;
  if (id == null || id === '') return null;
  const ad_id = String(id);
  const vin = (ad.vin ?? '').toString().trim().toUpperCase() || null;
  const internal = ad.internalNumber == null ? '' : String(ad.internalNumber).trim();
  const title = [text(ad.make), text(ad.modelDescription) || text(ad.model)].filter(Boolean).join(' ') || 'Fahrzeug';
  const p = ad.price;
  const price = num(p?.consumerPriceGross) ?? num(p?.gross) ?? num(p?.consumerPrice?.amount) ?? num(p?.amount);
  return {
    ad_id,
    vin,
    internal_number: internal || null,
    title,
    price,
    url: ad.detailPageUrl || `https://suchen.mobile.de/fahrzeuge/details.html?id=${encodeURIComponent(ad_id)}`,
  };
}

/** Liste der Inserate aus einer Antwort lesen (Feld „ads“ oder direkt ein Array). */
export function adsOf(body: unknown): Ad[] {
  if (Array.isArray(body)) return body as Ad[];
  const b = body as { ads?: unknown; ad?: unknown } | null;
  if (Array.isArray(b?.ads)) return b!.ads as Ad[];
  if (Array.isArray(b?.ad)) return b!.ad as Ad[];
  return [];
}

/** Kundennummern aus der Admin-Eingabe („123456, 654321“). */
export function customerNumbers(ref: string): string[] {
  return [...new Set((ref.match(/\d{3,}/g) ?? []))];
}

/** Basic-Auth-Kopfzeile für die mobile.de-Schnittstellen. */
export function basicAuth(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  return 'Basic ' + btoa(String.fromCharCode(...bytes));
}

/** Nur lesende Adressen sind erlaubt: Schutz gegen versehentliche Änderungen. */
export function assertReadOnly(path: string, method = 'GET') {
  if (method !== 'GET') throw new Error('mobile.de darf nur gelesen werden');
  if (!/^\/(search-api|seller-api)\//.test(path)) throw new Error(`Unerwartete mobile.de-Adresse: ${path}`);
}
