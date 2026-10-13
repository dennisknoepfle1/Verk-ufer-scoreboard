import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, Field, H1, H2, Muted, Notice, Screen, ui } from '@/components/ui';
import { fetchAsanaProject, fetchDeliveries, saveAsanaProject, syncAsanaNow, useLive } from '@/lib/data';
import { isDirect, missingInfo, pipelineSummary, shortDate } from '@/lib/deliveries';
import { eur } from '@/lib/format';

const STAGE_LABEL = { fertig: 'Fahrzeug fertig', auslieferung: 'Auslieferung', ausgeliefert: 'Auszahlung / Prüfung', sonstige: 'Sonstige' } as const;

function timeLabel(iso: string | null | undefined) {
  if (!iso) return 'noch nie';
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Cashflow aus Asana: Fahrzeuge in den drei Spalten bis zur Auszahlung, Liste und Einstellung des Projekts. */
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
  const summary = data ? pipelineSummary(data.rows) : null;

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
      <H1>Cashflow</H1>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {summary && status?.last_success_at ? (
        <Card>
          <H2>
            Cashflow im Zulauf: {eur(summary.euro)} · {summary.total} Fahrzeuge
          </H2>
          <View style={styles.days}>
            {summary.counts.map((c) => (
              <View key={c.stage} style={styles.day} {...ui('kpi')}>
                <Text style={styles.dayLabel}>{c.label}</Text>
                <Text style={[styles.dayCount, c.count === 0 && { color: colors.muted }]}>{eur(c.euro)}</Text>
                <Text style={styles.dayLabel}>{c.count} {c.count === 1 ? 'Fahrzeug' : 'Fahrzeuge'}</Text>
              </View>
            ))}
          </View>
          {summary.missing > 0 && (
            <Notice tone="danger">
              Bei {summary.missing} {summary.missing === 1 ? 'Fahrzeug fehlt' : 'Fahrzeugen fehlt'} in Asana die Art des Geschäftes oder der Verkaufspreis. Sie
              sind unten rot markiert und fehlen in der Euro-Summe.
            </Notice>
          )}
          <Muted>
            In Euro zählt nur der direkte Ankauf (Asana-Feld „Verkaufspreis“), Vermittlungen nicht. Stand: {timeLabel(status.last_success_at)} · „Auszahlung / Prüfung“ ist am nächsten am Geld, danach Auslieferung und Fahrzeug fertig.
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

      {summary && summary.total > 0 && (
        <Card>
          <H2>Fahrzeuge im Zulauf ({summary.total})</H2>
          {summary.vehicles.map((d) => (
            <View key={d.task_gid} style={styles.item} {...ui('row')}>
              <Text style={styles.date}>{d.due_on ? shortDate(d.due_on) : '–'}</Text>
              <Text
                style={[styles.name, d.permalink_url ? { color: colors.accent } : null]}
                numberOfLines={1}
                onPress={d.permalink_url ? () => Linking.openURL(d.permalink_url!) : undefined}
              >
                {d.name}
              </Text>
              {missingInfo(d) ? (
                <Text style={styles.missing}>{missingInfo(d)}</Text>
              ) : (
                <Text style={[styles.amount, !isDirect(d) && { color: colors.muted }]}>
                  {isDirect(d) ? eur(Number(d.amount)) : d.deal_type}
                </Text>
              )}
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
  day: { minWidth: 150, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, gap: 2, backgroundColor: colors.surface, alignItems: 'center' },
  dayLabel: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  dayCount: { color: colors.fg, fontWeight: '800', fontSize: 26 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6 },
  date: { width: 56, fontWeight: '700', color: colors.fg, fontVariant: ['tabular-nums'] },
  name: { flex: 1, color: colors.fg, fontWeight: '600' },
  amount: { width: 150, textAlign: 'right', fontWeight: '700', color: colors.fg, fontVariant: ['tabular-nums'] },
  missing: { width: 190, textAlign: 'right', fontWeight: '700', color: colors.danger },
  stage: { color: colors.muted, width: 190, textAlign: 'right' },
});
