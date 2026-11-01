// 驗收：新模型喺真遊戲入面嘅畫面、攻擊動作、怪物動作、FPS。用法：node scripts/model-check.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = new Set(), r = {};
p.on('pageerror', e => errs.add(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') errs.add(m.text().slice(0, 200)); });
const fps = (ms = 3000) => p.evaluate(ms => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : r(+(n / (ms / 1000)).toFixed(1)); }; f(); }), ms);
const ready = async f => { await p.waitForFunction(f => { const a = window.__ashen; return a && a.level && !a.changing && a.level.d.floor === f; }, f, { timeout: 90000 }); };
await p.goto('http://localhost:8171/?q=medium&seed=9');
await ready(0);
await p.waitForTimeout(1500);
// 小鎮 NPC
await p.evaluate(() => window.__ashen.enter(-1, 'down')); await ready(-1); await p.waitForTimeout(1500);
for (const id of ['ge', 'dala', 'herb']) {
  await p.evaluate(id => { const a = window.__ashen, n = a.npcs.find(o => o.id === id); a.player.place(n.pos.x + 2, n.pos.z + 2); a.snap(); }, id);
  await p.waitForTimeout(800); await p.mouse.move(960, 60);
  await p.screenshot({ path: `docs/screenshots/model-npc-${id}.png` });
}
// 第 1 層打怪
await p.evaluate(() => window.__ashen.enter(0, 'up')); await ready(0); await p.waitForTimeout(1500);
await p.evaluate(() => { const a = window.__ashen, P = a.player.pos; a.monsters.forEach(m => m.remove()); a.monsters.length = 0; const g = a.spawn('ghoul', P.x + 1.8, P.z + 0.6, 1); g.state = 'chase'; g.maxHp = g.hp = 9999; a.player.attack(g); });
await p.waitForTimeout(650);
await p.screenshot({ path: 'docs/screenshots/model-fight.png' });
r.fightFps = await fps();
r.clip = await p.evaluate(() => [window.__ashen.player.current, window.__ashen.player.swinging]);
await b.close();
console.log(JSON.stringify(r), [...errs]);
