import {
  AnimationAction, AnimationClip, AnimationMixer, Color, Group, Mesh, MeshStandardMaterial, Scene,
} from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { GHOUL, HERO } from '../data/combat';
import { rollDamage } from '../combat/damage';
import type { Grid, Pt } from '../world/grid';
import type { Player } from './player';
import { applySwing, fallAngle, findBones, type SwingBones } from './pose';

type State = 'idle' | 'chase' | 'attack' | 'stagger' | 'dead';

const WHITE = new Color(0xffffff);

export class Ghoul {
  model: Group;
  name = GHOUL.name;
  armor = GHOUL.armor;
  maxHp = GHOUL.hp;
  hp = GHOUL.hp;
  state: State = 'idle';
  gone = false; // 屍體淡出完
  counted = false; // 已計入擊殺數

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

  constructor(private scene: Scene, src: GLTF, private grid: Grid, x: number, z: number, shadows: boolean) {
    this.model = SkeletonUtils.clone(src.scene) as Group;
    this.model.rotation.order = 'YXZ';
    this.model.scale.setScalar(GHOUL.scale);
    this.model.position.set(x, 0, z);
    this.model.rotation.y = this.yaw;
    const tint = new Color(GHOUL.tint);
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
    this.walk.timeScale = 0.7; // 拖住腳行
    this.walk.weight = 0;
  }

  get pos() { return this.model.position; }
  get dead() { return this.state === 'dead'; }

  takeHit(amount: number, _crit: boolean) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 1;
    if (this.hp === 0) { this.state = 'dead'; this.deadFor = 0; this.setWalk(false); return; }
    if (this.state !== 'attack') { this.state = 'stagger'; this.timer = GHOUL.staggerTime; }
  }

  reset() { if (!this.dead) { this.state = 'idle'; this.path = []; } }

  private setWalk(on: boolean) {
    if (on === this.walking) return;
    this.walking = on;
    (on ? this.idle : this.walk).crossFadeTo(on ? this.walk : this.idle, 0.2, false);
    (on ? this.walk : this.idle).enabled = true;
    (on ? this.walk : this.idle).setEffectiveWeight(1);
  }

  private move(dt: number, others: Ghoul[], player: Player) {
    const next = this.path[0];
    if (!next) return;
    const pos = this.pos, dx = next.x - pos.x, dz = next.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) { this.path.shift(); return; }
    let vx = dx / d, vz = dz / d;
    // 互相推開，唔好疊埋一齊
    for (const o of others) {
      if (o === this || o.dead) continue;
      const ox = pos.x - o.pos.x, oz = pos.z - o.pos.z, od = Math.hypot(ox, oz), min = GHOUL.radius * 2;
      if (od < min && od > 1e-3) { vx += ox / od * (min - od) * 2; vz += oz / od * (min - od) * 2; }
    }
    const nx = pos.x + vx * GHOUL.speed * dt, nz = pos.z + vz * GHOUL.speed * dt;
    const px = nx - player.pos.x, pz = nz - player.pos.z;
    if (Math.hypot(px, pz) < GHOUL.radius + 0.45) return;
    if (!this.grid.isBlocked(nx, pz + player.pos.z)) { pos.x = nx; pos.z = nz; }
    this.yaw = Math.atan2(dx, dz);
  }

  update(dt: number, player: Player, others: Ghoul[]) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 8);
      for (const m of this.mats) m.emissiveIntensity = this.flash * 0.5;
    }
    if (this.dead) return this.updateDead(dt);

    const dist = this.pos.distanceTo(player.pos);
    const toPlayer = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    let moving = false;

    switch (this.state) {
      case 'idle':
        if (!player.dead && dist < GHOUL.sightRange && this.grid.lineClear(this.pos, player.pos)) this.state = 'chase';
        break;
      case 'stagger':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'chase';
        break;
      case 'chase':
        if (player.dead) { this.state = 'idle'; break; }
        if (dist <= GHOUL.attackRange) { this.state = 'attack'; this.timer = 0; this.struck = false; break; }
        this.repath -= dt;
        if (this.repath <= 0) {
          this.repath = GHOUL.repath * (0.8 + Math.random() * 0.4);
          this.path = this.grid.findPath(this.pos, player.pos);
        }
        this.move(dt, others, player);
        moving = true;
        break;
      case 'attack':
        this.yaw = toPlayer;
        this.timer += dt / GHOUL.attackTime;
        if (!this.struck && this.timer >= GHOUL.impactAt) {
          this.struck = true;
          if (!player.dead && dist < GHOUL.attackRange + 0.6) {
            player.hurt(rollDamage({
              weapon: GHOUL.damage, strength: 0, critChance: 0, critMult: 1,
              targetArmor: HERO.armor, attackerLevel: GHOUL.level,
            }).amount);
          }
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
  }

  private updateDead(dt: number) {
    this.deadFor += dt;
    this.mixer.update(dt);
    this.model.rotation.x = fallAngle(this.deadFor / 0.6);
    const left = GHOUL.corpseTime - this.deadFor;
    if (left < GHOUL.fadeTime) {
      const a = Math.max(0, left / GHOUL.fadeTime);
      for (const m of this.mats) { m.transparent = true; m.opacity = a; }
      if (a === 0) { this.scene.remove(this.model); this.gone = true; }
    }
  }
}
