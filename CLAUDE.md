# NEON ARENA — notatki dla Claude Code

Przeglądarkowy FPS (Three.js, fale botów). Gra jest **w 100% po stronie klienta** —
bez backendu, bez bundlera, bez node_modules.

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
- **Kolejność `<script>` w `index.html` = kolejność dawnych sekcji i MA znaczenie**
  (część kodu wykonuje się już przy ładowaniu, np. `generateArena()` w `world.js`).
  Pliki w kolejności ładowania:
  `config.js` (konfig/paleta/parametry URL/diagnostyka `__test`) → `audio.js` (SFX +
  muzyka proceduralna) → `renderer.js` (renderer/kamera/postprocessing/światła/niebo) →
  `world.js` (arena + generator przeszkód) → `effects.js` (pule: cząsteczki/tracery/
  decale/flashe) → `collisions.js` → `player.js` (ruch/bunnyhop/sway/obrażenia gracza) →
  `weapons.js` (WEAPONS/viewmodele/ADS/strzelanie) → `enemies.js` (ENEMY_TYPES/modele/AI) →
  `pickups.js` → `shop.js` → `waves.js` → `hud.js` → `state.js` (obiekt `game`/ekrany/
  start/pauza/`resetGameState`) → `input.js` → `testmode.js` (`?test=...` + hooki) →
  `main.js` (pętla `tick`). Nowy plik wpinaj w miejsce zgodne z zależnościami
  wykonywanymi przy ładowaniu; odwołania wyłącznie z wnętrza funkcji mogą wskazywać
  „w przód".
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
  - **tekstury generowane w runtime** z canvasa (jak `makeFloorTexture()` w `world.js`);
  - **tekstury/grafiki generowane offline** skryptem z `tools/` (Python: PIL/numpy — szum,
    panele, mapy normalnych i roughness; SVG → PNG). Skrypt generujący **commitujemy razem
    z wynikiem**, żeby dało się przegenerować zasób po zmianie palety/rozdzielczości.

  **Zabronione: gotowe modele/tekstury/dźwięki z zewnątrz** (stock, paczki assetów,
  biblioteki tekstur) — licencje i spójność stylu. **Audio zostaje w 100% syntetyczne
  (WebAudio)** — bez plików dźwiękowych, nawet własnych.
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
  `logo-mark.png` (sam emblemat, 256 px — HUD i nagłówki ekranów pauzy/przegranej/
  zwycięstwa/sklepu), `logo-full.png` (lockup z napisem, 560 px — tytuł ekranu
  startowego), `icon-*.png` + `favicon.ico` + `apple-touch-icon.png` (favicony,
  linkowane w `<head>`), `icon-maskable-512.png` (PWA, ma margines bezpieczny),
  `og-image.png` (podgląd w social media). `site.webmanifest` spina ikony PWA.
  Pliki `neon arena logo*.png` to **źródła** (białe tło) — nieużywane w runtime, nie
  linkuj ich. Tło wycięto miękką alfą (odwrócony premultiply względem bieli + rdzeń
  z `binary_fill_holes`), więc poświata neonu zachowuje gradient — przy podmianie logo
  nie używaj progowania alfy ani kwantyzacji PNG (widoczne ziarno na gradientach).
- UI i komunikaty po polsku; **komentarze w kodzie po angielsku** (nowe i edytowane;
  zastane polskie tłumacz przy okazji, gdy modyfikujesz dany fragment). Paleta: indygo
  `#232946` / teal `#00ebc7` / pomarańcz `#ff8906` / czerwień `#ff5470` / złoto
  `#ffd166` (kredyty/headshoty).

## Konwencje techniczne

- Kamera: `rotation.order = 'YXZ'`; PointerLockControls tylko do obrotu, pozycja liczona
  ręcznie (kolizje okrąg-vs-AABB w XZ, lista `colliders`). Przeszkody muszą być osiowe.
- Model bota: przód to lokalne **+Z** (yaw = `atan2(dx, dz)`); meshe głowy mają
  `userData.isHead` (headshot ×2), wszystkie meshe `userData.enemyRef`.
- Typy botów (`ENEMY_TYPES`): pole `weapon` ('pistol' | 'auto' | 'shotgun') steruje
  ostrzałem w `enemyFire()` — 'auto' strzela seriami (`burstCount`/`burstInterval`),
  'shotgun' ma obrażenia malejące z dystansem i krótki `range` (musi podejść).
  Dropy per typ w `rollDrop()`: scout/assault → amunicja, heavy → apteczka.
- Bronie gracza mają flagę `owned` — start tylko z pistoletem, reszta kupowana
  w sklepie (pozycje `w_*` w `SHOP_ITEMS`). Nowa broń = wpis w `WEAPONS`, viewmodel
  w `buildViewmodel()`, pozycja `w_...` w sklepie i slot na HUD.
- Muzyka proceduralna żyje w closure `AudioSys` (sekwencer 16 kroków, lookahead
  przez `setInterval`); mood wyliczany z `game.state`/`waveSystem.active` przy
  planowaniu kroku — nie wymaga ręcznego przełączania przy zmianach stanu.
- Efekty (cząsteczki/tracery/decale/flash) używają **puli obiektów** — przy nowych
  efektach też używaj puli, nie twórz meshy w locie.
- Viewmodel: dziecko kamery; w animacjach **nigdy nie przybliżaj broni do kamery**
  (near plane 0.08 — geometria „wybucha" na ekranie); odsuwaj (`z` bardziej ujemne).
- ADS (PPM, zmienna `aiming` + `adsBlend`): każdy viewmodel ma `userData.adsPos` —
  pozycję, w której **muszka trafia w oś kamery** (x=0, y=−wysokość muszki). Muszki
  muszą być małe (~0.012) i **osadzone na geometrii broni** (zamek/szyna/lufa), nie
  lewitujące przed lufą. Nowa broń musi dostać muszkę (emissive box) i adsPos.
  Snajperka (`zoom: true`) zamiast ADS pokazuje lunetę i chowa viewmodel.
  Balans: `spread` w WEAPONS to rozrzut Z BIODRA (celowo duży); ADS mnoży przez
  `adsMul` (domyślnie 0.3). ADS blokuje sprint i spowalnia ruch ×0.55.
  FOV: luneta 24° / ADS 60° / sprint+bhop poszerzają.
- Bunnyhop: `player.hopBoost` (do 1.35) rośnie za skok w oknie 0.25 s po lądowaniu
  (`player.sinceLand`), wygasa po dłuższym pobycie na ziemi; sprint nie wymaga ziemi.
- Rozróżnianie botów: kolor ciała + kształt głowy — scout zielony/piramida (Cone, 4 seg.),
  assault pomarańczowy/box, heavy czerwony/sfera. Nowy typ = nowy kolor I nowy kształt.
  Głowa = kolor ciała × 0.55 (nie czerń); „oko" ma kształt zgodny z głową (trójkątny
  pryzmat / kula / prostokąt). Nogi mają pivot w biodrze (geometria przesunięta w dół)
  i machają wg `walkFactor` = faktyczna prędkość / nominalna.
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

## Uruchamianie i testy

- Dev-serwer: `python -m http.server 8137` w katalogu projektu.
  **Port 8137, nie 8000** — na 8000 działa lokalny serwer PHP użytkownika.
- Testy: Playwright (Python, `channel="chrome"`, headless) + flagi
  `--use-angle=swiftshader --enable-unsafe-swiftshader` (WebGL w headless).
- Hooki diagnostyczne w grze (nie usuwać):
  - `window.__test` — stan aktualizowany co klatkę (state, hp, score, wave, enemies,
    ammo, fov, credits, headshots, endless, errors[]);
  - parametry URL: `?test=play` (autostart bez pointer locka), `?test=shoot`
    (autostart + auto-celowanie w głowę + ogień), `?test=over` (wymuszona śmierć),
    `?test=win` (przewinięcie fal — sklep jest wtedy pomijany); dodatkowo
    `&wave=N` startuje od fali N (np. `?test=play&wave=3` — od razu ciężcy);
  - `window.__addCredits(n)` i `window.__buyItem(id)` — zakupy w testach.
- Scenariusz `file://` też musi działać — po zmianach sprawdzaj oba warianty.

## Backlog pomysłów (do przyszłej rozbudowy)

Zaimplementowane wcześniej: headshoty, wskaźnik kierunku obrażeń, sklep między falami
(w tym kupowanie broni), tryb endless, rekord w localStorage, animacja+dźwięk
przeładowania, sway/FOV sprintu, trzy typy botów (pistolet/karabin/strzelba), dropy
per typ wroga, muzyka proceduralna.

### Oprawa wizualna (odejście od „kółek i kwadratów")

Trzy poniższe punkty mieszczą się w zasadzie „wszystko generowane, nic ściąganego"
(patrz Architektura) — realizowalne bez zewnętrznych assetów.

A. **Bogatsze tekstury proceduralne** — zamiast jednej siatki na podłodze: panele
   sci-fi z zabrudzeniami, szum Perlina/Worleya, popękany beton, emisyjne wzory neonowe,
   animowane hologramy (przewijana `tex.offset` albo shader). Do tego **mapy normalnych
   i roughness** — dopiero one dają skok jakości oświetlenia, praktycznie za darmo
   wydajnościowo. Dwie drogi, obie legalne przy `file://`:
   (1) **canvas w runtime** — jak dziś `makeFloorTexture()`, zero plików, dobre do
   wzorów geometrycznych; normal mapę da się policzyć z jasności (Sobel) na canvasie;
   (2) **offline `tools/gen_textures.py`** (PIL/numpy — szum, erozja, zabrudzenia) →
   base64 w `js/textures.js`. **Nie ładuj tekstur sceny 3D z plików PNG** — patrz
   ostrzeżenie o CORS/`file://` w sekcji Architektura.
   Materiały: `normalMap` + `roughnessMap` na `MeshStandardMaterial`, `tex.repeat` pod
   skalę areny; `colorSpace = SRGBColorSpace` **tylko** dla map koloru (normal/roughness
   zostają liniowe — inaczej oświetlenie wyjdzie „umyte").
B. **Ikony wektorowe (SVG) dla UI** — ikony broni i ulepszeń w sklepie, sloty broni na
   HUD, emblematy fal, znaczniki pickupów. Do HUD/ekranów wstawiać **inline w markupie
   lub jako `background-image` z data URI w CSS** — wtedy stylują się paletą
   (`currentColor`, `fill`) i działają z `file://` bez plików. SVG jako osobny plik
   `.svg` w `<img>` też jest OK dla DOM; do faviconów/OG renderować do PNG skryptem
   z `tools/`.
C. **Bogatsze modele proceduralne** — boty i bronie z większej liczby brył, fazowane
   krawędzie, `LatheGeometry`/`ExtrudeGeometry` zamiast samych boxów (lufy, magazynki,
   hełmy, naramienniki). Uwaga na zasady, które zostają w mocy: przód bota to lokalne
   **+Z**, meshe głowy muszą mieć `userData.isHead`, każdy mesh `userData.enemyRef`,
   typ nadal rozpoznawalny po **kolorze ciała I kształcie głowy**; nowa broń wymaga
   muszki + `adsPos` (patrz Konwencje techniczne). Liczbę trójkątów trzymać w ryzach —
   boty spawnują się dziesiątkami.

### Rozgrywka

1. **Czwarty typ bota** — kamikaze (biegnie i eksploduje wręcz) albo snajper (trzyma się
   murów, laser celowania telegrafuje strzał). Wymusza zmianę pozycji gracza.
2. **Boss co 5. falę** — duży bot z paskiem HP u góry ekranu i atakiem obszarowym.
3. **Granaty** (klawisz G) — pociski z fizyką łuku (grawitacja jak w cząsteczkach),
   eksplozja obszarowa + odrzut.
4. **Ustawienia w pauzie** — czułość myszy, głośność master/muzyki, przełącznik
   bloom/cieni (dla słabszych maszyn), zapisywane w localStorage.
5. **Sterowanie dotykowe** — wirtualne gałki dla telefonów (gra jest lekka).
6. **Minimapa / kompas** — kierunki botów na obwódce ekranu lub mały radar.
7. **Dostępność** — remapowanie klawiszy, tryb dla daltonistów (zamiana czerwieni
   wrogów), opcja redukcji migotania.
8. **Multiplayer co-op (WebRTC)** — największy skok złożoności (autorytet hosta,
   synchronizacja stanu); wymaga sygnalizacji, więc łamie zasadę „zero backendu" —
   rozważyć dopiero po wyczerpaniu pomysłów single-player.
9. **Pickupy na przełomie fal zamiast na starcie** — apteczki i amunicja nie mają leżeć
   na arenie od początku gry (`placeInitialPickups()` w `pickups.js`); zamiast tego
   świeża dostawa pojawia się w przerwie między falami (np. przy `waveSystem.onEnemyDown`
   / starcie intermission), w strefach chronionych przez `keepClear`. Uwzględnić
   `resetGameState()` i to, że startowe pickupy mają dziś `life = 9999`.
