/* NEON ARENA — player weapons, viewmodels, ADS, firing
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== BRONIE ==================== */

/* spread = rozrzut z biodra (celowo duży); ADS mnoży go przez adsMul (domyślnie 0.3) */
const WEAPONS = [
  { id: 'pistol',  name: 'Pistolet',  slot: 1, damage: 26,  rpm: 320, auto: false, pellets: 1, spread: 0.03,
    magSize: 12, startReserve: 72,  maxReserve: 120, reloadTime: 0.95, kick: 0.012, vmKick: 0.06, zoom: false },
  { id: 'smg',     name: 'SMG',       slot: 2, damage: 11,  rpm: 780, auto: true, pellets: 1, spread: 0.045,
    magSize: 30, startReserve: 150, maxReserve: 240, reloadTime: 1.4,  kick: 0.006, vmKick: 0.035, zoom: false },
  { id: 'shotgun', name: 'Strzelba',  slot: 3, damage: 11,  rpm: 80,  auto: false, pellets: 8, spread: 0.07,
    adsMul: 0.6, magSize: 6, startReserve: 30, maxReserve: 48, reloadTime: 2.0, kick: 0.035, vmKick: 0.14, zoom: false },
  { id: 'rifle',   name: 'Karabin',   slot: 4, damage: 15,  rpm: 640, auto: true, pellets: 1, spread: 0.05,
    magSize: 30, startReserve: 120, maxReserve: 210, reloadTime: 1.6,  kick: 0.009, vmKick: 0.05, zoom: false },
  { id: 'sniper',  name: 'Snajperka', slot: 5, damage: 130, rpm: 45,  auto: false, pellets: 1, spread: 0.08,
    spreadZoom: 0.0015, magSize: 5, startReserve: 20, maxReserve: 35, reloadTime: 2.2, kick: 0.05, vmKick: 0.2, zoom: true },
];

for (const w of WEAPONS) {
  w.fireInterval = 60 / w.rpm;
  w.baseMag = w.magSize;          // wartości bazowe — ulepszenia sklepu je skalują
  w.baseMaxReserve = w.maxReserve;
  w.mag = w.magSize;
  w.reserve = w.startReserve;
  w.owned = w.id === 'pistol';    // start tylko z pistoletem; resztę kupuje się w sklepie
}

let currentWeapon = 0;
let fireCooldown = 0;
let reloading = false;
let reloadTimer = 0;
let reloadDuration = 1; // faktyczny czas bieżącego przeładowania (z ulepszeniem)

/* --- viewmodele (wypieczone modele z tools/gen_models.py, materiały nasze) --- */
const vmMatDark = new THREE.MeshStandardMaterial({ color: 0x2e3155, roughness: 0.6, metalness: 0.3, flatShading: true });
const vmMatMid  = new THREE.MeshStandardMaterial({ color: 0x4a4f80, roughness: 0.65, metalness: 0.2, flatShading: true });
const vmMatOrange = new THREE.MeshStandardMaterial({ color: 0x33210a, emissive: PALETTE.orange, emissiveIntensity: 1.1, roughness: 0.5 });
/* The long guns wear the PISTOL's palette (user call 2026-08-18: "kolory
   w stylu glocka") - vmMatDark bodies with vmMatMid metal, no wood tones and
   no near-black, so all five weapons look like one issued family. */
/* sniper scope lenses: a quiet amber sheen - at full emissive the eyepiece
   reads as a glowing disc at this scale */
const vmMatLens = new THREE.MeshStandardMaterial({ color: 0x4a2d08, emissive: PALETTE.orange, emissiveIntensity: 0.35, roughness: 0.3 });
const vmMatHidden = new THREE.MeshBasicMaterial({ visible: false });
/* the aim point: a tiny green emitter on the front sight (user call
   2026-08-18) - moulded sights are dark-on-dark and vanish at ADS range */
const vmMatDot = new THREE.MeshStandardMaterial({ color: 0x03200c, emissive: 0x00ff44, emissiveIntensity: 2.6, roughness: 0.4 });

/* Material map for the Quaternius guns pack (SMG / shotgun / rifle / sniper):
   they share one material vocabulary, so one resolver serves all four. */
function quatMat(src) {
  switch (src) {
    case 'Metal': case 'Grey': case 'MainLight': return vmMatMid;
    case 'Glass': return vmMatLens;
    // Wood/DarkWood/Green land here on purpose - no brown anywhere
    default: return vmMatDark;   // Black, DarkMetal, Main, MainDark, Wood…
  }
}

function vmBox(parent, w, h, d, x, y, z, mat = vmMatDark) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* cylinder along local Z (barrels, scopes, suppressors) */
function vmCyl(parent, r, len, x, y, z, mat = vmMatDark, seg = 10) {
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildViewmodel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'pistol': {
      // service Glock: baked CC-BY geometry (tools/gen_models.py), our metal.
      // The model is centred on its bounding box, so it is dropped a touch to
      // put the sight line where the block-built pistol used to have it.
      const m = buildModel('glock', src => (
        src.startsWith('Bullet') ? vmMatOrange
          : (src === 'Body' || src === 'Handle') ? vmMatMid : vmMatDark));
      m.root.position.set(0, -0.026, -0.08);
      g.add(m.root);
      g.userData.slide = m.parts.slide;   // cycles on every shot
      /* Sights are the model's own: a front blade (top y 0.1001 in model space)
         and a rear tab (0.1043). They are 4.2 mm out of level over a 245 mm
         sight radius, so instead of gluing anything on, the whole pistol is
         pitched up by that slope (0.98°) - both moulded tops then land on one
         height, which is where the ADS line is taken from. The barrel ends up
         1° above the camera axis, which is invisible and harmless: bullets
         follow the camera ray, not the muzzle. */
      m.root.rotation.x = 0.0176;
      /* the blade also carries the green aim dot the long guns use - scaled
         down (0.0028) so its angular size matches theirs at the closer pistol
         ADS distance; the pitch leaves the rear tab 1.5 mm below the line */
      vmBox(m.root, 0.0028, 0.0028, 0.002, 0, 0.1015, -0.133, vmMatDot);
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.037, -0.25);
      g.userData.adsPos = new THREE.Vector3(0, -0.0778, -0.42); // blade dot on the camera axis
      break;
    }
    /* Long guns are ANCHORED BY THEIR REAR, not by the bbox centre: root.z =
       0.41 - half-length puts every stock at world z -0.14 at the hip pose,
       so growing a gun makes its receiver bigger on screen instead of pushing
       the whole model away. ADS keeps the same clearance via adsPos.z -0.54
       (rear = adsPos.z + 0.41 = -0.13). They also all sit 0.03 LOWER than the
       pistol (user call) - adsPos.y pays that back, so only the hip pose
       moves. SMG and sniper are pulled a further 0.10 toward the camera. */
    case 'smg': {
      // Quaternius SMG (CC0): this one carries a closed top rail - two bridges
      // (front z -0.4158, rear z +0.0764) that SPAN the centreline at y 0.1904.
      // Their vertices all sit off-axis, so a near-axis probe misses them and
      // any lower sight line ends up looking straight into a bridge. The dot
      // therefore rides on TOP of the front bridge and the +0.0041 rad pitch
      // drops the rear one 4 mm below the sight line.
      const m = buildModel('smg', src => quatMat(src));
      vmBox(m.root, 0.004, 0.004, 0.003, 0, 0.1924, -0.4158, vmMatDot); // rail dot
      /* pulled 0.10 closer than the shared rear anchor (user call: it sat too
         far away); adsPos.z pays that back so the aiming pose is unchanged.
         The stock tip ends up ~0.04 m from the camera, but at the hip offset
         it is far outside the frustum, so it never shows. */
      m.root.position.set(0, -0.03, 0.01);
      m.root.rotation.x = 0.0041;
      g.add(m.root);
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.108, -0.49);
      g.userData.adsPos = new THREE.Vector3(0, -0.1641, -0.64); // rail dot on the camera axis
      break;
    }
    case 'shotgun': {
      // Quaternius shotgun (CC0): front post top 0.1132 @ z -0.606, rear post
      // 0.1190 @ z +0.304 (sight radius 0.91). Green emitter on the front
      // post; the +0.0086 rad pitch drops the rear 4 mm below the sight line.
      const m = buildModel('shotgun', src => quatMat(src));
      vmBox(m.root, 0.004, 0.004, 0.003, 0, 0.1152, -0.606, vmMatDot); // post dot
      m.root.position.set(0, -0.03, -0.315);
      m.root.rotation.x = 0.0086;
      g.add(m.root);
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.075, -1.04);
      g.userData.adsPos = new THREE.Vector3(0, -0.0904, -0.54); // post dot on the camera axis
      break;
    }
    case 'rifle': {
      // Quaternius assault rifle (CC0): the moulded front post reads as a
      // black sliver at ~1 m, so a green emitter dot rides its tip (post top
      // 0.1809 @ z -0.3186). The muzzle pitches DOWN 0.0478 rad so the rear
      // ridge top (0.1570 @ z +0.1389) sits 4 mm BELOW the sight line
      // (y 0.1677) - level with it, the nearer ridge would occlude the dot.
      const m = buildModel('rifle', src => quatMat(src));
      vmBox(m.root, 0.004, 0.004, 0.003, 0, 0.1829, -0.3186, vmMatDot); // post dot
      m.root.position.set(0, -0.03, -0.115);
      m.root.rotation.x = -0.0478;
      g.add(m.root);
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.087, -0.64);
      g.userData.adsPos = new THREE.Vector3(0, -0.1377, -0.54); // post dot on the camera axis
      break;
    }
    case 'sniper': {
      // Quaternius sniper rifle (CC0); PPM = scope overlay, so no adsPos -
      // the viewmodel hides while zoomed
      const m = buildModel('sniper', src => quatMat(src));
      m.root.position.set(0, -0.03, -0.28); // closer than the shared anchor, and lower
      g.add(m.root);
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.016, -1.07);
      break;
    }
  }
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}

const VM_BASE = new THREE.Vector3(0.32, -0.28, -0.55);
const viewmodels = WEAPONS.map(w => {
  const g = buildViewmodel(w.id);
  g.position.copy(VM_BASE);
  g.visible = false;
  camera.add(g);
  return g;
});
scene.add(camera); // kamera musi być w scenie, żeby dzieci (viewmodel) się renderowały
viewmodels[0].visible = true;

let vmBobT = 0;
let vmRecoil = 0;

function updateViewmodel(dt) {
  const vm = viewmodels[currentWeapon];
  const speedFactor = player.moving && player.onGround ? 1 : 0;
  vmBobT += dt * (keys['ShiftLeft'] ? 11 : 8) * (speedFactor ? 1 : 0.3);
  vmRecoil = Math.max(0, vmRecoil - dt * 6);
  const sprintScale = player.sprinting ? 1.7 : 1;
  const bobX = Math.sin(vmBobT) * 0.012 * (speedFactor || 0.25) * sprintScale;
  const bobY = Math.abs(Math.cos(vmBobT)) * 0.014 * (speedFactor || 0.25) * sprintScale;
  // animacja przeładowania: broń opada, przechyla się i obraca (0→1→0)
  let ra = 0;
  if (reloading) {
    const t = 1 - reloadTimer / reloadDuration; // 0→1
    ra = Math.sin(Math.PI * Math.min(1, t));
  }
  // ADS: płynne przejście do pozycji celowania (muszka w osi kamery)
  const w = WEAPONS[currentWeapon];
  const adsTarget = (aiming && !w.zoom && !reloading) ? 1 : 0;
  adsBlend += (adsTarget - adsBlend) * Math.min(1, dt * 12);
  const ads = vm.userData.adsPos || VM_BASE;
  const bx = VM_BASE.x + (ads.x - VM_BASE.x) * adsBlend;
  const by = VM_BASE.y + (ads.y - VM_BASE.y) * adsBlend;
  const bz = VM_BASE.z + (ads.z - VM_BASE.z) * adsBlend;
  const bobScale = 1 - 0.85 * adsBlend; // przy celowaniu broń prawie nie buja
  vm.position.set(
    bx + bobX * bobScale - ra * 0.05,
    by + bobY * bobScale - ra * 0.11,
    bz + vmRecoil - ra * 0.08   // odsuń od kamery (nigdy nie zbliżaj do near plane)
  );
  vm.rotation.set(
    vmRecoil * 1.5 - ra * 0.4,    // lufa w dół
    ra * 0.22,                     // lekki obrót w bok
    bobX * 0.6 * bobScale + ra * 0.3 // przechył
  );
  // ukryj viewmodel przy lunecie snajperki
  vm.visible = !(aiming && w.zoom);
}

function switchWeapon(idx) {
  if (game.noCombat) return; // epilogue: weapons stay stowed
  if (idx === currentWeapon || idx < 0 || idx >= WEAPONS.length) return;
  if (!WEAPONS[idx].owned) {
    AudioSys.empty();
    showCenterMsg('Broń zablokowana — kup w sklepie', 1.1, true);
    return;
  }
  viewmodels[currentWeapon].visible = false;
  currentWeapon = idx;
  viewmodels[currentWeapon].visible = true;
  reloading = false;
  hideReloadHud();
  setAiming(false);
  AudioSys.switch_(WEAPONS[currentWeapon].id);
  updateWeaponHud();
}

function setAiming(on) {
  const w = WEAPONS[currentWeapon];
  aiming = on;
  const scoped = aiming && w.zoom; // snajperka: pełna luneta
  document.getElementById('scope').style.display = scoped ? 'block' : 'none';
  document.getElementById('crosshair').style.display = aiming ? 'none' : 'block';
  lookScale = scoped ? 0.35 : (aiming ? 0.7 : 1);
}

function startReload() {
  if (game.noCombat) return;
  const w = WEAPONS[currentWeapon];
  if (reloading || w.mag >= w.magSize || w.reserve <= 0) return;
  reloading = true;
  reloadDuration = w.reloadTime * game.reloadMul;
  reloadTimer = reloadDuration;
  AudioSys.reloadSeq(reloadDuration);
  const rm = document.getElementById('reload-msg');
  rm.style.display = 'block';
}

function finishReload() {
  const w = WEAPONS[currentWeapon];
  const need = w.magSize - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
  reloading = false;
  hideReloadHud();
  updateWeaponHud();
}

function hideReloadHud() {
  document.getElementById('reload-msg').style.display = 'none';
}

const raycaster = new THREE.Raycaster();
raycaster.far = 250;
const _shootDir = new THREE.Vector3();
const _muzzleWorld = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();

function tryFire() {
  if (game.noCombat) return; // epilogue: no shooting at the parade
  const w = WEAPONS[currentWeapon];
  if (fireCooldown > 0 || reloading) return;
  if (w.mag <= 0) {
    fireCooldown = 0.25;
    AudioSys.empty();
    if (w.reserve > 0) { showCenterMsg('Brak amunicji — wciśnij R', 1.1, true); startReload(); }
    else showCenterMsg('Brak amunicji — zmień broń!', 1.1, true);
    return;
  }
  fireCooldown = w.fireInterval;
  w.mag--;
  AudioSys.shot(w.id);

  // pozycja lufy w świecie (do tracera i flasha)
  const vm = viewmodels[currentWeapon];
  if (vm.visible) {
    _muzzleWorld.copy(vm.userData.muzzleLocal);
    vm.localToWorld(_muzzleWorld);
  } else {
    camera.getWorldDirection(_shootDir);
    _muzzleWorld.copy(camera.position).addScaledVector(_shootDir, 0.4).y -= 0.05;
  }
  flashMuzzle(_muzzleWorld, w.id === 'shotgun' || w.id === 'sniper');

  // z biodra strzela się niecelnie; ADS zbija rozrzut (snajperka: spreadZoom),
  // kucanie daje mniejszy bonus do strzału z biodra
  const spread = aiming
    ? (w.spreadZoom !== undefined ? w.spreadZoom : w.spread * (w.adsMul || 0.3))
    : w.spread * (player.crouching ? 0.65 : 1);
  let anyHit = false, anyKill = false, anyHead = false;

  for (let p = 0; p < w.pellets; p++) {
    camera.getWorldDirection(_shootDir);
    _shootDir.x += (Math.random() - 0.5) * 2 * spread;
    _shootDir.y += (Math.random() - 0.5) * 2 * spread;
    _shootDir.z += (Math.random() - 0.5) * 2 * spread;
    _shootDir.normalize();
    raycaster.set(camera.position, _shootDir);
    const hits = raycaster.intersectObjects([worldGroup, enemiesGroup], true);
    let end = null;
    if (hits.length > 0) {
      const h = hits[0];
      end = h.point;
      const enemy = h.object.userData.enemyRef;
      if (enemy && enemy.alive) {
        anyHit = true;
        const isHead = !!h.object.userData.isHead;
        if (isHead) {
          anyHead = true;
          __test.headshots = (__test.headshots || 0) + 1;
          spawnParticles(h.point, 0xffd166, 7, 4.5, 0.4, 8);
        } else {
          spawnParticles(h.point, 0xff6a8a, 5, 4, 0.35, 8);
        }
        const dmg = w.damage * game.dmgMul * (isHead ? 2 : 1);
        if (damageEnemy(enemy, dmg, isHead)) anyKill = true;
      } else {
        const prop = h.object.userData.propRef;
        if (prop && prop.destructible && !prop.dead) {
          anyHit = true; // the hitmarker must fire — feedback matters
          spawnParticles(h.point, PALETTE.orange, 6, 4.5, 0.35, 8);
          AudioSys.hit();
          if (damageProp(prop, w.damage * game.dmgMul)) anyKill = true;
        } else {
          spawnParticles(h.point, 0xaab2e8, 4, 3.5, 0.3, 7);
          if (h.face) {
            _hitNormal.copy(h.face.normal)
              .transformDirection(h.object.matrixWorld);
            spawnDecal(h.point, _hitNormal);
          }
        }
      }
    } else {
      end = _tv.copy(camera.position).addScaledVector(_shootDir, 120).clone();
    }
    spawnTracer(_muzzleWorld, end, PALETTE.tracer);
  }

  if (anyHit) showHitmarker(anyKill, anyHead);
  missionShot(anyHit); // campaign accuracy counter (no-op outside)

  // recoil: viewmodel + camera kick
  vmRecoil = Math.min(0.25, vmRecoil + w.vmKick);
  camera.rotation.x += w.kick;

  updateWeaponHud();
  if (w.mag === 0 && w.reserve > 0) startReload();
}

function updateWeapons(dt) {
  fireCooldown = Math.max(0, fireCooldown - dt);
  if (reloading) {
    reloadTimer -= dt;
    document.getElementById('reload-fill').style.width =
      `${Math.min(100, (1 - reloadTimer / reloadDuration) * 100)}%`;
    if (reloadTimer <= 0) finishReload();
  }
  const w = WEAPONS[currentWeapon];
  if (firing && (w.auto || fireCooldown === 0)) {
    if (w.auto) tryFire();
    else { tryFire(); firing = false; } // broń półautomatyczna: jeden strzał na klik
  }
  // płynny FOV: luneta 24° / ADS 60° / sprint i bunnyhop poszerzają
  let targetFov;
  if (aiming && w.zoom) targetFov = ZOOM_FOV;
  else if (aiming) targetFov = 60;
  else targetFov = BASE_FOV + (player.sprinting ? 6 : 0) + (player.sliding ? 7 : 0)
    + (player.hopBoost - 1) * 10;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  updateViewmodel(dt);
}
