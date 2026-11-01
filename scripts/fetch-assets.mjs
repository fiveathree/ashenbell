// 下載素材：Poly Haven（CC0）PBR 材質同道具、three.js 官方 Soldier.glb（暫代主角）
// 材質縮到 1K webp，每層只喺入嗰層時先載入
import { mkdirSync, writeFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import sharp from 'sharp';

const OUT = 'public/assets', RAW = 'assets-raw/polyhaven';
const TEXTURES = {
  crypt_floor: 'monastery_stone_floor', crypt_wall: 'castle_wall_slates',
  chapel_floor: 'mossy_cobblestone', chapel_wall: 'mossy_stone_wall',
  well_floor: 'stone_tiles_02', well_wall: 'rock_wall_08',
  town_floor: 'cobblestone_floor_04', town_wall: 'plastered_stone_wall', town_wood: 'medieval_wood', town_roof: 'grey_roof_tiles',
};
const MODELS = ['WoodenTable_01', 'WoodenChair_01', 'painted_wooden_bench', 'gothic_statue', 'dead_tree_trunk', 'wooden_barrels_01', 'wooden_crate_01', 'treasure_chest', 'wooden_candlestick', 'Lantern_01', 'wine_barrel_01', 'wooden_bucket_01'];
const HEAVY = ['gothic_statue', 'dead_tree_trunk', 'wooden_barrels_01', 'painted_wooden_bench', 'WoodenChair_01', 'WoodenTable_01', 'wooden_candlestick', 'treasure_chest', 'wooden_bucket_01'];

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
    const raw = join(RAW, 'tex', slot, `${name}.jpg`), out = join(OUT, 'textures', slot, `${name}.webp`);
    await get(m['2k'].jpg.url, raw);
    if (!existsSync(out)) {
      mkdirSync(dirname(out), { recursive: true });
      await sharp(raw).resize(1024, 1024).webp({ quality: name === 'normal' ? 88 : 80 }).toFile(out);
    }
  }
}
for (const id of MODELS) {
  const g = (await files(id)).gltf['1k'].gltf;
  const dir = join(RAW, id), main = join(dir, `${id}.gltf`);
  await get(g.url, main);
  for (const [rel, inc] of Object.entries(g.include)) await get(inc.url, join(dir, rel));
  const glb = join(OUT, 'models', `${id.toLowerCase()}.glb`);
  if (!existsSync(glb)) {
    execFileSync('npx', ['gltf-transform', 'webp', main, glb], { stdio: 'inherit', shell: true });
    // 掃描模型面數太高（蠟燭有 21 萬面），減到 12%
    if (HEAVY.includes(id)) {
      const tmp = glb + '.tmp.glb';
      execFileSync('npx', ['gltf-transform', 'simplify', glb, tmp, '--ratio', '0.12', '--error', '0.01'], { stdio: 'inherit', shell: true });
      renameSync(tmp, glb);
    }
  }
}
for (const old of ['floor', 'wall']) rmSync(join(OUT, 'textures', old), { recursive: true, force: true });
