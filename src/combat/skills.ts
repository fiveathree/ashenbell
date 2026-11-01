import { HERO } from '../data/combat';
import { FX, SKILLS } from '../data/skills';
import type { Player, Target } from '../entities/player';
import type { Monster } from '../entities/monster';
import type { Vfx } from '../render/vfx';
import type { Pt } from '../world/grid';

export type SkillId = 'heavy' | 'charge' | 'whirl' | 'roar';
export const SKILL_ORDER: SkillId[] = ['heavy', 'charge', 'whirl', 'roar'];

const clampAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 四個技能（PLAN.md 第 6.3 節）。冷卻、怒氣同判定全部喺呢度。 */
export class Skills {
  cooldown: Record<SkillId, number> = { heavy: 0, charge: 0, whirl: 0, roar: 0 };
  whirling = false;
  maxWhirlHits = 0; // 驗收用：旋風斬一下打中最多幾隻
  private tick = 0;
  private pending: { at: number; run: () => void }[] = [];
  private spin = 0;

  constructor(
    private p: Player, private vfx: Vfx,
    private targets: () => Monster[], private props: () => Target[],
  ) {}

  /** 而家用唔用得：俾 HUD 變暗 */
  ready(id: SkillId) {
    if (this.p.dead || this.cooldown[id] > 0) return false;
    const cost = id === 'charge' ? SKILLS.charge.cost : id === 'roar' ? SKILLS.roar.cost : id === 'whirl' ? 1 : 0;
    return this.p.rage >= cost;
  }

  press(id: SkillId, aim: Pt) {
    if (!this.ready(id) || this.p.charging) return;
    if (id === 'heavy') this.heavy(aim);
    if (id === 'charge') this.charge(aim);
    if (id === 'whirl') { this.whirling = true; this.tick = 0; this.p.spinning = true; }
    if (id === 'roar') this.roar();
  }

  release(id: SkillId) { if (id === 'whirl') this.stopWhirl(); }

  private stopWhirl() { this.whirling = false; this.p.spinning = false; }

  private inRadius(r: number) {
    return [...this.targets().filter(m => !m.dead && !m.hidden), ...this.props().filter(o => !o.dead)]
      .filter(t => Math.hypot(t.pos.x - this.p.pos.x, t.pos.z - this.p.pos.z) <= r);
  }

  private heavy(aim: Pt) {
    const s = SKILLS.heavy, p = this.p, yaw = Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z);
    p.faceAndSwing(yaw, s.castTime);
    this.cooldown.heavy = s.castTime;
    p.rage = Math.min(HERO.rageMax, p.rage + s.rage);
    this.pending.push({ at: s.hitAt, run: () => {
      const half = s.arc * Math.PI / 360;
      let n = 0;
      for (const t of this.inRadius(s.radius)) {
        const a = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
        if (Math.abs(clampAngle(a - yaw)) > half) continue;
        p.damage(t, s.mult); n++;
      }
      this.vfx.arc(p.pos.x, p.pos.z, yaw, s.radius, s.arc);
      if (n) this.vfx.bump(FX.shakeHeavy * 0.6);
    } });
  }

  private charge(aim: Pt) {
    const s = SKILLS.charge, p = this.p;
    const dx = aim.x - p.pos.x, dz = aim.z - p.pos.z, d = Math.hypot(dx, dz) || 1, reach = Math.min(d, s.range);
    // 由遠到近搵第一個視線通嘅落點
    let to: Pt | null = null;
    for (let k = reach; k > 0.5; k -= 0.5) {
      const c = { x: p.pos.x + dx / d * k, z: p.pos.z + dz / d * k };
      if (!p.grid.isBlocked(c.x, c.z) && p.grid.lineClear(p.pos, c)) { to = c; break; }
    }
    if (!to) return;
    p.rage -= s.cost;
    this.cooldown.charge = s.cooldown;
    p.startCharge(to, s.speed, () => {
      for (const t of this.inRadius(s.radius)) {
        p.damage(t, s.mult);
        (t as Monster).stun?.(s.stun);
      }
      this.vfx.ring(p.pos.x, p.pos.z, s.radius * 1.3);
      this.vfx.bump(FX.shakeHeavy);
    });
  }

  private roar() {
    const s = SKILLS.roar, p = this.p;
    p.rage -= s.cost;
    this.cooldown.roar = s.cooldown;
    p.buffTime = s.buffTime;
    p.faceAndSwing(p.facing, 0.6);
    for (const t of this.inRadius(s.radius)) (t as Monster).fear?.(s.fear);
    this.vfx.ring(p.pos.x, p.pos.z, s.radius);
    this.vfx.bump(FX.shakeHeavy);
  }

  update(dt: number) {
    for (const k of Object.keys(this.cooldown) as SkillId[]) this.cooldown[k] = Math.max(0, this.cooldown[k] - dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].at -= dt;
      if (this.pending[i].at <= 0) { this.pending[i].run(); this.pending.splice(i, 1); }
    }
    if (this.p.dead) this.stopWhirl();
    if (this.whirling) {
      const s = SKILLS.whirl;
      this.spin += dt;
      this.p.rage -= s.costPerSec * dt;
      this.p.touchCombat();
      if (this.p.rage <= 0) { this.p.rage = 0; this.stopWhirl(); return; }
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = s.tick;
        const hits = this.inRadius(s.radius);
        for (const t of hits) this.p.damage(t, s.mult, false);
        this.maxWhirlHits = Math.max(this.maxWhirlHits, hits.length);
        if (hits.length) this.vfx.bump(FX.shakeHit);
      }
    }
    this.vfx.spin(this.whirling, this.p.pos.x, this.p.pos.z, this.spin);
  }
}

