/* NEON ARENA — test modes (?test=...) and automation hooks
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== TRYBY TESTOWE ==================== */

const _aimTarget = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _aimRay = new THREE.Raycaster();
function testAutoAim() {
  // nearest living enemy
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = e.group.position.distanceToSquared(player.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) { firing = false; return; }
  _aimTarget.copy(best.group.position);
  // aim at the head (headshot verification); fliers hover at flyY
  _aimTarget.y = best.flyY ? best.flyY : 1.85 * best.type.scale * best.scaleMul;
  camera.lookAt(_aimTarget);
  if (!aiming) setAiming(true); // tests fire from ADS (hip spread is deliberately huge)
  // fire only with a clear line of sight — like a player would; blind fire
  // through corridor walls just drains the reserve into the bricks
  _aimDir.copy(_aimTarget).sub(camera.position);
  const dist = _aimDir.length();
  _aimRay.set(camera.position, _aimDir.divideScalar(dist));
  _aimRay.far = dist;
  firing = _aimRay.intersectObjects(worldGroup.children, false).length === 0;
}

if (TEST === 'mission') {
  // campaign autostart: fresh run, no pointer lock, optional difficulty
  setTimeout(() => {
    if (TEST_DIFF && DIFFICULTIES[TEST_DIFF]) game.difficulty = TEST_DIFF;
    window.__startMission(TEST_MISSION || MISSIONS[0].id);
  }, 300);
} else if (TEST) {
  // arena autostart without pointer lock
  setTimeout(() => startArena(), 300);
  if (TEST === 'over') {
    setTimeout(() => playerTakeDamage(9999), 3500);
  }
}
// hooks for automated tests (harmless in a normal game)
window.__addCredits = n => addCredits(n);
window.__buyItem = id => buyShopItem(id);
window.__rebuildArena = seed => {
  const def = arenaModeDef();
  if (Number.isFinite(seed) && seed > 0) def.arena.seed = seed;
  buildArena(def);
};
window.__killAll = () => { while (enemies.length) killEnemy(enemies[0]); };
window.__teleport = (x, z) => { player.pos.set(x, PLAYER_EYE, z); };
window.__startMission = id => {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('czynnasluzba_save'); // legacy migration fallback
  } catch (e) { /* ignore */ }
  startMission(id, { freshRun: true });
};
