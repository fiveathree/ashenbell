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

export const GHOUL = {
  name: '屍鬼',
  level: 2,
  hp: 26,
  armor: 5,
  damage: [3, 6] as [number, number],
  speed: 1.5,
  attackRange: 1.4,
  attackTime: 1.8,
  impactAt: 0.55,
  sightRange: 7,
  staggerTime: 0.25,
  repath: 0.5,
  radius: 0.45,
  corpseTime: 10,
  fadeTime: 2,
  tint: 0x56604a,
  scale: 0.96,
};

export const NAV = { cell: 0.5, holdRepeat: 0.2, repath: 0.3, heroRadius: 0.45 };
