// 傷害公式（PLAN.md 第 6.4 節）
export interface Hit {
  weapon: [number, number];
  skillMult?: number;
  strength: number;
  bonusPct?: number;
  critChance: number;
  critMult: number;
  targetArmor: number;
  attackerLevel: number;
}

export const mitigation = (armor: number, attackerLevel: number) => armor / (armor + 50 * attackerLevel);

export function rollDamage(h: Hit, rng: () => number = Math.random) {
  const [min, max] = h.weapon;
  const base = (min + rng() * (max - min)) * (h.skillMult ?? 1);
  const crit = rng() < h.critChance;
  const amount = base * (1 + h.strength / 100) * (1 + (h.bonusPct ?? 0) / 100)
    * (crit ? h.critMult : 1) * (1 - mitigation(h.targetArmor, h.attackerLevel));
  return { amount: Math.max(1, Math.round(amount)), crit };
}
