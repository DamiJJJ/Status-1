/* NEON ARENA — wave definitions & wave system
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== FALE ==================== */

const WAVE_DEFS = [
  { scout: 4 },
  { scout: 5, assault: 2 },
  { scout: 5, assault: 2, heavy: 2 },
  { scout: 5, assault: 4, heavy: 2 },
  { scout: 6, assault: 5, heavy: 3 },
];

/* fale w trybie endless: rosnąca skala bez końca */
function getWaveDef(wave) {
  if (wave <= WAVE_DEFS.length) return WAVE_DEFS[wave - 1];
  return { scout: 4 + Math.ceil(wave / 2), assault: wave - 2, heavy: wave - 4 };
}

const waveSystem = {
  wave: 0,
  pending: [],        // typy do zespawnowania w bieżącej fali
  spawnTimer: 0,
  intermission: 0,
  active: false,

  reset() {
    this.wave = 0;
    this.pending = [];
    this.active = false;
    this.intermission = 1.6;
    this.shopPending = 0;
  },

  startNextWave() {
    this.wave++;
    const def = getWaveDef(this.wave);
    this.pending = [];
    for (const [type, count] of Object.entries(def))
      for (let i = 0; i < count; i++) this.pending.push(type);
    // przemieszaj
    for (let i = this.pending.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.pending[i], this.pending[j]] = [this.pending[j], this.pending[i]];
    }
    this.spawnTimer = 0.4;
    this.active = true;
    this.hpMul = 1 + (this.wave - 1) * 0.12;
    this.accMul = 1 + (this.wave - 1) * 0.06;
    AudioSys.wave();
    showCenterMsg(`Fala ${this.wave}`, 1.8);
    updateWaveHud();
    updateEnemiesHud();
  },

  onEnemyDown() {
    if (this.active && this.pending.length === 0 && enemies.length === 0) {
      this.active = false;
      const bonus = 150 * this.wave;
      addScore(bonus);
      addCredits(15 * this.wave);
      if (this.wave >= TOTAL_WAVES && !game.endless) {
        victory();
        return;
      }
      showCenterMsg(`Fala ${this.wave} ukończona! +${bonus}`, 2.2);
      if (TEST === 'win') this.intermission = 0.4;   // testy przewijają sklep
      else this.shopPending = 1.4;                    // chwila oddechu, potem sklep
    }
  },

  update(dt) {
    if (game.state !== 'playing') return;
    if (this.shopPending > 0) {
      this.shopPending -= dt;
      if (this.shopPending <= 0) openShop();
      return;
    }
    if (!this.active) {
      this.intermission -= dt;
      if (this.intermission <= 0 && (this.wave < TOTAL_WAVES || game.endless)) this.startNextWave();
      return;
    }
    if (this.pending.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = TEST === 'win' ? 0.05 : 0.75;
        const type = this.pending.pop();
        spawnEnemy(type, this.hpMul, this.accMul);
      }
    }
  },
};
