import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Field, H2, Muted, Notice } from '@/components/ui';
import { fetchMobileCustomers, saveMobileCustomers, syncMobileNow, type MobileStatus } from '@/lib/data';

export function timeLabel(iso: string | null | undefined) {
  if (!iso) return 'noch nie';
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Verbindung zu mobile.de: Kundennummer, „Jetzt abrufen“, Stand des letzten Abrufs. mobile.de wird nur gelesen. */
export function MobileSettings({ status, onChanged }: { status: MobileStatus | null; onChanged: () => void }) {
  const [customers, setCustomers] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    fetchMobileCustomers()
      .then((c) => {
        setCustomers(c);
        setSaved(c);
      })
      .catch(() => setSaved(''));
  }, []);

  async function run(action: () => Promise<void>, ok: string | null, fail: string) {
    setBusy(true);
    setMsg(null);
    try {
      await action();
      if (ok) setMsg({ tone: 'good', text: ok });
      setTimeout(onChanged, 5000);
    } catch {
      setMsg({ tone: 'danger', text: fail });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <H2>Verbindung zu mobile.de</H2>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Field
        label="mobile.de-Kundennummer (mehrere mit Komma)"
        value={customers}
        onChangeText={setCustomers}
        placeholder="z. B. 123456"
        keyboardType="numbers-and-punctuation"
        hint="mobile.de wird nur gelesen, hier wird nie etwas geändert."
      />
      <View style={styles.actions}>
        <Button
          small
          title="Speichern"
          onPress={() =>
            run(
              async () => {
                await saveMobileCustomers(customers);
                setSaved(customers.trim());
              },
              'Gespeichert. Der Abruf startet jetzt, das dauert ein paar Sekunden.',
              'Speichern hat nicht geklappt.',
            )
          }
          busy={busy}
          disabled={customers.trim() === (saved ?? '')}
        />
        <Button small variant="ghost" title="Jetzt abrufen" onPress={() => run(syncMobileNow, null, 'Abruf konnte nicht gestartet werden. Er läuft trotzdem alle 15 Minuten automatisch.')} busy={busy} />
      </View>
      <Text style={{ color: colors.fg }}>
        Letzter Abruf: {timeLabel(status?.last_attempt_at)}
        {status?.last_success_at ? ` · zuletzt erfolgreich: ${timeLabel(status.last_success_at)} (${status.listing_count} Inserate)` : ''}
      </Text>
      {status?.last_error ? <Notice tone="danger">Problem beim letzten Abruf: {status.last_error}</Notice> : null}
      <Muted>mobile.de und Asana werden automatisch alle 15 Minuten gelesen.</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
