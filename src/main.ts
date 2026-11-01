import {
  Color, FogExp2, HemisphereLight, MathUtils, NoToneMapping, PCFShadowMap, PerspectiveCamera, Plane,
  Raycaster, SRGBColorSpace, Scene, Timer, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { CAMERA, LIGHT, PALETTE, QUALITY, type QualityName } from './data/art';
import { createComposer } from './render/postfx';
import { Debris, Dust, Embers, FirePool } from './render/torch';
import { Player, type Target } from './entities/player';
import { Monster, type MonsterEvents } from './entities/monster';
import { Vfx } from './render/vfx';
import { Skills, SKILL_ORDER } from './combat/skills';
import { Floats } from './ui/floats';
import { FX } from './data/skills';
import { AI, ELITE, MONSTERS, type EliteTrait, type MonsterId } from './data/monsters';
import { Hud } from './ui/hud';
import { Ui } from './ui/dialog';
import './ui/dialog.css';
import { Npc } from './entities/npc';
import { Story } from './story/quests';
import { clearDisk, exportFile, importFile, loadFromDisk, pack, restore, saveToDisk, type SaveData, type WorldState } from './core/save';
import { sellPrice } from './items/shop';
import { DALA_TALK, DEATH_GOLD_LOSS, HERB_TALK, JOURNAL, NPCS, OPENING, RELIC_TEXT, type NpcId } from './data/story';
import './ui/hud.css';
import './ui/panels.css';
import { Panels } from './ui/panels';
import { Hero, xpToNext } from './items/hero';
import { makeItem, rollLoot } from './items/item';
import { LootField, type Drop } from './entities/loot';
import { DROP, LEVELING, type LegendId, type Rarity } from './data/items';
import { MiniMap } from './ui/minimap';
import { HERO, NAV } from './data/combat';
import { BREAK, CELL, placeName, THEMES } from './data/dungeon';
import { bossDungeon, generate, townDungeon, type Stairs } from './world/dungeon';
import { Boss } from './entities/boss';
import { BOSS, ENDING } from './data/boss';
import { Breakable, Level } from './world/level';
import { navGrid } from './world/nav';

const params = new URLSearchParams(location.search);
const param = params.get('q') as QualityName | null;
const quality = QUALITY[param && param in QUALITY ? param : 'medium'];
// 開發測試：網址有 seed 就跳過標題直接入地城，唔掂存檔
const autostart = params.has('seed');
const newSeed = () => Number(params.get('seed')) || (Math.random() * 1e9) >>> 0;

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

  const hero = new Hero(), story = new Story();
  const player = new Player(scene, navGrid(townDungeon()), quality, hero);
  await player.load();
  const world: WorldState = { seed: newSeed(), floor: -1, waypoints: [-1], cleared: {}, broken: {}, explored: {} };
  let npcs: Npc[] = [];

  const vfx = new Vfx(scene), floats = new Floats(), field = new LootField(scene);
  let pickGoal: Drop | null = null;
  const panels = new Panels(hero, () => player.refresh(), () => player.refresh());
  const ui = new Ui(hero, () => { player.refresh(); panels.render(); hud.gold(hero.gold); });
  let level: Level | null = null as Level | null, monsters: Monster[] = [], kills = 0, changing = true, stairsGoal: Stairs | null = null;
  let talkGoal: Npc | null = null, stoneGoal = false, lineLeft = 0;
  const lv = () => level!;

  const encodeExplored = () => {
    for (const [k, v] of map.explored) world.explored[k] = Array.from(v).join('');
  };
  const save = () => {
    if (autostart) return;
    encodeExplored();
    saveToDisk(pack(hero, story, world));
  };
  const say = (lines: string[]) => ui.dialog('獵魔人', null, lines);
  panels.sellHook = it => {
    if (!ui.shopOpen) return false;
    hero.removeItem(it); hero.gold += sellPrice(it);
    hud.gold(hero.gold); ui.renderShop();
    return true;
  };

  const newMonster = (type: MonsterId, x: number, z: number, mLevel: number, traits: EliteTrait[] = []) => {
    const m = type === 'abbot'
      ? new Boss(scene, player.gltf, lv().grid, x, z, mLevel, quality.shadows, events, vfx, { line: t => { hud.bossLine(t); lineLeft = BOSS.lineTime; } })
      : new Monster(scene, player.gltf, lv().grid, type, x, z, mLevel, traits, quality.ghoulShadows, events);
    monsters.push(m);
    return m;
  };
  const events: MonsterEvents = {
    hit(m, amount, crit) {
      floats.add(m.pos.x, 1.7, m.pos.z, String(Math.round(amount)), crit ? 'crit' : 'hit');
      debris.burst(m.pos.x, m.pos.z, m.def.blood);
      vfx.bump(crit ? FX.shakeCrit : FX.shakeHit);
    },
    died(m) {
      vfx.blood(m.pos.x, m.pos.z, m.def.blood);
      reward(m);
      if (m instanceof Boss) bossDown(m);
      if (m.index >= 0) (world.cleared[lv().d.floor] ??= []).push(m.index);
      if (m.traits.includes('split')) {
        for (let i = 0; i < ELITE.traits.split.spawns!; i++) newMonster('ghoul', m.pos.x + (i ? 0.7 : -0.7), m.pos.z, 4).state = 'chase';
      }
    },
    arrow(m, dmg, spell) { vfx.shoot(m.pos, player.pos, dmg, spell); },
    summon(m, n) {
      const alive = monsters.filter(o => !o.dead).length;
      for (let i = 0; i < n && alive + i < AI.caster.maxMonsters; i++) {
        const p = lv().grid.nearestFree(m.pos.x + (i ? 1.2 : -1.2), m.pos.z + 1);
        if (p) newMonster('ghoul', p.x, p.z, (lv().d.floor + 1) * 4).state = 'chase';
      }
      vfx.ring(m.pos.x, m.pos.z, 3, PALETTE.blood);
    },
    telegraph: (x, z, r, t) => vfx.telegraph(x, z, r, t),
    heavyHit(x, z) { vfx.ring(x, z, AI.heavy.radius * 1.2, 0xd9771f); vfx.bump(FX.shakeHeavy); },
    heal(m) { vfx.ring(m.pos.x, m.pos.z, 2, 0x5a9a5a); floats.add(m.pos.x, 1.7, m.pos.z, '治療', 'gold'); },
  };
  /** 怪物死：經驗同掉寶 */
  const reward = (m: Monster) => {
    const base = LEVELING.monsterXp[m.id] * (1 + LEVELING.xpPerMonsterLevel * (m.level - 1));
    const ups = hero.gain(Math.round(base * (m.elite ? LEVELING.eliteXp : 1)));
    if (ups) {
      player.refresh();
      player.hp = player.maxHp;
      hud.levelUp(hero.level);
      save();
      vfx.ring(player.pos.x, player.pos.z, 4, 0xb8953d);
    }
    const loot = rollLoot(Math.random, m.level, m.elite);
    const at = (i: number) => {
      const p = lv().grid.nearestFree(m.pos.x + Math.cos(i * 2.1) * 0.8, m.pos.z + Math.sin(i * 2.1) * 0.8) ?? m.pos;
      return p;
    };
    if (loot.item) { const p = at(0); field.add(p.x, p.z, loot.item, 0, null); }
    if (loot.gold) { const p = at(1); field.add(p.x, p.z, null, loot.gold, null); }
    if (loot.potion) { const p = at(2); field.add(p.x, p.z, null, 0, loot.potion); }
  };
  /** 院長倒下：必掉 1 傳奇 + 2 稀有 */
  const bossDown = (m: Monster) => {
    story.beatBoss();
    const k = BOSS.drops, spot = (i: number) => lv().grid.nearestFree(m.pos.x + Math.cos(i * 1.3) * 2.2, m.pos.z + Math.sin(i * 1.3) * 2.2) ?? m.pos;
    let i = 3;
    for (let n = 0; n < k.legends; n++) { const p = spot(i++); field.add(p.x, p.z, makeItem(Math.random, BOSS.level, 'legend'), 0, null); }
    for (let n = 0; n < k.rares; n++) { const p = spot(i++); field.add(p.x, p.z, makeItem(Math.random, BOSS.level, 'rare'), 0, null); }
    const p = spot(i); field.add(p.x, p.z, null, k.goldPerLevel * BOSS.level, null);
    save();
  };
  const pickup = (d: Drop) => {
    if (d.story) {
      if (d.story.kind === 'relic') { story.foundRelic(); say([RELIC_TEXT]); }
      else { story.foundPage(d.story.i); say([`院長日記 第 ${d.story.i + 1} 頁`, JOURNAL[d.story.i]]); }
      field.remove(d); save();
      return true;
    }
    if (d.item) {
      if (!hero.addItem(d.item)) { floats.add(player.pos.x, 2, player.pos.z, '背包已滿', 'gold'); return false; }
      panels.render();
    } else if (d.gold) { hero.gold += d.gold; hud.gold(hero.gold); }
    else if (d.potion) hero.potions[d.potion]++;
    field.remove(d);
    return true;
  };
  field.onClick = d => { pickGoal = d; player.moveTo({ x: d.x, z: d.z }); };
  player.onDodge = () => floats.add(player.pos.x, 1.9, player.pos.z, '閃避', 'gold');
  const skills = new Skills(player, vfx, () => monsters, () => lv().breakables);
  player.onHurt = n => {
    floats.add(player.pos.x, 1.9, player.pos.z, String(Math.round(n)), 'hurt');
    vfx.bump(FX.shakeHurt);
  };

  const smash = (b: Breakable) => {
    lv().remove(b);
    (world.broken[lv().d.floor] ??= []).push(b.index);
    debris.burst(b.pos.x, b.pos.z);
    if (Math.random() < 0.6) {
      hero.gold += MathUtils.randInt(BREAK.goldMin, BREAK.goldMax) * (lv().d.floor + 1);
      hud.gold(hero.gold);
    }
  };

  /** 去第 floor 層；arrive = 由邊條樓梯出現 */
  async function enter(floor: number, arrive: 'up' | 'down') {
    changing = true;
    hud.loading(placeName(floor));
    if (level) { level.dispose(); monsters.forEach(g => g.remove()); vfx.clear(); field.clear(); pickGoal = null; }
    npcs.forEach(n => n.remove()); npcs = [];
    await new Promise(r => setTimeout(r, 30));
    const d = floor < 0 ? townDungeon() : floor === 3 ? bossDungeon() : generate(world.seed, floor);
    level = await new Level(scene, d, aniso, quality.shadows, smash, world.broken[floor]).build();
    player.grid = lv().grid;
    pool.set(lv().fires);
    monsters = [];
    const dead = world.cleared[floor] ?? [];
    d.spawns.forEach((s, i) => { if (!dead.includes(i)) newMonster(s.type, s.x, s.z, s.level, s.traits).index = i; });
    if (floor < 0) npcs = (Object.keys(NPCS) as NpcId[]).map(id => new Npc(scene, player.gltf, id));
    if (d.relic && !story.relic) field.addStory(d.relic.x, d.relic.z, '失蹤者遺物', { kind: 'relic', i: 0 });
    (monsters.find(m => m instanceof Boss) as Boss | undefined)?.start();
    d.pages?.forEach((p, i) => { if (!story.pages[i]) field.addStory(p.x, p.z, `院長日記 第 ${i + 1} 頁`, { kind: 'page', i }); });
    const s = arrive === 'up' && floor >= 0 ? d.up : d.down;
    player.place(s.x, s.z + CELL);
    player.attackTarget = null;
    focus.copy(player.pos).setY(1);
    map.use(d);
    hud.floor(placeName(floor));
    hud.gold(hero.gold);
    world.floor = floor;
    changing = false; stairsGoal = null; talkGoal = null; stoneGoal = false;
    hud.loading(null);
    save();
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
    if (ray.ray.intersectPlane(chestPlane, hitPt)) for (const g of monsters) {
      if (g.dead || g.hidden || !g.model.visible) continue;
      const d = Math.hypot(hitPt.x - g.pos.x, hitPt.z - g.pos.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    if (best) return best;
    bestD = BREAK.reach;
    if (ray.ray.intersectPlane(lowPlane, hitPt)) for (const b of lv().breakables) {
      const d = Math.hypot(hitPt.x - b.pos.x, hitPt.z - b.pos.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  };
  const pickStairs = (): Stairs | null => {
    ray.setFromCamera(mouse, camera);
    if (!ray.ray.intersectPlane(floorPlane, hitPt)) return null;
    const d = lv().d;
    if (d.down.c >= 0 && stairsNear(d.down, hitPt.x, hitPt.z)) return d.down;
    if (d.up.c >= 0 && stairsNear(d.up, hitPt.x, hitPt.z)) return d.up;
    return null;
  };
  const pickNpc = () => {
    ray.setFromCamera(mouse, camera);
    if (!npcs.length || !ray.ray.intersectPlane(chestPlane, hitPt)) return null;
    return npcs.find(n => Math.hypot(hitPt.x - n.pos.x, hitPt.z - n.pos.z) < 0.9) ?? null;
  };
  const pickStone = () => {
    ray.setFromCamera(mouse, camera);
    if (!ray.ray.intersectPlane(chestPlane, hitPt)) return false;
    const w = lv().d.waystone;
    return Math.hypot(hitPt.x - w.x, hitPt.z - w.z) < 1;
  };
  const talk = (n: Npc) => {
    if (n.id === 'ge') {
      const ending = story.stage === 6, lines = story.talkGe();
      ui.dialog(n.name, 'ge', lines, ending ? [{ label: '收低呢頁', fn: () => ui.ending(ENDING.lines, ENDING.title, save) }] : []);
      save();
      return;
    }
    const mode = n.id === 'dala' ? 'smith' : 'herb';
    const open = () => { ui.openShop(mode, Math.random); if (!panels.invOpen) panels.toggle('inv'); };
    ui.dialog(n.name, n.id, [story.finished ? ENDING.after[n.id] : n.id === 'dala' ? DALA_TALK : HERB_TALK], [{ label: '買賣', fn: open }, { label: '離開', fn: () => {} }]);
  };
  const travel = () => {
    const here = lv().d.floor;
    if (!world.waypoints.includes(here)) world.waypoints.push(here);
    const opts = [...world.waypoints].sort((a, b) => a - b).filter(f => f !== here)
      .map(f => ({ label: placeName(f).split(' · ').pop()!, fn: () => { enter(f, 'up'); } }));
    ui.dialog('傳送石', null, [opts.length ? '石上嘅符文微微發光。去邊度？' : '石上嘅符文亮起。第一次觸碰，之後可以由呢度返嚟。'], [...opts, { label: '離開', fn: () => {} }]);
    save();
  };
  const busy = () => changing || !level || panels.open || ui.dialogOpen || !!ui.shopOpen || ui.blocking;
  const act = (fresh: boolean) => {
    if (busy()) return;
    if (fresh) { pickGoal = null; talkGoal = null; stoneGoal = false; }
    if (fresh) {
      const n = pickNpc();
      if (n) { talkGoal = n; player.moveTo({ x: n.pos.x + 1, z: n.pos.z + 1 }); return; }
      if (pickStone()) { stoneGoal = true; const w = lv().d.waystone; player.moveTo({ x: w.x, z: w.z + 1.4 }); return; }
    }
    const g = lv().d.floor >= 0 ? pick() : null;
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
  const aimPoint = () => {
    // 指住怪就瞄佢本人：滑鼠射線打落地面會落喺怪物後面，貼身時方向會錯
    const t = lv().d.floor >= 0 ? pick() : null;
    if (t) return { x: t.pos.x, z: t.pos.z };
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(floorPlane, hitPt);
    return { x: hitPt.x, z: hitPt.z };
  };
  renderer.domElement.addEventListener('pointerdown', e => {
    aim(e);
    if (e.button === 0) { held = true; holdTimer = NAV.holdRepeat; act(true); }
    if (e.button === 2 && !busy() && lv().d.floor >= 0) skills.press('heavy', aimPoint());
  });
  addEventListener('pointermove', aim);
  addEventListener('pointerup', () => { held = false; lockTarget = null; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keyup', e => { if (e.key === '3') skills.release('whirl'); if (e.key === 'Alt') field.showAll = false; });
  addEventListener('keydown', e => {
    const n = '1234'.indexOf(e.key);
    if (ui.blocking) { if (e.key === 'Escape' && document.getElementById('mBack')) ui.closeScreen(); return; }
    if (n >= 0 && !e.repeat && !busy() && lv().d.floor >= 0) skills.press(SKILL_ORDER[n], aimPoint());
    const k = e.key.toLowerCase();
    if (!e.repeat && k === 'i') panels.toggle('inv');
    if (!e.repeat && k === 'c' && !ui.shopOpen) panels.toggle('char');
    if (e.key === 'Alt') { e.preventDefault(); field.showAll = true; }
    if (!e.repeat && (k === 'q' || k === 'w') && !player.dead) {
      if (k === 'q' && hero.potions.hp > 0 && player.hp < player.maxHp) {
        hero.potions.hp--; player.hp = Math.min(player.maxHp, player.hp + player.maxHp * DROP.potionHeal);
      }
      if (k === 'w' && hero.potions.rage > 0 && player.rage < HERO.rageMax) {
        hero.potions.rage--; player.rage = Math.min(HERO.rageMax, player.rage + DROP.rageGain);
      }
    }
    if (e.key === 'Tab') { e.preventDefault(); mapOpen = !mapOpen; hud.showMap(mapOpen); }
    if (e.key === 'Escape') {
      const any = panels.open || mapOpen || ui.dialogOpen || !!ui.shopOpen;
      if (panels.open) panels.closeAll();
      if (mapOpen) { mapOpen = false; hud.showMap(false); }
      if (ui.dialogOpen) ui.closeDialog();
      if (ui.shopOpen) ui.closeShop();
      if (!any && level) {
        ui.menu(() => { encodeExplored(); exportFile(pack(hero, story, world)); }, loadImport, () => { save(); location.reload(); });
      }
    }
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

  place(distance);

  /** 讀入存檔資料，去返上次嘅地方 */
  const resume = (d: SaveData) => {
    restore(d, hero, story);
    Object.assign(world, structuredClone(d.world));
    for (const [k, v] of Object.entries(world.explored)) map.explored.set(Number(k), Uint8Array.from(v, c => Number(c)));
    player.refresh();
    player.hp = player.maxHp;
    ui.closeScreen();
    enter(world.floor, 'up');
  };
  const loadImport = async () => {
    const d = await importFile();
    if (!d) { ui.titleMsg('存檔檔案唔啱，冇改到任何嘢'); return; }
    if (!autostart) saveToDisk(d);
    if (level) location.reload(); else resume(d);
  };
  const newGame = () => {
    clearDisk();
    story.seenOpening = true;
    ui.opening(OPENING, () => enter(-1, 'down'));
  };

  const timer = new Timer();
  let stats = { calls: 0, tris: 0 };
  if (import.meta.env.DEV) renderer.info.autoReset = false;
  const tick = () => {
    requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
    if (import.meta.env.DEV) { stats = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.reset(); }
    if (held) { holdTimer -= dt; if (holdTimer <= 0) { holdTimer = NAV.holdRepeat; act(false); } }
    if (!changing && level) {
      player.speedMul = level.isWater(player.pos.x, player.pos.z) ? level.theme.speedInWater : 1;
      npcs.forEach(n => n.update(dt));
      if (lineLeft > 0) { lineLeft -= dt; if (lineLeft <= 0) hud.bossLine(null); }
      player.update(dt);
      skills.update(dt);
      for (const g of [...monsters]) {
        const far = g.pos.distanceTo(player.pos) > AI.active;
        if (far && !g.dead) { g.model.visible = false; continue; }
        if (!g.hidden) g.model.visible = true;
        g.update(dt, player, monsters);
        if (g.dead && !g.counted) { g.counted = true; kills++; }
      }
      monsters = monsters.filter(g => !g.gone);
      vfx.update(dt, player, lv().grid);
      if (player.dead && player.deadFor > HERO.respawnDelay) {
        // 死亡：損失 10% 金幣，返小鎮復活，地城進度保留
        hero.gold = Math.floor(hero.gold * (1 - DEATH_GOLD_LOSS));
        player.respawn(0, 0);
        enter(-1, 'down');
      }
      // 金幣行近自動撿；撳過嘅物品行到就撿
      for (const d of [...field.drops]) {
        const near = Math.hypot(d.x - player.pos.x, d.z - player.pos.z);
        if ((d.gold || d.potion) && near < 1.4) pickup(d);
        else if (d === pickGoal && near < 1.1) { pickup(d); pickGoal = null; }
      }
      const lamp = hero.has('lamp');
      if (lamp) for (const g of monsters) if (!g.dead) g.reveal(true);
      if (talkGoal && talkGoal.pos.distanceTo(player.pos) < 2.2) { const n = talkGoal; talkGoal = null; talk(n); }
      if (stoneGoal && Math.hypot(player.pos.x - level.d.waystone.x, player.pos.z - level.d.waystone.z) < 2.2) { stoneGoal = false; travel(); }
      // 行到樓梯就上落
      if (stairsGoal && !player.dead && Math.hypot(player.pos.x - stairsGoal.x, player.pos.z - stairsGoal.z) < CELL * 1.25) {
        const d = level.d, goDown = stairsGoal === d.down;
        if (goDown && d.floor < THEMES.length - 1) enter(d.floor + 1, 'up');
        else if (!goDown && d.floor > -1) enter(d.floor - 1, 'down');
        else stairsGoal = null;
      }
    }
    const fp = player.pos;
    if (level) { map.reveal(fp.x, fp.z); map.update(fp.x, fp.z, mapOpen); }
    if (!changing && level) {
      const d = level.d, town = d.floor < 0;
      const hover = town ? null : pick(), npc = pickNpc(), stone = !npc && pickStone(), st = hover || npc || stone ? null : pickStairs();
      hud.target(hover instanceof Boss ? null : hover ? (hover instanceof Monster ? { name: hover.name, hp: hover.hp, maxHp: hover.maxHp, elite: hover.elite } : { name: hover.name })
        : npc ? { name: npc.name } : stone ? { name: '傳送石' }
          : st ? { name: st === d.down ? (town ? '修道院大門：入地窖' : d.floor < 2 ? '落去下一層' : '落去院長之室') : (d.floor > 0 ? '返上一層' : '返回荒鐘鎮') } : null);
    }
    const boss = monsters.find(m => m instanceof Boss && !m.dead);
    hud.bossBar(boss ? { name: boss.name, hp: boss.hp, maxHp: boss.maxHp } : null);
    hud.progress(hero.xp, hero.level >= LEVELING.max ? 0 : xpToNext(hero.level), hero.potions.hp, hero.potions.rage, hero.statPoints + hero.skillPoints);
    hud.update(Math.round(player.hp), player.maxHp, player.rage, HERO.rageMax, story.stage === 3 ? `${story.questText}（${story.pagesFound}/3）` : story.questText, player.dead);
    focus.x += (fp.x - focus.x) * Math.min(1, CAMERA.followLerp * dt);
    focus.z += (fp.z - focus.z) * Math.min(1, CAMERA.followLerp * dt);
    distance += (wantDistance - distance) * Math.min(1, CAMERA.zoomLerp * dt);
    place(distance);
    if (vfx.shake > 0) camera.position.add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(vfx.shake * 2));
    hud.skills(skills, player.buffTime);
    floats.update(dt, camera);
    field.update(camera, t, changing);
    pool.update(t, camera, fp);
    embers.update(dt, t);
    dust.update(dt, t, fp);
    debris.update(dt);
    level?.update(t);
    composer.render(dt);
  };
  tick();
  document.getElementById('loading')!.remove();
  addEventListener('beforeunload', () => { if (level && !changing) save(); });

  if (autostart) await enter(Number(params.get('floor')) || 0, 'up');
  else {
    const disk = loadFromDisk();
    ui.title(!!disk, newGame, () => { if (disk) resume(disk); }, loadImport);
  }

  if (import.meta.env.DEV) {
    Object.assign(window, { __ashen: {
      player, camera, renderer, focus, Vector3, world, story, ui, save, map, kills: () => kills, gold: () => hero.gold,
      skills, vfx, MONSTERS, spawn: newMonster, hero, panels, field, makeItem, reward,
      legend(id: LegendId) { const it = makeItem(Math.random, 12, 'legend', id); hero.addItem(it); return it; },
      item(r: Rarity, lv = 8) { const it = makeItem(Math.random, lv, r); hero.addItem(it); return it; }, get monsters() { return monsters; }, get level() { return level; }, get npcs() { return npcs; }, get changing() { return changing; }, get stats() { return stats; },
      enter, snap() { focus.copy(player.pos).setY(1); },
    } });
  }
}

start();
