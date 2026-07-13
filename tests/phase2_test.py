# -*- coding: utf-8 -*-
"""Phase 2 verification: campaign skeleton.

  1. ?test=mission -> m1 boots, objectives active, kill-through -> debrief
  2. debrief -> armory (consumables hidden) -> buy -> briefing -> m2 with upgrades
  3. m2 survive completes -> debrief; campaign save has m1+m2 done
  4. death -> mfail; credits rolled back; restart keeps upgrades
  5. difficulty: diff=hard multiplies hpMul
  6. arena regression: ?test=win still passes after the waves.js rewrite
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

def wait_for(page, expr, timeout=40, poll=0.3):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(expr):
            return True
        time.sleep(poll)
    return False

def grind_until_state(page, state, timeout=90):
    """Kill everything repeatedly until game.state == state (drives wave missions)."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        t = page.evaluate("window.__test")
        if t.get("state") == state:
            return t
        if t.get("state") == "playing":
            page.evaluate("window.__killAll()")
        time.sleep(0.5)
    return page.evaluate("window.__test")

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1: m1 full flow ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m1")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mode === 'campaign'")
    check("m1: boots into campaign", ok, page.evaluate("window.__test.state"))
    m = page.evaluate("window.__test.mission")
    check("m1: waves objective active", m and m["active"]
          and m["objectives"][0]["type"] == "waves" and m["objectives"][0]["state"] == "active", str(m))
    t = grind_until_state(page, "debrief")
    check("m1: reaches debrief", t.get("state") == "debrief", str(t.get("state")))
    check("m1: no errors", not t.get("errors"), str(t.get("errors"))[:300])
    credits1 = page.evaluate("game.credits")
    check("m1: bonus paid", credits1 >= 100, str(credits1))
    save = page.evaluate("JSON.parse(localStorage.getItem('status1_save'))")
    check("m1: saved as done", save and save["missions"].get("m1", {}).get("done") is True,
          str(save)[:200])

    # --- 2: armory -> briefing -> m2 with upgrades carried over ---
    page.evaluate("debriefContinue()")
    check("armory: state shop", page.evaluate("game.state") == "shop", "")
    hidden = page.evaluate(
        "!document.querySelector('#shop-items [data-item=heal]') &&"
        "!document.querySelector('#shop-items [data-item=ammo]')")
    check("armory: consumables hidden", hidden, "")
    title = page.evaluate("document.getElementById('shop-title').textContent")
    check("armory: title Zbrojownia", title == "Zbrojownia", title)
    page.evaluate("window.__addCredits(500); window.__buyItem('maxhp'); window.__buyItem('w_shotgun')")
    page.evaluate("armoryContinue()")
    check("briefing: state brief", page.evaluate("game.state") == "brief", "")
    page.evaluate("startBriefedMission()")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission && window.__test.mission.id === 'm2'")
    check("m2: started from briefing", ok, "")
    carry = page.evaluate("({max: player.maxHp, sg: WEAPONS[1].owned, credits: game.credits})")
    check("m2: upgrades carried over", carry["max"] == 125 and carry["sg"] is True, str(carry))

    # --- 3: m2 (a hack mission since Phase 3) -> debrief ---
    page.evaluate("player.maxHp = 100000; player.hp = 100000; window.__killAll()")
    for tid in ("t1", "t2", "t3"):
        page.evaluate(f"const p = getProp('{tid}'); p.hackT = p.hackNeed - 0.3;"
                      f"window.__teleport(p.pos.x + 1.2, p.pos.z)")
        wait_for(page, f"getProp('{tid}').hacked === true", timeout=20)
        page.evaluate("window.__killAll()")
    t0 = time.time()
    while time.time() - t0 < 60:
        if page.evaluate("game.state") == "debrief":
            break
        page.evaluate("window.__killAll()")
        page.evaluate("const z = getProp('ext'); window.__teleport(z.pos.x, z.pos.z)")
        time.sleep(0.5)
    t = page.evaluate("window.__test")
    check("m2: hack mission completes", t.get("state") == "debrief", str(t.get("state")))
    save = page.evaluate("JSON.parse(localStorage.getItem('status1_save'))")
    check("m2: both missions done", save["missions"].get("m2", {}).get("done") is True, "")
    check("m2: run persisted with items", save["run"]["items"].get("maxhp") == 1
          and save["run"]["items"].get("w_shotgun") == 1, str(save["run"])[:200])
    page.close()

    # --- 4: death -> mfail -> restart keeps upgrades, rolls credits back ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m1")
    wait_for(page, "window.__test.state === 'playing'")
    page.evaluate("window.__addCredits(300)")  # bank before... no: mission started, counts as attempt
    base_credits = page.evaluate("mission.creditsAtStart")
    page.evaluate("playerTakeDamage(9999)")
    ok = wait_for(page, "game.state === 'mfail'", timeout=10)
    check("death: mfail screen", ok, page.evaluate("game.state"))
    rolled = page.evaluate("game.credits")
    check("death: credits rolled back", rolled == base_credits, f"{rolled} vs {base_credits}")
    page.evaluate("window.__addCredits(200); window.__buyItem('maxhp')")  # buy via armory-ish hook
    page.evaluate("restartMission()")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission.id === 'm1'")
    maxhp = page.evaluate("player.maxHp")
    check("restart: playing again, upgrades kept", ok and maxhp == 125, f"maxHp {maxhp}")
    check("restart: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 5: difficulty wiring ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m1&diff=hard")
    wait_for(page, "window.__test.state === 'playing' && waveSystem.wave >= 1", timeout=30)
    mul = page.evaluate("({hp: waveSystem.hpMul, dmg: waveSystem.dmgMul, diff: game.difficulty})")
    check("difficulty: hard multipliers", abs(mul["hp"] - 1.15) < 0.001
          and abs(mul["dmg"] - 1.30) < 0.001 and mul["diff"] == "hard", str(mul))
    page.close()

    # --- 6: arena regression after the waves.js rewrite ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=win&seed=424242")
    t0 = time.time()
    t = {}
    while time.time() - t0 < 120:
        t = page.evaluate("window.__test")
        if t.get("state") == "won":
            break
        time.sleep(0.5)
    check("arena: ?test=win still passes", t.get("state") == "won",
          f"state {t.get('state')} wave {t.get('wave')}")
    check("arena: mode is arena", t.get("mode") == "arena", str(t.get("mode")))
    check("arena: no errors", not t.get("errors"), str(t.get("errors"))[:300])
    page.close()

    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 2 CHECKS PASSED")
