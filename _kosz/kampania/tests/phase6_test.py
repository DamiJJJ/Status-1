# -*- coding: utf-8 -*-
"""Phase 6 verification: roadmap batch 2026-07-13 —
crouch (RUCH-1), pressure spawns (MISJA-1), mission end waits for radio
(MISJA-4), radio hold (MISJA-5), quit-to-menu (BUG-2), lock overlay (BUG-1),
UAV in early waves (BOT-2)."""
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

def wait_for(page, expr, timeout=40, poll=0.2):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(expr):
            return True
        time.sleep(poll)
    return False

def god(page):
    page.evaluate("player.maxHp = 100000; player.hp = 100000")

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1: crouch (RUCH-1) ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    page.evaluate("window.__killAll(); waveSystem.paused = true")
    page.keyboard.down("c")
    ok = wait_for(page, "player.crouching === true && player.eyeH < 1.15", 15)
    eye = page.evaluate("({eyeH: player.eyeH, posY: player.pos.y, crouch: player.crouching})")
    check("crouch: eye lowers toward CROUCH_EYE", ok, str(eye))
    check("crouch: camera follows the lerp (pos.y == eyeH)",
          abs(eye["posY"] - eye["eyeH"]) < 0.02, str(eye))
    # crouch cancels sprint even with shift+input held
    page.keyboard.down("Shift")
    page.keyboard.down("w")
    time.sleep(0.5)
    check("crouch: sprint blocked", page.evaluate("player.sprinting === false"), "")
    page.keyboard.up("w")
    page.keyboard.up("Shift")
    page.keyboard.up("c")
    ok = wait_for(page, "player.crouching === false && player.eyeH > 1.65", 15)
    check("crouch: standing back up restores the eye", ok,
          str(page.evaluate("player.eyeH")))
    check("crouch: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 2: BOT-2 — UAV present from wave 1 in the arena ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    ok = wait_for(page, "enemies.some(e => e.typeName === 'uav')", 30)
    check("arena: UAV spawns in wave 1", ok,
          str(page.evaluate("enemies.map(e => e.typeName)")))
    check("arena: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 3: pressure (MISJA-1) on m2's hack objective ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m2")
    wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'm2'")
    god(page)
    check("pressure: on while hack objective active",
          page.evaluate("waveSystem.pressure === true"), "")
    # silence the normal wave flow — only the pressure drip may spawn now
    page.evaluate("window.__killAll(); waveSystem.active = false;"
                  "waveSystem.pending = []; waveSystem.intermission = 99999")
    ok = wait_for(page, "enemies.length >= 1", 45)
    check("pressure: drip spawns despite a stalled director", ok,
          str(page.evaluate("({n: enemies.length, t: waveSystem.pressureT})")))
    # finish the hack -> pressure off
    for t in ("t1", "t2", "t3"):
        page.evaluate(f"const p = getProp('{t}'); p.hackT = p.hackNeed - 0.1;"
                      f"window.__teleport(p.pos.x + 1.4, p.pos.z)")
        wait_for(page, f"getProp('{t}').hacked === true", 20)
        page.evaluate("window.__killAll()")
    ok = wait_for(page, "mission.objectives[0].state === 'done'", 15)
    check("pressure: off after the objective completes",
          ok and page.evaluate("waveSystem.pressure === false"), "")
    check("pressure: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 4: MISJA-4 — debrief waits for the radio queue ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m3")
    wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'm3'")
    god(page)
    page.evaluate("for (const id of ['g1','g2','g3']) damageProp(getProp(id), 9999)")
    wait_for(page, "mission.objectives[0].state === 'done'", 15)
    # stuff the queue right before the final objective can complete
    page.evaluate("radioSay([{who:'sys', text:'A'.repeat(60)}, {who:'sys', text:'B'.repeat(60)}])")
    page.evaluate("window.__killAll(); const z = getProp('ext');"
                  "window.__teleport(z.pos.x, z.pos.z)")
    ok = wait_for(page, "mission.completePending === true", 30)
    st = page.evaluate("game.state")
    check("radio-wait: completePending while lines play", ok, f"state {st}")
    frozen = page.evaluate("mission.time")
    time.sleep(0.8)
    check("radio-wait: mission clock frozen while pending",
          page.evaluate("game.state !== 'playing' || mission.time") == frozen
          or page.evaluate("game.state") == "debrief", "")
    ok = wait_for(page, "game.state === 'debrief'", 30)
    check("radio-wait: debrief after the queue drains", ok, page.evaluate("game.state"))
    check("radio-wait: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 5: MISJA-5 — radio hold freezes movement ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=t0")
    wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 't0'")
    god(page)
    check("hold: t0 start trigger carries hold flag",
          page.evaluate("MISSION_BY_ID.t0.radio[0].hold === true"), "")
    check("hold: radioSay tags queued lines",
          page.evaluate("radioClear(); radioSay([{who:'sys', text:'x'}], true);"
                        "radioQueue[0].hold === true"), "")
    page.evaluate("radioClear()")
    # deterministic gate check: force the hold and try to walk
    page.evaluate("radioHoldT = 30")
    z0 = page.evaluate("player.pos.z")
    page.keyboard.down("w")
    time.sleep(0.8)
    z1 = page.evaluate("player.pos.z")
    check("hold: WSAD frozen while held", abs(z1 - z0) < 0.05, f"{z0} -> {z1}")
    page.evaluate("radioHoldT = 0")
    time.sleep(0.8)
    z2 = page.evaluate("player.pos.z")
    page.keyboard.up("w")
    check("hold: movement resumes after release", abs(z2 - z1) > 0.3, f"{z1} -> {z2}")
    check("hold: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 6: BUG-2 — quit to menu from pause ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m1")
    wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'm1'")
    god(page)
    page.evaluate("window.__addCredits(120)")
    page.evaluate("pauseGame()")
    check("quit: pause button says Przerwij misję",
          page.evaluate("el('btn-quit-pause').textContent") == "Przerwij misję", "")
    page.evaluate("quitToMenu()")
    ok = wait_for(page, "game.state === 'levels'", 10)
    check("quit: campaign -> mission select", ok, page.evaluate("game.state"))
    check("quit: attempt credits rolled back",
          page.evaluate("game.credits === mission.creditsAtStart && !mission.active"),
          str(page.evaluate("game.credits")))
    page.close()

    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    page.evaluate("localStorage.removeItem('status1_best'); game.best = 0; addScore(777)")
    page.evaluate("pauseGame()")
    check("quit: arena button says Wyjdź do menu",
          page.evaluate("el('btn-quit-pause').textContent") == "Wyjdź do menu", "")
    page.evaluate("quitToMenu()")
    ok = wait_for(page, "game.state === 'menu'", 10)
    check("quit: arena -> start screen", ok, page.evaluate("game.state"))
    check("quit: best score saved on exit",
          page.evaluate("localStorage.getItem('status1_best')") == "777",
          str(page.evaluate("localStorage.getItem('status1_best')")))
    check("quit: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 7: BUG-1 — lock overlay wiring (the refusal path, simulated) ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    page.evaluate("pauseGame()")
    page.evaluate("wantLock = true; document.dispatchEvent(new Event('pointerlockerror'))")
    ok = wait_for(page, "screens.lock.classList.contains('visible')", 10)
    check("lock: refusal shows the overlay instead of blind play",
          ok and page.evaluate("game.state") == "paused", page.evaluate("game.state"))
    page.evaluate("el('btn-lock-skip').click()")
    ok = wait_for(page, "game.state === 'playing' && !screens.lock.classList.contains('visible')", 10)
    check("lock: explicit skip resumes without capture", ok, page.evaluate("game.state"))
    check("lock: __test exposes lock state",
          page.evaluate("'pointerLock' in window.__test && 'wantLock' in window.__test"), "")
    # the synthetic pointerlockerror also wakes PointerLockControls' own
    # listener, which console.errors — expected noise of the simulation
    errs = [e for e in page.evaluate("window.__test.errors")
            if "PointerLockControls" not in e]
    check("lock: no errors", not errs, str(errs)[:200])
    page.close()
    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 6 CHECKS PASSED")
