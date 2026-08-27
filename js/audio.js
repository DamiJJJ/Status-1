/* STATUS 1 — SFX bus (WebAudio): synthesis plus baked samples from js/sfx.js
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== AUDIO (fully synthetic, WebAudio) ==================== */

const AudioSys = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let sfxBus = null, duckFilter = null, compressor = null;
  let reverb = null, reverbGain = null;
  // user volume multipliers (settings screen); base gains stay the mix reference
  let userMaster = 1, userMusic = 1;
  const MASTER_GAIN = 0.32;

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
      // chain: voices -> sfxBus -> master -> duckFilter -> compressor -> out
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
      master.gain.value = MASTER_GAIN * userMaster;
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
    loadSamples();
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

  /* ---- sampled voices: base64 (js/sfx.js) -> AudioBuffer inside the graph ----
     Recorded SFX go through the SAME chain as the synthesized ones: a
     BufferSourceNode handed to routeOut() gets spatialisation, the reverb
     send, the duck filter and the limiter. That is the whole reason samples
     are inlined as base64 rather than played from an <audio> element - see
     CLAUDE.md (Architektura -> Zasoby). Decoding is asynchronous, so every
     caller must survive `sample()` returning false and fall back to synthesis;
     that is also what keeps the game audible if js/sfx.js is ever missing. */
  const samples = Object.create(null);
  let samplesAsked = false;

  function loadSamples() {
    if (samplesAsked || !ctx || typeof SFX_DATA === 'undefined') return;
    samplesAsked = true;
    for (const key in SFX_DATA) {
      const bank = samples[key] = [];
      SFX_DATA[key].forEach((b64, i) => {
        bank[i] = null;
        try {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          // decodeAudioData detaches the buffer - fine, nothing reads it again
          ctx.decodeAudioData(bytes.buffer, (buf) => {
            bank[i] = buf;
            __test.sfxSamples = (__test.sfxSamples || 0) + 1;
          }, () => { __test.sfxDecodeFail = (__test.sfxDecodeFail || 0) + 1; });
        } catch (e) { __test.sfxDecodeFail = (__test.sfxDecodeFail || 0) + 1; }
      });
    }
  }

  /* Play one variant of a sampled voice. Returns false when there is nothing
     to play yet (still decoding, or no such key), so callers can synthesize
     instead. `jitter` rides playbackRate: it varies pitch AND length together,
     exactly like a real repeat, and keeps a burst from sounding stamped. */
  function sample(key, { vol = 1, pos = null, pan = 0, send = 0, jitter = 0, delay = 0, rate = 1 } = {}) {
    if (!ctx) return false;
    const bank = samples[key];
    if (!bank || !bank.length) return false;
    const buf = bank.length === 1 ? bank[0] : bank[(Math.random() * bank.length) | 0];
    if (!buf) return false;
    __test.sfxPlayed = (__test.sfxPlayed || 0) + 1;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1);
    const g = ctx.createGain();
    src.connect(g);
    // the recording carries its own envelope - only the level is set here
    g.gain.value = Math.max(0.0001, vol * routeOut(g, { pos, pan, send }));
    src.start(t0);
    return true;
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
    updateMenuMusic(dt); // <audio> menu theme lives outside the graph — needs no ctx
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

  /* The procedural in-game score was REMOVED (user call 2026-08-21). It was a
     16-step sequencer with A/B sections, a combat/calm mood blend and a kick
     sidechain; git history has it if it is ever wanted back. The menu theme
     below is now the only music in the game, and gameplay runs on SFX alone.
     `userMusic` survives because that theme still obeys the music slider. */

  /* ---- menu theme: the one sound that plays OUTSIDE the WebAudio graph ----
     It streams from a plain <audio> element with its own volume, because the
     track is minutes long: keeping it out of the graph costs nothing here, as
     the navigation screens have no combat to sidechain or duck against.
     Note this is NOT the only way to play a recording under
     file:// — fetch is blocked, but a base64 sample decodes without it (atob
     -> Uint8Array -> decodeAudioData) and comes back as a normal AudioBuffer
     that belongs to the graph. That is the road for short SFX; see CLAUDE.md
     (Architektura -> Zasoby). Do not route new sounds through <audio>. */
  const MENU_GAIN = 0.4; // the file is mastered far louder than the SFX mix
  const MENU_FADE_IN = 1.6, MENU_FADE_OUT = 0.45; // seconds
  let menuEl = null, menuWant = false, menuFade = 0;

  function menuMusicEl() {
    if (menuEl) return menuEl;
    menuEl = document.getElementById('menu-music');
    if (!menuEl) return null;
    menuEl.volume = 0;
    // autoplay stays refused until the page has seen a gesture — retry on the
    // first one (capture phase, so it fires before the menu button handlers)
    const retry = () => { if (menuWant && menuEl.paused) menuEl.play().catch(() => {}); };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
    return menuEl;
  }

  /* Navigation layer on/off — main.js flips it with the panorama. Idempotent.
     The track is NOT rewound on the way out: coming back from a mission picks
     the theme up where it left off. */
  function menuMusic(on) {
    menuWant = !!on;
    const a = menuMusicEl();
    if (a && menuWant && a.paused) a.play().catch(() => { /* no gesture yet */ });
  }

  function updateMenuMusic(dt) {
    const target = menuWant ? 1 : 0;
    if (menuFade !== target) {
      const step = dt / (menuWant ? MENU_FADE_IN : MENU_FADE_OUT);
      menuFade = target > menuFade ? Math.min(1, menuFade + step) : Math.max(0, menuFade - step);
    }
    __test.menuMusic = !!menuEl && !menuEl.paused && menuFade > 0;
    if (!menuEl) return;
    menuEl.volume = Math.max(0, Math.min(1, MENU_GAIN * userMaster * userMusic * menuFade));
    if (!menuWant && menuFade === 0 && !menuEl.paused) menuEl.pause();
  }

  return {
    init,
    menuMusic,
    update,
    resetFx,

    /* settings screen: 0..1 multipliers over the base mix gains; safe to call
       before init (values are stored and applied when the nodes exist) */
    setVolumes(m, mus) {
      userMaster = m; userMusic = mus;
      if (master) master.gain.value = MASTER_GAIN * userMaster;
      // the menu theme is outside the graph, so it takes both multipliers by hand
      if (menuEl) menuEl.volume = Math.max(0, Math.min(1, MENU_GAIN * userMaster * userMusic * menuFade));
    },

    /* --- weapons --- */
    shot(id) {
      if (!ctx) return;
      switch (id) {
        case 'pistol':
          // recorded 9 mm, dry take: the room comes from our own convolver
          // via `send`, so the shot follows the arena instead of the range
          // it was recorded on. Falls through to synthesis while decoding.
          if (sample('pistol_fire', { vol: 0.5, jitter: 0.035, send: 0.55 })) break;
          burst({ dur: 0.012, vol: 0.2, freq: 3200, type: 'highpass' });                     // action snap
          burst({ dur: 0.08, vol: 0.3, freq: 1400, jitter: 0.1, send: 0.3 });                // body
          tone({ type: 'square', f0: 220, f1: 70, dur: 0.09, vol: 0.2, jitter: 0.05 });
          burst({ dur: 0.16, vol: 0.09, freq: 750, jitter: 0.1, send: 0.9, delay: 0.012 });  // tail
          break;
        case 'shotgun':
          // recorded 20 gauge, dry: the shell's own body is long enough that
          // the send can stay modest - the convolver is placing it in the
          // hall, not supplying the boom
          if (sample('shotgun_fire', { vol: 0.6, jitter: 0.03, send: 0.45 })) break;
          burst({ dur: 0.014, vol: 0.24, freq: 2600, type: 'highpass' });
          burst({ dur: 0.24, vol: 0.5, freq: 650, jitter: 0.08, send: 0.35 });
          tone({ type: 'sine', f0: 110, f1: 35, dur: 0.22, vol: 0.35, jitter: 0.04 });
          burst({ dur: 0.5, vol: 0.14, freq: 430, jitter: 0.1, send: 1.0, delay: 0.02 });
          break;
        case 'smg':
          // recorded 9 mm, rapid-fire takes. `rate` drops it just over a
          // semitone: the game's SMG fires the same round as the Glock, and
          // the barrel length is the only thing separating them - a longer
          // barrel burns more powder before the gas leaves, so the report
          // sits lower. Anything deeper starts to sound like a rifle.
          if (sample('smg_fire', { vol: 0.42, jitter: 0.04, send: 0.4, rate: 0.93 })) break;
          // SMG: small calibre, high rate - a light, snappy report where the
          // bolt clack carries as much as the muzzle (the rifle is the heavy one)
          burst({ dur: 0.012, vol: 0.15, freq: 3400, type: 'highpass' });          // bolt clack
          burst({ dur: 0.05, vol: 0.19, freq: 1500, type: 'highpass', jitter: 0.12, send: 0.18 });
          tone({ type: 'square', f0: 230, f1: 85, dur: 0.05, vol: 0.12, jitter: 0.08 });
          break;
        case 'rifle':
          // recorded 5.56, dry. Louder send than the 9 mm pair: a rifle round
          // drives the room far harder than a pistol one, and that crack
          // coming back off the walls is most of what makes it read as big.
          if (sample('rifle_fire', { vol: 0.5, jitter: 0.035, send: 0.7 })) break;
          burst({ dur: 0.011, vol: 0.18, freq: 3300, type: 'highpass' });
          burst({ dur: 0.07, vol: 0.26, freq: 1200, jitter: 0.1, send: 0.25 });
          tone({ type: 'square', f0: 240, f1: 80, dur: 0.07, vol: 0.16, jitter: 0.06 });
          burst({ dur: 0.14, vol: 0.07, freq: 700, jitter: 0.1, send: 0.8, delay: 0.012 }); // tail
          break;
        case 'sniper':
          // recorded 7.62x54R, dry, with the longest tail in the arsenal and
          // the biggest send. A shot this size is mostly what comes BACK -
          // the crack is over in 60 ms, the hall answers for the rest.
          if (sample('sniper_fire', { vol: 0.6, jitter: 0.025, send: 0.9 })) break;
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
    /* Dry fire: the trigger comes back on an empty chamber. This is what the
       player hears instead of an auto-reload (user call 2026-08-27), so it has
       to read as a MECHANISM, not as a UI beep - a striker falling on nothing
       is a hard little clack with a body, and the old square blip had neither.
       Layered: a filtered noise transient for the strike plus a short low
       thunk for the weight behind it. Falls back from the recorded take the
       same way every other voice does (see gen_sfx.py: 'dry_fire'). */
    empty() {
      if (sample('dry_fire', { vol: 0.5, jitter: 0.05, send: 0.12 })) return;
      burst({ dur: 0.035, vol: 0.22, freq: 2600, q: 1.1, type: 'bandpass', jitter: 0.08 });
      tone({ type: 'triangle', f0: 320, f1: 150, dur: 0.05, vol: 0.09, filter: 900 });
    },
    /* The sniper's scope reaching the eye and leaving it. Handling foley, not
       an optic sound - see gen_sfx.py. Quiet on purpose: it sits under the
       held breath of a player lining up a shot, and anything louder turns
       every aim-and-release into an event. Synthesis fallback is a soft
       filtered swish, not a click - a click here reads as a malfunction. */
    scope(on) {
      if (sample(on ? 'scope_up' : 'scope_down', { vol: on ? 0.3 : 0.26, jitter: 0.05, send: 0.15 })) return;
      burst({ dur: on ? 0.11 : 0.08, vol: 0.05, freq: on ? 900 : 1200,
              q: 1.2, type: 'bandpass', jitter: 0.1 });
    },
    /* reload foley, fired as keyframe events by the viewmodel animation
       (weapons.js buildReloadEvents) so the sound lands ON the hand motion */
    /* Each takes the weapon id so a gun with baked samples uses them and the
       rest stay synthesized - the arsenal can be converted one gun at a time. */
    grab(id = '') { // cloth / hand on the spare magazine
      if (sample(id + '_grab', { vol: 0.5, jitter: 0.04 })) return;
      burst({ dur: 0.07, vol: 0.09, freq: 750, q: 1.1, type: 'bandpass' });
    },
    magOut(id = '') {
      if (sample(id + '_mag_out', { vol: 0.65, jitter: 0.03, send: 0.2 })) return;
      tone({ type: 'square', f0: 330, f1: 240, dur: 0.08, vol: 0.16 });
      burst({ dur: 0.06, vol: 0.1, freq: 320 });
    },
    magIn(id = '') {
      if (sample(id + '_mag_in', { vol: 0.7, jitter: 0.03, send: 0.25 })) return;
      tone({ type: 'square', f0: 420, f1: 640, dur: 0.07, vol: 0.18 });
      burst({ dur: 0.06, vol: 0.1, freq: 800, q: 1.1, type: 'bandpass' });
    },
    boltPull(id = '') {
      if (sample(id + '_slide', { vol: 0.7, jitter: 0.03, send: 0.25 })) return;
      tone({ type: 'square', f0: 700, f1: 980, dur: 0.05, vol: 0.2 });
      burst({ dur: 0.06, vol: 0.12, freq: 1300, delay: 0.05 });
    },
    shellIn(id = '') {
      if (sample(id + '_shell', { vol: 0.6, jitter: 0.05, send: 0.2 })) return;
      burst({ dur: 0.04, vol: 0.12, freq: 1100 });
      tone({ type: 'square', f0: 520, f1: 400, dur: 0.05, vol: 0.14, delay: 0.01 });
    },
    /* One clip, both strokes. Called twice over for different reasons: the
       reload cycles the action at full weight, and every shot cycles it too -
       that one is quieter and delayed, because the forend moves while the
       muzzle is still ringing. Hence the level and offset are arguments. */
    pump(id = '', { vol = 0.6, delay = 0 } = {}) {
      if (sample(id + '_pump', { vol, jitter: 0.03, send: 0.25, delay })) return;
      const k = vol / 0.6;
      tone({ type: 'square', f0: 480, f1: 320, dur: 0.07, vol: 0.2 * k, delay });
      burst({ dur: 0.07, vol: 0.14 * k, freq: 900, delay: delay + 0.07 });
      tone({ type: 'square', f0: 340, f1: 520, dur: 0.06, vol: 0.18 * k, delay: delay + 0.09 });
    },
    // weapon draw: cloth swish + bolt click-clack; heavier guns lower & slower
    switch_(id = 'pistol') {
      const wgt = { pistol: 0, smg: 0.3, shotgun: 0.75, rifle: 0.55, sniper: 1 }[id] || 0;
      // ONE recorded handling take for every weapon (user call 2026-08-21):
      // the heavier take read as a whip crack, and the weight is already
      // carried by the shot itself. No per-weapon rate lean either - the
      // point is that the swap sounds the same whatever comes up.
      if (sample('draw', { vol: 0.5, jitter: 0.04, send: 0.2 })) return;
      const p = 1 - wgt * 0.3;
      burst({ dur: 0.07, vol: 0.09 + wgt * 0.05, freq: 900 * p, q: 1.1, type: 'bandpass', jitter: 0.1 });
      tone({ type: 'square', f0: 430 * p, f1: 320 * p, dur: 0.04, vol: 0.12, delay: 0.05 });
      tone({ type: 'square', f0: 540 * p, f1: 700 * p, dur: 0.05, vol: 0.16, delay: 0.11 + wgt * 0.06 });
      burst({ dur: 0.04, vol: 0.08, freq: 1600 * p, delay: 0.11 + wgt * 0.06 });
    },

    /* --- combat feedback --- */
    /* Rounds landing on a drone: metal on metal, because that is what the
       enemy is made of. No world position - this is the hitmarker's voice,
       the confirmation that the shot connected, and it has to read the same
       whether the target is at 5 m or 40 m. */
    hit() {
      if (sample('hit_bot', { vol: 0.34, jitter: 0.06, send: 0.35 })) return;
      tone({ type: 'square', f0: 1500, f1: 1200, dur: 0.035, vol: 0.11, jitter: 0.04 });
    },
    headshot() {
      // the ping STAYS on top of the sample: it is not texture, it is the
      // game telling the player what they just did
      if (!sample('hit_head', { vol: 0.4, jitter: 0.05, send: 0.4 })) {
        tone({ type: 'square', f0: 2100, f1: 1600, dur: 0.04, vol: 0.13 });
      }
      ping({ f: 2350, dur: 0.16, vol: 0.09, delay: 0.02 });
    },
    kill(pos = null, type = 'assault') {
      // per-type "shutdown": heavy is low and long, scout short and bright.
      // This tone stays synthesized - it is where the per-type character
      // lives, and no recording would scale across the roster like this.
      const k = type === 'heavy' ? { f0: 340, f1: 48, dur: 0.36, vol: 0.26 }
              : type === 'scout' ? { f0: 520, f1: 95, dur: 0.18, vol: 0.17 }
              : { f0: 420, f1: 70, dur: 0.25, vol: 0.2 };
      tone({ type: 'sawtooth', ...k, jitter: 0.05, pos, send: 0.5 });
      burst({ dur: 0.12, vol: 0.1, freq: 2400, type: 'highpass', jitter: 0.2, pos, send: 0.4 }); // sparks
      /* The machine going down: struck metal for the body, a burst of dead
         electronics on top, both POSITIONED - unlike the hitmarker, a death
         is information about the battlefield and belongs where it happened.
         `rate` carries the size: a heavy falls slower and lower. */
      const r = type === 'heavy' ? 0.86 : type === 'scout' ? 1.14 : 1;
      const body = sample('kill_body', { vol: 0.34, jitter: 0.05, rate: r, pos, send: 0.5, delay: 0.03 });
      sample('kill_glitch', { vol: 0.22, jitter: 0.08, rate: r, pos, send: 0.35 });
      if (!body) burst({ dur: 0.2, vol: 0.12, freq: 500, jitter: 0.1, pos, send: 0.5, delay: 0.03 });
    },
    hurt(dmg = 12, fromPos = null) {
      if (!ctx) return;
      const k = Math.min(1, dmg / 30);
      const pan = fromPos ? spatial(fromPos).pan * 0.7 : 0;
      tone({ type: 'sine', f0: 130, f1: 55, dur: 0.2, vol: 0.26 + 0.12 * k, pan });
      /* A recorded body impact - blunt, not metallic. The player wears a
         vest; the metal takes are what the DRONE sounds like, and the two
         must stay tellable apart when both happen at once. Panned toward the
         shooter (a partial pan, not the full spatial: this is happening TO
         the player, not somewhere in the room), and it hits lower and harder
         as the damage climbs. */
      if (!sample('hurt_body', { vol: 0.3 + 0.3 * k, pan, jitter: 0.06,
                                 rate: 1.08 - 0.2 * k })) {
        burst({ dur: 0.12, vol: 0.12 + 0.1 * k, freq: 300, pan });
        burst({ dur: 0.05, vol: 0.1, freq: 1700, q: 2, type: 'bandpass', pan });
      }
      duckMix(k, 0.25 + 0.3 * k); // brief "ears ringing" muffle, scales with damage
    },

    /* --- movement --- */
    footstep(sprint = false) {
      if (!ctx) return;
      stepSide = -stepSide; // alternate feet: slight left/right pan
      const pan = stepSide * 0.12;
      /* Recorded boots on metal (six variants - a step lands more often than
         anything else in the game). Sprinting is not a different recording:
         the same boot hits harder and the stride is quicker, so it is louder
         and slightly faster, which is what actually changes when you run. */
      if (sample('step_metal', { vol: sprint ? 0.5 : 0.3, pan, jitter: 0.05,
                                 rate: sprint ? 1.07 : 1, send: 0.12 })) return;
      burst({ dur: sprint ? 0.07 : 0.055, vol: sprint ? 0.11 : 0.065, freq: sprint ? 520 : 440, q: 0.9, type: 'bandpass', jitter: 0.18, pan });
      tone({ type: 'sine', f0: sprint ? 96 : 84, f1: 46, dur: 0.05, vol: sprint ? 0.09 : 0.055, jitter: 0.12, pan });
    },
    /* Landing is a hybrid for the same reason the slide is: the recordings
       carry the texture (boots, body) and the synthesized tone carries the
       low end, which none of these takes have.
       There is deliberately NO jump sound (user call 2026-08-21) - leaving
       the ground is silent, only coming back down is heard. */
    land(k = 0.5) { // k 0..1 = impact strength (from fall speed)
      tone({ type: 'sine', f0: 120, f1: 50, dur: 0.12 + 0.08 * k, vol: 0.09 + 0.18 * k });
      /* Boots always; the body only on a real drop. A hop off a crate and a
         fall off the gantry are different EVENTS, not one event at two
         volumes - so the heavy layer joins in rather than replacing.
         `rate` falls with the impact: a harder landing reads lower. */
      const boots = sample('land_soft', { vol: 0.3 + 0.4 * k, jitter: 0.06,
                                          rate: 1.06 - 0.14 * k, send: 0.15 });
      if (k > 0.45) sample('land_hard', { vol: 0.2 + 0.5 * k, jitter: 0.05, send: 0.2 });
      if (!boots) {
        burst({ dur: 0.08 + 0.06 * k, vol: 0.05 + 0.11 * k, freq: 380, q: 0.8, jitter: 0.1 });
      }
    },
    // bunnyhop chain feedback: chirp pitch climbs with the boost
    bhop(boost = 1) {
      const f = 480 + (boost - 1) * 1900;
      tone({ type: 'square', f0: f, f1: f * 1.3, dur: 0.05, vol: 0.05, filter: 2600 });
    },
    /* slide: one sustained floor scrape + a low body rumble. HYBRID on
       purpose - the recording is clothing dragging along the floor and has
       no low end at all, so the synthesized rumble stays underneath it. The
       sample is the texture, the tone is the weight of the player. */
    slide() {
      if (!sample('slide', { vol: 0.55, jitter: 0.06, send: 0.25 })) {
        burst({ dur: 0.45, vol: 0.15, freq: 470, q: 0.7, type: 'bandpass', jitter: 0.12, send: 0.25 });
      }
      tone({ type: 'sine', f0: 92, f1: 58, dur: 0.34, vol: 0.07, jitter: 0.1 });
    },

    /* --- grenades --- */
    throw_() { // short cloth whoosh, pitch falls as the arm extends
      burst({ dur: 0.16, vol: 0.1, freq: 1150, q: 0.7, type: 'bandpass', jitter: 0.15 });
      tone({ type: 'sine', f0: 320, f1: 180, dur: 0.09, vol: 0.05, jitter: 0.1 });
    },
    nadeBounce(pos) {
      tone({ type: 'square', f0: 640, f1: 380, dur: 0.045, vol: 0.1, jitter: 0.2, pos, send: 0.3 });
      burst({ dur: 0.03, vol: 0.06, freq: 1900, type: 'highpass', jitter: 0.2, pos });
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
