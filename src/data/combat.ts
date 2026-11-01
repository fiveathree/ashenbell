// 戰鬥數值（PLAN.md 第 6 節）。調整平衡只改呢度。
export const HERO = {
  level: 1,
  strength: 10,
  dexterity: 10,
  vitality: 10,
  baseHp: 100,
  hpPerVitality: 5,
  critPerDexterity: 0.002,
  critMultiplier: 1.5,
  dodgePerDexterity: 0.001,
  armor: 20,
  weapon: [9, 15] as [number, number],
  attackRange: 1.8,
  attackTime: 0.6,
  impactAt: 0.42,
  rageMax: 100,
  rageOnHit: 5,
  rageOnHurt: 3,
  rageDecay: 2,
  outOfCombat: 4, // 幾多秒冇打鬥先算脫戰
  respawnDelay: 3,
};

export const NAV = { cell: 0.5, holdRepeat: 0.2, repath: 0.3, heroRadius: 0.45 };
