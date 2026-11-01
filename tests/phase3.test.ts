import { describe, expect, it } from 'vitest';
import { generate } from '../src/world/dungeon';
import { FLOOR_TABLE, MONSTERS } from '../src/data/monsters';

describe('出怪表', () => {
  it('每層只出規格指定嘅怪', () => {
    expect(Object.keys(FLOOR_TABLE[0]).sort()).toEqual(['archer', 'ghoul', 'skeleton']);
    expect(FLOOR_TABLE[0].monk).toBeUndefined();
    expect(FLOOR_TABLE[1].brute).toBeUndefined();
    expect(FLOOR_TABLE[2].brute).toBeGreaterThan(0);
    for (let seed = 1; seed <= 8; seed++) {
      const floor1 = generate(seed, 0).spawns.map(s => s.type);
      expect(floor1.some(t => t === 'monk' || t === 'brute' || t === 'drowned')).toBe(false);
    }
  });

  it('水鬼只會出生喺淺水，第 2 層先有', () => {
    const d = generate(7, 1), drowned = d.spawns.filter(s => s.type === 'drowned');
    expect(drowned.length).toBeGreaterThan(0);
    expect(generate(7, 2).spawns.some(s => s.type === 'drowned')).toBe(false);
  });

  it('怪物等級 = 層數 × 4 ± 1', () => {
    for (const f of [0, 1, 2]) for (const s of generate(3, f).spawns) {
      expect(Math.abs(s.level - (f + 1) * 4)).toBeLessThanOrEqual(1);
    }
  });

  it('每層有 1–2 隊精英，每隻 1–2 個特性', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const e = generate(seed, 0).spawns.filter(s => s.traits.length);
      expect(e.length).toBeGreaterThanOrEqual(1);
      expect(e.length).toBeLessThanOrEqual(2);
      for (const s of e) { expect(s.traits.length).toBeLessThanOrEqual(2); expect(new Set(s.traits).size).toBe(s.traits.length); }
    }
  });

  it('六種怪物都有數值', () => {
    expect(Object.keys(MONSTERS).filter(k => k !== 'abbot').length).toBe(6);
  });
});
