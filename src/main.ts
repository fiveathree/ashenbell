import {
  Color, FogExp2, HemisphereLight, MathUtils, NoToneMapping, PCFShadowMap, PerspectiveCamera, Plane,
  Raycaster, SRGBColorSpace, Scene, Timer, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { CAMERA, LIGHT, PALETTE, QUALITY, type QualityName } from './data/art';
import { createComposer } from './render/postfx';
import { Debris, Dust, Embers, FirePool } from './render/torch';
import { Player, type Target } from './entities/player';
import { Ghoul } from './entities/ghoul';
import { Hud } from './ui/hud';
import './ui/hud.css';
import { MiniMap } from './ui/minimap';
import { GHOUL, HERO, NAV } from './data/combat';
import { BREAK, CELL, THEMES, VIEW } from './data/dungeon';
import { generate, type Stairs } from './world/dungeon';
import { Breakable, Level } from './world/level';
import { navGrid } from './world/nav';

const params = new URLSearchParams(location.search);
const param = params.get('q') as QualityName | null;
const quality = QUALITY[param && param in QUALITY ? param : 'medium'];
const seed = Number(params.get('seed')) || (Math.random() * 1e9) >>> 0; // Phase 5 會存入存檔

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
  const hud = new Hud();
  const map = new MiniMap(hud.mini, hud.big);
  const pool = new FirePool(scene, Math.min(LIGHT.maxTorches, quality.maxTorches));
  const embers = new Embers(scene, pool);
  const dust = new Dust(scene);
  const debris = new Debris(scene);

  const first = generate(seed, Number(params.get('floor')) || 0);
  const player = new Player(scene, navGrid(first), quality);
  await player.load();

  let level!: Level, ghouls: Ghoul[] = [], gold = 0, kills = 0, changing = false, stairsGoal: Stairs | null = null;

  const smash = (b: Breakable) => {
    level.remove(b);
    debris.burst(b.pos.x, b.pos.z);
    if (Math.random() < 0.6) {
      gold += MathUtils.randInt(BREAK.goldMin, BREAK.goldMax);
      hud.gold(gold);
    }
  };

  /** 去第 floor 層；arrive = 由邊條樓梯出現 */
  async function enter(floor: number, arrive: 'up' | 'down') {
    changing = true;
    hud.loading(`第 ${floor + 1} 層 · ${THEMES[floor].name}`);
    if (level) { level.dispose(); ghouls.forEach(g => g.remove()); }
    await new Promise(r => setTimeout(r, 30));
    const d = floor === first.floor ? first : generate(seed, floor);
    level = await new Level(scene, d, aniso, quality.shadows, smash).build();
    player.grid = level.grid;
    pool.set(level.fires);
    ghouls = d.ghouls.map(p => new Ghoul(scene, player.gltf, level.grid, p.x, p.z, quality.ghoulShadows));
    const s = arrive === 'up' ? d.up : d.down;
    player.place(s.x, s.z + CELL);
    player.attackTarget = null;
    focus.copy(player.pos).setY(1);
    map.use(d);
    hud.floor(`第 ${floor + 1} 層 · ${THEMES[floor].name}`);
    changing = false; stairsGoal = null;
    hud.loading(null);
  }

  const stairsNear = (s: Stairs, x: number, z: number) => Math.hypot(x - s.x, z - s.z - 0.6) < 2;

  // 輸入：撳地面行過去、撳怪物／道具攻擊、撳樓梯上落，按住持續
  const ray = new Raycaster(), mouse = new Vector2(), hitPt = new Vector3();
  const chestPlane = new Plane(new Vector3(0, 1, 0), -1), lowPlane = new Plane(new Vector3(0, 1, 0), -0.5);
  const floorPlane = new Plane(new Vector3(0, 1, 0), 0);
  let held = false, holdTimer = 0, lockTarget: Target | null = null, mapOpen = false;
  const aim = (e: PointerEvent) => mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);

  /** 滑鼠指住邊隻怪或道具：用平面判斷，唔使逐個三角形做射線 */
  const pick = (): Target | null => {
    ray.setFromCamera(mouse, camera);
    let best: Target | null = null, bestD = 0.85;
    if (ray.ray.intersectPlane(chestPlane, hitPt)) for (const g of ghouls) {
      if (g.dead || !g.model.visible) continue;
      const d = Math.hypot(hitPt.x - g.pos.x, hitPt.z - g.pos.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    if (best) return best;
    bestD = BREAK.reach;
    if (ray.ray.intersectPlane(lowPlane, hitPt)) for (const b of level.breakables) {
      const d = Math.hypot(hitPt.x - b.pos.x, hitPt.z - b.pos.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  };
  const pickStairs = (): Stairs | null => {
    ray.setFromCamera(mouse, camera);
    if (!ray.ray.intersectPlane(floorPlane, hitPt)) return null;
    const d = level.d;
    if (stairsNear(d.down, hitPt.x, hitPt.z)) return d.down;
    if (stairsNear(d.up, hitPt.x, hitPt.z)) return d.up;
    return null;
  };
  const act = (fresh: boolean) => {
    if (changing) return;
    const g = pick();
    if (fresh) lockTarget = g;
    if (lockTarget && !lockTarget.dead) { if (player.attackTarget !== lockTarget) player.attack(lockTarget); return; }
    if (fresh || !lockTarget) {
      const st = pickStairs();
      if (fresh) stairsGoal = st;
      ray.setFromCamera(mouse, camera);
      if (st) player.moveTo({ x: st.x, z: st.z + CELL * 0.75 });
      else if (ray.ray.intersectPlane(floorPlane, hitPt)) player.moveTo({ x: hitPt.x, z: hitPt.z });
    }
  };
  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button === 0) { held = true; holdTimer = NAV.holdRepeat; aim(e); act(true); }
  });
  addEventListener('pointermove', aim);
  addEventListener('pointerup', () => { held = false; lockTarget = null; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); mapOpen = !mapOpen; hud.showMap(mapOpen); }
    if (e.key === 'Escape' && mapOpen) { mapOpen = false; hud.showMap(false); }
  });
  addEventListener('wheel', e => {
    wantDistance = MathUtils.clamp(wantDistance + Math.sign(e.deltaY), CAMERA.minDistance, CAMERA.maxDistance);
  }, { passive: true });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  await enter(first.floor, 'up');
  place(distance);

  const timer = new Timer();
  let stats = { calls: 0, tris: 0 };
  if (import.meta.env.DEV) renderer.info.autoReset = false;
  const tick = () => {
    requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
    if (import.meta.env.DEV) { stats = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.reset(); }
    if (held) { holdTimer -= dt; if (holdTimer <= 0) { holdTimer = NAV.holdRepeat; act(false); } }
    if (!changing) {
      player.speedMul = level.isWater(player.pos.x, player.pos.z) ? level.theme.speedInWater : 1;
      player.update(dt);
      for (const g of ghouls) {
        const far = g.pos.distanceTo(player.pos) > VIEW.ghoulActive;
        g.model.visible = !far;
        if (!far || g.dead) g.update(dt, player, ghouls);
        if (g.dead && !g.counted) { g.counted = true; kills++; }
      }
      for (let i = ghouls.length - 1; i >= 0; i--) if (ghouls[i].gone) ghouls.splice(i, 1);
      if (player.dead && player.deadFor > HERO.respawnDelay) {
        const s = level.d.up;
        player.respawn(s.x, s.z + CELL);
        ghouls.forEach(g => g.reset());
      }
      // 行到樓梯就上落
      if (stairsGoal && !player.dead && Math.hypot(player.pos.x - stairsGoal.x, player.pos.z - stairsGoal.z) < CELL * 1.25) {
        const d = level.d, goDown = stairsGoal === d.down;
        if (goDown && d.floor < THEMES.length - 1) enter(d.floor + 1, 'up');
        else if (!goDown && d.floor > 0) enter(d.floor - 1, 'down');
        else stairsGoal = null;
      }
    }
    const fp = player.pos;
    map.reveal(fp.x, fp.z);
    map.update(fp.x, fp.z, mapOpen);
    if (!changing) {
      const hover = pick(), st = hover ? null : pickStairs();
      const d = level.d;
      hud.target(hover ? ('maxHp' in hover ? { name: GHOUL.name, hp: (hover as Ghoul).hp, maxHp: (hover as Ghoul).maxHp } : { name: hover.name })
        : st ? { name: st === d.down ? (d.floor < 2 ? '落去下一層' : '封印之井最深處') : (d.floor > 0 ? '返上一層' : '返回地面（小鎮未開放）') } : null);
    }
    hud.update(player.hp, player.maxHp, player.rage, HERO.rageMax, `已殺屍鬼 ${kills}`, player.dead);
    focus.x += (fp.x - focus.x) * Math.min(1, CAMERA.followLerp * dt);
    focus.z += (fp.z - focus.z) * Math.min(1, CAMERA.followLerp * dt);
    distance += (wantDistance - distance) * Math.min(1, CAMERA.zoomLerp * dt);
    place(distance);
    pool.update(t, camera, fp);
    embers.update(dt, t);
    dust.update(dt, t, fp);
    debris.update(dt);
    if (level) level.update(t);
    composer.render(dt);
  };
  tick();
  document.getElementById('loading')!.remove();

  if (import.meta.env.DEV) {
    Object.assign(window, { __ashen: {
      player, camera, renderer, focus, Vector3, seed, map, kills: () => kills, gold: () => gold,
      get ghouls() { return ghouls; }, get level() { return level; }, get changing() { return changing; }, get stats() { return stats; },
      enter, snap() { focus.copy(player.pos).setY(1); },
    } });
  }
}

start();
