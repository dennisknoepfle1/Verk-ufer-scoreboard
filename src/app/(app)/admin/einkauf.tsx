import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, H1, H2, Muted, rankColor, Screen, ui } from '@/components/ui';
import { fetchBuyers, fetchDeliveries, useLive } from '@/lib/data';
import { monthLabel, monthStart } from '@/lib/format';

/** Einkäufer-Challenge: angelegte Fahrzeug-Aufgaben in Asana je Einkäufer im laufenden Monat. */
export default function Einkauf() {
  const { data } = useLive(async () => {
    const [buyers, deliv] = await Promise.all([fetchBuyers(), fetchDeliveries()]);
    return { buyers, status: deliv?.status ?? null };
  }, []);
  const buyers = data?.buyers ?? [];
  const max = Math.max(1, ...buyers.map((b) => b.vehicles));
  const total = buyers.reduce((a, b) => a + b.vehicles, 0);
  const stand = data?.status?.last_success_at
    ? new Date(data.status.last_success_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Screen maxWidth={900}>
      <H1>Einkäufer</H1>
      <Card>
        <H2>
          Rangliste {monthLabel(monthStart())} · {total} {total === 1 ? 'Fahrzeug' : 'Fahrzeuge'}
        </H2>
        {buyers.map((b) => (
          <View key={b.buyer} style={styles.row} {...ui('row')}>
            <Text style={[styles.pos, { color: rankColor(b.rank) }]}>{b.rank}</Text>
            <Text style={styles.name} numberOfLines={1}>{b.buyer}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(b.vehicles / max) * 100}%` }]} />
            </View>
            <Text style={styles.count}>{b.vehicles}</Text>
          </View>
        ))}
        {data && buyers.length === 0 && <Muted>Noch keine Daten aus Asana für diesen Monat.</Muted>}
        <Muted>
          Gezählt wird jede Fahrzeug-Aufgabe, die in diesem Monat in Asana angelegt wurde, beim Ersteller der Aufgabe. Stornos zählen nicht.
          {stand ? ` Stand: ${stand}, Abruf alle 15 Minuten.` : ''}
        </Muted>
      </Card>
      <Button variant="ghost" title="Einkäufer auf der Büro-Anzeige öffnen" onPress={() => router.push('/buero?ansicht=einkauf')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8 },
  pos: { width: 28, textAlign: 'center', fontWeight: '800', fontSize: 18 },
  name: { flex: 1, fontWeight: '600', color: colors.fg },
  track: { flex: 1, height: 10, backgroundColor: colors.line, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 5 },
  count: { width: 40, textAlign: 'right', fontWeight: '800', fontSize: 18, color: colors.fg },
});
