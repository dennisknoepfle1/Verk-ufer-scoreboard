// 3D-Modell der Autowelt Prusseit im Spiel-Look (three.js, nur im Browser).
// Gebäude mit roter Dachkante und Leuchtschrift, Hof als Pipeline: jedes Auto ist ein Fahrzeug aus Asana.
// Trotz Details sparsam gebaut: keine Schatten, alles Wiederholte (Autos, Räder, Linien, Laternen, Bäume) als
// Instanced-Mesh, damit es auch auf schwacher TV-Hardware flüssig läuft.
import { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { labelPos, slot, ZONES, type CarOut, type Zone } from '@/lib/autohaus-layout';

export type Facade = { cashflow: string; team: string; standzeit: string; einkauf: string };
export type ZoneCount = { zone: Zone; count: number; hidden: number };
type Props = { cars: CarOut[]; zones: ZoneCount[]; facade: Facade; startAngle?: number };

const MAX_CARS = 700;
const RED = '#e30614';
const FONT = 'Montserrat, Arial, sans-serif';
const PAINT = ['#f2f2f2', '#16171a', '#b9bec4', '#5d6166', '#1f2f4f', '#2b2d31', '#e8e6df', '#3a4a5c', '#8c8f93'];
const ENTRY = { x: 0, z: 46 }; // neue Autos kommen über die Zufahrt
const STEP = new Map(ZONES.map((z) => [z.key, 0]));
['beschaffung', 'logistik', 'administration', 'anlage', 'bestand', 'werkstatt', 'fertig', 'auslieferung', 'auszahlung'].forEach((k, i) => STEP.set(k, i + 1));

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const GLASS: [number, number][] = [
  [50, 130],
  [320, 320],
  [680, 160],
  [870, 100],
];

/** Fassade: dunkle Paneele, warm beleuchteter Showroom mit Autos und rote Leuchtschrift. */
function frontTexture() {
  return canvasTexture(1024, 256, (g) => {
    g.fillStyle = '#3b3e43';
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = '#30333a';
    for (let x = 0; x < 1024; x += 32) g.strokeRect(x, 0, 32, 256);
    for (const [x, w] of GLASS) {
      const glass = g.createLinearGradient(0, 112, 0, 256);
      glass.addColorStop(0, '#ffe2b0');
      glass.addColorStop(1, '#a8692f');
      g.fillStyle = glass;
      g.fillRect(x, 112, w, 144);
      // Showroom-Autos als Silhouetten hinter dem Glas
      g.fillStyle = 'rgba(40,30,25,0.55)';
      for (let i = x + 20; i + 70 < x + w; i += 110) {
        g.beginPath();
        g.roundRect(i, 214, 80, 26, 8);
        g.roundRect(i + 16, 196, 46, 22, 8);
        g.fill();
      }
      g.fillStyle = '#22252a';
      for (let i = x; i <= x + w; i += 40) g.fillRect(i, 112, 4, 144);
      g.fillRect(x, 112, w, 5);
    }
    g.font = `800 66px ${FONT}`;
    g.textBaseline = 'middle';
    g.shadowColor = '#ff1a1a';
    g.shadowBlur = 24;
    g.fillStyle = '#ff2b2b';
    g.fillText('AUTOWELT', 60, 62);
    g.fillText('PRUSSEIT.DE', 520, 62);
  });
}

function wallTexture(doors: number) {
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = '#3a3d42';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#2e3136';
    for (let x = 0; x < 512; x += 24) g.strokeRect(x, 0, 24, 128);
    // Rolltore der Werkstatt
    const w = 512 / Math.max(1, doors);
    for (let i = 0; i < doors; i++) {
      g.fillStyle = '#9da1a6';
      g.fillRect(i * w + 18, 34, w - 36, 94);
      g.fillStyle = '#80848a';
      for (let y = 40; y < 128; y += 9) g.fillRect(i * w + 18, y, w - 36, 2);
    }
    if (doors) {
      g.fillStyle = '#ffffff';
      g.font = `800 22px ${FONT}`;
      g.fillText('WERKSTATT', 16, 24);
    }
  });
}

/** Seitenwand als LED-Wand mit den Kennzahlen. */
function ledTexture(f: Facade) {
  return canvasTexture(1024, 256, (g) => {
    g.fillStyle = '#34373c';
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#070708';
    g.fillRect(28, 18, 968, 220);
    const cell = (x: number, y: number, label: string, value: string, color: string, size: number) => {
      g.shadowBlur = 0;
      g.font = `700 24px ${FONT}`;
      g.fillStyle = '#9a9ea3';
      g.fillText(label, x, y);
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.font = `800 ${size}px ${FONT}`;
      g.fillStyle = color;
      g.fillText(value, x, y + size + 4);
    };
    cell(60, 60, 'CASHFLOW IM ZULAUF', f.cashflow, '#f2c94c', 60);
    cell(560, 60, 'VERKAUFT / TEAMZIEL', f.team, '#ffffff', 60);
    cell(60, 170, 'Ø STANDZEIT', f.standzeit, '#ffffff', 38);
    cell(560, 170, 'EINGEKAUFT', f.einkauf, '#ffffff', 38);
  });
}

/** Schild über einer Zone: Schritt-Nummer, Name und groß die Anzahl. */
function labelSprite(z: ZoneCount) {
  const tex = canvasTexture(640, 240, (g) => {
    g.fillStyle = 'rgba(16,16,18,0.88)';
    g.beginPath();
    g.roundRect(6, 6, 628, 228, 28);
    g.fill();
    g.fillStyle = RED;
    g.beginPath();
    g.roundRect(6, 6, 628, 76, [28, 28, 0, 0]);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = `800 52px ${FONT}`;
    g.fillText(`${STEP.get(z.zone.key) ?? ''} · ${z.zone.label.toUpperCase()}`, 320, 46);
    g.font = `800 120px ${FONT}`;
    g.fillStyle = z.count ? '#ffffff' : '#7d8186';
    g.fillText(String(z.count), 320, 156);
    if (z.hidden) {
      g.font = `600 30px ${FONT}`;
      g.fillStyle = '#c9ccd1';
      g.fillText(`+${z.hidden} nicht im Bild`, 320, 216);
    }
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  return s;
}

function lambert(color: string, emissive?: string) {
  return new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1 : 0 });
}

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, emissive?: string) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color, emissive));
  m.position.set(x, y, z);
  return m;
}

function plane(w: number, d: number, color: string, x: number, z: number, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lambert(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

/** Viele gleiche Teile auf einmal (ein Draw-Call). */
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, spots: { x: number; y?: number; z: number; ry?: number; s?: number }[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  const o = new THREE.Object3D();
  spots.forEach((p, i) => {
    o.position.set(p.x, p.y ?? 0, p.z);
    o.rotation.set(0, p.ry ?? 0, 0);
    o.scale.setScalar(p.s ?? 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.count = spots.length;
  return mesh;
}

/** Karosserie, Kabine (Glas) und Räder als drei Geometrien, die sich dieselben Positionen teilen. */
function carGeometries() {
  const body = mergeGeometries([
    new THREE.BoxGeometry(1.8, 0.62, 4.2).translate(0, 0.62, 0),
    new THREE.BoxGeometry(1.7, 0.2, 3.9).translate(0, 1.02, 0.05), // Schulter
  ])!;
  const cab = mergeGeometries([new THREE.BoxGeometry(1.55, 0.55, 2.1).translate(0, 1.38, -0.25)])!;
  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 8).rotateZ(Math.PI / 2);
  const wheels = mergeGeometries(
    [
      [-0.85, 1.35],
      [0.85, 1.35],
      [-0.85, -1.35],
      [0.85, -1.35],
    ].map(([x, z]) => wheel.clone().translate(x, 0.36, z)),
  )!;
  const lights = mergeGeometries([
    new THREE.BoxGeometry(0.4, 0.14, 0.05).translate(-0.6, 0.78, 2.11),
    new THREE.BoxGeometry(0.4, 0.14, 0.05).translate(0.6, 0.78, 2.11),
  ])!;
  const tail = mergeGeometries([new THREE.BoxGeometry(1.5, 0.12, 0.05).translate(0, 0.82, -2.11)])!;
  return { body, cab, wheels, lights, tail };
}

/** Weicher Lichtkegel auf dem Boden unter Laternen. */
function glowTexture() {
  return canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,214,150,0.9)');
    r.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
}

function pylonTexture() {
  return canvasTexture(128, 512, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 512);
    g.fillStyle = RED;
    g.fillRect(0, 0, 128, 40);
    g.fillRect(0, 472, 128, 40);
    g.save();
    g.translate(64, 256);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 54px ${FONT}`;
    g.fillStyle = RED;
    g.fillText('AUTOWELT', 0, -26);
    g.font = `800 38px ${FONT}`;
    g.fillStyle = '#2b2d31';
    g.fillText('PRUSSEIT.DE', 0, 28);
    g.restore();
  });
}

/** Gelände, Straßen, Stellplätze, Laternen, Fahnen und das Autohaus. */
function buildWorld(scene: THREE.Scene, facade: Facade) {
  scene.add(plane(400, 300, '#2f4527', -10, 0, -0.03)); // Wiese
  scene.add(plane(84, 66, '#46484c', -46, -9, 0)); // Platz links mit Gebäude
  scene.add(plane(80, 68, '#46484c', 46, -9, 0)); // großer Bestandsplatz
  scene.add(plane(260, 10, '#2a2b2e', -20, 30, 0.01)); // Straße vorne
  scene.add(plane(9, 120, '#2a2b2e', 0, -4, 0.01)); // Zufahrt
  // Bordsteine um die Plätze
  const curb = lambert('#9ea1a5');
  for (const [cx, w] of [
    [-46, 84],
    [46, 80],
  ] as const) {
    for (const z of [-42.2, 24.2]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.25, 0.4), curb);
      b.position.set(cx, 0.12, z);
      scene.add(b);
    }
  }
  // Mittelstreifen
  const dashGeo = new THREE.PlaneGeometry(3, 0.3).rotateX(-Math.PI / 2);
  scene.add(instanced(dashGeo, new THREE.MeshBasicMaterial({ color: '#d9d9d9' }), Array.from({ length: 40 }, (_, i) => ({ x: -148 + i * 6.5, y: 0.03, z: 30 }))));
  // Stellplatz-Linien für jede Zone
  const lines: { x: number; y: number; z: number }[] = [];
  for (const z of ZONES) {
    for (let i = 0; i < z.cols * z.maxRows; i++) {
      const p = slot(z, i);
      lines.push({ x: p.x - z.sx / 2, y: 0.02, z: p.z });
      if (i % z.cols === z.cols - 1) lines.push({ x: p.x + z.sx / 2, y: 0.02, z: p.z });
    }
  }
  scene.add(instanced(new THREE.PlaneGeometry(0.12, 4.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8d9095' }), lines));

  // Hauptgebäude: Fassade nach vorne (Süden), LED-Wand an der Ostseite
  const front = frontTexture();
  const led = ledTexture(facade);
  const wall = wallTexture(0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(44, 9, 20), [
    new THREE.MeshLambertMaterial({ map: led, emissive: '#ffffff', emissiveMap: led, emissiveIntensity: 0.6 }), // +x Osten
    new THREE.MeshLambertMaterial({ map: wall }),
    lambert('#2a2c30'),
    lambert('#2a2c30'),
    new THREE.MeshLambertMaterial({ map: front, emissive: '#ffffff', emissiveMap: front, emissiveIntensity: 0.65 }), // +z Süden
    new THREE.MeshLambertMaterial({ map: wall }),
  ]);
  body.position.set(-30, 4.5, -4);
  scene.add(body);
  // Dach mit roter, leuchtender Unterkante wie auf dem Foto, Technik obendrauf
  scene.add(box(47, 0.7, 23, '#24262a', -30, 9.5, -4));
  scene.add(box(47, 0.5, 0.4, RED, -30, 9.05, 7.4, '#ff1010'));
  scene.add(box(0.4, 0.5, 23, RED, -6.6, 9.05, -4, '#ff1010'));
  scene.add(box(0.4, 0.5, 23, RED, -53.4, 9.05, -4, '#ff1010'));
  scene.add(box(4, 1.4, 3, '#6d7177', -40, 10.5, -8));
  scene.add(box(3, 1.2, 3, '#6d7177', -34, 10.4, -10));
  scene.add(box(6, 0.3, 4, '#2f3a4a', -22, 10, -9)); // Solarfeld
  // Vordach über dem Eingang
  scene.add(box(10, 0.35, 3.2, '#2a2c30', -21, 4.2, 7.6));
  scene.add(box(10, 0.15, 0.2, RED, -21, 4.05, 9.2, '#ff1010'));

  // Werkstatt-Halle hinten links mit Rolltoren
  const hall = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 10), [
    lambert('#3a3d42'),
    lambert('#3a3d42'),
    lambert('#2a2c30'),
    lambert('#2a2c30'),
    new THREE.MeshLambertMaterial({ map: wallTexture(3) }),
    lambert('#3a3d42'),
  ]);
  hall.position.set(-77, 3, -34);
  scene.add(hall);
  scene.add(box(20.6, 0.4, 10.6, '#24262a', -77, 6.2, -34));
  scene.add(box(20.6, 0.3, 0.3, RED, -77, 5.9, -28.7, '#ff1010'));

  // Absperrpfosten mit Seilen vor dem Showroom
  const posts = Array.from({ length: 18 }, (_, i) => ({ x: -50 + i * 2.6, y: 0.55, z: 18.5 }));
  scene.add(instanced(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), lambert('#c0c3c7'), posts));
  scene.add(box(18 * 2.6 - 2.6, 0.06, 0.06, '#7a1414', -50 + (17 * 2.6) / 2, 0.95, 18.5));

  // Werbe-Pylon an der Einfahrt
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 12, 1), [lambert('#e9e9e9'), lambert('#e9e9e9'), lambert('#d0d0d0'), lambert('#d0d0d0'), new THREE.MeshLambertMaterial({ map: pylonTexture(), emissive: '#ffffff', emissiveMap: pylonTexture(), emissiveIntensity: 0.35 }), new THREE.MeshLambertMaterial({ map: pylonTexture() })]);
  pylon.position.set(6.5, 6, 22.5);
  scene.add(pylon);

  // Laternen mit Lichtkegel
  const lamps: { x: number; z: number }[] = [];
  for (let x = -80; x <= 80; x += 20) if (Math.abs(x) > 6) lamps.push({ x, z: 23.4 });
  for (let x = -80; x <= 80; x += 32) lamps.push({ x, z: -41.4 });
  for (const z of [-24, -6, 12]) lamps.push({ x: 5.5, z }, { x: 84.5, z });
  scene.add(instanced(new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0), lambert('#55595f'), lamps));
  scene.add(instanced(new THREE.BoxGeometry(1.1, 0.25, 0.5).translate(0, 7, 0), new THREE.MeshBasicMaterial({ color: '#ffe6b8' }), lamps));
  const pool = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
    lamps.length,
  );
  const m4 = new THREE.Matrix4();
  lamps.forEach((l, i) => pool.setMatrixAt(i, m4.makeTranslation(l.x, 0.05, l.z)));
  scene.add(pool);

  // Fahnenmasten an der Straße
  const flags: THREE.Mesh[] = [];
  for (const x of [-44, -38, -32]) {
    scene.add(box(0.14, 9, 0.14, '#d6d8db', x, 4.5, 23));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6, 6, 1).translate(1.3, 0, 0), new THREE.MeshLambertMaterial({ color: RED, side: THREE.DoubleSide, emissive: '#4a0000' }));
    flag.position.set(x, 8.1, 23);
    scene.add(flag);
    flags.push(flag);
  }

  // Bäume und Büsche am Rand
  const trees: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 20; i++) trees.push({ x: -110 + i * 8 + (i % 3), z: 40 + (i % 2) * 3, s: 0.8 + (i % 4) * 0.12 });
  for (let i = 0; i < 9; i++) trees.push({ x: 92 + (i % 2) * 3, z: -40 + i * 9, s: 0.9 + (i % 3) * 0.15 });
  for (let i = 0; i < 18; i++) trees.push({ x: -100 + i * 10, z: -50 - (i % 2) * 4, s: 0.85 + (i % 4) * 0.12 });
  for (let i = 0; i < 7; i++) trees.push({ x: -96 - (i % 2) * 3, z: -38 + i * 10, s: 0.9 });
  scene.add(instanced(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 5).translate(0, 1.2, 0), lambert('#4b3a2a'), trees.map((t) => ({ ...t, y: 0 }))));
  const crowns = new THREE.IcosahedronGeometry(2.6, 0).translate(0, 3.8, 0);
  scene.add(instanced(crowns, new THREE.MeshLambertMaterial({ color: '#2f5a2a', flatShading: true }), trees.filter((_, i) => i % 2 === 0).map((t) => ({ ...t, ry: t.x }))));
  scene.add(instanced(crowns, new THREE.MeshLambertMaterial({ color: '#3d6b31', flatShading: true }), trees.filter((_, i) => i % 2 === 1).map((t) => ({ ...t, ry: t.z }))));

  // Sterne
  const stars = new Float32Array(900);
  for (let i = 0; i < 300; i++) {
    const a = (hash(`s${i}`) % 6283) / 1000;
    const h = 0.15 + ((hash(`h${i}`) % 1000) / 1000) * 0.8;
    stars.set([Math.cos(a) * 400 * Math.cos(h), 400 * Math.sin(h), Math.sin(a) * 400 * Math.cos(h)], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, fog: false })));

  return { body, flags };
}

export function Autohaus3D({ cars, zones, facade, startAngle = 0.35 }: Props) {
  const host = useRef<View>(null);
  const api = useRef<{ setCars: (c: CarOut[]) => void; setZones: (z: ZoneCount[]) => void; setFacade: (f: Facade) => void } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#1b2233', 170, 340);
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 900);
    scene.add(new THREE.HemisphereLight('#a7b9dc', '#2a2a2a', 1.6));
    const sun = new THREE.DirectionalLight('#ffe2c0', 1.45);
    sun.position.set(-60, 90, 70);
    scene.add(sun);

    const { body: building, flags } = buildWorld(scene, facade);

    // Autos: Karosserie, Kabine, Räder, Scheinwerfer, Rückleuchten – je ein Instanced-Mesh
    const geo = carGeometries();
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(g, m, MAX_CARS);
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    const bodyMesh = mk(geo.body, new THREE.MeshLambertMaterial());
    const parts = [
      mk(geo.cab, new THREE.MeshLambertMaterial({ color: '#1a2431', emissive: '#0c1420' })),
      mk(geo.wheels, lambert('#111214')),
      mk(geo.lights, new THREE.MeshBasicMaterial({ color: '#fff6dc' })),
      mk(geo.tail, new THREE.MeshBasicMaterial({ color: '#b3121b' })),
    ];
    const glowMesh = mk(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: '#ff2020' }));

    // Durchgangsverkehr auf der Straße (rein zur Belebung)
    const traffic = [
      { x: -150, z: 28, v: 9, c: '#d6d8db' },
      { x: -40, z: 28, v: 11, c: '#1f2f4f' },
      { x: 60, z: 32.2, v: -10, c: '#7a1f1f' },
      { x: -80, z: 32.2, v: -8, c: '#2b2d31' },
    ];
    const tBody = new THREE.InstancedMesh(geo.body, new THREE.MeshLambertMaterial(), traffic.length);
    const tParts = [new THREE.InstancedMesh(geo.cab, parts[0].material, traffic.length), new THREE.InstancedMesh(geo.wheels, parts[1].material, traffic.length), new THREE.InstancedMesh(geo.lights, parts[2].material, traffic.length)];
    traffic.forEach((t, i) => tBody.setColorAt(i, new THREE.Color(t.c)));
    scene.add(tBody, ...tParts);

    type Car = { x: number; z: number; tx: number; tz: number; yaw: number; long: boolean; color: THREE.Color };
    const state = new Map<string, Car>();
    let order: string[] = [];
    let moving = true;
    const o = new THREE.Object3D();
    const longColor = new THREE.Color('#e3202a');

    const setCars = (list: CarOut[]) => {
      const seen = new Set<string>();
      const first = state.size === 0;
      for (const c of list.slice(0, MAX_CARS)) {
        seen.add(c.gid);
        const old = state.get(c.gid);
        if (old) Object.assign(old, { tx: c.x, tz: c.z, long: c.long });
        else state.set(c.gid, { x: first ? c.x : ENTRY.x, z: first ? c.z : ENTRY.z, tx: c.x, tz: c.z, yaw: 0, long: c.long, color: new THREE.Color(PAINT[hash(c.gid) % PAINT.length]) });
      }
      for (const gid of [...state.keys()]) if (!seen.has(gid)) state.delete(gid);
      order = [...state.keys()];
      bodyMesh.count = order.length;
      for (const p of parts) p.count = order.length;
      order.forEach((gid, i) => {
        const c = state.get(gid)!;
        bodyMesh.setColorAt(i, c.long ? longColor : c.color);
      });
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
      moving = true;
    };

    let labels: THREE.Sprite[] = [];
    const setZones = (zs: ZoneCount[]) => {
      for (const l of labels) {
        scene.remove(l);
        l.material.map?.dispose();
        l.material.dispose();
      }
      let back = 0;
      labels = zs.map((z) => {
        const s = labelSprite(z);
        const p = labelPos(z.zone, z.count);
        if (z.zone.key === 'bestand') {
          s.position.set(p.x, 18, p.z);
          s.scale.set(32, 12, 1);
        } else if (z.zone.sz < 0) {
          // hinten eng nebeneinander: abwechselnd hoch, damit sich nichts überdeckt
          s.position.set(p.x, back++ % 2 ? 17 : 10, p.z);
          s.scale.set(16, 6, 1);
        } else {
          s.position.set(p.x, 8, p.z);
          s.scale.set(19, 7.1, 1);
        }
        scene.add(s);
        return s;
      });
    };

    const setFacade = (f: Facade) => {
      const mat = (building.material as THREE.MeshLambertMaterial[])[0];
      mat.map?.dispose();
      const t = ledTexture(f);
      mat.map = t;
      mat.emissiveMap = t;
      mat.needsUpdate = true;
    };
    api.current = { setCars, setZones, setFacade };

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const place = (mesh: THREE.InstancedMesh, i: number, x: number, z: number, yaw: number) => {
      o.position.set(x, 0, z);
      o.rotation.set(0, yaw, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    };

    // Langsame Kamerafahrt ums Gelände (eine Runde ≈ 4 Minuten).
    let raf = 0;
    let last = performance.now();
    let angle = startAngle;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      angle += dt * ((Math.PI * 2) / 240);
      const r = 104;
      camera.position.set(-2 + Math.sin(angle) * r, 64 + Math.sin(angle * 2) * 6, -6 + Math.cos(angle) * r);
      camera.lookAt(-2, 0, -8);

      if (moving) {
        moving = false;
        const k = 1 - Math.pow(0.15, dt); // weich zum Zielplatz fahren
        let g = 0;
        order.forEach((gid, i) => {
          const c = state.get(gid)!;
          const dx = c.tx - c.x;
          const dz = c.tz - c.z;
          const far = Math.abs(dx) > 0.03 || Math.abs(dz) > 0.03;
          if (far) {
            c.x += dx * k;
            c.z += dz * k;
            moving = true;
          }
          // in Fahrtrichtung drehen, eingeparkt wieder geradeaus
          const want = far && Math.hypot(dx, dz) > 1 ? Math.atan2(dx, dz) : 0;
          const dy = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw));
          if (Math.abs(dy) > 0.01) {
            c.yaw += dy * Math.min(1, dt * 4);
            moving = true;
          }
          place(bodyMesh, i, c.x, c.z, c.yaw);
          for (const p of parts) place(p, i, c.x, c.z, c.yaw);
          if (c.long) {
            o.position.set(c.x, 2.6, c.z);
            o.rotation.set(0, 0, 0);
            o.updateMatrix();
            glowMesh.setMatrixAt(g++, o.matrix);
          }
        });
        glowMesh.count = g;
        for (const m of [bodyMesh, glowMesh, ...parts]) m.instanceMatrix.needsUpdate = true;
      }
      // Langsteher pulsieren, Fahnen wehen, Verkehr fährt
      (glowMesh.material as THREE.MeshBasicMaterial).color.setHSL(0, 1, 0.45 + 0.15 * Math.sin(now / 400));
      flags.forEach((f, i) => (f.rotation.y = Math.sin(now / 700 + i) * 0.25));
      traffic.forEach((t, i) => {
        t.x += t.v * dt;
        if (t.x > 110) t.x = -150;
        if (t.x < -150) t.x = 110;
        const yaw = t.v > 0 ? Math.PI / 2 : -Math.PI / 2;
        place(tBody, i, t.x, t.z, yaw);
        for (const p of tParts) place(p, i, t.x, t.z, yaw);
      });
      for (const m of [tBody, ...tParts]) m.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      api.current = null;
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshLambertMaterial).map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // Szene nur einmal aufbauen; Daten kommen über api.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => api.current?.setCars(cars), [cars]);
  useEffect(() => api.current?.setZones(zones), [zones]);
  useEffect(() => api.current?.setFacade(facade), [facade.cashflow, facade.team, facade.standzeit, facade.einkauf]); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS !== 'web') return <Text>Das 3D-Modell gibt es nur im Browser.</Text>;
  return <View ref={host} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />;
}
