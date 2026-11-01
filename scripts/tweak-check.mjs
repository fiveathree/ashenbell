// 驗收：草藥婆回血、鐘樓唔遮老葛、地圖標記、屍體消失
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = new Set(), r = {};
p.on('pageerror', e => errs.add(String(e).slice(0, 200)));
await p.goto('http://localhost:8171/?q=high&seed=9');
await p.waitForFunction(() => window.__ashen && !window.__ashen.changing && window.__ashen.level, null, { timeout: 90000 });
await p.waitForTimeout(1500);
const scr = (x, y, z) => p.evaluate(([x, y, z]) => { const a = window.__ashen, v = new a.Vector3(x, y, z).project(a.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, y, z]);
// 屍體
await p.evaluate(() => { const a = window.__ashen; a.monsters.forEach(m => m.state !== 'dead' && m.remove()); a.monsters.length = 0; const P = a.player.pos, m = a.spawn('ghoul', P.x + 1.5, P.z, 4); m.state = 'chase'; m.takeHit(9999, false); });
await p.waitForTimeout(200);
r.corpse0 = await p.evaluate(() => window.__ashen.monsters.length);
await p.waitForTimeout(1300);
r.corpseGone = await p.evaluate(() => window.__ashen.monsters.length);
r.fading = await p.evaluate(() => document.body.dataset.x ?? null);
// 小鎮
await p.evaluate(() => window.__ashen.enter(-1, 'down'));
await p.waitForFunction(() => window.__ashen.level.d.floor === -1 && !window.__ashen.changing);
await p.waitForTimeout(2000);
await p.evaluate(() => { const a = window.__ashen, m = a.npcs.find(o => o.id === 'ge'); a.player.place(m.pos.x + 2.4, m.pos.z + 3); a.snap(); });
await p.waitForTimeout(1200);
await p.mouse.move(960, 60);
await p.screenshot({ path: 'docs/screenshots/phase7-ge.png' });
await p.keyboard.press('Tab'); await p.waitForTimeout(500);
await p.screenshot({ path: 'docs/screenshots/phase7-map.png' });
await p.keyboard.press('Tab');
r.markers = await p.evaluate(() => window.__ashen.map.markers.map(m => m.label));
// 草藥婆
await p.evaluate(() => { const a = window.__ashen, m = a.npcs.find(o => o.id === 'herb'); a.player.hp = 40; a.player.place(m.pos.x + 2, m.pos.z + 2.4); a.snap(); });
await p.waitForTimeout(600);
const h = await p.evaluate(() => { const m = window.__ashen.npcs.find(o => o.id === 'herb'); return [m.pos.x, m.pos.z]; });
const s = await scr(h[0], 1, h[1]);
const hp0 = await p.evaluate(() => window.__ashen.player.hp);
await p.mouse.move(s[0], s[1]); await p.waitForTimeout(150); await p.mouse.click(s[0], s[1]);
await p.waitForFunction(() => window.__ashen.ui.dialogOpen, null, { timeout: 15000 });
r.herb = [hp0, await p.evaluate(() => [window.__ashen.player.hp, window.__ashen.player.maxHp])];
await p.screenshot({ path: 'docs/screenshots/phase7-herb.png' });
console.log(JSON.stringify(r), [...errs]);
await b.close();
