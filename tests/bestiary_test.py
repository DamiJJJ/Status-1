# -*- coding: utf-8 -*-
"""BESTIARIUSZ: menu entry, unit list, own render scene, Esc back."""
import pathlib, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8137"
ROOT = pathlib.Path(__file__).resolve().parent.parent
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required"]
ok = True


def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name, extra)
    if not cond:
        ok = False


def run(page, label):
    page.wait_for_function("() => window.__test && __test.state === 'menu'", timeout=20000)
    page.click("#btn-menu-bestiary")
    page.wait_for_timeout(600)
    check(f"{label}: opens", page.evaluate("__test.state") == 'bestiary')
    check(f"{label}: first unit is PATROL", page.evaluate("__test.bestiary") == 'scout',
          page.evaluate("__test.bestiary"))
    check(f"{label}: menu layer (HUD hidden)", page.evaluate("__test.menuBg") is True)

    seen = []
    for i in range(page.evaluate("BESTIARY.length")):
        page.click(f"[data-bst='{i}']")
        page.wait_for_timeout(350)
        seen.append(page.evaluate("__test.bestiary"))
    check(f"{label}: every unit shows", seen == page.evaluate("BESTIARY.map(b => b.type)"), seen)
    check(f"{label}: info panel filled",
          len(page.evaluate("document.getElementById('bestiary-info').textContent")) > 120)

    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    check(f"{label}: Esc returns to menu", page.evaluate("__test.state") == 'menu')
    check(f"{label}: no errors", page.evaluate("__test.errors") == [],
          page.evaluate("__test.errors")[:3])


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    pg.goto(f"{BASE}/")
    run(pg, "http")

    pg2 = b.new_page(viewport={"width": 1100, "height": 700})
    pg2.goto((ROOT / "index.html").as_uri())
    run(pg2, "file://")
    b.close()

print("\n" + ("ALL BESTIARY CHECKS PASSED" if ok else "SOME CHECKS FAILED"))
