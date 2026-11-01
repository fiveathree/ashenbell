// Phase 7 驗收：設定選單、音量、三種解像度、效能。用法：node scripts/phase7-check.mjs
import { chromium } from 'playwright';
const launch = () => chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const fps = (p, ms = 3000) => p.evaluate(ms => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : r(+(n / (ms / 1000)).toFixed(1)); }; f(); }), ms);
const report = {}, errs = new Set();
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.add(m.text().slice(0, 160)); });
p.on('pageerror', e => errs.add(String(e).slice(0, 200)));
await p.goto('http://localhost:8171/');
await p.waitForSelector('#tSettings', { timeout: 90000 });
report.autoQuality = await p.evaluate(() => window.__ashen.qName);
await p.click('#tSettings');
await p.waitForSelector('#setVol');
await p.screenshot({ path: 'docs/screenshots/phase7-settings.png' });
await p.fill('#setVol', '25');
await p.check('#setZoom');
await p.uncheck('#setHold');
await p.click('[data-q="low"]');
report.applyEnabled = await p.evaluate(() => !document.getElementById('setApply').disabled);
report.saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ashenbell-settings-v1')));
report.volume = await p.evaluate(() => window.__ashen.sound.volume);
await p.click('#setApply');
await p.waitForSelector('#tNew', { timeout: 60000 });
report.afterReload = await p.evaluate(() => window.__ashen.qName);
await p.click('#tSettings'); await p.waitForSelector('#setVol');
report.persist = await p.inputValue('#setVol');
await p.click('[data-q="auto"]'); await p.check('#setHold'); await p.uncheck('#setZoom'); await p.fill('#setVol', '70');
await p.click('#setBack');
await p.click('#tNew'); await p.waitForSelector('#openLine');
for (let i = 0; i < 5; i++) { await p.mouse.click(960, 540); await p.waitForTimeout(120); }
await p.waitForFunction(() => document.getElementById('floorName')?.textContent === '荒鐘鎮', null, { timeout: 40000 });
await p.waitForTimeout(800);
report.audio = await p.evaluate(() => window.__ashen.sound.state);
for (const n of ['swing', 'hit', 'bone', 'hurt', 'death', 'arrow', 'spell', 'whirl', 'charge', 'roar', 'coin', 'item', 'legend', 'levelup', 'potion', 'break', 'rune', 'bell', 'heavy']) await p.evaluate(n => window.__ashen.sound.play(n), n);
await p.keyboard.press('Escape'); await p.waitForSelector('#mSettings');
await p.click('#mSettings'); await p.waitForSelector('#setBack'); await p.click('#setBack');
await p.waitForSelector('#mBack'); await p.click('#mBack');
await ctx.close();
// 解像度：面板唔可以爆出畫面，頁面唔可以捲動
for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } }), q = await c.newPage();
  q.on('pageerror', e => errs.add(String(e).slice(0, 200)));
  await q.goto('http://localhost:8171/?q=low&seed=5');
  await q.waitForFunction(() => window.__ashen && !window.__ashen.changing && window.__ashen.level, null, { timeout: 90000 });
  await q.evaluate(() => { const a = window.__ashen; a.hero.gold = 99; for (let i = 0; i < 8; i++) a.item('rare'); });
  await q.keyboard.press('i'); await q.keyboard.press('c'); await q.waitForTimeout(500);
  await q.screenshot({ path: `docs/screenshots/phase7-${w}x${h}.png` });
  report[`${w}x${h}`] = await q.evaluate(() => {
    const out = [];
    for (const id of ['invPanel', 'charPanel', 'bag', 'paper']) { const r = document.getElementById(id).getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) out.push(id); }
    const bag = document.getElementById('bag').getBoundingClientRect(), panel = document.getElementById('invPanel').getBoundingClientRect();
    if (bag.bottom > panel.bottom) out.push('bag 爆出面板');
    return { overflow: out, scroll: [document.documentElement.scrollHeight > innerHeight, document.documentElement.scrollWidth > innerWidth] };
  });
  await c.close();
}
// 效能：RTX 3050，1920×1080，地城入面有怪
for (const q of ['low', 'medium', 'high']) {
  const c = await b.newContext({ viewport: { width: 1920, height: 1080 } }), g = await c.newPage();
  await g.goto(`http://localhost:8171/?q=${q}&seed=12345`);
  await g.waitForFunction(() => window.__ashen && !window.__ashen.changing && window.__ashen.level, null, { timeout: 90000 });
  await g.waitForTimeout(3000);
  report['fps-' + q] = await fps(g);
  report['calls-' + q] = await g.evaluate(() => window.__ashen.stats.calls);
  await c.close();
}
console.log(JSON.stringify(report, null, 1));
console.log('errors', [...errs].slice(0, 6));
await b.close();
