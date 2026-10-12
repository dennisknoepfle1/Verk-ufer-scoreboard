import { StyleSheet, Text, View } from 'react-native';

import { monthLabel, shiftMonth } from '@/lib/format';
import { Button, colors } from './ui';

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <View style={styles.row}>
      <Button small variant="ghost" title="‹" onPress={() => onChange(shiftMonth(month, -1))} />
      <Text style={styles.label}>{monthLabel(month)}</Text>
      <Button small variant="ghost" title="›" onPress={() => onChange(shiftMonth(month, 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '700', fontSize: 16, color: colors.fg, minWidth: 130, textAlign: 'center' },
});
