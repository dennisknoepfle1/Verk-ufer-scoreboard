// Bildschirme, die tagelang offen bleiben (Büro-Anzeige), holen sich neue Versionen selbst:
// alle 5 Minuten nachsehen, ob die Startseite auf ein anderes Programmpaket zeigt, und dann neu laden.
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { bundlesOf, isNewVersion } from './version';

export function useAutoUpdate(everyMs = 5 * 60_000) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const current = bundlesOf(document.documentElement.outerHTML);
    const t = setInterval(async () => {
      try {
        const res = await fetch('/', { cache: 'no-store' });
        if (!res.ok) return;
        if (isNewVersion(current, bundlesOf(await res.text()))) window.location.reload();
      } catch {
        // Kein Netz: beim nächsten Mal wieder versuchen.
      }
    }, everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
}
