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
/* Stands in for a material group that has to disappear: the renderer skips
   any group whose material is not visible, which is the only way to hide part
   of a baked mesh (see setMagLoaded - the Glock's rounds are groups, not
   objects). */
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

/* A cartridge sitting in a magazine's feed lips: body plus ogive, pointing
   muzzle-ward (local -Z), sized and placed in gun-model metres.

   The Glock ships one in its own geometry (the 'Bullet' material, four groups
   riding the Mag node), and the user reads that brass at the top of the
   magazine as the thing that makes the swap legible. The Quaternius guns
   carve their magazine out of a single mesh (tools/gen_models.py -> `split`),
   so what comes out of the well is a bare box - hence this. It hangs off the
   magazine PART, so it rides the hand through the whole swap, and it lives
   deep inside the receiver whenever the magazine is seated. */
function vmRound(parent, r, len, x, y, z) {
  const g = new THREE.Group();
  const body = len * 0.62, tip = len - body;
  const bg = new THREE.CylinderGeometry(r, r, body, 10);
  bg.rotateX(Math.PI / 2);                 // grows along Y -> lay it on Z
  const bm = new THREE.Mesh(bg, vmMatOrange);
  bm.position.z = -body / 2;               // base at z 0, running toward -Z
  g.add(bm);
  const tg = new THREE.ConeGeometry(r, tip, 10);
  tg.rotateX(-Math.PI / 2);                // apex toward -Z
  const tm = new THREE.Mesh(tg, vmMatOrange);
  tm.position.z = -body - tip / 2;
  g.add(tm);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/* The material groups of a baked part that ARE cartridges, plus the materials
   they normally wear. The Glock ships its top rounds inside its own geometry
   ('Bullet*' groups riding the mag part), so there is no object to toggle -
   the groups get swapped to vmMatHidden instead. */
function bakedRounds(partGroup, model, partName) {
  const def = MODEL_DATA[model].parts.find(p => p.name === partName);
  const mesh = partGroup.children[0];
  const idx = [];
  def.groups.forEach((gr, i) => { if (gr.mat.startsWith('Bullet')) idx.push(i); });
  return idx.length ? { mesh, idx, mats: idx.map(i => mesh.material[i]) } : null;
}

/* Whether the magazine that is on screen right now carries a round.

   An EMPTY magazine has to come out EMPTY (user report 2026-08-27: brass on
   the way out is fine while there is still ammo in it, but not when the thing
   being stripped is a dead magazine). Both kinds of round go through here -
   the modelled one the Quaternius guns wear (vmRound) and the Glock's baked
   groups - so callers never have to know which gun they are holding. */
function setMagLoaded(vm, on) {
  const r = vm.userData.magRound;
  if (r) r.visible = on;
  const b = vm.userData.magRounds;
  if (b) for (let i = 0; i < b.idx.length; i++) {
    b.mesh.material[b.idx[i]] = on ? b.mats[i] : vmMatHidden;
  }
  // the follower rides up into the empty mouth as the last round leaves it
  const f = vm.userData.magFollower;
  if (f) f.visible = !on;
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
      // ...carrying its baked top rounds, which are hidden when the magazine
      // being pulled is a dead one (setMagLoaded)
      g.userData.magRounds = bakedRounds(m.parts.mag, 'glock', 'mag');
      /* ...and a FOLLOWER under them, which takes over the moment they go.
         This magazine is modelled as an open tube: measured down the mouth,
         the wall tops sit at y 0.0179 and there is nothing under them for
         30 mm, so an empty one reads as a hollow, unfinished box (user report
         2026-08-27). The rounds used to plug that; the follower plugs it when
         they are gone, which is also where a real follower sits once the last
         round is out. Sized to the mouth measured at plate height: inner
         walls x +-0.0115, front and rear walls z 0.0545 and 0.0965. */
      g.userData.magFollower =
        vmBox(m.parts.mag, 0.022, 0.005, 0.037, 0, 0.0095, 0.0755, vmMatMid);
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
      /* the top round, so the magazine reads as loaded on the way out (user
         report 2026-08-27: the Glock's shows one, this one did not). Measured
         off the carved island's top face: y 0.0549, x +-0.0144, z -0.1657 to
         -0.1062, i.e. 59 mm deep - so a 48 mm 9 mm round lies inside it with
         a little of the ogive past the front lip, and the top of the case
         stands ~2.5 mm proud of the lips. */
      g.userData.magRound = vmRound(m.parts.mag, 0.0075, 0.048, 0, 0.0524, -0.112);
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
      /* Pulled 0.12 m nearer the eye on 2026-08-25 (user call). The support
         arm's dial is the player's own and puts the limb where a shotgun is
         actually held, which costs framing: its CUT END sat at |ndc y| 0.89
         under ADS, i.e. 8 of the 20 ring vertices on screen. Distance buys
         that back without touching anything else - the aim dot has adsPos.x 0
         and an adsPos.y that puts it ON the camera axis, and a point on the
         axis projects to the centre from any distance (measured: NDC 0,0 at
         -0.74, -0.70, -0.66, -0.62, -0.58, -0.54 and -0.50 alike). Nor does
         the gun swallow the frame: its own on-screen coverage moves 819 ->
         804 sample points across that whole range, because what comes closer
         is the buttstock, and the near plane already has it.
         -0.66 is where the ring first clears; -0.62 leaves a margin (1.25). */
      g.userData.adsPos = new THREE.Vector3(0, -0.1064, -0.62); // blade dot on the camera axis
      break;
    }
    case 'rifle': {
      // Quaternius assault rifle (CC0): the moulded front post reads as a
      // black sliver at ~1 m, so a green emitter dot rides its tip (post top
      // 0.1809 @ z -0.3186). The muzzle pitches DOWN 0.0478 rad so the rear
      // ridge top (0.1570 @ z +0.1389) sits 4 mm BELOW the sight line
      // (y 0.1677) - level with it, the nearer ridge would occlude the dot.
      /* ⚠️ This gun stays on the shared rear anchor, and the BUTTSTOCK is why
         (user reports 2026-08-25). Pulling it in does clear the arm cut ring,
         but it drives the stock through the near plane, and a sliced-open
         shell with backfaces culled reads as a see-through hole.
         ⚠️ **The hole lives in the MIDDLE of the ADS blend, so both ends can
         measure clean and the travel still shows it.** What matters is not
         whether the plane cuts the gun - at the hip it always has - but WHERE
         the cut section lands: a shallow nick of the rear tip projects far off
         screen, and so does a deep slice while the gun is still parked off to
         the right, but a shallow cut with the gun CENTRED lands in frame.
         Pulled in to root.z 0.02 the rear swept +0.087 -> -0.093 across the
         travel and opened a hole at t 0.65-0.85, i.e. exactly as the gun
         squared up. Measured every 0.05 of the blend, the only clean shape is
         the one the other weapons already have: the rear either stays behind
         the eye the whole way (SMG +0.050 -> +0.010, shotgun +0.290 -> +0.130)
         or in front of it the whole way. This gun's stock is too tall to do
         the first - swept in to adsPos -0.28 it holes from t 0.65 - so it does
         the second, which pins root.z at the anchor: at -0.10 the hole is
         already back.
         What is left is the last 0.025 of ADS travel: -0.505 is the closest
         clean fraction, -0.48 holes, and -0.52 keeps a margin (rear -0.048 ->
         -0.108, monotonically away from the plane). The arm cut ring is taken
         off screen by the support arm's `fore`/`upper` instead - see
         HANDS.rifle. */
      const m = buildModel('rifle', src => quatMat(src));
      vmBox(m.root, 0.004, 0.004, 0.003, 0, 0.1829, -0.3186, vmMatDot); // post dot
      m.root.position.set(0, -0.03, -0.115);
      m.root.rotation.x = -0.0478;
      g.add(m.root);
      /* One node like the SMG, so the magazine is carved out of the mesh as
         the island under the well (tools/gen_models.py -> `split`) and rides
         the hand through the swap. */
      g.userData.magPart = m.parts.mag;
      /* the top round, same reason as the SMG's. This magazine is modelled
         shallower than the SMG's - the column's top face measures y 0.0309,
         x +-0.012, z -0.0058 to +0.009, i.e. 15 mm deep - so the round is
         scaled to it rather than to a real 5.56: 24 mm long, its ogive
         standing a little past the front lip the way a top round does. */
      g.userData.magRound = vmRound(m.parts.mag, 0.006, 0.024, 0, 0.029, 0.010);
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.087, -0.64);
      g.userData.adsPos = new THREE.Vector3(0, -0.1377, -0.52); // post dot on the camera axis
      break;
    }
    case 'sniper': {
      // Quaternius sniper rifle (CC0); PPM = scope overlay, so no adsPos -
      // the viewmodel hides while zoomed
      const m = buildModel('sniper', src => quatMat(src));
      /* Pulled a further 0.18 toward the eye on 2026-08-26 (user call: "same
         case as the other guns - bring it in until the stump is gone"). The
         support arm's dial is the player's own and is the shallow-forearm
         shape the shotgun uses; it costs framing, and on this gun it put the
         arm's CUT END well inside the frame - 16 of the 20 ring vertices on
         screen at the hip (|ndc y| 0.64), 8 during the raise.
         Distance buys it back and nothing else changes: measured, the ring
         clears the frame at root.z -0.12 (hip 0/20, |ndc y| 1.15) and -0.10
         keeps a margin. There is no sight picture to protect here - this gun
         aims through the scope overlay, and the viewmodel is hidden while
         scoped - and no near-plane hole to fear either: this is the longest
         gun in the game, its rear already sits 0.05 m BEHIND the eye at the
         hip, so coming closer only takes it further behind (0.23 m), which
         is the clean shape the rifle's note describes.
         ⚠️ Pushed back OUT to -0.16 on the same day, once the user re-dialled
         this support hand again ("move it a bit further from the camera, but
         keep the stump hidden"). The new grip frames the arm far better on
         its own - the ring measures 1.93 at the hip where the previous dial
         measured 1.27 - so the gun no longer has to be held that close to pay
         for it. Swept in 0.04 steps: the ring is clear back to -0.18 (hip
         1.08, bolt cycle 1.01) and breaks at -0.22 (6/20). -0.16 is one step
         inside that edge, which is the same margin the shotgun's distance is
         dialled to. */
      m.root.position.set(0, -0.03, -0.16); // closer than the shared anchor, and lower
      g.add(m.root);
      /* The bolt handle is its own carved island (tools/gen_models.py) so the
         cycle after every shot and the rack on an empty reload drive real
         geometry - the handle slides back with the hand pulling it. Split
         parts pivot at the origin, so position.z IS the travel. */
      g.userData.boltPart = m.parts.bolt;
      // moved with the root above: this is in the VIEWMODEL group's space,
      // so a root that slides toward the eye slides the muzzle with it
      // (model half-length 0.79 + root.z -0.16)
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.016, -0.95);
      break;
    }
  }
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}

/* The HIP carry. Raised 8 cm and pulled 2 cm inboard on 2026-08-21 (user
   call, reference: Ready Or Not), then pulled a further 8 cm inboard and 9 cm
   toward the camera the same day (user call: "wszystkie bronie blizej srodka
   oraz przyblizmy do samej kamery"): the old (0.32, -0.28, -0.55) parked the
   gun in the bottom-right corner with nothing of the arms in frame, and left
   the trip to the sights 0.15-0.20 m of vertical travel - so ADS read as the
   gun being swung across the frame rather than pulled the last inch into the
   eyeline.
   `adsPos` is ABSOLUTE, so this moves nothing about where the sights end up;
   it only shortens that trip, and brings the support forearm onto the
   handguard where it belongs.
   ⚠️ The z is a screen-SIZE dial, not a reach dial. Long guns already have
   their butt behind the eye at the hip (the near plane takes it, as it does
   in any FPS), so what moving in buys is angular size, and what it costs is
   how much of the frame the receiver covers. Measured at -0.40 the rifle's
   barrel lies across the crosshair itself, which is past useful; -0.46 keeps
   the sight picture clear.
   ⚠️ The rest pose of the arms hangs under this, so a raise walks the CUT
   END of the upper arm toward the bottom edge - that, not the near plane, was
   the ceiling here. It no longer is: ARM_CARRY_REST is what decides where the
   cut end sits, and it is parked low enough for the whole ring to clear the
   frame on every weapon.
   ⚠️ SPRINT_POS and the reload tables are DELTAS on this - anything moved
   here moves them too (the sprint numbers below were paid back by hand). */
const VM_BASE = new THREE.Vector3(0.22, -0.20, -0.46);

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
         fore: [-0.0871, -0.0349, -0.9956],
         upper: [-0.087, -0.0523, -0.9948],
         curl: { f: [0.95, 0.63, 0.60], i: [0.28, 0.25, 0.12],
                 t: [0.00, 1.16, 0.26], tAdd: -0.08 } },
    l: { pos: [-0.026, -0.038, 0.032],
         channel: [-0.2503, 0.9653, -0.0737],
         palm: [-0.9555, -0.2586, -0.1421],
         fore: [0.3907, -0.0175, -0.9204],
         upper: [0.4367, -0.0872, -0.8954],
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
         fore: [0.4382, -0.0175, -0.8987],
         upper: [0.3089, -0.0175, -0.9509],
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
    relGun: { pos: [-0.08, 0.03, 0.04], rot: [0.16, 0.10, -0.08] },
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
    /* The whole left hand, arm included, is the user's own dial out of DEVRIG
       (2026-08-25, several rounds against a reference photo). Do not
       second-guess it: the support forearm is meant to run back and DOWN-LEFT
       at a shallow angle, nearly in line with the gun, which is how a long
       gun is actually held. A near-vertical forearm - a column under the
       wrist - is what this rig would rather do, and it reads wrong.
       ⚠️ That shape has a MEASURED price and it is monotone: the shallower
       the forearm lies, the further it has to roll to meet this hand. At a
       cut-end clearance above |ndc y| 1.10 the trade runs
         forearm  0-10 deg above horizontal -> 114 deg of roll
                 10-20                      ->  95
                 20-30                      ->  84
                 50-60                      ->  64
                 70-80                      ->  57
       and this dial sits at the shallow end: 31 deg of wrist bend and 161 of
       forearm roll at the hip. That roll is past what DEVRIG flags, and it is
       the price of the pose, not a mistake to fix by standing the arm up.
       ⚠️ `fore` and `upper` do NOT move the hand - measured across 59280
       combinations, the fist anchor drifts 0.00000 m - so they can be solved
       against a hand somebody else placed, and were, before this dial
       replaced them. What they DO decide is where the arm's cut end lands:
       this shape put it on screen under ADS (|ndc y| 0.89, 8 of the 20 ring
       vertices visible), which is bought back with distance instead - see
       `adsPos` in buildViewmodel.
       ⚠️ Anything that re-dials this hand invalidates the two reload grips
       below - see the note on `grips`. */
    /* This gun has no pistol grip either - the firing hand goes on a straight
       stock wrist. Same compromise as before: laying the knuckle line flat
       along the wrist costs a right angle of wrist bend, standing it upright
       reads as a pistol grip, so it is raked 30 deg back from vertical. The
       posed joint then sits at 36 deg of bend and 94 of forearm roll, both
       inside the band the other four weapons live in. */
    /* ⚠️ The thumb used to be dead straight here (t all zeros) - the one hand
       in the game holding nothing with it. On a stock wrist there is no grip
       for it to lock over, so it wraps rather than hooks: a light curl plus a
       negative tAdd sweeps it AWAY from the fingers, laying it along the top
       of the wrist instead of closing it into the palm. Dialled in DEVRIG
       together with the 3 mm the hand came up. */
    r: { pos: [0.027, -0.006, 0.225],
         channel: [-0.0555, -0.9853, 0.1615],
         palm: [0.9947, -0.0685, -0.0761],
         fore: [-0.2753, 0.0523, -0.9599],
         upper: [0.297, 0.2756, -0.9142],
         curl: { f: [1.80, 0.55, 0.00], i: [0.31, 0.01, 0.14],
                 t: [0.03, 0.06, 0.27], tAdd: -0.29 } },
    /* forend. `pos` / `channel` / `palm` / `curl` are dialled in DEVRIG;
       `fore` / `upper` are SOLVED (see above) and are the only two fields
       here that the editor cannot judge, because what they control is the
       limb's shape in the player's view and its cut-end framing, neither of
       which the workbench camera shows. */
    l: { pos: [0.065, 0.0711, -0.231],
         channel: [-0.2588, 0, -0.9659],
         palm: [0.4975, -0.8572, -0.1333],
         fore: [0.558, 0.3746, -0.7405],
         upper: [0.4224, 0.0349, -0.9058],
         curl: { f: [0.85, 0.65, 0.61], i: [0.69, 0.55, 0.78],
                 t: [0.17, 1.02, 0.20], tAdd: -0.12 } },
    /* The shared shell-reload pose is dialled for a gun held near the
       centreline. This one is the longest in the game and carried furthest
       right, so on the shared amount its loading gate sat at NDC (0.46,
       -0.74) - the bottom-right corner - the hand never came nearer the gate
       than -0.91, and the dip ran to -2.5, i.e. the shell was made visible
       while the fist was two screens below the frame (measured 2026-08-25,
       user report: the reload does not look like it should).
       ⚠️ DELTAS on the shared shell offsets, like the SMG's `relGun` is on
       the mag ones - re-measure them whenever the hip carry moves.
       ⚠️ Most of it is YAW, not a slide to the left. Sliding was the obvious
       fix and it is the wrong one on this gun: the receiver is 1.4 m long and
       its butt already sits behind the eye at the hip, so translating it far
       enough to bring the gate in from the corner sweeps that butt across the
       middle of the frame as one dark slab (measured: butt at NDC (-0.07,
       0.08), dead centre). Turning the gun instead takes the butt out past
       the left edge and presents the receiver's side, which is what a person
       does to load one anyway. It is also pushed 0.16 m AWAY from the eye,
       for the same reason: this is the longest gun in the game and it needs
       the room to turn. Gate ends up at (0.35, -0.30) with the whole gun in
       frame and the loading hand under it. */
    relGun: { pos: [-0.03, 0.07, -0.16], rot: [0, 0.45, -0.05] },
    /* Reload anchors, in the same FROZEN grip-anchor space as `pos`, i.e.
       each is the live fist target MINUS this hand's constant anchor offset,
       (0.0235, -0.0051, 0.0176) - never the raw point off the geometry. Both
       were re-solved for the grip above, since that offset is a property of
       the grip and moved with it.
         port  the loading gate. ⚠️ MOVED forward and up 2026-08-25 (user
               report: "it loads slugs into the trigger"). The underside of
               this receiver, sampled near the centreline, dips to y +0.007
               at z +0.14 and stays down to z +0.22 - that dip IS the trigger
               guard, and the old anchor put the live fist at z +0.145, in the
               middle of it. The gate is ahead of the guard, where the
               receiver body sits ~0.08 HIGHER, so moving forward alone drops
               the hand into thin air under the gun: it has to go up by about
               as much as it goes forward. Live fist now (0.002, 0.070,
               0.079), i.e. under the receiver and clear of the guard.
               ⚠️ The frozen-to-live offset is a property of the GRIP and this
               one has been re-dialled since: measured today it is
               (-0.0250, +0.0103, +0.0068), not the (0.0235, -0.0051, 0.0176)
               quoted below. Re-measure it, never reuse it. Solved
               with the reload FROZEN at the top of a cycle, which is the only
               way to see it: forcing the pose by hand does not survive a
               screenshot, since taking one ticks the frame and the pose is
               recomputed from the timer. The fist ends up right under the
               receiver with the shell's nose 25 mm off the gate floor and
               inside its z range - it was floating a hand's width clear of
               the gun before;
         low   where the next shell comes from. ⚠️ It is BACK toward the
               camera as well as down, for the same reason the SMG's is:
               depth alone runs out of arm before it runs out of frame, and
               close to the eye the same drop buys far more angle. Dialled at
               the BOTTOM OF THE SWING, which is where it matters: the shell
               prop is made visible on that frame, so a hand still in shot
               there pops the shell into existence in plain view. The fist
               leaves frame at NDC -1.10, just past the edge - the same margin
               the SMG's swap is dialled to, and nothing like the old anchor's
               -2.5, which was the hand a long way past merely gone.
         bolt  the forend itself, i.e. the firing grip: on a pump gun the
               support hand racks from exactly where it already is, so this
               is `pos` verbatim. */
    port: [0.0265, 0.0601, 0.0724], low: [0.0479, -0.2572, 0.1281],
    bolt: [0.065, 0.0711, -0.231],
    /* NO reload grips, deliberately (user call 2026-08-25: "why are you
       rotating it at all - leave it the way it holds the pump, we will adjust
       later"). Without a `grips` block this hand keeps its firing/pump grip
       for the whole reload and only its POSITION moves, which is what every
       weapon without one already does.
       Four swept frames lived here and every one was rejected on sight. The
       measurements stay on record, because whatever replaces this has to beat
       them: reasoned from anatomy, 113-127 deg of wrist bend; swept on
       |bend|, 36-60 deg of EXTENSION; swept on the flexion SIGN, which only
       moved the deviation into flexion (+38) and left the hand kinked
       sideways, reading as bent LEFT; swept on BOTH wrist axes plus the
       on-screen lean, 10-18 deg and leaning right, and still read as wrung
       out. The lesson is not which numbers to use - it is that scoring the
       wrist in isolation does not settle this pose. Start from the grip that
       already reads correctly and adjust from there.
       ⚠️ The shell prop rides the KNUCKLE LINE (attachToFist threads props on
       it), so with the firing grip the shell now lies along the forend axis
       rather than pointing into the gate. That is the known cost of holding
       the orientation still. */
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
         fore: [-0.273, -0.1392, -0.9519],
         upper: [0.3024, -0.2079, -0.9302],
         curl: { f: [0.83, 0.52, 0.51], i: [0.65, 0.00, 0.27],
                 t: [0.20, 1.42, 0.13], tAdd: -0.02 } },
    /* ⚠️ `fore`/`upper` are now the USER'S OWN dial (2026-08-26, DEVRIG dump)
       and they are the SHALLOW-forearm shape the shotgun's support hand uses:
       the limb runs back and down-left nearly in line with the gun rather
       than standing as a column under the wrist. Do not solve them back to
       the earlier lifted pair - that was chosen to keep the arm's cut end out
       of frame, and the framing is bought with CARRY_SHOULDER instead now,
       which costs the limb nothing.
       They still do not move the hand at all (measured - the fist anchor is
       identical to 0.1 mm across every sweep), and they are still the two
       fields DEVRIG cannot judge: what they decide is the limb's shape in the
       player's view and where its cut end lands, and the workshop camera
       shows neither. So re-measure both after any change here, in BOTH poses
       (tests/shots_weapons.py covers the hip and ADS; the run, the reload and
       the bolt cycle need their own probe).
       For the record, what the previous solved pair traded: `fore` at 45 deg
       of azimuth ran ACROSS the gun and threw the elbow 0.202 m sideways off
       the wrist against 0.040 m down - a wide pale forearm across the lower
       left of the frame, and the user's "unnaturally bent, should go down not
       out". Lifting both together instead straightens the arm: at az 7 el 20
       the ADS elbow locked at 177 deg, the dead-straight limb
       SPRINT_SHOULDER_TWEAK was written to cure. */
    /* The hand FRAME is the shotgun's support grip transplanted (2026-08-26,
       user report: the arm still read as bent under ADS). The dialled frame
       ran its knuckle line 30 deg ACROSS the gun, which draped the fingers
       over the top of the handguard - at ADS they read as a bare-skin lump
       sitting on the sight line. The shotgun's frame (knuckle line 15 deg off
       the barrel, palm up-left, hand under the forend) is the one support
       grip the user signed off against a photo, and on this gun it also
       measures better: twist 159 -> 144 at the hip, 135 at ADS.
       `pos` re-solved for it: live fist on the handguard underside axis at
       (0, 0.070, -0.14) - handguard spans x +-0.025 y[0.051 0.120].
       Thumb is OVER THE TOP (t + tAdd 0.40): curled to (x -0.036, y 0.118) it
       hugs the guard's top-left edge and silhouettes against the gun. At the
       dialled -0.12 it stood out at x -0.075, a detached bare-skin blob
       floating beside the handguard in every ADS frame - fingertips of this
       glove are bare, so anything that leaves the gun's silhouette reads as
       skin against the sky. */
    l: { pos: [0.0296, 0.0612, -0.1481],
         channel: [-0.2588, 0, -0.9659],
         palm: [0.4975, -0.8572, -0.1333],
         fore: [0.5279, 0.0872, -0.8448],
         upper: [0.0691, -0.1392, -0.9879],
         curl: { f: [0.95, 0.75, 0.63], i: [0.85, 0.68, 0.80],
                 t: [0.90, 1.35, 0.70], tAdd: 0.40 } },
    /* The magazine rides the hand out of frame and back, like the SMG's (the
       model ships it as its own carved part now). Opt-in switches the reload
       anchors below onto the LIVE fist (`byFist`), so they are read straight
       off the gun's geometry rather than biased by hand. */
    magSwap: true,
    /* Reload anchors as live-fist targets, measured off the baked magazine
       island (tools/gen_models.py --probe): the magazine spans y[-0.182
       +0.038] z[-0.035 +0.077] on the principal axis (0, 0.9915, 0.130), and
       the receiver bottom ends at y -0.095, so only the stub below that is
       grippable. `mag` puts the fist hole on the axis at y -0.15; `low` is
       down AND back toward the camera for the same reason the SMG's is -
       depth alone runs out of arm before it runs out of frame. */
    mag: [0, -0.15, 0.0], low: [-0.05, -0.50, 0.15],
    /* down the magazine's own measured axis; unused while magSwap carries the
       magazine in the hand, kept for the fallback drop path */
    magDrop: [0, -0.248, -0.0325],
    /* Charging pull from the LEFT of the receiver at bolt-slab height, like
       the SMG's - an overhand grab above it was measured at fist NDC
       (0.32, 0.05), i.e. dead centre of the screen, with the whole forearm
       lying across the frame as one pale slab (2026-08-26). The side grab
       keeps the hand beside the receiver instead of over it. */
    bolt: [-0.055, 0.10, 0.10], pull: 0.07,
    magDim: [0.026, 0.11, 0.055],   // matches the gun's own magazine
    /* the reload pose shared by the mag styles is dialled for the pistol;
       this well sits lower and further out, so the gun comes up more - same
       treatment as the SMG (deltas on VM_BASE) */
    /* ⚠️ The yaw came back from 0.10 to -0.08 on 2026-08-27: the gun's own
       STOCK was passing through the right FOREARM (user report, twice - and
       the first measurement I ran said it was not happening, because it
       counted arm vertices INSIDE the gun. A slab through a limb has none:
       the stock crosses the forearm's shell without either mesh putting a
       vertex inside the other. The honest test walks the arm's own EDGES and
       asks whether a gun surface sits on one - 9 crossings on the R forearm
       through the swap against 0 in plain carry, so it was the reload's own
       turn of the gun that drove the stock in.)
       Swept on that metric: yaw +0.10 -> 9 crossings, 0.00 -> 4, -0.08 -> 0,
       and everything deeper stays at 0. Shallowest that clears, which is also
       the cheapest for the LEFT arm (its wrist walks 68 -> 73 -> 80 deg as
       the yaw deepens), and it barely moves the magwell on screen (NDC -0.06
       -> -0.04), so the swap reads as before. The upper arm was never crossed
       at any setting. */
    relGun: { pos: [-0.06, 0.03, 0.02], rot: [0.14, -0.08, -0.06] },
    /* Reload grips, same contract as the SMG's: each entry overrides the
       fields it names and inherits the rest from `l`. Without them the hand
       carried its FIRING grip onto the magazine - knuckle line across the
       gun, fingers closed on nothing. */
    grips: {
      // magazine threaded through the fist, channel along its measured axis
      mag: { channel: [0, 0.9915, 0.130], palm: [-0.93, 0, -0.37],
             upper: [0.2, -0.45, 0.87],
             curl: { f: [0.85, 0.92, 0.52], i: [0.80, 0.86, 0.46],
                     t: [0.18, 0.45, 0.22], tAdd: 0.34 } },
      // side grab on the charging handle: the knuckle line runs along the
      // barrel and the back of the hand faces out to the left (SMG's frame)
      /* ⚠️ The elbow hint went from [0.24, -0.42, 0.87] to straight DOWN and
         a little left on 2026-08-27, when the reload's shoulder was pinned
         (see applyReloadArms). The pin is what made it necessary: the joint
         no longer walks up after the hand, so the rack phase was reaching for
         the charging handle out of a shoulder 0.06 m lower than before and
         paying the difference at the wrist - measured 105.6 deg at t 0.74,
         against 77 before the pin. Swept over azimuth and elevation, this row
         bottoms it out at 33.6 with the elbow unlocked (70.8) - and it pulls
         the elbow to camera x -0.18 as a bonus, which is the same direction
         the user wanted the whole arm to go. */
      bolt: { channel: [0, 0, 1], palm: [-0.88, 0.47, 0],
              upper: [-0.25, -0.866, 0.433],
              curl: { f: [1.00, 1.05, 0.60], i: [0.96, 1.00, 0.56],
                      t: [0.40, 0.55, 0.30], tAdd: 0.55 } },
    },
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
         fore: [-0.4317, 0.1736, -0.8851],
         upper: [0.3584, -0.0175, -0.9334],
         curl: { f: [1.80, 0.34, 0.98], i: [0.00, 0.00, 0.78],
                 t: [0.00, 0.40, 0.46], tAdd: -0.32 } },
    /* ⚠️ `fore`/`upper` are the USER'S OWN dial (2026-08-26, DEVRIG dump),
       and they are the shallow-forearm shape the shotgun's support hand also
       uses: the limb runs back and down-LEFT nearly in line with the gun,
       not as a column standing under the wrist. Do not "fix" it back to
       vertical - see the measured trade table in CLAUDE.md (the shallower the
       forearm lies, the more roll it needs to reach the same hand) and the
       reference photo that settled it on the shotgun.
       The price is the same one the shotgun pays: this shape walks the arm's
       CUT END toward the frame, and it is bought back with DISTANCE instead
       of angles - see the root offset and ZOOM_RAISE in buildViewmodel. */
    l: { pos: [0.042, 0.004, -0.075],
         channel: [-0.6157, 0, -0.788],
         palm: [0, -1, 0],
         /* levelled on 2026-08-27 (user's own DEVRIG dump) - it was 3 deg
            below the horizontal */
         fore: [0.454, 0, -0.891],
         upper: [0.342, 0, -0.9397],
         curl: { f: [1.63, 0.16, 0.98], i: [0.65, 0.84, 0.00],
                 t: [0.35, 0.79, 0.52], tAdd: -0.40 } },
    /* Both re-solved on 2026-08-26 for the support grip the user dialled,
       and re-solved is the operative word: these are FROZEN-anchor numbers
       and the frozen-to-live offset belongs to the grip, so a re-dial of `l`
       silently moves where the live fist actually lands. It had: the loading
       fist was sitting on TOP of the receiver at (0.001, 0.097, 0.224) with
       the wrist bent 129 deg and the elbow locked at 178.
         port  live fist (-0.062, 0.048, 0.220) - beside the receiver's LEFT
               flank, level with the action. Measured off the model (a slice
               through z 0.14-0.30): the receiver spans y -0.02 to +0.09 and
               x -0.033 to -0.001, and the SCOPE closes the top from y +0.10,
               leaving a 1 cm gap - so a round cannot be seen going in from
               above, whatever a bolt gun normally does. The left flank is
               also the side the camera sees, the gun being carried right of
               the eye. Wrist 67 deg, forearm twist 62, elbow 99 - the price
               of the thumb-up roll, against 129/9/178 before it was solved
               at all. (Re-solved at every re-roll of the grip - see
               grips.port: the anchor turns with it, and BOTH anchors take
               the same correction, the offset being a property of the grip
               and not of either point.)
         low   live fist NDC (0.26, -1.27), i.e. just past the bottom edge,
               which is where the shell prop is made visible. The old anchor
               sent it to (1.34, -3.87) - out through the RIGHT corner, two
               screens down, with the elbow at 178 and the wrist at 113: that
               is the IK clamping against an anchor further than the arm is
               long, not a pose. Swept: this one holds 40 deg of wrist and 80
               of elbow. */
    /* ⚠️ `port` is BEHIND the action, and the round travels FORWARD into it
       (2026-08-27, second pass). Moving the anchor alone was not enough: the
       first pass that day parked the fist beside the bolt at (-0.050, 0.078,
       0.300) but left the grip aiming the round +x, into the receiver's left
       flank, and the feed stroke pushing it the same way - so what the player
       still saw was a round going in SIDEWAYS at the back of the gun (user
       report, in those words). The station is where the hand comes FROM; what
       says "from the rear" is where the round POINTS and which way it moves.
       So the live fist now starts at (-0.038, 0.100, 0.380) - a hand's width
       behind the bolt knob (z 0.2825-0.2957) and level with the top of the
       receiver - and `feed` is the whole vector from there to the mouth of
       the action at (-0.017, 0.085, 0.265): 0.118 m of forward push, not the
       35 mm token stroke it replaces. The channel below is that same vector
       normalised (NEGATED since the hand was turned over on 2026-08-27 - the
       line is the same, the sign is not, and the round is mirrored to match),
       so the round lies along its own travel and is driven in nose
       first. Measured through the cycle, the fist really does walk the
       whole way: (-0.038, 0.100, 0.380) at the top of the swing to
       (-0.017, 0.085, 0.265) at the seat.
       ⚠️ The foreshortening the side feed was chosen to avoid is real and is
       simply the price here: the round's screen span falls 0.128 -> 0.058 of
       NDC as it goes in, against a flat 0.17 broadside. What buys it back is
       that the case now clears the glove instead of hiding behind it - 5 to 6
       of 9 samples visible through the push against 4 broadside - and that
       the eye is following a MOVE of 0.118 m rather than a static bar. Do not
       "fix" the span by turning the round across the gun again; that is the
       side feed, and it was rejected by name.
       ⚠️ Leading the round does NOT help, though it looks like it should:
       hung tip-forward it is pushed further from the eye and further behind
       the receiver. Swept, visible samples at the seat: hold -0.040 (the
       current pinch, tip at the fist hole) 5/9, -0.020 3/9, centred 1/9,
       +0.020 and beyond 0/9. The pinch in attachHandsAndProps stays. */
    /* ⚠️ Both re-solved AGAIN on 2026-08-27 when the hand was turned over
       (user call, see grips.port): the frozen-to-live offset is a property of
       the grip, so the flip moved where the live fist lands. Solved back onto
       the very same two points, to within 1e-5 m - the round's path into the
       action is untouched by the turn. */
    port: [-0.0359, 0.1311, 0.3765], low: [-0.0460, -0.1502, 0.2795],
    feed: [0.021, -0.015, -0.115],
    /* The bolt handle is real geometry now (the carved `bolt` part): the knob
       sits at x +0.05, y[0.038 0.085], z[0.282 0.296], i.e. right above the
       firing grip - so the right hand only climbs ~0.1 m to work it. The
       anchor is in frozen-grip space like `pos` (this gun is not `byFist`). */
    bolt: [0.048, 0.075, 0.289], pull: 0.08,
    /* 80 mm, up from 60 (2026-08-27). The fist is ~80 mm across the knuckle
       line, so a 60 mm round threaded through it was swallowed whole -
       measured, not one sample of it cleared the glove. */
    shellDim: [0.007, 0.08],
    /* the shared shell pose is dialled for the shotgun's side gate; this one
       loads from the TOP of the receiver, so the gun pitches toward the eye
       and rolls a touch left to show the open action instead of yawing away */
    relGun: { pos: [-0.04, 0.02, -0.04], rot: [0.10, -0.06, 0.10] },
    grips: {
      /* Rounds go in FROM THE REAR: the hand comes up behind the bolt knob
         and pushes the round forward into the action, along the gun rather
         than across it (user call 2026-08-27 - see `port`/`feed` above for
         why moving the station alone did not read as one).
         ⚠️ This reverses the note that stood here for a day. Aiming the
         channel down the barrel WAS tried and rejected earlier the same day
         on the grounds that a round pointing away from the camera projects to
         a dot - which is true of the axis in isolation and beside the point in
         motion. The version that reads is not "point it at the chamber" but
         "start it a hand's width behind the action and shove it the whole way
         in": the round holds 0.128 of NDC at the top of the stroke, and what
         sells it is the 0.118 m of travel and the case clearing the glove
         (5-6 of 9 samples against 4 broadside), not the static length.
         ⚠️ The receiver's own geometry still rules out the honest top feed a
         bolt gun would use: sliced z 0.14-0.30, the action spans y -0.02 to
         +0.09 and the SCOPE closes the top from y +0.10, leaving a 1 cm gap.
         Behind it there is room; above it there is not.
         ⚠️ Roll the grip about the channel with the anchor RE-SOLVED at every
         step - the frozen-to-live offset turns with the grip, so without that
         the comparison is between two positions rather than two rotations. And
         which roll is right is a measurement, not a sign convention: take the
         thumb tip against the wrist in CAMERA space and keep the one that
         lifts it. Swept every 45 deg at this station, thumb tip minus wrist,
         camera y: 135 gives +0.099 with the fist stood on its side and the
         thumb over the round; 0 and 45 hang it below the hand.
         ⚠️ The roll is paid for at the WRIST and the bill goes to the ELBOW
         HINT - `upper` aims the forearm and the wrist is the hand measured
         against it, so the two trade directly. Swept over azimuth and
         elevation, az -60 / el -30 bottoms the wrist out at 15.7 deg (from
         50 on the old hint), holding 21-32 through the push. The forearm
         twist rides high at 159-177, which is what a forward-pointing round
         costs on this rig - the same band the support hand already carries in
         this gun's plain carry (161-180), and it is spread down the 5-bone
         twist chain. The cut ring stays clear throughout (0/20 on screen).
         ⚠️ THE HAND IS TURNED OVER, and the axis it is turned about is the
         whole point (user call 2026-08-27: turn the hand, not the arm). A
         180 deg roll about the CHANNEL was tried first and is the wrong one:
         the fist hole sits 0.115 m off the wrist, square to that axis, so the
         flip swings one or the other by 0.23 m - hold the fist on the action
         and the wrist climbs from NDC y -0.89 to +0.11, i.e. the forearm
         comes over the top of the receiver and fills half the frame (wrist
         joint 116 deg at the floor of a full az/el sweep, round down to 1 of
         9 samples); hold the wrist instead and the fist leaves the action
         altogether, 0.15 m left and 0.18 m below the mouth.
         The axis that works is the hand's OWN finger direction (local +Y,
         which is what DEVRIG calls "obrot dloni"): it turns the hand in
         place, so the knuckle LINE is unmoved - only its sign flips - and
         the arm is left alone. Measured against the old dial: wrist 24-40
         deg (from 16-26), forearm twist 25-30 (from 163-173, i.e. the roll
         this rig used to spend its whole twist chain on is simply gone),
         elbow and cut ring unchanged (0/20, |ndc y| 1.74), thumb still above
         the wrist (+0.059), and the round MORE visible, not less: 7-8 of 9
         samples against 5-6. The round is mirrored end for end to follow the
         sign flip - see attachHandsAndProps - so it lands on exactly the
         same line in space, tip first. */
      port: { channel: [-0.1782, 0.1273, 0.9757],
              palm: [-0.6794, 0.7014, -0.2156],
              upper: [-0.75, -0.5, 0.433],
              curl: { f: [1.10, 1.15, 0.65], i: [0.55, 0.75, 0.45],
                      t: [0.45, 0.60, 0.30], tAdd: 0.40 } },
      /* the RIGHT hand on the bolt knob, after every shot and on the rack
         that ends an empty reload: fist threaded onto the knob (it sticks
         out along +x), back of the hand up and out */
      boltR: { channel: [0.94, 0, 0.34], palm: [0.10, 0.99, 0.10],
               upper: [0.40, -0.30, -0.87],
               curl: { f: [1.00, 1.05, 0.60], i: [0.90, 1.00, 0.55],
                       t: [0.40, 0.60, 0.30], tAdd: 0.50 } },
    },
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
  } else if (cfg.shellDim && id === 'sniper') {
    /* The sniper's round is a real CARTRIDGE, ogive first (2026-08-27). The
       prop rides the knuckle line - bone local +Z - and the port grip aims
       that line into the action, so a pointed round reads as going somewhere;
       a plain tube read as a stub in the glove. Centred on the fist hole, so
       the tip leads by half its length.
       A shotshell IS a plain tube, so the shotgun keeps the cylinder below. */
    /* ⚠️ And it is PINCHED, not threaded: attachToFist parks a prop on the
       hole through the closed fingers, and a round CENTRED on that hole is
       swallowed by the glove - measured, nothing orange cleared it at any
       length. So the round is hung with its TIP at the hole and its case
       running back out of the fist, which is how a round about to be pushed
       into an action is actually held. Measured along the channel from the
       fist, that back half is the only part of the line the camera has: the
       glove covers -0.025 to +0.075 and everything from -0.05 outward is
       clear. The feed stroke then drives the whole thing FORWARD into the
       receiver, and the visible case head follows it in.
       ⚠️ The pinch survived the move to a rear feed (2026-08-27) on its own
       measurement, not by inheritance: hung any further forward the round is
       simply pushed deeper behind the receiver. Visible samples at the seat,
       swept: this offset 5/9, half of it 3/9, centred on the hole 1/9,
       tip-forward 0/9.
       ⚠️ It hangs down the knuckle line's MINUS side, because turning the
       hand over flipped that line's sign (see grips.port, 2026-08-27). The
       round therefore sits in exactly the same place in space as before the
       turn, tip at the fist hole and case running back out of the glove -
       the numbers above still hold, and the pinch measured better after the
       turn than before it (7-8 of 9 samples visible, from 5-6), because the
       turned-over glove covers less of the case. Mirror BOTH ends together
       if this is ever re-rolled: a cone left pointing the old way is a round
       being pushed into the action base first. */
    const [sr, slen] = cfg.shellDim;
    const hold = slen / 2;
    const prop = new THREE.Group();
    const body = slen * 0.68, tip = slen - body;
    const bg = new THREE.CylinderGeometry(sr, sr, body, 8);
    bg.rotateX(Math.PI / 2);
    const bm = new THREE.Mesh(bg, vmMatOrange);
    bm.position.z = hold + slen / 2 - body / 2;
    prop.add(bm);
    const tg = new THREE.ConeGeometry(sr, tip, 8);
    tg.rotateX(-Math.PI / 2);           // apex toward -Z, i.e. down the channel
    const tm = new THREE.Mesh(tg, vmMatOrange);
    tm.position.z = hold - slen / 2 + tip / 2;
    prop.add(tm);
    prop.visible = false;
    attachToFist(g.userData.arms.L, prop);
    g.userData.shellProp = prop;
  } else if (cfg.shellDim) {
    const geo = new THREE.CylinderGeometry(cfg.shellDim[0], cfg.shellDim[0], cfg.shellDim[1], 8);
    /* ⚠️ Same 90 deg as the magazine box above, and it was missing until
       2026-08-25: a cylinder grows along Y, while the hand bone's local +Z is
       the knuckle line, i.e. the hole through the fist. Without it the shell
       lay ACROSS the fist, along the fingers - it read as a stub poking out
       of the top of the glove rather than a round held in it, and it made
       nonsense of the port grip, whose whole job is to aim that hole at the
       loading gate. */
    geo.rotateX(Math.PI / 2);
    /* Both shell props glow - the shotgun's red, the sniper's round on the
       Glock-bullet orange. On vmMatMid the 7 mm cylinder was invisible
       against the receiver it is being fed into (2026-08-26). */
    const prop = new THREE.Mesh(geo, id === 'shotgun' ? vmMatShell : vmMatOrange);
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

/* ==================== ODRZUT ====================
   The kick used to be ONE scalar pushing the gun back and tipping the muzzle
   up - and it was invisible in the hands, because that same scalar also went
   into the shoulder reference (see armBodyFix). The body rode the kick WITH
   the gun, so not a single joint moved and every gun fired dead straight
   (user report 2026-08-27).

   Two things changed. The body now follows only a SHARE of the kick
   (ARM_RECOIL_FOLLOW) - the rest is joint travel, and joint travel is the
   only thing that reads as recoil in the arms. And the kick is no longer
   on-axis: every shot draws its own yaw and roll, so a burst walks instead of
   stamping the same frame over and over.

   ⚠️ Everything here MUST settle back to zero, and does: the rest pose is
   what tests/shots_weapons.py measures (sight dot on the camera axis, arm cut
   cap out of frame) and what DEVRIG previews. A kick that left a residue
   would quietly move both. */
let vmRecoil = 0;      // rearward push along +z (toward the eye), metres
let vmRecoilV = 0;     // ... and its velocity: the kick is a spring, not a ramp
let vmRecoilYaw = 0;   // this shot's off-axis throw, radians
let vmRecoilRoll = 0;
let vmRecoilSide = 1;  // alternating base sign - a pure coin toss clumps
let vmRecoilAim = 1;   // how braced the gun WAS when it went off (see RECOIL_AIM)

/* A spring, not a linear decay: the gun kicks, comes back PAST the rest pose
   and settles. That overshoot is what makes a heavy gun read heavy - sliding
   home in a straight line made the shotgun feel like the SMG. Stiffness and
   damping are shared by the whole arsenal; a gun pays for its weight with the
   impulse it puts in (vmKick) and with how much time its own fire rate leaves
   the spring to swing. */
const RECOIL_K = 190;      // stiffness -> ~13.8 rad/s, quarter period ~0.11 s
const RECOIL_C = 15;       // damping, ratio 0.54: it overshoots on purpose
const RECOIL_MAX = 0.30;   // hard stop - sustained fire must not stack forever
const RECOIL_SNAP = 0.7;   // share of the kick that lands INSTANTLY...
const RECOIL_PUSH = 11;    // ... the rest arrives as velocity, so it travels
/* The spring's value is a KICK SIZE, not a distance - the gun's travel and
   its muzzle climb are read off it separately, because they are not worth the
   same. Rearward travel is cheap to overdo: at the old 1:1 the sniper drove
   0.22 m into the shoulder and folded its elbow through 83 deg in one shot -
   invisible while the arms rode the kick, grotesque the moment they stopped.
   Weight reads in the CLIMB, so that one is scaled up instead. */
const RECOIL_TRAVEL = 0.45;   // metres of rearward push per unit of kick
const RECOIL_PITCH = 2.2;     // radians of muzzle climb per unit of kick
const RECOIL_YAW = 0.9;    // off-axis throw per unit of vmKick, radians
const RECOIL_ROLL = 1.4;   // roll reads strongest, and a bore sits off the shoulder axis
const RECOIL_OFF_FADE = 7; // the throw just fades; only the push swings

/* What is left of the kick at the sights (user call 2026-08-27: leave the hip
   carry exactly as it is, but aiming has to cut the recoil animation AND the
   dot's wiggle down to almost nothing). A gun pulled into the shoulder and
   braced with the cheek behind it simply does not throw the way one held out
   at the hip does, and at the sights every degree of throw is a degree the
   player has to read the shot through. */
const RECOIL_AIM = 0.20;
/* ⚠️ Latched at the SHOT, not read live off the blend. The sniper drops out
   of the scope on the trigger (tryFire), so zoomBlend collapses in the same
   breath as the kick - read live, the one gun that is always fired braced got
   its recoil scaled by the aim it no longer had, and came out at 0.145 of
   screen against 0.175 at the hip, i.e. barely reduced at all. Latching is
   also the right model for the other four: letting go of the mouse halfway
   through a kick must not make that kick grow. */

/* How much of the kick the BODY takes. At 1 the shoulder rides the whole
   thing and nothing bends - that was the bug. At 0 the arms eat all of it,
   which folds the wrists on the heavy guns. The share left over is what the
   elbows and wrists absorb, and it is the only reason a shot is visible in
   the arms at all. */
const ARM_RECOIL_FOLLOW = 0.35;

function updateRecoil(dt) {
  // semi-implicit Euler: velocity first, then position - stable at the 0.05 s
  // dt clamp, which a plain explicit step is not
  vmRecoilV += (-RECOIL_K * vmRecoil - RECOIL_C * vmRecoilV) * dt;
  vmRecoil += vmRecoilV * dt;
  if (vmRecoil > RECOIL_MAX) { vmRecoil = RECOIL_MAX; vmRecoilV = 0; }
  const k = Math.max(0, 1 - dt * RECOIL_OFF_FADE);
  vmRecoilYaw *= k;
  vmRecoilRoll *= k;
}

function kickRecoil(w) {
  /* Part of the kick lands in the same frame as the muzzle flash and part
     arrives as velocity: a pure velocity impulse leaves the gun standing
     still on the frame the player actually sees the shot on. */
  vmRecoil = Math.min(RECOIL_MAX, vmRecoil + w.vmKick * RECOIL_SNAP);
  vmRecoilV += w.vmKick * RECOIL_PUSH;
  const aim = Math.min(1, Math.max(adsBlend, w.zoom ? zoomBlend : 0));
  vmRecoilAim = 1 - aim * (1 - RECOIL_AIM);
  // sides alternate and the size is drawn, so neither a burst nor a slow
  // pump gun ever throws the same shot twice
  vmRecoilSide = -vmRecoilSide;
  const r = 0.6 + Math.random() * 0.8;
  vmRecoilYaw += vmRecoilSide * w.vmKick * RECOIL_YAW * r;
  vmRecoilRoll -= vmRecoilSide * w.vmKick * RECOIL_ROLL * (0.6 + Math.random() * 0.8);
}

function clearRecoil() {
  vmRecoil = 0; vmRecoilV = 0; vmRecoilYaw = 0; vmRecoilRoll = 0;
  vmRecoilAim = 1;
}

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
/* Deltas on VM_BASE, so they are re-paid by hand whenever the carry moves
   (up 8 cm and in 2 cm on 2026-08-21, then a further 8 cm in and 9 cm toward
   the camera the same day): the run pose itself is unchanged on screen. */
const SPRINT_POS = [0.04, -0.28, -0.04];
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
  /* Shotgun (2026-08-25, user report: the run does not look like it should).
     Same failure as the SMG's, from the opposite direction. This gun is the
     longest in the game and it is the only one carried 0.34 m further IN than
     the shared rear anchor, so on the shared drop it went past "barely
     visible" into gone: measured at full blend, the only thing left on screen
     was a sliver along the bottom right edge, with no glove anywhere near it
     (its topmost on-screen point sat at NDC y -0.78 but spread out to x 1.0,
     i.e. off the right edge). Brought in and lifted until it lies ALONG the
     bottom edge like the rifle does - the reference the other four set is the
     receiver reading as a shape with the support glove just showing, and the
     rifle is the nearest gun to this one in length. */
  shotgun: { pos: [-0.10, 0.07, 0], rot: [0, -0.14, -0.05] },
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
/* the sniper's between-shot bolt work rides a rel-style target (grip frame
   and curls change, not just the position); relScratch is hoisted */
const _boltRp = [0, 0, 0];
const _boltTarget = relScratch();
let sprintBlend = 0;

/* WALL CARRY (2026-08-27): standing nose-to-nose with a wall used to push the
   gun AND both arms straight through it - the viewmodel is a child of the
   camera, so nothing in the world can stop it. Facing something close now
   lowers the gun instead, reusing the RUN pose (SPRINT_POS/ROT + the per-gun
   SPRINT_TWEAK) so the two never fight each other and the lowered carry is
   one that is already dialled per weapon.
   ⚠️ Unlike the run, the drop rides the BODY, not the joints - see the
   reference in updateViewmodel. The arms go down WITH the gun, in the pose
   they were dialled in; nothing here bends a wrist.
   ⚠️ It is only the POSE that is borrowed, none of the run's own effects:
   `sprintBlend` is what main.js feeds the radial blur and what the bob scales
   off, so it stays untouched - this is a separate blend combined at the point
   of use (`carryBlend`).
   ⚠️ The probe direction is FLATTENED (y x 0.35): looking down at the deck is
   not a wall in front of you, and near-horizontal faces (floor, crate tops)
   are skipped outright. Without both, staring at your feet lowered the gun. */
const WALL_NEAR = 0.85;   // fully down at or below this distance
const WALL_FAR = 1.65;    // untouched from here out
/* ⚠️ The run pose ALONE does not clear the wall - measured, not guessed.
   The player's radius is 0.5 m, so nose to a flat wall the eye sits half a
   metre off it, while the guns reach 0.69-1.41 m forward at the hip and still
   1.05-1.27 m in the run carry: the run DROPS the gun without SHORTENING it.
   At 0.52 m the rifle put 1697 of its vertices past the wall plane, i.e. the
   whole viewmodel rendered inside the wall - the reported bug exactly.
   So the wall carry adds two things the run has not got: a dip, which swings
   the barrel down out of the frustum instead of into the wall, and a pull
   toward the camera, which is what actually shortens the reach.
   ⚠️ The two are dialled TOGETHER against three things at once, and the
   third one is what makes it hard: nothing through the wall, no arm cut ring
   on screen, and every gun still visible. A deep dip on a small pull (-0.80 /
   0.10) clears the wall and shows the gun, but swinging the whole assembly
   nose-down lifts its REAR, which is where the arms are cut off - the SMG put
   all 20 cap vertices on screen, the sniper 14, the shotgun 8 per arm. Taking
   the dip out instead hides the caps and the gun with them. The pull is what
   breaks the tie: it carries the cut ends back through the near plane while
   the gun stays in frame. Swept at 0.55 m over all five guns, the shallower
   dip with the bigger pull is the only corner where all three hold at once.
   ⚠️ Pulling in is normally forbidden (near plane 0.08) and is safe here
   because the pose never plays with the gun at the eye, and because it is the
   REAR of the assembly that crosses the plane - the gun's own nearest
   on-screen vertex still measures ~0.2 m.
   ⚠️ Do NOT try to buy the cut ends with a shoulder shove (the trick
   SPRINT_SHOULDER and BOLT_SHOULDER use). Tried and measured: -0.20 m of
   shoulder drop moved the pistol's wrists from 15/9 deg of bend to 53/49 and
   collapsed both elbows from ~176 to ~80 deg, and it still left the right cut
   ring on screen for three of the guns. That is the "hands mangled, whole
   arms displaced" failure - user report 2026-08-27. */
const WALL_DIP = -0.60;    // extra pitch, radians (muzzle down)
const WALL_PULL = 0.26;    // toward the camera - this is what shortens it
/* Per-gun lift out of that pose, same idea as SPRINT_TWEAK and for the same
   reason: how much gun is left on screen depends on how long it is.
   ⚠️ Only a FRAGMENT is meant to show, along the bottom edge (user call
   2026-08-27: "daj je w dół, tak żeby był widoczny tylko ich fragment" - the
   pistol and the SMG were the worst offenders, carried far too high). Dialled
   by the topmost on-screen vertex of the gun (NDC y) at 0.55 m, all five
   landing in a band at -0.71..-0.75, with nothing through the wall and no arm
   cut ring on screen. Do not raise these to "show more gun": at 0 lift the
   guns leave the frame entirely (measured -1.0 to -1.7), which reads as a
   bug, and every centimetre up walks the muzzle back toward the wall. */
const WALL_TWEAK = {
  pistol: { y: 0.14, dip: 0 },
  smg: { y: 0.03, dip: 0 },
  shotgun: { y: 0.02, dip: 0 },
  rifle: { y: 0.15, dip: 0 },
  sniper: { y: 0.09, dip: 0 },
};
const _wallRay = new THREE.Raycaster();
const _wallDir = new THREE.Vector3();
const _wallNrm = new THREE.Vector3();
const _wallNear = [];   // bots close enough to be worth a raycast (reused)
let wallBlend = 0;

/* Past this much of the drop the muzzle is treated as BLOCKED: no aiming, no
   shooting (user call 2026-08-27). Deliberately near the top of the ramp
   rather than halfway - at 0.85 the gun is all but down and the obstacle is
   about a metre off, so the block only ever bites when the pose already says
   the weapon cannot be pointed at anything. Halfway would be 1.25 m, which
   would take the shot away from the player while the gun is still up. */
const WALL_BLOCK = 0.85;
/* ⚠️ Aiming goes away EARLIER than firing, and it goes away CONTINUOUSLY.
   With one threshold for both, ADS was still fully on while the gun dropped,
   and then released in one step: the gun ran ADS -> hip (0.2 s of its own
   easing) on top of an already finished drop, so the hands flicked back to
   the normal carry for a fraction of a second before settling down (user
   report 2026-08-27). Now the ADS target is faded out across the first part
   of the ramp (`adsRoom` below) and the aim STATE flips at the end of that
   fade, by which time there is nothing left to travel - one continuous
   motion from the sights to the lowered carry. */
const WALL_AIM = 0.45;

/* 0..1: how much is in the gun's way straight ahead.
   ⚠️ Bots count as obstacles too (user call 2026-08-27) - they live in
   `enemiesGroup`, not in `worldGroup`, so they need their own pass, and it
   has to be RECURSIVE: a bot is a rig, not a flat mesh like a wall block.
   ⚠️ The near-horizontal face filter is for the WORLD only. It exists to
   ignore the deck and crate tops; a bot has faces pointing every which way
   and filtering them would just miss the bot standing in the muzzle. */
function wallProximity() {
  if (typeof worldGroup === 'undefined' || !worldGroup) return 0;
  camera.getWorldDirection(_wallDir);
  _wallDir.y *= 0.35;
  if (_wallDir.lengthSq() < 1e-9) return 0;
  _wallDir.normalize();
  _wallRay.set(camera.position, _wallDir);
  _wallRay.far = WALL_FAR;
  let near = Infinity;
  for (const h of _wallRay.intersectObjects(worldGroup.children, false)) {
    if (h.face) {
      _wallNrm.copy(h.face.normal).transformDirection(h.object.matrixWorld);
      if (Math.abs(_wallNrm.y) > 0.7) continue;   // deck plate, crate top
    }
    near = h.distance;
    break;
  }
  /* ⚠️ Pre-filter the bots by distance before raycasting them. Three's
     Mesh.raycast rejects on the bounding SPHERE, which ignores raycaster.far,
     so a bot 20 m down the crosshair would run a full triangle test on a
     skinned rig every single frame. Only ones that could possibly be inside
     WALL_FAR are worth testing. */
  if (typeof enemiesGroup !== 'undefined' && enemiesGroup) {
    const reach = WALL_FAR + 1.2;   // + room for the rig around its origin
    _wallNear.length = 0;
    for (const g of enemiesGroup.children) {
      if (g.position.distanceToSquared(camera.position) < reach * reach) _wallNear.push(g);
    }
    if (_wallNear.length) {
      const eh = _wallRay.intersectObjects(_wallNear, true);
      if (eh.length && eh[0].distance < near) near = eh[0].distance;
    }
  }
  if (near === Infinity) return 0;
  const k = (near - WALL_NEAR) / (WALL_FAR - WALL_NEAR);
  return 1 - Math.max(0, Math.min(1, k));
}

/* The muzzle has nowhere to point: the gun is down against a wall or a bot */
function muzzleBlocked() { return wallBlend >= WALL_BLOCK; }

/* No room to raise the sights - the drop has taken the gun off the eye line */
function noAimRoom() { return wallBlend >= WALL_AIM; }

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
let pumpFired = true;   // has this stroke already been sounded?

/* The bolt cycle after a shot (sniper only, user call 2026-08-26): the RIGHT
   hand leaves the pistol grip, climbs the ~0.1 m to the carved bolt handle,
   pulls it through and returns to the grip. Same shape as the pump above -
   a dead beat first (nobody works a bolt while the muzzle is still rising),
   then the stroke. Under the scope the gun DROPS OUT of the scope for it
   (quiet - the shot covers the foley) and the raise brings the scope back
   once the cycle is done; zoomTarget gates on boltT for exactly this.
   Budget: 45 rpm = 1.33 s between shots; 0.25 + 0.60 here plus the 0.50 s
   re-raise lands the scope back just as the gun can fire again. */
const BOLT_HOLD = 0.25;                            // recoil rides out first
const BOLT_STROKE = 0.60;                          // up, back, forward, down
const BOLT_DUR = BOLT_HOLD + BOLT_STROKE;
/* How the gun is held while the cycle runs. ⚠️ The SUPPORT arm pays for every
   millimetre of this: its shoulder is anchored to the body and its hand is
   welded to the forend, so moving the gun folds the elbow by exactly that
   much. At the first dial (px -0.09, py +0.05) the left elbow went 172 -> 129
   deg while the shoulder held still - the user read it as the whole left arm
   coming in toward the gun during the bolt pull, which is right, and it is
   the arm moving because the gun did.
   So the translation is gone entirely and the ROLL carries the pose instead:
   it turns the receiver about its own long axis, which cants the bolt handle
   up into view - what a shooter actually does to work one - while barely
   moving the point the support hand is holding.
   Swept, worst elbow change across the cycle against the working fist's
   worst NDC x (it must stay inside 1.0 or the hand leaves the frame at the
   peak of the yank):
     px -0.09  py +0.05  rz 0.10   elbow 45   fist  -
     px -0.07  py +0.03  rz 0.30   elbow 41   fist 0.70
     px -0.04  py +0.02  rz 0.35   elbow 34   fist 0.83
     px  0     py  0     rz 0.16   elbow 24   fist 0.99
     px  0     py  0     rz 0.45   elbow 17   fist 0.96
   Roll is not merely cheaper than translation - past a point it is FREE and
   then some: at 0.45 the arm moves less than it does with no offset at all
   (26 deg from the yank's own give), because the cant carries the handle
   toward the hand instead of the hand toward the handle. The bolt part is
   fully on screen (128/128 vertices) in every row, so nothing is bought by
   sliding the gun.
   ⚠️ Nothing drops the gun during the cycle: at zero translation it simply
   stays in the hip carry, which is where it already is. */
const BOLT_CARRY = { px: 0, py: 0, rz: 0.45 };
let boltT = 0;
let boltFired = true;   // has this cycle already been sounded?

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
/* Per-weapon deviation from that shove, PER WEAPON for the same reason
   SPRINT_TWEAK and RELOAD_SHOULDER are: one number cannot serve five guns.
   Measured on the range, run held, left arm (2026-08-25).

   Why the shared shove has no DOWN in it at all, and why that was wrong: the
   run drops the gun ~0.21 m and the shoulder followed none of it, so the arm
   paid the whole drop by STRAIGHTENING. The shotgun's support elbow stood at
   177.6 deg - a locked, dead-straight limb - where the same arm measures
   156.8 at the hip, and the user read it as the arm bending oddly at the
   elbow instead of the shoulder going down (report 2026-08-25). Letting the
   shoulder take the drop hands the slack back to the joints: 177.6 -> 158.0,
   i.e. back to the hip's own bend, with the fist still welded to the forend
   (grip error 0.0000), the forearm roll down from 179 to 167 and the wrist
   from 44 deg to 12. It also clears the forearm out of the bottom of the
   frame: 231 vertices on screen down to 25, which is the pale slab that made
   the limb read as bent in the first place.

   ⚠️ Deeper is NOT uniformly better, in both directions. Past its own optimum
   the arm runs out of reach the other way and locks straight again (the
   shotgun is back at 177.6 by -0.32), and the wrist deviation flips from
   flexion to extension at a depth that differs per gun - the sniper crosses
   over at -0.08, so it could never share the shotgun's number. The pistol
   wants none of it: both its hands are on the grip, its support arm never
   reaches, and its forearm is off screen in the run anyway (3 vertices), so a
   drop only cranks its wrist.

   ⚠️ Measure the CUT END on the ring, not on `upperOn`-style bicep counts.
   The proxy said the cut end was on screen during a run for three guns; the
   real open-boundary ring (the one tests/shots_weapons.py finds) is 0/20 on
   screen in the run for all five, before and after this table. Same trap as
   2026-08-21 - see the note in that test. */
const SPRINT_SHOULDER_TWEAK = {
  // 177.6 -> 158.0 deg of elbow, roll 179 -> 167, wrist 44 -> 12, and the
  // forearm off the bottom edge (231 on-screen vertices -> 25)
  shotgun: { L: new THREE.Vector3(0, -0.26, 0) },
  /* The rifle earned one on 2026-08-26, once its support hand took the
     shallow-forearm dial (user report: in the run the left stump is visible
     and comes down badly, it should go lower). Same failure as the
     shotgun's and the same cure. Measured across the run's bob, drop against
     ring clearance and elbow: none -> |ndc y| 1.08 and a locked 178 deg,
     -0.08 -> 1.37/178, -0.14 -> 1.68/178, -0.20 -> 2.03/162, -0.26 ->
     2.34/146, -0.32 -> 2.66/140. It takes -0.20 before the elbow unlocks at
     all; -0.26 puts it at 146, which is where the same arm sits at the hip
     (149), so the limb reads the same running as standing. */
  rifle: { L: new THREE.Vector3(0, -0.26, 0) },
  /* And the sniper the same day, from the same report ("in the run the stump
     shows, put the arm lower"). ⚠️ Note what does NOT improve here: this
     gun's support hand sits far out on the barrel, so the arm is at full
     stretch in the run whatever the shoulder does - the elbow measures a
     clamped 178 at every drop, and the hand only stays welded because
     SHOULDER_LEAN_MAX lets the joint lean in. What the drop buys is purely
     framing, and it buys a lot: the cut ring goes 1.07 (barely off the edge,
     which is why it still read as visible) -> 1.48 at -0.10, 1.94 at -0.18,
     2.45 at -0.26. Matched to the other two long guns. */
  sniper: { L: new THREE.Vector3(0, -0.26, 0) },
};
const _spSh = { L: new THREE.Vector3(), R: new THREE.Vector3() };

/* The run's shoulder shove for the weapon in hand: the shared value plus this
   weapon's deviation. Returns a shared scratch - read it, do not keep it. */
function sprintShoulder(id) {
  const t = SPRINT_SHOULDER_TWEAK[id];
  for (const side of ['L', 'R']) {
    _spSh[side].copy(SPRINT_SHOULDER[side]);
    if (t && t[side]) _spSh[side].add(t[side]);
  }
  return _spSh;
}
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
  /* The shotgun HAD an entry here and it was doing the opposite of its job
     (user call 2026-08-25: "why the hell do the forearm and arm slide down -
     leave the arm and shoulder anchored"). It shoved the support shoulder
     right and toward the camera to push the elbow under the bottom edge, and
     it was dialled against a `grips.port` frame that no longer exists. With
     the hand back on its firing grip it cost, measured: the elbow dropped
     0.078-0.164 m below where it sits at the hip instead of 0.025-0.098, and
     the wrist went to 91-93 deg instead of 54-55. The elbow stays off the
     bottom edge without it anyway (NDC -1.40 to -1.75).
     ⚠️ Whatever is dialled here is only valid for the hand frame it was
     dialled against - see the note on the shotgun's missing `grips` block. */
};
/* And the same shove for the SUPPORT shoulder while the bolt cycles (user
   call 2026-08-26: during the bolt pull the left elbow should go DOWN rather
   than out to the side). Faded by the cycle's own envelope, per weapon, and
   for the same reason the run has one: the pose is only true while it runs.

   What the user is looking at is the FOREARM, not the joint angle. Measured
   in camera space through the cycle, the support elbow sits at y -0.21 and
   the wrist it is welded to at -0.225 - i.e. the forearm lies dead level and
   crosses the frame as a broad pale slab from the lower left up to the
   handguard. Nothing about the cycle causes it; it is the hip carry's own
   shallow-forearm dial, and the cycle only makes it worth looking at.
   ⚠️ The elbow HINT cannot fix it: this arm measures 178 deg - locked dead
   straight - through the whole stroke, and a straight arm has no swivel left
   for a pole vector to steer. The joint lies on the shoulder-to-wrist line,
   so the only way to drop it is to drop the SHOULDER, and the hand stays put
   because reachArm leans the joint back along that line when the reach comes
   up short (SHOULDER_LEAN_MAX, which has 0.22 m of room against the 0.057 m
   this asks for).
   ⚠️ The forward component is not decoration - it is what UNLOCKS the arm.
   Dropping the shoulder straight down leaves it just as straight as it was
   (178 deg at every depth from -0.10 to -0.34, measured); pushing it toward
   the gun shortens the reach, and the joint bends again. Swept, elbow-minus-
   wrist in camera y (down is negative) against the elbow's own angle, at the
   middle of the stroke:
     y -0.14  z  0     -0.059   178 locked
     y -0.20  z  0     -0.093   178 locked
     y -0.26  z  0     -0.122   178 locked
     y -0.20  z -0.08  -0.154   136
     y -0.26  z -0.08  -0.167   156
     y -0.26  z -0.12  -0.199   133, and the wrist starts to cost (31)
   -0.26 / -0.08 is the one row where the elbow ends up further DOWN than it
   is out to the SIDE (0.167 against 0.145, against +0.015 above the wrist
   before), with the joint at 139-156 - about where the hip carry holds it -
   the wrist green at 17-24, the fist welded to the forend to 0.0000 m and the
   cut ring nowhere near the frame (|ndc y| 2.24). */
const BOLT_SHOULDER = {
  sniper: { L: new THREE.Vector3(0, -0.26, -0.08) },
};
/* Where the shoulder sits in the PLAIN CARRY, per weapon - the one shove that
   is not faded in by a pose, because the pose it fixes is standing still.

   It exists because the rifle cannot buy its framing with distance the way
   every other long gun does (2026-08-26). Its support arm carries the user's
   own shallow-forearm dial, which walks the arm's CUT END into frame - 8 of
   20 ring vertices at the hip, 4 under ADS - and the usual cure, pulling the
   gun toward the eye, is exactly what drives this buttstock through the near
   plane. Measured with a back-face probe over a 99x99 ray grid at every
   fraction of the ADS blend: root.z -0.10 is the last clean step, -0.09 opens
   321 see-through samples at t 0.75 and -0.07 opens 797 at full ADS. And the
   clean window is not enough on its own - at -0.10 the ring is still 4/20 on
   screen (|ndc y| 0.94, and it has to pass 1.00).

   So the arm is framed by the SHOULDER instead, which costs nothing
   geometrically: the IK keeps the fist welded to the grip (verified to
   0.004 m by tests/shots_weapons.py) and the joints absorb the drop, exactly
   as SPRINT_SHOULDER_TWEAK does for the run.
   ⚠️ It DOES break the "the game reproduces the DEVRIG rest pose bone for
   bone" guarantee for this weapon, and knowingly: the editor cannot show the
   cut end (see ARM_CARRY_REST), so a dial that looks right in the workshop
   can still hang a severed limb in the middle of the player's screen. The
   shove is per weapon so nothing else is touched.
   ⚠️ Take the SHALLOWEST drop that clears, not the deepest one that looks
   safest: the arm pays for depth by STRAIGHTENING, and past its optimum it
   locks dead straight again - the same failure SPRINT_SHOULDER_TWEAK was
   written to cure. Swept on the rifle, ADS elbow against drop: -0.04 -> 161
   deg, -0.06 -> 166, -0.07 -> 170, -0.10 -> 178 (locked). -0.06 clears the
   ring with margin in both poses (|ndc y| 1.15 hip / 1.29 ADS) at 150/166 deg
   of elbow, and the fist holds its anchor to 0.0000 m throughout. */
const CARRY_SHOULDER = {
  rifle: { L: new THREE.Vector3(0, -0.06, 0) },
  /* And the sniper on 2026-08-27, for a different symptom with the same
     cause. The user's call, twice narrowed: the HAND on this gun is right
     and so is the straight arm, and the run and the reload are right too -
     what is wrong is the standing hold and the raise out of it, where the
     support elbow points out to the LEFT instead of DOWN. Measured in camera
     space at the hip, the elbow sat 0.015 m ABOVE the wrist and 0.132 m out
     to its left: the whole limb lying along the barrel, which is not how an
     elbow hangs.
     ⚠️ So this one takes NO forward component, unlike BOLT_SHOULDER's. The
     forward push is what bends the joint, and the straight arm is the part
     the user signed off - at z 0 the elbow measures 177.6 deg at every depth
     and only ROTATES about the shoulder-to-wrist line, which is exactly the
     wanted change. Swept, elbow-below-wrist against elbow-outboard:
       -0.14   0.077 / 0.116   wrist 27.8
       -0.22   0.117 / 0.109   wrist 32.9
       -0.30   0.151 / 0.102   wrist 38.4
       -0.38   0.178 / 0.095   wrist 43.5
       -0.46   0.199 / 0.087   wrist 48.2
       -0.54   0.216 / 0.080   wrist 52.2, and the fist starts to slip
                               (0.005 m - the lean assist is spent)
     ⚠️ And take the SHALLOWEST drop that turns the elbow over, not the one
     with the best ratio. -0.38 was the first pick and it overshot (user
     report 2026-08-27, the day after: the arm hangs too far down and does not
     match the DEVRIG preview). That reading is exact, not an impression -
     this is the one table that deliberately departs from the editor's rest
     pose, and the departure IS the shoulder's displacement: measured in
     camera space, -0.38 carries the joint 0.300 m off where the preview puts
     it, so the whole limb arrives from far below the body the editor shows.
     -0.22 is the crossover - the first row where the elbow sits further DOWN
     than it is OUT (0.123 against 0.108, from 0.000/0.132 with no shove at
     all) - and it costs 0.202 m of that displacement instead of 0.300. The
     wrist stays green either way (34.0 deg here, 44.5 at -0.38) and the cut
     ring never came into it: this gun clears the frame at EVERY depth, 0/20
     with |ndc y| 1.33 at no shove and 2.46 here. Nor does ADS need any of it
     - measured at full ADS with no shove the elbow already hangs 0.107 below
     the wrist against 0.069 outboard, so the fault was only ever in the
     standing hold.
     ⚠️ AND IT IS GONE AGAIN (2026-08-27). The same entry was reported twice,
     at -0.38 and then at -0.22, with the same complaint both times: the gun
     does not look like the DEVRIG preview. That complaint is exact and it is
     measurable - this table is the one place that knowingly departs from the
     editor, and the wrist is where the departure shows. Measured on the hip
     carry, left hand: the editor's pose (which is what depth 0 solves to,
     the body fix being the identity there) reads 21.0 deg of wrist and 180
     of forearm twist; at -0.22 the game read 34.0 and 168.4. Thirteen
     degrees of wrist that the editor cannot show is exactly what "coś jest
     poprzesuwane" means.
     What it was buying is real but cheaper to buy elsewhere: at depth 0 the
     elbow sits level with the wrist (0.000 down, 0.132 out) instead of 0.123
     down. That is the elbow HINT's job - `upper` in the sniper's own `l`
     entry, which DEVRIG does preview and the user can dial. The cut ring was
     never in it (0/20 at every depth, |ndc y| 1.35 at zero).
     The rifle's entry stays: at zero its cut ring comes back ON SCREEN
     (8/20 at |ndc y| 0.84 against 0/20 at 1.15), which is the one thing the
     editor genuinely cannot show, and it costs only 4 deg of wrist. */
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

/* The carry's total shove: the run's, faded by its own weight, plus this
   weapon's STANDING offset, faded by how much of the standing pose is left.
   Its own scratch, because the sum has to survive the second shoulderShove
   call.
   ⚠️ `rest` is what keeps the tables independent. CARRY_SHOULDER fixes the
   pose of a man standing still holding the gun, and every other table here
   (the run's, the bolt cycle's, the reload's) was dialled against a carry
   with NO standing shove in it. Applying it at full weight in those poses
   would silently move all three, so it is faded out by whatever pose has
   taken over - and at weight 0, which is where the reload starts and ends and
   where the run eases in and out, it is still fully there. */
const _shSum = { L: new THREE.Vector3(), R: new THREE.Vector3() };
function carryShoulder(vm, side, w, sprintTable, id, rest = 1) {
  const out = _shSum[side].copy(shoulderShove(vm, side, w, sprintTable));
  const ct = CARRY_SHOULDER[id];
  if (ct && ct[side]) out.add(shoulderShove(vm, side, rest, ct));
  return out;
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
   for the other move: the gun travels around the frame and the shoulders do
   not have to go with it. They hang under the gun's root, so anything that
   raises or centres the carry walks the CUT END of the upper arm toward the
   bottom edge.
   ⚠️ It is VM_BASE ITSELF (2026-08-21, user decision). It used to sit 0.35 m
   below and behind the carry, and that gap is exactly what the game rendered
   differently from what DEVRIG previews: the editor shows the REST pose,
   while the solver held every shoulder that far below it and let the joints
   swallow the difference - measured at 9-16 deg on the forearm and 0-12 deg
   on the upper arm. Dialling a grip in the editor and getting another pose in
   the game is not a trade worth any framing (user report 2026-08-21: "in
   DEVRIG I set them up nicely and the guns are wrecked"). With the reference
   ON the carry, `armBodyFix` is the identity at the plain hip pose and the
   solver reproduces the dialled rest pose bone for bone.
   ⚠️ The cut end is then framed by the GRIPS alone, i.e. by `fore`/`upper` in
   HANDS - which is right, because those are visible in the editor. Moving the
   reference was worth 0.32 m of free framing and it is gone: the shotgun and
   the rifle put all 20 cap vertices on screen under ADS (nearest |ndc y| 0.40
   and 0.03) until their support arm was lifted 45 and 35 deg. Re-measure with
   tests/shots_weapons.py after every re-dial - there is no slack left here. */
const ARM_CARRY_REST = VM_BASE.clone();

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

/* ⚠️ At the plain hip pose this fix IS the identity, and it has to stay that
   way: it is what makes the game agree with DEVRIG, which previews the rest
   pose. Anything that pulls ARM_CARRY_REST off VM_BASE re-opens the gap the
   editor cannot show (see the note there). */
/* The arms outside a reload: the sprint carry at weight w, and - at w = 0 -
   plain carry, which is NOT a no-op. Both hands still go through the solver
   so the shoulders are held to the body while the gun travels to the eye and
   back; skipping the solve here is what let ADS drag the left shoulder into
   frame. */
function applyCarryArms(vm, w, pump, bolt, boltYank) {
  const rig = vm.userData.arms;
  if (!rig) return;
  const fix = armBodyFix(vm);   // leaves vm.matrix and the gun root current
  _spTargetR.bodyFix = fix;   // both stay on the gun, neither on its swing
  _spTargetL.bodyFix = fix;
  const wid = WEAPONS[currentWeapon].id;
  const ss = sprintShoulder(wid);
  // the standing shove gives way to the run and to the bolt cycle, each of
  // which carries its own dialled shoulder (see `rest` in carryShoulder)
  _spTargetR.shoulderOff = carryShoulder(vm, 'R', w, ss, wid, 1 - w);
  _spTargetL.shoulderOff = carryShoulder(vm, 'L', w, ss, wid,
                                         1 - Math.max(w, bolt || 0));
  /* the support shoulder gives way while the bolt cycles - see BOLT_SHOULDER.
     Added AFTER the carry sum, on the cycle's own weight, so the standing
     carry and the run are untouched when nothing is cycling. */
  const bsh = BOLT_SHOULDER[wid];
  if (bolt > 0 && bsh && bsh.L) {
    _spTargetL.shoulderOff.add(shoulderShove(vm, 'L', bolt, bsh));
  }
  /* The FIRING hand works the bolt between shots (sniper). A rel-style
     target, because the whole grip changes: the fist is threaded onto the
     knob, 90 deg off the firing grip, and no position-only lerp reads as a
     hand taking hold of a handle. */
  const cfgR = vm.userData.handCfg;
  if (bolt > 0 && cfgR && cfgR.grips && cfgR.grips.boltR && cfgR.bolt) {
    _boltRp[0] = cfgR.bolt[0];
    _boltRp[1] = cfgR.bolt[1];
    _boltRp[2] = cfgR.bolt[2] + (cfgR.pull || 0) * (boltYank || 0);
    relTarget(_boltTarget, rig.R, _boltRp, cfgR.grips.boltR, null, 0);
    _boltTarget.byFist = false;
    _boltTarget.bodyFix = fix;
    _boltTarget.shoulderOff = _spTargetR.shoulderOff;
    blendArm(rig.R, _boltTarget, bolt);
  } else {
    blendArm(rig.R, _spTargetR, w);
  }
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
   "to the eye" first (zoomBlend 0->1), only then the scope cuts in.
   Pulled toward the centre and the eye on 2026-08-26 (user call: the scope
   should open from closer in) - the raise is also slower now (0.5 s, see
   updateViewmodel), so the whole move reads as bringing the optic to the eye
   rather than a flick. */
const ZOOM_RAISE = new THREE.Vector3(0.05, -0.13, -0.44);
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
/* A shot ABORTS the reload (user call 2026-08-27), and the pose it interrupts
   needs a way out: clearing it in one frame throws the gun back through up to
   0.42 rad and the loading fist through half a metre in a single step - the
   very teleport every other handover here is written to avoid. So the plan is
   kept for one short window, frozen at the fraction the shot fell on, and
   everything it owns - gun offsets, hand weights, magazine, slide, forend -
   is scaled home by `relCancel` (fadeReloadPose).
   ⚠️ The window fits INSIDE the pump's and the bolt's dead beat (PUMP_HOLD /
   BOLT_HOLD, both ~0.25 s), so the stroke that same shot books never has to
   fight the pose that is still running out. */
const REL_CANCEL_DUR = 0.12;
let relCancel = 0;   // 1 -> 0 while the interrupted pose runs out
let relCancelT = 0;  // the fraction of the reload the shot landed on
/* R OUTRANKS A HELD TRIGGER, a fresh trigger pull outranks the reload (user
   call 2026-08-27). Both rules live in this one latch: a reload that starts
   while the trigger is already down marks it, and a marked trigger is ignored
   until it is released - so holding LMB through a reload no longer cancels it
   on the first frame, while clicking again still does. Cleared in
   updateWeapons the moment `firing` goes false. */
let relTriggerHeld = false;
/* ...and the dry click is one per trigger pull, not one every 0.25 s: an
   auto weapon held on an empty chamber would otherwise clack on a loop. */
let dryFired = false;

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

/* Seating a magazine, in TWO legs: swing it under the well first, then push
   it straight up its OWN axis.

   A single straight line from `low` to `mag` is what the swap used to do, and
   it arrives ACROSS the magazine rather than along it: measured on the rifle,
   that path rises with a z component of -0.39 while the magazine's body leans
   at +0.13, so the top front corner sweeps through the front wall of the
   magwell on the way in - the user's "there is a moment where the magazine
   pokes through the gun". The SMG has the same geometry and the same fault.

   The staging point is `mag` pushed back down the magazine's own axis, which
   is exactly what `magDrop` already measures (it is the direction the empty
   one falls out along), so no new per-weapon number is needed. A weapon
   without one keeps the old straight line. */
const _mgStage = [0, 0, 0];
const MAG_STAGE = 0.45;   // how far under the well the approach aims, along the axis
const MAG_PUSH = 0.62;    // fraction of the window spent approaching, rest is the push
const MAG_PULL = 0.38;    // ...and the mirror: how much of the way OUT is the strip
function magStage(cfg) {
  for (let i = 0; i < 3; i++) _mgStage[i] = cfg.mag[i] + cfg.magDrop[i] * MAG_STAGE;
  return _mgStage;
}
function magSeat(out, cfg, k) {
  if (!cfg.magDrop) return lerp3(out, cfg.low, cfg.mag, k);
  const s = magStage(cfg);
  if (k < MAG_PUSH) return lerp3(out, cfg.low, s, k / MAG_PUSH);
  return lerp3(out, s, cfg.mag, (k - MAG_PUSH) / (1 - MAG_PUSH));
}

/* Pulling the empty one, the same two legs in reverse: strip it STRAIGHT DOWN
   its own axis until it is clear of the well, and only then swing it away.
   ⚠️ The straight line out has the same fault the straight line in had, and
   the user hit both (2026-08-26, first "there is a moment where the magazine
   pokes through the gun" on the way in, then the same on the way out, on the
   SMG and the rifle alike): the mag well is a close fit around the magazine,
   so any departure that is not along the axis drags a corner through its
   wall. It only shows for a frame or two, which is exactly what makes it
   read as a glitch rather than as a pose. */
function magPull(out, cfg, k) {
  if (!cfg.magDrop) return lerp3(out, cfg.mag, cfg.low, k);
  const s = magStage(cfg);
  if (k < MAG_PULL) return lerp3(out, cfg.mag, s, k / MAG_PULL);
  return lerp3(out, s, cfg.low, (k - MAG_PULL) / (1 - MAG_PULL));
}

const _gp = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
const _lp = [0, 0, 0];
const _rp = [0, 0, 0];
/* where the feeding fist ends its push - `port` plus the gun's `feed` */
const _feedIn = [0, 0, 0];

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
  /* the swapping hand squares its shoulder up as it comes off the gun, on the
     hand's own weight so it eases in and out with the move - PLUS the
     weapon's standing carry drop at full weight.
     ⚠️ That second term used to be missing here, and a reload is exactly the
     pose that needs it: the reload runs standing still, which is what
     CARRY_SHOULDER is for, and dropping it for the duration put the rifle's
     cut ring back on screen at both ends of the animation (6/20 vertices,
     |ndc y| 0.86, user report 2026-08-27). carryShoulder sums the two the
     same way the plain carry does. */
  const wid = WEAPONS[currentWeapon].id;
  const rs = RELOAD_SHOULDER[wid] || NO_SHOULDER;
  /* ⚠️ `rest` is 1 FLAT through a reload, not 1 - the hand's weight. The
     standing drop (CARRY_SHOULDER) fixes the pose of a man standing still,
     and a reload is done standing from the first frame to the last - fading
     it out under the swap made the joint BOB by exactly its own depth (the
     rifle's 0.06 m, measured end to end), which is the joint translating,
     which shoulders do not do. Holding it flat also takes the rifle's cut
     ring off screen (8/20 visible at |ndc y| 0.82 -> 0/20 at 1.10) and the
     sniper's wrist from 61 deg to 40.
     ⚠️ It cannot disturb a gun whose swap was dialled against the fade,
     because the two tables do not overlap: CARRY_SHOULDER has the rifle and
     the sniper, RELOAD_SHOULDER has the SMG. Measured: the SMG, the pistol
     and the shotgun come out identical to the digit. */
  _relL.shoulderOff = carryShoulder(vm, 'L', _relLw, rs, wid, 1);
  _relR.shoulderOff = carryShoulder(vm, 'R', _relRw, rs, wid, 1);
  /* and the joints stay put while the hands travel - see pinShoulder in
     hands.js. Without it the shoulder follows the hand by up to 0.10 m, so
     the reload dragged the arm's cut end back and forth across the frame. */
  _relL.pinShoulder = true;
  _relR.pinShoulder = true;
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
  let rgA = null;                        // ...and the right hand (sniper bolt)
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
    // ⚠️ roll is NEGATIVE, i.e. the gun tips to the RIGHT (top right, bottom
    // toward the middle of the screen). The magwell faces the camera then, so
    // the swap is actually visible - at the old +0.12 the gun stayed upright
    // and the magazine went in behind its own frame (user 2026-08-21).
    _gp.rz = (-0.42 + rr[2]) * env;
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
    else if (t < T.back[0]) { lw = 1; magPull(_lp, cfg, vmEase(t, T.out[0], T.out[1])); }
    else if (t < T.back[1]) { lw = 1; magSeat(_lp, cfg, vmEase(t, T.back[0], T.back[1])); }
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
    /* ...and whether that magazine still has brass on top. A reload from
       empty strips a dead magazine, so the round goes away for the trip out
       and is back for the trip in - the one being pushed home is a fresh one.
       The switch happens at the bottom of the swing, where the fist is off
       screen (cfg.low is dialled to be, see HANDS): that dwell is what sells
       the swap in the first place, and it is the only moment where nothing
       can be seen to change. A tactical reload keeps the round throughout. */
    setMagLoaded(vm, !P.empty || t >= (T.out[1] + T.back[0]) / 2);
  } else {
    /* Shells one at a time; the shotgun rolls to show the port, the sniper
       pitches. `relGun` deviates from the shared amount PER WEAPON, exactly
       as it does on the mag styles: the shared numbers were dialled on a gun
       held near the centreline, and this one is the longest in the game and
       carried furthest right, so without a deviation its loading gate sat at
       NDC (0.46, -0.74) - the bottom-right corner - and the whole sequence
       played half off screen (measured 2026-08-25, user report). */
    const rp = cfg.relGun ? cfg.relGun.pos : ZERO_TWEAK;
    const rr = cfg.relGun ? cfg.relGun.rot : ZERO_TWEAK;
    /* ⚠️ The loading tilt LETS GO once the last shell is in (user report
       2026-08-27: on the rack that ends the reload the shotgun should be held
       normally, not still turned on its side). The roll and the yaw exist to
       show the loading gate to the camera; nobody works a pump with the gun
       still rolled over, and the hand goes back to the forend over the same
       window (see the travel below), so the two move together. */
    const senv = P.empty ? env * (1 - vmEase(t, P.win[1], P.win[1] + 0.12)) : env;
    if (P.style === 'shell') {
      _gp.rx = (-0.18 + rr[0]) * senv; _gp.ry = rr[1] * senv; _gp.rz = (-0.35 + rr[2]) * senv;
      _gp.px = (-0.03 + rp[0]) * senv; _gp.py = (0.02 + rp[1]) * senv; _gp.pz = rp[2] * senv;
    } else {
      _gp.rx = (-0.16 + rr[0]) * env; _gp.ry = (0.18 + rr[1]) * env; _gp.rz = rr[2] * env;
      _gp.px = (-0.04 + rp[0]) * env; _gp.py = (0.02 + rp[1]) * env; _gp.pz = rp[2] * env;
    }
    const [w0, w1] = P.win;
    lgA = G.port;
    if (t >= w0 && t < w1 && P.cycles > 0) {
      const cw = (w1 - w0) / P.cycles;
      const ct = ((t - w0) % cw) / cw; // 0..1 inside this cycle
      lw = 1;
      if (cfg.feed) {
        /* A gun with a real feed stroke (the sniper): reach up to the mouth
           of the action, PUSH the round home along the grip's own channel,
           then drop away for the next one. Without the push the round simply
           blinked out of existence at the mouth - the player never saw one go
           in (user report 2026-08-27). The prop is switched off at the END of
           the push, by which time it is buried in the receiver, so what the
           eye follows is a round going into the action rather than a round
           disappearing beside it. */
        _feedIn[0] = cfg.port[0] + cfg.feed[0];
        _feedIn[1] = cfg.port[1] + cfg.feed[1];
        _feedIn[2] = cfg.port[2] + cfg.feed[2];
        if (ct < 0.42) lerp3(_lp, cfg.low, cfg.port, vmEase(ct, 0.05, 0.42));
        else if (ct < 0.66) lerp3(_lp, cfg.port, _feedIn, vmEase(ct, 0.44, 0.62));
        else lerp3(_lp, _feedIn, cfg.low, vmEase(ct, 0.68, 1.0));
      } else if (ct < 0.45) lerp3(_lp, cfg.low, cfg.port, vmEase(ct, 0.05, 0.45));
      else lerp3(_lp, cfg.port, cfg.low, vmEase(ct, 0.6, 1.0));
    } else if (t >= w1 && P.empty) {
      if (P.style === 'shell') {
        /* The classic pump rack, left hand on the forend.
           ⚠️ Full weight from the first frame, NOT eased up from zero. The
           loading cycle above leaves this hand at weight 1, so easing in from
           0 was a step DOWN, and a partly-weighted hand is a hand blended
           back toward its FIRING rest pose - which, with `relGun` holding the
           gun yawed away from a shoulder still anchored at the hip carry, is
           the very pose `grips.bolt` exists to avoid. Measured: the wrist
           snapped to 42 deg of BACKWARD bend for ~80 ms at the handover
           (2026-08-25). There is nothing to ease anyway - `bolt` is the
           firing grip's position verbatim, so the hand does not move; only
           the grip frame changes, and it changes while the hand is arriving
           from off screen. */
        lw = 1;
        lgA = G.bolt;
        /* TRAVEL back to the forend, do not teleport onto it. The last
           loading cycle leaves the fist down at `low`, so writing `bolt`
           straight in jumped it the whole way in one frame - the hand
           "suddenly appeared" on the pump (user report 2026-08-25). The
           stroke itself only starts at 0.78, so there is room to walk the
           hand up first. */
        /* ⚠️ The window is sized by SPEED, not by taste: low -> bolt is
           0.487 m, and the loading swing covers its own 0.26 m at ~1.4 m/s,
           so anything much under 0.10 of the animation reads as the hand
           being yanked rather than lifted. The stroke waits behind it. */
        lerp3(_lp, cfg.low, cfg.bolt, vmEase(t, w1, w1 + 0.10));
        const rack = vmPulse(t, 0.81, 0.95);
        _lp[2] += cfg.pull * rack;
        _gp.pz += 0.025 * rack;
        _gp.rx -= 0.08 * rack;
        // the forend travels with the hand on it (the model ships it as its
        // own part exactly for this)
        setPump(vm, cfg.pull * rack);
        lw *= 1 - vmEase(t, 0.95, 1.0);
      } else {
        // sniper: the RIGHT hand works the bolt at the rear, on its own grip
        // (fist threaded onto the knob) and driving the carved handle
        const yank = vmPulse(t, 0.76, 0.90);
        /* ⚠️ The ease STARTS AT w1, where this branch starts - not at a
           pasted 0.66, which is BEFORE it. The loading cycles own the
           timeline until w1, so an ease that began earlier was already
           half-way up when this branch first ran: the right hand appeared
           on the bolt at 50% weight in a single frame (user report
           2026-08-26, "the hand teleports back to the grip and the bolt").
           Anything keyed here has to be keyed off w1. */
        rw = vmEase(t, w1, w1 + 0.10) * (1 - vmEase(t, 0.90, 0.98));
        rgA = G.boltR;
        _rp[0] = cfg.bolt[0]; _rp[1] = cfg.bolt[1];
        _rp[2] = cfg.bolt[2] + cfg.pull * yank;
        if (vm.userData.boltPart) vm.userData.boltPart.position.z = cfg.pull * yank;
        /* ⚠️ And the LEFT hand has to be given a way home. This branch used
           to leave `lw` at its initialised 0, so the loading hand - which the
           last cycle leaves down at `low` on full weight - snapped back onto
           the forend in ONE frame. Fading the weight over a window walks it
           back instead: blendArm interpolates between `low` and the rest grip
           by that weight, which is the same travel the shotgun's rack does
           explicitly with lerp3. */
        lw = 1 - vmEase(t, w1, Math.min(1, w1 + 0.12));
        _lp[0] = cfg.low[0]; _lp[1] = cfg.low[1]; _lp[2] = cfg.low[2];
        _gp.pz += 0.02 * yank;
        _gp.rx -= 0.06 * yank;
      }
    } else if (t < w0) {
      /* Down for the first shell, over a window matched to the loading
         swing's own speed. It was briefly narrowed to 0.01..0.09 to beat the
         gun into a `grips.port` frame - that frame is gone, and the narrow
         ramp only made the hand dive at ~2.3 m/s where the swing runs at
         1.4, which reads as a lurch. */
      lw = vmEase(t, 0.02, w0); _lp[0] = cfg.low[0]; _lp[1] = cfg.low[1]; _lp[2] = cfg.low[2];
    } else {
      lw = 1 - vmEase(t, w1, Math.min(1, w1 + 0.08));
      _lp[0] = cfg.low[0]; _lp[1] = cfg.low[1]; _lp[2] = cfg.low[2];
    }
  }
  _relLw = lw; _relRw = rw;
  _relL.byFist = _relR.byFist = !!cfg.magSwap;
  relTarget(_relL, rig.L, lw > 0 ? _lp : rig.L.basePos, lgA, lgB, lgK);
  relTarget(_relR, rig.R, rw > 0 ? _rp : rig.R.basePos, rgA, null, 0);
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
      /* The round is switched on down at the bottom of the swing, off screen,
         and off again once it is home. On a gun with a feed stroke that is
         the END of the push (ct 0.62), not the moment the hand arrives -
         see the branch in applyReloadPose. */
      const seat = cfg.feed ? 0.62 : 0.5;
      ev.push({ t: c0 + 0.02 * cw, fn: () => { if (shell) shell.visible = true; } });
      // ...and THIS is where the round is credited on an interrupted reload:
      // a shell already in the tube stays in the tube (see cancelReload)
      ev.push({ t: c0 + seat * cw, fn: () => { P.loaded++; AudioSys.shellIn(w.id); if (shell) shell.visible = false; } });
    }
    if (reloadFromEmpty) {
      // on the stroke, not on a pasted fraction: the shell rack sits at
      // vmPulse(t, 0.81, 0.95), so its sound belongs just past that midpoint
      ev.push({ t: cfg.style === 'shell' ? 0.87 : 0.84,
                fn: () => (cfg.style === 'shell' ? AudioSys.pump(w.id) : AudioSys.boltPull(w.id)) });
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

function clearReloadVisuals(vm) {
  if (vm.userData.magProp) vm.userData.magProp.visible = false;
  if (vm.userData.shellProp) vm.userData.shellProp.visible = false;
  if (vm.userData.slide) vm.userData.slide.position.z = 0;
  if (vm.userData.boltPart) vm.userData.boltPart.position.z = 0;
  setPump(vm, 0);
  if (vm.userData.magPart) {
    vm.userData.magPart.position.set(0, 0, 0);
    vm.userData.magPart.visible = true;
  }
  setMagLoaded(vm, true);
}

/* full visual reset (level restarts, weapon switches mid-reload) */
function resetWeaponFx() {
  clearRecoil();
  sprintBlend = 0;
  wallBlend = 0;
  aimHeld = false; aimBlocked = false;
  zoomBlend = 0;
  pumpT = 0; pumpFired = true;
  boltT = 0; boltFired = true;
  relPlan = null;
  relCancel = 0;
  relTriggerHeld = false; dryFired = false;
  setScopeOverlay(false, true);
  _relLw = 0; _relRw = 0;
  for (const vm of viewmodels) {
    clearReloadVisuals(vm);
    const rig = vm.userData.arms;
    if (rig) { blendArm(rig.L, null, 0); blendArm(rig.R, null, 0); }
  }
}

/* Scale everything the reload pose owns back toward its home by `k`, so an
   interrupted reload runs out instead of snapping (see relCancel). The hand
   weights go through it too: blendArm reads them as "how far from the carry
   pose", so fading them IS the travel back onto the gun. */
function fadeReloadPose(vm, k) {
  _gp.px *= k; _gp.py *= k; _gp.pz *= k;
  _gp.rx *= k; _gp.ry *= k; _gp.rz *= k;
  _relLw *= k; _relRw *= k;
  const ud = vm.userData;
  if (ud.magPart) {
    // rides home with the pose, and visible the whole way - the Glock's drop
    // hides it near the bottom of its travel, and a magazine that blinks out
    // as the gun comes up reads as a lost magazine
    ud.magPart.position.multiplyScalar(k);
    ud.magPart.visible = true;
  }
  if (ud.slide) ud.slide.position.z *= k;
  if (ud.boltPart) ud.boltPart.position.z *= k;
  if (ud.pumpPart) setPump(vm, (ud.pumpPart.position.z - ud.pumpHome) * k);
}

function updateViewmodel(dt) {
  const vm = viewmodels[currentWeapon];
  const w = WEAPONS[currentWeapon];
  const speedFactor = player.moving && player.onGround ? 1 : 0;
  vmBobT += dt * (keys['ShiftLeft'] ? 11 : 8) * (speedFactor ? 1 : 0.3);
  updateRecoil(dt);
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

  /* the wall carry rides its own blend, so the run's blur and bob are not
     driven by it. The reload owns the whole pose while it runs (its offsets
     are absolute, not deltas on this), so the probe is muted there. */
  const wallTarget = (reloading || relCancel > 0) ? 0 : wallProximity();
  wallBlend += (wallTarget - wallBlend) * Math.min(1, dt * 12);
  // the muzzle goes in and out of cover while the player moves, so ADS is
  // taken away and handed back here rather than only on the mouse event
  if (noAimRoom()) {
    if (aiming) { aimBlocked = true; setAiming(false); }
  } else if (aimBlocked) {
    aimBlocked = false;
    if (aimHeld) setAiming(true);
  }
  // whichever wants the gun lower wins; they are the same pose, so no blend
  // of two poses ever happens
  const carryBlend = Math.max(sprintBlend, wallBlend);
  /* How much room is left to bring the sights up. The wall carry bleeds the
     ADS target out as the drop comes on (see WALL_AIM), so the two never play
     one after the other. Declared here because the scope gate below reads it
     as well - and it must stay ABOVE that gate: `zoomTarget` short-circuits
     on `w.zoom`, so a temporal-dead-zone slip here would throw on the sniper
     alone, and only the sniper. */
  const adsRoom = 1 - Math.min(1, wallBlend / WALL_AIM);
  const wt = WALL_TWEAK[w.id];
  const wallY = wt ? wt.y : 0;
  const wallDip = WALL_DIP + (wt ? wt.dip : 0);

  // the sniper's bolt cycle between shots - counted down BEFORE the scope
  // gate reads it, because the cycle is what keeps the scope down
  boltT = Math.max(0, boltT - dt / BOLT_DUR);
  const boltAge = (1 - boltT) * BOLT_DUR;
  const boltK = (boltAge - BOLT_HOLD) / BOLT_STROKE;
  // sniper scope: raise "to the eye" first, the overlay cuts in at the top.
  // Slower on purpose (0.32 -> 0.50 s, user call 2026-08-26): the raise is a
  // deliberate move to the eye, and the scope opens from closer in
  // (ZOOM_RAISE). The bolt cycle holds the scope down until the hand is back
  // on the grip, then the same raise brings it back.
  const zoomTarget = (aiming && w.zoom && !reloading && boltT <= 0 && adsRoom > 0) ? 1 : 0;
  if (zoomTarget) zoomBlend = Math.min(1, zoomBlend + dt / 0.50); // raise ~0.5 s
  else zoomBlend = Math.max(0, zoomBlend - dt / 0.22);            // lower faster
  if (!scoped && zoomTarget === 1 && zoomBlend >= 1) setScopeOverlay(true);
  else if (scoped && zoomTarget === 0) setScopeOverlay(false);

  // reload: gun pose + hand choreography from the plan built in startReload().
  // Only the GUN offsets are applied here; the hands go on at the bottom,
  // once vm's transform for this frame is final, because their shoulder
  // anchor is read back THROUGH that transform.
  _gp.px = 0; _gp.py = 0; _gp.pz = 0; _gp.rx = 0; _gp.ry = 0; _gp.rz = 0;
  const reloadPose = (reloading || relCancel > 0) && !!relPlan;
  /* the pump stroke between shots; the reload owns the forend while it runs,
     so the two never drive the same part in one frame */
  pumpT = Math.max(0, pumpT - dt / PUMP_DUR);
  // time since the shot, then the stroke's own 0..1 - everything before
  // PUMP_HOLD is the gun settling, with the forend still shut
  const pumpAge = (1 - pumpT) * PUMP_DUR;
  const pumpK = (pumpAge - PUMP_HOLD) / PUMP_STROKE;
  const pumpEnv = (reloadPose || pumpT <= 0 || pumpK <= 0) ? 0 : vmPulse(pumpK, 0, 1);
  /* The stroke's sound is fired HERE, on the frame the forend actually starts
     moving - not scheduled ahead from tryFire.
     ⚠️ Scheduling it there was audible as a lie: the shot books it on the
     WebAudio clock PUMP_HOLD ahead, and a reload started inside that beat
     zeroes `pumpT`, so the forend never moves while the booked sound plays
     anyway (user report 2026-08-25: fire, hit reload, hear the pump without
     the pump). A sample already queued on the audio clock cannot be recalled,
     so the fix is not to queue it early. Firing it from the animation makes
     the sound a consequence of the stroke rather than a prediction of it. */
  if (pumpEnv > 0 && !pumpFired) {
    pumpFired = true;
    AudioSys.pump(w.id, { vol: 0.38 });
  }
  if (!reloadPose) setPump(vm, (vm.userData.handCfg.pull || 0) * pumpEnv);
  /* the sniper's bolt work, same contract as the pump: envelope for the hand
     (it climbs to the knob, stays through the yank, returns), yank for the
     handle's own travel. The sound fires off the animation, on the frame the
     handle starts moving - never scheduled ahead (see the pump note). */
  const boltEnv = (reloadPose || boltT <= 0 || boltK <= 0) ? 0
    : vmEase(boltK, 0, 0.22) * (1 - vmEase(boltK, 0.85, 1));
  const boltYank = boltEnv > 0 ? vmPulse(boltK, 0.28, 0.78) : 0;
  if (boltEnv > 0 && boltK > 0.28 && !boltFired) {
    boltFired = true;
    AudioSys.boltPull(w.id);
  }
  if (!reloadPose && vm.userData.boltPart) {
    vm.userData.boltPart.position.z = (vm.userData.handCfg.pull || 0) * boltYank;
  }
  // The gun stays HALF-SHOULDERED through the cycle instead of dropping to
  // the hip - a bolt-action shooter does not lower the rifle to cycle it -
  // and gives a little with the yank, like the shotgun under its pump rack.
  _gp.px += BOLT_CARRY.px * boltEnv;
  _gp.py += BOLT_CARRY.py * boltEnv;
  _gp.rz += BOLT_CARRY.rz * boltEnv;
  _gp.pz += 0.02 * boltYank;
  _gp.rx -= 0.05 * boltYank;
  if (reloadPose) {
    if (reloading) {
      const t = 1 - reloadTimer / reloadDuration; // 0 -> 1
      while (relEvIdx < relPlan.events.length && t >= relPlan.events[relEvIdx].t) {
        relPlan.events[relEvIdx++].fn();
      }
      applyReloadPose(vm, t);
    } else {
      // aborted by a shot: the frozen pose runs out, and no further events
      // fire - the sounds and props of a reload that is no longer happening
      applyReloadPose(vm, relCancelT);
      relCancel = Math.max(0, relCancel - dt / REL_CANCEL_DUR);
      fadeReloadPose(vm, relCancel);
      if (relCancel === 0) { relPlan = null; clearReloadVisuals(vm); }
    }
  }

  // ADS: płynne przejście do pozycji celowania (muszka w osi kamery)
  const adsTarget = (aiming && !w.zoom && !reloading) ? adsRoom : 0;
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
  /* the body's share of the kick: whatever is left over is deviation the
     elbows and wrists have to absorb, which is the recoil the player sees in
     the hands (see ARM_RECOIL_FOLLOW) */
  const RF = ARM_RECOIL_FOLLOW;
  /* ⚠️ Aiming shrinks the kick at the SOURCE, so the gun and the shoulder
     reference shrink together. Scaling only the gun would hand the whole
     difference to the joints, i.e. put back in the wrists exactly the recoil
     the sights are supposed to take out. */
  const rc = vmRecoilAim;
  const rcZ = vmRecoil * RECOIL_TRAVEL * rc;   // push...
  const rcX = vmRecoil * RECOIL_PITCH * rc;    // ...and climb, off the same spring
  const rcY = vmRecoilYaw * rc;                // ...and this shot's throw
  const rcR = vmRecoilRoll * rc;
  // The base is ARM_CARRY_REST, not VM_BASE: the body stands a little below
  // the raised carry (see the constant). Everything the gun does ON TOP of the
  // hip pose is still measured against VM_BASE, so ADS behaves as before.
  const R = ARM_CARRY_REST;
  sprintCarry(w.id);
  /* ⚠️ The wall drop rides the BODY, not the joints (user report 2026-08-27:
     "zrób żeby ręce razem z bronią schodziły, a nie nadgarstki wygina").
     Everything the gun does ON TOP of this reference is deviation the arms
     have to absorb, so putting a 0.8 rad dive on the gun alone fed the whole
     dive to the wrists and elbows - the pistol came out with the hands folded
     back on themselves. The wall-only surplus therefore goes INTO the
     reference: armBodyFix cancels it, the shoulder travels with the gun and
     the arms ride down rigidly, in the pose they were dialled in.
     ⚠️ Only the SURPLUS over the run (`wOnly`), never the run's own share:
     the run drop is dialled to be absorbed by the joints and carries its own
     shoulder shove (SPRINT_SHOULDER), so feeding it in here would move the
     shoulder twice. Sprinting into a wall leaves wOnly at 0 and changes
     nothing about how the run looks. */
  const wOnly = carryBlend - sprintBlend;
  _carryPos.set(
    R.x + (ads.x - VM_BASE.x) * adsBlend * F.x
      + (ZOOM_RAISE.x - VM_BASE.x) * zb * F.x + bobX * bobScale
      + _spPos[0] * wOnly,
    R.y + (ads.y - VM_BASE.y) * adsBlend * F.y
      + (ZOOM_RAISE.y - VM_BASE.y) * zb * F.y + bobY * bobScale
      + _spPos[1] * wOnly + wallY * wallBlend,
    R.z + (ads.z - VM_BASE.z) * adsBlend * F.z
      + (ZOOM_RAISE.z - VM_BASE.z) * zb * F.z + rcZ * RF
      + _spPos[2] * wOnly + WALL_PULL * wallBlend);
  _carryRot.set(
    rcX * RF + 0.06 * zb * F.y + _spRot[0] * wOnly
      + wallDip * wallBlend,
    rcY * RF + _spRot[1] * wOnly,
    rcR * RF + bobX * 0.6 * bobScale + _spRot[2] * wOnly);
  vm.position.set(
    bx + bobX * bobScale + _gp.px + _spPos[0] * carryBlend,
    by + bobY * bobScale + _gp.py + _spPos[1] * carryBlend + wallY * wallBlend,
    bz + rcZ + _gp.pz + _spPos[2] * carryBlend + WALL_PULL * wallBlend
  );
  vm.rotation.set(
    rcX + _gp.rx + _spRot[0] * carryBlend + wallDip * wallBlend
      + 0.06 * zb,
    rcY + _gp.ry + _spRot[1] * carryBlend,
    rcR + bobX * 0.6 * bobScale + _gp.rz + _spRot[2] * carryBlend
  );
  // hands last: the body anchor is read off the gun transform set just above
  if (reloadPose) applyReloadArms(vm);
  // solves even at sprintBlend 0; the bolt envelope animates the firing hand
  // the RUN's weight, not carryBlend: the wall surplus is already in the
  // reference above, so the solver must not be told to bend for it as well
  else applyCarryArms(vm, sprintBlend, pumpEnv, boltEnv, boltYank);
  // ukryj viewmodel dopiero pod pełną lunetą (po animacji podniesienia)
  vm.visible = !(w.zoom && scoped);
  __test.scoped = scoped;
  __test.wallCarry = wallBlend;
  __test.wallBlock = muzzleBlocked();
}

function switchWeapon(idx) {
  if (game.noCombat) return; // epilogue: weapons stay stowed
  if (idx === currentWeapon || idx < 0 || idx >= WEAPONS.length) return;
  if (!WEAPONS[idx].owned) {
    AudioSys.empty();
    showCenterMsg('Broń zablokowana — kup w sklepie', 1.1, true);
    return;
  }
  pumpT = 0; pumpFired = true;
  boltT = 0; boltFired = true;
  clearRecoil();  // the outgoing gun's kick does not ride onto the new one
  relTriggerHeld = false; dryFired = false; // a new gun gets a fresh answer
  clearReloadVisuals(viewmodels[currentWeapon]);
  viewmodels[currentWeapon].visible = false;
  currentWeapon = idx;
  viewmodels[currentWeapon].visible = true;
  reloading = false;
  relPlan = null;
  relCancel = 0;
  hideReloadHud();
  setAiming(false);
  AudioSys.switch_(WEAPONS[currentWeapon].id);
  updateWeaponHud();
}

/* `byPlayer` marks the one call that is the player letting go of RMB. Every
   other caller (weapon swap, shop, pause, level reset, DEVRIG) lowers the
   rifle as a side effect of something else, and those must not sound like the
   player lowering it. */
/* The player's RMB intent, kept apart from `aiming` itself: the wall carry
   takes ADS away while the muzzle is blocked and has to give it back when
   they step off the wall, without the player having to re-press. `aimBlocked`
   is what says the drop is the reason it went away - a weapon switch or a
   reset must NOT come back up on its own. */
let aimHeld = false, aimBlocked = false;

function setAiming(on, byPlayer = false) {
  if (byPlayer) aimHeld = on;
  // no room to aim: the gun is already down (see muzzleBlocked)
  if (on && noAimRoom()) { aimBlocked = true; on = false; }
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
  relCancel = 0; // a fresh reload takes over from any run-out still playing
  // R wins over a trigger that is already held: that hold cannot cancel this
  // reload, only a new pull can (see relTriggerHeld)
  relTriggerHeld = firing;
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
  relPlan = { style: cfg.style, empty: reloadFromEmpty, cycles: 0, win: [0, 1],
              loaded: 0, events: [] };
  if (cfg.style !== 'mag') {
    relPlan.cycles = Math.max(1, Math.min(cfg.style === 'shell' ? 4 : 3,
      Math.min(w.magSize - w.mag, w.reserve)));
    relPlan.win = [0.14, reloadFromEmpty ? 0.70 : 0.90];
  }
  relPlan.events = buildReloadEvents(w, vm);
  relEvIdx = 0;
  pumpT = 0;            // the reload takes the forend over from here
  pumpFired = true;     // ...and so does its sound (see updateViewmodel)
  boltT = 0;            // ...and the bolt likewise (sniper)
  boltFired = true;
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

/* The trigger outranks the reload (user call 2026-08-27). Called from tryFire
   only with a round already chambered - on an empty gun there is nothing to
   shoot with, so the sequence runs on rather than being cancelled into a
   click.
   ⚠️ Shell styles keep what has actually been thumbed in (`relPlan.loaded`),
   because there the rounds go in one at a time and the tube does not give
   them back. A magazine that never seated gives nothing: the mag styles
   credit their ammo in finishReload and that is the only place they can. */
function cancelReload() {
  if (!reloading) return;
  const w = WEAPONS[currentWeapon];
  const vm = viewmodels[currentWeapon];
  if (relPlan && relPlan.style !== 'mag' && relPlan.loaded > 0) {
    const take = Math.min(relPlan.loaded, w.magSize - w.mag, w.reserve);
    w.mag += take;
    w.reserve -= take;
  }
  reloading = false;
  // the pose runs out over REL_CANCEL_DUR (see relCancel); what the fist is
  // CARRYING goes at once - a spare magazine or a loose round has no business
  // being in shot while the gun is being fired, and the muzzle flash covers it
  relCancelT = Math.min(1, Math.max(0, 1 - reloadTimer / reloadDuration));
  relCancel = relPlan ? 1 : 0;
  if (vm.userData.magProp) vm.userData.magProp.visible = false;
  if (vm.userData.shellProp) vm.userData.shellProp.visible = false;
  if (!relPlan) clearReloadVisuals(vm);
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

/* "you are dry" - shown the moment the magazine runs out, which is the shot
   that empties it, NOT the trigger pull after it (user call 2026-08-27).
   Nothing reloads by itself any more, so this line is how the player learns
   the gun is done, and by the time the striker clicks on nothing it is old
   news. */
function showDryMsg(w) {
  showCenterMsg(w.reserve > 0 ? 'Brak amunicji — wciśnij R'
                              : 'Brak amunicji — zmień broń!', 1.1, true);
}

function tryFire() {
  if (game.noCombat) return; // epilogue: no shooting at the parade
  // muzzle in a wall (or in a bot): the gun is lowered, so there is nothing
  // to pull the trigger on. Silent on purpose - the dry click means "empty",
  // and this is not that
  if (muzzleBlocked()) return;
  const w = WEAPONS[currentWeapon];
  if (fireCooldown > 0) return;
  // a shot interrupts the reload, provided there is something to shoot AND
  // the trigger is a fresh pull rather than one held from before the reload
  if (reloading) {
    if (w.mag <= 0 || relTriggerHeld) return;
    cancelReload();
  }
  if (w.mag <= 0) {
    /* An empty gun does NOT reload itself (user call 2026-08-27). It used to,
       and with the trigger held that turned into a reload-shot loop the
       player could not get out of: the reload finished, the held trigger
       emptied the gun again, and it started over. Now the gun just says it
       is empty and waits for R. */
    fireCooldown = 0.25;
    if (!dryFired) {
      dryFired = true;
      AudioSys.empty();
      showDryMsg(w);
    }
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
  kickRecoil(w);
  /* A pump gun cycles after every shot - but NOT after the last one: with the
     tube empty the reload takes the forend over (startReload zeroes pumpT
     below), so the stroke was never drawn and only its sound played. Anything
     without a forend part skips this entirely. */
  if (vm.userData.pumpPart && w.mag > 0) {
    pumpT = 1;
    pumpFired = false;   // updateViewmodel sounds it when the stroke starts
  }
  /* A bolt gun cycles after every shot too - except the last: with the mag
     empty the reload takes over (startReload zeroes boltT). Under the scope
     the gun drops OUT of the scope for the cycle - quietly, the shot covers
     the foley - and comes back through the normal raise once it ends
     (zoomTarget gates on boltT). */
  if (vm.userData.boltPart && w.mag > 0) {
    boltT = 1;
    boltFired = false;
    if (scoped) setScopeOverlay(false, true);
  }
  camera.rotation.x += w.kick;

  updateWeaponHud();
  if (w.mag === 0) {
    /* The trigger pull that fired the last round has had its answer - that
       round - so the striker does not also click on this one; the click
       belongs to the NEXT pull. dryFired carries that, and updateWeapons
       clears it when the trigger comes up. */
    dryFired = true;
    showDryMsg(w);
  }
  /* ⚠️ The shot that empties the magazine does NOT start a reload either
     (user call 2026-08-27) - this is where the reload-shot loop was born.
     With the trigger held, the gun reloaded itself the instant it ran dry,
     came back up, emptied itself again and started over, and the player never
     got a say. Reloading is R now, full stop; the empty gun answers with a
     dry click (see the w.mag <= 0 branch above). */
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
  // letting go of the trigger re-arms both: the next pull may cancel a reload
  // and may click on an empty chamber again
  if (!firing) { relTriggerHeld = false; dryFired = false; }
  if (firing && (w.auto || fireCooldown === 0)) {
    if (w.auto) tryFire();
    else { tryFire(); firing = false; } // broń półautomatyczna: jeden strzał na klik
  }
  // płynny FOV: luneta 24° / ADS 60° / sprint i bunnyhop poszerzają
  let targetFov;
  if (w.zoom && scoped) targetFov = ZOOM_FOV;
  else if (aiming && w.zoom) targetFov = BASE_FOV - 14 * zoomBlend; // raising: a longer, deeper pull to the eye
  else if (aiming) targetFov = 60;
  else targetFov = BASE_FOV + (player.sprinting ? 6 : 0) + (player.sliding ? 7 : 0)
    + (player.hopBoost - 1) * 10;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  updateViewmodel(dt);
}
