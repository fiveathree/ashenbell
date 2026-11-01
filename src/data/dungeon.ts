// 地城數值（PLAN.md 第 6.9 節）
export const CELL = 2; // 每格 2m

export const GEN = {
  cols: 56,
  rows: 56,
  roomsMin: 12,
  roomsMax: 20,
  roomMin: 4,
  roomMax: 8,
  roomGap: 2,
  extraLinks: 3,
  torchEvery: 3,
  maxTorchesPerRoom: 3,
  monstersPerRoom: [2, 4] as [number, number],
  monstersMax: 45,
  propsPerRoom: [2, 5] as [number, number],
  pillarRoomSize: 6,
};

export const WALL = { height: 4.4, low: 0.7 };

export interface Theme {
  name: string;
  floorTex: string;
  wallTex: string;
  waterChance: number; // 每間房有淺水嘅機率
  floorMeters: number;
  wallMeters: number;
  runes: boolean; // 祭台房有紅色符文
  speedInWater: number;
}

export const THEMES: Theme[] = [
  { name: '地窖墓穴', floorTex: 'crypt_floor', wallTex: 'crypt_wall', waterChance: 0, floorMeters: 3.2, wallMeters: 3.5, runes: false, speedInWater: 1 },
  { name: '淹沒禮拜堂', floorTex: 'chapel_floor', wallTex: 'chapel_wall', waterChance: 0.55, floorMeters: 2.6, wallMeters: 3.2, runes: false, speedInWater: 0.6 },
  { name: '封印之井', floorTex: 'well_floor', wallTex: 'well_wall', waterChance: 0, floorMeters: 2.8, wallMeters: 3.6, runes: true, speedInWater: 1 },
];

export const BREAK = { goldMin: 1, goldMax: 6, reach: 0.95 };
export const VIEW = { flameActive: 24, revealRadius: 9 };
