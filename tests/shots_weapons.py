# -*- coding: utf-8 -*-
"""Visual pass on the baked weapon viewmodels: hip + ADS per weapon, plus a
numeric ADS alignment check (each sight point projected onto the camera axis
must land at NDC ~0,0 - dark sights on dark screenshots cannot be judged by
eye). Runs on the dev range so every weapon is unlocked."""
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
        time.sleep(1.2)
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
    print("pageerrors:", errs[:5])
    b.close()
