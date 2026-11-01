import { Camera, Vector3 } from 'three';
import { FX } from '../data/skills';

interface Float { el: HTMLDivElement; pos: Vector3; life: number; dx: number }

const v = new Vector3();

/** 傷害浮字：普通白、爆擊大黃、主角受傷紅 */
export class Floats {
  private root: HTMLDivElement;
  private live: Float[] = [];
  private spare: HTMLDivElement[] = [];

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'floats';
    document.getElementById('hud')!.prepend(this.root);
  }

  add(x: number, y: number, z: number, text: string, cls: 'hit' | 'crit' | 'hurt' | 'gold') {
    if (this.live.length >= FX.floatMax) { const o = this.live.shift()!; o.el.remove(); this.spare.push(o.el); }
    const el = this.spare.pop() ?? document.createElement('div');
    el.className = `fl ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    this.live.push({ el, pos: new Vector3(x, y, z), life: FX.floatLife, dx: (Math.random() - 0.5) * 30 });
  }

  update(dt: number, camera: Camera) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.life -= dt;
      if (f.life <= 0) { f.el.remove(); this.spare.push(f.el); this.live.splice(i, 1); continue; }
      v.copy(f.pos).project(camera);
      const k = 1 - f.life / FX.floatLife;
      const x = (v.x + 1) / 2 * innerWidth + f.dx * k, y = (1 - v.y) / 2 * innerHeight - k * 60;
      f.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      f.el.style.opacity = String(Math.min(1, f.life * 3));
    }
  }
}
