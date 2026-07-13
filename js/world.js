/* NEON ARENA — arena lifecycle: shell, holos, seeded obstacle generator
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html.

   This file only DEFINES buildArena()/clearArena(); the first build is
   invoked from main.js after every script has executed, so the arena can be
   rebuilt at runtime (campaign missions) and world code may safely call
   helpers defined in later files (el(), …) at call time. */
'use strict';

/* ==================== ŚWIAT / ARENA ==================== */

const worldGroup = new THREE.Group();   // cel raycastów: ściany, przeszkody, podłoga
scene.add(worldGroup);
/* decor lives outside worldGroup on purpose: holograms and other markers must
   not catch shots, decals or enemy LOS raycasts */
const decorGroup = new THREE.Group();
scene.add(decorGroup);
const colliders = [];                   // AABB { minX, maxX, minZ, maxZ }

/* runtime descriptor of the currently built arena (filled by buildArena) */
const arena = {
  seed: 0,
  half: ARENA_HALF, // playable half-size; < ARENA_HALF builds an inner wall ring
  style: 'open',
  theme: 'indigo',
  density: 0.5,
  playerSpawn: { x: 0, z: 26, yaw: 0 },
  pickups: [],      // [{ kind, x, z, clearR? }] — consumed by placeArenaPickups()
  setPieces: [],    // raw defs (props.js, campaign)
  seedHint: true,
};

/* bot spawn points — [{ x, z, tag }]; const array, MUTATED on rebuild
   (enemies.js and the obstacle generator read it) */
const spawnPoints = [];

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

/* "ground" plane outside the arena, fading into the fog — built once,
   shared by every arena, never torn down */
{
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
   crates keep the default box UVs (each face = whole framed-panel design).
   All of these are module-level and SHARED across arena rebuilds — teardown
   must never dispose them. */
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
  if (collide) {
    colliders.push({
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2,
      top: m.position.y + h / 2, // flying units ignore colliders below their altitude
    });
  }
  return m;
}

/* animated holographic panel materials; scrolled + flickered in updateWorldFx.
   Materials and the plane geometry are module-level and shared — the panel
   MESHES are rebuilt per arena into decorGroup (removed, never disposed). */
const holoMats = [];
const holoGeo = new THREE.PlaneGeometry(2.4, 3.2);
/* per-arena text-log materials: unlike holoMats these carry a per-build
   CanvasTexture, so teardown must dispose both material and map */
const logMats = [];

/* per-mission look: fog + boundary trim color; the arena mode always
   rebuilds as 'indigo', so the shared materials never drift */
const ARENA_THEMES = {
  indigo: { fog: 0x232946, near: 42, far: 150, trim: PALETTE.teal },
  ember:  { fog: 0x2a1a24, near: 34, far: 130, trim: PALETTE.orange },
  alert:  { fog: 0x261423, near: 26, far: 110, trim: PALETTE.red },
};

function applyTheme(name) {
  const t = ARENA_THEMES[name] || ARENA_THEMES.indigo;
  scene.fog.color.setHex(t.fog);
  scene.fog.near = t.near;
  scene.fog.far = t.far;
  matTrim.emissive.setHex(t.trim);
}
{
  const mkHolo = (seed, speed) => {
    const m = new THREE.MeshBasicMaterial({
      map: TexGen.makeHologramTexture(seed),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false, // fog would tint the whole additive quad, glowing where it should be empty
    });
    m.userData.scrollSpeed = speed;
    holoMats.push(m);
    return m;
  };
  mkHolo(101, 0.045); mkHolo(202, 0.075); mkHolo(303, 0.06); mkHolo(404, 0.09);
}

/* ==================== BUDOWA / ROZBIÓRKA ARENY ==================== */

/* the default def: today's endless arena — self-contained so the arena mode
   can never be broken by a bad mission def (missions.js supplies its own).
   ?style/?half/?density are debug overrides for eyeballing the generator;
   at the defaults (open/35/0.5) every value below matches the historical
   generator exactly, so shareable ?seed=N links keep working. */
function arenaModeDef() {
  const half = (TEST_HALF >= 18 && TEST_HALF <= ARENA_HALF) ? TEST_HALF : ARENA_HALF;
  const k = half / ARENA_HALF;               // coordinate scale for non-default sizes
  const c = v => Math.round(v * k);
  return {
    arena: {
      seed: ARENA_SEED,
      half,
      density: Number.isFinite(TEST_DENSITY) ? Math.max(0, Math.min(1, TEST_DENSITY)) : 0.5,
      style: TEST_STYLE || 'open',
      theme: 'indigo',
      playerSpawn: { x: 0, z: c(26), yaw: 0 },
      spawnPoints: null,   // null → default perimeter ring of 8
      pickups: [
        // clearR mirrors the historical keepClear radii so identical seeds
        // keep producing identical layouts
        { kind: 'ammo', x: 0,     z: 0,      clearR: 2.5 },
        { kind: 'ammo', x: c(-16), z: c(16),  clearR: 2 },
        { kind: 'ammo', x: c(16),  z: c(-16), clearR: 2 },
        { kind: 'med',  x: c(26),  z: c(26),  clearR: 2.2 },
        { kind: 'med',  x: c(-26), z: c(-26), clearR: 2.2 },
      ],
      holos: null,         // null → default 8 wall panels
      setPieces: [],
      seedHint: true,
    },
  };
}

/* Tear the arena down. Geometries are per-build (addBlock mints a fresh
   BoxGeometry because applyBoxUV mutates its UVs) and MUST be disposed, or
   every rebuild leaks VRAM. Materials and TexGen textures are module-level
   and SHARED across every arena — disposing them would blank the world on
   the next build. Same for holoGeo, which is why decorGroup children are
   removed but not disposed. */
function clearArena() {
  for (let i = worldGroup.children.length - 1; i >= 0; i--) {
    const m = worldGroup.children[i];
    worldGroup.remove(m);
    if (m.geometry) m.geometry.dispose();     // materials: shared, do NOT dispose
  }
  for (let i = decorGroup.children.length - 1; i >= 0; i--) {
    decorGroup.remove(decorGroup.children[i]);
  }
  colliders.length = 0;   // const arrays → mutate, never reassign
  spawnPoints.length = 0;
  for (const m of logMats) { m.map.dispose(); m.dispose(); }
  logMats.length = 0;
  clearProps();           // props.js — drops refs + per-prop materials
}

function buildArena(def) {
  const a = def.arena;
  arena.half = Math.max(18, Math.min(ARENA_HALF, a.half || ARENA_HALF));
  arena.style = a.style || 'open';
  arena.theme = a.theme || 'indigo';
  arena.density = a.density === undefined ? 0.5 : a.density;
  arena.playerSpawn = { x: a.playerSpawn.x, z: a.playerSpawn.z, yaw: a.playerSpawn.yaw || 0 };
  arena.pickups = (a.pickups || []).map(p => ({ ...p }));
  arena.setPieces = a.setPieces || [];
  arena.seedHint = a.seedHint !== false;

  // build + validate; a hand-picked mission seed that walls off a spawn or
  // pickup gets deterministically nudged (seed+1, …) instead of shipping an
  // unreachable layout. 1 m flood-fill from the player spawn is the check.
  let seedTry = a.seed, ok = false;
  for (let attempt = 0; attempt < 6 && !ok; attempt++) {
    seedTry = a.seed + attempt;
    clearArena();
    applyTheme(arena.theme);
    buildShell();
    buildHolos(a.holos);
    buildLogPanels(a.logs);
    buildSpawnPoints(a.spawnPoints);
    buildSetPieces(arena.setPieces); // before obstacles: they claim keep-clear zones
    generateObstacles({
      seed: seedTry, half: arena.half, density: arena.density, style: arena.style,
    });
    ok = validateArena();
  }
  arena.seed = seedTry;
  __test.arenaReachable = ok;

  // the camera idles at the player spawn until the run starts
  camera.position.set(arena.playerSpawn.x, PLAYER_EYE, arena.playerSpawn.z);

  __test.seed = arena.seed;
  // layout hash for determinism tests (and a leak canary: a rebuild with the
  // same seed must reproduce it exactly — stale colliders would change it)
  __test.arenaHash = Math.round(colliders.reduce(
    (acc, c) => acc + c.minX * 3.7 + c.maxZ * 1.3 + c.minZ * 0.7, 0) * 100) / 100;
  const hint = document.getElementById('arena-seed-hint');
  if (hint) {
    hint.textContent = arena.seedHint
      ? `Arena #${arena.seed} — dopisz ?seed=${arena.seed} do adresu, aby wrócić na ten układ.`
      : '';
  }
}

/* one square ring of walls + glowing crown trims */
function buildRing(half, H) {
  const T = 1.2, L = half * 2 + T * 2;
  addBlock(0, -half - T / 2, L, H, T, matWall);
  addBlock(0,  half + T / 2, L, H, T, matWall);
  addBlock(-half - T / 2, 0, T, H, L, matWall);
  addBlock( half + T / 2, 0, T, H, L, matWall);
  const trims = [
    [0, -half - T / 2, L, 0.15, 0.2],
    [0,  half + T / 2, L, 0.15, 0.2],
    [-half - T / 2, 0, 0.2, 0.15, L],
    [ half + T / 2, 0, 0.2, 0.15, L],
  ];
  for (const [x, z, w, h, d] of trims) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matTrim);
    t.position.set(x, H + 0.07, z);
    worldGroup.add(t);
  }
}

/* floor + outer hall walls; smaller arenas get an inner ring — the playable
   boundary — with the full dark hall still visible beyond it. ARENA_HALF
   itself stays constant (renderer fog/shadows and the collision clamp are
   tuned for it); variable size is entirely the inner ring's job. */
function buildShell() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 4, ARENA_HALF * 2 + 4),
    floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  worldGroup.add(floor);

  buildRing(ARENA_HALF, 4.5);
  if (arena.half < ARENA_HALF - 0.01) buildRing(arena.half, 4.5);
}

/* holographic panels on the inner faces of the playable boundary walls */
function buildHolos(spots) {
  const F = arena.half - 0.03; // just off the inner wall face
  const o = Math.round(arena.half * 0.4); // 14 at the default half of 35
  // [x, z, yaw, materialIndex]: two panels per wall, facing the arena
  const list = spots || [
    [-o,  F, Math.PI, 0], [o,  F, Math.PI, 1],
    [-o, -F, 0, 2],       [o, -F, 0, 3],
    [ F, -o, -Math.PI / 2, 2], [ F, o, -Math.PI / 2, 0],
    [-F, -o,  Math.PI / 2, 1], [-F, o,  Math.PI / 2, 3],
  ];
  for (const [x, z, yaw, mi] of list) {
    const p = new THREE.Mesh(holoGeo, holoMats[mi % holoMats.length]);
    p.position.set(x, 2.5, z);
    p.rotation.y = yaw;
    decorGroup.add(p);
  }
}

/* campaign worldbuilding: two wall panels with real (Polish) log lines,
   opposite each other; texture is per-build and disposed in clearArena */
function buildLogPanels(lines) {
  if (!lines || !lines.length) return;
  const F = arena.half - 0.03;
  const o = Math.round(arena.half * 0.7);
  const m = new THREE.MeshBasicMaterial({
    map: TexGen.makeLogTexture(arena.seed, lines),
    transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  logMats.push(m);
  for (const [x, z, yaw] of [[-o, F, Math.PI], [o, -F, 0]]) {
    const p = new THREE.Mesh(holoGeo, m);
    p.position.set(x, 2.5, z);
    p.rotation.y = yaw;
    decorGroup.add(p);
  }
}

/* bot spawn points; used by the generator (keep-clear zones) and enemies.js.
   The default ring reproduces the historical ±29/±30 coords at half = 35. */
function buildSpawnPoints(list) {
  const d = arena.half - 6, ax = arena.half - 5;
  const pts = list || [
    { x: -d, z: -d }, { x: 0, z: -ax }, { x: d, z: -d }, { x: -ax, z: 0 },
    { x: ax, z: 0 }, { x: -d, z: d }, { x: 0, z: ax }, { x: d, z: d },
  ];
  for (const p of pts) spawnPoints.push({ x: p.x, z: p.z, tag: p.tag || null });
}

/* ==================== GENERATOR PRZESZKÓD (deterministyczny, seed w URL) ==================== */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateObstacles({ seed, half, density, style }) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const placedBoxes = [];
  // zones that must stay free: player spawn, arena pickups, bot spawn points
  const keepClear = [
    { x: arena.playerSpawn.x, z: arena.playerSpawn.z, r: 5 },
    ...arena.pickups.map(p => ({ x: p.x, z: p.z, r: p.clearR || 2.2 })),
    ...spawnPoints.map(s => ({ x: s.x, z: s.z, r: 4 })),
    // walking up to a set-piece must always be possible
    ...props.map(p => ({ x: p.pos.x, z: p.pos.z, r: p.clearR })),
  ];
  const MARGIN = 2.2;        // minimal gap between obstacles (bots have r ≤ 0.7·1.25)
  const BOUND = half - 5;    // obstacle AABB limit (historical 30 at half 35)
  const PLACE = half - 7;    // random placement range (historical 28 at half 35)
  const areaScale = (half / 35) ** 2;
  const densScale = density / 0.5; // 1.0 at the default density

  // keep-clear + spacing check without the BOUND box (corridor walls
  // intentionally touch the boundary ring)
  function clearOk(minX, maxX, minZ, maxZ) {
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

  function fits(minX, maxX, minZ, maxZ) {
    if (minX < -BOUND || maxX > BOUND || minZ < -BOUND || maxZ > BOUND) return false;
    return clearOk(minX, maxX, minZ, maxZ);
  }

  function tryPlace(w, d, attempts = 40) {
    for (let i = 0; i < attempts; i++) {
      const x = R(-PLACE, PLACE), z = R(-PLACE, PLACE);
      if (fits(x - w / 2, x + w / 2, z - d / 2, z + d / 2)) {
        placedBoxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        return { x, z };
      }
    }
    return null;
  }

  function addPillar(x, z, s, h) {
    addBlock(x, z, s, h, s, matWall);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(s + 0.2, 0.22, s + 0.2), matTrimOrange);
    ring.position.set(x, h - 1.4, z);
    worldGroup.add(ring);
  }

  function scatterCrates(n, hMax = 2.4) {
    for (let i = 0; i < n; i++) {
      const s = R(1.6, 2.8), h = R(1.1, hMax);
      const p = tryPlace(s, s);
      if (!p) continue;
      addBlock(p.x, p.z, s, h, s, rnd() < 0.3 ? matCrateAlt : matCrate);
    }
  }

  /* --- style: open — the historical scatter (pillars + crate clusters +
     low cover). Counts keep the historical RNG sequence and are identical
     at the defaults, so old ?seed=N layouts survive. --- */
  function genOpen() {
    const nPillars = Math.round((3 + Math.floor(rnd() * 3)) * areaScale * densScale);
    for (let i = 0; i < nPillars; i++) {
      const s = R(2, 2.6), h = R(4.2, 5.5);
      const p = tryPlace(s, s);
      if (!p) continue;
      addPillar(p.x, p.z, s, h);
    }
    // crate clusters: 1–3 crates within one shared, validated field
    const nClusters = Math.round((8 + Math.floor(rnd() * 5)) * areaScale * densScale);
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
    // low cover walls (horizontal or vertical)
    const nWalls = Math.round((3 + Math.floor(rnd() * 3)) * areaScale * densScale);
    for (let i = 0; i < nWalls; i++) {
      const len = R(5, 9), h = R(1.4, 1.7);
      const horizontal = rnd() < 0.5;
      const p = tryPlace(horizontal ? len : 1, horizontal ? 1 : len);
      if (!p) continue;
      addBlock(p.x, p.z, horizontal ? len : 1, h, horizontal ? 1 : len, matWall);
    }
  }

  /* --- style: pillars — a jittered lattice (hala filarów). A lattice has no
     dead ends by construction: the straight-line chaser AI always slides
     around a column. Cell 7 m − pillar ≤2.6 m → passages ≥ 4.4 m. --- */
  function genPillarHall() {
    const cell = 7.0;
    const k = Math.floor((half - 5) / cell);
    const fill = 0.35 + 0.45 * Math.min(1, density);
    for (let gx = -k; gx <= k; gx++) {
      for (let gz = -k; gz <= k; gz++) {
        if (rnd() > fill) continue;
        const s = R(2, 2.6), h = R(4.2, 5.5);
        const x = gx * cell + R(-0.8, 0.8);
        const z = gz * cell + R(-0.8, 0.8);
        if (!fits(x - s / 2, x + s / 2, z - s / 2, z + s / 2)) continue;
        placedBoxes.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2 });
        addPillar(x, z, s, h);
      }
    }
    scatterCrates(Math.max(2, Math.round(5 * areaScale * densScale)), 1.7);
  }

  /* --- style: corridors — a comb, deliberately NOT a maze: staggered
     parallel walls anchored to alternating sides, each spanning ≤58% of the
     width, so the openings form an S-path and never a cul-de-sac. Walls are
     2.6 m tall (block LOS) and never close a rectangle — the straight-line
     bot AI with its 0.35 s sidestep must always find a way around. --- */
  function genCorridors() {
    const lanes = 3 + Math.round(Math.min(1, density) * 2);
    const wallT = 1.1, wallH = 2.6;
    for (let i = 0; i < lanes; i++) {
      const zBase = -half + (i + 1) * (2 * half / (lanes + 1));
      const len = 2 * half * R(0.42, 0.58);
      const fromLeft = i % 2 === 0;
      const x = fromLeft ? -half + len / 2 : half - len / 2;
      for (let a = 0; a < 6; a++) {
        const z = zBase + R(-1.5, 1.5);
        const minX = x - len / 2, maxX = x + len / 2;
        const minZ = z - wallT / 2, maxZ = z + wallT / 2;
        if (!clearOk(minX, maxX, minZ, maxZ)) continue;
        placedBoxes.push({ minX, maxX, minZ, maxZ });
        addBlock(x, z, len, wallH, wallT, matWall);
        // a perpendicular stub breaks the sightline down the open half
        if (rnd() < 0.5) {
          const sd = R(4, 7);
          const sx = fromLeft ? maxX + 4 : minX - 4;
          const sz = z + (rnd() < 0.5 ? -1 : 1) * R(3, 6);
          if (Math.abs(sx) < half - 2 && Math.abs(sz) + sd / 2 < half - 2 &&
              clearOk(sx - wallT / 2, sx + wallT / 2, sz - sd / 2, sz + sd / 2)) {
            placedBoxes.push({ minX: sx - wallT / 2, maxX: sx + wallT / 2,
                               minZ: sz - sd / 2, maxZ: sz + sd / 2 });
            addBlock(sx, sz, wallT, 2.2, sd, matWall);
          }
        }
        break;
      }
    }
    scatterCrates(Math.max(3, Math.round(6 * areaScale * densScale)), 1.7);
  }

  if (style === 'pillars') genPillarHall();
  else if (style === 'corridors') genCorridors();
  else genOpen();
}

/* Reachability insurance for authored seeds: flood-fill a 1 m grid from the
   player spawn, treating cells inside any collider inflated by 0.9 (the
   heavy bot's radius) as blocked. Every bot spawn point and pickup must be
   reachable, or buildArena retries with the next seed. ~O(half²), runs once
   per build. */
function validateArena() {
  const half = arena.half;
  const N = Math.floor(half * 2);
  const blocked = new Uint8Array(N * N);
  const INFLATE = 0.9;
  for (const c of colliders) {
    const minI = Math.max(0, Math.floor(c.minX - INFLATE + half));
    const maxI = Math.min(N - 1, Math.ceil(c.maxX + INFLATE + half) - 1);
    const minJ = Math.max(0, Math.floor(c.minZ - INFLATE + half));
    const maxJ = Math.min(N - 1, Math.ceil(c.maxZ + INFLATE + half) - 1);
    for (let j = minJ; j <= maxJ; j++) {
      for (let i = minI; i <= maxI; i++) blocked[j * N + i] = 1;
    }
  }
  const cellI = x => Math.max(0, Math.min(N - 1, Math.floor(x + half)));
  const reach = new Uint8Array(N * N);
  const queue = [];
  // seed the fill at (or right next to) the player spawn
  const si = cellI(arena.playerSpawn.x), sj = cellI(arena.playerSpawn.z);
  outer:
  for (let r = 0; r <= 3; r++) {
    for (let j = Math.max(0, sj - r); j <= Math.min(N - 1, sj + r); j++) {
      for (let i = Math.max(0, si - r); i <= Math.min(N - 1, si + r); i++) {
        if (!blocked[j * N + i]) { reach[j * N + i] = 1; queue.push(i, j); break outer; }
      }
    }
  }
  for (let q = 0; q < queue.length; q += 2) {
    const i = queue[q], j = queue[q + 1];
    if (i > 0 && !blocked[j * N + i - 1] && !reach[j * N + i - 1]) { reach[j * N + i - 1] = 1; queue.push(i - 1, j); }
    if (i < N - 1 && !blocked[j * N + i + 1] && !reach[j * N + i + 1]) { reach[j * N + i + 1] = 1; queue.push(i + 1, j); }
    if (j > 0 && !blocked[(j - 1) * N + i] && !reach[(j - 1) * N + i]) { reach[(j - 1) * N + i] = 1; queue.push(i, j - 1); }
    if (j < N - 1 && !blocked[(j + 1) * N + i] && !reach[(j + 1) * N + i]) { reach[(j + 1) * N + i] = 1; queue.push(i, j + 1); }
  }
  const reachable = (x, z) => {
    const ci = cellI(x), cj = cellI(z);
    for (let j = Math.max(0, cj - 2); j <= Math.min(N - 1, cj + 2); j++) {
      for (let i = Math.max(0, ci - 2); i <= Math.min(N - 1, ci + 2); i++) {
        if (reach[j * N + i]) return true;
      }
    }
    return false;
  };
  for (const s of spawnPoints) if (!reachable(s.x, s.z)) return false;
  for (const p of arena.pickups) if (!reachable(p.x, p.z)) return false;
  for (const p of props) if (!reachable(p.pos.x, p.pos.z)) return false;
  return true;
}

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
