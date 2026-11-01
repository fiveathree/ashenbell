// HUD：HTML 疊喺 canvas 上面（PLAN.md 第 8 節）。尺寸全部用 --u，按螢幕高度縮放。
import { SKILLS } from '../data/skills';
import { SKILL_ORDER, type Skills } from '../combat/skills';

const html = `
<div id="hud">
  <div class="quest" id="quest"></div>
  <div class="gold">金幣 <b id="gold">0</b></div>
  <div class="mini"><canvas id="mini" width="220" height="220"></canvas><div class="floorname" id="floorName"></div></div>
  <canvas class="bigmap" id="bigmap" width="1100" height="700" hidden></canvas>
  <div class="loading" id="lvLoad" hidden><h2 id="lvName"></h2><div class="lvbar"><i id="lvFill"></i></div></div>
  <div class="bossbar" id="bossBar" hidden><div class="bname" id="bossName"></div><div class="bbar"><i id="bossFill"></i><b class="m7"></b><b class="m35"></b></div></div>
  <div class="bossline" id="bossLine" hidden></div>
  <div class="target" id="target" hidden><div class="tname" id="tname"></div><div class="tbar"><i id="tfill"></i></div></div>
  <div class="dock">
    <div class="orb hp" title="生命"><i id="hpFill"></i><span id="hpText"></span></div>
    <div class="belt">
      <div class="xp"><i id="xpFill" style="width:0"></i></div>
      <div class="slots">
        ${SKILL_ORDER.map((id, i) => `<div class="slot skill" id="sk-${id}"><img src="assets/icons/skill_${id}.webp" alt="" onerror="this.remove()"><em>${SKILLS[id].glyph}</em><u></u><b>${i + 1}</b></div>`).join('')}
        <div class="gap"></div>
        <div class="slot potion"><em id="potQ" style="color:#c8352a"></em><b>Q</b></div><div class="slot potion"><em id="potW" style="color:#d9771f"></em><b>W</b></div>
      </div>
    </div>
    <div class="orb rage" title="怒氣"><i id="rageFill"></i><span id="rageText"></span></div>
  </div>
  <div class="dead" id="deadBox" hidden><h2>你倒下了</h2><p>灰燼之中，你再次站起……</p></div>
</div>`;

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private last = '';
  mini: HTMLCanvasElement;
  big: HTMLCanvasElement;

  constructor() {
    document.body.insertAdjacentHTML('beforeend', html);
    this.mini = $('mini') as HTMLCanvasElement;
    this.big = $('bigmap') as HTMLCanvasElement;
  }

  skills(s: Skills, buff: number) {
    for (const id of SKILL_ORDER) {
      const el = $(`sk-${id}`), def = SKILLS[id] as { cooldown?: number }, left = s.cooldown[id];
      const u = el.querySelector('u') as HTMLElement;
      u.style.background = def.cooldown && left > 0 ? `conic-gradient(rgba(0,0,0,.78) ${left / def.cooldown * 360}deg,transparent 0)` : 'none';
      el.classList.toggle('off', !s.ready(id) && !(def.cooldown && left > 0));
      el.classList.toggle('on', (id === 'whirl' && s.whirling) || (id === 'roar' && buff > 0));
    }
  }

  bossBar(b: { name: string; hp: number; maxHp: number } | null) {
    $('bossBar').hidden = !b;
    if (!b) return;
    $('bossName').textContent = b.name;
    $('bossFill').style.width = `${b.hp / b.maxHp * 100}%`;
  }
  bossLine(t: string | null) {
    $('bossLine').hidden = !t;
    if (t) $('bossLine').textContent = t;
  }

  gold(n: number) { $('gold').textContent = String(n); }
  progress(xp: number, need: number, hpPot: number, ragePot: number, points: number) {
    $('xpFill').style.width = `${need ? xp / need * 100 : 100}%`;
    $('potQ').textContent = String(hpPot);
    $('potW').textContent = String(ragePot);
    $('quest').dataset.pts = points ? `有 ${points} 點未分配（C）` : '';
  }
  levelUp(n: number) {
    const el = document.createElement('div');
    el.className = 'lvup'; el.textContent = `升到 ${n} 級`;
    $('hud').appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
  floor(name: string) { $('floorName').textContent = name; }
  loading(name: string | null) { $('lvLoad').hidden = !name; if (name) $('lvName').textContent = name; }
  loadProgress(p: number) { $('lvFill').style.width = `${p * 100}%`; }
  showMap(on: boolean) { this.big.hidden = !on; }

  update(hp: number, maxHp: number, rage: number, rageMax: number, quest: string, dead: boolean) {
    const key = `${hp}|${Math.round(rage)}|${quest}|${dead}`;
    if (key === this.last) return;
    this.last = key;
    $('hpFill').style.height = `${hp / maxHp * 100}%`;
    $('hpText').textContent = `${Math.ceil(hp)} / ${maxHp}`;
    $('rageFill').style.height = `${rage / rageMax * 100}%`;
    $('rageText').textContent = `${Math.round(rage)}`;
    $('quest').textContent = quest;
    $('deadBox').hidden = !dead;
  }

  target(t: { name: string; hp?: number; maxHp?: number; elite?: boolean } | null) {
    $('target').hidden = !t;
    if (!t) return;
    $('tname').textContent = t.name;
    $('tname').classList.toggle('elite', !!t.elite);
    const bar = t.maxHp !== undefined;
    ($('tfill').parentElement as HTMLElement).style.display = bar ? '' : 'none';
    if (bar) $('tfill').style.width = `${t.hp! / t.maxHp! * 100}%`;
  }
}
