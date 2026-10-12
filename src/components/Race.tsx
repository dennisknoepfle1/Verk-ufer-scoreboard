import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { ui } from '@/components/ui';
import type { RaceLane } from '@/lib/scoring';

const RED = '#e30614';
const podium = ['#f2c94c', '#c9d3dd', '#e39a6c'];
const useNative = false; // 'left' in Prozent lässt sich nur ohne nativen Treiber animieren

/** Autorennen für die Büro-Anzeige: ein Auto je Verkäufer, Ziellinie = persönliches Monatsziel. */
export function Race({ lanes, scale: s, icons = {} }: { lanes: RaceLane[]; scale: number; icons?: Record<string, string> }) {
  const [avail, setAvail] = useState(460 * s);
  const gap = 6 * s;
  const n = Math.max(1, lanes.length);
  // Spuren füllen den freien Platz, werden aber nicht riesig und nicht winzig.
  const laneH = Math.max(28 * s, Math.min(78 * s, (avail - gap * (n - 1)) / n));
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap }} onLayout={(e) => setAvail(e.nativeEvent.layout.height)}>
      {lanes.map((l, i) => (
        <Lane key={l.seller_id} lane={l} s={s} height={laneH} delay={i * 120} icons={icons[l.seller_id]} />
      ))}
      {lanes.length === 0 && <Text style={[styles.empty, { fontSize: 24 * s }]}>Noch keine Fahrer am Start.</Text>}
    </View>
  );
}

function Lane({ lane, s, height, delay, icons }: { lane: RaceLane; s: number; height: number; delay: number; icons?: string }) {
  const pos = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pos, { toValue: lane.progress, duration: 1600, delay, useNativeDriver: useNative }).start();
  }, [lane.progress, delay, pos]);

  const carW = height * 1.9;
  const left = pos.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const badge = podium[lane.rank - 1] ?? '#ffffff';

  return (
    <View style={[styles.lane, { height, gap: 14 * s }]}>
      <View style={{ width: 200 * s }}>
        <Text style={[styles.name, { fontSize: 24 * s }]} numberOfLines={1}>
          {lane.full_name}
        </Text>
        {icons ? <Text style={{ fontSize: Math.min(18 * s, height * 0.3) }} numberOfLines={1}>{icons}</Text> : null}
      </View>
      <View style={[styles.road, { height, paddingLeft: carW }]} {...ui('road')}>
        <View style={styles.dash} {...ui('road-dash')} />
        <View style={{ flex: 1 }}>
          <Finish height={height} s={s} />
          <Animated.View style={[styles.car, { left, width: carW, height: height * 0.8, transform: [{ translateX: -carW }, { translateY: -height * 0.4 }] }]}>
            <Car w={carW} h={height * 0.8} number={lane.rank} badge={badge} />
          </Animated.View>
        </View>
      </View>
      <Text style={[styles.count, { width: 120 * s, fontSize: 28 * s }]}>
        {lane.vehicles}
        <Text style={styles.of}>/{lane.finish}</Text>
        {lane.finished ? <Text> 🏁</Text> : null}
      </Text>
    </View>
  );
}

function Car({ w, h, number, badge }: { w: number; h: number; number: number; badge: string }) {
  const wheel = h * 0.42;
  return (
    <View style={{ width: w, height: h }} {...ui('car')}>
      {/* Kabine mit Scheibe */}
      <View style={[styles.cabin, { left: w * 0.28, width: w * 0.42, height: h * 0.42, borderTopLeftRadius: h * 0.3, borderTopRightRadius: h * 0.18 }]}>
        <View style={[styles.window, { margin: h * 0.07, borderTopLeftRadius: h * 0.22, borderTopRightRadius: h * 0.12 }]} />
      </View>
      {/* Karosserie */}
      <View style={[styles.body, { top: h * 0.36, height: h * 0.38, borderRadius: h * 0.16, borderTopRightRadius: h * 0.32 }]}>
        <View style={[styles.badge, { backgroundColor: badge, width: h * 0.32, height: h * 0.32, borderRadius: h * 0.16, marginLeft: w * 0.12 }]}>
          <Text style={[styles.badgeText, { fontSize: h * 0.22, lineHeight: h * 0.32 }]}>{number}</Text>
        </View>
        <View style={[styles.light, { width: h * 0.12, height: h * 0.1, right: h * 0.04, top: h * 0.08 }]} />
      </View>
      {/* Räder */}
      {[0.16, 0.66].map((x) => (
        <View key={x} style={[styles.wheel, { left: w * x, width: wheel, height: wheel, borderRadius: wheel / 2, top: h - wheel }]}>
          <View style={[styles.rim, { width: wheel * 0.4, height: wheel * 0.4, borderRadius: wheel * 0.2 }]} />
        </View>
      ))}
    </View>
  );
}

/** Schachbrett-Ziellinie am rechten Ende der Fahrbahn. */
function Finish({ height, s }: { height: number; s: number }) {
  const sq = Math.max(6, 9 * s);
  const rows = Math.ceil(height / sq);
  return (
    <View style={[styles.finish, { width: sq * 2 }]}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          <View style={{ width: sq, height: sq, backgroundColor: r % 2 ? '#111' : '#fff' }} />
          <View style={{ width: sq, height: sq, backgroundColor: r % 2 ? '#fff' : '#111' }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#f5f5f5', fontWeight: '700' },
  road: { flex: 1, backgroundColor: '#2b2c2e', borderRadius: 6, borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#4a4b4e', justifyContent: 'center', overflow: 'hidden', paddingRight: 4 },
  dash: { position: 'absolute', left: 0, right: 0, top: '50%', borderTopWidth: 2, borderStyle: 'dashed', borderColor: '#ffffff33' },
  finish: { position: 'absolute', right: 0, top: 0, bottom: 0, overflow: 'hidden', justifyContent: 'center' },
  car: { position: 'absolute', top: '50%' },
  cabin: { position: 'absolute', top: 0, backgroundColor: '#a8040e' },
  window: { flex: 1, backgroundColor: '#cfe3f2' },
  body: { position: 'absolute', left: 0, right: 0, backgroundColor: RED, flexDirection: 'row', alignItems: 'center' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#141414', fontWeight: '800', textAlign: 'center' },
  light: { position: 'absolute', backgroundColor: '#ffe9a8', borderRadius: 2 },
  wheel: { position: 'absolute', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  rim: { backgroundColor: '#9a9ea3' },
  count: { color: '#f5f5f5', fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  of: { color: '#9a9ea3' },
  empty: { color: '#9a9ea3', textAlign: 'center' },
});
