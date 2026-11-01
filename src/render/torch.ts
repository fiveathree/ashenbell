import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Camera, Color, DoubleSide, Mesh, PlaneGeometry,
  PointLight, Points, PointsMaterial, Scene, ShaderMaterial, Vector3,
} from 'three';
import { LIGHT, PALETTE } from '../data/art';

const flameMat = () => new ShaderMaterial({
  transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  uniforms: { t: { value: 0 }, seed: { value: Math.random() * 10 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv; uniform float t; uniform float seed;
    float n(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    float sn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(n(i),n(i+vec2(1,0)),f.x),mix(n(i+vec2(0,1)),n(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 p){ return .5*sn(p)+.3*sn(p*2.1)+.2*sn(p*4.3); }
    void main(){
      vec2 p=vUv; p.x=(p.x-.5)*2.;
      float w=fbm(vec2(p.x*2.+seed,p.y*3.-t*2.6));
      p.x+=(w-.5)*.7*p.y;
      float body=(1.-p.y)*(1.-p.y)*1.6-abs(p.x)*1.5;
      body+=(w-.5)*.9*p.y;
      float a=smoothstep(.0,.35,body)*smoothstep(0.,.1,vUv.y);
      vec3 c=mix(vec3(1.,.16,.02),vec3(1.,.48,.1),smoothstep(.1,.6,body));
      c=mix(c,vec3(1.,.74,.36),smoothstep(.7,1.2,body));
      gl_FragColor=vec4(c*(1.1+body*1.1),a);
    }`,
});

/** 閃爍用平滑噪聲，唔用純隨機，先似火 */
const flick = (t: number, s: number) =>
  (Math.sin(t * 7.3 + s) + Math.sin(t * 13.1 + s * 2.1) * 0.6 + Math.sin(t * 23.7 + s * 3.3) * 0.3) / 1.9;

export class Torch {
  light: PointLight;
  flame: Mesh;
  private seed = Math.random() * 100;

  private home: Vector3;

  constructor(scene: Scene, public pos: Vector3, lightPos: Vector3) {
    this.home = lightPos.clone();
    this.light = new PointLight(PALETTE.fire, LIGHT.torchIntensity, LIGHT.torchDistance, 2);
    this.light.position.copy(lightPos);
    scene.add(this.light);
    this.flame = new Mesh(new PlaneGeometry(0.3, 0.5), flameMat());
    scene.add(this.flame);
  }

  update(t: number, camera: Camera, on: boolean) {
    this.light.visible = on;
    const f = flick(t, this.seed);
    this.light.intensity = LIGHT.torchIntensity * (1 + f * LIGHT.torchFlicker);
    this.light.position.y = this.home.y + f * 0.03;
    (this.flame.material as ShaderMaterial).uniforms.t.value = t + this.seed;
    this.flame.quaternion.copy(camera.quaternion);
    // 向鏡頭推少少，火焰唔會俾燈籠外殼完全遮住
    this.flame.position.copy(this.pos).addScaledVector(camera.position.clone().sub(this.pos).normalize(), 0.3);
  }
}

/** 蠟燭：細火苗 + 可選嘅弱光 */
export class Candle {
  flame: Mesh;
  light: PointLight | null = null;
  private seed = Math.random() * 100;

  constructor(scene: Scene, private pos: Vector3, lightPos: Vector3 | null) {
    if (lightPos) {
      this.light = new PointLight(PALETTE.fire, LIGHT.candleIntensity, LIGHT.candleDistance, 2);
      this.light.position.copy(lightPos);
      scene.add(this.light);
    }
    this.flame = new Mesh(new PlaneGeometry(0.1, 0.2), flameMat());
    this.flame.position.copy(pos);
    scene.add(this.flame);
  }

  update(t: number, camera: Camera) {
    if (this.light) this.light.intensity = LIGHT.candleIntensity * (1 + flick(t, this.seed) * 0.1);
    (this.flame.material as ShaderMaterial).uniforms.t.value = t + this.seed;
    this.flame.quaternion.copy(camera.quaternion);
  }
}

/** 由火把飄起嘅火星 */
export class Embers {
  points: Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;

  constructor(scene: Scene, private torches: Torch[], private count = 90) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) this.spawn(i, Math.random() * 2.4);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.points = new Points(g, new PointsMaterial({
      color: new Color(3, 1.3, 0.35), size: 0.05, transparent: true, depthWrite: false,
      blending: AdditiveBlending, fog: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private spawn(i: number, life: number) {
    const s = this.torches[i % this.torches.length].pos;
    this.pos[i * 3] = s.x + (Math.random() - 0.5) * 0.12;
    this.pos[i * 3 + 1] = s.y + Math.random() * 0.2;
    this.pos[i * 3 + 2] = s.z + (Math.random() - 0.5) * 0.12;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.3;
    this.vel[i * 3 + 1] = 0.4 + Math.random() * 0.7;
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    this.life[i] = life;
  }

  update(dt: number, t: number) {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.spawn(i, 1 + Math.random() * 1.8); continue; }
      this.pos[i * 3] += (this.vel[i * 3] + Math.sin(t * 3 + i) * 0.2) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + Math.cos(t * 2.4 + i) * 0.2) * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** 主角附近飄浮嘅灰塵 */
export class Dust {
  points: Points;
  private pos: Float32Array;

  constructor(scene: Scene, private count = 160, private range = 9) {
    this.pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * range * 2;
      this.pos[i * 3 + 1] = Math.random() * 3.5;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * range * 2;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.points = new Points(g, new PointsMaterial({
      color: PALETTE.bone, size: 0.025, transparent: true, opacity: 0.16, depthWrite: false,
      blending: AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt: number, t: number, center: Vector3) {
    const r = this.range;
    for (let i = 0; i < this.count; i++) {
      let x = this.pos[i * 3] + Math.sin(t * 0.3 + i) * 0.05 * dt;
      let y = this.pos[i * 3 + 1] + 0.04 * dt;
      let z = this.pos[i * 3 + 2] + Math.cos(t * 0.27 + i) * 0.05 * dt;
      if (x - center.x > r) x -= r * 2; else if (x - center.x < -r) x += r * 2;
      if (z - center.z > r) z -= r * 2; else if (z - center.z < -r) z += r * 2;
      if (y > 3.5) y = 0;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
