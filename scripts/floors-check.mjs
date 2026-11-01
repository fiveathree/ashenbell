// 驗收：逐層載入新模型、Boss 三階段、主角死亡復活。用法：node scripts/floors-check.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = new Set(), r = {};
p.on('pageerror', e => errs.add(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') errs.add(m.text().slice(0, 200)); });
await p.goto('http://localhost:8171/?q=medium&seed=7');
const ready = f => p.waitForFunction(f => { const a = window.__ashen; return a && a.level && !a.changing && a.level.d.floor === f; }, f, { timeout: 90000 });
await ready(0);
for (const f of [1, 2, 3]) {
  await p.evaluate(f => window.__ashen.enter(f, 'up'), f); await ready(f); await p.waitForTimeout(1200);
  r['types' + f] = await p.evaluate(() => [...new Set(window.__ashen.monsters.map(m => m.id))]);
}
await p.evaluate(() => { const a = window.__ashen, g = a.monsters.find(m => m.id === 'abbot'); a.player.hero.gold = 0; a.player.place(g.pos.x + 3, g.pos.z + 3); a.snap(); });
await p.waitForTimeout(1500);
await p.screenshot({ path: 'docs/screenshots/model-boss.png' });
await p.evaluate(() => { const a = window.__ashen, g = a.monsters.find(m => m.id === 'abbot'); a.player.hp = 1e6; g.takeHit(g.maxHp * 0.4, false); });
await p.waitForTimeout(800);
await p.evaluate(() => { const a = window.__ashen, g = a.monsters.find(m => m.id === 'abbot'); g.takeHit(g.maxHp * 0.4, false); });
await p.waitForTimeout(800);
await p.evaluate(() => { const a = window.__ashen, g = a.monsters.find(m => m.id === 'abbot'); g.takeHit(99999, false); });
await p.waitForTimeout(1600);
r.bossGone = await p.evaluate(() => !window.__ashen.monsters.some(m => m.id === 'abbot'));
await p.evaluate(() => { const a = window.__ashen; a.player.hp = 1; a.player.invuln = 0; a.player.hurt(9e9); });
await p.waitForTimeout(700);
await p.screenshot({ path: 'docs/screenshots/model-death.png' });
await p.waitForFunction(() => { const a = window.__ashen; return a.level.d.floor === -1 && !a.changing && !a.player.dead; }, null, { timeout: 30000 });
r.respawned = true;
console.log(JSON.stringify(r), [...errs]);
await b.close();
