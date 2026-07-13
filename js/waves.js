/* NEON ARENA — wave definitions & the wave director
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html.

   One director serves both modes: hud.js, audio.js (music mood!), enemies.js
   and main.js all read waveSystem, so a separate campaign spawner would
   silently regress them. Mode-specific policy (what happens on a cleared
   wave, which script to follow) is injected via reset(policy). */
'use strict';

/* ==================== FALE ==================== */

const WAVE_DEFS = [
  { scout: 4 },
  { scout: 5, assault: 2 },
  { scout: 5, assault: 2, heavy: 2 },
  { scout: 5, assault: 4, heavy: 2 },
  { scout: 6, assault: 5, heavy: 3 },
];

/* endless-mode waves: ever-growing scale */
function getWaveDef(wave) {
  if (wave <= WAVE_DEFS.length) return WAVE_DEFS[wave - 1];
  return { scout: 4 + Math.ceil(wave / 2), assault: wave - 2, heavy: wave - 4 };
}

const waveSystem = {
  wave: 0,
  pending: [],        // enemy types still to spawn this wave
  spawnTimer: 0,
  intermission: 0,
  active: false,
  shopPending: 0,
  riserDone: false,
  hpMul: 1, accMul: 1, dmgMul: 1,

  /* --- policy, injected per mode via reset(policy) --- */
  script: null,           // campaign: [{type: count}, …]; null = endless formula
  loop: false,            // repeat the last script entry forever
  maxAlive: Infinity,     // cap on simultaneous bots (holds the spawn drip)
  spawnTag: null,         // restrict spawn points to a tagged subset
  paused: false,          // objectives can freeze the whole director
  ramp: { hp: 0.12, acc: 0.06 },
  scale: { hp: 1, acc: 1, dmg: 1 },
  onCleared: null,        // fn(wave); null = arena default (endlessOnCleared)
  totalWaves: TOTAL_WAVES, // for the HUD wave counter

  reset(policy = {}) {
    this.wave = 0;
    this.pending = [];
    this.active = false;
    this.intermission = 1.6;
    this.shopPending = 0;
    this.riserDone = false;
    this.spawnTimer = 0;
    this.hpMul = 1; this.accMul = 1; this.dmgMul = 1;
    this.script = null;
    this.loop = false;
    this.maxAlive = Infinity;
    this.spawnTag = null;
    this.paused = false;
    this.ramp = { hp: 0.12, acc: 0.06 };
    this.scale = { hp: 1, acc: 1, dmg: 1 };
    this.onCleared = null;
    this.totalWaves = TOTAL_WAVES;
    Object.assign(this, policy);
  },

  waveDef(wave) {
    if (this.script) return this.script[Math.min(wave, this.script.length) - 1];
    return getWaveDef(wave);
  },

  hasMoreWaves() {
    if (this.script) return this.loop || this.wave < this.script.length;
    return this.wave < TOTAL_WAVES || game.endless;
  },

  startNextWave() {
    this.wave++;
    const def = this.waveDef(this.wave);
    this.pending = [];
    for (const [type, count] of Object.entries(def))
      for (let i = 0; i < count; i++) this.pending.push(type);
    // shuffle
    for (let i = this.pending.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.pending[i], this.pending[j]] = [this.pending[j], this.pending[i]];
    }
    this.spawnTimer = 0.4;
    this.active = true;
    this.riserDone = false;
    // three composing terms: per-wave ramp × difficulty × mission scale
    const d = difficulty();
    this.hpMul = (1 + (this.wave - 1) * this.ramp.hp) * d.hpMul * this.scale.hp;
    this.accMul = (1 + (this.wave - 1) * this.ramp.acc) * d.accMul * this.scale.acc;
    this.dmgMul = d.dmgMul * this.scale.dmg;
    AudioSys.wave();
    showCenterMsg(`Fala ${this.wave}`, 1.8);
    updateWaveHud();
    updateEnemiesHud();
  },

  onEnemyDown() {
    if (this.active && this.pending.length === 0 && enemies.length === 0) {
      this.active = false;
      (this.onCleared || endlessOnCleared)(this.wave);
    }
  },

  update(dt) {
    if (game.state !== 'playing' || this.paused) return;
    if (this.shopPending > 0) {
      this.shopPending -= dt;
      if (this.shopPending <= 0) openShop();
      return;
    }
    if (!this.active) {
      this.intermission -= dt;
      // audio telegraph: rising sweep during the last moment before the wave drops
      if (!this.riserDone && this.intermission > 0 && this.intermission <= 1.5 && this.hasMoreWaves()) {
        this.riserDone = true;
        AudioSys.riser(Math.max(0.5, this.intermission));
      }
      if (this.intermission <= 0 && this.hasMoreWaves()) this.startNextWave();
      return;
    }
    if (this.pending.length > 0 && enemies.length < this.maxAlive) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = TEST === 'win' ? 0.05 : 0.75;
        const type = this.pending.pop();
        spawnEnemy(type, {
          hpMul: this.hpMul, accMul: this.accMul, dmgMul: this.dmgMul, tag: this.spawnTag,
        });
      }
    }
  },
};

/* ARENA MODE policy — the exact flow that used to be inlined in onEnemyDown */
function endlessOnCleared(wave) {
  const bonus = 150 * wave;
  addScore(bonus);
  addCredits(15 * wave);
  if (wave >= TOTAL_WAVES && !game.endless) {
    victory();
    return;
  }
  showCenterMsg(`Fala ${wave} ukończona! +${bonus}`, 2.2);
  if (TEST === 'win') waveSystem.intermission = 0.4; // tests fast-forward past the shop
  else waveSystem.shopPending = 1.4;                 // a breather, then the shop
}
