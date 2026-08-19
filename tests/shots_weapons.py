# -*- coding: utf-8 -*-
"""Visual pass on the baked weapon viewmodels: hip + ADS per weapon, plus two
numeric checks that a screenshot cannot settle - dark sights and black gloves
on a dark arena:
  * ADS alignment: each sight point projected onto the camera axis has to land
    at NDC ~0,0, and the aim dot has to be the first thing on that axis;
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
    1: [("smg dot", 0, 0.1641, -0.4050)],
    2: [("shotgun dot", 0, 0.0904, -0.9200)],
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

    def report(name, now, moved_hand):
        bad = []
        for k in ("L", "R"):
            d = max(abs(a - b) for a, b in zip(rest[k]["sh"], now[k]["sh"]))
            if d > 0.16:                      # the give, plus the lean assist
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
        report(f"sprint carry {wid}", page.evaluate("__armProbe()"), None)
    page.evaluate("window.__sprint = false")

    print("pageerrors:", errs[:5])
    b.close()
