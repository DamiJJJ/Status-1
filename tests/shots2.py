# -*- coding: utf-8 -*-
"""Visual check: police liveries + strobes + UAV + log panels + themes."""
import time, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
OUT = pathlib.Path(__file__).parent / "_shots"
OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    # drone line-up: spawn all four types close to the player in the tutorial hall
    page.goto(f"{BASE}/?test=mission&m=t0")
    t0 = time.time()
    while time.time() - t0 < 30:
        if page.evaluate("window.__test.state === 'playing'"):
            break
        time.sleep(0.4)
    page.evaluate("""
      player.maxHp = 100000; player.hp = 100000;
      spawnEnemy('scout',   { at: { x: -4, z: 6 } });
      spawnEnemy('assault', { at: { x: -1, z: 6 } });
      spawnEnemy('heavy',   { at: { x: 2.5, z: 6 } });
      spawnEnemy('uav',     { at: { x: 6, z: 6 } });
      for (const e of enemies) { e.passive = true; e.marchDir = new THREE.Vector3(0, 0, 0.0001); }
      window.__teleport(0, 13);
      camera.rotation.set(0, 0, 0);  // yaw 0 looks toward -Z, where the line-up stands
    """)
    time.sleep(1.2)
    page.screenshot(path=str(OUT / "shot_drones.png"))
    # look at a log panel (they hang at ±(half*0.7) on the walls)
    page.evaluate("window.__teleport(-8, -6); camera.rotation.set(0, Math.PI * 0.5, 0)")
    time.sleep(0.8)
    page.screenshot(path=str(OUT / "shot_logs.png"))
    browser.close()

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    # ember theme (m6 corridors)
    page.goto(f"{BASE}/?test=mission&m=m6")
    t0 = time.time()
    while time.time() - t0 < 30:
        if page.evaluate("window.__test.state === 'playing'"):
            break
        time.sleep(0.4)
    page.evaluate("player.maxHp = 100000; player.hp = 100000")
    time.sleep(6)
    page.screenshot(path=str(OUT / "shot_theme_ember.png"))
    browser.close()

print("done")
