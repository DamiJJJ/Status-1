/* NEON ARENA — bot types, models, movement & fire AI
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== WROGOWIE (BOTY) ==================== */

const enemiesGroup = new THREE.Group();
scene.add(enemiesGroup);
const enemies = [];

/* Police drone liveries (fiction: training units of the SENTINEL program).
   SZTURM / TARAN / WAŻKA were pulled out on 2026-08-18 (user call) and wait in
   _kosz/przeciwnicy/przeciwnicy.js together with their models, wave shares and
   bestiary cards. PATROL is the whole roster for now. */
const ENEMY_TYPES = {
  // PATROL (scout): pistol, keeps distance; drops ammo - LAPD navy livery
  scout: {
    weapon: 'pistol',
    hp: 55, speed: 4.6, damage: 6, fireCooldown: 1.4, range: 30, preferred: 12,
    accuracy: 0.42, points: 100, credits: 10, radius: 0.55, scale: 1,
    body: 0x30528c, accent: 0xff0033,
  },
};

/* shared strobe materials — ALL drones flash in sync (police vibe, zero cost);
   animated once per frame in updateEnemies */
const matStrobeR = new THREE.MeshStandardMaterial({ color: 0x30060c, emissive: 0xff2244, emissiveIntensity: 2.4, roughness: 0.5 });
const matStrobeB = new THREE.MeshStandardMaterial({ color: 0x061030, emissive: 0x2266ff, emissiveIntensity: 0.35, roughness: 0.5 });
let strobeT = 0;

const enemyMatCache = new Map();
function enemyMat(color, emissive = null, ei = 1) {
  const key = `${color}|${emissive}|${ei}`;
  if (!enemyMatCache.has(key)) {
    enemyMatCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.8, flatShading: true,
      emissive: emissive !== null ? emissive : 0x000000,
      emissiveIntensity: emissive !== null ? ei : 0,
    }));
  }
  return enemyMatCache.get(key);
}

/* small builders shared by the bot models — keep the tri count low,
   bots spawn by the dozen */
function enemyBox(g, mat, w, h, d, x, y, z, { head = false, rx = 0, ry = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  if (head) m.userData.isHead = true;
  g.add(m);
  return m;
}
function enemyCyl(g, mat, r, len, x, y, z, seg = 8) {
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  geo.rotateX(Math.PI / 2); // axis along local +Z (bot forward)
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function buildEnemyModel(type) {
  const t = ENEMY_TYPES[type];
  const g = new THREE.Group();
  const matBody = enemyMat(t.body);
  const matBodyDim = enemyMat(new THREE.Color(t.body).multiplyScalar(0.72).getHex());
  const matDark = enemyMat(0x1e2138);
  const matEye  = enemyMat(0x1a0b00, t.accent, 0.9);

  /* --- SENTINEL chassis: one shared humanoid mesh for every ground type
     (CC-BY geometry baked by tools/gen_models.py, materials ours). Types read
     apart by livery colour, silhouette size, shoulder bulk and head decor -
     the old "one head shape per type" rule is gone. --- */
  const model = buildModel('sentinel', src => {
    if (src === 'Material.003') return matEye;   // glowing trim reads as the eye
    if (src === 'Material.002') return matBodyDim;  // secondary plates
    return matBody;                                 // main armour
  });
  const body = model.root;
  g.add(body);
  const { head, armR, legL, legR } = model.parts;
  // every mesh of the head group counts as a headshot (decor included)
  head.traverse(o => { if (o.isMesh) o.userData.isHead = true; });

  /* One-handed firing stance. The arm is one rigid part, so instead of guessing
     Euler angles we swing it by the rotation that carries its bind-pose hand
     onto a target point straight ahead - exact, and it keeps working if the
     source model ever changes. The left arm stays in its bind pose. */
  const poseArm = (part, socket, tx, ty, tz) => {
    const from = model.sockets[socket].clone().sub(part.position).normalize();
    const to = new THREE.Vector3(tx, ty, tz).sub(part.position).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(from, to);
    part.quaternion.copy(q);
    return q;
  };
  const qR = poseArm(armR, 'handR', -0.13, 1.47, 0.62);

  /* the gun rides in the right hand, but the barrel has to stay level: undo the
     arm swing on the mount so everything inside is aligned with the chassis */
  const gun = new THREE.Group();
  gun.name = 'botGun';   // handle for debug/screenshot tooling
  gun.position.copy(socketLocal(model, 'gripR', 'armR'));
  gun.quaternion.copy(qR.clone().invert());
  armR.add(gun);
  /* PATROL carries no weapon model for now (user call, 2026-08-18): the baked
     Glock never sat convincingly in the fist. The hand keeps the firing pose
     and the tracer anchor, so re-adding a model is a four-line change:
       const pistol = buildModel('glock', () => matDark);
       pistol.root.rotation.y = Math.PI;  // model muzzle is -Z, bot faces +Z
       pistol.root.scale.setScalar(0.85);
       gun.add(pistol.root);
     Guns for the units in _kosz sit in that folder too. */
  const gunTip = new THREE.Object3D();     // tracer origin only, nothing to draw
  gunTip.position.set(0, 0.05, 0.14);
  gun.add(gunTip);

  // the chassis is 2.15 m tall; PATROL wears it a touch bigger
  g.scale.setScalar(t.scale * 1.05);
  g.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  return { group: g, gunTip, legL, legR, rotors: null };
}

function spawnEnemy(type, { hpMul = 1, accMul = 1, dmgMul = 1, tag = null, at = null,
                            scaleMul = 1, invulnerable = false, isBoss = false,
                            passive = false, marchDir = null } = {}) {
  let sx, sz;
  if (at) {
    // scripted entrance (gate, set-piece, parade)
    sx = at.x; sz = at.z;
  } else {
    // pick a spawn point far from the player; `tag` restricts the pool so a
    // mission can direct units through a specific entrance
    const pool = tag ? spawnPoints.filter(s => s.tag === tag) : spawnPoints;
    let best = null, bestD = -1;
    for (const s of (pool.length ? pool : spawnPoints)) {
      const d = (s.x - player.pos.x) ** 2 + (s.z - player.pos.z) ** 2;
      if (d > bestD) { bestD = d; best = s; }
    }
    sx = best.x; sz = best.z;
  }
  const jitter = () => (Math.random() - 0.5) * (at ? 2.4 : 4);
  const t = ENEMY_TYPES[type];
  const { group, gunTip, legL, legR, rotors } = buildEnemyModel(type);
  if (scaleMul !== 1) group.scale.multiplyScalar(scaleMul);
  group.position.set(sx + jitter(), 0, sz + jitter());
  if (!passive) resolveCollisions(group.position, t.radius * scaleMul, t.fly ? 2.4 : 0);

  const enemy = {
    type: t, typeName: type,
    group, gunTip, legL, legR, rotors,
    hp: t.hp * hpMul, maxHp: t.hp * hpMul,
    accuracy: Math.min(0.85, t.accuracy * accMul),
    dmgMul, // difficulty/mission damage scale — never mutate shared ENEMY_TYPES
    radius: t.radius * scaleMul,
    scaleMul,
    flyY: t.fly || 0,
    invulnerable, isBoss,
    passive,
    marchDir: marchDir ? new THREE.Vector3(marchDir.x, 0, marchDir.z).normalize() : null,
    cooldown: 1 + Math.random() * 1.5,
    burst: 0, burstT: 0,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeT: 1 + Math.random() * 2,
    stuckT: 0, avoidT: 0, avoidDir: 1, sinceAvoid: 99, // obstacle detour state
    bobT: Math.random() * 10,
    alive: true,
  };
  group.traverse(o => { if (o.isMesh) o.userData.enemyRef = enemy; });
  enemiesGroup.add(group);
  enemies.push(enemy);

  // efekt teleportu
  spawnParticles(group.position.clone().setY(1.2), PALETTE.teal, 16, 4, 0.6, 2);
  updateEnemiesHud();
  return enemy;
}

function damageEnemy(enemy, dmg, isHead = false) {
  if (!enemy.alive) return false;
  if (enemy.invulnerable) {
    // shielded (boss until its stabilizers fall): distinct pale flash, no damage
    spawnParticles(enemy.group.position.clone().setY(1.4 * enemy.scaleMul), 0xcfe0ff, 6, 4, 0.3, 6);
    AudioSys.hit();
    return false;
  }
  enemy.hp -= dmg;
  if (isHead) AudioSys.headshot(); else AudioSys.hit();
  if (enemy.hp <= 0) { killEnemy(enemy); return true; }
  return false;
}

function killEnemy(enemy, silent = false) {
  if (!enemy.alive) return;
  enemy.alive = false;
  const pos = enemy.group.position.clone().setY(1.2);
  spawnParticles(pos, enemy.type.body, 22, 6, 0.7, 10, 1.4);
  spawnParticles(pos, enemy.type.accent, 8, 5, 0.5, 6);
  enemiesGroup.remove(enemy.group);
  const i = enemies.indexOf(enemy);
  if (i >= 0) enemies.splice(i, 1);
  if (!silent) {
    AudioSys.kill(pos, enemy.typeName);
    addScore(enemy.type.points);
    addCredits(enemy.type.credits);
    rollDrop(pos, enemy.typeName);
  }
  missionEvent('kill', enemy); // no-op outside the campaign
  updateEnemiesHud();
  waveSystem.onEnemyDown();
}

const _eToPlayer = new THREE.Vector3();
const _eMove = new THREE.Vector3();
const _ePerp = new THREE.Vector3();
const _eGunPos = new THREE.Vector3();
const _eLosDir = new THREE.Vector3();
const _eHead = new THREE.Vector3();
const losRaycaster = new THREE.Raycaster();

function enemyHasLos(enemy, dist) {
  _eHead.copy(enemy.group.position);
  _eHead.y = enemy.flyY ? enemy.flyY : 1.8 * enemy.type.scale * enemy.scaleMul;
  _eLosDir.copy(player.pos).sub(_eHead).normalize();
  losRaycaster.set(_eHead, _eLosDir);
  losRaycaster.far = dist;
  const hits = losRaycaster.intersectObjects(worldGroup.children, false);
  return hits.length === 0 || hits[0].distance > dist - 0.6;
}

function updateEnemies(dt) {
  // synced strobes: every drone flashes red/blue together (police vibe);
  // the accessibility setting (PROP-6) swaps the flashing for a steady glow
  strobeT += dt;
  if (SETTINGS.strobe) {
    const sOn = Math.floor(strobeT * 5) % 2 === 0;
    matStrobeR.emissiveIntensity = sOn ? 2.6 : 0.35;
    matStrobeB.emissiveIntensity = sOn ? 0.35 : 2.6;
  } else {
    matStrobeR.emissiveIntensity = 1.3;
    matStrobeB.emissiveIntensity = 1.3;
  }

  let despawned = false;
  for (const e of enemies) {
    if (!e.alive) continue;
    const g = e.group;

    /* passive parade units (the epilogue): march a straight line, ignore
       the player and collisions, quietly leave at the arena edge */
    if (e.passive) {
      g.position.addScaledVector(e.marchDir, e.type.speed * 0.55 * dt);
      g.rotation.y = Math.atan2(e.marchDir.x, e.marchDir.z);
      e.bobT += dt * 6;
      g.position.y = e.flyY ? e.flyY + Math.sin(e.bobT * 0.7) * 0.15
                            : Math.abs(Math.sin(e.bobT)) * 0.05;
      if (e.legL) {
        e.legL.rotation.x = Math.sin(e.bobT) * 0.45;
        e.legR.rotation.x = -Math.sin(e.bobT) * 0.45;
      }
      if (e.rotors) for (const r of e.rotors) r.rotation.y += dt * 45;
      const lim = arena.half + 2;
      if (Math.abs(g.position.x) > lim || Math.abs(g.position.z) > lim) {
        e.alive = false;
        e.despawn = true; // removed after the loop — no FX, no score
        despawned = true;
      }
      continue;
    }

    _eToPlayer.copy(player.pos).sub(g.position);
    _eToPlayer.y = 0;
    const dist = _eToPlayer.length();
    if (dist > 1e-4) _eToPlayer.divideScalar(dist);

    // --- ruch: trzymaj preferowany dystans + strafe; objazd gdy utknął ---
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      e.strafeT = 1 + Math.random() * 2.2;
      const r = Math.random();
      e.strafeDir = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
    }
    _ePerp.set(-_eToPlayer.z, 0, _eToPlayer.x);
    _eMove.set(0, 0, 0);
    if (e.avoidT > 0) {
      // objazd przeszkody: ruch w bok z lekkim parciem do przodu
      e.avoidT -= dt;
      _eMove.copy(_ePerp).multiplyScalar(e.avoidDir).addScaledVector(_eToPlayer, 0.25);
    } else {
      if (dist > e.type.preferred + 2) _eMove.add(_eToPlayer);
      else if (dist < e.type.preferred - 4) _eMove.addScaledVector(_eToPlayer, -1);
      _eMove.addScaledVector(_ePerp, e.strafeDir * 0.55);
    }
    const prevX = g.position.x, prevZ = g.position.z;
    // dev range (js/devmap.js): frozen bots stand still but keep facing the player
    const wantsMove = !(game.dev && devHoldMove) && _eMove.lengthSq() > 1e-4;
    if (wantsMove) {
      _eMove.normalize();
      g.position.addScaledVector(_eMove, e.type.speed * dt);
    }
    // unit separation (fliers only push against other fliers)
    for (const o of enemies) {
      if (o === e || !o.alive || !!o.flyY !== !!e.flyY) continue;
      const dx = g.position.x - o.group.position.x;
      const dz = g.position.z - o.group.position.z;
      const d2 = dx * dx + dz * dz;
      const minD = e.radius + o.radius + 0.2;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        g.position.x += (dx / d) * (minD - d) * 0.5;
        g.position.z += (dz / d) * (minD - d) * 0.5;
      }
    }
    // fliers pass over low cover (colliders below their altitude are skipped)
    resolveCollisions(g.position, e.radius, e.flyY ? 2.4 : 0);

    // stuck detection: actual movement far below intended → sidestep detour.
    // The detour direction is COMMITTED: re-randomizing on every trigger
    // degenerates into a random walk along long walls (corridors style) —
    // keep going the same way unless the last detour was a while ago.
    e.sinceAvoid += dt;
    const actualSpeed = Math.hypot(g.position.x - prevX, g.position.z - prevZ) / Math.max(dt, 1e-4);
    if (wantsMove && e.avoidT <= 0 && actualSpeed < e.type.speed * 0.3) {
      e.stuckT += dt;
      if (e.stuckT > 0.35) {
        e.stuckT = 0;
        if (e.sinceAvoid > 2.5) e.avoidDir = Math.random() < 0.5 ? -1 : 1;
        e.avoidT = 0.6 + Math.random() * 0.7;
        e.sinceAvoid = 0;
      }
    } else if (e.stuckT > 0) {
      e.stuckT = Math.max(0, e.stuckT - dt * 2);
    }

    // face the player + walk bob / hover, legs swing with actual movement
    const targetYaw = Math.atan2(_eToPlayer.x, _eToPlayer.z);
    let dy = targetYaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 8);
    const walkFactor = Math.min(1, actualSpeed / e.type.speed);
    e.bobT += dt * (2 + e.type.speed * 1.6) * Math.max(0.15, walkFactor);
    if (e.flyY) {
      g.position.y = e.flyY + Math.sin(e.bobT * 0.6) * 0.18;
      if (e.rotors) for (const r of e.rotors) r.rotation.y += dt * 45;
    } else {
      g.position.y = Math.abs(Math.sin(e.bobT)) * 0.06 * walkFactor;
      const legAmp = 0.5 * walkFactor;
      e.legL.rotation.x = Math.sin(e.bobT) * legAmp;
      e.legR.rotation.x = -Math.sin(e.bobT) * legAmp;
    }

    // --- strzelanie (pistolet / strzelba / seria z karabinu) ---
    e.cooldown -= dt;
    if (game.dev && devHoldFire) {
      e.burst = 0; // dev range: hold fire until released (T)
    } else if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = e.type.burstInterval;
        e.burst--;
        enemyFire(e);
      }
    } else if (e.cooldown <= 0 && dist < e.type.range && dist > 1.2 && enemyHasLos(e, dist)) {
      e.cooldown = e.type.fireCooldown * (0.75 + Math.random() * 0.5);
      if (e.type.weapon === 'auto') { e.burst = e.type.burstCount; e.burstT = 0; }
      else enemyFire(e);
    }
  }
  // remove parade units that left the arena (marked in the loop above)
  if (despawned) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].despawn) {
        enemiesGroup.remove(enemies[i].group);
        enemies.splice(i, 1);
      }
    }
  }
}

/* pojedynczy strzał bota: pistolet = 1 pocisk, strzelba = wachlarz śrucin
   z obrażeniami malejącymi z dystansem, karabin = wywoływany seriami */
function enemyFire(e) {
  const g = e.group;
  const dx = player.pos.x - g.position.x;
  const dz = player.pos.z - g.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.0 || dist > e.type.range * 1.25) return;
  e.gunTip.getWorldPosition(_eGunPos);
  spawnEnemyFlash(_eGunPos);
  AudioSys.enemyShot(e.type.weapon, _eGunPos);

  const distFactor = 1 - 0.45 * Math.min(1, dist / e.type.range);
  const moveFactor = player.moving ? 0.72 : 1;
  const chance = e.accuracy * distFactor * moveFactor;
  const hit = Math.random() < chance && enemyHasLos(e, dist);

  let dmg = e.type.damage * e.dmgMul;
  if (e.type.weapon === 'shotgun') {
    // z bliska pełne obrażenia, przy granicy zasięgu ~40%
    dmg = Math.max(6, Math.round(dmg * (1 - 0.6 * (dist / e.type.range))));
  }

  const pellets = e.type.weapon === 'shotgun' ? 5 : 1;
  for (let i = 0; i < pellets; i++) {
    _tv.copy(player.pos);
    _tv.x += (Math.random() - 0.5) * (hit ? 1.7 : 3.4);
    _tv.z += (Math.random() - 0.5) * (hit ? 1.7 : 3.4);
    _tv.y = player.pos.y + (Math.random() - 0.5) * 1.5; // aim at the ACTUAL eye (crouch lowers it)
    _tv.lerp(_eGunPos, 0.12); // utnij smugę przed graczem, żeby nie przelatywała przez kamerę
    spawnTracer(_eGunPos, _tv.clone(), 0xff6a7a);
  }
  if (hit) playerTakeDamage(dmg, g.position);
}
