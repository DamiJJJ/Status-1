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
  // przeglądarka odmówiła pointer locka — graj mimo to (mysz bez przechwycenia)
  if (wantLock) { wantLock = false; beginPlaying(); }
});

el('btn-start').addEventListener('click', () => startGame({ usePointerLock: !TEST }));
el('btn-resume').addEventListener('click', resumeGame);
el('btn-restart-pause').addEventListener('click', restartGame);
el('btn-restart-over').addEventListener('click', restartGame);
el('btn-restart-win').addEventListener('click', restartGame);
el('btn-shop-continue').addEventListener('click', continueFromShop);
el('btn-endless').addEventListener('click', startEndless);

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (game.state === 'playing') {
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'Digit3') switchWeapon(2);
    if (e.code === 'Digit4') switchWeapon(3);
  } else if ((game.state === 'over' || game.state === 'won') && e.code === 'KeyR') {
    restartGame();
  } else if (game.state === 'shop' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
    continueFromShop();
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
