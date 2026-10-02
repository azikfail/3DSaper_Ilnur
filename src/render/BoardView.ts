import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game, RevealResult } from '../game/Game';
import { makeDigitMaterials } from './textures';
import { makeGroundMaterial, makeSky, Scenery } from './Scenery';
import { clamp01, easeOutBack, easeOutCubic, Shake, Shockwave, SparkBurst } from './effects';

const TILE = 0.93;          // tile footprint (cell pitch is 1 -> visible gaps)
const TILE_H = 0.5;
const SUNK_Y = -0.58;       // revealed tile centre: hides under the photo plane
const LOSS_Y = -0.25;       // tiles shown after losing (mines sit on them)
const PLANE_Y = -0.3;       // photo plane height
const DROP_Y = -5;          // start height for intro animation
const HOVER_LIFT = 0.1;

type AnimKind = 'in' | 'reveal';
interface Anim { i: number; t: number; dur: number; from: number; to: number; hop: number; kind: AnimKind; }
interface Pulse { i: number; t: number; dur: number; peak: number; hold: boolean; color: THREE.Color; }
interface FlagObj { group: THREE.Group; cloth: THREE.Mesh; t: number; dir: 1 | -1; x: number; z: number; }
interface MineObj { group: THREE.Group; t: number; scale: number; }

const C_A = new THREE.Color(0x2e3d5e), C_B = new THREE.Color(0x283654);
const C_HOVER = new THREE.Color(0x6a97ff), C_REVEALED = new THREE.Color(0x1d2840);

export class BoardView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  shakeEnabled = true;

  private root = new THREE.Group();   // shaken
  private board = new THREE.Group();  // rebuilt per game
  private sun: THREE.DirectionalLight;
  private last = performance.now();
  private shake = new Shake();
  private scenery = new Scenery();
  private sparks = new SparkBurst();
  private wave = new Shockwave();

  private tileGeo = new RoundedBoxGeometry(TILE, TILE_H, TILE, 3, 0.09);
  private tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.25 });
  private planeGeo = new THREE.PlaneGeometry(0.72, 0.72);
  private digitMats: THREE.MeshBasicMaterial[];
  private flagGeo: { pole: THREE.BufferGeometry; base: THREE.BufferGeometry; cloth: THREE.BufferGeometry };
  private flagMat = new THREE.MeshStandardMaterial({ color: 0xff4256, emissive: 0xff2038, emissiveIntensity: 0.55, roughness: 0.5, side: THREE.DoubleSide });
  private poleMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e8, roughness: 0.3, metalness: 0.7 });
  private mineGeo: THREE.BufferGeometry;
  private coreGeo = new THREE.SphereGeometry(0.075, 12, 12);
  private mineMat = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.3, metalness: 0.85 });
  private coreMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false });

  // per-board state
  private game: Game | null = null;
  private w = 0; private h = 0;
  private tiles: THREE.InstancedMesh | null = null;
  private digits: THREE.InstancedMesh[] = [];
  private baseMesh: THREE.Mesh | null = null;
  private frame: THREE.LineSegments | null = null;
  private yBase = new Float32Array(0);
  private rp = new Float32Array(0);          // reveal progress 0..1
  private numScale = new Float32Array(0);
  private lift = new Float32Array(0);
  private tintAmt = new Float32Array(0);
  private tintCol: THREE.Color[] = [];
  private shown = new Uint8Array(0);         // 1 once revealed / sunk
  private anims = new Map<number, Anim>();
  private pulses: Pulse[] = [];
  private flags = new Map<number, FlagObj>();
  private mines = new Map<number, MineObj>();
  private lifted = new Set<number>();
  private hover = -1;
  hoverEnabled = true;
  private time = 0;
  private dirtyTiles = false;
  private dirtyDigits = new Set<number>();
  private fitDistance = 14;
  private sized = false;
  private photoTex: THREE.Texture | null = null;
  private photoMesh: THREE.Mesh | null = null;
  private photoMat: THREE.ShaderMaterial | null = null;
  private maskTex: THREE.DataTexture | null = null;
  private maskData = new Uint8Array(0);
  private photoOn = new Uint8Array(0);
  private maskDirty = false;
  private brightTarget = 0.62;
  private numberAlphaTarget = 1;

  // temp objects
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x06080e);
    this.scene.fog = new THREE.Fog(0x1a1626, 45, 130);
    this.scene.add(makeSky());
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.8;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.38;
    this.controls.autoRotateSpeed = 0.6;
    // Left = orbit; right/middle are reserved for flag / chord clicks.
    (this.controls.mouseButtons as unknown) = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: null };

    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1020, 0.7));
    this.sun = new THREE.DirectionalLight(0xfff1e0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight(0x4cc9ff, 0.8);
    rim.position.set(-12, 6, -10);
    this.scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), makeGroundMaterial());
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.7;
    ground.receiveShadow = true;
    this.scene.add(ground, this.scenery.group);
    this.scenery.group.position.y = -0.7;

    this.scene.add(this.root);
    this.root.add(this.board, this.sparks.points, this.wave.mesh, this.wave.light);

    this.digitMats = makeDigitMaterials(this.renderer.capabilities.getMaxAnisotropy());
    this.flagGeo = this.buildFlagGeo();
    this.mineGeo = this.buildMineGeo();

    new THREE.TextureLoader().load('/photo.jpg', tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.photoTex = tex;
      if (this.game) this.buildPhoto();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ---------- geometry helpers ----------
  private buildFlagGeo() {
    const pole = new THREE.CylinderGeometry(0.022, 0.028, 0.75, 8); pole.translate(0, 0.375, 0);
    const base = new THREE.CylinderGeometry(0.14, 0.17, 0.06, 20); base.translate(0, 0.03, 0);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.38, 0.12); shape.lineTo(0, 0.28); shape.closePath();
    const cloth = new THREE.ShapeGeometry(shape); cloth.translate(0.02, 0.46, 0);
    return { pole, base, cloth };
  }

  private buildMineGeo() {
    const parts: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.2, 24, 18)];
    const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]];
    for (const d of dirs) for (const sign of [1, -1]) {
      const dir = new THREE.Vector3(...d).normalize().multiplyScalar(sign);
      const cone = new THREE.ConeGeometry(0.05, 0.17, 10);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cone.applyMatrix4(new THREE.Matrix4().compose(dir.clone().multiplyScalar(0.25), quat, new THREE.Vector3(1, 1, 1)));
      parts.push(cone);
    }
    const geo = mergeGeometries(parts, false)!;
    parts.forEach(p => p.dispose());
    return geo;
  }

  // ---------- board lifecycle ----------
  build(game: Game) {
    this.clearBoard();
    this.game = game;
    const { width: w, height: h } = game;
    this.w = w; this.h = h;
    const n = w * h;

    this.yBase = new Float32Array(n).fill(DROP_Y);
    this.rp = new Float32Array(n);
    this.numScale = new Float32Array(n);
    this.lift = new Float32Array(n);
    this.tintAmt = new Float32Array(n);
    this.tintCol = Array.from({ length: n }, () => new THREE.Color());
    this.shown = new Uint8Array(n);
    this.photoOn = new Uint8Array(n);

    const tiles = new THREE.InstancedMesh(this.tileGeo, this.tileMat, n);
    tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tiles.castShadow = tiles.receiveShadow = true;
    tiles.frustumCulled = false;
    this.tiles = tiles;
    this.board.add(tiles);

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.digits = this.digitMats.map(mat => {
      const mesh = new THREE.InstancedMesh(this.planeGeo, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, zero);
      this.board.add(mesh);
      return mesh;
    });

    const baseGeo = new RoundedBoxGeometry(w + 0.7, 0.3, h + 0.7, 2, 0.12);
    this.baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x0b101c, roughness: 0.6, metalness: 0.4 }));
    this.baseMesh.position.y = -0.47;
    this.baseMesh.receiveShadow = true;
    this.frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.7, 0.3, h + 0.7)),
      new THREE.LineBasicMaterial({ color: 0x3fb8ff, transparent: true, opacity: 0.45 }),
    );
    this.frame.position.y = -0.47;
    this.board.add(this.baseMesh, this.frame);

    // intro animation: tiles rise in a wave from the centre
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      const d = Math.hypot(x - cx, y - cy);
      this.anims.set(i, { i, t: -(d * 0.045 + Math.random() * 0.12), dur: 0.7, from: DROP_Y, to: 0, hop: 0, kind: 'in' });
      this.updateCell(i);
    }

    const half = Math.max(w, h) * 0.8;
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 80;
    sc.updateProjectionMatrix();
    this.sun.position.set(half * 0.5, half * 1.6, half * 0.7);
    this.sun.target.position.set(0, 0, 0);

    this.buildPhoto();
    this.scenery.build(w, h);
    this.frameCamera();
    this.hover = -1;
  }

  /** Photo lies under the tiles; each revealed safe cell uncovers its own slice via a mask texture. */
  private buildPhoto() {
    if (!this.photoTex) return;
    this.removePhoto();
    const img = this.photoTex.image as { width: number; height: number };
    const boardAspect = this.w / this.h, imgAspect = img.width / img.height;
    const scale = new THREE.Vector2(1, 1), offset = new THREE.Vector2(0, 0);
    if (imgAspect > boardAspect) { scale.x = boardAspect / imgAspect; offset.x = (1 - scale.x) / 2; }
    else { scale.y = imgAspect / boardAspect; offset.y = (1 - scale.y) * 0.3; } // keep the face, crop from below
    this.maskData = new Uint8Array(this.w * this.h);
    this.maskTex = new THREE.DataTexture(this.maskData, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.magFilter = this.maskTex.minFilter = THREE.NearestFilter;
    this.maskTex.needsUpdate = true;
    this.photoMat = new THREE.ShaderMaterial({
      uniforms: { uPhoto: { value: this.photoTex }, uMask: { value: this.maskTex }, uScale: { value: scale }, uOffset: { value: offset }, uBright: { value: 0.62 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D uPhoto, uMask; uniform vec2 uScale, uOffset; uniform float uBright; varying vec2 vUv;
        void main(){
          vec3 photo = texture2D(uPhoto, vUv * uScale + uOffset).rgb * uBright;
          float m = texture2D(uMask, vUv).r;
          gl_FragColor = vec4(mix(vec3(0.012, 0.018, 0.035), photo, m), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.brightTarget = 0.62;
    this.numberAlphaTarget = 1;
    this.digitMats.forEach(m => { m.opacity = 1; });
    this.photoMesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.photoMat);
    this.photoMesh.rotation.x = -Math.PI / 2;
    this.photoMesh.position.y = PLANE_Y;
    this.photoMesh.receiveShadow = false;
    this.board.add(this.photoMesh);
  }

  private removePhoto() {
    if (!this.photoMesh) return;
    this.board.remove(this.photoMesh);
    this.photoMesh.geometry.dispose();
    this.photoMat?.dispose(); this.maskTex?.dispose();
    this.photoMesh = null; this.photoMat = null; this.maskTex = null;
  }

  private clearBoard() {
    this.removePhoto();
    for (const f of this.flags.values()) this.board.remove(f.group);
    for (const m of this.mines.values()) this.board.remove(m.group);
    this.flags.clear(); this.mines.clear(); this.anims.clear(); this.pulses = []; this.lifted.clear();
    if (this.tiles) { this.board.remove(this.tiles); this.tiles.dispose(); this.tiles = null; }
    this.digits.forEach(d => { this.board.remove(d); d.dispose(); });
    this.digits = [];
    if (this.baseMesh) {
      this.board.remove(this.baseMesh); this.baseMesh.geometry.dispose();
      (this.baseMesh.material as THREE.Material).dispose(); this.baseMesh = null;
    }
    if (this.frame) {
      this.board.remove(this.frame); this.frame.geometry.dispose();
      (this.frame.material as THREE.Material).dispose(); this.frame = null;
    }
  }

  frameCamera() {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect);
    const R = Math.hypot(this.w, this.h) * 0.5 * 0.9 + 1;
    this.fitDistance = Math.max(R / Math.sin(Math.min(fov, hfov) / 2) * 0.9, 7);
    const polar = 1.05, azim = 0.0;
    this.camera.position.set(
      Math.sin(polar) * Math.sin(azim) * this.fitDistance,
      Math.cos(polar) * this.fitDistance,
      Math.sin(polar) * Math.cos(azim) * this.fitDistance,
    );
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 4;
    this.controls.maxDistance = this.fitDistance * 1.7;
    this.controls.update();
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The window may report 0x0 at boot (hidden pane); re-fit once a real size shows up.
    if (!this.sized && window.innerWidth > 0 && window.innerHeight > 0) {
      this.sized = true;
      if (this.game) this.frameCamera();
    }
  }

  // ---------- per-cell drawing ----------
  private cellPos(i: number, y: number) {
    const x = i % this.w, z = (i / this.w) | 0;
    return this.v.set(x - (this.w - 1) / 2, y, z - (this.h - 1) / 2);
  }

  private updateCell(i: number) {
    if (!this.tiles || !this.game) return;
    const revealed = this.shown[i] === 1;
    const y = this.yBase[i] + (revealed ? 0 : this.lift[i] * HOVER_LIFT);
    this.m4.compose(this.cellPos(i, y), this.q.identity(), this.s.set(1, 1, 1));
    this.tiles.setMatrixAt(i, this.m4);

    const x = i % this.w, z = (i / this.w) | 0;
    this.col.copy((x + z) % 2 ? C_A : C_B).lerp(C_HOVER, this.lift[i] * 0.55).lerp(C_REVEALED, this.rp[i]);
    if (this.tintAmt[i] > 0) this.col.lerp(this.tintCol[i], this.tintAmt[i]);
    this.tiles.setColorAt(i, this.col);
    this.dirtyTiles = true;
    if (this.maskTex) {
      const row = this.h - 1 - z; // texture v=0 is the near edge
      const val = this.photoOn[i] ? Math.round(this.rp[i] * 255) : 0;
      if (this.maskData[row * this.w + x] !== val) { this.maskData[row * this.w + x] = val; this.maskDirty = true; }
    }

    const cell = this.game.cells[i];
    if (revealed && cell.adjacent > 0 && !cell.mine) {
      const d = Math.min(cell.adjacent, 8) - 1;
      const sc = this.numScale[i];
      this.m4.compose(this.cellPos(i, Math.max(this.yBase[i] + TILE_H / 2, PLANE_Y) + 0.012), this.qFlat, this.s.set(sc, sc, sc));
      this.digits[d].setMatrixAt(i, this.m4);
      this.dirtyDigits.add(d);
    }
  }

  // ---------- game events ----------
  /** Animate cells opened by a reveal action. */
  revealCells(result: RevealResult) {
    for (const { index, depth } of result.revealed) {
      this.shown[index] = 1;
      this.photoOn[index] = 1;
      this.anims.set(index, { i: index, t: -depth * 0.045, dur: 0.42, from: this.yBase[index], to: SUNK_Y, hop: 0.12, kind: 'reveal' });
      this.removeFlag(index, true);
    }
  }

  setFlag(i: number, on: boolean) {
    if (on) {
      if (this.flags.has(i)) { this.flags.get(i)!.dir = 1; return; }
      const group = new THREE.Group();
      const pole = new THREE.Mesh(this.flagGeo.pole, this.poleMat);
      const base = new THREE.Mesh(this.flagGeo.base, this.poleMat);
      const cloth = new THREE.Mesh(this.flagGeo.cloth, this.flagMat);
      for (const m of [pole, base, cloth]) m.castShadow = true;
      group.add(pole, base, cloth);
      group.scale.setScalar(0.0001);
      const p = this.cellPos(i, TILE_H / 2);
      group.position.copy(p);
      this.board.add(group);
      this.flags.set(i, { group, cloth, t: 0, dir: 1, x: p.x, z: p.z });
    } else {
      this.removeFlag(i, false);
    }
  }

  private removeFlag(i: number, instant: boolean) {
    const f = this.flags.get(i);
    if (!f) return;
    if (instant) { this.board.remove(f.group); this.flags.delete(i); } else f.dir = -1;
  }

  setHover(i: number) {
    if (i === this.hover) return;
    this.hover = i;
  }

  setAutoRotate(on: boolean) { this.controls.autoRotate = on; }

  private addMine(i: number, delay: number, scale: number) {
    if (this.mines.has(i)) return;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.mineGeo, this.mineMat);
    body.castShadow = true;
    const core = new THREE.Mesh(this.coreGeo, this.coreMat);
    core.position.y = 0.2;
    group.add(body, core);
    group.rotation.y = Math.random() * Math.PI;
    group.scale.setScalar(0.0001);
    group.position.copy(this.cellPos(i, 0.22));
    this.board.add(group);
    this.mines.set(i, { group, t: -delay, scale });
  }

  private sink(i: number, delay: number) {
    if (this.shown[i]) return;
    this.shown[i] = 1;
    this.anims.set(i, { i, t: -delay, dur: 0.4, from: this.yBase[i], to: LOSS_Y, hop: 0.05, kind: 'reveal' });
  }

  private pulse(i: number, delay: number, color: number, peak: number, hold: boolean, dur = 0.8) {
    this.pulses.push({ i, t: -delay, dur, peak, hold, color: new THREE.Color(color) });
  }

  /** Lose sequence: boom at `idx`, then every other mine surfaces in a ripple. */
  explode(idx: number) {
    const g = this.game!;
    const bx = idx % this.w, bz = (idx / this.w) | 0;
    this.shown[idx] = 1;
    this.anims.set(idx, { i: idx, t: 0, dur: 0.3, from: this.yBase[idx], to: LOSS_Y, hop: 0, kind: 'reveal' });
    this.removeFlag(idx, true);
    this.addMine(idx, 0, 1.6);
    this.pulse(idx, 0, 0xff3030, 0.85, true, 0.25);
    const p = this.cellPos(idx, 0.2);
    this.sparks.burst(p.x, p.y, p.z);
    this.wave.fire(p.x, 0, p.z);
    this.shake.trigger(0.22);

    for (let i = 0; i < g.size; i++) {
      const c = g.cells[i];
      const d = Math.hypot((i % this.w) - bx, ((i / this.w) | 0) - bz);
      if (c.mine && !c.flagged && i !== idx) {
        const delay = 0.3 + Math.min(d * 0.05, 1.4);
        this.sink(i, delay);
        this.addMine(i, delay, 1);
      } else if (c.flagged && !c.mine) {
        this.pulse(i, 0.4 + d * 0.03, 0xff7a1a, 0.7, true, 0.4); // wrong flag
      }
    }
    this.hoverEnabled = false;
  }

  /** Win sequence: flags on all mines, green wave from the last click. */
  win(fromIdx: number) {
    const g = this.game!;
    const bx = fromIdx % this.w, bz = (fromIdx / this.w) | 0;
    for (let i = 0; i < g.size; i++) {
      const d = Math.hypot((i % this.w) - bx, ((i / this.w) | 0) - bz);
      if (g.cells[i].mine) {
        this.removeFlag(i, false);
        if (!this.shown[i]) {
          this.shown[i] = 1; this.photoOn[i] = 1;
          this.anims.set(i, { i, t: -d * 0.04, dur: 0.45, from: this.yBase[i], to: SUNK_Y, hop: 0.08, kind: 'reveal' });
        }
      }
    }
    this.brightTarget = 1.0; // full-colour photo as the reward
    this.numberAlphaTarget = 0.0;
    this.hoverEnabled = false;
  }

  // ---------- picking ----------
  /** Returns cell index under the pointer or -1. */
  pick(clientX: number, clientY: number): number {
    if (!this.game) return -1;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ray = this.raycaster.ray;
    const cell = (y: number) => {
      this.plane.constant = -y;
      if (!ray.intersectPlane(this.plane, this.v)) return -1;
      const hx = this.v.x + (this.w - 1) / 2, hz = this.v.z + (this.h - 1) / 2;
      const x = Math.round(hx), z = Math.round(hz);
      if (Math.abs(hx - x) > TILE / 2 + 0.03 || Math.abs(hz - z) > TILE / 2 + 0.03) return -2; // in a gap
      if (x < 0 || z < 0 || x >= this.w || z >= this.h) return -1;
      return z * this.w + x;
    };
    // Unrevealed tiles stand at y=0.25; check that plane first, then the sunk plane.
    const top = cell(TILE_H / 2);
    if (top >= 0 && !this.shown[top]) return top;
    const low = cell(0);
    return low >= 0 ? low : -1;
  }

  // ---------- frame loop ----------
  private tick() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    this.controls.update();

    // hover lift
    if (this.hoverEnabled && this.hover >= 0 && !this.shown[this.hover]) this.lifted.add(this.hover);
    for (const i of this.lifted) {
      const target = (this.hoverEnabled && i === this.hover && !this.shown[i]) ? 1 : 0;
      const prev = this.lift[i];
      this.lift[i] += (target - prev) * Math.min(1, dt * 16);
      if (Math.abs(this.lift[i] - target) < 0.01) { this.lift[i] = target; if (target === 0) this.lifted.delete(i); }
      this.updateCell(i);
    }

    // tile animations
    for (const a of this.anims.values()) {
      a.t += dt;
      if (a.t < 0) continue;
      const p = clamp01(a.t / a.dur), e = easeOutCubic(p);
      this.yBase[a.i] = a.from + (a.to - a.from) * e + a.hop * Math.sin(Math.PI * p);
      if (a.kind === 'reveal') {
        this.rp[a.i] = e;
        this.numScale[a.i] = p < 0.35 ? 0.0001 : easeOutBack((p - 0.35) / 0.65);
      }
      this.updateCell(a.i);
      if (p >= 1) this.anims.delete(a.i);
    }

    // tint pulses
    if (this.pulses.length) {
      this.pulses = this.pulses.filter(p => {
        p.t += dt;
        if (p.t < 0) return true;
        const k = clamp01(p.t / p.dur);
        const amt = p.hold ? Math.min(1, k * 2) * p.peak : Math.sin(Math.PI * k) * p.peak;
        this.tintAmt[p.i] = amt;
        this.tintCol[p.i].copy(p.color);
        this.updateCell(p.i);
        if (k >= 1) { if (!p.hold) { this.tintAmt[p.i] = 0; this.updateCell(p.i); } return false; }
        return true;
      });
    }

    // flags
    for (const [i, f] of this.flags) {
      f.t = clamp01(f.t + (f.dir * dt) / (f.dir > 0 ? 0.5 : 0.22));
      const e = f.dir > 0 ? easeOutBack(f.t) : f.t;
      f.group.scale.setScalar(Math.max(e * 1.35, 0.0001));
      const drop = (1 - clamp01(f.t * 1.6)) * 1.1 * (f.dir > 0 ? 1 : 0);
      f.group.position.set(f.x, TILE_H / 2 + this.lift[i] * HOVER_LIFT + drop, f.z);
      f.cloth.rotation.y = Math.sin(this.time * 5 + i) * 0.22;
      if (f.dir < 0 && f.t <= 0) { this.board.remove(f.group); this.flags.delete(i); }
    }

    // mines
    for (const m of this.mines.values()) {
      m.t += dt;
      if (m.t < 0) continue;
      const p = clamp01(m.t / 0.45);
      m.group.scale.setScalar(Math.max(easeOutBack(p) * m.scale * 1.35, 0.0001));
      m.group.rotation.y += dt * 0.4;
    }

    if (this.photoMat) {
      const u = this.photoMat.uniforms.uBright;
      u.value += (this.brightTarget - u.value) * Math.min(1, dt * 2.5);
      for (const m of this.digitMats) m.opacity += (this.numberAlphaTarget - m.opacity) * Math.min(1, dt * 1.5);
    }
    this.scenery.update(this.time);
    this.sparks.update(dt);
    this.wave.update(dt);
    this.shake.update(dt, this.root, this.shakeEnabled);

    if (this.dirtyTiles && this.tiles) {
      this.tiles.instanceMatrix.needsUpdate = true;
      if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
      this.dirtyTiles = false;
    }
    for (const d of this.dirtyDigits) this.digits[d].instanceMatrix.needsUpdate = true;
    this.dirtyDigits.clear();
    if (this.maskDirty && this.maskTex) { this.maskTex.needsUpdate = true; this.maskDirty = false; }

    this.renderer.render(this.scene, this.camera);
  }
}
