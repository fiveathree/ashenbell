import {
  Color, FogExp2, HemisphereLight, MathUtils, NoToneMapping, PCFShadowMap, PerspectiveCamera, Plane,
  Raycaster, SRGBColorSpace, Scene, Timer, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { CAMERA, LIGHT, PALETTE, QUALITY, ROOM, type QualityName } from './data/art';
import { createComposer } from './render/postfx';
import { Candle, Dust, Embers, Torch } from './render/torch';
import { buildRoom } from './world/room';
import { Player } from './entities/player';
import { Ghoul } from './entities/ghoul';
import { Grid, type Pt } from './world/grid';
import { Hud } from './ui/hud';
import './ui/hud.css';
import { GHOUL, HERO, NAV, TEST_ROOM } from './data/combat';

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
  const grid = new Grid({ minX: -ROOM.halfX, maxX: ROOM.halfX, minZ: -ROOM.halfZ, maxZ: ROOM.halfZ }, NAV.cell);
  grid.stamp(room.colliders, room.rects, NAV.heroRadius);
  const spawnPoint: Pt = { x: 0, z: 1 };
  const player = new Player(scene, grid, quality);
  await player.load();
  const hud = new Hud();

  // 測試房間：殺夠 10 隻算過關，清完會再出一批
  const ghouls: Ghoul[] = [];
  let kills = 0, wave = 0, nextWave = 0;
  const spawnWave = () => {
    wave++;
    for (let n = 0, tries = 0; n < TEST_ROOM.waveSize && tries < 500; tries++) {
      const x = MathUtils.randFloat(-ROOM.halfX + 1, ROOM.halfX - 1), z = MathUtils.randFloat(-ROOM.halfZ + 1, ROOM.halfZ - 1);
      if (grid.isBlocked(x, z) || Math.hypot(x - player.pos.x, z - player.pos.z) < TEST_ROOM.minSpawnDistance) continue;
      ghouls.push(new Ghoul(scene, player.gltf, grid, x, z, quality.shadows));
      n++;
    }
  };
  spawnWave();
  focus.copy(player.model.position).setY(1);
  place(distance);

  // 輸入：撳地面行過去、撳怪物攻擊，按住持續
  const ray = new Raycaster(), mouse = new Vector2(), hitPt = new Vector3();
  const chestPlane = new Plane(new Vector3(0, 1, 0), -1), floorPlane = new Plane(new Vector3(0, 1, 0), 0);
  let held = false, holdTimer = 0, lockTarget: Ghoul | null = null;
  const aim = (e: PointerEvent) => mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  /** 滑鼠指住邊隻怪：用腰高平面判斷，唔使逐個三角形做射線 */
  const pickGhoul = () => {
    ray.setFromCamera(mouse, camera);
    if (!ray.ray.intersectPlane(chestPlane, hitPt)) return null;
    let best: Ghoul | null = null, bestD = 0.85;
    for (const g of ghouls) {
      if (g.dead) continue;
      const d = Math.hypot(hitPt.x - g.pos.x, hitPt.z - g.pos.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  };
  const act = (fresh: boolean) => {
    const g = pickGhoul();
    if (fresh) lockTarget = g;
    if (lockTarget && !lockTarget.dead) { if (player.attackTarget !== lockTarget) player.attack(lockTarget); return; }
    if (fresh || !lockTarget) {
      ray.setFromCamera(mouse, camera);
      if (ray.ray.intersectPlane(floorPlane, hitPt)) player.moveTo({ x: hitPt.x, z: hitPt.z });
    }
  };
  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button === 0) { held = true; holdTimer = NAV.holdRepeat; aim(e); act(true); }
  });
  addEventListener('pointermove', aim);
  addEventListener('pointerup', () => { held = false; lockTarget = null; });
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
    if (held) { holdTimer -= dt; if (holdTimer <= 0) { holdTimer = NAV.holdRepeat; act(false); } }
    player.update(dt);
    for (const g of ghouls) {
      g.update(dt, player, ghouls);
      if (g.dead && !g.counted) { g.counted = true; kills++; }
    }
    for (let i = ghouls.length - 1; i >= 0; i--) if (ghouls[i].gone) ghouls.splice(i, 1);
    if (ghouls.every(g => g.dead)) {
      nextWave += dt;
      if (nextWave > TEST_ROOM.nextWaveDelay) { nextWave = 0; spawnWave(); }
    }
    if (player.dead && player.deadFor > HERO.respawnDelay) {
      player.respawn(spawnPoint.x, spawnPoint.z);
      ghouls.forEach(g => g.reset());
    }
    const hover = pickGhoul();
    hud.target(hover && { name: GHOUL.name, hp: hover.hp, maxHp: hover.maxHp });
    hud.update(player.hp, player.maxHp, player.rage, HERO.rageMax,
      kills >= TEST_ROOM.goal ? `測試房間完成：已殺 ${kills} 隻屍鬼` : `擊殺屍鬼 ${kills} / ${TEST_ROOM.goal}`, player.dead);
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
    Object.assign(window, { __ashen: { player, ghouls, camera, renderer, focus, Vector3, kills: () => kills, wave: () => wave, snap() { focus.copy(player.model.position).setY(1); } } });
  }
}

start();
