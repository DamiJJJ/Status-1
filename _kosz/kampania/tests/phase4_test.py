# -*- coding: utf-8 -*-
"""Phase 4 verification: tutorial chain, radio, medals, m4/m5 flows."""
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

def obj_state(page, idx):
    return page.evaluate(f"mission.objectives[{idx}].state")

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1: tutorial t0 full chain ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=t0")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 't0'")
    check("t0: boots", ok, "")
    check("t0: waves start paused", page.evaluate("waveSystem.paused") is True, "")
    # radio: start lines queued/visible
    ok = wait_for(page, "el('radio-box').classList.contains('on')", timeout=15)
    who = page.evaluate("el('radio-who').textContent")
    check("t0: radio box shows with speaker", ok and who in ("SYSTEM", "CENTRALA"), who)
    # o1 reach
    page.evaluate("const z = getProp('w1'); window.__teleport(z.pos.x, z.pos.z)")
    ok = wait_for(page, "mission.objectives[0].state === 'done'", timeout=15)
    check("t0: o1 reach done", ok, obj_state(page, 0))
    # o2/o3 destroy targets
    page.evaluate("for (const id of ['c1','c2','c3']) damageProp(getProp(id), 999)")
    ok = wait_for(page, "mission.objectives[1].state === 'done'", timeout=10)
    check("t0: o2 targets done", ok, "")
    page.evaluate("damageProp(getProp('core'), 999)")
    ok = wait_for(page, "mission.objectives[2].state === 'done'", timeout=10)
    check("t0: o3 core done", ok, "")
    # o4 gates: touch all three fast (teleport = instant)
    for zid in ("g1", "g2", "g3"):
        page.evaluate(f"const z = getProp('{zid}'); window.__teleport(z.pos.x, z.pos.z)")
        time.sleep(0.6)
    ok = wait_for(page, "mission.objectives[3].state === 'done'", timeout=15)
    check("t0: o4 gates done", ok, str(page.evaluate(
        "({cur: mission.objectives[3].cur, t: mission.objectives[3].t})")))
    check("t0: waves unpaused by o5", page.evaluate("waveSystem.paused") is False, "")
    # o5 eliminate 3 scouts
    t0_ = time.time()
    while time.time() - t0_ < 60:
        if page.evaluate("mission.objectives[4].state === 'done'"):
            break
        page.evaluate("window.__killAll()")
        time.sleep(0.5)
    check("t0: o5 eliminate done", page.evaluate("mission.objectives[4].state") == "done", "")
    page.evaluate("const z = getProp('ext'); window.__teleport(z.pos.x, z.pos.z)")
    ok = wait_for(page, "game.state === 'debrief'", timeout=30)
    check("t0: completes", ok, page.evaluate("game.state"))
    check("t0: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 2: medals on a fast m1 run ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m1")
    wait_for(page, "window.__test.state === 'playing'")
    credits0 = page.evaluate("game.credits")
    t0_ = time.time()
    while time.time() - t0_ < 90:
        if page.evaluate("game.state") == "debrief":
            break
        page.evaluate("window.__killAll()")
        time.sleep(0.4)
    check("m1: debrief", page.evaluate("game.state") == "debrief", "")
    save = page.evaluate("JSON.parse(localStorage.getItem('status1_save'))")
    medals = save["missions"].get("m1", {}).get("medals", [])
    check("m1: all 3 medals (fast, untouched, no shots)", sorted(medals) == ["acc", "hp", "time"],
          str(medals))
    earned = page.evaluate("game.credits") - credits0
    # kills credits rollback... earned includes kills + bonus 100 + medals 75
    check("m1: medal credits paid", earned >= 100 + 75, str(earned))
    strip = page.evaluate("document.querySelectorAll('#debrief-medals .medal.earned').length")
    check("m1: medal strip renders 3 earned", strip == 3, str(strip))
    page.close()

    # --- 3: m4 heavy set-piece ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m4")
    wait_for(page, "window.__test.state === 'playing'")
    page.evaluate("player.maxHp = 100000; player.hp = 100000")
    page.evaluate("mission.objectives[0].t = mission.objectives[0].max - 1")  # fast-forward survive
    ok = wait_for(page, "mission.objectives[1] && mission.objectives[1].state === 'active'", timeout=20)
    check("m4: eliminate unlocked after survive", ok, "")
    ok = wait_for(page, "enemies.some(e => e.typeName === 'heavy')", timeout=10)
    check("m4: heavy spawned by objective", ok, "")
    t0_ = time.time()
    while time.time() - t0_ < 60:
        if page.evaluate("game.state") == "debrief":
            break
        page.evaluate("window.__killAll()")
        time.sleep(0.4)
    check("m4: completes on heavy kill", page.evaluate("game.state") == "debrief", "")
    check("m4: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 4: m5 BAKER radio trigger after o1 ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m5")
    wait_for(page, "window.__test.state === 'playing'")
    page.evaluate("player.maxHp = 100000; player.hp = 100000; window.__killAll()")
    page.evaluate("const p = getProp('up1'); p.hackT = p.hackNeed - 0.3;"
                  "window.__teleport(p.pos.x + 1.5, p.pos.z)")
    ok = wait_for(page, "mission.objectives[0].state === 'done'", timeout=20)
    check("m5: uplink done", ok, "")
    ok = wait_for(
        page,
        "el('radio-box').dataset.who === 'baker' ||"
        "radioQueue.some(l => l.who === 'baker') || (radioCur && radioCur.who === 'baker')",
        timeout=25)
    check("m5: BAKER first contact fires", ok, page.evaluate("el('radio-box').dataset.who || ''"))
    check("m5: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 4 CHECKS PASSED")
