# NEON ARENA — notatki dla Claude Code

Przeglądarkowy FPS (Three.js, fale botów). Gra jest **w 100% po stronie klienta** —
bez backendu, bez bundlera, bez node_modules.

## Architektura

- **Cały kod gry jest w `index.html`** (jeden moduł ES, ~2000 linii) — to decyzja celowa:
  przeglądarki blokują lokalne moduły ES przy `file://`, a gra ma działać po dwukliku.
  Three.js + addony ładowane z CDN (jsdelivr) przez import map. **Nie rozdzielaj kodu na
  pliki `src/*.js`** bez zmiany sposobu dystrybucji.
- Kod podzielony sekcjami komentarzy: KONFIG → AUDIO → RENDERER → ŚWIAT → EFEKTY →
  KOLIZJE → GRACZ → BRONIE → WROGOWIE → PICKUPY → SKLEP → FALE → HUD → STANY → WEJŚCIE →
  TRYBY TESTOWE → PĘTLA.
- `styles.css` — HUD i ekrany (CSS działa z `file://`, może być osobno).
- Zasoby wyłącznie proceduralne: geometrie z kodu, tekstura podłogi z canvasa, dźwięki
  syntetyczne (WebAudio). **Nie dodawaj zewnętrznych modeli/tekstur/dźwięków.**
- UI i komunikaty po polsku; paleta: indygo `#232946` / teal `#00ebc7` /
  pomarańcz `#ff8906` / czerwień `#ff5470` / złoto `#ffd166` (kredyty/headshoty).

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
