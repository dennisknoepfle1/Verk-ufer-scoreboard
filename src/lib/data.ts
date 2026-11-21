import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { BoardRow, Rates } from './scoring';
import { supabase } from './supabase';
import { groupBadges, type BadgeKey } from './badges';
import type { Delivery } from './deliveries';
import type { AsanaVehicle, Listing } from './mobile-match';
import type { BoardListing, BoardTask, TaskTimes } from './process-checks';
import { financeOf } from './finance';

export type Sale = {
  id: number;
  seller_id: string;
  sold_on: string;
  vehicle: string;
  bank_commission: number;
  winter_wheels_price: number;
  registration_price: number;
  commission: number;
  customer_rating: number | null;
  profiles?: { full_name: string } | null;
};

export type RatesRow = Rates & { id: number; valid_from: string };

// numeric-Spalten kommen als String aus der API.
const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function fetchLeaderboard(month: string): Promise<BoardRow[]> {
  const { data, error } = await supabase.rpc('leaderboard', { p_month: month });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    commission: num(r.commission),
    target_vehicles: r.target_vehicles == null ? null : Number(r.target_vehicles),
  }));
}

export async function fetchLatestSale(): Promise<{ full_name: string; vehicle: string; created_at: string } | null> {
  const { data } = await supabase.rpc('latest_sale');
  return data?.[0] ?? null;
}

export type TeamProgress = { target_vehicles: number | null; vehicles: number };

export async function fetchTeamProgress(month: string): Promise<TeamProgress> {
  const { data, error } = await supabase.rpc('team_progress', { p_month: month });
  if (error) throw error;
  return data?.[0] ?? { target_vehicles: null, vehicles: 0 };
}

export type Rating = { avg: number; count: number };

/** Ø Kundenbewertung je Verkäufer im Monat. */
export async function fetchRatings(month: string): Promise<Record<string, Rating>> {
  const { data, error } = await supabase.rpc('seller_ratings', { p_month: month });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: any) => [r.seller_id, { avg: Number(r.avg_rating), count: r.rating_count }]));
}

export type DisplayView = 'wechsel' | 'liste' | 'rennen';

/** Was die Büro-Anzeige zeigt (vom Admin gewählt). */
export async function fetchDisplayView(): Promise<DisplayView> {
  const { data, error } = await supabase.from('display_settings').select('view').maybeSingle();
  if (error) throw error;
  return (data?.view as DisplayView) ?? 'wechsel';
}

/** Abzeichen je Verkäufer im Monat. */
export async function fetchBadges(month: string): Promise<Record<string, BadgeKey[]>> {
  const { data, error } = await supabase.rpc('seller_badges', { p_month: month });
  if (error) throw error;
  return groupBadges(data ?? []);
}

export type FeedItem = {
  sale_id: number;
  seller_id: string;
  full_name: string;
  vehicle: string;
  created_at: string;
  likes: number;
  liked: boolean;
  comments: { name: string; comment: string; at: string }[];
};

/** Neueste Verkäufe aller Verkäufer mit Lob. */
export async function fetchFeed(limit = 10): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('sales_feed', { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCurrentRates(): Promise<RatesRow | null> {
  const { data, error } = await supabase
    .from('commission_rates')
    .select('*')
    .lte('valid_from', new Date().toISOString())
    .order('valid_from', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    valid_from: data.valid_from,
    base_amount: num(data.base_amount),
    bank_pct: num(data.bank_pct),
    winter_wheels_pct: num(data.winter_wheels_pct),
    registration_pct: num(data.registration_pct),
  };
}

export async function fetchSales(month: string, nextMonth: string): Promise<Sale[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('*, profiles!sales_seller_id_fkey(full_name)')
    .gte('sold_on', month)
    .lt('sold_on', nextMonth)
    .order('sold_on', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    ...s,
    bank_commission: num(s.bank_commission),
    winter_wheels_price: num(s.winter_wheels_price),
    registration_price: num(s.registration_price),
    commission: num(s.commission),
  }));
}

/** Lädt Daten und lädt neu, sobald sich Verkäufe oder Ziele ändern (Live) und spätestens jede Minute. */
/** Abgelaufene Anmeldung (z. B. nach Stunden im Hintergrund)? Dann Token erneuern und noch einmal versuchen. */
function isAuthExpired(e: unknown) {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  return m.includes('jwt') || m.includes('401') || m.includes('unauthorized');
}

/**
 * Kurze Netz- oder Server-Aussetzer (im Safari „Load failed“) sollen beim Nutzer nicht als Fehler ankommen:
 * bis zu drei Neuversuche mit kurzer Pause. Sind schon Daten da, bleiben sie stehen und der nächste Takt lädt neu;
 * ein Fehler erscheint nur, wenn noch gar nichts geladen werden konnte.
 */
export const RETRY_DELAYS_MS = [1_000, 3_000, 6_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(load: () => Promise<T>, delays = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load();
    } catch (e) {
      if (isAuthExpired(e)) {
        await supabase.auth.refreshSession().catch(() => undefined);
      }
      if (attempt >= delays.length) throw e;
      await sleep(delays[attempt]);
    }
  }
}

export function useLive<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(load, deps);

  const run = useCallback(() => {
    withRetry(reload)
      .then((d) => {
        hasData.current = true;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!hasData.current) setError(e?.message ?? 'Laden fehlgeschlagen');
      });
  }, [reload]);

  useEffect(() => {
    run();
    const channel = supabase
      .channel(`live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_goals' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_goals' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_settings' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kudos' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asana_sync' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mobile_sync' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_instructions' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instruction_acks' }, run)
      .subscribe();
    const timer = setInterval(run, 60_000);
    // Zurück aus dem Hintergrund oder wieder Netz: sofort frisch laden statt auf den nächsten Takt zu warten.
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') run();
    };
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    if (web) {
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', run);
      window.addEventListener('pageshow', onVisible);
    }
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
      if (web) {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', run);
        window.removeEventListener('pageshow', onVisible);
      }
    };
  }, [run]);

  return { data, error, reload: run };
}

export type AsanaStatus = { last_attempt_at: string | null; last_success_at: string | null; last_error: string | null; task_count: number };

/** Auslieferungen aus Asana. Darf nie etwas blockieren: bei Fehlern null (Feld wird dann ausgeblendet). */
export async function fetchDeliveries(): Promise<{ rows: Delivery[]; status: AsanaStatus | null } | null> {
  try {
    // Seitenweise: Supabase liefert höchstens 1000 Zeilen je Anfrage, Asana hat mehr Aufgaben.
    const [rows, status] = await Promise.all([
      loadAll<Delivery>((a, b) => supabase.rpc('asana_current').range(a, b)),
      supabase.from('asana_sync').select('last_attempt_at, last_success_at, last_error, task_count').maybeSingle(),
    ]);
    if (status.error) return null;
    return { rows, status: (status.data as AsanaStatus | null) ?? null };
  } catch {
    return null;
  }
}

export async function fetchAsanaProject(): Promise<string> {
  const { data, error } = await supabase.from('asana_settings').select('project_ref').maybeSingle();
  if (error) throw error;
  return data?.project_ref ?? '';
}

export async function saveAsanaProject(ref: string) {
  const { error } = await supabase.from('asana_settings').update({ project_ref: ref.trim() }).eq('id', true);
  if (error) throw error;
}

/** „Jetzt abrufen“: stößt den Abruf sofort an. */
export async function syncAsanaNow() {
  const { error } = await supabase.functions.invoke('asana-sync', { body: {} });
  if (error) throw error;
}

export type BuyerRow = { buyer: string; vehicles: number; rank: number };

/** Einkäufer-Rangliste des laufenden Monats aus Asana. Bei Problemen null (Ansicht wird dann ausgelassen). */
export async function fetchBuyers(): Promise<BuyerRow[] | null> {
  try {
    const { data, error } = await supabase.rpc('buyer_leaderboard');
    if (error) return null;
    return (data ?? []) as BuyerRow[];
  } catch {
    return null;
  }
}

export type CreatorRow = { name: string; vehicles: number };

/** Admin: Wer zählt als Einkäufer, und wer hat diesen Monat sonst noch Aufgaben angelegt. */
export async function fetchBuyerSetup(): Promise<{ buyers: string[]; creators: CreatorRow[] }> {
  const [b, c] = await Promise.all([
    supabase.from('asana_buyers').select('name').order('name'),
    supabase.rpc('asana_creators'),
  ]);
  if (b.error) throw new Error(b.error.message);
  return { buyers: (b.data ?? []).map((r) => r.name as string), creators: (c.data ?? []) as CreatorRow[] };
}

export async function addBuyer(name: string) {
  const { error } = await supabase.from('asana_buyers').insert({ name: name.trim() });
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function removeBuyer(name: string) {
  const { error } = await supabase.from('asana_buyers').delete().eq('name', name);
  if (error) throw new Error(error.message);
}

export type LeadMonth = { month: string; vehicles: number; avg_days: number; median_days: number; max_days: number };
export type LeadOpen = { task_gid: string; name: string; section: string; eingang_at: string; days: number; permalink_url: string | null };

/** Standzeit (Admin): Ø je Monat, Fahrzeuge die gerade stehen, und wie weit der Asana-Verlauf ausgewertet ist. */
export async function fetchLeadTimes() {
  const [months, open, status] = await Promise.all([
    supabase.rpc('lead_time_months'),
    supabase.rpc('lead_time_open'),
    supabase.rpc('lead_time_status').maybeSingle(),
  ]);
  const err = months.error ?? open.error ?? status.error;
  if (err) throw new Error(err.message);
  return {
    months: (months.data ?? []) as LeadMonth[],
    open: (open.data ?? []) as LeadOpen[],
    status: (status.data as { tasks: number; checked: number } | null) ?? { tasks: 0, checked: 0 },
  };
}

/**
 * Ausgelieferte Fahrzeuge (erster Wechsel in Auszahlung/Prüfung bzw. Buchhaltung) in diesem und im Vormonat (Admin).
 * skipped: davon nicht über die Spalte „Auslieferung“, also am Prozess vorbei.
 */
export async function fetchDelivered() {
  const { data, error } = await supabase.rpc('delivered_summary');
  if (error) throw error;
  const rows = (data ?? []) as { month: string; vehicles: number; skipped: number }[];
  return { now: rows[0]?.vehicles ?? 0, nowSkipped: rows[0]?.skipped ?? 0, prev: rows[1]?.vehicles ?? 0, prevSkipped: rows[1]?.skipped ?? 0 };
}

export type SaleToDelivery = { vehicles: number; withDate: number; avgDays: number | null };

/** Standzeit 3: Tage vom Verkauf („Datum Verkauf“ in Asana) bis zur Auslieferung, in diesem und im Vormonat (Admin). */
export async function fetchSaleToDelivery() {
  const { data, error } = await supabase.rpc('sale_to_delivery');
  if (error) throw error;
  const rows = (data ?? []) as { vehicles: number; with_date: number; avg_days: number | string | null }[];
  const of = (r: (typeof rows)[number] | undefined): SaleToDelivery => ({
    vehicles: r?.vehicles ?? 0,
    withDate: r?.with_date ?? 0,
    avgDays: r?.avg_days == null ? null : Number(r.avg_days),
  });
  return { now: of(rows[0]), prev: of(rows[1]) };
}

/** Umsatz, Wareneinsatz und Gewinn der ausgelieferten Fahrzeuge (aus Asana) in diesem und im Vormonat (Admin). */
export async function fetchFinance() {
  const { data, error } = await supabase.rpc('finance_months');
  if (error) throw error;
  const rows = (data ?? []) as Parameters<typeof financeOf>[0][];
  return { now: financeOf(rows[0]), prev: financeOf(rows[1]) };
}

// ---- Prozessboard · mobile.de-Abgleich ----

export type MobileStatus = { last_attempt_at: string | null; last_success_at: string | null; last_error: string | null; listing_count: number };

/** Inserate von mobile.de + Asana-Stand für den Abgleich. Ein Fehler hier betrifft nur diese Kachel. */
export async function fetchMobileCheck() {
  const [listings, status, tasks] = await Promise.all([
    loadAll<Listing>((a, b) => supabase.rpc('mobile_current').range(a, b)),
    supabase.from('mobile_sync').select('last_attempt_at, last_success_at, last_error, listing_count').maybeSingle(),
    loadAll<AsanaVehicle>((a, b) => supabase.rpc('asana_current').range(a, b)),
  ]);
  if (status.error) throw status.error;
  return { listings, status: (status.data as MobileStatus | null) ?? null, tasks };
}

export async function fetchMobileCustomers(): Promise<string> {
  const { data, error } = await supabase.from('mobile_settings').select('customer_numbers').maybeSingle();
  if (error) throw error;
  return data?.customer_numbers ?? '';
}

export async function saveMobileCustomers(value: string) {
  const { error } = await supabase.from('mobile_settings').update({ customer_numbers: value.trim() }).eq('id', true);
  if (error) throw error;
}

/** „Jetzt abrufen“: stößt den mobile.de-Abruf sofort an (liest nur). */
export async function syncMobileNow() {
  const { error } = await supabase.functions.invoke('mobile-sync', { body: {} });
  if (error) throw error;
}

/**
 * Supabase liefert höchstens 1000 Zeilen pro Anfrage. Asana hat schon mehr Aufgaben (~1150),
 * daher seitenweise laden, bis eine Seite nicht mehr voll ist.
 */
async function loadAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; from < 20_000; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < size) break;
  }
  return rows;
}

/** Alles fürs Prozessboard in einem Rutsch. mobile.de darf fehlen (dann sind nur dessen Kacheln grau). */
export async function fetchProcessBoard() {
  const [tasks, times, listings, status] = await Promise.all([
    loadAll<BoardTask>((a, b) => supabase.rpc('asana_current').range(a, b)),
    loadAll<TaskTimes>((a, b) => supabase.from('asana_lead_times').select('task_gid, eingang_at, section_since').order('task_gid').range(a, b)),
    loadAll<BoardListing>((a, b) => supabase.rpc('mobile_current').range(a, b)).catch(() => null),
    supabase.from('mobile_sync').select('last_attempt_at, last_success_at, last_error, listing_count').maybeSingle(),
  ]);
  const mobileStatus = status.error ? null : ((status.data as MobileStatus | null) ?? null);
  return { tasks, times, listings, mobileStatus, mobileReady: listings != null && Boolean(mobileStatus?.last_success_at) };
}
