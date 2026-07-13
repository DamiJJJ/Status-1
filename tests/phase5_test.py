# -*- coding: utf-8 -*-
"""Phase 5 verification: gates, UAV, shielded boss, certification, epilogue parade."""
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

def finish_extract(page, zid="ext", timeout=45):
    page.evaluate(f"const z = getProp('{zid}'); window.__teleport(z.pos.x, z.pos.z)")
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = page.evaluate("game.state")
        if st in ("debrief", "brief"):
            return st
        page.evaluate("window.__killAll()")
        page.evaluate(f"const z = getProp('{zid}'); window.__teleport(z.pos.x, z.pos.z)")
        time.sleep(0.5)
    return page.evaluate("game.state")

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1: m6 gates ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m6")
    wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'm6'")
    page.evaluate("player.maxHp = 100000; player.hp = 100000")
    ok = wait_for(page, "enemies.length >= 2", timeout=40)
    check("m6: gates stream units without waves", ok, str(page.evaluate("enemies.length")))
    check("m6: reachable", page.evaluate("window.__test.arenaReachable") is True, "")
    page.evaluate("for (const id of ['gate1','gate2','gate3']) damageProp(getProp(id), 9999)")
    ok = wait_for(page, "mission.objectives[0].state === 'done'", timeout=10)
    check("m6: gates destroyed -> objective done", ok, "")
    n0 = page.evaluate("enemies.length")
    time.sleep(4)
    page.evaluate("window.__killAll()")
    time.sleep(2)
    n1 = page.evaluate("enemies.length")
    check("m6: dead gates stop spawning", n1 == 0, f"{n0} -> {n1}")
    st = finish_extract(page)
    check("m6: completes", st == "debrief", st)
    check("m6: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 2: m7 UAV + relay run ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m7")
    wait_for(page, "window.__test.state === 'playing'")
    page.evaluate("player.maxHp = 100000; player.hp = 100000")
    ok = wait_for(page, "enemies.some(e => e.typeName === 'uav')", timeout=60)
    check("m7: UAV spawns", ok, "")
    fly = page.evaluate(
        "(() => { const u = enemies.find(e => e.typeName === 'uav');"
        "  return u ? Math.round(u.group.position.y * 10) / 10 : -1; })()")
    check("m7: UAV hovers ~3 m", 2.5 <= fly <= 3.5, str(fly))
    for zid in ("r1", "r2", "r3", "r4"):
        page.evaluate(f"const z = getProp('{zid}'); window.__teleport(z.pos.x, z.pos.z)")
        time.sleep(0.8)
    ok = wait_for(page, "mission.objectives[0].state === 'done'", timeout=15)
    check("m7: relay chain done", ok, str(page.evaluate("mission.objectives[0].cur")))
    st = finish_extract(page)
    check("m7: completes", st == "debrief", st)
    check("m7: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 3: m8 shielded boss ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m8")
    wait_for(page, "window.__test.state === 'playing'")
    page.evaluate("player.maxHp = 100000; player.hp = 100000")
    boss = page.evaluate(
        "(() => { const b = enemies.find(e => e.isBoss);"
        "  return b ? { inv: b.invulnerable, scale: Math.round(b.group.scale.x * 100) / 100,"
        "               hp: Math.round(b.hp) } : null; })()")
    check("m8: boss on the field, shielded, scaled", boss and boss["inv"] is True
          and boss["scale"] > 1.7, str(boss))
    hp_before = page.evaluate("enemies.find(e => e.isBoss).hp")
    page.evaluate("damageEnemy(enemies.find(e => e.isBoss), 500)")
    hp_after = page.evaluate("enemies.find(e => e.isBoss).hp")
    check("m8: shield blocks damage", hp_before == hp_after, f"{hp_before} vs {hp_after}")
    page.evaluate("damageProp(getProp('s1'), 9999); damageProp(getProp('s2'), 9999)")
    ok = wait_for(page, "enemies.find(e => e.isBoss)?.invulnerable === false", timeout=10)
    check("m8: stabilizers drop the shield", ok, "")
    t0 = time.time()
    while time.time() - t0 < 60:
        if page.evaluate("game.state") == "debrief":
            break
        page.evaluate("window.__killAll()")
        time.sleep(0.4)
    check("m8: boss kill completes", page.evaluate("game.state") == "debrief", "")
    check("m8: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 4: m9 -> unlocks ep; ep parade + finale ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m9")
    wait_for(page, "window.__test.state === 'playing'")
    page.evaluate("player.maxHp = 100000; player.hp = 100000; window.__killAll()")
    page.evaluate("const p = getProp('core'); p.hackT = p.hackNeed - 0.3;"
                  "window.__teleport(p.pos.x + 1.5, p.pos.z)")
    ok = wait_for(page, "mission.objectives[0].state === 'done'", timeout=20)
    check("m9: core uploaded", ok, "")
    page.evaluate("mission.objectives[1].t = mission.objectives[1].max - 1")
    ok = wait_for(page, "mission.objectives[2] && mission.objectives[2].state === 'active'", timeout=20)
    check("m9: extract unlocked", ok, "")
    st = finish_extract(page)
    check("m9: completes", st == "debrief", st)
    # ep unlocked?
    check("m9: epilogue unlocked", page.evaluate("isMissionUnlocked('ep')") is True, "")
    # go straight into the epilogue (keeps the same page/save)
    page.evaluate("startMission('ep')")
    ok = wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'ep'")
    check("ep: boots", ok, "")
    check("ep: noCombat active", page.evaluate("game.noCombat") is True, "")
    ok = wait_for(page, "enemies.filter(e => e.passive).length >= 3", timeout=40)
    check("ep: parade marches", ok, str(page.evaluate("enemies.length")))
    hud_enemies = page.evaluate("el('enemies-value').textContent")
    check("ep: HUD counts no enemies", hud_enemies == "0", hud_enemies)
    page.evaluate("const z = getProp('ext'); window.__teleport(z.pos.x, z.pos.z)")
    ok = wait_for(page, "game.state === 'brief'", timeout=30)
    title = page.evaluate("el('brief-title').textContent")
    check("ep: finale card STATUS 1", ok and title == "STATUS 1", title)
    fin = page.evaluate("JSON.parse(localStorage.getItem('status1_save')).finished")
    check("ep: campaign marked finished", fin is True, str(fin))
    check("ep: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 5: arena regression after all changes ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=win&seed=424242")
    t0 = time.time()
    t = {}
    while time.time() - t0 < 120:
        t = page.evaluate("window.__test")
        if t.get("state") == "won":
            break
        time.sleep(0.5)
    check("arena: ?test=win passes", t.get("state") == "won", str(t.get("state")))
    check("arena: hash unchanged", t.get("arenaHash") == -385.02, str(t.get("arenaHash")))
    check("arena: no errors", not t.get("errors"), str(t.get("errors"))[:300])
    page.close()

    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 5 CHECKS PASSED")
