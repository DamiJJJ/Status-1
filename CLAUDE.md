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
  i jego płyta zamka (`bolt` = cały materiał `Grey`). Od 2026-08-26 tą samą
  drogą jadą: magazynek KARABINU (`mag`, wyspa c(0, -0,075, +0,010),
  x ±0,013 y[-0,182 +0,038] z[-0,035 +0,077], oś główna (0, 0,9915, 0,130) -
  prawie pionowa, 7,5° do przodu) i rączka zamka SNAJPERKI (`bolt` - JEDYNA
  wyspa wystająca w prawo od komory, x do +0,050 przy reszcie ≤ +0,017;
  68 trójkątów, x[-0,033 +0,050] y[+0,038 +0,085] z[+0,282 +0,296]).
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
  `center: True`; wypieczone są `glock`, `smg` (body+mag), `shotgun`
  (Mossberg 590A1, części body+pump), `rifle` (body+mag) i `sniper`
  (body+bolt - rączka zamka jeździ po każdym strzale).
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
    animacją). `pump(id, {vol})` gra w DWÓCH miejscach: raz
    w przeładowaniu (pełna głośność; zdarzenie na t 0,87, czyli na skoku
    0,81..0,95 - nie na wklejonym ułamku) i raz **po każdym strzale**, ciszej
    (0.38).
    ⚠️ Ten drugi jest pod warunkiem `w.mag > 0` (zgłoszenie użytkownika
    2026-08-21): po OSTATNIM naboju łoże przejmuje przeładowanie
    (`startReload` zeruje `pumpT`), więc suw nigdy się nie rysował, a sam
    dźwięk i tak leciał - broń przeładowywała pustkę.
    ⚠️ **Odpala się Z ANIMACJI** (`pumpFired` w weapons.js), na klatce,
    w której łoże faktycznie rusza - a NIE planowany z wyprzedzeniem
    z `tryFire` przez `delay`. Tamto miało tę samą wadę co wyżej, tylko
    z innej strony (zgłoszenie użytkownika 2026-08-25: „jak strzelimy
    i klikniemy reload, to puszcza się dźwięk pompki, pomimo że za pompkę nie
    ciągniemy"): strzał rezerwował próbkę na zegarze WebAudio `PUMP_HOLD` do
    przodu, a przeładowanie zaczęte w tej przerwie zerowało `pumpT` - łoże
    stało, dźwięk leciał. **Próbki wystartowanej na zegarze audio nie da się
    cofnąć**, więc naprawa polega na tym, żeby jej tam nie stawiać. Każde
    miejsce kasujące skok (`switchWeapon`, `resetWeaponFx`, `startReload`)
    ustawia `pumpFired = true`.
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
    **Suchy strzał** (`AudioSys.empty()`) jest od 2026-08-27 JEDYNĄ odpowiedzią
    pustej broni (patrz Konwencje → „PUSTA BROŃ NIE PRZEŁADOWUJE SIĘ SAMA"),
    więc musi czytać się jak MECHANIZM, nie jak pisk UI: synteza to teraz
    transjent szumu (uderzenie iglicy) plus krótki niski stuk, a nie kwadratowy
    blip. Klucz `dry_fire` jest wpisany w `MANIFEST` (9mm Pistol Dry Fire,
    cięcie z pomiaru obwiedni: transjent na 0,000, 6% szczytu na 0,030) i jest
    WSPÓLNY dla całego arsenału z tego samego powodu co `draw` - iglica
    spadająca na pustą komorę to mechanizm spustu, nie kaliber, a w paczkach
    jest dokładnie jedno takie nagranie.
    ⚠️ **Ten klucz czeka na przegenerowanie `js/sfx.js`** - `tools/gen_sfx.py`
    wymaga `ffmpeg`, którego na tej maszynie nie ma. Do tego czasu `sample()`
    zwraca `false` i gra jedzie na syntezie, dokładnie tak, jak przewiduje
    zasada „każde wywołanie musi mieć fallback".
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
  ⚠️ **Karabin PRÓBOWAŁ z niej wyjść 2026-08-25 i musiał wrócić** - winna
  KOLBA (zgłoszenia użytkownika: najpierw „przy celowaniu kolba wchodzi
  w kamerę i widzimy przezroczystość w jej miejscu", potem „podczas
  przesunięcia z pozycji nie-celowania do celowania jakoś dziwnie przenika").
  Przysunięcie faktycznie zdejmuje kikut z kadru, ale przepycha kolbę przez
  near plane, a rozcięta skorupa z odrzuconymi tylnymi ściankami czyta się
  jako DZIURA.
  ⚠️ **Dziura żyje w ŚRODKU blendu ADS, więc oba końce mogą wyjść czysto,
  a przejazd i tak ją pokazuje.** Liczy się nie to, CZY płaszczyzna tnie broń
  (przy biodrze tnie zawsze), tylko GDZIE wypada przekrój: płytkie ścięcie
  samego czubka rzutuje się daleko poza kadr i tak samo głębokie cięcie, gdy
  broń stoi jeszcze z prawej - ale płytkie cięcie przy broni NA ŚRODKU ląduje
  w kadrze. Przy `root.z` +0.02 tył przejeżdżał +0,087 → −0,093 i otwierał
  dziurę na t 0,65-0,85, czyli dokładnie wtedy, gdy broń się prostuje.
  ⚠️ **Blend trzeba więc mierzyć CO UŁAMEK, nie na końcach** - i pinować go
  PO aktualizacji, a nie przed: `updateViewmodel` sam dociąga `adsBlend` do
  celu, więc ustawienie go przed wywołaniem daje mu tylko nowy punkt startowy
  (pin na 0 wychodził ~0,2). Drugi przebieg z `dt = 0` pozuje dokładny ułamek.
  Zmierzone co 0,05: jedyny czysty kształt to ten, który mają pozostałe
  bronie - tył albo zostaje ZA okiem przez całą drogę (SMG +0,050 → +0,010,
  strzelba +0,290 → +0,130), albo PRZED nim przez całą drogę. Kolba karabinu
  jest za wysoka na pierwsze (przemiecione do `adsPos` −0.28 - dziura od
  t 0,65), więc jedzie drugie, a to przybija `root.z` do kotwicy: już przy
  −0.10 dziura wraca. **Biodro nie może się przysunąć ani o centymetr, bo
  jest POCZĄTKIEM przejazdu do ADS.**
  Zostaje ostatnie 0,025 dojazdu przy ADS: −0.505 to najbliższy czysty ułamek,
  −0.48 już dziurawi, a bieżące **−0.52** trzyma zapas (tył −0,048 → −0,108,
  monotonicznie od płaszczyzny). Kikut zdejmuje za to ramię wsparcia - niżej.
  ⚠️ **Dziurę mierz PROMIENIEM W TYLNĄ ŚCIANKĘ, nie okiem i nie po pozycji
  kolby** (2026-08-26). Test: promień z kamery przez siatkę ekranu; pierwszy
  trójkąt broni ZA near plane musi być PRZEDNI - jeśli jest tylny, przód
  skorupy został ucięty i widać przez nią świat. Ciemna broń na ciemnej
  arenie nie da się tego ocenić ze zrzutu (próbowane, nie dało się).
  ⚠️ **Raycaster Three.js honoruje `material.side`**, a wszystkie materiały
  broni są `FrontSide` - więc sonda, która nie przełączy ich na czas pomiaru
  na `DoubleSide`, NIGDY nie trafi w tylną ściankę i zamelduje „czysto" nawet
  przy 714 wierzchołkach uciętych near planem (zmierzone - pierwsza wersja
  sondy dokładnie tak kłamała). Materiały są WSPÓŁDZIELONE, więc przywrócenie
  `side` po pomiarze jest obowiązkowe.
  Zmierzone tą sondą (siatka 99×99, co ułamek blendu): `root.z` **−0.10 to
  ostatni czysty krok**, −0.09 otwiera 321 próbek prześwitu na t 0,75, −0.07
  daje 797 przy pełnym ADS. Notatka wyżej („przy −0.10 dziura wraca") była
  o jeden krok zbyt ostrożna, ale wniosek zostaje ten sam: **dystansem
  kadrowania kikuta na karabinie kupić się NIE DA** - w czystym oknie
  pierścień dalej siedzi w kadrze (4/20, |ndc y| 0,94 przy progu 1,00).
  Dlatego karabin dostał `CARRY_SHOULDER` - patrz niżej.
  ⚠️ **`fore` i `upper` to dwa pola, których DEVRIG nie ocenia** - nie ruszają
  dłoni ani o 0,1 mm (zmierzone na każdym przemieceniu), decydują o KSZTAŁCIE
  kończyny w widoku gracza i o kadrowaniu kikuta, a kamera warsztatowa nie
  pokazuje ani jednego, ani drugiego. Przy karabinie oba objawy brały się
  z `fore` biegnącego pod azymutem 45°, czyli W POPRZEK broni: kikut siedział
  w kadrze (10/20, |ndc y| 0,63), a łokieć uciekał **0,202 m W BOK** od
  nadgarstka przy zaledwie 0,040 m w dół - na ekranie szeroka blada płyta
  przedramienia w lewym dolnym rogu (zgłoszenie użytkownika: „łokieć jest
  nienaturalnie wygięty, powinien iść bardziej w dół niż w bok"). Obrócenie
  go wzdłuż broni i podniesienie (az 45 → 25, el 10 → 40) sadza łokieć POD
  nadgarstkiem: 0,094 w bok przy 0,177 w dół (biodro) i 0,016 przy 0,174
  (ADS).
  ⚠️ **`upper` musi wtedy zejść W DÓŁ, i decyduje o tym ŁOKIEĆ**: poza
  spoczynkowa ustala `shoulderHome`, więc kąt MIĘDZY tymi dwoma kierunkami
  jest tym, co zostaje jako zgięcie łokcia, gdy IK zakotwiczy bark.
  Podniesienie obu naraz PROSTUJE ramię - przy az 7 el 20 łokieć przy ADS
  blokował się na 177°, czyli ta sama kończyna na sztywno, przed którą
  powstało `SPRINT_SHOULDER_TWEAK`. Przy az −10 el −8 siedzi na 122° (biodro)
  i 145° (ADS), kikut dalej poza kadrem (|ndc y| 1,34 / 1,56), a skręt
  przedramienia jest NIŻSZY niż na wartościach z DEVRIG (159/154 zamiast
  179/174). Ceną jest zgięcie nadgarstka: 11 → 39 przy biodrze, 24 → 53 przy
  ADS - żółte pasmo edytora, daleko od czerwonego.
  ⚠️ **Te wartości zastąpił dial użytkownika z DEVRIG** (2026-08-26): karabin
  i snajperka dostały ten sam PŁYTKI układ przedramienia co strzelba
  (`fore` [0.5279, 0.0872, -0.8448], czyli ~5° nad poziom, wzdłuż broni).
  To jest ta sama poza, którą użytkownik zatwierdził do zdjęcia
  referencyjnego, i ma tę samą cenę co tam: wypycha KIKUT w kadr (zmierzone:
  karabin 8/20 pierścienia przy biodrze, snajperka 16/20). Nie prostuj tego
  z powrotem do pionu - kikut kadruje się osobno, patrz niżej.
  ⚠️ **To nie wystarczyło - RAMKĘ dłoni też trzeba było wymienić**
  (2026-08-26, zgłoszenie użytkownika: ręka dalej źle wygięta przy
  celowaniu). Kąty ramienia były już dobre, ale `channel` dostrojony
  w DEVRIG biegł 30° W POPRZEK broni, więc palce przewieszały się przez
  GÓRĘ łoża i przy ADS czytały się jako blady kłąb gołej skóry siedzący na
  linii celowania (rękawice są BEZ PALCÓW - wszystko, co wychodzi poza
  sylwetkę broni, świeci skórą). Naprawa: ramka dłoni wsparcia STRZELBY
  (jedyny chwyt wsparcia zatwierdzony przez użytkownika do zdjęcia
  referencyjnego) przeszczepiona w całości - kanał 15° od osi lufy, dłoń
  pod łożem - z `pos` rozwiązanym wstecz na żywą pięść (0, 0.070, -0.14)
  i mocniejszymi zwojami. Kciuk idzie PRZEZ GÓRĘ (tAdd +0.40, czubek na
  x -0,036 y 0,118 - przytulony do górnej lewej krawędzi łoża, sylwetka na
  tle broni); na dostrojonym -0.12 sterczał w bok na x -0,075 jako oderwany
  skórowy klocek obok łoża w każdej klatce ADS. Pomiary po wymianie: skręt
  159 → 144 (biodro) / 135 (ADS), zgięcie 38/54, łokieć 122/145, kikut
  1,44/1,71 - wszystko mierzone, nie na oko. `fore`/`upper` zostały.
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
- **Odrzut** (`weapons.js`, przebudowany 2026-08-27, zgłoszenie użytkownika:
  „nie czuć go na rękach; po strzale ze snajperki czy strzelby powinien być
  dużo bardziej widoczny, a reszta broni nie powinna być idealnie prosto
  w trakcie strzelania"). Wcześniej odrzut był JEDNĄ liczbą (`vmRecoil`)
  dosuwaną do `vm.position.z` i `vm.rotation.x`.
  ⚠️ **Nie było go widać, bo ta sama liczba szła TAKŻE do odniesienia barku**
  (`_carryPos`/`_carryRot`, patrz `armBodyFix`): skoro odniesienie niosło
  pełny odrzut, `armBodyFix` go ZNOSIŁ, bark jechał razem z bronią i ani jeden
  staw się nie ruszał. Odrzut był więc sztywnym przesunięciem całego zestawu,
  a nie czymś, co ręce absorbują.
  Dziś ciało bierze tylko UDZIAŁ kicka (`ARM_RECOIL_FOLLOW` 0.35), a reszta
  jest odchyłką, którą pochłaniają łokcie i nadgarstki - i to jedyna rzecz,
  która czyta się jako odrzut w rękach. Zmierzone na strzelnicy, na szczycie
  kicka (łokieć L/R, wszystkie z pięścią na chwycie co do 0,0000 m):
  pistolet 175→154 / 178→158, SMG 171→148 / 163→153, strzelba 157→132 /
  144→127, karabin 149→136 / 147→137, snajperka 172→119 / 132→111.
  ⚠️ **PRZESUW i PODRZUT to dwie różne liczby** (`RECOIL_TRAVEL` 0.45 m/jedn.,
  `RECOIL_PITCH` 2.2 rad/jedn.). Przy dawnym 1:1 snajperka wjeżdżała **0,22 m**
  w bark i składała łokieć o **83°** w jednym strzale - niewidoczne, dopóki
  ręce jechały z bronią, groteskowe w chwili, gdy przestały. Ciężar broni
  niesie PODRZUT LUFY, nie wjazd w ramię, więc przesuw jest przycięty,
  a podrzut podniesiony. Zmierzone podniesienie broni na ekranie (NDC y,
  szczyt): pistolet 0,051 · SMG 0,056 · karabin 0,069 · strzelba 0,119 ·
  snajperka 0,170.
  ⚠️ **To SPRĘŻYNA, nie liniowy zanik** (`RECOIL_K`/`RECOIL_C`, tłumienie 0,54,
  czyli celowo poniżej krytycznego): broń kopie, wraca PONIŻEJ pozy
  spoczynkowej i dopiero siada. To przeregulowanie jest tym, co każe ciężkiej
  broni czytać się ciężko - liniowy zjazd sprawiał, że strzelba czuła się jak
  SMG. Zmierzone w ogniu ciągłym: strzelba i snajperka schodzą pod zero
  (-0,004 / -0,009), bronie automatyczne nie zdążają wrócić i wiszą podniesione
  przez całą serię. Kick wchodzi w DWÓCH kawałkach (`RECOIL_SNAP` 0.7 od razu,
  `RECOIL_PUSH` 11 jako prędkość): czysty impuls prędkości zostawiałby broń
  nieruchomą dokładnie na tej klatce, na której gracz widzi błysk.
  ⚠️ **Kick nie jest osiowy** (`RECOIL_YAW` 0.9, `RECOIL_ROLL` 1.4): każdy
  strzał losuje własny odchył i rolkę, ze znakiem NAPRZEMIENNYM
  (`vmRecoilSide` - czysty rzut monetą się zbija w serie), więc seria wędruje
  zamiast stemplować w kółko tę samą klatkę. Rolka i odchył idą tą samą drogą
  co reszta: pełne na broni, `ARM_RECOIL_FOLLOW` na ciele.
  ⚠️ **Wszystko MUSI wracać do zera i wraca** (zmierzone: 0,00000 po puszczeniu
  spustu). Poza spoczynkowa to dokładnie to, co mierzy
  `tests/shots_weapons.py` (kropka na osi kamery, pierścień kikuta poza
  kadrem) i co pokazuje DEVRIG - kick zostawiający resztkę po cichu
  przestawiłby jedno i drugie. `clearRecoil()` woła `resetWeaponFx`
  i `switchWeapon` (kick starej broni nie jedzie na nową).
  ⚠️ Kamera ma osobny, NIEZMIENIONY kick (`w.kick` w `WEAPONS`) - celowo, bo
  pociski lecą promieniem kamery, więc ruszanie go dotyka celności i balansu.
  Odrzut wizualny siedzi wyłącznie w viewmodelu i w rękach.
  ⚠️ **CELOWANIE ŚCINA KICK DO 20%** (`RECOIL_AIM`, decyzja użytkownika
  2026-08-27: „z biodra zostaw jak jest, ale celując zdecydowanie zmniejsz
  odrzut na wszystkich broniach - samą animację i wiggle celownika; to powinno
  być minimalne"). Broń wciągnięta w bark i podparta policzkiem po prostu nie
  rzuca tak, jak trzymana na wyciągniętych rękach, a przy przyrządach każdy
  stopień rzutu to stopień, przez który gracz musi odczytać strzał. Zmierzone
  na ŻYWYCH strzałach (największy ruch punktu celowania na ekranie, biodro →
  ADS): pistolet 0,022 → 0,008 · SMG 0,018 → 0,005 · karabin 0,034 → 0,009 ·
  strzelba 0,128 → 0,030.
  ⚠️ **Skala jest ZATRZAŚNIĘTA w momencie strzału** (`vmRecoilAim`), nie
  czytana na bieżąco z blendu - i rozstrzyga o tym SNAJPERKA. `tryFire` zdejmuje
  jej lunetę (patrz „Cykl zamka snajperki"), więc `zoomBlend` zapada się w tym
  samym oddechu co kick: czytana na żywo, jedyna broń, którą ZAWSZE strzela się
  podpartą, dostawała skalę od celowania, którego już nie miała, i wychodziła
  na 0,145 ekranu wobec 0,175 z biodra, czyli praktycznie bez ulgi. Zatrzask
  jest też właściwym modelem dla pozostałych czterech: puszczenie PPM w połowie
  kicka nie ma prawa tego kicka POWIĘKSZYĆ.
  ⚠️ Skala mnoży ŹRÓDŁO (przesuw, podrzut, odchył i rolkę naraz), więc broń
  i odniesienie barku kurczą się RAZEM. Przeskalowanie samej broni oddałoby
  całą różnicę stawom, czyli wsadziłoby w nadgarstki dokładnie ten odrzut,
  który przyrządy mają wyjąć.
  ⚠️ To, co po strzale ze snajperki widać przez lunetę, to w większości NIE
  odrzut: przy `vmKick = 0` ta broń i tak przejeżdża 0,141 ekranu, bo zjeżdża
  z lunety i cyklu je zamek. Nie próbuj tego „naprawiać" odrzutem.
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
    ⚠️ **Punkt (1) tej metody jest MYLĄCY dla dłoni WSPARCIA i strzelba się
    o niego rozbiła** (2026-08-25, zgłoszenie użytkownika „chwyt do
    poprawy"). `channel` to LINIA KOSTEK (wskazujący → mały palec), a nie oś
    bryły, którą się trzyma - te dwie rzeczy pokrywają się na rękojeści
    pistoletowej (kostki biegną w dół chwytu) i są PROSTOPADŁE na poziomym
    łożu: dłoń oplata je od dołu, więc kostki lecą w dół BLISKIEJ ścianki
    łoża, prawie pionowo. Wpisanie tam osi łoża daje dłoń OTWARTĄ, płasko
    przyklejoną do boku broni, z palcami sterczącymi w górę obok lufy -
    dokładnie to, co strzelba miała od 2026-08-21 (86° zgięcia nadgarstka
    i 150° skrętu, oba w CZERWONYM paśmie samego DEVRIG-a).
    Wzorcem dla dłoni wsparcia jest **SMG** - jedyna, która od początku
    czytała się jak zaciśnięta pięść (6° zgięcia) - i jej ramkę bierze się
    w całości, a potem przemiata przechyłem kanału i rolką dłoni. Strzelba
    siadła na 7°/102°, czyli w paśmie SMG.
    ⚠️ **Sprawdź też, czy dziura w pięści leży NA bryle**: stara strzelba
    miała ją na x +0,037, czyli 4 mm ZA prawym licem łoża (łoże ma x ±0,033) -
    ręka nie trzymała niczego, choć wszystkie liczby wyglądały sensownie.
    ⚠️ **`fore`/`upper` NIE ruszają dłoni** (zmierzone na 59280 kombinacjach:
    dryf kotwicy pięści 0,00000 m), więc wolno je rozwiązywać niezależnie -
    także pod chwyt, który ktoś inny ustawił w DEVRIG. To jedyne dwa pola,
    których edytor NIE jest w stanie ocenić: decydują o KSZTAŁCIE kończyny
    w widoku gracza i o kadrowaniu kikuta, a kamera warsztatowa nie pokazuje
    ani jednego, ani drugiego.
    ⚠️ **Jest tu prawdziwy, monotoniczny kompromis** (strzelba 2026-08-25,
    referencja fotograficzna od użytkownika): im PŁYCEJ leży przedramię, tym
    mocniej musi się skręcić, żeby dosięgnąć zadanej dłoni. Zmierzone przy
    zapasie kadru kikuta > 1,10:

    | przedramię nad poziomem | skręt |
    |---|---|
    | 0-10° | 114° |
    | 10-20° | 95° |
    | 20-30° | 84° |
    | 50-60° | 64° |
    | 70-80° | 57° |

    Pionowe przedramię (kolumna pod nadgarstkiem) jest na tym rigu
    NAJTAŃSZE - i jest źle: tak się nie trzyma broni długiej. Referencja
    pokazuje przedramię biegnące płasko w dół i w lewo, prawie w linii broni.
    Więc **najpierw wybiera się kształt, potem płaci za niego skrętem**;
    strzelba stoi na płytkim końcu tabeli (31° zgięcia, 161° skrętu) -
    i to jest CENA POZY, a nie błąd do naprawienia postawieniem ramienia.
    ⚠️ **Kadrowanie kikuta kupuje się wtedy DYSTANSEM ADS, nie kątami**
    (decyzja użytkownika 2026-08-25). Ta poza wypychała ucięty koniec ramienia
    na ekran przy ADS (|ndc y| 0,89, 8 z 20 wierzchołków pierścienia widoczne).
    `adsPos.z` strzelby zjechało z -0.74 na -0.62 i kikut schodzi na 1,24.
    **Obraz przyrządów jest na to ODPORNY**: kropka ma `adsPos.x` 0 i takie
    `adsPos.y`, że siedzi NA osi kamery, a punkt na osi rzutuje się na środek
    z dowolnej odległości (zmierzone: NDC 0,0 przy -0.74, -0.70, -0.66, -0.62,
    -0.58, -0.54 i -0.50). Broń też nie zalewa kadru - jej własne pokrycie
    ekranu idzie 819 → 804 punktów próbki przez cały ten zakres, bo to, co się
    przybliża, to kolba, a tę i tak zbiera near plane.
    ⚠️ **Przestrojenie chwytu bojowego UNIEWAŻNIA chwyty przeładowania.**
    `shoulderHome` mierzy się na pozie spoczynkowej, a IK rozwiązuje względem
    niej - więc ramka `grips.port`/`grips.bolt` przemieciona pod poprzedni
    chwyt przestaje pasować. Przy strzelbie ta sama ramka po zmianie
    `fore`/`upper` skoczyła z 20° na 100° zgięcia. Po każdej zmianie `l`
    przemieć oba chwyty od nowa.
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
    przechodzą (pistolet 9,00, SMG 1,74, karabin 1,12, snajperka 4,14;
    karabin po przestrojeniu ramienia z 2026-08-25 ma 1,55 - patrz wyżej).
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
    ⚠️ **Magazynek wkłada się DWOMA nogami, nie po prostej** (`magSeat`
    w weapons.js, 2026-08-26, zgłoszenie użytkownika „przy wkładaniu
    magazynka jest moment, że przebija przez teksturę broni"). Prosta
    `low` → `mag` biegnie SKOŚNIE do osi magazynka: zmierzone na karabinie,
    ta droga wznosi się ze składową z −0,39, a bryła magazynka jest pochylona
    +0,13, więc górny przedni róg zamiata przez przednią ściankę gniazda.
    Teraz jest punkt pośredni pod gniazdem (na osi, `mag + magDrop × 0.45`)
    i ostatnie 38% okna to pchnięcie PROSTO PO OSI - żadnej nowej liczby per
    broń, bo `magDrop` już tę oś mierzy. Broń bez `magDrop` jedzie po staremu.
    ⚠️ **Wyciąganie ma tę samą wadę i wymaga lustrzanej poprawki** (`magPull`,
    2026-08-26 - użytkownik zgłosił to osobno, najpierw dla SMG, potem
    „to samo jest też w karabinie"). Magazynek najpierw idzie PROSTO W DÓŁ po
    osi, aż wyjdzie z gniazda, i dopiero potem odchodzi w bok.
    ⚠️ **Kryterium sprawdzania**: nie „czy tor jest równoległy do osi"
    (na drugiej nodze z definicji nie jest), tylko **czy magazynek jest
    jeszcze W GNIEŹDZIE, gdy zaczyna schodzić z osi**. Głębokość osadzenia
    mierzy się z geometrii: najniższy punkt komory NAD obrysem magazynka
    (SMG: mag do y +0,055 przy wylocie gniazda -0,005, czyli 0,060 m
    zanurzenia; karabin 0,030 m), a zejście po osi daje 0,45 × 0,25 =
    0,11 m - z zapasem. Po poprawce: cztery przypadki (dwie bronie × dwie
    strony) bez ani jednej klatki skrętu w gnieździe.
    ⚠️ **`CARRY_SHOULDER` - zejście barku w NOSZENIU, per broń** (weapons.js,
    2026-08-26). Jedyne pchnięcie barku, które NIE jest wygaszane wagą pozy,
    bo poza, którą naprawia, to stanie w miejscu. Powstało dla karabinu:
    jego ramię wsparcia niesie płytki dial użytkownika, kikut wchodzi w kadr,
    a zwykłe lekarstwo (przysunięcie broni do oka) jest dokładnie tym, co
    przepycha jego kolbę przez near plane. Bark kosztuje za to zero
    geometrycznie - IK trzyma pięść na chwycie (zmierzone: błąd 0,0000 m),
    a różnicę biorą stawy, tak jak przy `SPRINT_SHOULDER_TWEAK`.
    ⚠️ Bierz NAJPŁYTSZE zejście, które czyści pierścień, nie najgłębsze:
    ramię płaci za głębokość PROSTOWANIEM i za swoim optimum blokuje się na
    sztywno. Zmierzone na karabinie (łokieć przy ADS): −0.04 → 161°,
    −0.06 → 166°, −0.07 → 170°, −0.10 → 178° (zablokowany). Bieżące **−0.06**
    czyści pierścień z zapasem w obu pozach (|ndc y| 1,15 biodro / 1,29 ADS)
    przy łokciu 150/166°.
    ⚠️ Świadomie łamie to gwarancję „gra odtwarza pozę z DEVRIG kość
    w kość" - dla TEJ broni: edytor nie pokazuje kikuta (patrz
    `ARM_CARRY_REST`), więc dial, który w warsztacie wygląda dobrze, i tak
    potrafi powiesić uciętą kończynę na środku ekranu gracza.
    ⚠️ **To zejście obowiązuje TAKŻE w przeładowaniu** (2026-08-27):
    `applyReloadArms` liczy bark przez `carryShoulder`, nie przez samo
    `RELOAD_SHOULDER`. Przeładowanie robi się STOJĄC, czyli w pozie, dla
    której to zejście powstało, a jego brak wracał karabinowi pierścień
    kikuta na ekran na obu końcach animacji (6/20 wierzchołków, |ndc y| 0,86;
    zgłoszenie użytkownika: „w trakcie przeładowania karabinu widać kikut
    lewej ręki"). Po poprawce 0/20 i |ndc y| ≥ 1,15 przez całą animację.
    ⚠️ **Za to USTĘPUJE pozie, która przejmuje noszenie** (parametr `rest`
    w `carryShoulder`): bieg, cykl zamka i sama wymiana magazynka mają
    WŁASNE, dostrojone barki (`SPRINT_SHOULDER_TWEAK`, `BOLT_SHOULDER`,
    `RELOAD_SHOULDER`) i wszystkie były dobierane przy zerowym zejściu
    postojowym. Bez wygaszenia dołożenie zejścia po cichu przestawiłoby całą
    trójkę. Waga to `1 - max(bieg, cykl)` i `1 - waga danej dłoni`
    w przeładowaniu, więc na obu końcach przeładowania (dłoń jeszcze/znowu na
    broni) zejście jest pełne, a w środku go nie ma.
    ⚠️ **Snajperka dostała swój wpis 2026-08-27** i to jest wpis o ŁOKCIU,
    nie o kadrowaniu (zgłoszenie użytkownika, dwa razy zawężane: chwyt i to,
    że ręka jest wyprostowana, są OK; bieg i przeładowanie też są OK - źle
    wygląda POSTÓJ i podniesienie z niego, bo łokieć jest wygięty W LEWO
    zamiast w dół). Zmierzone w przestrzeni kamery na biodrze: łokieć siedział
    0,015 m NAD nadgarstkiem i 0,132 m w lewo od niego, czyli kończyna leżała
    wzdłuż lufy.
    ⚠️ Dlatego ten wpis NIE MA składowej do przodu, w przeciwieństwie do
    `BOLT_SHOULDER`: to pchnięcie do przodu zgina łokieć, a wyprostowane ramię
    jest tym, co użytkownik zatwierdził. Przy z = 0 staw mierzy 177,6° na
    każdej głębokości i sam OBRACA się wokół osi bark-nadgarstek, czyli robi
    dokładnie to, o co chodzi. Zmierzone (łokieć pod nadgarstkiem / w bok):
    −0.14 → 0,077/0,116 (nadgarstek 27,8), −0.22 → 0,117/0,109 (32,9),
    −0.30 → 0,151/0,102 (38,4), −0.38 → 0,178/0,095 (43,5),
    −0.46 → 0,199/0,087 (48,2), −0.54 → 0,216/0,080 (52,2) i pięść zaczyna
    schodzić z chwytu (0,005 m - luz `SHOULDER_LEAN_MAX` się kończy).
    ⚠️ **WPIS SNAJPERKI ZOSTAŁ USUNIĘTY 2026-08-27** - zgłoszony dwa razy
    z rzędu (przy -0,38 i przy -0,22) z tym samym zarzutem: gra nie wygląda
    jak podgląd DEVRIG. To jest zarzut ŚCISŁY i mierzalny, bo `CARRY_SHOULDER`
    jest jedyną tabelą, która świadomie odchodzi od edytora, a odchyłkę widać
    na NADGARSTKU. Zmierzone na biodrze, lewa dłoń: poza edytora (czyli to, do
    czego rozwiązuje się ramię przy zejściu 0 - macierz ciała jest tam
    jednostkowa) to **21,0° zgięcia i 180° skrętu**, a gra przy -0,22
    pokazywała **34,0° i 168,4°**. Trzynaście stopni, których edytor nie
    pokazuje, to dokładnie znaczenie zdania „coś jest poprzesuwane".
    To, co ten wpis kupował, jest prawdziwe, ale taniej kupuje się to gdzie
    indziej: przy zejściu 0 łokieć siedzi równo z nadgarstkiem (0,000 w dół
    przy 0,132 w bok) zamiast 0,123 w dół - a od tego jest PODPOWIEDŹ ŁOKCIA
    (`upper` we wpisie `l`), którą DEVRIG pokazuje i którą można dostroić
    suwakiem. Pierścienia kikuta nigdy to nie dotyczyło (0/20 na każdej
    głębokości, |ndc y| 1,34 przy zerze).
    ⚠️ **Wpis KARABINU zostaje** i to jest ta jedna rzecz, której edytor
    naprawdę nie umie pokazać: przy zerze pierścień kikuta wraca NA EKRAN
    (8/20 przy |ndc y| 0,83 wobec 0/20 przy 1,14), a kosztuje to 6° różnicy
    wobec podglądu. Wszystkie pozostałe cztery bronie zgadzają się z DEVRIG
    co do 0,0°.
    ⚠️ **Bierz NAJPŁYTSZE zejście, które przewraca łokieć, nie to o najlepszym
    stosunku.** Pierwszy wybór (−0.38) przestrzelił - użytkownik zgłosił
    nazajutrz, że ręka jest opuszczona za bardzo w dół i nie zgadza się
    z podglądem DEVRIG. To odczytanie jest ŚCISŁE, nie wrażeniowe: `CARRY_SHOULDER`
    to jedyna tabela, która świadomie odchodzi od pozy z edytora, a tym
    odejściem JEST przesunięcie barku - zmierzone w przestrzeni kamery,
    −0.38 wynosi staw 0,300 m od miejsca, które pokazuje podgląd. Bieżące
    **−0.22** to pierwszy wiersz, w którym łokieć siedzi bardziej W DÓŁ niż
    W BOK (0,123 przy 0,108, wobec 0,000/0,132 bez zejścia), i kosztuje
    0,202 m zamiast 0,300. Nadgarstek zostaje zielony w obie strony (34,0°
    tutaj, 44,5 przy −0.38), a pierścień kikuta nie ma tu nic do rzeczy: ta
    broń kadruje się na KAŻDEJ głębokości (0/20, |ndc y| 1,33 bez zejścia,
    2,46 tutaj). ADS też nie potrzebuje ani grama - bez zejścia łokieć wisi
    tam 0,107 pod nadgarstkiem przy 0,069 w bok, więc wada zawsze była
    wyłącznie w postoju.
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
    ⚠️ **Skręt siada na ŁAŃCUCHU KOŚCI SKRĘTU, nie na przedramieniu**
    (`twist` w `ARM_BONES`, `twistSegments` w `tools/gen_models.py`,
    2026-08-25). Rig `arms` NIE MA kości skrętu: łańcuch to `UpperArm →
    LowerArm → Hand`, a z 1048 wierzchołków ważonych do `LowerArm.L` tylko
    **80** miesza się z `UpperArm.L` - przejście przez łokieć jest prawie
    twarde. Naturalny chwyt wsparcia wymaga ~160° pronacji (poza bind ma obie
    dłonie płasko, wnętrzem w dół), więc cała ta pronacja siadała na tym
    jednym twardym stawie i zapadała łokieć w ostry klin. **DEVRIG nie kłamał**
    - jego czerwone 161° to poprawne ostrzeżenie, tylko nie dało się go
    posłuchać przy chwycie, który jest prawidłowy.
    Wypiek (`add_twist_bones`) wstawia więc kości skrętu NA przedramieniu:
    zerowa translacja, jednostkowa rotacja, więc w pozie bind leżą w tym samym
    miejscu i mają ten sam IBM; ostatnia z nich przejmuje `Hand` jako dziecko.
    Przepięcie nie rusza lokalnego transformu dłoni, więc **poza jest
    NIEZMIENIONA co do kości** (zmierzone: pozycje do 1e-7 m przy biodrze,
    kwaterniony do 1e-7) - zmienia się wyłącznie deformacja siatki.
    ⚠️ **To musi być ŁAŃCUCH, nie jedna kość.** Skinning liniowy uśrednia
    pozycje z kości, do których wierzchołek jest ważony, więc mieszanie dwóch
    kości daleko od siebie wokół wspólnej osi **ściąga wierzchołek DO tej osi**
    - klasyczny „candy wrapper". Przy jednej kości skrętu miesza się 0° ze
    161° i zmierzone na pozowanej siatce przedramię wsparcia traciło do **71%**
    promienia w połowie długości: klin znikał, a kończyna robiła się ostrzem.
    Łańcuch N kości, każda z 1/N obrotu, miesza tylko SĄSIADÓW, czyli 161/N°,
    a zapadnięcie idzie jak `cos(obrót / 2N)` (zmierzone, zgadza się co do
    dziesiątej procenta): 1 kość -71%, 3 kości -10,8%, **5 kości -3,9%**.
    Dodatkowa kość kosztuje jeden wpis w szkielecie i jeden kwaternion na
    klatkę, więc kupuje się zapas - dziś `twistSegments: 5`.
    Wagi to **NAMIOT, nie jedna rampa**: wygładzona (smoothstep) pozycja wzdłuż
    przedramienia wybiera parę sąsiednich kości i podział między nie, dzięki
    czemu mieszanie nigdy nie wychodzi poza jedno ogniwo. Limit **4 wpływów na
    wierzchołek** jest twardy, więc namiot wypycha część wierzchołków na 5 -
    najmniejsza waga leci i reszta jest renormalizowana; wypiek DRUKUJE, ile
    ich było (dziś 16 + 11, największa odrzucona waga 0,007), bo cichy limit
    objawiłby się jako zagadkowe załamanie zamiast jako liczba.
    W runtime `rollForearm` rozkłada obrót po równo na wszystkie ogniwa
    (`slerp` od jednostkowego) - obracają się wokół tej samej osi, więc obroty
    się składają i ogniwo k niesie k/N, a dłoń pod ostatnim niesie całość.
    `ARM_BONES.twist` to **PREFIKS**, nie nazwa: `twistChain()` zbiera kości
    numerowane od 1, więc liczba ogniw żyje wyłącznie w wypieku. Rig bez
    łańcucha (SENTINEL) jedzie po staremu - `twist` w `MODELS` jest opt-in.
    Pilnują tego asercje `rig: forearm twist chain carries the hand`
    i `rig: the roll is shared evenly down the twist chain`.
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
    ⚠️ **STRZAŁ PRZERYWA PRZEŁADOWANIE** (`cancelReload`, decyzja użytkownika
    2026-08-27): spust ma pierwszeństwo przed przeładowaniem. Bramka jest
    w `tryFire` i ma DWA warunki: **musi być nabój w komorze** (`w.mag > 0`) -
    na pustej broni nie ma czym strzelać, więc sekwencja jedzie dalej zamiast
    zamienić się w kliknięcie - **i spust musi być ŚWIEŻO wciśnięty**
    (`relTriggerHeld`).
    ⚠️ **Ten drugi warunek to „R bije trzymany LPM"** (doprecyzowanie tego
    samego dnia). Bez niego broń automatyczna z wciśniętym spustem kasowała
    przeładowanie w PIERWSZEJ klatce po `R`, więc zaczęcia przeładowania
    w ogóle nie dało się zobaczyć. `startReload` zapamiętuje więc, czy spust
    już jest wciśnięty; taki spust jest ignorowany do puszczenia
    (`updateWeapons` zeruje latch, gdy `firing` schodzi), a ponowne
    kliknięcie dalej przerywa - i o to chodzi w „LPM bije sam PROCES
    przeładowania".
    ⚠️ **PUSTA BROŃ NIE PRZEŁADOWUJE SIĘ SAMA** (ta sama decyzja): oba
    automatyczne wywołania `startReload` z `tryFire` zostały USUNIĘTE - to
    z gałęzi pustego magazynka ORAZ to po strzale, który magazynek opróżnił.
    Drugie było źródłem pętli przeładowanie-strzał, którą zgłosił użytkownik:
    przy trzymanym LPM broń przeładowywała się sama w tej samej klatce, w
    której wyszła jej amunicja, wracała do góry, znowu się opróżniała i tak
    w kółko, a gracz nie miał nic do powiedzenia. Zostaje `AudioSys.empty()`
    (suchy strzał) plus komunikat „wciśnij R" (`showDryMsg`).
    ⚠️ **Komunikat leci na STRZALE, który opróżnił magazynek**, nie na
    kliknięciu spustu w pustkę (doprecyzowanie użytkownika 2026-08-27): skoro
    nic nie przeładowuje się samo, to ta linia jest jedynym miejscem, z którego
    gracz się dowiaduje, że broń skończyła - zanim iglica kliknie na pustej
    komorze, to już stara wiadomość.
    ⚠️ Suchy strzał idzie **raz na pociągnięcie spustu** (`dryFired`, zerowany
    razem z latchem spustu w `updateWeapons`), a strzał opróżniający magazynek
    od razu ten latch ZAPALA: to pociągnięcie dostało już swoją odpowiedź -
    ostatni nabój - więc klik należy do NASTĘPNEGO. Broń automatyczna
    z trzymanym spustem klika więc raz, nie w pętli.
    ⚠️ Bot testowy (`testAutoAim` w testmode.js) musiał wobec tego dostać
    własne `startReload` - bez niego przebieg `?test=win` stawał na pierwszym
    pustym magazynku.
    ⚠️ **Style nabojowe ODDAJĄ to, co już weszło do rurki** (`relPlan.loaded`,
    liczone w zdarzeniu osadzenia naboju): tam ładuje się po jednym i tuba
    naboi nie zwraca. Style magazynkowe nie oddają nic - magazynek, który nie
    zasiadł, nie dał amunicji, a księguje ją wyłącznie `finishReload`.
    ⚠️ **Poza MUSI mieć drogę wyjścia - skasowanie jej w jednej klatce to
    teleport** (`relCancel`/`fadeReloadPose`): przerwana animacja rzuca bronią
    przez 0,42 rad, a ładującą pięścią przez pół metra w JEDNYM kroku. Dlatego
    plan zostaje jeszcze `REL_CANCEL_DUR` (0,12 s), zamrożony na ułamku, na
    którym padł strzał, a wszystko, co ta poza posiada - offsety broni, wagi
    dłoni, magazynek, zamek, łoże - jest skalowane do domu przez `relCancel`.
    Rekwizyty z pięści (zapasowy magazynek, nabój) gasną NATYCHMIAST - błysk
    wystrzału je kryje, a wynoszenie ich przez kadr w trakcie strzelania
    czytałoby się jak druga broń w ręce.
    ⚠️ Okno mieści się CELOWO wewnątrz martwej przerwy pompki i zamka
    (`PUMP_HOLD`/`BOLT_HOLD`, oba ~0,25 s), więc suw, który ten sam strzał
    właśnie zarezerwował, nigdy nie walczy z dogasającą pozą.
    ⚠️ **Poza broni przy przeładowaniu jest PER BROŃ** (`relGun` w `HANDS`,
    2026-08-21): wspólne „w górę i do środka" jest dostrojone pod pistolet,
    któremu gniazdo magazynka siedzi tuż pod linią celowania. Gniazdo SMG
    jest 0,14 m dalej w przód i 0,13 m niżej, więc bez własnej odchyłki cała
    wymiana grała się w prawym dolnym rogu, połowa za krawędzią (zmierzone:
    gniazdo NDC y -0,71, pięść dochodziła do -1,27). Z odchyłką gniazdo
    siedzi na -0,47, a najgłębszy zjazd ręki zostaje w kadrze.
    ⚠️ **`relGun` działa też dla stylu SHELL** (2026-08-25) - wcześniej
    gałąź nabojowa miała offsety wklejone na sztywno, więc strzelba (najdłuższa
    broń, przysunięta o 0,34) ładowała się okienkiem w PRAWYM DOLNYM ROGU:
    okno ładowania na NDC (0,46, -0,74), dłoń nigdy bliżej niego niż -0,91,
    a zjazd po nabój do -2,5 (czyli nabój POJAWIAŁ SIĘ dwa ekrany pod kadrem).
    ⚠️ Przy tak długiej broni to jest głównie **OBRÓT, nie przesunięcie**:
    kolba siedzi już przy biodrze za okiem, więc przesunięcie w lewo dość duże,
    żeby wyciągnąć okno z rogu, przeciąga tę kolbę przez ŚRODEK kadru jako
    ciemną płytę (zmierzone: kolba na NDC (-0,07, 0,08)). Obrót wyprowadza ją
    poza lewą krawędź i pokazuje bok komory - czyli robi to, co robi człowiek,
    który ładuje. Do tego 0,16 m OD oka: najdłuższa broń w grze potrzebuje
    miejsca, żeby się obrócić.
    ⚠️ `low` w stylu shell dostraja się **na DNIE wahnięcia**, bo dokładnie
    tam `buildReloadEvents` zapala prop naboju - dłoń widoczna w tym momencie
    „wyczarowuje" nabój na oczach gracza. Strzelba schodzi na NDC -1,10, tuż
    za krawędź (ten sam margines co wymiana magazynka w SMG).
    ⚠️ Przy okazji: gałąź shell/shellBolt ustawia teraz WSZYSTKIE sześć pól
    `_gp`. Wcześniej shell nie ruszał `ry`/`pz`, a shellBolt `rz`/`pz`, więc
    `_gp` (obiekt współdzielony) niósł resztki po poprzednim przeładowaniu.
    ⚠️ **Chwyt przeładowania to osobne dane, nie chwyt bojowy** (2026-08-19):
    opcjonalny blok `grips` we wpisie `HANDS` (`mag`/`bolt`/`port`) nadpisuje
    `channel`/`palm`/`curl`/`upper` na czas danej fazy, resztę dziedziczy
    po `l`. Bez tego dłoń jechała na magazynek z linią kostek ustawioną
    pionowo do ramy i palcami zaciśniętymi na niczym, a chwyt zamka jest
    90° od bojowego (kanał wzdłuż lufy) - żadne przesuwanie pięści tego nie
    nadrabia. Dostrojone są **Glock, SMG i strzelba** (2026-08-25: bez `port`
    dłoń jechała pod okno ładowania z linią kostek ustawioną wzdłuż
    nieistniejącego już łoża, a nabój - który wisi NA linii kostek, bo tak
    sadza propy `attachToFist` - kładł się w poprzek okna zamiast wchodzić
    w nie).
    ⚠️ **Strzelba potrzebuje też własnego `bolt`, choć dłoń wraca DOKŁADNIE
    tam, gdzie strzela** (`bolt` = `pos` co do znaku). To nie jest ta sama
    poza: `armBodyFix` trzyma bark na chwycie Z BIODRA, a `relGun` odwrócił
    broń o 0,45 rad i odsunął ją o 0,16 m, więc ramię sięga w poprzek
    i różnicę zjada nadgarstek. Dziedziczenie chwytu bojowego dawało tam
    86-94° zgięcia, własna ramka daje 8-17°.
    ⚠️ **Przy przeładowaniu „dziwnie wygięta dłoń" najczęściej NIE JEST
    nadgarstkiem** (strzelba 2026-08-25, trzy podejścia). Zmierz, zanim
    zaczniesz stroić ramkę: kąt między przedramieniem a kierunkiem palców
    wychodził 12-20°, czyli dłoń szła prosto z ramieniem, a odczyt DEVRIG-a
    zgadzał się z nim co do stopnia (**edytor nie kłamie**). Razi
    PRZEDRAMIĘ: przy pięści pod komorą i barku zakotwiczonym na chwycie
    z biodra łokieć wachluje w lewo (NDC x -0,36 przy -0,02 w pozie bojowej),
    ramię staje na 53° zamiast 2° i przedramię kładzie się przez cały dolny
    lewy róg jako szeroka blada płyta.
    ⚠️ **Pole hint tego nie naprawi** - przemiecione 7056 kombinacji, najlepsze
    co osiąga `grips.port`, to łokieć na NDC x -0,35. Jedyną dźwignią jest
    `RELOAD_SHOULDER` (ten sam mechanizm co przy wymianie magazynka w SMG,
    tylko w drugą stronę: w PRAWO i KU KAMERZE). Składowa `z` robi tu robotę,
    bo skraca przedramię perspektywą w wąską kolumnę; samo `x` tylko przesuwa
    płytę. Strzelba: `[0.18, 0, -0.10]`, łokieć schodzi pod dolną krawędź,
    pięść zostaje na oknie co do centymetra.
    ⚠️ **Na racku kończącym przeładowanie broń wraca do NORMALNEGO
    noszenia** (2026-08-27, zgłoszenie użytkownika: „po przeładowaniu jak
    ciągnie za pompkę, to powinien już ciągnąć trzymając strzelbę normalnie,
    a nie bokiem"). Przechył i odchylenie z `relGun` istnieją po to, żeby
    pokazać kamerze okno ładowania - nikt nie przeciąga pompki z bronią
    obróconą na bok. Styl `shell` mnoży więc swoje offsety przez dodatkowy
    czynnik gasnący od `win[1]` przez 0,12 animacji (`senv`
    w `applyReloadPose`), czyli tym samym oknem, którym dłoń wraca na łoże.
    Zmierzone: na t 0,72 broń ma jeszcze yaw 0,417 i roll −0,369, na 0,82
    (rack startuje na 0,81) jest już na zerze. Styl `shellBolt` jedzie po
    staremu - cykl zamka snajperki dzieje się z tyłu i przechył mu pomaga.
    ⚠️ **Strzelba NIE MA już ramek przeładowania** (decyzja użytkownika
    2026-08-25: „czemu w ogóle ją obracasz, zostaw tak jak trzyma się pompki,
    potem będziemy dostosowywać"). Blok `grips` zniknął, więc dłoń niesie
    chwyt bojowy przez całe przeładowanie i rusza się samą POZYCJĄ - dokładnie
    to, co robi każda broń bez tego bloku. Cztery przemiecione ramki po kolei
    odpadły na oko i to jest tu nauka, a nie liczby: sama optymalizacja
    nadgarstka tej pozy NIE ROZSTRZYGA. Historia pomiarów, żeby następna
    próba musiała je pobić: z anatomii 113-127° zgięcia; punktowane |zgięcie|
    36-60° PRZEPROSTU; punktowany znak zgięcia - przeprost wyleczony, ale całe
    odchylenie przeszło w zgięcie (+38°) i dłoń dalej była wykrzywiona w bok
    (czytała się „w lewo"); punktowane OBIE osie plus pochył ekranowy 10-18°
    i pochył w prawo - dalej czytało się jako wykręcone.
    ⚠️ **Prawdziwą przyczyną było `RELOAD_SHOULDER`, nie ramka dłoni**
    (zgłoszenie użytkownika 2026-08-25: „na cholerę przedramię i ramię zjeżdża
    w dół, zostaw ramię i bark zakotwiczone"). Wpis strzelby pchał bark w prawo
    i ku kamerze, żeby wypchnąć łokieć pod dolną krawędź - i był dostrojony pod
    ramkę `grips.port`, której już nie ma. Zmierzone z chwytem bojowym: z nim
    łokieć spadał 0,078-0,164 m poniżej pozycji z biodra, bez niego 0,025-0,098,
    a nadgarstek 91-93° kontra 54-55°. Łokieć i tak zostaje poza kadrem
    (NDC -1,40..-1,75). Wpis usunięty.
    ⚠️ Wniosek na przyszłość: **zanim zaczniesz stroić ramkę dłoni, zmierz,
    co się RUSZA** - bark, łokieć i nadgarstek w przestrzeni kamery, względem
    pozy z biodra. Bark stoi (±0,035 m), więc „ręka zjeżdża" znaczyło łokieć,
    a łokciem rządzi pchnięcie barku i podpowiedź `upper`, nie orientacja dłoni.
    ⚠️ **Klatki, na których dłoń jest poza kadrem, do oceny NIE LICZĄ.**
    W cyklu ładowania pięść zjeżdża po kolejny nabój do NDC y -1,2..-1,6.
    Do punktowania bierz tylko klatki z |ndc y| < 1.
    ⚠️ **Kotwica `port` strzelby siedziała W KABŁĄKU SPUSTU** (zgłoszenie
    użytkownika 2026-08-25: „ładuje slugi w spust"). Spód komory zmierzony
    przy osi symetrii ma dołek do y +0,007 na z +0,14 i trzyma go do z +0,22 -
    **ten dołek TO kabłąk**, a stara kotwica stawiała żywą pięść na z +0,145,
    czyli w jego środku. Okno ładowania jest PRZED nim, ale tam komora siedzi
    ~0,08 WYŻEJ, więc sam ruch do przodu zostawia dłoń w powietrzu pod bronią
    (sprawdzone na zrzucie): trzeba ją podnieść mniej więcej o tyle, o ile
    jedzie do przodu. Dziś żywa pięść jest na (0,002, 0,070, 0,079).
    ⚠️ **Offset zamrożona-kotwica → żywa pięść jest własnością CHWYTU** i ten
    chwyt był od tamtej pory przestrajany: zmierzony dziś wynosi
    (-0,0250, +0,0103, +0,0068), a nie (0,0235, -0,0051, 0,0176) z komentarza
    w kodzie. Mierz go za każdym razem, nie przepisuj.
    ⚠️ **Powrót na łoże po ostatnim naboju to PRZEJAZD, nie teleport**
    (zgłoszenie użytkownika 2026-08-25: „ręka nagle przeskakuje na pompkę").
    Ostatni cykl zostawia pięść na dole (`low`), a gałąź racka wpisywała
    `bolt` wprost, czyli przerzucała ją 0,49 m w jednej klatce. Teraz jedzie
    `lerp3(low → bolt)` przez 0,10 animacji, a skok pompki czeka za tym
    (0,81..0,95). ⚠️ **Okno dobiera się PRĘDKOŚCIĄ, nie na oko**: mierzy się
    największy krok pięści na klatkę przez całe przeładowanie i patrzy, czy
    któraś klatka odstaje od reszty. Przy 0,07 powrót robił 0,199 m przy
    0,133 m wahnięcia cyklu - i to widać. Dziś kroki są jednorodne
    (0,160-0,165). Przy okazji rampa startowa wróciła na `vmEase(t, 0.02, w0)`
    - zwężenie do 0,01..0,09 było uzasadnione ramką `grips.port`, której już
    nie ma, a samo w sobie robiło z zanurkowania szarpnięcie.
    ⚠️ **Pozy przeładowania nie da się obejrzeć wymuszając ją z konsoli** -
    zrzut ekranu wyzwala klatkę, `tick` przelicza pozę z `reloadTimer`
    i wymuszenie znika. Trzeba PRZYPIĄĆ `reloadTimer` w pętli `rAF`.
    ⚠️ **Każda faza MUSI ustawić wagę OBU dłoni - brak wpisu to teleport**
    (snajperka 2026-08-26, zgłoszenie użytkownika „po zapakowaniu naboi ręka
    teleportuje się z powrotem na chwyt i zamek"). Gałąź zamka w stylu
    `shellBolt` w ogóle nie dotykała `lw`, więc lewa dłoń - którą ostatni
    cykl ładowania zostawia NA PEŁNEJ wadze w dole (`low`) - wracała na łoże
    w JEDNEJ klatce. Druga połowa tej samej usterki: `rw` jechało
    `vmEase(t, 0.66, 0.76)`, czyli od ułamka SPRZED początku gałęzi (w1 =
    0,70), więc prawa dłoń pojawiała się na zamku od razu z wagą 0,5.
    **Wszystko, co keyframujesz w tej gałęzi, keyframuj względem `w1`.**
    ⚠️ **Teleport wykrywa się PRĘDKOŚCIĄ, nie okiem**: przemieć przeładowanie
    stałym krokiem i porównaj największy skok pięści na krok z medianą TEGO
    SAMEGO przemiatania. Uwaga na aliasing - krok 0,03 na cyklu ładowania
    (który sam trwa 0,19) daje fałszywe 0,365 m. Przy kroku 0,008 wyszło:
    przejście 0,102 m/krok przy 0,102 wewnątrz zwykłego cyklu, czyli skok
    nieodróżnialny od normalnego wahnięcia - i to jest kryterium.
    Broń bez `grips`
    jedzie po staremu, samą pozycją - dziś to tylko strzelba (decyzja
    użytkownika 2026-08-25). Od 2026-08-26 karabin ma `grips.mag`/`bolt`
    (magazynek w pięści + boczny chwyt rączki), a snajperka `grips.port`
    (nabój od LEWEJ strony komory) i `grips.boltR` - PIERWSZY chwyt PRAWEJ
    dłoni: gałąź shellBolt w `applyReloadPose` i cykl po strzale przekazują
    go przez `rgA`/`_boltTarget`. Kotwice (`mag`/`low`/`bolt`) liczy się
    z geometrii (`tools/gen_models.py --probe`), a `low` NIE może być dalej
    niż sięga ramię - IK zatrzyma dłoń w powietrzu zamiast wyprowadzić ją
    poza kadr.
    ⚠️ **Naboje wchodzą OD TYŁU** (2026-08-27, decyzja użytkownika:
    „naboje powinny być pakowane od tyłu, tam gdzie postać potem ciągnie za
    zamek"). ⚠️ **Samo przesunięcie kotwicy tego NIE załatwia** - pierwsze
    podejście tego dnia postawiło pięść przy rączce zamka (z 0,241 → 0,293),
    ale zostawiło chwyt celujący nabojem w +x, czyli w lewą flankę komory,
    i `feed` pchający go tą samą drogą. Gracz dalej widział nabój wchodzący
    BOKIEM, tyle że z tyłu broni (zgłoszenie użytkownika, tymi słowami).
    Stacja mówi, SKĄD przychodzi ręka; „od tyłu" mówi, DOKĄD celuje nabój
    i w którą stronę jedzie. Dziś żywa pięść startuje na (-0,038, 0,100,
    0,380) - szerokość dłoni za rączką zamka i na wysokości górnego lica
    komory - a `feed` to CAŁY wektor stamtąd do wlotu komory
    (-0,017, 0,085, 0,265): 0,118 m pchnięcia do przodu zamiast 35 mm.
    Kanał to ten sam wektor znormalizowany, więc nabój leży wzdłuż własnej
    drogi i wchodzi czubkiem naprzód.
    ⚠️ **To ODWRACA notatkę „NIE celuj kanałem w komorę"**, która stała tu
    jeden dzień. Skrót perspektywiczny jest prawdziwy i jest tu po prostu
    ceną: rozpiętość ekranowa naboju spada 0,128 → 0,058 NDC w trakcie
    wkładania, wobec płaskich 0,17 bokiem. Odkupuje to ruch i widoczność -
    łuska wychodzi teraz spod rękawicy (5-6 z 9 próbek w trakcie pchnięcia
    wobec 4 bokiem), a oko śledzi PRZEJAZD 0,118 m, nie statyczny pasek.
    Nie „naprawiaj" rozpiętości obracając nabój z powrotem w poprzek broni -
    to jest właśnie wkładanie bokiem, odrzucone z nazwy.
    ⚠️ Uczciwego ładowania GÓRĄ dalej nie da się pokazać: w przekroju
    z 0,14-0,30 komora zajmuje y od -0,02 do +0,09, a luneta zamyka górę od
    y +0,10. Z tyłu miejsce jest, nad komorą go nie ma.
    ⚠️ **`feed` (2026-08-27) to dosunięcie naboju**: pięść po dojściu do
    `port` przepycha go wzdłuż kanału i dopiero na KOŃCU tego ruchu rekwizyt
    gaśnie (zdarzenie na ct 0,62 zamiast 0,5). Wcześniej nabój znikał
    w momencie, w którym dłoń dochodziła do komory, więc gracz nigdy nie
    widział, żeby jakiś do niej wszedł (zgłoszenie użytkownika: „dodaj nabój
    wkładany przez postać"). Gałąź jest opt-in po polu `feed`, więc strzelba
    jedzie po staremu.
    ⚠️ **Rolkę chwytu i podpowiedź łokcia trzeba przemieść od nowa po każdej
    takiej zmianie.** Przy tej stacji rolka 135° daje kciuk na wierzchu
    (czubek 0,099 nad nadgarstkiem w przestrzeni kamery; 0° i 45° wieszają go
    pod dłonią), a `upper` az −60 / el −30 zbija nadgarstek z 50° na 15,7°
    i trzyma 21-32° przez całe pchnięcie. Skręt przedramienia idzie za to
    159-177°, i to jest cena naboju celującego do przodu na tym rigu - to samo
    pasmo, w którym ta ręka siedzi w zwykłym noszeniu tej broni (161-180),
    rozłożone na 5-ogniwowy łańcuch skrętu.
    ⚠️ **Nabój wisi CZUBKIEM w dziurze pięści, a łuska wystaje z niej do
    tyłu** (`hold = -slen / 2` w `attachHandsAndProps`), i to nie jest
    stylizacja: pięść ma wzdłuż linii kostek ~80 mm, więc nabój WYŚRODKOWANY
    na dziurze jest przez nią połknięty w całości (zmierzone: ani jedna
    próbka nie wychodziła spod rękawicy przy żadnej długości). Zmierzone
    wzdłuż kanału od pięści: rękawica zakrywa −0,025 do +0,075, a wszystko od
    −0,05 w tył jest czyste. Przy okazji tak właśnie trzyma się nabój, który
    za chwilę wpycha się do komory. Dlatego też `shellDim` urosło z 60 na
    80 mm.
    ⚠️ **Widoczność rekwizytu mierz RAYCASTEM, nie okiem** - i odfiltruj
    trafienia w sam rekwizyt (promień do jego OSI trafia najpierw w jego
    własną ściankę i sonda melduje „zasłonięty" zawsze). Bieżące: 3-4 z 9
    próbek widoczne od ct 0,25 do 0,58 każdego cyklu.
    ⚠️ **Chwyt `port` snajperki jest OD LEWEJ, i to nie jest wybór stylu,
    tylko wymuszenie geometrii** (2026-08-26). Przekrój przez komorę
    (z 0,14-0,30) mówi: komora zajmuje y od -0,02 do +0,09 i x od -0,033 do
    -0,001, a LUNETA zamyka górę od y +0,10 - zostaje 1 cm szpary, więc
    ładowania górą po prostu nie da się pokazać, cokolwiek robi prawdziwy
    zamek. Lewa flanka jest przy tym tą, którą widzi kamera (broń jest
    noszona na prawo od oka). Nabój (`shellProp`) jedzie na `vmMatOrange` -
    na `vmMatMid` 7-milimetrowy walec był niewidoczny na tle komory.
    ⚠️ **Kotwice `port`/`low` trzeba PRZELICZYĆ po każdym przestrojeniu
    chwytu `l`** - są w przestrzeni ZAMROŻONEJ kotwicy, a offset
    zamrożona→żywa jest własnością chwytu. Po dialu użytkownika ładująca
    pięść wylądowała NA WIERZCHU komory (0,001, 0,097, 0,224) z nadgarstkiem
    zgiętym 129° i łokciem zablokowanym na 178° - stąd „ładuje ammo chuj wie
    gdzie" i „ręka wygięta nienaturalnie". Po przeliczeniu: 13° nadgarstka,
    44° skrętu, 76° łokcia.
    ⚠️ **Rolka dłoni wokół osi chwytu to osobna decyzja od kierunku naboju**
    (2026-08-26, „obróć jeszcze dłoń lewą w trakcie przeładowania"). Kanał
    dalej celuje w komorę, więc nabój wskazuje tam, gdzie wskazywał - obraca
    się sama dłoń. Przemiatając rolkę **przeliczaj kotwicę przy każdym
    kroku** - offset zamrożona→żywa obraca się razem z chwytem, więc bez tego
    porównuje się dwie różne POZYCJE, a nie dwa obroty.
    ⚠️ **Dokręcona o kolejne 90° tego samego dnia: „kciuk na górze"**
    (zgłoszenie użytkownika: dłoń przy wkładaniu naboi jest nienaturalnie
    wykrzywiona). Dotychczasowe 270° kładło dłoń PŁASKO grzbietem do góry,
    czyli z kciukiem POD nią - to była ta wykrzywiona rękawica.
    ⚠️ **Którędy jest „w lewo", rozstrzyga POMIAR, nie znak kąta**: mierz
    czubek kciuka względem nadgarstka w przestrzeni KAMERY i bierz tę rolkę,
    która go podnosi. Zmierzone co 45° (y kamery): 270° -0,052 (kciuk pod
    dłonią), 180° -0,093, 315° +0,035, **0° (= 270 + 90) +0,105** - jedyny
    kandydat z kciukiem wyraźnie na wierzchu i dokładnie żądane 90°. Stawia
    pięść na sztorc, z kciukiem nad nabojem.
    ⚠️ **„Obróć dłoń" i „obróć rękę" to DWIE RÓŻNE OSIE i tylko jedna z nich
    jest do zapłacenia** (2026-08-27, zgłoszenie użytkownika: „obróciłeś rękę,
    a chodziło mi o dłoń"). Rolka wokół KANAŁU (linii kostek) obraca dłoń
    wokół osi, która leży 0,115 m OBOK nadgarstka, więc jest to obrót bryły
    sztywnej wokół osi zewnętrznej: albo pięść zostaje na komorze i wtedy sam
    NADGARSTEK jedzie 0,23 m (z NDC y -0,89 na +0,11, czyli przedramię
    wchodzi nad komorę i zalewa pół kadru; nadgarstek 116° na dnie pełnego
    przemiecenia az/el, nabój 1/9), albo nadgarstek zostaje i wtedy pięść
    schodzi z komory (0,15 m w lewo, 0,18 m w dół). Trzeciej możliwości nie
    ma - to geometria, nie dial.
    Osią, która obraca SAMĄ DŁOŃ, jest **kierunek palców** (lokalne +Y kości
    dłoni - dokładnie to, co DEVRIG nazywa „obrotem dłoni"): przechodzi przez
    nadgarstek, więc ramię zostaje na miejscu, a LINIA kanału się nie rusza -
    zmienia się tylko jej ZNAK. Zmierzone wobec poprzedniego diala:
    nadgarstek 24-40° (było 16-26), skręt przedramienia 25-30° (było 159-177,
    czyli cały łańcuch skrętu przestał być potrzebny), łokieć i pierścień
    kikuta bez zmian (0/20, |ndc y| 1,71-1,82), kciuk dalej nad nadgarstkiem
    (+0,059), a nabój WIDOCZNIEJSZY: 7-9/9 próbek zamiast 5-6/9, bo
    odwrócona rękawica zakrywa mniej łuski.
    ⚠️ Po takim obrocie **odbij nabój końcami** (`hold`, stożek i korpus
    naraz - `attachHandsAndProps`): kanał zmienił znak, więc bez tego nabój
    wchodzi do komory DNEM naprzód. Odbity ląduje w tym samym miejscu
    w przestrzeni co przed obrotem, czubkiem w dziurze pięści.
    ⚠️ Kotwice `port`/`low` przeliczaj jak przy każdej zmianie chwytu - tu
    rozwiązane wstecz na te same dwa punkty żywej pięści co przedtem (błąd
    1e-5 m), więc droga naboju do komory jest obrotem NIETKNIĘTA.
    ⚠️ **Rolkę płaci NADGARSTEK, a rachunek przenosi się na PODPOWIEDŹ
    ŁOKCIA**: `upper` celuje przedramieniem, a zgięcie nadgarstka to dłoń
    mierzona WZGLĘDEM przedramienia, więc jedno wymienia się na drugie. Na
    starej podpowiedzi ta rolka kosztowała 79° (tuż pod czerwonym); po
    przemieceniu azymutu i wzniosu dno wypada na 66-67° przy az 195-210 i
    el -45. Wtedy wychodziło 67° nadgarstka, 62° skrętu, 99° łokcia
    (bieżące, po obrocie dłoni: 24-40° / 25-30° / 52-84°); pierścień kikuta
    czysty w obu wersjach (0/20).
    ⚠️ **Cena jest w ZJEŹDZIE po nabój, nie przy oknie**: nadgarstek rośnie
    monotonicznie z zejściem dłoni (zmierzone pasmami NDC: -0,4 → 67°,
    -0,6 → 73°, -0,8 → 80°, -1,0 → 89°). Liczy się okno ładowania; zjazd
    idzie za dolną krawędź. Skracaniem `low` się tego nie kupi - przysunięcie
    go do kamery zbija szczyt raptem z 86° na 75°, za to wywala pięść na
    NDC -2,2, czyli w błąd, który ten anchor już raz miał.
    ⚠️ **Zjazd `low` też był poza zasięgiem ramienia**: pięść leciała na
    NDC (1,34, -3,87), czyli przez PRAWY dolny róg dwa ekrany w dół,
    z łokciem 178° - to jest IK dociskające dłoń do nieosiągalnej kotwicy,
    a nie poza. Dziś (0,26, -1,27), tuż za krawędzią, przy 40° nadgarstka
    i 80° łokcia. Przy okazji cały cykl ładowania zwolnił z 0,102 na
    0,039 m/klatkę, bo droga jest krótsza.
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
    ⚠️ **Wyjęty magazynek ma na wierzchu NABÓJ** (2026-08-27, zgłoszenie
    użytkownika: „w wyjmowanym magazynku glocka widać nabój elegancko u góry,
    ale w SMG i karabinie już nie"). Glock wozi swoje naboje we własnej
    geometrii (materiał `Bullet`, cztery grupy w węźle magazynka), a bronie
    Quaterniusa mają magazynek WYCIĘTY ze wspólnej siatki (`split`), więc
    z gniazda wyjeżdżał goły klocek. `vmRound(parent, r, len, x, y, z)`
    w weapons.js dokłada im nabój (walec + ogiwa, `vmMatOrange`, czubkiem
    w −Z) doczepiony do CZĘŚCI magazynka, więc jedzie z nią przez całą
    wymianę, a w gnieździe siedzi głęboko w komorze i go nie widać. Rozmiary
    z górnego lica wyspy: SMG y 0,0549 x ±0,0144 z[-0,1657 -0,1062] (nabój
    48 mm), karabin ma magazynek modelowany PŁYCEJ - kolumna kończy się na
    y 0,0309 przy z[-0,0058 +0,009], czyli 15 mm głębokości - więc jego nabój
    ma 24 mm i jest dobrany do modelu, a nie do prawdziwego 5.56.
    ⚠️ **PUSTY magazynek wyjeżdża BEZ naboju** (`setMagLoaded` w weapons.js,
    2026-08-27, zgłoszenie użytkownika: nabój na wierzchu jest w porządku,
    dopóki w magazynku coś jest, ale nie na wyciąganym pustym). Steruje tym
    `applyReloadPose` jako CZYSTA FUNKCJA ułamka `t` (żadnego zdarzenia -
    przerwane przeładowanie i tak by je zgubiło): przeładowanie taktyczne
    (`w.mag > 0`) trzyma nabój przez całą animację, a puste chowa go na drogę
    W DÓŁ i przywraca na drogę W GÓRĘ, bo wracający magazynek jest z definicji
    świeży. ⚠️ **Przełączenie musi wypaść na DNIE wahnięcia** (środek martwej
    przerwy `T.out[1]`..`T.back[0]`) - to jedyny moment, w którym pięść jest
    poza kadrem (po to `low` w ogóle zjeżdża z ekranu), więc podmiany nie da
    się zobaczyć. Zmierzone na najwyższym wierzchołku naboju w klatce
    przełączenia: pistolet |ndc y| 1,49, SMG 1,72, karabin 1,03 - karabin ma
    najcieńszy zapas, bo to jego magazynek jest najpłycej pod krawędzią.
    ⚠️ Nabój Glocka to **GRUPY MATERIAŁOWE, nie obiekt** (`Bullet*` w części
    `mag`), więc nie ma czego chować - `bakedRounds()` zapamiętuje indeksy
    grup, a `setMagLoaded` podmienia im materiał na `vmMatHidden`
    (`visible: false`): renderer pomija grupę, której materiał jest
    niewidoczny. Tablica materiałów jest per instancja (`mats.map` w
    modelkit.js), więc podmiana nie dotyka innych broni. `clearReloadVisuals`
    przywraca nabój, czyli zmiana broni i każdy reset wracają do pełnego
    magazynka. Dwie pozostałe grupy `Bullet` siedzą w części `body` (nabój w komorze)
    i celowo NIE są ruszane.
    ⚠️ **Sam schowany nabój ODSŁANIA DZIURĘ w magazynku Glocka** (zgłoszenie
    użytkownika 2026-08-27: „pusty magazynek wygląda na niedorobiony/
    przezroczysty w jednym miejscu"). Ten magazynek jest wymodelowany jako
    OTWARTA RURA - zmierzone sondą w dół wlotu: szczyty ścianek na y 0,0179,
    a pod nimi 30 mm pustki - i to naboje ją zatykały. Dlatego wpis dostał
    **PODAJNIK** (`magFollower`, zwykły `vmBox` na `vmMatMid`), który
    pokazuje się dokładnie wtedy, gdy naboje gasną - czyli tam, gdzie
    prawdziwy podajnik staje po ostatnim naboju. Rozmiar z wnętrza wlotu na
    wysokości płytki: ścianki boczne x ±0,0115, przednia i tylna z 0,0545
    i 0,0965 → płytka 0,022 × 0,005 × 0,037 na (0, 0,0095, 0,0755), czyli
    6 mm pod krawędzią wlotu. Magazynki SMG i karabinu to LITE bryły (wyspy
    ze `split`) - sprawdzone, nie mają czego zatykać.
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
    ⚠️ **Karabin dostał taki wpis 2026-08-27 i został cofnięty tego samego
    dnia** (zgłoszenie: lewa ręka przy przeładowaniu ma być bardziej po lewej;
    zaraz po nim: „koniec barku zostaw w jednym miejscu, u człowieka bark się
    nie przemieszcza"). I to jest lekcja: **`RELOAD_SHOULDER` PRZESUWA STAW**,
    a nie tylko obraca kończynę, więc wygaszany wagą dłoni jeździ nim przez
    całą animację. Zmierzone na karabinie: bark przechodził 0,199 m przez
    przeładowanie zamiast 0,099 bez wpisu. Jeśli chodzi o to, żeby ramię
    wyglądało bardziej z lewej, dźwignią jest podpowiedź łokcia (obrót
    w stawie), nie tabela barku.
    ⚠️ **PRZENIKANIE mierz PRZECIĘCIEM KRAWĘDZI, nie wierzchołkami w środku**
    (2026-08-27, zgłoszenie: kolba karabinu przenika przez ramię
    i przedramię). Sonda licząca wierzchołki RAMIENIA wewnątrz bryły broni
    zameldowała „przedramię 0, ramię 0" i **skłamała**: płyta przechodząca
    przez kończynę nie ma tam ani jednego wierzchołka - kolba tnie skorupę
    przedramienia, a żadna z siatek nie wkłada wierzchołka do drugiej.
    Uczciwy test przechodzi KRAWĘDZIE siatki ramienia i pyta, czy leży na nich
    powierzchnia broni: wyszło 9 przecięć na prawym przedramieniu przez całą
    wymianę magazynka wobec 0 w zwykłym noszeniu - czyli wpychał ją tam OBRÓT
    broni z `relGun`. Licz tylko przecięcia, których punkt jest W KADRZE
    (`cam.z < -0.08` i |ndc| < 1); reszta jest za krawędzią i nikogo nie boli.
    Lekarstwem był odkręcony yaw karabinu (`relGun.rot[1]` 0.10 → -0.08):
    przemiecione, +0.10 → 9 przecięć, 0.00 → 4, **-0.08 → 0** i głębiej też 0.
    Najpłytsze, które czyści, jest tu zarazem najtańsze dla LEWEJ ręki
    (nadgarstek 68 → 73 → 80° w miarę pogłębiania) i prawie nie rusza gniazda
    magazynka na ekranie (NDC -0,06 → -0,04). Ramienia (upper) nie przecinało
    nic przy żadnym ustawieniu; zostają przecięcia PALCÓW z rękojeścią, które
    są tak samo w zwykłym noszeniu (16) i są zwykłą zaciśniętą pięścią.
    ⚠️ **Bark w przeładowaniu ma stać** (2026-08-27): `applyReloadArms`
    ustawia `pinShoulder` na obu dłoniach, co wyłącza `SHOULDER_GIVE`
    (jechał stawem do 0,10 m za dłonią), a `rest` w `carryShoulder` jest
    teraz **1 na płasko**, nie `1 - waga dłoni` - zejście postojowe
    (`CARRY_SHOULDER`) opisuje pozę człowieka STOJĄCEGO, a przeładowanie robi
    się stojąc od pierwszej do ostatniej klatki; wygaszanie go pod wymianą
    bujało stawem dokładnie o jego własną głębokość (karabin 0,06 m).
    Zmierzone po obu poprawkach: przejazd barku karabinu **0,0000 m**,
    a pierścień kikuta schodzi z ekranu (8/20 przy |ndc y| 0,82 → 0/20 przy
    1,11); snajperka 0,203 → 0,049 m i nadgarstek 61° → 40°. Pistolet, SMG
    i strzelba wychodzą co do cyfry tak samo - tabele się nie pokrywają
    (`CARRY_SHOULDER`: karabin i snajperka, `RELOAD_SHOULDER`: SMG).
    ⚠️ **Przypięcie barku UNIEWAŻNIA chwyty dostrojone przy give** - tak samo
    jak przestrojenie chwytu bojowego unieważnia chwyty przeładowania. Faza
    rączki zamka karabinu sięgała po nią z barku o 0,06 m niżej i płaciła
    nadgarstkiem: 77° → 105,6° na t 0,74. Przemiecenie podpowiedzi łokcia
    `grips.bolt` (na pion, lekko w lewo: `[-0.25, -0.866, 0.433]`) zbija to
    do 33,6° przy odblokowanym stawie - i przy okazji ciągnie łokieć na
    x kamery -0,18, czyli w tę samą stronę, o którą chodziło w zgłoszeniu
    „ręka bardziej po lewej". Po całości najgorszy łokieć karabinu to -0,032
    (czyli już nie przechodzi na prawo od osi), a nadgarstek na klatkach
    z dłonią W KADRZE nie przekracza 45°.
    ⚠️ Zostaje `SHOULDER_LEAN_MAX` - dochylenie, gdy kotwica jest DALEJ, niż
    sięga ramię (pistolet 0,099 m, SMG 0,157). To nie jest to samo co give:
    tam staw jechał zawsze, tu tylko wtedy, gdy inaczej dłoń oderwałaby się
    od celu.
    Pudełko w pięści (`magProp`/`magDim`) to zastępczy magazynek dla broni,
    której model nie ma odłączalnego - od 2026-08-26 ŻADNA broń go nie
    używa: karabin dostał własny wycięty magazynek (`split` w wypieku)
    i `magSwap: true` jak pistolet i SMG. Ścieżka pudełka zostaje w kodzie
    jako fallback dla przyszłej broni bez odłączalnego magazynka.
    ⚠️ **Przeciąganie zamka karabinu jest BOCZNE, nie znad broni**
    (2026-08-26): chwyt znad komory (jak przy zamku Glocka) stawiał pięść na
    NDC (0,32, 0,05) - środek ekranu - a całe przedramię kładło się w poprzek
    kadru jako blada płyta. Kotwica `bolt` [-0.055, 0.10, 0.10] + ramka
    boczna SMG (kanał wzdłuż lufy, grzbiet dłoni w lewo-górę) trzymają dłoń
    OBOK komory. Karabin ma też własny `relGun` (studnia magazynka siedzi
    niżej i dalej niż u pistoletu) - zjazd `low` mierzony: pięść NDC -1,36,
    góra magazynka -1,06, czyli poza kadrem jak u SMG.
    ⚠️ Kotwice `mag`/`low` karabinu są od razu ŻYWĄ pięścią (`byFist` przez
    `magSwap`), więc czyta się je wprost z geometrii magazynka - bez
    doliczania biasu, którym pistolet przeliczał stare liczby.
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
    ⚠️ To zdanie było PRAWDZIWE tylko dla magazynka - **cylinder naboju nie
    był obracany do 2026-08-25**. Nabój leżał więc w poprzek pięści i czytał
    się jak kikut wystający z wierzchu rękawicy, a przy okazji przeczył całemu
    sensowi chwytu `port`, którego zadaniem jest wycelować tę dziurę w okno
    ładowania. Dotyczyło strzelby i snajperki.
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
    ⚠️ **Bark w biegu jedzie też W DÓŁ** (`SPRINT_SHOULDER_TWEAK`,
    2026-08-25, zgłoszenie użytkownika: „bieganie - dziwnie zgina się
    w łokciu, zamiast iść w dół w barku"). Wspólne pchnięcie miało `y` = 0,
    czyli bark nie schodził ANI TROCHĘ, a broń w biegu spada ~0,21 m - więc
    cały ten zjazd płaciło PROSTOWANIE ramienia. Zmierzone na strzelnicy: łokieć
    strzelby stał na **177,6°**, czyli kończyna zaryglowana na sztywno, przy
    156,8° tej samej ręki na biodrze. Oddanie zjazdu barkowi wraca luz stawom:
    177,6 → 158,0 (czyli dokładnie tyle, ile ma poza biodra), skręt
    przedramienia 179 → 167, nadgarstek 44° → 12°, a przedramię schodzi
    z dolnej krawędzi kadru (231 → 25 widocznych wierzchołków) - to ta blada
    płyta sprawiała, że kończyna czytała się jako wygięta.
    ⚠️ **Głębiej NIE jest lepiej, i to w obie strony**: za swoim optimum ramię
    kończy się z drugiej strony i znowu blokuje na prosto (strzelba wraca na
    177,6 przy -0,32), a odchylenie nadgarstka przeskakuje ze zgięcia
    w przeprost na innej głębokości dla każdej broni - snajperka przechodzi
    na -0,08, więc nie da się jej dać liczby strzelby. Dlatego tabela jest
    PER BROŃ, jak `SPRINT_TWEAK` i `RELOAD_SHOULDER`. Pistolet zostaje bez
    wpisu: obie dłonie ma na chwycie, ramię wsparcia nigdy nie sięga, a jego
    przedramię i tak jest poza kadrem (3 wierzchołki).
    ⚠️ **Karabin dostał swój wpis 2026-08-26** (zgłoszenie użytkownika:
    „podczas biegu z karabinem lewy kikut jest widoczny i brzydko schodzi,
    powinien schodzić niżej") - dokładnie ta sama usterka co u strzelby
    i to samo lekarstwo, odkąd jego ręka wsparcia niesie płytki dial.
    Zmierzone przez wahnięcie biegu (zejście → zapas pierścienia / łokieć):
    brak → 1,08 i zablokowane 178°, −0.08 → 1,37/178, −0.14 → 1,68/178,
    −0.20 → 2,03/162, **−0.26 → 2,34/146**, −0.32 → 2,66/140. Łokieć
    odblokowuje się dopiero od −0.20; −0.26 stawia go na 146°, czyli tam,
    gdzie ta sama ręka siedzi przy biodrze (149°) - kończyna czyta się
    w biegu tak samo jak na stojąco.
    ⚠️ **Snajperka dostała swój wpis tego samego dnia** (zgłoszenie: „podczas
    biegu ze snajperką widać kikut, niech ręka będzie niżej"). Uwaga na to,
    co się tu NIE poprawia: jej dłoń wsparcia siedzi daleko na lufie, więc
    ramię jest w biegu na pełnym wyproście niezależnie od barku - łokieć
    mierzy zablokowane 178° przy KAŻDYM zejściu, a dłoń trzyma się chwytu
    tylko dzięki `SHOULDER_LEAN_MAX`. Zejście kupuje wyłącznie kadrowanie
    i kupuje go dużo: pierścień 1,07 (ledwo za krawędzią - dlatego dalej
    czytał się jako widoczny) → 1,48 przy −0.10, 1,94 przy −0.18,
    **2,45 przy −0.26**. Wyrównane do dwóch pozostałych długich broni.
    ⚠️ **Ile broni widać w biegu, mierz LICZNIKIEM, nie zrzutem** - ciemna
    broń na ciemnej arenie potrafi wyglądać na „zniknęła", gdy jest w kadrze.
    Zmierzone po tej zmianie (wierzchołki bryły na ekranie / najwyższy punkt
    NDC): pistolet 3650/-0,69, SMG 1901/-0,58, strzelba 3356/-0,67, karabin
    1790/-0,82, snajperka 679/-0,85. Karabin jest w kadrze - pierwszy odczyt
    „znikł" był błędem oka, nie pomiaru.
    ⚠️ **Kadrowanie kikuta mierz na PIERŚCIENIU, nie na liczniku wierzchołków
    ramienia.** Proxy „ile wierzchołków ramienia widać" pokazało kikut w kadrze
    dla trzech broni w biegu; prawdziwy pierścień otwartego brzegu (ten, który
    znajduje `tests/shots_weapons.py`) jest w biegu **0/20 na ekranie dla
    wszystkich pięciu**, przed zmianą i po. Ta sama pułapka co 2026-08-21.
    ⚠️ Ten sam offset wywala krótką broń CAŁKIEM poza kadr (pistolet znikał
    do jednego piksela), więc jest tabela odchyłek per broń `SPRINT_TWEAK`
    (dziś `pistol`, `smg` i `strzelba`) - „ledwo widoczne" tak, „nie ma jej"
    nie. Strzelba dostała swoją 2026-08-25 (zgłoszenie użytkownika): jest
    NAJDŁUŻSZA w grze i jako jedyna jedzie 0,34 przysunięta względem wspólnej
    kotwicy tyłem, więc na wspólnym zjeździe zostawał z niej pasek przy dolnej
    krawędzi rozciągnięty do x 1,0, czyli poza prawą krawędzią - i ani śladu
    rękawicy. Miarą jest tu KARABIN (najbliższa długością): komora ma leżeć
    wzdłuż dolnej krawędzi, rękawica wsparcia ledwo wystawać.
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
  - **Opuszczanie broni przy ścianie** (`wallBlend`, 2026-08-27, zgłoszenie
    użytkownika: „jak staniemy przodem do ściany, to ręce wraz z bronią wchodzą
    w ścianę i znikają"): promień z kamery do przodu po `worldGroup.children`
    (`wallProximity()`) daje 0..1 z dystansu (pełne opuszczenie ≤ `WALL_NEAR`
    0,85 m, zero od `WALL_FAR` 1,65 m), a poza to POZA BIEGU - te same
    `SPRINT_POS`/`SPRINT_ROT` + `SPRINT_TWEAK`. Blend jest jednak WŁASNY
    i łączony dopiero w punkcie użycia (`carryBlend = max(sprintBlend,
    wallBlend)`), bo `sprintBlend` karmi rozmycie promieniste w main.js
    i skalowanie boba - opuszczenie przy ścianie nie ma nieść żadnego efektu
    biegu. Przeładowanie wycisza sondę (jego offsety są bezwzględne, nie
    deltami na tej pozie).
    ⚠️ **Kierunek sondy jest SPŁASZCZONY** (`y × 0.35`) i pomijane są ścianki
    prawie poziome (|normalna.y| > 0,7): bez jednego i drugiego patrzenie pod
    nogi opuszczało broń, bo podłoga jest 1,7 m pod okiem.
    ⚠️ **Opuszczenie jedzie CIAŁEM, nie stawami** (zgłoszenie użytkownika
    2026-08-27: „zrób żeby ręce razem z bronią schodziły, a nie nadgarstki
    wygina jak gówno"). Wszystko, co broń robi PONAD `_carryPos`/`_carryRot`,
    jest odchyłką, którą mają pochłonąć ramiona - więc przechył nałożony na
    samą broń skarmiał nadgarstkom i łokciom cały ruch (pistolet wychodził
    z dłońmi złożonymi do tyłu). Nadwyżka wall carry idzie więc DO
    ODNIESIENIA: `armBodyFix` ją znosi, bark jedzie z bronią, a ramiona
    schodzą sztywno, w pozie, w której były dostrojone (zmierzone: nadgarstki
    i łokcie co do stopnia takie same jak z biodra dla czterech broni,
    karabin ma 29° zamiast 40° zgięcia lewego).
    ⚠️ Do odniesienia idzie WYŁĄCZNIE nadwyżka nad biegiem (`wOnly =
    carryBlend - sprintBlend`), nigdy udział samego biegu: bieg jest dostrojony
    tak, żeby brały go stawy, i niesie własne pchnięcie barku
    (`SPRINT_SHOULDER`), więc wpuszczenie go tutaj przesuwałoby bark dwa razy.
    Bieg pod ścianę zostawia `wOnly` na zerze i nie zmienia w biegu niczego.
    ⚠️ **Sama poza biegu NIE wystarcza i to jest zmierzone**: promień gracza
    to 0,5 m, więc przy ścianie oko stoi pół metra od lica, a bronie sięgają
    0,69-1,41 m do przodu z biodra i dalej 1,05-1,27 m w pozie biegu - bieg
    OPUSZCZA broń, ale jej nie SKRACA. Przy 0,52 m karabin miał 1697
    wierzchołków za płaszczyzną ściany, czyli cały viewmodel wyrenderowany
    w ścianie. Dlatego dochodzą `WALL_DIP` (-0,60 rad; lufa nurkuje poza kadr
    zamiast w mur) i `WALL_PULL` (+0,26 do kamery; to on realnie skraca
    zasięg).
    ⚠️ **Te dwie liczby dobiera się RAZEM, przeciwko trzem warunkom naraz**
    i trzeci jest tu najtrudniejszy: zero w murze, zero pierścienia kikuta
    w kadrze i każda broń dalej widoczna. Głęboki przechył na małym pociągu
    (-0,80 / 0,10) czyści mur i pokazuje broń, ale obrót całego zestawu nosem
    w dół PODNOSI jego TYŁ, czyli miejsce, w którym ramiona są ucięte: SMG
    miało wtedy wszystkie 20 wierzchołków pierścienia na ekranie, snajperka
    14, strzelba 8 na ramię. Wypłycenie przechyłu chowa kikuty razem z bronią.
    Rozstrzyga POCIĄG: przenosi ucięte końce za near plane, a broń zostaje
    w kadrze. Bieżące liczby to jedyny róg przemiecenia (0,55 m, pięć broni),
    w którym trzymają się wszystkie trzy warunki.
    ⚠️ **Kikutów NIE kupuj pchnięciem barku** (chwyt, którym jadą
    `SPRINT_SHOULDER` i `BOLT_SHOULDER`). Sprawdzone i zmierzone: -0,20 m
    zejścia barku przestawia nadgarstki pistoletu z 15/9° zgięcia na 53/49°
    i składa oba łokcie ze 176° na ~80°, a i tak zostawia prawy pierścień
    w kadrze przy trzech broniach - to jest dokładnie objaw „powyginanych
    nadgarstków i przenoszonych rąk".
    `WALL_TWEAK` to podniesienie per broń, jak `SPRINT_TWEAK`, i jest wąskim
    marginesem między dwoma błędami. ⚠️ **Widoczny ma być tylko FRAGMENT
    broni przy dolnej krawędzi** (decyzja użytkownika 2026-08-27: „daj je
    w dół, tak żeby był widoczny tylko ich fragment" - najbardziej rzucały się
    pistolet i SMG, niesione o wiele za wysoko). Dostrojone najwyższym
    wierzchołkiem broni na ekranie przy 0,55 m: wszystkie pięć w paśmie
    -0,71..-0,75, przy zerze w murze i pierścieniach kikuta poza kadrem.
    Nie podnoś ich, żeby „pokazać więcej broni": przy zerowym podniesieniu
    bronie wychodzą z kadru w ogóle (zmierzone -1,0 do -1,7), co czyta się
    jak błąd, a każdy centymetr w górę podprowadza lufę z powrotem pod mur.
    ⚠️ Pociąg do kamery jest normalnie zakazany (near plane 0,08) i jest tu
    bezpieczny, bo ta poza nigdy nie gra z bronią przy oku, a przez płaszczyznę
    przechodzi TYŁ zestawu - najbliższy widoczny wierzchołek samej broni ma
    dalej ~0,2 m.
    ⚠️ **Boty też są przeszkodą** (decyzja użytkownika 2026-08-27: „boty to
    też obiekt, więc stojąc blisko lufę opuszczamy") - siedzą w `enemiesGroup`,
    nie w `worldGroup`, więc mają własny przebieg sondy i musi być
    REKURENCYJNY (bot to rig, nie płaski mesh jak blok muru). Filtr ścianek
    prawie poziomych dotyczy WYŁĄCZNIE świata: powstał dla podłogi i wierzchów
    skrzyń, a bot ma fasetki we wszystkie strony i odsiewanie ich gubiłoby
    przeciwnika stojącego w lufie.
    ⚠️ **Boty przefiltruj DYSTANSEM przed raycastem.** `Mesh.raycast`
    w Three odrzuca po SFERZE otaczającej i ignoruje `raycaster.far`, więc bot
    20 m na wprost celownika przepuszczałby pełny test trójkątów na
    skinowanym rigu w KAŻDEJ klatce. Testowane są tylko te, które w ogóle
    mogą zmieścić się w `WALL_FAR`.
    ⚠️ **Zablokowana lufa = brak celowania i brak ognia** (`muzzleBlocked()`,
    próg `WALL_BLOCK` 0,85 blendu, ta sama decyzja). Próg jest CELOWO blisko
    szczytu rampy, nie w połowie: przy 0,85 broń jest praktycznie na dole,
    a przeszkoda jakiś metr przed lufą, więc blokada gryzie dopiero wtedy, gdy
    poza i tak mówi, że bronią nie da się w nic wycelować. Połowa rampy to
    1,25 m, czyli odbieranie strzału z bronią jeszcze w górze.
    `tryFire` wychodzi CICHO - suchy strzał znaczy „pusty magazynek" i to nie
    jest to samo.
    ⚠️ **Celowanie znika WCZEŚNIEJ niż ogień i znika PŁYNNIE** (`WALL_AIM`
    0,45 + `adsRoom`, zgłoszenie użytkownika 2026-08-27: „celując i podchodząc
    do ściany ręce przeskakują przez ułamek sekundy do pozycji trzymania broni
    normalnie, a potem dopiero do tej trzymanej ku ziemi"). Przy jednym progu
    dla obu ADS trzymało się na pełnej wartości przez CAŁY zjazd, a puszczało
    jednym krokiem - broń przejeżdżała wtedy ADS → biodro (własne wygładzanie
    0,2 s) na już gotowym opuszczeniu, czyli whipowała 0,21 m w bok z osi
    celowania w linię biodra, mając lufę już w dole. Zmierzone przy marszu
    5 m/s, największy skok broni na klatkę: pistolet 0,157 m, SMG 0,139,
    strzelba 0,145, karabin 0,146. Teraz cel ADS jest wygaszany wzdłuż
    pierwszej części rampy, a STAN celowania przełącza się dopiero na końcu
    tego wygaszania, więc nie ma już czego przejechać: te same pomiary dają
    0,051-0,067 m, czyli sam przejazd zjazdu. Snajperka jedzie lunetą, nie ADS
    (0,066 przed i po), ale jej `zoomTarget` też jest bramkowany `adsRoom`.
    ⚠️ `adsRoom` MUSI być zadeklarowane NAD bramką lunety: `zoomTarget`
    skraca się na `w.zoom`, więc wpadka z TDZ wywalałaby wyłącznie snajperkę
    i tylko ją (złapane w teście przez `wall_snap`, nie widać tego na
    pozostałych czterech broniach). ADS jest odbierane i ODDAWANE co klatkę (`aimHeld` =
    intencja PPM, `aimBlocked` = to opuszczenie ją zabrało), bo lufa wchodzi
    i wychodzi z zasłony w trakcie ruchu: gracz trzymający PPM przy ścianie
    dostaje celowanie z powrotem sam, gdy się cofnie, ale zmiana broni ani
    reset nigdy nie podnoszą go z automatu. W praktyce boty tego nie wyzwalają
    - PATROL trzyma `preferred` 12 m i zawraca poniżej 8 - to jest sytuacja
    dla przeciwnika zapędzonego w róg i dla strzelnicy.
    Diagnostyka: `__test.wallCarry`, `__test.wallBlock`.
  - **Luneta z podniesieniem:** PPM na snajperce NIE włącza lunety od razu -
    `zoomBlend` wiezie broń „do oka" (`ZOOM_RAISE`), overlay+FOV 24°
    +czułość 0.35 wchodzą dopiero na szczycie (`setScopeOverlay`); puszczenie
    PPM zdejmuje overlay natychmiast, broń opada. `spreadZoom` obowiązuje
    tylko pod pełną lunetą (`scoped`), w trakcie podnoszenia strzela się
    rozrzutem z biodra. Diagnostyka: `__test.scoped`.
    Snajperka jest też **przysunięta do oka** (`root.z` −0.28 → −0.16,
    decyzja użytkownika 2026-08-26: „case jak przy pozostałych broniach -
    przybliż ją, aż nie będzie widać kikuta", potem „oddal ją trochę, ale
    tak żeby kikuta nie było"). Płytki dial ramienia wsparcia wypychał tu
    pierścień głęboko w kadr; dystans oddaje to bez żadnych kosztów: obraz
    przyrządów nie istnieje (celuje się overlayem, a viewmodel pod lunetą
    jest ukryty), a dziury nie ma czym otworzyć - to NAJDŁUŻSZA broń w grze,
    jej tył siedzi przy biodrze już 0,05 m ZA okiem, więc przysunięcie spycha
    go tylko głębiej. Ile trzeba, zależy od CHWYTU i po każdym jego
    przestrojeniu trzeba przemierzyć od nowa: pierwszy dial wymagał −0.10
    (pierścień 16/20 przy −0.28), drugi kadruje sam z siebie znacznie lepiej
    (1,93 tam, gdzie poprzedni dawał 1,27) i czyści się aż do −0.18, więc
    broń wróciła na −0.16 - jeden krok od krawędzi, ten sam zapas co przy
    strzelbie. Prześwitów 0.
    ⚠️ **`muzzleLocal` jedzie z rootem** (dziś −0.95 = połowa długości 0,79
    plus root −0.16) - jest w przestrzeni GRUPY viewmodelu, więc bez
    przeliczenia błysk zostaje kilkanaście centymetrów za wylotem.
    Podniesienie trwa **0,50 s** (z 0,32; decyzja użytkownika 2026-08-26:
    „ma trwać dłużej i otwierać scope'a bliżej oka"), `ZOOM_RAISE` zjechało
    z (0.10, -0.16, -0.50) na **(0.05, -0.13, -0.44)** - bliżej środka
    i oka - a FOV w trakcie podnoszenia schodzi o 14° zamiast 8.
  - **Cykl zamka snajperki po KAŻDYM strzale** (2026-08-26, jak pompka
    strzelby): stałe `BOLT_HOLD` 0,25 s (odrzut wybrzmiewa, nikt nie rusza
    zamka) + `BOLT_STROKE` 0,60 s; licznik `boltT`/`boltFired` w weapons.js.
    PRAWA dłoń schodzi z chwytu na wyciętą rączkę (`grips.boltR` + kotwica
    `bolt` [0.048, 0.075, 0.289] - rączka jest ~0,1 m nad chwytem), ciągnie
    ją (`boltPart.position.z`, piwot w originie jak przy wyspach ze `split`)
    i wraca; jedzie przez `applyCarryArms(vm, w, pump, boltEnv, boltYank)`
    rel-stylowym targetem `_boltTarget` (zmienia się CAŁY chwyt, nie sama
    pozycja). Budżet czasu: 45 rpm = 1,33 s między strzałami; 0,85 s cyklu
    + 0,50 s ponownego podniesienia domyka się tuż przed następnym strzałem.
    ⚠️ **Pod lunetą strzał NAJPIERW zdejmuje overlay** (`tryFire`:
    `setScopeOverlay(false, true)` - CICHO, huk kryje foley), `zoomTarget`
    bramkuje się na `boltT`, więc luneta wraca normalnym podniesieniem
    (z własnym dźwiękiem) dopiero po cyklu - dokładnie sekwencja „wyjdź
    z lunety, pokaż przeładowanie, wróć" (decyzja użytkownika 2026-08-26).
    ⚠️ **W cyklu broń tylko SIĘ PRZECHYLA - nie wolno jej przesuwać**
    (`BOLT_CARRY`, przestrojone 2026-08-26 po zgłoszeniu „po strzale jak
    postać ciągnie za zamek to lewa ręka schodzi bliżej broni"). Bark ręki
    wsparcia jest zakotwiczony w ciele, a dłoń przyspawana do łoża, więc
    KAŻDY milimetr ruchu broni składa łokieć dokładnie o tyle: przy px -0.09
    / py +0.05 lewy łokieć szedł 172° → 129° przy nieruchomym barku.
    Przemiecione (zmiana łokcia / najgorszy NDC x pracującej pięści):
    (-0.09, +0.05, 0.10) 45°, (-0.07, +0.03, 0.30) 41°/0,70,
    (-0.04, +0.02, 0.35) 34°/0,83, (0, 0, 0.16) 24°/0,99,
    **(0, 0, 0.45) 17°/0,96**. Sam obrót jest nie tylko tańszy od
    przesunięcia - powyżej pewnego kąta jest DARMOWY i jeszcze oddaje:
    17° to MNIEJ niż 26°, które kosztuje samo szarpnięcie przy zerowych
    offsetach, bo przechył podprowadza rączkę pod dłoń zamiast dłoni pod
    rączkę. Rączka zamka jest w kadrze w komplecie (128/128 wierzchołków)
    w każdym wierszu, więc przesuwaniem broni nie kupuje się nic.
    ⚠️ **Bark ręki WSPARCIA za to musi w cyklu ustąpić** (`BOLT_SHOULDER`,
    2026-08-26, zgłoszenie użytkownika „łokieć lewej dłoni powinien być
    bardziej w dół niż w bok"). Patrzy się tu na PRZEDRAMIĘ, nie na kąt
    stawu: zmierzone w przestrzeni kamery, łokieć siedzi na y -0,21, a
    przyspawany do łoża nadgarstek na -0,225, czyli przedramię leży POZIOMO
    i przecina kadr jako szeroka blada płyta z lewego dołu. Nie robi tego
    cykl - to płytki dial noszenia z biodra, cykl tylko każe na to patrzeć.
    ⚠️ **Podpowiedź łokcia tego NIE naprawi**: ramię mierzy przez cały skok
    178°, czyli jest zaryglowane na prosto, a proste ramię nie ma już
    swobody, którą pole vector mógłby sterować - łokieć leży na odcinku
    bark-nadgarstek, więc opuścić go może tylko opuszczenie BARKU (dłoń
    zostaje, bo `reachArm` dochyla staw z powrotem po tej samej linii -
    `SHOULDER_LEAN_MAX` ma 0,22 m przy 0,057 m potrzeby).
    ⚠️ Składowa DO PRZODU nie jest ozdobą - to ona ODRYGLOWUJE ramię.
    Zjazd w samym pionie zostawia je równie proste (178° na każdej głębokości
    od -0,10 do -0,34), pchnięcie ku broni skraca zasięg i staw znów się
    zgina. Przemiecione (łokieć minus nadgarstek w y kamery / kąt łokcia):
    y -0.14 z 0 → -0,059/178 zablokowane, y -0.20 z 0 → -0,093/178,
    y -0.26 z 0 → -0,122/178, y -0.20 z -0.08 → -0,154/136,
    **y -0.26 z -0.08 → -0,167/156**, y -0.26 z -0.12 → -0,199/133 i
    nadgarstek zaczyna kosztować (31°). Bieżący wiersz to jedyny, w którym
    łokieć wychodzi bardziej W DÓŁ niż W BOK (0,167 przy 0,145; przedtem
    +0,015 czyli NAD nadgarstkiem), przy stawie 139-156° (tyle co przy
    biodrze), nadgarstku 17-24°, pięści na łożu co do 0,0000 m i pierścieniu
    kikuta daleko poza kadrem (|ndc y| 2,24). Dźwięk `AudioSys.boltPull('sniper')` (takty Mosina)
    odpala się Z ANIMACJI na starcie szarpnięcia - nigdy planowany z góry
    (ta sama lekcja co pompka). Ostatni nabój NIE cykluje - przejmuje go
    przeładowanie (`startReload` zeruje `boltT`, `switchWeapon`/
    `resetWeaponFx` też; `clearReloadVisuals` odstawia `boltPart`). Rack
    kończący puste przeładowanie jedzie tym samym chwytem `boltR` i też
    rusza prawdziwą rączką.
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
