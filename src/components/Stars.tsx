import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/ui';

const GOLD = '#f2a900';

/** 1 bis 5 Sterne zum Antippen. Den gesetzten Stern nochmal antippen entfernt die Bewertung. */
export function StarInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value != null && n <= value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === n }}
            accessibilityLabel={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
            hitSlop={4}
            style={styles.hit}
          >
            <Text style={[styles.star, { color: on ? GOLD : colors.line }]}>★</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  hit: { paddingHorizontal: 2 },
  star: { fontSize: 20, lineHeight: 24 },
});
