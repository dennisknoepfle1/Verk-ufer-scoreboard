import { useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, colors, Field, H1, H2, Muted, Notice, Screen, ui } from '@/components/ui';
import { useLive } from '@/lib/data';
import { dateLabel } from '@/lib/format';
import {
  deleteInstruction,
  fetchInstructions,
  fetchInstructionStatus,
  MAX_FILE_MB,
  publishInstruction,
  setArchived,
  type AckRow,
  type Instruction,
} from '@/lib/instructions';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

/** Datei auswählen (nur im Web, die App läuft als Web-App). */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const confirmDialog = (text: string) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(text) : true);

export default function AdminAnweisungen() {
  const { data, reload } = useLive(async () => {
    const [list, status] = await Promise.all([fetchInstructions({ includeArchived: true }), fetchInstructionStatus()]);
    return { list, status };
  }, []);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function choose() {
    const f = await pickFile();
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Die Datei ist größer als ${MAX_FILE_MB} MB.`);
      return;
    }
    setError(null);
    setFile(f);
  }

  async function publish() {
    if (!title.trim()) return setError('Bitte einen Titel eingeben.');
    if (!body.trim() && !file) return setError('Bitte einen Text schreiben oder eine Datei anhängen.');
    if (!confirmDialog('Jetzt veröffentlichen? Alle Verkäufer müssen die Anweisung sofort bestätigen, bevor sie weiterarbeiten können.')) return;
    setBusy(true);
    try {
      await publishInstruction({ title, body, file });
      setTitle('');
      setBody('');
      setFile(null);
      setError(null);
      setSaved(true);
      reload();
    } catch (e) {
      setError(`Veröffentlichen hat nicht geklappt. ${(e as Error).message ?? ''}`);
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
      setError(null);
    } catch {
      setError('Ändern hat nicht geklappt.');
    }
    reload();
  }

  const active = data?.list.filter((i) => !i.archived_at) ?? [];
  const archived = data?.list.filter((i) => i.archived_at) ?? [];

  return (
    <Screen maxWidth={800}>
      <H1>Arbeitsanweisungen</H1>
      <Muted>
        Neue Anweisungen erscheinen bei allen Verkäufern sofort. Sie müssen sie lesen und bestätigen, vorher kommen sie in der App nicht weiter.
        Verkäufer, die später dazukommen, bestätigen alle aktiven Anweisungen bei der ersten Anmeldung.
      </Muted>
      {error && <Notice tone="danger">{error}</Notice>}
      {saved && !error && <Notice tone="good">Veröffentlicht.</Notice>}

      <Card>
        <H2>Neue Anweisung</H2>
        <Field label="Titel" value={title} onChangeText={setTitle} placeholder="z. B. Ablauf Probefahrt" maxLength={160} />
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>Text</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Was genau gilt ab sofort? (optional, wenn eine Datei angehängt ist)"
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            {...ui('input')}
          />
        </View>
        <View style={styles.fileRow}>
          <Button small variant="ghost" title={file ? 'Andere Datei' : 'Datei anhängen'} onPress={choose} />
          {file ? (
            <Text style={styles.fileName} numberOfLines={1}>
              📄 {file.name}{' '}
              <Text onPress={() => setFile(null)} style={styles.remove}>
                Entfernen
              </Text>
            </Text>
          ) : (
            <Muted>PDF, Bild oder Office-Datei, bis {MAX_FILE_MB} MB</Muted>
          )}
        </View>
        <Button title="Veröffentlichen" onPress={publish} busy={busy} />
      </Card>

      <H2>Aktiv</H2>
      {data && active.length === 0 && <Muted>Keine aktiven Anweisungen.</Muted>}
      {active.map((i) => (
        <InstructionCard key={i.id} item={i} acks={data?.status[i.id] ?? []}>
          <Button small variant="ghost" title="Zurückziehen" onPress={() => run(() => setArchived(i.id, true))} />
        </InstructionCard>
      ))}

      {archived.length > 0 && <H2>Zurückgezogen</H2>}
      {archived.map((i) => (
        <InstructionCard key={i.id} item={i} acks={data?.status[i.id] ?? []}>
          <Button small variant="ghost" title="Wieder aktivieren" onPress={() => run(() => setArchived(i.id, false))} />
          <Button
            small
            variant="danger"
            title="Löschen"
            onPress={() => confirmDialog(`„${i.title}“ endgültig löschen, mit allen Bestätigungen?`) && run(() => deleteInstruction(i))}
          />
        </InstructionCard>
      ))}
    </Screen>
  );
}

function InstructionCard({ item, acks, children }: { item: Instruction; acks: AckRow[]; children: ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const done = acks.filter((a) => a.confirmed_at);
  const open = acks.filter((a) => !a.confirmed_at);
  const all = acks.length > 0 && open.length === 0;
  return (
    <Card style={item.archived_at ? { opacity: 0.75 } : undefined}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{item.title}</Text>
          <Muted>
            Veröffentlicht am {dateLabel(item.created_at)}
            {item.archived_at ? ` · zurückgezogen am ${dateLabel(item.archived_at)}` : ''}
          </Muted>
        </View>
        <Text style={[styles.count, { color: all ? colors.good : colors.accent }]}>
          {done.length} / {acks.length} bestätigt
        </Text>
      </View>
      {item.body ? (
        <Text style={styles.body} numberOfLines={showAll ? undefined : 3} onPress={() => setShowAll((s) => !s)}>
          {item.body}
        </Text>
      ) : null}
      {item.file_path && (
        <Text style={styles.fileLink} onPress={() => item.file_url && Linking.openURL(item.file_url)} accessibilityRole="link">
          📄 {item.file_name ?? 'Datei'} öffnen
        </Text>
      )}
      <View style={styles.people}>
        {open.map((a) => (
          <Text key={a.user_id} style={[styles.person, styles.personOpen]}>
            ○ {a.full_name} · offen
          </Text>
        ))}
        {done.map((a) => (
          <Text key={a.user_id} style={[styles.person, styles.personDone]}>
            ✓ {a.full_name} · {dateLabel(a.confirmed_at!)} {timeLabel(a.confirmed_at!)}
          </Text>
        ))}
      </View>
      <View style={styles.actions}>{children}</View>
    </Card>
  );
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

const styles = StyleSheet.create({
  label: { fontWeight: '600', fontSize: 14, color: colors.fg },
  textarea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.fg,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  fileName: { flex: 1, color: colors.fg, fontWeight: '600' },
  remove: { color: colors.danger, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 17, fontWeight: '800', color: colors.fg },
  count: { fontWeight: '800', fontSize: 15 },
  body: { color: colors.fg, lineHeight: 21 },
  fileLink: { color: colors.accent, fontWeight: '700' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  person: { borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10, fontSize: 13, fontWeight: '600', overflow: 'hidden' },
  personOpen: { backgroundColor: colors.accentSoft, color: colors.accent },
  personDone: { backgroundColor: colors.goodSoft, color: colors.good },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
