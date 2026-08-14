# Testy (Playwright + Python)

Zestaw testów end-to-end napisany podczas przebudowy gry na STATUS 1
(2026-07). Każdy plik jest samodzielny — uruchamia własną przeglądarkę
i wypisuje `PASS`/`FAIL` per asercja; kod wyjścia ≠ 0 przy porażce.

## Wymagania

```
pip install playwright
playwright install chrome
```

Testy łączą się z **`http://localhost:8137`** — najpierw postaw serwer
w katalogu głównym projektu:

```
python -m http.server 8137
```

(Port 8137 celowo, nie 8000 — patrz CLAUDE.md.) Testy `file://` działają
bez serwera. Uruchamianie: `python tests/phase0_test.py` itd.

## Pliki

| Plik | Co sprawdza |
|---|---|
| `phase0_test.py` | Cykl życia świata: determinizm `arenaHash` po przebudowach, brak wycieków (stabilne liczby meshy/colliderów), idempotentny sklep, pełny bieg areny `?test=win`, `file://` |
| `phase1_test.py` | Generator parametryczny: zgodność wsteczna układów (seed 424242 → hash −385.02), przemiatanie 40 seedów × 3 style pod osiągalność (flood-fill), pierścień `?half=23`, rozgrywka na nowych stylach |
| `phase2_test.py` | Szkielet kampanii: misja → debrief → Zbrojownia → odprawa → następna misja, przenoszenie ulepszeń, rollback kredytów przy śmierci, trudność, regresja areny |
| `phase3_test.py` | Propy i cele: hack/destroy/extract, AoE generatora, znaczniki celów, HUD celu |
| `phase4_test.py` | Tutorial (łańcuch celów, bramki pędu), medale (progi + wypłata + zapis), TARAN jako set-piece, radio (w tym debiut BAKERA) |
| `phase5_test.py` | BRAMY (strumień jednostek, gaśnięcie po zniszczeniu), UAV (pułap ~3 m), boss z tarczą/stabilizatorami, m9 → epilog (parada, karta finału), regresja areny |
| `phase5d_test.py` | **Pełne przejście kampanii** t0→…→m9→epilog przez prawdziwy przepływ ekranów + `file://` |
| `phase6_test.py` | Partia roadmapy 2026-07-13: kucanie (lerp oka, blokada sprintu), WAŻKA w 1. fali areny, pressure przy hack/survive/gates (dokrutka mimo zatrzymanego reżysera), koniec misji czeka na radio, hold radia blokuje WSAD, wyjście do menu z pauzy (rollback/rekord), nakładka odmowy pointer locka |
| `phase7_test.py` | Partia roadmapy 2026-08-14: ustawienia (suwaki/przełączniki, zapis i odczyt po przeładowaniu, powrót do startu/pauzy), strobo OFF = stały blask (PROP-6), wślizg (start tylko z pędem, utrzymanie prędkości, cooldown), granaty (rzut, zapalnik, AoE zabija bota, obrażenia własne, pusty zapas, sklep z limitem 4, reset poziomu), tarcza skrótów przeglądarki (preventDefault klawiszy gry/Ctrl-kombinacji/repeat/wheel w grze, rozbrojona w menu; BUG-3) |
| `menu_test.py` | MENU-1: menu główne z panoramą (boot do `screen-menu`, dryf kamery, zapełniona scena), pełna pętla nawigacji (arena/statystyki/kampania/ustawienia/zbrojownia i powroty), panorama wyłączona w rozgrywce i przy pauzie, powrót po `quitToMenu`, `file://` |
| `status1_test.py` | Smoke po rebrandingu: tytuł/wordmark STATUS 1, treść odprawy (Davidson/R36), migracja starych kluczy zapisu, karta finału, `file://` |
| `shots.py`, `shots2.py` | Nie-testy: zrzuty ekranów (menu, wybór misji, odprawa, drony w liberiach, motyw ember) do `tests/_shots/` — do ręcznej oceny wizualnej |

## Pułapki

- **`dt` jest clampowany do 0,05 s** — pod SwiftShaderem (headless) czas gry
  płynie wolniej niż zegar ścienny. Cele czasowe testy przewijają przez stan
  (`mission.objectives[i].t = …`), a timeouty mają zapas.
- Odczyt `window.__test` jest odświeżany raz na klatkę — asercje o stanie
  misji tuż po akcji czytaj z żywych obiektów (`mission.objectives[…]`),
  nie ze snapshotu.
- Testy piszą po `localStorage` originu `localhost:8137` — hook
  `__startMission` czyści zapis kampanii (łącznie z kluczem legacy), więc
  kolejność uruchamiania nie ma znaczenia.
- **`browser.new_page()` = świeży kontekst = puste `localStorage`.**
  Trwałość zapisu (np. ustawień) testuj przez `page.goto(...)` na TEJ SAMEJ
  stronie, nie przez zamknięcie i otwarcie nowej.
