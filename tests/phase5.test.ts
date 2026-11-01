import { describe, expect, it } from 'vitest';
import { Story } from '../src/story/quests';
import { Hero } from '../src/items/hero';
import { makeItem } from '../src/items/item';
import { mulberry32 } from '../src/core/rng';
import { pack, parse, restore, type WorldState } from '../src/core/save';
import { generate, townDungeon } from '../src/world/dungeon';
import { navGrid } from '../src/world/nav';
import { NPCS } from '../src/data/story';
import { reforge, reforgeCost, sellPrice } from '../src/items/shop';

const world: WorldState = { seed: 42, floor: 1, waypoints: [-1, 0], cleared: { 0: [1, 2] }, broken: {}, explored: {} };

describe('主線任務', () => {
  it('由頭行到任務三，次序啱', () => {
    const s = new Story();
    expect(s.stage).toBe(0);
    expect(s.talkGe()[0]).toContain('你終於返嚟');
    expect(s.stage).toBe(1);
    s.talkGe();
    expect(s.stage).toBe(1); // 未搵到遺物唔會推進
    s.foundRelic();
    expect(s.stage).toBe(2);
    expect(s.talkGe()[0]).toContain('被人「送」落去');
    expect(s.stage).toBe(3);
    s.foundPage(0); s.foundPage(0); s.foundPage(1);
    expect(s.stage).toBe(3);
    s.foundPage(2);
    expect(s.stage).toBe(4);
    expect(s.talkGe().join('')).toContain('守錯咗方向');
    expect(s.stage).toBe(5);
  });

  it('未接任務搵到遺物，接任務後都計', () => {
    const s = new Story();
    s.foundRelic();
    s.talkGe();
    expect(s.stage).toBe(2); // 唔會卡死
    expect(s.relic).toBe(true);
  });
});

describe('任務唔會卡死', () => {
  it('未接任務二就執齊日記，傾完直接到交日記', () => {
    const s = new Story();
    s.stage = 2; s.relic = true;
    s.foundPage(0); s.foundPage(1); s.foundPage(2);
    s.talkGe();
    expect(s.stage).toBe(4);
  });
  it('未接任務三就打低 Boss，都去到結局', () => {
    const s = new Story();
    s.stage = 4; s.pages = [true, true, true];
    s.beatBoss();
    s.talkGe();
    expect(s.stage).toBe(6);
  });
});

describe('存檔', () => {
  it('存完讀返一模一樣，裝備同背包都喺度', () => {
    const h = new Hero(), s = new Story(), rng = mulberry32(3);
    h.gain(500); h.gold = 321;
    const a = makeItem(rng, 5, 'rare'), b = makeItem(rng, 5, 'legend', 'bell');
    h.addItem(a); h.addItem(b); h.wear(b);
    s.stage = 3; s.pages[1] = true;
    const text = JSON.stringify(pack(h, s, world));
    const d = parse(text)!;
    const h2 = new Hero(), s2 = new Story();
    restore(d, h2, s2);
    expect(h2.level).toBe(h.level);
    expect(h2.gold).toBe(321);
    expect(h2.equip.amulet?.name).toBe(b.name);
    expect(h2.bag[0].item.affixes).toEqual(a.affixes);
    expect(s2.pages).toEqual([false, true, false]);
    expect(d.world.cleared[0]).toEqual([1, 2]);
  });

  it('壞檔唔會接受', () => {
    expect(parse('唔係 JSON')).toBeNull();
    expect(parse('{"v":999}')).toBeNull();
    expect(parse(JSON.stringify({ v: 1, hero: {}, story: {}, world: {} }))).toBeNull();
  });
});

describe('商店同重鑄', () => {
  it('售價 = 價值 × 25%', () => {
    const it = makeItem(mulberry32(2), 4, 'rare');
    expect(sellPrice(it)).toBe(Math.round(it.value * 0.25));
  });

  it('重鑄只改一條詞綴，其他不變，唔會同其他詞綴重複', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const it = makeItem(rng, 8, 'rare'), before = it.affixes.map(a => ({ ...a }));
      reforge(it, 1, rng);
      expect(it.affixes.length).toBe(before.length);
      expect(it.affixes[0]).toEqual(before[0]);
      expect(new Set(it.affixes.map(a => a.stat)).size).toBe(it.affixes.length);
    }
  });

  it('白裝同傳奇唔可以重鑄', () => {
    const rng = mulberry32(6);
    expect(reforgeCost(makeItem(rng, 5, 'white'))).toBeNull();
    expect(reforgeCost(makeItem(rng, 5, 'legend'))).toBeNull();
    expect(reforgeCost(makeItem(rng, 5, 'magic'))).toBeGreaterThan(0);
  });
});

describe('地圖', { timeout: 60000 }, () => {
  it('小鎮：三個 NPC 都行得到，大門都到', () => {
    const d = townDungeon(), g = navGrid(d), from = { x: d.down.x, z: d.down.z + 2 };
    for (const n of Object.values(NPCS)) expect(g.findPath(from, { x: n.x, z: n.z + 1.6 }).length).toBeGreaterThan(0);
  });

  it('第 1 層有遺物，第 2 層有 3 頁日記，每層有傳送石，全部行得到', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const a = generate(seed, 0), b = generate(seed, 1), g = navGrid(b), from = { x: b.up.x, z: b.up.z + 2 };
      expect(a.relic).toBeTruthy();
      expect(b.pages?.length).toBe(3);
      for (const p of b.pages!) expect(g.findPath(from, p).length).toBeGreaterThan(0);
      expect(g.findPath(from, b.waystone).length).toBeGreaterThan(0);
    }
  });
});
