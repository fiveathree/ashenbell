import { NAV } from '../data/combat';
import { CELL } from '../data/dungeon';
import { Grid, type Circle } from './grid';
import { T, type Dungeon } from './dungeon';

export const PROP_RADIUS = 0.55;
export const PILLAR_RADIUS = 0.8;
export const CHEST_RADIUS = 0.9;

/** 由地城資料起尋路格：牆按主角半徑膨脹，再蓋上柱、道具 */
export function navGrid(d: Dungeon) {
  const g = new Grid({ minX: 0, maxX: d.cols * CELL, minZ: 0, maxZ: d.rows * CELL }, NAV.cell);
  const walk = (x: number, z: number) => {
    const c = Math.floor(x / CELL), r = Math.floor(z / CELL);
    if (c < 0 || r < 0 || c >= d.cols || r >= d.rows) return false;
    const t = d.tiles[r * d.cols + c];
    return t === T.FLOOR || t === T.WATER;
  };
  g.stampWalls(walk, NAV.heroRadius);
  const solids: Circle[] = [
    ...d.pillars.map(p => ({ x: p.x, z: p.z, r: PILLAR_RADIUS })),
    ...d.chests.map(p => ({ x: p.x, z: p.z, r: CHEST_RADIUS })),
    ...d.altars.map(p => ({ x: p.x, z: p.z - 0.5, r: 1.4 })),
  ];
  for (const s of solids) g.stampCircle(s, NAV.heroRadius);
  g.freeze();
  for (const p of d.props) g.stampCircle({ x: p.x, z: p.z, r: PROP_RADIUS }, NAV.heroRadius);
  return g;
}
