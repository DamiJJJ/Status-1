/* NEON ARENA — pooled effects: particles, tracers, decals, muzzle flashes
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== EFEKTY: cząsteczki / tracery / decale / flash ==================== */

const fxGroup = new THREE.Group();
scene.add(fxGroup);

/* --- cząsteczki (pula, współdzielone materiały wg koloru) --- */
const particleGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
const particleMats = new Map();
function particleMat(color) {
  if (!particleMats.has(color)) particleMats.set(color, new THREE.MeshBasicMaterial({ color }));
  return particleMats.get(color);
}
const particles = [];
const PARTICLE_POOL = 240;
for (let i = 0; i < PARTICLE_POOL; i++) {
  const m = new THREE.Mesh(particleGeo, particleMat(0xffffff));
  m.visible = false;
  fxGroup.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, maxLife: 1, gravity: 0 });
}
let particleIdx = 0;
function spawnParticles(pos, color, count, speed = 5, life = 0.5, gravity = 9, size = 1) {
  const mat = particleMat(color);
  for (let i = 0; i < count; i++) {
    const p = particles[particleIdx];
    particleIdx = (particleIdx + 1) % PARTICLE_POOL;
    p.mesh.material = mat;
    p.mesh.position.copy(pos);
    p.mesh.visible = true;
    p.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize()
       .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    p.life = p.maxLife = life * (0.6 + Math.random() * 0.7);
    p.gravity = gravity;
    p.baseScale = size * (0.6 + Math.random() * 0.9);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.mesh.visible) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= p.gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    const s = p.baseScale * (p.life / p.maxLife);
    p.mesh.scale.setScalar(Math.max(s, 0.001));
  }
}

/* --- tracery (smugi strzałów) --- */
const tracers = [];
const TRACER_POOL = 48;
const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < TRACER_POOL; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.tracer, transparent: true, opacity: 1 });
  const m = new THREE.Mesh(tracerGeo, mat);
  m.visible = false;
  fxGroup.add(m);
  tracers.push({ mesh: m, life: 0, maxLife: 0.08 });
}
let tracerIdx = 0;
const _tv = new THREE.Vector3();
function spawnTracer(from, to, color) {
  const t = tracers[tracerIdx];
  tracerIdx = (tracerIdx + 1) % TRACER_POOL;
  const len = from.distanceTo(to);
  if (len < 0.4) return;
  t.mesh.material.color.set(color);
  t.mesh.material.opacity = 0.9;
  t.mesh.scale.set(0.035, 0.035, len);
  t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
  _tv.copy(to);
  t.mesh.lookAt(_tv);
  t.mesh.visible = true;
  t.life = t.maxLife;
}
function updateTracers(dt) {
  for (const t of tracers) {
    if (!t.mesh.visible) continue;
    t.life -= dt;
    if (t.life <= 0) { t.mesh.visible = false; continue; }
    t.mesh.material.opacity = 0.9 * (t.life / t.maxLife);
  }
}

/* --- decale (ślady po trafieniach) --- */
const decals = [];
const DECAL_POOL = 64;
const decalGeo = new THREE.CircleGeometry(0.08, 8);
const decalMat = new THREE.MeshBasicMaterial({
  color: 0x0c0e22, transparent: true, opacity: 0.85,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
for (let i = 0; i < DECAL_POOL; i++) {
  const m = new THREE.Mesh(decalGeo, decalMat);
  m.visible = false;
  fxGroup.add(m);
  decals.push(m);
}
let decalIdx = 0;
const _dn = new THREE.Vector3();
function spawnDecal(point, normal) {
  const m = decals[decalIdx];
  decalIdx = (decalIdx + 1) % DECAL_POOL;
  m.position.copy(point).addScaledVector(normal, 0.012);
  _dn.copy(point).add(normal);
  m.lookAt(_dn);
  m.scale.setScalar(0.7 + Math.random() * 0.8);
  m.visible = true;
}

/* --- muzzle flash gracza (światło + rozbłysk) --- */
const muzzleLight = new THREE.PointLight(0xffb15e, 0, 9, 2);
scene.add(muzzleLight);
const muzzleFlashMesh = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.06),
  new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 })
);
scene.add(muzzleFlashMesh);
let muzzleTimer = 0;
function flashMuzzle(worldPos, big = false) {
  muzzleLight.position.copy(worldPos);
  muzzleLight.intensity = big ? 14 : 9;
  muzzleFlashMesh.position.copy(worldPos);
  muzzleFlashMesh.scale.setScalar(big ? 2.4 : 1.4);
  muzzleFlashMesh.material.opacity = 1;
  muzzleTimer = 0.055;
}

/* --- błyski przy lufach botów (bez świateł — tanie) --- */
const enemyFlashes = [];
const ENEMY_FLASH_POOL = 10;
for (let i = 0; i < ENEMY_FLASH_POOL; i++) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.09),
    new THREE.MeshBasicMaterial({ color: 0xff8f6a, transparent: true, opacity: 0 })
  );
  m.visible = false;
  fxGroup.add(m);
  enemyFlashes.push({ mesh: m, life: 0 });
}
let enemyFlashIdx = 0;
function spawnEnemyFlash(pos) {
  const f = enemyFlashes[enemyFlashIdx];
  enemyFlashIdx = (enemyFlashIdx + 1) % ENEMY_FLASH_POOL;
  f.mesh.position.copy(pos);
  f.mesh.material.opacity = 1;
  f.mesh.visible = true;
  f.life = 0.06;
}

function updateFx(dt) {
  updateParticles(dt);
  updateTracers(dt);
  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (muzzleTimer <= 0) { muzzleLight.intensity = 0; muzzleFlashMesh.material.opacity = 0; }
  }
  for (const f of enemyFlashes) {
    if (!f.mesh.visible) continue;
    f.life -= dt;
    if (f.life <= 0) { f.mesh.visible = false; f.mesh.material.opacity = 0; }
  }
}
