/* NEON ARENA — ammo/medkit pickups and per-type drops
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== PICKUPY (amunicja / apteczki) ==================== */

const pickupsGroup = new THREE.Group();
scene.add(pickupsGroup);
const pickups = [];
const pickupMarkersEl = document.getElementById('pickup-markers');
const _pmv = new THREE.Vector3(); // scratch for marker projection

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
  // screen-space marker: an SVG icon projected over the pickup each frame
  const marker = document.createElement('div');
  marker.className = `pickup-marker ${kind}`;
  marker.innerHTML = UI_ICONS[kind === 'ammo' ? 'ammo' : 'heal'];
  pickupMarkersEl.appendChild(marker);
  pickups.push({ kind, group: g, marker, t: Math.random() * 6, life: 30 });
}

function removePickup(i) {
  const p = pickups[i];
  pickupsGroup.remove(p.group);
  p.marker.remove();
  pickups.splice(i, 1);
}

function clearPickups() {
  for (const p of pickups) { pickupsGroup.remove(p.group); p.marker.remove(); }
  pickups.length = 0;
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
      removePickup(i);
    } else if (dx * dx + dz * dz < 1.45 * 1.45) {
      applyPickup(p);
      spawnParticles(p.group.position.clone(), p.kind === 'ammo' ? PALETTE.teal : PALETTE.red, 10, 3, 0.4, 3);
      removePickup(i);
    }
  }
  updatePickupMarkers();
}

/* project the markers onto the screen (runs every frame while playing) */
function updatePickupMarkers() {
  for (const p of pickups) {
    _pmv.copy(p.group.position);
    _pmv.y += 0.9;
    _pmv.project(camera);
    const visible = _pmv.z < 1 && Math.abs(_pmv.x) < 1.05 && Math.abs(_pmv.y) < 1.05;
    p.marker.style.display = visible ? 'block' : 'none';
    if (!visible) continue;
    const x = (_pmv.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_pmv.y * 0.5 + 0.5) * window.innerHeight;
    const dx = p.group.position.x - player.pos.x;
    const dz = p.group.position.z - player.pos.z;
    const scale = Math.max(0.55, Math.min(1.1, 1.25 - Math.sqrt(dx * dx + dz * dz) / 45));
    p.marker.style.transform =
      `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    p.marker.classList.toggle('expiring', p.life < 6); // drops blink before despawn
  }
}

/* starting pickups come from the built arena's data (world.js `arena`) */
function placeArenaPickups() {
  for (const def of arena.pickups) spawnPickup(def.kind, def.x, def.z);
  for (const p of pickups) p.life = 9999; // starters never expire
}
