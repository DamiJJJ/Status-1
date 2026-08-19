/* NEON ARENA — main game loop
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== GŁÓWNA PĘTLA ==================== */

let lastTime = performance.now();
let menuBgWas = null; // last body.menu-bg state (HUD hidden on the panorama)

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  __test.t = (__test.t || 0) + dt;
  __test.frames = (__test.frames || 0) + 1;

  if (game.state === 'playing') {
    updatePlayer(dt);
    updateWeapons(dt);
    updateGrenades(dt);
    updateEnemies(dt);
    updatePickups(dt);
    waveSystem.update(dt);
    if (game.mode === 'campaign') mission.update(dt);
    if (TEST === 'shoot') testAutoAim();
    if (TEST === 'win' && waveSystem.active) {
      // fast-forward the waves: kill bots on sight
      if (enemies.length > 0) killEnemy(enemies[0]);
    }
  }
  AudioSys.update(dt); // stateful audio (heartbeat / breathing); no-op pre-init
  updateFx(dt);
  updateWorldFx(dt);
  updateProps(dt);
  updateRadio(dt);
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
  __test.mode = game.mode;
  __test.difficulty = game.difficulty;
  // pointer lock state vs intent — a mismatch is exactly the old BUG-1
  __test.pointerLock = !!document.pointerLockElement;
  __test.wantLock = wantLock;
  __test.crouch = player.crouching;
  __test.eyeH = Math.round(player.eyeH * 100) / 100;
  __test.slide = player.sliding;
  __test.grenades = game.grenades;
  __test.pressure = waveSystem.pressure;
  __test.radioHold = radioHoldT > 0;
  __test.dev = game.dev;
  // dev range: the key-help panel rides only with an active dev session
  document.body.classList.toggle('dev-mode',
    game.dev && (game.state === 'playing' || game.state === 'paused'));
  __test.mission = (game.mode === 'campaign' && mission.def) ? {
    id: mission.def.id,
    active: mission.active,
    time: Math.round(mission.time * 10) / 10,
    kills: mission.kills,
    objectives: mission.objectives.map(o => ({
      id: o.def.id, type: o.def.type, state: o.state,
      cur: Math.round(o.cur * 10) / 10, max: o.max,
    })),
  } : null;

  // MENU-1: navigation screens render the animated city panorama instead of
  // the game world — retarget the shared render pass (bloom stays in place)
  const onMenuBg = menuBgActive();
  const onBestiary = game.state === 'bestiary';   // navigation layer, own scene
  const onDevRig = game.state === 'devrig';      // grip editor, own scene too
  if (onDevRig) DevRig.update(dt);
  else if (onBestiary) Bestiary.update(dt);
  else if (onMenuBg) MenuBg.update(dt);
  renderPass.scene = onDevRig ? DevRig.scene
    : (onBestiary ? Bestiary.scene : (onMenuBg ? MenuBg.scene : scene));
  renderPass.camera = onDevRig ? DevRig.camera
    : (onBestiary ? Bestiary.camera : (onMenuBg ? MenuBg.camera : camera));
  // the editor screen is transparent, so the gameplay HUD would bleed through
  document.body.classList.toggle('devrig', onDevRig);
  if (onMenuBg !== menuBgWas) {
    // the transparent menu screen would let the gameplay HUD bleed through
    menuBgWas = onMenuBg;
    document.body.classList.toggle('menu-bg', onMenuBg);
    AudioSys.menuMusic(onMenuBg); // the menu theme rides with the panorama
  }
  __test.menuBg = onMenuBg;
  __test.bestiary = onBestiary ? BESTIARY[Bestiary.index()].type : null;
  __test.devrig = onDevRig ? `${WEAPONS[devRigWeapon].id}:${devRigHand}` : null;

  // the run smears the edges of the frame; navigation screens and a frozen
  // paused world must never carry it
  setSprintBlur(game.state === 'playing' ? sprintBlend : 0);

  composer.render();
}

/* bootstrap: every script has executed by now — build the initial world.
   (The arena is no longer built at world.js parse time, so it can be
   rebuilt at runtime for campaign missions.) */
buildArena(arenaModeDef());
MenuBg.build();       // the panorama greets the player on frame one
renderMenuMeta();     // campaign/record summary under the menu buttons
updateHpHud();
updateWeaponHud();
requestAnimationFrame(tick);
