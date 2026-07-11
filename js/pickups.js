/* NEON ARENA — ammo/medkit pickups and per-type drops
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== PICKUPY (amunicja / apteczki) ==================== */

const pickupsGroup = new THREE.Group();
scene.add(pickupsGroup);
const pickups = [];

const ammoBoxGeo = new THREE.BoxGeometry(0.55, 0.4, 0.55);
const ammoBoxMat = new THREE.MeshStandardMaterial({ color: 0x1c4b42, emissive: PALETTE.teal, emissiveIntensity: 0.7, roughness: 0.6, flatShading: true });
const medBoxGeo = new THREE.BoxGeometry(0.5, 0.42, 0.5);
const medBoxMat = new THREE.MeshStandardMaterial({ color: 0x5c1f2c, emissive: PALETTE.red, emissiveIntensity: 0.7, roughness: 0.6, flatShading: true });
const medCrossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });

function spawnPickup(kind, x, z) {
  const g = new THREE.Group();
  if (kind === 'ammo') {
    const box = new THREE.Mesh(ammoBoxGeo, ammoBoxMat);
    box.castShadow = true;
    g.add(box);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.15), medCrossMat);
    stripe.position.y = 0.05;
    g.add(stripe);
  } else {
    const box = new THREE.Mesh(medBoxGeo, medBoxMat);
    box.castShadow = true;
    g.add(box);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), medCrossMat);
    c1.position.y = 0.22;
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.34), medCrossMat);
    c2.position.y = 0.22;
    g.add(c2);
  }
  g.position.set(x, 0.45, z);
  pickupsGroup.add(g);
  pickups.push({ kind, group: g, t: Math.random() * 6, life: 30 });
}

/* dropy zależne od typu: zwiadowca/szturmowiec → amunicja, ciężki → apteczka */
function rollDrop(pos, typeName) {
  const r = Math.random();
  if (typeName === 'heavy') {
    if (r < 0.5) spawnPickup('med', pos.x, pos.z);
  } else {
    if (r < 0.35) spawnPickup('ammo', pos.x, pos.z);
  }
}

function applyPickup(p) {
  if (p.kind === 'ammo') {
    for (const w of WEAPONS) w.reserve = Math.min(w.maxReserve, w.reserve + w.magSize);
    AudioSys.pickup();
    showCenterMsg('+ Amunicja', 0.9);
    updateWeaponHud();
  } else {
    player.hp = Math.min(player.maxHp, player.hp + 30);
    AudioSys.heal();
    showCenterMsg('+30 HP', 0.9);
    updateHpHud();
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    p.life -= dt;
    p.group.rotation.y += dt * 1.6;
    p.group.position.y = 0.45 + Math.sin(p.t * 2.4) * 0.09;
    const dx = p.group.position.x - player.pos.x;
    const dz = p.group.position.z - player.pos.z;
    if (p.life <= 0) {
      pickupsGroup.remove(p.group);
      pickups.splice(i, 1);
    } else if (dx * dx + dz * dz < 1.45 * 1.45) {
      applyPickup(p);
      spawnParticles(p.group.position.clone(), p.kind === 'ammo' ? PALETTE.teal : PALETTE.red, 10, 3, 0.4, 3);
      pickupsGroup.remove(p.group);
      pickups.splice(i, 1);
    }
  }
}

function placeInitialPickups() {
  spawnPickup('ammo', 0, 0);
  spawnPickup('ammo', -16, 16);
  spawnPickup('ammo', 16, -16);
  spawnPickup('med', 26, 26);
  spawnPickup('med', -26, -26);
  for (const p of pickups) p.life = 9999; // startowe nie znikają
}
