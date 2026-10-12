import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Logo } from '@/components/ui';
import { fetchLatestSale, fetchLeaderboard, useLive } from '@/lib/data';
import { eur, monthLabel, monthStart } from '@/lib/format';

// Dunkle Anzeige im Prusseit-Look: Schwarz, Anthrazit und Prusseit-Rot.
const tv = { bg: '#141414', row: '#222223', fg: '#f5f5f5', muted: '#9a9ea3', accent: '#e30614', track: '#38393b', good: '#5cc98f' };
const podium = ['#f2c94c', '#c9d3dd', '#e39a6c'];

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

  const { data } = useLive(async () => {
    const [rows, latest] = await Promise.all([fetchLeaderboard(month), fetchLatestSale()]);
    return { rows, latest };
  }, [month]);

  const rows = data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.vehicles));

  return (
    <View style={[styles.root, { padding: 32 * s, gap: 14 * s }]}>
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * s }}>
          <View style={[styles.logoPlate, { padding: 8 * s }]}>
            <Logo height={52 * s} />
          </View>
          <Text style={[styles.title, { fontSize: 44 * s }]}>VERKÄUFER-RANGLISTE</Text>
        </View>
        <Text style={[styles.muted, { fontSize: 20 * s }]}>{monthLabel(month)}</Text>
      </View>
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
              <Text style={[styles.cell, styles.muted, { width: 150 * s, fontSize: 26 * s, textAlign: 'right' }]}>{eur(r.commission)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={[styles.muted, styles.foot, { fontSize: 20 * s, paddingTop: 10 * s }]} numberOfLines={1}>
        {data?.latest ? (
          <>
            Letzter Verkauf: <Text style={{ color: tv.accent }}>{data.latest.full_name}</Text> · {data.latest.vehicle}
          </>
        ) : (
          'Noch keine Verkäufe'
        )}
      </Text>
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
  foot: { borderTopWidth: 1, borderColor: tv.track },
});
