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

/* Material map for the Quaternius guns pack (SMG / rifle / sniper): they share
   one material vocabulary, so one resolver serves all three. The shotgun left
   the pack on 2026-08-21 and carries its own two-name map below. */
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
      g.userData.magPart = m.parts.mag;   // drops out on a reload
      /* Sights are the model's own: a front blade (top y 0.1001 in model space)
         and a rear tab (0.1043). They are 4.2 mm out of level over a 245 mm
         sight radius, so instead of gluing anything on, the whole pistol is
         pitched up by that slope (0.98°) - both moulded tops then land on one
         height, which is where the ADS line is taken from. The barrel ends up
         1° above the camera axis, which is invisible and harmless: bullets
         follow the camera ray, not the muzzle. */
      m.root.rotation.x = 0.0176;
      /* The blade also carries the green aim dot the long guns use - scaled
         down (0.0028) so its angular size matches theirs at the closer pistol
         ADS distance; the pitch leaves the rear tab 1.5 mm below the line.
         ⚠️ It hangs off the SLIDE, not off the root: the front blade is part
         of the slide, so a dot on the root stayed put while the sight it is
         painted on cycled out from under it (user report 2026-08-21). The
         part's pivot is the origin, so the coordinates are the same either
         way. */
      vmBox(m.parts.slide, 0.0028, 0.0028, 0.002, 0, 0.1015, -0.133, vmMatDot);
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
      // (front z -0.3493, rear z +0.0642) that SPAN the centreline at y 0.1599.
      // Their vertices all sit off-axis, so a near-axis probe misses them and
      // any lower sight line ends up looking straight into a bridge. The dot
      // therefore rides on TOP of the front bridge and the +0.0041 rad pitch
      // drops the rear one below the sight line. Every coordinate here moved
      // with the 0.84 rescale; the PITCH did not - both sights shrank by the
      // same factor, so the angle between them is unchanged, and neither did
      // the dot's 4 mm size (that is a screen-readability figure, not a part
      // of the gun).
      const m = buildModel('smg', src => quatMat(src));
      vmBox(m.root, 0.004, 0.004, 0.003, 0, 0.1619, -0.3493, vmMatDot); // rail dot
      /* pulled 0.10 closer than the shared rear anchor (user call: it sat too
         far away); adsPos.z pays that back so the aiming pose is unchanged.
         0.41 - 0.42 half-length + 0.10 = 0.09, so the stock tip still ends up
         ~0.04 m from the camera - far outside the frustum at the hip offset. */
      m.root.position.set(0, -0.03, 0.09);
      m.root.rotation.x = 0.0041;
      g.add(m.root);
      /* The gun ships as ONE node, so the magazine is carved out of the mesh
         as its own island (tools/gen_models.py -> `split`) and drops out of
         the well on a reload. There is NO reciprocating part to drive: the
         only other loose geometry is five separate decorative plates, and
         driving those as a bolt slid five panels out of the receiver at once
         (user report 2026-08-21: "something else slides out of the grip"). */
      g.userData.magPart = m.parts.mag;
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.0907, -0.4116);
      /* Closer to the eye than the shared long-gun ADS distance (user call
         2026-08-21: "nie musimy widzieć tyle kolby"). At -0.64 the stock sat
         0.13 m out and its whole rear read as a dark slab under the sights;
         at -0.50 the rear falls 0.01 m BEHIND the eye, so the near plane
         takes it and what is left is the receiver and the rail. Only the
         distance changes - the dot stays at x 0, y 0 in camera space, so the
         sight picture is untouched (measured: NDC 0,0 at every candidate). */
      g.userData.adsPos = new THREE.Vector3(0, -0.1333, -0.50); // rail dot on the camera axis
      break;
    }
    case 'shotgun': {
      /* Mossberg 590A1 (CC-BY, J-Toastie). It replaced the Quaternius shotgun
         on 2026-08-21 (user report): that one had NO forend at all - the
         magazine tube ran bare into the receiver - so the silhouette read as
         a tube-fed repeater. This one carries its forend as its own baked
         part ('pump'), which is what finally lets the slide be worked.
         Only two source materials, so no shared resolver: 'shade2' is the
         FURNITURE (buttstock + forend), and putting it on vmMatMid against a
         vmMatDark receiver two-tones the gun along the part that moves. */
      const m = buildModel('shotgun', src => (src === 'shotgun_shade2' ? vmMatMid : vmMatDark));
      /* This one aims through a GHOST RING, so the dot has to sit in the
         MIDDLE of the aperture, not level with the ring's top (CLAUDE.md).
         Measured off js/models.js: aperture centre y 0.1357 @ z +0.148 (inner
         radius 4.3 mm, found by flood-filling the enclosed hole), front blade
         top 0.1379 @ z -0.699. The blade is 2.2 mm HIGH over an 847 mm sight
         radius, so the model pitches DOWN 0.0050 rad and both land on one
         line (residual 0.04 mm). Seen from the eye the dot then covers about
         a fifth of the aperture radius - framed by the ring, not filling it. */
      vmBox(m.root, 0.004, 0.004, 0.003, 0, 0.1399, -0.699, vmMatDot); // blade dot
      /* Pulled 0.34 in from the shared rear anchor (user calls 2026-08-21:
         "za daleko", then "najbardziej oddalona ze wszystkich broni"). That
         second reading is right, and it is about the HAND, not the stock: by
         the stock this gun already sat exactly where the SMG and the sniper
         do (butt 0.04 m in front of the eye), but it is the longest gun in
         the game AND the only one with a real forend, so its support hand sat
         at viewmodel z -0.543 - 0.07 deeper than the next worst (sniper
         -0.477), 0.28 deeper than the rifle. That depth is what pushes the
         CUT END of the left arm into frame: it goes 0.69 -> 1.02 across this
         move (measured, |ndc y|, off frame above 1).
         adsPos.z pays the whole thing back, so the aiming pose is untouched -
         but the gun now genuinely TRAVELS further from hip to eye, and the
         shoulder follows that travel (ARM_ADS_FOLLOW), which costs 0.07 on
         the same measurement under ADS. Do not chase the rest of it here: at
         an identical hand position the previous grip frame measured 1.07 hip
         / 1.26 ADS against this one's 0.69 / 0.92, so what is left is the
         grip, not the distance. */
      m.root.position.set(0, -0.03, 0.025);
      m.root.rotation.x = -0.0050;
      g.add(m.root);
      /* The forend rides its own part, so the rack on an empty reload and the
         cycle after every shot drive real geometry. Unlike the Glock's slide
         and the SMG's magazine this part has a NON-ZERO pivot (it is a real
         joint in the source rig, not a carved island), so its travel is an
         offset from where buildModel parked it - `position.z = travel` alone
         would jerk the forend 0.26 m up the barrel. */
      g.userData.pumpPart = m.parts.pump;
      g.userData.pumpHome = m.parts.pump.position.z;
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.062, -0.70);
      /* Closer to the eye than the shared long-gun distance, for the same
         reason the SMG is (CLAUDE.md): at -0.54 the buttstock sat 0.13 m out
         and filled the right half of the screen as one dark slab beside the
         sights - this stock is a solid slab, not the rifle's thin tube. At
         -0.40 (i.e. -0.74 once the 0.34 hip pull-in above is paid back) its
         tip falls 0.01 m BEHIND the eye and the near plane takes it. The
         sight picture is untouched: the dot and the aperture are both ON the
         camera axis, and a point on the axis lands at screen centre from any
         distance (measured: NDC 0,0 at -0.54, -0.46, -0.40, -0.36). */
      g.userData.adsPos = new THREE.Vector3(0, -0.1064, -0.74); // blade dot on the camera axis
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

/* The HIP carry. Raised 8 cm and pulled 2 cm inboard on 2026-08-21 (user
   call, reference: Ready Or Not): the old (0.32, -0.28) parked the gun in the
   bottom-right corner with nothing of the arms in frame, and left the trip to
   the sights 0.15-0.20 m of vertical travel - so ADS read as the gun being
   swung across the frame rather than pulled the last inch into the eyeline.
   `adsPos` is ABSOLUTE, so this moves nothing about where the sights end up;
   it only shortens that trip, and brings the support forearm onto the
   handguard where it belongs.
   ⚠️ The rest pose of the arms hangs under this, so the shoulder rides up
   with it and the cut end of the upper arm walks toward the bottom edge -
   that, not the near plane, is the ceiling here. 8 cm keeps it under the
   edge; going higher needs the shoulder decoupled from the carry the way
   ARM_ADS_FOLLOW decouples it from the ADS raise.
   ⚠️ SPRINT_POS and the reload tables are DELTAS on this - anything moved
   here moves them too (the sprint numbers below were paid back by hand). */
const VM_BASE = new THREE.Vector3(0.30, -0.20, -0.55);

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
     knuckle only), it never joins the fist.
   There used to be four shared CURL_* presets here. They are gone: every gun
   is dialled now, so each entry carries its own numbers and nothing is shared
   between weapons any more. */

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
   hand the channel runs index -> little finger, mirrored on the left).
   Nothing spreads these into a weapon any more - all five are dialled - but
   they stay as the measured zero of the rig: they are what a reset grip looks
   like, and what any new weapon's entry should start from. */
const NEUTRAL_R = { channel: [1, 0, 0], palm: [0, 1, 0],
                    fore: [-0.077, 0, -0.997], upper: [0.114, 0, -0.993] };
const NEUTRAL_L = { channel: [1, 0, 0], palm: [0, 1, 0],
                    fore: [0.077, 0, -0.997], upper: [-0.114, 0, -0.993] };

/* ⚠️ ONE scale for every weapon (user call 2026-08-21). The hands are the
   player's body, not part of the gun: a glove that grows on one weapon and
   shrinks on the next reads as two different characters. Guns are sized
   against THIS, not the other way round (tools/gen_models.py -> `length`).
   DEVRIG's scale slider writes to all five entries for the same reason. */
const HAND_SCALE = 1.05;

/* phase tables (fractions of the reload); *_E = reload from an empty mag,
   which appends the charge (bolt/slide/pump) move at the end */
const T_MAG = { reach: [0.05, 0.22], out: [0.22, 0.42], back: [0.55, 0.73], ret: [0.78, 0.95] };
const T_MAG_E = { reach: [0.04, 0.16], out: [0.16, 0.32], back: [0.42, 0.58],
                  toBolt: [0.60, 0.70], pull: [0.70, 0.80], ret: [0.84, 0.97] };
/* The Glock is the only mag-style gun whose charge move drives real geometry
   (userData.slide), so it gets its own empty table and a longer `emptyMul`
   (see HANDS.pistol): the slide is racked FURTHER than it was, and the stroke
   was given the time to match instead of being taken at the old speed. The
   swap phases are shifted down by the same factor the total grew by
   (1.30/1.45), so they still take the same wall-clock time as before. */
const T_MAG_E_SLIDE = { reach: [0.036, 0.143], out: [0.143, 0.287],
                        back: [0.377, 0.520], toBolt: [0.54, 0.66],
                        pull: [0.66, 0.82], ret: [0.85, 0.98] };

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
    style: 'mag', scale: HAND_SCALE,
    /* The magazine rides the hand out of frame and back instead of sliding
       out of the well and being replaced by a stand-in box (see
       applyReloadPose). With the dip deep enough to take the hand off the
       bottom edge, the swap happens where nobody can see it, which is what
       makes it read as a fresh magazine rather than the same one going back
       in (user call 2026-08-21). */
    magSwap: true,
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
         fore: [0.515, -0.0175, -0.857],
         upper: [0.5995, -0.0872, -0.7956],
         curl: { f: [0.00, 0.69, 0.00], i: [0.32, 0.00, 0.00],
                 t: [0.08, 1.25, 0.49], tAdd: -0.13 } },
    /* Reload anchors, re-derived from the model once the grip above was
       dialled in (2026-08-19). They are placements for the LEFT fist, in the
       same space as `pos`, and the old numbers predate that grip: `mag` sat
       at y -0.022, which is trigger height, so the hand reached INTO the
       frame instead of down to the magwell. Measured off the geometry
       (tools/gen_models.py --probe):
         magazine  y[-0.104 0.025] z[0.048 0.134] -> axis (0, 0.832, -0.555)
         slide     y[ 0.056 0.104] z[-0.147 0.132], rear serrations at z ~0.11
       ⚠️ `bolt` sits ABOVE the slide top (0.104), not on the slide axis: the
       anchor is the centre of the fist HOLE, so putting it level with what
       the hand grabs buries the glove in the gun (user report 2026-08-19).
       `low` is just under the frame, where a fresh magazine comes from - the
       arm is anchored at the shoulder now (js/hands.js), so an anchor further
       down than the arm is long would simply stop short in mid-air.
       ⚠️ These are placements for the FROZEN bind anchor (gripAnchor), and
       the fist hole the fingers actually close around ends up somewhere else
       once the reload curls are applied - here 16 mm right, 15 mm up and
       23 mm forward of the number written down. Reading a point off the
       geometry and pasting it in therefore lands the LIVE fist off target:
       the old `mag` put it at (-0.014, -0.089, 0.138), which is 29 mm behind
       the magazine and level with the bottom of the grip, so the hand closed
       on the backstrap and the index and thumb tips came out through the
       front of the frame (user report 2026-08-21). Both anchors below are
       solved the other way round - pick where the LIVE fist has to sit, then
       subtract that offset:
         seated  fist (0, -0.134, 0.118)  = on the magazine axis, the palm
                 heel just under the floorplate (which juts to y -0.104,
                 12 mm below the grip at -0.092), so nothing is level with
                 the frame any more;
         low     fist (0, -0.319, 0.171)  = the same axis, straight down, so
                 the magazine is pushed home in one line instead of swinging
                 in from the side.
       Verify with the fist hole, not with these numbers: fistAnchor(rig.L)
       in gun space is what has to clear the frame. */
    /* `low` takes the hand OFF THE BOTTOM OF THE FRAME (user call
       2026-08-21): the swap has to look like the character reached for a
       fresh magazine, not like the same one going back in, and the only way
       to sell that is for the magazine to leave the screen while it happens.
       Measured at the bottom of the dip: at y -0.33 the magazine's top edge
       sat at NDC -0.92, i.e. still in shot; at -0.48 it is at -1.13. The arm
       is no further short than it already was (0.023 m either way). */
    /* ⚠️ These are `byFist` numbers (magSwap is on): they say where the fist
       HOLE goes, not where the frozen placement anchor goes. They were not
       re-dialled - they are the LIVE fist positions the old frozen-anchor
       numbers actually produced, read off the running animation, so the
       visible hand travels exactly the path it did before the switch. Adding
       the bias by hand is the whole trick: `mag`/`low` gained
       [0.0156, 0.0152, 0.0231] and `bolt` [-0.0157, -0.0322, -0.0002].
       ⚠️ `low` is then taken deeper AND further back on purpose, so the hand
       leaves the bottom of the frame with the magazine in it. Straight down
       runs out of arm first: at y -0.60 the arm is already 0.026 short and
       the magazine's top edge is only just clear. Pulling the dip toward the
       camera (z 0.24) buys the same angle for free - the top edge lands at
       NDC -1.22 with the arm still hitting the anchor exactly. */
    mag: [0, -0.134, 0.118], low: [0.0011, -0.56, 0.24],
    /* Where the EMPTY magazine goes when it is pulled: 0.17 down its OWN
       axis, far enough to clear the well before it is hidden. The gun ships
       its magazine as its own part for exactly this (tools/gen_models.py).
       ⚠️ The axis is (-0.0038, 0.9615, -0.2746) pointing up - MEASURED as the
       principal axis of the magazine's own vertices, not read off its
       bounding box. The bbox corners suggest a 34 degree rake; the magazine
       actually leans 16. Sliding it out along the bbox guess dragged it
       through the front and back walls of the grip, which is the magazine
       poking out of the frame and z-fighting the grip (user report
       2026-08-19). */
    magDrop: [0.0006, -0.1635, 0.0467],
    /* Slide travel. `pull` moves the racking hand AND the slide part, so both
       go together, and the stroke gets its own longer window in T_MAG_E_SLIDE
       rather than being taken faster. At rest the slide's rear face sits at
       z 0.132, 18 mm ahead of the frame's tang (0.150), so this takes it
       clear of the frame. */
    bolt: [-0.0201, 0.0922, 0.1042], pull: 0.055,
    relEmptyT: T_MAG_E_SLIDE, emptyMul: 1.45,
    magDim: [0.026, 0.115, 0.042],   // matches the gun's own magazine
    /* The reload grips. Sliding the FIRING grip onto a magazine is what made
       the old animation read wrong: the left hand kept its knuckle line
       vertical against the frame and its fingers curled around nothing. Each
       entry overrides the fields it names and inherits the rest from `l`;
       `upper` is the elbow hint the IK swings the joint into. */
    grips: {
      // magazine held base-in-palm, its body threaded through the fist, so
      // the channel runs along the magazine
      // ⚠️ the thumb has to CLOSE here, not ride the frame the way it does on
      // the firing grip: at [0.18, 0.45, 0.22] it stood up along the
      // magazine and, with the fist now under the magwell, its tip finished
      // dead centre inside the grip (0.002, -0.057, 0.096) and showed
      // through the frame. Pinching it onto the magazine keeps the whole
      // hand below y -0.104.
      mag: { channel: [0, 0.832, -0.555], palm: [-0.93, 0.05, -0.36],
             upper: [0.18, -0.42, 0.89],
             curl: { f: [0.85, 0.92, 0.52], i: [0.80, 0.86, 0.46],
                     t: [0.90, 0.70, 0.40], tAdd: 0.34 } },
      // overhand slide rack: the slide runs through the fist along the
      // barrel and the back of the hand faces up. This is the grip the old
      // animation could not express at all - 90 deg off the firing one, and
      // no amount of moving the fist covers that.
      bolt: { channel: [0, 0, 1], palm: [-0.42, 0.90, 0],
              upper: [-0.05, -0.48, 0.88],
              curl: { f: [1.00, 1.05, 0.60], i: [0.96, 1.00, 0.56],
                      t: [0.40, 0.55, 0.30], tAdd: 0.55 } },
    },
  },
  smg: {
    style: 'mag', scale: HAND_SCALE,
    /* dialled in in DEVRIG (2026-08-21): both hands turned onto the gun, the
       right one canted on the pistol grip, the left wrapped over the
       handguard. Nothing here is neutral any more. */
    /* every anchor here is in gun-model space, so all of them were scaled by
       0.84 together with the model (tools/gen_models.py). The directions and
       curls are angles and stay exactly as they were dialled in. */
    r: { pos: [0.0235, -0.023, -0.0311],
         channel: [0, -1, 0],
         palm: [1, 0, -0.0001],
         fore: [-0.172, -0.1392, -0.9752],
         upper: [0.0492, -0.342, -0.9384],
         curl: { f: [0.78, 0.48, 1.24], i: [0.01, 0.23, 0.91],
                 t: [0.00, 0.57, 0.86], tAdd: -0.13 } },
    l: { pos: [-0.011, -0.006, -0.3461],
         channel: [-0.144, 0.9877, -0.0612],
         palm: [-0.9092, -0.1565, -0.3859],
         fore: [0.601, 0.0523, -0.7975],
         upper: [0.3905, -0.0349, -0.9199],
         curl: { f: [0.85, 0.90, 0.61], i: [0.78, 0.55, 0.78],
                 t: [0.17, 1.02, 0.20], tAdd: -0.12 } },
    /* Reload anchors, re-derived from the baked geometry once the grip above
       was dialled in (2026-08-21) - the old ones were the rifle's numbers
       scaled by 0.84 and none of them pointed at anything on THIS gun.
       Measured with `python tools/gen_models.py --probe`:
         magazine  x +-0.0155  y[-0.160 0.055]  z[-0.168 -0.104], axis
                   (0, 1, -0.0083) - it is dead upright, unlike the Glock's.
                   Only its bottom 6 cm clears the receiver (which ends at
                   y -0.10), so `mag` grips that stub, not the middle of the
                   magazine as a whole.
       `mag` is the fist HOLE, so it sits on the magazine's own axis (x 0,
       z -0.136), not beside it. `low` used to be 0.486 below the gun, which
       is further than the arm is long AND well past the bottom of the frame:
       the hand simply left the screen and the swap played out of sight. It is
       now just under the bottom edge, where the swap still reads.
       ⚠️ `low` stays UNDER THE WELL (z -0.05), not under the grip: at z +0.05
       the fist dipped straight through the pistol grip, and the fresh
       magazine riding in it came out of the grip like a second magazine. */
    /* The magazine is carried by the hand through the whole swap instead of
       being dropped and replaced by a stand-in (see applyReloadPose). Opt-in
       per weapon: it also switches the reload anchors onto the live fist
       (`byFist`), and the pistol's swap is dialled around the old way. */
    magSwap: true,
    /* ⚠️ `low` is BACK as well as down (z +0.13). This gun's hand hangs
       further out than the pistol's, and depth alone runs out of arm before
       it runs out of frame: straight down, the deepest the arm can reach
       (y -0.50) still leaves the magazine's top edge at NDC -0.78, in shot.
       Pulling the dip back toward the camera buys the angle instead of the
       reach - at the same depth it puts the top edge at -1.13, off screen,
       with the arm still landing on the anchor exactly. Nothing is in the
       way down there: the pistol grip stops at y -0.10. */
    mag: [0, -0.13, -0.136], low: [-0.055, -0.50, 0.13],
    /* the empty magazine falls 0.3 m down its own axis before it is hidden -
       the body runs 0.055 up INTO the well, so anything less than ~0.07 would
       not even clear it. ⚠️ UNUSED while `magSwap` is on - there the magazine
       is carried by the hand and never dropped at all. Kept for the fallback
       path, and because it is what says which way the magazine comes out. */
    magDrop: [0, -0.25, 0.0021],
    /* The shared "up and in" reload pose is dialled for a pistol, whose
       magwell is right under the sight line. This well is 0.14 m further out
       and 0.13 m lower, so without this the whole swap played in the
       bottom-right corner, half of it past the edge (measured: the well sat
       at NDC y -0.71, the fist reached -1.27 at the low point). With it the
       well sits at -0.47 and the deepest dip stops at -0.98, just inside.
       ⚠️ These are DELTAS on VM_BASE, like SPRINT_POS: re-measure them
       whenever the hip carry moves (raising it 8 cm took the whole swap up
       to NDC -0.05..-0.73, i.e. into the middle of the screen). */
    relGun: { pos: [-0.08, 0.03, 0.04], rot: [0.16, 0.10, 0.06] },
    /* the charging pull is taken from the LEFT of the receiver, at the height
       of the bolt slab: the top rail closes over the receiver 7 cm above it,
       which is not a gap a fist goes into, so an overhand rack would have had
       the glove through the rail. */
    bolt: [-0.055, 0.062, -0.03], pull: 0.05,   // hand only, nothing moves
    magDim: [0.031, 0.16, 0.064],   // matches the gun's own magazine
    /* The reload grips, same contract as the pistol's: each entry overrides
       the fields it names and inherits the rest from `l`. Without them the
       hand carried its FIRING grip onto the magazine - knuckle line across
       the gun, fingers closed on nothing. */
    grips: {
      // magazine threaded through the fist, so the channel runs along it
      mag: { channel: [0, 1, -0.0083], palm: [-0.93, 0, -0.37],
             upper: [0.2, -0.45, 0.87],
             curl: { f: [0.85, 0.92, 0.52], i: [0.80, 0.86, 0.46],
                     t: [0.18, 0.45, 0.22], tAdd: 0.34 } },
      // side grab on the bolt: the knuckle line runs along the barrel and
      // the back of the hand faces out to the left
      bolt: { channel: [0, 0, 1], palm: [-0.88, 0.47, 0],
              upper: [0.24, -0.42, 0.87],
              curl: { f: [1.00, 1.05, 0.60], i: [0.96, 1.00, 0.56],
                      t: [0.40, 0.55, 0.30], tAdd: 0.55 } },
    },
  },
  shotgun: {
    style: 'shell', scale: HAND_SCALE,
    /* Re-dialled 2026-08-21 for the Mossberg. The gun it replaced had no
       forend at all, so its support hand was parked back by the receiver -
       every number below moved. Method unchanged (CLAUDE.md): the knuckle
       line is picked against the MEASURED grip, `pos` is solved BACKWARDS
       from where the LIVE fist has to sit (iterating pos += target -
       fistAnchor), and everything is read off the POSED arm, not the rest
       pose - what ends up on screen is the IK solve, not the pose the sliders
       edit.
       ⚠️ The SUPPORT hand is the whole difficulty here and it is not about
       the grip: the arms are CUT at the shoulder, and this rig is only 0.49 m
       from shoulder to fist. A real pump forend sits 0.63 m out in VIEWMODEL
       space (this gun is 1.45 m and anchored by its rear), so a hand on the
       FRONT of the forend puts the shoulder past its own reach: the solver
       leans it forward and the cut end comes into frame - measured, |ndc y|
       0.88 with the fist at z -0.315, and no forearm or upper-arm angle moves
       it (the reach is saturated, so the angles stop mattering). Sliding the
       grip back along the forend is what fixes it, one for one. The forend
       runs z -0.463..-0.170, so the fist sits at z -0.22, in its rear third -
       which is where a hand sits on a pump anyway - and LOW on it (y 0.040
       against the forend's 0.056 centre), because the hand wraps under it and
       every centimetre down is margin at the shoulder. Measured that way the
       cut end clears BOTH carries: |ndc y| 1.07 at the hip and 1.22 under ADS
       (the sniper, the tightest of the other four, runs 1.06 and 1.42). The
       hip is the binding one here, not ADS.
       ⚠️ The knuckle line is NOT laid straight along the forend. Flat along
       it the hip framing tops out at 0.99 whatever the arm angles do - the
       reach is saturated, so the angles stop mattering. Cocked 40 deg up out
       of the forend axis - the diagonal a real hand takes on a pump - it
       clears, and the wrist drops to 5 deg of bend as well. */
    /* This gun has no pistol grip either - the firing hand goes on a straight
       stock wrist. Same compromise as before: laying the knuckle line flat
       along the wrist costs a right angle of wrist bend, standing it upright
       reads as a pistol grip, so it is raked 30 deg back from vertical. The
       posed joint then sits at 36 deg of bend and 94 of forearm roll, both
       inside the band the other four weapons live in. */
    r: { pos: [0.0133, 0.011, 0.216],
         channel: [0, -0.766, 0.6428],
         palm: [1, 0, 0],
         fore: [-0.434, 0.1392, -0.8901],
         upper: [0.2214, 0.1736, -0.9596],
         curl: { f: [1.34, 0.55, 0.97], i: [0.01, 0.23, 0.91],
                 t: [0.00, 0.03, 0.86], tAdd: -0.21 } },
    /* forend: the knuckle line runs ALONG it, because that is what the fist
       is threaded onto (same reading as the SMG's bolt grab). The forearm of
       the REST pose is aimed steeply up - it never shows, it only decides
       where shoulderHome lands, and this is what keeps the cut end out. */
    l: { pos: [0.056, 0.052, -0.328],
         channel: [0.0279, 0.2055, -0.9783],
         palm: [0.4208, -0.8901, -0.175],
         fore: [0.5959, 0.1392, -0.7909],
         upper: [0.4367, -0.0872, -0.8954],
         curl: { f: [0.60, 0.38, 0.50], i: [0.85, 0.17, 0.44],
                 t: [0.44, 0.70, 0.23], tAdd: -0.40 } },
    /* Reload anchors, in the same FROZEN grip-anchor space as `pos` (so each
       is the live fist target plus this hand's constant anchor offset,
       (-0.0241, 0.0175, 0.0001) - never the raw point off the geometry).
         port  under the loading gate, at the bottom rear of the receiver
               (its floor is y ~0, z 0.05..0.17), fist below it so the thumb
               pushes up;
         low   just under the bottom edge for the next shell - NOT further
               than the arm is long, or the hand stops in mid-air instead of
               leaving frame;
         bolt  the forend itself, i.e. the firing grip: on a pump gun the
               support hand racks from exactly where it already is. */
    port: [-0.0012, -0.0288, 0.0866], low: [0.0788, -0.2838, 0.1066],
    bolt: [-0.0212, 0.0562, -0.2334],
    /* the real gun's slide travels ~7% of its length; this drives the forend
       PART as well as the hand (js/weapons.js -> setPump), and at 0.105 the
       bolt piece stays inside the receiver at full travel */
    pull: 0.105,
    shellDim: [0.0115, 0.052],
  },
  rifle: {
    style: 'mag', scale: HAND_SCALE,
    /* dialled 2026-08-21. The knuckle line is the MEASURED grip axis of this
       gun (principal axis of the vertices around the grip, in gun-model
       space), the back of the hand faces right like every other firing hand,
       and `pos` is solved backwards from where the LIVE fist has to sit -
       fistAnchor lands on the grip axis to within 0.1 mm, which is not the
       same point as the number written here (CLAUDE.md).
       ⚠️ `fore` is NOT inert, whatever the IK notes say. The IK ignores it
       when solving, but it aims the forearm of the REST pose - and the rest
       pose is where shoulderHome is measured, which is the anchor the IK then
       solves against. Reading the posed forearm back into it therefore feeds
       into itself: iterated on the firing hands it walks the wrist from 57 to
       88 deg and keeps going. The firing hands therefore keep the SMG's
       forearm direction, which measures best on this rig.
       ⚠️ The SUPPORT hands do NOT, and this is the one thing here that is not
       about the grip at all: the arms are CUT at the shoulder, and a support
       hand up on a handguard swings that cut end into the middle of the frame
       - a limb stopping short in mid-air, the same fault ARM_ADS_FOLLOW was
       written to fix. It is the arm's own angles that aim the cut end, not
       where the fist is: measured on the range, raising the forearm 30 deg
       20 deg and the upper arm 25 deg takes it clear off screen (NDC |y|
       1.09-1.30 against 0.74-0.83 before) with the fist still on the forend
       axis, and at a LOWER wrist angle than the flat version. */
    /* pistol grip, knuckle line nearly vertical (0, -0.9877, 0.1564) - the
       fist is threaded onto the grip almost straight down; support hand
       clamped over the handguard, knuckle line along it. Dialled in DEVRIG. */
    r: { pos: [0.047, -0.015, 0.141],
         channel: [0.0001, -0.9877, 0.1564],
         palm: [1, 0.0001, -0.0002],
         fore: [-0.2248, -0.0349, -0.9738],
         upper: [0.3089, -0.0349, -0.9504],
         curl: { f: [0.83, 0.52, 0.51], i: [0.65, 0.00, 0.27],
                 t: [0.20, 1.42, 0.13], tAdd: -0.02 } },
    l: { pos: [0.066, 0.0846, -0.15],
         channel: [0.0842, 0.1699, -0.9819],
         palm: [0.2243, -0.9633, -0.1475],
         fore: [0.5926, 0.1736, -0.7865],
         upper: [0.3078, -0.0872, -0.9474],
         curl: { f: [0.74, 0.90, 0.73], i: [0.99, 0.67, 0.78],
                 t: [0.01, 1.32, 0.00], tAdd: -0.40 } },
    mag: [-0.0099, -0.1187, -0.0056], low: [-0.0699, -0.5787, 0.1344],
    bolt: [-0.0099, 0.1713, 0.0844], pull: 0.07,
    magDim: [0.026, 0.11, 0.055],
  },
  sniper: {
    style: 'shellBolt', scale: HAND_SCALE,
    /* dialled 2026-08-21. The knuckle line is the MEASURED grip axis of this
       gun (principal axis of the vertices around the grip, in gun-model
       space), the back of the hand faces right like every other firing hand,
       and `pos` is solved backwards from where the LIVE fist has to sit -
       fistAnchor lands on the grip axis to within 0.1 mm, which is not the
       same point as the number written here (CLAUDE.md).
       ⚠️ `fore` is NOT inert, whatever the IK notes say. The IK ignores it
       when solving, but it aims the forearm of the REST pose - and the rest
       pose is where shoulderHome is measured, which is the anchor the IK then
       solves against. Reading the posed forearm back into it therefore feeds
       into itself: iterated on the firing hands it walks the wrist from 57 to
       88 deg and keeps going. The firing hands therefore keep the SMG's
       forearm direction, which measures best on this rig.
       ⚠️ The SUPPORT hands do NOT, and this is the one thing here that is not
       about the grip at all: the arms are CUT at the shoulder, and a support
       hand up on a handguard swings that cut end into the middle of the frame
       - a limb stopping short in mid-air, the same fault ARM_ADS_FOLLOW was
       written to fix. It is the arm's own angles that aim the cut end, not
       where the fist is: measured on the range, raising the forearm 30 deg
       20 deg and the upper arm 25 deg takes it clear off screen (NDC |y|
       1.09-1.30 against 0.74-0.83 before) with the fist still on the forend
       axis, and at a LOWER wrist angle than the flat version. */
    /* pistol grip, knuckle line raked back out of vertical like the
       shotgun's stock wrist. The whole gun sits 16 mm left of centre (the
       scope is modelled off-axis), which is where the x offsets come from. */
    r: { pos: [-0.0027, -0.039, 0.289],
         channel: [0.0001, -0.9135, 0.4067],
         palm: [1, 0.0003, 0.0003],
         fore: [-0.4801, 0.1392, -0.8661],
         upper: [0.0867, 0.1045, -0.9907],
         curl: { f: [1.80, 0.34, 0.98], i: [0.00, 0.00, 0.78],
                 t: [0.00, 0.40, 0.46], tAdd: -0.32 } },
    l: { pos: [0.037, 0.004, -0.075],
         channel: [0.0005, 0, -1],
         palm: [-0.1043, -0.9945, -0.0001],
         fore: [0.6246, 0.1219, -0.7713],
         upper: [0, -0.0175, -0.9998],
         curl: { f: [0.91, 0.90, 0.61], i: [0.78, 0.86, 0.78],
                 t: [0.26, 0.89, 0.34], tAdd: -0.40 } },
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
  if (cfg.magDim && !cfg.magSwap) {
    /* the stand-in box, for a gun whose model has no separable magazine.
       A gun that HAS one (magSwap) needs no prop at all: its own magazine
       rides the hand through the whole swap - see applyReloadPose. */
    const geo = new THREE.BoxGeometry(cfg.magDim[0], cfg.magDim[1], cfg.magDim[2]);
    geo.rotateX(Math.PI / 2);   // long side onto the knuckle line
    const prop = new THREE.Mesh(geo, vmMatMid);
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

/* Sprint carry (2026-08-19): the gun drops and comes IN toward the middle of
   the frame, muzzle down, still held in BOTH hands (user call - a one-handed
   carry was tried first and rejected: it read wrong on the long guns, which
   nobody runs with by the pistol grip).

   Both hands used to swing out to the right with it (user report): the arms
   hang under the gun's model root, so the yaw carried the shoulders along
   too. They no longer do - the shoulders are anchored to the body (see
   armBodyFix) and only the joints move, which is also why the yaw here can
   stay small: it no longer has to be paid for by the arms.

   The hands stay ON the gun, so the sprint targets carry no pose of their
   own - only the body transform the shoulders are held against. */
/* Deltas on VM_BASE, so they were re-paid when the carry went up 8 cm and in
   2 cm on 2026-08-21: the run pose itself is unchanged on screen. */
const SPRINT_POS = [-0.04, -0.28, 0.05];
const SPRINT_ROT = [-0.55, 0.50, 0.34];
/* Per-weapon deviation from that carry. The drop is what takes the hands out
   of frame, and how much of the gun is left depends on how long it is: a
   rifle still lies across the bottom edge, a pistol at the same offset is
   gone completely. "Barely visible or invisible depending on the weapon" was
   the ask (user 2026-08-19) - gone entirely was not. */
const SPRINT_TWEAK = {
  pistol: { pos: [0.02, 0.10, -0.02], rot: [0.12, -0.12, -0.08] },
  /* SMG (2026-08-21): the shared carry was dialled when this gun was 1.00 m
     long. At 0.84 the same drop took the whole receiver under the edge and
     left a green aim dot floating over an anonymous dark bar with no hands
     anywhere near it - which reads as a bug, not as a run. Up and in until
     the receiver lies along the bottom edge and the support glove just shows. */
  smg: { pos: [-0.09, 0.09, 0], rot: [0, -0.10, -0.06] },
};
const _spPos = [0, 0, 0];
const _spRot = [0, 0, 0];

function sprintCarry(id) {
  const t = SPRINT_TWEAK[id];
  for (let i = 0; i < 3; i++) {
    _spPos[i] = SPRINT_POS[i] + (t ? t.pos[i] : 0);
    _spRot[i] = SPRINT_ROT[i] + (t ? t.rot[i] : 0);
  }
}
const _spTargetL = { bodyFix: null, shoulderOff: null, pos: null };
const _spTargetR = { bodyFix: null, shoulderOff: null };
const _spPumpPos = [0, 0, 0];
let sprintBlend = 0;

/* The pump stroke after a shot (shotgun only). A pump gun that never cycles
   reads as broken now that the forend is its own part, and the shot interval
   (0.75 s at 80 rpm) leaves room for the whole thing.
   ⚠️ The rack does NOT start on the shot (user report 2026-08-21: "za
   szybko"). Nobody works the slide while the gun is still coming down - the
   recoil rides out first, THEN the hand goes back. So the cycle is a beat of
   nothing followed by the stroke, and only the stroke moves the forend.
   Runs back to front: `pumpT` counts DOWN, so 1 is the moment of the shot. */
const PUMP_HOLD = 0.26;                            // dead beat after the shot
const PUMP_STROKE = 0.40;                          // back and forward again
const PUMP_DUR = PUMP_HOLD + PUMP_STROKE;          // still inside the 0.75 s
let pumpT = 0;

/* Where the shoulders go once the arms are NOT in the firing pose, as an
   offset in CAMERA space (metres, x right) from wherever the carry anchor put
   them. Used by the run and by the reload.

   The anchor is the shoulder of the DIALLED grip, and that grip is a firing
   stance: this rig is only 0.49 m from shoulder to fist, so holding a
   handguard 0.35 m out in front leaves the support shoulder pulled right
   across the chest - measured at camera x +0.035, i.e. under the chin rather
   than at the side of the body. It reads as a firing pose the whole time,
   which is wrong for a run (user report 2026-08-21: the left shoulder sits
   oddly and belongs further left).

   The run is the one pose with slack to fix it in: the gun is down at the
   body, so the left arm only spans 0.357 m of its 0.49 m reach. Spending
   0.16 of that on squaring the shoulders costs nothing - the fist stays
   welded to the handguard and the IK just opens the elbow.
   ⚠️ Never at full weight in the firing pose: at the hip and under ADS the
   arm is at ~99.5% extension and the same shove would pull the hand off the
   gun. It is always faded by the weight of the pose that earned the slack -
   sprintBlend for the run, the left hand's own reload weight for the swap.
   The RIGHT shoulder gets a token nudge in the run (both arms are down at the
   body) and none in a reload, where that hand never leaves the firing grip. */
const SPRINT_SHOULDER = { L: new THREE.Vector3(-0.16, 0, 0),
                          R: new THREE.Vector3(0.02, 0, 0) };
/* The magazine swap takes the left hand off the gun and down, which is the
   same slack the run has - and without it the arm reads as reaching across
   from the right shoulder (user report 2026-08-21: "the left hand crosses to
   the right, the shoulder should stay on the left").
   ⚠️ PER WEAPON, like SPRINT_TWEAK, and deliberately not global: the pistol's
   reload is dialled around a support hand that stays near the centreline, and
   squaring its shoulder walks the whole swap off to the left (user report
   2026-08-21). A weapon opts in by appearing here. */
const RELOAD_SHOULDER = {
  smg: { L: new THREE.Vector3(-0.16, 0, 0), R: new THREE.Vector3(0, 0, 0) },
};
const NO_SHOULDER = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const _shM = new THREE.Matrix4();
const _shOff = { L: new THREE.Vector3(), R: new THREE.Vector3() };

/* camera-space shove -> gun-model space, which is the space the arm solver
   works in. transformDirection normalizes, so the length is re-applied; both
   spaces are metres, so nothing else has to be scaled. */
function shoulderShove(vm, side, w, table) {
  const out = _shOff[side], src = (table || SPRINT_SHOULDER)[side];
  if (w <= 0.001 || src.lengthSq() < 1e-8) return out.set(0, 0, 0);
  _shM.copy(vm.matrix).multiply(vm.children[0].matrix).invert();
  return out.copy(src).transformDirection(_shM).multiplyScalar(src.length() * w);
}

/* The shoulder belongs to the BODY, not to the gun. The arms hang under the
   gun's model root, so anything that moved the fist used to drag the whole
   limb after it - the reload slid the arm bodily down out of the frame and
   the sprint swung both of them sideways (user report 2026-08-19). This is
   the map from the gun's REST transform to the one it has this frame: run the
   rest shoulder through it and the joint stays put in the player's chest
   while the gun moves under it (js/hands.js then solves the elbow to it).
     rest = the viewmodel parked at VM_BASE, unrotated
     now  = vm.matrix as set for this frame
   Both are LOCAL matrices, so the camera never enters the maths. */
const _vmRest = new THREE.Matrix4();
const _vmInv = new THREE.Matrix4();
const _bodyFix = new THREE.Matrix4();
/* How much of the ADS raise the SHOULDERS follow, PER AXIS. One number for
   all three was wrong in both directions at once (user report 2026-08-21:
   "the hands are twisted and anchored to the right, they should be in the
   middle"), because the raise is two unrelated moves bolted together:

     x  the gun crosses 0.32 m to the centre of the screen and the body goes
        with it - you bring a gun up in front of your FACE, you do not hold
        it out to the side and lean your head over to it. At 0.35 the
        shoulders stayed 0.21 m right of the gun, so both arms reached in
        diagonally from the right-hand corner and the wrists took up the
        whole difference; that is the twist. 0.70 is where the shoulders
        land ON the sight line: measured at ADS, pistol shoulders sit at
        camera x -0.144 and +0.145, i.e. symmetric about the barrel, and the
        long guns' stacked shoulders come out at x ~0.00.
     y  the gun rises 0.20 m to eye level, and shoulders do NOT rise to your
        eyes. This is the axis that pushes the cut ends of the arms into
        frame, so it stays the smallest of the three.
     z  the gun comes 0.13 m back toward the camera. Some of that is the body
        squaring up behind it and some is the head coming down to the sights,
        but this one also decides how much SHOULDER_GIVE (js/hands.js) has to
        cover on the long guns: at 0.35 the give dragged their shoulders
        0.09 m right of the barrel, at 0.55 it does not.

   Whatever the gun does BEYOND this - the reload moves, the sprint drop - the
   joints absorb. Reach is not a worry at these numbers: raising x REMOVES the
   biggest offset there was, and this rig is short (shoulder to fist 0.49 m
   against nearer 0.6 on a real arm), which is what made the flat-shouldered
   version pull the fist 4.8 cm off the grip. */
const ARM_ADS_FOLLOW = { x: 0.70, y: 0.30, z: 0.55 };

/* Where the BODY stands behind the hip carry. Same idea as ARM_ADS_FOLLOW,
   for the other move: the gun went up 8 cm on 2026-08-21 and the shoulders do
   not have to go all the way with it. They hang under the gun's root, so a
   raise walks the CUT END of the upper arm toward the bottom edge - measured
   on the range, the full 8 cm puts it on screen behind the weapon slots.
   Parking the reference lower leaves the joints to absorb the difference.
   ⚠️ Not a free dial: this rig is short (shoulder to fist 0.49 m) and every
   dialled grip already sits at 99.5% of that reach, so dropping the shoulder
   away from the gun runs out of arm and SHOULDER_GIVE (js/hands.js) hauls it
   back up anyway. Tune it by measuring, not by eye - here it turned out the
   arm has the slack: at the OLD carry position, which is what this is, every
   fist still lands on its dialled anchor to within a millimetre, so the raise
   is a gun-only move and the body does not follow it at all. */
const ARM_CARRY_REST = new THREE.Vector3(0.32, -0.28, -0.55);

/* The reference is the gun's HIP carry for this frame - VM_BASE plus bob and
   recoil, with most of the ADS/scope raise left OUT. Everything the gun does on top of
   that (aiming, the reload moves, the sprint drop) is deviation the joints
   have to absorb, and the shoulder stays in the chest through all of it.

   Letting the shoulder ride the WHOLE way to ADS - which is what this did
   until 2026-08-21 - is what put the left arm's cut end INSIDE the frame on
   the SMG (user report: the arm stops short of the edge and hangs in mid-air).
   Measured on the range: the left shoulder sits at NDC y -1.62 at the hip,
   comfortably below the bottom edge, and rode up to -0.85 under ADS, i.e. on
   screen.

   Because the reference is the same in every state, nothing jumps when a
   reload or a sprint starts mid-ADS. */
const _carryPos = new THREE.Vector3();
const _carryRot = new THREE.Euler();
const _carryQ = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

function armBodyFix(vm) {
  const root = vm.children[0];              // the gun model root = grip space
  root.updateMatrix();
  vm.updateMatrix();
  _vmRest.compose(_carryPos, _carryQ.setFromEuler(_carryRot), _one);
  return _bodyFix.copy(root.matrix).invert()
    .multiply(_vmInv.copy(vm.matrix).invert())
    .multiply(_vmRest)
    .multiply(root.matrix);
}

/* ⚠️ The carry fix at the plain hip pose is NOT the identity, and the claim
   here that it was (until 2026-08-21) was simply wrong. VM_BASE was raised
   8 cm that day and ARM_CARRY_REST deliberately stayed on the old carry, so
   the solver holds every shoulder 82 mm BELOW where the dialled rest pose
   puts it and the joints swallow the difference. Measured across all five
   weapons, that leaves the rendered forearm 9-16 deg and the upper arm
   0-12 deg away from the direction its slider was set to.
   Consequence to know about: DEVRIG previews the REST pose, so the editor and
   the game disagree by exactly that much, which is why aiming the forearm in
   the editor feels disconnected from the result (user report 2026-08-21).
   Left alone on purpose - settling the preview through this fix also stops
   NEUTRAL reading as a straight wrist, which is the editor's own baseline.
   Fix it at the source (ARM_CARRY_REST vs VM_BASE) or settle the preview AND
   re-baseline the editor; not halfway. */
/* The arms outside a reload: the sprint carry at weight w, and - at w = 0 -
   plain carry, which is NOT a no-op. Both hands still go through the solver
   so the shoulders are held to the body while the gun travels to the eye and
   back; skipping the solve here is what let ADS drag the left shoulder into
   frame. */
function applyCarryArms(vm, w, pump) {
  const rig = vm.userData.arms;
  if (!rig) return;
  const fix = armBodyFix(vm);   // leaves vm.matrix and the gun root current
  _spTargetR.bodyFix = fix;   // both stay on the gun, neither on its swing
  _spTargetL.bodyFix = fix;
  _spTargetR.shoulderOff = shoulderShove(vm, 'R', w);
  _spTargetL.shoulderOff = shoulderShove(vm, 'L', w);
  blendArm(rig.R, _spTargetR, w);
  /* The support hand also works the pump between shots. blendArm LERPS the
     target position by its own weight, and these carry targets normally
     carry no pose at all (only bodyFix), so the offset is pre-divided by the
     weight it will be multiplied by - that keeps the run and the rack from
     scaling each other. The shoulder shove stays on the RUN's weight: the
     pump stroke is the joints' work, not the shoulder's. */
  const cfg = vm.userData.handCfg;
  const k = Math.max(w, pump);
  if (pump > 0 && cfg && k > 1e-4) {
    const base = rig.L.basePos;
    _spPumpPos[0] = base[0]; _spPumpPos[1] = base[1];
    _spPumpPos[2] = base[2] + cfg.pull * pump / k;
    _spTargetL.pos = _spPumpPos;
  } else {
    _spTargetL.pos = null;
  }
  blendArm(rig.L, _spTargetL, k);
}

/* sniper scope: the overlay waits for a raise animation - the rifle travels
   "to the eye" first (zoomBlend 0->1), only then the scope cuts in */
const ZOOM_RAISE = new THREE.Vector3(0.10, -0.16, -0.50);
let zoomBlend = 0;
let scoped = false;

/* `quiet` is for the times the scope drops because something ELSE happened -
   a reload, a weapon swap, a level reset. Those already have their own sound
   and the rifle is not being lowered by the player, so adding the scope foley
   on top just doubles up. */
function setScopeOverlay(on, quiet = false) {
  if (scoped !== on && !quiet) AudioSys.scope(on);
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
/* pump travel, as an offset from the forend's parked position (see pumpHome) */
function setPump(vm, dz) {
  const p = vm.userData.pumpPart;
  if (p) p.position.z = vm.userData.pumpHome + dz;
}
function lerp3(out, a, b, k) {
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
  return out;
}

const _gp = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
const _lp = [0, 0, 0];
const _rp = [0, 0, 0];

/* Where each hand is headed this frame. Filled by applyReloadPose and applied
   only once the gun's own transform is final (applyReloadArms), because the
   shoulder anchor is read THROUGH that transform. */
const NO_GRIPS = {};
const ZERO_TWEAK = [0, 0, 0];
function relScratch() {
  // byFist is set per weapon from cfg.magSwap (see applyReloadPose)
  return { pos: null, byFist: false, frame: new THREE.Quaternion(), bodyFix: null,
           curl: { f: [0, 0, 0], i: [0, 0, 0], t: [0, 0, 0], tAdd: 0 },
           fore: [0, 0, 0], upper: [0, 0, 0] };
}
const _relL = relScratch();
const _relR = relScratch();
let _relLw = 0, _relRw = 0;

function gripFrame(g) {
  if (!g._frame) g._frame = handFrame(g.channel, g.palm);
  return g._frame;
}

/* Resolve one hand's target: `pos` plus a grip mixed k of the way from `a` to
   `b` (either may be undefined = keep the firing grip). Anything a grip
   leaves out falls back to the hand's rest pose, so a weapon with no `grips`
   block still moves position-only - exactly what the reload did before the
   pistol got real ones. */
function relTarget(t, hand, pos, a, b, k) {
  const base = hand.baseSpec;
  t.pos = pos;
  const fa = a ? gripFrame(a) : hand.baseFrame;
  t.frame.copy(fa).slerp(b ? gripFrame(b) : fa, k);
  const ca = (a && a.curl) || base.curl;
  const cb = (b && b.curl) || ca;
  for (const c of ['f', 'i', 't']) {
    const x = ca[c] || base.curl[c], y = cb[c] || x;
    for (let i = 0; i < 3; i++) t.curl[c][i] = x[i] + (y[i] - x[i]) * k;
  }
  const ta = ca.tAdd || 0, tb = cb.tAdd === undefined ? ta : cb.tAdd;
  t.curl.tAdd = ta + (tb - ta) * k;
  const foA = (a && a.fore) || base.fore, upA = (a && a.upper) || base.upper;
  lerpDir(t.fore, foA, (b && b.fore) || foA, k);
  lerpDir(t.upper, upA, (b && b.upper) || upA, k);
  return t;
}

/* apply what applyReloadPose resolved, now that the gun transform is final */
function applyReloadArms(vm) {
  const rig = vm.userData.arms;
  if (!rig) return;
  const fix = armBodyFix(vm);
  _relL.bodyFix = fix; _relR.bodyFix = fix;
  // the swapping hand squares its shoulder up as it comes off the gun, on the
  // hand's own weight so it eases in and out with the move
  const rs = RELOAD_SHOULDER[WEAPONS[currentWeapon].id] || NO_SHOULDER;
  _relL.shoulderOff = shoulderShove(vm, 'L', _relLw, rs);
  _relR.shoulderOff = shoulderShove(vm, 'R', _relRw, rs);
  // both hands go through the solver, including one at weight 0: staying on
  // the gun is a pose too, and it is the one that needs the shoulder held
  blendArm(rig.L, _relL, _relLw);
  blendArm(rig.R, _relR, _relRw);
}

/* per-frame reload pose: fills _gp (gun offset) and resolves both hands */
function applyReloadPose(vm, t) {
  const cfg = vm.userData.handCfg;
  const rig = vm.userData.arms;
  const env = vmEase(t, 0, 0.10) * (1 - vmEase(t, 0.90, 1));
  const P = relPlan;
  const G = cfg.grips || NO_GRIPS;
  let lw = 0, rw = 0;
  let lgA = null, lgB = null, lgK = 0;   // the grip the left hand is mixing into
  _lp[0] = 0; _lp[1] = 0; _lp[2] = 0;
  if (P.style === 'mag') {
    // the gun comes UP and IN toward the middle of the frame while the left
    // hand swaps the magazine - at the hip offset the magwell is otherwise
    // below the bottom edge and the whole reload plays off-screen. How far is
    // per weapon (`relGun`): the shared amount is enough for a pistol, whose
    // magwell sits right under the sight line, and not for a gun whose well
    // is 14 cm further forward and lower.
    const rp = cfg.relGun ? cfg.relGun.pos : ZERO_TWEAK;
    const rr = cfg.relGun ? cfg.relGun.rot : ZERO_TWEAK;
    _gp.rx = (0.30 + rr[0]) * env;
    _gp.ry = (0.14 + rr[1]) * env;
    _gp.rz = (0.12 + rr[2]) * env;
    _gp.px = (-0.10 + rp[0]) * env;
    _gp.py = (0.05 + rp[1]) * env;
    _gp.pz = (-0.03 + rp[2]) * env;
    const TE = cfg.relEmptyT || T_MAG_E;
    const T = P.empty ? TE : T_MAG;
    lgA = G.mag;
    // the gun's OWN magazine leaves the well with the hand that pulled it and
    // is only back once the hand pushes the fresh one home - in between the
    // well is empty, which is what sells the swap (the box in the fist is the
    // fresh magazine, not this one)
    if (t < T.out[0]) { lw = vmEase(t, T.reach[0], T.reach[1]); _lp[0] = cfg.mag[0]; _lp[1] = cfg.mag[1]; _lp[2] = cfg.mag[2]; }
    else if (t < T.back[0]) { lw = 1; lerp3(_lp, cfg.mag, cfg.low, vmEase(t, T.out[0], T.out[1])); }
    else if (t < T.back[1]) { lw = 1; lerp3(_lp, cfg.low, cfg.mag, vmEase(t, T.back[0], T.back[1])); }
    else if (!P.empty) { lw = 1 - vmEase(t, T.ret[0], T.ret[1]); _lp[0] = cfg.mag[0]; _lp[1] = cfg.mag[1]; _lp[2] = cfg.mag[2]; }
    else {
      // charge the bolt: hand rides to the handle, yanks it, lets go
      const T2 = TE;
      const k = vmEase(t, T2.toBolt[0], T2.toBolt[1]);
      lerp3(_lp, cfg.mag, cfg.bolt, k);
      const yank = vmPulse(t, T2.pull[0], T2.pull[1]);
      _lp[2] += cfg.pull * yank;
      _gp.pz += 0.02 * yank;
      _gp.rx += 0.10 * yank;
      // the slide travels with the hand pulling it (the model ships it as its
      // own part exactly for this)
      if (vm.userData.slide) vm.userData.slide.position.z = cfg.pull * yank;
      lgB = G.bolt; lgK = k;
      lw = 1 - vmEase(t, T2.ret[0], T2.ret[1]);
    }
    /* the magazine, AFTER `_lp` is resolved: it rides that target, so it has
       to be read this frame, not the frame before */
    const mp = vm.userData.magPart;
    if (mp && cfg.magDrop) {
      if (cfg.magSwap) {
        /* THE MAGAZINE NEVER LEAVES THE HAND. It is stripped out of the well,
           carried down and pushed back in as ONE object that rides the fist -
           no fall, no second magazine, no swap (user call 2026-08-21: "make it
           attached to the hand like the Glock's").

           Every attempt to drop it ran into the same wall: on a 0.3 s window
           a fall slow enough to look calm leaves the magazine vanishing in
           mid-frame, and one fast enough to clear the frame is doing more
           than 1 g and reads as the gun ejecting it into the sky.

           The offset is the fist's own travel since the grab, and because the
           reload targets are `byFist` (see fistBias in js/hands.js), that
           travel IS `_lp - cfg.mag`, known this frame - reading the posed
           hand instead would trail it by a frame, which at these speeds is
           up to 9 cm. It is exact at both ends: the hand is on `cfg.mag` when
           it takes hold and again when it seats, so the magazine leaves and
           returns to its home position with no step at all. */
        const held = t >= T.reach[1] && t < T.back[1];
        mp.position.set(held ? _lp[0] - cfg.mag[0] : 0,
                        held ? _lp[1] - cfg.mag[1] : 0,
                        held ? _lp[2] - cfg.mag[2] : 0);
        mp.visible = true;
      } else {
        const d = Math.max(0, vmEase(t, T.reach[1], T.reach[1] + 0.10)
                             - vmEase(t, T.back[1] - 0.10, T.back[1]));
        mp.position.set(cfg.magDrop[0] * d, cfg.magDrop[1] * d, cfg.magDrop[2] * d);
        mp.visible = d < 0.97;
      }
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
    lgA = G.port;
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
        lgA = G.bolt;
        _lp[0] = cfg.bolt[0]; _lp[1] = cfg.bolt[1];
        _lp[2] = cfg.bolt[2] + cfg.pull * vmPulse(t, 0.78, 0.94);
        _gp.pz += 0.025 * vmPulse(t, 0.78, 0.94);
        _gp.rx -= 0.08 * vmPulse(t, 0.78, 0.94);
        // the forend travels with the hand on it (the model ships it as its
        // own part exactly for this)
        setPump(vm, cfg.pull * vmPulse(t, 0.78, 0.94));
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
  _relLw = lw; _relRw = rw;
  _relL.byFist = _relR.byFist = !!cfg.magSwap;
  relTarget(_relL, rig.L, lw > 0 ? _lp : rig.L.basePos, lgA, lgB, lgK);
  relTarget(_relR, rig.R, rw > 0 ? _rp : rig.R.basePos, null, null, 0);
}

/* one-shot side effects (sounds, the mag/shell prop) along the timeline */
function buildReloadEvents(w, vm) {
  const cfg = vm.userData.handCfg;
  const ev = [];
  const mag = vm.userData.magProp, shell = vm.userData.shellProp;
  if (cfg.style === 'mag') {
    const T = reloadFromEmpty ? (cfg.relEmptyT || T_MAG_E) : T_MAG;
    ev.push({ t: T.reach[1], fn: () => AudioSys.magOut(w.id) });
    /* The stand-in magazine appears only once the hand is on its way down,
       never while the fist is still at the gun: a magazine-sized box popped
       into a fist parked at the well sits inside the receiver and the pistol
       grip, and the hand then carries it out through them, which reads as a
       second magazine sliding out of the grip (user report 2026-08-21).
       Under `magSwap` there is no prop to show at all - the gun's own
       magazine rides the hand - so these are no-ops there. */
    ev.push({ t: T.out[0] + 0.02, fn: () => { if (mag) mag.visible = true; } });
    // the click lands on the seating frame, which under magSwap is also the
    // frame the magazine is back home on
    ev.push({ t: cfg.magSwap ? T.back[1] : T.back[1] - 0.02,
              fn: () => AudioSys.magIn(w.id) });
    ev.push({ t: T.back[1], fn: () => { if (mag) mag.visible = false; } });
    // the rack lands on the stroke, so it tracks the table rather than a
    // pasted fraction - the pistol's window is longer than the shared one
    if (reloadFromEmpty) {
      ev.push({ t: (T.pull[0] + T.pull[1]) / 2 + 0.01,
                fn: () => AudioSys.boltPull(w.id) });
    }
  } else {
    const P = relPlan;
    const cw = (P.win[1] - P.win[0]) / P.cycles;
    for (let i = 0; i < P.cycles; i++) {
      const c0 = P.win[0] + i * cw;
      ev.push({ t: c0 + 0.02 * cw, fn: () => { if (shell) shell.visible = true; } });
      ev.push({ t: c0 + 0.5 * cw, fn: () => { AudioSys.shellIn(w.id); if (shell) shell.visible = false; } });
    }
    if (reloadFromEmpty) {
      ev.push({ t: 0.84, fn: () => (cfg.style === 'shell' ? AudioSys.pump(w.id) : AudioSys.boltPull(w.id)) });
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

function clearReloadVisuals(vm) {
  if (vm.userData.magProp) vm.userData.magProp.visible = false;
  if (vm.userData.shellProp) vm.userData.shellProp.visible = false;
  if (vm.userData.slide) vm.userData.slide.position.z = 0;
  setPump(vm, 0);
  if (vm.userData.magPart) {
    vm.userData.magPart.position.set(0, 0, 0);
    vm.userData.magPart.visible = true;
  }
}

/* full visual reset (level restarts, weapon switches mid-reload) */
function resetWeaponFx() {
  sprintBlend = 0;
  zoomBlend = 0;
  pumpT = 0;
  relPlan = null;
  setScopeOverlay(false, true);
  _relLw = 0; _relRw = 0;
  for (const vm of viewmodels) {
    clearReloadVisuals(vm);
    const rig = vm.userData.arms;
    if (rig) { blendArm(rig.L, null, 0); blendArm(rig.R, null, 0); }
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

  // sprint pose: broken by aiming, reloading and firing (gun snaps back up).
  // Those OUTRANK the run (user call 2026-08-19), so the carry drops away
  // about three times faster than it comes on - easing it out at the same
  // rate left the run pose fighting the animation that replaced it.
  const sprintTarget = (player.sprinting && !aiming && !reloading
    && !firing && fireCooldown === 0) ? 1 : 0;
  sprintBlend += (sprintTarget - sprintBlend)
    * Math.min(1, dt * (sprintTarget ? 7 : 20));

  // sniper scope: raise "to the eye" first, the overlay cuts in at the top
  const zoomTarget = (aiming && w.zoom && !reloading) ? 1 : 0;
  if (zoomTarget) zoomBlend = Math.min(1, zoomBlend + dt / 0.32); // raise ~0.32 s
  else zoomBlend = Math.max(0, zoomBlend - dt / 0.22);            // lower a touch faster
  if (!scoped && zoomTarget === 1 && zoomBlend >= 1) setScopeOverlay(true);
  else if (scoped && zoomTarget === 0) setScopeOverlay(false);

  // reload: gun pose + hand choreography from the plan built in startReload().
  // Only the GUN offsets are applied here; the hands go on at the bottom,
  // once vm's transform for this frame is final, because their shoulder
  // anchor is read back THROUGH that transform.
  _gp.px = 0; _gp.py = 0; _gp.pz = 0; _gp.rx = 0; _gp.ry = 0; _gp.rz = 0;
  const reloadPose = reloading && !!relPlan;
  /* the pump stroke between shots; the reload owns the forend while it runs,
     so the two never drive the same part in one frame */
  pumpT = Math.max(0, pumpT - dt / PUMP_DUR);
  // time since the shot, then the stroke's own 0..1 - everything before
  // PUMP_HOLD is the gun settling, with the forend still shut
  const pumpAge = (1 - pumpT) * PUMP_DUR;
  const pumpK = (pumpAge - PUMP_HOLD) / PUMP_STROKE;
  // the rack sound is fired from tryFire (scheduled, so it can be delayed to
  // land on PUMP_HOLD) - nothing to trigger here
  const pumpEnv = (reloadPose || pumpT <= 0 || pumpK <= 0) ? 0 : vmPulse(pumpK, 0, 1);
  if (!reloadPose) setPump(vm, (vm.userData.handCfg.pull || 0) * pumpEnv);
  if (reloadPose) {
    const t = 1 - reloadTimer / reloadDuration; // 0 -> 1
    while (relEvIdx < relPlan.events.length && t >= relPlan.events[relEvIdx].t) {
      relPlan.events[relEvIdx++].fn();
    }
    applyReloadPose(vm, t);
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
  // the HIP carry: bob and recoil, no ADS raise and none of the reload or
  // sprint offsets - the reference the shoulder anchor is taken against
  // (see armBodyFix)
  const F = ARM_ADS_FOLLOW;
  // The base is ARM_CARRY_REST, not VM_BASE: the body stands a little below
  // the raised carry (see the constant). Everything the gun does ON TOP of the
  // hip pose is still measured against VM_BASE, so ADS behaves as before.
  const R = ARM_CARRY_REST;
  _carryPos.set(
    R.x + (ads.x - VM_BASE.x) * adsBlend * F.x
      + (ZOOM_RAISE.x - VM_BASE.x) * zb * F.x + bobX * bobScale,
    R.y + (ads.y - VM_BASE.y) * adsBlend * F.y
      + (ZOOM_RAISE.y - VM_BASE.y) * zb * F.y + bobY * bobScale,
    R.z + (ads.z - VM_BASE.z) * adsBlend * F.z
      + (ZOOM_RAISE.z - VM_BASE.z) * zb * F.z + vmRecoil);
  _carryRot.set(vmRecoil * 1.5 + 0.06 * zb * F.y, 0, bobX * 0.6 * bobScale);
  sprintCarry(w.id);
  vm.position.set(
    bx + bobX * bobScale + _gp.px + _spPos[0] * sprintBlend,
    by + bobY * bobScale + _gp.py + _spPos[1] * sprintBlend,
    bz + vmRecoil + _gp.pz + _spPos[2] * sprintBlend // odsuń od kamery (nigdy nie zbliżaj do near plane)
  );
  vm.rotation.set(
    vmRecoil * 1.5 + _gp.rx + _spRot[0] * sprintBlend + 0.06 * zb,
    _gp.ry + _spRot[1] * sprintBlend,
    bobX * 0.6 * bobScale + _gp.rz + _spRot[2] * sprintBlend
  );
  // hands last: the body anchor is read off the gun transform set just above
  if (reloadPose) applyReloadArms(vm);
  else applyCarryArms(vm, sprintBlend, pumpEnv);   // solves even at sprintBlend 0
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
  pumpT = 0;
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

/* `byPlayer` marks the one call that is the player letting go of RMB. Every
   other caller (weapon swap, shop, pause, level reset, DEVRIG) lowers the
   rifle as a side effect of something else, and those must not sound like the
   player lowering it. */
function setAiming(on, byPlayer = false) {
  aiming = on;
  // sniper: the scope overlay waits for the raise animation (updateViewmodel);
  // releasing RMB (or pausing) drops it immediately
  if (!on && scoped) setScopeOverlay(false, !byPlayer);
  document.getElementById('crosshair').style.display = aiming ? 'none' : 'block';
  lookScale = scoped ? 0.35 : (aiming ? 0.7 : 1);
}

function startReload() {
  if (game.noCombat) return;
  const w = WEAPONS[currentWeapon];
  if (reloading || w.mag >= w.magSize || w.reserve <= 0) return;
  reloading = true;
  reloadFromEmpty = w.mag <= 0;
  if (scoped) setScopeOverlay(false, true); // the scope drops for the reload
  // from empty the sequence is longer: the charge move (bolt/slide/pump) is
  // appended, not squeezed into the same time (user call 2026-08-18)
  const vm = viewmodels[currentWeapon];
  const cfg = vm.userData.handCfg;
  reloadDuration = w.reloadTime * game.reloadMul
                 * (reloadFromEmpty ? (cfg.emptyMul || 1.3) : 1);
  reloadTimer = reloadDuration;
  // animation plan: style + shell-cycle window + one-shot events (sounds, prop)
  relPlan = { style: cfg.style, empty: reloadFromEmpty, cycles: 0, win: [0, 1], events: [] };
  if (cfg.style !== 'mag') {
    relPlan.cycles = Math.max(1, Math.min(cfg.style === 'shell' ? 4 : 3,
      Math.min(w.magSize - w.mag, w.reserve)));
    relPlan.win = [0.14, reloadFromEmpty ? 0.70 : 0.90];
  }
  relPlan.events = buildReloadEvents(w, vm);
  relEvIdx = 0;
  pumpT = 0;            // the reload takes the forend over from here
  clearReloadVisuals(vm);
  AudioSys.grab(w.id);
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
  /* A pump gun cycles after every shot - but NOT after the last one: with the
     tube empty the reload takes the forend over (startReload zeroes pumpT
     below), so the stroke was never drawn and only its sound played. Anything
     without a forend part skips this entirely. */
  if (vm.userData.pumpPart && w.mag > 0) {
    pumpT = 1;
    /* The stroke gets its own sound, held back the same beat the FOREND is
       held back (PUMP_HOLD): fired at t=0 it lands inside the muzzle blast
       and is simply not heard, and anywhere else it comes off the hand that
       has not moved yet. It is also softer than the reload's stroke - this
       one is the gun working, not the player working the gun. */
    AudioSys.pump(w.id, { vol: 0.38, delay: PUMP_HOLD });
  }
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
