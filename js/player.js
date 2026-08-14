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
  // SETTINGS.sens: user sensitivity from the settings screen (js/settings.js,
  // loaded later — the handler only fires under pointer lock, long after boot)
  const sens = LOOK_SENS * lookScale * SETTINGS.sens;
  camera.rotation.y -= dx * sens;
  camera.rotation.x = Math.max(-Math.PI / 2,
    Math.min(Math.PI / 2, camera.rotation.x - dy * sens));
});

/* Pointer lock z surowym ruchem (unadjustedMovement) — omija windowsowe
   "zwiększanie precyzji wskaźnika" (akcelerację), drugie źródło dziwnych
   skoków celownika. Brak wsparcia w przeglądarce → zwykły lock. */
function lockPointer() {
  // fullscreen first, same click gesture: only under fullscreen can the
  // Keyboard Lock (input.js) hand us Ctrl+W & friends instead of the browser
  // running the shortcut; optional via SETTINGS.fullscreen, skipped in TEST
  // (headless has no gesture and the refusal would pollute __test.errors)
  if (!TEST && SETTINGS.fullscreen && !document.fullscreenElement
      && document.documentElement.requestFullscreen) {
    const fp = document.documentElement.requestFullscreen();
    if (fp && fp.catch) fp.catch(() => { /* refused — the windowed shield still holds */ });
  }
  const el = document.body;
  try {
    const p = el.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => {
      // unadjustedMovement unsupported or a transient refusal — plain retry;
      // a swallowed rejection here would land in __test.errors, and a second
      // failure fires 'pointerlockerror' (handled by the overlay in input.js)
      const p2 = el.requestPointerLock();
      if (p2 && p2.catch) p2.catch(() => { /* pointerlockerror handles it */ });
    });
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
  crouching: false, // kucanie (Ctrl/C): wolniej, niżej, mniejszy rozrzut z biodra
  eyeH: PLAYER_EYE, // bieżąca wysokość oka (płynny lerp PLAYER_EYE ↔ CROUCH_EYE)
  hopBoost: 1,      // bunnyhop: mnożnik prędkości za łańcuch skoków
  sinceLand: 10,    // czas od ostatniego lądowania
  sliding: false,   // wślizg (PROP-2): kucnięcie przy prędkości sprintu
  slideT: 0,        // pozostały czas wślizgu
  slideCd: 0,       // cooldown przed kolejnym wślizgiem
  slideSpeed: 0,    // prędkość wejściowa wślizgu (wygasa w trakcie)
};

/* slide: direction is committed at entry; steering during a knee slide would
   feel like ice skates. Jumping out keeps the horizontal momentum (bhop synergy). */
const SLIDE_DUR = 0.55;
const _slideDir = new THREE.Vector3();

const keys = {};
let firing = false;
let aiming = false;   // ADS (PPM) — działa z każdą bronią; snajperka daje lunetę
let adsBlend = 0;     // płynne przejście viewmodelu do pozycji celowania

function playerTakeDamage(dmg, fromPos = null) {
  if (game.state !== 'playing' || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - dmg);
  missionHpTrack(); // campaign medal counter (no-op outside)
  damageFlash = Math.min(1, damageFlash + 0.55);
  if (fromPos) showDamageIndicator(fromPos);
  AudioSys.hurt(dmg, fromPos);
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

  // a held instructor line (radio hold, tutorial) freezes WSAD/jump —
  // camera look stays free, freezing the mouse would just feel broken
  const inputHold = radioHoldT > 0;
  let ix = 0, iz = 0;
  if (!inputHold) {
    if (keys['KeyW']) iz += 1;
    if (keys['KeyS']) iz -= 1;
    if (keys['KeyD']) ix += 1;
    if (keys['KeyA']) ix -= 1;
  }
  _wish.set(0, 0, 0).addScaledVector(_fwd, iz).addScaledVector(_right, ix);
  const hasInput = _wish.lengthSq() > 0;
  if (hasInput) _wish.normalize();
  // crouch (hold Ctrl/C): slower, lower eye, tighter hip fire; bots aim at
  // player.pos.y, so ducking behind low cover genuinely hides the player
  const wasCrouching = player.crouching;
  player.crouching = !!(keys['ControlLeft'] || keys['ControlRight'] || keys['KeyC']);
  // slide (PROP-2): crouching at sprint-level speed converts the momentum
  // into a short slide; ends on timer, key release or leaving the ground
  const horSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.crouching && !wasCrouching && player.onGround && !player.sliding
      && player.slideCd <= 0 && horSpeed > WALK_SPEED * 1.05) {
    player.sliding = true;
    player.slideT = SLIDE_DUR;
    player.slideSpeed = Math.max(horSpeed * 1.1, SPRINT_SPEED * 1.05);
    _slideDir.set(player.vel.x / horSpeed, 0, player.vel.z / horSpeed);
    AudioSys.slide();
  }
  if (player.sliding) {
    player.slideT -= dt;
    if (player.slideT <= 0 || !player.crouching || !player.onGround) {
      player.sliding = false;
      player.slideCd = 0.8; // no slide-chaining — bunnyhop is the speed tech here
    }
  }
  player.slideCd = Math.max(0, player.slideCd - dt);
  const targetEye = player.crouching ? CROUCH_EYE : PLAYER_EYE;
  player.eyeH += (targetEye - player.eyeH) * Math.min(1, dt * 10);
  // celowanie i kucanie wyłączają sprint i spowalniają ruch
  const sprintKey = (keys['ShiftLeft'] || keys['ShiftRight']) && !aiming && !player.crouching;
  player.sprinting = sprintKey && hasInput; // sprint trwa też w powietrzu (bunnyhop)
  let speed = (sprintKey ? SPRINT_SPEED : WALK_SPEED) * player.hopBoost;
  if (aiming || player.crouching) speed *= 0.55;

  // wygładzanie przyspieszenia (w powietrzu mniejsza kontrola, ale pęd zostaje)
  if (player.sliding) {
    // slide overrides steering: committed direction, speed decays over the ride
    const k = player.slideT / SLIDE_DUR; // 1 → 0
    const sp = player.slideSpeed * (0.45 + 0.55 * k);
    player.vel.x = _slideDir.x * sp;
    player.vel.z = _slideDir.z * sp;
  } else {
    const accel = player.onGround ? 14 : 5;
    player.vel.x += (_wish.x * speed - player.vel.x) * Math.min(1, accel * dt);
    player.vel.z += (_wish.z * speed - player.vel.z) * Math.min(1, accel * dt);
  }
  player.moving = hasInput;

  // grawitacja / skok; trzymanie spacji auto-skacze przy lądowaniu (autohop)
  player.vel.y -= GRAVITY * dt;
  if (keys['Space'] && !inputHold && player.onGround) {
    player.vel.y = JUMP_SPEED;
    player.onGround = false;
    AudioSys.jump();
    // bunnyhop: jumping right after landing builds up speed (stacks to +35%)
    if (player.sinceLand < 0.25 && hasInput) {
      player.hopBoost = Math.min(1.35, player.hopBoost + 0.07);
      AudioSys.bhop(player.hopBoost);
    }
  }

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;

  if (player.pos.y <= player.eyeH) {
    player.pos.y = player.eyeH;
    if (!player.onGround) {
      player.sinceLand = 0;
      // landing thud scaled by fall speed (vel.y still holds the impact velocity)
      AudioSys.land(Math.min(1, Math.max(0, (-player.vel.y - 3) / 9)));
    }
    player.vel.y = 0;
    player.onGround = true;
  } else if (player.onGround && player.vel.y <= 0) {
    // standing: the eye follows the crouch lerp directly — letting gravity
    // pull the camera down would read as a fall (and could trigger a land thud)
    player.pos.y = player.eyeH;
    player.vel.y = 0;
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
let swayStepIdx = 0;
let slideTilt = 0; // camera roll lean while sliding (eases in/out)

function updateCameraSway(dt) {
  const movingGround = player.moving && player.onGround;
  // crouched: shallower and slower bob (short careful steps)
  const walkAmp = player.crouching ? 0.0025 : 0.004;
  const targetAmp = player.sprinting ? 0.011 : (movingGround ? walkAmp : 0);
  swayAmp += (targetAmp - swayAmp) * Math.min(1, dt * 8);
  swayPhase += dt * (player.sprinting ? 11 : player.crouching ? 6 : 8) * (movingGround ? 1 : 0.4);
  // footsteps ride the head-bob cycle: one step per half period, triggered at
  // the bottom of the bob (phase = π/2 + kπ) so the audio matches the camera dip
  const stepIdx = Math.floor((swayPhase - Math.PI / 2) / Math.PI);
  if (stepIdx !== swayStepIdx) {
    swayStepIdx = stepIdx;
    // a slide is one continuous scrape, not steps
    if (movingGround && !player.sliding && game.state === 'playing') AudioSys.footstep(player.sprinting);
  }
  // roll: nadpisujemy w całości (gracz nie ma własnego przechyłu);
  // wślizg dokłada stały przechył (lean into the slide)
  slideTilt += ((player.sliding ? 0.055 : 0) - slideTilt) * Math.min(1, dt * 10);
  camera.rotation.z = Math.sin(swayPhase) * swayAmp + slideTilt;
  // pionowy bob na pitchu: nakładany różnicowo, żeby nie walczyć z myszą
  const pitchBob = Math.abs(Math.cos(swayPhase)) * swayAmp * 0.55;
  camera.rotation.x += pitchBob - swayPitchPrev;
  swayPitchPrev = pitchBob;
}
