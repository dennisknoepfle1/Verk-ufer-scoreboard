import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Field, H1, H2, Muted, Notice, Screen } from '@/components/ui';
import { fetchDisplayView, fetchQuotes, useLive, type DisplayView } from '@/lib/data';
import { quoteOfDay } from '@/lib/quote';
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

  const quotes = useLive(fetchQuotes, []);
  const today = quoteOfDay(quotes.data ?? []);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function addQuote() {
    const text = draft.trim();
    if (text.length < 3) return;
    const { error: e } = await supabase.from('quotes').insert({ text });
    setError(e ? 'Spruch konnte nicht gespeichert werden.' : null);
    if (!e) setDraft('');
    quotes.reload();
  }

  async function removeQuote(id: number) {
    if (confirmId !== id) return setConfirmId(id);
    setConfirmId(null);
    const { error: e } = await supabase.from('quotes').delete().eq('id', id);
    setError(e ? 'Spruch konnte nicht entfernt werden.' : null);
    quotes.reload();
  }

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

      <Card>
        <H2>Spruch des Tages</H2>
        <Muted>Jeden Tag erscheint der nächste Spruch aus dieser Liste auf der Büro-Anzeige und in der App der Verkäufer.</Muted>
        {today && (
          <View style={styles.today}>
            <Text style={styles.todayLabel}>Heute</Text>
            <Text style={styles.todayText}>„{today.text}“</Text>
          </View>
        )}
        <Field
          label="Neuer Spruch"
          value={draft}
          onChangeText={setDraft}
          placeholder="z. B. Wer nicht fragt, verkauft nicht."
          maxLength={200}
          onSubmitEditing={addQuote}
        />
        <Button title="Spruch hinzufügen" onPress={addQuote} disabled={draft.trim().length < 3} />
        <View>
          {(quotes.data ?? []).map((q) => (
            <View key={q.id} style={styles.quoteRow}>
              <Text style={[styles.quoteText, q.id === today?.id && { color: colors.accent, fontWeight: '700' }]}>{q.text}</Text>
              <Button small variant="ghost" title={confirmId === q.id ? 'Wirklich?' : 'Entfernen'} onPress={() => removeQuote(q.id)} />
            </View>
          ))}
        </View>
        {quotes.data?.length === 0 && <Muted>Noch keine Sprüche. Ohne Sprüche wird keiner angezeigt.</Muted>}
      </Card>
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
  today: { backgroundColor: colors.accentSoft, borderLeftWidth: 4, borderColor: colors.accent, padding: 12, borderRadius: 4, gap: 2 },
  todayLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  todayText: { color: colors.fg, fontSize: 16, fontWeight: '600', fontStyle: 'italic' },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line },
  quoteText: { flex: 1, color: colors.fg },
});
