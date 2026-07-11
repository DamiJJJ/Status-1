/* NEON ARENA — arena: floor, outer walls, seeded obstacle generator
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== ŚWIAT / ARENA ==================== */

const worldGroup = new THREE.Group();   // cel raycastów: ściany, przeszkody, podłoga
scene.add(worldGroup);
const colliders = [];                   // AABB { minX, maxX, minZ, maxZ }

/* floor: procedural deck plates (TexGen, canvas) with glowing neon inlays;
   roughness stays 1.0 — the roughnessMap is multiplied by it */
const floorTexSet = TexGen.makeFloorSet(8);
const floorMat = new THREE.MeshStandardMaterial({
  map: floorTexSet.map,
  normalMap: floorTexSet.normalMap,
  roughnessMap: floorTexSet.roughnessMap,
  roughness: 1.0,
  metalness: 0,
  emissive: 0xffffff,
  emissiveMap: floorTexSet.emissiveMap,
  emissiveIntensity: 1.5,
});

{
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 4, ARENA_HALF * 2 + 4),
    floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  worldGroup.add(floor);
  // płaszczyzna „ziemi" poza areną, ginąca we mgle
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: 0x1e2242, roughness: 1 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  outer.receiveShadow = true;
  scene.add(outer);
}

/* obstacle materials: procedural sets from TexGen (color/normal/roughness).
   Wall texture tiles in world units via applyBoxUV (see addBlock), so long
   outer walls and small pillars share one material without stretching;
   crates keep the default box UVs (each face = whole framed-panel design). */
const wallTexSet = TexGen.makeWallSet();
const matWall = new THREE.MeshStandardMaterial({
  map: wallTexSet.map,
  normalMap: wallTexSet.normalMap,
  roughnessMap: wallTexSet.roughnessMap,
  roughness: 1.0,
  emissive: 0xffffff,
  emissiveMap: wallTexSet.emissiveMap,
  emissiveIntensity: 1.2,
});
matWall.userData.worldUV = 6; // meters per texture tile
const crateTexSet = TexGen.makeCrateSet(PALETTE.crate);
const crateAltTexSet = TexGen.makeCrateSet(PALETTE.crateAlt);
const matCrate = new THREE.MeshStandardMaterial({
  map: crateTexSet.map, normalMap: crateTexSet.normalMap,
  roughnessMap: crateTexSet.roughnessMap, roughness: 1.0,
});
const matCrateAlt = new THREE.MeshStandardMaterial({
  map: crateAltTexSet.map, normalMap: crateAltTexSet.normalMap,
  roughnessMap: crateAltTexSet.roughnessMap, roughness: 1.0,
});
const matTrim  = new THREE.MeshStandardMaterial({ color: 0x072a26, emissive: PALETTE.teal, emissiveIntensity: 1.6, roughness: 0.5 });
const matTrimOrange = new THREE.MeshStandardMaterial({ color: 0x2a1503, emissive: PALETTE.orange, emissiveIntensity: 1.4, roughness: 0.5 });

function addBlock(x, z, w, h, d, mat, { collide = true, y = null } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  // world-scale tiling for materials that ask for it; the position-derived
  // offset de-syncs the pattern between blocks (deterministic per seed)
  if (mat.userData.worldUV) {
    TexGen.applyBoxUV(geo, mat.userData.worldUV, (x * 0.618 + z * 0.132) % 1, (z * 0.573 + x * 0.117) % 1);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y === null ? h / 2 : y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  worldGroup.add(m);
  if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  return m;
}

/* mury zewnętrzne + świecąca listwa na koronie */
{
  const T = 1.2, H = 4.5, L = ARENA_HALF * 2 + T * 2;
  addBlock(0, -ARENA_HALF - T / 2, L, H, T, matWall);
  addBlock(0,  ARENA_HALF + T / 2, L, H, T, matWall);
  addBlock(-ARENA_HALF - T / 2, 0, T, H, L, matWall);
  addBlock( ARENA_HALF + T / 2, 0, T, H, L, matWall);
  const trims = [
    [0, -ARENA_HALF - T / 2, L, 0.15, 0.2],
    [0,  ARENA_HALF + T / 2, L, 0.15, 0.2],
    [-ARENA_HALF - T / 2, 0, 0.2, 0.15, L],
    [ ARENA_HALF + T / 2, 0, 0.2, 0.15, L],
  ];
  for (const [x, z, w, h, d] of trims) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matTrim);
    t.position.set(x, H + 0.07, z);
    worldGroup.add(t);
  }
}

/* animated holographic panels on the inner faces of the outer walls;
   scrolled + flickered in updateWorldFx. Added to `scene`, NOT worldGroup —
   holograms must not catch shots, decals or LOS raycasts. fog:false because
   fog would tint the whole additive quad, glowing where it should be empty. */
const holoMats = [];
{
  const mkHolo = (seed, speed) => {
    const m = new THREE.MeshBasicMaterial({
      map: TexGen.makeHologramTexture(seed),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    m.userData.scrollSpeed = speed;
    holoMats.push(m);
    return m;
  };
  const mats = [mkHolo(101, 0.045), mkHolo(202, 0.075), mkHolo(303, 0.06), mkHolo(404, 0.09)];
  const holoGeo = new THREE.PlaneGeometry(2.4, 3.2);
  const F = ARENA_HALF - 0.03; // just off the inner wall face
  // [x, z, yaw, material]: two panels per wall, facing the arena
  const spots = [
    [-14,  F, Math.PI, 0], [14,  F, Math.PI, 1],
    [-14, -F, 0, 2],       [14, -F, 0, 3],
    [ F, -14, -Math.PI / 2, 2], [ F, 14, -Math.PI / 2, 0],
    [-F, -14,  Math.PI / 2, 1], [-F, 14,  Math.PI / 2, 3],
  ];
  for (const [x, z, yaw, mi] of spots) {
    const p = new THREE.Mesh(holoGeo, mats[mi]);
    p.position.set(x, 2.5, z);
    p.rotation.y = yaw;
    scene.add(p);
  }
}

/* ==================== GENERATOR ARENY (deterministyczny, seed w URL) ==================== */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* punkty spawnu botów — używane przez generator (strefy wolne) i system fal */
const spawnPoints = [
  [-29, -29], [0, -30], [29, -29], [-30, 0],
  [30, 0], [-29, 29], [0, 30], [29, 29],
];

function generateArena(seed) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const placedBoxes = [];
  // strefy, które muszą zostać wolne: spawn gracza, startowe pickupy, spawny botów
  const keepClear = [
    { x: 0, z: 26, r: 5 },
    { x: 0, z: 0, r: 2.5 },
    { x: -16, z: 16, r: 2 }, { x: 16, z: -16, r: 2 },
    { x: 26, z: 26, r: 2.2 }, { x: -26, z: -26, r: 2.2 },
    ...spawnPoints.map(([x, z]) => ({ x, z, r: 4 })),
  ];
  const MARGIN = 2.2; // minimalny prześwit między przeszkodami (boty mają r ≤ 0.7·1.25)

  function fits(minX, maxX, minZ, maxZ) {
    if (minX < -30 || maxX > 30 || minZ < -30 || maxZ > 30) return false;
    for (const c of keepClear) {
      const dx = Math.max(minX, Math.min(c.x, maxX)) - c.x;
      const dz = Math.max(minZ, Math.min(c.z, maxZ)) - c.z;
      if (dx * dx + dz * dz < c.r * c.r) return false;
    }
    for (const b of placedBoxes) {
      if (minX < b.maxX + MARGIN && maxX > b.minX - MARGIN &&
          minZ < b.maxZ + MARGIN && maxZ > b.minZ - MARGIN) return false;
    }
    return true;
  }

  function tryPlace(w, d, attempts = 40) {
    for (let i = 0; i < attempts; i++) {
      const x = R(-28, 28), z = R(-28, 28);
      if (fits(x - w / 2, x + w / 2, z - d / 2, z + d / 2)) {
        placedBoxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        return { x, z };
      }
    }
    return null;
  }

  // filary ze świecącą obwódką
  const nPillars = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < nPillars; i++) {
    const s = R(2, 2.6), h = R(4.2, 5.5);
    const p = tryPlace(s, s);
    if (!p) continue;
    addBlock(p.x, p.z, s, h, s, matWall);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(s + 0.2, 0.22, s + 0.2), matTrimOrange);
    ring.position.set(p.x, h - 1.4, p.z);
    worldGroup.add(ring);
  }

  // klastry skrzyń: 1–3 skrzynie w obrębie wspólnego, sprawdzonego pola
  const nClusters = 8 + Math.floor(rnd() * 5);
  for (let i = 0; i < nClusters; i++) {
    const cw = R(3.5, 6), cd = R(3.5, 6);
    const p = tryPlace(cw, cd);
    if (!p) continue;
    const count = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) {
      const s = R(1.6, Math.min(3.2, Math.min(cw, cd) - 0.4));
      const h = R(1.1, 2.4);
      const ox = R(-(cw - s) / 2, (cw - s) / 2);
      const oz = R(-(cd - s) / 2, (cd - s) / 2);
      addBlock(p.x + ox, p.z + oz, s, h, s, rnd() < 0.3 ? matCrateAlt : matCrate);
    }
  }

  // niskie murki-osłony (poziome lub pionowe)
  const nWalls = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < nWalls; i++) {
    const len = R(5, 9), h = R(1.4, 1.7);
    const horizontal = rnd() < 0.5;
    const p = tryPlace(horizontal ? len : 1, horizontal ? 1 : len);
    if (!p) continue;
    addBlock(p.x, p.z, horizontal ? len : 1, h, horizontal ? 1 : len, matWall);
  }
}

generateArena(ARENA_SEED);
__test.seed = ARENA_SEED;
// hash układu do testów determinizmu
__test.arenaHash = Math.round(colliders.reduce(
  (a, c) => a + c.minX * 3.7 + c.maxZ * 1.3 + c.minZ * 0.7, 0) * 100) / 100;
document.getElementById('arena-seed-hint').textContent =
  `Arena #${ARENA_SEED} — dopisz ?seed=${ARENA_SEED} do adresu, aby wrócić na ten układ.`;

/* animated world FX: pulse of the neon inlays + hologram scroll/flicker
   (called from tick) */
let worldFxT = 0;
function updateWorldFx(dt) {
  worldFxT += dt;
  floorMat.emissiveIntensity = 1.5 + Math.sin(worldFxT * 1.7) * 0.4;
  matWall.emissiveIntensity = 1.2 + Math.sin(worldFxT * 1.7 + 1.3) * 0.3;
  const flicker = 0.48 + 0.07 * Math.sin(worldFxT * 9.3) + 0.05 * Math.sin(worldFxT * 2.1);
  for (const m of holoMats) {
    m.map.offset.y -= dt * m.userData.scrollSpeed; // data stream drifts upward
    m.opacity = flicker;
  }
}
