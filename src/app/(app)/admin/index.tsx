import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { KudosFeed } from '@/components/KudosFeed';
import { MonthPicker } from '@/components/MonthPicker';
import { StarInput } from '@/components/Stars';
import { AnimatedValue } from '@/components/CountUp';
import { PushCard } from '@/components/PushCard';
import { Button, Card, colors, H1, H2, Muted, Notice, Screen } from '@/components/ui';
import { fetchFeed, fetchLeaderboard, fetchSales, useLive } from '@/lib/data';
import { dateLabel, eur, monthStart, shiftMonth, todayIso } from '@/lib/format';
import { stars, summarize } from '@/lib/stats';
import { supabase } from '@/lib/supabase';

export default function AdminSales() {
  const [month, setMonth] = useState(monthStart());
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [rating, setRating] = useState<Record<number, number | null>>({});
  const { data, error, reload } = useLive(
    async () => {
      const [sales, board, feed] = await Promise.all([fetchSales(month, shiftMonth(month, 1)), fetchLeaderboard(month), fetchFeed(5).catch(() => [])]);
      return { sales, board, feed };
    },
    [month],
  );

  async function remove(id: number) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    await supabase.from('sales').delete().eq('id', id);
    reload();
  }

  async function rate(id: number, value: number | null) {
    setRating((r) => ({ ...r, [id]: value }));
    const { error: e } = await supabase.from('sales').update({ customer_rating: value }).eq('id', id);
    if (e) setRating(({ [id]: _, ...rest }) => rest);
    reload();
  }

  const sales = (data?.sales ?? []).map((s) => (s.id in rating ? { ...s, customer_rating: rating[s.id] } : s));
  const avg = summarize(sales.map((s) => ({ ...s, seller_name: '' }))).avgRating;
  const board = data?.board ?? [];
  const withGoal = board.filter((r) => r.target_vehicles);
  const kpis = [
    ['Verkaufte Fahrzeuge', String(sales.length)],
    // Im laufenden Monat zählt hier nur die Provision von heute (Wunsch Dennis), in früheren Monaten der ganze Monat.
    month === monthStart()
      ? ['Provision heute', eur(sales.filter((s) => s.sold_on === todayIso()).reduce((a, s) => a + s.commission, 0))]
      : ['Provision gesamt', eur(sales.reduce((a, s) => a + s.commission, 0))],
    ['Bankprovision gesamt', eur(sales.reduce((a, s) => a + s.bank_commission, 0))],
    ['Ø Kundenbewertung', stars(avg)],
    ['Monatsziel erreicht', `${withGoal.filter((r) => r.vehicles >= (r.target_vehicles ?? 0)).length} von ${withGoal.length}`],
  ];

  return (
    <Screen maxWidth={1100}>
      <View style={styles.head}>
        <H1>Verkäufe</H1>
        <MonthPicker month={month} onChange={setMonth} />
      </View>
      {error && <Notice tone="danger">{error}</Notice>}
      <View style={styles.kpis}>
        {kpis.map(([l, v]) => (
          <Card key={l} style={styles.kpi} kind="kpi">
            <Text style={styles.kpiLabel}>{l}</Text>
            <AnimatedValue text={v} style={styles.kpiValue} />
          </Card>
        ))}
      </View>
      <PushCard />
      <Card>
        <H2>Neueste Verkäufe feiern</H2>
        <KudosFeed items={data?.feed ?? []} onChange={reload} />
      </Card>
      <Card>
        <ScrollView horizontal>
          <View>
            <View style={[styles.tr, styles.th]}>
              {COLS.map((c) => (
                <Text key={c.key} style={[styles.cell, { width: c.w, textAlign: c.right ? 'right' : 'left' }, styles.thText]}>{c.label}</Text>
              ))}
            </View>
            {sales.map((s) => (
              <View key={s.id} style={styles.tr}>
                <Text style={[styles.cell, { width: 100 }]}>{dateLabel(s.sold_on)}</Text>
                <Text style={[styles.cell, { width: 160 }]} numberOfLines={1}>{s.profiles?.full_name ?? '?'}</Text>
                <Text style={[styles.cell, { width: 200 }]} numberOfLines={1}>{s.vehicle}</Text>
                <Text style={[styles.cell, styles.r, { width: 110 }]}>{eur(s.bank_commission)}</Text>
                <Text style={[styles.cell, styles.r, { width: 110 }]}>{s.winter_wheels_price ? eur(s.winter_wheels_price) : '–'}</Text>
                <Text style={[styles.cell, styles.r, { width: 100 }]}>{s.registration_price ? eur(s.registration_price) : '–'}</Text>
                <Text style={[styles.cell, styles.r, { width: 100, fontWeight: '700' }]}>{eur(s.commission)}</Text>
                <View style={{ width: 140, paddingLeft: 12 }}>
                  <StarInput value={s.customer_rating} onChange={(v) => rate(s.id, v)} label={`Kundenbewertung ${s.vehicle}`} />
                </View>
                <View style={{ width: 120, paddingLeft: 8 }}>
                  <Button small variant="danger" title={confirmId === s.id ? 'Wirklich?' : 'Löschen'} onPress={() => remove(s.id)} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        {data && sales.length === 0 && <Muted>In diesem Monat wurden noch keine Verkäufe eingetragen.</Muted>}
        {sales.length > 0 && <Muted>Kundenbewertung: Sterne antippen, um sie zu setzen. Den gleichen Stern nochmal antippen entfernt sie. Auf die Provision hat sie keinen Einfluss.</Muted>}
      </Card>
    </Screen>
  );
}

const COLS = [
  { key: 'd', label: 'Datum', w: 100 },
  { key: 'v', label: 'Verkäufer', w: 160 },
  { key: 'f', label: 'Fahrzeug', w: 200 },
  { key: 'b', label: 'Bankprov.', w: 110, right: true },
  { key: 'w', label: 'Winterräder', w: 110, right: true },
  { key: 'z', label: 'Zulassung', w: 100, right: true },
  { key: 'p', label: 'Provision', w: 100, right: true },
  { key: 's', label: 'Bewertung', w: 140 },
  { key: 'x', label: '', w: 120 },
];

const styles = StyleSheet.create({
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { flexGrow: 1, flexBasis: 150, gap: 2 },
  kpiLabel: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 26, fontWeight: '800', color: colors.fg },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 6 },
  th: { paddingVertical: 4 },
  thText: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  cell: { paddingHorizontal: 6, color: colors.fg, fontVariant: ['tabular-nums'] },
  r: { textAlign: 'right' },
});
