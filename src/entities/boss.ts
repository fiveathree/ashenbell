import { Color, type Scene } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BOSS } from '../data/boss';
import { Monster, type MonsterEvents } from './monster';
import { sound } from '../audio/sound';
import type { Player } from './player';
import type { Grid } from '../world/grid';
import type { Vfx } from '../render/vfx';

/** 第幾階段：100–70%、70–35%、35–0%（PLAN.md 第 6.6 節） */
export const bossPhase = (hpPct: number) => (hpPct > BOSS.phase2 ? 1 : hpPct > BOSS.phase3 ? 2 : 3);

export interface BossEvents {
  line(text: string): void;
}

/** 墮落院長：沿用普通怪嘅追擊同揮杖，再加三階段招式 */
export class Boss extends Monster {
  phase = 1;
  private summonIn: number = BOSS.summonEvery * 0.4;
  private runeIn: number = BOSS.runeEvery * 0.5;
  private chargeIn: number = BOSS.chargeEvery;
  private bellIn: number = BOSS.bellEvery * 0.5;
  private runes: { x: number; z: number; left: number }[] = [];
  private dash: { dx: number; dz: number; left: number; hit: boolean } | null = null;
  private wave: { r: number; hit: boolean } | null = null;
  private dmg = 0;

  constructor(
    scene: Scene, src: GLTF, grid: Grid, x: number, z: number, level: number, shadows: boolean, ev: MonsterEvents,
    private fx: Vfx, private bev: BossEvents,
  ) {
    super(scene, src, grid, 'abbot', x, z, level, [], shadows, ev);
    this.state = 'chase';
    this.dmg = this.def.damage[1] * (1 + 0.2 * (level - 1));
  }

  start() { this.bev.line(BOSS.lines.open); }

  override takeHit(amount: number, crit: boolean) {
    super.takeHit(amount, crit);
    if (this.dead) { this.bev.line(BOSS.lines.death); return; }
    const p = bossPhase(this.hp / this.maxHp);
    if (p > this.phase) this.enterPhase(p);
  }

  /** 巨型 Boss 唔會俾暈或者恐懼 */
  override stun() {}
  override fear() {}

  private enterPhase(p: number) {
    this.phase = p;
    this.state = 'stagger'; this.timer = BOSS.phaseStagger;
    this.fx.ring(this.pos.x, this.pos.z, 7, 0x8a1010);
    sound.play('roar');
    this.fx.bump(0.25);
    if (p === 2) this.bev.line(BOSS.lines.phase2);
    if (p === 3) {
      this.bev.line(BOSS.lines.phase3);
      this.model.scale.multiplyScalar(BOSS.phase3Scale);
      const tint = new Color(BOSS.phase3Tint);
      for (const m of this.mats) m.color.copy(tint);
    }
  }

  private castRunes(player: Player) {
    const n = BOSS.runeCount;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random(), r = i === 0 ? 0 : 2.6;
      const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
      this.runes.push({ x, z, left: BOSS.runeDelay });
      this.fx.telegraph(x, z, BOSS.runeRadius, BOSS.runeDelay);
    }
  }

  private special(dt: number, player: Player, others: Monster[]) {
    if (this.phase === 1) {
      this.summonIn -= dt;
      if (this.summonIn <= 0) { this.summonIn = BOSS.summonEvery; this.ev.summon(this, BOSS.summons); }
    }
    if (this.phase >= 2) {
      this.runeIn -= dt;
      if (this.runeIn <= 0) { this.runeIn = BOSS.runeEvery; this.castRunes(player); }
      this.chargeIn -= dt;
      if (this.chargeIn <= 0 && !this.dash && this.state === 'chase') {
        this.chargeIn = BOSS.chargeEvery;
        const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
        this.dash = { dx: dx / d, dz: dz / d, left: Math.min(BOSS.chargeTime, d / BOSS.chargeSpeed + 0.1), hit: false };
        this.yaw = Math.atan2(dx, dz);
      }
    }
    if (this.phase === 3 && !this.wave) {
      this.bellIn -= dt;
      if (this.bellIn <= 0) {
        this.bellIn = BOSS.bellEvery;
        this.wave = { r: 0, hit: false };
        sound.play('bell');
        this.fx.ring(this.pos.x, this.pos.z, BOSS.bellRange, 0xc8b89a, BOSS.bellRange / BOSS.bellSpeed);
        this.fx.bump(0.2);
      }
    }
    void others;
  }

  private tickAttacks(dt: number, player: Player) {
    for (let i = this.runes.length - 1; i >= 0; i--) {
      const r = this.runes[i];
      r.left -= dt;
      if (r.left > 0) continue;
      this.fx.ring(r.x, r.z, BOSS.runeRadius * 1.3, 0xd9771f);
      sound.play('rune');
      this.fx.bump(0.14);
      if (Math.hypot(player.pos.x - r.x, player.pos.z - r.z) < BOSS.runeRadius) player.hurt(this.dmg * BOSS.runeMult);
      this.runes.splice(i, 1);
    }
    if (this.wave) {
      const w = this.wave, d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      const before = w.r;
      w.r += BOSS.bellSpeed * dt;
      // 波掃過主角嗰刻：視線被柱擋住，或者衝鋒緊就閃到
      if (!w.hit && before <= d && w.r > d) {
        w.hit = true;
        if (!player.charging && this.grid.lineClear(this.pos, player.pos)) player.hurt(this.dmg * BOSS.bellMult);
      }
      if (w.r > BOSS.bellRange) this.wave = null;
    }
  }

  override update(dt: number, player: Player, others: Monster[]) {
    if (!this.dead) {
      this.special(dt, player, others);
      this.tickAttacks(dt, player);
      if (this.dash) {
        const s = BOSS.chargeSpeed * dt, nx = this.pos.x + this.dash.dx * s, nz = this.pos.z + this.dash.dz * s;
        this.dash.left -= dt;
        if (!this.grid.isBlocked(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else this.dash.left = 0;
        if (!this.dash.hit && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.7) {
          this.dash.hit = true; player.hurt(this.dmg * BOSS.chargeMult); this.fx.bump(0.2);
        }
        if (this.dash.left <= 0) this.dash = null;
      }
    }
    super.update(dt, player, others);
  }
}
