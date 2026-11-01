// 怪物數值（PLAN.md 第 6.5 節）。調整平衡只改呢度。
// tint、scale 只係暫代：而家全部用 Soldier.glb，有正式模型後會換走。
export type MonsterId = 'ghoul' | 'skeleton' | 'archer' | 'drowned' | 'monk' | 'brute' | 'abbot';
export type AiKind = 'melee' | 'ranged' | 'caster' | 'heavy' | 'lurker';
export type EliteTrait = 'haste' | 'fire' | 'split' | 'vamp';

export interface MonsterDef {
  name: string;
  ai: AiKind;
  hp: number;
  armor: number;
  damage: [number, number];
  speed: number;
  attackRange: number;
  attackTime: number;
  impactAt: number;
  sightRange: number;
  tint: number;
  scale: number;
  clipSpeed: number;
  blood: number; // 擊中噴出嘅顏色
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  ghoul: { name: '屍鬼', ai: 'melee', hp: 26, armor: 5, damage: [3, 6], speed: 1.5, attackRange: 1.4, attackTime: 1.8, impactAt: 0.55, sightRange: 7, tint: 0x56604a, scale: 0.96, clipSpeed: 0.7, blood: 0x6e0d0b },
  skeleton: { name: '骷髏戰士', ai: 'melee', hp: 40, armor: 18, damage: [5, 9], speed: 2.1, attackRange: 1.6, attackTime: 1.4, impactAt: 0.5, sightRange: 9, tint: 0xb9ad94, scale: 1, clipSpeed: 1, blood: 0xc8b89a },
  archer: { name: '骷髏弓手', ai: 'ranged', hp: 28, armor: 10, damage: [4, 8], speed: 2.3, attackRange: 9, attackTime: 1.9, impactAt: 0.6, sightRange: 11, tint: 0x8d8574, scale: 0.94, clipSpeed: 1, blood: 0xc8b89a },
  drowned: { name: '水鬼', ai: 'lurker', hp: 44, armor: 8, damage: [5, 8], speed: 2, attackRange: 1.5, attackTime: 1.5, impactAt: 0.5, sightRange: 8, tint: 0x3f6b66, scale: 1, clipSpeed: 0.8, blood: 0x274a44 },
  monk: { name: '墮落修士', ai: 'caster', hp: 52, armor: 10, damage: [4, 7], speed: 1.8, attackRange: 8, attackTime: 3, impactAt: 0.6, sightRange: 11, tint: 0x4a1616, scale: 1, clipSpeed: 0.8, blood: 0x6e0d0b },
  abbot: { name: '墮落院長 瓦隆', ai: 'melee', hp: 720, armor: 34, damage: [9, 15], speed: 2.3, attackRange: 2.2, attackTime: 1.6, impactAt: 0.55, sightRange: 40, tint: 0x6a1a1a, scale: 1.5, clipSpeed: 0.8, blood: 0x6e0d0b },
  brute: { name: '巨屍', ai: 'heavy', hp: 170, armor: 28, damage: [18, 26], speed: 1.1, attackRange: 2.4, attackTime: 2.6, impactAt: 0.7, sightRange: 8, tint: 0x4d5a46, scale: 1.42, clipSpeed: 0.55, blood: 0x6e0d0b },
};

export const AI = {
  repath: 0.5,
  stagger: 0.25,
  separation: 0.9,
  corpseTime: 10,
  fadeTime: 2,
  levelHp: 0.28,
  levelDamage: 0.16,
  flee: { below: 0.25, chance: 0.3, time: 2.5 },
  archer: { keepAway: 4, ideal: 7, arrowSpeed: 11, cornered: 1.2 },
  caster: { summonEvery: 7, summons: 2, healAmount: 30, healRange: 8, keepAway: 5, maxMonsters: 40 },
  heavy: { windup: 1, radius: 2.6 },
  lurker: { emerge: 5, riseTime: 1, slow: 2 },
  active: 26,
};

/** 每層出邊啲怪、比重幾多 */
export const FLOOR_TABLE: Partial<Record<MonsterId, number>>[] = [
  { ghoul: 5, skeleton: 3, archer: 2 },
  { ghoul: 4, skeleton: 3, archer: 2, monk: 1.2 },
  { ghoul: 3, skeleton: 3, archer: 2, monk: 1.2, brute: 0.9 },
];

export const ELITE = {
  hpMult: 2.4,
  damageMult: 1.35,
  scaleMult: 1.1,
  traits: {
    haste: { name: '迅捷', speed: 1.5, attack: 0.7 },
    fire: { name: '火焰強化', damage: 1.5 },
    split: { name: '分裂', spawns: 2 },
    vamp: { name: '吸血', heal: 3 },
  } as Record<EliteTrait, { name: string; speed?: number; attack?: number; damage?: number; spawns?: number; heal?: number }>,
  allTraits: ['haste', 'fire', 'split', 'vamp'] as EliteTrait[],
};
