import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Darstellung: 'auto' folgt der Einstellung des Handys, sonst fest Hell oder Dunkel. Nur im Web, gespeichert im Browser.
export type ThemePref = 'auto' | 'light' | 'dark';
export const THEME_LABEL: Record<ThemePref, string> = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };
const NEXT: Record<ThemePref, ThemePref> = { auto: 'dark', dark: 'light', light: 'auto' };

function read(): ThemePref {
  if (Platform.OS !== 'web') return 'auto';
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(pref: ThemePref) {
  if (Platform.OS !== 'web') return;
  try {
    if (pref === 'auto') {
      localStorage.removeItem('theme');
      document.documentElement.removeAttribute('data-theme');
    } else {
      localStorage.setItem('theme', pref);
      document.documentElement.setAttribute('data-theme', pref);
    }
  } catch {}
}

export function useThemePref() {
  const [pref, setPref] = useState<ThemePref>('auto');
  useEffect(() => setPref(read()), []);
  const cycle = () => {
    const next = NEXT[pref];
    apply(next);
    setPref(next);
  };
  return { pref, cycle };
}
