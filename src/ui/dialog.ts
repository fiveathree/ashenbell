// 對話框、商店、標題畫面、開場、遊戲選單。全部固定大小，切換時按鈕位置唔郁。
import { RARITY, AFFIXES } from '../data/items';
import { SHOP } from '../data/story';
import { buyPrice, reforge, reforgeCost, whiteOffers } from '../items/shop';
import type { Hero } from '../items/hero';
import type { Item } from '../items/item';
import type { Settings } from '../core/settings';

const $ = (id: string) => document.getElementById(id)!;
export interface Option { label: string; fn: () => void }

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

export class Ui {
  dialogOpen = false;
  shopOpen: 'herb' | 'smith' | null = null;
  blocking = false; // 標題、開場、選單：遊戲唔接受輸入
  private lines: string[] = [];
  private i = 0;
  private options: Option[] = [];
  private offers: Item[] = [];
  private forging: Item | null = null;

  constructor(private hero: Hero, private changed: () => void) {
    $('hud').insertAdjacentHTML('beforeend', `
      <section class="talk" id="talk" hidden>
        <img id="talkFace" alt="">
        <div class="talkbody"><h4 id="talkName"></h4><p id="talkText"></p><div class="opts" id="talkOpts"></div></div>
      </section>
      <section class="panel char" id="shopPanel" hidden>
        <header><h3 id="shopTitle"></h3><span>金幣 <b id="shopGold">0</b></span></header>
        <div id="shopBody" class="shopbody"></div>
        <p class="shophint" id="shopHint"></p>
        <button class="mbtn" id="shopClose">離開</button>
      </section>
      <div class="screen" id="screen" hidden></div>`);
    $('talk').addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (this.i < this.lines.length - 1) { this.i++; this.showLine(); } else if (!this.options.length) this.closeDialog();
    });
    $('shopClose').onclick = () => this.closeShop();
    $('shopBody').addEventListener('click', e => this.shopClick(e));
  }

  /* ---------- 對話 ---------- */
  dialog(name: string, face: string | null, lines: string[], options: Option[] = []) {
    this.lines = lines; this.i = 0; this.options = options; this.dialogOpen = true;
    $('talkName').textContent = name;
    const img = $('talkFace') as HTMLImageElement;
    img.style.display = face ? '' : 'none';
    if (face) img.src = `assets/portraits/${face}.webp`;
    $('talk').hidden = false;
    this.showLine();
  }

  private showLine() {
    $('talkText').textContent = this.lines[this.i];
    const last = this.i === this.lines.length - 1;
    $('talkOpts').innerHTML = last ? this.options.map((o, k) => `<button class="mbtn" data-o="${k}">${esc(o.label)}</button>`).join('') : '';
    $('talkOpts').querySelectorAll('button').forEach(b => {
      b.onclick = () => { const o = this.options[Number(b.dataset.o)]; this.closeDialog(); o.fn(); };
    });
  }

  closeDialog() { this.dialogOpen = false; $('talk').hidden = true; }

  /* ---------- 商店 ---------- */
  openShop(mode: 'herb' | 'smith', rng: () => number) {
    this.shopOpen = mode; this.forging = null;
    if (mode === 'smith') this.offers = whiteOffers(rng, Math.max(1, this.hero.level));
    $('shopTitle').textContent = mode === 'herb' ? '草藥鋪' : '鐵匠鋪';
    $('shopHint').textContent = '打開行囊（I），喺物品撳右鍵賣出（價值 25%）';
    $('shopPanel').hidden = false;
    this.renderShop();
  }

  closeShop() { this.shopOpen = null; $('shopPanel').hidden = true; }

  renderShop() {
    const h = this.hero;
    $('shopGold').textContent = String(h.gold);
    const row = (icon: string, name: string, color: string, btn: string) =>
      `<div class="srow">${icon ? `<img src="assets/icons/${icon}.webp" alt="">` : ''}<span style="color:${color}">${esc(name)}</span>${btn}</div>`;
    const buy = (attr: string, price: number) => `<button class="sbtn" ${attr} ${h.gold < price ? 'disabled' : ''}>${price} 金</button>`;
    if (this.shopOpen === 'herb') {
      $('shopBody').innerHTML = SHOP.herb.map(o => row('', `${o.name}（持有 ${h.potions[o.id]}）`, '#c8b89a', buy(`data-pot="${o.id}"`, o.price))).join('');
      return;
    }
    if (this.forging) {
      const it = this.forging, cost = reforgeCost(it)!;
      $('shopBody').innerHTML = `<div class="lbl">重鑄 ${esc(it.name)}（每次 ${cost} 金）</div>`
        + it.affixes.map((a, i) => {
          const d = AFFIXES.find(x => x.stat === a.stat)!;
          return row('', `+${a.value}${d.pct ? '%' : ''} ${d.label}`, '#8f9bff', `<button class="sbtn" data-re="${i}" ${h.gold < cost ? 'disabled' : ''}>重鑄</button>`);
        }).join('') + `<button class="sbtn back" data-back="1">返回</button>`;
      return;
    }
    const list = [...h.bag.map(p => p.item), ...(Object.values(h.equip) as Item[])].filter(i => reforgeCost(i) !== null).slice(0, 5);
    $('shopBody').innerHTML = `<div class="lbl">購買</div>`
      + this.offers.map((it, i) => row(it.icon, it.name, RARITY.white.color, buy(`data-buy="${i}"`, buyPrice(it)))).join('')
      + `<div class="lbl">重鑄（魔法、稀有）</div>`
      + (list.map(it => row(it.icon, it.name, RARITY[it.rarity].color, `<button class="sbtn" data-pick="${it.uid}">揀</button>`)).join('') || '<p class="none">未有可以重鑄嘅物品</p>');
  }

  private shopClick(e: Event) {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const h = this.hero, d = b.dataset;
    if (d.pot) {
      const o = SHOP.herb.find(x => x.id === d.pot)!;
      h.gold -= o.price; h.potions[o.id]++;
    }
    if (d.buy !== undefined) {
      const it = this.offers[Number(d.buy)], p = buyPrice(it);
      if (h.addItem(it)) { h.gold -= p; this.offers.splice(Number(d.buy), 1); }
    }
    if (d.pick) {
      const uid = Number(d.pick);
      this.forging = [...h.bag.map(p => p.item), ...(Object.values(h.equip) as Item[])].find(i => i.uid === uid) ?? null;
    }
    if (d.re !== undefined && this.forging) {
      h.gold -= reforgeCost(this.forging)!;
      reforge(this.forging, Number(d.re), Math.random);
    }
    if (d.back) this.forging = null;
    this.changed(); this.renderShop();
  }

  /* ---------- 全畫面 ---------- */
  private screen(html: string) {
    const el = $('screen');
    el.innerHTML = html; el.hidden = false; this.blocking = true;
    return el;
  }
  closeScreen() { $('screen').hidden = true; this.blocking = false; }

  title(hasSave: boolean, onNew: () => void, onContinue: () => void, onImport: () => void, onExport: () => void, onSettings: () => void) {
    const el = this.screen(`<div class="titlebox"><h1>燼鐘</h1><h2>ASHEN BELL</h2>
      <button class="mbtn" id="tContinue" ${hasSave ? '' : 'disabled'}>繼續</button>
      <button class="mbtn" id="tNew">新遊戲</button>
      <button class="mbtn" id="tSettings">設定</button>
      <button class="mbtn" id="tExport" ${hasSave ? '' : 'disabled'}>匯出存檔</button>
      <button class="mbtn" id="tImport">匯入存檔</button>
      <p id="tMsg"></p></div>`);
    let armed = false;
    $('tContinue').onclick = onContinue;
    $('tImport').onclick = onImport;
    $('tExport').onclick = onExport;
    $('tSettings').onclick = onSettings;
    $('tNew').onclick = () => {
      if (hasSave && !armed) { armed = true; $('tMsg').textContent = '再撳一次「新遊戲」會蓋過現有存檔'; return; }
      onNew();
    };
    return el;
  }
  titleMsg(t: string) { const e = document.getElementById('tMsg'); if (e) e.textContent = t; }

  opening(lines: string[], done: () => void) {
    const el = this.screen(`<div class="opening" id="openBox"><p id="openLine"></p><small>撳一下繼續</small></div>`);
    let i = 0;
    const show = () => { $('openLine').textContent = lines[i]; };
    show();
    el.onpointerdown = () => {
      if (++i < lines.length) show();
      else { el.onpointerdown = null; this.closeScreen(); done(); }
    };
  }

  /** 結局：淡入文字，最後「第一章 完」 */
  ending(lines: string[], title: string, done: () => void) {
    const el = this.screen(`<div class="opening" id="openBox"><p id="openLine"></p><small>撳一下繼續</small></div>`);
    let i = 0;
    $('openLine').textContent = lines[0];
    el.onpointerdown = () => {
      i++;
      if (i < lines.length) { $('openLine').textContent = lines[i]; return; }
      if (i === lines.length) {
        el.innerHTML = `<div class="titlebox"><h1 style="font-size:calc(52*var(--u))">${title}</h1><button class="mbtn" id="endGo">繼續遊戲</button></div>`;
        $('endGo').onclick = () => { el.onpointerdown = null; this.closeScreen(); done(); };
      }
    };
  }

  /** 設定：畫質要重新載入先生效，所以分開一粒掣 */
  settings(s: Settings, active: string, gpu: string, onChange: () => void, onApply: () => void, onBack: () => void) {
    const qs: [Settings['quality'], string][] = [['auto', '自動'], ['low', '低'], ['medium', '中'], ['high', '高']];
    this.screen(`<div class="titlebox small setbox"><h2>設定</h2>
      <div class="setrow"><span>畫質</span><div class="segs" id="setQ">${qs.map(([k, n]) => `<button class="seg ${s.quality === k ? 'on' : ''}" data-q="${k}">${n}</button>`).join('')}</div></div>
      <p class="setnote">而家行緊：${({ low: '低', medium: '中', high: '高' } as Record<string, string>)[active]}。低畫質會關環境遮蔽同陰影。</p>
      <p class="setnote" id="setGpu">顯示卡：${gpu}${/intel/i.test(gpu) && !/nvidia|radeon/i.test(gpu) ? '（內置顯卡，覺得窒就喺 Windows「圖形設定」將瀏覽器設做高效能）' : ''}</p>
      <div class="setrow"><span>音量</span><input id="setVol" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}"><b id="setVolT">${Math.round(s.volume * 100)}</b></div>
      <label class="setrow"><span>按住滑鼠持續移動</span><input id="setHold" type="checkbox" ${s.holdMove ? 'checked' : ''}></label>
      <label class="setrow"><span>反轉滾輪縮放</span><input id="setZoom" type="checkbox" ${s.invertZoom ? 'checked' : ''}></label>
      <button class="mbtn" id="setApply" disabled>套用畫質（會重新載入）</button>
      <button class="mbtn" id="setBack">返回</button></div>`);
    const original = s.quality;
    $('setQ').onclick = e => {
      const b = (e.target as HTMLElement).closest('[data-q]') as HTMLElement | null;
      if (!b) return;
      s.quality = b.dataset.q as Settings['quality'];
      $('setQ').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      ($('setApply') as HTMLButtonElement).disabled = s.quality === original;
      onChange();
    };
    const vol = $('setVol') as HTMLInputElement;
    vol.oninput = () => { s.volume = Number(vol.value) / 100; $('setVolT').textContent = vol.value; onChange(); };
    ($('setHold') as HTMLInputElement).onchange = e => { s.holdMove = (e.target as HTMLInputElement).checked; onChange(); };
    ($('setZoom') as HTMLInputElement).onchange = e => { s.invertZoom = (e.target as HTMLInputElement).checked; onChange(); };
    $('setApply').onclick = onApply;
    $('setBack').onclick = onBack;
  }

  menu(onExport: () => void, onImport: () => void, onTitle: () => void, onSettings: () => void) {
    this.screen(`<div class="titlebox small"><h2>選單</h2>
      <button class="mbtn" id="mBack">返回遊戲</button>
      <button class="mbtn" id="mSettings">設定</button>
      <button class="mbtn" id="mExport">匯出存檔</button>
      <button class="mbtn" id="mImport">匯入存檔</button>
      <button class="mbtn" id="mTitle">返回標題</button></div>`);
    $('mBack').onclick = () => this.closeScreen();
    $('mSettings').onclick = onSettings;
    $('mExport').onclick = onExport;
    $('mImport').onclick = onImport;
    $('mTitle').onclick = onTitle;
  }
}
