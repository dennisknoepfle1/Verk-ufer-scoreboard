import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { MobileSettings, timeLabel } from '@/components/process/MobileSettings';
import { ProcessCheck } from '@/components/process/ProcessCheck';
import { Button, colors, H1, H2, Loading, Muted, Notice, Screen, ui } from '@/components/ui';
import { fetchProcessBoard, useLive } from '@/lib/data';
import { redCount, runChecks, type CaseItem, type CheckGroup, type CheckResult } from '@/lib/process-checks';

/**
 * Prozessboard: auf einen Blick, welche Abläufe sauber laufen (grün) und wo etwas hängt (rot, mit Zahl).
 * Oben die Ampel-Kacheln je Prüfung, darunter die Fälle der gewählten Kachel mit Link zu Asana bzw. mobile.de.
 * Neue Prüfung: in src/lib/process-checks.ts (runChecks) ergänzen, sie erscheint dann automatisch.
 */
const GROUPS: CheckGroup[] = ['Einkauf und Aufbereitung', 'Verkauf und mobile.de', 'Auslieferung und Geld', 'Ordnung in Asana'];
const PAGE = 40;

const stateOf = (c: CheckResult) => (c.unavailable ? 'unknown' : redCount(c) > 0 ? 'alarm' : c.items.length > 0 ? 'warn' : 'ok');

export default function Prozessboard() {
  const { data, error, reload } = useLive(fetchProcessBoard, []);
  const checks = useMemo(() => (data ? runChecks(data) : null), [data]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  if (error && !data) return <Screen><Notice tone="danger">Prozessboard konnte nicht geladen werden: {error}</Notice></Screen>;
  if (!data || !checks) return <Loading />;

  const current = checks.find((c) => c.key === chosen) ?? checks.find((c) => stateOf(c) === 'alarm') ?? checks[0];
  const red = checks.filter((c) => stateOf(c) === 'alarm').length;
  const choose = (key: string) => {
    setChosen(key);
    setShown(PAGE);
  };

  return (
    <Screen maxWidth={1100}>
      <H1>Prozessboard</H1>
      <Text style={[styles.summary, { color: red ? colors.danger : colors.good }]}>
        {red ? `${red} von ${checks.length} Prozessen brauchen Aufmerksamkeit` : 'Alle Prozesse laufen sauber'}
      </Text>
      <Muted>
        Stand mobile.de: {timeLabel(data.mobileStatus?.last_success_at)} · Asana wird alle 15 Minuten gelesen. Auf eine Kachel tippen zeigt die Fälle.
      </Muted>

      {GROUPS.map((g) => (
        <View key={g} style={{ gap: 8 }}>
          <Text style={styles.group}>{g}</Text>
          <View style={styles.tiles}>
            {checks
              .filter((c) => c.group === g)
              .map((c) => (
                <Tile key={c.key} c={c} active={c.key === current.key} onPress={() => choose(c.key)} />
              ))}
          </View>
        </View>
      ))}

      <ProcessCheck
        title={current.title}
        what={current.what}
        state={stateOf(current) === 'alarm' ? 'alarm' : stateOf(current) === 'unknown' ? 'unknown' : 'ok'}
        count={redCount(current)}
        stateLabel={
          current.unavailable
            ? current.unavailable
            : redCount(current) > 0
              ? `${redCount(current)} ${redCount(current) === 1 ? 'Fall' : 'Fälle'}${current.warnCount ? ` · dazu ${current.warnCount} gelb` : ''}`
              : current.items.length
                ? `nichts Rotes · ${current.items.length} gelb`
                : 'Alles sauber'
        }
      >
        <View>
          {current.items.slice(0, shown).map((i) => (
            <Row key={i.key} i={i} />
          ))}
        </View>
        {current.items.length > shown && (
          <Button small variant="ghost" title={`Alle ${current.items.length} anzeigen`} onPress={() => setShown(current.items.length)} />
        )}
      </ProcessCheck>

      <MobileSettings status={data.mobileStatus} onChanged={reload} />
    </Screen>
  );
}

function Tile({ c, active, onPress }: { c: CheckResult; active: boolean; onPress: () => void }) {
  const s = stateOf(c);
  const tone = s === 'alarm' ? colors.danger : s === 'ok' ? colors.good : s === 'warn' ? colors.gold : colors.muted;
  const soft = s === 'alarm' ? colors.dangerSoft : s === 'ok' ? colors.goodSoft : colors.surface;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.tile, { backgroundColor: soft, borderColor: active ? colors.fg : tone }]}
      {...ui('kpi')}
    >
      <Text style={[styles.tileCount, { color: tone }]}>{s === 'unknown' ? '–' : s === 'warn' ? c.items.length : redCount(c)}</Text>
      <Text style={styles.tileTitle} numberOfLines={2}>
        {c.title}
      </Text>
      <Text style={styles.tileSub} numberOfLines={1}>
        {s === 'unknown' ? 'noch keine Daten' : s === 'ok' ? 'sauber' : s === 'warn' ? 'nur gelb' : c.warnCount ? `+ ${c.warnCount} gelb` : 'offen'}
      </Text>
    </Pressable>
  );
}

function Row({ i }: { i: CaseItem }) {
  const go = (url: string | null | undefined) => (url ? () => Linking.openURL(url) : undefined);
  return (
    <View style={styles.row} {...ui('row')}>
      <View style={[styles.dot, { backgroundColor: i.warn ? colors.gold : colors.danger }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, i.url ? { color: colors.accent } : null]} numberOfLines={1} onPress={go(i.url)}>
          {i.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={2}>
          {i.detail}
        </Text>
      </View>
      {i.url2 ? (
        <Text style={styles.link} onPress={go(i.url2.url)}>
          {i.url2.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { fontSize: 18, fontWeight: '800' },
  group: { color: colors.muted, fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 200, flexGrow: 1, maxWidth: 260, minHeight: 112, borderWidth: 2, borderRadius: 12, padding: 12, gap: 2 },
  tileCount: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileTitle: { color: colors.fg, fontWeight: '700' },
  tileSub: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: colors.line },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { color: colors.fg, fontWeight: '700' },
  rowSub: { color: colors.muted, fontSize: 13 },
  link: { color: colors.accent, fontWeight: '700' },
});
