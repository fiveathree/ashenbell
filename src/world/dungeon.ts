// 隨機地城生成（純邏輯）：房間 + 最小生成樹走廊 + 少量迴路。同一 seed 必定得出同一張圖。
import { CELL, GEN, THEMES } from '../data/dungeon';
import { mulberry32, randInt, type Rng } from '../core/rng';
import { navGrid } from './nav';
import { ELITE, FLOOR_TABLE, type EliteTrait, type MonsterId } from '../data/monsters';

export const T = { WALL: 0, FLOOR: 1, WATER: 2, DOWN: 3, UP: 4 } as const;
export type RoomKind = 'entry' | 'exit' | 'normal' | 'altar' | 'chest' | 'elite';

export interface Room { x: number; y: number; w: number; h: number; kind: RoomKind }
export interface Pos { x: number; z: number }
export interface TorchSpot extends Pos { dx: number; dz: number } // dx,dz = 由牆指向房內
export interface Prop extends Pos { kind: 'barrel' | 'crate' | 'bucket'; rot: number; scale: number }
export interface Pillar extends Pos { h: number }
export interface Spawn extends Pos { type: MonsterId; level: number; traits: EliteTrait[] }
export interface Stairs { c: number; r: number; x: number; z: number }

export interface Dungeon {
  seed: number; floor: number; cols: number; rows: number;
  tiles: number[]; rooms: Room[];
  down: Stairs; up: Stairs;
  torches: TorchSpot[]; props: Prop[]; pillars: Pillar[];
  spawns: Spawn[]; altars: Pos[]; chests: Pos[];
}

function pickType(rng: Rng, floor: number) {
  const entries = Object.entries(FLOOR_TABLE[floor]) as [MonsterId, number][];
  let k = rng() * entries.reduce((s, e) => s + e[1], 0);
  for (const [id, w] of entries) { k -= w; if (k <= 0) return id; }
  return entries[0][0];
}

const center = (r: Room) => ({ c: r.x + (r.w >> 1), r: r.y + (r.h >> 1) });

function placeRooms(rng: Rng) {
  const target = randInt(rng, GEN.roomsMin, GEN.roomsMax), rooms: Room[] = [];
  for (let i = 0; i < 800 && rooms.length < target; i++) {
    const w = randInt(rng, GEN.roomMin, GEN.roomMax), h = randInt(rng, GEN.roomMin, GEN.roomMax);
    const x = randInt(rng, 2, GEN.cols - w - 3), y = randInt(rng, 3, GEN.rows - h - 3);
    const g = GEN.roomGap;
    if (rooms.some(o => x < o.x + o.w + g && x + w + g > o.x && y < o.y + o.h + g && y + h + g > o.y)) continue;
    rooms.push({ x, y, w, h, kind: 'normal' });
  }
  return rooms;
}

/** Prim 最小生成樹，再加幾條短邊形成迴路 */
function links(rooms: Room[], rng: Rng) {
  const d = (a: Room, b: Room) => { const p = center(a), q = center(b); return Math.abs(p.c - q.c) + Math.abs(p.r - q.r); };
  const used = new Set([0]), edges: [number, number][] = [];
  while (used.size < rooms.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const i of used) rooms.forEach((r, j) => {
      if (!used.has(j) && d(rooms[i], r) < bd) { bd = d(rooms[i], r); best = [i, j]; }
    });
    edges.push(best!); used.add(best![1]);
  }
  const extra: [number, number, number][] = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    if (!edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) extra.push([d(rooms[i], rooms[j]), i, j]);
  }
  extra.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (let k = 0; k < GEN.extraLinks && k < extra.length; k++) {
    const pick = extra[randInt(rng, 0, Math.min(extra.length - 1, 8))];
    edges.push([pick[1], pick[2]]);
  }
  return edges;
}

function bfs(tiles: number[], cols: number, rows: number, c0: number, r0: number) {
  const dist = new Int32Array(cols * rows).fill(-1), q = [r0 * cols + c0];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % cols, r = (i - c) / cols;
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      const n = nr * cols + nc;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || dist[n] >= 0 || tiles[n] === T.WALL) continue;
      dist[n] = dist[i] + 1; q.push(n);
    }
  }
  return dist;
}

const world = (c: number, r: number): Pos => ({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL });

function findStairs(tiles: number[], room: Room, rng: Rng): Stairs | null {
  const { cols } = GEN, at = (c: number, r: number) => tiles[r * cols + c];
  const opts: number[] = [];
  for (let c = room.x + 1; c < room.x + room.w - 1; c++) {
    const r = room.y - 1;
    if (at(c, r) === T.WALL && at(c, r - 1) === T.WALL && at(c - 1, r) === T.WALL && at(c + 1, r) === T.WALL) opts.push(c);
  }
  if (!opts.length) return null;
  const c = opts[randInt(rng, 0, opts.length - 1)], r = room.y - 1;
  return { c, r, ...world(c, r) };
}

function tryGenerate(rng: Rng, seed: number, floor: number): Dungeon | null {
  const { cols, rows } = GEN, theme = THEMES[floor];
  const rooms = placeRooms(rng);
  if (rooms.length < GEN.roomsMin) return null;
  const tiles: number[] = new Array(cols * rows).fill(T.WALL);
  const set = (c: number, r: number, v: number) => { tiles[r * cols + c] = v; };
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? T.WALL : tiles[r * cols + c]);
  for (const o of rooms) for (let r = o.y; r < o.y + o.h; r++) for (let c = o.x; c < o.x + o.w; c++) set(c, r, T.FLOOR);
  for (const [i, j] of links(rooms, rng)) {
    const a = center(rooms[i]), b = center(rooms[j]);
    const horizFirst = rng() < 0.5;
    for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) set(c, horizFirst ? a.r : b.r, T.FLOOR);
    for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) set(horizFirst ? b.c : a.c, r, T.FLOOR);

  }

  // 入口揀最近左上角嘅房，出口揀步行最遠嘅房
  const entryI = rooms.reduce((b, o, i) => (o.x + o.y < rooms[b].x + rooms[b].y ? i : b), 0);
  const up = findStairs(tiles, rooms[entryI], rng);
  if (!up) return null;
  const ec = center(rooms[entryI]), dist = bfs(tiles, cols, rows, ec.c, ec.r);
  const order = rooms.map((o, i) => ({ i, d: dist[center(o).r * cols + center(o).c] })).sort((a, b) => b.d - a.d);
  if (order.some(o => o.d < 0)) return null;
  let down: Stairs | null = null, exitI = -1;
  for (const { i } of order) {
    if (i === entryI) continue;
    down = findStairs(tiles, rooms[i], rng);
    if (down) { exitI = i; break; }
  }
  if (!down) return null;
  set(up.c, up.r, T.UP); set(down.c, down.r, T.DOWN);
  rooms[entryI].kind = 'entry'; rooms[exitI].kind = 'exit';

  const free = rooms.filter(o => o.kind === 'normal');
  const kinds: RoomKind[] = ['altar', 'altar', 'chest', 'chest', 'elite', 'elite'];
  for (const k of kinds) { if (free.length) free.splice(randInt(rng, 0, free.length - 1), 1)[0].kind = k; }

  // 淺水：房內留一圈地面
  for (const o of rooms) {
    if (o.kind === 'entry' || o.kind === 'exit' || rng() >= theme.waterChance) continue;
    for (let r = o.y + 1; r < o.y + o.h - 1; r++) for (let c = o.x + 1; c < o.x + o.w - 1; c++) set(c, r, T.WATER);
  }

  const torches: TorchSpot[] = [], props: Prop[] = [], pillars: Pillar[] = [], spawns: Spawn[] = [], altars: Pos[] = [], chests: Pos[] = [];
  const taken = new Set<number>();
  const key = (c: number, r: number) => r * cols + c;

  for (const o of rooms) {
    // 火把：只掛喺鏡頭睇到嘅兩面牆（上牆同左牆）
    let n = 0;
    for (let c = o.x + 1; c < o.x + o.w - 1 && n < GEN.maxTorchesPerRoom; c += GEN.torchEvery) {
      if (at(c, o.y - 1) !== T.WALL) continue;
      const p = world(c, o.y);
      torches.push({ x: p.x, z: o.y * CELL, dx: 0, dz: 1 }); n++;
    }
    for (let r = o.y + 1; r < o.y + o.h - 1 && n < GEN.maxTorchesPerRoom; r += GEN.torchEvery) {
      if (at(o.x - 1, r) !== T.WALL) continue;
      const p = world(o.x, r);
      torches.push({ x: o.x * CELL, z: p.z, dx: 1, dz: 0 }); n++;
    }
    // 大房有斷柱
    if (o.w >= GEN.pillarRoomSize && o.h >= GEN.pillarRoomSize) {
      for (const [c, r] of [[o.x + 2, o.y + 2], [o.x + o.w - 2, o.y + 2], [o.x + 2, o.y + o.h - 2], [o.x + o.w - 2, o.y + o.h - 2]]) {
        pillars.push({ x: c * CELL, z: r * CELL, h: 1.1 + rng() * 1.2 });
        for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) taken.add(key(c + dc, r + dr));
      }
    }
    const mid = center(o);
    const doorFree = [-2, -1, 0, 1, 2].every(k => at(mid.c + k, o.y - 1) === T.WALL);
    if (o.kind === 'altar' && doorFree) { altars.push(world(mid.c, o.y)); taken.add(key(mid.c, o.y)); taken.add(key(mid.c - 1, o.y)); taken.add(key(mid.c + 1, o.y)); }
    if (o.kind === 'chest') { chests.push(world(mid.c, mid.r)); taken.add(key(mid.c, mid.r)); }
    // 道具靠牆放，唔擋門口
    const want = randInt(rng, GEN.propsPerRoom[0], GEN.propsPerRoom[1]);
    for (let k = 0, tries = 0; k < want && tries < 30; tries++) {
      const onTop = rng() < 0.5;
      const c = onTop ? randInt(rng, o.x, o.x + o.w - 1) : o.x, r = onTop ? o.y : randInt(rng, o.y, o.y + o.h - 1);
      if (taken.has(key(c, r)) || at(c, r) === T.WATER) continue;
      if (onTop ? at(c, r - 1) !== T.WALL : at(c - 1, r) !== T.WALL) continue;
      taken.add(key(c, r));
      const p = world(c, r), roll = rng();
      props.push({
        x: p.x + (rng() - 0.5) * 0.6, z: p.z + (rng() - 0.5) * 0.6,
        kind: roll < 0.5 ? 'barrel' : roll < 0.85 ? 'crate' : 'bucket', rot: rng() * Math.PI * 2, scale: 1.1 + rng() * 0.3,
      });
      k++;
    }
    // 怪物：入口房唔放；精英房第一隻係精英，帶 1–2 個特性
    if (o.kind !== 'entry') {
      let count = randInt(rng, GEN.monstersPerRoom[0], GEN.monstersPerRoom[1]) + (o.kind === 'elite' ? 3 : 0);
      let elite = o.kind === 'elite';
      for (let tries = 0; count > 0 && tries < 40 && spawns.length < GEN.monstersMax; tries++) {
        const c = randInt(rng, o.x, o.x + o.w - 1), r = randInt(rng, o.y, o.y + o.h - 1);
        if (taken.has(key(c, r))) continue;
        const p = world(c, r);
        const level = (floor + 1) * 4 + randInt(rng, -1, 1);
        const type: MonsterId = at(c, r) === T.WATER ? 'drowned' : pickType(rng, floor);
        const traits: EliteTrait[] = [];
        if (elite) {
          const pool = [...ELITE.allTraits];
          for (let n = randInt(rng, 1, 2); n > 0; n--) traits.push(pool.splice(randInt(rng, 0, pool.length - 1), 1)[0]);
          elite = false;
        }
        spawns.push({ x: p.x + (rng() - 0.5), z: p.z + (rng() - 0.5), type, level, traits });
        count--;
      }
    }
  }
  const d: Dungeon = { seed, floor, cols, rows, tiles, rooms, down, up, torches, props, pillars, spawns, altars, chests };
  // 擺完嘢之後確認每間房都行得到，唔通就成張圖重嚟
  const g = navGrid(d), from = { x: up.x, z: up.z + CELL };
  for (const o of rooms) {
    const c = center(o), to = world(c.c, c.r), path = g.findPath(from, to), last = path.at(-1);
    if (!last || Math.hypot(last.x - to.x, last.z - to.z) > 3) return null;
  }
  return g.findPath(from, { x: down.x, z: down.z + CELL }).length ? d : null;
}

export function generate(seed: number, floor: number): Dungeon {
  const rng = mulberry32((seed ^ (floor + 1) * 0x9e3779b1) >>> 0);
  for (let i = 0; i < 200; i++) {
    const d = tryGenerate(rng, seed, floor);
    if (d) return d;
  }
  throw new Error(`地城生成失敗：seed ${seed}`);
}
