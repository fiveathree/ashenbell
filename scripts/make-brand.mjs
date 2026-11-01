// 由遊戲素材整 favicon 同分享圖（og:image 1200×630）
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const src = 'public/assets/icons/leg_bell.webp';
const round = s => Buffer.from(`<svg width="${s}" height="${s}"><rect width="${s}" height="${s}" rx="${Math.round(s * 0.18)}"/></svg>`);
const icon = s => sharp(src).resize(s, s).composite([{ input: round(s), blend: 'dest-in' }]).png().toBuffer();

const [i32, i180, i512] = await Promise.all([icon(32), icon(180), icon(512)]);
writeFileSync('public/favicon-32.png', i32);
writeFileSync('public/apple-touch-icon.png', i180);
writeFileSync('public/icon-512.png', i512);
// .ico：內嵌一張 32×32 PNG
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 32; head[7] = 32; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(i32.length, 14); head.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([head, i32]));

const title = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0b0807" stop-opacity=".94"/><stop offset=".62" stop-color="#0b0807" stop-opacity=".28"/><stop offset="1" stop-color="#0b0807" stop-opacity="0"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="70" y="300" font-family="Microsoft JhengHei,Noto Serif TC,serif" font-weight="700" font-size="128" letter-spacing="26" fill="#c8b89a">燼鐘</text>
  <text x="74" y="358" font-family="Cinzel,Times New Roman,serif" font-size="30" letter-spacing="13" fill="#b8953d">ASHEN BELL</text>
  <text x="74" y="412" font-family="Microsoft JhengHei,Noto Serif TC,serif" font-size="26" letter-spacing="3" fill="#a8956c">網頁暗黑動作角色扮演遊戲</text>
</svg>`);
await sharp('docs/screenshots/phase3-mon-ghoul.png').resize(1200, 630, { fit: 'cover' }).composite([{ input: title }]).png({ compressionLevel: 9 }).toFile('public/og-image.png');
console.log('ok');
