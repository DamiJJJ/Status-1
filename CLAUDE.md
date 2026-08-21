# STATUS 1 (dawniej NEON ARENA) — notatki dla Claude Code

> ⚠️ **STAN NA 2026-08-18: kampania i trzy typy botów są WYCIĘTE z gry.**
> Leżą w `_kosz/` (patrz `_kosz/README.md`) i nic ich nie ładuje. Tego samego
> dnia z menu wyleciała też **Arena bez końca** - jedynym uruchamialnym trybem
> jest **STRZELNICA (dev)**, a jedynym przeciwnikiem **PATROL**. Maszyneria
> areny (fale, sklep, rekord, ekrany over/win) zostaje w kodzie: `startArena()`
> woła ją nadal tryb testowy `?test=` (testy phase0/phase1), a strzelnica
> jeździ na tej samej instalacji z `waveSystem.paused`.
> W `js/` została zaślepka `campaign_off.js` z globalami, które reszta kodu
> woła bezwarunkowo (`difficulty()`, `missionEvent`, `radioHoldT`,
> `backToMenu`, statystyki). Gałęzie `if (game.mode === 'campaign')` zostały
> nietknięte i są martwe — `game.mode` jest zawsze `'arena'`.
> **Sekcje niżej opisujące kampanię, misje, medale, radio i pozostałe typy
> botów dotyczą kodu w `_kosz/`** — czytaj je jako dokumentację tego, co
> wraca, nie tego, co działa.

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
  szyna WebAudio, SFX (synteza + próbki z `js/sfx.js`), motyw menu z pliku, stingery celów,
  robo-głosy `voice(who)`) →
  `renderer.js` (renderer/kamera/postprocessing/światła/niebo) →
  `badge.js` (GENEROWANY przez `tools/gen_badge.py`: odznaka LSPD jako data URI) →
  `textures.js` (`TexGen`: proceduralne tekstury z canvasa; `makeLogTexture` — panele
  z polskim tekstem; `makeBotText`/`makeBotBadge` — dekale liberii botów;
  wymaga `renderer`, więc MUSI być po `renderer.js`) →
  `models.js` (GENEROWANY przez `tools/gen_models.py`: `MODEL_DATA`, spakowana
  geometria zewnętrznych modeli) → `modelkit.js` (`buildModel`/`socketLocal`:
  dekoder + budowa instancji z cache'owaną geometrią) →
  `menubg.js` (MENU-1: panorama Los Santos za menu — własna scena/kamera,
  `MenuBg.build/update`, `menuBgActive()`; buduje się dopiero w `main.js`) →
  `world.js` (cykl życia areny, generator parametryczny ze stylami open/pillars/
  corridors, pierścień wewnętrzny dla mniejszych aren, flood-fill `validateArena`,
  motywy `applyTheme`, panele holo/logów) →
  `props.js` (set-piece'y misji: generatory/terminale/BRAMY/cele treningowe/strefy;
  **płaskie meshe w `worldGroup` z `userData.propRef`** — lustrzane odbicie
  `enemyRef`) → `effects.js` → `collisions.js` (okrąg-vs-AABB; parametr `minTop` —
  latające jednostki omijają collidery niższe od pułapu) → `player.js` →
  `hands.js` (BRON-2: ramiona gracza z wypieczonego modelu `arms` - materiały
  rękawic/rękawów, ramki chwytu `handFrame`, `attachArms`;
  wymaga tylko THREE przy ładowaniu, `buildModel` woła dopiero z weapons.js) →
  `weapons.js` (WEAPONS - 5 broni w slotach 1-5, viewmodele z wypieczonych
  modeli/ADS/strzelanie; RĘCE na każdej broni + animacje przeładowań/sprintu
  i opóźniona luneta - patrz Konwencje → „Ręce gracza"; gałąź `propRef`;
  blokada `game.noCombat`) → `grenades.js` (granaty na G: pula pocisków, łuk, odbicia,
  AoE; licznik `game.grenades`) → `enemies.js` (ENEMY_TYPES/modele/AI; liberie policyjne + strobo,
  UAV, tarcza bossa, jednostki pasywne parady) → `icons.js` (`UI_ICONS`; pętla
  `[data-icon]` działa RAZ przy ładowaniu — dynamiczny markup wstawia
  `UI_ICONS[key]` sam) → `pickups.js` (`placeArenaPickups` z danych `arena.pickups`) →
  `shop.js` (`applyAllShopEffects` — IDEMPOTENTNE efekty sklepu, warunek zapisu;
  tryb Zbrojowni) → `waves.js` (JEDEN reżyser dla obu trybów; polityka wstrzykiwana
  przez `reset(policy)`: script/loop/maxAlive/onCleared/paused) →
  `campaign_off.js` (zaślepka po wyciętej kampanii: `DIFFICULTIES`/`difficulty()`,
  puste `missionEvent`/`missionShot`/`missionHpTrack` liczące statystyki służby,
  `radioHoldT`/`updateRadio`, `backToMenu`, `openStats`/`renderStats`,
  `renderMenuMeta`; oryginały w `_kosz/kampania/`) → `hud.js` → `state.js`
  (obiekt `game`; **`resetRunState`** = progresja, **`resetLevelState`** = świat/ciało;
  `resetGameState` = obie, tylko arena) → `settings.js` (obiekt `SETTINGS`,
  ekran ustawień, zapis `status1_settings`) → `devmap.js` (STRZELNICA - mapa
  deweloperska, patrz Konwencje) → `devrig.js` (DEVRIG - edytor chwytu rąk,
  patrz Konwencje) → `input.js` → `testmode.js` → `main.js`
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

  - **geometria z zewnętrznych modeli CC0/CC-BY** (decyzja użytkownika, 2026-08-18):
    źródłowe `.glb` leżą w `assets_src/`, a `tools/gen_models.py` wypieka z nich
    SAMĄ GEOMETRIĘ do `js/models.js` (kwantyzacja + base64). Materiały, kolory
    i światło zostają nasze — patrz Konwencje → „Modele zewnętrzne". Autorów
    trzeba wymienić w README (CC-BY), a plik źródłowy commitować razem z wynikiem.

  - **odznaka LSPD** (decyzja użytkownika, 2026-08-19): `assets/lspd_badge.png`
    to jedyna bitmapa gry, którą widać w scenie 3D. Idzie tą samą drogą co
    wszystko inne — skrypt w repo (`tools/gen_badge.py`) przycina ją do bboxa
    alfy, skaluje do 192 px i zapisuje `js/badge.js` z data URI. Źródło
    commitujemy razem z wynikiem. Nie rozszerzaj tego wyjątku na inne tekstury.

  - **próbki dźwiękowe royalty-free / CC0** (decyzja użytkownika, 2026-08-21):
    zasada „dźwięk rozgrywki w 100% syntetyczny" ZOSTAŁA ZNIESIONA dla SFX.
    Powstała z dwóch powodów i oba padły: licencyjny (są banki royalty-free,
    m.in. doroczny Sonniss GDC Game Audio Bundle - użycie komercyjne bez
    atrybucji) oraz techniczny (rzekomy brak drogi do grafu WebAudio przy
    `file://`). **Ten drugi był po prostu błędny**: `fetch` faktycznie jest
    blokowany, ale próbka wklejona jako base64 w pliku JS dekoduje się bez
    niego - `atob` → `Uint8Array` → `ctx.decodeAudioData(buf.buffer)` - i wraca
    zwykłym `AudioBuffer`. To jest PEŁNOPRAWNY węzeł grafu: `BufferSourceNode`
    wpina się w `sfxBus`, ma `send` do konwolwera, `spatial()`, `duckFilter`,
    limiter i `jitter` przez `playbackRate`. Żadnej ceny `<audio>` (patrz motyw
    menu niżej) się nie płaci.
    Pipeline jak wszędzie: `assets_src/sfx/*.wav` → `tools/gen_sfx.py` →
    `js/sfx.js` (base64), źródło i skrypt commitowane razem z wynikiem, autorzy
    w README. **Koduj do Ogg/Opus, nie WAV** (WAV w base64 jest ~10× większy);
    mono, 22-32 kHz w zupełności wystarczy na strzał.
    ⚠️ Realizm strzału bierze się z WARSTW, nie z jednego pliku: mechanika
    (spust/zamek) + wystrzał + osobny OGON, plus 2-3 warianty samego wystrzału
    losowane naprzemiennie. Jeden sample na broń dalej będzie brzmiał jak
    stempel - dokładnie ta sama wada, przed którą chroni `jitter`.

  **Zabronione: gotowe TEKSTURY z zewnątrz** (stock, paczki assetów, biblioteki
  tekstur) — licencje i spójność stylu. Modele z zewnątrz wolno brać wyłącznie
  na warunkach wyżej (CC0/CC-BY, sama geometria), próbki dźwiękowe na warunkach
  wyżej (royalty-free/CC0, przez base64 do grafu WebAudio).
  **MUZYKA rozgrywki zostaje proceduralna** — sekwencer reaguje na stan walki
  (`moodBlend`, intensywność z fali i liczby żywych botów), czego pętla z pliku
  nie umie; nie zastępuj go nagraniem.
  **Motyw menu** `assets/Rain Over Neon Spires.mp3` jest jedynym dźwiękiem
  granym POZA grafem (`<audio id="menu-music">`, decyzja użytkownika
  2026-08-14). Tam ta cena nic nie kosztuje: w menu nie ma walki, pod którą
  trzeba by się ściszać. Nowych dźwięków tą drogą NIE dodawaj — od tego jest
  base64 + `decodeAudioData` (wyżej), które zostaje w grafie.
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
- **Tarcza skrótów przeglądarki** (input.js): Ctrl to kucanie/wślizg przy
  trzymanym WSAD, więc bez osłony gra generuje Ctrl+W (zamknięcie karty!),
  Ctrl+T/D/1..4. Trzy warstwy: (1) `preventDefault` dla `GAME_KEYS` i każdej
  kombinacji z Ctrl w stanach `SHIELD_STATES` — MUSI działać PRZED
  early-outem `e.repeat` (trzymane W pod Ctrl przychodzi jako repeat); wheel
  w grze też jest `preventDefault` (listener z `{passive:false}` — pasywnego
  nie da się anulować); (2) **Keyboard Lock** (Chrome) — działa TYLKO
  w fullscreenie, dlatego `lockPointer()` wchodzi w pełny ekran w tym samym
  geście (opcja `SETTINGS.fullscreen`, domyślnie ON; w TEST pomijane —
  headless nie ma gestu); `Escape` celowo NIE jest lockowany, musi dalej
  wychodzić z pointer locka (pauza); (3) `beforeunload` w trakcie biegu
  (playing/paused/shop/ustawienia-z-pauzy) zamienia niezablokowywalne
  okienkowe Ctrl+W/F5 w natywne pytanie „opuścić stronę?" — poza biegiem
  nieuzbrojone, w TEST wyłączone (testy nawigują w trakcie gry). Nowy klawisz
  gry dopisuj do `GAME_KEYS` (i tym samym do listy Keyboard Lock).
- **Modele zewnętrzne** (`tools/gen_models.py` → `js/models.js` → `js/modelkit.js`):
  pipeline istnieje, bo przy `file://` `GLTFLoader` nie zadziała (`fetch` jest
  blokowany), więc `.glb` NIE MOŻE leżeć obok `index.html`. Skrypt czyta glTF
  offline, wypieka transformacje węzłów, dzieli mesh na CZĘŚCI (skinning: po
  dominującym jointcie, statyczne: po nazwie węzła), liczy piwoty z bind pose'u
  (`inverseBindMatrices`) i pakuje pozycje do int16 + normalne do int8 w base64.
  Runtime (`buildModel(name, matFor)`) buduje instancję: każda część siedzi we
  własnej `Group` ustawionej NA PIWOCIE, więc `parts.slide.position.z` odciąga
  zamek. Rigi, które muszą się GIĄĆ (dziś: `arms` i `sentinel`), idą osobną
  ścieżką `skin: True` → `build_skinned` → `buildSkinnedModel` - jeden
  `SkinnedMesh` plus drzewo kości, bo cięcie na sztywne party pęka na szwach. **Geometrie są cache'owane i współdzielone** (`_modelGeoCache`) —
  boty spawnują się dziesiątkami, świeży `BufferGeometry` na sztukę to przeciek.
  `matFor(srcMaterialName)` mapuje materiał ŹRÓDŁOWY na nasz — dzięki temu jeden
  mesh nosi dowolną liberię. `sockets` (np. `handR`) to punkty montażowe z bind
  pose'u; `socketLocal(model, socket, part)` przelicza je do układu części, żeby
  doczepiona broń jechała z ręką. Rigi, których macierze inverse-bind NIE
  znoszą się z grafem węzłów (surowe pozycje wierzchołków nie są w przestrzeni
  sceny - np. Mossberg z armaturą o własnej skali), dostają w `MODELS` flagę
  `bindWorld: True`: wierzchołki idą wtedy przez `jointWorld*IBM` dominującego
  jointu, a piwoty z grafu węzłów. Nowy model = wpis w `MODELS` w skrypcie
  (mapowanie jointów/węzłów, `rot`, `height`/`length`), `--probe` do sprawdzenia
  orientacji i granic, potem przegenerowanie pliku i kredyt w README.
  **`split` (2026-08-21)** wycina RUCHOMĄ część z bryły, która przyjechała
  jako jeden węzeł. Glock nazywa swój magazynek (`nodes`), ale bronie
  Quaterniusa to jeden mesh w jednym węźle, więc części do animacji nie da
  się wybrać po nazwie - tylko po tym, GDZIE leży (pudełko w METRACH
  finalnej przestrzeni modelu, te same liczby, które drukuje `--probe`) albo
  po materiale, który ma wyłącznie na własność (`src`). Cały trójkąt idzie
  do nowej części, więc granice stawiaj na krawędziach fasetek, a nową część
  dopisz do `order`. Po zmianie `length` przelicz pudełka - są w metrach.
  Tak jedzie magazynek SMG (`mag`, x ±0,0155 y[-0,160 0,055] z[-0,168 -0,104])
  i jego płyta zamka (`bolt` = cały materiał `Grey`).
  **`paint` (2026-08-19)** dokłada modelowi materiały, których nie ma w źródle:
  lista reguł `{mat, src?, bones?, x/y/z: (lo, hi)}` przenosi trójkąty do nowej
  grupy materiałowej po dominującej kości i pudełku w METRACH pozy bind
  (`scenev` - ta sama przestrzeń, którą drukuje `--probe`). Pierwsza pasująca
  reguła wygrywa, malowany jest CAŁY trójkąt (stawiaj granice na krawędziach
  fasetek), a `matFor` w runtime dostaje nową nazwę jak każdą inną. Tak jedzie
  liberia LSPD (`Blue`, `Visor`) - patrz „Rozróżnianie botów".
  ⚠️ `height`/`length` normalizuje bryłę **tylko po częściach z `order`**
  (2026-08-19) - część zmapowana poza `order` i tak wypada przy `pack()`,
  więc mierzenie modelu geometrią, której nikt nie zobaczy, dawało zły
  rozmiar (ręce: ucięte ramię `cut` zawyżało bbox, patrz `--probe`, wiersz
  `!! parts not in order`).
  Konwencja broni: lufa wzdłuż **lokalnego −Z**, `length` = długość całkowita,
  `center: True`; wypieczone są `glock`, `smg`, `shotgun` (Mossberg 590A1,
  części body+pump), `rifle`, `sniper`.
- **Kucanie** (Ctrl/C, trzymane): `player.crouching` + `player.eyeH` (płynny lerp
  `PLAYER_EYE`↔`CROUCH_EYE`; podłoga to `pos.y <= eyeH` — stojąc na ziemi oko podąża
  za lerpem wprost, bez grawitacji, żeby zejście w kucki nie brzmiało jak upadek).
  Kucanie wyłącza sprint, spowalnia ruch ×0.55 i zbija rozrzut z biodra ×0.65.
  **Boty celują w `player.pos.y`** (nie w stałą `PLAYER_EYE`) — kucnięcie za niską
  osłoną realnie zrywa im LOS i punkt celowania. Reset stanu w `resetLevelState`.
- **Wślizg** (PROP-2): kucnięcie przy prędkości > `WALK_SPEED × 1.05` startuje
  wślizg (`player.sliding`, `SLIDE_DUR` 0,55 s). Kierunek jest UTRWALANY na
  wejściu (`_slideDir`), prędkość `max(1.1×bieżąca, 1.05×sprint)` wygasa
  w trakcie; wślizg nadpisuje sterowanie wprost (`vel.x/z`), zwykłe
  przyspieszanie jest pomijane. Koniec: timer / puszczenie klawisza / utrata
  ziemi → cooldown `slideCd` 0,8 s (bez łańcuszenia — od prędkości jest
  bunnyhop; skok W TRAKCIE wślizgu zachowuje pęd). Kamera: stały przechył
  `slideTilt` dodawany do rolla w `updateCameraSway` (kroki wyciszone —
  wślizg to jeden ciągły szur `AudioSys.slide()`); FOV +7. Reset pól
  w `resetLevelState` (w tym `slideTilt`).
- **Granaty** (`js/grenades.js`, klawisz G): pula `grenadePool` (jak efekty —
  zero meshy w locie), grupa w `scene`, NIE w `worldGroup` (nie mogą łapać
  strzałów/LOS botów). Łuk: grawitacja ×0.82, odbicia od podłogi z tłumieniem
  i od ścian przez `resolveCollisions(pos, r, minTop = y)` — granat przelatuje
  NAD niskimi osłonami jak WAŻKA, a odbita oś odwraca prędkość. Zapalnik
  1,7 s → AoE 4,5 m (95 w centrum, liniowy spadek; dystans 3D — WAŻKA na
  pułapie ledwo obrywa od podłogi), 50% obrażeń własnych (uczy dystansu jak
  generator), rani też destrukcyjne propy (BRAMY/generatory). Zapas
  `game.grenades`: `GRENADE_START` 2 na każdy start poziomu
  (`resetLevelState` + `clearGrenades`), sklep `nade` dokupuje 2 (limit
  `GRENADE_MAX` 4; consumable → w Zbrojowni kampanii niewidoczny — misja
  zawsze startuje z 2). Licznik na HUD (`#hud-grenade`, `updateGrenadeHud`).
- **Menu główne + panorama** (MENU-1, `js/menubg.js`): ekran `screen-menu`
  (obecnie: Strzelnica (dev) / Bestiariusz / Statystyki / Ustawienia) to
  nadrzędna warstwa nawigacji; `backToMenu()` wraca do menu. Ekran wejścia
  do areny (`screen-start`) został USUNIĘTY razem z pozycją „Arena bez
  końca" (2026-08-18) - `startArena()` żyje tylko dla trybów `?test=`. Układ w stylu Cyberpunka (decyzja użytkownika): kolumna
  menu PO LEWEJ na półprzezroczystym gradientowym panelu
  (`.screen--panorama::before`), pozycje tekstowe — pierwsza w tealowej
  ramce, reszta czerwona, hover przebarwia na teal; linia postępu na dole
  jak stempel wersji. Tło to osobna scena Three.js (`MenuBg.scene/camera`,
  własna mgła i niebo): 3 pasma wieżowców z boxów z oknami
  `TexGen.makeCityWindows` (UV przez `applyBoxUV(geo, 24)`, seed stały —
  miasto identyczne co boot), neony (kolor `multiplyScalar(2.8)` — inaczej
  ACES zjada je do pasteli i bloom ich nie łapie), drony SENTINEL ze strobo,
  reflektory, dryf kamery. Tonacja NIEBIESKO-CZERWONA (kolory policyjne):
  niebo ma dwie łuny (karmazyn nad centrum + niebieska z boku), smog
  addytywny naprzemiennie czerwony/niebieski. Dół kadru NIE może być czarny:
  doświetlone niskie bloki pierwszego planu (ciemny dach przez grupy
  materiałów boxa), najbliższy rząd pod kamerą, uliczne pasy światła
  czerwone/niebieskie i niski pas mgły. Renderuje WSPÓLNY composer:
  `tick` przełącza `renderPass.scene/camera` wg `menuBgActive()` (stany
  nawigacji: menu/levels/stats/brief, ustawienia poza pauzą, zbrojownia
  kampanii; ekrany po rozgrywce — pauza/over/won/debrief/mfail — celowo
  zostają na zamrożonym świecie gry). Ekran menu jest przezroczysty
  (`.screen--panorama`), więc `tick` toggluje `body.menu-bg`, a CSS chowa
  HUD/celownik/winietę (`!important` — bije reguły per-id). Statystyki:
  `openStats()`/`renderStats()` w campaign.js (z zapisu + `game.best`);
  zbrojownia z menu przez `openArmoryFromMenu()` (najpierw
  `applyRunFromSave()`). Diagnostyka: `__test.menuBg`; testy
  `tests/menu_test.py`.
- **Bestiariusz** (`js/bestiary.js`, 2026-08-18): ekran `screen-bestiary`
  (stan `'bestiary'`) z menu głównego. Dane w tablicy `BESTIARY` (kod, rola,
  uzbrojenie, opis, zrzut) + liczby czytane z `ENEMY_TYPES`, żeby karta nie
  rozjechała się z balansem. Model to zwykłe `buildEnemyModel(type)` w OSOBNEJ
  scenie (`Bestiary.scene/camera`, własne światła i podest) renderowanej przez
  ten sam composer - `main.js` przełącza `renderPass` jak przy panoramie, a
  `menuBgActive()` zwraca `true` dla stanu `'bestiary'` (chowa HUD, gra motyw
  menu). **Modele są cache'owane per typ i tylko przełączane widocznością** -
  `buildEnemyModel` alokuje geometrie, więc przebudowa przy każdym kliknięciu
  by przeciekała. `updateEnemies` w menu nie chodzi, więc animowane
  materiały botów (strobo, syreny) pcha `Bestiary.update` przez
  `updateBotLights(dt)`. Kamera per wpis (`entry.cam`) - WAŻKA jest za
  mała, żeby czytać się z tej samej odległości co podwozie. Diagnostyka:
  `__test.bestiary` (nazwa typu albo null); testy `tests/bestiary_test.py`.
- **Ustawienia** (`js/settings.js`, PROP-1/PROP-6): obiekt `SETTINGS` (sens,
  volMaster, volMusic, bloom, shadows, strobe, fullscreen), zapis
  `status1_settings` w try/catch, stosowanie na żywo przez `applySettings()`
  (bloomPass.enabled, sun.castShadow, `AudioSys.setVolumes` — mnożniki na
  bazowych gainach; fullscreen WCHODZI w `lockPointer()`, bo wymaga gestu —
  `applySettings` tylko wychodzi z pełnego ekranu po wyłączeniu opcji).
  Czułość i strobo czytane w punkcie użycia (mousemove w player.js,
  `updateEnemies` w enemies.js — strobo OFF = oba paski świecą stale ~1.3).
  Ekran `screen-settings` otwierany ze startu i pauzy (`openSettings(from)`
  pamięta powrót); stan gry `'settings'`. Nowa opcja = pole w `SETTINGS`,
  wiersz w markupie, sync w `syncSettingsUi()` i gałąź w `applySettings()`.
- **STRZELNICA - mapa deweloperska** (`js/devmap.js`, 2026-08-18): przycisk
  „Strzelnica (dev)" w menu głównym → `startDevMap()`. To zwykły tryb arena
  z flagą `game.dev`: stały seed 1337, niska gęstość przeszkód, 5 celów
  treningowych (propy `target`) na ~16 i ~38 m, gracz na południu patrzy na
  północ. `resetLevelState` woła `devApplyLoadout()` przy `game.dev`:
  wszystkie bronie `owned`, kredyty 100000, granaty do limitu,
  `waveSystem.paused = true` (reżyser milczy - boty spawnuje się ręcznie).
  Klawisze (input.js → `devKey`, tylko w dev): **B** spawn PATROLU w punkcie
  celowania (raycast do świata), **T** ogień botów wstrzymany/aktywny
  (`devHoldFire`, domyślnie wstrzymany; bramka w `updateEnemies`), **Y**
  zamrożenie ruchu (`devHoldMove`; boty dalej obracają się do gracza), **K**
  ciche usunięcie botów (`killEnemy(e, true)`), **J** pełne HP/amunicja/
  granaty, **P** odbudowa strzelnicy (wraca zestrzelone cele). Panel pomocy
  `#dev-hud` steruje `body.dev-mode` (toggle w `tick`). Higiena: dev NIE
  zapisuje rekordu areny (guardy w `endMatch`/`quitToMenu`) i NIE liczy się
  do statystyk służby (`missionEvent`/`missionShot` wychodzą przy `game.dev`);
  `backToMenu()` zdejmuje flagę. Diagnostyka: `__test.dev`; testy
  `tests/devmap_test.py`, zrzuty broni `tests/shots_weapons.py`.
- **DEVRIG - edytor chwytu rąk** (`js/devrig.js`, 2026-08-19): klawisz **H**
  na strzelnicy (`devKey` → `openDevRig()`), stan gry `'devrig'`. Powstał, bo
  ustawianie chwytów przez zgadywanie liczb w `HANDS` i ocenianie efektu ze
  zrzutu jest wolne i niedokładne (ciemne rękawice na ciemnej arenie).
  **Edytuje DOKŁADNIE pola z `HANDS`** (`pos`, `channel`, `palm`, `fore`,
  `upper`, `curl`, `scale`) i nic więcej. ⚠️ Suwaki kierunków muszą być
  **CIĄGŁE**: wektor odniesienia dla obrotu dłoni wybierany progiem
  przeskakiwał o 90° w trakcie przeciągania (cztery skoki na suwaku przechyłu
  kanału), więc `drPerp` używa jednego stałego odniesienia, a zmiana kanału
  przenosi obrót dłoni **minimalnym obrotem** (`drTurnPalm`) - bez żadnej osi
  odniesienia, więc skoczyć nie ma jak. Pilnuje tego asercja
  `controls: no jump while dragging` (przemiata każdy suwak przez cały zakres
  i mierzy zmianę pozy na krok). ⚠️ **Kierunki edytuje się KĄTAMI,
  nie XYZ** (2026-08-19): kierunek ma dwa stopnie swobody, więc trzy suwaki
  XYZ to jeden za dużo (przeskalowanie całej trójki nic nie robi), a przy
  `palm` cała składowa wzdłuż kanału i tak wypada przy ortogonalizacji -
  ten suwak nie robił dosłownie nic. Dlatego: `fore`/`upper` = azymut +
  wznios, dłoń = azymut i wznios **kierunku palców** (lokalne +Y kości dłoni,
  wzdłuż śródręcza) + **obrót dłoni** (rolka wokół tej samej osi, czyli tej,
  wokół której realnie kręci się nadgarstek). Zero rolki = poza bind rigu.
  ⚠️ **Cała ramka jest przebudowywana z tych trzech liczb przy każdej
  edycji**, więc poza jest CZYSTĄ FUNKCJĄ suwaków. Dwie wcześniejsze wersje
  na tym poległy: (1) przenoszenie rolki razem z osią (minimalny obrót
  nakładany na `palm`) to transport równoległy po sferze, czyli rzecz
  ZALEŻNA OD DROGI - azymut → wznios → powrót na te same liczby zostawiał
  dłoń obróconą o **39°**, więc to samo przeciągnięcie robiło za każdym razem
  co innego; (2) celowanie dwoma kątami w KANAŁ stawia osobliwość dokładnie
  tam, gdzie żyją chwyty - kanał to linia kostek, a ta biegnie wzdłuż
  rękojeści pistoletu (pionowo) albo wzdłuż łoża (w osi lufy), więc jeden
  albo drugi biegun zawsze przeszkadzał. Kierunek palców nigdy nie jest
  pionowy w chwycie, a suwak wzniosu i tak kończy się na 85°. Test `controls: no inert slider` przeciąga KAŻDY suwak
  i sprawdza, że poza faktycznie się zmienia - to nie jest kosmetyka, tylko warunek
  działania: `hands.js` NIE orientuje dłoni Eulerami, tylko składa ramkę
  (`handFrame`) i **rozwiązuje pozycję ramienia wstecz** z
  kotwicy pięści (`fistAnchor`). Suwaki wpięte w `part.rotation` walczyłyby
  z tym solverem i dawały liczby, których nie da się wyeksportować z powrotem
  do pliku. Kontrolki generują się z bieżącego wpisu `HANDS`, nie z listy na
  sztywno. Podgląd przelicza `regripArms()` (hands.js) - `attachArms()`
  alokowałoby 20 grup i meshy na każdą klatkę przeciągania suwaka.
  ⚠️ **Stałe `CURL_*` są WSPÓŁDZIELONE** przez kilka broni w weapons.js,
  więc `devRigIsolate()` klonuje je per broń przy pierwszym otwarciu -
  bez tego jedna zmiana po cichu przestawiałaby pozostałe bronie.
  Zmiana leci równolegle na podgląd i na ŻYWY viewmodel, więc po zamknięciu
  edytora gra pokazuje nowy chwyt bez przebudowy. Własna scena i kamera
  orbitalna renderowane wspólnym composerem (ten sam chwyt co MenuBg
  i Bestiariusz: `main.js` przestawia `renderPass` przy stanie `'devrig'`);
  ekran jest przezroczysty, więc `body.devrig` chowa HUD, a `.screen--devrig`
  musi zdejmować `backdrop-filter` (bazowy `.screen` rozmywa tło).
  Jasne, neutralne światło i szare tło są celowe - o to w tym narzędziu chodzi.
  Eksport/import całej tablicy `HANDS` przez JSON (wklej wprost do
  weapons.js), „Przywróć" wraca do wartości z pliku. Diagnostyka:
  `__test.devrig` (`<broń>:<L|R>` albo null); testy `tests/devrig_test.py`.
- Model bota: przód to lokalne **+Z** (yaw = `atan2(dx, dz)`); wszystkie meshe
  mają `userData.enemyRef`. **Headshot (×2) czyta `hitFaceIsHead(hit)`
  z modelkit.js**, nie flagę na meshu: podwozie SENTINEL jest JEDNYM skinem,
  więc `userData.isHead` nie ma się na czym zawiesić. Wypiek klasyfikuje każdy
  trójkąt po kości niosącej najwięcej jego wagi (`headBones` w
  `tools/gen_models.py`), sortuje trójkąty głowy w ciągłe serie i wystawia ich
  zakresy jako `mesh.userData.headFaces`; runtime porównuje z nimi `faceIndex`
  raycastu. Modele sztywne dalej używają `userData.isHead` i ta sama funkcja je
  obsługuje. Zmierzona strefa głowy: 1,85-2,25 m (barki kończą się na 1,77).
- Typy botów (`ENEMY_TYPES`): pole `weapon` ('pistol' | 'auto' | 'shotgun') steruje
  ostrzałem w `enemyFire()` — 'auto' strzela seriami (`burstCount`/`burstInterval`),
  'shotgun' ma obrażenia malejące z dystansem i krótki `range` (musi podejść).
  Dropy per typ w `rollDrop()`: scout/assault/uav → amunicja, heavy → apteczka.
  Typ latający: pole `fly` (pułap w metrach) — patrz sekcja Kampania → Drony.
- Bronie gracza mają flagę `owned` — start tylko z pistoletem, reszta kupowana
  w sklepie (pozycje `w_*` w `SHOP_ITEMS`; `applyAllShopEffects` wyprowadza
  `owned` z poziomu pozycji `w_<id>` automatycznie). Sloty 1-5 (2026-08-18):
  pistolet (Glock) · SMG (id `smg`) · strzelba · karabin (id `rifle`) ·
  snajperka; cztery długie bronie z jednej paczki Quaterniusa. Wszystkie viewmodele idą z wypieczonych modeli
  (`buildModel` w `buildViewmodel()`). Nowa broń = wpis w `WEAPONS`, model
  w `tools/gen_models.py`, gałąź w `buildViewmodel()`, pozycja `w_<id>`
  w sklepie, slot na HUD (`wslot-N` w index.html + pętla czyta
  `WEAPONS.length`), klawisz `Digit-N` w input.js i w `GAME_KEYS`, dźwięk
  w `AudioSys.shot(id)` i waga w `switch_`.
- **Audio (`AudioSys` w `js/audio.js`) — synteza WebAudio plus próbki wklejone
  base64 (patrz Architektura → Zasoby); jedno i drugie idzie tą samą szyną.**
  - **Szyna (nie omijaj jej):** głosy → `sfxBus` → `master` → `duckFilter`
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
  - **Próbki (`sample()` + `js/sfx.js`, 2026-08-21):** nagrania wchodzą do gry
    jako base64 Opus wypieczone przez `tools/gen_sfx.py` (źródła w
    `assets_src/sfx/`, punkty cięcia z `--probe`, nie ze słuchu). `loadSamples()`
    dekoduje je w `init()` przez `atob` → `Uint8Array` → `decodeAudioData`, czyli
    BEZ `fetch` - dlatego działa też z `file://` (zweryfikowane). `sample(key)`
    zwraca `false`, gdy klip jeszcze się dekoduje albo klucza nie ma, więc
    **każde wywołanie musi mieć fallback na syntezę** - to samo trzyma grę
    słyszalną, gdyby `js/sfx.js` zniknął.
    ⚠️ Klucz trzyma TABLICĘ wariantów i losuje jeden na strzał; `jitter` jedzie
    przez `playbackRate` (zmienia wysokość I długość naraz, jak prawdziwe
    powtórzenie). Jeden klip na broń brzmi jak stempel - to ta sama wada,
    przed którą chroni `jitter` w syntezie.
    ⚠️ **`-vn` w wypieku nie jest ozdobą**: część źródłowych WAV-ów niesie
    osadzoną grafikę, a bez tego ffmpeg wesoło zakodowuje ją do Ogg jako
    **strumień wideo THEORA** - zmierzone: 5250 B na ćwierćsekundowy krok,
    z czego audio to 1230 B. Bitrate jest per klucz z nadpisaniem per klip
    (`kbps`), bo szum szerokopasmowy (but dzwoniący na metalu, szur tkaniny)
    kosztuje w Opusie znacznie więcej niż transjent wystrzału.
    ⚠️ Do strzałów bierz takty **ISOLATED (suche)**, nie „Full Sound": ogon
    daje NASZ konwolwer przez `send`, więc jedzie za akustyką areny. Nagranie
    z własnym pogłosem nałożyłoby dwa pomieszczenia na siebie.
    Dostrojone są **wszystkie pięć broni** (strzał ×3 warianty + mechanika).
    Kalibry: Glock i SMG 9 mm, strzelba 20 gauge, karabin 5.56, snajperka
    7.62x54R.
    ⚠️ Obie bronie strzelają tym samym nabojem (9 mm), więc rozróżnia je
    RODZAJ taktu, nie efekt: Glock jedzie na strzałach pojedynczych, SMG na
    trzech strzałach z serii (szybki strzał ma krótszy, twardszy korpus).
    Resztę różnicy - dłuższa lufa siedzi niżej - dokłada `rate: 0.93`
    w `shot('smg')`. Głębiej zaczyna brzmieć jak karabin.
    Magazynek SMG to skrzynka w gnieździe, nie rączka pistoletu, więc
    przeładowanie idzie z taktów AR, a nie z pistoletowych.
    Strzelba jedzie stylem `shell`, więc zamiast magazynka ma `_shell`
    (nabój do rurki) i `_pump` (pełny cykl pompy w JEDNYM klipie, takt
    „Fast" - wolniejszy ma 0,27 s przerwy między suwami i nie nadąża za
    animacją). `pump(id, {vol, delay})` gra w DWÓCH miejscach: raz w
    przeładowaniu (pełna głośność) i raz **po każdym strzale**, razem
    z animacją `pumpT` w `tryFire` - ciszej (0.38) i z opóźnieniem 0,1 s,
    bo puszczony na t=0 wpada w huk wystrzału i po prostu go nie słychać.
    ⚠️ Ten drugi jest pod warunkiem `w.mag > 0` (zgłoszenie użytkownika
    2026-08-21): po OSTATNIM naboju łoże przejmuje przeładowanie
    (`startReload` zeruje `pumpT`), więc suw nigdy się nie rysował, a sam
    dźwięk i tak leciał - broń przeładowywała pustkę.
    **Luneta** ma `scope_up`/`scope_down` (`AudioSys.scope(on)`, wołane
    z `setScopeOverlay`). W paczkach NIE MA nagrania optyki i nie da się jej
    uczciwie podrobić - to, co gracz naprawdę słyszy, to USTAWIANA BROŃ, więc
    oba klipy to foley obsługi (takty bipoda: jedyne w paczkach czysto
    metalowe ruchy bez naboju i magazynka). Cicho z rozmysłem - siedzą pod
    wstrzymanym oddechem, a głośniejsze zamieniłyby każde zerknięcie przez
    lunetę w wydarzenie.
    ⚠️ **Dźwięk leci TYLKO wtedy, gdy lunetę opuszcza GRACZ.** `setAiming`
    ma flagę `byPlayer` (ustawia ją jedynie puszczenie PPM w input.js),
    a `setScopeOverlay(on, quiet)` flagę `quiet` dla przeładowania, zmiany
    broni i resetów. Bez tego zmiana broni grała dwa dźwięki naraz, a każdy
    reset stanu strzelał foleyem znikąd - `setAiming(false)` woła osiem
    różnych miejsc.
    **Zmiana broni** ma JEDEN współdzielony klip `draw` dla całego arsenału
    (decyzja użytkownika 2026-08-21). Wersja ciężka jechała na puszczonej
    rączce przeładowania i czytała się jak strzał z bicza, a nie jak wzięcie
    broni do ręki; ciężar broni niesie i tak jej własny huk. Nie ma też
    żadnego przestrajania `rate` per broń - o to chodzi, żeby zmiana brzmiała
    tak samo, cokolwiek wchodzi do ręki.
    ⚠️ **Snajperka jedzie na Mosinie** (7.62x54R + `Mosin Bolt Cycle` +
    `Mosin Top Load`), bo to jedyna broń źródłowa z ZAMKIEM - a gra
    przeładowuje ją stylem `shellBolt`, czyli pojedynczymi nabojami i zamkiem
    na końcu. Takty .308 były alternatywą i odpadły: są półautomatyczne, więc
    dałyby broni z zamkiem cudzy mechanizm.
    ⚠️ **Karabin jedzie na taktach AK, nie AR** (AR ma SMG): obie bronie
    karmią się skrzynkowym magazynkiem, więc wspólne nagrania zrobiłyby
    z nich dla ucha jedną broń. Magazynek AK dodatkowo się ZAKOŁYSZE zamiast
    wejść prosto - stąd te klipy są dłuższe (dwa zdarzenia na ruch).
    ⚠️ Warianty strzelby to OSTATNI strzał każdego taktu - tylko tak da się
    wziąć pełne wybrzmienie, bo w plikach wielostrzałowych następny nabój
    pada 0,25 s później, a korpus strzelby biegnie znacznie dłużej.
    Nowa broń = wpis w `MANIFEST` w `tools/gen_sfx.py` pod kluczami
    `<id>_fire`/`_mag_out`/`_mag_in`/`_slide`/`_grab` (styl `mag`) albo
    `<id>_shell`/`_pump` (styl `shell`) - `AudioSys` bierze je po `w.id` sam,
    bez zmian w kodzie.
  - **Stan trwały:** `AudioSys.update(dt)` z `tick` prowadzi bicie serca (<25 HP)
    i oddech sprintu (flaga `BREATH_SFX`); `AudioSys.resetFx()` woła `resetGameState()`
    i zeruje te pętle oraz otwiera `duckFilter`. Nowy stanowy dźwięk = obsłuż go
    w obu tych miejscach.
  - **Obrażenia** (`hurt(dmg, fromPos)`) panoramują się w stronę napastnika i „duszą"
    cały miks przez `duckFilter` (efekt ogłuszenia) proporcjonalnie do obrażeń.
    Od 2026-08-21 uderzenie niesie NAGRANIE ciała (`hurt_body` ×2) zamiast
    dwóch szumów; niski ton i `duckMix` zostają.
    ⚠️ To celowo **uderzenie TĘPE, nie metaliczne**: gracz nosi kamizelkę,
    a metalowe takty to brzmienie DRONA - obu nie wolno pomylić, gdy dzieją
    się naraz. Panorama jest CZĘŚCIOWA (0,7 pełnej), bo to dzieje się GRACZOWI,
    a nie gdzieś w hali. `rate` spada z obrażeniami (mocniejszy cios niżej).
  - **Trafienie bota** (`hit_bot` ×4, `hit_head` ×2, 2026-08-21): metal
    o metal, bo z tego jest SENTINEL. Oba źródła to nagrania uderzanego
    metalu; takt melee okazał się nieść CZTERY uderzenia z rzędu co 0,14 s -
    dokładnie odstęp, jakiego potrzebuje seria - i różnią się ciężarem tak,
    jak różnią się prawdziwe powtórzone uderzenia.
    ⚠️ Klipy są KRÓTKIE z rozmysłu (0,13-0,22 s): pocisk na pancerzu kończy
    się natychmiast, a to gra kilka razy na sekundę. Ucięte wybrzmienie wraca
    konwolwerem areny przez `send`.
    ⚠️ `hit()` **nie dostaje pozycji** - to głos hitmarkera, potwierdzenie
    trafienia, i ma czytać się tak samo na 5 i na 40 m.
    ⚠️ Przy headshocie **złoty ping FM ZOSTAJE** nad próbką: to nie faktura,
    tylko gra MÓWIĄCA graczowi, co się stało. Sama próbka jest głębsza
    i dzwoniąca - głowa to pusta skorupa i odpowiada inaczej niż tors.
  - **Śmierć bota** (`kill_body` ×2, `kill_glitch` ×2, 2026-08-21): maszyna
    przewracająca się, w dwóch warstwach - uderzony metal na kadłub i
    wyładowanie martwej elektroniki na wierzchu. Tu wybrzmienie ZOSTAJE
    (śmierć zdarza się raz na bota, nie pięć razy na sekundę jak trafienie).
    ⚠️ Opadający ton „wyłączenia" **zostaje syntetyczny** - to w nim siedzi
    charakter per typ (`heavy` nisko i długo, `scout` krótko i wysoko),
    a żadne nagranie nie przeskalowałoby się tak przez cały bestiariusz.
    Rozmiar niosą `rate` (heavy 0.86, scout 1.14) i ten ton.
    ⚠️ W przeciwieństwie do `hit()` śmierć **JEST pozycjonowana** - to
    informacja o polu walki i należy do miejsca, w którym się wydarzyła.
    `killEnemy(e, true)` (ciche usuwanie z dev) dalej milczy.
  - **Kroki** jadą na cyklu head-bobu: `swayPhase` w `player.js`, jeden krok na pół
    okresu, wyzwalany w dnie kołysania — dzięki temu audio trafia w opad kamery.
    Jeśli ruszasz `swayPhase`, sprawdź `swayStepIdx`.
    Od 2026-08-21 to **nagrane buty na metalu** (`step_metal`, 6 wariantów),
    wycięte z 30-sekundowej PĘTLI marszu 110 fpm - paczka nie ma pojedynczych
    stąpnięć, ale w pętli pada jedno co 0,545 s, więc jest z czego wybierać.
    ⚠️ **Sześć wariantów to minimum, nie zbytek**: krok pada co pół cyklu
    kołysania, czyli częściej niż jakikolwiek inny dźwięk w grze, a poniżej
    sześciu ucho zaczyna słyszeć wzór. Sprint NIE ma osobnego nagrania - ten
    sam but uderza mocniej i szybciej, więc jest głośniej i `rate` 1.07.
    Metal jest właściwą powierzchnią (hala przemysłowa, metalowy przeciwnik);
    paczka ma też drewno, dywan i japonki, gdyby doszedł materiał podłoża.
  - **Skok NIE MA dźwięku** (decyzja użytkownika 2026-08-21): `AudioSys.jump()`
    i jego wywołanie w `player.js` zostały USUNIĘTE, nie wyciszone. Oderwanie
    się od ziemi jest ciche, słychać tylko powrót na nią. Próbowany szur
    tkaniny odpadł i nie ma czym go zastąpić - w paczkach nie ma nagrania
    skoku.
  - **Lądowanie** jest HYBRYDĄ (2026-08-21).
    ⚠️ **Ma DWIE warstwy dobierane prędkością upadku**, nie jedno
    nagranie na dwóch głośnościach: `land_soft` (buty - najgłośniejsze
    stąpnięcie z pętli marszu, czyli obie stopy naraz) leci zawsze, a
    `land_hard` (ciało na podłodze) DOŁĄCZA dopiero powyżej `k` 0,45.
    Zeskok ze skrzyni i upadek z galerii to dwa różne zdarzenia. `rate`
    lądowania spada z siłą uderzenia - mocniejsze czyta się niżej.
    `bhop()` celowo zostaje syntetyczny (mechanika do wycięcia).
  - **Wślizg** (`slide`) jest HYBRYDĄ: próbka to tkanina ciągnięta po podłodze
    i nie ma ŻADNEGO dołu, więc syntetyczny pomruk (`tone` 92→58 Hz) zostaje
    pod nią. Próbka daje fakturę, ton daje ciężar gracza. Fallback na syntezę
    podmienia tylko warstwę szumu, pomruk leci zawsze.
    ⚠️ **JEDEN wariant, celowo** (decyzja użytkownika 2026-08-21): biblioteka
    nazywa się „Cloths & Sponges" i drugi kandydat (`Cloth 61`) czytał się
    jak przecieranie mokrej powierzchni szmatą. Wślizg jest krótki i zawsze
    tym samym ruchem, więc jeden dobry takt bije dwa, z których jeden jest zły.
  - **Muzyka w rozgrywce: NIE MA JEJ** (decyzja użytkownika, 2026-08-21).
    Proceduralny sekwencer (16 kroków, sekcje A/B, `moodBlend`, sidechain pod
    stopą) został USUNIĘTY z `audio.js` razem z `startMusic`, `musicGain`,
    `musicDuck` i hookami `__test.musicSteps`/`musicRunning`/`musicError`.
    Rozgrywka jedzie na samych SFX. Kod jest w historii gita, gdyby miał
    wrócić. **Motyw menu zostaje** - i jest teraz JEDYNĄ muzyką w grze.
  - **Motyw menu** (jedyny plik dźwiękowy, patrz Architektura → Zasoby):
    `AudioSys.menuMusic(on)` woła `main.js` przy zmianie `menuBgActive()` — muzyka
    jedzie z panoramą, także przez wybór misji, statystyki i zbrojownię. Element
    `<audio id="menu-music" loop>` żyje POZA grafem, więc głośność liczy się ręcznie
    (`MENU_GAIN × volMaster × volMusic × menuFade`) i `setVolumes` musi go dotknąć
    osobno. `menuFade` (1,6 s w / 0,45 s out, liczony w `update`) wycisza go po
    wyjściu z menu; crossfade z sekwencerem zniknął razem z sekwencerem. Autoplay jest
    odrzucany do pierwszego gestu, więc `menuMusicEl()` wiesza retry na
    `pointerdown`/`keydown` (faza capture — przed handlerami przycisków). Wyjście
    z menu **nie przewija** utworu (powrót z misji łapie go w tym samym miejscu).
    Diagnostyka: `__test.menuMusic`.
  - Stingery UI (`buy`/`pickup`/`heal`/`wave`/`win`) są strojone do **a-moll** — żeby
    nie gryzły się z podkładem, nowe też tam trzymaj.
- Efekty (cząsteczki/tracery/decale/flash) używają **puli obiektów** — przy nowych
  efektach też używaj puli, nie twórz meshy w locie.
- Viewmodel: dziecko kamery; w animacjach **nigdy nie przybliżaj broni do kamery**
  (near plane 0.08 — geometria „wybucha" na ekranie); odsuwaj (`z` bardziej ujemne).
- **Chwyt z biodra** (`VM_BASE` w weapons.js, podniesiony i przysunięty
  2026-08-21 na prośbę użytkownika, referencja: Ready Or Not):
  `(0.22, -0.20, -0.46)`. Stare `(0.32, -0.28, -0.55)` parkowało broń
  w prawym dolnym rogu, bez rąk w kadrze, a do przyrządów zostawało
  0,15-0,20 m pionu - dlatego ADS czytało się jak przerzucenie broni przez pół
  ekranu, a nie jak dociągnięcie jej do oka. Drugi krok tego samego dnia
  („wszystkie bronie bliżej środka oraz przybliżmy do samej kamery") ściągnął
  ją o kolejne 8 cm do środka i 9 cm do oka.
  `adsPos` jest BEZWZGLĘDNE, więc pozycja celowania i wyrównanie przyrządów
  nie zmieniły się ani o piksel (zmierzone: kropki dalej na osi kamery co do
  0,001 NDC); skrócił się sam przejazd, a wsparte przedramię weszło na łoże.
  ⚠️ **`z` to suwak ROZMIARU na ekranie, nie zasięgu**: kolby długich broni
  i tak siedzą już za okiem przy biodrze (zbiera je near plane, jak w każdym
  FPS), więc przysuwanie kupuje wielkość kątową, a płaci powierzchnią kadru
  zajętą przez komorę. Zmierzone przy -0.40 lufa karabinu kładzie się na samym
  celowniku - to już za daleko; -0.46 zostawia obraz czysty.
  ⚠️ **`SPRINT_POS` i tabele przeładowania to DELTY na `VM_BASE`** - przy
  zmianie chwytu trzeba je oddać z powrotem (sprint został oddany ręcznie,
  poza biegu na ekranie jest niezmieniona).
  ⚠️ **Sufitem podniesienia był UCIĘTY PRZEKRÓJ ramienia, nie near plane**:
  ręce wiszą pod rootem broni, więc razem z nią jedzie bark i płaska ścianka
  odcięcia wychodzi na dolną krawędź. Dlatego bark ma własne odniesienie
  `ARM_CARRY_REST` - ten sam chwyt co `ARM_ADS_FOLLOW`, tyle że dla noszenia
  z biodra: ciało nie jedzie za bronią w ogóle, a różnicę pochłaniają stawy.
  Ramię ma na to zapas - każda pięść dalej ląduje na swojej kotwicy z `HANDS`
  co do dziesiątej milimetra (zmierzone na strzelnicy, nie oceniane okiem).
  ⚠️ **To odniesienie NIE jest już suwakiem od ucięcia** (2026-08-21): stoi
  równo na `VM_BASE`, żeby gra odtwarzała pozę z DEVRIG (patrz „Poza rąk"
  niżej). Kikut kadruje się teraz wyłącznie chwytami - `fore`/`upper` lewej
  ręki w `HANDS`, czyli suwakami, które widać w edytorze. Historycznie ta
  liczba jechała -0.28 → -0.52 właśnie po to i dawała 0,32 m darmowego
  zapasu; tego zapasu nie ma.
  ⚠️ `SHOULDER_LEAN_MAX` w hands.js zostaje na 0.22 (podniesione z 0.12, gdy
  bark jeszcze zjeżdżał): przy krótkim rigu to margines na dosięgnięcie
  chwytu i zdejmowanie go bez pomiaru zrywa dłoń z broni.
- ADS (PPM, zmienna `aiming` + `adsBlend`): każdy viewmodel ma `userData.adsPos` —
  pozycję, w której **przyrządy trafiają w oś kamery** (x=0, y=−wysokość linii
  celowania). Od 2026-08-18 **wszystkie viewmodele są z wypieczonych modeli**
  i celują własnymi, odlanymi przyrządami - **nie doklejaj słupków ani kropek**
  (decyzja użytkownika; doklejane bryły albo lewitowały, albo zasłaniały cel).
  Stary proceduralny three-dot (cienkie słupki + tealowe kropki na jednej
  wysokości) zostaje wyłącznie planem B dla broni, której model nie ma
  żadnych przyrządów.
  Odlana muszka i szczerbinka rzadko są w poziomie - zamiast dokładek
  **przechyl cały model** o różnicę (`m.root.rotation.x`); linia celowania
  ląduje wtedy na jednej wysokości i z niej bierzesz `adsPos`. Lufa celuje
  wtedy o ułamek stopnia obok osi kamery, co jest niewidoczne i nieszkodliwe
  (pociski lecą promieniem kamery, nie lufą). **Przy ghost-ringu muszka ma
  siedzieć w ŚRODKU otworu pierścienia, nie na jego szczycie** - wyrównanie
  szczyt-do-szczytu wygląda krzywo (feedback użytkownika 2026-08-18).
  **Punkt celowniczy = drobny zielony emiter `vmMatDot` (0x00ff44, decyzja
  użytkownika)**: odlana muszka na 1-1.3 m przy ADS jest ciemna na ciemnym
  i niewidoczna, więc na szczycie muszki karabinu i strzelby siedzi
  ~4 mm kropka (Glock: 2,8 mm - mniejsza, bo przy ADS jest bliżej kamery,
  więc kątowo wychodzi tyle samo); w SMG siedzi na szczycie zabudowanej
  szyny. **Kropkę ma każda z pięciu broni.** Nadal ZERO doklejanych słupków i brył - tylko emitery na
  istniejącej geometrii. Przy strzelbie uwaga na pułapkę: prawdziwe ostrze
  muszki to wąska płetwa na wieży, a wyższa z pozoru krawędź przy samym
  wylocie to dekor, który zasłaniał kropkę (dokładne współrzędne w komentarzach
  buildViewmodel). **Sondowanie samych wierzchołków blisko osi KŁAMIE**:
  szyna SMG to dwa mostki, których wierzchołki leżą poza osią (x ±0.033),
  a trójkąty przechodzą nad środkiem - kropka pod nimi celowała prosto
  w mostek. Dlatego **widoczność kropki weryfikuj raycastem po osi kamery**
  (pierwsze trafienie w viewmodel musi być `vmMatDot`; robi to
  `tests/shots_weapons.py`, materiały wypieczonych meshy to TABLICE - materiał
  trafienia czytaj z grupy geometrii po `faceIndex`). Bieżące przechyły:
  Glock +0.0176, strzelba +0.0086, karabin −0.0478, SMG +0.0041 (szczerbinki
  celowo 4 mm POD linią - na równi z nią zasłaniałyby kropkę).
  **Długie bronie kotwiczy się ZA TYŁ, nie za środek bboxa**: `root.z =
  0.41 − połowa długości` stawia kolbę na stałym z −0.14 w hip pose
  (wyjątek: SMG i snajperka są przysunięte o 0.10 bliżej kamery - czytały się
  jako odsunięte; `adsPos.z` oddaje ten dystans z powrotem, więc pozycja ADS
  zostaje ta sama).
  ⚠️ **Dystans ADS to osobna decyzja od kotwicy** (SMG 2026-08-21, decyzja
  użytkownika „nie musimy widzieć tyle kolby"): SMG celuje z `adsPos.z`
  −0.50 zamiast wspólnego −0.54, czyli BLIŻEJ oka niż reszta rodziny. Przy
  −0.64 kolba siedziała 0,13 m od oka i cały jej tył czytał się jako ciemna
  płyta pod przyrządami; przy −0.50 tył wypada 0,01 m ZA okiem, więc zbiera
  go near plane. **Sam `z` nie psuje obrazu przyrządów** - kropka ma
  `adsPos.x` 0 i `adsPos.y` dobrane tak, że siedzi na osi kamery, a punkt na
  osi rzutuje się na środek ekranu z każdej odległości (zmierzone: NDC 0,0
  dla −0.64, −0.56, −0.50 i −0.45). Wszystkie cztery długie bronie siedzą też **0.03 niżej
  niż pistolet** (`root.position.y`, decyzja użytkownika) - to samo
  `adsPos.y` kompensuje, więc rusza się tylko poza ADS, więc
  powiększenie modelu (length w gen_models.py; to JEDNOLITA SKALA całej
  bryły, normalizowana po długości) rośnie w ekranowy rozmiar chwytu zamiast
  uciekać w głąb; przy ADS ten sam luz daje `adsPos.z` −0.54 (kolba =
  adsPos.z + 0.41). Snajperka bez ADS: tylko ofset roota (−0.38).
  Skale są CELOWO ponad wymiary rzeczywiste (length: SMG 0.84, strzelba 1.45,
  karabin 1.05, snajperka 1.58, Glock 0.30); po zmianie length przelicz
  kropki/przechyły/adsPos ORAZ kotwice z `HANDS` i punkt przyrządów w
  `tests/shots_weapons.py` (wszystko skaluje się liniowo; przechył NIE - oba
  przyrządy maleją tak samo, więc kąt między nimi zostaje, a 4 mm kropki to
  wielkość ekranowa, nie część broni).
  ⚠️ **Broń dopasowuje się do rąk, nigdy odwrotnie** (decyzja użytkownika
  2026-08-21): ręce mają JEDNĄ skalę na wszystkich broniach (`HAND_SCALE`
  w weapons.js), bo to ciało gracza. SMG zjechało z 1.00 na 0.84 właśnie
  dlatego - przy 1.00 miało 95% długości karabinu i 0,381 m wysokości, czyli
  było NAJWYŻSZĄ bronią w grze (karabin 0,364, snajperka 0,321, strzelba
  0,238), a prawdziwy pistolet maszynowy ma ~80% długości karabinku.
  **Strzelba wyszła z tej rodziny 2026-08-21** (zgłoszenie użytkownika:
  „model shotguna bardziej wygląda jak karabin powtarzalny, nie ma pompki").
  Strzelba Quaterniusa **nie miała łoża w ogóle** - rura magazynka biegła goła
  do komory, więc sylwetka czytała się jak broń powtarzalna z rurą; pompki nie
  dało się z niej wyciąć przez `split`, bo nie było czego. Zastąpił ją
  **Mossberg 590A1 by J-Toastie [CC-BY]** - ten sam autor co Glock i ręce.
  Jest RIGOWANY: łoże jedzie jako osobna kość (`FR`), więc pompka realnie
  chodzi (`joints: {'FR': 'pump'}`, flaga `bindWorld` - węzeł mesha ma skalę
  niejednorodną 50,2/33,2/50,2 przy armaturze 50,2, więc `jointWorld·IBM`
  nie znosi się z grafem). Proporcjonalnie jest WYŻSZY od poprzednika
  (wys/dł 0,203 vs 0,164), czyli przy tym samym `length` 1.45 daje 0,295 m
  zamiast 0,238 - zarzut „za drobne" z 2026-08-18 dotyczył MP5SD, nie tego
  modelu. Ma tylko dwa materiały: `shotgun_shade2` (kolba + łoże) idzie na
  `vmMatMid`, reszta na `vmMatDark` - dwubarwnie wzdłuż części, która się
  rusza. Przyrządy: **ghost ring**, więc kropka siedzi w ŚRODKU otworu
  (środek apertury y 0,1357 @ z +0,148, promień wewnętrzny 4,3 mm - liczony
  flood-fillem zamkniętej dziury, nie „na oko"), muszka 0,1379 @ z -0,699,
  przechył -0,0050 rad wyrównuje je do 0,04 mm. Model jest przysunięty **0,34**
  od wspólnej kotwicy tyłem (`root.z` +0.025, decyzja użytkownika 2026-08-21),
  a `adsPos.z` -0.74 oddaje ten dystans z powrotem, więc rusza się tylko poza
  biodra. ⚠️ **Miarą „za daleko" jest tu DŁOŃ, nie kolba**: po kolbie ta broń
  siedziała dokładnie tam co SMG i snajperka (stopka 0,04 m przed okiem), ale
  jest najdłuższa w grze i jako jedyna ma prawdziwe łoże, więc dłoń wsparcia
  wypadała na z -0,543 w przestrzeni viewmodelu - 0,07 głębiej niż snajperka
  (-0,477) i 0,28 głębiej niż karabin (-0,265). To ta głębokość wypycha
  UCIĘTY koniec lewego ramienia w kadr. Sam dystans ADS jest i tak bliższy niż
  wspólne -0.54 (netto -0.40, ta sama decyzja co przy SMG): kolba jest tu litą
  płytą, a przy -0.54 siedziała 0,13 m od oka i wypełniała prawą połowę
  ekranu.
  ⚠️ Przysunięcie biodra **wydłuża realny przejazd broni do oka**, a bark
  jedzie za tym przejazdem (`ARM_ADS_FOLLOW`), więc kadrowanie czapy przy ADS
  się o to pogarsza. Zmierzone przy tym ruchu: biodro 0,69 → 1,02 (wychodzi
  z kadru), ADS 0,92 → 0,85. Reszty NIE nadrabiaj dystansem: przy identycznej
  pozycji dłoni poprzednia ramka chwytu dawała 1,07 / 1,26, a bieżąca 0,69 /
  0,92 - decyduje chwyt, nie odległość.
  ⚠️ **Gra odtwarza pozę z DEVRIG kość w kość** (2026-08-21, decyzja
  użytkownika): `ARM_CARRY_REST` to teraz `VM_BASE`, więc `armBodyFix` przy
  biodrze jest JEDNOSTKĄ i solver IK wychodzi dokładnie na pozie spoczynkowej,
  którą pokazuje edytor. Wcześniej odniesienie stało 0,35 m pod chwytem
  i różnicę brały stawy - wyrenderowane przedramię wypadało 9-16°, a ramię
  0-12° od kierunku ustawionego suwakiem, przez co dostrojenie chwytu
  w edytorze dawało w grze coś innego (zgłoszenie użytkownika: „w DEVRIG
  ładnie poustawiałem, a bronie są rozpierdolone").
  ⚠️ **Ceną jest to, że kikut kadruje się już TYLKO chwytami.** Zjazd ciała
  dawał 0,32 m darmowego zapasu i tego zapasu nie ma: po przeniesieniu
  kotwicy strzelba i karabin miały pierścień odcięcia w kadrze pod ADS,
  a snajperka przy biodrze (wszystkie 20 wierzchołków, |ndc y| 0,43 - ta
  blada rura wisząca w powietrzu). Po każdym przestrojeniu `HANDS` **trzeba
  przemierzyć kadrowanie**, i to w OBU pozach: `tests/shots_weapons.py`
  liczy kikut wyłącznie pod ADS, biodro trzeba zmierzyć osobno tym samym
  probem (`__capProbe` po `switchWeapon`).
  ⚠️ **`fore`/`upper` ręki wsparcia dostraja się z WIDOKU GRACZA** (strzelba,
  karabin, snajperka przestrojone 2026-08-21 po zgłoszeniu „wyglądają
  tragicznie"). Wcześniejsze wartości szły z geometrii łoża i celowały
  przedramieniem WZDŁUŻ broni - to wyrzuca łokieć w bok i kładzie całe
  przedramię w poprzek środka kadru jako bladą płytę. Działa odwrotnie: oba
  kierunki mają iść **w GÓRĘ i lekko w LEWO od broni** (dziś ok. [-0.10,
  0.60..0.80, -0.59..-0.79]), bo wtedy łokieć siada pod nadgarstkiem, bark
  pod łokciem i kończyna wchodzi w kadr jako kolumna schowana pod bronią.
  Przy okazji to samo wypycha kikut dalej poza kadr (biodro 1,40-1,84
  zamiast 1,06-1,15).
  **Trzy pozostałe długie bronie to nadal JEDNA rodzina - paczka Quaterniusa (CC0)**
  (decyzja użytkownika 2026-08-18: realistyczne, smukłe modele czytały się za
  drobno obok stylizowanych brył Quaterniusa, więc SMG i strzelba pojechały
  na jego odpowiedniki; pistolet ZOSTAJE Glockiem). Materiały całej rodziny
  wychodzą z jednego resolvera `quatMat(src)`, który celowo używa **tych
  samych materiałów co Glock** (decyzja użytkownika 2026-08-18: „kolory
  w stylu glocka" - wszystkie bronie mają wyglądać na jedną rodzinę sprzętu):
  Metal/Grey/MainLight → `vmMatMid`, Glass → `vmMatLens`, **cała reszta
  (w tym Wood/DarkWood) → `vmMatDark`** - żadnego drewna ani czerni
  (osobna, ciemniejsza paleta gunmetalu była testowana i odpadła: bronie
  gubiły bryłę na ciemnych arenach). Nowa broń z tej paczki nie potrzebuje
  własnego mapowania. Geometrię odlanych przyrządów mierz probem po `js/models.js`
  (najwyższe wierzchołki, kubełkowane po Z blisko osi |x|≈0 - same kubełki
  po Z skłamią, bo uśrednią wąską muszkę z całą szerokością bryły).
  Wyrównanie sprawdzaj liczbowo: `vm.localToWorld(punkt).project(camera)`
  musi dać środek ekranu, bo na ciemnym zrzucie ciemnych przyrządów nie da
  się tego ocenić okiem - robi to `tests/shots_weapons.py`.
  Snajperka (`zoom: true`) zamiast ADS pokazuje lunetę i chowa viewmodel.
  Część ruchoma czeka wypieczona w `userData` (`slide` Glocka) - nic jej
  jeszcze nie animuje.
  Balans: `spread` w WEAPONS to rozrzut Z BIODRA (celowo duży); ADS mnoży przez
  `adsMul` (domyślnie 0.3). ADS blokuje sprint i spowalnia ruch ×0.55.
  FOV: luneta 24° / ADS 60° / sprint+bhop poszerzają.
- **Ręce gracza (BRON-2, 2026-08-18)** - `js/hands.js` + konfiguracja `HANDS`
  w weapons.js; model `arms` („Rigged FPS Arms" - J-Toastie, CC-BY) wypiekany
  w `tools/gen_models.py`:
  - **Wypiek = PRAWDZIWY SKIN, nie sztywne party** (2026-08-19): `arms` idzie
    przez `build_skinned()` w `tools/gen_models.py` - jeden `SkinnedMesh` plus
    oryginalne drzewo kości (`UpperArm → LowerArm → Hand → trzy łańcuchy palców`
    na stronę, 24 kości). Poprzednie podejście tnące mesh po dominującej kości
    **pękało na każdym szwie**, gdy dwa party się rozjechały, a wycięte ramię
    (`cut`) zostawiało otwarty przekrój przy łokciu - stąd dziury i prześwity.
    Skin nie ma żadnego z tych problemów i **daje NADGARSTEK**, czyli staw,
    który decyduje, dokąd ucieka przedramię. Całe ramię jedzie w komplecie,
    z barkiem - to, co wyjdzie za kamerę, obcina near plane, dokładnie jak
    w każdym FPS.
    ⚠️ Trzy pułapki wypieku, wszystkie zweryfikowane na tym pliku:
    (1) **`bindMatrix` musi być JEDNOSTKOWA** - `jointWorld · IBM` samo
    przenosi surowy `POSITION` do przestrzeni sceny, więc podanie macierzy
    węzła mesha nakłada ten transform drugi raz i zapada bryłę;
    (2) korzeniem obu łańcuchów jest węzeł **`Armature`** (skala 188), który
    NIE jest kością - jego macierz świata trzeba wmnożyć w `xform` grupy
    roota, inaczej wszystkie translacje kości kurczą się do ułamka długości;
    (3) rodzic korzenia łańcucha musi dawać `parent: -1`, a nie `null` -
    w JS `null >= 0` jest prawdą i oba ramiona lądują na pierwszej kości.
    Skala idzie z **rozpiętości kości** (`normPair`: łokieć→czubek palca
    = `length` 0.42), nie z bboxa - bark już jedzie w komplecie, więc bbox
    zmniejszyłby to, co faktycznie widać.
  - **Skala rąk jest WSPÓLNA dla wszystkich broni** (`HAND_SCALE` w weapons.js,
    dziś 1.05; pole `scale` każdego wpisu `HANDS` tylko na nie wskazuje, żeby
    zrzut JSON z DEVRIG dalej dało się wkleić w całości). Suwak „Skala" w DEVRIG
    pisze do wszystkich pięciu wpisów naraz, a import JSON-a z rozjechanymi
    wartościami zrównuje je do pierwszej broni. Rękawica, która rośnie przy
    jednej broni i maleje przy drugiej, czyta się jak dwie różne postacie -
    broń za dużą naprawia się jej własnym `length`, nie skalą dłoni.
  - **Wszystkie pięć broni ma dostrojony chwyt bojowy** (2026-08-21;
    wcześniej strzelba, karabin i snajperka jechały na wartościach NEUTRAL,
    czyli z płaską dłonią, która niczego nie trzymała). Metoda, gdyby trzeba
    było powtórzyć ją dla nowej broni: (1) `channel` = ZMIERZONA oś chwytu
    (główna oś wierzchołków wokół rękojeści/łoża w przestrzeni modelu broni -
    grupy materiałowe z `js/models.js` mówią, gdzie ta rękojeść jest);
    (2) `palm` = `[1,0,0]` dla dłoni roboczej, dla wsparcia kierunek z SMG;
    (3) `pos` rozwiązuj WSTECZ: wybierz, gdzie ma stać ŻYWA pięść, i iteruj
    `pos += cel - fistAnchor` (kilka kroków schodzi poniżej 0,1 mm) - punkt
    zdjęty z geometrii i wklejony wprost trafi obok, bo `pos` jest w
    przestrzeni ZAMROŻONEJ kotwicy. Weryfikacja liczbowa, nie okiem:
    `tests/shots_weapons.py` (czapa odcięcia + kotwiczenie) i odczyty
    nadgarstka z DEVRIG - dostrojone chwyty siedzą na 1-39° zgięcia
    i 82-107° skrętu.
  - **Cztery niezależne sterowania na dłoń** (`HANDS` w weapons.js, wszystkie
    edytowalne w DEVRIG), wszystkie w **przestrzeni modelu broni**:
    `pos` (gdzie ląduje zamknięta pięść), `channel` + `palm` (ramka chwytu =
    orientacja kości DŁONI: linia kostek, czyli oś dziury w pięści, przez
    którą przechodzi chwyt + kierunek, w który patrzy GRZBIET dłoni),
    `fore` (przedramię, łokieć→nadgarstek) i `upper` (ramię, bark→łokieć).
    `fore`/`upper` to dokładnie to, czego sztywna wersja nie umiała wyrazić:
    tam przedramię było zaryglowane prostopadle do pięści, więc ramię trzymające
    broń poprawnie musiało celować uciętym końcem wprost w kamerę.
    Pozowanie: `aimBone` obraca kość tak, żeby kierunek do jej DZIECKA trafił
    w zadany wektor (roll zostaje - od limby chcemy tylko „dokąd celuje"),
    `orientBone` ustawia orientację dłoni wprost na bazie pozy bind, a palce
    zginają się wokół osi zapisanej **w ich własnej ramce bind**, więc kąt
    zgięcia znaczy to samo niezależnie od obrotu nadgarstka nad nim.
    Umiejscowienie POZY SPOCZYNKOWEJ (to, co edytuje DEVRIG) jest czystą
    translacją: `placeArm` przesuwa CAŁE ramię za bark, aż kotwica chwytu
    (`gripAnchor`) trafi w `pos`. Dlatego w DEVRIG działają OBA suwaki
    kierunku - `fore` i `upper` są niezależne, a bark ląduje tam, gdzie
    wypadnie.
    ⚠️ **Animacje NIE mogą tak jeździć - one idą przez IK** (2026-08-19,
    zgłoszenie użytkownika „ramię lewituje"): przesuwanie całej kończyny za
    pięścią zabierało ze sobą bark, więc przy przeładowaniu ramię zjeżdżało
    o 30 cm w dół, a przy sprincie oba wyjeżdżały w bok razem z bronią.
    `blendArm` woła więc `reachArm` - dwukostne IK w przestrzeni broni:
    **bark jest zadany, a stawy rozwiązywane**. Punkt podparcia daje
    `armBodyFix(vm)` w weapons.js: macierz z transformu NOSZENIA broni
    (biodro + bob + odrzut, BEZ offsetów przeładowania i sprintu) do
    bieżącego, przepuszczona przez `shoulderHome` - bark stoi w klatce
    piersiowej gracza, broń jedzie pod nim.
    ⚠️ **Bark jest kotwiczony w KAŻDYM stanie, nie tylko w animacjach**
    (2026-08-21, zgłoszenie użytkownika „przy celowaniu lewa ręka kończy się
    przed końcem ekranu i wisi w powietrzu"). Wcześniej odniesieniem było
    bieżące noszenie, czyli przy ADS bark jechał do oka razem z bronią:
    zmierzone na strzelnicy, lewy bark SMG siedzi przy biodrze na NDC y
    -1,62 (bezpiecznie pod dolną krawędzią), a przy ADS wyjeżdżał na -0,85,
    czyli W KADR - a ramiona są UCIĘTE na barku, więc widać koniec kończyny
    wiszący w powietrzu. Dlatego `applySprintPose` zmieniło się
    w `applyCarryArms(vm, w)`, które solvuje OBIE dłonie także przy w = 0
    (przy broni na biodrze macierz jest jednostkowa, więc wychodzi dokładnie
    poza spoczynkowa), a odniesieniem jest biodro.
    ⚠️ Bark nie stoi jednak całkiem w miejscu: `ARM_ADS_FOLLOW` przepuszcza
    część podniesienia do ADS/lunety także na barki. Ten rig ma od barku do
    pięści 0,49 m (prawdziwe ramię ~0,6), więc bark zaryglowany na sztywno
    zostawiał prawą dłoń **4,8 cm od chwytu** przy ADS.
    ⚠️ **To są TRZY osobne ułamki, po jednym na oś** (`{x: 0.70, y: 0.30,
    z: 0.55}`, 2026-08-21), bo podniesienie do ADS to dwa niezwiązane ruchy
    sklejone w jeden. Jedna wspólna liczba (0.35) była zła w obie strony
    naraz - zgłoszenie użytkownika: „ręce wykręca i anchoruje je do prawej,
    a one powinny być do środka".
      **x** - broń przejeżdża 0,32 m na środek ekranu i ciało jedzie za nią;
      broń podnosi się przed TWARZ, a nie wystawia w bok z głową dochyloną do
      niej. Przy 0,35 barki zostawały 0,21 m na prawo od broni, więc oba
      ramiona wchodziły ukosem z prawego rogu, a całą różnicę brały na siebie
      nadgarstki - to był ten wykręt. 0,70 to zmierzony punkt, w którym barki
      siadają NA linii celowania: pistolet ma barki na x -0,144 i +0,145
      (symetrycznie względem lufy), a długie bronie na ~0,00.
      **y** - broń idzie 0,20 m w górę do oka, a barki do oczu się nie
      podnoszą; to ta oś wpycha ucięte końce ramion w kadr, więc zostaje
      najmniejsza.
      **z** - broń cofa się 0,13 m do kamery; ta oś decyduje też, ile musi
      nadrobić `SHOULDER_GIVE` przy długiej broni (przy 0,35 luz ściągał ich
      barki 0,09 m na prawo od lufy, przy 0,55 już nie).
    Reszta podniesienia, offsety przeładowania i zjazd sprintu to dalej praca
    stawów. Sprawdza to `tests/shots_weapons.py`: wiersze `ads squared <broń>`
    pilnują, żeby środek między barkami trzymał się linii celowania (pistolet
    ≤ 0,09 - strzela się nim frontalnie; długa broń ≤ 0,17 - kolba ma prawo
    siedzieć w prawym barku), a wiersze `L/R arm cap` pilnują, żeby UCIĘTY
    KONIEC ramienia został poza kadrem - z biodra i przy ADS.
    ⚠️ **Kadrowanie ramienia mierz na CZAPIE ODCIĘCIA, nie na stawie barku**
    (2026-08-21): czapa siedzi wyraźnie dalej niż staw i wychodzi z kadru
    pierwsza, więc staw pokazuje „na ekranie" przy ramieniu skadrowanym
    poprawnie - i pokazuje tak przy KAŻDEJ długiej broni.
    ⚠️ **A czapę znajduj jako OTWARTY BRZEG SIATKI, nie „najdalsze od łokcia"**
    (2026-08-21). Brzeg liczy się tak: najpierw scal wierzchołki po POZYCJI
    (bufor duplikuje je na szwach UV/normalnych, więc surowe liczenie krawędzi
    uzna każdy szew za brzeg), potem zostaw krawędzie użyte przez dokładnie
    JEDEN trójkąt. Wychodzi 20 wierzchołków na ramię - dokładnie pierścień,
    na którym kończy się kończyna. Poprzednia wersja zgadywała: brała
    wierzchołki ważone korzeniem ramienia i zostawiała 6% najdalszych od
    łokcia. To NIE jest ten pierścień (tamte siedzą na bicepsie), więc test
    przepuszczał strzelbę z wynikiem 1.02/0.85, gdy realnie połowa pierścienia
    była w kadrze przy biodrze (0,79), a CAŁY przy ADS (0,70) - i kikut
    zostawał widoczny po dwóch „naprawach" (zgłoszenie użytkownika 2026-08-21,
    trzy razy z rzędu). Przy poprawnej sondzie pozostałe cztery bronie
    przechodzą (pistolet 9,00, SMG 1,74, karabin 1,12, snajperka 4,14).
    Podpowiedź łokcia (pole) to `upper` z wpisu - dokładnie ten kierunek,
    na który dostrojona jest poza spoczynkowa, więc podanie wartości
    spoczynkowych odtwarza ją kość w kość.
    ⚠️ **`fore` NIE jest bezużyteczne** (2026-08-21), choć solver go nie
    czyta: aim'uje przedramię POZY SPOCZYNKOWEJ, a z niej mierzony jest
    `shoulderHome`, czyli kotwica, względem której IK potem liczy. Wpisanie
    tam kierunku ODCZYTANEGO z pozy w grze karmi więc samo siebie - iterowane
    na dłoniach roboczych przesuwa nadgarstek z 57° na 88° i jedzie dalej.
    ⚠️ **Dłoń wsparcia na łożu wypycha ucięty koniec ramienia w ŚRODEK
    kadru** (2026-08-21, przy dostrajaniu strzelby/karabinu/snajperki):
    ramię wisi pod rootem broni, a łoże jest wysoko, więc kończyna urywa się
    w powietrzu - ta sama wada, przed którą powstało `ARM_ADS_FOLLOW`.
    Celuje czapą NIE pozycja pięści, tylko kąty samego ramienia: zmierzone na
    strzelnicy, podniesienie `fore` o 20° i `upper` o 25° wyprowadza ją poza
    kadr (NDC |y| 1,07-1,25 zamiast 0,74-0,83) przy pięści dalej na osi łoża
    i przy MNIEJSZYM zgięciu nadgarstka. Przesuwanie dłoni po łożu prawie nic
    tu nie daje - sprawdzone.
    ⚠️ Ten rig stoi w KAŻDYM dostrojonym chwycie na 99,5% wyprostu
    (zmierzone: `SW` 0,4877 przy zasięgu 0,4901), więc bark na sztywno nie
    dosięgnąłby nawet gniazda magazynka. Stąd dwa luzy w hands.js:
    `SHOULDER_GIVE` (bark idzie ułamek drogi za dłonią, limit
    `SHOULDER_GIVE_MAX`) i `SHOULDER_LEAN_MAX` (dochylenie, gdy celu i tak
    nie da się dosięgnąć - dłoń NIGDY nie ma się odkleić od tego, co
    trzyma). Pilnują tego asercje w `tests/shots_weapons.py`: bark nie
    dryfuje w przestrzeni kamery, a nieruchoma dłoń zostaje na chwycie.
    ⚠️ Rzeczy trzymane MIĘDZY klatkami (`shoulderHome`, `wristToGrip`,
    długości kości - liczy je `measureArm`) muszą mieć WŁASNE wektory,
    nie współdzielone scratche `_hV`/`_hQ`: `wristToGrip` przypisany ze
    scratcha był kasowany przy następnym zapytaniu o kość i całe IK
    celowało w zły punkt.
    ⚠️ **Kotwica chwytu jest ZAMROŻONA** (2026-08-19): mierzy się ją RAZ, na
    pozie bind, i trzyma w układzie kości dłoni, więc jeździ tylko
    z nadgarstkiem. Wcześniej `placeArm` używał kotwicy mierzonej na
    ZGIĘTEJ pięści (`fistAnchor`), więc każdy ruch suwaka palca przesuwał
    dziurę w pięści, a solver ciągnął za nią CAŁE ramię: +0,3 rad zjeżdżało
    nadgarstkiem o centymetr, wyzerowanie zgięcia o trzy. Palce mają się
    zamykać wewnątrz nieruchomej dłoni - pilnuje tego asercja
    `curl: closing the fingers leaves the arm where it is`. Żywa kotwica
    (`fistAnchor`) została do jednego zadania: `attachToFist` sadza w niej
    magazynek/nabój, a ten MA jechać z palcami. Przy zmianie definicji
    kotwicy trzeba przeliczyć `pos` ORAZ kotwice przeładowania
    (`mag`/`low`/`port`/`bolt`) - wszystkie są w tej samej przestrzeni.
    ⚠️ **`handFrame` zwraca orientację BEZWZGLĘDNĄ, nie deltę** - buduje bazę,
    na której mają wylądować własne osie dłoni, więc `orientBone` NIE może
    domnażać do niej pozy bind (nakładało ten sam obrót dwa razy i trzymało
    każdy nadgarstek zgięty ~120°: prosisz o jeden kierunek, dostajesz obrót
    nałożony dwa razy - to były te „powykręcane" dłonie). Pilnuje tego asercja
    `wrist: hand reaches the orientation it was asked for`.
    ⚠️ **Ramka siada na WŁASNYCH osiach kości dłoni** (zmierzone na tym rigu,
    te same na obu dłoniach): lokalne **+Z = linia kostek** (`channel`),
    lokalne **+X = normalna dłoni**, więc `palm` (grzbiet) to `-X`, a lokalne
    **+Y biegnie wzdłuż palców**. Remap 2026-08-19: wcześniej `channel`
    lądował na lokalnym X, czyli suwak „kanał" przechylał w rzeczywistości
    normalną dłoni, a „grzbiet dłoni" celował palcami - obie etykiety kłamały.
    Orientacje broni się NIE zmieniły (liczby zostały przeliczone, nie
    przestrojone: `channel_new = channel_old × (-palm_old)`,
    `palm_new = -channel_old`); pilnuje tego asercja
    `wrist: channel really is the knuckle line`, która porównuje pole
    `channel` ze zmierzoną linią kostek (znak jest lustrzany między dłońmi,
    więc liczy się `|dot|`).
    ⚠️ **Wartości neutralne = poza BIND rigu, zmierzona ze szkieletu**
    (`NEUTRAL_R`/`NEUTRAL_L` w weapons.js: kanał `[1,0,0]`, grzbiet `[0,1,0]`
    dla OBU dłoni - ramiona są lustrzane pozycją, ale orientacja bind obu
    kości dłoni jest ta sama). Dobrane „na oko" były 90° obok i łamały
    nadgarstek już na starcie. Orientacja dłoni jest ustawiana bezwzględnie,
    a przedramię celowane osobno, więc **różnicę zawsze pochłania nadgarstek** -
    dlatego DEVRIG pokazuje `Zgięcie nadgarstka` (żółte >45°, czerwone >75°)
    i osobno `Skręt przedramienia` (żółte >80°, czerwone >110°).
    ⚠️ **Skręt idzie do PRZEDRAMIENIA, nie do nadgarstka** (`rollForearm`
    w hands.js, 2026-08-19): przedramię pronuje (kość promieniowa obraca się
    nad łokciową), nadgarstek nie. `aimBone` celuje przedramieniem tylko
    kierunkiem i zostawia jego rolkę w bindzie, więc bez tego przeniesienia
    KAŻDY stopień obrotu dłoni siadał na nadgarstku i ścinał skórę na stawie -
    obrotu nadgarstka po prostu nie dało się wyrazić. Oś przeniesienia biegnie
    łokieć → nadgarstek, czyli przez początek kości ORAZ przez nadgarstek,
    więc dłoń nie rusza się z miejsca. Pilnuje tego asercja
    `wrist: the forearm takes the roll, not the joint`.
    ⚠️ **Zgięcie czyta się z POZOWANEGO stawu** (`devRigWristAngles`: kość
    dłoni względem własnej pozy bind, czyli w układzie przedramienia), a skręt
    z tego, ile pronacji wzięło przedramię (`hand.foreTwist`). Poprzednia
    wersja porównywała ramkę chwytu z orientacją
    bind w przestrzeni broni: zgadzało się to tylko dopóki przedramię stało
    w bindzie (przy lewej dłoni pistoletu pokazywało 17° zamiast 12°),
    a przeciągnięcie suwaka przedramienia przez 124° realnego zgięcia
    nadgarstka **w ogóle nie ruszało wskazania z 0** - jedyna kontrolka,
    która naprawia wykręcony nadgarstek, nie dawała żadnego sprzężenia
    zwrotnego. Pilnuje tego asercja
    `wrist: readout follows the joint, not the bind pose`.
    ⚠️ **Osie zawiasów palców NIE są zgadywane** - `fingerHinges()` mierzy je
    z rigu: oś zgięcia = kierunek palca (staw → czubek) × normalna dłoni
    (lokalne +X kości dłoni), więc dodatni kąt ZAMYKA palec. Kciuk ma osobne
    osie per kość (jego stawy nie są równoległe), a `tAdd` jedzie wokół
    normalnej dłoni. Normalna dłoni to zwykły kierunek i wychodzi TA SAMA na
    obu dłoniach (ramiona są lustrzane względem x), więc przemiatanie kciuka
    musi mieć znak per strona, a osie zgięcia (iloczyny wektorowe) odwracają
    się z lustrem same. ⚠️ **Nie licz osi z pierwszego odcinka łańcucha**
    (`p1-p0`, poprzednia wersja): kość 0 każdego palca siedzi w środku
    nadgarstka, a jej odsunięcie do kostki biegnie W POPRZEK zgięcia, po linii
    kostek - normalna takiej płaszczyzny jest 90° obok osi zgięcia i **zmienia
    znak między wskazującym a parą środkowy+serdeczny** (wachlują na przeciwne
    strony), więc palce przechodziły przez siebie nożycowo zamiast się zamykać.
    Pilnują tego asercje `curl: every chain closes toward the palm` i
    `curl: thumb sweeps toward the fingers` w `tests/devrig_test.py`.
    ⚠️ `poseArm` **zaczyna od zresetowania kości do pozy bind**: `aimBone`
    obraca od BIEŻĄCEGO kierunku, więc bez resetu roll z poprzedniej edycji
    jedzie dalej i te same liczby przestają znaczyć tę samą pozę (poza musi
    być czystą funkcją danych). ⚠️ `handFrame` musi **odsiewać dane
    zdegenerowane** - zerowa oś albo `palm` równoległy do kanału zwijają bazę,
    a `setFromRotationMatrix` oddaje wtedy kwaternion NIEJEDNOSTKOWY, który
    ścina dłoń zamiast ją obracać; `aimBone` z zerowym celem zostawia kość
    w pozie bind. Oba przypadki pilnuje `tests/devrig_test.py`.
    ⚠️ Kierunki są w przestrzeni BRONI, nie roota rąk (root niesie własny obrót
    z wypieku) - `aimBone`/`orientBone` przeliczają przez `gunRoot`.
    Rekwizyty przeładowania wiesza `attachToFist()` na kości dłoni, odkręcając
    skalę kości (geometria propa jest w jednostkach broni).
  - **Zawieszenie:** ramiona są dziećmi roota modelu BRONI (nie kamery!), więc
    ADS/sway/odrzut/pozy przeładowania niosą je za darmo; pozycje w `HANDS`
    są w przestrzeni modelu broni (sondowane z js/models.js). Prawa dłoń na
    chwycie/spuście, lewa: pistolet - druga dłoń na rękojeści, SMG/karabin -
    łoże, strzelba - pompa, snajperka - przednie łoże. Bark za tym NIE
    jedzie w animacjach - patrz „Animacje NIE mogą tak jeździć" wyżej.
    ⚠️ Dlatego `updateViewmodel` **najpierw ustawia transform broni, a dopiero
    potem ręce**: `applyReloadPose` tylko WYLICZA cele (`_relL`/`_relR`),
    nakłada je `applyReloadArms`/`applySprintPose` na końcu funkcji. Kotwica
    barku czyta `vm.matrix`, więc odwrotna kolejność dawałaby ją o klatkę
    spóźnioną.
  - **Animacje przeładowania:** startReload buduje PLAN (`relPlan`: styl
    mag/shell/shellBolt, okno cykli, `events[]` - jednorazowe dźwięki
    i przełączenia propów odpalane po przekroczeniu ułamka czasu t). Pozę
    liczy co klatkę `applyReloadPose(vm, t)` z tabel `T_MAG`/`T_MAG_E`
    (smoothstep `vmEase`/`vmPulse`), dłonie przestawia `blendArm` (pozycja
    i palce lerpem, ramka chwytu SLERPEM - interpolacja samych wektorów
    `channel`/`palm` zwija bazę w połowie kąta prostego).
    ⚠️ **Poza broni przy przeładowaniu jest PER BROŃ** (`relGun` w `HANDS`,
    2026-08-21): wspólne „w górę i do środka" jest dostrojone pod pistolet,
    któremu gniazdo magazynka siedzi tuż pod linią celowania. Gniazdo SMG
    jest 0,14 m dalej w przód i 0,13 m niżej, więc bez własnej odchyłki cała
    wymiana grała się w prawym dolnym rogu, połowa za krawędzią (zmierzone:
    gniazdo NDC y -0,71, pięść dochodziła do -1,27). Z odchyłką gniazdo
    siedzi na -0,47, a najgłębszy zjazd ręki zostaje w kadrze.
    ⚠️ **Chwyt przeładowania to osobne dane, nie chwyt bojowy** (2026-08-19):
    opcjonalny blok `grips` we wpisie `HANDS` (`mag`/`bolt`/`port`) nadpisuje
    `channel`/`palm`/`curl`/`upper` na czas danej fazy, resztę dziedziczy
    po `l`. Bez tego dłoń jechała na magazynek z linią kostek ustawioną
    pionowo do ramy i palcami zaciśniętymi na niczym, a chwyt zamka jest
    90° od bojowego (kanał wzdłuż lufy) - żadne przesuwanie pięści tego nie
    nadrabia. Dostrojone są **Glock i SMG**; broń bez `grips`
    jedzie po staremu, samą pozycją - od 2026-08-21 dotyczy to strzelby,
    karabinu i snajperki, które mają już dostrojony chwyt BOJOWY, ale nie
    przeładowania. Kotwice (`mag`/`low`/`bolt`) liczy się
    z geometrii (`tools/gen_models.py --probe`), a `low` NIE może być dalej
    niż sięga ramię - IK zatrzyma dłoń w powietrzu zamiast wyprowadzić ją
    poza kadr.
    ⚠️ **Kotwice przeładowania są w przestrzeni ZAMROŻONEJ kotwicy
    (`gripAnchor`), nie żywej pięści** (2026-08-21): dziura w pięści, wokół
    której faktycznie zamykają się palce, ląduje po nałożeniu zwojów chwytu
    kilka centymetrów obok wpisanej liczby (przy Glocku 16 mm w prawo, 15 mm
    w górę, 23 mm do przodu). Punkt zdjęty z geometrii i wklejony wprost
    stawia więc ŻYWĄ pięść w złym miejscu - stary `mag` sadzał ją 29 mm za
    magazynkiem i na równi z dolną krawędzią chwytu, przez co dłoń zamykała
    się na grzbiecie rękojeści, a czubki palca wskazującego i kciuka
    przechodziły na wylot przez ramę (zgłoszenie użytkownika 2026-08-21).
    Kotwice rozwiązuj odwrotnie: wybierz, gdzie ma stać ŻYWA pięść (przy
    wkładaniu magazynka: na jego osi, dłonią pod wystającą stopką, która
    schodzi 12 mm niżej niż chwyt), zmierz `fistAnchor(rig.L)` w przestrzeni
    broni i odejmij różnicę. Sprawdzaj po pięści, nie po wpisanej liczbie.
    ⚠️ Do tego **kciuk musi się w chwycie `mag` ZAMYKAĆ na magazynku**:
    zwoje z chwytu bojowego stawiają go pionowo wzdłuż ramy, więc z pięścią
    pod gniazdem jego czubek kończy w środku rękojeści. Mag-styl: broń lekko w górę,
    lewa dłoń wyjmuje/wsadza magazynek (prop `magProp` w pięści); shell-styl:
    broń w dół (strzelba dodatkowo rolka, snajperka odsłania komorę), lewa
    dłoń nosi pojedyncze naboje (`shellProp`). **Od pustego magazynka**
    sekwencja jest DŁUŻSZA (`reloadDuration × 1.3`, per broń przez `emptyMul`
    w `HANDS`) i kończy ją przeładowanie: zamek (mag-styl lewą, snajperka
    PRAWĄ dłonią) albo pompa (strzelba).
    Przy Glocku zamek JEDZIE - `vm.userData.slide.position.z` idzie tym samym
    impulsem co dłoń (`clearReloadVisuals` zeruje).
    ⚠️ **Glock ma WŁASNĄ tabelę faz pustego przeładowania** (`relEmptyT:
    T_MAG_E_SLIDE`, `emptyMul: 1.45`, 2026-08-21): to jedyna broń mag-stylu,
    której przeciągnięcie zamka rusza PRAWDZIWĄ geometrią, więc gdy zamek
    zjeżdża dalej (`pull` 0.055 → 0.072, czyli 54 mm za tang ramy), skok
    dostaje na to więcej czasu (okno `pull` 0,22 s zamiast 0,12 s) zamiast
    lecieć szybciej. Fazy wymiany magazynka są przeskalowane o ten sam
    czynnik, o jaki urósł całkowity czas, więc trwają tyle co przedtem.
    Dźwięk `boltPull` jedzie ze ŚRODKA okna `pull` z tabeli, nie z wklejonego
    ułamka. Broń bez tych pól jedzie po staremu (`T_MAG_E`, ×1.3).
    ⚠️ Tabele faz (`T_MAG`/`T_MAG_E`/`T_MAG_E_SLIDE`) MUSZĄ być zadeklarowane
    NAD `HANDS` - `const` w TDZ, a `HANDS` wskazuje na nie przy ładowaniu.
    ⚠️ **Kropka celownicza musi wisieć na CZĘŚCI, która ją nosi**: muszka
    Glocka jest kawałkiem zamka, więc kropka doczepiona do roota modelu
    stała w miejscu, gdy przyrząd wyjeżdżał spod niej (zgłoszenie użytkownika
    2026-08-21). Wisi teraz na `m.parts.slide`; piwot części to origin, więc
    współrzędne są te same, a zerowa pozycja zamka nie zmienia obrazu
    przyrządów (`tests/shots_weapons.py` dalej widzi kropkę na osi).
    ⚠️ **Pompka strzelby jedzie w DWÓCH miejscach** (2026-08-21): przy racku
    pustego przeładowania i **po każdym strzale** (`pumpT` w weapons.js,
    odpalane w `tryFire`).
    ⚠️ **Cykl NIE zaczyna się na strzale** (zgłoszenie użytkownika 2026-08-21:
    „za szybko"): nikt nie przeciąga zamka, gdy broń jeszcze wraca z odrzutu.
    Dlatego cykl to `PUMP_HOLD` 0,26 s martwej przerwy + `PUMP_STROKE` 0,40 s
    samego skoku (razem 0,66 s, przy odstępie strzałów 0,75 s - mieści się).
    Skok liczy się od WIEKU cyklu, nie od surowego `pumpT`, więc przerwa jest
    w sekundach, a nie w ułamku animacji. `AudioSys.pump()` z `tryFire` ma
    `delay: PUMP_HOLD` - dźwięk ma lądować na ruchu łoża, nie w huku wystrzału
    i nie na nieruchomej dłoni; podawaj tam stałą, nie przepisaną liczbę. Skok pcha `setPump(vm, dz)` - część `pump` ma
    NIEZEROWY piwot (to prawdziwa kość riga, nie wycięta wyspa jak magazynek
    SMG), więc `position.z = skok` szarpnęłoby łożem o 0,26 m; jedzie ofset od
    `pumpHome`. Dłoń wsparcia idzie z łożem: `applyCarryArms(vm, w, pump)`
    dokłada `cfg.pull` do celu lewej ręki, podzielone przez wagę, którą
    `blendArm` i tak przemnoży (cele noszenia nie niosą własnej pozy, więc
    bieg i rack się nie skalują wzajemnie). Bark zostaje na wadze BIEGU -
    przeciąganie pompki to praca stawów, nie barku.
    ⚠️ **Magazynek OPUSZCZA gniazdo** (Glock 2026-08-19, SMG 2026-08-21):
    jedzie jako WŁASNA część modelu, więc runtime dostaje
    `vm.userData.magPart` i rusza nim sam - gniazdo stoi puste, dopóki nie
    wróci. Glock zjeżdża nim wzdłuż osi magazynka (`magDrop` w `HANDS`)
    i chowa go; SMG (`magSwap`) w ogóle go nie upuszcza, tylko wynosi
    w dłoni - patrz niżej. Glock ma na to nazwany węzeł (`nodes`), SMG nie ma - jest jednym
    meshem, więc magazynek wycina reguła `split` z `island` (patrz Konwencje →
    „Modele zewnętrzne"). U SMG na zewnątrz komory wystaje tylko dolne 6 cm
    magazynka (komora kończy się na y -0,10), więc `mag` chwyta ten kikut,
    a nie środek całej bryły.
    ⚠️ **Przy `magSwap` magazynek NIE WYPADA - jedzie w dłoni** (decyzja
    użytkownika 2026-08-21: „nie możesz żeby był przyczepiony do ręki tak jak
    w glocku?"). Jest wyrywany z gniazda, znoszony w dół i wpychany z powrotem
    jako JEDEN obiekt, doczepiony do pięści; nie ma drugiego magazynka, nie ma
    podmiany, nie ma propa. Offset to droga pięści od chwytu, czyli
    `_lp - cfg.mag`, i **liczy się go po wyznaczeniu `_lp` w tej samej
    klatce** - odczyt z upozowanej dłoni spóźnia się o klatkę, a przy tych
    prędkościach to do 9 cm. Zgadza się na obu końcach: dłoń stoi na
    `cfg.mag`, gdy chwyta, i znowu, gdy zasiada, więc magazynek wychodzi
    z pozycji domowej i wraca do niej bez żadnego skoku (zmierzone: offset
    stały co do milimetra przez całą animację, maksymalny krok 0,016 m).
    ⚠️ **Upuszczania nie da się dobrać dystansem** - próbowane dwa razy
    i dwa razy źle. Na oknie 0,3 s spadek dość wolny, żeby wyglądał spokojnie,
    zostawia magazynek znikający w środku kadru („przeskakuje"), a dość
    szybki, żeby zszedł z ekranu, robi ponad 1 g i czyta się jak wystrzelenie
    magazynka z broni („leci gdzieś w kosmos"). Nawet uczciwe 1 g nie pomaga:
    z 0,5 m od kamery zamiata pół kadru. Jeśli kiedyś ma naprawdę wypadać,
    trzeba mu dać osobne, dłuższe okno, a nie kręcić dystansem.
    ⚠️ **Dłoń schodzi z EKRANU** (`low`, decyzja użytkownika 2026-08-21):
    wymiana ma wyglądać, jakby postać sięgnęła po świeży magazynek, a nie
    wkładała ten sam - a jedyne, co to sprzedaje, to zniknięcie magazynka
    z kadru na czas podmiany. Przy okazji chowa to każde pojawienie się
    i zniknięcie rekwizytu. ⚠️ **Samą głębokością się tego nie ugra** - ramię
    kończy się szybciej niż kadr (SMG prosto w dół sięga y -0,50 i górna
    krawędź magazynka dalej siedzi na NDC -0,78). Trzeba `low` COFNĄĆ ku
    kamerze: bliżej oka ten sam zjazd daje większy kąt. SMG z z +0,13 daje
    -1,18, pistolet z z +0,24 daje -1,22, i **oba trafiają w kotwicę
    dokładnie** (błąd 0,000). Sprawdza to `tests/shots_weapons.py`.
    ⚠️ Cała ta ścieżka jest **OPT-IN per broń** (`magSwap` w `HANDS`), bo
    przestawia też kotwice przeładowania na ŻYWĄ pięść (`byFist`). Włączenie
    jej dla broni z dostrojonym chwytem wymaga PRZELICZENIA kotwic: dopisz do
    nich zmierzony bias, wtedy widoczna dłoń jedzie dokładnie tą samą drogą
    (pistolet: `mag`/`low` +[0,0156, 0,0152, 0,0231], `bolt`
    +[-0,0157, -0,0322, -0,0002]; zweryfikowane porównaniem toru pięści przed
    i po - fazy ustalone zgadzają się co do 0,1 mm). Bez tego wymiana odjeżdża
    (zgłoszenie użytkownika: pistoletowi „poszła w lewo").
    Osobno per broń jest `RELOAD_SHOULDER` (jak `SPRINT_TWEAK`) - tego
    pistolet NIE ma i mieć nie powinien, bo jego dłoń podpierająca pracuje
    blisko osi kadru.
    Pudełko w pięści (`magProp`/`magDim`) to zastępczy magazynek dla broni,
    której model nie ma odłączalnego (dziś karabin) - broń z `magSwap`
    (pistolet, SMG) nie ma go wcale, bo niesie swój własny.
    ⚠️ **Kotwice przeładowania mierzą ŻYWĄ dziurę w pięści, nie zamrożoną**
    (`byFist` + `fistBias` w hands.js, 2026-08-21). Obie kotwice różnią się na
    tym rigu o 0,032 m i każda jest dobra do czego innego: `pos` dostrojonego
    chwytu znaczy „postaw TU zamrożoną kotwicę", bo to nią ruszał suwak
    w DEVRIG i pod nią dobierano wygląd. Tabele przeładowania są odwrotnie -
    czyta się je z geometrii broni (oś magazynka, rączka zamka), więc mówią,
    gdzie ma trafić DZIURA W PIĘŚCI. `blendArm` odejmuje więc `fistBias`
    od celu, wygaszony przez wagę pozy, dzięki czemu poza spoczynkowa zostaje
    nietknięta. Zmierzone: żywa pięść ląduje na `mag` i `low` co do zera.
    Bez tego magazynek jechał 3 cm obok dłoni, wbity w rękawicę i obracający
    się razem z nadgarstkiem (zgłoszenie użytkownika „magazynek przesuwa się
    w dłoni"), a kotwice z geometrii i tak nie trafiały tam, gdzie mówiły.
    `clearReloadVisuals` przywraca pozycję i widoczność.
    ⚠️ **Zastępczy prop pokazuje się dopiero, gdy dłoń rusza w dół**, a nie
    przy wyjmowaniu magazynka: wskoczenie pudełka do pustej pięści stojącej
    jeszcze przy broni wsadza bryłę wielkości magazynka w komorę i rączkę,
    a dłoń wynosi ją potem przez nie na zewnątrz - i to czyta się jak DRUGI
    magazynek wyjeżdżający z rączki.
    ⚠️ **`attachToFist` musi mieć własny wektor wyjściowy** (2026-08-21):
    `fistAnchor` używa wewnątrz współdzielonego `_hV` jako scratcha, więc
    podanie `_hV` jako parametru wyjściowego nakłada akumulator na odczyt
    pojedynczego stawu i kotwica wychodzi śmieciowa. To parkowało świeży
    magazynek ~0,15 m obok dłoni, na wysokości rączki - dokładnie ten sam
    objaw co wyżej, tylko przez cały czas trwania animacji. Po naprawie prop
    siedzi w pięści z dokładnością do 3 mm (zmierzone).
    ⚠️ Prop wisi na KOŚCI dłoni, której lokalne +Z to linia kostek, czyli oś
    dziury w pięści - a magazynek trzyma się WŁAŚNIE przez tę dziurę.
    Geometria boxa/cylindra rośnie wzdłuż Y, więc `attachHandsAndProps`
    obraca ją o 90° (`geo.rotateX`); bez tego świeży magazynek sterczał
    wzdłuż palców, czyli w poprzek tego, jak się go niesie.
    Dźwięki są keyframowane z animacji: `AudioSys.grab/magOut/magIn/boltPull/
    shellIn/pump` (stary `reloadSeq` skasowany) - nowa broń = plan + kotwice
    w `HANDS`.
  - **Sprint** (przerobione 2026-08-19): `sprintBlend` zwozi broń **nisko,
    do ciała i w poprzek kadru** (`SPRINT_POS/ROT`) - dalej trzymaną
    **OBURĄCZ**. Docelowy odczyt to sprint z Battlefielda (referencja od
    użytkownika): przy dolnej krawędzi leży sama bryła broni, **dłonie ledwo
    widoczne albo w ogóle** - i to zależnie od broni.
    ⚠️ **Bark odsuwa się na bok też przy PRZEŁADOWANIU** (`RELOAD_SHOULDER`,
    2026-08-21, zgłoszenie użytkownika „lewa ręka przechodzi do prawej"):
    wymiana magazynka zdejmuje lewą dłoń z broni i prowadzi ją w dół, czyli
    daje ten sam zapas co bieg. Waga to własna waga lewej dłoni w animacji
    (`_relLw`), więc pchnięcie narasta i wygasa razem z ruchem, a prawy bark
    dostaje zero - ta dłoń nie schodzi z chwytu. Zmierzone: lewy bark
    przechodzi z NDC x +0,16 na -0,42…-0,68 i wraca, a obie dłonie trzymają
    swoje kotwice co do milimetra.
    ⚠️ **Bark w biegu jest odsuwany na bok** (`SPRINT_SHOULDER` w weapons.js,
    2026-08-21, zgłoszenie użytkownika „lewy bark powinien być bardziej na
    lewo"). Kotwicą jest bark DOSTROJONEGO chwytu, a ten jest pozą bojową:
    rig ma od barku do pięści 0,49 m, więc trzymanie łoża 0,35 m przed sobą
    ściąga bark podpierający w poprzek klatki - zmierzone na x +0,035, czyli
    pod brodą zamiast z boku ciała. Bieg to jedyna poza z zapasem: broń jest
    przy ciele, więc lewe ramię zajmuje 0,357 z 0,49 m zasięgu i 0,16 m na
    wyprostowanie barków nic nie kosztuje - pięść zostaje na łożu, otwiera
    się sam łokieć (zmierzone: bark ląduje na x -0,125, błąd chwytu 0,0000).
    Offset jest podawany w przestrzeni KAMERY i wygaszany przez `sprintBlend`:
    przy biodrze i przy ADS ramię stoi na ~99,5% wyprostu i to samo pchnięcie
    zerwałoby dłoń z broni.
    ⚠️ Ten sam offset wywala krótką broń CAŁKIEM poza kadr (pistolet znikał
    do jednego piksela), więc jest tabela odchyłek per broń `SPRINT_TWEAK`
    (dziś `pistol` i `smg`) - „ledwo widoczne" tak, „nie ma jej" nie.
    SMG dostało swoją odchyłkę po zejściu z 1.00 na 0.84 (2026-08-21): przy
    tej samej dawce zjazdu cała komora schodziła pod krawędź i w kadrze
    zostawała **sama zielona kropka celownicza nad bezimienną ciemną belką**,
    bez śladu rąk - to się czyta jak błąd, nie jak bieg.
    ⚠️ **Nie dosuwaj broni do kamery, żeby wyszła „bliżej"** - near plane to
    0,08, a kolby długiej broni już przy biodrze siedzą 0,04 przed okiem
    (zmierzone). Wrażenie „przy ciele" bierze się ze zjazdu w dół i obrotu,
    nie z `SPRINT_POS[2]`. Wcześniej obie dłonie odjeżdżały w prawo razem
    z bronią (zgłoszenie użytkownika): ramiona wiszą pod rootem broni, więc
    pół radiana yawu zabierało ze sobą także barki. Teraz barki stoją
    (`armBodyFix`, patrz wyżej) i rusza się sam staw - dlatego yaw może
    zostać mały, nie musi go już płacić ramię. Cele sprintu
    (`_spTargetL/R`) nie niosą żadnej własnej pozy, tylko `bodyFix`:
    dłonie zostają na broni, ma stać sam bark.
    ⚠️ **Noszenie jednorącz zostało odrzucone** (decyzja użytkownika
    2026-08-19): puszczenie lewej dłoni czytało się źle na długiej broni -
    nikt nie biega z karabinem trzymanym za chwyt pistoletowy. Nie wracaj
    do tego bez osobnej pozy per broń.
  - **Rozmycie biegu** (`sprintBlurPass` w renderer.js, 2026-08-19):
    `ShaderPass` między bloomem a `OutputPass`, sterowany z `tick`
    (`setSprintBlur(sprintBlend)` tylko w stanie `playing`, więc pauza ani
    ekrany nawigacji go nie niosą). To rozmycie **PROMIENISTE**, nie
    gaussowskie po całej klatce: środek zostaje ostry, smuga narasta ku
    krawędziom - jednolity blur w strzelance odbiera możliwość zobaczenia,
    na co się biegnie. Przy sile 0 pass jest `enabled = false`, czyli kosztuje
    zero, gdy nikt nie biegnie. `SPRINT_BLUR_MAX` to offset w UV i jest
    celowo mały (0,035) - powyżej ~0,05 próbki przestają na siebie zachodzić
    i smuga rozpada się na widoczne duchy. `ShaderPass` dochodzi do listy
    importów bootstrapu w `index.html`.
    ⚠️ **ADS i przeładowanie GÓRUJĄ nad biegiem** (decyzja użytkownika):
    `sprintTarget` zeruje je razem ze strzałem (`firing`/`fireCooldown` -
    seria trzyma broń w górze), a zanik jest ~3× szybszy niż narastanie
    (`dt * 20` vs `dt * 7`), więc poza biegu schodzi w ~80 ms zamiast
    kłócić się z animacją, która ją zastąpiła.
  - **Luneta z podniesieniem:** PPM na snajperce NIE włącza lunety od razu -
    `zoomBlend` (~0.32 s) wiezie broń „do oka" (`ZOOM_RAISE`), overlay+FOV 24°
    +czułość 0.35 wchodzą dopiero na szczycie (`setScopeOverlay`); puszczenie
    PPM zdejmuje overlay natychmiast, broń opada. `spreadZoom` obowiązuje
    tylko pod pełną lunetą (`scoped`), w trakcie podnoszenia strzela się
    rozrzutem z biodra. Diagnostyka: `__test.scoped`.
  - **Reset:** `resetWeaponFx()` (zeruje blendy, plan, propy, overlay,
    pozy dłoni) woła `resetLevelState`; zmiana broni czyści propy starego
    viewmodelu (`clearReloadVisuals`).
  - Widoczność kropki celowniczej przy ADS dalej pilnuje
    `tests/shots_weapons.py` (raycast osi kamery) - ręce nie mogą jej
    zasłaniać. Ten sam zestaw pilnuje też, że UCIĘTY koniec ramienia (bark)
    nie wchodzi w kadr - ani przy biodrze, ani przy ADS. Ten sam zestaw sprawdza liczbowo kotwiczenie ramion
    (bark w przestrzeni kamery, dłoń nieruchoma zostaje na chwycie)
    w czterech fazach przeładowania i w sprincie - w sprincie sprawdzane są
    OBIE dłonie, bo obie mają zostać na broni. Czarnej rękawicy na ciemnej
    arenie nie da się ocenić ze zrzutu.
- Bunnyhop: `player.hopBoost` (do 1.35) rośnie za skok w oknie 0.25 s po lądowaniu
  (`player.sinceLand`), wygasa po dłuższym pobycie na ziemi; sprint nie wymaga ziemi.
- Rozróżnianie botów (BOT-1, 2026-08-18): **w grze został sam PATROL** (reszta
  w `_kosz/przeciwnicy/`). Typy naziemne dzielą JEDNO podwozie SENTINEL
  (model `sentinel` z `MODEL_DATA`), więc **reguła „kształt głowy = typ" już
  nie obowiązuje**. Typ czytamy z: odcienia liberii (`t.body`), koloru
  akcentu (`t.accent`), ROZMIARU sylwetki (scout ×0.93, assault ×1,
  heavy ×1.14) i dekoru głowy.
  Podwozie ma 2,15 m (`height` w `tools/gen_models.py`), sylwetka ×1.05 / ×1 /
  ×1.15 — bot MUSI górować nad graczem (`PLAYER_EYE` 1,7), inaczej czyta się
  jak zabawka.
- **Liberia LSPD** (redesign 2026-08-19, wzorzec wizualny podany przez
  użytkownika: policyjny robot w stylu „Chappie"). Cały kadłub jest SZARY
  (`matBotBody` 0x8d939b, `matBotDim` 0x60656d), łącznie z dawnymi czerwonymi
  dyskami akcentu (`Material.003` → `matBotTrim`, jasny gunmetal bez emisji).
  ⚠️ **Pancerz jest METALEM i musi mieć co odbijać** (decyzja użytkownika
  2026-08-19: „to w końcu robot, metalowy"). `MeshStandardMaterial`
  z podniesionym `metalness` i BEZ środowiska robi się CIEMNY - metal nie ma
  składowej rozproszonej, tylko odbicie - więc materiały liberii dostają
  własną sondę `TexGen.makeBotEnv()` (mała kopuła gradientowa + ciepła plama
  słońca, przefiltrowana przez `PMREMGenerator`), podpinaną leniwie przy
  pierwszym bocie w `botDecalMats()`. **Celowo NIE jest to
  `scene.environment`** - to przemalowałoby każdy materiał w grze (świat,
  bronie, ręce). Sonda jest jaśniejsza niż prawdziwe niebo areny, bo chodzi
  o jasny rant wzdłuż krawędzi paneli, a nie o uczciwe odbicie ciemnej hali.
  Malowane panele (niebieskie) zostają na NISKIM `metalness` i biorą połysk
  z niskiej szorstkości - przy wysokim pigment rozpuściłby się w odbiciu.
  Rozpoznawalność policyjną niosą dwie rzeczy:
  1. **MALOWANIE WYPIECZONE W MESHU** — nie doklejane panele. `MODELS['sentinel']`
     ma w `tools/gen_models.py` listę `paint`: każda reguła (dominująca kość +
     pudełko w METRACH pozy bind) przenosi pasujące trójkąty do OSOBNEJ grupy
     materiałowej. Dzięki temu niebieski (`Blue` → `matBotBlue` 0x2a52c8) kryje
     CZĘŚĆ kończyny (czapka hełmu, kołnierz, naramienniki, mankiety przedramion,
     nakładki bioder, nakolanniki), a nie całą — bez ani jednego dodanego
     trójkąta i bez szwów, które przy skinie i tak by pękły. Dysk „oka" idzie
     tą samą drogą do materiału `Visor` (prawie czarne, błyszczące szkło).
     Granice reguł stawiaj na krawędziach fasetek — malowany jest CAŁY trójkąt.
     Współrzędne sondujesz `python3 tools/gen_models.py --probe sentinel`
     albo wprost z `js/models.js` (poza bind: stopy na 0, wzrost 2,15, przód +Z).
  2. **Osprzęt** montowany w `buildEnemyModel` (tablica `BOT_FIT`, współrzędne
     w metrach pozy bind): trzy DEKALE (odznaka LSPD, napis LSPD, napis
     POLICE), świecąca zielona ŹRENICA w wizjerze (`matBotPupil`, r 7 mm —
     celowo dużo mniejsza niż dysk oka o r 35 mm) i dwie prostokątne lampy
     syren przy szyi. ⚠️ Wszystko buduje się w przestrzeni podwozia i oddaje
     kościom przez **`bone.attach()`** (zachowuje transform światowy
     i rozwiązuje lokalny) — kości siedzą pod grupą niosącą 103× skalę riga,
     więc wpisywanie liczb lokalnych kości byłoby zgadywaniem. Wymaga świeżego
     `g.updateMatrixWorld(true)`, bo grupa nie jest jeszcze w scenie. Źrenica
     ma `userData.isHead`, żeby strzał w oko dalej liczył się jako headshot.
  ⚠️ **Oznaczenia są MALOWANE, nie przykręcane** (decyzja użytkownika
  2026-08-19: pierwsza wersja wieszała na piersi i plecach czarne tabliczki
  z geometrią i „wyglądało to jak naklejka"). `projectBotDecal()` rzutuje
  dekal na PRAWDZIWY pancerz: siatka wierzchołków jest zrzucana raycastem na
  podwozie i unoszona 4 mm wzdłuż normalnej trafienia, więc napis oblewa
  fasety i krawędzie paneli tak jak farba. Płaski quad tego nie umie — pierś
  odchyla się od płaszczyzny o ±3 cm, plecy o ±7 cm, więc jedną stroną
  tonąłby w bryle, a drugą wisiał w powietrzu. Materiały jadą na **`alphaTest`**
  (nie `transparent`), czyli przezroczyste tło jest po prostu odrzucane i dekal
  z-testuje się jak zwykła geometria: żadnego sortowania, żadnej sylwetki
  tabliczki. `polygonOffset` domyka ostatnie ułamki milimetra. Geometria dekala
  jest liczona RAZ i cache'owana (`_decalGeoCache`) — to ~100 promieni na
  dekal, a boty spawnują się dziesiątkami.
  ⚠️ **Miejsca dekali wybiera się z MAPY GŁĘBOKOŚCI, nie z sylwetki**: pierś ma
  duży ośmiokątny bok po PRAWEJ stronie bota i czysty, podniesiony panel po
  lewej, a plecy zapadają się w heksagonalne wgłębienie. Napis położony
  w poprzek boku znika za jego rantem (tak wyszło za pierwszym razem).
  Bieżące umiejscowienie: **LSPD na NIEBIESKIM panelu piersi** (biel na
  granacie czyta się sama, dlatego napisy nie mają już ciemnej obwódki —
  decyzja użytkownika), **odznaka OBOK napisu, na lewej piersi bota** (jego
  własna lewa = +X), a **POLICE na płycie międzyłopatkowej**.
  ⚠️ Dekal ma się MIEŚCIĆ W JEDNEJ fasecie (decyzja użytkownika 2026-08-19):
  napis zawinięty za krawędź czyta się krzywo, choć technicznie leży na
  pancerzu. Płaskie okna są ciasne — plecy trzymają z w granicach kilku mm
  tylko na x ±0,08 i y 1,40–1,45 — więc napis dobiera się do okna, a nie
  odwrotnie.
  Tekstury robi `TexGen.makeBotText()` / `makeBotBadge()` (canvas w runtime,
  tło PRZEZROCZYSTE); napis rozciąga się do szerokości płótna, bo nie wiadomo,
  jaki font kondensowany ma maszyna. Odznaka to JEDYNA bitmapa w grze:
  `assets/lspd_badge.png` → `tools/gen_badge.py` → `js/badge.js` jako data URI
  (PNG z dysku taintuje WebGL przy `file://`); dekoduje się asynchronicznie,
  więc tekstura wraca od razu, a `needsUpdate` leci w `img.onload`.
  **Syreny**: dwie PROSTOKĄTNE lampy (`matSirenL/R`) WPUSZCZONE w kołnierz -
  wystaje tylko `proud` (3 mm) klosza, a głębokość osadzenia liczy raycast
  (`sirenSeatZ`, cache'owany per strona), bo kołnierz nie jest symetryczny:
  na y 1,65 jedna strona siedzi na z 0,031, druga na 0,081. Cykl sześciokrokowy
  ~9 Hz; OBIE przechodzą pełny zestaw czerwony → biały → niebieski (lampa
  zamrożona na jednym kolorze to światło pozycyjne, nie syrena), prawa
  przesunięta o pół cyklu. Sterowane przez `updateBotLights(dt)` — JEDNO
  miejsce dla wszystkich animowanych materiałów botów, wołane z `updateEnemies`
  i z `Bestiary.update` (w menu pętla wrogów nie chodzi).
  ⚠️ **Każdy krok niesie WŁASNĄ `emissiveIntensity`**, bo bloom progu­je po
  LUMINANCJI (0.60 w renderer.js), a niebieski prawie jej nie ma: `0x2a5cff`
  przy wzmocnieniu białej lampy wychodzi ~0,43 i **w ogóle nie świeci** (zgłoszone
  przez użytkownika). Liczby w `SIREN_SEQ` wyrównują trzy barwy po luminancji,
  a nie po wzmocnieniu (czerwony 6,0 / biały 2,2 / niebieski 8,0).
  `SETTINGS.strobe = false` (PROP-6) zamienia miganie na stałe świecenie.
  ⚠️ Materiały liberii są WSPÓŁDZIELONE (moduł, nie instancja) — bot na sztukę
  mnożyłby draw calle bez powodu; z tego samego powodu tekstury dekali budują
  się raz, przy pierwszym bocie (`botDecalMats()`).
  **Do modelu NIE doklejamy DEKORU** (decyzja użytkownika 2026-08-18): żadnych
  kogutów, naramienników, pasa służby ani anteny — model ma własną, a doklejane
  bryły odcinały się od sylwetki. Okucia wyżej to wyjątek uzgodniony
  2026-08-19 i ograniczony do oznakowania policyjnego.
  Strobo (`matStrobeR/B`) i biały pas nosi już tylko WAŻKA.
  **Podwozie jedzie jako PRAWDZIWY SKIN w czystej pozie BIND** (decyzja
  użytkownika 2026-08-19): `buildSkinnedModel('sentinel', matFor)` zamiast
  `buildModel`. Wcześniej rig był cięty na sztywne party po dominującej kości,
  a w geometrię wypalona była poza (zgięte palce prawej dłoni) - party pękały
  na szwach przy każdym obrocie, a wypalona poza zamrażała jeden chwyt na stałe.
  Teraz `MODELS['sentinel']` ma `skin: True` i NIE MA `pose`, `joints`,
  `sockets` ani `vertexSockets`. **Żadna poza i żadna animacja szkieletu nie
  jest już nakładana** - ani w wypieku, ani w `buildEnemyModel`, ani
  w `updateEnemies` (wahadło nóg `legL/legR` zostało usunięte; przy `enemy`
  jest teraz `bones`, nie `legL/legR`). To celowo czysta kartka: pozy
  i animacje buduje się od zera na `model.bones`, kluczowanych nazwami kości
  źródłowych (`lower body`, `Upper body`, `neck`, `head`, `upper_arm.L/R`,
  `forearm.L/R`, `hand.L/R`, `thumb/f_middle/f_ring .01/.02 .L/R`,
  `thigh/shin/foot/toe/heel.02 .L/R` - 32 kości). Zostaje tylko podskok całej
  grupy w `tick` (`g.position.y`), bo to transform grupy, nie riga.
  `gunTip` (kotwica smug) wisi na razie na grupie bota (0, 1.45, 0.35) -
  przenieś go na `bones['hand.R']` dopiero wtedy, gdy powstanie poza celowania.
  Ograniczenia riga: 3 palce na dłoń (kciuk, środkowy, serdeczny, po 2 człony),
  brak obojczyków i pośrednich kręgów (`lower body` → `Upper body` to jeden
  staw), więc skręt tułowia będzie sztywny.
  ⚠️ **Nie zgaduj, w jakiej przestrzeni leżą surowe wierzchołki.** `arms` mają
  IBM-y znoszące się z grafem węzłów (surowy `POSITION` = przestrzeń sceny),
  ale Ross NIE: jego `jointWorld·IBM` to macierz węzła mesha (skala 100), czyli
  surowe pozycje są ~100× mniejsze niż poza bind. `build_skinned` liczy więc
  pozę bind tak jak zrobi to GPU (suma `jointWorld·IBM` po wagach) i dopiero na
  niej mierzy `height`/`ground`. Na surowych wierzchołkach dron wychodził
  ~100× za wysoki. Ten sam rig ma też własną konwersję Z-up → Y-up w węźle
  mesha, więc `rot` MUSI być puste (poza bind wychodzi Y-up, przodem w +Z).
  ⚠️ FBX2glTF zostawia w tym pliku 180 wierzchołków z wagami **NaN** (wszystkie
  wskazują slot 0 = `lower body`); NaN przechodzi przez normalizację i zabija
  kwantyzator, więc wypiek podmienia je na pełną wagę pierwszego jointu.
  PATROL nie nosi na razie modelu broni (decyzja użytkownika 2026-08-18:
  wypieczony Glock nigdy nie siedział przekonująco w pięści).
- Anti-stuck botów: gdy faktyczny ruch < 30% nominalnego przez 0.35 s → objazd boczny
  (`avoidT`/`avoidDir`) na ~1 s. Faktyczną prędkość mierzy się PO resolveCollisions.
- Generator aren: `generateArena(ARENA_SEED)` (mulberry32, seed z `?seed=N` albo
  losowy per załadunek). Przeszkody TYLKO osiowe; `keepClear` chroni spawn gracza,
  spawny botów i startowe pickupy; MARGIN 2.2 gwarantuje przesmyki dla botów.
  Układ jest stały w obrębie sesji (restart nie przebudowuje świata). Determinizm
  testuje `__test.arenaHash`.
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
- **Gotowe zestawy testów leżą w `tests/`** (opis w `tests/README.md`).
  Po wycięciu kampanii zostały: `phase0` (cykl życia świata, determinizm areny,
  sklep, pełny bieg `?test=win`), `phase1` (generator aren), `phase7` (ustawienia,
  wślizg, granaty, tarcza skrótów), `menu_test` (menu + panorama + motyw),
  `bestiary_test` (bestiariusz), `devmap_test` (strzelnica dev),
  `devrig_test` (edytor chwytu) oraz
  `shots2.py`/`shots_models.py`/`shots_weapons.py` (zrzuty do oceny wizualnej;
  `shots_weapons.py` liczy też projekcję przyrządów ADS na oś kamery). Testy kampanii (`phase2`-`phase6`, `phase5d`, `status1_test`,
  `shots.py`) pojechały razem z nią do `_kosz/kampania/tests/`.
- ⚠️ **NIE odpalaj pełnej regresji po każdej zmianie** (decyzja użytkownika,
  2026-08-19) — każdy zestaw startuje własną przeglądarkę i przemiał całości
  trwa kilka minut. Testy odpala **użytkownik**, komendą `/tests`
  (`.claude/commands/tests.md`).
  Ty uruchamiasz **tylko to, co bezpośrednio weryfikuje bieżącą zmianę** —
  najczęściej jeden zestaw albo doraźny skrypt w katalogu scratchpad. Jeśli
  uważasz, że zmiana jest ryzykowna szerzej, **napisz to i zaproponuj `/tests`**
  zamiast odpalać wszystko z automatu. Wyjątki, kiedy wolno sprawdzić bez
  pytania: zmiany w broni/rękach/viewmodelach warto przepuścić przez
  `tests/shots_weapons.py` (liczy projekcję przyrządów ADS — na ciemnym zrzucie
  nie da się tego ocenić okiem).
- Hooki diagnostyczne w grze (nie usuwać):
  - `window.__test` — stan aktualizowany co klatkę (state, hp, score, wave, enemies,
    ammo, fov, credits, headshots, endless, errors[], mode, difficulty,
    mission {id, active, time, kills, objectives[]}, seed, arenaHash,
    arenaReachable, pointerLock/wantLock, crouch/eyeH, slide, grenades,
    settings, pressure, radioHold, menuBg, dev, devrig, scoped);
    audio: `sfxPlayed`, `sfxSamples`/`sfxDecodeFail` (dekodowanie próbek),
    `menuMusic`;
  - parametry URL: `?test=play` (autostart areny bez pointer locka), `?test=shoot`
    (+ auto-celowanie z kontrolą LOS), `?test=over`, `?test=win` (przewinięcie fal);
    `&wave=N` (arena od fali N); debug generatora (arena):
    `?style=open|pillars|corridors&half=N&density=X`; `?seed=N` jak dawniej;
  - `window.__addCredits(n)`, `window.__buyItem(id)`,
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
w pauzie": `master.gain` jest gotowym punktem zaczepienia).

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

Zrobione w partii 2026-08-14: **ustawienia** (PROP-1: czułość myszy,
głośności, bloom/cienie, ekran ze startu i pauzy, zapis `status1_settings`),
**wyłącznik strobo dronów** (PROP-6 częściowo — zostało remapowanie klawiszy
i tryb dla daltonistów), **wślizg** (PROP-2), **granaty** (PROP-4) oraz
**tarcza skrótów przeglądarki** (BUG-3: Ctrl+W przy wślizgu zamykał kartę —
preventDefault + fullscreen z Keyboard Lock + beforeunload).
Szczegóły w Konwencjach technicznych; testy w `tests/phase7_test.py`.
Tego samego dnia: **menu główne z animowaną panoramą Los Santos** (MENU-1:
`js/menubg.js`, układ cyberpunkowej lewej kolumny, ekran statystyk,
panorama niebiesko-czerwona; testy w `tests/menu_test.py`).

Pomysły na dalszą rozbudowę:

1. ~~**Granaty**~~ — ✅ ZROBIONE (2026-08-14): `js/grenades.js`, klawisz G,
   sklep `nade`, licznik na HUD — patrz Konwencje techniczne.
2. ~~**Ustawienia w pauzie**~~ — ✅ ZROBIONE (2026-08-14): `js/settings.js`,
   ekran `screen-settings` — patrz Konwencje techniczne.
3. **Nagroda za komplet medali (30/33)** — bonusowa linia w outro / skórka broni;
   zapis ma już liczniki.
4. **Ekran wyników misji ze szczegółami** — wykres HP w czasie, mapa trasy.
5. **Sterowanie dotykowe** — wirtualne gałki dla telefonów (gra jest lekka).
6. **Minimapa / kompas** — kierunki botów na obwódce ekranu lub mały radar
   (znaczniki celów z off-screen chevronami już istnieją — to ich rozszerzenie).
7. **Dostępność** — remapowanie klawiszy, tryb dla daltonistów. Wyłącznik
   strobo dronów ✅ jest w ustawieniach (2026-08-14).
8. **Multiplayer co-op (WebRTC)** — największy skok złożoności; wymaga sygnalizacji,
   więc łamie zasadę „zero backendu" — rozważyć dopiero po wyczerpaniu single-player.
9. **Pickupy na przełomie fal (arena)** — świeża dostawa w przerwie między falami
   zamiast wszystkiego na starcie; w kampanii pickupy są już autorskie per misja
   (`arena.pickups`).
10. ~~**Nowe logo/og-image**~~ — ✅ ZROBIONE (2026-07-13): cały komplet (emblemat,
   lockup, favicony, PWA, og-image) leci z `tools/gen_logo.py` — patrz Architektura →
   Branding. Ekran startowy pokazuje pełny lockup zamiast CSS-owego wordmarku.
