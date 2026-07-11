/* NEON ARENA — procedural textures (runtime canvas, no image files)
   Builds color / normal / roughness / emissive maps for the arena materials.
   Everything is generated into canvases at load time, so the game keeps
   working from file:// (a locally generated canvas is never cross-origin,
   unlike image files read from disk).
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== TEKSTURY PROCEDURALNE ==================== */

const TexGen = (() => {

  /* Deterministic RNG (mulberry32 clone, private copy — world.js has its own).
     Fixed seeds keep surfaces identical on every load; the arena seed only
     affects the layout, never the materials. */
  function rng(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

  /* Tileable value noise: the random lattice wraps at the edges, so any
     texture built from it repeats seamlessly. Returns f(x, y) -> [0, 1]
     for pixel coordinates in a size×size image. */
  function makeNoise(rand, size, cells) {
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    const k = cells / size;
    return (x, y) => {
      const gx = x * k, gy = y * k;
      let x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = smooth(gx - x0), fy = smooth(gy - y0);
      x0 %= cells; y0 %= cells;
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const a = lat[y0 * cells + x0], b = lat[y0 * cells + x1];
      const c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }

  function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function toTexture(canvas, { srgb = false, repeat = 1 } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // sRGB only for color/emissive maps — normal/roughness must stay linear
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* Normal map from a wrapping height field (central differences).
     Canvas rows grow downward while V grows upward (flipY), hence the
     positive green term. */
  function normalFromHeight(height, size, strength) {
    const c = makeCanvas(size), g = c.getContext('2d');
    const img = g.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) {
      const yp = ((y + 1) % size) * size, ym = ((y + size - 1) % size) * size, yr = y * size;
      for (let x = 0; x < size; x++) {
        const xp = (x + 1) % size, xm = (x + size - 1) % size;
        const nx = -(height[yr + xp] - height[yr + xm]) * strength;
        const ny = (height[yp + x] - height[ym + x]) * strength;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const i4 = (yr + x) * 4;
        d[i4] = (nx * inv * 0.5 + 0.5) * 255;
        d[i4 + 1] = (ny * inv * 0.5 + 0.5) * 255;
        d[i4 + 2] = (inv * 0.5 + 0.5) * 255;
        d[i4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* Thin scratches drawn with 3×3 wrapped copies so the texture stays tileable. */
  function drawScratches(g, size, rand, count, light, dark) {
    g.save();
    g.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const x = rand() * size, y = rand() * size;
      const a = rand() * Math.PI * 2, len = 15 + rand() * 100;
      const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
      g.strokeStyle = rand() < 0.5 ? light : dark;
      g.globalAlpha = 0.05 + rand() * 0.1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        g.beginPath();
        g.moveTo(x + ox * size, y + oy * size);
        g.lineTo(x + dx + ox * size, y + dy + oy * size);
        g.stroke();
      }
    }
    g.restore();
  }

  /* ---------- floor: metal deck plates with teal neon inlays ----------
     One tile = N×N plates; `repeat` chosen by the caller so a plate is
     roughly 1.15 m in the world. Returns { map, normalMap, roughnessMap,
     emissiveMap } — emissive carries the glowing seam inlays. */
  function makeFloorSet(repeat) {
    const S = 1024, P = 128, N = S / P;
    const rand = rng(20260711);
    const grime = makeNoise(rng(101), S, 6);
    const mid = makeNoise(rng(202), S, 48);
    const micro = makeNoise(rng(303), S, 192);

    // per-plate features + glowing seam segments
    const shade = [], vent = [], glowV = [], glowH = [];
    for (let j = 0; j < N; j++) {
      shade[j] = []; vent[j] = []; glowV[j] = []; glowH[j] = [];
      for (let i = 0; i < N; i++) {
        shade[j][i] = 0.9 + rand() * 0.2;
        vent[j][i] = rand() < 0.1;
        glowV[j][i] = rand() < 0.09;
        glowH[j][i] = rand() < 0.09;
      }
    }

    const height = new Float32Array(S * S);
    const cAlb = makeCanvas(S), gAlb = cAlb.getContext('2d');
    const cRgh = makeCanvas(S), gRgh = cRgh.getContext('2d');
    const cEmi = makeCanvas(S), gEmi = cEmi.getContext('2d');
    const iAlb = gAlb.createImageData(S, S), dAlb = iAlb.data;
    const iRgh = gRgh.createImageData(S, S), dRgh = iRgh.data;
    const iEmi = gEmi.createImageData(S, S), dEmi = iEmi.data;

    const SEAM = 3, BEVEL = 8, RIVET = 14;
    for (let y = 0; y < S; y++) {
      const pj = (y / P) | 0, py = y - pj * P;
      const dy = Math.min(py + 0.5, P - py - 0.5);
      for (let x = 0; x < S; x++) {
        const pi = (x / P) | 0, px = x - pi * P;
        const dx = Math.min(px + 0.5, P - px - 0.5);
        const dEdge = Math.min(dx, dy);
        const i1 = y * S + x, i4 = i1 * 4;

        // height: raised plate with bevel, recessed seams, rivets, vent grooves
        let h = smooth((dEdge - SEAM) / BEVEL);
        const rd = Math.hypot(dx - RIVET, dy - RIVET);
        if (rd < 5) h += Math.cos(rd / 5 * Math.PI / 2) * 0.55;
        const ventF = vent[pj][pi] ? smooth((dEdge - 26) / 8) : 0;
        if (ventF > 0) h -= 0.3 * ventF * (0.5 + 0.5 * Math.sin(py * Math.PI / 8));
        const m = mid(x, y), mc = micro(x, y), gr = grime(x, y);
        h += (m - 0.5) * 0.12 + (mc - 0.5) * 0.06;
        height[i1] = h;

        // neon inlays along selected seams (core → emissive, halo → albedo)
        let core = 0, halo = 0;
        if (dy > RIVET && dx <= 10) {
          const si = px < P / 2 ? pi : (pi + 1) % N;
          if (glowV[pj][si]) { core = 1 - dx / 1.8; halo = 1 - dx / 10; }
        }
        if (dx > RIVET && dy <= 10) {
          const sj = py < P / 2 ? pj : (pj + 1) % N;
          if (glowH[sj][pi]) { core = Math.max(core, 1 - dy / 1.8); halo = Math.max(halo, 1 - dy / 10); }
        }
        core = clamp01(core);
        halo = clamp01(halo) ** 2 * 0.35;

        // albedo: indigo deck, per-plate shade, grime pooling near the seams
        const dirt = Math.min(1, Math.max(0, gr * 1.5 - 0.5) + Math.max(0, 1 - dEdge / 22) * gr * 0.7);
        let l = shade[pj][pi] * (0.87 + 0.13 * h) * (1 - 0.26 * dirt) *
          (0.92 + 0.16 * (mc - 0.5)) * (1 - 0.12 * ventF);
        if (dEdge <= SEAM) l *= 0.55;
        dAlb[i4] = 51 * l;
        dAlb[i4 + 1] = 58 * l + 210 * halo;
        dAlb[i4 + 2] = 105 * l + 178 * halo;
        dAlb[i4 + 3] = 255;

        // emissive: teal core of the inlays
        dEmi[i4] = 0;
        dEmi[i4 + 1] = 235 * core;
        dEmi[i4 + 2] = 199 * core;
        dEmi[i4 + 3] = 255;

        // roughness: dirt is rough, plate tops smoother, inlays glassy
        let rough = 0.68 + 0.22 * dirt + (1 - h) * 0.08 + (mc - 0.5) * 0.1;
        if (core > 0.2) rough = 0.35;
        const rv = clamp01(rough) * 255;
        dRgh[i4] = rv; dRgh[i4 + 1] = rv; dRgh[i4 + 2] = rv; dRgh[i4 + 3] = 255;
      }
    }
    gAlb.putImageData(iAlb, 0, 0);
    gRgh.putImageData(iRgh, 0, 0);
    gEmi.putImageData(iEmi, 0, 0);
    drawScratches(gAlb, S, rand, 90, 'rgb(190,200,235)', 'rgb(8,8,16)');

    return {
      map: toTexture(cAlb, { srgb: true, repeat }),
      normalMap: toTexture(normalFromHeight(height, S, 3), { repeat }),
      roughnessMap: toTexture(cRgh, { repeat }),
      emissiveMap: toTexture(cEmi, { srgb: true, repeat }),
    };
  }

  /* ---------- walls: armored panels in a running bond, drip stains ----------
     Meant for world-scaled box UVs (applyBoxUV), one tile ≈ 6 m. */
  function makeWallSet() {
    const S = 1024, P = 256, N = S / P;
    const rand = rng(4090);
    const grime = makeNoise(rng(11), S, 5);
    const micro = makeNoise(rng(22), S, 160);
    const streak = makeNoise(rng(33), S, 90);

    const shade = [], vent = [], glowV = [];
    for (let j = 0; j < N; j++) {
      shade[j] = []; vent[j] = []; glowV[j] = [];
      for (let i = 0; i < N; i++) {
        shade[j][i] = 0.88 + rand() * 0.22;
        vent[j][i] = rand() < 0.12;
        glowV[j][i] = rand() < 0.06;
      }
    }

    const height = new Float32Array(S * S);
    const cAlb = makeCanvas(S), gAlb = cAlb.getContext('2d');
    const cRgh = makeCanvas(S), gRgh = cRgh.getContext('2d');
    const cEmi = makeCanvas(S), gEmi = cEmi.getContext('2d');
    const iAlb = gAlb.createImageData(S, S), dAlb = iAlb.data;
    const iRgh = gRgh.createImageData(S, S), dRgh = iRgh.data;
    const iEmi = gEmi.createImageData(S, S), dEmi = iEmi.data;

    const SEAM = 4, BEVEL = 12, RIVET = 18;
    for (let y = 0; y < S; y++) {
      const pj = (y / P) | 0, py = y - pj * P;
      const dy = Math.min(py + 0.5, P - py - 0.5);
      // running bond: every other row shifted by half a panel
      const shift = (pj % 2) * (P / 2);
      for (let x = 0; x < S; x++) {
        const xs = (x + shift) % S;
        const pi = (xs / P) | 0, px = xs - pi * P;
        const dx = Math.min(px + 0.5, P - px - 0.5);
        const dEdge = Math.min(dx, dy);
        const i1 = y * S + x, i4 = i1 * 4;

        // height: beveled panel + accent groove near the top + rivets + vents
        let h = smooth((dEdge - SEAM) / BEVEL);
        const band = smooth((py - 38) / 5) * (1 - smooth((py - 50) / 5));
        if (dEdge > SEAM + 3) h -= 0.28 * band;
        const rd = Math.hypot(dx - RIVET, dy - RIVET);
        if (rd < 6) h += Math.cos(rd / 6 * Math.PI / 2) * 0.5;
        const ventF = vent[pj][pi] ? smooth((dEdge - 40) / 10) : 0;
        if (ventF > 0) h -= 0.3 * ventF * (0.5 + 0.5 * Math.sin(px * Math.PI / 7));
        const mc = micro(x, y), gr = grime(x, y);
        h += (mc - 0.5) * 0.08;
        height[i1] = h;

        // drip stains hanging from the seam above (strongest at panel top)
        const sv = streak(x, pj * P + 31);
        const drip = Math.max(0, sv * 1.6 - 0.9) * Math.max(0, 1 - py / (P * 0.7));

        // teal hairline on a few vertical seams
        let core = 0;
        if (dy > RIVET + 6 && dx <= 6) {
          const si = px < P / 2 ? pi : (pi + 1) % N;
          if (glowV[pj][si]) core = clamp01(1 - dx / 1.6);
        }

        // albedo: PALETTE.wall baked in, dirt + drips darken
        const dirt = Math.min(1, Math.max(0, gr * 1.3 - 0.5) + drip * 1.2);
        let l = shade[pj][pi] * (0.86 + 0.14 * h) * (1 - 0.24 * dirt) *
          (0.93 + 0.14 * (mc - 0.5)) * (1 - 0.1 * ventF);
        if (dEdge <= SEAM) l *= 0.45;
        dAlb[i4] = 90 * l;
        dAlb[i4 + 1] = 99 * l + 190 * core;
        dAlb[i4 + 2] = 158 * l + 160 * core;
        dAlb[i4 + 3] = 255;

        dEmi[i4] = 0;
        dEmi[i4 + 1] = 235 * core;
        dEmi[i4 + 2] = 199 * core;
        dEmi[i4 + 3] = 255;

        let rough = 0.62 + 0.26 * dirt + (1 - h) * 0.08 + (mc - 0.5) * 0.1;
        if (core > 0.2) rough = 0.35;
        const rv = clamp01(rough) * 255;
        dRgh[i4] = rv; dRgh[i4 + 1] = rv; dRgh[i4 + 2] = rv; dRgh[i4 + 3] = 255;
      }
    }
    gAlb.putImageData(iAlb, 0, 0);
    gRgh.putImageData(iRgh, 0, 0);
    gEmi.putImageData(iEmi, 0, 0);
    drawScratches(gAlb, S, rand, 70, 'rgb(200,210,240)', 'rgb(10,10,18)');

    return {
      map: toTexture(cAlb, { srgb: true }),
      normalMap: toTexture(normalFromHeight(height, S, 3), {}),
      roughnessMap: toTexture(cRgh, {}),
      emissiveMap: toTexture(cEmi, { srgb: true }),
    };
  }

  /* ---------- crates: framed cargo panel with an X-brace, tint baked in ----------
     Designed for the default BoxGeometry UVs (each face = whole texture). */
  function makeCrateSet(tintHex) {
    const S = 256;
    const rand = rng(tintHex ^ 0x9e3779b9);
    const grime = makeNoise(rng(7), S, 4);
    const micro = makeNoise(rng(8), S, 96);
    const tr = tintHex >> 16 & 255, tg = tintHex >> 8 & 255, tb = tintHex & 255;

    // rivet centers on the frame: corners + edge midpoints
    const IN = 15, MID = S / 2;
    const rivets = [
      [IN, IN], [S - IN, IN], [IN, S - IN], [S - IN, S - IN],
      [MID, IN], [MID, S - IN], [IN, MID], [S - IN, MID],
    ];

    const height = new Float32Array(S * S);
    const cAlb = makeCanvas(S), gAlb = cAlb.getContext('2d');
    const cRgh = makeCanvas(S), gRgh = cRgh.getContext('2d');
    const iAlb = gAlb.createImageData(S, S), dAlb = iAlb.data;
    const iRgh = gRgh.createImageData(S, S), dRgh = iRgh.data;

    const FRAME = 28;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i1 = y * S + x, i4 = i1 * 4;
        const d = Math.min(x, S - 1 - x, y, S - 1 - y);

        // height: raised frame, recessed center panel, X-brace across it
        let h = 1 - 0.55 * smooth((d - FRAME) / 12);
        const onBrace = Math.abs(x - y) < 13 || Math.abs(x + y - S) < 13;
        const inPanel = smooth((d - FRAME - 6) / 10);
        if (onBrace) h += 0.4 * inPanel;
        h -= (1 - smooth(d / 5)) * 0.35; // chamfered outer edge
        let rMin = 99;
        for (const [rx, ry] of rivets) rMin = Math.min(rMin, Math.hypot(x - rx, y - ry));
        if (rMin < 5) h += Math.cos(rMin / 5 * Math.PI / 2) * 0.45;
        const mc = micro(x, y), gr = grime(x, y);
        h += (mc - 0.5) * 0.06;
        height[i1] = h;

        // albedo: tint × shading; dirt collects at the panel bottom
        const bottomDirt = smooth((y / S - 0.55) / 0.35) * 0.3;
        const dirt = Math.min(1, Math.max(0, gr * 1.4 - 0.5) + bottomDirt);
        const frameL = 0.82 + 0.18 * smooth((FRAME - d) / 10);
        let l = frameL * (0.8 + 0.2 * h) * (1 - 0.3 * dirt) * (0.92 + 0.16 * (mc - 0.5));
        if (onBrace && inPanel > 0.5) l *= 1.07;
        dAlb[i4] = tr * l; dAlb[i4 + 1] = tg * l; dAlb[i4 + 2] = tb * l; dAlb[i4 + 3] = 255;

        let rough = (d < FRAME ? 0.55 : 0.72) + 0.22 * dirt + (mc - 0.5) * 0.1;
        const rv = clamp01(rough) * 255;
        dRgh[i4] = rv; dRgh[i4 + 1] = rv; dRgh[i4 + 2] = rv; dRgh[i4 + 3] = 255;
      }
    }
    gAlb.putImageData(iAlb, 0, 0);
    gRgh.putImageData(iRgh, 0, 0);
    drawScratches(gAlb, S, rand, 40, 'rgb(225,225,235)', 'rgb(12,10,14)');

    return {
      map: toTexture(cAlb, { srgb: true }),
      normalMap: toTexture(normalFromHeight(height, S, 2.5), {}),
      roughnessMap: toTexture(cRgh, {}),
    };
  }

  /* ---------- hologram: teal glyph stream on a transparent canvas ----------
     Meant for an additive, transparent plane scrolled via tex.offset.y
     (see updateWorldFx in world.js). Rows never cross the top/bottom edge,
     so the vertical scroll wraps seamlessly. */
  function makeHologramTexture(seed) {
    const W = 256, H = 512, ROWS = 14, RH = H / ROWS;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rand = rng(seed);
    for (let r = 0; r < ROWS; r++) {
      const y = r * RH + 5;
      const a = 0.55 + rand() * 0.45;
      g.fillStyle = g.strokeStyle = `rgba(0,235,199,${a.toFixed(2)})`;
      g.lineWidth = 2;
      const kind = rand();
      if (kind < 0.35) {
        // fake text line: dashes of random width
        let x = 12;
        while (x < W - 40) {
          const w = 8 + rand() * 26;
          g.fillRect(x, y + 8, w, 7);
          x += w + 9;
        }
      } else if (kind < 0.6) {
        // bar chart
        const n = 6 + (rand() * 5 | 0);
        for (let i = 0; i < n; i++) {
          const bh = 4 + rand() * 20;
          g.fillRect(14 + i * 20, y + 26 - bh, 11, bh);
        }
      } else if (kind < 0.82) {
        // node route: circles joined by a line
        const n = 3 + (rand() * 3 | 0);
        let px = 20 + rand() * 30, py = y + 14;
        for (let i = 0; i < n; i++) {
          g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.stroke();
          const nx = px + 40 + rand() * 40;
          if (i < n - 1 && nx < W - 20) {
            g.beginPath(); g.moveTo(px + 6, py); g.lineTo(nx - 6, py); g.stroke();
          }
          px = nx;
          if (px > W - 20) break;
        }
      } else {
        // warning diamond + code dashes
        const cx = 28, cy = y + 15;
        g.beginPath();
        g.moveTo(cx, cy - 11); g.lineTo(cx + 11, cy); g.lineTo(cx, cy + 11); g.lineTo(cx - 11, cy);
        g.closePath(); g.stroke();
        for (let i = 0; i < 4; i++) g.fillRect(52 + i * 34, cy - 3, 20, 6);
      }
    }
    // scanlines over everything (H % 4 == 0 → tileable)
    g.fillStyle = 'rgba(0,235,199,0.10)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* World-scale box UVs: `scale` = meters per texture tile, so a 72 m wall
     and a 2 m pillar share one material without stretching. (ou, ov)
     de-syncs the pattern between blocks. Call before first render. */
  function applyBoxUV(geom, scale, ou = 0, ov = 0) {
    const pos = geom.attributes.position, nor = geom.attributes.normal, uv = geom.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v;
      if (Math.abs(nor.getX(i)) > 0.5) { u = z; v = y; }
      else if (Math.abs(nor.getY(i)) > 0.5) { u = x; v = z; }
      else { u = x; v = y; }
      uv.setXY(i, u / scale + ou, v / scale + ov);
    }
    uv.needsUpdate = true;
    return geom;
  }

  return { makeFloorSet, makeWallSet, makeCrateSet, makeHologramTexture, applyBoxUV };
})();
