/* NEON ARENA — synthesized SFX + procedural music (WebAudio)
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== AUDIO (syntetyczne, WebAudio) ==================== */

const AudioSys = (() => {
  let ctx = null, master = null, noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }

  function tone({ type = 'square', f0 = 440, f1 = null, dur = 0.1, vol = 0.25, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function burst({ dur = 0.15, vol = 0.35, freq = 900, q = 0.8, type = 'lowpass', delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* ---- muzyka proceduralna (sekwencer 16 kroków, planowanie z wyprzedzeniem) ---- */
  let musicTimer = null, musicStep = 0, musicNext = 0, musicGain = null;
  const MSTEP = 60 / 118 / 2; // ósemki przy 118 BPM
  // progresja w a-moll: A — C — G — F (po 4 kroki)
  const BASS_SEQ = [110, 110, 0, 110, 130.81, 130.81, 0, 130.81, 98, 98, 0, 98, 87.31, 87.31, 0, 130.81];
  const ARP_SEQ = [220, 261.63, 329.63, 440, 329.63, 261.63];

  function mTone(t, { type = 'sawtooth', f = 110, dur = 0.2, vol = 0.15, filter = 0, slide = 0 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = filter;
      o.connect(fl); node = fl;
    }
    node.connect(g).connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function mNoise(t, { dur = 0.03, vol = 0.06, freq = 6500, type = 'highpass' }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(musicGain);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function scheduleMusicStep(t, s) {
    const combat = game.state === 'playing' && waveSystem.active;
    const inten = Math.min(1, waveSystem.wave / 8); // intensywność rośnie z falą
    if (combat) {
      if (s % 4 === 0) mTone(t, { type: 'sine', f: 140, slide: 42, dur: 0.13, vol: 0.5 });          // stopa
      if (s % 8 === 4) mNoise(t, { dur: 0.09, vol: 0.13, freq: 1900, type: 'bandpass' });            // werbel
      if (s % 2 === 1) mNoise(t, { dur: 0.03, vol: 0.05 + inten * 0.05 });                           // hi-hat
      const bf = BASS_SEQ[s % 16];
      if (bf) mTone(t, { type: 'sawtooth', f: bf, dur: 0.22, vol: 0.18, filter: 380 + inten * 550 }); // bas
      if (inten > 0.25 && s % 4 === 2)
        mTone(t, { type: 'square', f: ARP_SEQ[(s / 2 | 0) % 6] * 2, dur: 0.08, vol: 0.04, filter: 2400 });
    } else {
      if (s % 4 === 0) mTone(t, { type: 'triangle', f: BASS_SEQ[s % 16] || 110, dur: MSTEP * 4, vol: 0.08, filter: 600 });
      if (s % 2 === 0) mTone(t, { type: 'triangle', f: ARP_SEQ[(s / 2 | 0) % 6], dur: 0.3, vol: 0.045, filter: 1600 });
    }
    if (s === 0) { // pad co takt: prima + kwinta
      const pv = combat ? 0.03 : 0.055;
      mTone(t, { type: 'triangle', f: 110, dur: MSTEP * 16, vol: pv, filter: 900 });
      mTone(t, { type: 'triangle', f: 164.81, dur: MSTEP * 16, vol: pv * 0.8, filter: 900 });
    }
  }

  function musicTick() {
    while (musicNext < ctx.currentTime + 0.3) {
      try { scheduleMusicStep(musicNext, musicStep); } catch (e) { /* nie zabijaj pętli muzyki */ }
      musicStep = (musicStep + 1) % 16;
      musicNext += MSTEP;
      __test.musicSteps = (__test.musicSteps || 0) + 1;
    }
  }

  function startMusic() {
    if (musicTimer || !ctx) return;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.55;
    musicGain.connect(master);
    musicNext = ctx.currentTime + 0.1;
    musicTimer = setInterval(musicTick, 120);
    __test.musicRunning = true;
  }

  return {
    init,
    startMusic,
    shot(id) {
      if (!ctx) return;
      switch (id) {
        case 'pistol':
          burst({ dur: 0.08, vol: 0.3, freq: 1400 });
          tone({ type: 'square', f0: 220, f1: 70, dur: 0.09, vol: 0.2 });
          break;
        case 'shotgun':
          burst({ dur: 0.24, vol: 0.5, freq: 650 });
          tone({ type: 'sine', f0: 110, f1: 35, dur: 0.22, vol: 0.35 });
          break;
        case 'smg':
          burst({ dur: 0.05, vol: 0.2, freq: 1800, type: 'highpass' });
          tone({ type: 'square', f0: 260, f1: 90, dur: 0.06, vol: 0.13 });
          break;
        case 'sniper':
          burst({ dur: 0.32, vol: 0.5, freq: 450 });
          tone({ type: 'sine', f0: 170, f1: 28, dur: 0.3, vol: 0.4 });
          break;
      }
    },
    enemyShot(weapon = 'pistol') {
      if (weapon === 'shotgun') {
        burst({ dur: 0.18, vol: 0.22, freq: 480 });
        tone({ type: 'sine', f0: 95, f1: 32, dur: 0.16, vol: 0.16 });
      } else if (weapon === 'auto') {
        burst({ dur: 0.04, vol: 0.09, freq: 1500, type: 'highpass' });
        tone({ type: 'sawtooth', f0: 210, f1: 90, dur: 0.05, vol: 0.06 });
      } else {
        burst({ dur: 0.07, vol: 0.12, freq: 700 });
        tone({ type: 'sawtooth', f0: 160, f1: 60, dur: 0.08, vol: 0.08 });
      }
    },
    empty()   { tone({ type: 'square', f0: 1100, f1: 900, dur: 0.04, vol: 0.12 }); },
    // sekwencja przeładowania rozłożona na czas trwania: magazynek out -> in -> zamek
    reloadSeq(dur) {
      tone({ type: 'square', f0: 520, f1: 380, dur: 0.06, vol: 0.18 });
      burst({ dur: 0.05, vol: 0.1, freq: 900, delay: 0.04 });
      tone({ type: 'square', f0: 330, f1: 240, dur: 0.08, vol: 0.16, delay: dur * 0.35 });
      tone({ type: 'square', f0: 420, f1: 640, dur: 0.07, vol: 0.18, delay: dur * 0.68 });
      tone({ type: 'square', f0: 700, f1: 980, dur: 0.05, vol: 0.2, delay: dur * 0.9 });
      burst({ dur: 0.06, vol: 0.12, freq: 1300, delay: dur * 0.9 });
    },
    hit()     { tone({ type: 'square', f0: 1500, f1: 1200, dur: 0.035, vol: 0.11 }); },
    headshot(){ tone({ type: 'square', f0: 2100, f1: 1600, dur: 0.04, vol: 0.14 }); tone({ type: 'square', f0: 2600, f1: 2100, dur: 0.05, vol: 0.1, delay: 0.035 }); },
    buy()     { tone({ type: 'square', f0: 780, dur: 0.06, vol: 0.16 }); tone({ type: 'square', f0: 1170, dur: 0.1, vol: 0.16, delay: 0.07 }); },
    kill()    { tone({ type: 'sawtooth', f0: 420, f1: 70, dur: 0.25, vol: 0.2 }); },
    hurt()    { tone({ type: 'sine', f0: 130, f1: 55, dur: 0.2, vol: 0.3 }); burst({ dur: 0.12, vol: 0.15, freq: 300 }); },
    pickup()  { tone({ type: 'square', f0: 620, dur: 0.06, vol: 0.15 }); tone({ type: 'square', f0: 930, dur: 0.09, vol: 0.15, delay: 0.06 }); },
    heal()    { tone({ type: 'sine', f0: 520, f1: 780, dur: 0.18, vol: 0.18 }); },
    wave()    { tone({ type: 'sawtooth', f0: 220, dur: 0.14, vol: 0.14 }); tone({ type: 'sawtooth', f0: 330, dur: 0.2, vol: 0.14, delay: 0.12 }); },
    win()     { [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.22, vol: 0.15, delay: i * 0.13 })); },
    lose()    { [330, 262, 196, 131].forEach((f, i) => tone({ type: 'sawtooth', f0: f, dur: 0.28, vol: 0.16, delay: i * 0.16 })); },
    switch_() { tone({ type: 'square', f0: 400, f1: 550, dur: 0.05, vol: 0.1 }); },
  };
})();
