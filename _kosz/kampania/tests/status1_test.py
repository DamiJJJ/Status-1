# -*- coding: utf-8 -*-
"""Post-rename smoke (STATUS 1): title/wordmark, save keys, m9->ep finale,
briefing identity copy, arena regression, file://."""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
GAME_DIR = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(__file__).parent / "_shots"
OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required", "--allow-file-access-from-files"]
fails = []

def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        fails.append(name)

def wait_for(page, expr, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(expr):
            return True
        time.sleep(0.3)
    return False

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)

    # menu + identity
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"{BASE}/")
    time.sleep(4)
    check("title: STATUS 1", "STATUS 1" in page.title(), page.title())
    lock = page.evaluate("""(() => {
        const i = document.querySelector('.game-lockup');
        return i ? {alt: i.alt, w: i.naturalWidth} : null; })()""")
    check("lockup: STATUS 1 logo loads", bool(lock) and lock["alt"] == "STATUS 1"
          and lock["w"] > 0, str(lock))
    page.screenshot(path=str(OUT / "shot_menu_status1.png"))
    # tutorial briefing mentions Davidson & R36
    page.evaluate("openBriefing('t0')")
    time.sleep(0.5)
    page.evaluate("skipTypewriter()")
    brief = page.evaluate("el('brief-body').textContent")
    check("brief: Davidson/LSPD/R36/STATUS 1",
          all(s in brief for s in ("Davidson", "LSPD", "R36", "STATUS 1")), brief[:120])
    page.close()

    # save key migration: old status1_save readable
    page = browser.new_page()
    page.goto(f"{BASE}/")
    time.sleep(3)
    page.evaluate("""localStorage.clear();
      localStorage.setItem('status1_save', JSON.stringify(
        {v:1, difficulty:'hard', missions:{t0:{done:true,bestTime:50}},
         run:{missionId:'m1',credits:150,score:0,items:{}},
         stats:{kills:0,shots:0,hits:0}}))""")
    page.evaluate("openLevels()")
    time.sleep(0.5)
    ok = page.evaluate("isMissionDone('t0') && game.credits === 150 && game.difficulty === 'hard'")
    check("save: old status1_save migrates", ok, "")
    page.close()

    # m9 -> ep -> finale card STATUS 1 (also verifies save under status1_save)
    page = browser.new_page()
    page.goto(f"{BASE}/?test=mission&m=m9")
    wait_for(page, "window.__test.state === 'playing'")
    page.evaluate("player.maxHp = 100000; player.hp = 100000; window.__killAll()")
    page.evaluate("const p = getProp('core'); p.hackT = p.hackNeed - 0.3;"
                  "window.__teleport(p.pos.x + 1.5, p.pos.z)")
    wait_for(page, "mission.objectives[0].state === 'done'", 20)
    page.evaluate("mission.objectives[1].t = mission.objectives[1].max - 1")
    wait_for(page, "mission.objectives[2] && mission.objectives[2].state === 'active'", 20)
    t0 = time.time()
    while time.time() - t0 < 45:
        if page.evaluate("game.state") == "debrief":
            break
        page.evaluate("window.__killAll()")
        page.evaluate("const z = getProp('ext'); window.__teleport(z.pos.x, z.pos.z)")
        time.sleep(0.5)
    check("m9: completes", page.evaluate("game.state") == "debrief", "")
    page.evaluate("startMission('ep')")
    wait_for(page, "window.__test.state === 'playing' && window.__test.mission?.id === 'ep'")
    page.evaluate("const z = getProp('ext'); window.__teleport(z.pos.x, z.pos.z)")
    ok = wait_for(page, "game.state === 'brief'", 30)
    title = page.evaluate("el('brief-title').textContent")
    btn = page.evaluate("el('btn-brief-start').textContent")
    check("ep: finale card STATUS 1 / Koniec zmiany", ok and title == "STATUS 1"
          and btn == "Koniec zmiany", f"{title} / {btn}")
    page.evaluate("skipTypewriter()")
    outro = page.evaluate("el('brief-body').textContent")
    check("ep: outro has SENTINEL Status 1 line", "SENTINEL" in outro and "STATUS 1" in outro,
          outro[-140:])
    saved = page.evaluate("localStorage.getItem('status1_save') !== null")
    check("save: writes under status1_save", saved is True, "")
    check("no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()

    # arena regression + best-key chain
    page = browser.new_page()
    page.goto(f"{BASE}/?test=win&seed=424242")
    t0 = time.time()
    t = {}
    while time.time() - t0 < 120:
        t = page.evaluate("window.__test")
        if t.get("state") == "won":
            break
        time.sleep(0.5)
    check("arena: test=win + hash", t.get("state") == "won" and t.get("arenaHash") == -385.02,
          f"{t.get('state')} {t.get('arenaHash')}")
    nb = page.evaluate("localStorage.getItem('status1_best')")
    check("arena: best under status1_best", nb is not None and int(nb) > 0, str(nb))
    page.close()

    # file://
    page = browser.new_page()
    page.goto((GAME_DIR / "index.html").as_uri() + "?test=mission&m=m1")
    ok = wait_for(page, "window.__test.state === 'playing'", 45)
    check("file://: campaign boots", ok, "")
    check("file://: no errors", not page.evaluate("window.__test.errors"),
          str(page.evaluate("window.__test.errors"))[:200])
    page.close()
    browser.close()

print()
if fails:
    print("FAILED:", ", ".join(fails))
    sys.exit(1)
print("STATUS 1 RENAME SMOKE PASSED")
