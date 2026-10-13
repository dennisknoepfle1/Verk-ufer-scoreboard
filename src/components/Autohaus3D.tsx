// 3D-Modell der Autowelt Prusseit im Spiel-Look (three.js, nur im Browser).
// Gebäude mit roter Dachkante und Leuchtschrift, Hof als Pipeline: jedes Auto ist ein Fahrzeug aus Asana.
// Bewusst sparsam gebaut (wenige Flächen, keine Schatten, zwei Instanced-Meshes für alle Autos), damit es auch
// auf schwacher TV-Hardware flüssig läuft.
import { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import * as THREE from 'three';

import { labelPos, type CarOut, type Zone } from '@/lib/autohaus-layout';

export type Facade = { cashflow: string; team: string; standzeit: string };
type Props = { cars: CarOut[]; zones: { zone: Zone; count: number; hidden: number }[]; facade: Facade; startAngle?: number };

const MAX_CARS = 700;
const RED = '#e30614';
const PAINT = ['#f2f2f2', '#16171a', '#b9bec4', '#5d6166', '#1f2f4f', '#2b2d31', '#e8e6df', '#7a1f1f', '#3a4a5c'];
const ENTRY = { x: 0, z: 46 }; // neue Autos kommen über die Zufahrt

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

/** Fassade: dunkle Paneele, warm beleuchtete Glasfront und rote Leuchtschrift. */
function frontTexture() {
  return canvasTexture(1024, 256, (g) => {
    g.fillStyle = '#3b3e43';
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = '#2f3236';
    for (let x = 0; x < 1024; x += 32) g.strokeRect(x, 0, 32, 256);
    // Glasfront
    const glass = g.createLinearGradient(0, 120, 0, 256);
    glass.addColorStop(0, '#f6c98a');
    glass.addColorStop(1, '#8a5a2b');
    g.fillStyle = glass;
    for (const [x, w] of [[60, 120], [330, 300], [690, 150], [880, 70]] as const) g.fillRect(x, 118, w, 138);
    g.fillStyle = '#22252a';
    for (const [x, w] of [[60, 120], [330, 300], [690, 150], [880, 70]] as const) for (let i = x; i <= x + w; i += 50) g.fillRect(i, 118, 4, 138);
    // Leuchtschrift
    g.font = '800 64px Montserrat, Arial, sans-serif';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff1a1a';
    g.shadowBlur = 22;
    g.fillStyle = '#ff2b2b';
    g.fillText('AUTOWELT', 70, 64);
    g.fillText('PRUSSEIT.DE', 520, 64);
  });
}

/** Seitenwand als LED-Wand mit den Kennzahlen. */
function ledTexture(f: Facade) {
  return canvasTexture(768, 256, (g) => {
    g.fillStyle = '#34373c';
    g.fillRect(0, 0, 768, 256);
    g.fillStyle = '#0b0b0c';
    g.fillRect(40, 24, 688, 208);
    g.font = '700 26px Montserrat, Arial, sans-serif';
    g.fillStyle = '#9a9ea3';
    g.fillText('CASHFLOW IM ZULAUF', 70, 70);
    g.fillText('TEAMZIEL', 70, 150);
    g.fillText('Ø STANDZEIT', 430, 150);
    g.shadowColor = '#f2c94c';
    g.shadowBlur = 12;
    g.font = '800 54px Montserrat, Arial, sans-serif';
    g.fillStyle = '#f2c94c';
    g.fillText(f.cashflow, 70, 118);
    g.shadowColor = '#ffffff';
    g.shadowBlur = 6;
    g.font = '800 40px Montserrat, Arial, sans-serif';
    g.fillStyle = '#f5f5f5';
    g.fillText(f.team, 70, 196);
    g.fillText(f.standzeit, 430, 196);
  });
}

function labelSprite(text: string, sub: string) {
  const tex = canvasTexture(512, 160, (g) => {
    g.fillStyle = 'rgba(20,20,20,0.82)';
    g.beginPath();
    g.roundRect(8, 8, 496, 144, 24);
    g.fill();
    g.fillStyle = RED;
    g.fillRect(8, 8, 496, 10);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = '800 64px Montserrat, Arial, sans-serif';
    g.fillText(text, 256, 92);
    g.fillStyle = '#c9ccd1';
    g.font = '600 34px Montserrat, Arial, sans-serif';
    g.fillText(sub, 256, 136);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(16, 5, 1);
  s.renderOrder = 10;
  return s;
}

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, emissive?: string) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1 : 0 }),
  );
  m.position.set(x, y, z);
  return m;
}

function plane(w: number, d: number, color: string, x: number, z: number, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

/** Gelände, Straßen, Bäume und das Autohaus. */
function buildWorld(scene: THREE.Scene, facade: Facade) {
  scene.add(plane(320, 240, '#34482c', -10, 0, -0.02)); // Wiese
  scene.add(plane(84, 66, '#45474b', -46, -9, 0)); // Platz links mit Gebäude
  scene.add(plane(80, 68, '#45474b', 46, -9, 0)); // großer Bestandsplatz
  scene.add(plane(200, 10, '#2c2d30', -40, 30, 0.01)); // Straße vorne
  scene.add(plane(9, 120, '#2c2d30', 0, -4, 0.01)); // Zufahrt
  // Mittelstreifen
  const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.3), new THREE.MeshBasicMaterial({ color: '#d9d9d9' }), 30);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 30; i++) {
    m4.makeRotationX(-Math.PI / 2).setPosition(-135 + i * 6.5, 0.03, 30);
    dash.setMatrixAt(i, m4);
  }
  scene.add(dash);

  // Gebäude: Fassade nach vorne (Süden), LED-Wand an der Ostseite
  const body = new THREE.Mesh(new THREE.BoxGeometry(44, 9, 20), [
    new THREE.MeshLambertMaterial({ map: ledTexture(facade), emissive: '#ffffff', emissiveMap: ledTexture(facade), emissiveIntensity: 0.55 }), // +x Osten
    new THREE.MeshLambertMaterial({ color: '#3b3e43' }),
    new THREE.MeshLambertMaterial({ color: '#2a2c30' }),
    new THREE.MeshLambertMaterial({ color: '#2a2c30' }),
    new THREE.MeshLambertMaterial({ map: frontTexture(), emissive: '#ffffff', emissiveMap: frontTexture(), emissiveIntensity: 0.6 }), // +z Süden
    new THREE.MeshLambertMaterial({ color: '#3b3e43' }),
  ]);
  body.position.set(-30, 4.5, -4);
  body.name = 'gebaeude';
  scene.add(body);
  // Pultdach mit roter, leuchtender Unterkante wie auf dem Foto
  scene.add(box(47, 0.7, 23, '#24262a', -30, 9.5, -4));
  scene.add(box(47, 0.5, 0.4, RED, -30, 9.05, 7.4, '#ff1010'));
  scene.add(box(0.4, 0.5, 23, RED, -6.6, 9.05, -4, '#ff1010'));
  // Garagen hinten links
  scene.add(box(8, 3.5, 6, '#9a9a96', -82, 1.75, -32));
  scene.add(box(8, 3.5, 6, '#a6a49e', -72, 1.75, -32));
  // Absperrpfosten vor dem Showroom
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), new THREE.MeshLambertMaterial({ color: '#c0c3c7' }), 18);
  for (let i = 0; i < 18; i++) {
    m4.makeTranslation(-50 + i * 2.6, 0.55, 18.5);
    post.setMatrixAt(i, m4);
  }
  scene.add(post);
  // Bäume am Rand
  const trunks: [number, number][] = [];
  for (let i = 0; i < 14; i++) trunks.push([-95 + i * 7, 40]);
  for (let i = 0; i < 9; i++) trunks.push([92, -40 + i * 9]);
  for (let i = 0; i < 8; i++) trunks.push([-20 + i * 9, -48]);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 0), new THREE.MeshLambertMaterial({ color: '#2f5a2a', flatShading: true }), trunks.length);
  trunks.forEach(([x, z], i) => {
    m4.makeTranslation(x, 3.4, z);
    crown.setMatrixAt(i, m4);
  });
  scene.add(crown);
  return body;
}

export function Autohaus3D({ cars, zones, facade, startAngle = 0.35 }: Props) {
  const host = useRef<View>(null);
  const api = useRef<{ setCars: (c: CarOut[]) => void; setZones: (z: Props['zones']) => void; setFacade: (f: Facade) => void } | null>(null);

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
    scene.fog = new THREE.Fog('#1b2233', 140, 300);
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 600);
    scene.add(new THREE.HemisphereLight('#9fb3d6', '#2a2a2a', 1.6));
    const sun = new THREE.DirectionalLight('#ffe2c0', 1.4);
    sun.position.set(-60, 90, 70);
    scene.add(sun);

    const building = buildWorld(scene, facade);

    // Autos: Karosserie + Kabine als zwei Instanced-Meshes
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.75, 4.2).translate(0, 0.6, 0);
    const cabGeo = new THREE.BoxGeometry(1.55, 0.55, 2.2).translate(0, 1.25, -0.2);
    const bodyMesh = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), MAX_CARS);
    const cabMesh = new THREE.InstancedMesh(cabGeo, new THREE.MeshLambertMaterial({ color: '#1c2633' }), MAX_CARS);
    bodyMesh.count = 0;
    cabMesh.count = 0;
    scene.add(bodyMesh, cabMesh);
    const glowGeo = new THREE.SphereGeometry(0.45, 8, 6);
    const glowMesh = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ color: '#ff2020' }), MAX_CARS);
    glowMesh.count = 0;
    scene.add(glowMesh);

    type Car = { x: number; z: number; tx: number; tz: number; long: boolean; color: THREE.Color };
    const state = new Map<string, Car>();
    let order: string[] = [];
    let moving = true;
    const m4 = new THREE.Matrix4();
    const longColor = new THREE.Color('#ff2a2a');

    const setCars = (list: CarOut[]) => {
      const seen = new Set<string>();
      for (const c of list.slice(0, MAX_CARS)) {
        seen.add(c.gid);
        const old = state.get(c.gid);
        const color = new THREE.Color(PAINT[hash(c.gid) % PAINT.length]);
        if (old) Object.assign(old, { tx: c.x, tz: c.z, long: c.long });
        else state.set(c.gid, { x: state.size ? ENTRY.x : c.x, z: state.size ? ENTRY.z : c.z, tx: c.x, tz: c.z, long: c.long, color });
      }
      for (const gid of [...state.keys()]) if (!seen.has(gid)) state.delete(gid);
      order = [...state.keys()];
      bodyMesh.count = cabMesh.count = order.length;
      order.forEach((gid, i) => {
        const c = state.get(gid)!;
        bodyMesh.setColorAt(i, c.long ? longColor : c.color);
      });
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
      moving = true;
    };

    let labels: THREE.Sprite[] = [];
    const setZones = (zs: Props['zones']) => {
      for (const l of labels) {
        scene.remove(l);
        l.material.map?.dispose();
        l.material.dispose();
      }
      labels = zs.map(({ zone, count, hidden }, i) => {
        const s = labelSprite(`${zone.label} ${count}`, hidden ? `+${hidden} nicht im Bild` : count === 1 ? 'Fahrzeug' : 'Fahrzeuge');
        const p = labelPos(zone, count);
        // hinten eng nebeneinander: kleiner und abwechselnd hoch, damit sich nichts überdeckt
        const small = zone.sz < 0;
        s.position.set(p.x, zone.key === 'bestand' ? 12 : small ? (i % 2 ? 10 : 6.5) : 6, p.z);
        if (zone.key === 'bestand') s.scale.set(24, 7.5, 1);
        else if (small) s.scale.set(11, 3.4, 1);
        scene.add(s);
        return s;
      });
    };

    const setFacade = (f: Facade) => {
      const mats = building.material as THREE.MeshLambertMaterial[];
      mats[0].map?.dispose();
      const t = ledTexture(f);
      mats[0].map = t;
      mats[0].emissiveMap = t;
      mats[0].needsUpdate = true;
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
      const r = 135;
      camera.position.set(-2 + Math.sin(angle) * r, 70 + Math.sin(angle * 2) * 8, Math.cos(angle) * r);
      camera.lookAt(-2, 0, -8);

      if (moving) {
        moving = false;
        const k = 1 - Math.pow(0.08, dt); // weich zum Zielplatz fahren
        order.forEach((gid, i) => {
          const c = state.get(gid)!;
          const dx = c.tx - c.x;
          const dz = c.tz - c.z;
          if (Math.abs(dx) > 0.02 || Math.abs(dz) > 0.02) {
            c.x += dx * k;
            c.z += dz * k;
            moving = true;
          }
          m4.makeTranslation(c.x, 0, c.z);
          bodyMesh.setMatrixAt(i, m4);
          cabMesh.setMatrixAt(i, m4);
        });
        bodyMesh.instanceMatrix.needsUpdate = true;
        cabMesh.instanceMatrix.needsUpdate = true;
        let g = 0;
        order.forEach((gid) => {
          const c = state.get(gid)!;
          if (!c.long) return;
          m4.makeTranslation(c.x, 2.1, c.z);
          glowMesh.setMatrixAt(g++, m4);
        });
        glowMesh.count = g;
        glowMesh.instanceMatrix.needsUpdate = true;
      }
      // Langsteher pulsieren leicht
      (glowMesh.material as THREE.MeshBasicMaterial).color.setHSL(0, 1, 0.45 + 0.15 * Math.sin(now / 400));
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      api.current = null;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
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
  useEffect(() => api.current?.setFacade(facade), [facade.cashflow, facade.team, facade.standzeit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS !== 'web') return <Text>Das 3D-Modell gibt es nur im Browser.</Text>;
  return <View ref={host} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />;
}
