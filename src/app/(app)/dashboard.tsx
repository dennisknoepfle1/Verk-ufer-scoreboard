import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Logo, ui } from '@/components/ui';
import { useAutoUpdate } from '@/lib/auto-update';
import { useAuth } from '@/lib/auth';
import { fetchBuyers, fetchDeliveries, fetchLeadTimes, fetchTeamProgress, useLive } from '@/lib/data';
import { pipelineSummary } from '@/lib/deliveries';
import { eur, monthLabel, monthStart } from '@/lib/format';

// Gleicher dunkler Prusseit-Look wie die Büro-Anzeige.
const tv = { bg: '#141414', panel: '#1e1e1f', row: '#29292b', fg: '#f5f5f5', muted: '#9a9ea3', accent: '#e30614', track: '#38393b', good: '#5cc98f', gold: '#f2c94c', warn: '#ff8a65' };

const tage = (n: number | null | undefined) => (n == null ? '–' : `${Math.round(Number(n))}`);
const shortMonth = (m: string) => new Date(`${m}T12:00:00`).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');

/** TV-Dashboard für die Geschäftsführung: Cashflow, Verkauf, Einkauf und Standzeit auf einen Blick. Aktualisiert sich selbst. */
export default function Dashboard() {
  const { profile } = useAuth();
  const { width, height } = useWindowDimensions();
  useAutoUpdate();
  const s = Math.max(0.55, Math.min(2, width / 1280, height / 720));
  const [month, setMonth] = useState(monthStart());
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setMonth(monthStart());
      setNow(new Date());
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // Jede Quelle einzeln: Hakt eine (z. B. Asana), zeigen die anderen Kacheln trotzdem ihre Zahlen.
  const { data: deliv } = useLive(fetchDeliveries, []);
  const { data: team } = useLive(() => fetchTeamProgress(month).catch(() => null), [month]);
  const { data: buyers } = useLive(fetchBuyers, []);
  const { data: lead } = useLive(() => fetchLeadTimes().catch(() => null), []);

  if (profile && profile.role !== 'admin') {
    return (
      <View style={[styles.root, { padding: 40, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.muted, { fontSize: 22 }]}>Das Dashboard ist nur für Admins.</Text>
      </View>
    );
  }

  const pipe = deliv?.status?.last_success_at ? pipelineSummary(deliv.rows) : null;
  const stand = deliv?.status?.last_success_at
    ? new Date(deliv.status.last_success_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null;
  const bought = (buyers ?? []).reduce((a, b) => a + b.vehicles, 0);
  const topBuyer = (buyers ?? []).find((b) => b.vehicles > 0);
  const months = (lead?.months ?? []).slice(0, 6).reverse();
  const thisMonth = lead?.months.find((m) => m.month === month);
  const open = lead?.open ?? [];
  const openAvg = open.length ? open.reduce((a, o) => a + Number(o.days), 0) / open.length : null;
  const longest = open.slice(0, 10); // was nicht passt, wird unten abgeschnitten
  const maxAvg = Math.max(1, ...months.map((m) => Number(m.avg_days)));
  const maxEuro = Math.max(1, ...(pipe?.counts ?? []).map((c) => c.euro));
  const teamPct = team?.target_vehicles ? Math.round((team.vehicles / team.target_vehicles) * 100) : null;

  const f = (n: number) => n * s;
  const Tile = ({ label, value, sub, color = tv.fg }: { label: string; value: string; sub?: string; color?: string }) => (
    <View style={[styles.tile, { padding: f(16), gap: f(4) }]} {...ui('tv-row')}>
      <Text style={[styles.label, { fontSize: f(15) }]}>{label}</Text>
      <Text style={[styles.big, { fontSize: f(40), color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.muted, { fontSize: f(15) }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { padding: f(28), gap: f(16) }]} {...ui('tv')}>
      <View style={[styles.head, { paddingBottom: f(12) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: f(20) }}>
          <View style={[styles.logoPlate, { padding: f(6) }]}>
            <Logo height={f(42)} />
          </View>
          <Text style={[styles.title, { fontSize: f(36) }]}>DASHBOARD</Text>
        </View>
        <Text style={[styles.muted, { fontSize: f(20) }]}>
          {monthLabel(month)} · {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      <View style={[styles.row, { gap: f(16) }]}>
        <Tile
          label="CASHFLOW IM ZULAUF"
          value={pipe ? eur(pipe.euro) : '–'}
          sub={pipe ? `${pipe.total} Fahrzeuge${pipe.missing ? ` · ${pipe.missing} ohne Preis/Art` : ''}` : 'Asana nicht erreichbar'}
          color={tv.gold}
        />
        <Tile
          label={`VERKAUFT ${monthLabel(month).toUpperCase()}`}
          value={team ? (team.target_vehicles ? `${team.vehicles} / ${team.target_vehicles}` : `${team.vehicles}`) : '–'}
          sub={teamPct != null ? `${teamPct} % vom Teamziel` : 'Fahrzeuge'}
          color={teamPct != null && teamPct >= 100 ? tv.good : tv.fg}
        />
        <Tile label="EINGEKAUFT IM MONAT" value={buyers ? `${bought}` : '–'} sub={topBuyer ? `Vorne: ${topBuyer.buyer} (${topBuyer.vehicles})` : 'Fahrzeuge laut Asana'} />
        <Tile
          label="Ø STANDZEIT IM MONAT"
          value={thisMonth ? `${tage(thisMonth.avg_days)} Tage` : '–'}
          sub={thisMonth ? `Median ${tage(thisMonth.median_days)} · ${thisMonth.vehicles} ausgeliefert` : 'Eingang bis Auslieferung'}
        />
      </View>

      <View style={[styles.row, { flex: 1, minHeight: 0, gap: f(16) }]}>
        {/* Cashflow je Spalte */}
        <View style={[styles.panel, { flex: 1, padding: f(18), gap: f(14) }]} {...ui('tv-row')}>
          <Text style={[styles.panelTitle, { fontSize: f(18) }]}>CASHFLOW JE SPALTE</Text>
          {(pipe?.counts ?? []).map((c) => (
            <View key={c.stage} style={{ gap: f(6) }}>
              <View style={styles.between}>
                <Text style={[styles.fg, { fontSize: f(18) }]}>{c.label}</Text>
                <Text style={[styles.strong, { fontSize: f(20) }]}>{eur(c.euro)}</Text>
              </View>
              <View style={[styles.track, { height: f(12) }]}>
                <View style={[styles.fill, { width: `${(c.euro / maxEuro) * 100}%` }]} {...ui('tv-fill')} />
              </View>
              <Text style={[styles.muted, { fontSize: f(14) }]}>{c.count} {c.count === 1 ? 'Fahrzeug' : 'Fahrzeuge'}</Text>
            </View>
          ))}
          <Text style={[styles.muted, { fontSize: f(13), marginTop: 'auto' }]}>
            Direkter Ankauf und Inzahlungnahme, ohne Vermittlung{stand ? ` · Asana ${stand}` : ''}
          </Text>
        </View>

        {/* Standzeit-Verlauf */}
        <View style={[styles.panel, { flex: 1.1, padding: f(18), gap: f(10) }]} {...ui('tv-row')}>
          <Text style={[styles.panelTitle, { fontSize: f(18) }]}>Ø STANDZEIT JE MONAT (TAGE)</Text>
          <View style={[styles.chart, { gap: f(10) }]}>
            {months.map((m) => (
              <View key={m.month} style={[styles.barCol, { gap: f(6) }]}>
                <Text style={[styles.strong, { fontSize: f(18) }]}>{tage(m.avg_days)}</Text>
                <View style={[styles.bar, { height: `${(Number(m.avg_days) / maxAvg) * 70}%`, borderRadius: f(6) }, m.month === month && { backgroundColor: tv.gold }]} />
                <Text style={[styles.muted, { fontSize: f(14) }]}>{shortMonth(m.month)}</Text>
              </View>
            ))}
            {lead && months.length === 0 && <Text style={styles.muted}>Noch keine Daten</Text>}
          </View>
          <Text style={[styles.muted, { fontSize: f(13) }]}>Vom Eingang (Administration) bis Auszahlung/Prüfung, nach Monat der Auslieferung</Text>
        </View>

        {/* Längste Standzeiten */}
        <View style={[styles.panel, { flex: 1, padding: f(18), gap: f(8) }]} {...ui('tv-row')}>
          <View style={styles.between}>
            <Text style={[styles.panelTitle, { fontSize: f(18) }]}>LANGSTEHER</Text>
            <Text style={[styles.muted, { fontSize: f(14) }]}>
              {open.length} stehen · Ø {tage(openAvg)} T.
            </Text>
          </View>
          <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', gap: f(6) }}>
            {longest.map((o) => (
              <View key={o.task_gid} style={[styles.listRow, { paddingVertical: f(6), paddingHorizontal: f(10), gap: f(10), borderRadius: f(6) }]}>
                <Text style={[styles.strong, { width: f(58), fontSize: f(18), color: Number(o.days) >= 60 ? tv.warn : tv.fg }]}>{tage(o.days)} T.</Text>
                <Text style={[styles.fg, { flex: 1, fontSize: f(15) }]} numberOfLines={1}>
                  {o.name.split('/')[0].trim()}
                </Text>
                <Text style={[styles.muted, { fontSize: f(12), maxWidth: f(110) }]} numberOfLines={1}>
                  {o.section.replace('FZG.-', '').replace('FZG.- ', '')}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tv.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 4, borderColor: tv.accent },
  logoPlate: { backgroundColor: '#fff', borderRadius: 6 },
  title: { color: tv.fg, fontWeight: '800', letterSpacing: 1.5 },
  row: { flexDirection: 'row' },
  tile: { flex: 1, backgroundColor: tv.panel, borderRadius: 10, borderTopWidth: 4, borderColor: tv.accent },
  label: { color: tv.muted, fontWeight: '800', letterSpacing: 1.5 },
  big: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  muted: { color: tv.muted },
  fg: { color: tv.fg, fontWeight: '600' },
  strong: { color: tv.fg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  panel: { backgroundColor: tv.panel, borderRadius: 10 },
  panelTitle: { color: tv.fg, fontWeight: '800', letterSpacing: 1.5 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { backgroundColor: tv.track, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: tv.accent, borderRadius: 6 },
  chart: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', backgroundColor: tv.accent },
  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: tv.row },
});
