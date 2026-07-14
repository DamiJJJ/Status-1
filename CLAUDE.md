# STATUS 1 (dawniej NEON ARENA) — notatki dla Claude Code

Przeglądarkowy FPS (Three.js). Gra jest **w 100% po stronie klienta** — bez backendu,
bez bundlera, bez node_modules. **Rdzeniem gry jest KAMPANIA** (11 symulacji: tutorial
S-00 → S-01…S-09 → grywalny epilog bez walki); dawny tryb fal został jako
„Arena bez końca". Tytuł = policyjny kod statusu „w służbie" — w finale drony
meldują „Status 1".

**Fabuła:** niedaleka przyszłość, Los Santos; LSPD wdraża autonomiczne drony
policyjne (linia SENTINEL, program STATUS 1). Gracz to **Nick Davidson — oficer
SWAT z LSPD** oddelegowany jako szkoleniowiec-oponent czerwonego zespołu, callsign
**R36 („Robert-36")**; drony uczą się na jego oporze (rosnące hpMul/accMul są
diegetyczne). Głosy kanału: **CENTRALA** (prowadzi odprawy; w finale ujawnia, że
jest AI), **BAKER** (proces-duch — profil bojowy poprzedniego szkoleniowca R35;
stary alfabet fonetyczny: Baker=B, Robert=R; pisze małymi literami), **SYSTEM**
(automat symulacji). Finał = cliffhanger: certyfikowane drony wychodzą na patrole,
a w epilogu gracz mija ich kolumnę. Postać gracza jest zdefiniowana (mężczyzna),
więc formy męskie w kwestiach DO gracza są OK.

## Architektura

- **Kod gry jest podzielony na klasyczne skrypty w `js/`** (NIE moduły ES) — to decyzja
  celowa: przeglądarki blokują **lokalne** moduły ES przy `file://`, a gra ma działać po
  dwukliku; klasyczne skrypty z `file://` działają. Wszystkie pliki `js/*.js` współdzielą
  **globalny zakres** (top-level `const`/`let`/`function` klasycznego skryptu widzą
  kolejne skrypty) — między plikami nie ma żadnych `import`/`export` i uważaj na kolizje
  nazw. **Nie konwertuj plików `js/` na moduły ES** i nie dodawaj bundlera — to złamie
  dystrybucję przez `file://`.
- **Bootstrap w `index.html`**: mały inline'owy moduł ES importuje Three.js + addony
  z CDN (jsdelivr, import map w `<head>`) i wystawia je globalnie przez
  `Object.assign(window, { THREE, PointerLockControls, ... })`. Moduły i skrypty `defer`
  wykonują się po sparsowaniu dokumentu **w kolejności wystąpienia w dokumencie**, więc
  THREE jest gotowe, zanim ruszy pierwszy plik gry. Dlatego każdy plik gry MUSI być
  ładowany przez `<script defer src="js/...">` — bez `defer` wykonałby się w trakcie
  parsowania, czyli PRZED bootstrapem.
- **Świat NIE buduje się już przy parsowaniu.** `world.js` tylko DEFINIUJE
  `buildArena(def)` / `clearArena()`; pierwszą budowę woła `main.js` po wykonaniu
  wszystkich skryptów (`buildArena(arenaModeDef())`). Dzięki temu arenę można
  przebudowywać w runtime (misje kampanii), a kod świata może w czasie wywołania
  używać helperów z późniejszych plików. Teardown: **geometrie z `worldGroup` MUSZĄ
  być zwalniane** (`addBlock` tworzy świeże `BoxGeometry`, bo `applyBoxUV` mutuje UV) —
  inaczej każdy restart misji przecieka VRAM; **materiały/tekstury modułowe są
  współdzielone między arenami i NIE wolno ich zwalniać** (`decorGroup` = tylko
  remove). Wyjątki per-build (zwalniane w `clearArena`): `logMats` (panele logów,
  własne `CanvasTexture`) i materiały rdzeni propów (`propMatsToDispose` w props.js).
  Determinizm i szczelność przebudowy testuje `__test.arenaHash` (ten sam seed →
  identyczny hash po dowolnej liczbie przebudów).
- **Kolejność `<script>` w `index.html` MA znaczenie.** Pliki w kolejności ładowania:
  `config.js` (konfig/paleta/parametry URL/diagnostyka `__test`) → `audio.js` (`AudioSys`:
  szyna WebAudio, SFX, muzyka proceduralna, stingery celów, robo-głosy `voice(who)`) →
  `renderer.js` (renderer/kamera/postprocessing/światła/niebo) →
  `textures.js` (`TexGen`: proceduralne tekstury z canvasa; `makeLogTexture` — panele
  z polskim tekstem; wymaga `renderer`, więc MUSI być po `renderer.js`) →
  `world.js` (cykl życia areny, generator parametryczny ze stylami open/pillars/
  corridors, pierścień wewnętrzny dla mniejszych aren, flood-fill `validateArena`,
  motywy `applyTheme`, panele holo/logów) →
  `props.js` (set-piece'y misji: generatory/terminale/BRAMY/cele treningowe/strefy;
  **płaskie meshe w `worldGroup` z `userData.propRef`** — lustrzane odbicie
  `enemyRef`) → `effects.js` → `collisions.js` (okrąg-vs-AABB; parametr `minTop` —
  latające jednostki omijają collidery niższe od pułapu) → `player.js` →
  `weapons.js` (WEAPONS/viewmodele/ADS/strzelanie; gałąź `propRef`; blokada
  `game.noCombat`) → `enemies.js` (ENEMY_TYPES/modele/AI; liberie policyjne + strobo,
  UAV, tarcza bossa, jednostki pasywne parady) → `icons.js` (`UI_ICONS`; pętla
  `[data-icon]` działa RAZ przy ładowaniu — dynamiczny markup wstawia
  `UI_ICONS[key]` sam) → `pickups.js` (`placeArenaPickups` z danych `arena.pickups`) →
  `shop.js` (`applyAllShopEffects` — IDEMPOTENTNE efekty sklepu, warunek zapisu;
  tryb Zbrojowni) → `waves.js` (JEDEN reżyser dla obu trybów; polityka wstrzykiwana
  przez `reset(policy)`: script/loop/maxAlive/onCleared/paused) →
  `missions.js` (czyste dane: MISSIONS/DIFFICULTIES/teksty) → `campaign.js`
  (OBJECTIVE_TYPES, obiekt `mission`, medale, radio, zapis localStorage, ekrany
  kampanii, znaczniki celów z off-screen chevronami) → `hud.js` → `state.js`
  (obiekt `game`; **`resetRunState`** = progresja, **`resetLevelState`** = świat/ciało;
  `resetGameState` = obie, tylko arena) → `input.js` → `testmode.js` → `main.js`
  (bootstrap + pętla `tick`). Nowy plik wpinaj zgodnie z zależnościami wykonywanymi
  przy ładowaniu; odwołania z wnętrza funkcji mogą wskazywać „w przód".
- Każdy plik `js/` zaczyna się od `'use strict';` (kod był modułem ES, czyli strict —
  to zachowuje identyczną semantykę). Nowe pliki też muszą go mieć.
- `index.html` — markup (canvas, nakładki, HUD, ekrany start/pauza/koniec/wygrana/sklep),
  import map, bootstrap i lista `<script defer>`.
- `styles.css` — HUD i ekrany (CSS działa z `file://`, może być osobno).
- **Zasoby: wszystko generowane, nic ściąganego.** Zasada nie brzmi już „zero plików
  graficznych", tylko: **każdy zasób musi mieć źródło, z którego da się go odtworzyć** —
  kod gry albo skrypt generujący w repo (`tools/`). Dozwolone:
  - **geometrie proceduralne** w kodzie (bryły Three.js — także `LatheGeometry`,
    `ExtrudeGeometry`, fazowania; nie tylko boxy);
  - **tekstury generowane w runtime** z canvasa (`TexGen` w `js/textures.js`);
  - **tekstury/grafiki generowane offline** skryptem z `tools/` (Python: PIL/numpy — szum,
    panele, mapy normalnych i roughness; SVG → PNG). Skrypt generujący **commitujemy razem
    z wynikiem**, żeby dało się przegenerować zasób po zmianie palety/rozdzielczości.

  **Zabronione: gotowe modele/tekstury/dźwięki z zewnątrz** (stock, paczki assetów,
  biblioteki tekstur) — licencje i spójność stylu. **Audio zostaje w 100% syntetyczne
  (WebAudio)** — bez plików dźwiękowych, nawet własnych i nawet generowanych AI.
  Rozważane i **odrzucone**: muzyka z SUNO. Powód nie jest tylko licencyjny — przy
  `file://` wygenerowany plik da się odtworzyć wyłącznie przez `<audio>`, bo
  `fetch` + `decodeAudioData` jest blokowane przez CORS, a `MediaElementSource` z dysku
  taintuje graf. Muzyka wypadłaby więc **poza graf WebAudio**: koniec z sidechainem,
  ściszaniem pod SFX i reakcją na gęstość walki (patrz `moodBlend` w Konwencjach).
- ⚠️ **Tekstury do sceny 3D NIE mogą być plikami PNG w `assets/`.** Przy `file://` Chrome
  uznaje obrazy z dysku za cross-origin i `texImage2D` rzuca wyjątkiem („The image element
  contains cross-origin data") — scena psułaby się po dwukliku, choć na serwerze działa.
  **Obejście: osadzaj tekstury jako `data:` URI** (base64) w pliku JS, np. `js/textures.js`
  z mapą `{ id: 'data:image/png;base64,...' }`, i podawaj je do `THREE.TextureLoader`
  / `new Image()`. Data URI ładuje się do WebGL bez problemu również z `file://`
  (zweryfikowane). Koszt: base64 to +33% rozmiaru — trzymaj tekstury małe (256–512 px,
  kafelkowane przez `tex.repeat`) i dopuszczaj tylko te, których nie da się rozsądnie
  wygenerować canvasem w runtime. Pipeline: `tools/gen_textures.py` → PNG (podgląd,
  do repo) → ten sam skrypt zapisuje `js/textures.js` z base64.
  **PNG w `assets/` są OK wyłącznie dla DOM/UI** (`<img>` w HUD i ekranach, favicony,
  OG) — DOM nie podlega temu ograniczeniu, dlatego branding działa z `file://`.
- **Branding w `assets/`** — logo jako PNG, dotyczy WYŁĄCZNIE UI (ekrany, HUD, favicon).
  **Wszystko generuje `tools/gen_logo.py`** z dwóch źródeł (`status-1-logo.png` —
  sam emblemat, `status-1-logo-txt.png` — lockup z napisem; ciemne tło, nieużywane
  w runtime, nie linkuj ich). Nie edytuj wyników ręcznie — popraw skrypt i przegeneruj.
  Wyniki: `logo-mark.png` (emblemat, 512 px — HUD `#hud-logo`, nagłówki ekranów
  `.screen-mark`), `logo-full.png` (pełny lockup — tytuł ekranu startowego
  `.game-lockup` i nagłówek README; **zastąpił CSS-owy wordmark**), `icon-*.png` +
  `favicon.ico` + `apple-touch-icon.png` (favicony, linkowane w `<head>`),
  `icon-maskable-512.png` (PWA, emblemat w bezpiecznym kole 40%), `og-image.png`
  (podgląd social, 1200×630). `site.webmanifest` spina ikony PWA.
  **Wycinanie tła:** źródła leżą na płaskim ciemnym tle `rgb(0,3,25)`, a neon jest na
  nim addytywny, więc alfa NIE bierze się z progowania, tylko z **od-kompozycji**
  (`C = B + a·(F − B)` → alfa z odległości od tła, kolor z rozwiązania na `F`) —
  progowanie zamieniłoby poświatę w widoczną obwódkę. Ciemne wnętrze odznaki (panele,
  sylwetka miasta, czarne kontury) jest nieodróżnialne od tła jasnością, więc wszystko
  domknięte neonową ramką dostaje alfę 1 przez `binary_fill_holes`. Wnętrze panelu
  z napisem zostaje półprzezroczyste (ramka HUD jest kreskowana, nic go nie domyka) —
  to celowe, czyta się jak szkło na ciemnych ekranach gry. Przy podmianie logo **nie
  używaj progowania alfy ani kwantyzacji PNG** (widoczne ziarno na gradientach).
- UI i komunikaty po polsku; **komentarze w kodzie po angielsku** (nowe i edytowane;
  zastane polskie tłumacz przy okazji, gdy modyfikujesz dany fragment). Paleta: indygo
  `#232946` / teal `#00ebc7` / pomarańcz `#ff8906` / czerwień `#ff5470` / złoto
  `#ffd166` (kredyty/headshoty).

## Konwencje techniczne

- Kamera: `rotation.order = 'YXZ'`; PointerLockControls tylko do obrotu, pozycja liczona
  ręcznie (kolizje okrąg-vs-AABB w XZ, lista `colliders`). Przeszkody muszą być osiowe.
- **Pointer lock — nigdy nie startuj gry „na ślepo".** Każde wejście do rozgrywki
  (start / ponów / wznów / misja) ustawia `wantLock = true` i woła `lockPointer()`;
  stan `playing` włącza dopiero zdarzenie `lock`. Odmowa (`pointerlockerror` — np.
  ~1,25 s karencji Chrome po wyjściu ESC) pokazuje ekran `screen-lock` („kliknij,
  aby grać" = świeży gest) zamiast odpalać grę bez przechwyconej myszy. Diagnostyka:
  `__test.pointerLock` / `__test.wantLock`. Z pauzy wychodzi się przez `quitToMenu()`
  (kampania: `mission.abort()` z rollbackiem kredytów jak przy porażce → wybór misji;
  arena: zapis rekordu → ekran startowy).
- **Kucanie** (Ctrl/C, trzymane): `player.crouching` + `player.eyeH` (płynny lerp
  `PLAYER_EYE`↔`CROUCH_EYE`; podłoga to `pos.y <= eyeH` — stojąc na ziemi oko podąża
  za lerpem wprost, bez grawitacji, żeby zejście w kucki nie brzmiało jak upadek).
  Kucanie wyłącza sprint, spowalnia ruch ×0.55 i zbija rozrzut z biodra ×0.65.
  **Boty celują w `player.pos.y`** (nie w stałą `PLAYER_EYE`) — kucnięcie za niską
  osłoną realnie zrywa im LOS i punkt celowania. Reset stanu w `resetLevelState`.
- Model bota: przód to lokalne **+Z** (yaw = `atan2(dx, dz)`); meshe głowy mają
  `userData.isHead` (headshot ×2), wszystkie meshe `userData.enemyRef`.
- Typy botów (`ENEMY_TYPES`): pole `weapon` ('pistol' | 'auto' | 'shotgun') steruje
  ostrzałem w `enemyFire()` — 'auto' strzela seriami (`burstCount`/`burstInterval`),
  'shotgun' ma obrażenia malejące z dystansem i krótki `range` (musi podejść).
  Dropy per typ w `rollDrop()`: scout/assault/uav → amunicja, heavy → apteczka.
  Typ latający: pole `fly` (pułap w metrach) — patrz sekcja Kampania → Drony.
- Bronie gracza mają flagę `owned` — start tylko z pistoletem, reszta kupowana
  w sklepie (pozycje `w_*` w `SHOP_ITEMS`). Nowa broń = wpis w `WEAPONS`, viewmodel
  w `buildViewmodel()`, pozycja `w_...` w sklepie i slot na HUD.
- **Audio (`AudioSys` w `js/audio.js`) — cały dźwięk syntetyzowany w WebAudio.**
  - **Szyna (nie omijaj jej):** głosy → `sfxBus`/`musicGain` → `master` → `duckFilter`
    (lowpass całego miksu) → `compressor` (limiter) → `destination`. Równolegle **pogłos**:
    `ConvolverNode` z impulsem generowanym w kodzie (`makeImpulse` — zanikający szum
    stereo z ciemniejącym ogonem), zasilany per-głos parametrem `send`. Nowe dźwięki
    twórz **wyłącznie** helperami `tone` / `burst` / `ping` — one wpinają się w szynę,
    liczą `__test.sfxPlayed` i obsługują `send`; ręczne `connect(ctx.destination)`
    omija limiter i pogłos.
  - **Dźwięk w świecie = podaj pozycję.** `tone`/`burst` przyjmują `pos` (Vector3):
    `spatial()` liczy z niej panoramę, tłumienie i przytłumienie z dystansu. Strzały
    botów (`enemyShot`) i ich śmierć (`kill`) MUSZĄ dostawać pozycję — to nośnik
    informacji taktycznej. Limit `claimEnemyVoice()` (10 równoczesnych) chroni miks;
    nowe częste dźwięki botów też przez niego przepuszczaj.
  - **`jitter`** (mikro-wariacja pitchu) na każdym powtarzalnym dźwięku — bez niego seria
    z SMG brzmi jak stempel jednej próbki.
  - **Stan trwały:** `AudioSys.update(dt)` z `tick` prowadzi bicie serca (<25 HP)
    i oddech sprintu (flaga `BREATH_SFX`); `AudioSys.resetFx()` woła `resetGameState()`
    i zeruje te pętle oraz otwiera `duckFilter`. Nowy stanowy dźwięk = obsłuż go
    w obu tych miejscach.
  - **Obrażenia** (`hurt(dmg, fromPos)`) panoramują się w stronę napastnika i „duszą"
    cały miks przez `duckFilter` (efekt ogłuszenia) proporcjonalnie do obrażeń.
  - **Kroki** jadą na cyklu head-bobu: `swayPhase` w `player.js`, jeden krok na pół
    okresu, wyzwalany w dnie kołysania — dzięki temu audio trafia w opad kamery.
    Jeśli ruszasz `swayPhase`, sprawdź `swayStepIdx`.
  - **Muzyka:** sekwencer 16 kroków z lookaheadem przez `setInterval`; mood liczony
    z `game.state`/`waveSystem.active` przy planowaniu kroku (bez ręcznego przełączania
    przy zmianach stanu), ale wygładzany przez **`moodBlend`** — combat i spokój
    przenikają się przez ~takt zamiast przeskakiwać. Intensywność = numer fali **+**
    liczba żywych botów. Sekcje basu A/B co 4 takty (`musicBar`) z werblowym fillem
    na szwie; bas/pady/dzwonki idą przez `musicDuck` (sidechain pod stopą). Wszystkie
    obwiednie używają `exponentialRamp*`, więc **głośność nigdy nie może być 0** —
    skaluj przez `cb`/`calm` tylko pod strażą `> 0.05`. Błąd w kroku nie zabija pętli,
    ale ląduje w `__test.musicError`.
  - Stingery UI (`buy`/`pickup`/`heal`/`wave`/`win`) są strojone do **a-moll** — żeby
    nie gryzły się z podkładem, nowe też tam trzymaj.
- Efekty (cząsteczki/tracery/decale/flash) używają **puli obiektów** — przy nowych
  efektach też używaj puli, nie twórz meshy w locie.
- Viewmodel: dziecko kamery; w animacjach **nigdy nie przybliżaj broni do kamery**
  (near plane 0.08 — geometria „wybucha" na ekranie); odsuwaj (`z` bardziej ujemne).
- ADS (PPM, zmienna `aiming` + `adsBlend`): każdy viewmodel ma `userData.adsPos` —
  pozycję, w której **muszka trafia w oś kamery** (x=0, y=−wysokość muszki). Muszki
  w stylu **three-dot**: CIENKIE ciemne słupki (~0.011 — grubsze zasłaniają cel;
  sprawdzone na graczu) z małymi świecącymi kropkami: muszka `vmMatTeal` (~0.008,
  najjaśniejszy punkt obrazu), szczerbinka 2× `vmMatTealDim` (~0.0065); wszystkie
  trzy kropki NA JEDNEJ wysokości = `-adsPos.y`. Wszystko **osadzone na geometrii
  broni** (zamek/szyna/lufa), nie lewitujące — słupki muszą stać na bryle; na wąskiej
  szynie SMG stoi najpierw poprzeczka-podstawka, dopiero na niej słupki. Nowa broń
  musi dostać komplet: muszkę, szczerbinkę i adsPos.
  Snajperka (`zoom: true`) zamiast ADS pokazuje lunetę i chowa viewmodel.
  Balans: `spread` w WEAPONS to rozrzut Z BIODRA (celowo duży); ADS mnoży przez
  `adsMul` (domyślnie 0.3). ADS blokuje sprint i spowalnia ruch ×0.55.
  FOV: luneta 24° / ADS 60° / sprint+bhop poszerzają.
- Bunnyhop: `player.hopBoost` (do 1.35) rośnie za skok w oknie 0.25 s po lądowaniu
  (`player.sinceLand`), wygasa po dłuższym pobycie na ziemi; sprint nie wymaga ziemi.
- Rozróżnianie botów: odcień liberii + kształt głowy + kolor oka — PATROL (scout)
  jasnoniebieski/piramida (Cone, 4 seg.), SZTURM (assault) granat/box, TARAN (heavy)
  czarno-granatowy/sfera (głowa jaśniejszym granatem, NIE czernią), WAŻKA (uav)
  quadkopter. Nowy typ = nowy odcień I nowy kształt. Głowa = kolor ciała × 0.55
  (wyjątek heavy); „oko" ma kształt zgodny z głową. Nogi mają pivot w biodrze
  i machają wg `walkFactor`; wszystkie jednostki noszą biały pas służby i strobo.
- Anti-stuck botów: gdy faktyczny ruch < 30% nominalnego przez 0.35 s → objazd boczny
  (`avoidT`/`avoidDir`) na ~1 s. Faktyczną prędkość mierzy się PO resolveCollisions.
- Generator aren: `generateArena(ARENA_SEED)` (mulberry32, seed z `?seed=N` albo
  losowy per załadunek). Przeszkody TYLKO osiowe; `keepClear` chroni spawn gracza,
  spawny botów i startowe pickupy; MARGIN 2.2 gwarantuje przesmyki dla botów.
  Układ jest stały w obrębie sesji (restart nie przebudowuje świata). Determinizm
  testuje `__test.arenaHash`. Głowy botów mają być zagłębione w tułów (top tułowia
  1.575) — patrz `headY` w buildEnemyModel.
- Smugi strzałów botów są przycinane przed graczem (`_tv.lerp(_eGunPos, 0.12)`) —
  inaczej przelatują przez kamerę jako wielkie wstęgi.
- Kołysanie kamery: roll nadpisywany w całości, pitch-bob nakładany **różnicowo**
  (`swayPitchPrev`), żeby nie walczyć z myszą. Przy resetach zeruj `swayPitchPrev`.
- `dt` clampowany do `[0, 0.05]` — pod wolnym renderingiem (headless) czas gry płynie
  wolniej niż zegar ścienny; testy muszą mieć zapas w timeoutach.
- Restart gry = `resetGameState()` — każdy nowy system z trwałym stanem (ulepszenia,
  liczniki, timery) musi być tam resetowany.
- Tekstury świata: `TexGen` (`js/textures.js`) zwraca zestawy `{ map, normalMap,
  roughnessMap[, emissiveMap] }` (deterministyczne, seedy stałe — wygląd nie zależy od
  `?seed`). Materiały z roughnessMap muszą mieć `roughness: 1.0` (mapa jest MNOŻONA
  przez skalar). Mury: `mat.userData.worldUV = metry/kafel` + `TexGen.applyBoxUV`
  w `addBlock` — kafelkowanie w skali świata (długi mur i filar bez rozciągania);
  skrzynie zostają na domyślnych UV boxa (każda ściana = cały wzór ramy). Wszystkie
  wzory muszą być kafelkowe (szum z zawijaną kratą, stemple rysowane 3×3 przez
  `drawScratches`). Puls neonów: `updateWorldFx()` w `world.js`, wołane z `tick`.

## Kampania (rdzeń gry)

- **Misja = dane** (`js/missions.js`): `{ id, code, name, beat, brief[], outro[],
  goalText, threat, rewardCredits, requires, icon, medals{time,hp,acc},
  arena{seed,half,density,style,theme,playerSpawn,pickups,setPieces,logs},
  waves[], loop, maxAlive, ramp, scale, startPaused, spawnAtStart[], parade,
  objectives[], radio[] }`. Runtime w `js/campaign.js` (obiekt `mission`).
- **Cele** (`OBJECTIVE_TYPES`, kontrakt `start/update/onEvent/isDone/text`):
  `waves` · `eliminate` (opcjonalnie `enemyType`, `spawn[]`, `unpauseWaves`) ·
  `survive` · `hack` (postęp PAUZUJE poza zasięgiem — bez cofania) · `destroy`
  (flaga `shieldDown` zdejmuje tarczę bossa) · `extract` (wyjście RESETUJE) ·
  `reach` (strefy po kolei) · `gates` (wszystkie strefy w oknie czasu — wymusza
  bunnyhop). Łańcuchy przez `after: [ids]`. Zdarzenia wchodzą JEDNYM wejściem
  `missionEvent(ev, payload)` (no-op poza kampanią): `kill` z `killEnemy`,
  `prop` z `destroyProp`, fale przez callback `onCleared`.
- **Pressure (anty-camping):** cele `hack`/`survive`/`gates` włączają w reżyserze
  ciągły dopływ — `waveSystem.setPressure(true)` w ich `start`, wyłączany
  w `finishObjective`. Dokrutka co ~3,6 s × `pressureMul` trudności, tempo rośnie
  z czasem celu (po ~40 s dwukrotnie), typ losowany ze składu bieżącej fali;
  szanuje `paused` (tutorial ze wstrzymanym reżyserem zostaje cichy) i `maxAlive`
  (przy suficie zabity bot jest zastępowany niemal od ręki). Zostawienie jednego
  żywego bota nie kupuje już spokoju.
- **Koniec misji czeka na radio:** komplet celów ustawia `mission.completePending`
  (spawny stają od razu — `waveSystem.paused`), a `missionComplete()` odpala
  `mission.update` dopiero przy pustej kolejce radia. Zegar misji stoi w trakcie
  oczekiwania (dialog nie kosztuje medalu CHRONOMETR). Śmierć gracza przerywa
  dialog i failuje normalnie — czeka tylko sukces.
- **Propy** (`js/props.js`): płaskie meshe w `worldGroup` + `userData.propRef` —
  NIGDY nie zagnieżdżaj `Group` w `worldGroup` (LOS botów jest NIEREKURENCYJNY:
  grupa zatrzymałaby pociski, a bot strzelałby przez nią). Rodzaje: `generator`
  (wybuch AoE — uczy dystansu), `terminal` (hak; ekran przebarwia się teal→złoto),
  `target` (tutorial), `gate` (BRAMA: strumień jednostek co `interval`, limit
  `maxAlive`/bramę, cykl `units[]`; zniszczenie zatrzymuje strumień), `extraction`
  (pierścień w `decorGroup`, widoczny po aktywacji celu).
- **Ekonomia:** kredyty za zabójstwa księgują się DOPIERO po ukończeniu misji
  (porażka/restart = rollback do `mission.creditsAtStart` — inaczej farmienie);
  premia za misję to główna dźwignia krzywej; powtórki płacą 25% premii; medale
  +25 kr raz na kampanię; ceny NIE rosną między misjami; misja startuje z pełnym
  HP/amunicją → Zbrojownia (sklep w trybie `armory`) ukrywa `consumable`.
- **Medale** (po jednej regule): CHRONOMETR (czas ≤ progu), OCALAŁY (minHp ≥ progu),
  PRECYZJA (celność ≥ progu). Liczniki: `missionShot(hit)` w `tryFire`,
  `missionHpTrack()` w `playerTakeDamage`.
- **Trudność** (`DIFFICULTIES`, kampania only — arena zawsze normal, żeby rekord
  był porównywalny): składa się w JEDNYM punkcie (`waveSystem.startNextWave`):
  `(1+(fala−1)·ramp) × difficulty × mission.scale`. Obrażenia botów NIGDY przez
  mutację `ENEMY_TYPES` — stempel per jednostka (`e.dmgMul`). `pressureMul`
  w `DIFFICULTIES` skaluje interwał dokrutki pressure (łatwy wolniej, trudny szybciej).
- **Radio** (dialogi w misji): kolejka linii `{who: centrala|baker|sys, text}`,
  box `#radio-box`, typewriter + robo-blip `AudioSys.voice(who)` co 3 znaki
  (każda postać ma inny syntetyczny tembr). Wyzwalacze `radio[]`: `start`,
  id celu (po jego ukończeniu), `wN` (fala N odparta), `tSEC` (czas misji).
  Wyzwalacz z `hold: true` blokuje WSAD/skok, póki jego linie się piszą
  (+0,5 s po dopisaniu; `radioHoldT`, czyta go `updatePlayer`) — obrót kamery
  zostaje wolny; używane w instruktażu S-00. W trybie TEST linie radia dopisują
  się natychmiast (testy nie czekają na prozę), a hold trwa tylko ten ogon.
- **Zapis** (`localStorage`, klucz `status1_save`, v1; fallback ze starszego
  `czynnasluzba_save`): postęp misji
  (done/bestTime/medals), bieg (`run`: kredyty/poziomy sklepu — bronie wynikają
  z poziomów `w_*`), trudność, staty, `finished`. Każdy odczyt/zapis w try/catch
  (file:// + tryb prywatny). Loadout odtwarza `applyAllShopEffects()` —
  dlatego efekty sklepu MUSZĄ pozostać idempotentne (żadnych `+=`).
  Rekord areny: `status1_best` (fallback: `czynnasluzba_best`, `neonarena_best`).
- **Epilog** (`ep`): `noCombat` (broń schowana, celownik ukryty, tryFire/switch/
  reload zablokowane), `parade` (pasywne jednostki maszerują przez halę i cicho
  znikają na krawędzi), finał = typewriter na ekranie odprawy (STATUS 1).
- **Drony:** liberie policyjne — PATROL jasnoniebieski/piramida, SZTURM granat/box,
  TARAN czarno-granatowy/kula (głowa jaśniejsza specjalnym kolorem, nie czernią),
  WAŻKA (uav) = quadkopter: `fly: 3.0` w ENEMY_TYPES, wisi na pułapie, przelatuje
  NAD niskimi osłonami (`resolveCollisions(..., minTop)`), model bez nóg (guardy
  `e.legL`), rotory się kręcą. WAŻKA to **podstawowy, tani przeciwnik od S-01
  i od 1. fali areny** (BOT-2: mało HP, słaby ostrzał, chodzi w 2–3 sztuki;
  fabularnie najtańsza linia SENTINEL) — nie traktuj jej jak rzadkości. Wszystkie jednostki mają zsynchronizowane strobo
  (współdzielone `matStrobeR/B`, animowane raz na klatkę). Boss = heavy ze
  `scaleMul`/`hpMul`/`invulnerable` (tarcza: blady flash, zero obrażeń) —
  per-jednostkowy `e.radius` zamiast `e.type.radius`.
- **Motywy aren** (`ARENA_THEMES` w world.js): indigo/ember/alert — mgła + kolor
  listw granicznych; arena bez końca zawsze wraca do indigo (materiały współdzielone).
- **Anti-stuck botów:** kierunek objazdu jest UTRWALANY (ponowne wyzwolenie w <2,5 s
  trzyma ten sam kierunek) — losowanie za każdym razem to błądzenie losowe wzdłuż
  długich murów stylu corridors.

## Uruchamianie i testy

- Dev-serwer: `python -m http.server 8137` w katalogu projektu.
  **Port 8137, nie 8000** — na 8000 działa lokalny serwer PHP użytkownika.
- Testy: Playwright (Python, `channel="chrome"`, headless) + flagi
  `--use-angle=swiftshader --enable-unsafe-swiftshader` (WebGL w headless).
  Do testów audio dodaj `--autoplay-policy=no-user-gesture-required` — bez tego
  `AudioContext` startuje zawieszony i nic się nie planuje.
- **Gotowe zestawy testów leżą w `tests/`** (opis w `tests/README.md`):
  phase0–phase5d pokrywają cykl życia świata, generator, kampanię, propy,
  medale i pełne przejście; `status1_test.py` to smoke rebrandingu;
  `shots*.py` robią zrzuty ekranu do oceny wizualnej. Po większych zmianach
  odpal przynajmniej `phase0_test.py` (regresja świata/areny)
  i `phase5d_test.py` (pełne przejście kampanii).
- Hooki diagnostyczne w grze (nie usuwać):
  - `window.__test` — stan aktualizowany co klatkę (state, hp, score, wave, enemies,
    ammo, fov, credits, headshots, endless, errors[], mode, difficulty,
    mission {id, active, time, kills, objectives[]}, seed, arenaHash,
    arenaReachable, pointerLock/wantLock, crouch/eyeH, pressure, radioHold);
    audio: `sfxPlayed`, `musicSteps`/`musicRunning`, `musicError`;
  - parametry URL: `?test=play` (autostart areny bez pointer locka), `?test=shoot`
    (+ auto-celowanie z kontrolą LOS), `?test=over`, `?test=win` (przewinięcie fal);
    `&wave=N` (arena od fali N); **`?test=mission&m=<id>&diff=easy|normal|hard`**
    (autostart misji kampanii ze świeżym biegiem); debug generatora (arena):
    `?style=open|pillars|corridors&half=N&density=X`; `?seed=N` jak dawniej;
  - `window.__addCredits(n)`, `window.__buyItem(id)`, `window.__startMission(id)`,
    `window.__teleport(x, z)` (niezbędne do testów stref), `window.__rebuildArena(seed)`
    (regresja teardownu: 2× ten sam seed ⇒ identyczny `arenaHash`), `window.__killAll()`.
- ⚠️ `dt` jest clampowany do `[0, 0.05]` — pod SwiftShaderem czas gry płynie wolniej
  niż zegar ścienny; cele czasowe (survive/hack) w testach przewijaj przez stan
  (`mission.objectives[i].t = ...`), a timeouty dawaj z zapasem.
- Scenariusz `file://` też musi działać — po zmianach sprawdzaj oba warianty.

## Backlog pomysłów (do przyszłej rozbudowy)

Zaimplementowane wcześniej: headshoty, wskaźnik kierunku obrażeń, sklep między falami
(w tym kupowanie broni), tryb endless, rekord w localStorage, animacja+dźwięk
przeładowania, sway/FOV sprintu, trzy typy botów (pistolet/karabin/strzelba), dropy
per typ wroga, muzyka proceduralna, cała sekcja „Oprawa wizualna" (punkty A/B/C
poniżej: `TexGen`, `UI_ICONS`, bogatsze modele botów i viewmodele z celownikami
three-dot) oraz cała „Oprawa dźwiękowa" (poniżej).

### Oprawa dźwiękowa — ✅ ZROBIONE

Overhaul audio w całości mieści się w zasadzie „100% syntetyczne WebAudio" (patrz
Architektura; szczegóły w Konwencjach technicznych). Dowiezione: szyna z limiterem
i **proceduralnym pogłosem**, **pozycjonowanie 3D** strzałów i śmierci botów (panorama
+ dystans) z limitem głosów, warstwowe strzały z `jitter`, FM-ping headshota, śmierć
per typ bota, **kroki** wpięte w head-bob, skok/lądowanie skalowane upadkiem, chirp
bunnyhopa, ważona zmiana broni, ogłuszenie + panorama przy obrażeniach, bicie serca
poniżej 25 HP, oddech sprintu (`BREATH_SFX`), riser przed falą oraz muzyka 2.0
(sekcje A/B + fill, rozstrojone pady, dzwonki FM, sidechain, `moodBlend`, warstwa
napięcia przy niskim HP).

Zostało opcjonalnie: **materiał podłoża pod krokami** (inny dźwięk na betonie vs metalu
— dziś jeden), **pogłos zależny od otoczenia** (krótszy na otwartej arenie, dłuższy przy
murze — dziś jeden impuls) i **suwaki głośności** (patrz Rozgrywka → „Ustawienia
w pauzie": `master.gain` i `musicGain.gain` są gotowymi punktami zaczepienia).

### Oprawa wizualna (odejście od „kółek i kwadratów")

Trzy poniższe punkty mieszczą się w zasadzie „wszystko generowane, nic ściąganego"
(patrz Architektura) — realizowalne bez zewnętrznych assetów.

A. **Bogatsze tekstury proceduralne** — ✅ ZROBIONE (canvas w runtime: `TexGen`
   w `js/textures.js` — patrz Konwencje techniczne), łącznie z **animowanymi
   hologramami**: `TexGen.makeHologramTexture()` (strumień glyphów) na 8 panelach
   przy wewnętrznych licach murów; przewijanie `tex.offset.y` + migotanie
   w `updateWorldFx`. Panele są dodane do `scene`, NIE do `worldGroup` (nie mogą
   łapać strzałów/decali/LOS) i mają `fog: false` (mgła + additive = świecący
   prostokąt). Zostało opcjonalnie: popękany beton, wariant offline
   `tools/gen_textures.py` (PIL/numpy) → base64 w JS, gdyby canvas przestał
   wystarczać. **Nie ładuj tekstur sceny 3D z plików PNG** — patrz ostrzeżenie
   o CORS/`file://` w sekcji Architektura. Przy nowych mapach pamiętaj:
   `colorSpace = SRGBColorSpace` **tylko** dla map koloru/emisji (normal/roughness
   zostają liniowe — inaczej oświetlenie wyjdzie „umyte").
B. **Ikony wektorowe (SVG) dla UI** — ✅ ZROBIONE (`UI_ICONS` w `js/icons.js`: bronie,
   ulepszenia sklepu — z kolorami kategorii `si-icon--weapon/consumable/upgrade` —
   sloty broni na HUD i emblematy statystyk; wszystko inline SVG na `currentColor`,
   statyczny markup przez placeholdery `<span class="icon" data-icon="…">`).
   **Znaczniki pickupów na ekranie** też zrobione: `updatePickupMarkers()`
   w `pickups.js` rzutuje pozycje pickupów na ekran (ikony z `UI_ICONS` w kontenerze
   `#pickup-markers`), skala maleje z dystansem, dropy mrugają, gdy `life < 6` s;
   usuwanie przez `removePickup()`/`clearPickups()` (reset gry używa `clearPickups`).
   Nowa ikona = wpis w `UI_ICONS` (viewBox 24×24, `currentColor`); do faviconów/OG
   renderować do PNG skryptem z `tools/`.
C. **Bogatsze modele proceduralne** — ✅ ZROBIONE. Boty: tors z dwóch segmentów,
   płyta piersiowa z małym świecącym rdzeniem (kolor akcentu), naramienniki (heavy ma
   większe), statyczne ramiona (prawe przedramię celuje w broń), cylindryczne lufy,
   dekory głów per typ (scout: antena ze świecącą końcówką, assault: daszek nad
   wizjerem, heavy: obręcz hełmu) — dekory głowy mają `userData.isHead` (liczą się
   jak headshot). Viewmodele: cylindryczne lufy (`vmCyl`), tłumik SMG, luneta
   z obiektywem, zapasowe naboje strzelby, magazynki ze stopkami, kabłąki spustu.
   Zasady, które zostają w mocy: przód bota to lokalne **+Z**, meshe głowy muszą mieć
   `userData.isHead`, każdy mesh `userData.enemyRef`, typ nadal rozpoznawalny po
   **kolorze ciała I kształcie głowy**; nowa broń wymaga muszki + `adsPos` (patrz
   Konwencje techniczne). Liczbę trójkątów trzymać w ryzach — boty spawnują się
   dziesiątkami (helpery `enemyBox`/`enemyCyl`).

### Rozgrywka

Zrobione w przebudowie na STATUS 1 (2026-07): **kampania 11 symulacji**
(tutorial, cele hack/destroy/extract/reach/gates/survive, BRAMY, boss z tarczą,
pościg, epilog bez walki), **czwarty typ bota** (WAŻKA — latający quadkopter),
**boss** (prototyp SENTINEL-1), **poziomy trudności**, **medale** (3/misję),
**zapis kampanii**, **dialogi radiowe z robo-głosami**, **liberie policyjne +
strobo**, **motywy aren**, **holo-logi tekstowe**, rebranding.

Zrobione w fazie „teraz/1" roadmapy (2026-07-13): **naprawa pointer locka**
(ekran `screen-lock` zamiast startu bez myszy — BUG-1), **wyjście do menu
z pauzy** (`quitToMenu`/`mission.abort` — BUG-2), **kucanie** (RUCH-1),
**koniec misji czeka na dialog** (`completePending` — MISJA-4), **hold radia
w tutorialu** (MISJA-5), **pressure przy celach hack/survive/gates** (MISJA-1),
**WAŻKA jako częsty przeciwnik od S-01 i w arenie** (BOT-2). Szczegóły
w Konwencjach i sekcji Kampania.

Pomysły na dalszą rozbudowę:

1. **Granaty** (klawisz G) — pociski z fizyką łuku (grawitacja jak w cząsteczkach),
   eksplozja obszarowa + odrzut. (Generator AoE z props.js to gotowy wzorzec obrażeń.)
2. **Ustawienia w pauzie** — czułość myszy, głośność master/muzyki, przełącznik
   bloom/cieni (dla słabszych maszyn), zapisywane w localStorage. Audio ma już
   osobne węzły do podpięcia suwaków: `master.gain` (całość) i `musicGain.gain`
   (sam podkład) — trzeba je tylko wystawić z closure `AudioSys`.
3. **Nagroda za komplet medali (30/33)** — bonusowa linia w outro / skórka broni;
   zapis ma już liczniki.
4. **Ekran wyników misji ze szczegółami** — wykres HP w czasie, mapa trasy.
5. **Sterowanie dotykowe** — wirtualne gałki dla telefonów (gra jest lekka).
6. **Minimapa / kompas** — kierunki botów na obwódce ekranu lub mały radar
   (znaczniki celów z off-screen chevronami już istnieją — to ich rozszerzenie).
7. **Dostępność** — remapowanie klawiszy, tryb dla daltonistów, redukcja migotania
   (strobo dronów powinno mieć wyłącznik!).
8. **Multiplayer co-op (WebRTC)** — największy skok złożoności; wymaga sygnalizacji,
   więc łamie zasadę „zero backendu" — rozważyć dopiero po wyczerpaniu single-player.
9. **Pickupy na przełomie fal (arena)** — świeża dostawa w przerwie między falami
   zamiast wszystkiego na starcie; w kampanii pickupy są już autorskie per misja
   (`arena.pickups`).
10. ~~**Nowe logo/og-image**~~ — ✅ ZROBIONE (2026-07-13): cały komplet (emblemat,
   lockup, favicony, PWA, og-image) leci z `tools/gen_logo.py` — patrz Architektura →
   Branding. Ekran startowy pokazuje pełny lockup zamiast CSS-owego wordmarku.
