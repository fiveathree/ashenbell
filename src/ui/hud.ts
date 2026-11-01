// HUD：HTML 疊喺 canvas 上面（PLAN.md 第 8 節）。尺寸全部用 --u，按螢幕高度縮放。
const html = `
<div id="hud">
  <div class="quest" id="quest"></div>
  <div class="gold">金幣 <b id="gold">0</b></div>
  <div class="mini"><canvas id="mini" width="220" height="220"></canvas><div class="floorname" id="floorName"></div></div>
  <canvas class="bigmap" id="bigmap" width="1100" height="700" hidden></canvas>
  <div class="loading" id="lvLoad" hidden><h2 id="lvName"></h2></div>
  <div class="target" id="target" hidden><div class="tname" id="tname"></div><div class="tbar"><i id="tfill"></i></div></div>
  <div class="dock">
    <div class="orb hp" title="生命"><i id="hpFill"></i><span id="hpText"></span></div>
    <div class="belt">
      <div class="xp"><i style="width:0"></i></div>
      <div class="slots">
        <div class="slot"><b>1</b></div><div class="slot"><b>2</b></div><div class="slot"><b>3</b></div><div class="slot"><b>4</b></div>
        <div class="gap"></div>
        <div class="slot"><b>Q</b></div><div class="slot"><b>W</b></div>
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

  gold(n: number) { $('gold').textContent = String(n); }
  floor(name: string) { $('floorName').textContent = name; }
  loading(name: string | null) { $('lvLoad').hidden = !name; if (name) $('lvName').textContent = name; }
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

  target(t: { name: string; hp?: number; maxHp?: number } | null) {
    $('target').hidden = !t;
    if (!t) return;
    $('tname').textContent = t.name;
    const bar = t.maxHp !== undefined;
    ($('tfill').parentElement as HTMLElement).style.display = bar ? '' : 'none';
    if (bar) $('tfill').style.width = `${t.hp! / t.maxHp! * 100}%`;
  }
}
