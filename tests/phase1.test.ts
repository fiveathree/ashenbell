import { describe, expect, it } from 'vitest';
import { Grid } from '../src/world/grid';
import { mitigation, rollDamage } from '../src/combat/damage';

const room = () => new Grid({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, 0.5);

describe('A* 尋路', () => {
  it('冇障礙就直線去', () => {
    expect(room().findPath({ x: -5, z: 0 }, { x: 5, z: 0 })).toEqual([{ x: 5, z: 0 }]);
  });

  it('繞過牆，而且每段路都冇穿牆', () => {
    const g = room();
    g.stamp([], [{ minX: -1, maxX: 1, minZ: -6, maxZ: 6 }], 0.4);
    const from = { x: -5, z: 0 }, path = g.findPath(from, { x: 5, z: 0 });
    expect(path.length).toBeGreaterThan(1);
    let a = from;
    for (const p of path) { expect(g.lineClear(a, p)).toBe(true); a = p; }
    expect(a).toEqual({ x: 5, z: 0 });
  });

  it('目的地喺障礙入面，就去最近可行走嘅點', () => {
    const g = room();
    g.stamp([{ x: 5, z: 0, r: 1.5 }], [], 0);
    const end = g.findPath({ x: -5, z: 0 }, { x: 5, z: 0 }).at(-1)!;
    expect(g.isBlocked(end.x, end.z)).toBe(false);
    expect(Math.hypot(end.x - 5, end.z)).toBeLessThan(2.5);
  });

  it('完全封死就回傳空路徑', () => {
    const g = room();
    g.stamp([], [{ minX: 2, maxX: 3, minZ: -11, maxZ: 11 }], 0);
    expect(g.findPath({ x: -5, z: 0 }, { x: 8, z: 0 })).toEqual([]);
  });
});

describe('傷害公式', () => {
  const base = { weapon: [10, 10] as [number, number], strength: 10, critChance: 0, critMult: 1.5, targetArmor: 0, attackerLevel: 1 };

  it('減傷 = 護甲 / (護甲 + 50 × 攻擊者等級)', () => {
    expect(mitigation(50, 1)).toBeCloseTo(0.5);
    expect(mitigation(50, 2)).toBeCloseTo(1 / 3);
  });

  it('力量每點 +1% 傷害', () => {
    expect(rollDamage(base, () => 0.5).amount).toBe(11);
  });

  it('爆擊乘 1.5，護甲會減傷', () => {
    expect(rollDamage({ ...base, critChance: 1 }, () => 0).amount).toBe(17);
    expect(rollDamage({ ...base, targetArmor: 50 }, () => 0.5).amount).toBe(6);
  });
});
