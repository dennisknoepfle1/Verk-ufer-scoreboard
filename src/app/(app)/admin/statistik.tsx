import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, colors, H1, H2, Muted, Notice, Screen } from '@/components/ui';
import { fetchSales, useLive } from '@/lib/data';
import { eur, monthLabel, monthStart, shiftMonth } from '@/lib/format';
import { monthlyTrend, pct, perSeller, stars, summarize, type StatSale } from '@/lib/stats';

type Period = 'month' | 'year' | '12m';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Dieser Monat' },
  { key: 'year', label: 'Dieses Jahr' },
  { key: '12m', label: 'Letzte 12 Monate' },
];

const shortMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
};

export default function Statistik() {
  const current = monthStart();
  const from = shiftMonth(current, -11);
  const [period, setPeriod] = useState<Period>('month');
  const [selected, setSelected] = useState(current);

  const { data, error } = useLive(async () => {
    const sales = await fetchSales(from, shiftMonth(current, 1));
    return sales.map<StatSale>((s) => ({
      seller_id: s.seller_id,
      seller_name: s.profiles?.full_name ?? '?',
      sold_on: s.sold_on,
      bank_commission: s.bank_commission,
      winter_wheels_price: s.winter_wheels_price,
      registration_price: s.registration_price,
      commission: s.commission,
      customer_rating: s.customer_rating,
    }));
  }, [from, current]);

  const all = data ?? [];
  const inPeriod = all.filter((s) =>
    period === 'month' ? s.sold_on >= current : period === 'year' ? s.sold_on.slice(0, 4) === current.slice(0, 4) : true,
  );
  const total = summarize(inPeriod);
  const sellers = perSeller(inPeriod);
  const trend = monthlyTrend(all, current);
  const max = Math.max(1, ...trend.map((t) => t.vehicles));
  const sel = trend.find((t) => t.month === selected) ?? trend[trend.length - 1];

  const kpis = [
    ['Verkaufte Fahrzeuge', String(total.vehicles)],
    ['Ø Bankprovision je Verkauf', total.avgBankCommission == null ? '–' : eur(total.avgBankCommission)],
    ['Quote Winterräder', pct(total.winterRate)],
    ['Quote Zulassung', pct(total.registrationRate)],
    ['Ø Kundenbewertung', stars(total.avgRating)],
  ];

  return (
    <Screen maxWidth={1100}>
      <H1>Statistik</H1>
      {error && <Notice tone="danger">{error}</Notice>}

      <Card>
        <H2>Verkaufte Fahrzeuge pro Monat</H2>
        <View style={styles.chart} accessibilityLabel="Säulendiagramm der verkauften Fahrzeuge der letzten 12 Monate">
          {trend.map((t) => {
            const active = t.month === sel.month;
            return (
              <Pressable
                key={t.month}
                onPress={() => setSelected(t.month)}
                onHoverIn={() => setSelected(t.month)}
                accessibilityRole="button"
                accessibilityLabel={`${monthLabel(t.month)}: ${t.vehicles} Fahrzeuge`}
                style={styles.col}
              >
                <View style={styles.barArea}>
                  <View
                    style={[
                      styles.bar,
                      { height: `${(t.vehicles / max) * 100}%`, backgroundColor: active ? colors.accent : '#f08a90' },
                      t.vehicles === 0 && { height: 2, backgroundColor: colors.line },
                    ]}
                  />
                </View>
                <Text style={[styles.tick, active && { color: colors.fg, fontWeight: '700' }]}>{shortMonth(t.month)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.detail}>
          <Text style={{ fontWeight: '700' }}>{monthLabel(sel.month)}:</Text> {sel.vehicles} {sel.vehicles === 1 ? 'Fahrzeug' : 'Fahrzeuge'},{' '}
          {eur(sel.commission)} Provision
        </Text>
        <Muted>Auf eine Säule tippen oder mit der Maus darüberfahren, um die Werte zu sehen.</Muted>
      </Card>

      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <Pressable key={p.key} onPress={() => setPeriod(p.key)} accessibilityRole="button" style={[styles.chip, period === p.key && styles.chipActive]}>
            <Text style={[styles.chipText, period === p.key && { color: '#fff' }]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.kpis}>
        {kpis.map(([l, v]) => (
          <Card key={l} style={styles.kpi}>
            <Text style={styles.kpiLabel}>{l}</Text>
            <Text style={styles.kpiValue}>{v}</Text>
          </Card>
        ))}
      </View>

      <Card>
        <H2>Je Verkäufer</H2>
        <ScrollView horizontal>
          <View>
            <View style={styles.tr}>
              {COLS.map((c) => (
                <Text key={c.label} style={[styles.th, { width: c.w, textAlign: c.right ? 'right' : 'left' }]}>{c.label}</Text>
              ))}
            </View>
            {sellers.map((r) => (
              <View key={r.seller_id} style={styles.tr}>
                <Text style={[styles.td, { width: 180, fontWeight: '600' }]} numberOfLines={1}>{r.seller_name}</Text>
                <Text style={[styles.td, styles.r, { width: 90 }]}>{r.vehicles}</Text>
                <Text style={[styles.td, styles.r, { width: 120 }]}>{pct(r.winterRate)}</Text>
                <Text style={[styles.td, styles.r, { width: 110 }]}>{pct(r.registrationRate)}</Text>
                <Text style={[styles.td, styles.r, { width: 120 }]}>{pct(r.financedRate)}</Text>
                <Text style={[styles.td, styles.r, { width: 150 }]}>{r.avgBankCommission == null ? '–' : eur(r.avgBankCommission)}</Text>
                <Text style={[styles.td, styles.r, { width: 130 }]}>{stars(r.avgRating)}{r.ratingCount ? ` (${r.ratingCount})` : ''}</Text>
                <Text style={[styles.td, styles.r, { width: 110, fontWeight: '700' }]}>{eur(r.commission)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        {data && sellers.length === 0 && <Muted>In diesem Zeitraum gibt es noch keine Verkäufe.</Muted>}
        <Muted>Quote = Anteil der Verkäufe, bei denen Winterräder, Zulassung oder eine Finanzierung (Bankprovision) mitverkauft wurden. Ø Bewertung in Klammern: Anzahl bewerteter Verkäufe.</Muted>
      </Card>
    </Screen>
  );
}

const COLS = [
  { label: 'Verkäufer', w: 180 },
  { label: 'Fahrzeuge', w: 90, right: true },
  { label: 'Winterräder', w: 120, right: true },
  { label: 'Zulassung', w: 110, right: true },
  { label: 'Finanzierung', w: 120, right: true },
  { label: 'Ø Bankprovision', w: 150, right: true },
  { label: 'Ø Bewertung', w: 130, right: true },
  { label: 'Provision', w: 110, right: true },
];

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 200, gap: 4, paddingTop: 8 },
  col: { flex: 1, height: '100%', alignItems: 'center', gap: 6 },
  barArea: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line },
  bar: { width: '70%', maxWidth: 44, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tick: { fontSize: 11, color: colors.muted },
  detail: { fontSize: 15, color: colors.fg, fontVariant: ['tabular-nums'] },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 12 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontWeight: '600', color: colors.muted },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { flexGrow: 1, flexBasis: 150, gap: 2 },
  kpiLabel: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 26, fontWeight: '800', color: colors.fg },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 8 },
  th: { paddingHorizontal: 6, color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  td: { paddingHorizontal: 6, color: colors.fg, fontVariant: ['tabular-nums'] },
  r: { textAlign: 'right' },
});
