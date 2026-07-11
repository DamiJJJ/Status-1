/* NEON ARENA — HUD: bars, messages, hitmarker
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== HUD ==================== */

const el = id => document.getElementById(id);
const hpValueEl = el('hp-value'), hpFillEl = el('hp-fill');
const scoreEl = el('score-value'), waveEl = el('wave-value'), enemiesEl = el('enemies-value');
const creditsEl = el('credits-value');
const ammoMagEl = el('ammo-mag'), ammoReserveEl = el('ammo-reserve'), weaponNameEl = el('weapon-name');
const ammoRowEl = el('ammo-row');
const centerMsgEl = el('center-msg');
const hitmarkerEl = el('hitmarker');
const damageFlashEl = el('damage-flash');

let damageFlash = 0;
let hitmarkerTimer = 0;
let centerMsgTimer = 0;

function updateHpHud() {
  hpValueEl.textContent = Math.ceil(player.hp);
  const pct = (player.hp / player.maxHp) * 100;
  hpFillEl.style.width = `${pct}%`;
  const low = player.hp <= 30;
  hpValueEl.classList.toggle('low', low);
  hpFillEl.classList.toggle('low', low);
}

function updateWeaponHud() {
  const w = WEAPONS[currentWeapon];
  weaponNameEl.textContent = w.name;
  ammoMagEl.textContent = w.mag;
  ammoReserveEl.textContent = `/ ${w.reserve}`;
  ammoRowEl.classList.toggle('empty', w.mag === 0);
  for (let i = 1; i <= 4; i++) {
    el(`wslot-${i}`).classList.toggle('active', i - 1 === currentWeapon);
    el(`wslot-${i}`).classList.toggle('locked', !WEAPONS[i - 1].owned);
  }
}

function updateWaveHud() {
  if (waveSystem.wave === 0) { waveEl.textContent = '–'; return; }
  waveEl.textContent = game.endless
    ? `${waveSystem.wave}` : `${waveSystem.wave}/${TOTAL_WAVES}`;
}

function updateEnemiesHud() {
  enemiesEl.textContent = enemies.length + waveSystem.pending.length;
}

function addScore(n) {
  game.score += n;
  scoreEl.textContent = game.score;
}

function addCredits(n) {
  game.credits += n;
  updateCreditsHud();
}

function updateCreditsHud() {
  creditsEl.textContent = game.credits;
}

function showCenterMsg(text, dur = 1.5, warn = false) {
  centerMsgEl.textContent = text;
  centerMsgEl.classList.toggle('warn', warn);
  centerMsgEl.style.opacity = 1;
  centerMsgTimer = dur;
}

function showHitmarker(kill, head = false) {
  hitmarkerEl.classList.toggle('kill', kill);
  hitmarkerEl.classList.toggle('head', head && !kill);
  hitmarkerEl.style.opacity = 1;
  hitmarkerTimer = head ? 0.16 : 0.12;
}

function updateHudFx(dt) {
  if (damageFlash > 0) {
    damageFlash = Math.max(0, damageFlash - dt * 1.6);
    damageFlashEl.style.opacity = damageFlash;
  }
  if (hitmarkerTimer > 0) {
    hitmarkerTimer -= dt;
    if (hitmarkerTimer <= 0) hitmarkerEl.style.opacity = 0;
  }
  if (centerMsgTimer > 0) {
    centerMsgTimer -= dt;
    if (centerMsgTimer <= 0) centerMsgEl.style.opacity = 0;
  }
  updateDamageIndicators(dt);
}
