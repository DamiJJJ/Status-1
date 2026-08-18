# -*- coding: utf-8 -*-
"""Visual pass on the baked CC-BY models: bot chassis + Glock viewmodel."""
import time, pathlib, json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
OUT = pathlib.Path(__file__).parent / "_shots"
OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]

POSE = """
(() => {
  __killAll();
  const p = player.pos;
  camera.rotation.set(0, 0, 0);
  const types = ['scout', 'scout', 'scout'];
  types.forEach((t, i) => {
    const e = spawnEnemy(t, { at: { x: p.x, z: p.z - 6 }, passive: true,
                              marchDir: { x: 0, z: 1 } });
    e.marchDir.set(0, 0, 0);
    e.group.position.set(p.x + (i - 1) * 1.7, 0, p.z - 5.5);
    e.cooldown = 999;
  });
  return enemies.length;
})()
"""

with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/?test=play&seed=7")
    time.sleep(4)

    print("spawned:", page.evaluate(POSE))
    time.sleep(1.2)
    page.screenshot(path=str(OUT / "m_bots.png"))

    # close-up on a single assault bot
    page.evaluate("""(() => {
      __killAll();
      const p = player.pos;
      const e = spawnEnemy('scout', { at: { x: p.x, z: p.z - 3 }, passive: true,
                                        marchDir: { x: 0, z: 1 } });
      e.marchDir.set(0, 0, 0);
      e.group.position.set(p.x, 0, p.z - 2.6);
      e.cooldown = 999;
      camera.rotation.set(-0.1, 0, 0);
    })()""")
    time.sleep(1.0)
    page.screenshot(path=str(OUT / "m_bot_closeup.png"))

    # side view: arm pose + bot gun
    page.evaluate('''(() => {
      const e = enemies[0];
      const p = player.pos;
      e.group.position.set(p.x + 2.4, 0, p.z - 2.4);
      e.group.rotation.y = -Math.PI / 2;
      camera.rotation.set(-0.12, -0.72, 0);
    })()''')
    time.sleep(0.6)
    page.screenshot(path=str(OUT / "m_bot_side.png"))

    # viewmodel: hip + ADS
    page.evaluate("__killAll()")
    time.sleep(0.4)
    page.screenshot(path=str(OUT / "m_pistol_hip.png"))
    page.mouse.down(button="right")
    time.sleep(1.0)
    page.screenshot(path=str(OUT / "m_pistol_ads.png"))
    page.mouse.up(button="right")

    st = page.evaluate("JSON.stringify({errors: __test.errors, state: __test.state})")
    print("state:", st)
    print("pageerrors:", errs[:5])
    b.close()
