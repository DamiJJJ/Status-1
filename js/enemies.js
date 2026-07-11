/* NEON ARENA — bot types, models, movement & fire AI
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== WROGOWIE (BOTY) ==================== */

const enemiesGroup = new THREE.Group();
scene.add(enemiesGroup);
const enemies = [];

const ENEMY_TYPES = {
  // zwiadowca: pistolet, dystans; dropi amunicję
  scout: {
    weapon: 'pistol',
    hp: 55, speed: 4.6, damage: 6, fireCooldown: 1.4, range: 30, preferred: 12,
    accuracy: 0.42, points: 100, credits: 10, radius: 0.55, scale: 1,
    body: 0x3ecf7a, accent: 0xff8906, // zielony, trójkątna głowa
  },
  // szturmowiec: szybszy zwiadowca z karabinem automatycznym (serie); dropi amunicję
  assault: {
    weapon: 'auto', burstCount: 4, burstInterval: 0.13,
    hp: 45, speed: 5.6, damage: 3, fireCooldown: 1.7, range: 26, preferred: 10,
    accuracy: 0.45, points: 150, credits: 15, radius: 0.55, scale: 0.95,
    body: 0xf0a03c, accent: 0xff5470, // pomarańczowy, kwadratowa głowa
  },
  // ciężki: strzelba — musi podejść blisko, bije mocno; dropi apteczki
  heavy: {
    weapon: 'shotgun',
    hp: 220, speed: 2.9, damage: 30, fireCooldown: 2.4, range: 15, preferred: 7,
    accuracy: 0.75, points: 300, credits: 30, radius: 0.7, scale: 1.25,
    body: 0xe0455f, accent: 0x00ebc7, // czerwony, okrągła głowa
  },
};

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

function buildEnemyModel(type) {
  const t = ENEMY_TYPES[type];
  const g = new THREE.Group();
  const matBody = enemyMat(t.body);
  const matDark = enemyMat(0x1e2138);
  const matEye  = enemyMat(0x1a0b00, t.accent, 2.2);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.55), matBody);
  body.position.y = 1.05;
  g.add(body);
  // głowa: jaśniejsza (przyciemniony kolor ciała), kształt identyfikuje typ:
  // zwiadowca trójkąt (piramida), ciężki koło (kula), szturmowiec kwadrat (box)
  // głowa lekko zagłębiona w korpus (top tułowia = 1.575), żeby nie lewitowała
  const matHead = enemyMat(new THREE.Color(t.body).multiplyScalar(0.55).getHex());
  let headGeo, eyeGeo, headY, eyeY, eyeZ;
  if (type === 'scout') {
    headGeo = new THREE.ConeGeometry(0.34, 0.52, 4); // piramida = trójkątna sylwetka
    // oko-trójkąt: płaski pryzmat 3-kątny skierowany przodem do +Z
    eyeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 3);
    eyeGeo.rotateX(Math.PI / 2);
    headY = 1.79; eyeY = 1.67; eyeZ = 0.2; // podstawa piramidy wpuszczona w tułów
  } else if (type === 'heavy') {
    headGeo = new THREE.SphereGeometry(0.3, 12, 9);
    eyeGeo = new THREE.SphereGeometry(0.1, 10, 8); // okrągłe oko
    headY = 1.85; eyeY = 1.85; eyeZ = 0.27;
  } else {
    headGeo = new THREE.BoxGeometry(0.5, 0.45, 0.5);
    eyeGeo = new THREE.BoxGeometry(0.34, 0.1, 0.05); // prostokątny wizjer
    headY = 1.78; eyeY = 1.81; eyeZ = 0.26; // spód sześcianu wpuszczony w tułów
  }
  const head = new THREE.Mesh(headGeo, matHead);
  head.position.y = headY;
  if (type === 'scout') head.rotation.y = Math.PI / 4; // płaska ściana piramidy do przodu
  head.userData.isHead = true;
  g.add(head);
  // świecące „oko" — przód modelu to lokalne +Z (obrót yaw = atan2(dx, dz))
  const eye = new THREE.Mesh(eyeGeo, matEye);
  eye.position.set(0, eyeY, eyeZ);
  eye.userData.isHead = true;
  g.add(eye);
  // nogi z przegubem w biodrze (geometria przesunięta w dół → obrót macha nogą)
  const legGeo = new THREE.BoxGeometry(0.26, 0.55, 0.3);
  legGeo.translate(0, -0.275, 0);
  const legL = new THREE.Mesh(legGeo, matDark);
  legL.position.set(-0.22, 0.55, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.22;
  g.add(legR);
  // broń bota — kształt zależny od uzbrojenia typu
  let gunGeo, tipZ;
  if (t.weapon === 'shotgun')   { gunGeo = new THREE.BoxGeometry(0.2, 0.2, 0.7);  tipZ = 0.75; }
  else if (t.weapon === 'auto') { gunGeo = new THREE.BoxGeometry(0.1, 0.1, 1.0);  tipZ = 0.9; }
  else                          { gunGeo = new THREE.BoxGeometry(0.14, 0.14, 0.85); tipZ = 0.8; }
  const gun = new THREE.Mesh(gunGeo, matDark);
  gun.position.set(0.42, 1.25, 0.35);
  g.add(gun);
  const gunTip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), matEye);
  gunTip.position.set(0.42, 1.25, tipZ);
  g.add(gunTip);

  g.scale.setScalar(t.scale);
  g.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  return { group: g, gunTip, legL, legR };
}

function spawnEnemy(type, hpMul, accMul) {
  // wybierz punkt spawnu daleko od gracza
  let best = null, bestD = -1;
  for (const [sx, sz] of spawnPoints) {
    const d = (sx - player.pos.x) ** 2 + (sz - player.pos.z) ** 2;
    if (d > bestD) { bestD = d; best = [sx, sz]; }
  }
  const jitter = () => (Math.random() - 0.5) * 4;
  const t = ENEMY_TYPES[type];
  const { group, gunTip, legL, legR } = buildEnemyModel(type);
  group.position.set(best[0] + jitter(), 0, best[1] + jitter());
  resolveCollisions(group.position, t.radius);

  const enemy = {
    type: t, typeName: type,
    group, gunTip, legL, legR,
    hp: t.hp * hpMul, maxHp: t.hp * hpMul,
    accuracy: Math.min(0.85, t.accuracy * accMul),
    cooldown: 1 + Math.random() * 1.5,
    burst: 0, burstT: 0,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeT: 1 + Math.random() * 2,
    stuckT: 0, avoidT: 0, avoidDir: 1,   // objazd przeszkód
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
    AudioSys.kill();
    addScore(enemy.type.points);
    addCredits(enemy.type.credits);
    rollDrop(pos, enemy.typeName);
  }
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
  _eHead.y = 1.8 * enemy.type.scale;
  _eLosDir.copy(player.pos).sub(_eHead).normalize();
  losRaycaster.set(_eHead, _eLosDir);
  losRaycaster.far = dist;
  const hits = losRaycaster.intersectObjects(worldGroup.children, false);
  return hits.length === 0 || hits[0].distance > dist - 0.6;
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const g = e.group;
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
    const wantsMove = _eMove.lengthSq() > 1e-4;
    if (wantsMove) {
      _eMove.normalize();
      g.position.addScaledVector(_eMove, e.type.speed * dt);
    }
    // rozdzielanie botów
    for (const o of enemies) {
      if (o === e || !o.alive) continue;
      const dx = g.position.x - o.group.position.x;
      const dz = g.position.z - o.group.position.z;
      const d2 = dx * dx + dz * dz;
      const minD = e.type.radius + o.type.radius + 0.2;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        g.position.x += (dx / d) * (minD - d) * 0.5;
        g.position.z += (dz / d) * (minD - d) * 0.5;
      }
    }
    resolveCollisions(g.position, e.type.radius);

    // wykrywanie utknięcia: faktyczny ruch dużo mniejszy od zamierzonego → objazd
    const actualSpeed = Math.hypot(g.position.x - prevX, g.position.z - prevZ) / Math.max(dt, 1e-4);
    if (wantsMove && e.avoidT <= 0 && actualSpeed < e.type.speed * 0.3) {
      e.stuckT += dt;
      if (e.stuckT > 0.35) {
        e.stuckT = 0;
        e.avoidT = 0.6 + Math.random() * 0.7;
        e.avoidDir = Math.random() < 0.5 ? -1 : 1;
      }
    } else if (e.stuckT > 0) {
      e.stuckT = Math.max(0, e.stuckT - dt * 2);
    }

    // obrót w stronę gracza + bob chodu i wymach nóg wg faktycznego ruchu
    const targetYaw = Math.atan2(_eToPlayer.x, _eToPlayer.z);
    let dy = targetYaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 8);
    const walkFactor = Math.min(1, actualSpeed / e.type.speed);
    e.bobT += dt * (2 + e.type.speed * 1.6) * Math.max(0.15, walkFactor);
    g.position.y = Math.abs(Math.sin(e.bobT)) * 0.06 * walkFactor;
    const legAmp = 0.5 * walkFactor;
    e.legL.rotation.x = Math.sin(e.bobT) * legAmp;
    e.legR.rotation.x = -Math.sin(e.bobT) * legAmp;

    // --- strzelanie (pistolet / strzelba / seria z karabinu) ---
    e.cooldown -= dt;
    if (e.burst > 0) {
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
  AudioSys.enemyShot(e.type.weapon);

  const distFactor = 1 - 0.45 * Math.min(1, dist / e.type.range);
  const moveFactor = player.moving ? 0.72 : 1;
  const chance = e.accuracy * distFactor * moveFactor;
  const hit = Math.random() < chance && enemyHasLos(e, dist);

  let dmg = e.type.damage;
  if (e.type.weapon === 'shotgun') {
    // z bliska pełne obrażenia, przy granicy zasięgu ~40%
    dmg = Math.max(6, Math.round(dmg * (1 - 0.6 * (dist / e.type.range))));
  }

  const pellets = e.type.weapon === 'shotgun' ? 5 : 1;
  for (let i = 0; i < pellets; i++) {
    _tv.copy(player.pos);
    _tv.x += (Math.random() - 0.5) * (hit ? 1.7 : 3.4);
    _tv.z += (Math.random() - 0.5) * (hit ? 1.7 : 3.4);
    _tv.y = PLAYER_EYE + (Math.random() - 0.5) * 1.5;
    _tv.lerp(_eGunPos, 0.12); // utnij smugę przed graczem, żeby nie przelatywała przez kamerę
    spawnTracer(_eGunPos, _tv.clone(), 0xff6a7a);
  }
  if (hit) playerTakeDamage(dmg, g.position);
}
