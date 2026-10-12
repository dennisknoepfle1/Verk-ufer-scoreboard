// Abzeichen: werden in der Datenbank berechnet (seller_badges), hier stehen Symbol und Beschreibung.

export const BADGES = {
  durchstarter: { icon: '🚀', label: 'Durchstarter', hint: 'Erster Verkauf überhaupt' },
  hattrick: { icon: '🎩', label: 'Hattrick', hint: '3 Verkäufe an einem Tag' },
  winterkoenig: { icon: '❄️', label: 'Winterkönig', hint: 'Die meisten Winterräder im Monat' },
  ziel: { icon: '🎯', label: 'Ziel erreicht', hint: 'Monatsziel geschafft' },
  serie: { icon: '🔥', label: 'Serientäter', hint: '3 Monate in Folge das Ziel erreicht' },
  kundenliebling: { icon: '❤️', label: 'Kundenliebling', hint: 'Ø mindestens 4,5 Sterne bei 3 Bewertungen' },
} as const;

export type BadgeKey = keyof typeof BADGES;
const ORDER = Object.keys(BADGES) as BadgeKey[];

/** Zeilen aus der Datenbank je Verkäufer bündeln, in fester Reihenfolge, unbekannte ignorieren. */
export function groupBadges(rows: { seller_id: string; badge: string }[]): Record<string, BadgeKey[]> {
  const out: Record<string, BadgeKey[]> = {};
  for (const r of rows) {
    if (!(r.badge in BADGES)) continue;
    const list = (out[r.seller_id] ??= []);
    if (!list.includes(r.badge as BadgeKey)) list.push(r.badge as BadgeKey);
  }
  for (const list of Object.values(out)) list.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return out;
}

export const badgeIcons = (list: BadgeKey[] | undefined) => (list ?? []).map((b) => BADGES[b].icon).join(' ');
