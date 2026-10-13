// Lageplan für das 3D-Autohaus: Jede Station auf dem Asana-Board ist eine Zone auf dem Gelände,
// jedes Fahrzeug bekommt dort einen Stellplatz. Grob nach dem Luftbild: Gebäude links, großer Bestandsplatz
// rechts der Zufahrt, Showroom-Reihe vorne an der Straße, Anlieferung hinter dem Haus. Einheiten ≈ Meter.

export type Zone = {
  key: string;
  label: string;
  /** erster Stellplatz */
  x0: number;
  z0: number;
  cols: number;
  /** Abstand zwischen Plätzen; negatives sz = Reihen wachsen nach hinten (Norden) */
  sx: number;
  sz: number;
  maxRows: number;
};

export const ZONES: Zone[] = [
  // hinter dem Haus: Anlieferung und Papierkram
  { key: 'beschaffung', label: 'Beschaffung', x0: -63, z0: -26, cols: 4, sx: 2.8, sz: -5.5, maxRows: 3 },
  { key: 'logistik', label: 'Logistik', x0: -49, z0: -26, cols: 3, sx: 2.8, sz: -5.5, maxRows: 3 },
  { key: 'administration', label: 'Administration', x0: -37, z0: -26, cols: 3, sx: 2.8, sz: -5.5, maxRows: 3 },
  { key: 'anlage', label: 'Anlage', x0: -25, z0: -26, cols: 3, sx: 2.8, sz: -5.5, maxRows: 3 },
  // links neben dem Haus: Werkstatt, davor Auszahlung
  { key: 'werkstatt', label: 'Werkstatt', x0: -84, z0: -20, cols: 6, sx: 2.8, sz: 5.5, maxRows: 5 },
  { key: 'auszahlung', label: 'Auszahlung', x0: -84, z0: 10, cols: 9, sx: 2.8, sz: 5.5, maxRows: 3 },
  // vorne vor dem Showroom
  { key: 'fertig', label: 'Fertig', x0: -48, z0: 12, cols: 12, sx: 2.8, sz: 5.5, maxRows: 1 },
  { key: 'auslieferung', label: 'Auslieferung', x0: -10, z0: 12, cols: 3, sx: 2.8, sz: 5.5, maxRows: 2 },
  // großer Platz rechts der Zufahrt
  { key: 'bestand', label: 'Bestand', x0: 10, z0: -38, cols: 26, sx: 2.8, sz: 5, maxRows: 13 },
];

const ZONE_BY_KEY = new Map(ZONES.map((z) => [z.key, z]));

type Station = { key: string; match: RegExp };

/** Board-Spalte → Zone (null: nicht auf dem Hof, z. B. Stornos, Buchhaltung, Abgeschlossen). Stationen aus deliveries.ts. */
export function zoneOf(section: string, stations: Station[]): Zone | null {
  const st = stations.find((s) => s.match.test(section));
  return st ? ZONE_BY_KEY.get(st.key) ?? null : null;
}

export function slot(z: Zone, i: number) {
  return { x: z.x0 + (i % z.cols) * z.sx, z: z.z0 + Math.floor(i / z.cols) * z.sz };
}

/** Mitte über der Zone für das Schild. */
export function labelPos(z: Zone, count: number) {
  const rows = Math.max(1, Math.min(z.maxRows, Math.ceil(count / z.cols)));
  const x = z.x0 + ((z.cols - 1) * z.sx) / 2;
  if (z.sz < 0) return { x, z: z.z0 + (rows - 1) * z.sz - 5 }; // hinter den Autos
  if (z.z0 > 0) return { x, z: z.z0 + (rows - 1) * z.sz + 4 }; // vorne: davor, damit die Leuchtschrift frei bleibt
  return { x, z: z.z0 - 5 };
}

export type CarIn = { gid: string; section: string; days?: number | null };
export type CarOut = { gid: string; zone: string; x: number; z: number; long: boolean };

/** Stellplätze vergeben. Älteste zuerst, damit Autos beim Nachladen nicht springen. Was nicht passt, zählt als „+N“. */
export function layoutCars(cars: CarIn[], stations: Station[]) {
  const byZone = new Map<string, CarIn[]>();
  for (const c of cars) {
    const z = zoneOf(c.section, stations);
    if (!z) continue;
    if (!byZone.has(z.key)) byZone.set(z.key, []);
    byZone.get(z.key)!.push(c);
  }
  const placed: CarOut[] = [];
  const counts: { zone: Zone; count: number; hidden: number }[] = [];
  for (const z of ZONES) {
    const list = (byZone.get(z.key) ?? []).sort((a, b) => a.gid.localeCompare(b.gid));
    const cap = z.cols * z.maxRows;
    list.slice(0, cap).forEach((c, i) => placed.push({ gid: c.gid, zone: z.key, ...slot(z, i), long: (c.days ?? 0) >= 60 }));
    counts.push({ zone: z, count: list.length, hidden: Math.max(0, list.length - cap) });
  }
  return { placed, counts };
}
