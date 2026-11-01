// 驗收：真滑鼠撳寶箱開到、重入層仍然開住、R 同跑掣一直跑。用法：node scripts/chest-check.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = new Set(), r = {};
p.on('pageerror', e => errs.add(String(e).slice(0, 200)));
await p.goto('http://localhost:8171/?q=high&seed=9');
await p.waitForFunction(() => window.__ashen && !window.__ashen.changing && window.__ashen.level, null, { timeout: 90000 });
await p.waitForTimeout(1500);
const scr = (x, y, z) => p.evaluate(([x, y, z]) => { const a = window.__ashen, v = new a.Vector3(x, y, z).project(a.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, y, z]);
r.chests = await p.evaluate(() => window.__ashen.level.chests.length);
// 清走怪物，企喺寶箱旁邊少少，用真滑鼠撳
await p.evaluate(() => { const a = window.__ashen, c = a.level.chests[0]; a.monsters.forEach(m => m.remove()); a.monsters.length = 0; a.player.place(c.x, c.z + 4.5); a.snap(); });
await p.waitForTimeout(1200);
const c = await p.evaluate(() => { const k = window.__ashen.level.chests[0]; return [k.x, k.z]; });
const s = await scr(c[0], 0.5, c[1]);
await p.mouse.move(s[0], s[1]); await p.waitForTimeout(300);
await p.screenshot({ path: 'docs/screenshots/chest-closed.png' });
r.drops0 = await p.evaluate(() => window.__ashen.field?.drops.length ?? -1);
await p.mouse.click(s[0], s[1]);
await p.waitForFunction(() => window.__ashen.level.chests[0].opened, null, { timeout: 8000 }).catch(() => { r.fail = 'never opened'; });
await p.waitForTimeout(900);
await p.mouse.move(960, 60);
await p.screenshot({ path: 'docs/screenshots/chest-open.png' });
r.drops1 = await p.evaluate(() => window.__ashen.field?.drops.length ?? -1);
// 重入層：仍然開住，唔可以再開
await p.evaluate(() => window.__ashen.enter(1, 'up')); await p.waitForFunction(() => window.__ashen.level.d.floor === 1 && !window.__ashen.changing);
await p.evaluate(() => window.__ashen.enter(0, 'up')); await p.waitForFunction(() => window.__ashen.level.d.floor === 0 && !window.__ashen.changing);
r.stillOpen = await p.evaluate(() => window.__ashen.level.chests[0].opened);
// 一直跑：短距離平時係行
const speed = async () => {
  await p.evaluate(() => { const a = window.__ashen, c = a.level.chests[1] ?? a.level.chests[0]; a.monsters.forEach(m => m.remove()); a.monsters.length = 0; a.player.place(c.x, c.z + 2); a.snap(); a.player.moveTo({ x: c.x + 1.5, z: c.z + 2 }); });
  await p.waitForTimeout(200);
  return p.evaluate(() => window.__ashen.player.current);
};
r.short = await speed();
await p.keyboard.press('r');
r.alwaysR = [await p.evaluate(() => window.__ashen.player.alwaysRun), await speed()];
await p.keyboard.press('r');
r.off = await p.evaluate(() => window.__ashen.player.alwaysRun);
const btn = await p.locator('#runBtn').boundingBox();
await p.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
await p.waitForTimeout(200);
r.btn = await p.evaluate(() => [window.__ashen.player.alwaysRun, document.getElementById('runBtn').classList.contains('on'), localStorage.getItem('ashenbell-settings-v1')]);
await p.screenshot({ path: 'docs/screenshots/run-button.png' });
console.log(JSON.stringify(r), [...errs]);
await b.close();
