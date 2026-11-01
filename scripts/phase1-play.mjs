// Phase 1 驗收：用真滑鼠打屍鬼，直到殺夠 10 隻。用法：node scripts/phase1-play.mjs [low|medium|high]
import { chromium } from 'playwright';
const q = process.argv[2] || 'low';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://localhost:8171/?q=${q}`);
await p.waitForFunction(() => window.__ashen, null, { timeout: 90000 });
await p.waitForTimeout(1500);

const nearest = () => p.evaluate(() => {
  const a = window.__ashen, c = a.camera, me = a.player.pos;
  let best = null, bd = 1e9;
  for (const g of a.ghouls) {
    if (g.dead) continue;
    const d = g.pos.distanceTo(me);
    if (d < bd) { bd = d; const v = new a.Vector3(g.pos.x, 1, g.pos.z).project(c); best = { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, d }; }
  }
  return best;
});
const shot = n => p.screenshot({ path: `docs/screenshots/phase1-${n}.png` });
const t0 = Date.now();
let shots = 0, sawDead = false;
while (Date.now() - t0 < 170000) {
  const s = await p.evaluate(() => ({ kills: window.__ashen.kills(), dead: window.__ashen.player.dead, hp: window.__ashen.player.hp }));
  if (s.dead && !sawDead) { sawDead = true; console.log('player died at kills', s.kills); await p.waitForTimeout(800); await shot('dead'); }
  if (s.kills >= 10) break;
  const g = await nearest();
  if (g && !s.dead) {
    // 目標喺畫面外：向嗰個方向撳地面行過去
    await p.mouse.move(Math.min(1860, Math.max(60, g.x)), Math.min(880, Math.max(60, g.y)));
    await p.mouse.down(); await p.waitForTimeout(250); await p.mouse.up();
    if (shots === 0 && g.d < 3) { await p.waitForTimeout(250); await shot('fight'); shots = 1; }
  }
  await p.waitForTimeout(150);
}
const end = await p.evaluate(() => ({ kills: window.__ashen.kills(), hp: window.__ashen.player.hp, rage: Math.round(window.__ashen.player.rage), wave: window.__ashen.wave() }));
console.log('result', end, 'secs', ((Date.now() - t0) / 1000).toFixed(0));
await p.waitForTimeout(600);
await shot('clear');
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(n / 3); }; f(); }));
console.log('FPS', q, fps.toFixed(1));
console.log('errors', [...new Set(errs)].slice(0, 6));
await b.close();
