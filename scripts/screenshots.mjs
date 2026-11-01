// 用本機 Chrome 真顯卡截圖（--use-angle=d3d11），唔用軟件渲染。用法：node scripts/screenshots.mjs [phase] [url]
import { chromium } from 'playwright';
const phase = process.argv[2] || '0', url = process.argv[3] || 'http://localhost:8171/?q=high';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.__ashen, null, { timeout: 90000 });
await p.waitForTimeout(2500);
const gl = await p.evaluate(() => { const g = window.__ashen.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
console.log('GPU', gl);
const shot = async (name, x, z, move) => {
  await p.evaluate(([x, z]) => { const a = window.__ashen; a.player.target = null; a.player.place(x, z); a.snap(); }, [x, z]);
  if (move) await p.evaluate(([mx, mz]) => window.__ashen.player.moveTo(new (window.__ashen.focus.constructor)(mx, 0, mz)), move);
  await p.waitForTimeout(move ? 700 : 1200);
  await p.screenshot({ path: `docs/screenshots/phase${phase}-${name}.png` });
};
await shot('chest', 0.5, -3.6);
await shot('torch', -7.6, -4.4);
await shot('run', 0, 1, [-9, 5]);
// 真滑鼠：撳地面，確認主角行過去
await p.evaluate(() => { const a = window.__ashen; a.player.target = null; a.player.place(0, 0); a.snap(); });
await p.waitForTimeout(600);
const before = await p.evaluate(() => window.__ashen.player.model.position.toArray());
await p.mouse.click(1250, 620);
await p.waitForTimeout(2500);
const after = await p.evaluate(() => window.__ashen.player.model.position.toArray());
console.log('click move', before.map(v => v.toFixed(2)), '->', after.map(v => v.toFixed(2)));
console.log('scroll', await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]));
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(n / 3); }; f(); }));
console.log('FPS', url, fps.toFixed(1));
for (const q of ['low', 'medium']) {
  await p.goto(url.replace('q=high', 'q=' + q));
  await p.waitForFunction(() => window.__ashen, null, { timeout: 90000 });
  await p.waitForTimeout(4000);
  const f = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(n / 3); }; f(); }));
  console.log('FPS', q, f.toFixed(1));
}
console.log('errors', [...new Set(errs)].slice(0, 8));
await b.close();
