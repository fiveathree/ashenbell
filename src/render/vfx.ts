import {
  AdditiveBlending, BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh,
  Material, MeshBasicMaterial, PlaneGeometry, RingGeometry, Scene, ShaderMaterial, Vector3,
} from 'three';
import { PALETTE } from '../data/art';
import { FX } from '../data/skills';
import { AI } from '../data/monsters';
import type { Grid } from '../world/grid';
import type { Player } from '../entities/player';

interface Fading { mesh: Mesh; life: number; total: number; peak: number; grow: number; hold: number }

const flat = (g: BufferGeometry) => g.rotateX(-Math.PI / 2);

/** 不規則血跡：圓形邊緣隨機起伏 */
function splatGeo() {
  const n = 18, pos = [0, 0, 0], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, r = 0.45 + Math.random() * 0.6;
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8);
  }
  for (let i = 1; i <= n; i++) idx.push(0, i === n ? 1 : i + 1, i);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const EMBER = new Color(0.95, 0.42, 0.1), STEEL = new Color(0.8, 0.68, 0.5);

/**
 * 柔邊光帶：唔用平面色塊，邊緣同尾部都淡出，先似真火光同刀氣。
 * 用喺 2×2 平面上，半徑 1 = 模型邊緣。
 *   band：inner–outer 範圍；halfArc > 0 = 只顯示前方扇形；arcs > 0 = n 條旋轉拖尾
 */
function softMat(color: Color, band: [number, number], halfArc = 0, arcs = 0, peak = 0.5) {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: {
      op: { value: peak }, color: { value: color }, inner: { value: band[0] }, outer: { value: band[1] },
      halfArc: { value: halfArc }, arcs: { value: arcs },
    },
    vertexShader: `varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vP; uniform float op,inner,outer,halfArc,arcs; uniform vec3 color;
      void main(){
        float r=length(vP), a=atan(vP.x,vP.y), mid=mix(inner,outer,.72);
        float b=smoothstep(inner,mid,r)*(1.-smoothstep(mid,outer,r));
        if(halfArc>0.) b*=1.-smoothstep(halfArc*.7,halfArc,abs(a));
        if(arcs>0.){ float f=fract(a/6.2832*arcs); b*=f*f*f; }
        vec3 c=mix(color,vec3(1.,.6,.25),b*b*.5);
        gl_FragColor=vec4(c,b*op);
      }`,
  });
}

const unitPlane = () => flat(new PlaneGeometry(2, 2));
const setOp = (m: Material, v: number) => {
  if ('uniforms' in m) (m as ShaderMaterial).uniforms.op.value = v; else m.opacity = v;
};

export class Vfx {
  private fading: Fading[] = [];
  private decals: { mesh: Mesh; life: number }[] = [];
  private arrows: { mesh: Mesh; dir: Vector3; dmg: number; life: number }[] = [];
  private swirl: Mesh;
  private splats = [splatGeo(), splatGeo(), splatGeo()];
  private arrowGeo = new PlaneGeometry(0.09, 1.1).rotateX(-Math.PI / 2);
  private spellGeo = new PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2);
  shake = 0;

  constructor(private scene: Scene) {
    this.swirl = new Mesh(unitPlane(), softMat(EMBER, [0.8, 1], 0, 3, 0.2));
    this.swirl.scale.setScalar(2.9);
    this.swirl.visible = false;
    scene.add(this.swirl);
  }

  bump(v: number) { this.shake = Math.max(this.shake, v); }

  private add(geo: BufferGeometry, x: number, y: number, z: number, color: Color | number, opts: Partial<Fading> & { rot?: number; additive?: boolean; mat?: Material; size?: number }) {
    const m = new Mesh(geo, opts.mat ?? new MeshBasicMaterial({
      color, transparent: true, opacity: opts.peak ?? 0.7, depthWrite: false, side: DoubleSide,
      blending: opts.additive === false ? 1 : AdditiveBlending,
    }));
    m.position.set(x, y, z);
    if (opts.size) m.scale.setScalar(opts.size);
    m.rotation.y = opts.rot ?? 0;
    this.scene.add(m);
    const total = opts.life ?? 0.3;
    this.fading.push({ mesh: m, life: total, total, peak: opts.peak ?? 0.7, grow: opts.grow ?? 0, hold: opts.hold ?? 0 });
  }

  /** 重斬扇形 */
  arc(x: number, z: number, yaw: number, radius: number, degrees: number) {
    const mat = softMat(STEEL, [0.68, 1], degrees * Math.PI / 360, 0, 0.3);
    this.add(unitPlane(), x, 0.9, z, 0, { mat, rot: yaw, life: 0.24, peak: 0.3, size: radius });
  }

  /** 擴散嘅光環：戰吼、衝鋒落地 */
  ring(x: number, z: number, radius: number, color: Color | number = EMBER) {
    this.add(unitPlane(), x, 0.08, z, 0, { mat: softMat(new Color(color), [0.8, 1], 0, 0, 0.3), life: 0.5, peak: 0.3, grow: radius });
  }

  /** 巨屍重擊預警：紅圈由外向內收 */
  telegraph(x: number, z: number, radius: number, time: number) {
    this.add(flat(new RingGeometry(radius - 0.08, radius, 48)), x, 0.06, z, new Color(PALETTE.blood).multiplyScalar(4), { life: time, peak: 0.95, hold: time });
    const fill = flat(new CircleGeometry(radius, 48));
    this.add(fill, x, 0.05, z, PALETTE.blood, { life: time, peak: 0.34, hold: time, additive: false });
  }

  /** 燃燒地面 */
  burn(x: number, z: number, radius: number, time: number) {
    this.add(unitPlane(), x, 0.07, z, 0, { mat: softMat(EMBER, [0, 1], 0, 0, 0.5), life: time, peak: 0.5, hold: time, size: radius });
  }

  blood(x: number, z: number, color: number) {
    if (this.decals.length >= FX.bloodDecals) this.killDecal(0);
    const m = new Mesh(this.splats[Math.floor(Math.random() * 3)], new MeshBasicMaterial({
      color, transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    m.position.set(x, 0.025, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(0.8 + Math.random() * 0.8);
    this.scene.add(m);
    this.decals.push({ mesh: m, life: AI.corpseTime });
  }

  private killDecal(i: number) {
    const d = this.decals[i];
    this.scene.remove(d.mesh);
    (d.mesh.material as MeshBasicMaterial).dispose();
    this.decals.splice(i, 1);
  }

  shoot(from: Vector3, to: Vector3, dmg: number, spell: boolean) {
    const dir = new Vector3(to.x - from.x, 0, to.z - from.z).normalize();
    const c = spell ? new Color(2.2, 0.15, 0.1) : new Color(1.3, 1.15, 0.9);
    const m = new Mesh(spell ? this.spellGeo : this.arrowGeo, new MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    }));
    m.position.set(from.x + dir.x * 0.6, 1.3, from.z + dir.z * 0.6);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(m);
    this.arrows.push({ mesh: m, dir, dmg, life: 1.4 });
  }

  /** 換層時清走所有效果 */
  clear() {
    for (const f of this.fading) { this.scene.remove(f.mesh); (f.mesh.material as MeshBasicMaterial).dispose(); }
    for (const a of this.arrows) { this.scene.remove(a.mesh); (a.mesh.material as MeshBasicMaterial).dispose(); }
    this.fading = []; this.arrows = [];
    while (this.decals.length) this.killDecal(0);
  }

  spin(on: boolean, x: number, z: number, t: number) {
    this.swirl.visible = on;
    if (on) { this.swirl.position.set(x, 0.75, z); this.swirl.rotation.y = -t * 14; }
  }

  update(dt: number, player: Player, grid: Grid) {
    this.shake = Math.max(0, this.shake - this.shake * FX.shakeDecay * dt - 0.002);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.total), mat = f.mesh.material as Material;
      setOp(mat, f.hold ? f.peak * (0.5 + 0.5 * (1 - k)) : f.peak * k);
      if (f.grow) f.mesh.scale.setScalar(0.2 + (1 - k) * f.grow);
      if (f.life <= 0) {
        this.scene.remove(f.mesh); f.mesh.geometry.dispose(); mat.dispose();
        this.fading.splice(i, 1);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life < AI.fadeTime) (d.mesh.material as MeshBasicMaterial).opacity = 0.8 * Math.max(0, d.life / AI.fadeTime);
      if (d.life <= 0) this.killDecal(i);
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      a.mesh.position.addScaledVector(a.dir, AI.archer.arrowSpeed * dt);
      const p = a.mesh.position;
      const hit = !player.dead && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 0.7;
      if (hit) player.hurt(a.dmg);
      if (hit || a.life <= 0 || grid.isWall(p.x, p.z)) {
        this.scene.remove(a.mesh); (a.mesh.material as MeshBasicMaterial).dispose();
        this.arrows.splice(i, 1);
      }
    }
  }
}

