# Kosz

Rzeczy wyjęte z gry 18.08.2026, trzymane na wypadek powrotu. Nic z tego
folderu **nie jest ładowane** - `index.html` nie zaciąga stąd żadnego pliku,
a testy z `tests/` nie sięgają do tego katalogu.

## `kampania/`

Cała kampania: 11 symulacji, cele, radio, medale, zapis postępu, ekrany
odprawy i debriefu.

- `campaign.js` - runtime kampanii (obiekt `mission`, `OBJECTIVE_TYPES`,
  medale, radio, zapis `status1_save`, ekrany, znaczniki celów)
- `missions.js` - czyste dane: `MISSIONS`, `DIFFICULTIES`, teksty odpraw
- `tests/` - testy, które badały kampanię: `phase2` (szkielet), `phase3`
  (propy i cele), `phase4` (tutorial, medale, radio), `phase5` (bramy, boss,
  epilog), `phase5d` (pełne przejście), `phase6` (partia roadmapy 07-13,
  w tym kucanie i pressure), `status1_test` (smoke rebrandingu),
  `shots.py` (zrzuty ekranów kampanii)

**Jak wrócić:** przenieś `campaign.js` i `missions.js` z powrotem do `js/`,
skasuj `js/campaign_off.js`, w `index.html` przywróć oba `<script defer>`
w miejsce zaślepki, oddaj markup czterech ekranów (`screen-campaign`,
`screen-brief`, `screen-debrief`, `screen-mfail`), ich wpisy w mapie `screens`
(`js/state.js`), listenery w `js/input.js` i pozycje "Kampania" oraz
"Zbrojownia" w menu. Gałęzie `if (game.mode === 'campaign')` w kodzie gry
zostały nietknięte, więc ożyją same.

## `przeciwnicy/`

`przeciwnicy.js` - SZTURM, TARAN i WAŻKA: definicje typów, model
quadkoptera, bronie botów, ich udział w falach areny i karty bestiariusza.
W grze został sam PATROL.

**Jak wrócić:** wklej wpisy do `ENEMY_TYPES` (`js/enemies.js`), gałąź modelu
i broni do `buildEnemyModel`, kartę do `BESTIARY` (`js/bestiary.js`) i udział
w `WAVE_DEFS`/`getWaveDef` (`js/waves.js`). Obsługa lotu (`fly`, `minTop`
w `resolveCollisions`) **została w silniku** - WAŻKA nie wymaga zmian w ruchu.
