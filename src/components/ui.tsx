import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Image,
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

import { THEME_LABEL, useThemePref } from '@/lib/theme';

// Farben der Autowelt Prusseit (autowelt-prusseit.de): Rot #E30614, Anthrazit #54595F, Schwarz.
// Hell (Standard). Die dunkle Variante steht in public/index.html und wird im Web über CSS-Variablen umgeschaltet.
const light = {
  bg: '#f4f4f4',
  surface: '#ffffff',
  fg: '#1d1d1b',
  muted: '#54595f',
  line: '#e2e2e2',
  accent: '#e30614',
  accentSoft: '#fdeced',
  dark: '#1d1d1b',
  good: '#1f7a4d',
  goodSoft: '#e2f3ea',
  danger: '#b42318',
  dangerSoft: '#fdecea',
  gold: '#b8891a',
  silver: '#7c8894',
  bronze: '#a2603a',
  logoPlate: 'transparent',
};

export const colors: typeof light =
  Platform.OS === 'web'
    ? (Object.fromEntries(Object.keys(light).map((k) => [k, `var(--c-${k})`])) as typeof light)
    : light;

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
  themeToggle: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  inner: { width: '100%', alignSelf: 'center', padding: 16, gap: 14 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.fg, textTransform: 'uppercase', letterSpacing: 0.3 },
  h2: { fontSize: 19, fontWeight: '700', color: colors.fg },
  muted: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  btn: { borderRadius: 6, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
  btnPrimary: { backgroundColor: colors.accent },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  btnText: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  btnTextPrimary: { color: '#fff' },
  btnTextGhost: { color: colors.accent },
  btnTextDanger: { color: colors.danger },
  label: { fontWeight: '600', fontSize: 14, color: colors.fg },
  hint: { fontSize: 12, color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.fg,
  },
  notice: { borderRadius: 12, padding: 12 },
  brandBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12, borderBottomWidth: 3, borderColor: colors.accent },
  meter: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4 },
});

const logo = require('../../assets/brand/logo.png');

/** Logo der Autowelt Prusseit (Original 280 × 80 px). */
export function Logo({ height = 44 }: { height?: number }) {
  // Im dunklen Modus steht das Logo auf einer weißen Fläche, damit die schwarzen Teile sichtbar bleiben.
  return (
    <View style={{ backgroundColor: colors.logoPlate, borderRadius: 4, padding: 3, alignSelf: 'flex-start' }}>
      <Image source={logo} accessibilityLabel="Autowelt Prusseit" style={{ height, width: (height * 280) / 80 }} resizeMode="contain" />
    </View>
  );
}

/** Weiße Kopfzeile mit Logo und rotem Abschluss, wie auf autowelt-prusseit.de. */
export function BrandBar({ right }: { right?: ReactNode }) {
  return (
    <View style={styles.brandBar}>
      <Logo height={40} />
      {right}
    </View>
  );
}

/** Umschalter Automatisch → Dunkel → Hell (nur im Web). */
export function ThemeToggle() {
  const { pref, cycle } = useThemePref();
  if (Platform.OS !== 'web') return null;
  const icon = pref === 'dark' ? '🌙' : pref === 'light' ? '☀️' : '🌓';
  return (
    <Text onPress={cycle} accessibilityRole="button" accessibilityLabel={`Darstellung: ${THEME_LABEL[pref]}. Tippen zum Wechseln`} style={styles.themeToggle}>
      {icon} {THEME_LABEL[pref]}
    </Text>
  );
}
