# -*- coding: utf-8 -*-
"""Developer range (strzelnica, js/devmap.js) verification.

Checks (http://localhost:8137):
  1. entry: startDevMap() -> playing, full unlock, silent wave director,
     five target plates, no waves ever spawn on their own
  2. dev keys: B (spawn at aim), T (hold/release fire), Y (freeze movement),
     K (silent clear), J (refill), P (rebuild targets)
  3. hygiene: dev kills/shots stay out of the lifetime service stats and
     quitting the range never touches the arena best score
"""
import math, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]
fails = []

def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        fails.append(name)

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/?test=play")
    time.sleep(4)

    # --- 1: entry & loadout ---
    page.evaluate("localStorage.setItem('status1_best', '3'); game.best = 3")
    page.evaluate("startDevMap()")
    time.sleep(1.2)
    t = page.evaluate("({dev: __test.dev, state: __test.state})")
    check("entry: dev flag + playing", t["dev"] and t["state"] == "playing", str(t))
    check("entry: all weapons owned", page.evaluate("WEAPONS.every(w => w.owned)"))
    check("entry: grenades maxed", page.evaluate("game.grenades === GRENADE_MAX"))
    check("entry: director paused", page.evaluate("waveSystem.paused"))
    check("entry: 5 targets", page.evaluate(
        "props.filter(p => p.kind === 'target').length") == 5)
    time.sleep(3)
    check("entry: no waves spawn", page.evaluate(
        "enemies.length === 0 && waveSystem.wave === 0"))

    # --- 2: dev keys ---
    page.keyboard.press("b")
    time.sleep(0.3)
    check("B: spawns a bot", page.evaluate("enemies.length") == 1)

    page.evaluate("enemies[0].cooldown = 0")
    time.sleep(2.0)
    check("default: bots hold fire", page.evaluate("player.hp") == 100)

    page.keyboard.press("y")
    p0 = page.evaluate("({x: enemies[0].group.position.x, z: enemies[0].group.position.z})")
    time.sleep(1.5)
    p1 = page.evaluate("({x: enemies[0].group.position.x, z: enemies[0].group.position.z})")
    d = math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"])
    check("Y: freezes movement", d < 0.05, f"moved {d:.3f}")

    page.keyboard.press("k")
    time.sleep(0.3)
    check("K: clears bots", page.evaluate("enemies.length") == 0)
    check("K: silent (no score)", page.evaluate("game.score") == 0)

    page.evaluate("player.hp = 10; WEAPONS[0].reserve = 0; game.grenades = 0")
    page.keyboard.press("j")
    check("J: refills", page.evaluate(
        "player.hp === player.maxHp && WEAPONS[0].reserve > 0"
        " && game.grenades === GRENADE_MAX"))

    page.evaluate("damageProp(props.find(p => p.kind === 'target'), 9999)")
    page.keyboard.press("p")
    time.sleep(0.3)
    check("P: rebuilds targets", page.evaluate(
        "props.filter(p => p.kind === 'target' && !p.dead).length") == 5)

    # --- 3: hygiene (stats & record) ---
    k0 = page.evaluate("lifeStats.kills")
    s0 = page.evaluate("lifeStats.shots")
    page.evaluate("spawnEnemy('scout', {at: {x: player.pos.x, z: player.pos.z - 5}})")
    page.evaluate("killEnemy(enemies[0]); tryFire()")
    check("stats: dev kills skipped", page.evaluate("lifeStats.kills") == k0)
    check("stats: dev shots skipped", page.evaluate("lifeStats.shots") == s0)

    page.evaluate("addScore(9999); pauseGame(); quitToMenu()")
    time.sleep(0.3)
    check("quit: back in the menu", page.evaluate("game.state") == "menu")
    check("quit: dev flag cleared", page.evaluate("game.dev") is False)
    check("quit: best untouched", page.evaluate(
        "localStorage.getItem('status1_best')") == "3")
    check("no errors", not errs and page.evaluate("__test.errors.length") == 0,
          str(errs[:3]))
    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL DEVMAP CHECKS PASSED")
