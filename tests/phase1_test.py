# -*- coding: utf-8 -*-
"""Phase 1 verification: parametric generator (styles, inner ring, validateArena).

  1. REGRESSION: open/35/0.5 + seed 424242 -> arenaHash == -385.02 (pre-refactor value)
  2. seed sweep x3 styles: 40 seeds each -> arenaReachable, no errors
  3. small arena (?half=23): inner ring exists, spawns inside, reachable
  4. gameplay smoke on pillars + corridors (?test=shoot): kills happen, no errors
"""
import sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]
fails = []

def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        fails.append(name)

def wait_state(page, state, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        t = page.evaluate("window.__test")
        if t and t.get("state") == state:
            return t
        time.sleep(0.25)
    return page.evaluate("window.__test")

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1: layout backward compatibility ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play&seed=424242")
    wait_state(page, "playing")
    h = page.evaluate("window.__test.arenaHash")
    check("regression: seed 424242 hash unchanged", h == -385.02, str(h))
    reach = page.evaluate("window.__test.arenaReachable")
    check("regression: reachable", reach is True, str(reach))
    page.close()

    # --- 2: reachability sweep per style ---
    for style in ("open", "pillars", "corridors"):
        page = browser.new_page()
        page.goto(f"{BASE}/?style={style}&seed=1")
        time.sleep(2.5)
        res = page.evaluate("""() => {
          const out = { unreachable: [], retried: 0, minColliders: 1e9, maxColliders: 0 };
          for (let s = 1; s <= 40; s++) {
            window.__rebuildArena(s);
            if (!window.__test.arenaReachable) out.unreachable.push(s);
            if (window.__test.seed !== s) out.retried++;
            out.minColliders = Math.min(out.minColliders, colliders.length);
            out.maxColliders = Math.max(out.maxColliders, colliders.length);
          }
          out.errors = window.__test.errors;
          return out;
        }""")
        check(f"sweep {style}: all reachable", not res["unreachable"], str(res["unreachable"]))
        check(f"sweep {style}: no errors", not res["errors"], str(res["errors"])[:300])
        check(f"sweep {style}: obstacles exist", res["minColliders"] > 4,
              f"colliders {res['minColliders']}..{res['maxColliders']}, retried {res['retried']}")
        page.close()

    # --- 3: small arena with inner ring ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play&half=23&style=pillars&seed=7")
    t = wait_state(page, "playing")
    check("half=23: playing, no errors", t.get("state") == "playing" and not t.get("errors"),
          str(t.get("errors"))[:200])
    info = page.evaluate("""({
      reach: window.__test.arenaReachable,
      half: arena.half,
      spawnsInside: spawnPoints.every(s => Math.abs(s.x) <= 23 && Math.abs(s.z) <= 23),
      playerInside: Math.abs(player.pos.x) <= 23 && Math.abs(player.pos.z) <= 23,
      pickupsInside: arena.pickups.every(p => Math.abs(p.x) <= 20 && Math.abs(p.z) <= 20),
    })""")
    check("half=23: ring + placement sane",
          info["reach"] and info["half"] == 23 and info["spawnsInside"]
          and info["playerInside"] and info["pickupsInside"], str(info))
    page.close()

    # --- 4: gameplay smoke on the new styles ---
    # corridors: bots have to round the comb walls to reach the player, so
    # give them wall-clock headroom (dt clamp slows game time in headless)
    for style, goal, limit in (("pillars", 300, 60), ("corridors", 100, 150)):
        page = browser.new_page()
        page.goto(f"{BASE}/?test=shoot&style={style}&seed=11")
        t0 = time.time()
        t = {}
        while time.time() - t0 < limit:
            t = page.evaluate("window.__test")
            if t.get("score", 0) >= goal:
                break
            time.sleep(0.4)
        check(f"gameplay {style}: kills happen", t.get("score", 0) >= goal, str(t.get("score")))
        check(f"gameplay {style}: no errors", not t.get("errors"), str(t.get("errors"))[:300])
        page.close()

    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 1 CHECKS PASSED")
