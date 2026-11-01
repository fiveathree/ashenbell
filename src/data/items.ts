// 物品數值（PLAN.md 第 6.7 節）。調整平衡只改呢度。
export type Slot = 'weapon' | 'helm' | 'chest' | 'gloves' | 'boots' | 'belt' | 'ring' | 'amulet';
export type Rarity = 'white' | 'magic' | 'rare' | 'legend';
export type EquipSlot = Exclude<Slot, 'ring'> | 'ring1' | 'ring2';
export type Stat = 'str' | 'dex' | 'vit' | 'hp' | 'armor' | 'dmgPct' | 'crit' | 'critDmg' | 'atkSpeed' | 'moveSpeed'
  | 'lifeSteal' | 'rageOnHit' | 'fireDmg' | 'skillLevel';

export const EQUIP_SLOTS: EquipSlot[] = ['helm', 'amulet', 'weapon', 'chest', 'gloves', 'belt', 'ring1', 'ring2', 'boots'];
export const SLOT_NAME: Record<EquipSlot, string> = {
  weapon: '武器', helm: '頭盔', chest: '胸甲', gloves: '手套', boots: '靴', belt: '腰帶', ring1: '戒指', ring2: '戒指', amulet: '護身符',
};

export const RARITY: Record<Rarity, { name: string; color: string; chance: number; affixes: [number, number]; value: number }> = {
  white: { name: '普通', color: '#c8c8c8', chance: 0.7, affixes: [0, 0], value: 1 },
  magic: { name: '魔法', color: '#6f7bff', chance: 0.22, affixes: [1, 2], value: 3 },
  rare: { name: '稀有', color: '#e8d84a', chance: 0.07, affixes: [3, 4], value: 8 },
  legend: { name: '傳奇', color: '#d9771f', chance: 0.01, affixes: [4, 4], value: 25 },
};
export const RARITY_ORDER: Rarity[] = ['white', 'magic', 'rare', 'legend'];

export interface Base {
  id: string; name: string; slot: Slot; w: number; h: number; icon: string;
  dmg?: [number, number]; armor?: number; value: number; twoHand?: boolean;
}

// 傷害、護甲隨物品等級加成，見 ITEM.perLevel
export const BASES: Base[] = [
  { id: 'sword', name: '單手劍', slot: 'weapon', w: 1, h: 3, icon: 'sword', dmg: [9, 15], value: 20 },
  { id: 'axe', name: '戰斧', slot: 'weapon', w: 2, h: 3, icon: 'axe', dmg: [7, 19], value: 22 },
  { id: 'greatsword', name: '雙手劍', slot: 'weapon', w: 2, h: 4, icon: 'greatsword', dmg: [14, 24], value: 34, twoHand: true },
  { id: 'helm', name: '鐵盔', slot: 'helm', w: 2, h: 2, icon: 'helm', armor: 8, value: 14 },
  { id: 'cuirass', name: '胸甲', slot: 'chest', w: 2, h: 3, icon: 'chest', armor: 16, value: 26 },
  { id: 'gauntlets', name: '鐵手套', slot: 'gloves', w: 2, h: 2, icon: 'gloves', armor: 5, value: 12 },
  { id: 'boots', name: '皮靴', slot: 'boots', w: 2, h: 2, icon: 'boots', armor: 5, value: 12 },
  { id: 'belt', name: '皮帶', slot: 'belt', w: 2, h: 1, icon: 'belt', armor: 3, value: 10 },
  { id: 'ring', name: '戒指', slot: 'ring', w: 1, h: 1, icon: 'ring', value: 30 },
  { id: 'amulet', name: '護身符', slot: 'amulet', w: 1, h: 1, icon: 'amulet', value: 36 },
];

export const ITEM = { perLevel: 0.12, sellRate: 0.25 };

export interface AffixDef { stat: Stat; label: string; min: number; max: number; perLevel: number; int?: boolean; pct?: boolean }

export const AFFIXES: AffixDef[] = [
  { stat: 'str', label: '力量', min: 2, max: 5, perLevel: 0.5, int: true },
  { stat: 'dex', label: '敏捷', min: 2, max: 5, perLevel: 0.5, int: true },
  { stat: 'vit', label: '體質', min: 2, max: 5, perLevel: 0.5, int: true },
  { stat: 'hp', label: '生命', min: 8, max: 20, perLevel: 3, int: true },
  { stat: 'armor', label: '護甲', min: 4, max: 10, perLevel: 1.2, int: true },
  { stat: 'dmgPct', label: '傷害', min: 5, max: 12, perLevel: 0.6, int: true, pct: true },
  { stat: 'crit', label: '爆擊率', min: 2, max: 5, perLevel: 0.15, pct: true },
  { stat: 'critDmg', label: '爆擊傷害', min: 10, max: 25, perLevel: 0.8, int: true, pct: true },
  { stat: 'atkSpeed', label: '攻擊速度', min: 4, max: 10, perLevel: 0.25, int: true, pct: true },
  { stat: 'moveSpeed', label: '移動速度', min: 3, max: 8, perLevel: 0.15, int: true, pct: true },
  { stat: 'lifeSteal', label: '生命偷取', min: 1, max: 3, perLevel: 0.08, pct: true },
  { stat: 'rageOnHit', label: '擊中回怒氣', min: 1, max: 3, perLevel: 0.05, int: true },
  { stat: 'fireDmg', label: '火焰傷害', min: 2, max: 6, perLevel: 0.7, int: true },
  { stat: 'skillLevel', label: '全技能等級', min: 1, max: 1, perLevel: 0, int: true },
];

export type LegendId = 'bell' | 'oath' | 'lamp' | 'drowned' | 'ring';

export const LEGENDS: Record<LegendId, { name: string; base: string; effect: string; icon: string }> = {
  bell: { name: '院長的斷鐘', base: 'amulet', effect: '旋風斬每 1 秒觸發一次鐘聲震波', icon: 'leg_bell' },
  oath: { name: '灰燼之誓', base: 'greatsword', effect: '重斬留下燃燒地面 3 秒', icon: 'leg_oath' },
  lamp: { name: '守夜人的燈', base: 'belt', effect: '主角光源半徑 +50%，暗處怪物現形', icon: 'leg_lamp' },
  drowned: { name: '溺者之靴', base: 'boots', effect: '衝鋒後 2 秒內無敵', icon: 'leg_drowned' },
  ring: { name: '血鐘指環', base: 'ring', effect: '生命低於 30% 時自動施放戰吼（冷卻 60 秒）', icon: 'leg_ring' },
};

export const LEGEND_FX = {
  bell: { every: 1, mult: 0.8, radius: 4 },
  oath: { time: 3, tick: 0.5, mult: 0.35, radius: 2.4 },
  lamp: { radiusMul: 1.5, reveal: 0.22 },
  drowned: { time: 2 },
  ring: { below: 0.3, cooldown: 60 },
};

export const DROP = {
  itemChance: 0.22,   // 普通怪掉物品機率
  eliteMult: 3,
  goldChance: 0.55,
  goldPerLevel: [2, 5] as [number, number],
  potionChance: 0.1,
  potionHeal: 0.4,    // 生命藥水回最大生命 40%
  rageGain: 50,
  startPotions: 3,
};

/** 經驗（PLAN.md 第 6.2 節） */
export const LEVELING = {
  max: 15,
  curveBase: 100,
  curveExp: 1.6,
  statPoints: 5,
  skillPoints: 1,
  skillMax: 5,
  monsterXp: { ghoul: 7, skeleton: 11, archer: 10, drowned: 12, monk: 15, brute: 40 } as Record<string, number>,
  xpPerMonsterLevel: 0.5,
  eliteXp: 3,
};
