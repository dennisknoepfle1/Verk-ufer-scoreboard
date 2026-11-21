import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { CountUp } from '@/components/CountUp';
import { MobileSettings, timeLabel } from '@/components/process/MobileSettings';
import { Button, Loading, Notice, Screen, ui } from '@/components/ui';
import { fetchProcessBoard, useLive } from '@/lib/data';
import { redCount, runChecks, type CaseItem, type CheckGroup, type CheckResult } from '@/lib/process-checks';

/**
 * Prozessboard: Leitstand im dunklen Dashboard-Look. Oben die Gesamtlage (Ring + Ampelleiste),
 * darunter die Kacheln je Prüfung, unten die Fälle der gewählten Kachel mit Links zu Asana bzw. mobile.de.
 * Neue Prüfung: in src/lib/process-checks.ts (runChecks) ergänzen und hier ein Symbol in ICONS eintragen.
 * Effekte (Glühen, Pulsieren, Einblenden) stehen in public/design.css unter „Prozessboard“.
 */
const GROUPS: { key: CheckGroup; icon: string }[] = [
  { key: 'Einkauf und Aufbereitung', icon: '🛠️' },
  { key: 'Verkauf und mobile.de', icon: '🌐' },
  { key: 'Auslieferung und Geld', icon: '💶' },
  { key: 'Ordnung in Asana', icon: '🗂️' },
];
const ICONS: Record<string, string> = {
  admin: '📋',
  werkstatt: '🔧',
  'mobile-verkauft': '🚨',
  'mobile-fehlt': '📴',
  'mobile-unbekannt': '❓',
  'mobile-bilder': '📷',
  langsteher: '⏳',
  termin: '📅',
  verkaufsdaten: '🧾',
  abrechnung: '🧮',
  'asana-ordnung': '🧹',
};
const PAGE = 40;

// Feste dunkle Farben wie /dashboard (unabhängig vom hellen/dunklen Modus).
const pb = {
  fg: '#f5f5f5',
  muted: '#9a9ea3',
  red: '#ff4552',
  redDeep: '#e30614',
  gold: '#f2c94c',
  good: '#5cc98f',
  grey: '#6b6f75',
  track: 'rgba(255,255,255,0.08)',
};

type State = 'alarm' | 'warn' | 'ok' | 'unknown';
const stateOf = (c: CheckResult): State => (c.unavailable ? 'unknown' : redCount(c) > 0 ? 'alarm' : c.items.length > 0 ? 'warn' : 'ok');
const toneOf = (s: State) => (s === 'alarm' ? pb.red : s === 'warn' ? pb.gold : s === 'ok' ? pb.good : pb.grey);
const chipOf = (s: State) => (s === 'alarm' ? 'KRITISCH' : s === 'warn' ? 'PRÜFEN' : s === 'ok' ? 'SAUBER' : 'KEINE DATEN');
const web = Platform.OS === 'web';

export default function Prozessboard() {
  const { data, error, reload } = useLive(fetchProcessBoard, []);
  const checks = useMemo(() => (data ? runChecks(data) : null), [data]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  if (error && !data) return <Screen><Notice tone="danger">Prozessboard konnte nicht geladen werden: {error}</Notice></Screen>;
  if (!data || !checks) return <Loading />;

  const states = checks.map(stateOf);
  const red = states.filter((s) => s === 'alarm').length;
  const warn = states.filter((s) => s === 'warn').length;
  const ok = states.filter((s) => s === 'ok').length;
  const rated = states.filter((s) => s !== 'unknown').length;
  const health = rated ? Math.round(((rated - red) / rated) * 100) : 0;
  const redCases = checks.reduce((a, c) => a + (c.unavailable ? 0 : redCount(c)), 0);
  const maxRed = Math.max(1, ...checks.map((c) => (c.unavailable ? 0 : redCount(c))));
  const current = checks.find((c) => c.key === chosen) ?? checks.find((c) => stateOf(c) === 'alarm') ?? checks[0];
  const choose = (key: string) => {
    setChosen(key);
    setShown(PAGE);
  };

  return (
    <View style={{ flex: 1 }} {...ui('pb')}>
      <Screen maxWidth={1180}>
        {/* ---------- Gesamtlage ---------- */}
        <View style={styles.hero} {...ui('pb-hero')}>
          <View style={styles.heroScan} {...ui('pb-scan')} />
          <View style={styles.heroRow}>
            <View
              style={[styles.ring, web && ({ backgroundImage: ringGradient(health) } as object)]}
              {...ui(red ? 'pb-ring-alarm' : 'pb-ring-ok')}
            >
              <View style={styles.ringInner}>
                <CountUp value={health} format={(n) => `${Math.round(n)}%`} style={[styles.ringValue, { color: red ? pb.fg : pb.good }]} />
                <Text style={styles.ringLabel}>SAUBER</Text>
              </View>
            </View>

            <View style={{ flex: 1, minWidth: 240, gap: 6 }}>
              <View style={styles.liveRow}>
                <View style={styles.liveDot} {...ui('pb-live')} />
                <Text style={styles.liveText}>LIVE · mobile.de {timeLabel(data.mobileStatus?.last_success_at)} · Asana alle 15 Min.</Text>
              </View>
              <Text style={styles.heroTitle} {...ui('pb-title')}>PROZESSBOARD</Text>
              <Text style={[styles.heroSummary, { color: red ? pb.red : pb.good }]}>
                {red ? `${red} von ${checks.length} Prozessen brauchen Aufmerksamkeit` : 'Alle Prozesse laufen sauber'}
              </Text>
            </View>

            <View style={styles.stats}>
              <Stat value={red} label="kritisch" color={pb.red} glow={red > 0} />
              <Stat value={warn} label="prüfen" color={pb.gold} />
              <Stat value={ok} label="sauber" color={pb.good} />
              <Stat value={redCases} label="offene Fälle" color={pb.fg} />
            </View>
          </View>

          {/* Ampelleiste: ein Segment je Prozess */}
          <View style={styles.strip}>
            {checks.map((c, i) => {
              const s = stateOf(c);
              return (
                <Pressable
                  key={c.key}
                  onPress={() => choose(c.key)}
                  accessibilityLabel={c.title}
                  style={[styles.segment, { backgroundColor: toneOf(s), opacity: c.key === current.key ? 1 : 0.78 }, web && ({ animationDelay: `${0.25 + i * 0.05}s` } as object)]}
                  {...ui(s === 'alarm' ? 'pb-seg-alarm' : 'pb-seg')}
                />
              );
            })}
          </View>
        </View>

        {/* ---------- Kacheln ---------- */}
        {GROUPS.map((g, gi) => {
          const list = checks.filter((c) => c.group === g.key);
          const groupRed = list.filter((c) => stateOf(c) === 'alarm').length;
          return (
            <View key={g.key} style={{ gap: 10 }}>
              <View style={styles.groupHead} {...ui('pb-group')}>
                <Text style={styles.groupIcon}>{g.icon}</Text>
                <Text style={styles.groupTitle}>{g.key.toUpperCase()}</Text>
                <View style={styles.groupLine} />
                <Text style={[styles.groupCount, { color: groupRed ? pb.red : pb.good }]}>
                  {groupRed ? `${groupRed} rot` : 'alles im Griff'}
                </Text>
              </View>
              <View style={styles.tiles}>
                {list.map((c, i) => (
                  <Tile
                    key={c.key}
                    c={c}
                    active={c.key === current.key}
                    maxRed={maxRed}
                    delay={0.1 + gi * 0.12 + i * 0.06}
                    onPress={() => choose(c.key)}
                  />
                ))}
              </View>
            </View>
          );
        })}

        {/* ---------- Fälle der gewählten Kachel ---------- */}
        <Detail key={current.key} c={current} shown={shown} onMore={() => setShown(current.items.length)} />

        <MobileSettings status={data.mobileStatus} onChanged={reload} />
      </Screen>
    </View>
  );
}

function ringGradient(health: number) {
  const deg = Math.max(0, Math.min(100, health)) * 3.6;
  return `conic-gradient(from -90deg, #5cc98f 0deg, #2fa36b ${deg}deg, #e30614 ${deg}deg, #8a0710 360deg)`;
}

function Stat({ value, label, color, glow }: { value: number; label: string; color: string; glow?: boolean }) {
  return (
    <View style={styles.stat} {...ui(glow ? 'pb-stat-alarm' : 'pb-stat')}>
      <CountUp value={value} style={[styles.statValue, { color }]} />
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function Tile({ c, active, maxRed, delay, onPress }: { c: CheckResult; active: boolean; maxRed: number; delay: number; onPress: () => void }) {
  const s = stateOf(c);
  const tone = toneOf(s);
  const n = s === 'warn' ? c.items.length : s === 'unknown' ? 0 : redCount(c);
  const share = s === 'alarm' ? Math.max(0.06, Math.sqrt(redCount(c) / maxRed)) : s === 'warn' ? 0.18 : s === 'ok' ? 1 : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.tile, { borderColor: active ? tone : 'rgba(255,255,255,0.07)' }, web && ({ animationDelay: `${delay}s` } as object)]}
      {...ui(`pb-tile-${s}${active ? '-active' : ''}`)}
    >
      <View style={[styles.tileGlow, { backgroundColor: tone }]} {...ui('pb-tile-glow')} />
      <View style={styles.tileTop}>
        <Text style={styles.tileIcon}>{ICONS[c.key] ?? '•'}</Text>
        <View style={[styles.chip, { borderColor: tone }]}>
          <View style={[styles.chipDot, { backgroundColor: tone }]} {...ui(s === 'alarm' ? 'pb-blink' : 'pb-dot')} />
          <Text style={[styles.chipText, { color: tone }]}>{chipOf(s)}</Text>
        </View>
      </View>
      {s === 'unknown' ? (
        <Text style={[styles.tileCount, { color: pb.grey }]}>–</Text>
      ) : s === 'ok' ? (
        <Text style={[styles.tileCount, { color: pb.good }]} {...ui('pb-check')}>✓</Text>
      ) : (
        <CountUp value={n} style={[styles.tileCount, { color: tone }]} />
      )}
      <Text style={styles.tileTitle} numberOfLines={2}>
        {c.title}
      </Text>
      <Text style={styles.tileSub} numberOfLines={1}>
        {s === 'unknown'
          ? (c.unavailable ?? 'noch keine Daten')
          : s === 'ok'
            ? 'alles sauber'
            : s === 'warn'
              ? `${c.items.length} zum Prüfen (gelb)`
              : c.warnCount
                ? `rot · dazu ${c.warnCount} gelb`
                : redCount(c) === 1 ? 'offener Fall' : 'offene Fälle'}
      </Text>
      <View style={styles.tileTrack}>
        <View style={[styles.tileFill, { width: `${share * 100}%`, backgroundColor: tone }]} {...ui('pb-fill')} />
      </View>
    </Pressable>
  );
}

function Detail({ c, shown, onMore }: { c: CheckResult; shown: number; onMore: () => void }) {
  const s = stateOf(c);
  const tone = toneOf(s);
  const n = redCount(c);
  return (
    <View style={[styles.detail, { borderColor: tone }]} {...ui('pb-detail')}>
      <View style={styles.detailHead}>
        <View style={[styles.detailBadge, { borderColor: tone }]} {...ui(s === 'alarm' ? 'pb-badge-alarm' : 'pb-badge')}>
          <Text style={styles.detailIcon}>{ICONS[c.key] ?? '•'}</Text>
          {s === 'unknown' ? (
            <Text style={[styles.detailCount, { color: pb.grey }]}>–</Text>
          ) : (
            <CountUp value={s === 'warn' ? c.items.length : n} style={[styles.detailCount, { color: tone }]} />
          )}
        </View>
        <View style={{ flex: 1, gap: 4, minWidth: 220 }}>
          <Text style={styles.detailTitle}>{c.title}</Text>
          <Text style={[styles.detailState, { color: tone }]}>
            {c.unavailable
              ? c.unavailable
              : n > 0
                ? `${n} ${n === 1 ? 'Fall' : 'Fälle'}${c.warnCount ? ` · dazu ${c.warnCount} gelb` : ''}`
                : c.items.length
                  ? `nichts Rotes · ${c.items.length} gelb`
                  : 'Alles sauber'}
          </Text>
          <Text style={styles.detailWhat}>{c.what}</Text>
        </View>
      </View>

      {c.items.length === 0 && !c.unavailable ? (
        <View style={styles.clean} {...ui('pb-clean')}>
          <Text style={styles.cleanIcon}>✓</Text>
          <Text style={styles.cleanText}>Hier läuft alles sauber.</Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {c.items.slice(0, shown).map((i) => (
            <Row key={i.key} i={i} />
          ))}
        </View>
      )}
      {c.items.length > shown && <Button small variant="ghost" title={`Alle ${c.items.length} anzeigen`} onPress={onMore} />}
    </View>
  );
}

function Row({ i }: { i: CaseItem }) {
  const go = (url: string | null | undefined) => (url ? () => Linking.openURL(url) : undefined);
  const tone = i.warn ? pb.gold : pb.red;
  return (
    <View style={styles.row} {...ui('pb-row')}>
      <View style={styles.dotWrap}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        {!i.warn && <View style={[styles.ping, { borderColor: tone }]} {...ui('pb-ping')} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, i.url ? { color: pb.fg } : null]} numberOfLines={1} onPress={go(i.url)}>
          {i.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={2}>
          {i.detail}
        </Text>
      </View>
      {i.days != null && i.days >= 0 ? (
        <View style={[styles.days, { borderColor: tone }]}>
          <Text style={[styles.daysText, { color: tone }]}>{i.days} T.</Text>
        </View>
      ) : null}
      {i.url2 ? (
        <Text style={styles.link} onPress={go(i.url2.url)}>
          {i.url2.label} ›
        </Text>
      ) : null}
    </View>
  );
}

const glass = { backgroundColor: 'rgba(30,30,32,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' };

const styles = StyleSheet.create({
  hero: { ...glass, borderRadius: 22, padding: 20, gap: 18, overflow: 'hidden' },
  heroScan: { position: 'absolute', left: 0, right: 0, top: 0, height: 2 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 22 },
  ring: { width: 132, height: 132, borderRadius: 66, padding: 9, backgroundColor: pb.redDeep },
  ringInner: { flex: 1, borderRadius: 60, backgroundColor: '#141416', alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ringLabel: { color: pb.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: pb.red },
  liveText: { color: pb.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  heroTitle: { color: pb.fg, fontSize: 34, fontWeight: '800', letterSpacing: 2 },
  heroSummary: { fontSize: 18, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { minWidth: 92, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
  statValue: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: pb.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  strip: { flexDirection: 'row', gap: 5, height: 10 },
  segment: { flex: 1, borderRadius: 6 },

  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  groupIcon: { fontSize: 18 },
  groupTitle: { color: pb.fg, fontWeight: '800', fontSize: 13, letterSpacing: 1.6 },
  groupLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  groupCount: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { ...glass, width: 210, flexGrow: 1, maxWidth: 290, minHeight: 168, borderWidth: 1.5, borderRadius: 18, padding: 14, gap: 4, overflow: 'hidden' },
  tileGlow: { position: 'absolute', width: 160, height: 160, borderRadius: 80, right: -60, top: -70, opacity: 0.16 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileIcon: { fontSize: 22 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  tileCount: { fontSize: 44, lineHeight: 50, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileTitle: { color: pb.fg, fontWeight: '700', fontSize: 15 },
  tileSub: { color: pb.muted, fontSize: 12 },
  tileTrack: { height: 5, borderRadius: 3, backgroundColor: pb.track, overflow: 'hidden', marginTop: 'auto' as unknown as number },
  tileFill: { height: '100%', borderRadius: 3 },

  detail: { ...glass, borderWidth: 1.5, borderRadius: 22, padding: 18, gap: 14 },
  detailHead: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  detailBadge: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  detailIcon: { fontSize: 18 },
  detailCount: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  detailTitle: { color: pb.fg, fontSize: 22, fontWeight: '800' },
  detailState: { fontWeight: '800' },
  detailWhat: { color: pb.muted },
  clean: { alignItems: 'center', paddingVertical: 26, gap: 6 },
  cleanIcon: { color: pb.good, fontSize: 44, fontWeight: '800' },
  cleanText: { color: pb.muted, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' },
  dotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  ping: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  rowTitle: { color: pb.fg, fontWeight: '700' },
  rowSub: { color: pb.muted, fontSize: 13 },
  days: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  daysText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  link: { color: '#ff6b75', fontWeight: '800', fontSize: 13 },
});
