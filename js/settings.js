/* STATUS 1 — settings screen (PROP-1) + accessibility (PROP-6)
   Mouse sensitivity, master/music volume, bloom/shadow switches and the
   drone-strobe reducer; persisted in localStorage, applied live.
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. */
'use strict';

/* ==================== USTAWIENIA ==================== */

const SETTINGS_KEY = 'status1_settings';

const SETTINGS = {
  sens: 1,       // mouse sensitivity multiplier (0.3–2)
  volMaster: 1,  // master volume 0–1 (scales the base mix gain)
  volMusic: 1,   // music volume 0–1
  bloom: true,   // postprocessing bloom (perf switch for weaker machines)
  shadows: true, // sun shadow map (perf switch)
  strobe: true,  // drone strobes; off = steady glow (flashing-light accessibility)
  fullscreen: true, // enter fullscreen with the game: the only mode in which
                    // Keyboard Lock can capture Ctrl+W/T (browser shortcuts)
};

function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (d) for (const k in SETTINGS) if (d[k] !== undefined) SETTINGS[k] = d[k];
  } catch (e) { /* file:// or private mode — defaults stay */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) { /* ignore */ }
}

/* Push the current values into the live systems. Idempotent — called on boot
   and after every change. (Mouse sensitivity and the strobe switch are read
   at their point of use: player.js mousemove and enemies.js updateEnemies.) */
function applySettings() {
  bloomPass.enabled = SETTINGS.bloom;
  sun.castShadow = SETTINGS.shadows;
  AudioSys.setVolumes(SETTINGS.volMaster, SETTINGS.volMusic);
  // fullscreen is ENTERED in lockPointer (needs a game-entry gesture);
  // turning the option off while fullscreen leaves it immediately
  if (!SETTINGS.fullscreen && document.fullscreenElement && document.exitFullscreen) {
    const p = document.exitFullscreen();
    if (p && p.catch) p.catch(() => { /* ignore */ });
  }
  __test.settings = { ...SETTINGS };
}

/* --- screen flow: the panel opens over the main menu or the pause --- */
let settingsReturn = 'menu';

function openSettings(from) {
  settingsReturn = from;
  game.state = 'settings';
  syncSettingsUi();
  showScreen('settings');
}

function closeSettings() {
  if (game.state !== 'settings') return;
  if (settingsReturn === 'pause') {
    game.state = 'paused';
    showScreen('pause');
  } else {
    backToMenu();
  }
}

function syncSettingsUi() {
  el('set-sens').value = Math.round(SETTINGS.sens * 100);
  el('set-sens-val').textContent = `${Math.round(SETTINGS.sens * 100)}%`;
  el('set-vol').value = Math.round(SETTINGS.volMaster * 100);
  el('set-vol-val').textContent = `${Math.round(SETTINGS.volMaster * 100)}%`;
  el('set-music').value = Math.round(SETTINGS.volMusic * 100);
  el('set-music-val').textContent = `${Math.round(SETTINGS.volMusic * 100)}%`;
  el('set-bloom').checked = SETTINGS.bloom;
  el('set-shadows').checked = SETTINGS.shadows;
  el('set-strobe').checked = SETTINGS.strobe;
  el('set-fullscreen').checked = SETTINGS.fullscreen;
}

/* --- wiring: sliders apply live, checkboxes on change; all saved instantly --- */
{
  const bindRange = (id, valId, key) => {
    el(id).addEventListener('input', () => {
      SETTINGS[key] = el(id).value / 100;
      el(valId).textContent = `${el(id).value}%`;
      applySettings();
      saveSettings();
    });
  };
  bindRange('set-sens', 'set-sens-val', 'sens');
  bindRange('set-vol', 'set-vol-val', 'volMaster');
  bindRange('set-music', 'set-music-val', 'volMusic');
  // audible feedback on slider release, so the new level can be judged
  // (the click/drag is a user gesture, so init() is allowed to start audio)
  for (const id of ['set-vol', 'set-music']) {
    el(id).addEventListener('change', () => { AudioSys.init(); AudioSys.buy(); });
  }
  const bindToggle = (id, key) => {
    el(id).addEventListener('change', () => {
      SETTINGS[key] = el(id).checked;
      applySettings();
      saveSettings();
    });
  };
  bindToggle('set-bloom', 'bloom');
  bindToggle('set-shadows', 'shadows');
  bindToggle('set-strobe', 'strobe');
  bindToggle('set-fullscreen', 'fullscreen');

  el('btn-menu-settings').addEventListener('click', () => openSettings('menu'));
  el('btn-settings-pause').addEventListener('click', () => openSettings('pause'));
  el('btn-settings-back').addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => {
    if (game.state === 'settings' && (e.code === 'Escape' || e.code === 'Enter')) closeSettings();
  });
}

loadSettings();
applySettings();
syncSettingsUi();
