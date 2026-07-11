<p align="center">
  <img src="assets/logo-full.png" alt="Neon Arena" width="360">
</p>

# NEON ARENA — browser FPS

A stylized first-person survival shooter that runs entirely in your browser.
Survive **5 waves** of armed bots in a neon arena. No install, no backend —
Three.js is loaded from a CDN and all sound is synthesized at runtime (WebAudio).

## ▶ [Play now](https://damijjj.github.io/Neon-Arena/)

No download required — click and play in your browser.

![Gameplay](screenshots/rozgrywka-2.png)

## How to run

### Option 1 — play online
Just open **[damijjj.github.io/Neon-Arena](https://damijjj.github.io/Neon-Arena/)** —
the game is 100% static and hosted on GitHub Pages.

### Option 2 — simplest, offline (verified in Chrome)
**Double-click `index.html`.** The game opens in your default browser and works
right away — the game code loads as classic scripts from the `js/` folder (keep it
next to `index.html`) and Three.js loads from a CDN (an internet connection is
required).

### Option 3 — fallback, via a local server
Use this only if your browser blocks the game opened from disk (you'll see a
blank/black screen or a CORS/modules error in the console):

- **Windows:** double-click `start-windows.bat` — it starts a local server (Python)
  on port **8137** and opens `http://localhost:8137/index.html`. Closing the console
  window stops the server.
- **macOS / Linux:** run `sh start.sh` in a terminal (requires `python3`).

> Port 8137 was chosen deliberately unusual so it won't clash with other local
> servers (e.g. PHP on 8000).

## Controls

| Action | Key |
|---|---|
| Move | **W / A / S / D** |
| Look / aim | **mouse** (Pointer Lock — activates after clicking "Play") |
| Fire | **LMB** |
| Aim down sights (ADS) | **RMB** (hold) — any weapon; the sniper gives a full scope |
| Reload | **R** |
| Switch weapon | **1 / 2 / 3 / 4** or **scroll** |
| Sprint | **Shift** (works in the air too) |
| Jump / bunnyhop | **Space** (holding auto-jumps; chained jumps ramp speed up to +35%) |
| Pause | **Esc** (releases the mouse) |
| Restart after game over | **R** or the on-screen button |
| Leave the shop (next wave) | **Enter** or the button |

## Gameplay

- **Wave mode (survival):** 5 waves of bots, each more numerous and tougher (more HP,
  better accuracy). Clear the last wave for the victory screen; drop to 0 HP and it's
  game over.
- **Endless mode:** after winning you can keep going — waves 6, 7, 8… scale forever.
  Your best score is saved permanently (localStorage).
- **Headshots:** hitting a bot's head deals **×2 damage** (a gold hitmarker and a
  distinct sound confirm the hit).
- **Damage indicator:** a red arc at the edge of the screen shows which direction a
  shot came from — it rotates with the camera.
- **Between-wave shop:** spend **credits** (10 per scout, 15 per assault, 30 per heavy,
  plus a per-wave bonus) between waves on:
  - **weapons** — you start with only the pistol; unlock the shotgun (50 cr),
    SMG (90 cr) and sniper (140 cr) in the shop;
  - **supplies** — full heal (30 cr), full ammo (40 cr);
  - **upgrades** (prices scale with level) — armor +25 max HP, magazines +50%,
    reload −15%, damage +15%.
- **Procedural music** (WebAudio): calm ambient in the menu/shop; during a wave a beat
  kicks in (kick, hi-hat, bass) — intensity rises with the wave number.
- **Arena generator:** every page load rolls a fresh obstacle layout (pillars, crate
  clusters, low walls). The arena number is shown on the start screen — append
  **`?seed=N`** to the URL (e.g. `index.html?seed=555`) to return to the same layout
  or share it. Spawn and pickup zones always stay clear.
- **Bots** are armed: they close to their preferred range, strafe, check line of sight
  and **shoot back** with limited accuracy. Three types (tell them apart by body color
  and head shape):
  - **Scout** (green, **triangular head**) — pistol, fights at range; randomly drops
    **ammo**;
  - **Assault** (orange, **square head**) — faster than the scout, fires **rifle bursts**;
    randomly drops **ammo**;
  - **Heavy** (red, **round head**) — **shotgun**: must close in but hits very hard up
    close; lots of HP; randomly drops a **medkit** (+30 HP).
- A few pickups (ammo/medkits) also sit on the arena from the start.
- **Score:** scout 100, heavy 250, plus a wave-completion bonus. The high score is saved
  in the browser (localStorage).

## Weapons

| # | Weapon | Profile | Magazine | Price |
|---|--------|---------|----------|-------|
| 1 | **Pistol** | accurate, medium damage, semi-auto | 12 / reserve 72 | start |
| 2 | **Shotgun** | 8 pellets in a spread, lethal up close, slow | 6 / reserve 30 | 50 cr |
| 3 | **SMG** | full-auto, fast, wider spread | 30 / reserve 150 | 90 cr |
| 4 | **Sniper** | huge damage, very accurate with zoom (RMB) | 5 / reserve 20 | 140 cr |

A **headshot** deals ×2 damage (gold hitmarker + a distinctive sound).

**Aiming (RMB):** hip-firing is fast but inaccurate (large spread). Every weapon has an
iron sight — on RMB the weapon slides to screen center (front sight on the firing axis),
FOV narrows to 60°, and spread drops ~3×. The trade-off: **aiming disables sprint and
slows movement** (~half walking speed). Instead of a sight, the sniper gives a full
scope (24°).

**Bunnyhop:** sprint doesn't break in the air, and jumps performed right after landing
(a 0.25 s window — just hold Space) stack a speed boost up to +35%.

## Tech

- **Three.js r160** from a CDN (jsdelivr) via an import map; addons: `PointerLockControls`,
  `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`.
- The game code is split into **classic scripts** in `js/` (config, audio, renderer,
  world, effects, player, weapons, enemies, pickups, shop, waves, HUD, state, input,
  main loop) that share the global scope and load in order via `<script defer>`.
  Deliberately **no local ES modules and no bundler**: browsers block local ES modules
  under `file://`, while classic scripts and CDN modules (HTTPS) work even on a
  double-click — a tiny bootstrap ES module in `index.html` imports Three.js from the
  CDN and exposes it globally before the game scripts run.
- Presentation: flat-shaded low-poly, a consistent palette (indigo / teal / orange / red),
  shadow-mapped shadows (directional light), hemisphere + ambient, **bloom** + ACES tone
  mapping, distance fog, a gradient sky (shader), muzzle flash, tracers, sparks and
  hit/death particles, bullet decals, a procedural floor texture (canvas).
- Sound and music are synthesized (WebAudio) — zero external files; the music is a
  procedural 16-step sequencer (118 BPM, A minor) that reacts to game state.
- Hitscan via `THREE.Raycaster`, game loop on `requestAnimationFrame` with delta time,
  object pools for particles/tracers/decals (no leaks on restart).

## Screenshots

| | |
|---|---|
| ![Menu](screenshots/menu.png) | ![Combat](screenshots/rozgrywka-1.png) |
| ![Shop](screenshots/sklep.png) | ![Victory](screenshots/ekran-zwyciestwa.png) |

## License

Released under the **MIT** license — see the [LICENSE](LICENSE) file.
