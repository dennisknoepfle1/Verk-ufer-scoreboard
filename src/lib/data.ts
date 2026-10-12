import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { BoardRow, Rates } from './scoring';
import { supabase } from './supabase';
import { groupBadges, type BadgeKey } from './badges';
import type { Delivery } from './deliveries';

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

export function useLive<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(load, deps);

  const run = useCallback(() => {
    reload()
      .catch(async (e) => {
        if (!isAuthExpired(e)) throw e;
        await supabase.auth.refreshSession();
        return reload();
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? 'Laden fehlgeschlagen'));
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
    const [rows, status] = await Promise.all([
      supabase.rpc('asana_current'),
      supabase.from('asana_sync').select('last_attempt_at, last_success_at, last_error, task_count').maybeSingle(),
    ]);
    if (rows.error || status.error) return null;
    return { rows: (rows.data ?? []) as Delivery[], status: (status.data as AsanaStatus | null) ?? null };
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
