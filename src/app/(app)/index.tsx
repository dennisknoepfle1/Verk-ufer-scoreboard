import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CountUp } from '@/components/CountUp';
import { BrandBar, Button, ThemeToggle, ui, colors, H2, Loading, Meter, Muted, Notice, rankColor, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { usePendingSales } from '@/lib/pending';
import { KudosFeed } from '@/components/KudosFeed';
import { PushCard } from '@/components/PushCard';
import { BADGES, badgeIcons, type BadgeKey } from '@/lib/badges';
import { fetchBadges, fetchFeed, fetchLeaderboard, fetchRatings, fetchTeamProgress, useLive } from '@/lib/data';
import { dateLabel, eur, firstName, monthLabel, monthStart } from '@/lib/format';
import { gapToNextRank, goalProgress } from '@/lib/scoring';
import { stars } from '@/lib/stats';

export default function Scoreboard() {
  const { profile, signOut } = useAuth();
  const { saved, queued } = useLocalSearchParams<{ saved?: string; queued?: string }>();
  const month = monthStart();
  const { data, error, reload } = useLive(async () => {
    const [rows, team, ratings, badges, feed] = await Promise.all([
      fetchLeaderboard(month),
      fetchTeamProgress(month),
      fetchRatings(month),
      fetchBadges(month).catch((): Record<string, BadgeKey[]> => ({})),
      fetchFeed(10).catch(() => []),
    ]);
    return { rows, team, ratings, badges, feed };
  }, [month]);
  const rows = data?.rows;
  const { pending, flush, discard } = usePendingSales(profile?.id, reload);

  if (profile?.role === 'admin') return <Redirect href="/admin" />;
  const pendingBox = pending.length > 0 && (
    <View style={styles.pending} {...ui('card')}>
          <Text style={styles.pendingTitle}>
            {pending.length === 1 ? '1 Verkauf wartet' : `${pending.length} Verkäufe warten`} auf Übertragung
          </Text>
          <Text style={styles.pendingText}>
            {queued ? 'Kein Netz: Der Verkauf ist im Handy gespeichert. ' : ''}
            Er wird automatisch gesendet, sobald du wieder Netz hast. Bis dahin zählt er noch nicht in der Rangliste.
          </Text>
          {pending.map((p) => (
            <Text key={p.client_id} style={styles.pendingItem}>
              • {p.vehicle} ({dateLabel(p.sold_on)}){p.error ? ' – wurde abgelehnt, bitte beim Admin melden' : ''}
              {p.error ? (
                <Text onPress={() => discard(p.client_id)} style={styles.link}>
                  {'  '}Entfernen
                </Text>
              ) : null}
            </Text>
          ))}
          <Button small variant="ghost" title="Jetzt senden" onPress={flush} />
        </View>
  );

  if (!rows)
    return error ? (
      <Screen>
        <BrandBar />
        <Notice tone="danger">Keine Verbindung. Rangliste und Ziele erscheinen, sobald du wieder Netz hast. Verkäufe kannst du trotzdem eintragen.</Notice>
        {pendingBox}
        <Button title="Verkauf eintragen" onPress={() => router.push('/neu')} />
        <Button variant="ghost" title="Erneut versuchen" onPress={reload} />
      </Screen>
    ) : (
      <Loading />
    );

  const me = rows.find((r) => r.seller_id === profile?.id);
  const gap = profile ? gapToNextRank(rows, profile.id) : null;
  const goal = me ? goalProgress(me.vehicles, me.target_vehicles) : null;
  const team = data ? goalProgress(data.team.vehicles, data.team.target_vehicles) : null;
  const ratings = data?.ratings ?? {};
  const badges = data?.badges ?? {};
  const myBadges = profile ? badges[profile.id] ?? [] : [];

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
      <Text style={styles.hello}>Hallo {firstName(profile?.full_name ?? '')}</Text>

      {me && (
        <View style={styles.me} {...ui('hero')}>
          <View {...ui('hero-orb')} />
          <View>
            <Text style={styles.meLabel}>Platz</Text>
            <CountUp value={me.rank} style={styles.meRank} duration={700} />
          </View>
          <View style={{ gap: 6, flex: 1 }}>
            <View>
              <Text style={styles.meLabel}>Verkaufte Fahrzeuge · {monthLabel(month)}</Text>
              <CountUp value={me.vehicles} style={styles.meValue} />
            </View>
            <View>
              <Text style={styles.meLabel}>Deine Provision</Text>
              <CountUp value={me.commission} format={eur} style={styles.meValue} duration={1400} />
            </View>
          </View>
        </View>
      )}

      {saved && pending.length === 0 ? <Notice tone="good">Gespeichert{Number(saved) ? `: +${eur(Number(saved))} Provision` : ''}.</Notice> : null}
      {pendingBox}

      <View style={styles.gap} {...ui('panel-dark')}>
        <Text style={styles.gapText}>
          {gap
            ? `Noch ${gap.vehiclesNeeded} ${gap.vehiclesNeeded === 1 ? 'Verkauf' : 'Verkäufe'} bis Platz ${gap.target.rank} (${firstName(gap.target.full_name)}).`
            : 'Du bist auf Platz 1. Halte den Vorsprung.'}
        </Text>
      </View>

      {goal && me && (
        <View style={[styles.goal, goal.reached && styles.goalDone]} {...ui('card')}>
          <View style={styles.row}>
            <Text style={styles.goalLabel}>Monatsziel</Text>
            <Text style={styles.goalValue}>
              {me.vehicles} / {me.target_vehicles} Fahrzeuge
            </Text>
          </View>
          <Meter percent={goal.percent} color={colors.good} />
          <Text style={{ color: goal.reached ? colors.good : colors.fg }}>
            {goal.reached
              ? `Ziel erreicht (${goal.percent} %).`
              : `Noch ${goal.remaining} ${goal.remaining === 1 ? 'Fahrzeug' : 'Fahrzeuge'} bis zum Ziel (${goal.percent} %).`}
          </Text>
        </View>
      )}

      {team && data && (
        <View style={styles.goal} {...ui('card')}>
          <View style={styles.row}>
            <Text style={styles.goalLabel}>Teamziel</Text>
            <Text style={styles.goalValue}>
              {data.team.vehicles} / {data.team.target_vehicles} Fahrzeuge
            </Text>
          </View>
          <Meter percent={team.percent} color={colors.accent} />
          <Text style={{ color: colors.fg }}>
            {team.reached
              ? `Teamziel erreicht (${team.percent} %).`
              : `Gemeinsam noch ${team.remaining} ${team.remaining === 1 ? 'Fahrzeug' : 'Fahrzeuge'} (${team.percent} %).`}
          </Text>
        </View>
      )}

      {myBadges.length > 0 && (
        <View style={styles.badges} {...ui('card')}>
          <Text style={styles.goalLabel}>Deine Abzeichen · {monthLabel(month)}</Text>
          <View style={styles.badgeRow}>
            {myBadges.map((b) => (
              <View key={b} style={styles.badge} {...ui('badge')} accessibilityLabel={`${BADGES[b].label}: ${BADGES[b].hint}`}>
                <Text style={styles.badgeIcon}>{BADGES[b].icon}</Text>
                <Text style={styles.badgeLabel}>{BADGES[b].label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Button title="Verkauf eintragen" onPress={() => router.push('/neu')} />
      <PushCard />

      <H2>Rangliste {monthLabel(month)}</H2>
      <View>
        {rows.map((r) => (
          <View key={r.seller_id} style={[styles.listRow, r.seller_id === profile?.id && styles.mine]} {...ui('row')}>
            <Text style={[styles.pos, { color: rankColor(r.rank) }]}>{r.rank}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {r.full_name}
              {badges[r.seller_id] ? <Text style={styles.icons}> {badgeIcons(badges[r.seller_id])}</Text> : null}
            </Text>
            {ratings[r.seller_id] && <Text style={styles.stars}>{stars(ratings[r.seller_id].avg)}</Text>}
            <Text style={styles.count}>{r.vehicles}</Text>
            <Text style={styles.eur}>{eur(r.commission)}</Text>
          </View>
        ))}
        {rows.length === 0 && <Muted>Noch keine freigegebenen Verkäufer.</Muted>}
      </View>
      <H2>Neueste Verkäufe</H2>
      <Muted>Lob deine Kollegen mit einem Daumen oder einem kurzen Kommentar.</Muted>
      <KudosFeed items={data?.feed ?? []} onChange={reload} />

      <Link href="/buero" style={styles.link}>Büro-Anzeige öffnen</Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { fontSize: 20, fontWeight: '700', color: colors.fg },
  link: { color: colors.accent, fontWeight: '600' },
  me: { backgroundColor: colors.accent, borderRadius: 8, padding: 16, flexDirection: 'row', gap: 20, alignItems: 'center' },
  meLabel: { color: '#ffffffcc', fontSize: 13 },
  meRank: { color: '#fff', fontSize: 56, fontWeight: '800', lineHeight: 60 },
  meValue: { color: '#fff', fontSize: 22, fontWeight: '700' },
  gap: { backgroundColor: colors.dark, borderRadius: 8, padding: 12 },
  gapText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  goal: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, gap: 8, backgroundColor: colors.surface },
  goalDone: { backgroundColor: colors.goodSoft, borderColor: colors.good },
  goalLabel: { color: colors.muted },
  goalValue: { fontWeight: '700', fontSize: 17, color: colors.fg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8 },
  mine: { backgroundColor: colors.accentSoft },
  pos: { width: 28, textAlign: 'center', fontWeight: '800', fontSize: 18 },
  name: { flex: 1, fontWeight: '600', color: colors.fg },
  count: { fontWeight: '700', fontSize: 18, color: colors.fg, minWidth: 24, textAlign: 'right' },
  badges: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, gap: 8, backgroundColor: colors.surface },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10 },
  badgeIcon: { fontSize: 16 },
  badgeLabel: { fontWeight: '700', color: colors.fg, fontSize: 13 },
  icons: { fontWeight: '400' },
  pending: { borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.surface, borderRadius: 8, padding: 12, gap: 6 },
  pendingTitle: { fontWeight: '800', color: colors.fg },
  pendingText: { color: colors.muted },
  pendingItem: { color: colors.fg },
  stars: { color: '#b07a00', fontWeight: '600', fontVariant: ['tabular-nums'] },
  eur: { color: colors.muted, minWidth: 80, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
