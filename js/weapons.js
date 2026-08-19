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

/* ==================== RĘCE (BRON-2) ====================
   Per-weapon arm placement (gun-model space) + reload-animation anchors.
   Baked FPS arms attach under each gun's model root (js/hands.js), so ADS,
   sway and recoil carry the hands for free. Anchors:
   mag/port = where the left hand works, low = off-frame (fresh mag/shell),
   bolt = charging handle / slide / pump, pull = its travel (dz). */
/* Per-weapon grip pose. `channel` (knuckle line) + `palm` orient the hand
   (js/hands.js), `curl` bends every finger chain in radians, proximal ->
   distal: f = paired middle/ring fingers, i = index, t = thumb. Every gun is
   held differently, so each hand gets its own curl:
   - a pistol grip is narrow -> fingers close hard, thumb locks over;
   - a pump/handguard is fat -> shallower wrap, thumb hooks under;
   - the FIRING hand's index finger rests on the trigger (bent at the first
     knuckle only), it never joins the fist. */
const CURL_TRIGGER = { f: [0.95, 1.00, 0.60], i: [0.50, 0.26, 0.12],
                      t: [0.45, 0.50, 0.30], tAdd: 0.55 };   // finger on the trigger
const CURL_FIST    = { f: [0.95, 1.00, 0.60], i: [0.92, 0.98, 0.58],
                      t: [0.50, 0.50, 0.30], tAdd: 0.70 };   // full wrap (support hand)
const CURL_PUMP    = { f: [0.80, 0.85, 0.50], i: [0.78, 0.82, 0.48],
                      t: [0.35, 0.40, 0.25], tAdd: 0.50 };   // fat pump/forend
const CURL_GUARD   = { f: [0.68, 0.72, 0.44], i: [0.64, 0.70, 0.42],
                      t: [0.30, 0.30, 0.20], tAdd: 0.45 };   // handguard, shallow

/* Neutral = the rig's own BIND pose, measured off the skeleton (2026-08-19),
   NOT hand-picked numbers. That matters: the hand orientation is set
   absolutely while the forearm is aimed separately, so the wrist absorbs
   whatever disagreement is left between them. The first version guessed
   `palm` and was 90 deg off the bind, which bent every wrist by a right angle
   and kinked the skin across it - the "twisted hands". Starting from bind
   means a reset gives a dead-straight arm with nothing to unbend.
     channel  axis of the hole through the closed fist = the knuckle line,
              which is what the grip is threaded through: it runs down a
              pistol grip and along a forend. The neutral has it lying across
              the gun (+X) only because the rig's BIND hand is flat and holds
              nothing - a dialled-in grip turns it onto the grip itself.
     palm     direction the BACK of the hand faces (neutral: up)
     fore     forearm direction, elbow -> wrist
     upper    upper-arm direction, shoulder -> elbow
   Remapped 2026-08-19: `channel` used to land on the hand bone's local X,
   which is the PALM normal on this rig, so the two fields were really aiming
   the palm and the fingers and every editor label lied. The orientations
   below are unchanged - the numbers were converted, not re-tuned.
   Note both hands share channel/palm: the arms are mirrored in POSITION, but
   the bind orientation of the two hand bones is the same (so on the right
   hand the channel runs index -> little finger, mirrored on the left). */
const NEUTRAL_R = { channel: [1, 0, 0], palm: [0, 1, 0],
                    fore: [-0.077, 0, -0.997], upper: [0.114, 0, -0.993] };
const NEUTRAL_L = { channel: [1, 0, 0], palm: [0, 1, 0],
                    fore: [0.077, 0, -0.997], upper: [-0.114, 0, -0.993] };

const HANDS = {
  /* RESET 2026-08-19: every orientation is back to a neutral start after the
     rig moved onto real bones (js/hands.js). `pos` (the per-weapon anchor the
     fist has to land on) is kept, because that is measured from the gun; the
     four direction fields below are deliberately the SAME on all five weapons
     and are meant to be dialled in per weapon in DEVRIG (key H on the range).

       channel  axis of the hole through the closed fist = the knuckle line
       palm     direction the BACK of the hand faces
       fore     forearm direction, elbow -> wrist
       upper    upper-arm direction, shoulder -> elbow  */
  pistol: {
    style: 'mag', scale: 1.05,
    /* dialled in in DEVRIG (2026-08-19). Nothing here is neutral any more:
       both hands are turned onto the grip, and the curls are per-weapon
       (a pistol grip is thin, so the fingers close differently than the
       shared CURL_* presets and both thumbs ride high along the frame). */
    r: { pos: [0.04, -0.018, 0.022],
         channel: [-0.0202, -0.9985, -0.0513],
         palm: [0.9984, -0.0175, -0.0532],
         fore: [-0.077, -0.0349, -0.9964],
         upper: [0.1139, -0.0523, -0.9921],
         curl: { f: [0.95, 0.63, 0.60], i: [0.28, 0.25, 0.12],
                 t: [0.00, 1.16, 0.26], tAdd: -0.08 } },
    l: { pos: [-0.026, -0.038, 0.032],
         channel: [-0.2503, 0.9653, -0.0737],
         palm: [-0.9555, -0.2586, -0.1421],
         fore: [0.3256, 0, -0.9455],
         upper: [0.4829, -0.0872, -0.8713],
         curl: { f: [0.00, 0.69, 0.00], i: [0.32, 0.00, 0.00],
                 t: [0.08, 1.25, 0.49], tAdd: -0.13 } },
    mag: [-0.0021, -0.0223, 0.0699], low: [-0.0521, -0.5273, 0.2749],
    bolt: [-0.0021, 0.1277, 0.0849], pull: 0.06,
    magDim: [0.018, 0.07, 0.032],
  },
  smg: {
    style: 'mag', scale: 1.05,
    r: { pos: [-0.0001, -0.0455, 0.0282], ...NEUTRAL_R, curl: CURL_TRIGGER },
    l: { pos: [0.0001, -0.0237, -0.3556], ...NEUTRAL_L, curl: CURL_GUARD },
    mag: [-0.0099, -0.1287, -0.1706], low: [-0.0699, -0.5787, 0.0844],
    bolt: [-0.0099, 0.1913, -0.0656], pull: 0.07,
    magDim: [0.024, 0.10, 0.05],
  },
  shotgun: {
    style: 'shell', scale: 1.0,
    r: { pos: [-0.0001, -0.0094, 0.234], ...NEUTRAL_R, curl: CURL_TRIGGER },
    l: { pos: [0.0001, 0.0265, -0.2195], ...NEUTRAL_L, curl: CURL_PUMP },
    port: [0.0451, 0.0065, 0.0805], low: [0.1401, -0.4785, 0.3305],
    bolt: [0.0001, 0.0265, -0.2195], pull: 0.12,   // bolt = the pump itself
    shellDim: [0.0115, 0.052],
  },
  rifle: {
    style: 'mag', scale: 1.05,
    r: { pos: [-0.0001, -0.0305, 0.1882], ...NEUTRAL_R, curl: CURL_TRIGGER },
    l: { pos: [0.0001, 0.0313, -0.3456], ...NEUTRAL_L, curl: CURL_GUARD },
    mag: [-0.0099, -0.1187, -0.0056], low: [-0.0699, -0.5787, 0.1344],
    bolt: [-0.0099, 0.1713, 0.0844], pull: 0.07,
    magDim: [0.026, 0.11, 0.055],
  },
  sniper: {
    style: 'shellBolt', scale: 1.0,
    r: { pos: [-0.0161, -0.0314, 0.384], ...NEUTRAL_R, curl: CURL_TRIGGER },
    l: { pos: [-0.0159, 0.0252, -0.3148], ...NEUTRAL_L, curl: CURL_GUARD },
    port: [0.0201, 0.0502, 0.1852], low: [0.1401, -0.4798, 0.4352],
    bolt: [0.0299, 0.0786, 0.234], pull: 0.08,
    shellDim: [0.007, 0.06],
  },
};

/* the fresh magazine / shell riding in the left fist during reloads */
const vmMatShell = new THREE.MeshStandardMaterial({
  color: 0x7d1f2e, emissive: PALETTE.red, emissiveIntensity: 0.25,
  roughness: 0.6, flatShading: true });

function attachHandsAndProps(g, id) {
  const cfg = HANDS[id];
  const gunRoot = g.children[0]; // every case adds exactly one model root
  g.userData.handCfg = cfg;
  g.userData.arms = attachArms(gunRoot, cfg);
  if (cfg.magDim) {
    const prop = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.magDim[0], cfg.magDim[1], cfg.magDim[2]), vmMatMid);
    prop.visible = false;
    attachToFist(g.userData.arms.L, prop);
    g.userData.magProp = prop;
  } else if (cfg.shellDim) {
    const geo = new THREE.CylinderGeometry(cfg.shellDim[0], cfg.shellDim[0], cfg.shellDim[1], 8);
    const prop = new THREE.Mesh(geo, id === 'shotgun' ? vmMatShell : vmMatMid);
    prop.visible = false;
    attachToFist(g.userData.arms.L, prop);
    g.userData.shellProp = prop;
  }
}

const viewmodels = WEAPONS.map(w => {
  const g = buildViewmodel(w.id);
  attachHandsAndProps(g, w.id);
  g.position.copy(VM_BASE);
  g.visible = false;
  camera.add(g);
  return g;
});
scene.add(camera); // kamera musi być w scenie, żeby dzieci (viewmodel) się renderowały
viewmodels[0].visible = true;

let vmBobT = 0;
let vmRecoil = 0;

/* ==================== POZY / ANIMACJE VIEWMODELU ==================== */

/* sprint: gun swings down and in toward the body (Battlefield-style) */
const SPRINT_POS = [-0.05, -0.11, -0.03];
const SPRINT_ROT = [-0.38, 0.55, 0.14];
let sprintBlend = 0;

/* sniper scope: the overlay waits for a raise animation - the rifle travels
   "to the eye" first (zoomBlend 0->1), only then the scope cuts in */
const ZOOM_RAISE = new THREE.Vector3(0.10, -0.16, -0.50);
let zoomBlend = 0;
let scoped = false;

function setScopeOverlay(on) {
  scoped = on;
  document.getElementById('scope').style.display = on ? 'block' : 'none';
  lookScale = on ? 0.35 : (aiming ? 0.7 : 1);
}

/* --- reload animation ---
   startReload() builds a plan (style, phase table, sound/prop events); the
   pose is computed per frame from the normalized time t (0..1) so the whole
   sequence scales with reloadTime * game.reloadMul. */
let reloadFromEmpty = false;
let relPlan = null;
let relEvIdx = 0;

function vmEase(t, a, b) { // smoothstep of t over [a, b]
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
function vmPulse(t, a, b) { const m = (a + b) / 2; return vmEase(t, a, m) * (1 - vmEase(t, m, b)); }
function lerp3(out, a, b, k) {
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
  return out;
}

/* phase tables (fractions of the reload); *_E = reload from an empty mag,
   which appends the charge (bolt/slide/pump) move at the end */
const T_MAG = { reach: [0.05, 0.22], out: [0.22, 0.42], back: [0.55, 0.73], ret: [0.78, 0.95] };
const T_MAG_E = { reach: [0.04, 0.16], out: [0.16, 0.32], back: [0.42, 0.58],
                  toBolt: [0.60, 0.70], pull: [0.70, 0.80], ret: [0.84, 0.97] };

const _gp = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
const _lp = [0, 0, 0];
const _rp = [0, 0, 0];

/* per-frame reload pose: fills _gp (gun offset) and places both hands */
function applyReloadPose(vm, t) {
  const cfg = vm.userData.handCfg;
  const rig = vm.userData.arms;
  const env = vmEase(t, 0, 0.10) * (1 - vmEase(t, 0.90, 1));
  const P = relPlan;
  let lw = 0, rw = 0;
  _lp[0] = 0; _lp[1] = 0; _lp[2] = 0;
  if (P.style === 'mag') {
    // gun tips slightly UP while the left hand swaps the magazine
    _gp.rx = 0.26 * env; _gp.ry = 0.10 * env; _gp.rz = 0.10 * env;
    _gp.px = -0.03 * env; _gp.py = -0.02 * env; _gp.pz = -0.03 * env;
    const T = P.empty ? T_MAG_E : T_MAG;
    if (t < T.out[0]) { lw = vmEase(t, T.reach[0], T.reach[1]); _lp[0] = cfg.mag[0]; _lp[1] = cfg.mag[1]; _lp[2] = cfg.mag[2]; }
    else if (t < T.back[0]) { lw = 1; lerp3(_lp, cfg.mag, cfg.low, vmEase(t, T.out[0], T.out[1])); }
    else if (t < T.back[1]) { lw = 1; lerp3(_lp, cfg.low, cfg.mag, vmEase(t, T.back[0], T.back[1])); }
    else if (!P.empty) { lw = 1 - vmEase(t, T.ret[0], T.ret[1]); _lp[0] = cfg.mag[0]; _lp[1] = cfg.mag[1]; _lp[2] = cfg.mag[2]; }
    else {
      // charge the bolt: hand rides to the handle, yanks it, lets go
      const T2 = T_MAG_E;
      const k = vmEase(t, T2.toBolt[0], T2.toBolt[1]);
      lerp3(_lp, cfg.mag, cfg.bolt, k);
      _lp[2] += cfg.pull * vmPulse(t, T2.pull[0], T2.pull[1]);
      _gp.pz += 0.02 * vmPulse(t, T2.pull[0], T2.pull[1]);
      _gp.rx += 0.10 * vmPulse(t, T2.pull[0], T2.pull[1]);
      lw = 1 - vmEase(t, T2.ret[0], T2.ret[1]);
    }
  } else {
    // shells one at a time; shotgun rolls to show the port, sniper pitches
    if (P.style === 'shell') {
      _gp.rx = -0.18 * env; _gp.rz = -0.35 * env;
      _gp.px = -0.03 * env; _gp.py = 0.02 * env;
    } else {
      _gp.rx = -0.16 * env; _gp.ry = 0.18 * env;
      _gp.px = -0.04 * env; _gp.py = 0.02 * env;
    }
    const [w0, w1] = P.win;
    if (t >= w0 && t < w1 && P.cycles > 0) {
      const cw = (w1 - w0) / P.cycles;
      const ct = ((t - w0) % cw) / cw; // 0..1 inside this cycle
      lw = 1;
      if (ct < 0.45) lerp3(_lp, cfg.low, cfg.port, vmEase(ct, 0.05, 0.45));
      else lerp3(_lp, cfg.port, cfg.low, vmEase(ct, 0.6, 1.0));
    } else if (t >= w1 && P.empty) {
      if (P.style === 'shell') {
        // the classic pump rack, left hand on the forend
        lw = vmEase(t, P.win[1], P.win[1] + 0.06);
        _lp[0] = cfg.bolt[0]; _lp[1] = cfg.bolt[1];
        _lp[2] = cfg.bolt[2] + cfg.pull * vmPulse(t, 0.78, 0.94);
        _gp.pz += 0.025 * vmPulse(t, 0.78, 0.94);
        _gp.rx -= 0.08 * vmPulse(t, 0.78, 0.94);
        lw *= 1 - vmEase(t, 0.95, 1.0);
      } else {
        // sniper: the RIGHT hand works the bolt at the rear
        rw = vmEase(t, 0.66, 0.76) * (1 - vmEase(t, 0.90, 0.98));
        _rp[0] = cfg.bolt[0]; _rp[1] = cfg.bolt[1];
        _rp[2] = cfg.bolt[2] + cfg.pull * vmPulse(t, 0.76, 0.90);
        _gp.pz += 0.02 * vmPulse(t, 0.76, 0.90);
        _gp.rx -= 0.06 * vmPulse(t, 0.76, 0.90);
      }
    } else if (t < w0) {
      lw = vmEase(t, 0.02, w0); _lp[0] = cfg.low[0]; _lp[1] = cfg.low[1]; _lp[2] = cfg.low[2];
    } else {
      lw = 1 - vmEase(t, w1, Math.min(1, w1 + 0.08));
      _lp[0] = cfg.low[0]; _lp[1] = cfg.low[1]; _lp[2] = cfg.low[2];
    }
  }
  blendArm(rig.L, lw > 0 ? _lp : rig.L.basePos, lw);
  blendArm(rig.R, rw > 0 ? _rp : rig.R.basePos, rw);
}

/* one-shot side effects (sounds, the mag/shell prop) along the timeline */
function buildReloadEvents(w, vm) {
  const cfg = vm.userData.handCfg;
  const ev = [];
  const mag = vm.userData.magProp, shell = vm.userData.shellProp;
  if (cfg.style === 'mag') {
    const T = reloadFromEmpty ? T_MAG_E : T_MAG;
    ev.push({ t: T.reach[1], fn: () => AudioSys.magOut() });
    ev.push({ t: T.out[0] + 0.02, fn: () => { if (mag) mag.visible = true; } });
    ev.push({ t: T.back[1] - 0.02, fn: () => AudioSys.magIn() });
    ev.push({ t: T.back[1], fn: () => { if (mag) mag.visible = false; } });
    if (reloadFromEmpty) ev.push({ t: 0.76, fn: () => AudioSys.boltPull() });
  } else {
    const P = relPlan;
    const cw = (P.win[1] - P.win[0]) / P.cycles;
    for (let i = 0; i < P.cycles; i++) {
      const c0 = P.win[0] + i * cw;
      ev.push({ t: c0 + 0.02 * cw, fn: () => { if (shell) shell.visible = true; } });
      ev.push({ t: c0 + 0.5 * cw, fn: () => { AudioSys.shellIn(); if (shell) shell.visible = false; } });
    }
    if (reloadFromEmpty) {
      ev.push({ t: 0.84, fn: () => (cfg.style === 'shell' ? AudioSys.pump() : AudioSys.boltPull()) });
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

function clearReloadVisuals(vm) {
  if (vm.userData.magProp) vm.userData.magProp.visible = false;
  if (vm.userData.shellProp) vm.userData.shellProp.visible = false;
}

/* full visual reset (level restarts, weapon switches mid-reload) */
function resetWeaponFx() {
  sprintBlend = 0;
  zoomBlend = 0;
  relPlan = null;
  setScopeOverlay(false);
  for (const vm of viewmodels) {
    clearReloadVisuals(vm);
    const rig = vm.userData.arms;
    if (rig) {
      placeArm(rig.L, rig.L.basePos);
      placeArm(rig.R, rig.R.basePos);
    }
  }
}

function updateViewmodel(dt) {
  const vm = viewmodels[currentWeapon];
  const w = WEAPONS[currentWeapon];
  const speedFactor = player.moving && player.onGround ? 1 : 0;
  vmBobT += dt * (keys['ShiftLeft'] ? 11 : 8) * (speedFactor ? 1 : 0.3);
  vmRecoil = Math.max(0, vmRecoil - dt * 6);
  const sprintScale = player.sprinting ? 1.7 : 1;
  const bobX = Math.sin(vmBobT) * 0.012 * (speedFactor || 0.25) * sprintScale;
  const bobY = Math.abs(Math.cos(vmBobT)) * 0.014 * (speedFactor || 0.25) * sprintScale;

  // sprint pose: broken by aiming, reloading and firing (gun snaps back up)
  const sprintTarget = (player.sprinting && !aiming && !reloading
    && !firing && fireCooldown === 0) ? 1 : 0;
  sprintBlend += (sprintTarget - sprintBlend) * Math.min(1, dt * 7);

  // sniper scope: raise "to the eye" first, the overlay cuts in at the top
  const zoomTarget = (aiming && w.zoom && !reloading) ? 1 : 0;
  if (zoomTarget) zoomBlend = Math.min(1, zoomBlend + dt / 0.32); // raise ~0.32 s
  else zoomBlend = Math.max(0, zoomBlend - dt / 0.22);            // lower a touch faster
  if (!scoped && zoomTarget === 1 && zoomBlend >= 1) setScopeOverlay(true);
  else if (scoped && zoomTarget === 0) setScopeOverlay(false);

  // reload: gun pose + hand choreography from the plan built in startReload()
  _gp.px = 0; _gp.py = 0; _gp.pz = 0; _gp.rx = 0; _gp.ry = 0; _gp.rz = 0;
  if (reloading && relPlan) {
    const t = 1 - reloadTimer / reloadDuration; // 0 -> 1
    while (relEvIdx < relPlan.events.length && t >= relPlan.events[relEvIdx].t) {
      relPlan.events[relEvIdx++].fn();
    }
    applyReloadPose(vm, t);
  } else {
    const rig = vm.userData.arms;
    if (rig) {
      placeArm(rig.L, rig.L.basePos);
      placeArm(rig.R, rig.R.basePos);
    }
  }

  // ADS: płynne przejście do pozycji celowania (muszka w osi kamery)
  const adsTarget = (aiming && !w.zoom && !reloading) ? 1 : 0;
  adsBlend += (adsTarget - adsBlend) * Math.min(1, dt * 12);
  const ads = vm.userData.adsPos || VM_BASE;
  const zb = w.zoom ? zoomBlend : 0;
  const bx = VM_BASE.x + (ads.x - VM_BASE.x) * adsBlend + (ZOOM_RAISE.x - VM_BASE.x) * zb;
  const by = VM_BASE.y + (ads.y - VM_BASE.y) * adsBlend + (ZOOM_RAISE.y - VM_BASE.y) * zb;
  const bz = VM_BASE.z + (ads.z - VM_BASE.z) * adsBlend + (ZOOM_RAISE.z - VM_BASE.z) * zb;
  const bobScale = 1 - 0.85 * Math.max(adsBlend, zb); // przy celowaniu broń prawie nie buja
  vm.position.set(
    bx + bobX * bobScale + _gp.px + SPRINT_POS[0] * sprintBlend,
    by + bobY * bobScale + _gp.py + SPRINT_POS[1] * sprintBlend,
    bz + vmRecoil + _gp.pz + SPRINT_POS[2] * sprintBlend // odsuń od kamery (nigdy nie zbliżaj do near plane)
  );
  vm.rotation.set(
    vmRecoil * 1.5 + _gp.rx + SPRINT_ROT[0] * sprintBlend + 0.06 * zb,
    _gp.ry + SPRINT_ROT[1] * sprintBlend,
    bobX * 0.6 * bobScale + _gp.rz + SPRINT_ROT[2] * sprintBlend
  );
  // ukryj viewmodel dopiero pod pełną lunetą (po animacji podniesienia)
  vm.visible = !(w.zoom && scoped);
  __test.scoped = scoped;
}

function switchWeapon(idx) {
  if (game.noCombat) return; // epilogue: weapons stay stowed
  if (idx === currentWeapon || idx < 0 || idx >= WEAPONS.length) return;
  if (!WEAPONS[idx].owned) {
    AudioSys.empty();
    showCenterMsg('Broń zablokowana — kup w sklepie', 1.1, true);
    return;
  }
  clearReloadVisuals(viewmodels[currentWeapon]);
  viewmodels[currentWeapon].visible = false;
  currentWeapon = idx;
  viewmodels[currentWeapon].visible = true;
  reloading = false;
  relPlan = null;
  hideReloadHud();
  setAiming(false);
  AudioSys.switch_(WEAPONS[currentWeapon].id);
  updateWeaponHud();
}

function setAiming(on) {
  aiming = on;
  // sniper: the scope overlay waits for the raise animation (updateViewmodel);
  // releasing RMB (or pausing) drops it immediately
  if (!on && scoped) setScopeOverlay(false);
  document.getElementById('crosshair').style.display = aiming ? 'none' : 'block';
  lookScale = scoped ? 0.35 : (aiming ? 0.7 : 1);
}

function startReload() {
  if (game.noCombat) return;
  const w = WEAPONS[currentWeapon];
  if (reloading || w.mag >= w.magSize || w.reserve <= 0) return;
  reloading = true;
  reloadFromEmpty = w.mag <= 0;
  if (scoped) setScopeOverlay(false); // the scope drops for the reload
  // from empty the sequence is longer: the charge move (bolt/slide/pump) is
  // appended, not squeezed into the same time (user call 2026-08-18)
  reloadDuration = w.reloadTime * game.reloadMul * (reloadFromEmpty ? 1.3 : 1);
  reloadTimer = reloadDuration;
  // animation plan: style + shell-cycle window + one-shot events (sounds, prop)
  const vm = viewmodels[currentWeapon];
  const cfg = vm.userData.handCfg;
  relPlan = { style: cfg.style, empty: reloadFromEmpty, cycles: 0, win: [0, 1], events: [] };
  if (cfg.style !== 'mag') {
    relPlan.cycles = Math.max(1, Math.min(cfg.style === 'shell' ? 4 : 3,
      Math.min(w.magSize - w.mag, w.reserve)));
    relPlan.win = [0.14, reloadFromEmpty ? 0.70 : 0.90];
  }
  relPlan.events = buildReloadEvents(w, vm);
  relEvIdx = 0;
  clearReloadVisuals(vm);
  AudioSys.grab();
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
  const spread = (w.zoom ? scoped : aiming)
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
        const isHead = hitFaceIsHead(h);
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
  if (w.zoom && scoped) targetFov = ZOOM_FOV;
  else if (aiming && w.zoom) targetFov = BASE_FOV - 8 * zoomBlend; // raising
  else if (aiming) targetFov = 60;
  else targetFov = BASE_FOV + (player.sprinting ? 6 : 0) + (player.sliding ? 7 : 0)
    + (player.hopBoost - 1) * 10;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  updateViewmodel(dt);
}
