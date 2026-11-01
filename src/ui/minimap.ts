import { CELL, VIEW } from '../data/dungeon';
import { T, type Dungeon } from '../world/dungeon';

/** 小地圖同 Tab 大地圖共用：只畫行過嘅格，方向同鏡頭一樣（斜 45°） */
export class MiniMap {
  explored = new Map<number, Uint8Array>();
  private cur!: Uint8Array;
  private d!: Dungeon;
  private small: HTMLCanvasElement;
  private big: HTMLCanvasElement;
  private dirty = true;

  constructor(small: HTMLCanvasElement, big: HTMLCanvasElement) {
    this.small = small; this.big = big;
  }

  use(d: Dungeon) {
    this.d = d;
    if (!this.explored.has(d.floor)) this.explored.set(d.floor, new Uint8Array(d.cols * d.rows));
    this.cur = this.explored.get(d.floor)!;
    this.dirty = true;
  }

  /** 主角附近標記為已探索 */
  reveal(x: number, z: number) {
    const d = this.d, R = Math.ceil(VIEW.revealRadius / CELL), c0 = Math.floor(x / CELL), r0 = Math.floor(z / CELL);
    for (let r = r0 - R; r <= r0 + R; r++) for (let c = c0 - R; c <= c0 + R; c++) {
      if (c < 0 || r < 0 || c >= d.cols || r >= d.rows) continue;
      if (Math.hypot(c - c0, r - r0) > R) continue;
      const i = r * d.cols + c;
      if (!this.cur[i]) { this.cur[i] = 1; this.dirty = true; }
    }
  }

  private draw(cv: HTMLCanvasElement, px: number, pz: number, scale: number, follow: boolean) {
    const ctx = cv.getContext('2d')!, d = this.d;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI / 4);
    const ox = follow ? px / CELL : d.cols / 2, oz = follow ? pz / CELL : d.rows / 2;
    ctx.scale(scale, scale);
    ctx.translate(-ox, -oz);
    const seen = (c: number, r: number) => c >= 0 && r >= 0 && c < d.cols && r < d.rows && this.cur[r * d.cols + c] === 1;
    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
      if (!seen(c, r)) continue;
      const t = d.tiles[r * d.cols + c];
      if (t === T.WALL) continue;
      ctx.fillStyle = t === T.WATER ? 'rgba(62,92,92,.75)' : t === T.DOWN ? '#d9771f' : t === T.UP ? '#c8b89a' : 'rgba(120,100,78,.55)';
      ctx.fillRect(c, r, 1.02, 1.02);
    }
    ctx.fillStyle = 'rgba(200,184,154,.8)';
    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
      if (!seen(c, r) || d.tiles[r * d.cols + c] !== T.WALL) continue;
      const open = (dc: number, dr: number) => { const i = (r + dr) * d.cols + c + dc; return r + dr >= 0 && r + dr < d.rows && d.tiles[i] !== T.WALL; };
      if (open(1, 0)) ctx.fillRect(c + 0.9, r, 0.1, 1);
      if (open(-1, 0)) ctx.fillRect(c, r, 0.1, 1);
      if (open(0, 1)) ctx.fillRect(c, r + 0.9, 1, 0.1);
      if (open(0, -1)) ctx.fillRect(c, r, 1, 0.1);
    }
    ctx.fillStyle = '#e8d84a';
    ctx.beginPath();
    ctx.arc(px / CELL, pz / CELL, 3.4 / scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  update(px: number, pz: number, showBig: boolean) {
    this.draw(this.small, px, pz, this.small.width / 34, true);
    if (showBig) this.draw(this.big, px, pz, this.big.height / 62, false);
    this.dirty = false;
  }
}
