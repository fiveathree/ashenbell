// 物品生成（純邏輯）：稀有度、詞綴、掉寶
import { randInt, type Rng } from '../core/rng';
import {
  AFFIXES, BASES, DROP, ITEM, LEGENDS, RARITY, RARITY_ORDER,
  type Base, type LegendId, type Rarity, type Slot, type Stat,
} from '../data/items';

export interface Affix { stat: Stat; value: number }
export interface Item {
  uid: number; base: string; name: string; slot: Slot; w: number; h: number; icon: string;
  rarity: Rarity; level: number; affixes: Affix[]; legend?: LegendId;
  dmg?: [number, number]; armor?: number; value: number; twoHand?: boolean;
}

let nextUid = 1;
/** 讀檔之後唔好撞舊物品 uid */
export const noteUid = (uid: number) => { nextUid = Math.max(nextUid, uid + 1); };

export function rollRarity(rng: Rng): Rarity {
  let k = rng();
  for (const r of RARITY_ORDER) { k -= RARITY[r].chance; if (k < 0) return r; }
  return 'white';
}

function rollAffixes(rng: Rng, n: number, level: number): Affix[] {
  const pool = [...AFFIXES], out: Affix[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const d = pool.splice(randInt(rng, 0, pool.length - 1), 1)[0];
    const v = d.min + rng() * (d.max - d.min) + d.perLevel * level;
    out.push({ stat: d.stat, value: d.int ? Math.round(v) : Math.round(v * 10) / 10 });
  }
  return out;
}

export function makeItem(rng: Rng, level: number, rarity: Rarity = rollRarity(rng), legend?: LegendId): Item {
  let lid = legend;
  if (rarity === 'legend' && !lid) {
    const ids = Object.keys(LEGENDS) as LegendId[];
    lid = ids[randInt(rng, 0, ids.length - 1)];
  }
  const base: Base = lid
    ? BASES.find(b => b.id === LEGENDS[lid!].base)!
    : BASES[randInt(rng, 0, BASES.length - 1)];
  const r = RARITY[rarity], scale = 1 + ITEM.perLevel * (level - 1);
  const affixes = rollAffixes(rng, randInt(rng, r.affixes[0], r.affixes[1]), level);
  const prefix = rarity === 'white' ? '' : rarity === 'magic' ? '附魔的' : rarity === 'rare' ? '灰燼' : '';
  return {
    uid: nextUid++, base: base.id, name: lid ? LEGENDS[lid].name : prefix + base.name, slot: base.slot,
    w: base.w, h: base.h, icon: lid ? LEGENDS[lid].icon : base.icon, rarity, level, affixes, legend: lid,
    dmg: base.dmg && [Math.round(base.dmg[0] * scale), Math.round(base.dmg[1] * scale)],
    armor: base.armor && Math.round(base.armor * scale),
    value: Math.round(base.value * r.value * scale), twoHand: base.twoHand,
  };
}

export interface Loot { item: Item | null; gold: number; potion: 'hp' | 'rage' | null }

/** 一隻怪死後掉咩。elite = 掉寶率 ×3 */
export function rollLoot(rng: Rng, level: number, elite: boolean): Loot {
  const item = rng() < Math.min(1, DROP.itemChance * (elite ? DROP.eliteMult : 1)) ? makeItem(rng, level) : null;
  const gold = rng() < DROP.goldChance ? randInt(rng, DROP.goldPerLevel[0], DROP.goldPerLevel[1]) * level : 0;
  const potion = rng() < DROP.potionChance ? (rng() < 0.65 ? 'hp' : 'rage') : null;
  return { item, gold, potion };
}
