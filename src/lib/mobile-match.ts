// Prozessboard · mobile.de-Abgleich: Welche Inserate auf mobile.de gehören zu Fahrzeugen,
// die in Asana nicht mehr im Bestand sind (also verkauft) und offline müssen?
//
// Schlüssel: In den Asana-Titeln stehen die letzten Stellen der FIN („FIN: 071474“, „VIN: K65782“, manchmal nur
// „/ 052178 /“) und die Bestandsnummer („#85“). mobile.de liefert die komplette FIN und die „Interne Nummer“.

export type Listing = {
  ad_id: string;
  vin: string | null;
  internal_number: string | null;
  title: string;
  price: number | null;
  url: string | null;
  first_seen_at: string | null;
};

export type AsanaVehicle = {
  task_gid: string;
  name: string;
  section: string;
  completed?: boolean;
  created_at?: string | null;
  sold_on?: string | null;
  permalink_url: string | null;
};

export type Match = { listing: Listing; task: AsanaVehicle; by: 'fin' | 'nummer' };

export type MobileCheck = {
  /** Online, in Asana aber schon verkauft: müssen sofort offline. */
  offline: Match[];
  /** Online und in Asana im Bestand: alles richtig. */
  ok: Match[];
  /** Online, aber in Asana nicht gefunden: bitte von Hand prüfen. */
  unknown: Listing[];
};

/**
 * Im Bestand sind nur Fahrzeuge bis einschließlich „FZG.-Verkauf (Bestand)“ (Beschaffung, Logistik, Administration,
 * Anlage, Verkauf). Alles danach gilt als verkauft (Dennis, 21.11.2026), ebenso erledigte Aufgaben.
 */
const IN_STOCK = /(beschaffung|logistik|administration|anlage|bestand)/i;
export function inStock(t: Pick<AsanaVehicle, 'section' | 'completed'>): boolean {
  return !t.completed && IN_STOCK.test(t.section) && !/storno/i.test(t.section);
}

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** FIN-Stellen aus dem Asana-Titel (mind. 5 Zeichen, mit mindestens 4 Ziffern), sonst null. */
export function finOf(name: string): string | null {
  const tagged = name.match(/\b(?:FIN|VIN)\b[\s:.]*([A-Za-z0-9]{5,17})\b/i);
  if (tagged) return clean(tagged[1]);
  // Ohne „FIN:“ steht sie als eigener Abschnitt zwischen Schrägstrichen: „BMW X3 / Auto1 / 052178 / #60“.
  for (const part of name.split('/')) {
    const p = part.trim();
    if (/^[A-Za-z0-9]{5,8}$/.test(p) && (p.match(/\d/g)?.length ?? 0) >= 4) return clean(p);
  }
  return null;
}

/** Bestandsnummer „#85“ aus dem Asana-Titel. */
export function stockNumberOf(name: string): string | null {
  const m = name.match(/#\s*0*(\d{1,6})\b/);
  return m ? m[1] : null;
}

/**
 * „Interne Nummer“ bei mobile.de. Bei euch steht dort z. B. „2093DK / #164“: vorne die letzten 4 Stellen der FIN
 * (mit Kürzel), hinten die Bestandsnummer. Ohne Schrägstrich zählen die Ziffern als Bestandsnummer.
 */
export function parseInternal(n: string | null | undefined): { fin: string | null; nr: string | null } {
  const s = (n ?? '').trim();
  const strip = (v: string | undefined) => (v ?? '').replace(/^0+/, '') || null;
  const parts = s.split('/');
  if (parts.length >= 2) {
    const fin = parts[0].trim().match(/^([A-Za-z0-9]*\d[A-Za-z0-9]*?)[A-Za-z]{0,3}$/)?.[1] ?? null;
    return { fin: fin && fin.length >= 4 ? clean(fin) : null, nr: strip(parts.slice(1).join('/').match(/\d+/)?.[0]) };
  }
  const hash = s.match(/#\s*(\d+)/);
  return { fin: null, nr: strip(hash ? hash[1] : s.match(/\d+/g)?.join('')) };
}

/** Bestandsnummer aus der internen Nummer von mobile.de („2093DK / #164“ → „164“). */
export function normalizeNumber(n: string | null | undefined): string | null {
  return parseInternal(n).nr;
}

/** Marke aus dem mobile.de-Titel in Asana-Schreibweisen („MERCEDES-BENZ CLA“ → mercedes, mb, benz). */
const BRAND_ALIASES: Record<string, string[]> = {
  'mercedes-benz': ['mercedes', 'mb', 'benz', 'amg'],
  volkswagen: ['vw', 'volkswagen'],
  vw: ['vw', 'volkswagen'],
  'land rover': ['land rover', 'range rover', 'landrover'],
};
function brandFits(title: string, taskName: string): boolean | null {
  const t = title.trim().toLowerCase();
  const key = Object.keys(BRAND_ALIASES).find((k) => t.startsWith(k));
  const brand = key ?? t.split(/[\s*]/)[0];
  if (!brand) return null;
  const aliases = key ? BRAND_ALIASES[key] : [brand];
  const name = ` ${taskName.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ')} `;
  return aliases.some((a) => name.includes(` ${a.replace(/[^a-z0-9äöüß]+/g, ' ')} `) || name.includes(` ${a}`));
}

/** Neueste Aufgabe zuerst: wird ein Auto ein zweites Mal angekauft, zählt der aktuelle Stand. */
const newest = (a: AsanaVehicle, b: AsanaVehicle) => (b.created_at ?? '').localeCompare(a.created_at ?? '');

export function matchListings(listings: Listing[], tasks: AsanaVehicle[]): MobileCheck {
  const byFin: { fin: string; task: AsanaVehicle }[] = [];
  const byNumber = new Map<string, AsanaVehicle[]>();
  for (const t of [...tasks].sort(newest)) {
    const fin = finOf(t.name);
    if (fin) byFin.push({ fin, task: t });
    const nr = stockNumberOf(t.name);
    if (nr) byNumber.set(nr, [...(byNumber.get(nr) ?? []), t]);
  }

  const result: MobileCheck = { offline: [], ok: [], unknown: [] };
  for (const l of listings) {
    const vin = clean(l.vin ?? '');
    let match: Match | null = null;
    if (vin.length >= 5) {
      // Asana hat nur die letzten Stellen: die FIN von mobile.de muss damit enden.
      const hit = byFin.find((f) => vin.endsWith(f.fin) || (f.fin.length > vin.length && f.fin.endsWith(vin)));
      if (hit) match = { listing: l, task: hit.task, by: 'fin' };
    }
    if (!match) {
      // Bestandsnummern werden wiederverwendet: passende FIN-Stellen oder Marke entscheiden, welche Aufgabe gemeint ist.
      const { fin: fin4, nr } = parseInternal(l.internal_number);
      const known = vin.length >= 5 ? vin : fin4;
      let best: { task: AsanaVehicle; score: number } | null = null;
      for (const t of (nr ? byNumber.get(nr) : undefined) ?? []) {
        const tf = finOf(t.name);
        const finOk = known && tf ? tf.endsWith(known) || known.endsWith(tf) : null;
        const brandOk = brandFits(l.title, t.name);
        if (finOk === false && brandOk !== true) continue; // anderes Auto mit derselben Nummer
        if (finOk === null && brandOk === false) continue;
        const score = (finOk ? 2 : 0) + (brandOk ? 1 : 0);
        if (!best || score > best.score) best = { task: t, score };
      }
      if (best) match = { listing: l, task: best.task, by: 'nummer' };
      // Nummer passt nicht (z. B. vertippt): FIN-Stellen + Marke, wenn genau eine Aufgabe passt.
      if (!match && known && known.length >= 4) {
        const hits = byFin.filter((f) => (f.fin.endsWith(known) || known.endsWith(f.fin)) && brandFits(l.title, f.task.name) !== false);
        if (hits.length === 1) match = { listing: l, task: hits[0].task, by: 'fin' };
      }
    }
    if (!match) result.unknown.push(l);
    else if (inStock(match.task)) result.ok.push(match);
    else result.offline.push(match);
  }
  // Am längsten online zuerst.
  const since = (l: Listing) => l.first_seen_at ?? '';
  result.offline.sort((a, b) => since(a.listing).localeCompare(since(b.listing)));
  result.unknown.sort((a, b) => since(a).localeCompare(since(b)));
  return result;
}
