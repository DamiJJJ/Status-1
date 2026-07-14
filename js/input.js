/* NEON ARENA — keyboard, mouse, screen buttons
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== WEJŚCIE ==================== */

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

el('btn-start').addEventListener('click', () => startArena());
el('btn-resume').addEventListener('click', resumeGame);
el('btn-restart-pause').addEventListener('click', restartGame);
el('btn-quit-pause').addEventListener('click', quitToMenu);
el('btn-restart-over').addEventListener('click', restartGame);
el('btn-restart-win').addEventListener('click', restartGame);
el('btn-shop-continue').addEventListener('click', continueFromShop);
el('btn-endless').addEventListener('click', startEndless);
// campaign screens
el('btn-campaign').addEventListener('click', () => openLevels());
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
  if (e.repeat) return;
  keys[e.code] = true;
  const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
  if (game.state === 'playing') {
    if (e.code === 'KeyR') startReload();
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
document.addEventListener('wheel', e => {
  if (game.state !== 'playing') return;
  const dir = e.deltaY > 0 ? 1 : -1;
  // scroll pomija bronie, których gracz jeszcze nie kupił
  let i = currentWeapon;
  for (let n = 0; n < WEAPONS.length; n++) {
    i = (i + dir + WEAPONS.length) % WEAPONS.length;
    if (WEAPONS[i].owned) break;
  }
  switchWeapon(i);
});
