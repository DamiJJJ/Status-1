/* NEON ARENA — campaign runtime: objectives, mission flow, save, screens
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html.

   Everything here runs at CALL time (menu clicks, tick), so it may freely
   reference el()/screens/mission data defined in other files. */
'use strict';

/* ==================== ZAPIS (localStorage) ==================== */

const SAVE_KEY = 'status1_save';

/* every read/write is wrapped: under file:// (origin null) localStorage can
   throw in private mode — a failed save must never break a mission */
function saveLoad() {
  try {
    // pre-rename fallback (the game briefly saved under 'czynnasluzba_save')
    const d = JSON.parse(localStorage.getItem(SAVE_KEY)
      || localStorage.getItem('czynnasluzba_save'));
    if (d && d.v === 1) return d;
  } catch (e) { /* corrupted / unavailable → fresh */ }
  return { v: 1, difficulty: 'normal', missions: {}, run: null, stats: { kills: 0, shots: 0, hits: 0 } };
}

function saveWrite(d) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
}

function snapshotRun(nextId) {
  const items = {};
  for (const it of SHOP_ITEMS) if (it.level > 0 && it.maxLevel !== Infinity) items[it.id] = it.level;
  return { missionId: nextId, credits: game.credits, score: game.score, items };
}

function saveRun(nextId) {
  const d = saveLoad();
  d.run = snapshotRun(nextId);
  d.difficulty = game.difficulty;
  saveWrite(d);
}

function saveMissionResult(id, res) {
  const d = saveLoad();
  const prev = d.missions[id] || {};
  d.missions[id] = {
    done: true,
    bestTime: prev.bestTime ? Math.min(prev.bestTime, res.time) : res.time,
    medals: Array.from(new Set([...(prev.medals || []), ...(res.medals || [])])),
  };
  d.stats.kills += mission.kills;
  d.stats.shots += mission.shots;
  d.stats.hits += mission.hits;
  saveWrite(d);
}

/* restore the campaign loadout (credits, upgrades, weapons) from the save;
   idempotent thanks to applyAllShopEffects() */
function applyRunFromSave() {
  const d = saveLoad();
  game.difficulty = DIFFICULTIES[d.difficulty] ? d.difficulty : 'normal';
  const r = d.run;
  if (!r) return false;
  for (const item of SHOP_ITEMS) item.level = (r.items && r.items[item.id]) || 0;
  applyAllShopEffects();
  game.credits = r.credits || 0;
  game.score = r.score || 0;
  scoreEl.textContent = game.score;
  updateCreditsHud();
  return true;
}

function isMissionDone(id) {
  const m = saveLoad().missions[id];
  return !!(m && m.done);
}

function isMissionUnlocked(id) {
  const def = MISSION_BY_ID[id];
  return !def.requires || isMissionDone(def.requires);
}

/* ==================== CELE MISJI ====================
   Runtime instance: { def, state: 'locked'|'active'|'done', t, cur, max }.
   Contract per type: start(o) · update(o, dt) · onEvent(o, ev, payload) ·
   isDone(o) · text(o). All hooks optional except isDone/text. */

const OBJECTIVE_TYPES = {
  // clear every wave of the mission script
  waves: {
    start(o) { o.max = mission.def.waves.length; },
    onEvent(o, ev, w) { if (ev === 'wave') o.cur = Math.min(o.max, w); },
    isDone(o) { return o.cur >= o.max && waveSystem.pending.length === 0 && enemies.length === 0; },
    text(o) { return `${o.def.label} — fala ${Math.min(o.max, o.cur + 1)}/${o.max}`; },
  },
  // kill N units (optionally of one type); can unfreeze the wave director
  // and script its own entrances (set-piece spawns like the first TARAN)
  eliminate: {
    start(o) {
      o.max = o.def.count;
      if (o.def.unpauseWaves) waveSystem.paused = false;
      for (const s of (o.def.spawn || [])) {
        const d = difficulty();
        for (let i = 0; i < (s.count || 1); i++) {
          spawnEnemy(s.type, {
            hpMul: (s.hpMul || 1) * d.hpMul * (waveSystem.scale.hp || 1),
            accMul: d.accMul, dmgMul: d.dmgMul, tag: s.tag || null,
          });
        }
      }
    },
    onEvent(o, ev, e) {
      if (ev === 'kill' && (!o.def.enemyType || e.typeName === o.def.enemyType)) o.cur++;
    },
    isDone(o) { return o.cur >= o.max; },
    text(o) { return `${o.def.label} ${o.cur}/${o.max}`; },
  },
  // touch each zone in order (relay run)
  reach: {
    start(o) {
      o.max = o.def.zones.length;
      for (const id of o.def.zones) {
        const z = getProp(id);
        if (z) { z.active = true; for (const m of z.meshes) m.visible = true; }
      }
    },
    update(o, dt) {
      if (o.cur >= o.max) return;
      const z = getProp(o.def.zones[o.cur]);
      if (z && distXZ(player.pos, z.pos) < z.radius) {
        o.cur++;
        AudioSys.pickup();
        markObjMarkersDirty();
      }
    },
    isDone(o) { return o.cur >= o.max; },
    text(o) { return `${o.def.label} ${o.cur}/${o.max}`; },
  },
  // momentum gates: touch ALL zones within `window` seconds of the first —
  // sprint alone won't make it; chained bunnyhop will (that's the lesson)
  gates: {
    start(o) {
      o.max = o.def.zones.length;
      o.data = { window: o.def.window * difficulty().timerMul };
      waveSystem.setPressure(true); // MISJA-1 (a paused director stays silent)
      for (const id of o.def.zones) {
        const z = getProp(id);
        if (z) { z.active = true; for (const m of z.meshes) m.visible = true; }
      }
    },
    update(o, dt) {
      if (o.cur > 0 && o.cur < o.max) {
        o.t += dt;
        if (o.t > o.data.window) {
          o.cur = 0;
          o.t = 0;
          showCenterMsg('Za wolno — bramki od nowa', 1.4, true);
          AudioSys.objWarn();
          markObjMarkersDirty();
          return;
        }
      }
      const z = getProp(o.def.zones[o.cur]);
      if (z && distXZ(player.pos, z.pos) < z.radius) {
        if (o.cur === 0) o.t = 0;
        o.cur++;
        AudioSys.pickup();
        markObjMarkersDirty();
      }
    },
    isDone(o) { return o.cur >= o.max; },
    text(o) {
      return o.cur > 0 && o.cur < o.max
        ? `${o.def.label} ${o.cur}/${o.max} — ${Math.max(0, o.data.window - o.t).toFixed(1)} s`
        : `${o.def.label} ${o.cur}/${o.max}`;
    },
  },
  // stay alive for T seconds (timers stretch on easy via timerMul)
  survive: {
    start(o) {
      o.max = Math.round(o.def.seconds * difficulty().timerMul);
      waveSystem.setPressure(true); // MISJA-1: the wait can't be camped out
    },
    update(o, dt) { o.t += dt; o.cur = Math.min(o.max, o.t); },
    isDone(o) { return o.t >= o.max; },
    text(o) { return `${o.def.label} — ${Math.ceil(Math.max(0, o.max - o.t))} s`; },
  },
  // stand within radius of each terminal until its progress fills;
  // progress PAUSES outside the radius (decay would be cheap frustration)
  hack: {
    start(o) {
      o.max = o.def.terminals.length;
      const need = o.def.seconds;
      waveSystem.setPressure(true); // MISJA-1: no camping next to the console
      for (const id of o.def.terminals) {
        const p = getProp(id);
        if (p) { p.active = true; p.hackNeed = need; }
      }
    },
    update(o, dt) {
      o.cur = 0;
      for (const id of o.def.terminals) {
        const p = getProp(id);
        if (!p) continue;
        if (!p.hacked && distXZ(player.pos, p.pos) < (o.def.radius || 2.6)) {
          p.hackT += dt;
          if (p.hackT >= p.hackNeed) {
            p.hacked = true;
            showCenterMsg('Terminal przejęty', 1.5);
            markObjMarkersDirty();
          }
        }
        if (p.hacked) o.cur++;
      }
    },
    isDone(o) { return o.cur >= o.max; },
    text(o) { return `${o.def.label} ${o.cur}/${o.max}`; },
    frac(o) {
      // aggregate: finished terminals + the current one's partial progress
      let part = 0;
      for (const id of o.def.terminals) {
        const p = getProp(id);
        if (p && !p.hacked && p.hackT > 0) part = Math.max(part, p.hackT / p.hackNeed);
      }
      return (o.cur + part) / o.max;
    },
  },
  // shoot listed props to zero HP
  destroy: {
    start(o) {
      o.max = o.def.props.length;
      for (const id of o.def.props) { const p = getProp(id); if (p) p.active = true; }
    },
    onEvent(o, ev, p) { if (ev === 'prop' && o.def.props.includes(p.id)) o.cur++; },
    isDone(o) { return o.cur >= o.max; },
    text(o) { return `${o.def.label} ${o.cur}/${o.max}`; },
  },
  // reach the zone and hold for a moment; leaving RESETS (drama intended)
  extract: {
    start(o) {
      o.max = o.def.seconds;
      const z = getProp(o.def.zone);
      if (z) { z.active = true; for (const m of z.meshes) m.visible = true; }
      showCenterMsg('Strefa wyjścia aktywna', 2.2);
    },
    update(o, dt) {
      const z = getProp(o.def.zone);
      if (!z) return;
      o.t = distXZ(player.pos, z.pos) < z.radius ? o.t + dt : 0;
      o.cur = Math.min(o.max, o.t);
    },
    isDone(o) { return o.t >= o.def.seconds; },
    text(o) {
      return o.t > 0
        ? `${o.def.label} — ${Math.max(0, o.def.seconds - o.t).toFixed(1)} s`
        : o.def.label;
    },
  },
};

/* continuous objectives show a progress bar on the HUD */
function objectiveFrac(o) {
  const T = OBJECTIVE_TYPES[o.def.type];
  if (T.frac) return T.frac(o);
  if (o.def.type === 'survive' || o.def.type === 'extract') {
    return o.max > 0 ? o.cur / o.max : 0;
  }
  return null; // discrete objectives use the counter, not the bar
}

/* ==================== RUNTIME MISJI ==================== */

const mission = {
  def: null,
  objectives: [],
  time: 0,
  active: false,
  creditsAtStart: 0,
  scoreAtStart: 0,
  kills: 0,
  minHp: 100,
  shots: 0,
  hits: 0,
  radioFired: null,

  start(def) {
    this.def = def;
    this.time = 0;
    this.active = true;
    this.completePending = false;
    this.creditsAtStart = game.credits;
    this.scoreAtStart = game.score;
    this.kills = 0;
    this.minHp = player.maxHp;
    this.shots = 0;
    this.hits = 0;
    this.radioFired = new Set();
    radioClear();
    this.objectives = def.objectives.map(d => ({ def: d, state: 'locked', t: 0, cur: 0, max: 0 }));
    waveSystem.reset({
      script: def.waves || [],
      loop: !!def.loop,
      maxAlive: def.maxAlive || Infinity,
      spawnTag: def.spawnTag || null,
      paused: !!def.startPaused,
      ramp: def.ramp || { hp: 0.12, acc: 0.06 },
      scale: def.scale || { hp: 1, acc: 1, dmg: 1 },
      onCleared: w => mission.onWaveCleared(w),
      totalWaves: (def.waves && def.waves.length && !def.loop) ? def.waves.length : Infinity,
      intermission: def.firstWaveDelay || 1.6,
    });
    game.noCombat = !!def.noCombat; // epilogue: no weapon, no crosshair
    if (game.noCombat) {
      viewmodels[currentWeapon].visible = false;
      document.getElementById('crosshair').style.display = 'none';
    } else {
      document.getElementById('crosshair').style.display = '';
    }
    // scripted opening spawns (e.g. the shielded prototype in S-08)
    for (const s of (def.spawnAtStart || [])) {
      const d = difficulty();
      for (let i = 0; i < (s.count || 1); i++) {
        spawnEnemy(s.type, {
          hpMul: (s.hpMul || 1) * d.hpMul, accMul: d.accMul, dmgMul: d.dmgMul,
          scaleMul: s.scaleMul || 1, invulnerable: !!s.invulnerable,
          isBoss: !!s.boss, tag: s.tag || null,
        });
      }
    }
    this.paradeT = 0;
    this.paradeIdx = 0;
    this.unlockReady();
    this.fireRadio('start');
  },

  update(dt) {
    if (!this.active || game.state !== 'playing') return; // shop/pause must freeze objectives
    // MISJA-4: all objectives done → the debrief waits for the radio queue to
    // drain; the clock is stopped so the wait can't cost the CHRONOMETR medal
    if (this.completePending) {
      if (!radioCur && radioQueue.length === 0) {
        this.completePending = false;
        this.active = false;
        missionComplete();
      }
      return;
    }
    this.time += dt;
    // parade stream (epilogue): passive units marching across the hall
    if (this.def.parade) {
      const pd = this.def.parade;
      this.paradeT -= dt;
      if (this.paradeT <= 0 && enemies.length < (pd.maxAlive || 10)) {
        this.paradeT = pd.interval || 2.4;
        const type = pd.types[this.paradeIdx++ % pd.types.length];
        const from = pd.from[this.paradeIdx % pd.from.length];
        spawnEnemy(type, { passive: true, at: from, marchDir: pd.dir });
      }
    }
    // timed radio triggers: on: 't<seconds>'
    if (this.def.radio) {
      for (const r of this.def.radio) {
        if (r.on[0] === 't' && !this.radioFired.has(r) && this.time >= Number(r.on.slice(1))) {
          this.radioFired.add(r);
          radioSay(r.lines, !!r.hold);
        }
      }
    }
    for (const o of this.objectives) {
      if (o.state !== 'active') continue;
      const T = OBJECTIVE_TYPES[o.def.type];
      if (T.update) T.update(o, dt);
      if (T.isDone(o)) this.finishObjective(o);
    }
    updateObjectiveHud();
    updateObjectiveMarkers();
  },

  fireRadio(key) {
    if (!this.def || !this.def.radio) return;
    for (const r of this.def.radio) {
      if (r.on === key && !this.radioFired.has(r)) {
        this.radioFired.add(r);
        radioSay(r.lines, !!r.hold);
      }
    }
  },

  onEvent(ev, payload) {
    if (!this.active) return;
    if (ev === 'kill') this.kills++;
    if (ev === 'prop') markObjMarkersDirty();
    for (const o of this.objectives) {
      if (o.state !== 'active') continue;
      const T = OBJECTIVE_TYPES[o.def.type];
      if (T.onEvent) T.onEvent(o, ev, payload);
      if (T.isDone(o)) this.finishObjective(o);
    }
  },

  onWaveCleared(w) {
    addScore(100 * w);
    this.fireRadio('w' + w);
    this.onEvent('wave', w);
    if (this.active && waveSystem.hasMoreWaves()) {
      showCenterMsg(`Fala ${w} odparta`, 1.8);
      waveSystem.intermission = TEST ? 0.6 : 2.5;
    }
  },

  finishObjective(o) {
    o.state = 'done';
    showCenterMsg(`Cel wykonany: ${o.def.label}`, 2.0);
    AudioSys.objDone();
    // MISJA-1: pressure objectives switch the drip off once they're done
    if (o.def.type === 'hack' || o.def.type === 'survive' || o.def.type === 'gates') {
      waveSystem.setPressure(false);
    }
    if (o.def.shieldDown) { // stabilizers down → the prototype loses its shield
      for (const e of enemies) if (e.isBoss) e.invulnerable = false;
      showCenterMsg('Tarcza prototypu wyłączona', 2.2, true);
    }
    this.fireRadio(o.def.id);
    this.unlockReady();
    if (this.objectives.every(x => x.state === 'done')) {
      // MISJA-4: don't end the mission mid-sentence — update() completes it
      // once the radio queue is empty (spawns stop immediately, though)
      waveSystem.paused = true;
      this.completePending = true;
    }
  },

  /* objectives with all `after` dependencies done go locked → active */
  unlockReady() {
    for (const o of this.objectives) {
      if (o.state !== 'locked') continue;
      const deps = o.def.after || [];
      const ready = deps.every(id => {
        const dep = this.objectives.find(x => x.def.id === id);
        return dep && dep.state === 'done';
      });
      if (ready) {
        o.state = 'active';
        const T = OBJECTIVE_TYPES[o.def.type];
        if (T.start) T.start(o);
        if (this.time > 0.5) {
          showCenterMsg(`Nowy cel: ${o.def.label}`, 2.0);
          AudioSys.objective();
        }
      }
    }
    markObjMarkersDirty();
  },

  fail(reason) {
    if (!this.active) return;
    this.active = false;
    this.completePending = false; // death interrupts the dialogue, success waits
    waveSystem.paused = true;
    missionFailed(reason);
  },

  /* abandoning from the pause menu (BUG-2): the attempt's earnings roll back
     exactly like on a failure, but with no fail screen — the caller decides
     where to navigate (mission list) */
  abort() {
    if (!this.active) return;
    this.active = false;
    this.completePending = false;
    waveSystem.paused = true;
    game.credits = this.creditsAtStart;
    game.score = this.scoreAtStart;
    scoreEl.textContent = game.score;
    updateCreditsHud();
    radioClear();
    clearObjectiveMarkers();
    updateObjectiveHud();
  },
};

/* the ONE event entry point — a no-op outside the campaign, so call sites in
   enemies.js / props.js stay unconditional one-liners */
function missionEvent(ev, payload) {
  if (game.mode === 'campaign' && mission.active) mission.onEvent(ev, payload);
}

/* medal counters — no-ops outside the campaign (called from weapons/player) */
function missionShot(hit) {
  if (game.mode !== 'campaign' || !mission.active) return;
  mission.shots++;
  if (hit) mission.hits++;
}

function missionHpTrack() {
  if (game.mode !== 'campaign' || !mission.active) return;
  mission.minHp = Math.min(mission.minHp, player.hp);
}

function missionAccuracy() {
  return mission.shots > 0 ? mission.hits / mission.shots : 1;
}

/* one rule per medal, authored thresholds per mission (def.medals) */
function scoreMedals(def) {
  const t = def.medals || {};
  const earned = [];
  if (t.time && mission.time <= t.time * difficulty().timerMul) earned.push('time');
  if (t.hp !== undefined && mission.minHp >= t.hp) earned.push('hp');
  if (t.acc && missionAccuracy() * 100 >= t.acc) earned.push('acc');
  return earned;
}

/* ==================== PRZEPŁYW KAMPANII ==================== */

let armoryNextId = null;   // mission the armory's "continue" leads to
let briefMissionId = null;

function openLevels() {
  game.mode = 'campaign';
  game.state = 'levels';
  applyRunFromSave();
  renderLevelSelect();
  showScreen('campaign');
}

function backToMenu() {
  game.state = 'menu';
  renderMenuMeta();
  showScreen('menu');
}

/* ---- MENU-1: main-menu helpers ---- */

/* one-line progress summary under the menu buttons */
function renderMenuMeta() {
  const d = saveLoad();
  const done = MISSIONS.filter(m => isMissionDone(m.id)).length;
  const medals = Object.values(d.missions)
    .reduce((n, m) => n + ((m.medals && m.medals.length) || 0), 0);
  const medalMax = MISSIONS.reduce((n, m) => n + Object.keys(m.medals || {}).length, 0);
  const parts = [`Kampania: ${done}/${MISSIONS.length}`];
  if (medals) parts.push(`medale ${medals}/${medalMax}`);
  if (game.best) parts.push(`rekord areny: ${game.best}`);
  el('menu-progress').textContent = parts.join(' · ');
}

/* the armory needs the campaign loadout (credits, upgrades) restored before
   it opens — entering straight from the menu skips openLevels() */
function openArmoryFromMenu() {
  game.mode = 'campaign';
  applyRunFromSave();
  openArmory(null);
}

function openStats() {
  game.state = 'stats';
  renderStats();
  showScreen('stats');
}

function renderStats() {
  const d = saveLoad();
  const done = MISSIONS.filter(m => isMissionDone(m.id)).length;
  const medals = Object.values(d.missions)
    .reduce((n, m) => n + ((m.medals && m.medals.length) || 0), 0);
  const medalMax = MISSIONS.reduce((n, m) => n + Object.keys(m.medals || {}).length, 0);
  const s = d.stats || { kills: 0, shots: 0, hits: 0 };
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const row = (k, v) => `<div class="stats-row"><span>${k}</span><b>${v}</b></div>`;
  el('stats-list').innerHTML =
    '<div class="stats-section">Kampania</div>' +
    row('Ukończone symulacje', `${done}/${MISSIONS.length}`) +
    row('Medale', `${medals}/${medalMax}`) +
    row('Poziom trudności', (DIFFICULTIES[d.difficulty] || DIFFICULTIES.normal).name) +
    row('Kampania ukończona', d.finished ? 'TAK' : 'nie') +
    '<div class="stats-section">Służba (łącznie)</div>' +
    row('Zneutralizowane drony', s.kills) +
    row('Oddane strzały', s.shots) +
    row('Celność', `${acc}%`) +
    '<div class="stats-section">Arena bez końca</div>' +
    row('Rekord', game.best || '—');
}

function openBriefing(id) {
  game.state = 'brief';
  briefMissionId = id;
  const def = MISSION_BY_ID[id];
  el('btn-brief-start').textContent = 'Wejście do symulacji';
  el('brief-title').textContent = `${def.code} — ${def.name}`;
  el('brief-meta').innerHTML =
    `CEL: <b>${def.goalText}</b> &nbsp;·&nbsp; ZAGROŻENIE: <b>${'★'.repeat(def.threat)}${'☆'.repeat(5 - def.threat)}</b>` +
    ` &nbsp;·&nbsp; NAGRODA: <b>${def.rewardCredits} kr</b>`;
  typewrite(def.brief, el('brief-body'));
  showScreen('brief');
}

function startBriefedMission() {
  if (briefMissionId) {
    startMission(briefMissionId);
  } else {
    // finale card — restore the button label and leave
    el('btn-brief-start').textContent = 'Wejście do symulacji';
    openLevels();
  }
}

function startMission(id, { freshRun = false } = {}) {
  const def = MISSION_BY_ID[id];
  if (!def) return;
  game.mode = 'campaign';
  game.missionId = id;
  AudioSys.init();
  AudioSys.startMusic();
  if (freshRun || !saveLoad().run) resetRunState();
  buildArena(def);              // world first — resetLevelState reads arena.playerSpawn
  resetLevelState();
  mission.start(def);
  saveRun(id);
  hideScreens();
  if (!TEST) {
    wantLock = true;
    lockPointer();
  } else {
    beginPlaying();
  }
}

/* "Restart misji" — keeps upgrades, rolls the attempt's earnings back
   (otherwise farming wave 1 and dying would print credits) */
function restartMission() {
  if (mission.def) {
    game.credits = mission.creditsAtStart;
    game.score = mission.scoreAtStart;
    scoreEl.textContent = game.score;
    updateCreditsHud();
  }
  if (game.missionId) startMission(game.missionId);
}

function missionComplete() {
  if (mission.def && mission.def.epilogue) { campaignFinale(); return; }
  game.state = 'debrief';
  firing = false;
  setAiming(false);
  if (document.pointerLockElement) document.exitPointerLock();
  const def = mission.def;
  const replay = isMissionDone(def.id);
  // authored completion bonus is the economy's main lever; replays pay 25%
  const bonus = Math.round(def.rewardCredits * difficulty().creditMul * (replay ? 0.25 : 1));
  addCredits(bonus);
  // medals pay +25 kr each, once per campaign
  const medals = scoreMedals(def);
  const prevMedals = (saveLoad().missions[def.id] || {}).medals || [];
  const freshMedals = medals.filter(m => !prevMedals.includes(m));
  if (freshMedals.length) addCredits(25 * freshMedals.length);
  saveMissionResult(def.id, { time: mission.time, medals });
  saveRun(nextMissionId(def.id) || def.id);
  radioClear();
  clearObjectiveMarkers();
  updateObjectiveHud();
  renderDebrief(def, bonus, medals, freshMedals);
  showScreen('debrief');
  AudioSys.win();
}

function missionFailed(reason) {
  game.state = 'mfail';
  firing = false;
  setAiming(false);
  if (document.pointerLockElement) document.exitPointerLock();
  // the attempt's earnings are forfeit — the bank (creditsAtStart) survives
  const earned = game.credits - mission.creditsAtStart;
  game.credits = mission.creditsAtStart;
  game.score = mission.scoreAtStart;
  scoreEl.textContent = game.score;
  updateCreditsHud();
  radioClear();
  clearObjectiveMarkers();
  updateObjectiveHud();
  renderMfail(reason, earned);
  showScreen('mfail');
  AudioSys.lose();
}

function debriefContinue() {
  const next = nextMissionId(mission.def && mission.def.id);
  if (next) openArmory(next);
  else openLevels();
}

/* the campaign's last screen: the epilogue's outro typed out on the briefing
   terminal (title card STATUS 1), then back to mission select */
function campaignFinale() {
  game.state = 'brief';
  firing = false;
  setAiming(false);
  if (document.pointerLockElement) document.exitPointerLock();
  const def = mission.def;
  saveMissionResult(def.id, { time: mission.time, medals: [] });
  const d = saveLoad();
  d.finished = true;
  saveWrite(d);
  radioClear();
  clearObjectiveMarkers();
  updateObjectiveHud();
  briefMissionId = null; // Enter/button → back to mission select
  el('brief-title').textContent = 'STATUS 1';
  el('brief-meta').innerHTML = '';
  el('btn-brief-start').textContent = 'Koniec zmiany';
  typewrite(def.outro, el('brief-body'));
  showScreen('brief');
  AudioSys.win();
}

function openArmory(nextId) {
  armoryNextId = nextId || null;
  game.state = 'shop';
  openShop({ armory: true, nextId: armoryNextId });
}

function armoryContinue() {
  if (armoryNextId) openBriefing(armoryNextId);
  else openLevels();
}

function newCampaign() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  resetRunState();
  renderLevelSelect();
}

function setDifficulty(id) {
  if (!DIFFICULTIES[id]) return;
  game.difficulty = id;
  const d = saveLoad();
  d.difficulty = id;
  saveWrite(d);
  renderDiffSeg();
}

/* ==================== EKRANY KAMPANII ==================== */

function renderDiffSeg() {
  for (const b of document.querySelectorAll('#diff-seg .seg-btn')) {
    b.classList.toggle('active', b.dataset.diff === game.difficulty);
  }
}

function renderLevelSelect() {
  const save = saveLoad();
  const doneCount = MISSIONS.filter(m => save.missions[m.id] && save.missions[m.id].done).length;
  const medalCount = MISSIONS.reduce(
    (a, m) => a + (((save.missions[m.id] || {}).medals) || []).length, 0);
  el('campaign-meta').innerHTML =
    `Zaliczone: <b>${doneCount}/${MISSIONS.length}</b> &nbsp;·&nbsp; ` +
    `Medale: <b>${medalCount}/${MISSIONS.length * 3}</b> &nbsp;·&nbsp; ` +
    `Kredyty: <b>${game.credits}</b>`;
  renderDiffSeg();
  const listEl = el('mission-list');
  listEl.innerHTML = MISSIONS.map(m => {
    const unlocked = isMissionUnlocked(m.id);
    const done = isMissionDone(m.id);
    const current = unlocked && !done;
    const cls = ['shop-item', 'mission-row', !unlocked && 'locked', current && 'current', done && 'done']
      .filter(Boolean).join(' ');
    const name = unlocked ? `${m.code} — ${m.name}` : `${m.code} — ???`;
    const beat = unlocked ? m.beat : 'Symulacja zablokowana. Zalicz poprzednią.';
    const best = done && save.missions[m.id].bestTime
      ? ` · najlepszy czas ${fmtTime(save.missions[m.id].bestTime)}` : '';
    const got = (save.missions[m.id] && save.missions[m.id].medals) || [];
    const dots = done || got.length
      ? ` <span class="mi-medals">${['time', 'hp', 'acc'].map(k => got.includes(k) ? '●' : '○').join('')}</span>`
      : '';
    const status = done ? '<span class="mi-done">✓ zaliczona</span>' : (unlocked ? '' : '🔒');
    const btn = unlocked
      ? `<button class="btn-buy btn-mission" data-mission="${m.id}">${done ? 'POWTÓRZ' : 'GRAJ'}</button>`
      : '';
    return `<div class="${cls}">
      <div class="si-icon si-icon--weapon">${UI_ICONS[m.icon] || UI_ICONS.wave}</div>
      <div class="si-info">
        <div class="si-name">${name} <span class="mi-status">${status}</span>${dots}</div>
        <div class="si-desc">${beat} · ${'★'.repeat(m.threat)}${best}</div>
      </div>
      ${btn}
    </div>`;
  }).join('');
  listEl.querySelectorAll('.btn-mission').forEach(b =>
    b.addEventListener('click', () => openBriefing(b.dataset.mission)));
}

function renderDebrief(def, bonus, medals = [], freshMedals = []) {
  el('debrief-title').textContent = `${def.code} — ${def.name}`;
  const fight = game.credits - mission.creditsAtStart - bonus - 25 * freshMedals.length;
  const t = def.medals || {};
  el('debrief-stats').innerHTML =
    `Czas symulacji: <b>${fmtTime(mission.time)}</b>` +
    (t.time ? ` <span class="mi-status">(cel: ${fmtTime(t.time)})</span>` : '') + `<br>` +
    `Eliminacje: <b>${mission.kills}</b> · Celność: <b>${Math.round(missionAccuracy() * 100)}%</b>` +
    ` · Najniższe HP: <b>${Math.max(0, Math.round(mission.minHp))}</b><br>` +
    `Kredyty: <b>+${fight + bonus + 25 * freshMedals.length}</b> ` +
    `<span class="mi-status">(walka ${fight} · premia ${bonus}` +
    (freshMedals.length ? ` · medale ${25 * freshMedals.length}` : '') + `)</span>`;
  el('debrief-medals').innerHTML = ['time', 'hp', 'acc'].map(k => {
    const md = MEDAL_DEFS[k];
    const got = medals.includes(k);
    const fresh = freshMedals.includes(k);
    return `<span class="medal medal--${k}${got ? ' earned' : ''}${fresh ? ' fresh' : ''}"
      title="${md.desc}">${UI_ICONS[md.icon]}<span>${md.name}</span></span>`;
  }).join('');
}

function renderMfail(reason, earned) {
  const def = mission.def;
  const active = mission.objectives.find(o => o.state === 'active');
  const objLine = active ? OBJECTIVE_TYPES[active.def.type].text(active) : '—';
  el('mfail-stats').innerHTML =
    `${def.code} — ${def.name}<br>` +
    `Ostatni cel: <b>${objLine}</b><br>` +
    `Czas: <b>${fmtTime(mission.time)}</b> · Eliminacje: <b>${mission.kills}</b><br>` +
    `<span class="mi-forfeit">Kredyty z tej próby przepadają: −${Math.max(0, earned)}</span>`;
}

function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/* ==================== TYPEWRITER (odprawa) ==================== */

let twLines = [], twEls = [], twLine = 0, twChar = 0, twTimer = null, twDone = true;

function typewrite(lines, targetEl) {
  clearInterval(twTimer);
  twLines = lines;
  twLine = 0;
  twChar = 0;
  twDone = false;
  targetEl.innerHTML = '';
  twEls = lines.map(l => {
    const div = document.createElement('div');
    div.className = 'brief-line ' + (l.cls || '');
    targetEl.appendChild(div);
    return div;
  });
  if (TEST) { skipTypewriter(); return; } // tests never wait on prose
  twTimer = setInterval(() => {
    if (twLine >= twLines.length) { clearInterval(twTimer); twDone = true; return; }
    const line = twLines[twLine].text;
    twChar++;
    twEls[twLine].textContent = line.slice(0, twChar);
    if (twChar >= line.length) { twLine++; twChar = 0; }
  }, 22);
}

function skipTypewriter() {
  clearInterval(twTimer);
  for (let i = 0; i < twLines.length; i++) twEls[i].textContent = twLines[i].text;
  twDone = true;
}

/* ==================== HUD CELU ====================
   One persistent line, top-center. ALWAYS a single objective at a time —
   an objective HUD that becomes a TODO list stops being read. Chained
   objectives scroll through the line. Per-frame writes are textContent-only
   on cached elements (never innerHTML in the loop). */

let objHudEls = null;
let objHudLast = { text: '', count: '', on: null };

function updateObjectiveHud() {
  if (!objHudEls) {
    objHudEls = {
      root: el('hud-objective'),
      text: el('obj-text'),
      count: el('obj-count'),
      bar: el('obj-bar'),
      fill: el('obj-fill'),
    };
  }
  const on = game.mode === 'campaign' && mission.active && game.state === 'playing';
  if (on !== objHudLast.on) {
    objHudLast.on = on;
    objHudEls.root.classList.toggle('on', on);
  }
  if (!on) return;
  const o = mission.objectives.find(x => x.state === 'active');
  if (!o) return;
  const T = OBJECTIVE_TYPES[o.def.type];
  const text = T.text(o);
  if (text !== objHudLast.text) {
    objHudLast.text = text;
    objHudEls.text.textContent = text;
  }
  const frac = objectiveFrac(o);
  if (frac === null) {
    objHudEls.bar.style.display = 'none';
  } else {
    objHudEls.bar.style.display = 'block';
    objHudEls.fill.style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
  }
}

/* ==================== ZNACZNIKI CELÓW (świat → ekran) ====================
   Reuses the pickup-marker projection idea, plus edge-clamped off-screen
   chevrons which pickups never had. */

const objMarkers = [];
let objMarkersDirty = false;
const _omv = new THREE.Vector3();

function markObjMarkersDirty() { objMarkersDirty = true; }

function clearObjectiveMarkers() {
  for (const m of objMarkers) m.el.remove();
  objMarkers.length = 0;
}

function rebuildObjectiveMarkers() {
  clearObjectiveMarkers();
  const cont = el('objective-markers');
  const wanted = [];
  for (const o of mission.objectives) {
    if (o.state !== 'active') continue;
    if (o.def.type === 'hack') {
      for (const id of o.def.terminals) {
        const p = getProp(id);
        if (p && !p.hacked) wanted.push({ p, icon: 'terminal' });
      }
    } else if (o.def.type === 'destroy') {
      for (const id of o.def.props) {
        const p = getProp(id);
        if (p && !p.dead) wanted.push({ p, icon: 'generator' });
      }
    } else if (o.def.type === 'extract') {
      const p = getProp(o.def.zone);
      if (p) wanted.push({ p, icon: 'extraction' });
    } else if (o.def.type === 'reach' || o.def.type === 'gates') {
      // only the CURRENT zone gets a marker — the route reveals itself
      const p = getProp(o.def.zones[Math.min(o.cur, o.def.zones.length - 1)]);
      if (p && o.cur < o.max) wanted.push({ p, icon: 'extraction' });
    }
  }
  for (const w of wanted.slice(0, 6)) { // more than ~6 markers = a christmas tree
    const div = document.createElement('div');
    div.className = 'obj-marker';
    div.innerHTML =
      `<span class="om-icon">${UI_ICONS[w.icon] || UI_ICONS.wave}</span>` +
      `<span class="om-dist"></span><span class="om-chev"></span>`;
    cont.appendChild(div);
    objMarkers.push({ p: w.p, el: div, dEl: div.querySelector('.om-dist'), lastD: -1 });
  }
}

/* ==================== RADIO (dialogi w misji) ====================
   A queue of short lines shown in a dialog box; each speaker "talks" in a
   synthetic machine language — AudioSys.voice(who) fires one blip every few
   typed characters. Frozen outside the 'playing' state. */

const RADIO_WHO = { centrala: 'CENTRALA', baker: 'baker', sys: 'SYSTEM' };
const radioQueue = [];
let radioCur = null, radioChar = 0, radioTick = 0, radioHold = 0;
/* MISJA-5: radio triggers with hold:true freeze WSAD/jump while their lines
   type (+ a short tail) — read by updatePlayer; look stays free */
let radioHoldT = 0;

function radioSay(lines, hold = false) {
  // copy when tagging — the line objects are shared mission data
  for (const l of lines) radioQueue.push(hold ? { ...l, hold: true } : l);
}

function radioClear() {
  radioQueue.length = 0;
  radioCur = null;
  radioHoldT = 0;
  const box = el('radio-box');
  if (box) box.classList.remove('on');
}

function updateRadio(dt) {
  if (game.state !== 'playing') return;
  radioHoldT = Math.max(0, radioHoldT - dt);
  const box = el('radio-box');
  if (!radioCur) {
    if (!radioQueue.length) {
      if (box.classList.contains('on')) box.classList.remove('on');
      return;
    }
    radioCur = radioQueue.shift();
    radioChar = 0;
    radioTick = 0;
    radioHold = 0;
    box.classList.add('on');
    box.dataset.who = radioCur.who;
    el('radio-who').textContent = RADIO_WHO[radioCur.who] || radioCur.who;
    el('radio-text').textContent = '';
  }
  if (radioChar < radioCur.text.length) {
    if (radioCur.hold) radioHoldT = 0.5; // movement unlocks 0.5 s after the line lands
    if (TEST) {
      radioChar = radioCur.text.length; // tests never wait on prose
    } else {
      radioTick -= dt;
      while (radioTick <= 0 && radioChar < radioCur.text.length) {
        radioChar++;
        radioTick += 0.026; // ~38 chars/s
        if (radioChar % 3 === 0) AudioSys.voice(radioCur.who);
      }
    }
    el('radio-text').textContent = radioCur.text.slice(0, radioChar);
  } else {
    radioHold += dt;
    if (radioHold >= (TEST ? 0.15 : 1.1 + radioCur.text.length * 0.028)) radioCur = null;
  }
}

function updateObjectiveMarkers() {
  if (objMarkersDirty) { objMarkersDirty = false; rebuildObjectiveMarkers(); }
  if (!objMarkers.length) return;
  const w2 = window.innerWidth / 2, h2 = window.innerHeight / 2;
  const insetX = w2 - 52, insetY = h2 - 52;
  for (const m of objMarkers) {
    _omv.set(m.p.pos.x, 1.6, m.p.pos.z);
    _omv.project(camera);
    let x = _omv.x * w2, y = -_omv.y * h2;
    // BEHIND the camera: without mirroring, the chevron points exactly the
    // wrong way — this is the line everyone gets wrong
    const behind = _omv.z > 1;
    if (behind) { x = -x; y = -y; }
    const ax = Math.max(Math.abs(x), 1e-6), ay = Math.max(Math.abs(y), 1e-6);
    const t = Math.min(insetX / ax, insetY / ay);
    // behind-camera markers are ALWAYS pushed out to the frame (t may be > 1)
    const off = behind || t < 1;
    if (off) { x *= t; y *= t; }
    m.el.classList.toggle('offscreen', off);
    if (off) m.el.style.setProperty('--ang', `${Math.atan2(y, x).toFixed(3)}rad`);
    const d = Math.round(distXZ(player.pos, m.p.pos));
    if (m.lastD !== d) { m.lastD = d; m.dEl.textContent = `${d} m`; }
    m.el.style.transform =
      `translate(${(w2 + x).toFixed(1)}px, ${(h2 + y).toFixed(1)}px) translate(-50%, -50%)`;
  }
}
