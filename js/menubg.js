/* STATUS 1 — MENU-1: animated Los Santos panorama behind the main menu.
   A self-contained night-city scene (own scene / camera / fog) rendered by the
   shared composer whenever the game is on a navigation screen — main.js points
   the render pass here via menuBgActive(). Everything is procedural (boxes +
   TexGen canvas windows), deterministic (fixed seed) and cheap: ~80 draw
   calls, no lights (MeshBasicMaterial only), bloom comes from the pipeline.
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. */
'use strict';

/* ==================== PANORAMA MENU (MENU-1) ==================== */

const MenuBg = (() => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d1030, 70, 950);
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 1600);
  camera.rotation.order = 'YXZ';

  let built = false;
  let t = 0;
  const drones = [];        // { group, lane: {y, z, speed, dir, bobPh} }
  const sweeps = [];        // { group, cone, speed, ph }
  const smogs = [];         // { mesh, speed, span }
  let beaconMatA = null, beaconMatB = null;   // rooftop blinkers (two phases)
  let strobeMatR = null, strobeMatB = null;   // drone strobes
  let flickerMat = null;                      // one faulty neon sign

  /* deterministic RNG — private mulberry32 clone (world.js/textures.js own
     theirs); a fixed seed keeps the skyline identical on every boot */
  function rng(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t2 = Math.imul(a ^ a >>> 15, 1 | a);
      t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2;
      return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
    };
  }

  /* soft radial blob on a canvas — smog sheets lit by the city glow */
  function makeGlowTexture(inner, outer) {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function build() {
    if (built) return;
    built = true;
    const rand = rng(730136); // Los Santos, always the same city

    /* --- sky: night dome with the warm smog glow of downtown --- */
    {
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top:      { value: new THREE.Color(0x04051a) },
          horizon:  { value: new THREE.Color(0x2b2350) },
          glowWarm: { value: new THREE.Color(0xff3a5e) }, // crimson downtown haze
          glowCool: { value: new THREE.Color(0x2f6bff) }, // blue cast off to the side
          cityDir:  { value: new THREE.Vector3(0, 0.04, -1).normalize() },
          coolDir:  { value: new THREE.Vector3(-0.55, 0.22, -0.8).normalize() },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 top; uniform vec3 horizon;
          uniform vec3 glowWarm; uniform vec3 glowCool;
          uniform vec3 cityDir; uniform vec3 coolDir;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 col = mix(horizon, top, pow(h, 0.5));
            vec3 nd = normalize(vDir);
            float s = pow(max(dot(nd, cityDir), 0.0), 14.0);
            float b = pow(max(dot(nd, coolDir), 0.0), 6.0);
            col += glowWarm * s * 0.3 + glowCool * b * 0.16;
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), skyMat));
    }

    /* --- ground: near-black valley floor under the towers --- */
    {
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(3200, 3200),
        new THREE.MeshBasicMaterial({ color: 0x05061a }));
      g.rotation.x = -Math.PI / 2;
      scene.add(g);
    }

    /* --- towers: three parallax bands of window-lit boxes ---
       Facades share 4 window textures; per-band material instances get dimmer
       with distance so depth reads even before the fog kicks in. */
    const winTex = [9001, 9002, 9003, 9004].map(s => TexGen.makeCityWindows(s));
    const bandMats = [1.0, 0.8, 0.62].map(dim =>
      winTex.map(tex => new THREE.MeshBasicMaterial({
        map: tex, color: new THREE.Color(dim, dim, dim),
      })));
    // blue-red identity: police colors carry the palette, teal stays as the brand
    const neonPalette = [PALETTE.red, 0x3b78ff, PALETTE.teal, PALETTE.purple];
    const neonMats = neonPalette.map(c => new THREE.MeshBasicMaterial({
      color: new THREE.Color(c).multiplyScalar(2.8), // >1 pushes it over the bloom threshold
    }));
    flickerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.red).multiplyScalar(2.8),
    });
    beaconMatA = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244) });
    beaconMatB = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244) });

    // bands: [count, xSpread, zNear, zFar, hMin, hMax]
    const bands = [
      [24, 270, -150, -230, 40, 78],
      [26, 420, -270, -390, 55, 135],
      [24, 520, -460, -650, 90, 235],
    ];
    let neonBudget = 12, flickerPlaced = false;
    bands.forEach(([count, xs, zn, zf, hMin, hMax], bi) => {
      for (let i = 0; i < count; i++) {
        const w = 14 + rand() * 18;
        const d = 14 + rand() * 18;
        // downtown band: the tallest towers cluster around the center
        const centerBias = bi === 2 ? 1 - Math.abs(i / (count - 1) - 0.5) * 1.2 : 1;
        const h = hMin + rand() * (hMax - hMin) * Math.max(0.35, centerBias);
        const x = (i / (count - 1) - 0.5) * 2 * xs + (rand() - 0.5) * 26;
        const z = zn - rand() * (zn - zf);
        const geo = new THREE.BoxGeometry(w, h, d);
        // world-scale UVs (24 m tile) + random offset to de-sync the grids
        TexGen.applyBoxUV(geo, 24, rand(), rand());
        const mesh = new THREE.Mesh(geo, bandMats[bi][Math.floor(rand() * 4)]);
        mesh.position.set(x, h / 2, z);
        scene.add(mesh);

        // neon signs on the near band's facades, facing the camera
        if (bi === 0 && neonBudget > 0 && rand() < 0.55) {
          neonBudget--;
          let mat = neonMats[Math.floor(rand() * neonMats.length)];
          if (!flickerPlaced && neonBudget < 6) { mat = flickerMat; flickerPlaced = true; }
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(w * (0.22 + rand() * 0.3), 1.5 + rand() * 1.3, 0.6), mat);
          sign.position.set(x + (rand() - 0.5) * w * 0.3,
            h * (0.55 + rand() * 0.3), z + d / 2 + 0.4);
          scene.add(sign);
        }
        // red rooftop beacons on the tall towers, two alternating phases
        if (h > 100 && rand() < 0.75) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6),
            rand() < 0.5 ? beaconMatA : beaconMatB);
          b.position.set(x, h + 1.5, z);
          scene.add(b);
        }
      }
    });

    /* --- foreground: low mid-rises below the camera ---
       Dimly lit (not pure black) so the bottom half of the frame reads as
       city, not as a void; street-glow strips fill the gaps between them. */
    {
      const fgMats = winTex.map(tex => new THREE.MeshBasicMaterial({
        map: tex, color: new THREE.Color(0.5, 0.5, 0.58),
      }));
      const roofMat = new THREE.MeshBasicMaterial({ color: 0x0a0c22 });
      // lit facades + dark roof: regroup the box faces into two materials
      // (px+nx / roof / ny+pz+nz) — the camera looks down at these blocks
      const fgBlock = (w, h, d, x, z) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        TexGen.applyBoxUV(geo, 24, rand(), rand());
        geo.clearGroups();
        geo.addGroup(0, 12, 0);   // px + nx
        geo.addGroup(12, 6, 1);   // py — the roof
        geo.addGroup(18, 18, 0);  // ny + pz + nz
        const mesh = new THREE.Mesh(geo, [fgMats[Math.floor(rand() * 4)], roofMat]);
        mesh.position.set(x, h / 2, z);
        scene.add(mesh);
      };
      for (let i = 0; i < 14; i++) {
        fgBlock(20 + rand() * 30, 10 + rand() * 22, 18 + rand() * 22,
          (i / 13 - 0.5) * 560 + (rand() - 0.5) * 30, -70 - rand() * 45);
      }
      // an extra, nearest row right under the camera — fills the bottom edge
      for (let i = 0; i < 8; i++) {
        fgBlock(24 + rand() * 26, 7 + rand() * 12, 16 + rand() * 18,
          (i / 7 - 0.5) * 480 + (rand() - 0.5) * 40, -46 - rand() * 22);
      }
      // street level: long red/blue light strips glimpsed between the blocks
      const stripMats = [
        new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.red).multiplyScalar(2.2) }),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3b78ff).multiplyScalar(2.2) }),
      ];
      for (let i = 0; i < 14; i++) {
        const len = 50 + rand() * 90;
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(len, 0.9, 2.2), stripMats[i % 2]);
        strip.position.set((rand() * 2 - 1) * 320, 0.9, -55 - rand() * 95);
        scene.add(strip);
      }
    }

    /* --- SENTINEL drones: quadcopter silhouettes with police strobes --- */
    strobeMatR = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3355) });
    strobeMatB = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3388ff) });
    const droneBody = new THREE.MeshBasicMaterial({ color: 0x0a0d24 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 2.6), droneBody);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.15, 0.6), droneBody);
      rotor.position.y = 0.6;
      const lampR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.85), strobeMatR);
      const lampB = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.85), strobeMatB);
      lampR.position.set(-1.3, 0.55, 0);
      lampB.position.set(1.3, 0.55, 0);
      g.add(body, rotor, lampR, lampB);
      const dir = rand() < 0.5 ? 1 : -1;
      g.position.set((rand() * 2 - 1) * 420, 50 + rand() * 60, -130 - rand() * 200);
      drones.push({ group: g, lane: {
        speed: (13 + rand() * 16) * dir, bobPh: rand() * Math.PI * 2,
      } });
      scene.add(g);
    }

    /* --- searchlights: two rooftop beams slowly sweeping the sky --- */
    {
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x9fd8ff, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      // apex at the origin, beam opening upward — lets the group pivot at the roof
      const coneGeo = new THREE.ConeGeometry(11, 190, 16, 1, true).translate(0, 95, 0);
      const spots = [[-170, 62, -255], [200, 78, -300]];
      spots.forEach(([x, y, z], i) => {
        const g = new THREE.Group();
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.rotation.z = 0.55; // tilt off vertical; the group's yaw sweeps it
        g.add(cone);
        g.position.set(x, y, z);
        scene.add(g);
        sweeps.push({ group: g, cone, speed: 0.14 + i * 0.05, ph: i * 2.1 });
      });
    }

    /* --- smog: blue-red additive sheets drifting between the bands ---
       The lowest sheet sits just above the foreground rooftops, so the bottom
       of the frame gets a haze band instead of staying black. */
    {
      const texWarm = makeGlowTexture('rgba(255,86,120,0.5)', 'rgba(255,86,120,0)');
      const texCool = makeGlowTexture('rgba(80,130,255,0.5)', 'rgba(80,130,255,0)');
      const layers = [
        [-110, 8, 0.1, 700, texWarm],
        [-150, 15, 0.085, 640, texCool],
        [-190, 28, 0.05, 620, texWarm],
        [-330, 42, 0.06, 760, texCool],
        [-520, 60, 0.08, 980, texWarm],
      ];
      for (const [z, y, op, w, tex] of layers) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 130),
          new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: op,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          }));
        m.position.set(0, y, z);
        smogs.push({ mesh: m, speed: 2 + Math.abs(z) * 0.004, span: 120 });
        scene.add(m);
      }
    }
  }

  // strobe/beacon target colors, hoisted — no per-frame allocations
  const STROBE_R = new THREE.Color(0xff3355).multiplyScalar(2.2);
  const STROBE_B = new THREE.Color(0x3388ff).multiplyScalar(2.2);

  /* per-frame animation; called from tick only while a menu screen is up */
  function update(dt) {
    if (!built) build();
    t += dt;

    // camera: slow aerial drift over the foreground rooftops
    const aspect = window.innerWidth / window.innerHeight;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    camera.position.set(Math.sin(t * 0.021) * 10, 28 + Math.sin(t * 0.009) * 1.8, Math.cos(t * 0.017) * 5);
    camera.rotation.set(0.02 + Math.sin(t * 0.012) * 0.012, Math.sin(t * 0.008) * 0.1, 0);

    // drones: straight lanes with a gentle bob, wrapping at the edges
    for (const d of drones) {
      d.group.position.x += d.lane.speed * dt;
      d.group.position.y += Math.sin(t * 1.7 + d.lane.bobPh) * 0.6 * dt;
      d.group.rotation.y = d.lane.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (d.group.position.x > 460) d.group.position.x = -460;
      if (d.group.position.x < -460) d.group.position.x = 460;
    }
    // police strobes: alternating red/blue duty cycle (shared materials)
    if (strobeMatR) {
      const redOn = (t * 2.4) % 1 < 0.5;
      strobeMatR.color.copy(STROBE_R).multiplyScalar(redOn ? 1 : 0.05);
      strobeMatB.color.copy(STROBE_B).multiplyScalar(redOn ? 0.05 : 1);
    }
    // rooftop beacons: slow anti-phase pulsing
    if (beaconMatA) {
      const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 1.6));
      const b = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 1.6 + Math.PI));
      beaconMatA.color.setRGB(a * 1.4, a * 0.16, a * 0.28);
      beaconMatB.color.setRGB(b * 1.4, b * 0.16, b * 0.28);
    }
    // one faulty neon: irregular flicker
    if (flickerMat) {
      const on = Math.sin(t * 13) + Math.sin(t * 7.7) > -0.4 ? 1.7 : 0.25;
      flickerMat.color.set(PALETTE.red).multiplyScalar(on);
    }
    // searchlights sweep; smog drifts and wraps
    for (const s of sweeps) s.group.rotation.y = Math.sin(t * s.speed + s.ph) * 1.4;
    for (const s of smogs) {
      s.mesh.position.x += s.speed * dt;
      if (s.mesh.position.x > s.span) s.mesh.position.x = -s.span;
    }
  }

  return { scene, camera, build, update };
})();

/* Which states sit on the navigation layer (panorama behind them)?
   Gameplay aftermath screens (pause/over/won/debrief/mfail) keep the frozen
   game world instead — the menu is the layer ABOVE the game, not inside it. */
function menuBgActive() {
  const s = game.state;
  if (s === 'menu' || s === 'levels' || s === 'stats' || s === 'brief') return true;
  if (s === 'settings') return settingsReturn !== 'pause';
  if (s === 'shop') return game.mode === 'campaign'; // armory = navigation, arena shop = mid-run
  return false;
}
