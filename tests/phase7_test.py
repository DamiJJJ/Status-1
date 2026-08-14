# -*- coding: utf-8 -*-
"""Phase 7 verification: roadmap batch 2026-08-14 —
settings screen (PROP-1), accessibility strobe switch (PROP-6),
slide (PROP-2), grenades (PROP-4)."""
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

    # --- 1: settings screen (PROP-1) — open, change, persist, return ---
    page = browser.new_page()
    page.goto(f"{BASE}/")
    page.evaluate("localStorage.removeItem('status1_settings')")
    page.click("#btn-menu-settings")
    check("settings: opens from the main menu",
          page.evaluate("game.state === 'settings'"
                        " && screens.settings.classList.contains('visible')"), "")
    page.evaluate("el('set-sens').value = 150;"
                  "el('set-sens').dispatchEvent(new Event('input'))")
    check("settings: sens slider applies", page.evaluate("SETTINGS.sens") == 1.5,
          str(page.evaluate("SETTINGS.sens")))
    page.evaluate("el('set-vol').value = 40;"
                  "el('set-vol').dispatchEvent(new Event('input'))")
    check("settings: volume slider applies", page.evaluate("SETTINGS.volMaster") == 0.4, "")
    page.click("#set-strobe")
    page.click("#set-bloom")
    check("settings: strobe + bloom toggles apply",
          page.evaluate("SETTINGS.strobe === false && SETTINGS.bloom === false"
                        " && bloomPass.enabled === false"), "")
    saved = page.evaluate("JSON.parse(localStorage.getItem('status1_settings'))")
    check("settings: saved to localStorage",
          saved and saved["sens"] == 1.5 and saved["strobe"] is False
          and saved["volMaster"] == 0.4, str(saved))
    page.click("#btn-settings-back")
    check("settings: back returns to the main menu",
          page.evaluate("game.state === 'menu'"
                        " && screens.menu.classList.contains('visible')"), "")
    check("settings: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])

    # --- 2: settings persist across a reload; strobe off = steady glow ---
    # (same page => same context => same localStorage — new_page() would
    # get an isolated context and always see the defaults)
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    check("settings: persisted after reload",
          page.evaluate("SETTINGS.sens === 1.5 && SETTINGS.strobe === false"
                        " && bloomPass.enabled === false"),
          str(page.evaluate("window.__test.settings")))
    time.sleep(0.6)  # a few frames of updateEnemies
    strobes = page.evaluate("[matStrobeR.emissiveIntensity, matStrobeB.emissiveIntensity]")
    check("strobe off: steady glow, no flashing (PROP-6)",
          strobes == [1.3, 1.3], str(strobes))
    # settings reachable from pause and return to pause
    page.evaluate("pauseGame()")
    page.click("#btn-settings-pause")
    check("settings: opens from pause", page.evaluate("game.state === 'settings'"), "")
    page.click("#btn-settings-back")
    check("settings: back returns to pause",
          page.evaluate("game.state === 'paused'"
                        " && screens.pause.classList.contains('visible')"), "")
    page.evaluate("localStorage.removeItem('status1_settings')")
    check("settings: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 3: slide (PROP-2) ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    page.evaluate("window.__killAll(); waveSystem.paused = true;"
                  "waveSystem.pending = []; waveSystem.intermission = 99999")
    # crouch from a standstill: plain crouch, NO slide
    # (poll instead of a fixed sleep — SwiftShader renders a handful of FPS,
    # so the crouch may need ~1 s of wall clock to be processed at all)
    page.keyboard.down("c")
    ok = wait_for(page, "player.crouching === true", 15)
    check("slide: not triggered from a standstill",
          ok and page.evaluate("player.sliding === false"), "")
    page.keyboard.up("c")
    wait_for(page, "player.crouching === false && player.eyeH > 1.65", 15)
    # build sprint speed, then crouch -> slide
    page.keyboard.down("Shift")
    page.keyboard.down("w")
    ok = wait_for(page, "player.sprinting === true"
                        " && Math.hypot(player.vel.x, player.vel.z) > 8", 15)
    check("slide: sprint speed reached", ok,
          str(page.evaluate("Math.hypot(player.vel.x, player.vel.z)")))
    page.keyboard.down("c")
    ok = wait_for(page, "player.sliding === true", 10, poll=0.05)
    sp = page.evaluate("Math.hypot(player.vel.x, player.vel.z)")
    check("slide: crouch at sprint speed slides", ok, f"speed {sp:.2f}")
    check("slide: keeps sprint-level momentum", sp > 8, f"speed {sp:.2f}")
    check("slide: __test exposes the flag", page.evaluate("window.__test.slide === true"), "")
    ok = wait_for(page, "player.sliding === false", 15)
    check("slide: ends on its own", ok, "")
    check("slide: cooldown armed after the ride",
          page.evaluate("player.slideCd > 0"), str(page.evaluate("player.slideCd")))
    page.keyboard.up("c")
    page.keyboard.up("w")
    page.keyboard.up("Shift")
    check("slide: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 4: grenades (PROP-4) — throw, fuse, blast, self-damage, supply ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    page.evaluate("window.__killAll(); waveSystem.paused = true;"
                  "waveSystem.pending = []; waveSystem.intermission = 99999")
    check("nade: level starts with 2", page.evaluate("game.grenades") == 2, "")
    check("nade: HUD shows the count",
          page.evaluate("el('grenade-count').textContent") == "×2", "")
    page.evaluate("throwGrenade()")
    check("nade: throw consumes one",
          page.evaluate("game.grenades === 1 && grenadePool.some(g => g.active)"), "")
    ok = wait_for(page, "grenadePool.every(g => !g.active)", 30)
    check("nade: fuse detonates the throw", ok, "")

    # blast kills a bot placed at the grenade
    page.evaluate("window._e = spawnEnemy('scout',"
                  " {at: {x: player.pos.x + 3, z: player.pos.z}})")
    page.evaluate("const g = grenadePool[0]; g.active = true; g.mesh.visible = true;"
                  "g.mesh.position.copy(window._e.group.position).setY(0.5);"
                  "g.vel.set(0, 0, 0); g.fuse = 0.05")
    ok = wait_for(page, "window._e.alive === false", 15)
    check("nade: blast kills an adjacent bot", ok,
          str(page.evaluate("({alive: window._e.alive, hp: window._e.hp})")))

    # self-damage teaches throwing distance
    page.evaluate("player.maxHp = 500; player.hp = 500")
    page.evaluate("const g = grenadePool[0]; g.active = true; g.mesh.visible = true;"
                  "g.mesh.position.copy(player.pos).setY(0.4);"
                  "g.vel.set(0, 0, 0); g.fuse = 0.05")
    ok = wait_for(page, "player.hp < 500", 15)
    check("nade: point-blank blast hurts the thrower", ok,
          str(page.evaluate("player.hp")))
    god(page)

    # empty supply: no crash, no negative count
    page.evaluate("game.grenades = 0; updateGrenadeHud(); throwGrenade()")
    check("nade: empty supply is a no-op", page.evaluate("game.grenades") == 0, "")

    # shop tops up to the cap and refuses past it
    page.evaluate("window.__addCredits(200); game.grenades = 1")
    page.evaluate("window.__buyItem('nade')")
    check("nade: shop pack +2", page.evaluate("game.grenades") == 3, "")
    page.evaluate("window.__buyItem('nade')")
    check("nade: cap at 4", page.evaluate("game.grenades") == 4, "")
    cr = page.evaluate("game.credits")
    page.evaluate("window.__buyItem('nade')")
    check("nade: buying at the cap charges nothing",
          page.evaluate("game.credits") == cr and page.evaluate("game.grenades") == 4, "")
    check("nade: shop lists the item",
          page.evaluate("renderShop();"
                        "document.getElementById('shop-items').innerHTML.includes('Granaty')"), "")

    # level reset restores the base supply
    page.evaluate("resetLevelState()")
    check("nade: level reset restores 2",
          page.evaluate("game.grenades === 2"
                        " && el('grenade-count').textContent === '×2'"), "")
    check("nade: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # --- 5: browser-shortcut shield (Ctrl+W used to close the tab mid-slide) ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    wait_for(page, "window.__test.state === 'playing'")
    god(page)
    check("shield: plain game key eaten while playing",
          page.evaluate("const ev = new KeyboardEvent('keydown',"
                        " {code: 'KeyW', cancelable: true});"
                        "document.dispatchEvent(ev); keys['KeyW'] = false;"
                        "ev.defaultPrevented"), "")
    check("shield: repeated key (held W under Ctrl) eaten too",
          page.evaluate("const ev = new KeyboardEvent('keydown',"
                        " {code: 'KeyW', ctrlKey: true, repeat: true, cancelable: true});"
                        "document.dispatchEvent(ev); keys['KeyW'] = false;"
                        "ev.defaultPrevented"), "")
    check("shield: any Ctrl-combination eaten while playing",
          page.evaluate("const ev = new KeyboardEvent('keydown',"
                        " {code: 'KeyD', ctrlKey: true, cancelable: true});"
                        "document.dispatchEvent(ev); keys['KeyD'] = false;"
                        "ev.defaultPrevented"), "")
    check("shield: wheel (Ctrl+zoom / scroll) eaten while playing",
          page.evaluate("const ev = new WheelEvent('wheel',"
                        " {deltaY: 120, cancelable: true});"
                        "document.dispatchEvent(ev); ev.defaultPrevented"), "")
    check("shield: fullscreen option on by default",
          page.evaluate("SETTINGS.fullscreen === true"
                        " && el('set-fullscreen') !== null"), "")
    # outside a run the shield disarms (normal browsing must stay normal)
    page.evaluate("pauseGame(); quitToMenu()")
    wait_for(page, "game.state === 'menu'", 10)
    check("shield: disarmed in the menu",
          page.evaluate("const ev = new KeyboardEvent('keydown',"
                        " {code: 'KeyW', cancelable: true});"
                        "document.dispatchEvent(ev); keys['KeyW'] = false;"
                        "!ev.defaultPrevented"), "")
    check("shield: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()
    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL PHASE 7 CHECKS PASSED")
