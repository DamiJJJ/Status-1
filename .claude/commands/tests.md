---
description: Odpala testy Playwright projektu (domyślnie wszystkie aktywne)
argument-hint: "[nazwa/skrót zestawu, np. 'devrig' albo 'phase0 menu'; puste = wszystkie]"
allowed-tools: Bash(python -m http.server:*), Bash(.venv/bin/python:*), Bash(curl:*), Bash(ls:*), Bash(lsof:*), Read
---

## Kontekst

Dostępne zestawy:
!`ls tests/*.py`

Czy dev-serwer stoi na 8137:
!`curl -s -o /dev/null -w "%{http_code}" http://localhost:8137/index.html || echo "BRAK"`

## Zadanie

Uruchom testy projektu. Argument użytkownika (może być pusty): $ARGUMENTS

### Zasady

- **Port 8137**, nie 8000 (na 8000 stoi lokalny PHP użytkownika). Jeśli powyższy
  `curl` nie zwrócił `200`, najpierw postaw serwer w tle:
  `python3 -m http.server 8137` — i dopiero potem odpalaj testy.
- Interpreter: **`.venv/bin/python`** (tam jest Playwright).
- Bez argumentu uruchom **wszystkie aktywne** zestawy:
  `phase0_test`, `phase1_test`, `phase7_test`, `menu_test`, `bestiary_test`,
  `devmap_test`, `devrig_test`.
  Zestawy kampanii (`phase2`–`phase6`, `phase5d`, `status1_test`) są w `_kosz/`
  i **nie przejdą** — nie uruchamiaj ich.
- Z argumentem uruchom tylko dopasowane zestawy (dopasowanie po fragmencie
  nazwy pliku, np. `devrig` → `tests/devrig_test.py`).
- `shots2.py`, `shots_models.py`, `shots_weapons.py` to **nie testy**, tylko
  generatory zrzutów. Uruchamiaj je wyłącznie, gdy użytkownik poprosi wprost
  albo poda je w argumencie. Wyjątek: `shots_weapons.py` liczy też projekcję
  przyrządów ADS — jeśli zmiany dotyczyły broni/rąk/viewmodeli, dopisz go
  i podaj wynik.
- Testy są wolne (każdy startuje własną przeglądarkę). Odpalaj je **równolegle
  tam, gdzie się da** i daj hojne timeouty — pod SwiftShaderem czas gry płynie
  wolniej niż zegar ścienny.

### Format odpowiedzi

Krótka tabela: zestaw → PASS/FAIL. Potem **tylko dla zestawów, które padły**:
nazwy asercji, które nie przeszły, i diagnoza — co konkretnie się zepsuło
i gdzie (plik:linia). Nie wklejaj pełnych logów przy sukcesie.

Jeśli wszystko przeszło, ogranicz się do tabeli i jednego zdania.
