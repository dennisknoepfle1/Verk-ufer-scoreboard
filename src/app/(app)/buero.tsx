import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { Celebration, type CelebrationInfo } from '@/components/Celebration';
import { Race } from '@/components/Race';
import { Logo, ui } from '@/components/ui';
import { badgeIcons, type BadgeKey } from '@/lib/badges';
import { pipelineSummary } from '@/lib/deliveries';
import { fetchBadges, fetchBuyers, fetchDeliveries, fetchDisplayView, fetchFeed, fetchLatestSale, fetchLeaderboard, fetchRatings, fetchTeamProgress, useLive } from '@/lib/data';
import { eur, monthLabel, monthStart } from '@/lib/format';
import { raceLanes } from '@/lib/scoring';
import { stars } from '@/lib/stats';
import { useAutoUpdate } from '@/lib/auto-update';

// Dunkle Anzeige im Prusseit-Look: Schwarz, Anthrazit und Prusseit-Rot.
const tv = { bg: '#141414', row: '#222223', fg: '#f5f5f5', muted: '#9a9ea3', accent: '#e30614', track: '#38393b', good: '#5cc98f', gold: '#f2c94c' };
const podium = ['#f2c94c', '#c9d3dd', '#e39a6c'];
const ROTATE_MS = 30_000;
type Ansicht = 'liste' | 'rennen' | 'einkauf';

/** Zeilen so weit verkleinern, dass alle in den freien Platz passen (nie größer als normal). */
function fitFactor(available: number, rows: number, s: number) {
  if (!available || rows === 0) return 1;
  const gap = 8 * s;
  const natural = rows * ROW_HEIGHT * s + (rows - 1) * gap;
  return Math.max(0.45, Math.min(1, (available - (rows - 1) * gap * 0.5) / natural));
}
const ROW_HEIGHT = 62; // Zeilenhöhe bei Maßstab 1 (Abstand oben/unten + Schrift)

/** Vollbild-Rangliste für den Bildschirm im Büro. Aktualisiert sich selbst. */
export default function Buero() {
  const [month, setMonth] = useState(monthStart());
  const { width } = useWindowDimensions();
  useAutoUpdate(); // neue Versionen kommen ohne Neuladen von Hand auf den Bildschirm
  const s = Math.max(0.6, Math.min(2, width / 1280)); // skaliert mit der Bildschirmbreite

  // Beim Monatswechsel automatisch auf den neuen Monat umschalten.
  useEffect(() => {
    const t = setInterval(() => setMonth(monthStart()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data, reload } = useLive(async () => {
    const [rows, latest, team, ratings, setting, badges, feed] = await Promise.all([
      fetchLeaderboard(month),
      fetchLatestSale(),
      fetchTeamProgress(month),
      fetchRatings(month),
      fetchDisplayView().catch(() => 'wechsel' as const),
      fetchBadges(month).catch((): Record<string, BadgeKey[]> => ({})),
      fetchFeed(1).catch(() => []),
    ]);
    return { rows, latest, team, ratings, setting, badges, feed };
  }, [month]);

  // Cashflow aus Asana getrennt laden: Fehlt Asana oder hakt es, läuft die Anzeige ganz normal weiter.
  const { data: deliv } = useLive(fetchDeliveries, []);
  const pipeline = deliv?.status?.last_success_at ? pipelineSummary(deliv.rows) : null;
  const deliveryStand = deliv?.status?.last_success_at
    ? new Date(deliv.status.last_success_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : '';

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
  // Einkäufer-Rangliste aus Asana: kommt im Wechsel als dritte Ansicht dazu, sobald es Daten gibt.
  // /buero?ansicht=einkauf zeigt sie fest auf diesem Bildschirm.
  const { data: buyers } = useLive(fetchBuyers, []);
  const hasBuyers = (buyers?.length ?? 0) > 0;
  const pinned = ansicht === 'rennen' || ansicht === 'liste' || ansicht === 'einkauf' ? ansicht : setting === 'wechsel' ? null : setting;
  const [view, setView] = useState<Ansicht>(pinned ?? 'liste');
  useEffect(() => {
    if (pinned) return setView(pinned);
    const order: Ansicht[] = hasBuyers ? ['liste', 'rennen', 'einkauf'] : ['liste', 'rennen'];
    setView((v) => (order.includes(v) ? v : 'liste'));
    const t = setInterval(() => setView((v) => order[(order.indexOf(v) + 1) % order.length]), ROTATE_MS);
    return () => clearInterval(t);
  }, [pinned, hasBuyers]);
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
  const icons = Object.fromEntries(Object.entries(data?.badges ?? {}).map(([id, list]) => [id, badgeIcons(list)]));
  const top = data?.feed?.[0];
  const [listH, setListH] = useState(0);
  const onList = (e: LayoutChangeEvent) => setListH(e.nativeEvent.layout.height);
  const k = s * fitFactor(listH, view === 'einkauf' ? (buyers?.length ?? 0) : rows.length, s);
  const lastComment = top?.comments[top.comments.length - 1];

  return (
    <View style={[styles.root, { padding: 32 * s, gap: 14 * s }]} {...ui('tv')}>
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * s }}>
          <View style={[styles.logoPlate, { padding: 8 * s }]}>
            <Logo height={52 * s} />
          </View>
          <Text style={[styles.title, { fontSize: 44 * s }]}>{view === 'rennen' ? 'MONATS-RENNEN' : view === 'einkauf' ? 'EINKÄUFER-RANGLISTE' : 'VERKÄUFER-RANGLISTE'}</Text>
        </View>
        <Text style={[styles.muted, { fontSize: 20 * s }]}>
          {view === 'rennen' ? 'Ziellinie = Monatsziel · ' : view === 'einkauf' ? 'Eingekaufte Fahrzeuge laut Asana · ' : ''}
          {monthLabel(month)}
        </Text>
      </View>
      {view !== 'einkauf' && teamTarget > 0 && (
        <View style={[styles.team, { paddingVertical: 12 * s, paddingHorizontal: 18 * s, gap: 20 * s }]} {...ui('team')}>
          <Text style={[styles.teamLabel, { fontSize: 24 * s }]}>TEAMZIEL</Text>
          <View style={[styles.teamTrack, { flex: 1, height: 22 * s }]}>
            <View style={[styles.teamFill, { width: `${Math.min(100, teamPct)}%` }]} {...ui('team-fill')} />
          </View>
          <Text style={[styles.cell, { fontSize: 30 * s }]}>
            {team?.vehicles ?? 0}
            <Text style={{ color: '#ffffffb3' }}> / {teamTarget} Fahrzeuge</Text>
            {teamPct >= 100 ? <Text> ✓</Text> : null}
          </Text>
        </View>
      )}
      {view !== 'einkauf' && pipeline && (
        <View style={[styles.deliv, { paddingVertical: 10 * s, paddingHorizontal: 18 * s, gap: 18 * s }]} {...ui('deliv')}>
          <Text style={[styles.delivLabel, { fontSize: 22 * s }]}>CASHFLOW IM ZULAUF</Text>
          {pipeline.counts.map((c) => (
            <Text key={c.stage} style={[styles.delivItem, { fontSize: 22 * s }, c.count === 0 && { color: tv.muted }]}>
              {c.short} <Text style={[styles.delivNum, c.count === 0 && { color: tv.muted }]}>{c.count}</Text>
            </Text>
          ))}
          <Text style={[styles.delivItem, { fontSize: 22 * s, color: tv.gold }]}>
            Gesamt <Text style={[styles.delivNum, { color: tv.gold }]}>{pipeline.total}</Text>
            {pipeline.euro > 0 ? <Text style={[styles.delivNum, { color: tv.gold }]}> · {eur(pipeline.euro)}</Text> : null}
          </Text>
        </View>
      )}
      {view === 'einkauf' ? (
        <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', gap: 8 * k }} onLayout={onList}>
          {(buyers ?? []).map((b) => (
            <View key={b.buyer} style={[styles.row, { paddingVertical: 10 * k, paddingHorizontal: 16 * k, gap: 20 * k }]} {...ui(b.rank === 1 ? 'tv-lead' : 'tv-row')}>
              <Text style={[styles.cell, { width: 56 * k, fontSize: 32 * k, color: podium[b.rank - 1] ?? tv.fg, textAlign: 'center' }]}>{b.rank}</Text>
              <Text style={[styles.cell, { flex: 1.7, fontSize: 30 * k }]} numberOfLines={1}>{b.buyer}</Text>
              <View style={[styles.track, { flex: 1.3, height: 14 * k }]}>
                <View style={[styles.fill, { width: `${(b.vehicles / Math.max(1, buyers?.[0]?.vehicles ?? 1)) * 100}%` }]} {...ui('tv-fill')} />
              </View>
              <Text style={[styles.cell, { width: 260 * s, fontSize: 30 * k, textAlign: 'right' }]}>
                {b.vehicles} <Text style={{ color: tv.muted, fontSize: 22 * k }}>{b.vehicles === 1 ? 'Fahrzeug' : 'Fahrzeuge'}</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : view === 'rennen' ? (
        <Race lanes={raceLanes(rows)} scale={s} icons={icons} />
      ) : (
      <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', gap: 8 * k }} onLayout={onList}>
        {rows.map((r) => {
          const reached = r.target_vehicles != null && r.target_vehicles > 0 && r.vehicles >= r.target_vehicles;
          return (
            <View key={r.seller_id} style={[styles.row, { paddingVertical: 10 * k, paddingHorizontal: 16 * k, gap: 20 * k }]} {...ui(r.rank === 1 ? 'tv-lead' : 'tv-row')}>
              <Text style={[styles.cell, { width: 56 * k, fontSize: 32 * k, color: podium[r.rank - 1] ?? tv.fg, textAlign: 'center' }]}>{r.rank}</Text>
              <View style={{ flex: 1.7, flexDirection: 'row', alignItems: 'center', gap: 8 * k }}>
                <Text style={[styles.cell, { flexShrink: 1, fontSize: 30 * k }]} numberOfLines={1}>
                  {r.full_name}
                </Text>
                {icons[r.seller_id] ? <Text style={{ fontSize: 22 * k, flexShrink: 0 }} numberOfLines={1}>{icons[r.seller_id]}</Text> : null}
              </View>
              <View style={[styles.track, { flex: 1.3, height: 14 * k }]}>
                <View style={[styles.fill, { width: `${(r.vehicles / max) * 100}%` }]} {...ui('tv-fill')} />
              </View>
              <Text style={[styles.cell, { width: 140 * k, fontSize: 30 * k, textAlign: 'right' }]}>
                {r.vehicles}
                {r.target_vehicles ? <Text style={{ color: tv.muted }}>/{r.target_vehicles}</Text> : null}
                {reached ? <Text style={{ color: tv.good }}> ✓</Text> : null}
              </Text>
              <Text style={[styles.cell, { width: 100 * k, fontSize: 26 * k, textAlign: 'right', color: ratings[r.seller_id] ? tv.gold : tv.track }]}>
                {stars(ratings[r.seller_id]?.avg ?? null)}
              </Text>
              <Text style={[styles.cell, styles.muted, { width: 150 * k, fontSize: 26 * k, textAlign: 'right' }]}>{eur(r.commission)}</Text>
            </View>
          );
        })}
      </View>
      )}
      <Text style={[styles.muted, styles.foot, { fontSize: 20 * s, paddingTop: 10 * s }]} numberOfLines={1}>
        {view === 'einkauf' ? (
          `Gezählt wird jedes Fahrzeug, das diesen Monat in Asana angelegt wurde${deliveryStand ? ` · Stand ${deliveryStand}` : ''}`
        ) : data?.latest ? (
          <>
            Letzter Verkauf: <Text style={{ color: tv.accent }}>{data.latest.full_name}</Text> · {data.latest.vehicle}
            {top && top.likes > 0 ? <Text style={{ color: tv.fg }}>{'  '}👍 {top.likes}</Text> : null}
            {lastComment ? (
              <Text style={{ color: tv.fg }}>
                {'  '}„{lastComment.comment}“ <Text style={styles.muted}>({lastComment.name.split(' ')[0]})</Text>
              </Text>
            ) : null}
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
  foot: { borderTopWidth: 1, borderColor: tv.track },
  deliv: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', backgroundColor: tv.row, borderRadius: 8, borderLeftWidth: 6, borderColor: tv.accent },
  delivLabel: { color: tv.fg, fontWeight: '800', letterSpacing: 2 },
  delivItem: { color: tv.fg, fontWeight: '600' },
  delivNum: { fontWeight: '800', color: tv.fg },
});
