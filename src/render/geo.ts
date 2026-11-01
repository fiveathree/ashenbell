import { BufferAttribute, BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** 用世界座標重算 UV，令材質尺寸一致，方塊之間接得順 */
export function worldUV(g: BufferGeometry, meters: number) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)]
      : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / meters, v / meters);
  }
  return g;
}

export const box = (w: number, h: number, d: number, x: number, y: number, z: number, bevel = 0.06, seg = 1) => {
  const g = new RoundedBoxGeometry(w, h, d, seg, bevel);
  g.translate(x, y, z);
  return g.index ? g.toNonIndexed() : g;
};

/** 牆頂喺鏡頭睇落去係虛空：塗黑，避免法線貼圖喺背光面閃出雜點 */
export function darkenTops(g: BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3).fill(1);
  for (let i = 0; i < p.count; i++) {
    if (n.getY(i) > 0.5 && p.getY(i) > 3) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0.015;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}
