import { Link, Redirect, Slot, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, Logo, ThemeToggle, ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/admin', label: 'Verkäufe' },
  { href: '/admin/team', label: 'Team und Ziele' },
  { href: '/admin/statistik', label: 'Statistik' },
  { href: '/admin/provision', label: 'Provision' },
  { href: '/admin/auslieferungen', label: 'Cashflow' },
  { href: '/admin/anzeige', label: 'Büro-Anzeige' },
] as const;

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const path = usePathname();
  if (profile?.role !== 'admin') return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.bar} {...ui('topbar')}>
        <View style={styles.barInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Logo height={36} />
            <Text style={styles.brand}>Scoreboard · Admin</Text>
          </View>
          <View style={styles.nav}>
            {NAV.map((n) => {
              const active = n.href === '/admin' ? path === '/admin' : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} style={[styles.navItem, active && styles.navActive]} {...ui(active ? 'nav-active' : 'nav')}>
                  {n.label}
                </Link>
              );
            })}
            <ThemeToggle />
            <Text onPress={signOut} style={styles.navItem} accessibilityRole="button">Abmelden</Text>
          </View>
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface, borderBottomWidth: 3, borderColor: colors.accent },
  barInner: { maxWidth: 1100, width: '100%', alignSelf: 'center', padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontWeight: '700', fontSize: 14, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flexShrink: 1, maxWidth: '100%' },
  navItem: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7, color: colors.muted, fontWeight: '600' },
  navActive: { backgroundColor: colors.accent, color: '#fff' },
});
