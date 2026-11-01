// Phase 4 驗收：真滑鼠撿物品、背包拖放、右鍵裝備、說明框比較、升級加點、傳奇效果。用法：node scripts/phase4-play.mjs [low|medium|high]
import { chromium } from 'playwright';
const q = process.argv[2] || 'high';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
const shot = n => p.screenshot({ path: `docs/screenshots/phase4-${n}.png` });
const fps = (ms = 3000) => p.evaluate(ms => new Promise(r => { const g = window.__ashen.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); const gpu = g.getParameter(e.UNMASKED_RENDERER_WEBGL).slice(0, 44); let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : r({ gpu, fps: +(n / (ms / 1000)).toFixed(1) }); }; f(); }), ms);
await p.goto(`http://localhost:8171/?q=${q}&seed=777`);
await p.waitForFunction(() => window.__ashen && !window.__ashen.changing, null, { timeout: 90000 });
await p.waitForTimeout(2500);
const report = {};
report.fps = await fps();
const clean = () => p.evaluate(() => { const a = window.__ashen; a.monsters.forEach(m => m.state !== 'dead' && m.remove()); a.monsters.length = 0; a.snap(); });
await clean();
// 地上物品：撳標籤行過去撿
await p.evaluate(() => { const a = window.__ashen, c = a.player.pos; a.field.add(c.x + 1.6, c.z - 1.8, a.makeItem(Math.random, 8, 'rare'), 0, null); a.field.add(c.x - 1.8, c.z + 1.6, a.makeItem(Math.random, 8, 'magic'), 0, null); a.field.add(c.x + 2, c.z + 1.4, a.makeItem(Math.random, 12, 'legend', 'oath'), 0, null); a.field.add(c.x - 1.4, c.z - 2, null, 37, null); });
await p.waitForTimeout(900);
await shot('loot');
const lbl = await p.evaluate(() => { const e = [...document.querySelectorAll('.drop')].find(d => d.textContent.includes('灰燼之誓')).getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2]; });
await p.mouse.click(lbl[0], lbl[1]);
await p.waitForFunction(() => window.__ashen.hero.bag.length > 0, null, { timeout: 15000 });
report.picked = await p.evaluate(() => window.__ashen.hero.bag.map(o => o.item.name));
// 背包、裝備比較
await p.evaluate(() => { const a = window.__ashen, h = a.hero; h.bag = []; a.item('rare', 8); a.item('magic', 6); a.item('rare', 10); a.item('white', 4); a.item('magic', 9); a.legend('bell'); a.legend('oath'); a.legend('drowned'); a.legend('lamp'); a.legend('ring'); h.gold = 412; });
await p.keyboard.press('i'); await p.keyboard.press('c');
await p.waitForTimeout(500);
const rect = sel => p.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
// 右鍵裝備雙手劍（傳奇）
const oath = await rect('img[alt="灰燼之誓"]');
await p.mouse.click(oath[0], oath[1], { button: 'right' });
await p.waitForTimeout(200);
report.oathWorn = await p.evaluate(() => window.__ashen.hero.equip.weapon?.name);
// 拖放：鐘放入護身符格
const bell = await rect('img[alt="院長的斷鐘"]'), slot = await rect('.eq-amulet');
await p.mouse.move(bell[0], bell[1]); await p.mouse.down(); await p.mouse.move(slot[0], slot[1], { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(200);
report.bellWorn = await p.evaluate(() => window.__ashen.hero.equip.amulet?.name);
// 背包內拖動
const before = await p.evaluate(() => { const o = window.__ashen.hero.bag[0]; return [o.item.uid, o.x, o.y]; });
const bag = await p.evaluate(() => { const r = document.getElementById('bag').getBoundingClientRect(); return [r.left, r.top, r.width / 10]; });
const it = await p.evaluate(u => { const r = document.querySelector(`img[data-uid="${u}"]`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, before[0]);
const size = await p.evaluate(() => { const i = window.__ashen.hero.bag[0].item; return [i.w, i.h]; });
await p.mouse.move(it[0], it[1]); await p.mouse.down(); await p.mouse.move(bag[0] + bag[2] * (9 - size[0] / 2 + 1), bag[1] + bag[2] * (6 - size[1] / 2), { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(150);
report.bagMove = { before, after: await p.evaluate(u => { const o = window.__ashen.hero.bag.find(x => x.item.uid === u); return [o.x, o.y]; }, before[0]) };
// 說明框比較（有裝備嘅部位）
await p.evaluate(() => { const a = window.__ashen, h = a.hero, w = a.makeItem(Math.random, 10, 'rare'); w.slot = 'weapon'; w.dmg = [20, 34]; w.w = 1; w.h = 3; w.name = '灰燼長劍'; w.icon = 'sword'; w.base = 'sword'; h.addItem(w); a.panels.render(); });
const w = await rect('img[alt="灰燼長劍"]');
await p.mouse.move(w[0], w[1]); await p.mouse.move(w[0] + 2, w[1] + 2); await p.waitForTimeout(300);
report.tip = await p.evaluate(() => ({ a: !document.getElementById('tip').hidden, b: !document.getElementById('tip2').hidden, up: document.querySelectorAll('#tip .up').length, down: document.querySelectorAll('#tip .down').length }));
await p.evaluate(() => { const a = window.__ashen; a.hero.gain(9000); a.player.refresh(); a.panels.render(); });
await p.waitForTimeout(300);
await shot('panels');
// 升級加點
const lv = await p.evaluate(() => { const h = window.__ashen.hero; return { level: h.level, pts: h.statPoints, sk: h.skillPoints }; });
const plus = await rect('button[data-stat="str"]');
await p.mouse.click(plus[0], plus[1]);
const skp = await rect('button[data-skill="heavy"]');
await p.mouse.click(skp[0], skp[1]);
report.level = { ...lv, after: await p.evaluate(() => { const h = window.__ashen.hero; return { str: h.str, pts: h.statPoints, heavy: h.skills.heavy, sk: h.skillPoints }; }) };
await p.keyboard.press('Escape');
report.closed = await p.evaluate(() => !window.__ashen.panels.open);
report.scroll = await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]);
// 傳奇效果
const fx = async (fn) => p.evaluate(fn);
report.legends = await p.evaluate(async () => {
  const a = window.__ashen, h = a.hero, P = a.player, out = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mon = (n, x = 1.2) => { for (let i = 0; i < n; i++) { const f = a.level.grid.nearestFree(P.pos.x + x, P.pos.z + i * 0.4); const m = a.spawn('ghoul', f.x, f.z, 4); m.maxHp = m.hp = 5000; m.state = 'stun'; m.stun(60); } };
  const wearIt = id => { const it = a.legend(id); h.wear(it); P.refresh(); };
  out.lamp = (wearIt('lamp'), P.light.distance);
  wearIt('drowned'); P.rage = 100; a.skills.cooldown.charge = 0;
  a.skills.press('charge', { x: P.pos.x + 2, z: P.pos.z }); await wait(1200); out.drownedInvuln = +P.invuln.toFixed(2) > 0;
  wearIt('ring'); P.invuln = 0; P.hp = 30; mon(1); await wait(300); out.ringBuff = P.buffTime > 0;
  P.hp = P.maxHp; P.rage = 100; const m0 = a.monsters[0]; const hp0 = m0.hp;
  a.skills.cooldown.heavy = 0; a.skills.press('heavy', { x: m0.pos.x, z: m0.pos.z }); await wait(2400); out.oathTicks = hp0 - m0.hp;
  P.rage = 100; const hp1 = m0.hp; a.skills.press('whirl', { x: 0, z: 0 }); await wait(2600); a.skills.release('whirl'); out.bellDamage = hp1 - m0.hp;
  return out;
});
await p.waitForTimeout(400);
// 打怪升級同掉寶
report.kill = await p.evaluate(async () => {
  const a = window.__ashen, h = a.hero, before = { xp: h.xp, lv: h.level };
  const m = a.spawn('skeleton', a.player.pos.x + 1, a.player.pos.z, 4); const n = a.field.drops.length;
  for (let i = 0; i < 30; i++) a.reward(m);
  return { before, xp: h.xp, lv: h.level, dropped: a.field.drops.length - n };
});
await p.evaluate(() => { const a = window.__ashen; a.snap(); }); await p.waitForTimeout(600);
await shot('drops');
console.log(JSON.stringify(report, null, 1));
console.log('errors', [...new Set(errs)].slice(0, 6));
await b.close();
