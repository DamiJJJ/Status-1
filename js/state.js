/* NEON ARENA — game states, screens, start/pause/reset
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== STANY GRY ==================== */

const game = {
  state: 'menu',   // menu | playing | paused | shop | over | won
  score: 0,
  credits: 0,
  endless: false,
  dmgMul: 1,       // mnożnik obrażeń (sklep)
  reloadMul: 1,    // mnożnik czasu przeładowania (sklep)
  best: Number(localStorage.getItem('neonarena_best') || 0),
};

const screens = {
  start: el('screen-start'),
  pause: el('screen-pause'),
  over: el('screen-over'),
  win: el('screen-win'),
  shop: el('screen-shop'),
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

function startGame({ usePointerLock = true } = {}) {
  AudioSys.init();
  AudioSys.startMusic();
  resetGameState();
  if (TEST && TEST_WAVE > 0) waveSystem.wave = TEST_WAVE - 1; // testy: start od zadanej fali
  if (usePointerLock) {
    wantLock = true;
    lockPointer();
    // stan przełączy się w evencie 'lock' (lub w 'pointerlockerror' jako fallback)
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
    localStorage.setItem('neonarena_best', String(game.best));
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

function gameOver() { endMatch(false); }
function victory() { endMatch(true); }

function resetGameState() {
  // stop heartbeat/breath loops and reopen the damage-muffle filter
  AudioSys.resetFx();
  // usuń wrogów
  for (let i = enemies.length - 1; i >= 0; i--) {
    enemiesGroup.remove(enemies[i].group);
  }
  enemies.length = 0;
  // remove pickups (incl. their screen markers)
  clearPickups();
  // schowaj efekty
  for (const p of particles) p.mesh.visible = false;
  for (const t of tracers) t.mesh.visible = false;
  for (const d of decals) d.visible = false;
  for (const f of enemyFlashes) f.mesh.visible = false;
  for (const d of dmgInds) { d.life = 0; d.el.style.opacity = 0; }
  muzzleLight.intensity = 0;
  muzzleFlashMesh.material.opacity = 0;

  // gracz
  player.hp = player.maxHp;
  player.vel.set(0, 0, 0);
  player.pos.set(0, PLAYER_EYE, 26);
  player.sprinting = false;
  swayPitchPrev = 0;
  swayAmp = 0;
  camera.rotation.set(0, 0, 0);
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();

  // sklep / ulepszenia
  game.credits = 0;
  game.endless = false;
  game.dmgMul = 1;
  game.reloadMul = 1;
  player.maxHp = 100;
  for (const item of SHOP_ITEMS) item.level = 0;
  updateCreditsHud();

  // bronie (przywróć wartości bazowe; zostaje tylko pistolet)
  for (const w of WEAPONS) {
    w.magSize = w.baseMag;
    w.maxReserve = w.baseMaxReserve;
    w.mag = w.magSize;
    w.reserve = w.startReserve;
    w.owned = w.id === 'pistol';
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

  // fale i wynik
  game.score = 0;
  scoreEl.textContent = '0';
  waveSystem.reset();
  placeInitialPickups();

  updateHpHud();
  updateWeaponHud();
  updateWaveHud();
  updateEnemiesHud();
  centerMsgEl.style.opacity = 0;
  damageFlash = 0;
  damageFlashEl.style.opacity = 0;
}

function restartGame() {
  hideScreens();
  startGame({ usePointerLock: !TEST });
}
