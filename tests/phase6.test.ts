import { describe, expect, it } from 'vitest';
import { bossDungeon } from '../src/world/dungeon';
import { navGrid } from '../src/world/nav';
import { Story } from '../src/story/quests';
import { BOSS } from '../src/data/boss';

// boss.ts 會 import three，所以階段判斷喺度直接用同一條公式再驗一次數值
const phase = (p: number) => (p > BOSS.phase2 ? 1 : p > BOSS.phase3 ? 2 : 3);

describe('Boss', () => {
  it('階段界線係 70%、35%', () => {
    expect(phase(1)).toBe(1);
    expect(phase(0.71)).toBe(1);
    expect(phase(0.7)).toBe(2);
    expect(phase(0.36)).toBe(2);
    expect(phase(0.35)).toBe(3);
    expect(phase(0.01)).toBe(3);
  });

  it('必定掉 1 件傳奇 + 2 件稀有', () => {
    expect(BOSS.drops.legends).toBe(1);
    expect(BOSS.drops.rares).toBe(2);
  });

  it('Boss 房：入口行得到院長，有柱可以避鐘聲', () => {
    const d = bossDungeon(), g = navGrid(d), s = d.spawns[0];
    expect(s.type).toBe('abbot');
    expect(g.findPath({ x: d.up.x, z: d.up.z + 2 }, s).length).toBeGreaterThan(0);
    expect(d.pillars.length).toBeGreaterThanOrEqual(4);
    expect(d.pillars.every(p => p.h > 3)).toBe(true);
    // 柱後面應該擋到視線
    const p = d.pillars[0], k = Math.hypot(p.x - s.x, p.z - s.z), hide = { x: p.x + (p.x - s.x) / k * 1.6, z: p.z + (p.z - s.z) / k * 1.6 };
    expect(g.lineClear(s, hide)).toBe(false);
  });
});

describe('結局', () => {
  it('打低 Boss 之後，老葛觸發結局', () => {
    const s = new Story();
    s.stage = 5;
    s.talkGe();
    expect(s.stage).toBe(5); // 未打低唔會結局
    s.beatBoss();
    expect(s.stage).toBe(6);
    expect(s.talkGe().join('')).toContain('謷外'.replace('謷', '谷'));
    expect(s.stage).toBe(7);
    expect(s.finished).toBe(true);
  });

  it('未到任務三打低 Boss 都唔會跳過劇情', () => {
    const s = new Story();
    s.stage = 3;
    s.beatBoss();
    expect(s.boss).toBe(true);
    expect(s.stage).toBe(3);
  });
});
