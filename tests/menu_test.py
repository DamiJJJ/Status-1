# -*- coding: utf-8 -*-
"""MENU-1 verification: main menu with the animated Los Santos panorama.

Checks (http://localhost:8137):
  1. boot: the main menu is the first screen, panorama active and animating
  2. navigation: arena entry / stats / campaign / settings / armory and back
  3. gameplay renders the game world again (?test=play -> menuBg off)
  4. file:// smoke test: menu boots without errors
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

def wait_for(page, expr, timeout=30, poll=0.2):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(expr):
            return True
        time.sleep(poll)
    return False

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # --- 1: boot straight into the menu, panorama on and moving ---
    page = browser.new_page()
    page.goto(f"{BASE}/")
    ok = wait_for(page, "window.__test && window.__test.state === 'menu'")
    check("boot: state menu", ok, page.evaluate("window.__test.state"))
    check("boot: menu screen visible",
          page.evaluate("screens.menu.classList.contains('visible')"), "")
    check("boot: panorama active", page.evaluate("window.__test.menuBg === true"), "")
    check("boot: menu progress line rendered",
          page.evaluate("el('menu-progress').textContent.includes('Kampania:')"),
          page.evaluate("el('menu-progress').textContent"))
    cam0 = page.evaluate("MenuBg.camera.position.x")
    time.sleep(1.0)
    cam1 = page.evaluate("MenuBg.camera.position.x")
    check("panorama: camera drifts", cam0 != cam1, f"{cam0} -> {cam1}")
    check("panorama: scene populated (towers/drones/smog)",
          page.evaluate("MenuBg.scene.children.length > 60"),
          str(page.evaluate("MenuBg.scene.children.length")))

    # --- 2: navigation loop through every menu target and back ---
    page.click("#btn-menu-arena")
    check("nav: arena entry shows the controls screen",
          page.evaluate("screens.start.classList.contains('visible')"
                        " && game.state === 'menu'"), "")
    page.click("#btn-start-back")
    check("nav: back to menu from arena entry",
          page.evaluate("screens.menu.classList.contains('visible')"), "")

    page.click("#btn-menu-stats")
    check("nav: stats screen renders rows",
          page.evaluate("game.state === 'stats'"
                        " && el('stats-list').children.length >= 8"
                        " && window.__test.menuBg === true"), "")
    page.keyboard.press("Escape")
    check("nav: Esc leaves stats",
          page.evaluate("game.state === 'menu'"
                        " && screens.menu.classList.contains('visible')"), "")

    page.click("#btn-menu-campaign")
    check("nav: campaign select keeps the panorama",
          page.evaluate("game.state === 'levels'"
                        " && screens.campaign.classList.contains('visible')"
                        " && window.__test.menuBg === true"), "")
    page.click("#btn-campaign-back")
    check("nav: back to menu from campaign",
          page.evaluate("screens.menu.classList.contains('visible')"), "")

    page.click("#btn-menu-settings")
    check("nav: settings over the panorama",
          page.evaluate("game.state === 'settings'"
                        " && window.__test.menuBg === true"), "")
    page.click("#btn-settings-back")
    check("nav: settings back to menu",
          page.evaluate("game.state === 'menu'"
                        " && screens.menu.classList.contains('visible')"), "")

    page.click("#btn-menu-armory")
    check("nav: armory opens from the menu",
          page.evaluate("game.state === 'shop'"
                        " && el('shop-title').textContent === 'Zbrojownia'"
                        " && window.__test.menuBg === true"), "")
    page.click("#btn-shop-continue")
    check("nav: armory continue lands on mission select",
          page.evaluate("game.state === 'levels'"), page.evaluate("game.state"))
    check("nav: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 3: gameplay switches the render back to the game world ---
    page = browser.new_page()
    page.goto(f"{BASE}/?test=play")
    ok = wait_for(page, "window.__test.state === 'playing'")
    check("play: reaches playing", ok, page.evaluate("window.__test.state"))
    check("play: panorama off during gameplay",
          page.evaluate("window.__test.menuBg === false"), "")
    page.evaluate("pauseGame()")
    check("play: pause keeps the game world (not the panorama)",
          page.evaluate("window.__test.menuBg === false"), "")
    page.evaluate("quitToMenu()")
    ok = wait_for(page, "game.state === 'menu' && window.__test.menuBg === true", 10)
    check("play: quit to menu re-enters the panorama", ok, "")
    check("play: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()

    # --- 4: file:// smoke ---
    page = browser.new_page()
    page.goto((GAME_DIR / "index.html").as_uri())
    ok = wait_for(page, "window.__test && window.__test.state === 'menu'"
                        " && window.__test.menuBg === true", 30)
    check("file://: menu + panorama boot", ok, "")
    check("file://: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:300])
    page.close()
    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("ALL MENU-1 CHECKS PASSED")
