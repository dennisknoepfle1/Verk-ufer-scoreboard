import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, colors, H2, Muted, ui } from '@/components/ui';

export type CheckState = 'alarm' | 'ok' | 'unknown';

/**
 * Rahmen für eine Prüfung im Prozessboard: Titel, Ampel mit Zahl, kurze Erklärung, darunter die Einzelheiten.
 * Neue Prüfungen nutzen denselben Rahmen und werden in src/app/(app)/admin/prozesse.tsx eingetragen.
 */
export function ProcessCheck({
  title,
  what,
  state,
  count,
  stateLabel,
  children,
}: {
  title: string;
  what: string;
  state: CheckState;
  count?: number;
  stateLabel: string;
  children?: ReactNode;
}) {
  const tone = state === 'alarm' ? colors.danger : state === 'ok' ? colors.good : colors.muted;
  const soft = state === 'alarm' ? colors.dangerSoft : state === 'ok' ? colors.goodSoft : colors.line;
  return (
    <Card>
      <View style={styles.head}>
        <View style={[styles.light, { backgroundColor: soft, borderColor: tone }]} {...ui('kpi')}>
          <Text style={[styles.count, { color: tone }]}>{state === 'unknown' ? '–' : (count ?? 0)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <H2>{title}</H2>
          <Text style={[styles.state, { color: tone }]}>{stateLabel}</Text>
          <Muted>{what}</Muted>
        </View>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  light: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  state: { fontWeight: '700' },
});
