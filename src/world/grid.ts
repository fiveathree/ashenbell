// 格仔地圖同 A* 尋路（純邏輯，唔掂 three.js，方便用 Vitest 測試）
export interface Pt { x: number; z: number }
export interface Circle extends Pt { r: number }
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

const SQRT2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly blocked: Uint8Array;

  constructor(readonly bounds: Rect, readonly cell: number) {
    this.w = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.h = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
  }

  cx(x: number) { return Math.floor((x - this.bounds.minX) / this.cell); }
  cz(z: number) { return Math.floor((z - this.bounds.minZ) / this.cell); }
  private wx(c: number) { return this.bounds.minX + (c + 0.5) * this.cell; }
  private wz(c: number) { return this.bounds.minZ + (c + 0.5) * this.cell; }

  cellBlocked(c: number, r: number) {
    return c < 0 || r < 0 || c >= this.w || r >= this.h || this.blocked[r * this.w + c] === 1;
  }
  isBlocked(x: number, z: number) { return this.cellBlocked(this.cx(x), this.cz(z)); }

  /** 將圓形同長方形障礙寫入格仔；pad = 角色半徑 */
  stamp(circles: Circle[], rects: Rect[], pad: number) {
    for (let r = 0; r < this.h; r++) for (let c = 0; c < this.w; c++) {
      const x = this.wx(c), z = this.wz(r);
      const hit = circles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + pad)
        || rects.some(o => x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad);
      if (hit) this.blocked[r * this.w + c] = 1;
    }
  }

  /** 最近一個可行走嘅點；撳中障礙物時用嚟搵目的地 */
  nearestFree(x: number, z: number): Pt | null {
    const c0 = this.cx(x), r0 = this.cz(z);
    if (!this.cellBlocked(c0, r0)) return { x, z };
    for (let d = 1; d < Math.max(this.w, this.h); d++) {
      let best: Pt | null = null, bestD = Infinity;
      for (let r = r0 - d; r <= r0 + d; r++) for (let c = c0 - d; c <= c0 + d; c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== d || this.cellBlocked(c, r)) continue;
        const px = this.wx(c), pz = this.wz(r), k = Math.hypot(px - x, pz - z);
        if (k < bestD) { bestD = k; best = { x: px, z: pz }; }
      }
      if (best) return best;
    }
    return null;
  }

  /** 兩點之間有冇障礙（視線同路徑拉直共用） */
  lineClear(a: Pt, b: Pt) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / (this.cell * 0.4));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      if (this.isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** A*：回傳由起點（不含）到終點嘅路徑，已拉直；去唔到回傳 [] */
  findPath(from: Pt, to: Pt): Pt[] {
    const goal = this.nearestFree(to.x, to.z), start = this.nearestFree(from.x, from.z);
    if (!goal || !start) return [];
    if (this.lineClear(start, goal)) return [goal];
    const idx = (c: number, r: number) => r * this.w + c;
    const sc = this.cx(start.x), sr = this.cz(start.z), gc = this.cx(goal.x), gr = this.cz(goal.z);
    const n = this.w * this.h, g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heur = (c: number, r: number) => {
      const dx = Math.abs(c - gc), dz = Math.abs(r - gr);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    // 二元堆
    const heap: [number, number][] = [];
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      for (let k = heap.length - 1; k > 0;) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]]; k = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top[1];
    };
    g[idx(sc, sr)] = 0;
    push(heur(sc, sr), idx(sc, sr));
    const gi = idx(gc, gr);
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === gi) break;
      const c = cur % this.w, r = (cur - c) / this.w;
      for (const [dc, dr, cost] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (this.cellBlocked(nc, nr)) continue;
        if (dc && dr && (this.cellBlocked(c + dc, r) || this.cellBlocked(c, r + dr))) continue; // 唔准切角
        const ni = idx(nc, nr), ng = g[cur] + cost;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ng + heur(nc, nr), ni); }
      }
    }
    if (came[gi] < 0) return [];
    const raw: Pt[] = [goal];
    for (let i = came[gi]; i >= 0 && i !== idx(sc, sr); i = came[i]) {
      const c = i % this.w;
      raw.unshift({ x: this.wx(c), z: this.wz((i - c) / this.w) });
    }
    // 拉直：跳過視線通嘅中途點
    const out: Pt[] = [];
    let anchor = start, i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !this.lineClear(anchor, raw[j])) j--;
      out.push(raw[j]); anchor = raw[j]; i = j + 1;
    }
    return out;
  }
}
