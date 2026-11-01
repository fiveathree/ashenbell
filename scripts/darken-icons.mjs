// 規格要深色背景：SDXL 有幾張背景偏光，加圓形暗角壓暗四邊。gen-icons 之後跑一次。
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const LIGHT = ['axe', 'belt', 'boots', 'helm', 'gloves', 'sword', 'chest'];
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><radialGradient id="g" r="0.68">
  <stop offset="0.42" stop-color="#fff"/><stop offset="1" stop-color="#0a0806"/></radialGradient></defs><rect width="256" height="256" fill="url(#g)"/></svg>`);

for (const n of LIGHT) {
  const p = `public/assets/icons/${n}.webp`;
  const out = await sharp(readFileSync(p)).modulate({ brightness: 0.72 }).composite([{ input: svg, blend: 'multiply' }]).webp({ quality: 84 }).toBuffer();
  writeFileSync(p, out);
}
console.log('done', LIGHT.length);
