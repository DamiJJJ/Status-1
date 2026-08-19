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
  // PATROL (scout): pistol, keeps distance; drops ammo - grey LSPD livery
  scout: {
    weapon: 'pistol',
    hp: 55, speed: 4.6, damage: 6, fireCooldown: 1.4, range: 30, preferred: 12,
    accuracy: 0.42, points: 100, credits: 10, radius: 0.55, scale: 1,
    body: 0x8d939b, accent: 0x2a52c8,
  },
};

/* shared strobe materials — ALL drones flash in sync (police vibe, zero cost);
   animated once per frame in updateEnemies */
const matStrobeR = new THREE.MeshStandardMaterial({ color: 0x30060c, emissive: 0xff2244, emissiveIntensity: 2.4, roughness: 0.5 });
const matStrobeB = new THREE.MeshStandardMaterial({ color: 0x061030, emissive: 0x2266ff, emissiveIntensity: 0.35, roughness: 0.5 });
let strobeT = 0;

/* ==================== LSPD livery (2026-08-19 redesign) ====================

   The chassis is grey; everything that identifies it as police is either a
   painted region baked into the mesh (see `paint` in tools/gen_models.py:
   Blue panels and the Visor disc are real material groups, so a panel can
   cover PART of a limb without a single added triangle) or one of the four
   fittings below, hung on the bones in buildEnemyModel.

   All materials are module level and SHARED by every bot - the sirens flash in
   sync for the same reason the old strobes did, and a per-bot material would
   multiply draw calls for nothing. */

/* ⚠️ The armour is METAL, so it needs something to reflect (user call
   2026-08-19). A MeshStandardMaterial with metalness up and no environment
   goes DARK - a metal has no diffuse term, only reflection - so every material
   below gets TexGen.makeBotEnv(), a small procedural probe of its own. It is
   not scene.environment on purpose: that would repaint every material in the
   game. Painted panels (the blue) stay low-metalness and get their shine from
   low roughness instead, or the pigment would wash out into the reflection. */
const matBotBody  = new THREE.MeshStandardMaterial({ color: 0x9298a1, roughness: 0.42, metalness: 0.6, flatShading: true });
const matBotDim   = new THREE.MeshStandardMaterial({ color: 0x676d76, roughness: 0.48, metalness: 0.58, flatShading: true });
// the old red accent discs: same grey family, a shade brighter and polished,
// so the sculpted detail does not vanish into the plates around it
const matBotTrim  = new THREE.MeshStandardMaterial({ color: 0xb0b6be, roughness: 0.26, metalness: 0.82, flatShading: true });
const matBotBlue  = new THREE.MeshStandardMaterial({ color: 0x2a52c8, roughness: 0.34, metalness: 0.2, flatShading: true });
// visor glass: near-black and glossy, so it catches a highlight and reads as a
// lens rather than a hole. The pupil is the only thing on it that glows.
const matBotVisor = new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.1, metalness: 0.6 });
const matBotPupil = new THREE.MeshStandardMaterial({ color: 0x00320f, emissive: 0x00ff44, emissiveIntensity: 2.6, roughness: 0.4 });
/* Markings are SPRAYED ON, not bolted on (user call 2026-08-19: a lettered
   plate over the chest reads as a sticker). They run on alphaTest, so the
   transparent part of the canvas is discarded outright and the decal z-tests
   against the body like ordinary geometry - no transparency sort, no plate
   silhouette. polygonOffset covers the last fraction of a millimetre where a
   decal shares a plane with the facet under it.
   Built once, on the first bot, and shared: the canvas work (and the badge
   decode) must not run per spawn. */
let matBotBadge = null, matBotLspd = null, matBotPolice = null;
function botDecalMats() {
  if (matBotBadge) return;
  // reflection probe first: the armour materials are built at load time, so
  // this is the first moment a renderer-backed texture can be attached
  const env = TexGen.makeBotEnv();
  for (const m of [matBotBody, matBotDim, matBotTrim, matBotBlue, matBotVisor]) {
    m.envMap = env;
    m.envMapIntensity = m === matBotBlue ? 0.7 : 0.95;
    m.needsUpdate = true;
  }
  const decal = map => new THREE.MeshStandardMaterial({
    map, roughness: 0.55, metalness: 0.1,
    transparent: false, alphaTest: 0.45,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  matBotBadge  = decal(TexGen.makeBotBadge());
  matBotLspd   = decal(TexGen.makeBotText('LSPD'));
  matBotPolice = decal(TexGen.makeBotText('POLICE'));
}

/* Collar sirens: two rectangular lamps beside the neck. BOTH run the full
   red / white / blue cycle (a lamp stuck on one colour is a marker light, not
   a siren); the right lamp is half a cycle behind the left, so the pair
   alternates the way a real light bar does. */
const matSirenL = new THREE.MeshStandardMaterial({ color: 0x39404e, emissive: 0xff0033, emissiveIntensity: 6, roughness: 0.3 });
const matSirenR = new THREE.MeshStandardMaterial({ color: 0x39404e, emissive: 0x2a5cff, emissiveIntensity: 8, roughness: 0.3 });
/* Six steps at ~9 Hz - each colour gets a dark gap after it, so the lamp reads
   as flashing rather than as a strip of permanent light.
   ⚠️ Every step carries its OWN intensity, because bloom thresholds on
   LUMINANCE (0.60 in renderer.js) and blue barely has any: 0x2a5cff at the
   white lamp's intensity comes out at ~0.43 and never glows at all, which is
   exactly what a blue lamp on a police unit must not do. The numbers below put
   all three colours at roughly the same luminance instead of the same gain. */
const SIREN_SEQ = [
  [0xff0033, 6.0], [0x0d0f18, 0.3],
  [0xffffff, 2.2], [0x0d0f18, 0.3],
  [0x2a5cff, 8.0], [0x0d0f18, 0.3],
];
let sirenT = 0;

/* Drives every shared, animated bot material. Called from updateEnemies during
   a match and from Bestiary.update on the menu screens, where the enemy loop
   does not run. */
function updateBotLights(dt) {
  strobeT += dt;
  sirenT += dt;
  if (SETTINGS.strobe) {
    const sOn = Math.floor(strobeT * 5) % 2 === 0;
    matStrobeR.emissiveIntensity = sOn ? 2.6 : 0.35;
    matStrobeB.emissiveIntensity = sOn ? 0.35 : 2.6;
    const i = Math.floor(sirenT * 9) % SIREN_SEQ.length;
    const l = SIREN_SEQ[i], r = SIREN_SEQ[(i + SIREN_SEQ.length / 2) % SIREN_SEQ.length];
    matSirenL.emissive.setHex(l[0]); matSirenL.emissiveIntensity = l[1];
    matSirenR.emissive.setHex(r[0]); matSirenR.emissiveIntensity = r[1];
  } else {
    // accessibility (PROP-6): no flashing, just a steady red and blue lamp
    matStrobeR.emissiveIntensity = 1.3;
    matStrobeB.emissiveIntensity = 1.3;
    matSirenL.emissive.setHex(0xff0033); matSirenL.emissiveIntensity = 3.5;
    matSirenR.emissive.setHex(0x2a5cff); matSirenR.emissiveIntensity = 5.0;
  }
}

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

/* Small builders for procedurally assembled bots — kept for the drone types
   waiting in _kosz/przeciwnicy/. PATROL rides the baked SENTINEL skin and does
   not use them; keep the tri count low if they come back, bots spawn by the
   dozen. */
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

/* --- livery fittings: coordinates are BIND-POSE METRES of the chassis
   (feet at y = 0, 2.15 m tall, front at +Z), probed straight off js/models.js
   with tools/gen_models.py --probe sentinel.

   `at` is where the marking sits, `dir` the OUTWARD normal of the armour there
   (the projection runs the other way). The armour is faceted and creased -
   over the chest a flat panel deviates by +-3 cm, over the back by +-7 cm -
   so a decal is never a flat quad: projectBotDecal drops a grid onto the real
   surface, and the marking follows the plating. --- */
const BOT_FIT = {
  /* Spots are picked off a raycast depth map of the chassis, not off the
     silhouette: the chest carries a big octagonal boss on the bot's RIGHT and
     a clean raised panel on its LEFT, and the back hollows into a hexagonal
     recess. Lettering laid across the boss gets swallowed by its rim, which is
     what the first attempt did. */
  // LSPD on the blue chest panel, centred (user call 2026-08-19): white on
  // blue is where the lettering carries itself, which is why it no longer
  // needs the dark outline it had. The band runs forward and up, z 0.09..0.11.
  lspd:   { at: [-0.006, 1.588, 0.098], dir: [0, 0.38, 0.92], w: 0.135, h: 0.034, seg: [14, 3] },
  // badge directly under the lettering, on the centreline
  badge:  { at: [0.095, 1.585, 0.100], dir: [0, 0.38, 0.92], w: 0.050, h: 0.072, seg: [6, 8] },
  // POLICE on the mid-back panel between the shoulder blades: x +-0.085 holds
  // z within 5 mm per row, the only calm patch the back has
  police: { at: [0, 1.424, -0.183], dir: [0, -0.35, -0.94], w: 0.140, h: 0.034, seg: [14, 3] },
  // visor pupil: the eye disc is a flat octagon at z = 0.066, r = 0.035,
  // recessed 11 mm inside its socket - the pupil sits just proud of it
  pupil:  { pos: [0, 1.8165, 0.0705], r: 0.007 },
  // sirens: rectangular lamps recessed into the collar, either side of the
  // neck (neck origin y = 1.658). `proud` is how far the lens stands out of
  // the armour - the rest of the block is buried, and the depth it is buried
  // AT comes from a raycast, because the collar is not symmetric (at y 1.65 it
  // sits at z 0.031 on one side and 0.081 on the other).
  siren:  { pos: [0.082, 1.650], size: [0.052, 0.018, 0.016], tilt: -0.25, proud: 0.003 },
};

/* Decal projection. A marking has to lie ON the armour, so the quad is
   subdivided and every vertex is dropped onto the chassis by raycast, then
   lifted a hair along the surface normal. The result hugs creases and panel
   edges the way paint does; a flat quad would sink into the mesh on one side
   and hover over it on the other.

   The geometry is identical for every bot (the rig is always projected in bind
   pose), so it is built once and cached - bots spawn by the dozen and this
   fires ~100 rays per decal. */
const _decalRay = new THREE.Raycaster();
const _decalGeoCache = new Map();
const _dcP = new THREE.Vector3(), _dcN = new THREE.Vector3(), _dcBack = new THREE.Vector3();

function projectBotDecal(mesh, key, o) {
  let geo = _decalGeoCache.get(key);
  if (geo) return geo;
  const n = new THREE.Vector3(...o.dir).normalize();
  // right x up = n, so the u axis runs screen-right for a viewer facing the
  // decal and the lettering is never mirrored
  const right = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const up = new THREE.Vector3().crossVectors(n, right);
  const at = new THREE.Vector3(...o.at);
  const [su, sv] = o.seg;
  const LIFT = 0.004, STANDOFF = 0.4;
  _dcBack.copy(n).negate();
  const pos = [], nor = [], uv = [], index = [];
  for (let j = 0; j <= sv; j++) {
    for (let i = 0; i <= su; i++) {
      const fu = i / su, fv = j / sv;
      _dcP.copy(at)
        .addScaledVector(right, (fu - 0.5) * o.w)
        .addScaledVector(up, (fv - 0.5) * o.h);
      _dcN.copy(n);
      _decalRay.set(_dcP.clone().addScaledVector(n, STANDOFF), _dcBack);
      _decalRay.far = STANDOFF * 2;
      const hit = _decalRay.intersectObject(mesh, false)[0];
      if (hit) {
        _dcN.copy(hit.face.normal).transformDirection(mesh.matrixWorld).normalize();
        if (_dcN.dot(n) < 0) _dcN.negate();   // back faces point the wrong way
        _dcP.copy(hit.point);
      }
      // nothing under this corner (the panel ended): stay on the flat
      // reference plane rather than dropping the vertex into the model
      _dcP.addScaledVector(_dcN, LIFT);
      pos.push(_dcP.x, _dcP.y, _dcP.z);
      nor.push(_dcN.x, _dcN.y, _dcN.z);
      uv.push(fu, fv);
    }
  }
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const a = j * (su + 1) + i, b = a + 1, c = a + su + 1, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  _decalGeoCache.set(key, geo);
  return geo;
}

/* Depth of the collar under a siren, cached per side: same for every bot, and
   a ray against a 6.4k-triangle skin is not something to pay per spawn. */
const _sirenSeat = new Map();
function sirenSeatZ(mesh, x, y) {
  const key = x.toFixed(3) + ':' + y.toFixed(3);
  if (_sirenSeat.has(key)) return _sirenSeat.get(key);
  _decalRay.set(new THREE.Vector3(x, y, 0.6), new THREE.Vector3(0, 0, -1));
  _decalRay.far = 1.2;
  const hit = _decalRay.intersectObject(mesh, false)[0];
  const z = hit ? hit.point.z : 0.06;
  _sirenSeat.set(key, z);
  return z;
}

function buildEnemyModel(type) {
  const t = ENEMY_TYPES[type];
  const g = new THREE.Group();
  botDecalMats();

  /* --- SENTINEL chassis: one shared humanoid SKIN for every ground type
     (CC-BY geometry baked by tools/gen_models.py, materials ours).

     Since 2026-08-19 the rig ships as a real skin in its NEUTRAL BIND POSE:
     nothing is baked, and nothing here poses it. Stance and animation are a
     clean slate to be built on `model.bones` (keyed by source bone name:
     'Upper body', 'head', 'upper_arm.R', 'thigh.L', ...).

     'Blue' and 'Visor' are not source materials - the bake carves them out of
     the mesh by bind-pose region (see `paint` in tools/gen_models.py). --- */
  const model = buildSkinnedModel('sentinel', src => {
    if (src === 'Blue') return matBotBlue;          // painted police panels
    if (src === 'Visor') return matBotVisor;        // dark glass over the eye
    if (src === 'Material.003') return matBotTrim;  // sculpted discs and rims
    if (src === 'Material.002') return matBotDim;   // secondary plates
    return matBotBody;                              // main armour
  });
  const body = model.root;
  g.add(body);

  /* --- fittings, in chassis space. The decals raycast the chassis, so the
     world matrices have to be live before any of this. --- */
  const f = BOT_FIT;
  g.updateMatrixWorld(true);
  const decals = [
    new THREE.Mesh(projectBotDecal(model.mesh, 'badge', f.badge), matBotBadge),
    new THREE.Mesh(projectBotDecal(model.mesh, 'lspd', f.lspd), matBotLspd),
    new THREE.Mesh(projectBotDecal(model.mesh, 'police', f.police), matBotPolice),
  ];
  for (const d of decals) g.add(d);

  // pupil: flagged as head geometry so a shot into the eye still scores a
  // headshot (hitFaceIsHead checks userData.isHead before the baked ranges)
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(f.pupil.r, 10, 8), matBotPupil);
  pupil.position.set(...f.pupil.pos);
  pupil.scale.z = 0.55;                 // flattened into the visor, not a ball
  pupil.userData.isHead = true;
  g.add(pupil);

  const sirens = [];
  const [sw, sh, sd] = f.siren.size;
  // front-most point of the tilted block, so `proud` means what it says
  const nose = Math.abs(sd / 2 * Math.cos(f.siren.tilt)) + Math.abs(sh / 2 * Math.sin(f.siren.tilt));
  for (const side of [1, -1]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd),
                               side > 0 ? matSirenL : matSirenR);
    const x = f.siren.pos[0] * side, y = f.siren.pos[1];
    led.position.set(x, y, sirenSeatZ(model.mesh, x, y) + f.siren.proud - nose);
    led.rotation.x = f.siren.tilt;      // lie back with the collar
    g.add(led);
    sirens.push(led);
  }

  /* Tracer origin. There is no firing stance yet (the rig is a clean slate),
     so the muzzle anchor rides the chassis at chest height rather than a hand
     bone - move it onto `model.bones['hand.R']` once an aiming pose exists. */
  const gunTip = new THREE.Object3D();     // tracer origin only, nothing to draw
  gunTip.position.set(0, 1.45, 0.35);
  g.add(gunTip);

  /* Hand the fittings over to the bones they belong to. attach() keeps the
     world transform and solves for the local one - the bones sit under a group
     carrying the rig's own 103x scale, so bone-local numbers written by hand
     would be guesswork. */
  for (const o of [...decals, ...sirens]) model.bones['Upper body'].attach(o);
  model.bones['head'].attach(pupil);

  // the chassis is 2.15 m tall; PATROL wears it a touch bigger
  g.scale.setScalar(t.scale * 1.05);
  g.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  return { group: g, gunTip, bones: model.bones, rotors: null };
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
  const { group, gunTip, bones, rotors } = buildEnemyModel(type);
  if (scaleMul !== 1) group.scale.multiplyScalar(scaleMul);
  group.position.set(sx + jitter(), 0, sz + jitter());
  if (!passive) resolveCollisions(group.position, t.radius * scaleMul, t.fly ? 2.4 : 0);

  const enemy = {
    type: t, typeName: type,
    group, gunTip, bones, rotors,
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
  // synced strobes and shoulder sirens: every drone flashes together (police
  // vibe); the accessibility setting (PROP-6) swaps flashing for a steady glow
  updateBotLights(dt);

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
