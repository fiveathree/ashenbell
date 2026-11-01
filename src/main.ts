import {
  Color, FogExp2, HemisphereLight, MathUtils, NoToneMapping, PCFShadowMap, PerspectiveCamera,
  Raycaster, SRGBColorSpace, Scene, Timer, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { CAMERA, LIGHT, PALETTE, QUALITY, type QualityName } from './data/art';
import { createComposer } from './render/postfx';
import { Candle, Dust, Embers, Torch } from './render/torch';
import { buildRoom } from './world/room';
import { Player } from './entities/player';

const param = new URLSearchParams(location.search).get('q') as QualityName | null;
const quality = QUALITY[param && param in QUALITY ? param : 'medium'];

const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = PCFShadowMap;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(PALETTE.fog);
scene.fog = new FogExp2(PALETTE.fog, LIGHT.fogDensity);
scene.add(new HemisphereLight(0x6a5a50, 0x1a0f0a, LIGHT.hemi));

const camera = new PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.5, 80);
const composer = createComposer(renderer, scene, camera, innerWidth, innerHeight, quality);

const pitch = MathUtils.degToRad(CAMERA.pitchDeg), yaw = MathUtils.degToRad(CAMERA.yawDeg);
const camDir = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
let distance: number = CAMERA.distance, wantDistance: number = CAMERA.distance;
const focus = new Vector3();

const place = (dist: number) => { camera.position.copy(focus).addScaledVector(camDir, dist); camera.lookAt(focus); };

async function start() {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const room = await buildRoom(scene, aniso);
  const torches = room.torchAt.map(p => new Torch(scene, p.flame, p.light));
  const candles = room.candleAt.map(p => new Candle(scene, p.flame, p.light));
  const embers = new Embers(scene, torches);
  const dust = new Dust(scene);
  const player = new Player(scene, room.colliders, quality);
  await player.load();
  focus.copy(player.model.position).setY(1);
  place(distance);

  // 輸入：撳地面行過去，按住持續跟滑鼠
  const ray = new Raycaster(), mouse = new Vector2();
  let held = false;
  const go = (e: PointerEvent) => {
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObject(room.floor)[0];
    if (hit) player.moveTo(hit.point);
  };
  renderer.domElement.addEventListener('pointerdown', e => { if (e.button === 0) { held = true; go(e); } });
  addEventListener('pointermove', e => { if (held) go(e); });
  addEventListener('pointerup', () => { held = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => {
    wantDistance = MathUtils.clamp(wantDistance + Math.sign(e.deltaY), CAMERA.minDistance, CAMERA.maxDistance);
  }, { passive: true });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  const timer = new Timer();
  const tick = () => {
    requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
    player.update(dt);
    const fp = player.model.position;
    focus.x += (fp.x - focus.x) * Math.min(1, CAMERA.followLerp * dt);
    focus.z += (fp.z - focus.z) * Math.min(1, CAMERA.followLerp * dt);
    distance += (wantDistance - distance) * Math.min(1, CAMERA.zoomLerp * dt);
    place(distance);
    // 火把燈最多 8 支，按距離開
    [...torches].sort((a, b) => a.pos.distanceTo(fp) - b.pos.distanceTo(fp))
      .forEach((tc, i) => tc.update(t, camera, i < Math.min(LIGHT.maxTorches, quality.maxTorches)));
    candles.forEach(c => c.update(t, camera));
    embers.update(dt, t);
    dust.update(dt, t, fp);
    composer.render(dt);
  };
  tick();
  document.getElementById('loading')!.remove();

  if (import.meta.env.DEV) {
    Object.assign(window, { __ashen: { player, camera, renderer, focus, snap() { focus.copy(player.model.position).setY(1); } } });
  }
}

start();
