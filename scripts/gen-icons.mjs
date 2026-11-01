// 用本機 ComfyUI（SDXL）免費生成裝備同技能圖示。要先開 ComfyUI（http://127.0.0.1:8188）。
// 已經有嘅圖會跳過，要重畫就刪走 public/assets/icons/ 入面嗰張。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const API = 'http://127.0.0.1:8188', OUT = 'public/assets/icons';
const ICONS = {
  sword: 'a single worn steel one-handed longsword, vertical, nicked blade',
  axe: 'a single brutal iron battle axe, chipped edge, dark wooden haft, vertical',
  greatsword: 'a single massive two-handed greatsword, blackened steel, vertical',
  helm: 'a dented medieval iron great helm, dark visor slit',
  chest: 'a battered steel plate cuirass breastplate, scratched, leather straps',
  gloves: 'a pair of worn steel plate gauntlets',
  boots: 'a pair of worn dark leather boots with iron plates',
  belt: 'a thick worn leather belt with a heavy iron buckle',
  ring: 'a single dark iron ring with a small blood red gem',
  amulet: 'a tarnished iron amulet pendant on a thin chain',
  leg_bell: 'a cracked broken bronze bell pendant amulet, glowing ember cracks, on a chain',
  leg_oath: 'a huge greatsword with a charred blade glowing with ember cracks, ash falling, vertical',
  leg_lamp: 'a leather belt with a small iron watchman lantern attached, warm flame inside',
  leg_drowned: 'a pair of waterlogged rotten boots dripping dark water, algae, barnacles',
  leg_ring: 'a ring shaped like a tiny bell made of dark iron, dripping blood red glow',
  skill_heavy: 'a heavy sword slash arc of steel and sparks, motion blur, close up',
  skill_charge: 'an armored shoulder bursting forward through dust and sparks, motion',
  skill_whirl: 'a swirling vortex of steel blades and embers seen from above',
  skill_roar: 'a screaming armored warrior silhouette with shockwave of embers',
};
const NEG = 'cartoon, anime, chibi, cute, flat, vector, clipart, low poly, text, watermark, logo, border, frame, bright background, white background, multiple objects, hands, person';

const prompt = d => `dark fantasy RPG item icon, ${d}, realistic painted style, worn and battle-scarred, dark background, dramatic rim light, Diablo II style, square, no text`;

function workflow(text, seed) {
  return {
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    5: { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 832, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text, clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['4', 1] } },
    3: { class_type: 'KSampler', inputs: { seed, steps: 24, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: 'ashenbell', images: ['8', 0] } },
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 90; i++) {
  try { if ((await fetch(`${API}/system_stats`)).ok) break; } catch { /* 未開好 */ }
  await sleep(2000);
}
mkdirSync(OUT, { recursive: true });
let seed = 4100;
for (const [name, desc] of Object.entries(ICONS)) {
  seed += 7;
  const path = `${OUT}/${name}.webp`;
  if (existsSync(path)) continue;
  const t0 = Date.now();
  const r = await (await fetch(`${API}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow(prompt(desc), seed) }) })).json();
  if (!r.prompt_id) { console.log('reject', name, JSON.stringify(r).slice(0, 300)); continue; }
  for (;;) {
    await sleep(2500);
    const h = (await (await fetch(`${API}/history/${r.prompt_id}`)).json())[r.prompt_id];
    if (!h) continue;
    const img = h.outputs?.['9']?.images?.[0];
    if (!img) { console.log('fail', name); break; }
    const png = Buffer.from(await (await fetch(`${API}/view?filename=${encodeURIComponent(img.filename)}&type=output`)).arrayBuffer());
    writeFileSync(path, await sharp(png).resize(256, 256).webp({ quality: 82 }).toBuffer());
    console.log('done', name, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    break;
  }
}
console.log('all done');
