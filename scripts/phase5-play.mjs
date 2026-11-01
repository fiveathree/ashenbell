// Phase 5 驗收：由新遊戲真滑鼠行到任務二完成，再驗存檔、商店、死亡、傳送。
import { chromium } from 'playwright';
const q = process.argv[2] || 'medium';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error' && !/404|ERR_/.test(m.text())) errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
const shot = n => p.screenshot({ path: `docs/screenshots/phase5-${n}.png` });
const ready = () => p.waitForFunction(() => window.__ashen && !window.__ashen.changing && window.__ashen.level, null, { timeout: 90000 });
const report = {};
const toScreen = (x, y, z) => p.evaluate(([x, y, z]) => { const a = window.__ashen, v = new a.Vector3(x, y, z).project(a.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, y, z]);
const stage = () => p.evaluate(() => window.__ashen.story.stage);
const clearMonsters = () => p.evaluate(() => { const a = window.__ashen; a.monsters.forEach(m => m.remove()); a.monsters.length = 0; });
const near = (x, z) => p.evaluate(([x, z]) => { const a = window.__ashen; a.player.place(x, z); a.snap(); }, [x, z]);
const talkTo = async id => {
  const n = await p.evaluate(id => { const a = window.__ashen, m = a.npcs.find(o => o.id === id); a.player.place(m.pos.x + 2.5, m.pos.z + 2.5); a.snap(); return [m.pos.x, m.pos.z]; }, id);
  await p.waitForTimeout(500);
  const [x, y] = await toScreen(n[0], 1, n[1]);
  await p.mouse.move(x, y); await p.waitForTimeout(150); await p.mouse.click(x, y);
  await p.waitForFunction(() => window.__ashen.ui.dialogOpen, null, { timeout: 15000 });
};
const clickTalk = () => p.mouse.click(1100, 720);
const closeTalk = async () => { for (let i = 0; i < 6 && await p.evaluate(() => window.__ashen.ui.dialogOpen); i++) { await clickTalk(); await p.waitForTimeout(120); } };

await p.goto(`http://localhost:8171/?q=${q}`);
await p.waitForSelector('#tNew', { timeout: 90000 });
await p.waitForTimeout(800);
await shot('title');
await p.click('#tNew');
await p.waitForSelector('#openLine');
await p.waitForTimeout(1300);
await shot('opening');
const lines = [];
for (let i = 0; i < 5; i++) { lines.push(await p.textContent('#openLine')); await p.mouse.click(960, 540); await p.waitForTimeout(100); }
report.opening = lines.length;
await ready();
await p.waitForTimeout(1500);
await p.mouse.move(960, 200);
await shot('town');
report.town = await p.evaluate(() => ({ floor: window.__ashen.level.d.floor, npcs: window.__ashen.npcs.map(n => n.name), quest: document.getElementById('quest').textContent }));

// 任務一
await talkTo('ge');
await p.waitForTimeout(400);
await shot('dialog');
report.geFirst = await p.textContent('#talkText');
await closeTalk();
report.q1 = await stage();
// 由大門落地窖：真滑鼠
const gate = await p.evaluate(() => { const a = window.__ashen, d = a.level.d; a.player.place(d.down.x, d.down.z + 5); a.snap(); return [d.down.x, d.down.z + 0.6]; });
await p.waitForTimeout(500);
let [x, y] = await toScreen(gate[0], 0, gate[1]);
await p.mouse.click(x, y);
await p.waitForFunction(() => window.__ashen.level?.d.floor === 0 && !window.__ashen.changing, null, { timeout: 30000 });
await clearMonsters();
report.relicExists = await p.evaluate(() => !!window.__ashen.level.d.relic);
const rel = await p.evaluate(() => { const a = window.__ashen, r = a.level.d.relic; a.player.place(r.x + 1.6, r.z + 1.2); a.snap(); return [r.x, r.z]; });
await p.waitForTimeout(700);
const lab = await p.evaluate(() => { const e = [...document.querySelectorAll('.drop')].find(d => d.textContent === '失蹤者遺物').getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2]; });
await p.mouse.click(lab[0], lab[1]);
await p.waitForFunction(() => window.__ashen.ui.dialogOpen, null, { timeout: 15000 });
await p.waitForTimeout(300);
await shot('relic');
report.relicText = await p.textContent('#talkText');
await closeTalk();
report.q2Pending = await stage();
// 傳送石：解鎖第 1 層，傳返小鎮
await clearMonsters();
const st = await p.evaluate(() => { const a = window.__ashen, w = a.level.d.waystone; a.player.place(w.x + 1.4, w.z + 1.4); a.snap(); return [w.x, w.z]; });
await p.waitForTimeout(600);
[x, y] = await toScreen(st[0], 1, st[1]);
await p.mouse.move(x, y); await p.waitForTimeout(120); await p.mouse.click(x, y);
await p.waitForFunction(() => window.__ashen.ui.dialogOpen, null, { timeout: 15000 });
await p.waitForTimeout(200);
report.stoneOptions = await p.evaluate(() => [...document.querySelectorAll('#talkOpts button')].map(b => b.textContent));
await p.click('#talkOpts button:first-child');
await p.waitForFunction(() => window.__ashen.level?.d.floor === -1 && !window.__ashen.changing, null, { timeout: 30000 });
report.waypoints = await p.evaluate(() => window.__ashen.world.waypoints);
await talkTo('ge'); report.geAfterRelic = await p.textContent('#talkText'); await closeTalk();
report.q3 = await stage();

// 任務二：第 2 層執 3 頁日記
await p.evaluate(() => window.__ashen.enter(1, 'up')); await ready();
await clearMonsters();
for (let i = 0; i < 3; i++) {
  const pg = await p.evaluate(i => { const a = window.__ashen, g = a.level.d.pages[i], f = a.level.grid.nearestFree(g.x + 1.5, g.z + 1); a.player.place(f.x, f.z); a.snap(); return [g.x, g.z]; }, i);
  await p.waitForTimeout(600);
  const l = await p.evaluate(i => { const e = [...document.querySelectorAll('.drop')].find(d => d.textContent === `院長日記 第 ${i + 1} 頁`).getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2]; }, i);
  await p.mouse.click(l[0], l[1]);
  await p.waitForFunction(() => window.__ashen.ui.dialogOpen, null, { timeout: 15000 });
  await p.waitForTimeout(150); await clickTalk(); await p.waitForTimeout(150);
  report['page' + i] = await p.textContent('#talkText');
  await closeTalk();
}
report.q4 = await stage();
await p.evaluate(() => window.__ashen.enter(-1, 'down')); await ready();
await talkTo('ge'); await clickTalk(); await p.waitForTimeout(150); await clickTalk(); await p.waitForTimeout(150);
report.geJournal = await p.textContent('#talkText'); await closeTalk();
report.q5 = await stage();
report.questText = await p.textContent('#quest');

// 商店
await p.evaluate(() => { const a = window.__ashen; a.hero.gold = 2000; a.item('rare', 8); a.item('magic', 6); a.save(); });
await talkTo('herb'); await p.click('#talkOpts button:first-child'); await p.waitForTimeout(300);
const pot0 = await p.evaluate(() => window.__ashen.hero.potions.hp);
await p.click('[data-pot="hp"]'); await p.waitForTimeout(100);
report.herb = { pots: [pot0, await p.evaluate(() => window.__ashen.hero.potions.hp)], gold: await p.evaluate(() => window.__ashen.hero.gold) };
await p.click('#shopClose'); await p.keyboard.press('i');
await talkTo('dala'); await p.waitForTimeout(250); await shot('dala'); await p.click('#talkOpts button:first-child'); await p.waitForTimeout(400);
await shot('shop');
const g0 = await p.evaluate(() => window.__ashen.hero.gold);
await p.click('[data-buy="0"]'); await p.waitForTimeout(100);
const g1 = await p.evaluate(() => window.__ashen.hero.gold);
const before = await p.evaluate(() => JSON.stringify(window.__ashen.hero.bag.find(o => o.item.rarity === 'rare').item.affixes));
await p.click('[data-pick]'); await p.waitForTimeout(100);
await p.click('[data-re="0"]'); await p.waitForTimeout(100);
const after = await p.evaluate(() => JSON.stringify(window.__ashen.hero.bag.find(o => o.item.rarity === 'rare' || o.item.rarity === 'magic').item.affixes));
report.smith = { paid: g0 - g1, reforged: before !== after };
await p.click('[data-back]'); await p.waitForTimeout(100);
const sellEl = await p.evaluate(() => { const o = window.__ashen.hero.bag.at(-1), r = document.querySelector(`img[data-uid="${o.item.uid}"]`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, o.item.value]; });
const g2 = await p.evaluate(() => window.__ashen.hero.gold);
await p.mouse.click(sellEl[0], sellEl[1], { button: 'right' }); await p.waitForTimeout(150);
report.sell = { got: await p.evaluate(() => window.__ashen.hero.gold) - g2, value: sellEl[2] };
await p.click('#shopClose'); await p.keyboard.press('i'); await p.waitForTimeout(100);

// 匯出存檔
await p.keyboard.press('Escape');
await p.waitForSelector('#mExport');
await shot('menu');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#mExport')]);
const path = 'C:/Users/ngant/AppData/Local/Temp/claude/C--Users-ngant-OneDrive----my-first-website/6d47fa1f-724e-4bee-9c9c-3893d2c74252/scratchpad/save.json';
await dl.saveAs(path);
report.exported = dl.suggestedFilename();
await p.click('#mBack');

// 死亡：扣 10% 金幣，返小鎮，地城進度保留
await p.evaluate(() => window.__ashen.enter(0, 'up')); await ready();
const killed = await p.evaluate(() => { const a = window.__ashen, m = a.monsters[0]; m.takeHit(999999, false); return a.world.cleared[0].length; });
const gBefore = await p.evaluate(() => { const a = window.__ashen; a.hero.gold = 1000; a.monsters.forEach(m => m.reset()); a.player.invuln = 0; a.player.hp = 1; a.player.s.dex = 0; a.player.hurt(50); return a.player.dead; });
await p.waitForFunction(() => window.__ashen.level?.d.floor === -1 && !window.__ashen.player.dead && !window.__ashen.changing, null, { timeout: 30000 });
report.death = { died: gBefore, gold: await p.evaluate(() => window.__ashen.hero.gold), cleared: killed };

// 重開網頁，撳繼續
const beforeReload = await p.evaluate(() => { const a = window.__ashen, h = a.hero; return { lv: h.level, gold: h.gold, stage: a.story.stage, bag: h.bag.length, way: a.world.waypoints.length, seed: a.world.seed }; });
await p.reload();
await p.waitForSelector('#tContinue:not([disabled])', { timeout: 60000 });
await p.click('#tContinue');
await ready();
report.continue = { same: JSON.stringify(beforeReload) === JSON.stringify(await p.evaluate(() => { const a = window.__ashen, h = a.hero; return { lv: h.level, gold: h.gold, stage: a.story.stage, bag: h.bag.length, way: a.world.waypoints.length, seed: a.world.seed }; })), beforeReload };
await p.evaluate(() => window.__ashen.enter(0, 'up')); await ready();
report.clearedKept = await p.evaluate(() => { const a = window.__ashen; return { cleared: a.world.cleared[0].length, spawns: a.level.d.spawns.length, alive: a.monsters.length }; });
report.scroll = await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]);
console.log(JSON.stringify(report, null, 1));
console.log('errors', [...new Set(errs)].slice(0, 6));
await b.close();
