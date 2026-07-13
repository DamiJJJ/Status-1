/* NEON ARENA — game states, screens, start/pause/reset
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== STANY GRY ==================== */

const game = {
  state: 'menu',   // menu | playing | paused | shop | over | won
  mode: 'arena',   // 'arena' (endless waves) | 'campaign' — do NOT overload `endless`
  missionId: null,
  difficulty: 'normal',
  score: 0,
  credits: 0,
  endless: false,  // arena mode past the final wave
  noCombat: false, // campaign epilogue: weapons stowed, crosshair hidden
  dmgMul: 1,       // damage multiplier (shop)
  reloadMul: 1,    // reload-time multiplier (shop)
  // arena best score; reads pre-rename keys as fallback (migration)
  best: Number(localStorage.getItem('status1_best')
    || localStorage.getItem('czynnasluzba_best')
    || localStorage.getItem('neonarena_best') || 0),
};

const screens = {
  start: el('screen-start'),
  pause: el('screen-pause'),
  over: el('screen-over'),
  win: el('screen-win'),
  shop: el('screen-shop'),
  campaign: el('screen-campaign'),
  brief: el('screen-brief'),
  debrief: el('screen-debrief'),
  mfail: el('screen-mfail'),
};

function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('visible', k === name);
}
function hideScreens() {
  for (const k in screens) screens[k].classList.remove('visible');
}

let wantLock = false; // czy kliknięto Graj/Wznów i czekamy na pointer lock

function beginPlaying() {
  game.state = 'playing';
  hideScreens();
}

/* arena mode entry: always rebuild the default arena first — the campaign
   may have left a mission layout behind */
function startArena() {
  game.mode = 'arena';
  game.missionId = null;
  buildArena(arenaModeDef());
  startGame({ usePointerLock: !TEST });
}

function startGame({ usePointerLock = true } = {}) {
  AudioSys.init();
  AudioSys.startMusic();
  resetGameState();
  if (TEST && TEST_WAVE > 0) waveSystem.wave = TEST_WAVE - 1; // tests: start at wave N (arena only)
  if (usePointerLock) {
    wantLock = true;
    lockPointer();
    // the state flips in the 'lock' event (or 'pointerlockerror' as fallback)
  } else {
    beginPlaying();
  }
}

function resumeGame() {
  AudioSys.init();
  if (TEST) { beginPlaying(); return; }
  wantLock = true;
  lockPointer();
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  firing = false;
  setAiming(false);
  el('pause-score').textContent = game.score;
  el('pause-wave').textContent = Math.max(1, waveSystem.wave);
  showScreen('pause');
}

function endMatch(won) {
  game.state = won ? 'won' : 'over';
  firing = false;
  setAiming(false);
  if (game.score > game.best) {
    game.best = game.score;
    try { localStorage.setItem('status1_best', String(game.best)); } catch (e) { /* ignore */ }
  }
  if (document.pointerLockElement) document.exitPointerLock();
  if (won) {
    el('win-score').textContent = game.score;
    el('win-best').textContent = game.best;
    showScreen('win');
    AudioSys.win();
  } else {
    el('over-score').textContent = game.score;
    el('over-wave').textContent = Math.max(1, waveSystem.wave);
    el('over-best').textContent = game.best;
    showScreen('over');
    AudioSys.lose();
  }
}

function gameOver() {
  if (game.mode === 'campaign') { mission.fail('death'); return; }
  endMatch(false);
}
function victory() { endMatch(true); } // arena only; the campaign never calls it

/* RUN state — the progression: score, credits, shop levels, weapon ownership.
   Wiped on: new arena game, new campaign run. NOT touched between campaign
   missions (upgrades and credits carry over). */
function resetRunState() {
  game.score = 0;
  game.endless = false;
  game.credits = 0;
  for (const item of SHOP_ITEMS) item.level = 0;
  applyAllShopEffects(); // idempotent: derives maxHp/mults/mags/ownership from levels
  scoreEl.textContent = '0';
  updateCreditsHud();
}

/* LEVEL state — the world & the body: enemies, pickups, FX pools, player
   HP/position/camera, ammo, wave system. Wiped on every mission start and
   restart; shop upgrades and credits SURVIVE this. */
function resetLevelState() {
  // stop heartbeat/breath loops and reopen the damage-muffle filter
  AudioSys.resetFx();
  // remove enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    enemiesGroup.remove(enemies[i].group);
  }
  enemies.length = 0;
  // remove pickups (incl. their screen markers)
  clearPickups();
  // hide pooled FX
  for (const p of particles) p.mesh.visible = false;
  for (const t of tracers) t.mesh.visible = false;
  for (const d of decals) d.visible = false;
  for (const f of enemyFlashes) f.mesh.visible = false;
  for (const d of dmgInds) { d.life = 0; d.el.style.opacity = 0; }
  muzzleLight.intensity = 0;
  muzzleFlashMesh.material.opacity = 0;

  // player — spawn comes from the currently built arena
  player.hp = player.maxHp;
  player.vel.set(0, 0, 0);
  player.pos.set(arena.playerSpawn.x, PLAYER_EYE, arena.playerSpawn.z);
  player.sprinting = false;
  swayPitchPrev = 0;
  swayAmp = 0;
  camera.rotation.set(0, arena.playerSpawn.yaw || 0, 0);
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();

  game.noCombat = false;
  el('crosshair').style.display = '';

  // weapons: refill ammo, keep upgrades. The reserve scales with the bought
  // mag upgrade — refilling to the base value would feel like a demotion.
  for (const w of WEAPONS) {
    w.mag = w.magSize;
    w.reserve = Math.round(w.startReserve * (w.maxReserve / w.baseMaxReserve));
  }
  viewmodels[currentWeapon].visible = false;
  currentWeapon = 0;
  viewmodels[0].visible = true;
  reloading = false;
  fireCooldown = 0;
  firing = false;
  adsBlend = 0;
  setAiming(false);
  hideReloadHud();

  waveSystem.reset();
  placeArenaPickups();

  updateHpHud();
  updateWeaponHud();
  updateWaveHud();
  updateEnemiesHud();
  centerMsgEl.style.opacity = 0;
  damageFlash = 0;
  damageFlashEl.style.opacity = 0;
}

/* arena mode: a fresh run — behavior identical to the historical reset */
function resetGameState() {
  resetRunState();
  resetLevelState();
}

function restartGame() {
  if (game.mode === 'campaign') { restartMission(); return; }
  hideScreens();
  startGame({ usePointerLock: !TEST });
}
