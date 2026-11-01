import {
  BufferAttribute, BufferGeometry, Group, LoadingManager, Mesh, MeshStandardMaterial, Object3D,
  PlaneGeometry, RepeatWrapping, SRGBColorSpace, Scene, Texture, TextureLoader, Vector2, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM } from '../data/art';
import type { Circle, Rect } from './grid';

const LANTERN_SCALE = 2.6;


const M = 'assets/models/';
const T = 'assets/textures/';

/** 用世界座標重算 UV，令材質尺寸一致，方塊之間接得順 */
function worldUV(g: BufferGeometry, meters: number) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)]
      : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / meters, v / meters);
  }
  return g;
}

function pbr(loader: TextureLoader, slot: string, aniso: number) {
  const tex = (name: string, srgb = false): Texture => {
    const t = loader.load(`${T}${slot}/${name}.jpg`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  return new MeshStandardMaterial({
    map: tex('albedo', true), normalMap: tex('normal'), roughnessMap: tex('roughness'), aoMap: tex('ao'),
    aoMapIntensity: 1,
  });
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, bevel = 0.06) => {
  const g = new RoundedBoxGeometry(w, h, d, 2, bevel);
  g.translate(x, y, z);
  return g.index ? g.toNonIndexed() : g;
};

/** 牆頂同柱頂喺鏡頭睇落去係虛空：塗黑，避免法線貼圖喺背光面閃出雜點 */
function darkenTops(g: BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3).fill(1);
  for (let i = 0; i < p.count; i++) {
    if (n.getY(i) > 0.5 && p.getY(i) > 3) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0.015;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

/** 牆用一段段略有前後差嘅石塊，再加壁柱，避免一塊平板 */
function buildWalls() {
  const { halfX: hx, halfZ: hz, wallHeight: H, wallThickness: t, blockWidth: bw } = ROOM;
  const parts: BufferGeometry[] = [];
  const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.14;
  // 遠端兩幅高牆（鏡頭喺 +x +z，近端兩幅只留矮牆，唔擋視線）
  let i = 0;
  for (let x = -hx - t; x < hx + t; x += bw) parts.push(box(bw, H, t, x + bw / 2, H / 2, -hz - t / 2 + jitter(i++)));
  for (let z = -hz; z < hz + t; z += bw) parts.push(box(t, H, bw, -hx - t / 2 + jitter(i++), H / 2, z + bw / 2));
  const low = 0.7;
  for (let x = -hx; x < hx + t; x += bw) parts.push(box(bw, low * (0.8 + Math.abs(jitter(i++)) * 3), t, x + bw / 2, low / 2, hz + t / 2));
  for (let z = -hz; z < hz; z += bw) parts.push(box(t, low * (0.8 + Math.abs(jitter(i++)) * 3), bw, hx + t / 2, low / 2, z + bw / 2));
  // 壁柱
  for (const x of [-7, -2.5, 2.5, 7]) parts.push(box(1.1, H + 0.4, 0.7, x, (H + 0.4) / 2, -hz + 0.15, 0.08));
  for (const z of [-3.5, 3.5]) parts.push(box(0.7, H + 0.4, 1.1, -hx + 0.15, (H + 0.4) / 2, z, 0.08));
  // 掛燈嘅石托（牆邊伸出嚟）
  for (const x of [-7, 7]) parts.push(box(0.8, 0.28, 0.75, x, 1.9, -hz + 0.75, 0.05));
  for (const z of [-3.5, 3.5]) parts.push(box(0.75, 0.28, 0.8, -hx + 0.75, 1.9, z, 0.05));
  // 寶箱後面嘅石祭台
  parts.push(box(4.4, 0.85, 1.05, 0, 0.425, -hz + 0.55, 0.06));
  parts.push(box(4.8, 0.12, 1.25, 0, 0.91, -hz + 0.6, 0.04));
  return parts;
}

/** 後排兩條完整方柱；前排兩條係斷柱，唔擋鏡頭 */
function buildPillars(cols: Circle[]) {
  const parts: BufferGeometry[] = [];
  for (const [x, z, h] of [[-4.4, -5.3, 4.2], [4.4, -5.3, 4.2], [-5, 4, 1.1], [5, 4, 0.75]]) {
    parts.push(box(1, h, 1, x, h / 2, z, 0.07));
    parts.push(box(1.4, 0.35, 1.4, x, 0.175, z, 0.07));
    if (h > 3) parts.push(box(1.3, 0.3, 1.3, x, h, z, 0.07));
    cols.push({ x, z, r: 0.95 });
  }
  return parts;
}

export async function buildRoom(scene: Scene, aniso: number) {
  const manager = new LoadingManager();
  const tl = new TextureLoader(manager);
  const floorMat = pbr(tl, 'floor', aniso);
  const wallMat = pbr(tl, 'wall', aniso);
  floorMat.roughness = 0.82; // 濕石面：比貼圖原值反光多少少
  floorMat.normalScale = new Vector2(1.2, 1.2);
  wallMat.normalScale = new Vector2(1.5, 1.5);

  const floorGeo = worldUV(new PlaneGeometry(60, 60, 1, 1).rotateX(-Math.PI / 2), ROOM.floorTexMeters);
  const floor = new Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  const colliders: Circle[] = [];
  const hz = ROOM.halfZ, hx = ROOM.halfX;
  const rects: Rect[] = [
    { minX: -2.5, maxX: 2.5, minZ: -hz, maxZ: -hz + 1.2 }, // 祭台
    ...[-7, -2.5, 2.5, 7].map(x => ({ minX: x - 0.55, maxX: x + 0.55, minZ: -hz, maxZ: -hz + 0.5 })),
    ...[-3.5, 3.5].map(z => ({ minX: -hx, maxX: -hx + 0.5, minZ: z - 0.55, maxZ: z + 0.55 })),
  ];
  const stone = mergeGeometries([...buildWalls(), ...buildPillars(colliders)].map(g => {
    g.deleteAttribute('uv1'); return darkenTops(worldUV(g, ROOM.wallTexMeters));
  }));
  wallMat.vertexColors = true;
  const walls = new Mesh(stone, wallMat);
  walls.castShadow = walls.receiveShadow = true;
  scene.add(walls);

  const gltf = new GLTFLoader(manager);
  const place = async (file: string, x: number, z: number, opts: { y?: number; rot?: number; h?: number; r?: number } = {}) => {
    const g = await gltf.loadAsync(M + file);
    const o: Group = g.scene;
    o.position.set(x, opts.y ?? 0, z);
    o.rotation.y = opts.rot ?? 0;
    if (opts.h) o.scale.setScalar(opts.h);
    o.traverse((c: Object3D) => { if ((c as Mesh).isMesh) c.castShadow = c.receiveShadow = true; });
    scene.add(o);
    if (opts.r) colliders.push({ x, z, r: opts.r });
    return o;
  };

  await Promise.all([
    place('treasure_chest.glb', 0, -6.2, { h: 1.25, y: 0.21, r: 1.2 }),
    place('wooden_candlestick.glb', -1.7, -7.4, { h: 1.7, y: 0.97 }),
    place('wooden_candlestick.glb', 1.5, -7.5, { h: 1.7, y: 0.97, rot: 1 }),
    place('wooden_candlestick.glb', 1.9, -7.3, { h: 1.3, y: 0.97, rot: 2 }),
    place('wine_barrel_01.glb', -9.3, -6.3, { h: 1.3, rot: 0.4, r: 0.8 }),
    place('wine_barrel_01.glb', -8, -6.7, { h: 1.3, rot: 2, r: 0.8 }),
    place('wine_barrel_01.glb', -9.5, -4.9, { h: 1.3, rot: 1.2, r: 0.8 }),
    place('wooden_crate_01.glb', 8.8, -6.4, { h: 1.4, rot: 0.3, r: 0.8 }),
    place('wooden_crate_01.glb', 7.6, -6.6, { h: 1.1, rot: 1.1, r: 0.7 }),
    place('wooden_crate_01.glb', 8.7, -6.4, { h: 0.9, y: 0.75, rot: 0.9 }),
    place('wooden_bucket_01.glb', -9.2, 1.6, { h: 1.2, rot: 2, r: 0.4 }),
    place('wooden_crate_01.glb', -9.3, 5.8, { h: 1.3, rot: 0.8, r: 0.8 }),
  ]);

  // 火把位：燈籠企喺石托上，光源移離牆身，避免貼牆過曝
  const shelfTop = 2.04, s = LANTERN_SCALE;
  const backZ = -ROOM.halfZ + 0.75, sideX = -ROOM.halfX + 0.75;
  const spots: [number, number, number, number][] = [
    [-7, backZ, 0, 0.75], [7, backZ, 0, 0.75], [sideX, -3.5, 0.75, 0], [sideX, 3.5, 0.75, 0],
  ];
  await Promise.all(spots.map(([x, z]) => place('lantern_01.glb', x, z, { y: shelfTop, h: s })));
  const torchAt = spots.map(([x, z, dx, dz]) => ({
    flame: new Vector3(x, shelfTop + 0.13 * s, z),
    light: new Vector3(x + dx, shelfTop + 0.5, z + dz),
  }));

  // 祭台上嘅燭火，暖暖照住寶箱
  const candleAt = [
    { flame: new Vector3(-1.7, 1.38, -7.4), light: new Vector3(-1.7, 1.75, -6.7) },
    { flame: new Vector3(1.5, 1.38, -7.5), light: new Vector3(1.7, 1.75, -6.7) },
    { flame: new Vector3(1.9, 1.3, -7.3), light: null },
  ];
  return { floor, colliders, rects, torchAt, candleAt };
}

