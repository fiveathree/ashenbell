// 通關機械人：由「新遊戲」用真滑鼠鍵盤打到結局，唔傳送、唔改血量。
// 只有兩樣用捷徑：穿裝加點（呢部份 Phase 4 已經用真滑鼠驗過）同喺小鎮補藥水（照舖頭價扣金）。
// 用法：node scripts/playthrough.mjs [low|medium|high] [分鐘上限]
import { chromium } from 'playwright';
import { appendFileSync, writeFileSync } from 'node:fs';

const q = process.argv[2] || 'low', limit = Number(process.argv[3] || 55) * 60000, channel = process.argv[4] || 'chrome', LOG = `docs/playthrough-${channel}.log`;
writeFileSync(LOG, '');
const log = s => { const l = `[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`; console.log(l); appendFileSync(LOG, l + '\n'); };
const t0 = Date.now();
const b = await chromium.launch({ channel, headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = new Set();
p.on('console', m => { if (m.type() === 'error' && !/404|ERR_/.test(m.text())) errs.add(m.text().slice(0, 200)); });
p.on('pageerror', e => errs.add(String(e).slice(0, 300)));
const shot = n => p.screenshot({ path: `docs/screenshots/phase7-${channel}-${n}.png` });

await p.goto(`http://localhost:8171/?q=${q}`);
await p.waitForSelector('#tNew', { timeout: 90000 });
await p.click('#tNew');
await p.waitForSelector('#openLine');
for (let i = 0; i < 5; i++) { await p.mouse.click(960, 540); await p.waitForTimeout(150); }

const read = () => p.evaluate(() => {
  const a = window.__ashen;
  if (!a || !a.level || a.changing) return null;
  const P = a.player, h = a.hero, d = a.level.d, c = a.camera;
  const scr = (x, y, z) => { const v = new a.Vector3(x, y, z).project(c); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
  const live = a.monsters.filter(m => !m.dead && !m.hidden).map(m => ({ d: m.pos.distanceTo(P.pos), s: scr(m.pos.x, 1, m.pos.z), x: m.pos.x, z: m.pos.z, n: m.name, id: m.id }))
    .filter(m => a.level.grid.lineClear(P.pos, m) || m.d < 3).sort((x, y) => x.d - y.d);
  const drops = [...document.querySelectorAll('.drop')].filter(e => e.style.display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })
    .filter(o => o.x > 40 && o.x < 1880 && o.y > 40 && o.y < 1040);
  const boss = a.monsters.find(m => m.id === 'abbot' && !m.dead);
  return {
    floor: d.floor, stage: a.story.stage, px: P.pos.x, pz: P.pos.z, hp: P.hp, maxHp: P.maxHp, rage: P.rage, dead: P.dead,
    dialog: a.ui.dialogOpen, opts: [...document.querySelectorAll('#talkOpts button')].map(o => o.textContent), screen: a.ui.blocking,
    level: h.level, gold: h.gold, pots: h.potions.hp, kills: a.kills(), live: live.slice(0, 12), near: live.filter(m => m.d < 3.2).length, drops,
    cd: a.skills.cooldown, whirl: a.skills.whirling, bag: h.bag.length, boss: boss ? { phase: boss.phase, hp: Math.round(boss.hp), max: boss.maxHp } : null,
    relic: a.story.relic, pages: a.story.pages, ways: a.world.waypoints,
    rooms: d.rooms.map(r => ({ x: (r.x + r.w / 2) * 2, z: (r.y + r.h / 2) * 2 })), down: d.down, up: d.up, stone: d.waystone,
    relicAt: d.relic ?? null, pageAt: d.pages ?? null,
  };
});

/** 穿裝、加點、賣舊貨（呢部份唔係驗收重點） */
const manage = town => p.evaluate(town => {
  const a = window.__ashen, h = a.hero;
  const score = i => (i.dmg ? (i.dmg[0] + i.dmg[1]) : 0) * 1.2 + (i.armor ?? 0) + i.affixes.length * 6 + i.level + (i.rarity === 'legend' ? 30 : 0);
  for (const o of [...h.bag]) {
    const it = o.item;
    if (it.slot === 'ring') { const s = !h.equip.ring1 ? 'ring1' : !h.equip.ring2 ? 'ring2' : score(h.equip.ring1) < score(h.equip.ring2) ? 'ring1' : 'ring2'; if (!h.equip[s] || score(h.equip[s]) < score(it)) h.wear(it, s); continue; }
    const cur = h.equip[it.slot];
    if (!cur || score(cur) < score(it)) h.wear(it, it.slot);
  }
  while (h.statPoints > 0) h.spendStat(h.statPoints % 3 === 0 ? 'str' : h.statPoints % 3 === 1 ? 'vit' : 'dex');
  for (const id of ['heavy', 'whirl', 'roar', 'charge']) while (h.skillPoints > 0 && h.spendSkill(id));
  if (town) {
    for (const o of [...h.bag]) { h.gold += Math.round(o.item.value * 0.25); h.removeItem(o.item); }
    while (h.gold >= 25 && h.potions.hp < 10) { h.gold -= 25; h.potions.hp++; }
    while (h.gold >= 40 && h.potions.rage < 4) { h.gold -= 40; h.potions.rage++; }
  } else if (h.bag.length > 14) for (const o of h.bag.slice(0, 6)) h.removeItem(o.item);
  a.player.refresh();
}, town);

const toward = (gx, gz) => p.evaluate(([gx, gz]) => {
  const a = window.__ashen, P = a.player, path = a.level.grid.findPath(P.pos, { x: gx, z: gz });
  let t = path[0];
  if (!t) return null;
  let left = 7, cur = { x: P.pos.x, z: P.pos.z };
  for (const n of path) { const d = Math.hypot(n.x - cur.x, n.z - cur.z); if (d >= left) { t = { x: cur.x + (n.x - cur.x) / d * left, z: cur.z + (n.z - cur.z) / d * left }; break; } left -= d; cur = n; t = n; }
  const v = new a.Vector3(t.x, 0, t.z).project(a.camera);
  return [Math.min(1880, Math.max(40, (v.x + 1) / 2 * innerWidth)), Math.min(1040, Math.max(40, (1 - v.y) / 2 * innerHeight))];
}, [gx, gz]);

const walk = async (gx, gz) => { const s = await toward(gx, gz); if (s) { await p.mouse.move(s[0], s[1]); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); } };
const clickWorld = async (x, y, z) => {
  const s = await p.evaluate(([x, y, z]) => { const a = window.__ashen, v = new a.Vector3(x, y, z).project(a.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, y, z]);
  await p.mouse.move(s[0], s[1]); await p.waitForTimeout(90); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up();
};

const visited = {}, deaths = { n: 0 };
let lastSig = '', sigT = Date.now(), dumps = 0, lastLog = 0, lastDead = false, stuckAt = null, stuckT = 0, lastManage = 0, seenPhase = 0, ended = false, wasFloor = null, scattered = 0;

while (Date.now() - t0 < limit) {
  await p.waitForTimeout(170);
  if (await p.evaluate(() => !!document.getElementById('endGo'))) {
    await shot('ending');
    await p.click('#endGo'); ended = true; log('結局畫面完成'); await p.waitForTimeout(800); break;
  }
  if (await p.evaluate(() => !!document.getElementById('openLine') && !document.getElementById('screen').hidden)) {
    await p.mouse.click(960, 540); continue;
  }
  const s = await read();
  if (!s) continue;
  // 卡住偵測：20 秒冇位移、冇擊殺、冇扣血，就記低現場
  const sig = [Math.round(s.px), Math.round(s.pz), s.kills, Math.round(s.hp), s.stage, s.floor].join();
  if (sig !== lastSig) { lastSig = sig; sigT = Date.now(); }
  else if (Date.now() - sigT > 20000) {
    sigT = Date.now(); dumps++;
    const dbg = await p.evaluate(() => { const a = window.__ashen, P = a.player; return {
      seed: a.world.seed, target: P.attackTarget ? { n: P.attackTarget.name, st: P.attackTarget.state, x: P.attackTarget.pos.x, z: P.attackTarget.pos.z, dead: P.attackTarget.dead } : null,
      path: P.path.length, swing: P.swing, charging: P.charging, spinning: P.spinning, panels: a.panels.open, shop: a.ui.shopOpen, block: a.ui.blocking, focus: document.elementFromPoint(960, 400)?.id || document.elementFromPoint(960, 400)?.className,
      bb: a.level.grid.isBlocked(P.pos.x, P.pos.z), mons: a.monsters.filter(m => !m.dead).slice(0).sort((x, y) => x.pos.distanceTo(P.pos) - y.pos.distanceTo(P.pos)).slice(0, 3).map(m => ({ n: m.name, st: m.state, d: +m.pos.distanceTo(P.pos).toFixed(1), blocked: a.level.grid.isBlocked(m.pos.x, m.pos.z), hide: m.hidden })) }; });
    log('卡住現場 ' + JSON.stringify({ px: s.px, pz: s.pz, floor: s.floor, stage: s.stage, ways: s.ways, live: s.live.slice(0, 2).map(m => [m.n, +m.d.toFixed(1)]), drops: s.drops.slice(0, 3).map(o => o.t), ...dbg }));
    await shot('stuck' + dumps);
    if (dumps >= 3) { log('連續卡住，停低'); break; }
  }
  if (Date.now() - lastLog > 30000) {
    lastLog = Date.now();
    log(`層${s.floor} 任務${s.stage} Lv${s.level} 血${Math.round(s.hp)}/${s.maxHp} 擊殺${s.kills} 死${deaths.n} 金${s.gold} 藥${s.pots}${s.boss ? ` Boss 第${s.boss.phase}階段 ${s.boss.hp}/${s.boss.max}` : ''}`);
  }
  if (s.dead && !lastDead) { deaths.n++; log(`死亡第 ${deaths.n} 次：層${s.floor} Lv${s.level}`); }
  lastDead = s.dead;
  if (s.dead) continue;
  if (s.floor !== wasFloor) { wasFloor = s.floor; visited[s.floor] ??= new Set(); log(`入 ${s.floor < 0 ? '小鎮' : '第 ' + (s.floor + 1) + ' 層'}`); await manage(s.floor < 0); if (s.floor < 0) await p.waitForTimeout(100); }
  if (s.boss && s.boss.phase !== seenPhase) { seenPhase = s.boss.phase; await p.waitForTimeout(500); await shot('boss-phase' + seenPhase); log(`Boss 第 ${seenPhase} 階段`); }
  if (Date.now() - lastManage > 15000) { lastManage = Date.now(); await manage(false); }

  if (s.dialog) {
    if (s.opts.length) {
      const i = s.opts.findIndex(o => o === '收低呢頁');
      if (i >= 0) { await shot('ending-talk'); await p.click(`#talkOpts button:nth-child(${i + 1})`); }
      else await p.click(`#talkOpts button:nth-child(${s.opts.length})`);
    } else await p.mouse.click(1100, 720);
    continue;
  }

  if (s.hp < s.maxHp * 0.5 && s.pots > 0) await p.keyboard.press('q');

  // 打怪
  const m = s.live[0];
  if (m && m.d < 11) {
    stuckAt = null;
    if (s.whirl && (s.near < 2 || s.rage < 8)) { await p.keyboard.up('3'); }
    if (!s.whirl && s.near >= 3 && s.rage > 25) { await p.keyboard.down('3'); await p.mouse.move(m.s[0], m.s[1]); continue; }
    if (s.near >= 3 && s.rage >= 30 && s.cd.roar === 0) await p.keyboard.press('4');
    await p.mouse.move(Math.min(1880, Math.max(40, m.s[0])), Math.min(1040, Math.max(40, m.s[1])));
    if (m.d > 5 && s.rage >= 20 && s.cd.charge === 0) await p.keyboard.press('2');
    else if (m.d < 3 && s.cd.heavy === 0) await p.mouse.click(m.s[0], m.s[1], { button: 'right' });
    else { await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); }
    continue;
  }
  if (s.whirl) await p.keyboard.up('3');

  // 撿嘢
  const loot = s.drops.find(o => !/^院長日記|^失蹤者/.test(o.t));
  if (loot && s.bag < 20) { await p.mouse.click(loot.x, loot.y); await p.waitForTimeout(350); continue; }

  // 卡住就亂行一下
  if (stuckAt && Math.hypot(stuckAt[0] - s.px, stuckAt[1] - s.pz) < 0.4) {
    if (Date.now() - stuckT > 7000) { stuckT = Date.now(); scattered++; if (scattered % 5 === 1) log(`卡住：層${s.floor} (${s.px.toFixed(0)},${s.pz.toFixed(0)})`); await p.mouse.click(600 + Math.random() * 700, 300 + Math.random() * 400); await p.waitForTimeout(900); continue; }
  } else { stuckAt = [s.px, s.pz]; stuckT = Date.now(); }

  // 目標
  if (s.floor < 0) {
    if (s.stage === 0 || s.stage === 2 || s.stage === 4 || s.stage === 6) {
      const ge = await p.evaluate(() => { const n = window.__ashen.npcs.find(o => o.id === 'ge'); return [n.pos.x, n.pos.z]; });
      if (Math.hypot(ge[0] - s.px, ge[1] - s.pz) < 9) await clickWorld(ge[0], 1, ge[1]); else await walk(ge[0], ge[1]);
      await p.waitForTimeout(500);
      continue;
    }
    if (s.ways.length > 1) {
      if (Math.hypot(s.stone.x - s.px, s.stone.z - s.pz) < 8) {
        await clickWorld(s.stone.x, 1, s.stone.z); await p.waitForTimeout(900);
        const st = await read();
        if (st?.dialog) { const want = st.opts.length - 2; await p.click(`#talkOpts button:nth-child(${Math.max(1, want)})`); await p.waitForTimeout(1200); }
      } else await walk(s.stone.x, s.stone.z);
      continue;
    }
    if (Math.hypot(s.down.x - s.px, s.down.z - s.pz) < 7) await clickWorld(s.down.x, 0, s.down.z + 0.6); else await walk(s.down.x, s.down.z + 2);
    await p.waitForTimeout(300);
    continue;
  }

  // 第一次見到傳送石就掂一下
  if (s.floor < 3 && !s.ways.includes(s.floor) && s.floor >= 0) {
    if (Math.hypot(s.stone.x - s.px, s.stone.z - s.pz) < 7) { await clickWorld(s.stone.x, 1, s.stone.z); await p.waitForTimeout(800); } else await walk(s.stone.x, s.stone.z + 1.5);
    continue;
  }
  // 劇情物
  const story = s.drops.find(o => /^院長日記|^失蹤者/.test(o.t));
  if (story) { await p.mouse.click(story.x, story.y); await p.waitForTimeout(500); continue; }
  const stoneHome = (s.stage === 2 || s.stage === 4 || s.stage === 6);
  if (stoneHome) {
    if (Math.hypot(s.stone.x - s.px, s.stone.z - s.pz) < 7) {
      await clickWorld(s.stone.x, 1, s.stone.z); await p.waitForTimeout(900);
      const st = await read();
      if (st?.dialog && st.opts.length) await p.click('#talkOpts button:first-child');
      await p.waitForTimeout(1200);
    } else await walk(s.stone.x, s.stone.z + 1.5);
    continue;
  }
  if (s.floor === 0 && !s.relic && s.relicAt) {
    if (Math.hypot(s.relicAt.x - s.px, s.relicAt.z - s.pz) > 5) await walk(s.relicAt.x, s.relicAt.z); else await walk(s.relicAt.x + 0.6, s.relicAt.z + 0.6);
    continue;
  }
  if (s.floor === 1 && s.pageAt) {
    const i = s.pages.findIndex(x => !x);
    if (i >= 0) { await walk(s.pageAt[i].x, s.pageAt[i].z); continue; }
  }
  // 行晒每間房練級，再去落樓
  const v = visited[s.floor];
  s.rooms.forEach((r, i) => { if (Math.hypot(r.x - s.px, r.z - s.pz) < 5) v.add(i); });
  const todo = s.rooms.map((r, i) => ({ ...r, i })).filter(r => !v.has(r.i)).sort((a, b) => Math.hypot(a.x - s.px, a.z - s.pz) - Math.hypot(b.x - s.px, b.z - s.pz));
  if (s.floor === 3) { await walk(29, 30); continue; }
  if (todo.length) { await walk(todo[0].x, todo[0].z); if (stuckAt && Date.now() - stuckT > 12000) v.add(todo[0].i); continue; }
  if (Math.hypot(s.down.x - s.px, s.down.z - s.pz) < 7) await clickWorld(s.down.x, 0, s.down.z + 0.6); else await walk(s.down.x, s.down.z + 2);
  await p.waitForTimeout(250);
}
const end = await read();
log(`完結：通關=${ended} 任務${end?.stage} Lv${end?.level} 擊殺${end?.kills} 死亡${deaths.n} 用時${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
log(`錯誤 ${JSON.stringify([...errs].slice(0, 6))}`);
await b.close();
