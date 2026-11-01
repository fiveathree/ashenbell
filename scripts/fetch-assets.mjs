// 下載 Phase 0 素材：Poly Haven（CC0）PBR 材質同道具、three.js 官方 Soldier.glb（暫代主角）
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';

const OUT = 'public/assets', RAW = 'assets-raw/polyhaven';
const TEXTURES = { floor: 'monastery_stone_floor', wall: 'castle_wall_slates' };
const MODELS = ['wooden_crate_01', 'treasure_chest', 'wooden_candlestick', 'Lantern_01', 'wine_barrel_01', 'wooden_bucket_01'];
const SOLDIER = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/Soldier.glb';

async function get(url, path) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  console.log('got', path);
}
const files = async id => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();

for (const [slot, id] of Object.entries(TEXTURES)) {
  const f = await files(id);
  const maps = { albedo: f.Diffuse, normal: f.nor_gl, roughness: f.Rough, ao: f.AO };
  for (const [name, m] of Object.entries(maps)) {
    if (!m) { console.log('no map', id, name); continue; }
    await get(m['2k'].jpg.url, join(OUT, 'textures', slot, `${name}.jpg`));
  }
}
for (const id of MODELS) {
  const g = (await files(id)).gltf['1k'].gltf;
  const dir = join(RAW, id), main = join(dir, `${id}.gltf`);
  await get(g.url, main);
  for (const [rel, inc] of Object.entries(g.include)) await get(inc.url, join(dir, rel));
  const glb = join(OUT, 'models', `${id.toLowerCase()}.glb`);
  if (!existsSync(glb)) execFileSync('npx', ['gltf-transform', 'webp', main, glb], { stdio: 'inherit', shell: true });
}
await get(SOLDIER, join(OUT, 'models', 'soldier.glb'));
