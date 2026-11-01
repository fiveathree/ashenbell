import { describe, expect, it } from 'vitest';
import { generate, T } from '../src/world/dungeon';
import { navGrid } from '../src/world/nav';
import { CELL, GEN } from '../src/data/dungeon';

describe('地城生成', { timeout: 120000 }, () => {
  it('同一 seed 生成一模一樣嘅地圖，唔同 seed 唔同', () => {
    for (const floor of [0, 1, 2]) {
      expect(JSON.stringify(generate(12345, floor))).toBe(JSON.stringify(generate(12345, floor)));
      expect(generate(12345, floor).tiles).not.toEqual(generate(54321, floor).tiles);
    }
  });

  it('每層 12–20 間房，有入口同出口樓梯', () => {
    for (let seed = 1; seed <= 40; seed++) for (const floor of [0, 1, 2]) {
      const d = generate(seed, floor);
      expect(d.rooms.length).toBeGreaterThanOrEqual(GEN.roomsMin);
      expect(d.rooms.length).toBeLessThanOrEqual(GEN.roomsMax);
      expect(d.tiles[d.up.r * d.cols + d.up.c]).toBe(T.UP);
      expect(d.tiles[d.down.r * d.cols + d.down.c]).toBe(T.DOWN);
      expect(d.rooms.some(r => r.kind === 'entry')).toBe(true);
      expect(d.rooms.some(r => r.kind === 'exit')).toBe(true);
    }
  });

  it('擺好道具同柱之後，主角由入口行得到出口', () => {
    for (let seed = 1; seed <= 25; seed++) for (const floor of [0, 1, 2]) {
      const d = generate(seed, floor), g = navGrid(d);
      const from = { x: d.up.x, z: d.up.z + CELL }, to = { x: d.down.x, z: d.down.z + CELL };
      expect(g.isBlocked(from.x, from.z)).toBe(false);
      const path = g.findPath(from, to);
      expect(path.length).toBeGreaterThan(0);
      expect(Math.hypot(path.at(-1)!.x - to.x, path.at(-1)!.z - to.z)).toBeLessThan(1);
    }
  });

  it('屍鬼唔會出生喺入口房，亦唔會超過上限', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const d = generate(seed, 0), e = d.rooms.find(r => r.kind === 'entry')!;
      expect(d.spawns.length).toBeLessThanOrEqual(GEN.monstersMax);
      for (const m of d.spawns) {
        const c = m.x / CELL, r = m.z / CELL;
        expect(c >= e.x && c < e.x + e.w && r >= e.y && r < e.y + e.h).toBe(false);
      }
    }
  });

  it('第 2 層有淺水，第 1 層冇', () => {
    expect(generate(7, 0).tiles.includes(T.WATER)).toBe(false);
    expect(generate(7, 1).tiles.includes(T.WATER)).toBe(true);
  });
});
