import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, Float32BufferAttribute, Group, LoadingManager, Mesh, MeshStandardMaterial, Object3D,
  PlaneGeometry, RepeatWrapping, SRGBColorSpace, Scene, ShaderMaterial, Texture, TextureLoader, Vector2, Vector3,
} from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, darkenTops, worldUV } from '../render/geo';
import type { Fire } from '../render/torch';
import { LIGHT, PALETTE } from '../data/art';
import { CELL, themeOf, WALL, type Theme } from '../data/dungeon';
import { NAV } from '../data/combat';
import { DECOR, HOUSES, LAMPS, SMITHY, STALL, WELL } from '../data/town';
import { T, type Dungeon, type Prop } from './dungeon';
import { navGrid, PROP_RADIUS } from './nav';
import type { Grid } from './grid';

const M = 'assets/models/', TEX = 'assets/textures/';
const CHUNK = 12; // 每 12 格合併成一塊，鏡頭外嘅唔畫
const LANTERN_SCALE = 2.6, SHELF_TOP = 2.04;
const FILE = { barrel: 'wine_barrel_01.glb', crate: 'wooden_crate_01.glb', bucket: 'wooden_bucket_01.glb' };
const NAME = { barrel: '木桶', crate: '木箱', bucket: '水桶' };

const models = new Map<string, Promise<GLTF>>();
const mats = new Map<string, MeshStandardMaterial>();

function model(file: string, manager?: LoadingManager) {
  if (!models.has(file)) models.set(file, new GLTFLoader(manager).loadAsync(M + file));
  return models.get(file)!;
}

function pbr(slot: string, aniso: number, onDone: () => void) {
  const cached = mats.get(slot);
  if (cached) return cached;
  const loader = new TextureLoader();
  let left = 4;
  const tex = (name: string, srgb = false): Texture => {
    const t = loader.load(`${TEX}${slot}/${name}.webp`, () => { if (--left === 0) onDone(); });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  const m = new MeshStandardMaterial({ map: tex('albedo', true), normalMap: tex('normal'), roughnessMap: tex('roughness'), aoMap: tex('ao') });
  mats.set(slot, m);
  return m;
}

const runeMat = new ShaderMaterial({
  transparent: true, depthWrite: false, blending: AdditiveBlending,
  uniforms: { t: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv; uniform float t;
    void main(){
      vec2 p=vUv*2.-1.; float r=length(p), a=atan(p.y,p.x);
      float ring=smoothstep(.02,.0,abs(r-.86))+smoothstep(.012,.0,abs(r-.74));
      float n=7.; float s=abs(mod(a*n/6.2832+t*.03,1.)-.5);
      float spoke=smoothstep(.04,.0,abs(s-.25))*step(.3,r)*step(r,.74);
      float tick=smoothstep(.1,.0,s)*step(.74,r)*step(r,.86);
      float g=ring+spoke*.7+tick*.8;
      float pulse=.7+.3*sin(t*1.7);
      gl_FragColor=vec4(vec3(.62,.02,.012)*pulse,g*(1.-smoothstep(.9,1.,r)));
    }`,
});

/** 兩面斜屋頂，屋脊沿 x 軸 */
function gable(x0: number, x1: number, z0: number, z1: number, y: number, rise: number) {
  const zm = (z0 + z1) / 2, top = y + rise;
  const p = [
    x0, y, z1, x1, y, z1, x1, top, zm, x0, y, z1, x1, top, zm, x0, top, zm, // 南坡
    x1, y, z0, x0, y, z0, x0, top, zm, x1, y, z0, x0, top, zm, x1, top, zm, // 北坡
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new Float32BufferAttribute(new Array(p.length / 3 * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

/** 屋頂東面嗰幅三角牆 */
function gableEnd(_x0: number, x1: number, y: number, z0: number, z1: number, rise: number) {
  const zm = (z0 + z1) / 2, p = [x1, y, z1, x1, y, z0, x1, y + rise, zm];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
  g.computeVertexNormals();
  return g;
}

/** 屋窗：暗木窗格後面有微弱燭光，唔係平面色塊 */
const windowMat = new ShaderMaterial({
  side: 2,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vec2 p=fract(vUv*vec2(2.,3.));
      float bar=step(.1,p.x)*step(p.x,.9)*step(.1,p.y)*step(p.y,.9);
      float edge=step(.05,vUv.x)*step(vUv.x,.95)*step(.04,vUv.y)*step(vUv.y,.96);
      float r=length((vUv-vec2(.5,.35))*vec2(1.2,1.));
      vec3 c=mix(vec3(.5,.2,.05),vec3(.05,.02,.008),smoothstep(.05,.62,r));
      gl_FragColor=vec4(mix(vec3(.012,.008,.005),c,bar*edge),1.);
    }`,
});

/** 可打破道具：主角撳佢會打，打爛可能掉金幣 */
export class Breakable {
  dead = false;
  armor = 0;
  name: string;
  pos: Vector3;
  constructor(public model: Object3D, public data: Prop, public index: number, private onBreak: (b: Breakable) => void) {
    this.name = NAME[data.kind];
    this.pos = new Vector3(data.x, 0, data.z);
  }
  takeHit() { if (!this.dead) { this.dead = true; this.onBreak(this); } }
}

export class Level {
  root = new Group();
  grid!: Grid;
  fires: Fire[] = [];
  breakables: Breakable[] = [];
  theme: Theme;
  private water: Mesh | null = null;

  constructor(private scene: Scene, public d: Dungeon, private aniso: number, private shadows: boolean, private onBreak: (b: Breakable) => void, private broken: number[] = []) {
    this.theme = themeOf(d.floor);
  }

  tile(c: number, r: number) {
    const d = this.d;
    return c < 0 || r < 0 || c >= d.cols || r >= d.rows ? T.WALL : d.tiles[r * d.cols + c];
  }

  isWater(x: number, z: number) { return this.tile(Math.floor(x / CELL), Math.floor(z / CELL)) === T.WATER; }

  private async buildTiles() {
    const d = this.d, th = this.theme;
    await new Promise<void>(res => {
      let n = 2; const one = () => { if (--n === 0) res(); };
      const hadFloor = mats.has(th.floorTex), hadWall = mats.has(th.wallTex);
      pbr(th.floorTex, this.aniso, one); pbr(th.wallTex, this.aniso, one);
      if (hadFloor) one();
      if (hadWall) one();
    });
    const floorMat = mats.get(th.floorTex)!, wallMat = mats.get(th.wallTex)!;
    floorMat.normalScale = new Vector2(1.2, 1.2);
    wallMat.normalScale = new Vector2(1.5, 1.5);
    wallMat.vertexColors = true;

    const floors = new Map<string, BufferGeometry[]>(), walls = new Map<string, BufferGeometry[]>(), water: BufferGeometry[] = [];
    const push = (map: Map<string, BufferGeometry[]>, c: number, r: number, g: BufferGeometry) => {
      const k = `${Math.floor(c / CHUNK)},${Math.floor(r / CHUNK)}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(g);
    };
    const jitter = (i: number) => (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.14;

    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
      const t = this.tile(c, r), x = (c + 0.5) * CELL, z = (r + 0.5) * CELL;
      if (t === T.FLOOR || t === T.WATER) {
        push(floors, c, r, new PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2).translate(x, t === T.WATER ? -0.22 : 0, z));
        if (t === T.WATER) water.push(new PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2).translate(x, -0.04, z));
        continue;
      }
      if (t === T.DOWN || t === T.UP) continue;
      let open = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (this.tile(c + dc, r + dr) !== T.WALL) open = true;
      if (!open) continue;
      // 鏡頭喺 +x +z：牆喺地面嘅鏡頭一邊就只留矮牆，唔擋視線
      const near = this.tile(c - 1, r) !== T.WALL || this.tile(c, r - 1) !== T.WALL || this.tile(c - 1, r - 1) !== T.WALL;
      const i = r * d.cols + c, H = near ? WALL.low * (0.8 + jitter(i) * 3) : WALL.height;
      const inset = near ? 0 : jitter(i + 7);
      push(walls, c, r, box(CELL, H, CELL, x + (this.tile(c + 1, r) !== T.WALL ? -inset : 0), H / 2, z + (this.tile(c, r + 1) !== T.WALL ? -inset : 0), 0.06));
    }

    // 樓梯：切入上牆，落樓梯向 -z 降、上樓梯向 -z 升
    const steps = (s: { x: number; z: number; c: number; r: number }, down: boolean) => {
      for (let i = 0; i < 6; i++) {
        const h = 0.3 * (i + 1), zc = s.z + 1 - (i + 0.5) * (CELL / 6);
        push(floors, s.c, s.r, down
          ? box(CELL, 0.3, CELL / 6 + 0.02, s.x, -h + 0.15, zc, 0.03)
          : box(CELL, h, CELL / 6 + 0.02, s.x, h / 2, zc, 0.03));
      }
    };
    if (d.down.c >= 0) steps(d.down, true);
    if (d.up.c >= 0) steps(d.up, false);

    // 傳送石：一塊立石
    { const w = d.waystone, c = Math.floor(w.x / CELL), r = Math.floor(w.z / CELL);
      push(walls, c, r, box(0.9, 2.5, 0.55, w.x, 1.25, w.z, 0.08));
      push(walls, c, r, box(1.3, 0.3, 1, w.x, 0.15, w.z, 0.06)); }

    if (d.tower) {
      const t = d.tower, c = Math.floor(t.x / CELL), r = Math.floor(t.z / CELL);
      push(walls, c, r, box(3.8, 3.2 * 3, 3.8, t.x, 4.8, t.z, 0.1));
      push(walls, c, r, box(4.4, 0.5, 4.4, t.x, 0.25, t.z, 0.08));
      push(walls, c, r, box(4.3, 0.4, 4.3, t.x, 6.2, t.z, 0.08));
    }
    if (d.floor < 0) {
      // 修道院大門：兩條門柱加門楣
      const g = d.down;
      push(walls, g.c, g.r, box(0.9, 5.4, 0.9, g.x - 1.5, 2.7, g.z + 1, 0.07));
      push(walls, g.c, g.r, box(0.9, 5.4, 0.9, g.x + 1.5, 2.7, g.z + 1, 0.07));
      push(walls, g.c, g.r, box(4.2, 0.8, 1.1, g.x, 5.4, g.z + 1, 0.07));
    }

    for (const p of d.pillars) {
      push(walls, Math.floor(p.x / CELL), Math.floor(p.z / CELL), box(1, p.h, 1, p.x, p.h / 2, p.z, 0.07));
      push(walls, Math.floor(p.x / CELL), Math.floor(p.z / CELL), box(1.4, 0.35, 1.4, p.x, 0.175, p.z, 0.07));
    }
    for (const a of d.altars) {
      const c = Math.floor(a.x / CELL), r = Math.floor(a.z / CELL), z = a.z - 0.55;
      push(walls, c, r, box(3.6, 0.85, 1, a.x, 0.425, z, 0.06));
      push(walls, c, r, box(4, 0.12, 1.2, a.x, 0.91, z, 0.04));
    }
    for (const t of d.torches) {
      const c = Math.floor(t.x / CELL), r = Math.floor(t.z / CELL);
      push(walls, c, r, t.dz ? box(0.8, 0.28, 0.75, t.x, 1.9, t.z + 0.3, 0.05) : box(0.75, 0.28, 0.8, t.x + 0.3, 1.9, t.z, 0.05));
    }

    const addMerged = (map: Map<string, BufferGeometry[]>, mat: MeshStandardMaterial, meters: number, isWall: boolean) => {
      for (const list of map.values()) {
        const clean = list.map(g => {
          const n = g.index ? g.toNonIndexed() : g;
          worldUV(n, meters);
          if (isWall) darkenTops(n);
          return n;
        });
        const m = new Mesh(mergeGeometries(clean), mat);
        m.receiveShadow = true; m.castShadow = isWall;
        this.root.add(m);
      }
    };
    addMerged(floors, floorMat, th.floorMeters, false);
    addMerged(walls, wallMat, th.wallMeters, true);

    if (water.length) {
      const m = new MeshStandardMaterial({
        color: 0x10201c, roughness: 0.34, metalness: 0, transparent: true, opacity: 0.74,
        normalMap: floorMat.normalMap, normalScale: new Vector2(0.08, 0.08),
      });
      this.water = new Mesh(mergeGeometries(water.map(g => worldUV(g.toNonIndexed(), 5))), m);
      this.water.receiveShadow = true;
      this.root.add(this.water);
    }
  }

  private clone(g: GLTF, x: number, y: number, z: number, scale: number, rot: number, cast = this.shadows) {
    const o = g.scene.clone(true);
    o.position.set(x, y, z);
    o.rotation.y = rot;
    o.scale.setScalar(scale);
    o.traverse(c => { if ((c as Mesh).isMesh) { c.castShadow = cast; c.receiveShadow = true; } });
    this.root.add(o);
    return o;
  }

  private async buildProps() {
    const d = this.d;
    const [lantern, candle, chest] = await Promise.all([model('lantern_01.glb'), model('wooden_candlestick.glb'), model('treasure_chest.glb')]);
    const bodies = await Promise.all(Object.values(FILE).map(f => model(f)));
    const byKind = { barrel: bodies[0], crate: bodies[1], bucket: bodies[2] };

    d.props.forEach((p, i) => {
      if (this.broken.includes(i)) { this.grid.clearCircle({ x: p.x, z: p.z, r: PROP_RADIUS }, NAV.heroRadius); return; }
      const o = this.clone(byKind[p.kind], p.x, 0, p.z, p.scale, p.rot);
      if (d.floor >= 0) this.breakables.push(new Breakable(o, p, i, this.onBreak));
    });
    for (const c of d.chests) this.clone(chest, c.x, 0.21, c.z, 1.25, 0.4);

    for (const t of d.torches) {
      const x = t.x + t.dx * 0.32, z = t.z + t.dz * 0.32;
      this.clone(lantern, x, SHELF_TOP, z, LANTERN_SCALE, 0, false);
      this.fires.push({
        flame: new Vector3(x, SHELF_TOP + 0.13 * LANTERN_SCALE, z),
        light: new Vector3(x + t.dx * 0.8, SHELF_TOP + 0.5, z + t.dz * 0.8),
        size: 0.5, power: LIGHT.torchIntensity, color: PALETTE.fire, radius: LIGHT.torchDistance,
      });
    }
    for (const a of d.altars) {
      const z = a.z - 0.6;
      [[-1.3, 1.7], [1.1, 1.7], [1.5, 1.3]].forEach(([dx, s], i) => {
        this.clone(candle, a.x + dx, 0.97, z, s, i, false);
        this.fires.push({
          flame: new Vector3(a.x + dx, 0.97 + 0.235 * s, z), light: i < 2 ? new Vector3(a.x + dx * 0.8, 1.75, z + 1) : null,
          size: 0.2, power: LIGHT.candleIntensity, color: PALETTE.fire, radius: LIGHT.candleDistance,
        });
      });
      if (this.theme.runes) {
        const rune = new Mesh(new PlaneGeometry(5, 5).rotateX(-Math.PI / 2), runeMat);
        rune.position.set(a.x, 0.03, a.z + 3);
        this.root.add(rune);
        this.fires.push({ flame: null, light: new Vector3(a.x, 1.2, a.z + 3), size: 0, power: 20, color: PALETTE.blood, radius: 7 });
      }
    }
    this.fires.push({ flame: null, light: new Vector3(d.waystone.x, 2.9, d.waystone.z + 1), size: 0, power: 7, color: 0x7fa6a0, radius: 4.5 });
    if (d.tower) this.fires.push({ flame: null, light: new Vector3(d.tower.x + 2.6, 2.8, d.tower.z + 2.6), size: 0, power: 16, color: PALETTE.fire, radius: 8 });
    // 樓梯口有光，遠處都搵到
    const { down } = d;
    if (down.c >= 0) this.fires.push({ flame: null, light: new Vector3(down.x, 1.3, down.z + 1.6), size: 0, power: 10, color: new Color(PALETTE.bone).getHex(), radius: 5 });
    for (const p of d.redLights ?? []) this.fires.push({ flame: null, light: new Vector3(p.x, 1.6, p.z), size: 0, power: 14, color: PALETTE.blood, radius: 9 });
  }

  /** 荒鐘鎮：屋、鐵匠鋪、草藥檔、水井、街燈、擺設 */
  private async buildTown() {
    const wood = pbr('town_wood', this.aniso, () => {}), roof = pbr('town_roof', this.aniso, () => {});
    wood.color.set(0x9a846c);
    const plaster = mats.get(this.theme.wallTex)!, stone = mats.get('crypt_wall') ?? pbr('crypt_wall', this.aniso, () => {});
    const water: BufferGeometry[] = [], walls: BufferGeometry[] = [], timber: BufferGeometry[] = [], tiles: BufferGeometry[] = [], glass: BufferGeometry[] = [], rock: BufferGeometry[] = [];

    for (const h of HOUSES) {
      const { x, z, w, d, h: H, door } = h, sx = z + d, ex = x + w;
      walls.push(box(w, H, d, x + w / 2, H / 2, z + d / 2, 0.04));
      // 木框
      for (const px of [x, x + w / 3, x + w * 2 / 3, ex]) timber.push(box(0.2, H, 0.14, px, H / 2, sx + 0.02, 0.02));
      for (const pz of [z, z + d / 2, sx]) timber.push(box(0.14, H, 0.2, ex + 0.02, H / 2, pz, 0.02));
      timber.push(box(w + 0.2, 0.2, 0.14, x + w / 2, 2.2, sx + 0.03, 0.02), box(0.14, 0.2, d + 0.2, ex + 0.03, 2.2, z + d / 2, 0.02));
      timber.push(box(w + 0.4, 0.22, 0.16, x + w / 2, H, sx + 0.03, 0.02));
      // 門窗
      timber.push(box(1.1, 2.1, 0.12, x + door, 1.05, sx + 0.08, 0.02));
      glass.push(new PlaneGeometry(0.9, 1).translate(x + door + 2, 2.9 > H ? 2 : 1.4, sx + 0.06));
      if (door > 2.5) glass.push(new PlaneGeometry(0.9, 1).translate(x + door - 2, 1.4, sx + 0.06));
      glass.push(new PlaneGeometry(0.9, 1).rotateY(Math.PI / 2).translate(ex + 0.06, 1.4, z + d / 2));
      tiles.push(gable(x - 0.5, ex + 0.5, z - 0.5, sx + 0.5, H, 2.2));
      walls.push(gableEnd(x, ex, H, z - 0.45, sx + 0.45, 2.1));
    }

    // 鐵匠鋪：三面開放嘅棚，後面石爐
    const s = SMITHY;
    for (const [px, pz] of [[s.x + 0.1, s.z + 0.1], [s.x + s.w, s.z + 0.1], [s.x + 0.1, s.z + s.d], [s.x + s.w, s.z + s.d]]) timber.push(box(0.3, s.h, 0.3, px, s.h / 2, pz, 0.03));
    tiles.push(gable(s.x - 0.4, s.x + s.w + 0.5, s.z - 0.4, s.z + s.d + 0.4, s.h, 1.5));
    rock.push(box(2.4, 1.3, 3, s.x + 1.3, 0.65, s.z + 4, 0.08), box(1.2, 3.4, 1.2, s.x + 0.8, 1.7, s.z + 4, 0.06));
    timber.push(box(0.7, 0.8, 0.7, s.x + 4.4, 0.4, s.z + 3, 0.05));
    rock.push(box(1, 0.22, 0.42, s.x + 4.4, 0.92, s.z + 3, 0.04));
    this.fires.push({ flame: new Vector3(s.x + 2.4, 1.3, s.z + 4), light: new Vector3(s.x + 3.2, 1.8, s.z + 4), size: 0.9, power: 26, color: PALETTE.fire, radius: 8 });

    // 草藥檔：矮木枱加布棚
    const m = STALL;
    timber.push(box(m.w, 0.9, 1, m.x + m.w / 2, 0.45, m.z + 0.5, 0.04));
    for (const [px, pz] of [[m.x, m.z], [m.x + m.w, m.z], [m.x, m.z + m.d], [m.x + m.w, m.z + m.d]]) timber.push(box(0.14, m.h, 0.14, px, m.h / 2, pz, 0.02));
    tiles.push(gable(m.x - 0.3, m.x + m.w + 0.3, m.z - 0.3, m.z + m.d + 0.3, m.h, 0.7));
    this.fires.push({ flame: null, light: new Vector3(m.x + m.w / 2, 2, m.z + 2), size: 0, power: 10, color: PALETTE.fire, radius: 6 });

    // 水井
    const w = WELL;
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * Math.PI * 2;
      rock.push(box(0.68, 0.85, 0.34, 0, 0, 0, 0.03).rotateY(Math.PI / 2 - t).translate(w.x + Math.cos(t) * w.r, 0.42, w.z + Math.sin(t) * w.r));
    }
    water.push(new CircleGeometry(w.r - 0.1, 20).rotateX(-Math.PI / 2).translate(w.x, 0.5, w.z));
    timber.push(box(0.14, 2.3, 0.14, w.x - 1.2, 1.15, w.z, 0.02), box(0.14, 2.3, 0.14, w.x + 1.2, 1.15, w.z, 0.02), box(2.8, 0.14, 0.14, w.x, 2.3, w.z, 0.02));

    // 街燈
    const [lantern] = await Promise.all([model('lantern_01.glb')]);
    for (const [x, z] of LAMPS) {
      timber.push(box(0.16, 2.6, 0.16, x, 1.3, z, 0.02));
      this.clone(lantern, x, 2.6, z, 1.5, 0, false);
      this.fires.push({ flame: new Vector3(x, 2.8, z), light: new Vector3(x, 2.5, z + 0.3), size: 0.3, power: 15, color: PALETTE.fire, radius: 7 });
    }

    const merged = (list: BufferGeometry[], mat: MeshStandardMaterial, meters: number, cast = true) => {
      if (!list.length) return;
      const g = mergeGeometries(list.map(o => worldUV(o.index ? o.toNonIndexed() : o, meters)));
      const mesh = new Mesh(g, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    const paint = (list: BufferGeometry[]) => list.map(o => { const n = o.index ? o.toNonIndexed() : o; n.setAttribute('color', new BufferAttribute(new Float32Array(n.attributes.position.count * 3).fill(1), 3)); return n; });
    merged(paint(walls), plaster, this.theme.wallMeters);
    merged(paint(rock), stone, this.theme.wallMeters);
    merged(timber, wood, 1.8);
    merged(tiles, roof, 2.4);
    this.root.add(new Mesh(water[0], new MeshStandardMaterial({ color: 0x06090a, roughness: 0.2 })));
    if (glass.length) this.root.add(new Mesh(mergeGeometries(glass.map(g => (g.index ? g.toNonIndexed() : g))), windowMat));

    const models_ = await Promise.all(DECOR.map(o => model(o.file)));
    DECOR.forEach((o, i) => this.clone(models_[i], o.x, o.y ?? 0, o.z, o.h ?? 1, o.rot ?? 0));
  }

  async build() {
    this.grid = navGrid(this.d);
    await this.buildTiles();
    await this.buildProps();
    if (this.d.floor < 0) await this.buildTown();
    this.scene.add(this.root);
    return this;
  }

  remove(b: Breakable) {
    this.root.remove(b.model);
    this.grid.clearCircle({ x: b.data.x, z: b.data.z, r: PROP_RADIUS }, NAV.heroRadius);
    this.breakables = this.breakables.filter(o => o !== b);
  }

  update(t: number) {
    runeMat.uniforms.t.value = t;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => { if ((o as Mesh).isMesh && !(o as Mesh).geometry.boundingSphere) (o as Mesh).geometry.dispose(); });
  }
}
