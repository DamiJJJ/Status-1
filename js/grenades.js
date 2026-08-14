/* STATUS 1 — grenades (PROP-4): arc physics, bounces, AoE damage
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== GRANATY ==================== */

const GRENADE_START = 2;  // grenades at every level start (arena run & mission)
const GRENADE_MAX = 4;
const GRENADE_FUSE = 1.7;
const GRENADE_RADIUS = 4.5;   // blast radius in meters
const GRENADE_DMG = 95;       // at the centre; falls off linearly to the edge
const GRENADE_SELF_MUL = 0.5; // the blast hurts the thrower too (half strength)

/* pooled projectiles — never create meshes mid-fight (same rule as effects.js);
   the group lives in `scene`, NOT worldGroup: grenades must not eat player
   bullets or block bot LOS */
const grenadeGroup = new THREE.Group();
scene.add(grenadeGroup);

const grenadePool = [];
const GRENADE_POOL = 6;
{
  const bodyGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e3155, roughness: 0.5, metalness: 0.3, flatShading: true });
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0x1a0b00, emissive: PALETTE.red, emissiveIntensity: 2.2, roughness: 0.5 });
  for (let i = 0; i < GRENADE_POOL; i++) {
    const m = new THREE.Mesh(bodyGeo, bodyMat);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), fuseMat);
    tip.position.y = 0.09;
    m.add(tip);
    m.visible = false;
    grenadeGroup.add(m);
    grenadePool.push({ mesh: m, vel: new THREE.Vector3(), fuse: 0, active: false });
  }
}

let nadeCooldown = 0;
const _nadeDir = new THREE.Vector3();
const _nadeHit = new THREE.Vector3();

function throwGrenade() {
  if (game.state !== 'playing' || game.noCombat) return;
  if (nadeCooldown > 0) return;
  if (game.grenades <= 0) {
    AudioSys.empty();
    showCenterMsg('Brak granatów', 1.1, true);
    return;
  }
  const g = grenadePool.find(n => !n.active);
  if (!g) return;
  nadeCooldown = 0.5;
  game.grenades--;
  camera.getWorldDirection(_nadeDir);
  g.mesh.position.copy(camera.position).addScaledVector(_nadeDir, 0.5);
  g.mesh.position.y -= 0.12;
  g.vel.copy(_nadeDir).multiplyScalar(15);
  g.vel.y += 3.2;                  // slight up-arc on top of the view direction
  g.vel.x += player.vel.x * 0.35;  // inherit part of the run momentum
  g.vel.z += player.vel.z * 0.35;
  g.fuse = GRENADE_FUSE;
  g.active = true;
  g.mesh.visible = true;
  AudioSys.throw_();
  updateGrenadeHud();
}

function explodeGrenade(g) {
  g.active = false;
  g.mesh.visible = false;
  const c = g.mesh.position;
  spawnParticles(c, PALETTE.orange, 30, 8, 0.7, 10, 1.7);
  spawnParticles(c, 0xffd166, 12, 6, 0.5, 8);
  flashMuzzle(c, true); // reuse the big light flash (brief, pooled)
  AudioSys.explode(c);
  // enemies: 3D falloff (the UAV hovers ~3 m up — a floor blast barely clips it)
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    _nadeHit.copy(e.group.position);
    if (!e.flyY) _nadeHit.y += 1.0; // ground bots: measure to the chest
    const d = _nadeHit.distanceTo(c);
    if (d < GRENADE_RADIUS) {
      damageEnemy(e, (GRENADE_DMG * (1 - d / GRENADE_RADIUS) + 15) * game.dmgMul);
    }
  }
  // destructible props (targets, generators, gates) — a grenade is siege gear
  for (const p of props) {
    if (!p.destructible || p.dead) continue;
    const d = distXZ(p.pos, c);
    if (d < GRENADE_RADIUS + 1) {
      damageProp(p, GRENADE_DMG * (1 - Math.min(1, d / (GRENADE_RADIUS + 1))) + 15);
    }
  }
  // self damage: the arc teaches throwing distance (same lesson as generators)
  const dp = player.pos.distanceTo(c);
  if (dp < GRENADE_RADIUS) {
    playerTakeDamage(Math.round(GRENADE_DMG * (1 - dp / GRENADE_RADIUS) * GRENADE_SELF_MUL), c);
  }
}

function updateGrenades(dt) {
  nadeCooldown = Math.max(0, nadeCooldown - dt);
  for (const g of grenadePool) {
    if (!g.active) continue;
    g.fuse -= dt;
    if (g.fuse <= 0) { explodeGrenade(g); continue; }
    g.vel.y -= GRAVITY * 0.82 * dt; // slightly floatier than the player — readable arc
    g.mesh.position.addScaledVector(g.vel, dt);
    // floor bounce with damping
    if (g.mesh.position.y < 0.09 && g.vel.y < 0) {
      g.mesh.position.y = 0.09;
      if (-g.vel.y > 2.5) AudioSys.nadeBounce(g.mesh.position);
      g.vel.y *= -0.42;
      g.vel.x *= 0.65;
      g.vel.z *= 0.65;
    }
    // wall bounce: minTop = current height, so the grenade arcs OVER low cover
    // and only colliders it can actually touch push it out; the pushed axis
    // tells us which wall face was hit — reflect the velocity along it
    const ix = g.mesh.position.x, iz = g.mesh.position.z;
    resolveCollisions(g.mesh.position, 0.09, g.mesh.position.y);
    if (Math.abs(g.mesh.position.x - ix) > 1e-6) g.vel.x *= -0.45;
    if (Math.abs(g.mesh.position.z - iz) > 1e-6) g.vel.z *= -0.45;
    g.mesh.rotation.x += dt * 9; // tumble
    g.mesh.rotation.z += dt * 5;
  }
}

/* level reset: despawn live grenades (state.js calls this from resetLevelState) */
function clearGrenades() {
  nadeCooldown = 0;
  for (const g of grenadePool) { g.active = false; g.mesh.visible = false; }
}

function updateGrenadeHud() {
  document.getElementById('grenade-count').textContent = `×${game.grenades}`;
  document.getElementById('hud-grenade').classList.toggle('empty', game.grenades <= 0);
}
