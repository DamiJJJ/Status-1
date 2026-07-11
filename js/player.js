/* NEON ARENA — controls, movement, bunnyhop, player damage, camera sway
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== GRACZ ==================== */

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 0; // obrót robimy własnym handlerem (filtr skoków myszy poniżej)

/* --- obrót kamery z filtrem "uciekającej" myszy ---
   Pointer lock (zwłaszcza Chrome/Windows) potrafi zgłosić pojedynczy mousemove
   z absurdalną deltą (setki/tysiące px) — u PointerLockControls kamera wtedy
   nagle "odlatuje". Trzy zabezpieczenia:
   (1) krótka cisza tuż po przechwyceniu myszy (pierwsze eventy bywają śmieciowe),
   (2) odrzucenie izolowanego skoku wielokrotnie większego od poprzedniego ruchu,
   (3) twardy limit delty na pojedynczy event. */
const LOOK_SENS = 0.002;
const LOOK_MAX_DELTA = 260;   // px/event — powyżej to na pewno glitch, nie ręka
let lookScale = 1;            // czułość: ADS 0.7, luneta 0.35 (ustawia setAiming)
let lookPrevMag = 0;
let lookIgnoreUntil = 0;
document.addEventListener('pointerlockchange', () => {
  lookPrevMag = 0;
  lookIgnoreUntil = performance.now() + 80;
});
document.addEventListener('mousemove', (e) => {
  if (!controls.isLocked) return;
  if (performance.now() < lookIgnoreUntil) return;
  let dx = e.movementX || 0, dy = e.movementY || 0;
  const mag = Math.abs(dx) + Math.abs(dy);
  // izolowany skok: duży i wielokrotnie większy od poprzedniego eventu — bug,
  // nie ruch ręki (prawdziwy flick rozpędza się stopniowo, event po evencie)
  const spike = mag > 90 && mag > 8 * Math.max(lookPrevMag, 6);
  lookPrevMag = mag;
  if (spike) return;
  dx = Math.max(-LOOK_MAX_DELTA, Math.min(LOOK_MAX_DELTA, dx));
  dy = Math.max(-LOOK_MAX_DELTA, Math.min(LOOK_MAX_DELTA, dy));
  camera.rotation.y -= dx * LOOK_SENS * lookScale;
  camera.rotation.x = Math.max(-Math.PI / 2,
    Math.min(Math.PI / 2, camera.rotation.x - dy * LOOK_SENS * lookScale));
});

/* Pointer lock z surowym ruchem (unadjustedMovement) — omija windowsowe
   "zwiększanie precyzji wskaźnika" (akcelerację), drugie źródło dziwnych
   skoków celownika. Brak wsparcia w przeglądarce → zwykły lock. */
function lockPointer() {
  const el = document.body;
  try {
    const p = el.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => el.requestPointerLock());
  } catch (err) {
    el.requestPointerLock();
  }
}

const player = {
  pos: camera.position,
  vel: new THREE.Vector3(),
  hp: 100, maxHp: 100,
  onGround: true,
  moving: false,
  sprinting: false,
  hopBoost: 1,      // bunnyhop: mnożnik prędkości za łańcuch skoków
  sinceLand: 10,    // czas od ostatniego lądowania
};

const keys = {};
let firing = false;
let aiming = false;   // ADS (PPM) — działa z każdą bronią; snajperka daje lunetę
let adsBlend = 0;     // płynne przejście viewmodelu do pozycji celowania

function playerTakeDamage(dmg, fromPos = null) {
  if (game.state !== 'playing' || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - dmg);
  damageFlash = Math.min(1, damageFlash + 0.55);
  if (fromPos) showDamageIndicator(fromPos);
  AudioSys.hurt();
  updateHpHud();
  if (player.hp <= 0) gameOver();
}

/* --- wskaźniki kierunku obrażeń (łuk przy krawędzi ekranu) --- */
const dmgInds = [];
{
  const cont = document.getElementById('dmg-indicators');
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div');
    d.className = 'dmg-ind';
    d.innerHTML = '<div class="arc"></div>';
    cont.appendChild(d);
    dmgInds.push({ el: d, life: 0, yaw: 0 });
  }
}
let dmgIndIdx = 0;
const DMG_IND_LIFE = 1.2;

function showDamageIndicator(fromPos) {
  const d = dmgInds[dmgIndIdx];
  dmgIndIdx = (dmgIndIdx + 1) % dmgInds.length;
  d.yaw = Math.atan2(fromPos.x - player.pos.x, fromPos.z - player.pos.z);
  d.life = DMG_IND_LIFE;
}

const _indFwd = new THREE.Vector3();
function updateDamageIndicators(dt) {
  let camYaw = null;
  for (const d of dmgInds) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) { d.el.style.opacity = 0; continue; }
    if (camYaw === null) {
      camera.getWorldDirection(_indFwd);
      camYaw = Math.atan2(_indFwd.x, _indFwd.z);
    }
    // obraca się razem z kamerą: 0° = atak z przodu (łuk u góry ekranu)
    const deg = -(d.yaw - camYaw) * 180 / Math.PI;
    d.el.style.transform = `rotate(${deg}deg)`;
    d.el.style.opacity = Math.min(1, d.life / 0.5);
  }
}

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function updatePlayer(dt) {
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
  _fwd.normalize();
  _right.crossVectors(_fwd, UP);

  let ix = 0, iz = 0;
  if (keys['KeyW']) iz += 1;
  if (keys['KeyS']) iz -= 1;
  if (keys['KeyD']) ix += 1;
  if (keys['KeyA']) ix -= 1;
  _wish.set(0, 0, 0).addScaledVector(_fwd, iz).addScaledVector(_right, ix);
  const hasInput = _wish.lengthSq() > 0;
  if (hasInput) _wish.normalize();
  // celowanie wyłącza sprint i spowalnia ruch
  const sprintKey = (keys['ShiftLeft'] || keys['ShiftRight']) && !aiming;
  player.sprinting = sprintKey && hasInput; // sprint trwa też w powietrzu (bunnyhop)
  let speed = (sprintKey ? SPRINT_SPEED : WALK_SPEED) * player.hopBoost;
  if (aiming) speed *= 0.55;

  // wygładzanie przyspieszenia (w powietrzu mniejsza kontrola, ale pęd zostaje)
  const accel = player.onGround ? 14 : 5;
  player.vel.x += (_wish.x * speed - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (_wish.z * speed - player.vel.z) * Math.min(1, accel * dt);
  player.moving = hasInput;

  // grawitacja / skok; trzymanie spacji auto-skacze przy lądowaniu (autohop)
  player.vel.y -= GRAVITY * dt;
  if (keys['Space'] && player.onGround) {
    player.vel.y = JUMP_SPEED;
    player.onGround = false;
    // bunnyhop: skok tuż po lądowaniu podbija prędkość (kumulacja do +35%)
    if (player.sinceLand < 0.25 && hasInput) {
      player.hopBoost = Math.min(1.35, player.hopBoost + 0.07);
    }
  }

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;

  if (player.pos.y <= PLAYER_EYE) {
    player.pos.y = PLAYER_EYE;
    player.vel.y = 0;
    if (!player.onGround) player.sinceLand = 0;
    player.onGround = true;
  }
  if (player.onGround) {
    player.sinceLand += dt;
    // boost wygasa dopiero, gdy gracz zostaje na ziemi dłużej niż okno bhopa
    if (player.sinceLand > 0.25) {
      player.hopBoost += (1 - player.hopBoost) * Math.min(1, dt * 6);
    }
  }
  resolveCollisions(player.pos, PLAYER_RADIUS);
  updateCameraSway(dt);
}

/* --- kołysanie kamery przy ruchu (mocniejsze w sprincie) --- */
let swayPhase = 0;
let swayAmp = 0;
let swayPitchPrev = 0;

function updateCameraSway(dt) {
  const movingGround = player.moving && player.onGround;
  const targetAmp = player.sprinting ? 0.011 : (movingGround ? 0.004 : 0);
  swayAmp += (targetAmp - swayAmp) * Math.min(1, dt * 8);
  swayPhase += dt * (player.sprinting ? 11 : 8) * (movingGround ? 1 : 0.4);
  // roll: nadpisujemy w całości (gracz nie ma własnego przechyłu)
  camera.rotation.z = Math.sin(swayPhase) * swayAmp;
  // pionowy bob na pitchu: nakładany różnicowo, żeby nie walczyć z myszą
  const pitchBob = Math.abs(Math.cos(swayPhase)) * swayAmp * 0.55;
  camera.rotation.x += pitchBob - swayPitchPrev;
  swayPitchPrev = pitchBob;
}
