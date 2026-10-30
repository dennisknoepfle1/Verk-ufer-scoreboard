/** Reine Regeln für Arbeitsanweisungen (ohne App-Abhängigkeiten, damit sie testbar sind). */

/** Dateiname für den Speicher: nur einfache Zeichen, damit die Adresse überall funktioniert. */
export function storageName(name: string, now = Date.now()): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'datei';
  return `${now}-${base}${ext ? `.${ext}` : ''}`;
}

/** Noch nicht bestätigte Anweisungen. */
export const openOf = <T extends { archived_at: string | null; confirmed_at: string | null }>(list: T[]) => list.filter((i) => !i.archived_at && !i.confirmed_at);

/** Diese Seiten bleiben erreichbar, auch wenn noch Anweisungen offen sind. */
export function isGateFree(path: string) {
  return path.startsWith('/anweisungen') || path.startsWith('/buero') || path.startsWith('/dashboard');
}
