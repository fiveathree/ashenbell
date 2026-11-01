import { AnimationAction, AnimationClip, AnimationMixer, Group, Mesh, PointLight, Scene } from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LIGHT, PLAYER } from '../data/art';
import { HERO, NAV } from '../data/combat';
import { rollDamage } from '../combat/damage';
import type { Grid, Pt } from '../world/grid';

/** 主角攻擊得到嘅嘢：怪物或者可打破道具 */
export interface Target {
  name: string;
  pos: { x: number; z: number; distanceTo(v: unknown): number };
  armor: number;
  dead: boolean;
  takeHit(amount: number, crit: boolean): void;
}
import { applySwing, fallAngle, findBones, type SwingBones } from './pose';

type Clip = 'Idle' | 'Walk' | 'Run';

export class Player {
  model!: Group;
  gltf!: GLTF;
  light: PointLight;
  maxHp = HERO.baseHp + HERO.vitality * HERO.hpPerVitality;
  hp = this.maxHp;
  rage = 0;
  dead = false;
  deadFor = 0;
  attackTarget: Target | null = null;
  speedMul = 1;

  arrived: (() => void) | null = null;
  private path: Pt[] = [];
  private mixer!: AnimationMixer;
  private actions = {} as Record<Clip, AnimationAction>;
  private current: Clip = 'Idle';
  private yaw = 0;
  private bones: SwingBones = {};
  private swing = -1; // -1 = 冇揮緊
  private struck = false;
  private repath = 0;
  private sinceCombat = 99;

  constructor(private scene: Scene, public grid: Grid, q: { shadows: boolean; shadowMap: number }) {
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
    this.gltf = await new GLTFLoader().loadAsync('assets/models/soldier.glb');
    this.model = this.gltf.scene;
    this.model.rotation.order = 'YXZ';
    this.model.traverse(o => {
      const m = o as Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    this.scene.add(this.model);
    this.bones = findBones(this.model);
    this.mixer = new AnimationMixer(this.model);
    for (const name of ['Idle', 'Walk', 'Run'] as Clip[]) {
      this.actions[name] = this.mixer.clipAction(AnimationClip.findByName(this.gltf.animations, name)!);
      this.actions[name].play();
      this.actions[name].weight = name === 'Idle' ? 1 : 0;
    }
    this.place(0, 1);
  }

  get pos() { return this.model.position; }

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

  hurt(amount: number) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.rage = Math.min(HERO.rageMax, this.rage + HERO.rageOnHurt);
    this.sinceCombat = 0;
    if (this.hp === 0) {
      this.dead = true; this.deadFor = 0; this.path = []; this.attackTarget = null; this.swing = -1;
    }
  }

  respawn(x: number, z: number) {
    this.dead = false;
    this.hp = this.maxHp;
    this.rage = 0;
    this.model.rotation.x = 0;
    this.place(x, z);
  }

  private setClip(next: Clip) {
    if (next === this.current) return;
    const from = this.actions[this.current], to = this.actions[next];
    to.enabled = true;
    to.setEffectiveTimeScale(1);
    to.setEffectiveWeight(1);
    from.crossFadeTo(to, PLAYER.fade, true);
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
    const run = left > PLAYER.runDistance || (this.current === 'Run' && left > 0.8);
    const step = Math.min((run ? PLAYER.runSpeed : PLAYER.walkSpeed) * this.speedMul * dt, d);
    pos.x += dx / d * step; pos.z += dz / d * step;
    this.yaw = Math.atan2(dx, dz);
    return run ? 'Run' : 'Walk';
  }

  private fight(dt: number): Clip {
    const g = this.attackTarget;
    if (this.swing >= 0) {
      this.swing += dt / HERO.attackTime;
      if (g) this.yaw = Math.atan2(g.pos.x - this.pos.x, g.pos.z - this.pos.z);
      if (!this.struck && this.swing >= HERO.impactAt) {
        this.struck = true;
        if (g && !g.dead && g.pos.distanceTo(this.pos) < HERO.attackRange + 0.5) this.strike(g);
      }
      if (this.swing >= 1) this.swing = -1;
      return 'Idle';
    }
    if (g && g.dead) this.attackTarget = null;
    else if (g) {
      if (g.pos.distanceTo(this.pos) <= HERO.attackRange) {
        this.path = [];
        this.swing = 0; this.struck = false;
        return 'Idle';
      }
      this.repath -= dt;
      if (this.repath <= 0) { this.repath = NAV.repath; this.path = this.grid.findPath(this.pos, g.pos); }
    }
    return this.walk(dt);
  }

  private strike(g: Target) {
    const { amount, crit } = rollDamage({
      weapon: HERO.weapon, strength: HERO.strength, critChance: HERO.dexterity * HERO.critPerDexterity,
      critMult: HERO.critMultiplier, targetArmor: g.armor, attackerLevel: HERO.level,
    });
    g.takeHit(amount, crit);
    this.rage = Math.min(HERO.rageMax, this.rage + HERO.rageOnHit);
    this.sinceCombat = 0;
  }

  update(dt: number) {
    if (!this.model) return;
    this.sinceCombat += dt;
    if (this.sinceCombat > HERO.outOfCombat) this.rage = Math.max(0, this.rage - HERO.rageDecay * dt);
    if (this.dead) {
      this.deadFor += dt;
      this.setClip('Idle');
      this.mixer.update(dt);
      this.model.rotation.x = fallAngle(this.deadFor / 0.7);
      this.syncLight();
      return;
    }
    const clip = this.fight(dt);
    const want = this.yaw + Math.PI;
    const diff = Math.atan2(Math.sin(want - this.model.rotation.y), Math.cos(want - this.model.rotation.y));
    this.model.rotation.y += diff * Math.min(1, PLAYER.turnLerp * dt);
    this.setClip(clip);
    this.mixer.update(dt);
    if (this.swing >= 0) applySwing(this.bones, Math.min(1, this.swing));
    this.syncLight();
  }
}

