/* NEON ARENA — synthesized SFX + procedural music (WebAudio)
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== AUDIO (fully synthetic, WebAudio) ==================== */

const AudioSys = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let sfxBus = null, duckFilter = null, compressor = null;
  let reverb = null, reverbGain = null;

  const BREATH_SFX = true; // subtle sprint breathing; flip to false to disable

  /* Procedural impulse response: decaying stereo noise whose tail gets darker
     over time — gives the arena an "indoor hall" echo without audio files. */
  function makeImpulse(dur, decay) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        // one-pole lowpass whose coefficient falls over time (darkening tail)
        const a = 0.55 - 0.45 * k;
        lp += ((Math.random() * 2 - 1) - lp) * a;
        d[i] = lp * Math.pow(1 - k, decay) * 1.4;
      }
    }
    return buf;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // chain: voices -> sfxBus / musicGain -> master -> duckFilter -> compressor -> out
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.2;
      compressor.connect(ctx.destination);
      // full-mix lowpass, normally wide open; heavy player damage "ducks" it
      duckFilter = ctx.createBiquadFilter();
      duckFilter.type = 'lowpass';
      duckFilter.frequency.value = 18000;
      duckFilter.Q.value = 0.5;
      duckFilter.connect(compressor);
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(duckFilter);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // shared reverb bus fed by per-voice sends
      reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(1.3, 2.6);
      reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.5;
      reverb.connect(reverbGain).connect(master);
    } catch (e) { ctx = null; }
  }

  /* --- world-space positioning: stereo pan + distance fade + distance muffle --- */
  const _sFwd = new THREE.Vector3();
  function spatial(pos) {
    camera.getWorldDirection(_sFwd);
    const camYaw = Math.atan2(_sFwd.x, _sFwd.z);
    const dx = pos.x - camera.position.x, dz = pos.z - camera.position.z;
    const dist = Math.hypot(dx, dz);
    let rel = Math.atan2(dx, dz) - camYaw;
    if (rel > Math.PI) rel -= 2 * Math.PI;
    if (rel < -Math.PI) rel += 2 * Math.PI;
    return {
      pan: Math.sin(rel) * 0.85,
      vol: 1 / (1 + dist * 0.05),
      cut: 18000 / (1 + dist * 0.08),
    };
  }

  /* Route an enveloped voice into the mix: optional world position (pan +
     distance fade + muffle) or plain pan, and a per-voice reverb send.
     Returns the distance volume multiplier to apply to the envelope. */
  function routeOut(g, { pos = null, pan = 0, send = 0 }) {
    let node = g, vmul = 1;
    if (pos) {
      const s = spatial(pos);
      vmul = s.vol;
      pan = s.pan;
      if (s.cut < 14000) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = s.cut;
        node.connect(f); node = f;
      }
    }
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p); node = p;
    }
    node.connect(sfxBus);
    if (send > 0) {
      const sg = ctx.createGain();
      sg.gain.value = send * vmul;
      g.connect(sg).connect(reverb);
    }
    return vmul;
  }

  function tone({ type = 'square', f0 = 440, f1 = null, dur = 0.1, vol = 0.25, delay = 0,
                  filter = 0, jitter = 0, pos = null, pan = 0, send = 0 }) {
    if (!ctx) return;
    __test.sfxPlayed = (__test.sfxPlayed || 0) + 1;
    const t0 = ctx.currentTime + delay;
    if (jitter) { // per-shot micro pitch variation so repeats don't sound stamped
      const j = 1 + (Math.random() * 2 - 1) * jitter;
      f0 *= j; if (f1 !== null) f1 *= j;
    }
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    const g = ctx.createGain();
    let head = osc;
    if (filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = filter;
      osc.connect(fl); head = fl;
    }
    head.connect(g);
    const v = vol * routeOut(g, { pos, pan, send });
    g.gain.setValueAtTime(Math.max(0.001, v), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function burst({ dur = 0.15, vol = 0.35, freq = 900, q = 0.8, type = 'lowpass', delay = 0,
                   jitter = 0, pos = null, pan = 0, send = 0 }) {
    if (!ctx) return;
    __test.sfxPlayed = (__test.sfxPlayed || 0) + 1;
    const t0 = ctx.currentTime + delay;
    if (jitter) freq *= 1 + (Math.random() * 2 - 1) * jitter;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = dur > 0.45; // noise buffer is 0.5 s — loop it for long tails
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g);
    const v = vol * routeOut(g, { pos, pan, send });
    g.gain.setValueAtTime(Math.max(0.001, v), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* FM bell "ping" — inharmonic modulator ratio gives it a metallic ring */
  function ping({ f = 1900, dur = 0.16, vol = 0.1, delay = 0, pan = 0, send = 0.35 }) {
    if (!ctx) return;
    __test.sfxPlayed = (__test.sfxPlayed || 0) + 1;
    const t0 = ctx.currentTime + delay;
    const car = ctx.createOscillator();
    car.type = 'sine'; car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine'; mod.frequency.value = f * 2.76;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.4, t0);
    mg.gain.exponentialRampToValueAtTime(1, t0 + dur);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    car.connect(g);
    const v = vol * routeOut(g, { pan, send });
    g.gain.setValueAtTime(Math.max(0.001, v), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    car.start(t0); mod.start(t0);
    car.stop(t0 + dur + 0.02); mod.stop(t0 + dur + 0.02);
  }

  /* Enemy fire concurrency cap: with a dozen bots shooting at once the mix
     turns to mud — attenuate when busy, skip entirely when saturated. */
  let enemyVoices = 0;
  function claimEnemyVoice() {
    if (enemyVoices >= 10) return 0;
    enemyVoices++;
    setTimeout(() => { enemyVoices--; }, 320);
    return enemyVoices > 6 ? 0.5 : 1;
  }

  /* Brief full-mix muffle ("ears ringing") after taking damage. */
  function duckMix(amount, hold) {
    const t0 = ctx.currentTime;
    const fr = duckFilter.frequency;
    fr.cancelScheduledValues(t0);
    fr.setValueAtTime(Math.max(300, fr.value), t0);
    fr.exponentialRampToValueAtTime(350 + (1 - amount) * 2200, t0 + 0.03);
    fr.exponentialRampToValueAtTime(18000, t0 + hold);
  }

  /* --- stateful player-feedback loops (heartbeat / breathing), fed each tick --- */
  let heartT = 0, breathT = 0, sprintTime = 0, breathRecover = 0;
  let stepSide = 1;

  function update(dt) {
    if (!ctx) return;
    const playing = game.state === 'playing';
    // low-HP heartbeat: quiet "lub-dub", faster the closer to death
    if (playing && player.hp > 0 && player.hp < 25) {
      heartT -= dt;
      if (heartT <= 0) {
        heartT = 0.5 + 0.5 * (player.hp / 25);
        tone({ type: 'sine', f0: 68, f1: 40, dur: 0.1, vol: 0.2 });
        tone({ type: 'sine', f0: 56, f1: 36, dur: 0.09, vol: 0.14, delay: 0.16 });
      }
    } else heartT = 0;
    // sprint breathing: kicks in after a long sprint, winds down afterwards
    if (BREATH_SFX && playing) {
      if (player.sprinting && player.moving) {
        sprintTime = Math.min(20, sprintTime + dt);
      } else {
        if (sprintTime > 3) breathRecover = Math.min(3, sprintTime * 0.35);
        sprintTime = 0;
      }
      if (sprintTime > 2.5 || breathRecover > 0) {
        if (breathRecover > 0) breathRecover -= dt;
        breathT -= dt;
        if (breathT <= 0) {
          breathT = sprintTime > 2.5 ? 1.1 : 0.85;
          burst({ dur: 0.24, vol: sprintTime > 2.5 ? 0.045 : 0.06, freq: 800, q: 0.6, type: 'bandpass', jitter: 0.15 });
        }
      }
    } else { sprintTime = 0; breathRecover = 0; }
  }

  /* Reset transient audio state on game restart (called from resetGameState). */
  function resetFx() {
    heartT = 0; breathT = 0; sprintTime = 0; breathRecover = 0;
    if (ctx && duckFilter) {
      const t0 = ctx.currentTime;
      duckFilter.frequency.cancelScheduledValues(t0);
      duckFilter.frequency.setValueAtTime(18000, t0);
    }
  }

  /* ---- procedural music (16-step sequencer, lookahead scheduling) ---- */
  let musicTimer = null, musicStep = 0, musicNext = 0, musicGain = null, musicDuck = null;
  let musicBar = 0, moodBlend = 0;
  const MSTEP = 60 / 118 / 2; // eighth notes at 118 BPM
  // A-minor progressions, one chord per 4 steps. A: Am—C—G—F, B: Am—F—C—G
  const BASS_A = [110, 110, 0, 110, 130.81, 130.81, 0, 130.81, 98, 98, 0, 98, 87.31, 87.31, 0, 130.81];
  const BASS_B = [110, 110, 0, 220, 87.31, 87.31, 0, 87.31, 130.81, 130.81, 0, 130.81, 98, 98, 0, 196];
  const ARP_SEQ = [220, 261.63, 329.63, 440, 329.63, 261.63];

  function mTone(t, { type = 'sawtooth', f = 110, dur = 0.2, vol = 0.15, filter = 0, slide = 0, spread = 0, duck = false }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(spread ? vol * 0.62 : vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let dest = g;
    if (filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = filter;
      fl.connect(g); dest = fl;
    }
    const mk = (det) => { // spread = two detuned oscillators (fat synthwave pad)
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      if (det) o.detune.value = det;
      o.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
    };
    mk(spread ? -spread : 0);
    if (spread) mk(spread);
    g.connect(duck ? musicDuck : musicGain);
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

  /* Simple FM bell for arps — much rounder than a raw square. */
  function mBell(t, f, dur, vol) {
    const car = ctx.createOscillator();
    car.type = 'sine'; car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine'; mod.frequency.value = f * 3.01;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g).connect(musicDuck);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }

  /* Sidechain pump: bass/pads/bells duck for a beat under every kick. */
  function duckMusicAt(t) {
    const g = musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.42, t);
    g.linearRampToValueAtTime(1, t + MSTEP * 1.8);
  }

  function scheduleMusicStep(t, s) {
    // gate/objective missions fight without an active "wave" — live enemies
    // must count as combat too, or the music goes calm mid-firefight
    const combat = game.state === 'playing' &&
      (waveSystem.active || enemies.some(e => !e.passive));
    // crossfade combat<->calm layers over roughly a bar instead of a hard cut
    moodBlend += ((combat ? 1 : 0) - moodBlend) * 0.14;
    const cb = moodBlend, calm = 1 - moodBlend;
    // intensity: wave number + live enemy pressure (real combat density)
    const inten = Math.min(1, waveSystem.wave / 10 + enemies.length / 14);
    const bass = (musicBar >> 2) % 2 ? BASS_B : BASS_A; // section A/B, 4 bars each
    const fill = musicBar % 4 === 3 && s >= 12;          // snare roll into next section

    if (cb > 0.05) {
      if (s % 4 === 0) {
        mTone(t, { type: 'sine', f: 140, slide: 42, dur: 0.13, vol: 0.5 * cb });          // kick
        mNoise(t, { dur: 0.016, vol: 0.05 * cb, freq: 4200, type: 'highpass' });          // kick click
        duckMusicAt(t);
      }
      if (s % 8 === 4) mNoise(t, { dur: 0.09, vol: 0.13 * cb, freq: 1900, type: 'bandpass' }); // snare
      if (s % 2 === 1) mNoise(t, { dur: 0.03, vol: (0.05 + inten * 0.05) * cb });               // hi-hat
      if (fill) mNoise(t, { dur: 0.05, vol: (0.05 + 0.02 * (s - 12)) * cb, freq: 1700, type: 'bandpass' });
      const bf = bass[s % 16];
      if (bf) mTone(t, { type: 'sawtooth', f: bf, dur: 0.22, vol: 0.18 * cb, filter: 380 + inten * 550, duck: true });
      if (inten > 0.2 && s % 4 === 2)
        mBell(t, ARP_SEQ[(s / 2 | 0) % 6] * 2, 0.22, 0.05 * cb);
    }
    if (calm > 0.05) {
      if (s % 4 === 0) mTone(t, { type: 'triangle', f: bass[s % 16] || 110, dur: MSTEP * 4, vol: 0.08 * calm, filter: 600, duck: true });
      if (s % 2 === 0) mBell(t, ARP_SEQ[(s / 2 | 0) % 6] * 2, 0.34, 0.045 * calm);
    }
    if (s === 0) { // pad each bar: detuned saws on root + fifth
      const pv = 0.026 * cb + 0.05 * calm;
      mTone(t, { type: 'sawtooth', f: 110, dur: MSTEP * 16, vol: pv, filter: 750, spread: 7, duck: true });
      mTone(t, { type: 'sawtooth', f: 164.81, dur: MSTEP * 16, vol: pv * 0.8, filter: 750, spread: 7, duck: true });
    }
    // low-HP tension: quiet high shimmer layered on top of everything
    if (game.state === 'playing' && player.hp > 0 && player.hp < 25 && s % 2 === 0)
      mTone(t, { type: 'triangle', f: 880, dur: 0.09, vol: 0.02, filter: 3200 });
  }

  function musicTick() {
    while (musicNext < ctx.currentTime + 0.3) {
      try { scheduleMusicStep(musicNext, musicStep); }
      catch (e) { // keep the loop alive, but surface the first error to diagnostics
        if (!__test.musicError) { __test.musicError = String(e); __test.errors.push('music: ' + e); }
      }
      musicStep = (musicStep + 1) % 16;
      if (musicStep === 0) musicBar++; // advance AFTER a bar is fully scheduled
      musicNext += MSTEP;
      __test.musicSteps = (__test.musicSteps || 0) + 1;
    }
  }

  function startMusic() {
    if (musicTimer || !ctx) return;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.55;
    musicGain.connect(master);
    musicDuck = ctx.createGain(); // sidechained sub-bus (bass/pads/bells)
    musicDuck.connect(musicGain);
    musicNext = ctx.currentTime + 0.1;
    musicTimer = setInterval(musicTick, 120);
    __test.musicRunning = true;
  }

  return {
    init,
    startMusic,
    update,
    resetFx,

    /* --- weapons --- */
    shot(id) {
      if (!ctx) return;
      switch (id) {
        case 'pistol':
          burst({ dur: 0.012, vol: 0.2, freq: 3200, type: 'highpass' });                     // action snap
          burst({ dur: 0.08, vol: 0.3, freq: 1400, jitter: 0.1, send: 0.3 });                // body
          tone({ type: 'square', f0: 220, f1: 70, dur: 0.09, vol: 0.2, jitter: 0.05 });
          burst({ dur: 0.16, vol: 0.09, freq: 750, jitter: 0.1, send: 0.9, delay: 0.012 });  // tail
          break;
        case 'shotgun':
          burst({ dur: 0.014, vol: 0.24, freq: 2600, type: 'highpass' });
          burst({ dur: 0.24, vol: 0.5, freq: 650, jitter: 0.08, send: 0.35 });
          tone({ type: 'sine', f0: 110, f1: 35, dur: 0.22, vol: 0.35, jitter: 0.04 });
          burst({ dur: 0.5, vol: 0.14, freq: 430, jitter: 0.1, send: 1.0, delay: 0.02 });
          break;
        case 'smg':
          burst({ dur: 0.01, vol: 0.14, freq: 3600, type: 'highpass' });
          burst({ dur: 0.05, vol: 0.2, freq: 1800, type: 'highpass', jitter: 0.12, send: 0.2 });
          tone({ type: 'square', f0: 260, f1: 90, dur: 0.06, vol: 0.13, jitter: 0.07 });
          break;
        case 'sniper':
          burst({ dur: 0.014, vol: 0.28, freq: 2400, type: 'highpass' });
          burst({ dur: 0.32, vol: 0.5, freq: 450, jitter: 0.06, send: 0.5 });
          tone({ type: 'sine', f0: 170, f1: 28, dur: 0.3, vol: 0.4, jitter: 0.03 });
          tone({ type: 'sine', f0: 55, f1: 30, dur: 0.35, vol: 0.22 });                      // sub thump
          burst({ dur: 0.7, vol: 0.16, freq: 500, jitter: 0.08, send: 1.2, delay: 0.03 });
          break;
      }
    },
    enemyShot(weapon = 'pistol', pos = null) {
      if (!ctx) return;
      const vm = claimEnemyVoice();
      if (!vm) return;
      if (weapon === 'shotgun') {
        burst({ dur: 0.18, vol: 0.22 * vm, freq: 480, jitter: 0.08, pos, send: 0.3 });
        tone({ type: 'sine', f0: 95, f1: 32, dur: 0.16, vol: 0.16 * vm, jitter: 0.05, pos });
      } else if (weapon === 'auto') {
        burst({ dur: 0.04, vol: 0.09 * vm, freq: 1500, type: 'highpass', jitter: 0.12, pos, send: 0.2 });
        tone({ type: 'sawtooth', f0: 210, f1: 90, dur: 0.05, vol: 0.06 * vm, jitter: 0.08, pos });
      } else {
        burst({ dur: 0.07, vol: 0.12 * vm, freq: 700, jitter: 0.1, pos, send: 0.25 });
        tone({ type: 'sawtooth', f0: 160, f1: 60, dur: 0.08, vol: 0.08 * vm, jitter: 0.06, pos });
      }
    },
    empty() { tone({ type: 'square', f0: 1100, f1: 900, dur: 0.04, vol: 0.12 }); },
    // reload spread over its duration: cloth + mag out -> mag in -> bolt
    reloadSeq(dur) {
      burst({ dur: 0.07, vol: 0.09, freq: 750, q: 1.1, type: 'bandpass' });
      tone({ type: 'square', f0: 520, f1: 380, dur: 0.06, vol: 0.18 });
      burst({ dur: 0.05, vol: 0.1, freq: 900, delay: 0.04 });
      tone({ type: 'square', f0: 330, f1: 240, dur: 0.08, vol: 0.16, delay: dur * 0.35 });
      burst({ dur: 0.06, vol: 0.1, freq: 320, delay: dur * 0.35 });
      tone({ type: 'square', f0: 420, f1: 640, dur: 0.07, vol: 0.18, delay: dur * 0.68 });
      burst({ dur: 0.06, vol: 0.07, freq: 800, q: 1.1, type: 'bandpass', delay: dur * 0.66 });
      tone({ type: 'square', f0: 700, f1: 980, dur: 0.05, vol: 0.2, delay: dur * 0.9 });
      burst({ dur: 0.06, vol: 0.12, freq: 1300, delay: dur * 0.9 });
    },
    // weapon draw: cloth swish + bolt click-clack; heavier guns lower & slower
    switch_(id = 'pistol') {
      const wgt = { pistol: 0, smg: 0.3, shotgun: 0.75, sniper: 1 }[id] || 0;
      const p = 1 - wgt * 0.3;
      burst({ dur: 0.07, vol: 0.09 + wgt * 0.05, freq: 900 * p, q: 1.1, type: 'bandpass', jitter: 0.1 });
      tone({ type: 'square', f0: 430 * p, f1: 320 * p, dur: 0.04, vol: 0.12, delay: 0.05 });
      tone({ type: 'square', f0: 540 * p, f1: 700 * p, dur: 0.05, vol: 0.16, delay: 0.11 + wgt * 0.06 });
      burst({ dur: 0.04, vol: 0.08, freq: 1600 * p, delay: 0.11 + wgt * 0.06 });
    },

    /* --- combat feedback --- */
    hit() { tone({ type: 'square', f0: 1500, f1: 1200, dur: 0.035, vol: 0.11, jitter: 0.04 }); },
    headshot() {
      tone({ type: 'square', f0: 2100, f1: 1600, dur: 0.04, vol: 0.13 });
      ping({ f: 2350, dur: 0.16, vol: 0.09, delay: 0.02 });
    },
    kill(pos = null, type = 'assault') {
      // per-type "shutdown": heavy is low and long, scout short and bright
      const k = type === 'heavy' ? { f0: 340, f1: 48, dur: 0.36, vol: 0.26 }
              : type === 'scout' ? { f0: 520, f1: 95, dur: 0.18, vol: 0.17 }
              : { f0: 420, f1: 70, dur: 0.25, vol: 0.2 };
      tone({ type: 'sawtooth', ...k, jitter: 0.05, pos, send: 0.5 });
      burst({ dur: 0.12, vol: 0.1, freq: 2400, type: 'highpass', jitter: 0.2, pos, send: 0.4 }); // sparks
      burst({ dur: 0.2, vol: 0.12, freq: 500, jitter: 0.1, pos, send: 0.5, delay: 0.03 });
    },
    hurt(dmg = 12, fromPos = null) {
      if (!ctx) return;
      const k = Math.min(1, dmg / 30);
      const pan = fromPos ? spatial(fromPos).pan * 0.7 : 0;
      tone({ type: 'sine', f0: 130, f1: 55, dur: 0.2, vol: 0.26 + 0.12 * k, pan });
      burst({ dur: 0.12, vol: 0.12 + 0.1 * k, freq: 300, pan });
      burst({ dur: 0.05, vol: 0.1, freq: 1700, q: 2, type: 'bandpass', pan });
      duckMix(k, 0.25 + 0.3 * k); // brief "ears ringing" muffle, scales with damage
    },

    /* --- movement --- */
    footstep(sprint = false) {
      if (!ctx) return;
      stepSide = -stepSide; // alternate feet: slight left/right pan
      const pan = stepSide * 0.12;
      burst({ dur: sprint ? 0.07 : 0.055, vol: sprint ? 0.11 : 0.065, freq: sprint ? 520 : 440, q: 0.9, type: 'bandpass', jitter: 0.18, pan });
      tone({ type: 'sine', f0: sprint ? 96 : 84, f1: 46, dur: 0.05, vol: sprint ? 0.09 : 0.055, jitter: 0.12, pan });
    },
    jump() {
      burst({ dur: 0.12, vol: 0.05, freq: 500, q: 0.7, type: 'bandpass', jitter: 0.1 });
      tone({ type: 'sine', f0: 170, f1: 260, dur: 0.1, vol: 0.035 });
    },
    land(k = 0.5) { // k 0..1 = impact strength (from fall speed)
      tone({ type: 'sine', f0: 120, f1: 50, dur: 0.12 + 0.08 * k, vol: 0.09 + 0.18 * k });
      burst({ dur: 0.08 + 0.06 * k, vol: 0.05 + 0.11 * k, freq: 380, q: 0.8, jitter: 0.1 });
    },
    // bunnyhop chain feedback: chirp pitch climbs with the boost
    bhop(boost = 1) {
      const f = 480 + (boost - 1) * 1900;
      tone({ type: 'square', f0: f, f1: f * 1.3, dur: 0.05, vol: 0.05, filter: 2600 });
    },

    /* --- UI / game flow (tuned to A minor to sit inside the music) --- */
    buy()    { tone({ type: 'square', f0: 659.25, dur: 0.06, vol: 0.16 }); tone({ type: 'square', f0: 880, dur: 0.1, vol: 0.16, delay: 0.07 }); },
    pickup() { tone({ type: 'square', f0: 440, dur: 0.06, vol: 0.15 }); tone({ type: 'square', f0: 659.25, dur: 0.09, vol: 0.15, delay: 0.06 }); },
    heal()   { tone({ type: 'sine', f0: 440, f1: 660, dur: 0.18, vol: 0.18 }); ping({ f: 880, dur: 0.2, vol: 0.05, delay: 0.1 }); },
    wave() {
      tone({ type: 'sawtooth', f0: 220, dur: 0.14, vol: 0.14, filter: 1800 });
      tone({ type: 'sawtooth', f0: 330, dur: 0.2, vol: 0.14, delay: 0.12, filter: 1800 });
      ping({ f: 1760, dur: 0.25, vol: 0.06, delay: 0.24 });
    },
    // rising noise sweep in the last moment of intermission — telegraphs the wave
    riser(dur = 1.5) {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 1.5;
      f.frequency.setValueAtTime(280, t0);
      f.frequency.exponentialRampToValueAtTime(3400, t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.11, t0 + dur * 0.92);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur + 0.12);
      s.connect(f).connect(g);
      routeOut(g, { send: 0.5 });
      s.start(t0); s.stop(t0 + dur + 0.15);
    },
    win()  { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone({ type: 'square', f0: f, dur: 0.22, vol: 0.15, delay: i * 0.13 }); ping({ f: f * 2, dur: 0.3, vol: 0.04, delay: i * 0.13 }); }); },
    lose() { [330, 262, 196, 131].forEach((f, i) => tone({ type: 'sawtooth', f0: f, dur: 0.28, vol: 0.16, delay: i * 0.16, filter: 1200 })); },

    /* --- campaign: objectives & set-pieces (A minor, like the other stingers) --- */
    objective() { // new objective: two rising notes E5 → A5 + a high ping
      tone({ type: 'square', f0: 659.25, dur: 0.07, vol: 0.13 });
      tone({ type: 'square', f0: 880, dur: 0.09, vol: 0.13, delay: 0.08 });
      ping({ f: 1760, dur: 0.18, vol: 0.05, delay: 0.16 });
    },
    objDone() { // resolved: A5 → C6
      tone({ type: 'square', f0: 880, dur: 0.07, vol: 0.14 });
      tone({ type: 'square', f0: 1046.5, dur: 0.12, vol: 0.13, delay: 0.08 });
    },
    objWarn() { // low interrupted buzz — leaving a zone, timer running out
      tone({ type: 'sawtooth', f0: 220, f1: 175, dur: 0.16, vol: 0.14, filter: 900 });
    },
    explode(pos) { // generator/gate demolition — layered spatial boom
      burst({ dur: 0.05, vol: 0.45, freq: 2400, type: 'highpass', pos, send: 0.3 });
      burst({ dur: 0.5, vol: 0.65, freq: 420, jitter: 0.1, pos, send: 0.5 });
      burst({ dur: 0.9, vol: 0.3, freq: 190, jitter: 0.1, pos, send: 0.8, delay: 0.05 });
      tone({ type: 'sine', f0: 70, f1: 34, dur: 0.5, vol: 0.38, pos });
    },
    /* robotic radio voice: ONE short blip per call — the dialog system calls
       this every few typed characters, so each speaker gets a distinct
       "machine language" timbre without any audio files */
    voice(who) {
      if (who === 'baker') {
        // pure synth: soft FM-ish sine chirp, lowercase character
        tone({ type: 'sine', f0: 500 + Math.random() * 180, f1: 430, dur: 0.035, vol: 0.05, send: 0.15 });
      } else if (who === 'centrala') {
        // a human squeezed through a duty radio channel: click + narrow tone
        burst({ dur: 0.02, vol: 0.045, freq: 1800, type: 'bandpass', q: 4 });
        tone({ type: 'square', f0: 190 + Math.random() * 70, dur: 0.03, vol: 0.035, filter: 1200 });
      } else {
        // the simulation automaton: dry ticks
        tone({ type: 'square', f0: 980, dur: 0.018, vol: 0.03, filter: 3000 });
      }
    },
  };
})();
