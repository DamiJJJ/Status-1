# -*- coding: utf-8 -*-
"""Phase 5d: FULL campaign playthrough t0 -> ... -> m9 -> ep in one page,
through the real flow (debrief -> armory -> briefing -> next mission),
plus a file:// smoke test."""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
GAME_DIR = pathlib.Path(__file__).resolve().parents[1]
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required", "--allow-file-access-from-files"]
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

def god(page):
    page.evaluate("player.maxHp = 100000; player.hp = 100000")

def tp_zone(page, zid):
    page.evaluate(f"const z = getProp('{zid}'); window.__teleport(z.pos.x, z.pos.z)")

def grind_to_end(page, timeout=90, extract=None):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = page.evaluate("game.state")
        if st in ("debrief", "brief"):
            return st
        page.evaluate("window.__killAll()")
        if extract:
            tp_zone(page, extract)
        time.sleep(0.5)
    return page.evaluate("game.state")

def ff_hack(page, pid):
    page.evaluate(f"const p = getProp('{pid}'); p.hackT = p.hackNeed - 0.3;"
                  f"window.__teleport(p.pos.x + 1.4, p.pos.z)")

def complete(page, mid):
    """Drive mission `mid` to its debrief/finale screen."""
    god(page)
    if mid == "t0":
        tp_zone(page, "w1")
        wait_for(page, "mission.objectives[0].state === 'done'", 15)
        page.evaluate("for (const id of ['c1','c2','c3','core']) damageProp(getProp(id), 999)")
        wait_for(page, "mission.objectives[2].state === 'done'", 10)
        for z in ("g1", "g2", "g3"):
            tp_zone(page, z)
            time.sleep(0.6)
        wait_for(page, "mission.objectives[3].state === 'done'", 15)
        return grind_to_end(page, 90, extract="ext")
    if mid == "m1":
        return grind_to_end(page, 90)
    if mid == "m2":
        for t in ("t1", "t2", "t3"):
            ff_hack(page, t)
            wait_for(page, f"getProp('{t}').hacked === true", 20)
            page.evaluate("window.__killAll()")
        return grind_to_end(page, 60, extract="ext")
    if mid == "m3":
        page.evaluate("for (const id of ['g1','g2','g3']) damageProp(getProp(id), 9999)")
        return grind_to_end(page, 60, extract="ext")
    if mid == "m4":
        page.evaluate("mission.objectives[0].t = mission.objectives[0].max - 1")
        wait_for(page, "mission.objectives[1] && mission.objectives[1].state === 'active'", 20)
        return grind_to_end(page, 60)
    if mid == "m5":
        ff_hack(page, "up1")
        wait_for(page, "mission.objectives[0].state === 'done'", 20)
        return grind_to_end(page, 60, extract="ext")
    if mid == "m6":
        page.evaluate("for (const id of ['gate1','gate2','gate3']) damageProp(getProp(id), 9999)")
        return grind_to_end(page, 60, extract="ext")
    if mid == "m7":
        for z in ("r1", "r2", "r3", "r4"):
            tp_zone(page, z)
            time.sleep(0.7)
        return grind_to_end(page, 60, extract="ext")
    if mid == "m8":
        page.evaluate("damageProp(getProp('s1'), 9999); damageProp(getProp('s2'), 9999)")
        return grind_to_end(page, 90)
    if mid == "m9":
        ff_hack(page, "core")
        wait_for(page, "mission.objectives[0].state === 'done'", 20)
        page.evaluate("mission.objectives[1].t = mission.objectives[1].max - 1")
        wait_for(page, "mission.objectives[2] && mission.objectives[2].state === 'active'", 20)
        return grind_to_end(page, 60, extract="ext")
    if mid == "ep":
        tp_zone(page, "ext")
        wait_for(page, "game.state === 'brief'", 40)
        return page.evaluate("game.state")
    return "?"

ORDER = ["t0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "ep"]

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=t0")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 't0'")
    check("chain: t0 boots", ok, "")

    for i, mid in enumerate(ORDER):
        st = complete(page, mid)
        if mid == "ep":
            check("chain: ep -> finale card", st == "brief"
                  and page.evaluate("el('brief-title').textContent") == "STATUS 1", st)
            break
        check(f"chain: {mid} -> debrief", st == "debrief", st)
        errs = page.evaluate("window.__test.errors")
        if errs:
            check(f"chain: {mid} no errors", False, str(errs)[:200])
            break
        # real flow to the next mission: debrief -> armory -> briefing -> start
        nxt = ORDER[i + 1]
        page.evaluate("debriefContinue()")
        ok = wait_for(page, "game.state === 'shop'", 10)
        page.evaluate("armoryContinue()")
        ok = ok and wait_for(page, "game.state === 'brief'", 10)
        page.evaluate("startBriefedMission()")
        ok = ok and wait_for(
            page, f"window.__test.state === 'playing' && window.__test.mission?.id === '{nxt}'", 30)
        check(f"chain: flow into {nxt}", ok, page.evaluate("game.state"))
        if not ok:
            break

    save = page.evaluate("JSON.parse(localStorage.getItem('status1_save'))")
    done = [m for m in ORDER if save["missions"].get(m, {}).get("done")]
    check("chain: all missions saved as done", len(done) == len(ORDER), f"{len(done)}/{len(ORDER)}")
    check("chain: campaign finished flag", save.get("finished") is True, "")
    check("chain: zero errors overall", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # file:// smoke: campaign mission boots from a double-click context
    page = browser.new_page()
    page.goto((GAME_DIR / "index.html").as_uri() + "?test=mission&m=m2")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'm2'", 45)
    check("file://: campaign mission boots", ok, page.evaluate("window.__test.state"))
    check("file://: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()
    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("FULL CAMPAIGN PLAYTHROUGH PASSED")
