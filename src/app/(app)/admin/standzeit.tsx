import { Linking, StyleSheet, Text, View } from 'react-native';

import { Card, colors, H1, H2, Loading, Muted, Notice, Screen, ui } from '@/components/ui';
import { fetchLeadTimes, useLive } from '@/lib/data';
import { monthLabel } from '@/lib/format';

const days = (n: number) => `${Math.round(Number(n))} ${Math.round(Number(n)) === 1 ? 'Tag' : 'Tage'}`;

/** Standzeit: vom Eingang des Fahrzeugs (Spalte „FZG.-Administration“) bis ausgeliefert, aus dem Asana-Verlauf. */
export default function Standzeit() {
  const { data, error } = useLive(fetchLeadTimes, []);
  if (error) return <Screen><Notice tone="danger">Standzeiten konnten nicht geladen werden: {error}</Notice></Screen>;
  if (!data) return <Loading />;
  const { months, open, status } = data;
  const current = months[0];
  const openAvg = open.length ? open.reduce((a, o) => a + Number(o.days), 0) / open.length : 0;
  const pending = status.tasks - status.checked;

  return (
    <Screen maxWidth={1000}>
      <H1>Standzeit</H1>
      {pending > 0 && (
        <Notice>
          Der Asana-Verlauf wird gerade ausgewertet: {status.checked} von {status.tasks} Fahrzeugen. Der Rest kommt mit den nächsten Abrufen (alle 15 Minuten), die Zahlen können sich bis dahin noch ändern.
        </Notice>
      )}
      <View style={styles.kpis}>
        <View style={styles.kpi} {...ui('kpi')}>
          <Text style={styles.kpiLabel}>Ø Standzeit {current ? monthLabel(current.month) : ''}</Text>
          <Text style={styles.kpiValue}>{current ? days(current.avg_days) : '–'}</Text>
          <Text style={styles.kpiLabel}>{current ? `${current.vehicles} ausgeliefert` : 'noch keine Auslieferung'}</Text>
        </View>
        <View style={styles.kpi} {...ui('kpi')}>
          <Text style={styles.kpiLabel}>Stehen gerade</Text>
          <Text style={styles.kpiValue}>{open.length}</Text>
          <Text style={styles.kpiLabel}>{open.length ? `Ø ${days(openAvg)} seit Eingang` : 'keine'}</Text>
        </View>
      </View>

      <Card>
        <H2>Ø Standzeit je Monat</H2>
        <View style={[styles.row, styles.head]}>
          <Text style={[styles.month, styles.headText]}>Monat</Text>
          <Text style={[styles.num, styles.headText]}>Ausgeliefert</Text>
          <Text style={[styles.num, styles.headText]}>Ø</Text>
          <Text style={[styles.num, styles.headText]}>Median</Text>
          <Text style={[styles.num, styles.headText]}>Längste</Text>
        </View>
        {months.map((m) => (
          <View key={m.month} style={styles.row} {...ui('row')}>
            <Text style={styles.month}>{monthLabel(m.month)}</Text>
            <Text style={styles.num}>{m.vehicles}</Text>
            <Text style={[styles.num, styles.strong]}>{days(m.avg_days)}</Text>
            <Text style={styles.num}>{days(m.median_days)}</Text>
            <Text style={styles.num}>{days(m.max_days)}</Text>
          </View>
        ))}
        {months.length === 0 && <Muted>Noch keine ausgelieferten Fahrzeuge ausgewertet.</Muted>}
        <Muted>
          Gemessen vom ersten Eingang in „FZG.-Administration“ bis zum ersten Mal in „Auszahlung/ Prüfung“ (wenn übersprungen: „Buchhaltung“ oder
          „Abgeschlossen“), zugeordnet zum Monat der Auslieferung. Fahrzeuge, die nie durch die Administration liefen, und Stornos zählen nicht.
        </Muted>
      </Card>

      <Card>
        <H2>Stehen gerade ({open.length})</H2>
        {open.map((o) => (
          <View key={o.task_gid} style={styles.row} {...ui('row')}>
            <Text style={[styles.days, Number(o.days) >= 60 && { color: colors.danger }]}>{days(o.days)}</Text>
            <Text
              style={[styles.name, o.permalink_url ? { color: colors.accent } : null]}
              numberOfLines={1}
              onPress={o.permalink_url ? () => Linking.openURL(o.permalink_url!) : undefined}
            >
              {o.name}
            </Text>
            <Text style={styles.section} numberOfLines={1}>{o.section}</Text>
          </View>
        ))}
        {open.length === 0 && <Muted>Gerade steht kein Fahrzeug.</Muted>}
        <Muted>Längste zuerst. Ab 60 Tagen rot.</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { flexGrow: 1, minWidth: 220, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, gap: 2, backgroundColor: colors.surface, alignItems: 'center' },
  kpiLabel: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  kpiValue: { color: colors.fg, fontWeight: '800', fontSize: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6 },
  head: { borderBottomWidth: 1, borderColor: colors.line },
  headText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  month: { flex: 1, color: colors.fg, fontWeight: '600' },
  num: { width: 100, textAlign: 'right', color: colors.fg, fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '800' },
  days: { width: 80, fontWeight: '800', color: colors.fg, fontVariant: ['tabular-nums'] },
  name: { flex: 1, color: colors.fg, fontWeight: '600' },
  section: { width: 220, textAlign: 'right', color: colors.muted },
});
