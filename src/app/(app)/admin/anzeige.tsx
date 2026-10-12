import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, H1, H2, Muted, Notice, Screen } from '@/components/ui';
import { fetchDisplayView, useLive, type DisplayView } from '@/lib/data';
import { supabase } from '@/lib/supabase';

const OPTIONS: { key: DisplayView; title: string; text: string }[] = [
  { key: 'wechsel', title: 'Im Wechsel', text: 'Rangliste und Rennen wechseln sich alle 30 Sekunden ab.' },
  { key: 'liste', title: 'Nur Rangliste', text: 'Plätze, Fahrzeuge, Ø Bewertung und Provision.' },
  { key: 'rennen', title: 'Nur Rennen', text: 'Jeder fährt als Auto auf sein Monatsziel zu.' },
];

export default function Anzeige() {
  const { data, reload } = useLive(fetchDisplayView, []);
  const [choice, setChoice] = useState<DisplayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = choice ?? data ?? null;

  async function choose(view: DisplayView) {
    setChoice(view);
    const { error: e } = await supabase.from('display_settings').update({ view, updated_at: new Date().toISOString() }).eq('id', true);
    if (e) {
      setError('Ändern hat nicht geklappt.');
      setChoice(null);
    } else setError(null);
    reload();
  }

  return (
    <Screen maxWidth={800}>
      <H1>Büro-Anzeige</H1>
      {error && <Notice tone="danger">{error}</Notice>}
      <Card>
        <H2>Was soll der Bildschirm zeigen?</H2>
        <View style={styles.options} accessibilityRole="radiogroup">
          {OPTIONS.map((o) => {
            const on = current === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => choose(o.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.option, on && styles.optionOn]}
              >
                <View style={[styles.dot, on && styles.dotOn]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.title, on && { color: colors.accent }]}>{o.title}</Text>
                  <Text style={styles.text}>{o.text}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Muted>Die Anzeige im Büro übernimmt die Auswahl nach wenigen Sekunden, ohne dass du dort etwas tun musst.</Muted>
      </Card>
      <Button title="Büro-Anzeige öffnen" onPress={() => router.push('/buero')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 14, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line },
  dotOn: { borderColor: colors.accent, borderWidth: 6 },
  title: { fontWeight: '700', fontSize: 16, color: colors.fg },
  text: { color: colors.muted },
});
