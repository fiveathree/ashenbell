// 同一部機比較兩個網址嘅 FPS：node scripts/fps-compare.mjs 網址...
import { chromium } from 'playwright';
for (let round = 0; round < 2; round++) for (const url of process.argv.slice(2)) {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(url);
  await p.waitForTimeout(14000);
  const v = await p.evaluate(ms => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : r(+(n / (ms / 1000)).toFixed(1)); }; f(); }), 5000);
  console.log(url.slice(0, 40), v);
  await b.close();
}
