import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Camera, Color, DoubleSide, Mesh, PlaneGeometry,
  PointLight, Points, PointsMaterial, Scene, ShaderMaterial, Vector3,
} from 'three';
import { LIGHT, PALETTE } from '../data/art';
import { VIEW } from '../data/dungeon';

const flameMat = new ShaderMaterial({
  transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  uniforms: { t: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying float vSeed;
    void main(){ vUv=uv; vSeed=modelMatrix[3][0]*1.7+modelMatrix[3][2]*2.3; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv; varying float vSeed; uniform float t;
    float n(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    float sn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(n(i),n(i+vec2(1,0)),f.x),mix(n(i+vec2(0,1)),n(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 p){ return .5*sn(p)+.3*sn(p*2.1)+.2*sn(p*4.3); }
    void main(){
      vec2 p=vUv; p.x=(p.x-.5)*2.;
      float w=fbm(vec2(p.x*2.+vSeed,p.y*3.-(t+vSeed)*2.6));
      p.x+=(w-.5)*.7*p.y;
      float body=(1.-p.y)*(1.-p.y)*1.6-abs(p.x)*1.5;
      body+=(w-.5)*.9*p.y;
      float a=smoothstep(.0,.35,body)*smoothstep(0.,.1,vUv.y);
      vec3 c=mix(vec3(1.,.16,.02),vec3(1.,.48,.1),smoothstep(.1,.6,body));
      c=mix(c,vec3(1.,.74,.36),smoothstep(.7,1.2,body));
      gl_FragColor=vec4(c*(.62+body*.42),a*.9);
    }`,
});

/** 閃爍用平滑噪聲，唔用純隨機，先似火 */
const flick = (t: number, s: number) =>
  (Math.sin(t * 7.3 + s) + Math.sin(t * 13.1 + s * 2.1) * 0.6 + Math.sin(t * 23.7 + s * 3.3) * 0.3) / 1.9;

export interface Fire {
  flame: Vector3 | null; // 冇火苗 = 純光源（符文紅光）
  light: Vector3 | null; // 冇光 = 只有火苗（蠟燭第二支）
  size: number;
  power: number;
  color: number;
  radius: number;
}

const flameGeo = new PlaneGeometry(1, 1).translate(0, 0.5, 0);

/**
 * 光源數量固定，只係搬位去最近嘅火把。three.js 改燈數會重新編譯 shader，
 * 開關燈會卡一下，所以永遠保持同一數量。
 */
export class FirePool {
  private lights: PointLight[] = [];
  private meshes: Mesh[] = [];
  private fires: Fire[] = [];
  private scene: Scene;
  sources: Vector3[] = []; // 而家最近嘅火，俾火星用

  constructor(scene: Scene, count: number) {
    this.scene = scene;
    for (let i = 0; i < count; i++) {
      const l = new PointLight(PALETTE.fire, 0, LIGHT.torchDistance, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push(l);
    }
  }

  set(fires: Fire[]) {
    for (const m of this.meshes) this.scene.remove(m);
    this.fires = fires;
    this.meshes = fires.filter(f => f.flame).map(f => {
      const m = new Mesh(flameGeo, flameMat);
      m.scale.set(f.size * 0.6, f.size, 1);
      m.position.copy(f.flame!);
      m.userData.fire = f;
      this.scene.add(m);
      return m;
    });
  }

  update(t: number, camera: Camera, focus: Vector3) {
    flameMat.uniforms.t.value = t;
    const dist = (p: Vector3) => Math.hypot(p.x - focus.x, p.z - focus.z);
    const lit = this.fires.filter(f => f.light).sort((a, b) => dist(a.light!) - dist(b.light!));
    this.lights.forEach((l, i) => {
      const f = lit[i];
      if (!f) { l.intensity = 0; l.position.y = -50; return; }
      const k = flick(t, f.light!.x * 3.1 + f.light!.z);
      l.position.copy(f.light!);
      l.position.y += k * 0.03;
      l.color.set(f.color);
      l.distance = f.radius;
      l.intensity = f.power * (1 + k * LIGHT.torchFlicker);
    });
    this.sources = lit.slice(0, 4).filter(f => f.flame).map(f => f.flame!);
    for (const m of this.meshes) {
      m.visible = dist(m.position) < VIEW.flameActive;
      if (!m.visible) continue;
      const f = m.userData.fire as Fire;
      m.quaternion.copy(camera.quaternion);
      // 向鏡頭推少少，火焰唔會俾燈籠外殼完全遮住
      m.position.copy(f.flame!).addScaledVector(camera.position.clone().sub(f.flame!).normalize(), f.size * 0.6);
    }
  }
}

/** 由最近嘅火把飄起嘅火星 */
export class Embers {
  points: Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;

  constructor(scene: Scene, private pool: FirePool, private count = 70) {
    this.pos = new Float32Array(count * 3).fill(-50);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.points = new Points(g, new PointsMaterial({
      color: new Color(3, 1.3, 0.35), size: 0.05, transparent: true, depthWrite: false,
      blending: AdditiveBlending, fog: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private spawn(i: number) {
    const src = this.pool.sources;
    if (!src.length) return;
    const s = src[i % src.length];
    this.pos[i * 3] = s.x + (Math.random() - 0.5) * 0.12;
    this.pos[i * 3 + 1] = s.y + Math.random() * 0.2;
    this.pos[i * 3 + 2] = s.z + (Math.random() - 0.5) * 0.12;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.3;
    this.vel[i * 3 + 1] = 0.4 + Math.random() * 0.7;
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    this.life[i] = 1 + Math.random() * 1.8;
  }

  update(dt: number, t: number) {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.spawn(i); continue; }
      this.pos[i * 3] += (this.vel[i * 3] + Math.sin(t * 3 + i) * 0.2) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + Math.cos(t * 2.4 + i) * 0.2) * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** 主角附近飄浮嘅灰塵 */
export class Dust {
  points: Points;
  private pos: Float32Array;

  constructor(scene: Scene, private count = 160, private range = 9) {
    this.pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * range * 2;
      this.pos[i * 3 + 1] = Math.random() * 3.5;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * range * 2;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.points = new Points(g, new PointsMaterial({
      color: PALETTE.bone, size: 0.025, transparent: true, opacity: 0.16, depthWrite: false,
      blending: AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt: number, t: number, center: Vector3) {
    const r = this.range;
    for (let i = 0; i < this.count; i++) {
      let x = this.pos[i * 3] + Math.sin(t * 0.3 + i) * 0.05 * dt;
      let y = this.pos[i * 3 + 1] + 0.04 * dt;
      let z = this.pos[i * 3 + 2] + Math.cos(t * 0.27 + i) * 0.05 * dt;
      if (x - center.x > r) x -= r * 2; else if (x - center.x < -r) x += r * 2;
      if (z - center.z > r) z -= r * 2; else if (z - center.z < -r) z += r * 2;
      if (y > 3.5) y = 0;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** 打破道具嘅碎屑 */
export class Debris {
  private items: { p: Points; v: Float32Array; life: number }[] = [];

  constructor(private scene: Scene) {}

  burst(x: number, z: number, color = PALETTE.bone) {
    const n = 26, pos = new Float32Array(n * 3), v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = 0.5; pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.2;
      v[i * 3] = Math.cos(a) * s; v[i * 3 + 1] = 1 + Math.random() * 2.6; v[i * 3 + 2] = Math.sin(a) * s;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    const p = new Points(g, new PointsMaterial({ color, size: 0.07, transparent: true, depthWrite: false }));
    p.frustumCulled = false;
    this.scene.add(p);
    this.items.push({ p, v, life: 0.9 });
  }

  update(dt: number) {
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k], a = it.p.geometry.attributes.position, arr = a.array as Float32Array;
      it.life -= dt;
      for (let i = 0; i < it.v.length; i += 3) {
        it.v[i + 1] -= 7 * dt;
        arr[i] += it.v[i] * dt;
        arr[i + 1] = Math.max(0.02, arr[i + 1] + it.v[i + 1] * dt);
        arr[i + 2] += it.v[i + 2] * dt;
      }
      a.needsUpdate = true;
      (it.p.material as PointsMaterial).opacity = Math.min(1, it.life * 2);
      if (it.life <= 0) {
        this.scene.remove(it.p); it.p.geometry.dispose(); (it.p.material as PointsMaterial).dispose();
        this.items.splice(k, 1);
      }
    }
  }
}
