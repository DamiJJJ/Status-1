/* STATUS 1 - DEVRIG: grip editor for the first-person hands (dev only).
   Reachable with H from the shooting range (js/devmap.js -> devKey).

   The editor edits the SAME fields js/weapons.js keeps in HANDS - fist
   position, grip frame, finger curl, scale - and nothing else. That matters:
   js/hands.js does NOT orient a hand with Euler angles, it builds a frame from
   the fist CHANNEL (the knuckle line the grip runs through) plus the back of
   the hand, and then solves the arm position back from a grip anchor frozen
   on the rig's bind hand. Sliders wired
   straight into part.rotation would fight that solver and produce numbers that
   cannot be exported back into HANDS, so every control here writes a HANDS
   field and the preview is re-posed through regripArms().

   Own scene and camera rendered by the shared composer, the same trick MenuBg
   and Bestiary use: main.js retargets renderPass when game.state is 'devrig'.
   An orbit camera and a bright neutral light rig are the whole point - from
   the FPS view half of a grip sits behind the gun, and dark gloves on a dark
   arena cannot be judged by eye.
   Classic script (NOT an ES module) - see index.html for load order. */
'use strict';

const DevRig = (() => {
  const scene = new THREE.Scene();
  // mid slate on purpose: black gloves on a black backdrop is exactly the
  // problem this editor exists to solve (ACES darkens it further)
  scene.background = new THREE.Color(0x6c7699);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 40);

  let built = false;
  let holder = null;
  const previews = new Map();   // weapon id -> viewmodel group (built once)
  let cur = null;               // { group, rig } currently on the pedestal

  /* orbit state; the target rides the hand being edited, which is the only
     thing worth looking at while placing a grip */
  const orbit = { yaw: 1.05, pitch: 0.28, dist: 0.85 };
  const target = new THREE.Vector3();
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();

  function build() {
    if (built) return;
    built = true;
    // flat, bright and neutral on purpose: this is a workbench, not a mood
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a3050, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(1.4, 2.0, 1.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd2ff, 1.1);
    fill.position.set(-1.8, 0.6, 1.2);
    scene.add(fill);
    const back = new THREE.DirectionalLight(0xffffff, 0.9);
    back.position.set(0.2, 1.0, -2.2);
    scene.add(back);
    holder = new THREE.Group();
    scene.add(holder);
  }

  /* One preview per weapon, built once and toggled - buildViewmodel() and
     attachArms() both allocate, so rebuilding on every weapon click would
     leak exactly like the bestiary would. */
  function show(i) {
    build();
    const id = WEAPONS[i].id;
    for (const g of previews.values()) g.visible = false;
    let g = previews.get(id);
    if (!g) {
      g = buildViewmodel(id);
      attachHandsAndProps(g, id);   // same call the real viewmodels get
      holder.add(g);
      previews.set(id, g);
    }
    g.visible = true;
    cur = { group: g, rig: g.userData.arms };
    // frame the whole gun: a sniper needs a lot more room than a pistol
    _box.setFromObject(g);
    orbit.dist = Math.max(0.35, _box.getSize(_size).length() * 0.75);
  }

  function frameHand(pos) {
    target.set(pos[0], pos[1], pos[2]);
  }

  function update() {
    if (!built) return;
    const aspect = window.innerWidth / window.innerHeight;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    const cp = Math.cos(orbit.pitch);
    camera.position.set(
      target.x + orbit.dist * cp * Math.sin(orbit.yaw),
      target.y + orbit.dist * Math.sin(orbit.pitch),
      target.z + orbit.dist * cp * Math.cos(orbit.yaw));
    camera.lookAt(target);
  }

  return { scene, camera, build, show, update, frameHand, orbit,
           current: () => cur };
})();

/* ==================== EDITOR STATE ==================== */

let devRigWeapon = 0;
let devRigHand = 'R';
let devRigBase = null;   // pristine copy of HANDS, for "przywróć"

function devRigSpec() { return HANDS[WEAPONS[devRigWeapon].id]; }
function devRigSide() { return devRigSpec()[devRigHand.toLowerCase()]; }

function devRigClone(o) { return JSON.parse(JSON.stringify(o)); }

/* The CURL_* constants in weapons.js are SHARED between weapons (four guns
   point at the same CURL_TRIGGER object). Editing one in place would silently
   re-pose the others, so every weapon gets its own copy the first time the
   editor opens. */
function devRigIsolate() {
  for (const w of WEAPONS) {
    const s = HANDS[w.id];
    for (const k of ['l', 'r']) s[k].curl = devRigClone(s[k].curl);
  }
}

/* Push the current HANDS entry onto both the preview and the live in-game
   viewmodel, so closing the editor shows the edit without a rebuild. */
function devRigApply() {
  const spec = devRigSpec();
  const cur = DevRig.current();
  if (cur) { regripArms(cur.rig, spec); devRigSyncProp(cur.group, cur.rig); }
  const live = viewmodels[devRigWeapon];
  regripArms(live.userData.arms, spec);
  devRigSyncProp(live, live.userData.arms);
  devRigWristHud();
  devRigDumpJson();
}

/* How hard the WRIST is bent, read off the posed joint. The hand is oriented
   absolutely and the forearm is aimed independently, so whatever the two
   disagree on lands here - and past roughly 60 deg the skin pinches across
   the joint, which reads as a "twisted" hand.

   Measured as the hand bone against its own BIND rotation, in the FOREARM's
   frame - that is the joint. Comparing the grip frame with the rig's bind
   orientation in gun space instead (what this did first) only agrees while
   the forearm still sits at bind: with the pistol's left forearm swung 40 deg
   it read 17 deg for a 12 deg joint, and dragging a forearm slider from 0 to
   124 deg of real wrist bend never moved the readout off 0. The one control
   meant to FIX a twisted wrist gave no feedback at all.

   Split into swing and twist, because they are not the same joint: the twist
   about the forearm axis is the forearm rolling over (pronation, a wide and
   cheap range), while the swing is the bend the wrist itself has to make. One
   lumped number flagged a perfectly natural rolled grip as red. */
function devRigWristAngles(hand) {
  const local = hand.bones.hand.quaternion.clone()
    .multiply(hand.bones.hand.userData.bindLocal.clone().invert());
  const deg = q => 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI;
  // js/hands.js hands the twist to the forearm (rollForearm), so what is left
  // at the joint is the bend - and the pronation is reported from there
  return { swing: deg(local), twist: (hand.foreTwist || 0) * 180 / Math.PI };
}

function devRigWristHud() {
  const out = el('devrig-wrist'), outT = el('devrig-twist');
  const cur = DevRig.current();
  if (!out || !outT || !cur) return;
  const { swing, twist } = devRigWristAngles(cur.rig[devRigHand]);
  out.textContent = Math.round(swing) + '\u00b0';
  out.className = swing > 75 ? 'dr-bad' : (swing > 45 ? 'dr-warn' : '');
  // the forearm rolls a long way before anything pinches, so this one gets
  // its own, much later thresholds
  outT.textContent = Math.round(twist) + '\u00b0';
  outT.className = twist > 110 ? 'dr-bad' : (twist > 80 ? 'dr-warn' : '');
}

/* the reload prop rides in the left fist, so it follows the measured anchor */
function devRigSyncProp(g, rig) {
  const p = g.userData.magProp || g.userData.shellProp;
  if (p) attachToFist(rig.L, p);
}

/* ==================== CONTROLS ==================== */

function devRigNum(v) { return Math.round(v * 10000) / 10000; }

/* one labelled slider + number box bound to obj[key] (works for array indices
   too, which is how the vec3 fields are wired) */
function devRigSlider(host, label, obj, key, min, max, step) {
  const row = document.createElement('div');
  row.className = 'dr-row';
  const lab = document.createElement('span');
  lab.className = 'dr-lab';
  lab.textContent = label;
  const rng = document.createElement('input');
  rng.type = 'range';
  rng.min = min; rng.max = max; rng.step = step;
  rng.value = obj[key];
  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'dr-num';
  num.min = min; num.max = max; num.step = step;
  num.value = devRigNum(obj[key]);
  rng.addEventListener('input', () => {
    obj[key] = parseFloat(rng.value);
    num.value = devRigNum(obj[key]);
    devRigApply();
  });
  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (isNaN(v)) return;
    obj[key] = v;
    rng.value = v;
    devRigApply();
  });
  row.append(lab, rng, num);
  host.appendChild(row);
  return row;
}

function devRigSection(host, title) {
  const h = document.createElement('div');
  h.className = 'dr-section';
  h.textContent = title;
  host.appendChild(h);
}

function devRigVec(host, label, arr, min, max, step) {
  const axes = ['X', 'Y', 'Z'];
  for (let i = 0; i < 3; i++) devRigSlider(host, `${label} ${axes[i]}`, arr, i, min, max, step);
}


/* ==================== direction controls ====================
   A direction has TWO degrees of freedom, so three XYZ sliders are one too
   many: scaling all three does nothing, and for `palm` the whole component
   along the channel is thrown away by the re-orthogonalization, so that
   slider genuinely does nothing at all. Both were reported as "some sliders
   change nothing". These edit the real degrees of freedom instead - azimuth
   and elevation for a direction, and a single roll angle about the channel
   for the hand - so every slider always moves something and no setting can
   collapse the frame. HANDS keeps storing plain vectors. */

const DR_DEG = 180 / Math.PI;

function drUnit(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function drCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0]];
}
function drDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/* azimuth 0 = straight down the barrel (-Z), +90 = right (+X) */
function drAz(v) { return Math.atan2(v[0], -v[2]) * DR_DEG; }
function drEl(v) {
  const u = drUnit(v);
  return Math.asin(Math.max(-1, Math.min(1, u[1]))) * DR_DEG;
}
function drDir(az, el) {
  const a = az / DR_DEG, e = el / DR_DEG, c = Math.cos(e);
  return [Math.sin(a) * c, Math.sin(e), -Math.cos(a) * c];
}

/* ---- the hand frame, as the editor drives it --------------------------
   Two angles for where the hand POINTS (its own +Y, straight down the palm
   and out along the fingers) plus a roll about that same direction, which is
   the axis a real wrist turns about. Everything is rebuilt from those three
   numbers on every edit, so the pose is a pure function of the sliders.

   Two earlier attempts failed here, both reported as "the sliders do not
   behave":
   - carrying the roll along with the moved axis (a minimal rotation applied
     to `palm`) is PATH DEPENDENT: it is parallel transport on a sphere, so
     az -> el -> az came back to the same numbers with the hand rolled a few
     degrees off, and the same drag did something different every time;
   - aiming the CHANNEL with two angles puts the singularity where the grips
     actually live: the channel is the knuckle line, which runs straight down
     a pistol grip (vertical) and straight down a forend (along the barrel),
     so one pole or the other was always in the way. The finger direction is
     never vertical in a grip, which is why the poles moved here. The
     elevation stops at 85 deg so a drag cannot walk into one anyway. */
const DR_ROLL_FALLBACK = [0, 0, -1];

function drHandAxes(sd) {
  const q = handFrame(sd.channel, sd.palm);
  return { f: new THREE.Vector3(0, 1, 0).applyQuaternion(q),   // down the fingers
           z: new THREE.Vector3(0, 0, 1).applyQuaternion(q) }; // knuckle line
}

/* Reference for "roll 0": the knuckle line a BIND hand would have while
   pointing this way, so zero reads as the rig's own neutral instead of some
   arbitrary axis. */
function drRollRef(f) {
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
  if (r.lengthSq() < 1e-8) r.crossVectors(f, new THREE.Vector3(...DR_ROLL_FALLBACK));
  return r.normalize();
}

function drHandDir(sd) { return drHandAxes(sd).f.toArray(); }

function drHandRoll(sd) {
  const { f, z } = drHandAxes(sd);
  const r0 = drRollRef(f);
  return Math.atan2(new THREE.Vector3().crossVectors(r0, z).dot(f),
                    r0.dot(z)) * DR_DEG;
}

/* (azimuth, elevation, roll) -> the two vectors HANDS actually stores.
   handFrame maps local X onto -palm, local Y onto the fingers and local Z
   onto the channel, so with the fingers at f and the channel at z the palm
   normal is f x z and the BACK of the hand is its opposite. */
function drSetHand(sd, az, el, roll) {
  const f = new THREE.Vector3(...drDir(az, el));
  const z = drRollRef(f).applyAxisAngle(f, roll / DR_DEG);
  const x = new THREE.Vector3().crossVectors(f, z);
  sd.channel = z.toArray().map(n => +n.toFixed(4));
  sd.palm = x.negate().toArray().map(n => +n.toFixed(4));
}

/* slider bound to a derived quantity instead of a plain field */
function devRigDerived(host, label, get, set, min, max, step) {
  const row = document.createElement('div');
  row.className = 'dr-row';
  const lab = document.createElement('span');
  lab.className = 'dr-lab';
  lab.textContent = label;
  const rng = document.createElement('input');
  rng.type = 'range';
  rng.min = min; rng.max = max; rng.step = step; rng.value = get();
  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'dr-num';
  num.min = min; num.max = max; num.step = step;
  num.value = devRigNum(get());
  const push = v => { set(v); devRigApply(); };
  rng.addEventListener('input', () => {
    num.value = devRigNum(parseFloat(rng.value));
    push(parseFloat(rng.value));
  });
  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (isNaN(v)) return;
    rng.value = v;
    push(v);
  });
  row.append(lab, rng, num);
  host.appendChild(row);
}

/* two angles for a direction field on `sd` */
function devRigDirRows(host, sd, key, label) {
  devRigDerived(host, label + ' - obrót', () => drAz(sd[key]),
    v => { sd[key] = drDir(v, drEl(sd[key])).map(n => +n.toFixed(4)); },
    -180, 180, 1);
  devRigDerived(host, label + ' - wznios', () => drEl(sd[key]),
    v => { sd[key] = drDir(drAz(sd[key]), v).map(n => +n.toFixed(4)); },
    -90, 90, 1);
}

function devRigBuildControls() {
  const host = el('devrig-controls');
  host.innerHTML = '';
  const spec = devRigSpec();
  const sd = devRigSide();

  devRigSection(host, 'Pozycja pięści (przestrzeń modelu broni)');
  devRigVec(host, 'Poz.', sd.pos, -0.6, 0.6, 0.001);

  devRigSection(host, 'Dłoń / nadgarstek (kierunek palców + obrót)');
  const wr = document.createElement('div');
  wr.className = 'dr-row dr-info';
  wr.innerHTML = '<span class="dr-lab">Zgięcie nadgarstka</span>'
    + '<b id="devrig-wrist">-</b>';
  host.appendChild(wr);
  const tw = document.createElement('div');
  tw.className = 'dr-row dr-info';
  tw.innerHTML = '<span class="dr-lab">Skręt przedramienia</span>'
    + '<b id="devrig-twist">-</b>';
  host.appendChild(tw);
  // all three rebuild the whole frame, so the pose depends on the numbers and
  // not on the order they were dragged in
  devRigDerived(host, 'Dłoń - obrót', () => drAz(drHandDir(sd)),
    v => drSetHand(sd, v, drEl(drHandDir(sd)), drHandRoll(sd)), -180, 180, 1);
  devRigDerived(host, 'Dłoń - wznios', () => drEl(drHandDir(sd)),
    v => drSetHand(sd, drAz(drHandDir(sd)), v, drHandRoll(sd)), -85, 85, 1);
  devRigDerived(host, 'Obrót dłoni', () => drHandRoll(sd),
    v => drSetHand(sd, drAz(drHandDir(sd)), drEl(drHandDir(sd)), v), -180, 180, 1);

  devRigSection(host, 'Przedramię (łokieć → nadgarstek)');
  devRigDirRows(host, sd, 'fore', 'Przedr.');

  devRigSection(host, 'Ramię (bark → łokieć)');
  devRigDirRows(host, sd, 'upper', 'Ramię');

  devRigSection(host, 'Zgięcie palców (radiany)');
  const names = { f: 'Środk.+serd.', i: 'Wskaz.', t: 'Kciuk' };
  for (const c of FINGER_CHAINS) {
    for (let n = 0; n < 3; n++) {
      devRigSlider(host, `${names[c]} ${n + 1}`, sd.curl[c], n, 0, 1.8, 0.01);
    }
  }
  devRigSlider(host, 'Przywiedzenie kciuka', sd.curl, 'tAdd', -0.4, 1.4, 0.01);

  devRigSection(host, 'Skala rąk (obie dłonie)');
  devRigSlider(host, 'Skala', spec, 'scale', 0.5, 1.8, 0.01);

  // the camera looks at whatever hand is selected
  DevRig.frameHand(sd.pos);
  devRigWristHud();   // the row only exists once the controls are built
}

function devRigSelectWeapon(i) {
  devRigWeapon = Math.max(0, Math.min(WEAPONS.length - 1, i));
  DevRig.show(devRigWeapon);
  devRigApply();
  devRigBuildControls();
  devRigSyncTabs();
}

function devRigSelectHand(h) {
  devRigHand = h;
  devRigBuildControls();
  devRigSyncTabs();
}

function devRigSyncTabs() {
  el('devrig-weapons').innerHTML = WEAPONS.map((w, n) =>
    `<button class="dr-tab${n === devRigWeapon ? ' on' : ''}" data-drw="${n}">${w.name}</button>`
  ).join('');
  for (const b of el('devrig-weapons').querySelectorAll('[data-drw]')) {
    b.addEventListener('click', () => devRigSelectWeapon(+b.dataset.drw));
  }
  for (const b of el('devrig-hands').querySelectorAll('[data-drh]')) {
    b.classList.toggle('on', b.dataset.drh === devRigHand);
  }
}

/* ==================== JSON IN / OUT ==================== */

/* the whole HANDS table, rounded - paste it straight over the HANDS literal
   in js/weapons.js (the curl objects are inlined per weapon by then, which is
   what devRigIsolate() already made true at runtime) */
function devRigJson() {
  return JSON.stringify(HANDS, (k, v) =>
    (typeof v === 'number' ? devRigNum(v) : v), 2);
}

function devRigDumpJson() {
  el('devrig-json').value = devRigJson();
}

function devRigCopy() {
  const ta = el('devrig-json');
  ta.select();
  navigator.clipboard.writeText(ta.value)
    .then(() => devRigToast('Skopiowano JSON'))
    .catch(() => devRigToast('Schowek odmówił - zaznacz i skopiuj ręcznie'));
}

function devRigPaste() {
  let data;
  try {
    data = JSON.parse(el('devrig-json').value);
  } catch (e) {
    devRigToast('Błąd JSON: ' + e.message);
    return;
  }
  for (const w of WEAPONS) {
    if (data[w.id]) HANDS[w.id] = data[w.id];
  }
  devRigReposeAll();
  DevRig.show(devRigWeapon);
  devRigApply();          // re-poses the preview too
  devRigBuildControls();
  devRigToast('Wczytano JSON');
}

/* every LIVE viewmodel, not just the visible one - previews are re-posed as
   they are selected (devRigSelectWeapon ends in devRigApply) */
function devRigReposeAll() {
  for (let i = 0; i < WEAPONS.length; i++) {
    regripArms(viewmodels[i].userData.arms, HANDS[WEAPONS[i].id]);
    devRigSyncProp(viewmodels[i], viewmodels[i].userData.arms);
  }
}

function devRigReset() {
  for (const w of WEAPONS) HANDS[w.id] = devRigClone(devRigBase[w.id]);
  devRigReposeAll();
  DevRig.show(devRigWeapon);
  devRigApply();
  devRigBuildControls();
  devRigToast('Przywrócono wartości z pliku');
}

function devRigToast(msg) {
  el('devrig-msg').textContent = msg;
}

/* ==================== OPEN / CLOSE ==================== */

function openDevRig() {
  if (!game.dev) return;
  if (!devRigBase) {
    devRigIsolate();               // before the snapshot: curls are now per-weapon
    devRigBase = devRigClone(HANDS);
  }
  // set the state BEFORE releasing the mouse: the 'unlock' handler in input.js
  // pauses only when it still reads 'playing'
  game.state = 'devrig';
  firing = false;
  setAiming(false);
  if (document.pointerLockElement) document.exitPointerLock();
  DevRig.build();
  devRigSelectWeapon(devRigWeapon);
  devRigToast('');
  showScreen('devrig');
}

function closeDevRig() {
  hideScreens();
  resumeGame();   // the click/keypress that got us here counts as the gesture
}

/* orbit: drag anywhere outside the panel, wheel to dolly */
let devRigDrag = null;
document.addEventListener('pointerdown', e => {
  if (game.state !== 'devrig') return;
  if (e.target.closest('#devrig-panel')) return;
  devRigDrag = { x: e.clientX, y: e.clientY };
});
document.addEventListener('pointermove', e => {
  if (!devRigDrag) return;
  DevRig.orbit.yaw -= (e.clientX - devRigDrag.x) * 0.006;
  DevRig.orbit.pitch = Math.max(-1.4, Math.min(1.4,
    DevRig.orbit.pitch + (e.clientY - devRigDrag.y) * 0.006));
  devRigDrag.x = e.clientX;
  devRigDrag.y = e.clientY;
});
document.addEventListener('pointerup', () => { devRigDrag = null; });
document.addEventListener('wheel', e => {
  if (game.state !== 'devrig') return;
  if (e.target.closest('#devrig-panel')) return;
  DevRig.orbit.dist = Math.max(0.12, Math.min(3,
    DevRig.orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
}, { passive: true });

el('btn-devrig-close').addEventListener('click', () => closeDevRig());
el('btn-devrig-copy').addEventListener('click', () => devRigCopy());
el('btn-devrig-paste').addEventListener('click', () => devRigPaste());
el('btn-devrig-reset').addEventListener('click', () => devRigReset());
for (const b of el('devrig-hands').querySelectorAll('[data-drh]')) {
  b.addEventListener('click', () => devRigSelectHand(b.dataset.drh));
}
