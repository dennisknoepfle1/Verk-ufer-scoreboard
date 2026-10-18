import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Autohaus3D, type Facade } from '@/components/Autohaus3D';
import { Logo, ui } from '@/components/ui';
import { useAutoUpdate } from '@/lib/auto-update';
import { useAuth } from '@/lib/auth';
import { layoutCars } from '@/lib/autohaus-layout';
import { fetchBuyers, fetchDelivered, fetchDeliveries, fetchFinance, fetchSaleToDelivery,
  fetchLeadTimes, fetchSales, fetchTeamProgress, useLive } from '@/lib/data';
import { MONTHLY_FIXED_COSTS } from '@/lib/finance';
import { pipelineSummary, stationCounts, STATIONS } from '@/lib/deliveries';
import { eur, eurShort, monthLabel, monthStart, shiftMonth } from '@/lib/format';
import { pct, summarize, type StatSale } from '@/lib/stats';

// Dunkler Prusseit-Look wie die Büro-Anzeige.
const tv = { bg: '#121214', panel: 'rgba(30,30,32,0.92)', row: '#29292b', fg: '#f5f5f5', muted: '#9a9ea3', accent: '#e30614', track: '#38393b', good: '#5cc98f', gold: '#f2c94c', warn: '#ff8a65' };

// Zeilenhöhe der großen Zahl fest, damit die Kachelreihe (und damit das 3D-Modell) immer gleich hoch bleibt.
const VALUE_LINE = 41.6;

const tage = (n: number | null | undefined) => (n == null ? '–' : `${Math.round(Number(n))}`);

/**
 * TV-Dashboard für die Geschäftsführung: in der Mitte das Autohaus in 3D (jedes Auto = ein Fahrzeug aus Asana),
 * drumherum alle Kennzahlen. Jede Quelle lädt einzeln, hakt eine, zeigen die anderen trotzdem ihre Zahlen.
 * Ohne 3D: /dashboard/klassisch.
 */
export default function Dashboard() {
  const { profile } = useAuth();
  const { width, height } = useWindowDimensions();
  useAutoUpdate();
  const { winkel } = useLocalSearchParams<{ winkel?: string }>(); // Startblickwinkel in Grad
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

  const { data: deliv } = useLive(fetchDeliveries, []);
  const { data: team } = useLive(() => fetchTeamProgress(month).catch(() => null), [month]);
  const { data: buyers } = useLive(fetchBuyers, []);
  const { data: lead } = useLive(() => fetchLeadTimes().catch(() => null), []);
  const { data: delivered } = useLive(() => fetchDelivered().catch(() => null), [month]);
  const { data: finance } = useLive(() => fetchFinance().catch(() => null), [month]);
  const { data: saleLead } = useLive(() => fetchSaleToDelivery().catch(() => null), [month]);
  const { data: extras } = useLive(async () => {
    const prevMonth = shiftMonth(month, -1);
    const sales = await fetchSales(prevMonth, shiftMonth(month, 1)).catch(() => null);
    if (!sales) return null;
    const stat = sales.map<StatSale>((x) => ({ ...x, seller_name: '' }));
    return { now: summarize(stat.filter((x) => x.sold_on >= month)), prev: summarize(stat.filter((x) => x.sold_on < month)) };
  }, [month]);

  const rows = deliv?.status?.last_success_at ? deliv.rows : null;
  const days = useMemo(() => new Map((lead?.open ?? []).map((o) => [o.task_gid, Number(o.days)])), [lead]);
  const yard = useMemo(
    () => layoutCars((rows ?? []).filter((r) => !r.completed).map((r) => ({ gid: r.task_gid, section: r.section, days: days.get(r.task_gid) ?? null })), STATIONS),
    [rows, days],
  );

  if (profile && profile.role !== 'admin') {
    return (
      <View style={[styles.root, { padding: 40, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.muted, { fontSize: 22 }]}>Das Dashboard ist nur für Admins.</Text>
      </View>
    );
  }

  const pipe = rows ? pipelineSummary(rows) : null;
  const stand = deliv?.status?.last_success_at ? new Date(deliv.status.last_success_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  const stations = rows ? stationCounts(rows) : null;
  const maxStation = Math.max(1, ...(stations ?? []).map((x) => x.count));
  const bought = (buyers ?? []).reduce((a, b) => a + b.vehicles, 0);
  const topBuyer = (buyers ?? []).find((b) => b.vehicles > 0);
  const thisMonth = lead?.months.find((m) => m.month === month);
  const open = lead?.open ?? [];
  const openAvg = open.length ? open.reduce((a, o) => a + Number(o.days), 0) / open.length : null;
  const longCount = open.filter((o) => Number(o.days) >= 60).length;
  const maxEuro = Math.max(1, ...(pipe?.counts ?? []).map((c) => c.euro));
  const teamPct = team?.target_vehicles ? Math.round((team.vehicles / team.target_vehicles) * 100) : null;
  const teamText = team ? (team.target_vehicles ? `${team.vehicles} / ${team.target_vehicles}` : `${team.vehicles}`) : '–';
  const facade: Facade = {
    cashflow: pipe ? eur(pipe.euro) : '–',
    team: teamText,
    standzeit: thisMonth ? `${tage(thisMonth.avg_days)} Tage` : '–',
    einkauf: buyers ? `${bought} Fahrzeuge` : '–',
  };

  const f = (n: number) => n * s;
  const Tile = ({ label, value, sub, color = tv.fg }: { label: string; value: string; sub?: ReactNode; color?: string }) => (
    <View style={[styles.tile, { paddingVertical: f(10), paddingHorizontal: f(14), gap: f(2) }]} {...ui('tv-row')}>
      <Text style={[styles.label, { fontSize: f(13) }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.big, { fontSize: f(Math.min(30, 215 / Math.max(1, value.length))), lineHeight: VALUE_LINE * s, color }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.muted, { fontSize: f(13) }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { padding: f(18), gap: f(12) }]} {...ui('tv')}>
      <View style={[styles.head, { paddingBottom: f(8) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: f(16) }}>
          <View style={[styles.logoPlate, { padding: f(5) }]}>
            <Logo height={f(32)} />
          </View>
          <Text style={[styles.title, { fontSize: f(28) }]}>DASHBOARD</Text>
        </View>
        <Text style={[styles.muted, { fontSize: f(17) }]}>
          {monthLabel(month)} · {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          {stand ? ` · Asana ${stand}` : ''}
        </Text>
      </View>

      <View style={[styles.row, { gap: f(12) }]}>
        <Tile
          label="CASHFLOW"
          value={pipe ? eur(pipe.euro) : '–'}
          sub={pipe ? `${pipe.total} Fzg.${pipe.missing ? ` · ${pipe.missing} ohne Preis` : ' im Zulauf'}` : 'Asana nicht erreichbar'}
          color={tv.gold}
        />
        <Tile label="VERKAUFT" value={teamText} sub={teamPct != null ? `${teamPct} % vom Teamziel` : 'Fahrzeuge'} color={teamPct != null && teamPct >= 100 ? tv.good : tv.fg} />
        <Tile label="EINGEKAUFT" value={buyers ? `${bought}` : '–'} sub={topBuyer ? `Vorne: ${topBuyer.buyer.split(' ')[0]} (${topBuyer.vehicles})` : 'Fahrzeuge laut Asana'} />
        <Tile label="Ø STANDZEIT" value={thisMonth ? `${tage(thisMonth.avg_days)} Tage` : '–'} sub={thisMonth ? `Median ${tage(thisMonth.median_days)} · ${thisMonth.vehicles} Fzg.` : 'Eingang bis Auslieferung'} />
        <Tile
          label="AUSGELIEFERT"
          value={delivered ? `${delivered.now}` : '–'}
          sub={delivered ? `Vormonat ${delivered.prev}` : 'Fahrzeuge laut Asana'}
          color={tv.good}
        />
        <Tile
          label="STANDZEIT 3"
          value={saleLead?.now.avgDays != null ? `${tage(saleLead.now.avgDays)} Tage` : '–'}
          sub={
            saleLead
              ? saleLead.now.withDate < saleLead.now.vehicles
                ? `${saleLead.now.vehicles - saleLead.now.withDate}× ohne Datum`
                : `ab Verkauf · Vm. ${tage(saleLead.prev.avgDays)}`
              : 'Verkauf → Auslieferung'
          }
        />
        <Tile label="STEHEN GERADE" value={lead ? `${open.length}` : '–'} sub={lead ? `Ø ${tage(openAvg)} T. · ${longCount} > 60 T.` : 'Eingang bis heute'} color={longCount ? tv.warn : tv.fg} />
      </View>

      <View style={[styles.row, { flex: 1, minHeight: 0, gap: f(12) }]}>
        {/* links: Cashflow je Spalte und Ergebnis im Monat */}
        <View style={{ flex: 1.1, gap: f(12), minHeight: 0 }}>
          <View style={[styles.panel, { padding: f(12), gap: f(4), overflow: 'hidden' }]} {...ui('tv-row')}>
            <Text style={[styles.panelTitle, { fontSize: f(14) }]} numberOfLines={1}>CASHFLOW JE SPALTE</Text>
            {(pipe?.counts ?? []).map((c) => (
              <View key={c.stage} style={{ gap: f(2) }}>
                <View style={styles.between}>
                  <Text style={[styles.fg, { fontSize: f(14) }]} numberOfLines={1}>
                    {c.label} <Text style={styles.muted}>· {c.count}</Text>
                  </Text>
                  <Text style={[styles.strong, { fontSize: f(16) }]}>{eur(c.euro)}</Text>
                </View>
                <View style={[styles.track, { height: f(5) }]}>
                  <View style={[styles.fill, { width: `${(c.euro / maxEuro) * 100}%` }]} {...ui('tv-fill')} />
                </View>
              </View>
            ))}
          </View>
          {/* Ergebnis der im Monat ausgelieferten Fahrzeuge (Asana-Felder Verkaufspreis, Auszahlung VB / EK, Bankprovision gesamt) */}
          <View style={[styles.panel, { flex: 1, padding: f(12), gap: f(4), overflow: 'hidden' }]} {...ui('tv-row')}>
            <View style={styles.between}>
              <Text style={[styles.panelTitle, { fontSize: f(14) }]} numberOfLines={1}>ERGEBNIS</Text>
              <Text style={[styles.muted, { fontSize: f(12) }]} numberOfLines={1}>{finance ? `${finance.now.vehicles} ausgelieferte Fzg.` : ''}</Text>
            </View>
            {/* Umsatz mit Aufschlüsselung in Fahrzeuge (Verkaufspreis) und Bankprovision (Wunsch Dennis 2026-10-18) */}
            <View style={[styles.listRow, { flex: 2, minHeight: 0, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: f(1), paddingVertical: f(2), paddingHorizontal: f(10), borderRadius: f(8) }]}>
              <View style={[styles.between, { gap: f(6) }]}>
                <Text style={[styles.fg, { fontSize: f(14), flexShrink: 1 }]} numberOfLines={1}>Umsatz</Text>
                <Text style={[styles.big, { fontSize: f(18), lineHeight: f(21), color: tv.fg, flexShrink: 0 }]} numberOfLines={1}>{finance ? eur(finance.now.revenue) : '–'}</Text>
              </View>
              {(
                [
                  ['Fahrzeuge', finance?.now.sale, finance?.prev.sale],
                  ['Bankprovision', finance?.now.bank, finance?.prev.bank],
                ] as const
              ).map(([label, value, prev]) => (
                <View key={label} style={[styles.between, { gap: f(6) }]}>
                  <Text style={[styles.muted, { fontSize: f(12), flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
                  <Text style={{ fontSize: f(12) }} numberOfLines={1}>
                    <Text style={styles.fg}>{value == null ? '–' : eur(value)}</Text>
                    <Text style={styles.muted}> · Vm. {prev == null ? '–' : eurShort(prev)}</Text>
                  </Text>
                </View>
              ))}
            </View>
            {(
              [
                ['Wareneinsatz', finance?.now.purchase, finance?.prev.purchase, 'Auszahlung VB / EK', tv.fg],
                ['Ertrag je Fzg.', finance?.now.marginPerVehicle, finance?.prev.marginPerVehicle, 'vor Kosten', tv.fg],
                ['Gewinn', finance?.now.profit, finance?.prev.profit, `nach ${eurShort(MONTHLY_FIXED_COSTS)} Kosten`, finance && finance.now.profit < 0 ? tv.warn : tv.good],
              ] as const
            ).map(([label, value, prev, sub, color]) => (
              <View key={label} style={[styles.listRow, { flex: 1, minHeight: 0, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', paddingVertical: f(2), paddingHorizontal: f(10), borderRadius: f(8) }]}>
                <View style={[styles.between, { gap: f(6) }]}>
                  <Text style={[styles.fg, { fontSize: f(14) }]} numberOfLines={1}>{label}</Text>
                  <Text style={[styles.big, { fontSize: f(18), lineHeight: f(21), color }]} numberOfLines={1}>{value == null ? '–' : eur(value)}</Text>
                </View>
                <View style={[styles.between, { gap: f(6) }]}>
                  <Text style={[styles.muted, { fontSize: f(10.5), flexShrink: 1 }]} numberOfLines={1}>{sub}</Text>
                  <Text style={[styles.muted, { fontSize: f(10.5) }]} numberOfLines={1}>Vormonat {prev == null ? '–' : eurShort(prev)}</Text>
                </View>
              </View>
            ))}
            {finance && finance.now.missingSale + finance.now.missingPurchase + finance.now.missingBank > 0 ? (
              <Text style={{ color: tv.warn, fontSize: f(11) }} numberOfLines={1}>
                Fehlt in Asana: {[
                  finance.now.missingSale ? `${finance.now.missingSale}× VK` : '',
                  finance.now.missingPurchase ? `${finance.now.missingPurchase}× EK` : '',
                  finance.now.missingBank ? `${finance.now.missingBank}× Bankprov.` : '',
                ].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Mitte: das Autohaus */}
        <View style={[styles.stage, { flex: 2.5, borderRadius: f(10) }]}>
          <Autohaus3D cars={yard.placed} zones={yard.counts} facade={facade} startAngle={winkel ? (Number(winkel) * Math.PI) / 180 : undefined} />
          <View pointerEvents="none" style={[styles.legend, { margin: f(10), paddingVertical: f(6), paddingHorizontal: f(10), gap: f(14), borderRadius: f(8) }]}>
            <Text style={{ color: tv.fg, fontSize: f(12) }}>Jedes Auto = ein Fahrzeug aus Asana</Text>
            <Text style={{ color: '#ff4d4d', fontSize: f(12), fontWeight: '700' }}>◆ rot = steht seit 60+ Tagen</Text>
            {!rows ? <Text style={{ color: tv.muted, fontSize: f(12) }}>Asana-Daten werden geladen …</Text> : null}
          </View>
        </View>

        {/* rechts: Zusatzgeschäft im Monat (gleiche Rechnung wie Admin > Statistik); die Zeilen teilen sich die Höhe gleichmäßig */}
        <View style={[styles.panel, { flex: 1, padding: f(14), gap: f(6) }]} {...ui('tv-row')}>
          <View style={styles.between}>
            <Text style={[styles.panelTitle, { fontSize: f(14) }]}>ZUSATZGESCHÄFT</Text>
            <Text style={[styles.muted, { fontSize: f(12) }]}>{extras ? `${extras.now.vehicles} Verkäufe` : ''}</Text>
          </View>
          {(() => {
            const n = extras?.now.vehicles ?? 0;
            const rate = (key: 'winterRate' | 'registrationRate' | 'financedRate') => {
              const r = extras?.now[key] ?? null;
              return { value: pct(r), fill: r ?? 0, sub: `${r == null || !extras ? 'Noch keine Verkäufe' : `${Math.round(r * n)} von ${n}`} · Vormonat ${pct(extras?.prev[key] ?? null)}` };
            };
            // Euro-Werte: Balken im Vergleich zum Vormonat (der höhere Monat füllt den Balken).
            const money = (now: number | null, prev: number | null, what: string) => {
              const top = Math.max(now ?? 0, prev ?? 0);
              return {
                value: now == null ? '–' : eur(now),
                fill: top ? (now ?? 0) / top : 0,
                sub: `${what ? `${what} · ` : ''}Vormonat ${prev == null ? '–' : eur(prev)}`,
              };
            };
            const rows = [
              { label: 'Winterräder', ...rate('winterRate') },
              { label: 'Zulassung', ...rate('registrationRate') },
              { label: 'Finanzierung', ...rate('financedRate') },
              { label: 'Umsatz Winterräder', key: 'wr€', ...money(extras ? extras.now.winterRevenue : null, extras ? extras.prev.winterRevenue : null, '') },
              { label: 'Umsatz Zulassung', key: 'zl€', ...money(extras ? extras.now.registrationRevenue : null, extras ? extras.prev.registrationRevenue : null, '') },
              { label: 'Ø Bankprovision', ...money(extras?.now.avgBankCommission ?? null, extras?.prev.avgBankCommission ?? null, 'je Verkauf') },
            ];
            return rows.map((row) => (
              <View key={'key' in row ? row.key : row.label} style={[styles.listRow, { flex: 1, minHeight: 0, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', paddingVertical: f(3), paddingHorizontal: f(10), gap: f(3), borderRadius: f(8) }]}>
                <View style={[styles.between, { alignItems: 'center', gap: f(6) }]}>
                  <View style={{ flexShrink: 1, minWidth: 0 }}>
                    <Text style={[styles.fg, { fontSize: f(14), lineHeight: f(17) }]} numberOfLines={1}>{row.label}</Text>
                    <Text style={[styles.muted, { fontSize: f(10.5), lineHeight: f(13) }]} numberOfLines={1}>{row.sub}</Text>
                  </View>
                  <Text style={[styles.big, { fontSize: f(row.value.length > 8 ? 17 : row.value.length > 6 ? 19 : 22), lineHeight: f(26), color: tv.fg }]}>{row.value}</Text>
                </View>
                <View style={[styles.track, { height: f(6) }]}>
                  <View style={[styles.fill, { width: `${Math.min(1, row.fill) * 100}%` }]} {...ui('tv-fill')} />
                </View>
              </View>
            ));
          })()}
        </View>
      </View>

      {/* unten: Pipeline groß, Schritt für Schritt */}
      {stations && (
        <View style={[styles.panel, { paddingVertical: f(10), paddingHorizontal: f(14), gap: f(6) }]} {...ui('tv-row')}>
          <View style={styles.between}>
            <Text style={[styles.panelTitle, { fontSize: f(14) }]}>PIPELINE</Text>
            <Text style={[styles.muted, { fontSize: f(12) }]}>{stations.reduce((a, x) => a + x.count, 0)} Fahrzeuge von Beschaffung bis Auszahlung</Text>
          </View>
          <View style={[styles.row, { alignItems: 'stretch' }]}>
            {stations.map((x, i) => (
              <View key={x.key} style={[styles.row, { flex: 1, alignItems: 'center' }]}>
                <View style={[styles.station, { paddingVertical: f(8), gap: f(4), borderRadius: f(8) }]}>
                  <Text style={[styles.muted, { fontSize: f(13), fontWeight: '700' }]} numberOfLines={1}>
                    {i + 1} · {x.label}
                  </Text>
                  <Text style={[styles.strong, { fontSize: f(38), lineHeight: f(42) }, x.count === 0 && { color: tv.muted }]}>{x.count}</Text>
                  <View style={[styles.track, { width: '76%', height: f(6) }]}>
                    <View style={[styles.fill, { width: `${(x.count / maxStation) * 100}%` }]} />
                  </View>
                </View>
                {i < stations.length - 1 ? <Text style={[styles.muted, { fontSize: f(20), marginHorizontal: f(3) }]}>›</Text> : null}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tv.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 3, borderColor: tv.accent },
  logoPlate: { backgroundColor: '#fff', borderRadius: 6 },
  title: { color: tv.fg, fontWeight: '800', letterSpacing: 1.5 },
  row: { flexDirection: 'row' },
  tile: { flex: 1, backgroundColor: tv.panel, borderRadius: 10, borderTopWidth: 3, borderColor: tv.accent },
  label: { color: tv.muted, fontWeight: '800', letterSpacing: 1.2 },
  big: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  muted: { color: tv.muted },
  fg: { color: tv.fg, fontWeight: '600' },
  strong: { color: tv.fg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  panel: { backgroundColor: tv.panel, borderRadius: 10 },
  panelTitle: { color: tv.fg, fontWeight: '800', letterSpacing: 1.5 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  track: { backgroundColor: tv.track, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: tv.accent, borderRadius: 6 },
  station: { flex: 1, alignItems: 'center', backgroundColor: tv.row },
  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: tv.row },
  stage: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2c2c30',
    backgroundColor: '#0f1420',
    backgroundImage: 'linear-gradient(#0d1220, #22213a 55%, #3a2a2e)',
  } as object,
  legend: { position: 'absolute', left: 0, bottom: 0, flexDirection: 'row', backgroundColor: 'rgba(16,16,18,0.82)' },
});
