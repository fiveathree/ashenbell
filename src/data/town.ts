// 荒鐘鎮佈局。鏡頭喺 +x +z，所以高建築放北面同西面，東南面只放矮嘢，唔會遮住主角。
export interface House { x: number; z: number; w: number; d: number; h: number; door: number }

export const HOUSES: House[] = [
  { x: 14, z: 13, w: 8, d: 6, h: 3.6, door: 3 },   // 北面民居
  { x: 32, z: 13, w: 7, d: 6, h: 3.4, door: 2 },
  { x: 42, z: 13, w: 10, d: 6, h: 4, door: 4 },    // 客棧
  { x: 13, z: 36, w: 6, d: 7, h: 3.4, door: 2 },   // 西面民居
];

/** 鐵匠鋪：開放式棚，後面石爐 */
export const SMITHY = { x: 13, z: 24, w: 7, d: 8, h: 3.2 };
/** 草藥檔：矮棚，放東面都唔擋鏡頭 */
export const STALL = { x: 44, z: 28, w: 5, d: 3, h: 2.5 };
/** 水井 */
export const WELL = { x: 22, z: 30, r: 1.1 };

export const LAMPS: [number, number][] = [[27, 33], [34, 21], [47, 24], [22, 22], [33, 41], [18, 34]];

/** 擺設：真實模型；r > 0 = 行唔過 */
export const DECOR: { file: string; x: number; z: number; rot?: number; h?: number; r?: number; y?: number }[] = [
  { file: 'woodentable_01.glb', x: 40, z: 23, rot: 0.4, r: 1 },
  { file: 'woodenchair_01.glb', x: 38.8, z: 23.5, rot: 1.8 },
  { file: 'woodenchair_01.glb', x: 41.2, z: 22.2, rot: -1.2 },
  { file: 'painted_wooden_bench.glb', x: 31, z: 38, rot: 0.8, r: 1 },
  { file: 'painted_wooden_bench.glb', x: 24, z: 37, rot: -0.5, r: 1 },
  { file: 'gothic_statue.glb', x: 40, z: 40, rot: -2.3, h: 1, r: 1 },
  { file: 'dead_tree_trunk.glb', x: 52, z: 40, rot: 1, r: 1.2 },
  { file: 'dead_tree_trunk.glb', x: 15, z: 42, rot: 3, r: 1.2 },
  { file: 'wooden_barrels_01.glb', x: 50, z: 21, rot: 0.3, h: 1.1, r: 1 },
  { file: 'wine_barrel_01.glb', x: 21.5, z: 25.5, rot: 0.7, h: 1.2, r: 0.6 },
  { file: 'wooden_crate_01.glb', x: 22, z: 27.2, rot: 1.3, h: 1.3, r: 0.6 },
  { file: 'wooden_crate_01.glb', x: 43, z: 26.4, rot: 0.2, h: 1.2, r: 0.6 },
  { file: 'wooden_bucket_01.glb', x: 23.4, z: 31.2, rot: 2, h: 1.2 },
];

/** 小鎮係安全地：月光同環境光都夠，霧薄好多 */
export const TOWN_LIGHT = { hemi: 0.95, moon: 1.15, moonColor: 0x9fb4d8, fog: 0.016, hemiSky: 0x8aa0c8, hemiGround: 0x4a3c30 };
