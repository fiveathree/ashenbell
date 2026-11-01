import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { makeItem, rollLoot, rollRarity } from '../src/items/item';
import { Hero, xpToNext } from '../src/items/hero';
import { AFFIXES, DROP, LEGENDS, LEVELING, RARITY, RARITY_ORDER } from '../src/data/items';
import { rollDamage } from '../src/combat/damage';

const count = (n: number, seed = 1) => {
  const rng = mulberry32(seed), c = { white: 0, magic: 0, rare: 0, legend: 0 };
  for (let i = 0; i < n; i++) c[rollRarity(rng)]++;
  return c;
};

describe('掉寶機率（第 6.7 節）', () => {
  it('機率加埋係 100%', () => {
    expect(RARITY_ORDER.reduce((s, r) => s + RARITY[r].chance, 0)).toBeCloseTo(1);
  });

  it('20 萬次：每種稀有度誤差少過 0.3 個百分點', () => {
    const n = 200000, c = count(n);
    for (const r of RARITY_ORDER) expect(Math.abs(c[r] / n - RARITY[r].chance)).toBeLessThan(0.003);
  });

  it('打 100 隻怪：分佈落喺 99% 信賴區間入面（跑 50 次取平均）', () => {
    const total = { white: 0, magic: 0, rare: 0, legend: 0 };
    let items = 0;
    for (let run = 1; run <= 50; run++) {
      const rng = mulberry32(run * 7919);
      for (let i = 0; i < 100; i++) {
        const { item } = rollLoot(rng, 4, false);
        if (item) { total[item.rarity]++; items++; }
      }
    }
    expect(Math.abs(items / 5000 - DROP.itemChance)).toBeLessThan(0.03);
    for (const r of RARITY_ORDER) {
      const p = RARITY[r].chance, sd = Math.sqrt(p * (1 - p) / items);
      expect(Math.abs(total[r] / items - p)).toBeLessThan(2.6 * sd);
    }
  });

  it('精英掉寶率 ×3', () => {
    const rng = mulberry32(5);
    let normal = 0, elite = 0;
    for (let i = 0; i < 30000; i++) { if (rollLoot(rng, 4, false).item) normal++; if (rollLoot(rng, 4, true).item) elite++; }
    expect(elite / normal).toBeGreaterThan(2.8);
    expect(elite / normal).toBeLessThan(3.2);
  });
});

describe('詞綴生成', () => {
  it('每種稀有度嘅詞綴數啱，同一件冇重複詞綴', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 4000; i++) {
      const it = makeItem(rng, 8), [lo, hi] = RARITY[it.rarity].affixes;
      expect(it.affixes.length).toBeGreaterThanOrEqual(lo);
      expect(it.affixes.length).toBeLessThanOrEqual(hi);
      expect(new Set(it.affixes.map(a => a.stat)).size).toBe(it.affixes.length);
    }
  });

  it('詞綴數值喺範圍入面', () => {
    const rng = mulberry32(11), lv = 10;
    for (let i = 0; i < 3000; i++) for (const a of makeItem(rng, lv, 'rare').affixes) {
      const d = AFFIXES.find(x => x.stat === a.stat)!;
      expect(a.value).toBeGreaterThanOrEqual(Math.floor(d.min + d.perLevel * lv) - 0.5);
      expect(a.value).toBeLessThanOrEqual(d.max + d.perLevel * lv + 0.5);
    }
  });

  it('5 件傳奇都出到，名同部位啱，有 4 條詞綴', () => {
    expect(Object.keys(LEGENDS).length).toBe(5);
    const rng = mulberry32(13), seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const it = makeItem(rng, 12, 'legend');
      seen.add(it.legend!);
      expect(it.affixes.length).toBe(4);
      expect(it.name).toBe(LEGENDS[it.legend!].name);
    }
    expect(seen.size).toBe(5);
  });
});

describe('傷害公式同屬性', () => {
  it('裝備同力量都計入傷害', () => {
    const h = new Hero(), rng = () => 0.5;
    const base = rollDamage({ weapon: h.stats.weapon, strength: h.stats.str, critChance: 0, critMult: 1.5, targetArmor: 0, attackerLevel: 1 }, rng).amount;
    const sword = makeItem(mulberry32(1), 20, 'white');
    h.addItem({ ...sword, slot: 'weapon', dmg: [40, 40], affixes: [{ stat: 'str', value: 50 }] });
    h.wear(h.bag[0].item, 'weapon');
    const more = rollDamage({ weapon: h.stats.weapon, strength: h.stats.str, critChance: 0, critMult: 1.5, targetArmor: 0, attackerLevel: 1 }, rng).amount;
    expect(more).toBe(Math.round(40 * 1.6));
    expect(more).toBeGreaterThan(base);
  });

  it('敏捷每點 +0.2% 爆擊，體質每點 +5 生命', () => {
    const h = new Hero(), a = h.stats;
    h.statPoints = 2;
    h.spendStat('dex'); h.spendStat('vit');
    expect(h.stats.crit - a.crit).toBeCloseTo(0.002);
    expect(h.stats.maxHp - a.maxHp).toBe(5);
  });
});

describe('升級', () => {
  it('經驗曲線 = 100 × 等級^1.6', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(4)).toBe(Math.round(100 * Math.pow(4, 1.6)));
  });

  it('每級 +5 屬性點 +1 技能點，等級上限 15', () => {
    const h = new Hero();
    expect(h.gain(100)).toBe(1);
    expect(h.level).toBe(2);
    expect(h.statPoints).toBe(5);
    expect(h.skillPoints).toBe(1);
    h.gain(1e9);
    expect(h.level).toBe(LEVELING.max);
    expect(h.xp).toBe(0);
  });

  it('技能最高 5 級', () => {
    const h = new Hero();
    h.skillPoints = 10;
    while (h.spendSkill('heavy'));
    expect(h.skills.heavy).toBe(5);
  });
});

describe('背包', () => {
  const big = () => ({ ...makeItem(mulberry32(1), 1, 'white'), w: 2, h: 3 });

  it('10×6 放滿就放唔落，物品唔會重疊', () => {
    const h = new Hero();
    let n = 0;
    while (h.addItem({ ...big(), uid: n })) n++;
    expect(n).toBe(10); // 5 欄 × 2 排
    const used = new Set<number>();
    for (const p of h.bag) for (let y = p.y; y < p.y + p.item.h; y++) for (let x = p.x; x < p.x + p.item.w; x++) {
      expect(used.has(y * 10 + x)).toBe(false);
      used.add(y * 10 + x);
    }
  });

  it('裝備換裝時舊裝備返落背包', () => {
    const h = new Hero(), rng = mulberry32(2);
    const a = { ...makeItem(rng, 1, 'white'), slot: 'helm' as const }, b = { ...makeItem(rng, 1, 'white'), slot: 'helm' as const };
    h.addItem(a); h.addItem(b);
    expect(h.wear(a, 'helm')).toBe(true);
    expect(h.wear(b, 'helm')).toBe(true);
    expect(h.equip.helm).toBe(b);
    expect(h.bag.map(p => p.item)).toContain(a);
  });

  it('唔啱部位唔裝得，戒指有兩格', () => {
    const h = new Hero(), rng = mulberry32(3);
    const helm = { ...makeItem(rng, 1, 'white'), slot: 'helm' as const }, r1 = { ...makeItem(rng, 1, 'white'), slot: 'ring' as const }, r2 = { ...r1, uid: 999 };
    h.addItem(helm); h.addItem(r1); h.addItem(r2);
    expect(h.wear(helm, 'boots')).toBe(false);
    h.wear(r1); h.wear(r2);
    expect(h.equip.ring1).toBe(r1);
    expect(h.equip.ring2).toBe(r2);
  });
});
