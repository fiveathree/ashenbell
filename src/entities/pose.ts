import { Bone, Object3D } from 'three';

/** Soldier.glb 冇攻擊動作，暫時用程式轉骨頭。換 Mixamo 動作後可以刪走呢個檔。 */
export interface SwingBones { spine?: Bone; arm?: Bone; fore?: Bone }

export function findBones(root: Object3D): SwingBones {
  return {
    spine: root.getObjectByName('mixamorigSpine1') as Bone | undefined,
    arm: root.getObjectByName('mixamorigRightArm') as Bone | undefined,
    fore: root.getObjectByName('mixamorigRightForeArm') as Bone | undefined,
  };
}

/** t = 0..1：先舉手蓄力，再快速揮落 */
export function applySwing(b: SwingBones, t: number, power = 1) {
  const windup = t < 0.4 ? t / 0.4 : 0;
  const strike = t < 0.4 ? 0 : t < 0.6 ? (t - 0.4) / 0.2 : 1 - (t - 0.6) / 0.4;
  const raise = (windup - strike * 0.9 + (t < 0.4 ? 0 : 1 - (t - 0.4) / 0.6) * 0) * power;
  b.arm?.rotateX(-1.5 * raise + 0.5 * strike * power);
  b.arm?.rotateZ(0.6 * strike * power);
  b.fore?.rotateX(-0.9 * windup * power);
  b.spine?.rotateY((0.45 * windup - 0.7 * strike) * power);
}

/** 向後倒地：改 rotation.x，模型 rotation.order 要係 YXZ */
export const fallAngle = (k: number) => -Math.PI / 2 * Math.min(1, k * k * (3 - 2 * k));
