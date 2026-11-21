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
  const tagged = name.match(/\b(?:FIN|VIN)\b\s*[:.]?\s*([A-Za-z0-9]{5,17})\b/i);
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

/** Interne Nummer von mobile.de vergleichbar machen („#085“, „85“, „A-85“ → „85“). */
export function normalizeNumber(n: string | null | undefined): string | null {
  const digits = (n ?? '').match(/\d+/g)?.join('') ?? '';
  const v = digits.replace(/^0+/, '');
  return v || null;
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
      const nr = normalizeNumber(l.internal_number);
      const hits = nr ? byNumber.get(nr) : undefined;
      // Die Nummer allein reicht nur, wenn sie eindeutig ist oder die FIN nicht widerspricht.
      const candidates = (hits ?? []).filter((t) => {
        const fin = finOf(t.name);
        return !fin || !vin || vin.endsWith(fin);
      });
      if (candidates.length) match = { listing: l, task: candidates[0], by: 'nummer' };
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
