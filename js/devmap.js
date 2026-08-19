/* STATUS 1 - developer shooting range (strzelnica)
   A workbench map for iterating on weapons, bots and props: everything is
   unlocked, the wave director stays silent, and bots are spawned by hand at
   the crosshair. Entered from the main menu ("Strzelnica (dev)"); the range
   never touches the arena best score or the lifetime service stats
   (state.js / campaign_off.js check game.dev).
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. */
'use strict';

/* ==================== STRZELNICA (DEV) ==================== */

/* bot behaviour toggles, read by updateEnemies (enemies.js) */
let devHoldFire = true;   // T: spawned bots hold fire until released
let devHoldMove = false;  // Y: freeze bot movement (they keep facing the player)

/* a fixed, mostly-empty range: player at the south end looking north, target
   plates at ~16 m and ~38 m, light crate scatter for cover testing */
function devMapDef() {
  return {
    arena: {
      seed: 1337,
      half: ARENA_HALF,
      density: 0.12,
      style: 'open',
      theme: 'indigo',
      playerSpawn: { x: 0, z: 28, yaw: 0 },
      spawnPoints: null,
      pickups: [
        { kind: 'ammo', x: -8, z: 22, clearR: 2 },
        { kind: 'ammo', x: 8, z: 22, clearR: 2 },
        { kind: 'med', x: 0, z: 31, clearR: 2 },
      ],
      holos: null,
      setPieces: [
        { id: 'tgt1', kind: 'target', x: -6, z: 12 },
        { id: 'tgt2', kind: 'target', x: 0, z: 12 },
        { id: 'tgt3', kind: 'target', x: 6, z: 12 },
        { id: 'tgt4', kind: 'target', x: -3, z: -10 },
        { id: 'tgt5', kind: 'target', x: 3, z: -10 },
      ],
      seedHint: false,
    },
  };
}

function startDevMap() {
  game.mode = 'arena'; // the range reuses the whole arena plumbing
  game.missionId = null;
  game.dev = true;
  devHoldFire = true;
  devHoldMove = false;
  buildArena(devMapDef());
  startGame({ usePointerLock: !TEST });
  devSyncHud();
}

/* re-applied by resetLevelState() on every (re)start while game.dev is on:
   full unlock, silent wave director, deep pockets */
function devApplyLoadout() {
  waveSystem.paused = true;
  for (const w of WEAPONS) w.owned = true;
  game.credits = 100000;
  game.grenades = GRENADE_MAX;
  updateCreditsHud();
  updateGrenadeHud();
  updateWeaponHud();
}

/* --- dev keys (input.js forwards them only while game.dev && playing) --- */
const _devRay = new THREE.Raycaster();
const _devDir = new THREE.Vector3();

function devSpawnAtAim() {
  camera.getWorldDirection(_devDir);
  _devRay.set(camera.position, _devDir);
  _devRay.far = 90;
  const hits = _devRay.intersectObjects(worldGroup.children, false);
  const p = hits.length ? hits[0].point
    : _devDir.multiplyScalar(18).add(camera.position);
  const lim = arena.half - 2;
  spawnEnemy('scout', {
    at: { x: Math.max(-lim, Math.min(lim, p.x)),
          z: Math.max(-lim, Math.min(lim, p.z)) },
  });
}

function devKey(code) {
  switch (code) {
    case 'KeyB':
      devSpawnAtAim();
      break;
    case 'KeyT':
      devHoldFire = !devHoldFire;
      showCenterMsg(devHoldFire ? 'Boty: ogień wstrzymany' : 'Boty: ogień AKTYWNY', 1.4, !devHoldFire);
      break;
    case 'KeyY':
      devHoldMove = !devHoldMove;
      showCenterMsg(devHoldMove ? 'Boty: ruch zamrożony' : 'Boty: ruch aktywny', 1.4);
      break;
    case 'KeyK':
      while (enemies.length) killEnemy(enemies[0], true); // silent: no score, no drops
      showCenterMsg('Boty usunięte', 1.2);
      break;
    case 'KeyJ':
      player.hp = player.maxHp;
      for (const w of WEAPONS) { w.mag = w.magSize; w.reserve = w.maxReserve; }
      game.grenades = GRENADE_MAX;
      updateHpHud();
      updateWeaponHud();
      updateGrenadeHud();
      showCenterMsg('Uzupełniono HP / amunicję / granaty', 1.4);
      break;
    case 'KeyH':
      openDevRig(); // grip editor (js/devrig.js)
      return;       // it owns the state from here; no HUD resync
    case 'KeyP':
      // rebuild the range (shot-out target plates come back); enemies survive
      clearPickups();
      buildArena(devMapDef());
      placeArenaPickups();
      showCenterMsg('Strzelnica odbudowana', 1.4);
      break;
    default:
      return;
  }
  devSyncHud();
}

function devSyncHud() {
  el('dev-fire').textContent = devHoldFire ? 'wstrzymany [T]' : 'AKTYWNY [T]';
  el('dev-move').textContent = devHoldMove ? 'zamrożony [Y]' : 'aktywny [Y]';
}

el('btn-menu-dev').addEventListener('click', () => startDevMap());
