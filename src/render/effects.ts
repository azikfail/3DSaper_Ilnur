import * as THREE from 'three';

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Small additive spark burst (single reusable pool). */
export class SparkBurst {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private age = 0;
  private life = 0.9;
  private active = false;
  private readonly count: number;

  constructor(count = 110) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffa24a, size: 0.14, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  burst(x: number, y: number, z: number) {
    for (let i = 0; i < this.count; i++) {
      const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 5, sp = 0.5 + Math.random() * 3;
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * sp, up, Math.sin(a) * sp], i * 3);
    }
    this.age = 0;
    this.active = true;
    this.points.visible = true;
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) {
    if (!this.active) return;
    this.age += dt;
    if (this.age >= this.life) { this.active = false; this.points.visible = false; return; }
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      this.vel[o + 1] -= 9 * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 1 - this.age / this.life;
  }

  dispose() { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
}

/** Expanding shockwave ring + short light flash. */
export class Shockwave {
  readonly mesh: THREE.Mesh;
  readonly light: THREE.PointLight;
  private t = 1;
  private readonly dur = 0.75;

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.light = new THREE.PointLight(0xff8a2a, 0, 12, 2);
  }

  fire(x: number, y: number, z: number) {
    this.mesh.position.set(x, y + 0.02, z);
    this.light.position.set(x, y + 1.2, z);
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    const e = easeOutCubic(this.t);
    this.mesh.scale.setScalar(0.4 + e * 5);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - this.t);
    this.light.intensity = 40 * Math.pow(1 - this.t, 2);
    if (this.t >= 1) { this.mesh.visible = false; this.light.intensity = 0; }
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

/** Decaying random offset used for a gentle screen shake. */
export class Shake {
  private amp = 0;
  private time = 0;
  trigger(amount: number) { this.amp = Math.max(this.amp, amount); }
  update(dt: number, target: THREE.Object3D, enabled: boolean) {
    this.time += dt;
    this.amp *= Math.exp(-7 * dt);
    if (this.amp < 0.002 || !enabled) { this.amp = 0; target.position.set(0, 0, 0); return; }
    target.position.set(
      Math.sin(this.time * 95) * this.amp,
      Math.sin(this.time * 83 + 1) * this.amp * 0.6,
      Math.cos(this.time * 71) * this.amp,
    );
  }
}
