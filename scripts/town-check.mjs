// 荒鐘鎮畫面同兩張顯卡嘅 FPS。用法：node scripts/town-check.mjs
import { chromium } from 'playwright';
const fps = (p, ms = 3000) => p.evaluate(ms => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : r(+(n / (ms / 1000)).toFixed(1)); }; f(); }), ms);
const out = {}, errs = new Set();
const open = async (args, url) => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', ...args] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => errs.add(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.add(m.text().slice(0, 200)); });
  await p.goto(url);
  await p.waitForFunction(() => window.__ashen && !window.__ashen.changing && window.__ashen.level, null, { timeout: 120000 });
  return [b, p];
};
// 小鎮截圖（高畫質，RTX）
{
  const [b, p] = await open(['--force_high_performance_gpu'], 'http://localhost:8171/?q=high&seed=9&floor=-1');
  await p.evaluate(() => window.__ashen.enter(-1, 'down'));
  await p.waitForFunction(() => window.__ashen.level.d.floor === -1 && !window.__ashen.changing);
  await p.waitForTimeout(2500);
  for (const [n, x, z] of [['gate', 25, 16.5], ['smithy', 23, 31], ['tower', 34, 30], ['inn', 44, 24], ['stall', 42, 34]]) {
    await p.evaluate(([x, z]) => { const a = window.__ashen; a.player.place(x, z); a.snap(); }, [x, z]);
    await p.waitForTimeout(900);
    await p.mouse.move(960, 60);
    await p.screenshot({ path: `docs/screenshots/phase7-town-${n}.png` });
  }
  out.townFpsHigh = await fps(p);
  out.townCalls = await p.evaluate(() => window.__ashen.stats);
  await b.close();
}
for (const [gpu, args] of [['RTX', ['--force_high_performance_gpu']], ['Intel', []]]) {
  for (const q of ['low', 'medium']) {
    const [b, p] = await open(args, `http://localhost:8171/?q=${q}&seed=12345`);
    await p.waitForTimeout(3000);
    out[`${gpu}-${q}`] = await fps(p);
    await b.close();
  }
}
console.log(JSON.stringify(out, null, 1));
console.log('errors', [...errs].slice(0, 6));
