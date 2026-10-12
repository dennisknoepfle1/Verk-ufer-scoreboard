import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Field, H1, H2, Muted, Notice, Screen, ui } from '@/components/ui';
import { fetchAsanaProject, fetchDeliveries, saveAsanaProject, syncAsanaNow, useLive } from '@/lib/data';
import { deliverySummary, shortDate } from '@/lib/deliveries';

const STAGE_LABEL = { fertig: 'Fahrzeug fertig', auslieferung: 'Auslieferung', ausgeliefert: 'Ausgeliefert', sonstige: 'Sonstige' } as const;

function timeLabel(iso: string | null | undefined) {
  if (!iso) return 'noch nie';
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Auslieferungen aus Asana: Übersicht, Liste und Einstellung des Projekts. */
export default function Auslieferungen() {
  const { data, reload } = useLive(fetchDeliveries, []);
  const [ref, setRef] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    fetchAsanaProject()
      .then((r) => {
        setRef(r);
        setSaved(r);
      })
      .catch(() => setSaved(''));
  }, []);

  const status = data?.status;
  const summary = data ? deliverySummary(data.rows) : null;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await saveAsanaProject(ref);
      setSaved(ref.trim());
      setMsg({ tone: 'good', text: 'Gespeichert. Der Abruf startet jetzt, das dauert ein paar Sekunden.' });
      setTimeout(reload, 4000);
    } catch {
      setMsg({ tone: 'danger', text: 'Speichern hat nicht geklappt.' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setMsg(null);
    try {
      await syncAsanaNow();
      reload();
    } catch {
      setMsg({ tone: 'danger', text: 'Abruf konnte nicht gestartet werden. Er läuft trotzdem alle 15 Minuten automatisch.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen maxWidth={1000}>
      <H1>Auslieferungen</H1>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {summary && status?.last_success_at ? (
        <Card>
          <H2>Nächste 7 Tage: {summary.next7}</H2>
          <View style={styles.days}>
            {summary.overdue > 0 && (
              <View style={[styles.day, styles.overdue]} {...ui('kpi')}>
                <Text style={styles.dayLabel}>Überfällig</Text>
                <Text style={[styles.dayCount, { color: colors.danger }]}>{summary.overdue}</Text>
              </View>
            )}
            {summary.days.map((d) => (
              <View key={d.date} style={styles.day} {...ui('kpi')}>
                <Text style={styles.dayLabel}>{d.label}</Text>
                <Text style={styles.dayDate}>{shortDate(d.date)}</Text>
                <Text style={[styles.dayCount, d.count === 0 && { color: colors.muted }]}>{d.count}</Text>
              </View>
            ))}
            <View style={styles.day} {...ui('kpi')}>
              <Text style={styles.dayLabel}>Später / ohne Datum</Text>
              <Text style={styles.dayCount}>{summary.later}</Text>
            </View>
          </View>
          <Muted>
            Stand: {timeLabel(status.last_success_at)} · zählt „Fahrzeug fertig“ und „Auslieferung“, „Auszahlung/Prüfung“ gilt als ausgeliefert.
          </Muted>
        </Card>
      ) : null}

      <Card>
        <H2>Verbindung zu Asana</H2>
        <Field
          label="Link zum Asana-Projekt (Board mit den Fahrzeugen)"
          value={ref}
          onChangeText={setRef}
          placeholder="https://app.asana.com/…"
          autoCapitalize="none"
          hint="Öffne das Board in Asana und kopiere die Adresse aus der Adresszeile des Browsers."
        />
        <View style={styles.actions}>
          <Button small title="Speichern" onPress={save} busy={busy} disabled={ref.trim() === (saved ?? '')} />
          <Button small variant="ghost" title="Jetzt abrufen" onPress={syncNow} busy={busy} />
        </View>
        <Text style={{ color: colors.fg }}>
          Letzter Abruf: {timeLabel(status?.last_attempt_at)}
          {status?.last_success_at ? ` · zuletzt erfolgreich: ${timeLabel(status.last_success_at)} (${status.task_count} offene Aufgaben)` : ''}
        </Text>
        {status?.last_error ? <Notice tone="danger">Problem beim letzten Abruf: {status.last_error}</Notice> : null}
        <Muted>Der Abruf läuft automatisch alle 15 Minuten und liest nur, er ändert nichts in Asana.</Muted>
      </Card>

      {summary && summary.pending.length > 0 && (
        <Card>
          <H2>Anstehende Fahrzeuge ({summary.pending.length})</H2>
          {summary.pending.map((d) => (
            <View key={d.task_gid} style={styles.item} {...ui('row')}>
              <Text style={styles.date}>{d.due_on ? shortDate(d.due_on) : '–'}</Text>
              <Text
                style={[styles.name, d.permalink_url ? { color: colors.accent } : null]}
                numberOfLines={1}
                onPress={d.permalink_url ? () => Linking.openURL(d.permalink_url!) : undefined}
              >
                {d.name}
              </Text>
              <Text style={styles.stage}>{STAGE_LABEL[d.stage]}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  day: { minWidth: 92, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, gap: 2, backgroundColor: colors.surface, alignItems: 'center' },
  overdue: { borderColor: colors.danger },
  dayLabel: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  dayDate: { color: colors.muted, fontSize: 12 },
  dayCount: { color: colors.fg, fontWeight: '800', fontSize: 26 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6 },
  date: { width: 56, fontWeight: '700', color: colors.fg, fontVariant: ['tabular-nums'] },
  name: { flex: 1, color: colors.fg, fontWeight: '600' },
  stage: { color: colors.muted },
});
