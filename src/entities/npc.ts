import { AnimationClip, AnimationMixer, Color, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { NPCS, type NpcId } from '../data/story';

/** 小鎮 NPC：暫用 Soldier.glb 染色企喺度 */
export class Npc {
  model: Group;
  name: string;
  private mixer: AnimationMixer;

  constructor(private scene: Scene, src: GLTF, public id: NpcId) {
    const d = NPCS[id];
    this.name = `${d.title} ${d.name}`;
    this.model = SkeletonUtils.clone(src.scene) as Group;
    this.model.position.set(d.x, 0, d.z);
    this.model.rotation.y = Math.PI * 0.25;
    const tint = new Color(d.tint);
    this.model.traverse(o => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as MeshStandardMaterial).clone();
      mat.color.copy(tint);
      m.material = mat;
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    });
    scene.add(this.model);
    this.mixer = new AnimationMixer(this.model);
    const a = this.mixer.clipAction(AnimationClip.findByName(src.animations, 'Idle')!);
    a.play();
    a.time = Math.random() * a.getClip().duration;
  }

  get pos() { return this.model.position; }
  update(dt: number) { this.mixer.update(dt); }
  remove() { this.scene.remove(this.model); }
}
