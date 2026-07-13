# -*- coding: utf-8 -*-
"""Phase 0 verification: world lifecycle refactor must leave the game identical.

Checks (http://localhost:8137):
  1. boot + ?test=play: no errors, playing, arenaHash present
  2. __rebuildArena(seed) twice -> identical hash, stable mesh/collider counts
  3. shop idempotency: buy maxhp -> 125 HP; restart -> back to 100
  4. ?test=win: full 5-wave run reaches 'won'
  5. ?test=shoot: kills happen (score grows)
  6. file:// smoke test: boots without errors
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
GAME_DIR = pathlib.Path(__file__).resolve().parents[1]
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required",
        "--allow-file-access-from-files"]

fails = []

def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        fails.append(name)

def wait_test(page, pred, timeout=30, poll=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        t = page.evaluate("window.__test")
        if pred(t):
            return t
        time.sleep(poll)
    return page.evaluate("window.__test")

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1 & 2 & 3: boot, rebuild determinism, shop idempotency ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play&seed=424242")
    t = wait_test(page, lambda t: t and t.get("state") == "playing")
    check("boot: state playing", t.get("state") == "playing", str(t.get("state")))
    check("boot: no errors", not t.get("errors"), str(t.get("errors"))[:300])
    h0 = t.get("arenaHash")
    check("boot: arenaHash present", isinstance(h0, (int, float)), str(h0))

    counts0 = page.evaluate(
        "({ meshes: worldGroup.children.length, colliders: colliders.length,"
        "   decor: decorGroup.children.length, spawns: spawnPoints.length })")
    page.evaluate("window.__rebuildArena(424242)")
    h1 = page.evaluate("window.__test.arenaHash")
    page.evaluate("window.__rebuildArena(424242)")
    h2 = page.evaluate("window.__test.arenaHash")
    counts2 = page.evaluate(
        "({ meshes: worldGroup.children.length, colliders: colliders.length,"
        "   decor: decorGroup.children.length, spawns: spawnPoints.length })")
    check("rebuild x2: identical hash", h0 == h1 == h2, f"{h0} / {h1} / {h2}")
    check("rebuild x2: stable counts", counts0 == counts2, f"{counts0} vs {counts2}")
    check("rebuild: 8 spawn points", counts2["spawns"] == 8, str(counts2["spawns"]))
    check("rebuild: 8 holo panels", counts2["decor"] == 8, str(counts2["decor"]))
    errs = page.evaluate("window.__test.errors")
    check("rebuild: no errors", not errs, str(errs)[:300])

    # different seed -> different hash (sanity that the seed matters)
    page.evaluate("window.__rebuildArena(777)")
    h3 = page.evaluate("window.__test.arenaHash")
    check("rebuild: different seed differs", h3 != h0, f"{h3} vs {h0}")
    page.evaluate("window.__rebuildArena(424242)")

    # shop idempotency: maxhp x1 -> 125 max & +25 hp; restart -> 100
    hp0 = page.evaluate("({max: player.maxHp, hp: player.hp})")
    page.evaluate("window.__addCredits(1000); window.__buyItem('maxhp')")
    hp1 = page.evaluate("({max: player.maxHp, hp: player.hp})")
    check("shop: maxhp raises to 125", hp1["max"] == 125 and hp1["hp"] == hp0["hp"] + 25, str(hp1))
    page.evaluate("window.__buyItem('mag')")
    mag = page.evaluate("WEAPONS[0].magSize")
    check("shop: mag L1 -> pistol 18", mag == 18, str(mag))
    page.evaluate("resetGameState()")
    hp2 = page.evaluate("({max: player.maxHp, hp: player.hp, mag: WEAPONS[0].magSize,"
                        "  owned: WEAPONS.map(w=>w.owned).join(','), res: WEAPONS[0].reserve})")
    check("reset: back to base", hp2["max"] == 100 and hp2["hp"] == 100 and hp2["mag"] == 12
          and hp2["owned"] == "true,false,false,false" and hp2["res"] == 72, str(hp2))
    page.close()

    # --- 4: full ?test=win run ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=win&seed=424242")
    t = wait_test(page, lambda t: t and t.get("state") == "won", timeout=120)
    check("win-run: reaches 'won'", t.get("state") == "won", str(t.get("state")))
    check("win-run: wave 5", t.get("wave") == 5, str(t.get("wave")))
    check("win-run: no errors", not t.get("errors"), str(t.get("errors"))[:300])
    best = page.evaluate("localStorage.getItem('status1_best')")
    check("win-run: best saved", best is not None and int(best) > 0, str(best))
    page.close()

    # --- 5: ?test=shoot sanity (player actually kills bots) ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=shoot&seed=424242")
    t = wait_test(page, lambda t: t and t.get("score", 0) > 0, timeout=45)
    check("shoot: score grows", t.get("score", 0) > 0, str(t.get("score")))
    check("shoot: no errors", not t.get("errors"), str(t.get("errors"))[:300])
    page.close()

    # --- 6: file:// smoke test ---
    page = browser.new_page()
    page.goto((GAME_DIR / "index.html").as_uri() + "?test=play")
    t = wait_test(page, lambda t: t and t.get("state") == "playing", timeout=40)
    check("file://: state playing", t.get("state") == "playing", str(t.get("state")))
    check("file://: no errors", not t.get("errors"), str(t.get("errors"))[:300])
    page.close()

    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 0 CHECKS PASSED")
