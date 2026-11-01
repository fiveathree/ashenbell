// 主角成長、裝備同背包（純邏輯，唔掂 three.js）。Phase 5 存檔就係存呢個物件。
import { HERO } from '../data/combat';
import { DROP, EQUIP_SLOTS, LEVELING, type EquipSlot, type LegendId, type Stat } from '../data/items';
import type { SkillId } from '../combat/skills';
import type { Item } from './item';

export const INV = { cols: 10, rows: 6 };

export interface Placed { item: Item; x: number; y: number }

export interface Stats {
  str: number; dex: number; vit: number;
  maxHp: number; armor: number; weapon: [number, number];
  dmgPct: number; crit: number; critMult: number; atkSpeed: number; moveSpeed: number;
  lifeSteal: number; rageOnHit: number; fireDmg: number; skillBonus: number;
}

export const xpToNext = (level: number) => Math.round(LEVELING.curveBase * Math.pow(level, LEVELING.curveExp));

export class Hero {
  level = 1;
  xp = 0;
  str: number = HERO.strength;
  dex: number = HERO.dexterity;
  vit: number = HERO.vitality;
  statPoints = 0;
  skillPoints = 0;
  skills: Record<SkillId, number> = { heavy: 1, charge: 1, whirl: 1, roar: 1 };
  gold = 0;
  potions = { hp: DROP.startPotions, rage: 1 };
  bag: Placed[] = [];
  equip: Partial<Record<EquipSlot, Item>> = {};

  private sum(stat: Stat) {
    let n = 0;
    for (const s of EQUIP_SLOTS) for (const a of this.equip[s]?.affixes ?? []) if (a.stat === stat) n += a.value;
    return n;
  }

  has(legend: LegendId) { return EQUIP_SLOTS.some(s => this.equip[s]?.legend === legend); }

  get stats(): Stats {
    const str = this.str + this.sum('str'), dex = this.dex + this.sum('dex'), vit = this.vit + this.sum('vit');
    let armor = HERO.armor + this.sum('armor');
    for (const s of EQUIP_SLOTS) armor += this.equip[s]?.armor ?? 0;
    return {
      str, dex, vit, armor,
      maxHp: HERO.baseHp + vit * HERO.hpPerVitality + this.sum('hp'),
      weapon: this.equip.weapon?.dmg ?? HERO.weapon,
      dmgPct: this.sum('dmgPct'),
      crit: dex * HERO.critPerDexterity + this.sum('crit') / 100,
      critMult: HERO.critMultiplier + this.sum('critDmg') / 100,
      atkSpeed: this.sum('atkSpeed'), moveSpeed: this.sum('moveSpeed'),
      lifeSteal: this.sum('lifeSteal') / 100, rageOnHit: HERO.rageOnHit + this.sum('rageOnHit'),
      fireDmg: this.sum('fireDmg'), skillBonus: this.sum('skillLevel'),
    };
  }

  skillLevel(id: SkillId) { return this.skills[id] + this.stats.skillBonus; }

  /** 加經驗；回傳升咗幾多級 */
  gain(xp: number) {
    let ups = 0;
    if (this.level >= LEVELING.max) return 0;
    this.xp += xp;
    while (this.level < LEVELING.max && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++; ups++;
      this.statPoints += LEVELING.statPoints;
      this.skillPoints += LEVELING.skillPoints;
    }
    if (this.level >= LEVELING.max) this.xp = 0;
    return ups;
  }

  spendStat(k: 'str' | 'dex' | 'vit') {
    if (this.statPoints <= 0) return false;
    this[k]++; this.statPoints--;
    return true;
  }

  spendSkill(id: SkillId) {
    if (this.skillPoints <= 0 || this.skills[id] >= LEVELING.skillMax) return false;
    this.skills[id]++; this.skillPoints--;
    return true;
  }

  /* ---------- 背包 ---------- */
  private cells(ignore?: Item) {
    const g = new Uint8Array(INV.cols * INV.rows);
    for (const p of this.bag) {
      if (p.item === ignore) continue;
      for (let y = p.y; y < p.y + p.item.h; y++) for (let x = p.x; x < p.x + p.item.w; x++) g[y * INV.cols + x] = 1;
    }
    return g;
  }

  /** 呢個位放唔放得（唔計 ignore 自己） */
  fits(item: Item, x: number, y: number, ignore?: Item) {
    if (x < 0 || y < 0 || x + item.w > INV.cols || y + item.h > INV.rows) return false;
    const g = this.cells(ignore);
    for (let j = y; j < y + item.h; j++) for (let i = x; i < x + item.w; i++) if (g[j * INV.cols + i]) return false;
    return true;
  }

  /** 搵第一個空位放入去；放唔落回傳 false */
  addItem(item: Item) {
    for (let x = 0; x < INV.cols; x++) for (let y = 0; y < INV.rows; y++) {
      if (this.fits(item, x, y)) { this.bag.push({ item, x, y }); return true; }
    }
    return false;
  }

  move(item: Item, x: number, y: number) {
    const p = this.bag.find(o => o.item === item);
    if (!p || !this.fits(item, x, y, item)) return false;
    p.x = x; p.y = y;
    return true;
  }

  removeItem(item: Item) { this.bag = this.bag.filter(p => p.item !== item); }

  /** 物品應該裝去邊格；戒指揀空嗰隻 */
  slotFor(item: Item): EquipSlot {
    if (item.slot !== 'ring') return item.slot;
    return !this.equip.ring1 ? 'ring1' : !this.equip.ring2 ? 'ring2' : 'ring1';
  }

  canEquip(item: Item, slot: EquipSlot) { return item.slot === 'ring' ? slot === 'ring1' || slot === 'ring2' : item.slot === slot; }

  /** 由背包裝備；舊裝備換返落背包。背包放唔落就唔換。 */
  wear(item: Item, slot: EquipSlot = this.slotFor(item)) {
    if (!this.canEquip(item, slot)) return false;
    const old = this.equip[slot], from = this.bag.find(p => p.item === item);
    this.removeItem(item);
    if (old && !(from && this.fits(old, from.x, from.y) && (this.bag.push({ item: old, x: from.x, y: from.y }), true)) && !this.addItem(old)) {
      if (from) this.bag.push(from);
      return false;
    }
    this.equip[slot] = item;
    return true;
  }

  takeOff(slot: EquipSlot) {
    const it = this.equip[slot];
    if (!it || !this.addItem(it)) return false;
    delete this.equip[slot];
    return true;
  }
}
