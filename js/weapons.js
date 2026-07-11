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
  { id: 'shotgun', name: 'Strzelba',  slot: 2, damage: 11,  rpm: 80,  auto: false, pellets: 8, spread: 0.07,
    adsMul: 0.6, magSize: 6, startReserve: 30, maxReserve: 48, reloadTime: 2.0, kick: 0.035, vmKick: 0.14, zoom: false },
  { id: 'smg',     name: 'Karabin SMG', slot: 3, damage: 12, rpm: 720, auto: true, pellets: 1, spread: 0.05,
    magSize: 30, startReserve: 150, maxReserve: 240, reloadTime: 1.5,  kick: 0.007, vmKick: 0.04, zoom: false },
  { id: 'sniper',  name: 'Snajperka', slot: 4, damage: 130, rpm: 45,  auto: false, pellets: 1, spread: 0.08,
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

/* --- viewmodele (proceduralne pistolety z klocków) --- */
const vmMatDark = new THREE.MeshStandardMaterial({ color: 0x2e3155, roughness: 0.6, metalness: 0.3, flatShading: true });
const vmMatMid  = new THREE.MeshStandardMaterial({ color: 0x4a4f80, roughness: 0.65, metalness: 0.2, flatShading: true });
const vmMatTeal = new THREE.MeshStandardMaterial({ color: 0x073a33, emissive: PALETTE.teal, emissiveIntensity: 1.2, roughness: 0.5 });
const vmMatOrange = new THREE.MeshStandardMaterial({ color: 0x33210a, emissive: PALETTE.orange, emissiveIntensity: 1.1, roughness: 0.5 });

function vmBox(parent, w, h, d, x, y, z, mat = vmMatDark) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildViewmodel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'pistol':
      vmBox(g, 0.07, 0.1, 0.3,  0, 0.02, -0.05);            // zamek
      vmBox(g, 0.06, 0.14, 0.09, 0, -0.09, 0.05, vmMatMid); // rękojeść
      vmBox(g, 0.03, 0.03, 0.1,  0, 0.03, -0.22);           // lufa
      vmBox(g, 0.012, 0.02, 0.012, 0, 0.078, -0.185, vmMatTeal); // muszka (na przodzie zamka)
      vmBox(g, 0.01, 0.016, 0.01, -0.02, 0.076, 0.06);      // szczerbinka L (tył zamka)
      vmBox(g, 0.01, 0.016, 0.01,  0.02, 0.076, 0.06);      // szczerbinka P
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.03, -0.3);
      g.userData.adsPos = new THREE.Vector3(0, -0.078, -0.42); // muszka w osi kamery
      break;
    case 'shotgun':
      vmBox(g, 0.09, 0.11, 0.55, 0, 0, -0.15, vmMatMid);    // korpus
      vmBox(g, 0.05, 0.05, 0.5,  0, 0.06, -0.2);            // lufa
      vmBox(g, 0.07, 0.12, 0.12, 0, -0.1, 0.12);            // kolba/chwyt
      vmBox(g, 0.1, 0.03, 0.12,  0, -0.04, -0.28, vmMatOrange); // pompka
      vmBox(g, 0.014, 0.016, 0.014, 0, 0.092, -0.42, vmMatTeal); // koralik na końcu lufy
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.06, -0.48);
      g.userData.adsPos = new THREE.Vector3(0, -0.092, -0.44);
      break;
    case 'smg':
      vmBox(g, 0.08, 0.12, 0.42, 0, 0, -0.1, vmMatMid);     // korpus
      vmBox(g, 0.035, 0.035, 0.22, 0, 0.02, -0.4);          // lufa
      vmBox(g, 0.05, 0.16, 0.08, 0, -0.13, 0.02);           // magazynek
      vmBox(g, 0.06, 0.12, 0.08, 0, -0.1, 0.14);            // chwyt
      vmBox(g, 0.02, 0.04, 0.16, 0, 0.09, -0.1);            // szyna
      vmBox(g, 0.012, 0.02, 0.012, 0, 0.115, -0.165, vmMatTeal); // muszka (przód szyny)
      vmBox(g, 0.008, 0.014, 0.008, -0.016, 0.113, -0.035); // szczerbinka L (tył szyny)
      vmBox(g, 0.008, 0.014, 0.008,  0.016, 0.113, -0.035); // szczerbinka P
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.02, -0.52);
      g.userData.adsPos = new THREE.Vector3(0, -0.115, -0.42);
      break;
    case 'sniper':
      vmBox(g, 0.07, 0.1, 0.65,  0, 0, -0.2, vmMatMid);     // korpus
      vmBox(g, 0.03, 0.03, 0.45, 0, 0.02, -0.65);           // długa lufa
      vmBox(g, 0.05, 0.07, 0.2,  0, 0.1, -0.1);             // luneta
      vmBox(g, 0.02, 0.02, 0.02, 0, 0.1, -0.21, vmMatOrange); // soczewka
      vmBox(g, 0.06, 0.13, 0.1,  0, -0.11, 0.08);           // chwyt
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.02, -0.88);
      break;
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
  AudioSys.switch_();
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

  // z biodra strzela się niecelnie; ADS zbija rozrzut (snajperka: spreadZoom)
  const spread = aiming
    ? (w.spreadZoom !== undefined ? w.spreadZoom : w.spread * (w.adsMul || 0.3))
    : w.spread;
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
        spawnParticles(h.point, 0xaab2e8, 4, 3.5, 0.3, 7);
        if (h.face) {
          _hitNormal.copy(h.face.normal)
            .transformDirection(h.object.matrixWorld);
          spawnDecal(h.point, _hitNormal);
        }
      }
    } else {
      end = _tv.copy(camera.position).addScaledVector(_shootDir, 120).clone();
    }
    spawnTracer(_muzzleWorld, end, PALETTE.tracer);
  }

  if (anyHit) showHitmarker(anyKill, anyHead);

  // odrzut: viewmodel + podbicie kamery
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
  else targetFov = BASE_FOV + (player.sprinting ? 6 : 0) + (player.hopBoost - 1) * 10;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  updateViewmodel(dt);
}
