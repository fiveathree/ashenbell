// 技能數值（PLAN.md 第 6.3 節）。每級加成留待 Phase 4 加點。
export const SKILLS = {
  heavy: { key: '1', glyph: '斬', name: '重斬', mult: 1.5, perLevel: 0.2, arc: 120, radius: 3.1, rage: 8, castTime: 0.5, hitAt: 0.2 },
  charge: { key: '2', glyph: '衝', name: '衝鋒', mult: 1.2, perLevel: 0.15, cost: 20, cooldown: 6, range: 9, speed: 17, radius: 2.3, stun: 1 },
  whirl: { key: '3', glyph: '旋', name: '旋風斬', mult: 0.6, perLevel: 0.08, costPerSec: 15, tick: 0.3, radius: 2.8, moveMul: 0.75 },
  roar: { key: '4', glyph: '吼', name: '戰吼', bonusPct: 25, perLevel: 5, buffTime: 8, cost: 30, cooldown: 20, radius: 7.5, fear: 2 },
};

export const FX = {
  shakeHit: 0.05,
  shakeCrit: 0.12,
  shakeHurt: 0.1,
  shakeHeavy: 0.16,
  shakeDecay: 7,
  floatLife: 0.85,
  floatMax: 40,
  bloodDecals: 36,
};
