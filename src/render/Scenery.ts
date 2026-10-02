import * as THREE from 'three';

/**
 * Dusk village yard built from primitives: garages, wrecked cars and bikes,
 * village guys, lamps, houses, trees, fences. Everything is placed around the board.
 */

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.85, metal = 0.1, emissive = 0, ei = 0): THREE.MeshStandardMaterial {
  const key = [color, rough, metal, emissive, ei].join('/');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });
    matCache.set(key, m);
  }
  return m;
}

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o;
};
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); return o;
};
const ball = (r: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); o.position.set(x, y, z); return o;
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- builders ----------
const RUST = [0x7a3b2a, 0x3f5a4a, 0x8a8678, 0x6b4a2a, 0x2f4a6a, 0x8b2c2c];

function makeCar(color: number, broken: 'wheel' | 'hood' | 'blocks' | 'none', r: () => number): THREE.Group {
  const g = new THREE.Group();
  const body = mat(color, 0.7, 0.35), dark = mat(0x0d1018, 0.3, 0.5), rust = mat(0x5a3220, 0.95, 0.1), tire = mat(0x0b0b0d, 0.95, 0), rim = mat(0x8a8f99, 0.4, 0.8);
  g.add(box(3.5, 0.55, 1.55, body, 0, 0.62, 0));
  g.add(box(1.8, 0.5, 1.4, body, -0.25, 1.15, 0));
  g.add(box(1.84, 0.32, 1.44, dark, -0.25, 1.17, 0)); // glass band
  g.add(box(1.5, 0.06, 1.3, body, -0.25, 1.42, 0));   // roof
  for (let i = 0; i < 4; i++) g.add(box(0.3 + r() * 0.5, 0.2, 0.02, rust, -1.4 + r() * 2.8, 0.55 + r() * 0.25, (r() > 0.5 ? 1 : -1) * 0.78)); // rust patches
  g.add(box(0.05, 0.14, 0.3, mat(0xfff2c0, 0.3, 0, 0xffe9a0, 0.4), 1.76, 0.7, 0.5));
  g.add(box(0.05, 0.14, 0.3, mat(0xfff2c0, 0.3, 0, 0xffe9a0, 0.4), 1.76, 0.7, -0.5));
  const wheelAt = (x: number, z: number, flat = false) => {
    const w = new THREE.Group();
    const t = cyl(0.34, 0.34, 0.26, tire, 0, 0, 0, 16); t.rotation.x = Math.PI / 2;
    const rm = cyl(0.17, 0.17, 0.28, rim, 0, 0, 0, 10); rm.rotation.x = Math.PI / 2;
    w.add(t, rm); w.position.set(x, flat ? 0.28 : 0.34, z); if (flat) w.scale.y = 0.82; return w;
  };
  const spots: [number, number][] = [[1.1, 0.78], [1.1, -0.78], [-1.1, 0.78], [-1.1, -0.78]];
  spots.forEach(([x, z], i) => {
    if (broken === 'wheel' && i === 0) return;
    g.add(wheelAt(x, z, broken === 'wheel' && i === 2));
  });
  if (broken === 'wheel') { g.rotation.x = 0.1; g.position.y = -0.04; }
  if (broken === 'hood') {
    const hood = new THREE.Group(); hood.position.set(0.7, 0.9, 0);
    hood.add(box(1.0, 0.05, 1.4, body, 0.5, 0, 0)); hood.rotation.z = 1.05;
    g.add(hood);
    g.add(box(0.8, 0.25, 1.1, mat(0x17181c, 0.6, 0.6), 1.2, 0.8, 0)); // engine bay
  }
  if (broken === 'blocks') {
    g.children.forEach(c => { if (c.position.y < 0.5 && c.position.y > 0.2 && Math.abs(c.position.x) > 1) c.visible = false; });
    for (const [x, z] of [[1.1, 0.6], [1.1, -0.6], [-1.1, 0.6], [-1.1, -0.6]]) g.add(box(0.35, 0.3, 0.35, mat(0x77756f, 1), x, 0.15, z));
    g.position.y = 0.2;
  }
  return g;
}

function makeBike(color: number, lying: boolean): THREE.Group {
  const g = new THREE.Group();
  const paint = mat(color, 0.55, 0.5), metal = mat(0x8a8f99, 0.35, 0.85), black = mat(0x0b0b0d, 0.9, 0.1);
  for (const x of [-0.72, 0.72]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.075, 8, 22), black); w.position.set(x, 0.41, 0); g.add(w);
    const hub = cyl(0.07, 0.07, 0.14, metal, x, 0.41, 0, 8); hub.rotation.x = Math.PI / 2; g.add(hub);
  }
  g.add(box(0.55, 0.38, 0.32, mat(0x22252b, 0.5, 0.7), 0, 0.55, 0));
  const tank = ball(0.22, paint, 0.2, 0.9, 0); tank.scale.set(1.5, 0.8, 0.9); g.add(tank);
  g.add(box(0.6, 0.1, 0.26, black, -0.35, 0.86, 0));
  const fork = cyl(0.025, 0.025, 0.85, metal, 0.65, 0.78, 0, 6); fork.rotation.z = -0.3; g.add(fork);
  const bar = cyl(0.025, 0.025, 0.6, metal, 0.52, 1.17, 0, 6); bar.rotation.x = Math.PI / 2; g.add(bar);
  g.add(ball(0.1, mat(0xfff2c0, 0.3, 0, 0xffe9a0, 0.5), 0.7, 1.05, 0));
  const ex = cyl(0.05, 0.07, 0.9, metal, -0.3, 0.38, 0.2, 8); ex.rotation.z = Math.PI / 2 + 0.1; g.add(ex);
  if (lying) { g.rotation.x = Math.PI / 2 * 0.86; g.position.y = 0.3; }
  return g;
}

interface Villager { group: THREE.Group; update(t: number): void; }
function makeVillager(r: () => number, wave = false): Villager {
  const g = new THREE.Group();
  const skin = mat([0xe0b898, 0xd9a984, 0xc89874][(r() * 3) | 0], 0.7, 0);
  const jeans = mat([0x23324a, 0x1c2230, 0x2d2d33][(r() * 3) | 0], 0.9, 0);
  const jacket = mat([0x2f3d2c, 0x4a3226, 0x1f2430, 0x6b2a2a, 0x3b3f46][(r() * 5) | 0], 0.85, 0);
  const hairM = mat([0x2a1c14, 0x4a3426, 0x151515][(r() * 3) | 0], 0.9, 0);
  g.add(box(0.2, 0.85, 0.22, jeans, -0.12, 0.43, 0), box(0.2, 0.85, 0.22, jeans, 0.12, 0.43, 0));
  g.add(box(0.5, 0.65, 0.3, jacket, 0, 1.17, 0));
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.32, 1.45, 0); armR.position.set(0.32, 1.45, 0);
  armL.add(box(0.14, 0.6, 0.14, jacket, 0, -0.28, 0)); armR.add(box(0.14, 0.6, 0.14, jacket, 0, -0.28, 0));
  g.add(armL, armR);
  const head = new THREE.Group(); head.position.y = 1.72;
  head.add(ball(0.17, skin));
  const kind = r();
  if (kind < 0.4) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairM); h.position.y = 0.02; head.add(h); }
  else if (kind < 0.75) { head.add(box(0.36, 0.1, 0.36, mat(0x15181d, 0.9), 0, 0.14, 0), box(0.36, 0.03, 0.18, mat(0x15181d, 0.9), 0, 0.1, 0.24)); }
  else { head.add(box(0.4, 0.2, 0.4, mat(0x5a4a3a, 1), 0, 0.15, 0)); }
  g.add(head);
  const phase = r() * 6.28, sway = 0.5 + r() * 0.5;
  g.scale.setScalar(0.95 + r() * 0.1);
  return {
    group: g,
    update(t) {
      g.position.y = Math.sin(t * 1.4 + phase) * 0.012;
      head.rotation.y = Math.sin(t * 0.5 * sway + phase) * 0.6;
      armL.rotation.x = Math.sin(t * 1.2 + phase) * 0.08;
      if (wave) armR.rotation.z = -2.4 + Math.sin(t * 5 + phase) * 0.35;
      else armR.rotation.x = Math.sin(t * 1.2 + phase + 1) * 0.08;
    },
  };
}

function makeGarage(color: number, open: boolean, r: () => number): THREE.Group {
  const g = new THREE.Group();
  const wall = mat(color, 0.9, 0.1), roof = mat(0x2a2623, 0.85, 0.3), door = mat(0x4a5a4e, 0.6, 0.5);
  g.add(box(4.4, 2.7, 3.8, wall, 0, 1.35, 0));
  const rf = box(4.9, 0.18, 4.3, roof, 0, 2.8, 0); rf.rotation.x = 0.07; g.add(rf);
  if (open) {
    g.add(box(3.1, 2.1, 0.04, mat(0xffc778, 0.5, 0, 0xffa94d, 1.4), 0, 1.1, 1.93)); // lit interior
    const l = new THREE.PointLight(0xffa94d, 12, 9, 2); l.position.set(0, 1.4, 2.6); g.add(l);
    g.add(box(3.1, 0.5, 0.1, door, 0, 2.15, 2.0)); // door rolled up
  } else {
    g.add(box(3.1, 2.1, 0.1, door, 0, 1.1, 1.95));
    for (let i = 0; i < 6; i++) g.add(box(3.1, 0.03, 0.04, mat(0x2b3630, 0.8), 0, 0.3 + i * 0.35, 2.02));
  }
  g.add(box(0.7, 0.4, 0.04, mat(0xd8d2c0, 0.8), -1.7, 2.45 + r() * 0.1, 1.92)); // faded number plate
  return g;
}

function makeHouse(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const w = 6 + r() * 3, d = 5 + r() * 2;
  g.add(box(w, 3.4, d, mat([0x3a3a40, 0x4a3b30, 0x2f3a45][(r() * 3) | 0], 0.9), 0, 1.7, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.2, 4), mat(0x1a1c26, 0.8));
  roof.rotation.y = Math.PI / 4; roof.position.y = 4.5; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); g.add(roof);
  const win = mat(0xffd89a, 0.5, 0, 0xffb25a, 1.6);
  for (let i = 0; i < 3; i++) if (r() > 0.25) g.add(box(0.9, 1.0, 0.05, win, -w / 3 + i * (w / 3), 1.9, d / 2 + 0.02));
  return g;
}

function makeTree(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 5 + r() * 4;
  g.add(cyl(0.18, 0.28, 1.4, mat(0x2a1d14, 1), 0, 0.7, 0, 6));
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.9 - i * 0.38, h / 3, 8), mat(0x0f2a1e, 0.95));
    c.position.y = 1.5 + i * (h / 6.5); g.add(c);
  }
  return g;
}

function makeLamp(): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x2a2e36, 0.5, 0.7);
  g.add(cyl(0.07, 0.1, 4.6, metal, 0, 2.3, 0, 8));
  const arm = box(1.0, 0.08, 0.08, metal, 0.45, 4.55, 0); g.add(arm);
  g.add(ball(0.16, mat(0xfff0c8, 0.3, 0, 0xffd27a, 3), 0.95, 4.45, 0));
  const l = new THREE.PointLight(0xffcf86, 22, 26, 1.6); l.position.set(0.95, 4.2, 0); g.add(l);
  return g;
}

function makeFence(len: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x4a3a2a, 1);
  const n = Math.round(len / 1.1);
  for (let i = 0; i <= n; i++) g.add(box(0.14, 1.3, 0.14, wood, -len / 2 + (i * len) / n, 0.65, 0));
  g.add(box(len, 0.1, 0.06, wood, 0, 1.0, 0.08), box(len, 0.1, 0.06, wood, 0, 0.55, 0.08));
  return g;
}

function makeBarrel(color: number): THREE.Mesh { return cyl(0.3, 0.3, 0.9, mat(color, 0.6, 0.6), 0, 0.45, 0, 14); }
function makeTires(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 8, 16), mat(0x0b0b0d, 0.95)); t.rotation.x = Math.PI / 2; t.position.y = 0.13 + i * 0.26; g.add(t); }
  return g;
}
function makeCrate(): THREE.Group {
  const g = new THREE.Group(); g.add(box(0.8, 0.7, 0.8, mat(0x5b4630, 1), 0, 0.35, 0)); g.add(box(0.7, 0.55, 0.7, mat(0x6a5238, 1), 0.9, 0.275, 0.2)); return g;
}
function makeBench(): THREE.Group {
  const g = new THREE.Group(), wood = mat(0x4a3a2a, 1);
  g.add(box(1.6, 0.08, 0.4, wood, 0, 0.5, 0), box(0.1, 0.5, 0.35, wood, -0.7, 0.25, 0), box(0.1, 0.5, 0.35, wood, 0.7, 0.25, 0));
  return g;
}

// ---------- sky + ground ----------
export function makeGroundMaterial(): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#1a1c14'; x.fillRect(0, 0, 512, 512);
  const R = rng(7);
  for (let i = 0; i < 900; i++) {
    const g = 20 + R() * 40;
    x.fillStyle = R() > 0.5 ? `rgba(${g + 6},${g + 14},${g - 4},0.16)` : `rgba(${g + 16},${g + 10},${g},0.16)`;
    x.beginPath(); x.ellipse(R() * 512, R() * 512, 4 + R() * 22, 3 + R() * 12, R() * 3, 0, 6.3); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 });
}

export function makeSky(): THREE.Object3D {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){
        float h = clamp(vP.y, 0.0, 1.0);
        vec3 horizon = vec3(0.30, 0.20, 0.28), mid = vec3(0.05, 0.12, 0.30), top = vec3(0.01, 0.03, 0.12);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h)); c = mix(c, top, smoothstep(0.2, 0.9, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    }),
  );
  g.add(sky);
  const R = rng(3), pos: number[] = [];
  for (let i = 0; i < 260; i++) { const a = R() * 6.28, e = 0.15 + R() * 1.3; pos.push(Math.cos(a) * Math.cos(e) * 150, Math.sin(e) * 150, Math.sin(a) * Math.cos(e) * 150); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfdcff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 14), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false }));
  moon.position.set(-60, 85, -110); g.add(moon);
  return g;
}

// ---------- scenery manager ----------
export class Scenery {
  readonly group = new THREE.Group();
  private updaters: ((t: number) => void)[] = [];

  clear() {
    this.group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.group.clear();
    this.updaters = [];
  }

  update(t: number) { for (const u of this.updaters) u(t); }

  build(w: number, h: number) {
    this.clear();
    const r = rng(w * 131 + h * 7 + 11);
    // distance from centre to board edge along an angle (degrees)
    const edge = (deg: number) => {
      const a = (deg * Math.PI) / 180, c = Math.abs(Math.cos(a)) || 1e-4, s = Math.abs(Math.sin(a)) || 1e-4;
      return Math.min(w / 2 / c, h / 2 / s);
    };
    const put = (o: THREE.Object3D, deg: number, off: number, face: 'in' | 'rand' | number = 'in') => {
      const a = (deg * Math.PI) / 180, d = edge(deg) + off + (off < 15 ? 1.8 : 0);
      o.position.x = Math.cos(a) * d; o.position.z = Math.sin(a) * d;
      o.rotation.y = face === 'in' ? Math.atan2(-o.position.x, -o.position.z) : face === 'rand' ? r() * 6.28 : face;
      this.group.add(o);
      return o;
    };

    // garages in an arc behind the board, with the cars and guys hanging around
    [[222, 0x6a6558], [256, 0x4d5a52], [290, 0x6b5448], [324, 0x55606a]].forEach(([deg, col], i) => {
      put(makeGarage(col, i === 1 || i === 3, r), deg, 8 + r() * 1.5);
    });
    const villagers: [number, number, boolean][] = [
      [236, 4.2, false], [240, 4.8, true], [272, 4.4, false], [276, 5.0, false], [306, 4.3, false], [310, 4.9, true], [160, 3.2, false], [18, 3.4, false],
    ];
    villagers.forEach(([deg, off, wave]) => {
      const v = makeVillager(r, wave); this.updaters.push(v.update);
      put(v.group, deg + (r() - 0.5) * 4, off + r(), 'in');
      v.group.rotation.y += (r() - 0.5) * 1.2;
    });

    const carSpots: [number, number, 'wheel' | 'hood' | 'blocks' | 'none'][] = [
      [200, 4.5, 'hood'], [340, 4.5, 'blocks'], [150, 5.5, 'wheel'], [30, 5.2, 'none'], [118, 6.5, 'wheel'], [62, 6.8, 'hood'],
    ];
    carSpots.forEach(([deg, off, br], i) => put(makeCar(RUST[(i + (r() * 3 | 0)) % RUST.length], br, r), deg, off + r() * 1.2, 'rand'));

    const bikeSpots: [number, number, boolean][] = [[182, 2.6, true], [358, 2.6, false], [135, 3.2, false], [45, 3.0, true], [92, 3.6, false], [250, 5.5, true]];
    bikeSpots.forEach(([deg, off, lying], i) => put(makeBike([0x7a2a22, 0x1e3a5a, 0x3a4a2a, 0x222222, 0x8a6a22][i % 5], lying), deg, off + r(), 'rand'));

    // props
    [[205, 2.2], [345, 2.2], [170, 2.0], [10, 2.2], [265, 3.2]].forEach(([deg, off], i) => {
      put(makeBarrel([0x2a4a7a, 0x7a3b2a, 0x3a5a3a][i % 3]), deg, off + r(), 'rand');
      if (i % 2 === 0) put(makeBarrel(0x7a3b2a), deg + 3, off + 0.2 + r(), 'rand');
    });
    [[192, 3.0], [8, 3.4], [128, 2.4], [52, 2.4]].forEach(([deg, off]) => put(makeTires(), deg, off + r(), 'rand'));
    [[250, 3.0], [300, 3.0], [145, 2.2]].forEach(([deg, off]) => put(makeCrate(), deg, off + r(), 'rand'));
    [[270, 2.4], [110, 2.4]].forEach(([deg, off]) => put(makeBench(), deg, off, 'in'));

    // lamps
    put(makeLamp(), 206, 2.2, 'in'); put(makeLamp(), 334, 2.2, 'in');

    // fences
    [[165, 10], [195, 10], [345, 10], [15, 10], [100, 9], [80, 9]].forEach(([deg, off]) => {
      put(makeFence(8), deg, off, 'in'); // local x runs tangentially
    });

    // distant houses + trees
    [[245, 20], [275, 24], [305, 21], [200, 22], [340, 22], [150, 24], [30, 24]].forEach(([deg, off]) => put(makeHouse(r), deg + r() * 6, off + r() * 3, 'in'));
    for (let a = 0; a < 360; a += 20) put(makeTree(r), a + r() * 15, 28 + r() * 10, 'rand');
  }
}
