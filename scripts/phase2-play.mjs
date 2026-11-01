// Phase 2 驗收：三層截圖、同 seed 相同地圖、真滑鼠上落樓梯、打破道具、小地圖。用法：node scripts/phase2-play.mjs [low|medium|high]
import { chromium } from 'playwright';
const q = process.argv[2] || 'high', seed = 12345;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
const ready = () => p.waitForFunction(() => window.__ashen && !window.__ashen.changing, null, { timeout: 90000 });
const tileHash = () => p.evaluate(() => { const t = window.__ashen.level.d.tiles.join(''); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; });
const fps = () => p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(n / 3); }; f(); }));
const toFloor = async i => { await p.evaluate(i => window.__ashen.enter(i, 'up'), i); await ready(); };
const go = async (x, z) => { await p.evaluate(([x, z]) => { const a = window.__ashen; a.player.place(x, z); a.snap(); }, [x, z]); await p.waitForTimeout(1500); };

await p.goto(`http://localhost:8171/?q=${q}&seed=${seed}`);
await ready();
await p.waitForTimeout(2500);
const hashes = [];
for (const i of [0, 1, 2]) {
  await toFloor(i);
  hashes.push(await tileHash());
  const c = await p.evaluate(() => { const d = window.__ashen.level.d, r = d.rooms.filter(o => o.kind === (d.floor === 2 && d.altars.length ? 'altar' : d.floor === 1 ? 'normal' : 'altar'))[0] || d.rooms[0]; return { x: (r.x + r.w / 2) * 2, z: (r.y + r.h / 2) * 2, kinds: d.rooms.map(o => o.kind).join(','), rooms: d.rooms.length, ghouls: d.ghouls.length, torches: d.torches.length, water: d.tiles.filter(t => t === 2).length, altars: d.altars.length }; });
  console.log('floor', i, JSON.stringify(c));
  if (i === 1) { const w = await p.evaluate(() => { const d = window.__ashen.level.d; const k = d.tiles.indexOf(2); return { x: (k % d.cols + 2) * 2, z: (Math.floor(k / d.cols) + 1) * 2 }; }); if (w.x) { c.x = w.x; c.z = w.z; } }
  await go(c.x, c.z);
  await p.screenshot({ path: `docs/screenshots/phase2-floor${i + 1}.png` });
  const s = await p.evaluate(() => window.__ashen.stats);
  console.log(' stats', JSON.stringify(s), 'fps', (await fps()).toFixed(1));
}
// 重開同一 seed，確認地圖一樣
await p.goto(`http://localhost:8171/?q=low&seed=${seed}`);
await ready();
const same = [];
for (const i of [0, 1, 2]) { await toFloor(i); same.push(await tileHash()); }
console.log('same seed', JSON.stringify(hashes) === JSON.stringify(same));

// 打破道具（真滑鼠）
await toFloor(0);
const brk = await p.evaluate(() => { const a = window.__ashen, b = a.level.breakables[0]; a.player.place(b.pos.x + 1.6, b.pos.z + 1.6); a.ghouls.forEach(g => { g.reset(); g.state = 'dead'; g.counted = true; }); a.snap(); return a.level.breakables.length; });
await p.waitForTimeout(800);
const pt = await p.evaluate(() => { const a = window.__ashen, b = a.level.breakables[0], v = new a.Vector3(b.pos.x, 0.5, b.pos.z).project(a.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
await p.mouse.click(pt.x, pt.y);
await p.waitForTimeout(2500);
console.log('break', brk, '->', await p.evaluate(() => window.__ashen.level.breakables.length));

// 真滑鼠落樓梯
await p.evaluate(() => { const a = window.__ashen, d = a.level.d; a.player.place(d.down.x, d.down.z + 4); a.snap(); });
await p.waitForTimeout(800);
const st = await p.evaluate(() => { const a = window.__ashen, d = a.level.d, v = new a.Vector3(d.down.x, 0, d.down.z + 0.6).project(a.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
await p.mouse.click(st.x, st.y);
await p.waitForFunction(() => window.__ashen.level.d.floor === 1 && !window.__ashen.changing, null, { timeout: 30000 });
console.log('stairs down ok, floor', await p.evaluate(() => window.__ashen.level.d.floor));

// Tab 大地圖
await p.evaluate(() => { const a = window.__ashen, d = a.level.d; for (const r of d.rooms.slice(0, 7)) { a.player.place((r.x + 1) * 2, (r.y + 1) * 2); a.map.reveal(a.player.pos.x, a.player.pos.z); } a.player.place(d.up.x, d.up.z + 2); a.snap(); });
await p.keyboard.press('Tab');
await p.waitForTimeout(800);
await p.screenshot({ path: 'docs/screenshots/phase2-map.png' });
console.log('scroll', await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]));
console.log('errors', [...new Set(errs)].slice(0, 6));
await b.close();
