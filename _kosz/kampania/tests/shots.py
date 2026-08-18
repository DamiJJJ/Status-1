# -*- coding: utf-8 -*-
"""Screenshots of the new campaign screens for a visual eyeball pass."""
import time, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
OUT = pathlib.Path(__file__).parent / "_shots"
OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = browser.new_page(viewport={"width": 1280, "height": 800})

    # menu
    page.goto(f"{BASE}/")
    time.sleep(4)
    page.screenshot(path=str(OUT / "shot_menu.png"))

    # level select (with one mission completed for state variety)
    page.evaluate("""localStorage.setItem('status1_save', JSON.stringify(
      {v:1, difficulty:'normal',
       missions:{m1:{done:true,bestTime:97}},
       run:{missionId:'m2',credits:240,score:1500,items:{maxhp:1}},
       stats:{kills:0,shots:0,hits:0}}))""")
    page.evaluate("openLevels()")
    time.sleep(0.6)
    page.screenshot(path=str(OUT / "shot_levels.png"))

    # briefing mid-typewriter
    page.evaluate("openBriefing('m2')")
    time.sleep(2.2)
    page.screenshot(path=str(OUT / "shot_brief.png"))

    # armory
    page.evaluate("openArmory('m2')")
    time.sleep(0.5)
    page.screenshot(path=str(OUT / "shot_armory.png"))

    browser.close()

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    # in-mission HUD: objective line + markers (m2, looking around)
    page.goto(f"{BASE}/?test=mission&m=m2")
    t0 = time.time()
    while time.time() - t0 < 30:
        if page.evaluate("window.__test.state === 'playing'"):
            break
        time.sleep(0.4)
    time.sleep(3)
    page.evaluate("camera.rotation.y = 2.4")  # look away: off-screen chevrons
    time.sleep(1)
    page.screenshot(path=str(OUT / "shot_mission_off.png"))
    page.evaluate("camera.rotation.y = -0.7") # look toward terminals
    time.sleep(1)
    page.screenshot(path=str(OUT / "shot_mission_on.png"))
    browser.close()

print("done")
