/* NEON ARENA — main game loop
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== GŁÓWNA PĘTLA ==================== */

let lastTime = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  __test.t = (__test.t || 0) + dt;
  __test.frames = (__test.frames || 0) + 1;

  if (game.state === 'playing') {
    updatePlayer(dt);
    updateWeapons(dt);
    updateEnemies(dt);
    updatePickups(dt);
    waveSystem.update(dt);
    if (TEST === 'shoot') testAutoAim();
    if (TEST === 'win' && waveSystem.active) {
      // szybkie „przewinięcie" fal: zabijaj boty od razu
      if (enemies.length > 0) killEnemy(enemies[0]);
    }
  }
  updateFx(dt);
  updateHudFx(dt);

  // diagnostyka
  __test.state = game.state;
  __test.hp = player.hp;
  __test.score = game.score;
  __test.wave = waveSystem.wave;
  __test.enemies = enemies.length;
  __test.ammo = `${WEAPONS[currentWeapon].mag}/${WEAPONS[currentWeapon].reserve}`;
  __test.fov = Math.round(camera.fov * 10) / 10;
  __test.reloading = reloading;
  __test.credits = game.credits;
  __test.endless = game.endless;
  __test.hopBoost = Math.round(player.hopBoost * 100) / 100;

  composer.render();
}

updateHpHud();
updateWeaponHud();
requestAnimationFrame(tick);
