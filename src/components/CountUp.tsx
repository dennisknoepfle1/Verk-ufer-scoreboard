import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, type TextStyle } from 'react-native';

/** Zahl, die beim Erscheinen und bei Änderungen sanft hochzählt. */
export function CountUp({ value, format = (n) => String(Math.round(n)), style, duration = 1100 }: {
  value: number;
  format?: (n: number) => string;
  style?: TextStyle | TextStyle[];
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const start = from.current;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce || typeof requestAnimationFrame === 'undefined') {
          from.current = value;
          setShown(value);
          return;
        }
        const t0 = Date.now();
        const tick = () => {
          const p = Math.min(1, (Date.now() - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          const v = start + (value - start) * eased;
          from.current = v;
          setShown(v);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return <Text style={style} accessibilityLabel={format(value)}>{format(shown)}</Text>;
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Kennzahl als Text: ganze Zahlen und Euro-Beträge zählen hoch, alles andere erscheint direkt. */
export function AnimatedValue({ text, style }: { text: string; style?: TextStyle | TextStyle[] }) {
  if (/^\d+$/.test(text)) return <CountUp value={Number(text)} style={style} />;
  const m = /^(-?[\d.]+) €$/.exec(text.replace(/ /g, ' '));
  if (m) return <CountUp value={Number(m[1].replace(/\./g, ''))} format={(n) => euro.format(n)} style={style} duration={1400} />;
  return <Text style={style}>{text}</Text>;
}
