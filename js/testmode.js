/* NEON ARENA — test modes (?test=...) and automation hooks
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== TRYBY TESTOWE ==================== */

const _aimTarget = new THREE.Vector3();
function testAutoAim() {
  // najbliższy żywy wróg
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = e.group.position.distanceToSquared(player.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) { firing = false; return; }
  _aimTarget.copy(best.group.position);
  _aimTarget.y = 1.85 * best.type.scale; // celuj w głowę (weryfikacja headshotów)
  camera.lookAt(_aimTarget);
  if (!aiming) setAiming(true); // testy strzelają z ADS (rozrzut z biodra jest celowo duży)
  firing = true;
}

if (TEST) {
  // automatyczny start bez pointer locka
  setTimeout(() => startGame({ usePointerLock: false }), 300);
  if (TEST === 'over') {
    setTimeout(() => playerTakeDamage(9999), 3500);
  }
}
// hooki do testów automatycznych (nieszkodliwe w normalnej grze)
window.__addCredits = n => addCredits(n);
window.__buyItem = id => buyShopItem(id);
