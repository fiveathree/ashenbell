import { AnimationAction, AnimationClip, AnimationMixer, Group, LoopOnce, Mesh, PointLight, Scene } from 'three';
import { loadModel } from './models';
import { LIGHT, PLAYER } from '../data/art';
import { LEGEND_FX } from '../data/items';
import type { Hero, Stats } from '../items/hero';
import { HERO, NAV } from '../data/combat';
import { rollDamage } from '../combat/damage';
import { SKILLS } from '../data/skills';
import { sound } from '../audio/sound';
import type { Grid, Pt } from '../world/grid';

/** 主角攻擊得到嘅嘢：怪物或者可打破道具 */
export interface Target {
  name: string;
  pos: { x: number; z: number; distanceTo(v: unknown): number };
  armor: number;
  dead: boolean;
  takeHit(amount: number, crit: boolean): void;
}

type Clip = 'Idle' | 'Walk' | 'Run' | 'Attack1' | 'Attack2' | 'Dash' | 'Death';
const ONCE: Clip[] = ['Attack1', 'Attack2', 'Dash', 'Death'];

export class Player {
  model!: Group;
  light: PointLight;
  s: Stats;
  hp: number;
  invuln = 0;
  /** 打中目標時：傷害數字等由外面處理 */
  onDodge: (() => void) | null = null;
  rage = 0;
  dead = false;
  deadFor = 0;
  attackTarget: Target | null = null;
  speedMul = 1;
  alwaysRun = false;
  spinning = false;
  charging = false;
  buffTime = 0;
  private slowTime = 0;
  onHurt: ((amount: number) => void) | null = null;
  private chargeTo: Pt | null = null;
  private chargeSpeed = 0;
  private chargeDone: (() => void) | null = null;
  private recover = 0;

  arrived: (() => void) | null = null;
  private path: Pt[] = [];
  private mixer!: AnimationMixer;
  private actions = {} as Record<Clip, AnimationAction>;
  private current: Clip = 'Idle';
  private yaw = 0;
  private swingClip: Clip = 'Attack1';
  private swing = -1; // -1 = 冇揮緊
  private struck = false;
  private repath = 0;
  private sinceCombat = 99;

  constructor(private scene: Scene, public grid: Grid, q: { shadows: boolean; shadowMap: number }, public hero: Hero) {
    this.s = hero.stats;
    this.hp = this.s.maxHp;
    this.light = new PointLight(LIGHT.heroColor, LIGHT.heroIntensity, LIGHT.heroDistance, 1.8);
    this.light.castShadow = q.shadows;
    this.light.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    this.light.shadow.camera.near = 0.2;
    this.light.shadow.camera.far = LIGHT.heroDistance + 2;
    this.light.shadow.bias = -0.002;
    this.light.shadow.normalBias = 0.03;
    this.light.shadow.radius = 3;
    scene.add(this.light);
  }

  async load() {
    const gltf = await loadModel('hero');
    this.model = gltf.scene;
    this.model.rotation.order = 'YXZ';
    this.model.traverse(o => {
      const m = o as Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    this.scene.add(this.model);
    this.mixer = new AnimationMixer(this.model);
    for (const name of ['Idle', 'Walk', 'Run', ...ONCE] as Clip[]) {
      const a = this.actions[name] = this.mixer.clipAction(AnimationClip.findByName(gltf.animations, name)!);
      if (ONCE.includes(name)) { a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; }
      else a.play();
      a.weight = name === 'Idle' ? 1 : 0;
    }
    this.place(0, 1);
  }

  get pos() { return this.model.position; }
  get maxHp() { return this.s.maxHp; }
  get armor() { return this.s.armor; }

  /** 換裝、加點之後重新計屬性 */
  refresh() {
    const old = this.s.maxHp;
    this.s = this.hero.stats;
    if (this.s.maxHp > old) this.hp += this.s.maxHp - old;
    this.hp = Math.min(this.hp, this.s.maxHp);
    this.light.distance = LIGHT.heroDistance * (this.hero.has('lamp') ? LEGEND_FX.lamp.radiusMul : 1);
  }

  place(x: number, z: number) {
    this.model.position.set(x, 0, z);
    this.path = [];
    this.syncLight();
  }

  moveTo(p: Pt) {
    if (this.dead) return;
    this.attackTarget = null;
    this.path = this.grid.findPath(this.pos, p);
  }

  attack(g: Target) {
    if (this.dead) return;
    this.attackTarget = g;
    this.repath = 0;
  }

  get facing() { return this.yaw; }
  get swinging() { return this.swing >= 0; }
  slow(s: number) { this.slowTime = Math.max(this.slowTime, s); }
  touchCombat() { this.sinceCombat = 0; }

  /** 技能揮一下：唔做普攻判定，傷害由技能自己計 */
  faceAndSwing(yaw: number, time: number) {
    this.yaw = yaw; this.swing = 0; this.struck = true; this.recover = time;
    this.nextSwing();
    this.attackTarget = null; this.path = [];
  }

  startCharge(to: Pt, speed: number, done: () => void) {
    this.charging = true; this.chargeTo = to; this.chargeSpeed = speed; this.chargeDone = done;
    this.path = []; this.attackTarget = null; this.swing = -1;
    this.yaw = Math.atan2(to.x - this.pos.x, to.z - this.pos.z);
  }

  /** 計傷害（普攻、技能共用公式）；gainRage = 呢下有冇加怒氣 */
  damage(t: Target, mult: number, gainRage = false) {
    const s = this.s, w = s.weapon;
    const buff = this.buffTime > 0 ? SKILLS.roar.bonusPct + SKILLS.roar.perLevel * (this.hero.skillLevel('roar') - 1) : 0;
    const { amount, crit } = rollDamage({
      weapon: [w[0] + s.fireDmg, w[1] + s.fireDmg], skillMult: mult, strength: s.str,
      bonusPct: s.dmgPct + buff, critChance: s.crit, critMult: s.critMult,
      targetArmor: t.armor, attackerLevel: this.hero.level,
    });
    t.takeHit(amount, crit);
    if (s.lifeSteal) this.hp = Math.min(s.maxHp, this.hp + amount * s.lifeSteal);
    if (gainRage) this.rage = Math.min(HERO.rageMax, this.rage + s.rageOnHit);
    this.sinceCombat = 0;
  }

  hurt(amount: number) {
    if (this.dead || this.invuln > 0) return;
    if (Math.random() < this.s.dex * HERO.dodgePerDexterity) { this.onDodge?.(); return; }
    this.onHurt?.(amount);
    this.hp = Math.max(0, this.hp - amount);
    this.rage = Math.min(HERO.rageMax, this.rage + HERO.rageOnHurt);
    this.sinceCombat = 0;
    if (this.hp === 0) {
      this.dead = true; this.deadFor = 0; this.path = []; this.attackTarget = null; this.swing = -1;
      this.charging = false; this.spinning = false;
    }
  }

  respawn(x: number, z: number) {
    this.dead = false;
    this.hp = this.s.maxHp;
    this.rage = 0;
    this.setClip('Idle');
    this.place(x, z);
  }

  /** 兩招輪住用，唔會次次一樣 */
  private nextSwing() { this.swingClip = this.swingClip === 'Attack1' ? 'Attack2' : 'Attack1'; }

  /** time = 一次過嘅動作要幾耐做完 */
  private setClip(next: Clip, time = 0) {
    if (next === this.current) return;
    const from = this.actions[this.current], to = this.actions[next];
    if (ONCE.includes(next)) to.reset().play();
    to.enabled = true;
    to.setEffectiveTimeScale(time ? to.getClip().duration / time : 1);
    to.setEffectiveWeight(1);
    from.crossFadeTo(to, ONCE.includes(next) ? 0.08 : PLAYER.fade, false);
    this.current = next;
  }

  private syncLight() {
    const p = this.model.position;
    this.light.position.set(p.x, LIGHT.heroHeight, p.z);
  }

  private walk(dt: number): Clip {
    const next = this.path[0];
    if (!next) return 'Idle';
    const pos = this.pos;
    const dx = next.x - pos.x, dz = next.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { this.path.shift(); if (!this.path.length) this.arrived?.(); return this.walk(dt); }
    const left = d + this.path.slice(1).reduce((s, p, i) => {
      const a = this.path[i]; return s + Math.hypot(p.x - a.x, p.z - a.z);
    }, 0);
    const run = this.alwaysRun || left > PLAYER.runDistance || (this.current === 'Run' && left > 0.8);
    const mul = this.speedMul * (this.slowTime > 0 ? 0.6 : 1) * (this.spinning ? SKILLS.whirl.moveMul : 1) * (1 + this.s.moveSpeed / 100);
    const step = Math.min((run ? PLAYER.runSpeed : PLAYER.walkSpeed) * mul * dt, d);
    pos.x += dx / d * step; pos.z += dz / d * step;
    this.yaw = Math.atan2(dx, dz);
    return run ? 'Run' : 'Walk';
  }

  private fight(dt: number): Clip {
    const g = this.attackTarget;
    if (this.swing >= 0) {
      this.swing += dt / (this.recover || HERO.attackTime / (1 + this.s.atkSpeed / 100));
      if (g) this.yaw = Math.atan2(g.pos.x - this.pos.x, g.pos.z - this.pos.z);
      if (!this.struck && this.swing >= HERO.impactAt) {
        this.struck = true;
        if (g && !g.dead && g.pos.distanceTo(this.pos) < HERO.attackRange + 0.5) this.strike(g);
      }
      if (this.swing >= 1) { this.swing = -1; this.recover = 0; return 'Idle'; }
      return this.swingClip;
    }
    if (g && g.dead) this.attackTarget = null;
    else if (g) {
      if (g.pos.distanceTo(this.pos) <= HERO.attackRange) {
        this.path = [];
        this.swing = 0; this.struck = false;
        this.nextSwing();
        sound.play('swing');
        return this.swingClip;
      }
      this.repath -= dt;
      if (this.repath <= 0) { this.repath = NAV.repath; this.path = this.grid.findPath(this.pos, g.pos); }
    }
    return this.walk(dt);
  }

  private strike(g: Target) { this.damage(g, 1, true); }

  private rush(dt: number): Clip {
    const to = this.chargeTo!, dx = to.x - this.pos.x, dz = to.z - this.pos.z, d = Math.hypot(dx, dz);
    const step = this.chargeSpeed * dt;
    if (d <= step) {
      this.pos.x = to.x; this.pos.z = to.z;
      this.charging = false; this.chargeTo = null;
      const done = this.chargeDone; this.chargeDone = null; done?.();
      return 'Idle';
    }
    this.pos.x += dx / d * step; this.pos.z += dz / d * step;
    return 'Dash';
  }

  update(dt: number) {
    if (!this.model) return;
    this.sinceCombat += dt;
    if (this.sinceCombat > HERO.outOfCombat) this.rage = Math.max(0, this.rage - HERO.rageDecay * dt);
    if (this.dead) {
      this.deadFor += dt;
      this.setClip('Death');
      this.mixer.update(dt);
      this.syncLight();
      return;
    }
    this.buffTime = Math.max(0, this.buffTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const clip = this.charging ? this.rush(dt) : this.spinning ? this.walk(dt) : this.fight(dt);
    if (this.spinning) this.model.rotation.y += 16 * dt;
    else {
      const want = this.yaw;
      const diff = Math.atan2(Math.sin(want - this.model.rotation.y), Math.cos(want - this.model.rotation.y));
      this.model.rotation.y += diff * Math.min(1, PLAYER.turnLerp * dt);
    }
    this.setClip(clip, this.swing >= 0 ? this.recover || HERO.attackTime / (1 + this.s.atkSpeed / 100) : clip === 'Dash' ? 0.5 : 0);
    this.mixer.update(dt);
    this.syncLight();
  }
}

