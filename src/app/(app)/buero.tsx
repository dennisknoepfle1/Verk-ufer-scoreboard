import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Celebration, type CelebrationInfo } from '@/components/Celebration';
import { Race } from '@/components/Race';
import { Logo } from '@/components/ui';
import { fetchDisplayView, fetchQuotes, fetchLatestSale, fetchLeaderboard, fetchRatings, fetchTeamProgress, useLive } from '@/lib/data';
import { eur, monthLabel, monthStart } from '@/lib/format';
import { quoteOfDay } from '@/lib/quote';
import { raceLanes } from '@/lib/scoring';
import { stars } from '@/lib/stats';

// Dunkle Anzeige im Prusseit-Look: Schwarz, Anthrazit und Prusseit-Rot.
const tv = { bg: '#141414', row: '#222223', fg: '#f5f5f5', muted: '#9a9ea3', accent: '#e30614', track: '#38393b', good: '#5cc98f', gold: '#f2c94c' };
const podium = ['#f2c94c', '#c9d3dd', '#e39a6c'];
const ROTATE_MS = 30_000;

/** Vollbild-Rangliste für den Bildschirm im Büro. Aktualisiert sich selbst. */
export default function Buero() {
  const [month, setMonth] = useState(monthStart());
  const { width } = useWindowDimensions();
  const s = Math.max(0.6, Math.min(2, width / 1280)); // skaliert mit der Bildschirmbreite

  // Beim Monatswechsel automatisch auf den neuen Monat umschalten.
  useEffect(() => {
    const t = setInterval(() => setMonth(monthStart()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data, reload } = useLive(async () => {
    const [rows, latest, team, ratings, setting, quotes] = await Promise.all([
      fetchLeaderboard(month),
      fetchLatestSale(),
      fetchTeamProgress(month),
      fetchRatings(month),
      fetchDisplayView().catch(() => 'wechsel' as const),
      fetchQuotes().catch(() => []),
    ]);
    return { rows, latest, team, ratings, setting, quotes };
  }, [month]);

  // Zusätzlich alle 10 Sekunden nachsehen, damit der Jubel auch ohne Live-Verbindung zeitnah kommt.
  useEffect(() => {
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [reload]);

  // Jubel, sobald ein neuer Verkauf auftaucht (nicht beim ersten Laden). /buero?probe=1 zeigt eine Vorschau.
  const { probe, ansicht } = useLocalSearchParams<{ probe?: string; ansicht?: string }>();

  // Der Admin wählt unter Büro-Anzeige: nur Rangliste, nur Rennen oder Wechsel alle 30 Sekunden.
  // /buero?ansicht=rennen oder =liste hält eine Ansicht auf diesem Bildschirm fest.
  const setting = data?.setting ?? 'wechsel';
  const pinned = ansicht === 'rennen' || ansicht === 'liste' ? ansicht : setting === 'wechsel' ? null : setting;
  const [view, setView] = useState<'liste' | 'rennen'>(pinned ?? 'liste');
  useEffect(() => {
    if (pinned) return setView(pinned);
    const t = setInterval(() => setView((v) => (v === 'liste' ? 'rennen' : 'liste')), ROTATE_MS);
    return () => clearInterval(t);
  }, [pinned]);
  const [party, setParty] = useState<CelebrationInfo | null>(
    probe ? { key: 'probe', name: 'Max Mustermann', vehicle: 'VW Golf 8 Life' } : null,
  );
  const lastSeen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    const latest = data.latest;
    const stamp = latest?.created_at ?? null;
    if (lastSeen.current !== undefined && stamp && stamp !== lastSeen.current && latest) {
      setParty({ key: stamp, name: latest.full_name, vehicle: latest.vehicle });
    }
    lastSeen.current = stamp;
  }, [data]);
  const endParty = useCallback(() => setParty(null), []);

  const rows = data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.vehicles));
  const team = data?.team;
  const teamTarget = team?.target_vehicles ?? 0;
  const teamPct = teamTarget > 0 ? Math.round(((team?.vehicles ?? 0) / teamTarget) * 100) : 0;
  const ratings = data?.ratings ?? {};
  const quote = quoteOfDay(data?.quotes ?? []);

  return (
    <View style={[styles.root, { padding: 32 * s, gap: 14 * s }]}>
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * s }}>
          <View style={[styles.logoPlate, { padding: 8 * s }]}>
            <Logo height={52 * s} />
          </View>
          <Text style={[styles.title, { fontSize: 44 * s }]}>{view === 'rennen' ? 'MONATS-RENNEN' : 'VERKÄUFER-RANGLISTE'}</Text>
        </View>
        <Text style={[styles.muted, { fontSize: 20 * s }]}>
          {view === 'rennen' ? 'Ziellinie = Monatsziel · ' : ''}
          {monthLabel(month)}
        </Text>
      </View>
      {teamTarget > 0 && (
        <View style={[styles.team, { paddingVertical: 12 * s, paddingHorizontal: 18 * s, gap: 20 * s }]}>
          <Text style={[styles.teamLabel, { fontSize: 24 * s }]}>TEAMZIEL</Text>
          <View style={[styles.teamTrack, { flex: 1, height: 22 * s }]}>
            <View style={[styles.teamFill, { width: `${Math.min(100, teamPct)}%` }]} />
          </View>
          <Text style={[styles.cell, { fontSize: 30 * s }]}>
            {team?.vehicles ?? 0}
            <Text style={{ color: '#ffffffb3' }}> / {teamTarget} Fahrzeuge</Text>
            {teamPct >= 100 ? <Text> ✓</Text> : null}
          </Text>
        </View>
      )}
      {quote && (
        <View style={[styles.quote, { gap: 4 * s, paddingLeft: 16 * s, borderLeftWidth: 6 * s }]}>
          <Text style={[styles.quoteLabel, { fontSize: 15 * s }]}>SPRUCH DES TAGES</Text>
          <Text style={[styles.quoteText, { fontSize: 26 * s }]} numberOfLines={2}>
            „{quote.text}“
          </Text>
        </View>
      )}
      {view === 'rennen' ? (
        <Race lanes={raceLanes(rows)} scale={s} />
      ) : (
      <View style={{ flex: 1, gap: 8 * s }}>
        {rows.map((r) => {
          const reached = r.target_vehicles != null && r.target_vehicles > 0 && r.vehicles >= r.target_vehicles;
          return (
            <View key={r.seller_id} style={[styles.row, { paddingVertical: 10 * s, paddingHorizontal: 16 * s, gap: 20 * s }]}>
              <Text style={[styles.cell, { width: 56 * s, fontSize: 32 * s, color: podium[r.rank - 1] ?? tv.fg, textAlign: 'center' }]}>{r.rank}</Text>
              <Text style={[styles.cell, { flex: 1.1, fontSize: 30 * s }]} numberOfLines={1}>{r.full_name}</Text>
              <View style={[styles.track, { flex: 1.8, height: 14 * s }]}>
                <View style={[styles.fill, { width: `${(r.vehicles / max) * 100}%` }]} />
              </View>
              <Text style={[styles.cell, { width: 140 * s, fontSize: 30 * s, textAlign: 'right' }]}>
                {r.vehicles}
                {r.target_vehicles ? <Text style={{ color: tv.muted }}>/{r.target_vehicles}</Text> : null}
                {reached ? <Text style={{ color: tv.good }}> ✓</Text> : null}
              </Text>
              <Text style={[styles.cell, { width: 100 * s, fontSize: 26 * s, textAlign: 'right', color: ratings[r.seller_id] ? tv.gold : tv.track }]}>
                {stars(ratings[r.seller_id]?.avg ?? null)}
              </Text>
              <Text style={[styles.cell, styles.muted, { width: 150 * s, fontSize: 26 * s, textAlign: 'right' }]}>{eur(r.commission)}</Text>
            </View>
          );
        })}
      </View>
      )}
      <Text style={[styles.muted, styles.foot, { fontSize: 20 * s, paddingTop: 10 * s }]} numberOfLines={1}>
        {data?.latest ? (
          <>
            Letzter Verkauf: <Text style={{ color: tv.accent }}>{data.latest.full_name}</Text> · {data.latest.vehicle}
          </>
        ) : (
          'Noch keine Verkäufe'
        )}
      </Text>
      {party && <Celebration info={party} onDone={endParty} scale={s} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tv.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottomWidth: 4, borderColor: tv.accent, paddingBottom: 14 },
  logoPlate: { backgroundColor: '#fff', borderRadius: 6 },
  title: { color: tv.fg, fontWeight: '800', letterSpacing: 1.5 },
  muted: { color: tv.muted },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: tv.row, borderRadius: 8 },
  cell: { color: tv.fg, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { backgroundColor: tv.track, borderRadius: 7, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: tv.accent, borderRadius: 7 },
  team: { flexDirection: 'row', alignItems: 'center', backgroundColor: tv.accent, borderRadius: 8 },
  teamLabel: { color: '#fff', fontWeight: '800', letterSpacing: 2 },
  teamTrack: { backgroundColor: '#00000040', borderRadius: 11, overflow: 'hidden' },
  teamFill: { height: '100%', backgroundColor: '#fff', borderRadius: 11 },
  quote: { borderColor: tv.accent },
  quoteLabel: { color: tv.accent, fontWeight: '800', letterSpacing: 2 },
  quoteText: { flex: 1, color: tv.fg, fontWeight: '600', fontStyle: 'italic' },
  foot: { borderTopWidth: 1, borderColor: tv.track },
});
