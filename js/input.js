/* NEON ARENA — keyboard, mouse, screen buttons
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== WEJŚCIE ==================== */

/* --- browser-shortcut shield ---
   The game binds Ctrl (crouch/slide) next to held WSAD, so the browser sees
   Ctrl+W (close tab!), Ctrl+T/N (new tab/window), Ctrl+D, Ctrl+1..4 mid-fight.
   Three layers:
   (1) preventDefault below: game keys + every Ctrl-combination while a run is
       on screen — kills the preventable shortcuts (bookmark, save, tab 1..4);
   (2) Keyboard Lock (Chrome, ACTIVE ONLY IN FULLSCREEN): with these codes
       locked the browser delivers even Ctrl+W/T/N to the page, where layer 1
       eats them — fullscreen entry lives in lockPointer() (SETTINGS.fullscreen);
   (3) beforeunload prompt (bottom of this file): windowed Ctrl+W cannot be
       prevented, but an active run turns it into a "leave site?" question.
   Escape stays UNLOCKED on purpose — it must keep exiting pointer lock. */
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyG', 'KeyR',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'Digit1', 'Digit2', 'Digit3', 'Digit4']);
const SHIELD_STATES = new Set(['playing', 'paused', 'shop', 'settings']);
if (navigator.keyboard && navigator.keyboard.lock) {
  navigator.keyboard.lock([...GAME_KEYS, 'KeyT', 'KeyN']).catch(() => { /* unsupported */ });
}

controls.addEventListener('lock', () => {
  if (wantLock) { wantLock = false; beginPlaying(); }
});
controls.addEventListener('unlock', () => {
  if (game.state === 'playing') pauseGame();
});
document.addEventListener('pointerlockerror', () => {
  // the browser refused the lock (e.g. Chrome's ~1.25 s cooldown after an ESC
  // exit) — do NOT start playing blind: show the overlay and wait for a fresh
  // click gesture; starting anyway used to leave the game unplayable (BUG-1)
  if (wantLock) showScreen('lock');
});
el('btn-lock-retry').addEventListener('click', () => {
  if (wantLock) lockPointer(); // click = fresh gesture; 'lock' event starts play
});
el('btn-lock-skip').addEventListener('click', () => {
  // explicit opt-in to the old behavior (mouse not captured)
  if (wantLock) { wantLock = false; beginPlaying(); }
});

// main menu (MENU-1) + arena entry
el('btn-menu-campaign').addEventListener('click', () => openLevels());
el('btn-menu-arena').addEventListener('click', () => openArenaEntry());
el('btn-menu-armory').addEventListener('click', () => openArmoryFromMenu());
el('btn-menu-stats').addEventListener('click', () => openStats());
el('btn-stats-back').addEventListener('click', () => backToMenu());
el('btn-start-back').addEventListener('click', () => backToMenu());
el('btn-start').addEventListener('click', () => startArena());
el('btn-resume').addEventListener('click', resumeGame);
el('btn-restart-pause').addEventListener('click', restartGame);
el('btn-quit-pause').addEventListener('click', quitToMenu);
el('btn-restart-over').addEventListener('click', restartGame);
el('btn-restart-win').addEventListener('click', restartGame);
el('btn-shop-continue').addEventListener('click', continueFromShop);
el('btn-endless').addEventListener('click', startEndless);
// campaign screens
el('btn-campaign-back').addEventListener('click', () => backToMenu());
el('btn-campaign-new').addEventListener('click', () => newCampaign());
el('btn-armory').addEventListener('click', () => openArmory(null));
el('btn-brief-start').addEventListener('click', () => startBriefedMission());
el('btn-debrief-continue').addEventListener('click', () => debriefContinue());
el('btn-debrief-replay').addEventListener('click', () => restartMission());
el('btn-mission-retry').addEventListener('click', () => restartMission());
el('btn-mfail-armory').addEventListener('click', () => openArmory(game.missionId));
el('btn-mfail-levels').addEventListener('click', () => openLevels());
el('screen-brief').addEventListener('click', e => {
  if (game.state === 'brief' && !twDone && e.target.id !== 'btn-brief-start') skipTypewriter();
});
for (const b of document.querySelectorAll('#diff-seg .seg-btn')) {
  b.addEventListener('click', () => setDifficulty(b.dataset.diff));
}

document.addEventListener('keydown', e => {
  // shield layer 1 — MUST run before the e.repeat early-out: the held W that
  // turns into Ctrl+W arrives as a repeat event
  if (SHIELD_STATES.has(game.state) && (GAME_KEYS.has(e.code) || e.ctrlKey)) {
    e.preventDefault();
  }
  if (e.repeat) return;
  keys[e.code] = true;
  const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
  if (game.state === 'playing') {
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyG') throwGrenade();
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'Digit3') switchWeapon(2);
    if (e.code === 'Digit4') switchWeapon(3);
  } else if ((game.state === 'over' || game.state === 'won') && e.code === 'KeyR') {
    restartGame();
  } else if (game.state === 'mfail' && e.code === 'KeyR') {
    restartMission();
  } else if (game.state === 'shop' && enter) {
    continueFromShop();
  } else if (game.state === 'brief' && enter) {
    if (!twDone) skipTypewriter(); else startBriefedMission();
  } else if (game.state === 'debrief' && enter) {
    debriefContinue();
  } else if (game.state === 'stats' && (e.code === 'Escape' || enter)) {
    backToMenu();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

document.addEventListener('mousedown', e => {
  if (game.state !== 'playing') return;
  if (e.button === 0) firing = true;
  if (e.button === 2) setAiming(true);
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) firing = false;
  if (e.button === 2) setAiming(false);
});
document.addEventListener('contextmenu', e => e.preventDefault());
// passive:false — the default passive document listener cannot preventDefault,
// and Ctrl+wheel while playing would zoom the whole page
document.addEventListener('wheel', e => {
  if (game.state !== 'playing') return;
  e.preventDefault();
  const dir = e.deltaY > 0 ? 1 : -1;
  // scroll pomija bronie, których gracz jeszcze nie kupił
  let i = currentWeapon;
  for (let n = 0; n < WEAPONS.length; n++) {
    i = (i + dir + WEAPONS.length) % WEAPONS.length;
    if (WEAPONS[i].owned) break;
  }
  switchWeapon(i);
}, { passive: false });

/* shield layer 3: an unpreventable close/reload (windowed Ctrl+W, F5, Ctrl+F4)
   during an active run raises the native "leave site?" prompt instead of
   silently killing the game. Menus stay unarmed (normal navigation must not
   nag); TEST skips it — automation navigates pages mid-run all the time. */
window.addEventListener('beforeunload', e => {
  if (TEST) return;
  const midRun = game.state === 'playing' || game.state === 'paused'
    || game.state === 'shop'
    || (game.state === 'settings' && settingsReturn === 'pause');
  if (midRun) {
    e.preventDefault();
    e.returnValue = '';
  }
});
