import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Field, H1, H2, Muted, Notice, rankColor, Screen, ui } from '@/components/ui';
import { addBuyer, fetchBuyers, fetchBuyerSetup, fetchDeliveries, removeBuyer, useLive } from '@/lib/data';
import { monthLabel, monthStart } from '@/lib/format';

/** Einkäufer-Challenge: angelegte Fahrzeug-Aufgaben in Asana je Einkäufer im laufenden Monat. */
export default function Einkauf() {
  const { data, reload } = useLive(async () => {
    const [buyers, deliv, setup] = await Promise.all([fetchBuyers(), fetchDeliveries(), fetchBuyerSetup()]);
    return { buyers, status: deliv?.status ?? null, setup };
  }, []);
  const [neu, setNeu] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listed = new Set((data?.setup.buyers ?? []).map((n) => n.toLowerCase()));
  const others = (data?.setup.creators ?? []).filter((c) => !listed.has(c.name.toLowerCase())).sort((a, b) => b.vehicles - a.vehicles);

  async function change(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
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
      <Card>
        <H2>Wer zählt als Einkäufer?</H2>
        <Muted>Nur diese Personen erscheinen in der Rangliste, auch mit 0. Der Name muss so geschrieben sein wie in Asana.</Muted>
        <View style={styles.chips}>
          {(data?.setup.buyers ?? []).map((n) => (
            <View key={n} style={styles.chip}>
              <Text style={styles.chipText}>{n}</Text>
              <Pressable accessibilityLabel={`${n} entfernen`} disabled={busy} onPress={() => change(() => removeBuyer(n))}>
                <Text style={styles.chipX}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
        {others.length > 0 && (
          <>
            <Muted>Haben diesen Monat ebenfalls Fahrzeuge angelegt, zählen aber nicht:</Muted>
            <View style={styles.chips}>
              {others.map((c) => (
                <Button key={c.name} small variant="ghost" title={`+ ${c.name} (${c.vehicles})`} disabled={busy} onPress={() => change(() => addBuyer(c.name))} />
              ))}
            </View>
          </>
        )}
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <Field label="Einkäufer hinzufügen" value={neu} onChangeText={setNeu} placeholder="Vorname Nachname" />
          </View>
          <Button small title="Hinzufügen" busy={busy} disabled={!neu.trim()} onPress={() => change(async () => { await addBuyer(neu); setNeu(''); })} />
        </View>
        {err && <Notice tone="danger">{err}</Notice>}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.line },
  chipText: { fontWeight: '600', color: colors.fg },
  chipX: { color: colors.muted, fontWeight: '800', paddingHorizontal: 2 },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  count: { width: 40, textAlign: 'right', fontWeight: '800', fontSize: 18, color: colors.fg },
});
