import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Autohaus3D, type Facade } from '@/components/Autohaus3D';
import { Logo } from '@/components/ui';
import { useAutoUpdate } from '@/lib/auto-update';
import { useAuth } from '@/lib/auth';
import { layoutCars } from '@/lib/autohaus-layout';
import { fetchDeliveries, fetchLeadTimes, fetchTeamProgress, useLive } from '@/lib/data';
import { pipelineSummary, STATIONS } from '@/lib/deliveries';
import { eur, monthStart } from '@/lib/format';

/** Prototyp: das Dashboard als 3D-Modell des Autohauses. Jedes Auto auf dem Hof ist ein Fahrzeug aus Asana. */
export default function Dashboard3D() {
  const { profile } = useAuth();
  const { width, height } = useWindowDimensions();
  useAutoUpdate();
  const { winkel } = useLocalSearchParams<{ winkel?: string }>(); // Startblickwinkel in Grad (zum Testen)
  const s = Math.max(0.55, Math.min(2, width / 1280, height / 720));
  const [month, setMonth] = useState(monthStart());
  useEffect(() => {
    const t = setInterval(() => setMonth(monthStart()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Jede Quelle einzeln: Hakt eine, steht das Modell trotzdem.
  const { data: deliv } = useLive(fetchDeliveries, []);
  const { data: lead } = useLive(() => fetchLeadTimes().catch(() => null), []);
  const { data: team } = useLive(() => fetchTeamProgress(month).catch(() => null), [month]);

  const rows = deliv?.status?.last_success_at ? deliv.rows : null;
  const days = useMemo(() => new Map((lead?.open ?? []).map((o) => [o.task_gid, Number(o.days)])), [lead]);
  const yard = useMemo(
    () => layoutCars((rows ?? []).filter((r) => !r.completed).map((r) => ({ gid: r.task_gid, section: r.section, days: days.get(r.task_gid) ?? null })), STATIONS),
    [rows, days],
  );
  const pipe = rows ? pipelineSummary(rows) : null;
  const open = lead?.open ?? [];
  const avg = open.length ? Math.round(open.reduce((a, o) => a + Number(o.days), 0) / open.length) : null;
  const longCount = open.filter((o) => Number(o.days) >= 60).length;
  const onYard = yard.counts.reduce((a, c) => a + c.count, 0);
  const facade: Facade = {
    cashflow: pipe ? eur(pipe.euro) : '–',
    team: team?.target_vehicles ? `${team.vehicles} / ${team.target_vehicles}` : team ? `${team.vehicles}` : '–',
    standzeit: avg == null ? '–' : `${avg} Tage`,
  };

  if (profile && profile.role !== 'admin') {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#9a9ea3', fontSize: 22 }}>Das Dashboard ist nur für Admins.</Text>
      </View>
    );
  }

  const f = (n: number) => n * s;
  const Pill = ({ label, value, color = '#f5f5f5' }: { label: string; value: string; color?: string }) => (
    <View style={[styles.pill, { paddingVertical: f(8), paddingHorizontal: f(14) }]}>
      <Text style={{ color: '#9a9ea3', fontSize: f(12), fontWeight: '700', letterSpacing: 1 }}>{label}</Text>
      <Text style={{ color, fontSize: f(26), fontWeight: '800' }}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <Autohaus3D cars={yard.placed} zones={yard.counts} facade={facade} startAngle={winkel ? (Number(winkel) * Math.PI) / 180 : undefined} />
      <View pointerEvents="none" style={[styles.top, { padding: f(24), gap: f(16) }]}>
        <Logo height={f(36)} />
        <Text style={{ color: '#f5f5f5', fontSize: f(26), fontWeight: '800', letterSpacing: 2 }}>AUTOHAUS LIVE</Text>
        <View style={{ flex: 1 }} />
        <Pill label="CASHFLOW" value={facade.cashflow} color="#f2c94c" />
        <Pill label="VERKAUFT" value={facade.team} />
        <Pill label="Ø STANDZEIT" value={facade.standzeit} />
        <Pill label="AUF DEM HOF" value={rows ? String(onYard) : '–'} />
      </View>
      <View pointerEvents="none" style={[styles.legend, { margin: f(24), padding: f(10), gap: f(16) }]}>
        <Text style={{ color: '#f5f5f5', fontSize: f(15) }}>Jedes Auto = ein Fahrzeug aus Asana</Text>
        <Text style={{ color: '#ff4d4d', fontSize: f(15), fontWeight: '700' }}>● rot = steht seit 60+ Tagen ({longCount})</Text>
        {!rows ? <Text style={{ color: '#9a9ea3', fontSize: f(15) }}>Asana-Daten werden geladen …</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1420', backgroundImage: 'linear-gradient(#0f1420, #2a2433 60%, #3b2a2a)' } as object,
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', backgroundImage: 'linear-gradient(rgba(10,10,12,0.85), rgba(10,10,12,0))' } as object,
  pill: { backgroundColor: 'rgba(20,20,22,0.8)', borderRadius: 12, borderTopWidth: 3, borderTopColor: '#e30614' },
  legend: { position: 'absolute', left: 0, bottom: 0, flexDirection: 'row', backgroundColor: 'rgba(20,20,22,0.8)', borderRadius: 10 },
});
