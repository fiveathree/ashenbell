import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** 角色模型：MakeHuman CC0 人體 + Quaternius CC0 動作，由 scripts/blender/make_character.py 生成 */
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadModel(name: string) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`assets/models/${name}.glb`));
  return cache.get(name)!;
}
