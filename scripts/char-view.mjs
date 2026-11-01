// 影角色檢查圖：node scripts/char-view.mjs hero.glb 輸出.png
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1800, height: 1100 } });
p.on('pageerror', e => console.log(String(e).slice(0, 200)));
await p.goto(`http://localhost:8171/char-preview.html?m=${process.argv[2].includes(",") ? "hero.glb" : process.argv[2]}${process.argv[2].includes(",") ? "&roster=" + process.argv[2] : ""}${process.argv[4] ? "&zoom=" + process.argv[4] : ""}`);
await p.waitForFunction(() => window.__ok, null, { timeout: 60000 });
await p.waitForTimeout(300);
console.log(JSON.stringify(await p.evaluate(() => window.__ok)));
await p.screenshot({ path: process.argv[3] });
await b.close();
