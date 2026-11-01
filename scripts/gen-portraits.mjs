// 用本機 ComfyUI 免費生成 NPC 頭像。要先開 ComfyUI。已有嘅會跳過。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const API = 'http://127.0.0.1:8188', OUT = 'public/assets/portraits';
const FACES = {
  ge: 'an old weathered night watchman, grey stubble, deep wrinkles, tired eyes, worn leather hood, holding lantern light on his face',
  dala: 'one strong middle-aged woman blacksmith, soot smeared face, short dark hair, leather apron, orange forge fire light from one side, dark smithy behind her',
  herb: 'a very old herbalist woman, deep wrinkles, grey hair under a dark shawl, knowing eyes, candlelight',
};
const NEG = 'two people, duplicate, multiple views, sketch, white background, grey background, cartoon, anime, chibi, cute, 3d render, plastic skin, text, watermark, logo, border, frame, bright background, smiling, multiple people, deformed';
const prompt = d => `dark fantasy character portrait, ${d}, realistic oil painting, grim medieval, muted colors, dramatic chiaroscuro lighting, black background, head and shoulders`;

const workflow = (text, seed) => ({
  4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
  5: { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 832, batch_size: 1 } },
  6: { class_type: 'CLIPTextEncode', inputs: { text, clip: ['4', 1] } },
  7: { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['4', 1] } },
  3: { class_type: 'KSampler', inputs: { seed, steps: 26, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
  8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
  9: { class_type: 'SaveImage', inputs: { filename_prefix: 'ashenbell_face', images: ['8', 0] } },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`${API}/system_stats`)).ok) break; } catch { /* 未開好 */ }
  await sleep(2000);
}
mkdirSync(OUT, { recursive: true });
let seed = 9300;
for (const [name, desc] of Object.entries(FACES)) {
  seed += 13;
  const path = `${OUT}/${name}.webp`;
  if (existsSync(path)) continue;
  const r = await (await fetch(`${API}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow(prompt(desc), seed) }) })).json();
  for (;;) {
    await sleep(2500);
    const h = (await (await fetch(`${API}/history/${r.prompt_id}`)).json())[r.prompt_id];
    if (!h) continue;
    const img = h.outputs?.['9']?.images?.[0];
    if (img) {
      const png = Buffer.from(await (await fetch(`${API}/view?filename=${encodeURIComponent(img.filename)}&type=output`)).arrayBuffer());
      writeFileSync(path, await sharp(png).resize(384, 384).webp({ quality: 84 }).toBuffer());
      console.log('done', name);
    }
    break;
  }
}
console.log('all done');
