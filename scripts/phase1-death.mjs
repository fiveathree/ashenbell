// Phase 1 驗收：主角死亡同復活，順手影 HUD 同高畫質戰鬥圖
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8171/?q=high');
await p.waitForFunction(() => window.__ashen, null, { timeout: 90000 });
await p.waitForTimeout(2000);
// 將三隻屍鬼拉埋主角身邊，影戰鬥
await p.evaluate(() => {
  const a = window.__ashen;
  a.player.place(0.5, -2); a.snap();
  a.ghouls.slice(0, 4).forEach((g, i) => { g.pos.set(0.5 + [1.3, -1.3, 0.2, 1][i], 0, -2 + [0.3, 0.5, 1.4, -1.2][i]); g.state = 'chase'; });
  a.player.attack(a.ghouls[0]);
});
await p.waitForTimeout(1600);
await p.screenshot({ path: 'docs/screenshots/phase1-fight.png' });
await p.evaluate(() => { const a = window.__ashen; a.player.hp = 1; a.player.hurt(5); });
await p.waitForTimeout(1500);
const dead = await p.evaluate(() => ({ dead: window.__ashen.player.dead, hp: window.__ashen.player.hp, box: !document.getElementById('deadBox').hidden }));
await p.screenshot({ path: 'docs/screenshots/phase1-dead.png' });
await p.waitForFunction(() => !window.__ashen.player.dead, null, { timeout: 30000 });
await p.waitForTimeout(300);
const alive = await p.evaluate(() => ({ dead: window.__ashen.player.dead, hp: window.__ashen.player.hp, pos: window.__ashen.player.pos.toArray(), box: !document.getElementById('deadBox').hidden }));
console.log(JSON.stringify({ dead, alive, errs }));
await b.close();
