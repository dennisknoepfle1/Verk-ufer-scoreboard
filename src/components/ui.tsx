import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#f3f5f7',
  surface: '#ffffff',
  fg: '#17202a',
  muted: '#5d6b78',
  line: '#dde3e9',
  accent: '#0b5fa5',
  accentSoft: '#e3eef8',
  good: '#1f7a4d',
  goodSoft: '#e2f3ea',
  danger: '#b42318',
  dangerSoft: '#fdecea',
  gold: '#b8891a',
  silver: '#7c8894',
  bronze: '#a2603a',
};

export const rankColor = (rank: number) =>
  rank === 1 ? colors.gold : rank === 2 ? colors.silver : rank === 3 ? colors.bronze : colors.fg;

export function Screen({ children, scroll = true, maxWidth = 560 }: { children: ReactNode; scroll?: boolean; maxWidth?: number }) {
  const inner = <View style={[styles.inner, { maxWidth }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const v = variant === 'primary' ? styles.btnPrimary : variant === 'danger' ? styles.btnDanger : styles.btnGhost;
  const t = variant === 'primary' ? styles.btnTextPrimary : variant === 'danger' ? styles.btnTextDanger : styles.btnTextGhost;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.btn, small && styles.btnSmall, v, (pressed || disabled) && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.accent} /> : <Text style={[styles.btnText, small && { fontSize: 14 }, t]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'good' | 'danger' }) {
  const bg = tone === 'good' ? colors.goodSoft : tone === 'danger' ? colors.dangerSoft : colors.accentSoft;
  const fg = tone === 'good' ? colors.good : tone === 'danger' ? colors.danger : colors.fg;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function Meter({ percent, color = colors.accent }: { percent: number; color?: string }) {
  return (
    <View style={styles.meter}>
      <View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  inner: { width: '100%', alignSelf: 'center', padding: 16, gap: 14 },
  h1: { fontSize: 26, fontWeight: '700', color: colors.fg },
  h2: { fontSize: 19, fontWeight: '700', color: colors.fg },
  muted: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
  btnPrimary: { backgroundColor: colors.accent },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  btnText: { fontSize: 16, fontWeight: '700' },
  btnTextPrimary: { color: '#fff' },
  btnTextGhost: { color: colors.accent },
  btnTextDanger: { color: colors.danger },
  label: { fontWeight: '600', fontSize: 14, color: colors.fg },
  hint: { fontSize: 12, color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.fg,
  },
  notice: { borderRadius: 12, padding: 12 },
  meter: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4 },
});
