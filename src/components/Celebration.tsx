import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const RED = '#e30614';
const CONFETTI_COLORS = [RED, '#ffffff', '#f2c94c', '#ff6b72', '#c9d3dd'];
const DURATION = 7000;
const useNative = Platform.OS !== 'web';

export type CelebrationInfo = { key: string; name: string; vehicle: string };

/** Vollbild-Jubel für die Büro-Anzeige: Name groß, Konfetti, nach einigen Sekunden ausblenden. */
export function Celebration({ info, onDone, scale = 1 }: { info: CelebrationInfo; onDone: () => void; scale?: number }) {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.6)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    fade.setValue(0);
    pop.setValue(0.6);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: useNative }),
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: useNative }),
    ]).start();
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 600, useNativeDriver: useNative }).start(() => onDone());
    }, DURATION);
    return () => clearTimeout(t);
  }, [info.key, fade, pop, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]} pointerEvents="none">
      {!reduceMotion && <Confetti key={info.key} width={width} height={height} />}
      <Animated.View style={[styles.card, { padding: 40 * scale, gap: 10 * scale, transform: [{ scale: pop }] }]}>
        <Text style={[styles.kicker, { fontSize: 28 * scale }]}>NEUER VERKAUF!</Text>
        <Text style={[styles.name, { fontSize: 84 * scale }]} numberOfLines={1} adjustsFontSizeToFit>
          {info.name}
        </Text>
        <Text style={[styles.vehicle, { fontSize: 32 * scale }]} numberOfLines={1}>
          {info.vehicle}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function Confetti({ width, height }: { width: number; height: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: Math.random() * width,
        size: 8 + Math.random() * 10,
        delay: Math.random() * 1200,
        fall: 2600 + Math.random() * 2400,
        drift: (Math.random() - 0.5) * 160,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        progress: new Animated.Value(0),
      })),
    [width],
  );

  useEffect(() => {
    Animated.parallel(
      pieces.map((p) =>
        Animated.timing(p.progress, { toValue: 1, duration: p.fall, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: useNative }),
      ),
    ).start();
  }, [pieces]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -30,
            width: p.size,
            height: p.size * 0.5,
            borderRadius: 2,
            backgroundColor: p.color,
            transform: [
              { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60] }) },
              { translateX: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(10,10,10,0.82)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: RED, borderRadius: 12, alignItems: 'center', maxWidth: '90%' },
  kicker: { color: '#ffffffd9', fontWeight: '700', letterSpacing: 4 },
  name: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  vehicle: { color: '#fff', fontWeight: '500', textAlign: 'center' },
});
