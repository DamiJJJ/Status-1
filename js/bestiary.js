'use strict';

/* STATUS 1 - BESTIARIUSZ: a viewer for the SENTINEL drone line, reachable from
   the main menu. Own scene and camera rendered by the shared composer, the same
   trick MenuBg uses: main.js retargets renderPass when game.state is
   'bestiary'. Models come straight from buildEnemyModel(), so whatever the
   drones look like in a mission is what the entry shows.
   Classic script (NOT an ES module) - see index.html for load order. */

/* SZTURM / TARAN / WAŻKA were pulled from the game on 2026-08-18 - their cards
   wait in _kosz/przeciwnicy/przeciwnicy.js next to the models. */
const BESTIARY = [
  {
    type: 'scout', name: 'PATROL', code: 'SENTINEL P-2',
    weapon: 'Pistolet służbowy 9 mm',
    role: 'Jednostka patrolowa',
    desc: 'Podstawowa liberia LSPD. Trzyma dystans, strzela pojedynczo i cofa ' +
          'się, gdy podejdziesz. Sama w sobie nie jest groźna - problem zaczyna ' +
          'się, gdy patrol melduje kontakt i ściąga resztę zmiany.',
    drop: 'Amunicja',
  },
];

const Bestiary = (() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c18);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60);

  let built = false, holder = null, t = 0, idx = 0;
  const models = new Map();   // type -> { group, rotors } (built once, reused)

  function build() {
    if (built) return;
    built = true;
    // three-point-ish rig: cool key, warm police rim, soft fill from below
    scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x090b14, 0.5));
    const key = new THREE.DirectionalLight(0xdfe8ff, 1.6);
    key.position.set(2.6, 4.2, 3.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff5470, 1.1);
    rim.position.set(-3.2, 2.2, -2.6);
    scene.add(rim);

    // pedestal: dark disc with a teal ring, so the unit is not floating in void
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 40),
      new THREE.MeshStandardMaterial({ color: 0x161b2e, roughness: 0.85 }));
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.38, 1.47, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.75 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    scene.add(ring);

    holder = new THREE.Group();
    scene.add(holder);
    frame(BESTIARY[0]);
  }

  /* Each entry can pull the camera in (a small drone would otherwise be lost
     in the frame); the default framing fits a 2,3 m chassis. */
  function frame(entry) {
    const c = entry.cam || { y: 1.45, dist: 4.4, look: 1.15 };
    camera.position.set(0, c.y, c.dist);
    camera.lookAt(0, c.look, 0);
  }

  /* Models are cached and only toggled: buildEnemyModel() allocates a handful
     of geometries per call, so rebuilding on every click would leak. */
  function show(i) {
    build();
    idx = Math.max(0, Math.min(BESTIARY.length - 1, i));
    const entry = BESTIARY[idx];
    for (const m of models.values()) m.group.visible = false;
    let m = models.get(entry.type);
    if (!m) {
      const built = buildEnemyModel(entry.type);
      built.group.position.y = ENEMY_TYPES[entry.type].fly ? 1.15 : 0;
      holder.add(built.group);
      m = { group: built.group, rotors: built.rotors };
      models.set(entry.type, m);
    }
    m.group.visible = true;
    holder.rotation.y = -0.5;
    frame(entry);
  }

  function update(dt) {
    if (!built) return;
    const aspect = window.innerWidth / window.innerHeight;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    t += dt;
    holder.rotation.y += dt * 0.32;
    const m = models.get(BESTIARY[idx].type);
    if (m) {
      if (m.rotors) for (const r of m.rotors) r.rotation.y += dt * 45;
      if (ENEMY_TYPES[BESTIARY[idx].type].fly) m.group.position.y = 1.15 + Math.sin(t * 1.4) * 0.06;
    }
    // updateEnemies is not running on menu screens, so the shared animated
    // materials (strobes, shoulder sirens) have to be driven from here
    updateBotLights(dt);
  }

  return { scene, camera, build, show, update, index: () => idx };
})();

/* ---- screen ---- */

function openBestiary() {
  game.state = 'bestiary';
  Bestiary.build();
  selectBestiary(0);
  showScreen('bestiary');
}

function selectBestiary(i) {
  Bestiary.show(i);
  const cur = Bestiary.index();
  const entry = BESTIARY[cur];
  const t = ENEMY_TYPES[entry.type];
  el('bestiary-list').innerHTML = BESTIARY.map((b, n) =>
    `<button class="btn${n === cur ? '' : ' secondary'}" data-bst="${n}">${b.name}</button>`
  ).join('');
  for (const b of el('bestiary-list').querySelectorAll('[data-bst]')) {
    b.addEventListener('click', () => selectBestiary(+b.dataset.bst));
  }
  const row = (k, v) => `<div class="stats-row"><span>${k}</span><b>${v}</b></div>`;
  el('bestiary-info').innerHTML =
    `<div class="bst-code">${entry.code}</div>` +
    `<div class="bst-name">${entry.name}</div>` +
    `<div class="bst-role">${entry.role}</div>` +
    `<div class="bst-desc">${entry.desc}</div>` +
    '<div class="stats-section">Uzbrojenie</div>' +
    `<div class="bst-weapon">${entry.weapon}</div>` +
    '<div class="stats-section">Dane taktyczne</div>' +
    row('Wytrzymałość', t.hp) +
    row('Obrażenia', t.damage) +
    row('Zasięg', `${t.range} m`) +
    row('Prędkość', `${t.speed} m/s`) +
    row('Zrzut', entry.drop) +
    row('Wartość', `${t.points} pkt · ${t.credits} kr`);
}
