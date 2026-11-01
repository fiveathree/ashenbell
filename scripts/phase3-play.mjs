// Phase 3 驗收：四個技能、六種怪物、精英、旋風斬同時打 10+ 隻。用法：node scripts/phase3-play.mjs [low|medium|high]
import { chromium } from 'playwright';
const q = process.argv[2] || 'high', shots = process.argv[3] !== 'noshots';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
const shot = async n => { if (shots) await p.screenshot({ path: `docs/screenshots/phase3-${n}.png` }); };
const fps = (ms = 2500) => p.evaluate(ms => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : r(n / (ms / 1000)); }; f(); }), ms);

await p.goto(`http://localhost:8171/?q=${q}&seed=777`);
await p.waitForFunction(() => window.__ashen && !window.__ashen.changing, null, { timeout: 90000 });
await p.waitForTimeout(2000);
// 喺最大嘅房開測試：清走原有怪物，主角放中間，血同怒氣補滿
const arena = () => p.evaluate(() => {
  const a = window.__ashen, d = a.level.d, r = d.rooms.filter(o => o.kind !== 'entry').sort((x, y) => y.w * y.h - x.w * x.h)[0];
  a.monsters.forEach(m => m.remove()); a.monsters.length = 0; a.vfx.clear();
  const c = a.level.grid.nearestFree((r.x + r.w / 2) * 2, (r.y + r.h / 2) * 2);
  a.player.respawn(c.x, c.z); a.player.rage = 100; a.snap();
  Object.keys(a.skills.cooldown).forEach(k => a.skills.cooldown[k] = 0);
  return c;
});
const ring = (type, n, r, traits = []) => p.evaluate(([type, n, r, traits]) => {
  const a = window.__ashen, c = a.player.pos;
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2, f = a.level.grid.nearestFree(c.x + Math.cos(t) * r, c.z + Math.sin(t) * r);
    const m = a.spawn(type, f.x, f.z, 4, traits); m.state = 'chase';
  }
}, [type, n, r, traits]);
const screen = (dx, dz) => p.evaluate(([dx, dz]) => { const a = window.__ashen, v = new a.Vector3(a.player.pos.x + dx, 0, a.player.pos.z + dz).project(a.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [dx, dz]);
const report = {};

// 技能 1 重斬（右鍵）
await arena(); await ring('ghoul', 5, 2.2); await p.waitForTimeout(300);
let [x, y] = await screen(1.5, 0); await p.mouse.move(x, y);
await p.mouse.click(x, y, { button: 'right' }); await p.waitForTimeout(340); await shot('skill1-heavy');
report.heavy = await p.evaluate(() => ({ rage: Math.round(window.__ashen.player.rage), hurt: window.__ashen.monsters.filter(m => m.hp < m.maxHp).length }));

// 技能 2 衝鋒
await arena(); await ring('skeleton', 3, 6); await p.waitForTimeout(200);
const before = await p.evaluate(() => window.__ashen.player.pos.toArray());
[x, y] = await screen(5.5, 0); await p.mouse.move(x, y); await p.keyboard.press('2'); await p.waitForTimeout(600); await shot('skill2-charge');
report.charge = await p.evaluate(b => { const a = window.__ashen; return { moved: +a.player.pos.distanceTo(new a.Vector3(...b)).toFixed(1), rage: Math.round(a.player.rage), cd: +a.skills.cooldown.charge.toFixed(1), stunned: a.monsters.filter(m => m.state === 'stun').length }; }, before);

// 技能 4 戰吼
await arena(); await ring('ghoul', 6, 3); await p.waitForTimeout(200);
await p.keyboard.press('4'); await p.waitForTimeout(350); await shot('skill4-roar');
report.roar = await p.evaluate(() => { const a = window.__ashen; return { fear: a.monsters.filter(m => m.state === 'fear').length, buff: +a.player.buffTime.toFixed(1), rage: Math.round(a.player.rage), cd: +a.skills.cooldown.roar.toFixed(1) }; });

// 技能 3 旋風斬：同時打 10+ 隻
await arena(); await ring('ghoul', 16, 2.2);
await p.evaluate(() => { const a = window.__ashen; a.monsters.forEach(m => { m.maxHp = m.hp = 900; }); a.player.hp = a.player.maxHp = 9999; a.player.rage = 100; a.skills.maxWhirlHits = 0; });
await p.waitForTimeout(300);
const base = await fps(1500);
await p.keyboard.down('3'); await p.waitForTimeout(500); await shot('skill3-whirl');
const during = await fps(2500);
await p.keyboard.up('3');
report.whirl = await p.evaluate(() => { const a = window.__ashen; return { maxHits: a.skills.maxWhirlHits, rage: Math.round(a.player.rage), on: a.skills.whirling, monsters: a.monsters.length }; });
report.whirlFps = { before: +base.toFixed(1), during: +during.toFixed(1) };
await p.evaluate(() => { const a = window.__ashen; a.player.maxHp = a.player.hp = 150; });

// 六種怪物
for (const [type, n] of [['ghoul', 3], ['skeleton', 3], ['archer', 3], ['drowned', 2], ['monk', 2], ['brute', 1]]) {
  await arena(); await ring(type, n, type === 'archer' || type === 'monk' ? 4.6 : 3);
  if (type === 'drowned') await p.waitForTimeout(1300);
  if (type === 'brute') await p.waitForFunction(() => window.__ashen.monsters[0].state === 'windup', null, { timeout: 15000 }); else await p.waitForTimeout(900);
  await p.waitForTimeout(type === 'brute' ? 350 : 0);
  await shot('mon-' + type);
  report[type] = await p.evaluate(() => window.__ashen.monsters.map(m => m.state).join(','));
}
// 精英
await arena(); await ring('skeleton', 1, 2.5, ['haste', 'fire']); await p.waitForTimeout(700);
[x, y] = await p.evaluate(() => { const a = window.__ashen, m = a.monsters[0], v = new a.Vector3(m.pos.x, 1, m.pos.z).project(a.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
await p.mouse.move(x, y); await p.waitForTimeout(400); await shot('elite');
report.elite = await p.evaluate(() => { const a = window.__ashen, m = a.monsters[0]; return { name: m.name, hp: m.maxHp, tname: document.getElementById('tname').textContent }; });
// 分裂精英死亡出兩隻屍鬼
await arena(); await ring('ghoul', 1, 2.5, ['split']); await p.waitForTimeout(200);
await p.evaluate(() => { const a = window.__ashen; a.monsters[0].takeHit(99999, false); });
await p.waitForTimeout(300);
report.split = await p.evaluate(() => window.__ashen.monsters.filter(m => !m.dead).map(m => m.name));
// 地城出怪分佈
for (const f of [0, 1, 2]) {
  await p.evaluate(f => window.__ashen.enter(f, 'up'), f);
  await p.waitForFunction(() => !window.__ashen.changing);
  report['floor' + (f + 1)] = await p.evaluate(() => { const c = {}; for (const m of window.__ashen.level.d.spawns) c[m.type] = (c[m.type] || 0) + 1; c.elites = window.__ashen.level.d.spawns.filter(m => m.traits.length).length; return c; });
}
console.log(JSON.stringify(report, null, 1));
console.log('errors', [...new Set(errs)].slice(0, 6));
await b.close();
