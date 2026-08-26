# -*- coding: utf-8 -*-
"""Visual pass on the baked weapon viewmodels: hip + ADS per weapon, plus two
numeric checks that a screenshot cannot settle - dark sights and black gloves
on a dark arena:
  * ADS alignment: each sight point projected onto the camera axis has to land
    at NDC ~0,0, and the aim dot has to be the first thing on that axis;
  * arm framing: the CUT END of each arm has to stay OUT of the frame, at the
    hip and under ADS alike (measured on the cap vertices, not on the shoulder
    joint - the joint is on screen even when the arm is framed correctly);
  * arm anchoring: through a reload and the sprint carry the shoulders stay
    put in camera space and the hand that is NOT moving stays on its grip.
Runs on the dev range so every weapon is unlocked."""
import time, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
OUT = pathlib.Path(__file__).parent / "_shots"
OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]

# sight points in viewmodel-local space (see the adsPos maths in weapons.js:
# sight-line y at the feature's z, with the root z offset folded in)
SIGHTS = {
    0: [("pistol dot", 0, 0.0778, -0.2112)],
    1: [("smg dot", 0, 0.1333, -0.2586)],   # rescaled with the gun (0.84)
    2: [("shotgun dot", 0, 0.1064, -0.6747)],   # Mossberg blade dot
    3: [("rifle dot", 0, 0.1377, -0.4336)],
}

with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/?test=play")
    time.sleep(4)
    page.evaluate("startDevMap()")
    time.sleep(1.2)
    # Cap probe: the arm's CUT END, skinned on the CPU and projected.
    # ⚠️ The cut end is the mesh's OPEN BOUNDARY, and it has to be found as
    # one - by merging vertices by position first (the buffer duplicates them
    # at UV/normal seams, so raw edge counting calls every seam a border) and
    # keeping the edges used by exactly one triangle. That is 20 vertices per
    # arm, exactly the ring where the limb stops.
    # The previous version guessed instead: it took the vertices weighted to
    # the upper-arm bone and kept the 6% furthest from the elbow. Those are
    # NOT the ring - they sit up the bicep - so the probe passed the shotgun
    # at 1.02/0.85 while half the real ring was on screen at 0.79 and all of
    # it at 0.70, and the stump stayed visible after two "fixes" (user report
    # 2026-08-21, three times running).
    page.evaluate("""(() => {
      let ring = null;
      function findRing(rig) {
        const g = rig.model.mesh.geometry;
        const pos = g.attributes.position, idx = g.index.array;
        const map = new Map(), rep = new Int32Array(pos.count);
        const q = v => Math.round(v * 1e5);
        for (let i = 0; i < pos.count; i++) {
          const k = q(pos.getX(i)) + ',' + q(pos.getY(i)) + ',' + q(pos.getZ(i));
          if (!map.has(k)) map.set(k, i);
          rep[i] = map.get(k);
        }
        const cnt = new Map();
        for (let t = 0; t < idx.length; t += 3) {
          const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
          for (const [x, y] of [[a, b], [b, c], [c, a]]) {
            const k = x < y ? x + '_' + y : y + '_' + x;
            cnt.set(k, (cnt.get(k) || 0) + 1);
          }
        }
        const border = new Set();
        for (const [k, c] of cnt) {
          if (c === 1) { const p = k.split('_'); border.add(+p[0]); border.add(+p[1]); }
        }
        const mesh = rig.model.mesh;
        const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
        const out = { L: [], R: [] };
        for (let i = 0; i < pos.count; i++) {
          if (!border.has(rep[i])) continue;
          let best = -1, bw = 0;
          for (let k = 0; k < 4; k++) {
            const w = sw.getComponent(i, k);
            if (w > bw) { bw = w; best = si.getComponent(i, k); }
          }
          for (const side of ['L', 'R']) {
            if (best === mesh.skeleton.bones.indexOf(rig[side].bones.upper)) out[side].push(i);
          }
        }
        return out;
      }
      window.__capProbe = () => {
        camera.updateMatrixWorld(true);
        const rig = viewmodels[currentWeapon].userData.arms;
        if (!ring) ring = findRing(rig);
        const mesh = rig.model.mesh, v = new THREE.Vector3(), o = {};
        for (const side of ['L', 'R']) {
          let on = 0, n = 0, minAbsY = 9;
          for (const i of ring[side]) {
            mesh.getVertexPosition(i, v);
            mesh.localToWorld(v);
            const cam = v.clone(); camera.worldToLocal(cam);
            v.project(camera);
            n++;
            if (cam.z < -0.08) {
              minAbsY = Math.min(minAbsY, Math.abs(v.y));
              if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1) on++;
            }
          }
          o[side] = { on, n, minAbsY: Math.round(minAbsY * 100) / 100 };
        }
        return o;
      };
    })()""")
    page.evaluate("spawnEnemy('scout', {at: {x: 2.5, z: 14}})")  # scale reference
    for i, wid in enumerate(["pistol", "smg", "shotgun", "rifle", "sniper"]):
        page.evaluate(f"switchWeapon({i}); camera.rotation.set(0, 0, 0)")
        time.sleep(0.6)
        page.screenshot(path=str(OUT / f"w_{wid}_hip.png"))
        page.mouse.down(button="right")
        # dt is clamped, so under SwiftShader game time runs slower than the
        # wall clock - a short wait catches ADS mid-blend and the shot lies
        time.sleep(4.0)
        page.evaluate("camera.rotation.set(0, 0, 0)")
        time.sleep(0.2)
        page.screenshot(path=str(OUT / f"w_{wid}_ads.png"))
        for (name, x, y, z) in SIGHTS.get(i, []):
            r = page.evaluate(f"""(() => {{
              const vm = viewmodels[{i}];
              const p = new THREE.Vector3({x}, {y}, {z});
              vm.updateWorldMatrix(true, false);
              vm.localToWorld(p);
              p.project(camera);
              return {{x: Math.round(p.x * 1000) / 1000,
                       y: Math.round(p.y * 1000) / 1000}};
            }})()""")
            flag = "" if abs(r["x"]) < 0.02 and abs(r["y"]) < 0.02 else "  << OFF AXIS"
            print(f"{name:16s} ndc x={r['x']:+.3f} y={r['y']:+.3f}{flag}")
        if i in SIGHTS:
            # the aim dot must actually be VISIBLE: the first viewmodel mesh on
            # the camera axis has to be the emitter, not gun geometry in front
            occ = page.evaluate(f"""(() => {{
              const vm = viewmodels[{i}];
              const rc = new THREE.Raycaster();
              const dir = new THREE.Vector3();
              camera.getWorldDirection(dir);
              rc.set(camera.position, dir);
              // baked meshes carry material ARRAYS (one entry per geometry
              // group) - resolve the hit face to its group's material
              const matOf = h => {{
                const m = h.object.material;
                if (!Array.isArray(m)) return m;
                const fi = h.faceIndex * 3;
                for (const gr of h.object.geometry.groups) {{
                  if (fi >= gr.start && fi < gr.start + gr.count) {{
                    return m[gr.materialIndex];
                  }}
                }}
                return m[0];
              }};
              const hits = rc.intersectObject(vm, true)
                .filter(h => {{
                  const m = matOf(h);
                  return m !== vmMatHidden;
                }});
              if (!hits.length) return 'nothing on axis';
              return matOf(hits[0]) === vmMatDot ? 'dot'
                : 'occluded at ' + Math.round(hits[0].distance * 100) / 100 + ' m';
            }})()""")
            flag = "" if occ == "dot" else "  << DOT NOT VISIBLE"
            print(f"{'  first hit':16s} {occ}{flag}")
        # The arms are CUT at the shoulder, so that end must never be on
        # screen: it reads as a limb stopping short in mid-air (user report
        # 2026-08-21, on the SMG under ADS).
        # This measures the CAP ITSELF, not the shoulder joint. The joint is a
        # bad proxy for it: the cap sits a good way past the joint and leaves
        # the frame first, so the joint reads "on screen" for a perfectly
        # framed arm - it does on every long gun. The cap vertices are the
        # ones bound to the root upper-arm bone and furthest from the elbow;
        # they are skinned on the CPU and projected.
        cap = page.evaluate("__capProbe()")
        for k in ("L", "R"):
            h = cap[k]
            flag = "  << CUT END IN FRAME" if h["on"] else ""
            print(f"{'  ' + k + ' arm cap':16s} {h['on']}/{h['n']} on screen, "
                  f"nearest |ndc y| {h['minAbsY']:.2f}{flag}")
        page.mouse.up(button="right")
        time.sleep(0.4)

    # ---- arms: the shoulder is anchored to the body, not carried by the gun --
    # The reload used to slide the whole arm after the fist and the sprint
    # swung both arms out sideways with the gun (user report 2026-08-19); the
    # IK in js/hands.js fixed that, and these two invariants are what it buys.
    # Both are geometric, because a dark glove on a dark arena cannot be
    # judged from a screenshot.
    page.evaluate("""(() => {
      window.__armProbe = () => {
        const rig = viewmodels[currentWeapon].userData.arms, out = {};
        for (const k of ['L', 'R']) {
          const h = rig[k];
          const s = new THREE.Vector3();
          h.bones.upper.getWorldPosition(s);
          const g = new THREE.Vector3(); gripAnchor(h, g);
          out[k] = { sh: camera.worldToLocal(s).toArray(), grip: g.toArray() };
        }
        return out;
      };
      // hold the reload clock so a frame can be sampled mid-animation
      window.__freeze = null;
      const orig = updateViewmodel;
      updateViewmodel = function (dt) {
        if (window.__sprint) player.sprinting = true;
        if (window.__freeze !== null && reloading && relPlan) {
          reloadTimer = reloadDuration * (1 - window.__freeze);
        }
        orig(dt);
      };
    })()""")
    page.evaluate("switchWeapon(0)")
    time.sleep(0.6)
    rest = page.evaluate("__armProbe()")

    def report(name, now, moved_hand, allow=0.16):
        bad = []
        for k in ("L", "R"):
            d = max(abs(a - b) for a, b in zip(rest[k]["sh"], now[k]["sh"]))
            if d > allow:                     # the give, plus the lean assist
                bad.append(f"{k} shoulder drifted {d:.3f}")
            if k != moved_hand:
                g = max(abs(a - b) for a, b in zip(rest[k]["grip"], now[k]["grip"]))
                if g > 0.004:
                    bad.append(f"{k} hand came off the grip by {g:.3f}")
        print(f"{name:28s} {'OK' if not bad else '  << ' + '; '.join(bad)}")

    for t in (0.16, 0.32, 0.58, 0.75):
        page.evaluate(f"""(() => {{
          const w = WEAPONS[0]; w.mag = 0; w.reserve = 60;
          reloading = false; relPlan = null;
          window.__freeze = {t}; startReload();
        }})()""")
        time.sleep(0.5)
        report(f"reload t={t}", page.evaluate("__armProbe()"), "L")
    page.evaluate("window.__freeze = null; reloading = false; relPlan = null; resetWeaponFx()")
    time.sleep(0.4)
    # The run keeps BOTH hands on the gun (user call 2026-08-19), so neither
    # may slide off it while the shoulders stay with the body - and this one
    # runs on EVERY weapon, because the carry that was rejected before was the
    # one that read fine on the pistol and wrong on the long guns.
    for i, wid in enumerate(["pistol", "smg", "shotgun", "rifle", "sniper"]):
        page.evaluate(f"window.__sprint = false; switchWeapon({i})")
        time.sleep(0.7)
        rest = page.evaluate("__armProbe()")
        page.evaluate("window.__sprint = true")
        time.sleep(1.4)
        # The run squares the shoulders up on purpose (SPRINT_SHOULDER in
        # weapons.js, 0.16 m on the left) and drops them per weapon on top
        # (SPRINT_SHOULDER_TWEAK: the shotgun takes 0.26 m down), so all of
        # that is intent, not drift.
        # ⚠️ 0.26 -> 0.30 (2026-08-26): the old allowance sat EXACTLY on the
        # shotgun's dialled drop, so the result was a coin flip on how far the
        # blend had eased in by the time the frame was sampled - measured
        # 0.261 on one run and inside on the next. The guard is still real:
        # what it was written to catch (the arms swinging out bodily with the
        # gun) is several times this.
        report(f"sprint carry {wid}", page.evaluate("__armProbe()"), None, allow=0.30)
    page.evaluate("window.__sprint = false")

    # ---- ADS: the body squares up BEHIND the gun ---------------------------
    # The gun crosses to the centre of the screen; if the shoulders do not go
    # with it they stay out to the right and both arms reach in diagonally,
    # which the wrists pay for (user report 2026-08-21: "the hands are twisted
    # and anchored to the right"). ARM_ADS_FOLLOW in weapons.js is the dial;
    # this is what it has to buy. The shoulders sit behind the near plane, so
    # this is camera space, not NDC - project() is meaningless back there.
    for i, wid in enumerate(["pistol", "smg", "shotgun", "rifle", "sniper"]):
        page.evaluate(f"switchWeapon({i})")
        time.sleep(0.7)
        rest = page.evaluate("__armProbe()")
        page.mouse.down(button="right")
        time.sleep(3.5)
        now = page.evaluate("__armProbe()")
        page.mouse.up(button="right")
        time.sleep(1.0)
        bad = []
        # A pistol is shot squared up, so its shoulders straddle the barrel.
        # A long gun's stock sits in the right shoulder pocket, so those are
        # allowed to stay right of it - the guard is against the flat follow
        # this replaced, which parked every weapon at +0.19 to +0.23.
        limit = 0.09 if wid == "pistol" else 0.17
        mid = (now["L"]["sh"][0] + now["R"]["sh"][0]) / 2
        if abs(mid) > limit:
            bad.append(f"shoulders {mid:+.3f} off the sight line (max {limit})")
        for k in ("L", "R"):
            g = max(abs(a - b) for a, b in zip(rest[k]["grip"], now[k]["grip"]))
            if g > 0.004:
                bad.append(f"{k} hand came off the grip by {g:.3f}")
        print(f"{'ads squared ' + wid:28s} {'OK' if not bad else '  << ' + '; '.join(bad)}")

    print("pageerrors:", errs[:5])
    b.close()
