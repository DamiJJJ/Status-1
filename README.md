# NEON ARENA — przeglądarkowy FPS

Prosta, stylizowana strzelanka FPS (widok z oczu postaci) działająca w całości w przeglądarce.
Przetrwaj **5 fal** uzbrojonych botów na neonowej arenie. Bez instalacji, bez backendu —
Three.js ładowany z CDN, dźwięki generowane syntetycznie (WebAudio).

![Rozgrywka](screenshots/rozgrywka-2.png)

## Jak uruchomić

### Wariant 1 — najprościej (zweryfikowany w Chrome)
**Kliknij dwukrotnie `index.html`.** Gra otworzy się w domyślnej przeglądarce i działa
od razu — cały kod gry jest w jednym pliku, a Three.js ładuje się z CDN (potrzebne jest
połączenie z internetem).

### Wariant 2 — online (GitHub Pages)
Gra jest w 100% statyczna, więc działa na GitHub Pages bez żadnej konfiguracji:
w repozytorium wejdź w **Settings → Pages**, jako źródło wybierz gałąź `main`
(katalog `/root`) i po chwili gra będzie dostępna pod
`https://<twoja-nazwa>.github.io/<nazwa-repo>/`.

### Wariant 3 — awaryjnie, przez lokalny serwer
Użyj tego wariantu tylko, jeśli przeglądarka zablokuje grę otwartą z dysku
(zobaczysz pusty/czarny ekran albo błąd o CORS/modułach w konsoli):

- **Windows:** dwuklik na `start-windows.bat` — uruchomi lokalny serwer (Python) na
  porcie **8137** i otworzy `http://localhost:8137/index.html`. Zamknięcie okna konsoli
  wyłącza serwer.
- **macOS / Linux:** w terminalu `sh start.sh` (wymaga `python3`).

> Port 8137 wybrano celowo nietypowy, żeby nie kolidować z innymi lokalnymi serwerami
> (np. PHP na 8000).

## Sterowanie

| Akcja | Klawisz |
|---|---|
| Ruch | **W / A / S / D** |
| Rozglądanie / celowanie | **mysz** (Pointer Lock — aktywuje się po kliknięciu „Graj") |
| Strzał | **LPM** |
| Celowanie (ADS) | **PPM** (przytrzymaj) — każda broń; snajperka daje pełną lunetę |
| Przeładowanie | **R** |
| Zmiana broni | **1 / 2 / 3 / 4** lub **scroll** |
| Bieg | **Shift** (działa też w powietrzu) |
| Skok / bunnyhop | **Spacja** (przytrzymanie auto-skacze; łańcuch skoków rozpędza do +35%) |
| Pauza | **Esc** (zwalnia mysz) |
| Restart po końcu gry | **R** lub przycisk na ekranie |
| Wyjście ze sklepu (następna fala) | **Enter** lub przycisk |

## Rozgrywka

- **Tryb fal (survival):** 5 fal botów, każda liczniejsza i twardsza (więcej HP, lepsza
  celność). Po ostatniej fali — ekran zwycięstwa; gdy HP spadnie do 0 — ekran przegranej.
- **Tryb endless:** po zwycięstwie możesz grać dalej — fale 6, 7, 8… rosną bez końca.
  Najlepszy wynik jest zapamiętywany na stałe (localStorage).
- **Headshoty:** trafienie w głowę bota zadaje **×2 obrażeń** (złoty hitmarker i wyraźny
  dźwięk potwierdzają trafienie).
- **Wskaźnik obrażeń:** czerwony łuk przy krawędzi ekranu pokazuje, z którego kierunku
  padł strzał — obraca się razem z kamerą.
- **Sklep między falami:** za **kredyty** (10 za zwiadowcę, 15 za szturmowca, 30 za
  ciężkiego, bonus za falę) kupujesz między falami:
  - **bronie** — zaczynasz tylko z pistoletem; strzelbę (50 kr), SMG (90 kr) i snajperkę
    (140 kr) odblokowujesz w sklepie;
  - **zaopatrzenie** — pełne leczenie (30 kr), pełna amunicja (40 kr);
  - **ulepszenia** (ceny rosną z poziomem) — pancerz +25 maks. HP, magazynki +50%,
    przeładowanie −15%, obrażenia +15%.
- **Muzyka proceduralna** (WebAudio): spokojny ambient w menu/sklepie, w trakcie fali
  wchodzi bit (stopa, hi-hat, bas) — intensywność rośnie z numerem fali.
- **Generator aren:** każdy załadunek strony losuje nowy układ przeszkód (filary,
  klastry skrzyń, murki). Numer areny widać na ekranie startowym — dopisz
  **`?seed=N`** do adresu (np. `index.html?seed=555`), aby wrócić na ten sam układ
  albo podzielić się nim z kimś. Strefy spawnu i pickupów zawsze pozostają wolne.
- **Boty** są uzbrojone: podchodzą na swój preferowany dystans, kluczą (strafe), sprawdzają
  linię wzroku i **strzelają do gracza** z ograniczoną celnością. Trzy typy (rozróżnisz
  je po kolorze i kształcie głowy):
  - **Zwiadowca** (zielony, **trójkątna głowa**) — pistolet, walczy z dystansu; losowo
    dropi **amunicję**;
  - **Szturmowiec** (pomarańczowy, **kwadratowa głowa**) — szybszy od zwiadowcy, strzela
    **seriami z karabinu**; losowo dropi **amunicję**;
  - **Ciężki** (czerwony, **okrągła głowa**) — **strzelba**: musi podejść blisko, ale
    z bliska bije bardzo mocno; dużo HP; losowo dropi **apteczkę** (+30 HP).
- Kilka pickupów (amunicja/apteczki) leży też na arenie od startu.
- **Punkty:** zwiadowca 100, ciężki 250, bonus za ukończenie fali. Rekord jest
  zapamiętywany w przeglądarce (localStorage).

## Bronie

| # | Broń | Charakterystyka | Magazynek | Cena |
|---|------|-----------------|-----------|------|
| 1 | **Pistolet** | celny, średnie obrażenia, półautomatyczny | 12 / zapas 72 | start |
| 2 | **Strzelba** | 8 śrucin w rozrzucie, zabójcza z bliska, wolna | 6 / zapas 30 | 50 kr |
| 3 | **Karabin SMG** | ogień automatyczny, szybki, większy rozrzut | 30 / zapas 150 | 90 kr |
| 4 | **Snajperka** | ogromne obrażenia, bardzo celna z zoomem (PPM) | 5 / zapas 20 | 140 kr |

Trafienie w **głowę** bota zadaje ×2 obrażeń (złoty hitmarker + charakterystyczny dźwięk).

**Celowanie (PPM):** z biodra strzela się szybko, ale niecelnie (duży rozrzut). Każda
broń ma mechaniczny celownik — przy PPM broń wjeżdża na środek ekranu (muszka w osi
strzału), FOV zwęża się do 60°, a rozrzut spada ~3×. W zamian **celowanie wyłącza
sprint i spowalnia ruch** (~połowa prędkości marszu). Snajperka zamiast muszki daje
pełną lunetę (24°).

**Bunnyhop:** sprint nie przerywa się w powietrzu, a skoki wykonane tuż po lądowaniu
(okno 0,25 s — wystarczy trzymać spację) kumulują boost prędkości aż do +35%.

## Technika

- **Three.js r160** z CDN (jsdelivr) przez import map; addony: `PointerLockControls`,
  `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`.
- Cały kod gry w `index.html` (moduł ES, podzielony na czytelne sekcje) — celowo w jednym
  pliku, bo przeglądarki blokują **lokalne** moduły ES przy `file://`, a moduły z CDN (HTTPS)
  działają także po dwukliku.
- Oprawa: flat-shaded low-poly, spójna paleta (indygo / teal / pomarańcz / czerwień),
  cienie z mapy cieni (światło kierunkowe), hemisfera + ambient, **bloom** + tone mapping
  ACES, mgła dystansowa, gradientowe niebo (shader), muzzle flash, tracery, iskry i
  cząsteczki trafień/śmierci, decale po strzałach, proceduralna tekstura podłogi (canvas).
- Dźwięki i muzyka syntetyczne (WebAudio) — zero plików zewnętrznych; muzyka to
  proceduralny sekwencer 16 kroków (118 BPM, a-moll), który reaguje na stan gry.
- Hitscan przez `THREE.Raycaster`, pętla gry na `requestAnimationFrame` z delta time,
  pule obiektów dla cząsteczek/tracerów/decali (brak wycieków przy restarcie).

## Zrzuty ekranu

| | |
|---|---|
| ![Menu](screenshots/menu.png) | ![Walka](screenshots/rozgrywka-1.png) |
| ![Sklep](screenshots/sklep.png) | ![Zwycięstwo](screenshots/ekran-zwyciestwa.png) |

## Licencja

Projekt na licencji **MIT** — szczegóły w pliku [LICENSE](LICENSE).
