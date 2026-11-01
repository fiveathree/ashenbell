import {
  AnimationAction, AnimationClip, AnimationMixer, Group, Mesh, MathUtils, PointLight, Scene, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LIGHT, PLAYER, ROOM } from '../data/art';
import type { Collider } from '../world/room';

type Clip = 'Idle' | 'Walk' | 'Run';

export class Player {
  model!: Group;
  light: PointLight;
  target: Vector3 | null = null;
  private mixer!: AnimationMixer;
  private actions = {} as Record<Clip, AnimationAction>;
  private current: Clip = 'Idle';
  private yaw = 0;

  constructor(private scene: Scene, private colliders: Collider[], q: { shadows: boolean; shadowMap: number }) {
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
    const g = await new GLTFLoader().loadAsync('assets/models/soldier.glb');
    this.model = g.scene;
    this.model.traverse(o => {
      const m = o as Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    this.scene.add(this.model);
    this.mixer = new AnimationMixer(this.model);
    for (const name of ['Idle', 'Walk', 'Run'] as Clip[]) {
      this.actions[name] = this.mixer.clipAction(AnimationClip.findByName(g.animations, name)!);
      this.actions[name].play();
      this.actions[name].weight = name === 'Idle' ? 1 : 0;
    }
    this.place(3, 1);
  }

  place(x: number, z: number) {
    this.model.position.set(x, 0, z);
    this.syncLight();
  }

  moveTo(p: Vector3) {
    this.target = p.clone().setY(0);
    this.target.x = MathUtils.clamp(this.target.x, -ROOM.halfX + PLAYER.radius, ROOM.halfX - PLAYER.radius);
    this.target.z = MathUtils.clamp(this.target.z, -ROOM.halfZ + PLAYER.radius, ROOM.halfZ - PLAYER.radius);
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

  private pushOut(pos: Vector3) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + PLAYER.radius, d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) { pos.x = c.x + dx / d * min; pos.z = c.z + dz / d * min; }
    }
  }

  update(dt: number) {
    if (!this.model) return;
    const pos = this.model.position;
    let clip: Clip = 'Idle';
    if (this.target) {
      const dx = this.target.x - pos.x, dz = this.target.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.12) this.target = null;
      else {
        const run = d > PLAYER.runDistance || this.current === 'Run' && d > 0.8;
        const v = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
        const step = Math.min(v * dt, d);
        const before = pos.clone();
        pos.x += dx / d * step; pos.z += dz / d * step;
        this.pushOut(pos);
        // 撞住障礙行唔到就停，唔好原地跑
        if (pos.distanceTo(before) < step * 0.25) this.target = null;
        this.yaw = Math.atan2(dx, dz);
        clip = run ? 'Run' : 'Walk';
      }
    }
    const diff = Math.atan2(Math.sin(this.yaw + Math.PI - this.model.rotation.y), Math.cos(this.yaw + Math.PI - this.model.rotation.y));
    this.model.rotation.y += diff * Math.min(1, PLAYER.turnLerp * dt);
    this.setClip(clip);
    this.mixer.update(dt);
    this.syncLight();
  }
}
