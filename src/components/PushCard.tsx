import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { usePush } from '@/lib/push';
import { Button, colors, ui } from './ui';

/** Schalter für Push-Nachrichten (neue Verkäufe, für Verkäufer auch neue Arbeitsanweisungen) auf diesem Gerät. */
export function PushCard() {
  const { profile } = useAuth();
  const { state, busy, error, toggle } = usePush(profile?.id);
  if (!state || state === 'unsupported') return null;
  const what = profile?.role === 'seller' ? 'ein Kollege einen Verkauf einträgt oder es eine neue Arbeitsanweisung gibt' : 'ein Kollege einen Verkauf einträgt';

  const text = {
    on: `Ein: Du bekommst eine Nachricht, sobald ${what}.`,
    off: `Bekomme eine Nachricht aufs Handy, sobald ${what}.`,
    denied: 'Benachrichtigungen sind für diese Seite blockiert. Erlaube sie in den Einstellungen des Handys bzw. Browsers.',
    'ios-install': 'Auf dem iPhone: In Safari unten auf Teilen tippen, „Zum Home-Bildschirm“ wählen und die App von dort öffnen. Dann hier einschalten.',
  }[state];

  return (
    <View style={styles.box} {...ui('card')}>
      <View style={styles.row}>
        <Text style={styles.title}>🔔 Benachrichtigungen</Text>
        {(state === 'on' || state === 'off') && (
          <Button small title={state === 'on' ? 'Ausschalten' : 'Einschalten'} variant={state === 'on' ? 'ghost' : 'primary'} busy={busy} onPress={toggle} />
        )}
      </View>
      <Text style={styles.text}>{text}</Text>
      {error ? <Text style={styles.error}>Hat nicht geklappt: {error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, gap: 8, backgroundColor: colors.surface },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { fontWeight: '700', fontSize: 16, color: colors.fg, flexShrink: 1 },
  text: { color: colors.muted },
  error: { color: colors.danger, fontWeight: '600' },
});
