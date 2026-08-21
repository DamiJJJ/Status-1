#!/usr/bin/env python3
"""Bake sound samples into js/sfx.js as base64 Ogg/Opus.

Why this exists: the game must run from file://, where fetch() is blocked, so
a sample cannot simply be loaded from disk. It can however be inlined in a JS
file and decoded in memory (atob -> Uint8Array -> ctx.decodeAudioData), which
returns a normal AudioBuffer - a first-class citizen of the WebAudio graph,
unlike an <audio> element. See CLAUDE.md (Architektura -> Zasoby).

Sources live in assets_src/sfx/ and are cut here, not in the game: every clip
names its source file, an in-point and a duration, so the bake is repeatable
and the game ships only the milliseconds it actually plays.

Opus, not WAV: a 0.3 s pistol shot lands around 2 kB, and base64 costs another
third on top. WAV would be ~30 kB for the same clip.

Usage:
    python tools/gen_sfx.py                         # bake js/sfx.js
    python tools/gen_sfx.py --probe "<wav path>"    # print onsets to cut on
"""

import base64
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src', 'sfx')
OUT = os.path.join(ROOT, 'js', 'sfx.js')

P1 = "Snake's Authentic Gun Sounds"
P2 = "Snake's SECOND Authentic Gun Sounds"
S18 = 'Sonniss GDC 2018'   # GDC Game Audio Bundle 2018, royalty-free
S26 = 'Sonniss GDC 2026'   # GDC Game Audio Bundle 2026, royalty-free

# Cut points come from --probe (RMS onsets), not from listening by ear.
#   at   - in-point in the source file, seconds
#   dur  - how much to keep, seconds
#   gain - dB applied at bake time; keeps the runtime volumes comparable
#          between synthesized and sampled voices
#   fade - fade-out at the end of the clip, seconds (kills the cut click)
#
# Shots use the ISOLATED (dry) takes on purpose: the arena tail is our own
# convolver, fed per-voice by `send`, so it follows the room the player is in.
# The "Full Sound" takes carry the recording's own reverb and would stack two
# rooms on top of each other.
# Bitrate is per key, with a per-clip override. Opus VBR spends what the
# content needs, and broadband noise (a boot ringing on metal, cloth dragging)
# is far more expensive than a gunshot's short transient - left at the default
# those clips cost 5-7 kB each. They are also quiet and half-masked by
# whatever else is playing, so they get a lower target.
OPUS_KBPS = {'fire': 56, 'default': 40}
MOVEMENT_KBPS = 24

MANIFEST = {
    # --- Glock / 9 mm ---------------------------------------------------
    # Three genuine takes, not one clip pitched three ways: the shooter's
    # follow-up shots differ in body, and that difference is what stops a
    # burst from sounding stamped (playbackRate jitter is applied on top).
    'pistol_fire': [
        {'src': P2 + '/Isolated/9mm/WAV/9mm Single Isolated.wav',
         'at': 0.000, 'dur': 0.34, 'gain': 0, 'fade': 0.05},
        {'src': P2 + '/Isolated/9mm/WAV/9mm Double Tap Isolated.wav',
         'at': 0.000, 'dur': 0.24, 'gain': 0, 'fade': 0.04},
        {'src': P2 + '/Isolated/9mm/WAV/9mm Double Tap Isolated.wav',
         'at': 0.250, 'dur': 0.34, 'gain': 0, 'fade': 0.05},
    ],
    # Reload elements, keyframed by the animation in weapons.js. Each one is
    # a single mechanical event - the pack's "Reload 1/2" files already split
    # the magazine out from the magazine in.
    'pistol_mag_out': [
        {'src': P2 + '/& More/Pistol/WAV/9mm Pistol Reload 1.wav',
         'at': 0.000, 'dur': 0.20, 'gain': 6, 'fade': 0.04},
    ],
    'pistol_mag_in': [
        {'src': P2 + '/& More/Pistol/WAV/9mm Pistol Reload 2.wav',
         'at': 0.255, 'dur': 0.22, 'gain': 0, 'fade': 0.05},
    ],
    # Slide running forward on a fresh magazine (the empty-reload tail).
    'pistol_slide': [
        {'src': P2 + '/& More/Pistol/WAV/9mm Pistol Slide Release.wav',
         'at': 0.000, 'dur': 0.16, 'gain': 0, 'fade': 0.04},
    ],
    # Hand closing on the spare magazine - stands in for the pouch grab.
    'pistol_grab': [
        {'src': P2 + '/& More/Mag Pack/WAV/9mm Magazine Unpack.wav',
         'at': 0.095, 'dur': 0.20, 'gain': 3, 'fade': 0.05},
    ],

    # --- SMG / 9 mm ------------------------------------------------------
    # Same calibre as the Glock, so the variants come from a different KIND
    # of take: the three shots of the slow-burst recording, fired fast. A
    # rapid-fire shot has a shorter, harder body than a deliberate single -
    # that difference is what separates the two guns, not an effect. The
    # remaining gap (a submachine gun's longer barrel sits lower than a
    # pistol's) is a small playbackRate shift applied in audio.js.
    # The shots sit 0.23 s apart, which leaves each one its full decay -
    # the "Spray" take could not be used, its shots are 0.05 s apart and
    # every slice would cut into the next round.
    'smg_fire': [
        {'src': P2 + '/Isolated/9mm/WAV/9mm Slow Burst Isolated.wav',
         'at': 0.010, 'dur': 0.215, 'gain': 0, 'fade': 0.04},
        {'src': P2 + '/Isolated/9mm/WAV/9mm Slow Burst Isolated.wav',
         'at': 0.240, 'dur': 0.215, 'gain': 0, 'fade': 0.04},
        {'src': P2 + '/Isolated/9mm/WAV/9mm Slow Burst Isolated.wav',
         'at': 0.485, 'dur': 0.230, 'gain': 0, 'fade': 0.05},
    ],
    # Rifle-style magazine work: the SMG carries a box magazine in a well,
    # not a pistol grip, so the AR takes fit it and the pistol ones do not.
    'smg_mag_out': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/AR Reload Part 1 WAV.wav',
         'at': 0.180, 'dur': 0.22, 'gain': 3, 'fade': 0.05},
    ],
    'smg_mag_in': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/AR Reload Part 2 WAV.wav',
         'at': 0.340, 'dur': 0.26, 'gain': 0, 'fade': 0.06},
    ],
    'smg_slide': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/AR Bolt Release WAV.wav',
         'at': 0.022, 'dur': 0.26, 'gain': 0, 'fade': 0.06},
    ],
    'smg_grab': [
        {'src': P2 + '/& More/Mag Pack/WAV/AR PolyMag Unpack.wav',
         'at': 0.160, 'dur': 0.22, 'gain': 3, 'fade': 0.05},
    ],

    # --- Shotgun / 20 gauge ----------------------------------------------
    # Each variant is the LAST shot of its take, which is the only way to get
    # the full decay: the multi-shot files put the next round 0.25 s later,
    # and a shotgun's body runs well past that. At 80 rpm the gun has 0.75 s
    # between shots, so nothing here has to be cut short.
    'shotgun_fire': [
        {'src': P2 + '/Isolated/20 Gauge/WAV/20 Gauge Single Isolated.wav',
         'at': 0.004, 'dur': 0.46, 'gain': 0, 'fade': 0.10},
        {'src': P2 + '/Isolated/20 Gauge/WAV/20 Gauge Double Tap Isolated.wav',
         'at': 0.253, 'dur': 0.44, 'gain': 0, 'fade': 0.10},
        {'src': P2 + '/Isolated/20 Gauge/WAV/20 Gauge Slow Burst Isolated.wav',
         'at': 0.503, 'dur': 0.44, 'gain': 0, 'fade': 0.10},
    ],
    # Shell thumbed into the tube - fired once per reload cycle, so it has to
    # survive being heard four times in two seconds; the take is quiet, hence
    # the lift.
    'shotgun_shell': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/Pump Shell Load WAV.wav',
         'at': 0.100, 'dur': 0.24, 'gain': 8, 'fade': 0.05},
    ],
    # The forend going back and forward again: one clip, both strokes. The
    # "Fast" take is the one that keeps up with the animation - the slower
    # take spends 0.27 s between strokes and the gun is already firing again.
    'shotgun_pump': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/Pump Reload Full Fast WAV.wav',
         'at': 0.020, 'dur': 0.44, 'gain': 0, 'fade': 0.06},
    ],
    'shotgun_grab': [
        {'src': P2 + '/& More/Mag Pack/WAV/Single Shotgun Load.wav',
         'at': 0.120, 'dur': 0.20, 'gain': 5, 'fade': 0.05},
    ],

    # --- hitting a drone ---------------------------------------------------
    # SENTINEL is a metal machine, so a hit on it is metal-on-metal. Both
    # sources are struck-metal recordings; the melee take turned out to hold
    # four impacts in a row 0.14 s apart, which is exactly the spacing a burst
    # needs, and they differ in weight the way real repeated strikes do.
    # Clips are SHORT on purpose: a round hitting armour is over immediately,
    # and this fires several times a second in a firefight. The ring that is
    # cut off comes back through the arena convolver via `send`.
    'hit_bot': [
        {'src': S26 + '/METLImpt_METAL SWING HIT Weapon Swing To Metallic Body Impact And Resonant Tail 01_DDUMAIS_MWP2.wav',
         'at': 0.150, 'dur': 0.13, 'gain': 0, 'fade': 0.035, 'kbps': MOVEMENT_KBPS},
        {'src': S26 + '/METLImpt_METAL SWING HIT Weapon Swing To Metallic Body Impact And Resonant Tail 01_DDUMAIS_MWP2.wav',
         'at': 0.292, 'dur': 0.13, 'gain': 0, 'fade': 0.035, 'kbps': MOVEMENT_KBPS},
        {'src': S26 + '/METLImpt_METAL SWING HIT Weapon Swing To Metallic Body Impact And Resonant Tail 01_DDUMAIS_MWP2.wav',
         'at': 0.427, 'dur': 0.14, 'gain': -2, 'fade': 0.04, 'kbps': MOVEMENT_KBPS},
        {'src': S26 + '/METLImpt_Metal Old File Impact Tap Against Tire Iron Metallic Hit 01_ESM_HDGM.wav',
         'at': 0.124, 'dur': 0.22, 'gain': 0, 'fade': 0.05, 'kbps': MOVEMENT_KBPS},
    ],
    # Headshot: a deeper, ringing hit - the head is a hollow shell and answers
    # differently from the torso. audio.js keeps the gold FM ping ON TOP of
    # this, because that ping is not texture, it is the game TELLING the
    # player what happened.
    'hit_head': [
        {'src': S26 + '/DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav',
         'at': 0.052, 'dur': 0.26, 'gain': 0, 'fade': 0.06, 'kbps': MOVEMENT_KBPS},
        {'src': S26 + '/DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav',
         'at': 0.180, 'dur': 0.24, 'gain': 0, 'fade': 0.06, 'kbps': MOVEMENT_KBPS},
    ],

    # Death: the machine falling over, in two layers. The body is struck
    # metal with its ring left ON this time (unlike a hit, a death gets to
    # breathe - it happens once per drone, not five times a second), and the
    # glitch is the electronics going out. audio.js still owns the descending
    # power-down tone, which is where the per-type character lives.
    'kill_body': [
        {'src': S26 + '/DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav',
         'at': 0.520, 'dur': 0.55, 'gain': 2, 'fade': 0.14, 'kbps': MOVEMENT_KBPS},
        {'src': S26 + '/DSGNTonl_Metal Scrape Low Tonal LFE 4_The Noisery_Moaning Metal.wav',
         'at': 1.380, 'dur': 0.65, 'gain': -3, 'fade': 0.16, 'kbps': MOVEMENT_KBPS},
    ],
    # Very quiet source (peaks at 0.16), hence the lift.
    'kill_glitch': [
        {'src': S26 + '/UIGlitch_Designed_Glitch_Corrupted_Data Error_The Noisery_Rich Glitch_06.wav',
         'at': 2.080, 'dur': 0.38, 'gain': 12, 'fade': 0.10, 'kbps': MOVEMENT_KBPS},
        {'src': S26 + '/UIGlitch_Designed_Glitch_Corrupted_Data Error_The Noisery_Rich Glitch_06.wav',
         'at': 2.640, 'dur': 0.40, 'gain': 12, 'fade': 0.10, 'kbps': MOVEMENT_KBPS},
    ],

    # Taking a hit: a body impact, panned toward whoever fired. The player
    # wears a vest, so this is a blunt thud rather than anything metallic -
    # the metal takes are what the DRONE sounds like, and the two must not
    # be confusable when both are happening at once.
    # The punch take clips in the source (peaks at 1.09), hence the cut.
    'hurt_body': [
        {'src': S26 + '/Hand-to-Hand Combat - Body Hits - Deep Punch 02.wav',
         'at': 0.010, 'dur': 0.20, 'gain': -4, 'fade': 0.05, 'kbps': MOVEMENT_KBPS},
        {'src': S26 + '/Hand-to-Hand Combat - Body Hits - Face Slap Hard 04.wav',
         'at': 0.025, 'dur': 0.12, 'gain': 4, 'fade': 0.035, 'kbps': MOVEMENT_KBPS},
    ],

    # --- movement ---------------------------------------------------------
    # Boots on metal, cut out of a 30 s walking LOOP (110 fpm) - the pack has
    # no isolated footfalls, but the loop puts one every 0.545 s, so there is
    # plenty to choose from. Six variants is the floor, not a luxury: a step
    # lands every half sway cycle, far more often than any other sound in the
    # game, and with fewer than six the ear starts hearing the pattern.
    # The takes are deliberately left at their natural levels (the loop walks
    # unevenly, as people do); only the two quietest get a nudge.
    # Metal is the right surface here - the arena is an industrial hall and
    # the enemy is a metal drone. The pack also has wood, carpet and
    # flip-flops if the game ever learns what the player is standing on.
    'step_metal': [
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 1.760, 'dur': 0.26, 'gain': 0, 'fade': 0.06, 'kbps': MOVEMENT_KBPS},
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 3.942, 'dur': 0.26, 'gain': 3, 'fade': 0.06, 'kbps': MOVEMENT_KBPS},
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 5.578, 'dur': 0.26, 'gain': 2, 'fade': 0.06, 'kbps': MOVEMENT_KBPS},
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 7.759, 'dur': 0.26, 'gain': 0, 'fade': 0.06, 'kbps': MOVEMENT_KBPS},
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 10.487, 'dur': 0.26, 'gain': 0, 'fade': 0.06, 'kbps': MOVEMENT_KBPS},
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 12.670, 'dur': 0.26, 'gain': 3, 'fade': 0.06},
    ],
    # Landing comes in two layers, picked by fall speed. Soft is the loudest
    # footfall in the walking loop (both boots at once); hard is a body going
    # down on the floor, which only joins in on a real drop. Keeping them
    # separate means a hop off a crate and a fall off the gantry are not the
    # same event played at two volumes.
    'land_soft': [
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 9.396, 'dur': 0.30, 'gain': 0, 'fade': 0.07, 'kbps': MOVEMENT_KBPS},
        {'src': S18 + '/1845 - Footsteps - Metal Stairs - Up - 110 fpm - Loop.wav',
         'at': 11.032, 'dur': 0.30, 'gain': 0, 'fade': 0.07, 'kbps': MOVEMENT_KBPS},
    ],
    'land_hard': [
        {'src': S18 + '/Hand-to-Hand Combat - Body Hits - Body Slam Floor 08.wav',
         'at': 0.085, 'dur': 0.34, 'gain': 0, 'fade': 0.08, 'kbps': MOVEMENT_KBPS},
    ],
    # The slide: 0.55 s of clothing dragging along the floor, which is what a
    # slide mostly IS. The take is very quiet (peaks at 0.13), hence the lift.
    # ONE take on purpose (user call 2026-08-21): the pack is "Cloths &
    # Sponges" and the other candidate (Cloth 61) read as wiping a wet
    # surface with a rag. A slide is short and always the same move, so one
    # good take beats two when one of them is wrong.
    # It carries no low end at all, so audio.js keeps the synthesized body
    # rumble underneath it - the sample is the texture, the tone is the weight.
    'slide': [
        {'src': S18 + '/Cloth 29.wav',
         'at': 1.652, 'dur': 0.58, 'gain': 18, 'fade': 0.14, 'kbps': MOVEMENT_KBPS},
    ],

    # --- sniper scope ----------------------------------------------------
    # There is no "scope" recording in either pack, and there is no honest way
    # to fake an optic: what the player actually hears when the rifle comes up
    # is the GUN being set, so both clips are handling foley. The bipod takes
    # are the only ones in the packs that are pure metal-on-metal movement
    # with no round and no magazine in them.
    # Up is the softer, longer take (the rifle settling into the shoulder),
    # down the crisper one (it coming off the eye).
    'scope_up': [
        {'src': P2 + '/& More/Bipod/WAV/Bipod Deploy One Leg.wav',
         'at': 0.170, 'dur': 0.28, 'gain': 9, 'fade': 0.07},
    ],
    'scope_down': [
        {'src': P2 + '/& More/Bipod/WAV/Bipod Raise One Leg.wav',
         'at': 0.012, 'dur': 0.20, 'gain': 3, 'fade': 0.06},
    ],

    # --- weapon draw -----------------------------------------------------
    # ONE clip for the whole arsenal (user call 2026-08-21). The long-gun
    # take was a charging handle being let go, and on a swap that reads as a
    # whip crack rather than a gun being picked up. The pistol take is the
    # hand closing on the gun plus the action checked - that reads as
    # "weapon in hand" for anything, so every weapon uses it.
    'draw': [
        {'src': P2 + '/& More/Pistol/WAV/9mm Pistol Chamber Check Full.wav',
         'at': 0.005, 'dur': 0.28, 'gain': 8, 'fade': 0.06},
    ],

    # --- Rifle / 5.56 ----------------------------------------------------
    # At 640 rpm the shots are 0.094 s apart, so the clips overlap in flight -
    # that is correct for an automatic, the tails stack the way they do on a
    # real burst. Variants: the single take plus both shots of the double tap.
    'rifle_fire': [
        {'src': P1 + '/Isolated/5.56/WAV/556 Single Isolated WAV.wav',
         'at': 0.020, 'dur': 0.30, 'gain': 0, 'fade': 0.06},
        {'src': P1 + '/Isolated/5.56/WAV/556 Double Tap Isolated WAV.wav',
         'at': 0.020, 'dur': 0.245, 'gain': 0, 'fade': 0.04},
        {'src': P1 + '/Isolated/5.56/WAV/556 Double Tap Isolated WAV.wav',
         'at': 0.264, 'dur': 0.30, 'gain': 0, 'fade': 0.06},
    ],
    # AK takes, not the AR ones the SMG uses: both guns feed from a box
    # magazine, so sharing the recordings would make them the same weapon to
    # the ear. The AK magazine also rocks in instead of dropping straight -
    # two events per stroke, which is why these clips are longer.
    'rifle_mag_out': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/AK Reload Part 1 WAV.wav',
         'at': 0.010, 'dur': 0.34, 'gain': 2, 'fade': 0.06},
    ],
    'rifle_mag_in': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/AK Reload Part 2 WAV.wav',
         'at': 0.010, 'dur': 0.38, 'gain': 0, 'fade': 0.06},
    ],
    'rifle_slide': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/AK Rack WAV.wav',
         'at': 0.070, 'dur': 0.50, 'gain': 0, 'fade': 0.08},
    ],
    'rifle_grab': [
        {'src': P2 + '/& More/Mag Pack/WAV/AK PolyMag Unpack.wav',
         'at': 0.030, 'dur': 0.18, 'gain': 3, 'fade': 0.05},
    ],

    # --- Sniper / 7.62x54R -----------------------------------------------
    # The Mosin round, and the Mosin mechanics to go with it: this is the one
    # weapon in the arsenal where the source rifle is a bolt action, which is
    # exactly how the game reloads it (style 'shellBolt' - single rounds, then
    # the bolt). .308 was the alternative and was passed over: those takes are
    # semi-auto and would have handed a bolt gun somebody else's action.
    # Every variant is the LAST shot of its take. At 45 rpm the gun has 1.33 s
    # between shots, so the tail can run as long as the recording allows -
    # and on a rifle round that tail IS the weapon.
    'sniper_fire': [
        {'src': P1 + '/Isolated/7.62x54R/WAV/762x54r Single Isolated WAV.wav',
         'at': 0.010, 'dur': 0.85, 'gain': 0, 'fade': 0.18},
        {'src': P1 + '/Isolated/7.62x54R/WAV/762x54r Double Tap Isolated WAV.wav',
         'at': 0.262, 'dur': 0.72, 'gain': 0, 'fade': 0.16},
        {'src': P1 + '/Isolated/7.62x54R/WAV/762x54r Burst Isolated WAV.wav',
         'at': 0.512, 'dur': 0.72, 'gain': 0, 'fade': 0.16},
    ],
    # A round pressed into the magazine from the top - the game feeds this
    # rifle one round at a time, which is what the Mosin actually does.
    'sniper_shell': [
        {'src': P2 + '/& More/Mag Pack/WAV/Mosin Top Load.wav',
         'at': 0.620, 'dur': 0.26, 'gain': 6, 'fade': 0.06},
    ],
    # The bolt: lifted, pulled, pushed, locked. One clip for the whole cycle,
    # because that is one motion of the hand.
    'sniper_slide': [
        {'src': P1 + '/Reloads, Cycling & More/WAV/Mosin Bolt Cycle WAV.wav',
         'at': 0.310, 'dur': 0.58, 'gain': 0, 'fade': 0.08},
    ],
    # Fingers finding the next round in the pouch.
    'sniper_grab': [
        {'src': P2 + '/& More/Mag Pack/WAV/Mosin Top Load.wav',
         'at': 0.230, 'dur': 0.22, 'gain': 8, 'fade': 0.05},
    ],
}


def ffmpeg(args):
    r = subprocess.run(['ffmpeg', '-v', 'error'] + args, capture_output=True)
    if r.returncode != 0:
        raise SystemExit('ffmpeg failed: ' + r.stderr.decode('utf-8', 'replace'))
    return r.stdout


def probe(path):
    """Print RMS onsets so clip in-points are measured, not guessed."""
    import numpy as np
    sr = 44100
    raw = ffmpeg(['-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'])
    a = np.frombuffer(raw, dtype='<f4')
    win = int(sr * 0.004)
    env = np.sqrt(np.convolve(a * a, np.ones(win) / win, 'same'))
    pk = env.max()
    on = (env > pk * 0.05).astype(int)
    d = np.diff(on)
    starts = list(np.where(d == 1)[0])
    ends = list(np.where(d == -1)[0])
    if on[0]:
        starts = [0] + starts
    if on[-1]:
        ends = ends + [len(on) - 1]
    print('%s  %.2fs  peak %.2f' % (os.path.basename(path), len(a) / sr, pk))
    for s, e in zip(starts, ends):
        if (e - s) / sr <= 0.006:
            continue
        print('   at=%.3f dur=%.3f  rel=%.2f' % (s / sr, (e - s) / sr, env[s:e].max() / pk))


def bake_clip(clip, kbps):
    kbps = clip.get('kbps', kbps)
    path = os.path.join(SRC, clip['src'].replace('/', os.sep))
    if not os.path.isfile(path):
        raise SystemExit('missing source: ' + path)
    dur, fade = clip['dur'], clip.get('fade', 0.03)
    # mono, fade the cut end, encode; Opus always runs at 48 kHz internally,
    # so resample here rather than letting the encoder do it silently
    af = 'afade=t=out:st=%.4f:d=%.4f' % (max(0.0, dur - fade), fade)
    if clip.get('gain'):
        af = 'volume=%.2fdB,' % clip['gain'] + af
    # -vn / -map_metadata: some source WAVs carry embedded artwork, and without
    # this ffmpeg happily encodes it into the Ogg as a THEORA VIDEO STREAM -
    # 4 kB of picture riding along with a quarter-second footstep (measured:
    # 5250 B for a clip whose audio is 1230 B).
    return ffmpeg(['-ss', '%.4f' % clip['at'], '-t', '%.4f' % dur, '-i', path,
                   '-vn', '-map_metadata', '-1',
                   '-ac', '1', '-ar', '48000', '-af', af,
                   '-c:a', 'libopus', '-b:a', '%dk' % kbps, '-vbr', 'on',
                   '-f', 'ogg', '-'])


def main():
    if '--probe' in sys.argv:
        for p in sys.argv[sys.argv.index('--probe') + 1:]:
            probe(p if os.path.isabs(p) else os.path.join(SRC, p))
        return

    data, meta, total = {}, {}, 0
    for key, clips in MANIFEST.items():
        kbps = OPUS_KBPS['fire'] if 'fire' in key else OPUS_KBPS['default']
        blobs = []
        for i, clip in enumerate(clips):
            ogg = bake_clip(clip, kbps)
            total += len(ogg)
            blobs.append(base64.b64encode(ogg).decode('ascii'))
            print('  %-16s v%d  %5.2f s  %6d B' % (key, i, clip['dur'], len(ogg)))
        data[key] = blobs
        meta[key] = len(blobs)

    lines = ['/* GENERATED by tools/gen_sfx.py - DO NOT EDIT BY HAND.',
             '   Sampled SFX baked as base64 Ogg/Opus so they decode under file://',
             '   (fetch is blocked there; decodeAudioData on an inlined buffer is not).',
             '   Sources: assets_src/sfx/ - "Snake\'s Authentic Gun Sounds" packs 1 & 2 by',
             '   SnakeF8 / F8 Studios (public domain, commercial use, credit not required).',
             '   Each key holds an array of VARIANTS; AudioSys picks one per shot. */',
             "'use strict';", '',
             'const SFX_VARIANTS = %s;' % json.dumps(meta, sort_keys=True), '',
             'const SFX_DATA = {']
    for key in sorted(data):
        lines.append('  %s: [' % json.dumps(key))
        for b in data[key]:
            lines.append("    '%s'," % b)
        lines.append('  ],')
    lines.append('};')
    lines.append('')

    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print('\n%s: %d keys, %.1f kB of audio -> %.1f kB of file'
          % (os.path.relpath(OUT, ROOT), len(data), total / 1024.0,
             os.path.getsize(OUT) / 1024.0))


if __name__ == '__main__':
    main()
