import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { PushCard } from '@/components/PushCard';
import { BrandBar, Button, Card, colors, H1, H2, Loading, Muted, Notice, Screen, ThemeToggle, ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateLabel } from '@/lib/format';
import { confirmInstruction, useInstructionGate, type Instruction } from '@/lib/instructions';

/** Verkäufer: Arbeitsanweisungen lesen und bestätigen. Offene Anweisungen sperren den Rest der App. */
export default function Anweisungen() {
  const { profile, signOut } = useAuth();
  const { list, open, reload } = useInstructionGate();

  if (profile?.role === 'admin') return <Redirect href="/admin/anweisungen" />;
  if (!list) return <Loading />;
  const done = list.filter((i) => i.confirmed_at);

  return (
    <Screen>
      <BrandBar
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <ThemeToggle />
            <Text onPress={signOut} style={styles.link} accessibilityRole="button">Abmelden</Text>
          </View>
        }
      />
      <H1>Arbeitsanweisungen</H1>
      {open.length > 0 ? (
        <Notice tone="danger">
          {open.length === 1 ? 'Eine neue Arbeitsanweisung' : `${open.length} neue Arbeitsanweisungen`}: Bitte lesen und bestätigen. Danach geht es in der App weiter.
        </Notice>
      ) : (
        <>
          <Notice tone="good">Alles gelesen und bestätigt.</Notice>
          <Button title="Weiter zur Rangliste" onPress={() => router.replace('/')} />
        </>
      )}

      <PushCard />
      {open.map((i) => (
        <OpenInstruction key={i.id} item={i} onDone={reload} />
      ))}

      {done.length > 0 && <H2>Bereits bestätigt</H2>}
      {done.map((i) => (
        <Card key={i.id}>
          <Text style={styles.title}>{i.title}</Text>
          <Muted>Bestätigt am {dateLabel(i.confirmed_at!)}</Muted>
          <Body item={i} />
        </Card>
      ))}
      {list.length === 0 && <Muted>Zurzeit gibt es keine Arbeitsanweisungen.</Muted>}
    </Screen>
  );
}

function Body({ item, onOpenFile }: { item: Instruction; onOpenFile?: () => void }) {
  return (
    <>
      {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
      {item.file_path && (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            if (item.file_url) Linking.openURL(item.file_url);
            onOpenFile?.();
          }}
          style={styles.file}
          {...ui('chip')}
        >
          <Text style={styles.fileIcon}>📄</Text>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.file_name ?? 'Datei'} öffnen
          </Text>
        </Pressable>
      )}
      {item.file_path && !item.file_url && <Muted>Die Datei lädt gerade nicht. Bitte gleich noch einmal versuchen.</Muted>}
    </>
  );
}

function OpenInstruction({ item, onDone }: { item: Instruction; onDone: () => void }) {
  const [fileOpened, setFileOpened] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsFile = Boolean(item.file_path) && !fileOpened;

  async function confirm() {
    setBusy(true);
    try {
      await confirmInstruction(item.id);
      setError(null);
      onDone();
    } catch {
      setError('Bestätigen hat nicht geklappt. Bitte Netz prüfen und noch einmal tippen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.open}>
      <Text style={styles.badge}>Neu · {dateLabel(item.created_at)}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Body item={item} onOpenFile={() => setFileOpened(true)} />
      {needsFile && <Muted>Bitte zuerst die Datei öffnen und lesen.</Muted>}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: needsFile }}
        disabled={needsFile}
        onPress={() => setChecked((c) => !c)}
        style={[styles.check, needsFile && { opacity: 0.5 }]}
      >
        <View style={[styles.box, checked && styles.boxOn]}>{checked && <Text style={styles.tick}>✓</Text>}</View>
        <Text style={styles.checkText}>Ich habe die Arbeitsanweisung gelesen und verstanden und halte mich daran.</Text>
      </Pressable>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button title="Bestätigen" onPress={confirm} disabled={!checked || needsFile} busy={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontWeight: '600' },
  open: { borderColor: colors.accent, borderWidth: 2 },
  badge: { color: colors.accent, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 18, fontWeight: '800', color: colors.fg },
  body: { color: colors.fg, fontSize: 15, lineHeight: 22 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 12, backgroundColor: colors.bg },
  fileIcon: { fontSize: 18 },
  fileName: { flex: 1, color: colors.accent, fontWeight: '700' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: '#fff', fontWeight: '800' },
  checkText: { flex: 1, color: colors.fg, fontWeight: '600' },
});
