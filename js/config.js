/* NEON ARENA — config, palette, URL params, __test diagnostics
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== KONFIG / PALETA ==================== */

const PALETTE = {
  sky:      0x1b1f3d,
  horizon:  0x51466e,
  fog:      0x232946,
  ground:   0x262a4d,
  wall:     0x4a5184,
  crate:    0x5c63a2,
  crateAlt: 0xc9803f,
  teal:     0x00ebc7,
  orange:   0xff8906,
  red:      0xff5470,
  purple:   0x7f5af0,
  tracer:   0xffd166,
};

const ARENA_HALF = 35;          // arena 70 × 70
const PLAYER_EYE = 1.7;
const PLAYER_RADIUS = 0.5;
const GRAVITY = 22;
const WALK_SPEED = 6.2;
const SPRINT_SPEED = 9.2;
const JUMP_SPEED = 7.5;
const TOTAL_WAVES = 5;

const params = new URLSearchParams(location.search);
const TEST = params.get('test');   // null | play | shoot | over | win | mission
const TEST_WAVE = parseInt(params.get('wave') || '0', 10); // testy: start od fali N
const TEST_MISSION = params.get('m'); // ?test=mission&m=m2 — autostart misji kampanii
const TEST_DIFF = params.get('diff'); // easy | normal | hard (kampania w testach)
// generator debug overrides (arena mode only): ?style=open|pillars|corridors&half=N&density=X
const TEST_STYLE = params.get('style');
const TEST_HALF = parseInt(params.get('half') || '0', 10);
const TEST_DENSITY = parseFloat(params.get('density') || '');

// seed areny: z URL (?seed=N — ten sam układ do podzielenia się) albo losowy
const ARENA_SEED = (() => {
  const s = parseInt(params.get('seed') || '', 10);
  return Number.isFinite(s) && s > 0 ? s : Math.floor(Math.random() * 900000) + 100000;
})();

/* ==================== TESTY / DIAGNOSTYKA ==================== */

const __test = { errors: [], state: 'boot', hp: 0, score: 0, wave: 0, enemies: 0, ammo: '' };
window.__test = __test;
window.addEventListener('error', e => __test.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => __test.errors.push('promise: ' + String(e.reason)));
{
  const origErr = console.error.bind(console);
  console.error = (...a) => { __test.errors.push(a.map(String).join(' ')); origErr(...a); };
}
const testlogEl = document.getElementById('testlog');
if (TEST) {
  testlogEl.style.display = 'block';
  setInterval(() => { testlogEl.textContent = 'TESTLOG:' + JSON.stringify(__test); }, 400);
}
