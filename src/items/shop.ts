// 商店同鐵匠重鑄（PLAN.md 第 6.11 節）
import { randInt, type Rng } from '../core/rng';
import { AFFIXES, ITEM } from '../data/items';
import { SHOP } from '../data/story';
import { makeItem, type Item } from './item';

export const sellPrice = (it: Item) => Math.round(it.value * ITEM.sellRate);
export const buyPrice = (it: Item) => it.value * SHOP.whitePriceMult;

/** 魔法、稀有先可以重鑄；回傳金幣，唔得回傳 null */
export function reforgeCost(it: Item) {
  if (it.rarity !== 'magic' && it.rarity !== 'rare') return null;
  return SHOP.reforgeBase + SHOP.reforgePerLevel * it.level;
}

/** 重新隨機第 i 條詞綴，唔會同其他詞綴撞 */
export function reforge(it: Item, i: number, rng: Rng) {
  const others = it.affixes.filter((_, k) => k !== i).map(a => a.stat);
  const pool = AFFIXES.filter(d => !others.includes(d.stat));
  const d = pool[randInt(rng, 0, pool.length - 1)];
  const v = d.min + rng() * (d.max - d.min) + d.perLevel * it.level;
  it.affixes[i] = { stat: d.stat, value: d.int ? Math.round(v) : Math.round(v * 10) / 10 };
}

export const whiteOffers = (rng: Rng, level: number, n = SHOP.smithOffers) =>
  Array.from({ length: n }, () => makeItem(rng, level, 'white'));
