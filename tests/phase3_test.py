# -*- coding: utf-8 -*-
"""Phase 3 verification: props, zones, hack/destroy/extract, objective HUD & markers."""
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

def wait_for(page, expr, timeout=40, poll=0.3):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(expr):
            return True
        time.sleep(poll)
    return False

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1: m2 hack + extract flow ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m2")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'm2'")
    check("m2: boots", ok, "")
    check("m2: arena reachable with set-pieces", page.evaluate("window.__test.arenaReachable") is True, "")
    check("m2: 4 props built", page.evaluate("props.length") == 4, str(page.evaluate("props.length")))
    hud = page.evaluate("({on: el('hud-objective').classList.contains('on'),"
                        "  text: el('obj-text').textContent, markers: document.querySelectorAll('.obj-marker').length})")
    check("m2: objective HUD on with hack text", hud["on"] and "Zhakuj" in hud["text"], str(hud))
    check("m2: 3 terminal markers", hud["markers"] == 3, str(hud["markers"]))

    # god mode for flow testing; keep the arena quiet
    page.evaluate("player.maxHp = 100000; player.hp = 100000; window.__killAll()")

    # legit-hack t1: teleport into radius and let time pass
    page.evaluate("const p = getProp('t1'); window.__teleport(p.pos.x + 1.2, p.pos.z)")
    ok = wait_for(page, "getProp('t1').hacked === true", timeout=45)
    check("m2: t1 hacked by standing in radius", ok,
          str(page.evaluate("({t: getProp('t1').hackT, need: getProp('t1').hackNeed})")))
    # fast-forward t2/t3 (flow test, not endurance test)
    for tid in ("t2", "t3"):
        page.evaluate(f"const p = getProp('{tid}'); p.hackT = p.hackNeed - 0.3;"
                      f"window.__teleport(p.pos.x + 1.2, p.pos.z)")
        ok = wait_for(page, f"getProp('{tid}').hacked === true", timeout=20)
        check(f"m2: {tid} hacked", ok, "")
        page.evaluate("window.__killAll()")
    ok = wait_for(page, "window.__test.mission.objectives[0].state === 'done'", timeout=10)
    check("m2: hack objective done, extract unlocked", ok and page.evaluate(
        "window.__test.mission.objectives[1].state") == "active", "")
    mk = page.evaluate("document.querySelectorAll('.obj-marker').length")
    check("m2: markers switched to extraction", mk == 1, str(mk))
    ring = page.evaluate("getProp('ext').meshes[0].visible")
    check("m2: extraction ring visible", ring is True, "")
    page.evaluate("const z = getProp('ext'); window.__teleport(z.pos.x, z.pos.z)")
    t0 = time.time()
    while time.time() - t0 < 40:
        st = page.evaluate("game.state")
        if st == "debrief":
            break
        page.evaluate("window.__killAll()")
        time.sleep(0.5)
    check("m2: extract completes -> debrief", page.evaluate("game.state") == "debrief", "")
    check("m2: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 2: m3 destroy + AoE + extract ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m3")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'm3'")
    check("m3: boots", ok, "")
    check("m3: reachable", page.evaluate("window.__test.arenaReachable") is True, "")
    # AoE: stand next to g1 and blow it up -> player takes damage
    page.evaluate("window.__killAll(); const g = getProp('g1'); window.__teleport(g.pos.x + 2, g.pos.z)")
    hp0 = page.evaluate("player.hp")
    page.evaluate("damageProp(getProp('g1'), 9999)")
    hp1 = page.evaluate("player.hp")
    check("m3: generator AoE hurts the player", hp1 < hp0, f"{hp0} -> {hp1}")
    # read live mission state, not the per-frame __test snapshot (headless
    # frames are slow; the snapshot lags one tick behind)
    check("m3: g1 counted", page.evaluate("mission.objectives[0].cur") == 1, "")
    page.evaluate("damageProp(getProp('g2'), 9999); damageProp(getProp('g3'), 9999)")
    ok = wait_for(page, "window.__test.mission.objectives[1]?.state === 'active'", timeout=10)
    check("m3: extract unlocked after generators", ok, str(page.evaluate("window.__test.mission")))
    page.evaluate("player.hp = 100000; player.maxHp = 100000")
    page.evaluate("const z = getProp('ext'); window.__teleport(z.pos.x, z.pos.z)")
    t0 = time.time()
    while time.time() - t0 < 40:
        if page.evaluate("game.state") == "debrief":
            break
        page.evaluate("window.__killAll()")
        time.sleep(0.5)
    check("m3: completes -> debrief", page.evaluate("game.state") == "debrief", "")
    check("m3: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 3: arena regression (props code must not disturb layouts) ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play&seed=424242")
    wait_for(page, "window.__test.state === 'playing'")
    h = page.evaluate("window.__test.arenaHash")
    check("arena: hash still unchanged", h == -385.02, str(h))
    check("arena: objective HUD hidden", page.evaluate(
        "el('hud-objective').classList.contains('on')") is False, "")
    check("arena: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 3 CHECKS PASSED")
