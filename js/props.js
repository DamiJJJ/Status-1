/* NEON ARENA — mission set-pieces: shootable props & trigger zones
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html.

   Props are FLAT meshes inside worldGroup tagged userData.propRef — the
   exact mirror of userData.enemyRef. That single decision makes player
   bullets (recursive raycast over [worldGroup, enemiesGroup]) AND bot LOS
   (non-recursive over worldGroup.children) both work with zero changes to
   the raycast setup. Never nest a Group in worldGroup — it would stop
   bullets while staying invisible to bot LOS. */
'use strict';

/* ==================== PROPY / STREFY ==================== */

const props = [];
const propMatsToDispose = []; // per-prop cloned emissive materials

/* shared materials & geometry — module-level, never disposed */
const matPropBody = new THREE.MeshStandardMaterial({ color: 0x2b3160, roughness: 0.7, metalness: 0.25, flatShading: true });
const matPropDark = new THREE.MeshStandardMaterial({ color: 0x1c2140, roughness: 0.8, flatShading: true });
const matPropDead = new THREE.MeshStandardMaterial({ color: 0x141628, roughness: 1.0, flatShading: true });
const extractRingGeo = new THREE.RingGeometry(2.2, 2.9, 40);
const _cPropTeal = new THREE.Color(PALETTE.teal);
const _cPropGold = new THREE.Color(0xffd166);

function propCoreMat(color, intensity = 1.6) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x0a0d1c, emissive: color, emissiveIntensity: intensity, roughness: 0.5,
  });
  propMatsToDispose.push(m);
  return m;
}

function getProp(id) {
  return props.find(p => p.id === id) || null;
}

function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/* meshes live in worldGroup/decorGroup and are removed (and their geometries
   disposed) by clearArena(); here we drop refs and the per-prop materials */
function clearProps() {
  props.length = 0;
  for (const m of propMatsToDispose) m.dispose();
  propMatsToDispose.length = 0;
}

function buildSetPieces(defs) {
  for (const def of defs || []) addProp(def);
}

function addProp(def) {
  const p = {
    id: def.id,
    kind: def.kind,
    hp: def.hp || 0,
    maxHp: def.hp || 0,
    destructible: def.kind === 'generator' || def.kind === 'target',
    pos: new THREE.Vector3(def.x, 0, def.z),
    radius: def.radius || 2.4,   // trigger radius (hack / extraction)
    clearR: def.clearR || 3.4,   // keep-clear radius for the generator
    meshes: [],
    coreMat: null, ringMat: null,
    hackT: 0, hackNeed: 0, hacked: false,
    active: false, dead: false, hitFlash: 0,
    boomR: def.boomR !== undefined ? def.boomR : 4,
    boomDmg: def.boomDmg !== undefined ? def.boomDmg : 60,
  };

  if (def.kind === 'generator') {
    // power cell: body block + glowing core band + vent cap
    p.meshes.push(addBlock(def.x, def.z, 1.9, 2.6, 1.9, matPropBody));
    p.coreMat = propCoreMat(PALETTE.orange, 1.8);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), p.coreMat);
    band.position.set(def.x, 1.45, def.z);
    worldGroup.add(band);
    p.meshes.push(band);
    p.meshes.push(addBlock(def.x, def.z, 1.5, 0.28, 1.5, matPropDark, { collide: false, y: 2.75 }));
  } else if (def.kind === 'terminal') {
    // console pedestal with a tilted glowing screen (readable from all sides)
    p.meshes.push(addBlock(def.x, def.z, 1.3, 1.05, 0.7, matPropBody));
    p.coreMat = propCoreMat(PALETTE.teal, 1.3);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.62, 0.08), p.coreMat);
    screen.position.set(def.x, 1.28, def.z);
    screen.rotation.x = -0.55;
    worldGroup.add(screen);
    p.meshes.push(screen);
  } else if (def.kind === 'target') {
    // training target: dark post + glowing plate (shoot the plate)
    p.meshes.push(addBlock(def.x, def.z, 0.45, 1.5, 0.45, matPropDark));
    p.coreMat = propCoreMat(PALETTE.red, 1.8);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.16), p.coreMat);
    plate.position.set(def.x, 1.85, def.z);
    worldGroup.add(plate);
    p.meshes.push(plate);
    p.hp = p.maxHp = def.hp || 80;
  } else if (def.kind === 'gate') {
    // spawn gate: an arch that streams units until it's destroyed —
    // "kill the source, not the symptom" is the whole point of the mechanic
    p.destructible = true;
    p.hp = p.maxHp = def.hp || 400;
    p.clearR = def.clearR || 4.5;
    p.meshes.push(addBlock(def.x - 1.4, def.z, 0.6, 3.2, 0.9, matPropBody));
    p.meshes.push(addBlock(def.x + 1.4, def.z, 0.6, 3.2, 0.9, matPropBody));
    p.meshes.push(addBlock(def.x, def.z, 3.4, 0.5, 0.9, matPropBody, { collide: false, y: 3.2 }));
    p.coreMat = propCoreMat(PALETTE.red, 1.7);
    const portal = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, 0.14), p.coreMat);
    portal.position.set(def.x, 1.5, def.z);
    worldGroup.add(portal);
    p.meshes.push(portal);
    p.gateTimer = 2.0;                       // first unit shortly after activation
    p.gateInterval = def.interval || 6;
    p.gateUnits = def.units || ['scout'];    // cycled spawn list
    p.gateMax = def.maxAlive || 4;
    p.gateIdx = 0;
    p.spawned = [];
  } else if (def.kind === 'extraction') {
    // floor ring in decorGroup: no collider, must not block LOS or eat shots;
    // hidden until an extract objective activates it
    p.ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.teal, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    });
    propMatsToDispose.push(p.ringMat);
    const ring = new THREE.Mesh(extractRingGeo, p.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(def.x, 0.05, def.z);
    ring.visible = false;
    decorGroup.add(ring);
    p.meshes.push(ring);
    p.radius = def.radius || 3.0;
  }

  for (const m of p.meshes) m.userData.propRef = p;
  props.push(p);
  return p;
}

function damageProp(prop, dmg) {
  if (!prop.destructible || prop.dead) return false;
  prop.hp -= dmg;
  prop.hitFlash = 0.12;
  if (prop.hp <= 0) { destroyProp(prop); return true; }
  return false;
}

function destroyProp(prop) {
  prop.dead = true;
  prop.hp = 0;
  const c = prop.pos.clone().setY(1.3);
  spawnParticles(c, PALETTE.orange, 26, 7, 0.8, 10, 1.6);
  spawnParticles(c, PALETTE.red, 10, 5, 0.6, 8);
  for (const m of prop.meshes) m.material = matPropDead;
  if (prop.kind === 'generator') {
    // AoE burst punishes point-blank demolition — range discipline lesson
    const dp = distXZ(player.pos, prop.pos);
    if (dp < prop.boomR) {
      playerTakeDamage(Math.round(prop.boomDmg * (1 - dp / prop.boomR)) + 10, prop.pos);
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const d = distXZ(e.group.position, prop.pos);
      if (d < prop.boomR) damageEnemy(e, prop.boomDmg * (1 - d / prop.boomR) + 10);
    }
  }
  AudioSys.explode(c);
  missionEvent('prop', prop);
}

/* per-frame prop FX: core pulse, hack-progress tint, hit flash, ring pulse
   (called from tick, runs in every state — it's pure cosmetics) */
let propFxT = 0;
function updateProps(dt) {
  propFxT += dt;
  for (const p of props) {
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
    // gate stream: spawn a unit every interval, capped per gate, while alive
    if (p.kind === 'gate' && p.active && !p.dead && game.state === 'playing') {
      p.spawned = p.spawned.filter(e => e.alive);
      p.gateTimer -= dt;
      if (p.gateTimer <= 0 && p.spawned.length < p.gateMax) {
        p.gateTimer = p.gateInterval;
        const d = difficulty();
        const type = p.gateUnits[p.gateIdx++ % p.gateUnits.length];
        p.spawned.push(spawnEnemy(type, {
          hpMul: d.hpMul, accMul: d.accMul, dmgMul: d.dmgMul,
          at: { x: p.pos.x, z: p.pos.z },
        }));
        updateEnemiesHud();
      }
    }
    if (p.coreMat && !p.dead) {
      const base = p.kind === 'terminal' ? 1.3 : 1.7;
      p.coreMat.emissiveIntensity =
        base + Math.sin(propFxT * 3 + p.pos.x) * 0.25 + p.hitFlash * 12;
      if (p.kind === 'terminal' && p.hackNeed > 0) {
        // hack progress recolors the screen teal → gold
        p.coreMat.emissive.copy(_cPropTeal)
          .lerp(_cPropGold, p.hacked ? 1 : Math.min(1, p.hackT / p.hackNeed));
      }
    }
    if (p.ringMat && p.active) {
      p.ringMat.opacity = 0.3 + 0.18 * Math.sin(propFxT * 4);
    }
  }
}
