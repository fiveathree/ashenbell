import {
  AdditiveBlending, Camera, Color, DoubleSide, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector3,
} from 'three';
import { RARITY } from '../data/items';
import type { Item } from '../items/item';

export interface Drop {
  x: number; z: number; item: Item | null; gold: number; potion: 'hp' | 'rage' | null;
  label: HTMLDivElement; glow: Mesh; beam: Mesh | null;
  story?: { kind: 'relic' | 'page'; i: number };
}

const POTION = { hp: '生命藥水', rage: '怒氣藥水' };
const glowGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const beamGeo = new PlaneGeometry(0.7, 7).translate(0, 3.5, 0);

/** 柔光：地上光暈係圓形淡出，光柱中間亮、兩邊同頂部淡出，唔係實心色塊 */
const softGlow = (color: Color, peak: number, beam: boolean) => new ShaderMaterial({
  transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  uniforms: { color: { value: color }, op: { value: peak } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: beam
    ? `varying vec2 vUv; uniform vec3 color; uniform float op;
       void main(){ float x=1.-abs(vUv.x*2.-1.); float a=x*x*x*(1.-vUv.y)*(1.-vUv.y)*smoothstep(0.,.04,vUv.y); gl_FragColor=vec4(color,a*op); }`
    : `varying vec2 vUv; uniform vec3 color; uniform float op;
       void main(){ float r=length(vUv*2.-1.); float a=1.-smoothstep(0.,1.,r); gl_FragColor=vec4(color,a*a*op); }`,
});
const v = new Vector3();

/** 地上物品：稀有度顏色標籤，傳奇有光柱。金幣行近自動撿。 */
export class LootField {
  drops: Drop[] = [];
  private root: HTMLDivElement;
  showAll = false;
  onClick: ((d: Drop) => void) | null = null;

  constructor(private scene: Scene) {
    this.root = document.createElement('div');
    this.root.id = 'drops';
    document.getElementById('hud')!.prepend(this.root);
  }

  /** 劇情物：遺物、日記 */
  addStory(x: number, z: number, name: string, story: { kind: 'relic' | 'page'; i: number }) {
    const d = this.add(x, z, null, 0, null, name);
    d.story = story;
    return d;
  }

  add(x: number, z: number, item: Item | null, gold: number, potion: 'hp' | 'rage' | null, title?: string) {
    const color = item ? RARITY[item.rarity].color : gold ? '#e8d84a' : '#c8b89a';
    const label = document.createElement('div');
    label.className = 'drop';
    label.style.color = color;
    label.textContent = title ?? (item ? item.name : gold ? `${gold} 金幣` : POTION[potion!]);
    const d: Drop = { x, z, item, gold, potion, label, glow: null!, beam: null };
    label.addEventListener('pointerdown', e => { e.stopPropagation(); this.onClick?.(d); });
    this.root.appendChild(label);
    d.glow = new Mesh(glowGeo, softGlow(new Color(color), 0.4, false));
    d.glow.position.set(x, 0.05, z);
    d.glow.scale.setScalar(item ? 1.5 : 0.8);
    this.scene.add(d.glow);
    if (item?.rarity === 'legend') {
      d.beam = new Mesh(beamGeo, softGlow(new Color(0.95, 0.42, 0.1), 0.6, true));
      d.beam.position.set(x, 0, z);
      this.scene.add(d.beam);
    }
    this.drops.push(d);
    return d;
  }

  remove(d: Drop) {
    d.label.remove();
    this.scene.remove(d.glow);
    if (d.beam) this.scene.remove(d.beam);
    (d.glow.material as ShaderMaterial).dispose();
    (d.beam?.material as ShaderMaterial | undefined)?.dispose();
    this.drops = this.drops.filter(o => o !== d);
  }

  clear() { [...this.drops].forEach(d => this.remove(d)); }

  /** 標籤跟住物品；重疊就向上疊 */
  update(camera: Camera, t: number, hide: boolean) {
    const used: [number, number][] = [];
    for (const d of this.drops) {
      if (d.beam) {
        d.beam.quaternion.copy(camera.quaternion);
        (d.beam.material as ShaderMaterial).uniforms.op.value = 0.6 + Math.sin(t * 3) * 0.12;
      }
      const normal = d.item ? d.item.rarity !== 'white' : d.gold > 0;
      const vis = !hide && (normal || d.potion !== null || d.story !== undefined || this.showAll);
      v.set(d.x, 0.2, d.z).project(camera);
      if (!vis || v.z > 1) { d.label.style.display = 'none'; continue; }
      let x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
      d.label.style.display = '';
      const h = d.label.offsetHeight + 2 || 20;
      for (let i = 0; i < 8 && used.some(u => Math.abs(u[0] - x) < 90 && Math.abs(u[1] - y) < h); i++) y -= h;
      used.push([x, y]);
      d.label.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      x = 0;
    }
  }
}
