// 背包（I）同角色面板（C）。兩個面板固定大小，開關唔會令其他嘢移位。
import { AFFIXES, EQUIP_SLOTS, RARITY, SLOT_NAME, LEGENDS, type EquipSlot } from '../data/items';
import { LEVELING } from '../data/items';
import { SKILLS } from '../data/skills';
import { SKILL_ORDER } from '../combat/skills';
import { INV, xpToNext, type Hero } from '../items/hero';
import type { Item } from '../items/item';

const $ = (id: string) => document.getElementById(id)!;
const CELL_VAR = 'calc(38*var(--u))';

const affixLine = (stat: string, v: number) => {
  const d = AFFIXES.find(a => a.stat === stat)!;
  return `+${v}${d.pct ? '%' : ''} ${d.label}`;
};

function tooltipHtml(it: Item, other?: Item) {
  const r = RARITY[it.rarity], cmp = (a: number, b?: number) => b === undefined || a === b ? '' : a > b ? 'up' : 'down';
  const lines: string[] = [`<h4 style="color:${r.color}">${it.name}</h4><small>${r.name} ${it.slot === 'ring' ? '戒指' : SLOT_NAME[it.slot as EquipSlot]} · 物品等級 ${it.level}</small>`];
  if (it.dmg) {
    const avg = (i: Item) => (i.dmg![0] + i.dmg![1]) / 2;
    lines.push(`<p class="${other?.dmg ? cmp(avg(it), avg(other)) : ''}">傷害 ${it.dmg[0]}–${it.dmg[1]}</p>`);
  }
  if (it.armor) lines.push(`<p class="${cmp(it.armor, other?.armor)}">護甲 ${it.armor}</p>`);
  for (const a of it.affixes) {
    const o = other?.affixes.find(x => x.stat === a.stat);
    lines.push(`<p class="${other ? cmp(a.value, o?.value ?? 0) : ''}" style="${other ? '' : 'color:#8f9bff'}">${affixLine(a.stat, a.value)}</p>`);
  }
  if (other) for (const a of other.affixes) {
    if (!it.affixes.some(x => x.stat === a.stat)) lines.push(`<p class="down">失去 ${affixLine(a.stat, a.value)}</p>`);
  }
  if (it.legend) lines.push(`<p style="color:${r.color}">${LEGENDS[it.legend].effect}</p>`);
  lines.push(`<small>售價 ${Math.round(it.value * 0.25)} 金幣</small>`);
  return lines.join('');
}

const iconUrl = (it: Item) => `assets/icons/${it.icon}.webp`;

export class Panels {
  invOpen = false;
  charOpen = false;
  sellHook: ((it: Item) => boolean) | null = null;
  private drag: { item: Item; from: EquipSlot | null; el: HTMLElement; ox: number; oy: number } | null = null;

  constructor(private h: Hero, private changed: () => void, private spentSkill: () => void) {
    document.getElementById('hud')!.insertAdjacentHTML('beforeend', `
      <section class="panel inv" id="invPanel" hidden>
        <header><h3>行囊</h3><span>金幣 <b id="invGold">0</b></span></header>
        <div class="paper" id="paper"></div>
        <div class="grid" id="bag" style="--c:${INV.cols};--r:${INV.rows}"></div>
      </section>
      <section class="panel char" id="charPanel" hidden>
        <header><h3>獵魔人</h3><span id="charLv"></span></header>
        <div class="cols">
          <div class="box"><div class="lbl">屬性 <em id="statPts"></em></div><div id="statRows"></div></div>
          <div class="box"><div class="lbl">戰鬥</div><div id="derived"></div></div>
        </div>
        <div class="box"><div class="lbl">技能 <em id="skillPts"></em></div><div id="skillRows"></div></div>
      </section>
      <div class="tip" id="tip" hidden></div><div class="tip cmp" id="tip2" hidden></div>`);
    $('bag').addEventListener('pointerdown', e => this.grab(e));
    $('paper').addEventListener('pointerdown', e => this.grab(e));
    addEventListener('pointermove', e => this.moveDrag(e));
    addEventListener('pointerup', e => this.drop(e));
    for (const id of ['bag', 'paper']) {
      const el = $(id);
      el.addEventListener('pointermove', e => this.hover(e));
      el.addEventListener('pointerleave', () => this.tip(null));
      el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); this.quick(e); });
    }
    $('charPanel').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('[data-stat],[data-skill]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.stat) h.spendStat(b.dataset.stat as 'str' | 'dex' | 'vit');
      if (b.dataset.skill) { h.spendSkill(b.dataset.skill as typeof SKILL_ORDER[number]); this.spentSkill(); }
      this.changed(); this.render();
    });
  }

  get open() { return this.invOpen || this.charOpen; }

  toggle(which: 'inv' | 'char') {
    if (which === 'inv') this.invOpen = !this.invOpen; else this.charOpen = !this.charOpen;
    this.sync();
  }
  closeAll() { this.invOpen = this.charOpen = false; this.sync(); }
  private sync() {
    $('invPanel').hidden = !this.invOpen; $('charPanel').hidden = !this.charOpen;
    this.tip(null);
    this.render();
  }

  private cellItem(it: Item, slot?: EquipSlot) {
    const r = RARITY[it.rarity];
    return `<img src="${iconUrl(it)}" alt="${it.name}" draggable="false" style="--rc:${r.color}" ${slot ? `data-slot="${slot}"` : `data-uid="${it.uid}"`}>`;
  }

  render() {
    const h = this.h;
    if (this.invOpen) {
      $('invGold').textContent = String(h.gold);
      $('paper').innerHTML = EQUIP_SLOTS.map(s => {
        const it = h.equip[s];
        return `<div class="eq eq-${s}" data-drop="${s}">${it ? this.cellItem(it, s) : `<span>${SLOT_NAME[s]}</span>`}</div>`;
      }).join('');
      $('bag').innerHTML = h.bag.map(p => `<div class="it" style="left:calc(${p.x}*${CELL_VAR});top:calc(${p.y}*${CELL_VAR});width:calc(${p.item.w}*${CELL_VAR});height:calc(${p.item.h}*${CELL_VAR});--rc:${RARITY[p.item.rarity].color}">${this.cellItem(p.item)}</div>`).join('');
    }
    if (this.charOpen) {
      const s = h.stats, can = h.statPoints > 0;
      $('charLv').textContent = `等級 ${h.level}${h.level < LEVELING.max ? ` · ${h.xp} / ${xpToNext(h.level)}` : ''}`;
      $('statPts').textContent = h.statPoints ? `可分配 ${h.statPoints}` : '';
      $('skillPts').textContent = h.skillPoints ? `可分配 ${h.skillPoints}` : '';
      const row = (k: string, name: string, v: number, note: string) =>
        `<div class="row"><span>${name}</span><b>${v}</b><i>${note}</i><button data-stat="${k}" ${can ? '' : 'disabled'}>+</button></div>`;
      $('statRows').innerHTML = row('str', '力量', s.str, '每點 +1% 傷害') + row('dex', '敏捷', s.dex, '爆擊、閃避') + row('vit', '體質', s.vit, '每點 +5 生命');
      const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
      $('derived').innerHTML = kv('生命', String(s.maxHp)) + kv('護甲', String(s.armor)) + kv('武器', `${s.weapon[0]}–${s.weapon[1]}`)
        + kv('爆擊率', `${(s.crit * 100).toFixed(1)}%`) + kv('爆擊倍率', `×${s.critMult.toFixed(2)}`)
        + kv('攻擊速度', `+${s.atkSpeed}%`) + kv('移動速度', `+${s.moveSpeed}%`) + kv('生命偷取', `${(s.lifeSteal * 100).toFixed(1)}%`);
      $('skillRows').innerHTML = SKILL_ORDER.map(id => {
        const lv = h.skills[id], full = lv >= LEVELING.skillMax;
        return `<div class="row skill"><span>${SKILLS[id].name}</span><b>${lv}${s.skillBonus ? `+${s.skillBonus}` : ''}</b><i>最高 ${LEVELING.skillMax} 級</i><button data-skill="${id}" ${h.skillPoints > 0 && !full ? '' : 'disabled'}>+</button></div>`;
      }).join('');
    }
  }

  private itemAt(e: Event): { item: Item; slot: EquipSlot | null } | null {
    const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null;
    if (!img) return null;
    const slot = img.dataset.slot as EquipSlot | undefined;
    if (slot) return { item: this.h.equip[slot]!, slot };
    const p = this.h.bag.find(o => o.item.uid === Number(img.dataset.uid));
    return p ? { item: p.item, slot: null } : null;
  }

  private hover(e: PointerEvent) {
    if (this.drag) return;
    const hit = this.itemAt(e);
    this.tip(hit ? hit : null, e.clientX, e.clientY);
  }

  private tip(hit: { item: Item; slot: EquipSlot | null } | null, x = 0, y = 0) {
    const a = $('tip'), b = $('tip2');
    a.hidden = !hit;
    b.hidden = true;
    if (!hit) return;
    const worn = hit.slot ? undefined : this.h.equip[this.h.slotFor(hit.item)];
    a.innerHTML = tooltipHtml(hit.item, worn);
    const u = innerHeight / 720, w = 240 * u;
    const left = x + 16 + w * (worn ? 2 : 1) > innerWidth ? x - w * (worn ? 2 : 1) - 24 : x + 16;
    a.style.left = `${left}px`;
    a.style.top = `${Math.max(8, Math.min(innerHeight - a.offsetHeight - 8, y - 20))}px`;
    if (worn) {
      b.hidden = false;
      b.innerHTML = `<small>已裝備</small>${tooltipHtml(worn)}`;
      b.style.left = `${left + w + 8}px`;
      b.style.top = a.style.top;
    }
  }

  /** 右鍵快速裝備／卸下 */
  private quick(e: Event) {
    const hit = this.itemAt(e);
    if (!hit) return;
    if (hit.slot) this.h.takeOff(hit.slot);
    else if (!this.sellHook?.(hit.item)) this.h.wear(hit.item);
    this.tip(null);
    this.changed(); this.render();
  }

  private grab(e: PointerEvent) {
    if (e.button !== 0) return;
    const hit = this.itemAt(e);
    if (!hit) return;
    e.preventDefault();
    const u = innerHeight / 720, el = document.createElement('img');
    el.src = iconUrl(hit.item);
    el.className = 'dragging';
    el.style.width = `${hit.item.w * 38 * u}px`;
    el.style.height = `${hit.item.h * 38 * u}px`;
    document.getElementById('hud')!.appendChild(el);
    this.drag = { item: hit.item, from: hit.slot, el, ox: hit.item.w * 19 * u, oy: hit.item.h * 19 * u };
    this.tip(null);
    this.moveDrag(e);
  }

  private moveDrag(e: PointerEvent) {
    const d = this.drag;
    if (d) { d.el.style.left = `${e.clientX - d.ox}px`; d.el.style.top = `${e.clientY - d.oy}px`; }
  }

  private drop(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.el.remove();
    const h = this.h, under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const eq = under?.closest('[data-drop]') as HTMLElement | null, bag = $('bag').getBoundingClientRect();
    if (eq) {
      const slot = eq.dataset.drop as EquipSlot;
      if (d.from) { if (h.canEquip(d.item, slot) && !h.equip[slot]) { delete h.equip[d.from]; h.equip[slot] = d.item; } } else h.wear(d.item, slot);
    } else if (e.clientX >= bag.left && e.clientX <= bag.right && e.clientY >= bag.top && e.clientY <= bag.bottom) {
      const u = innerHeight / 720, cell = 38 * u;
      const x = Math.round((e.clientX - d.ox - bag.left) / cell), y = Math.round((e.clientY - d.oy - bag.top) / cell);
      if (d.from) {
        if (h.fits(d.item, x, y)) { delete h.equip[d.from]; h.bag.push({ item: d.item, x, y }); }
      } else h.move(d.item, x, y);
    }
    this.changed(); this.render();
  }
}
