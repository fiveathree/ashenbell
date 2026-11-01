import { AnimationAction, AnimationClip, AnimationMixer, Color, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { HERO } from '../data/combat';
import { AI, ELITE, MONSTERS, type EliteTrait, type MonsterDef, type MonsterId } from '../data/monsters';
import { rollDamage } from '../combat/damage';
import type { Grid, Pt } from '../world/grid';
import type { Player } from './player';
import { applySwing, fallAngle, findBones, type SwingBones } from './pose';

type State = 'idle' | 'chase' | 'attack' | 'stagger' | 'stun' | 'fear' | 'windup' | 'lurk' | 'rise' | 'dead';

const WHITE = new Color(0xffffff);

/** 怪物要通知外面嘅嘢：特效、飛箭、召喚 */
export interface MonsterEvents {
  hit(m: Monster, amount: number, crit: boolean): void;
  died(m: Monster): void;
  arrow(m: Monster, damage: number, spell: boolean): void;
  summon(m: Monster, count: number): void;
  telegraph(x: number, z: number, radius: number, time: number): void;
  heavyHit(x: number, z: number): void;
  heal(m: Monster): void;
}

export class Monster {
  model: Group;
  def: MonsterDef;
  name: string;
  armor: number;
  maxHp: number;
  hp: number;
  state: State = 'idle';
  gone = false; // 屍體淡出完
  counted = false; // 已計入擊殺數
  traits: EliteTrait[];

  private dmgMult: number;
  private speed: number;
  private attackTime: number;
  private mixer: AnimationMixer;
  private idle: AnimationAction;
  private walk: AnimationAction;
  private mats: MeshStandardMaterial[] = [];
  private bones: SwingBones;
  private path: Pt[] = [];
  private timer = 0;
  private repath = 0;
  private struck = false;
  private flash = 0;
  private deadFor = 0;
  private yaw = Math.random() * Math.PI * 2;
  private walking = false;
  private summonIn = AI.caster.summonEvery * 0.5;
  private fled = false;

  constructor(
    private scene: Scene, src: GLTF, private grid: Grid, public id: MonsterId, x: number, z: number,
    level: number, traits: EliteTrait[], shadows: boolean, private ev: MonsterEvents,
  ) {
    const def = this.def = MONSTERS[id];
    this.traits = traits;
    const elite = traits.length > 0;
    this.armor = def.armor;
    this.maxHp = this.hp = Math.round(def.hp * (1 + AI.levelHp * (level - 1)) * (elite ? ELITE.hpMult : 1));
    this.dmgMult = (1 + AI.levelDamage * (level - 1)) * (elite ? ELITE.damageMult : 1) * (traits.includes('fire') ? ELITE.traits.fire.damage! : 1);
    this.speed = def.speed * (traits.includes('haste') ? ELITE.traits.haste.speed! : 1);
    this.attackTime = def.attackTime * (traits.includes('haste') ? ELITE.traits.haste.attack! : 1);
    this.name = elite ? `${traits.map(t => ELITE.traits[t].name).join('・')} ${def.name}` : def.name;

    this.model = SkeletonUtils.clone(src.scene) as Group;
    this.model.rotation.order = 'YXZ';
    this.model.scale.setScalar(def.scale * (elite ? ELITE.scaleMult : 1));
    this.model.position.set(x, 0, z);
    this.model.rotation.y = this.yaw;
    const tint = new Color(def.tint);
    this.model.traverse(o => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as MeshStandardMaterial).clone();
      mat.color.copy(tint);
      mat.emissive.copy(WHITE);
      mat.emissiveIntensity = 0;
      m.material = mat;
      this.mats.push(mat);
      m.castShadow = shadows;
      m.receiveShadow = true;
      m.frustumCulled = false;
    });
    scene.add(this.model);
    this.bones = findBones(this.model);
    this.mixer = new AnimationMixer(this.model);
    this.idle = this.mixer.clipAction(AnimationClip.findByName(src.animations, 'Idle')!);
    this.walk = this.mixer.clipAction(AnimationClip.findByName(src.animations, 'Walk')!);
    this.idle.play(); this.walk.play();
    this.idle.time = Math.random() * this.idle.getClip().duration;
    this.walk.time = Math.random() * this.walk.getClip().duration;
    this.walk.timeScale = def.clipSpeed;
    this.walk.weight = 0;
    if (def.ai === 'lurker') { this.state = 'lurk'; this.model.position.y = -1.9; this.model.visible = false; }
  }

  get pos() { return this.model.position; }
  get dead() { return this.state === 'dead'; }
  get elite() { return this.traits.length > 0; }
  get hidden() { return this.state === 'lurk'; }

  takeHit(amount: number, crit: boolean) {
    if (this.dead || this.hidden) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 1;
    this.ev.hit(this, amount, crit);
    if (this.hp === 0) {
      this.state = 'dead'; this.deadFor = 0; this.setWalk(false);
      this.ev.died(this);
      return;
    }
    if (!this.fled && this.hp / this.maxHp < AI.flee.below && this.def.ai !== 'heavy') {
      this.fled = true;
      if (Math.random() < AI.flee.chance) { this.fear(AI.flee.time); return; }
    }
    // 巨屍同出緊招嘅怪唔會俾打斷
    if (this.def.ai !== 'heavy' && this.state !== 'attack' && this.state !== 'stun' && this.state !== 'fear') {
      this.state = 'stagger'; this.timer = AI.stagger;
    }
  }

  stun(s: number) { if (!this.dead && !this.hidden) { this.state = 'stun'; this.timer = s; } }
  fear(s: number) { if (!this.dead && !this.hidden) { this.state = 'fear'; this.timer = s; this.path = []; } }
  heal(n: number) { if (!this.dead) { this.hp = Math.min(this.maxHp, this.hp + n); } }
  remove() { this.scene.remove(this.model); this.gone = true; }
  reset() { if (!this.dead && !this.hidden) { this.state = 'idle'; this.path = []; } }

  private setWalk(on: boolean) {
    if (on === this.walking) return;
    this.walking = on;
    (on ? this.idle : this.walk).crossFadeTo(on ? this.walk : this.idle, 0.2, false);
    (on ? this.walk : this.idle).enabled = true;
    (on ? this.walk : this.idle).setEffectiveWeight(1);
  }

  private follow(dt: number, others: Monster[], player: Player, mul = 1) {
    const next = this.path[0];
    if (!next) return false;
    const pos = this.pos, dx = next.x - pos.x, dz = next.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) { this.path.shift(); return false; }
    let vx = dx / d, vz = dz / d;
    // 互相推開，唔好疊埋一齊
    for (const o of others) {
      if (o === this || o.dead || o.hidden) continue;
      const ox = pos.x - o.pos.x, oz = pos.z - o.pos.z, od = Math.hypot(ox, oz);
      if (od < AI.separation && od > 1e-3) { vx += ox / od * (AI.separation - od) * 2; vz += oz / od * (AI.separation - od) * 2; }
    }
    const nx = pos.x + vx * this.speed * mul * dt, nz = pos.z + vz * this.speed * mul * dt;
    if (Math.hypot(nx - player.pos.x, nz - player.pos.z) < 0.9) return true;
    if (!this.grid.isBlocked(nx, nz)) { pos.x = nx; pos.z = nz; }
    this.yaw = Math.atan2(dx, dz);
    return true;
  }

  private replan(dt: number, to: Pt) {
    this.repath -= dt;
    if (this.repath > 0) return;
    this.repath = AI.repath * (0.8 + Math.random() * 0.4);
    this.path = this.grid.findPath(this.pos, to);
  }

  private rollHit() {
    return rollDamage({
      weapon: this.def.damage, strength: 0, bonusPct: (this.dmgMult - 1) * 100, critChance: 0, critMult: 1,
      targetArmor: HERO.armor, attackerLevel: 1,
    }).amount;
  }

  private melee(player: Player, dist: number) {
    if (player.dead || dist >= this.def.attackRange + 0.6) return;
    const dmg = this.rollHit();
    player.hurt(dmg);
    if (this.def.ai === 'lurker') player.slow(AI.lurker.slow);
    if (this.traits.includes('vamp')) this.heal(dmg * ELITE.traits.vamp.heal!);
  }

  private chase(dt: number, player: Player, others: Monster[], dist: number) {
    const ai = this.def.ai;
    if (player.dead) { this.state = 'idle'; return false; }
    if (ai === 'ranged' || ai === 'caster') {
      const far = ai === 'ranged' ? AI.archer.keepAway : AI.caster.keepAway;
      const clear = this.grid.lineClear(this.pos, player.pos);
      if (dist < far) {
        // 主角埋身就後退
        const k = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z) || 1;
        const to = { x: this.pos.x + (this.pos.x - player.pos.x) / k * 3, z: this.pos.z + (this.pos.z - player.pos.z) / k * 3 };
        this.replan(dt, to);
        return this.follow(dt, others, player);
      }
      if (dist <= this.def.attackRange && clear) { this.state = 'attack'; this.timer = 0; this.struck = false; return false; }
    } else if (dist <= this.def.attackRange) {
      this.state = ai === 'heavy' ? 'windup' : 'attack';
      this.timer = 0; this.struck = false;
      if (ai === 'heavy') this.ev.telegraph(this.pos.x, this.pos.z, AI.heavy.radius, AI.heavy.windup);
      return false;
    }
    this.replan(dt, player.pos);
    return this.follow(dt, others, player);
  }

  update(dt: number, player: Player, others: Monster[]) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 8);
      for (const m of this.mats) m.emissiveIntensity = this.flash * 0.5;
    }
    if (this.dead) return this.updateDead(dt);

    const dist = this.pos.distanceTo(player.pos);
    const toPlayer = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    let moving = false;

    switch (this.state) {
      case 'lurk':
        if (!player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < AI.lurker.emerge) {
          this.state = 'rise'; this.timer = 0; this.model.visible = true;
        }
        return;
      case 'rise':
        this.timer += dt / AI.lurker.riseTime;
        this.pos.y = -1.9 * (1 - Math.min(1, this.timer));
        if (this.timer >= 1) { this.pos.y = 0; this.state = 'chase'; }
        break;
      case 'idle':
        if (!player.dead && dist < this.def.sightRange && this.grid.lineClear(this.pos, player.pos)) this.state = 'chase';
        break;
      case 'stagger': case 'stun':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'chase';
        break;
      case 'fear': {
        this.timer -= dt;
        const k = dist || 1;
        this.replan(dt, { x: this.pos.x + (this.pos.x - player.pos.x) / k * 5, z: this.pos.z + (this.pos.z - player.pos.z) / k * 5 });
        moving = this.follow(dt, others, player, 1.2);
        if (this.timer <= 0) this.state = 'chase';
        break;
      }
      case 'chase':
        moving = this.chase(dt, player, others, dist);
        if (this.def.ai === 'caster') this.caster(dt, others);
        break;
      case 'windup':
        this.yaw = toPlayer;
        this.timer += dt / AI.heavy.windup;
        if (this.timer >= 1) {
          this.ev.heavyHit(this.pos.x, this.pos.z);
          if (!player.dead && dist < AI.heavy.radius) player.hurt(this.rollHit());
          this.state = 'chase';
        }
        break;
      case 'attack':
        this.yaw = toPlayer;
        this.timer += dt / this.attackTime;
        if (!this.struck && this.timer >= this.def.impactAt) {
          this.struck = true;
          if (this.def.ai === 'ranged') this.ev.arrow(this, this.rollHit(), false);
          else if (this.def.ai === 'caster') this.ev.arrow(this, this.rollHit(), true);
          else this.melee(player, dist);
        }
        if (this.timer >= 1) this.state = 'chase';
        break;
    }

    const want = this.yaw + Math.PI;
    const diff = Math.atan2(Math.sin(want - this.model.rotation.y), Math.cos(want - this.model.rotation.y));
    this.model.rotation.y += diff * Math.min(1, 8 * dt);
    this.setWalk(moving);
    this.mixer.update(dt);
    if (this.state === 'attack') applySwing(this.bones, Math.min(1, this.timer), 0.8);
    if (this.state === 'windup') applySwing(this.bones, Math.min(1, this.timer) * 0.4, 1.2);
  }

  /** 修士：定時召喚屍鬼、治療低血同伴 */
  private caster(dt: number, others: Monster[]) {
    this.summonIn -= dt;
    if (this.summonIn > 0) return;
    this.summonIn = AI.caster.summonEvery;
    const hurt = others.find(o => !o.dead && o !== this && o.hp < o.maxHp * 0.6 && o.pos.distanceTo(this.pos) < AI.caster.healRange);
    if (hurt) { hurt.heal(AI.caster.healAmount); this.ev.heal(hurt); } else this.ev.summon(this, AI.caster.summons);
  }

  private updateDead(dt: number) {
    this.deadFor += dt;
    this.mixer.update(dt);
    this.model.rotation.x = fallAngle(this.deadFor / 0.6);
    const left = AI.corpseTime - this.deadFor;
    if (left < AI.fadeTime) {
      const a = Math.max(0, left / AI.fadeTime);
      for (const m of this.mats) { m.transparent = true; m.opacity = a; }
      if (a === 0) this.remove();
    }
  }
}
