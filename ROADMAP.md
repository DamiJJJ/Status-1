# ROADMAPA - STATUS 1

> ⚠️ **2026-08-18: kampania i trzy typy botów wycięte z gry** (decyzja
> użytkownika) - leżą w `_kosz/`, patrz `_kosz/README.md`. Tego samego dnia
> z menu wyleciała też Arena bez końca - jedynym uruchamialnym trybem jest
> STRZELNICA (dev) z jednym przeciwnikiem (PATROL); maszyneria fal/sklepu
> zostaje w kodzie pod testy (`?test=`). **Pozycje MISJA-\* zostały
> z roadmapy usunięte** - wrócą razem z kampanią, jeśli wróci. Pozycje, które
> zakładają istnienie misji (PROG-1, SCENA-2, PROP-7/8/10), zostają na razie
> zamrożone.
>
> Kierunek po tej dacie: **oprawa** - mapa z propów 3D (MAPA-\*), rework broni
> (BRON-1), przeciwników (BOT-3) i panoramy menu (MENU-4).

Plan rozwoju gry. Każda pozycja ma stały
identyfikator - nad pozycjami pracujemy oddzielnie, w dowolnej kolejności, ale
sekcja „Proponowana kolejność" na dole podpowiada sensowne fazy (część rzeczy
od siebie zależy).

Rozmiary: **S** = drobiazg (godziny) · **M** = solidny kawałek (dzień-dwa) ·
**L** = duży (kilka dni) · **XL** = projekt (tygodnie, wiele podejść).

| ID | Zadanie | Rozmiar | Faza |
|---|---|---|---|
| BUG-1 | ✅ Zepsuty pointer lock po „Ponów" (mysz nie znika, nie da się grać) | S/M | teraz |
| BUG-2 | ✅ Brak wyjścia do menu / przerwania misji w trakcie gry | S | teraz |
| BUG-3 | ✅ Skróty przeglądarki w grze (Ctrl+W przy wślizgu zamykał kartę) | S | teraz |
| RUCH-1 | ✅ Kucanie | M | 1 |
| RUCH-2 | Wchodzenie na niskie przeszkody | L | 1 |
| PROG-1 | Drzewko umiejętności zamiast kredytów; bronie odblokowywane fabularnie | L | 1 |
| TRUD-1 | Globalne podniesienie poziomu trudności | M | 1 |
| BOT-2 | ✅ WAŻKA jako częsty przeciwnik od początku | M | 1 |
| PROP-1 | ✅ Ustawienia w pauzie | M | 1 |
| PROP-6 | Dostępność (✅ wyłącznik strobo; remap klawiszy - otwarte) | S | 1 |
| BOT-1 | ✅ Redesign botów (podwozie SENTINEL z modelu CC-BY) | L | 2 |
| BRON-1 | ✅ Rework broni na modele 3D (5 broni z wypieczonych modeli, SMG jako nowa) | L | 2 |
| BRON-2 | ✅ Ręce gracza na viewmodelu (wypieczone ramiona, animacje przeładowań, sprint, luneta z podniesieniem) | S/M | 2 |
| BRON-3 | Animacja inspekcji broni (klawisz F, jak w CS) | S | 2 |
| BOT-3 | Rework przeciwników: modele, animacje, bronie | L | 2 |
| MENU-1 | ✅ Menu główne z animowaną panoramą Los Santos | L | 2 |
| MENU-2 | Synth-ambient w menu (SUNO) | M + decyzja | 2 |
| MENU-3 | ✅ Bestiariusz dronów | M | 2 |
| MENU-4 | Panorama menu z modeli 3D zamiast boxów | M | 2 |
| PROP-12 | Panorama miasta jako skybox w rozgrywce | M | 2 |
| MAPA-1 | Kit propów 3D w pipeline modeli (City Kit, CC0) | M | 3 |
| MAPA-2 | Arena budowana z modułów kitu (styl `city`) | L | 3 |
| MAPA-3 | Pojazdy jako propy z colliderami | M | 3 |
| PROP-3 | Nawigacja botów (graf waypointów) | L | 3 |
| SCENA-1 | Przebudowa aren na sceny miejskie | XL | 3 |
| SCENA-2 | Autorskie sceny dla misji fabularnych | L | 3 |
| PROP-9 | Audio otoczenia: materiał podłoża, pogłos per scena | M | 3 |
| TECH-1 | Sterowanie dotykowe (mobile) | L | 4 |
| TECH-2 | Multiplayer co-op w trybie endless | XL | 4 |
| PROP-2 | ✅ Wślizg (slide) | S | - |
| PROP-4 | ✅ Granaty | M | - |
| PROP-5 | Radar / kompas | M | - |
| PROP-7 | Ekran wyników misji ze szczegółami | M | - |
| PROP-8 | Nagroda za komplet medali | S | - |
| PROP-10 | Checkpointy w dłuższych misjach | M | - |

---

## Bugi - do naprawy przed wszystkim innym

### BUG-1 · Zepsuty pointer lock po „Ponów" - S/M - ✅ ZROBIONE (2026-07-13)

> Przyczyną był handler `pointerlockerror`, który mimo odmowy locka odpalał
> `beginPlaying()`. Teraz odmowa pokazuje ekran `screen-lock` („kliknij, aby
> grać" - świeży gest), stan `playing` włącza wyłącznie zdarzenie `lock`,
> a `__test.pointerLock`/`wantLock` wystawiają stan do testów. Opcjonalny
> link „graj bez przechwycenia myszy" zachowuje starą ścieżkę awaryjną.

- Objaw: po kliknięciu „Ponów" kursor myszy nie znika, nie da się celować,
  ESC i inne klawisze przestają działać - gra jest nieużywalna do przeładowania
  strony.
- Prawdopodobna przyczyna: `requestPointerLock()` po restarcie nie dostaje
  locka. Chrome ma **~1,25 s karencji** po wyjściu z pointer locka przez ESC -
  wywołanie w tym oknie kończy się cichym `SecurityError`, a gra już „myśli",
  że działa. Do tego stan `input.js`/ekranów może się rozjeżdżać (gra ruszyła,
  ale handler `pointerlockchange` nigdy nie przyszedł).
- Kierunek naprawy: nie startować rozgrywki „na ślepo" - po kliknięciu
  „Ponów" czekać na faktyczne zdarzenie `pointerlockchange` (albo obsłużyć
  `pointerlockerror` → pokazać nakładkę „kliknij, aby wrócić do gry", jak przy
  pierwszym starcie). Każda ścieżka wejścia do gry (start / ponów / wznów /
  następna misja) musi przechodzić przez jeden wspólny punkt akwizycji locka.
- Test: Playwright nie pokryje prawdziwego pointer locka - do weryfikacji
  ręcznej; w `__test` warto wystawić stan locka, żeby przynajmniej rozjazd
  stanu był widoczny.

### BUG-2 · Brak wyjścia do menu / przerwania misji - S - ✅ ZROBIONE (2026-07-13)

> W pauzie doszedł przycisk „Przerwij misję" / „Wyjdź do menu" (`quitToMenu`):
> kampania robi `mission.abort()` (rollback kredytów jak przy porażce) i wraca
> do wyboru misji; arena zapisuje rekord i wraca na ekran startowy.

- W trakcie gry nie da się wyjść do ekranu startowego - pauza nie daje opcji
  przerwania misji; jedyna droga to przeładowanie strony.
- Dodać w pauzie „Przerwij misję / wyjdź do menu": porzucenie misji
  (rollback kredytów jak przy porażce), `clearArena` + powrót na ekran
  startowy, poprawne zwolnienie pointer locka. W arenie endless analogicznie
  (zapis rekordu przed wyjściem).
- Wiąże się z MENU-1 (docelowo wraca się do nowego menu głównego), ale nie
  ma sensu czekać - opcja w pauzie potrzebna od zaraz.

### BUG-3 · Skróty przeglądarki w grze - S - ✅ ZROBIONE (2026-08-14)

> Kucanie/wślizg na Ctrl przy trzymanym W generowały Ctrl+W (zamknięcie
> karty!), a Ctrl+T/D dokładały karty i zakładki. Tarcza w trzech warstwach
> (input.js): `preventDefault` klawiszy gry i każdej kombinacji z Ctrl
> (przed early-outem `e.repeat` - trzymane W przychodzi jako repeat) + wheel
> z `{passive:false}`; **pełny ekran z Keyboard Lock** przy wejściu do gry
> (opcja „Pełny ekran w grze" w ustawieniach, domyślnie ON - tylko
> w fullscreenie Chrome oddaje stronie Ctrl+W/T); `beforeunload` w trakcie
> biegu zamienia okienkowe Ctrl+W/F5 w pytanie „opuścić stronę?".
> Objaw zgłoszony przy pierwszym graniu wślizgiem (PROP-2).

---

## Ruch gracza

### RUCH-1 · Kucanie - M - ✅ ZROBIONE (2026-07-13)

> Ctrl/C (trzymane): `player.eyeH` lerpuje PLAYER_EYE↔CROUCH_EYE, ruch ×0.55,
> rozrzut z biodra ×0.65, sprint przerwany, płytszy/wolniejszy head-bob.
> Boty celują w `player.pos.y` (LOS mierzył do `player.pos` już wcześniej).

- Klawisz (domyślnie Ctrl/C): obniżenie `PLAYER_EYE` (płynny lerp, nie skok),
  spowolnienie ruchu, mniejszy rozrzut z biodra jako bonus.
- **Boty muszą to widzieć**: ich LOS i punkt celowania mierzą do pozycji oka -
  kucnięcie za niską osłoną ma realnie chować gracza (sprawdzić `enemyFire()`
  i test LOS w enemies.js).
- Interakcje do ogarnięcia: sway/head-bob (inna amplituda w kuckach), ADS
  (dozwolone), sprint (kucanie je przerywa), reset w `resetLevelState`.
- Synergia z PROP-2 (wślizg) i RUCH-2 (kucnięcie pod niskim przesmykiem -
  opcjonalnie później).

### RUCH-2 · Wchodzenie na niskie przeszkody - L

- Dziś podłoże to **płaska płaszczyzna** (`player.pos.y <= PLAYER_EYE`
  w player.js), a kolizje to okrąg-vs-AABB **tylko w XZ** - nie ma pojęcia
  „stania na czymś". Trzeba dodać wysokość podłoża pod graczem: najwyższy
  top collidera pod stopami → grunt; schodzenie z krawędzi = spadanie.
- Do tego **step-up/mantle**: przeszkody niższe niż ~0.5 m pokonywane
  automatycznie, wyższe (do ~1.2 m) skokiem z doskoku.
- Konsekwencje dla AI: gracz na skrzyni jest poza zasięgiem botów naziemnych -
  to jest wprost powód, żeby WAŻKA była częsta (BOT-2): drony karzą camping
  na wysokości. Boty z bronią dystansową i tak dosięgną.
- Uważać na: bunnyhop (`sinceLand` liczone od lądowania - także na skrzyni),
  smugi strzałów botów, spawn pickupów, `__teleport` w testach.

---

## Przeciwnicy

### BOT-1 · Redesign botów - L - ✅ ZROBIONE (2026-08-18)

> Zamiast rzeźbienia sylwetki z emblematu poszliśmy krótszą drogą: wspólne
> podwozie SENTINEL z zewnętrznego modelu CC-BY („Ross by joney_lol via Poly
> Pizza"), z którego bierzemy WYŁĄCZNIE geometrię. Pipeline
> `tools/gen_models.py` → `js/models.js` → `js/modelkit.js` (patrz CLAUDE.md →
> Konwencje → „Modele zewnętrzne"). Materiały, liberie, pas służby, strobo,
> naramienniki, dekor głowy i broń zostają nasze i proceduralne. Reguła
> „kształt głowy = typ" wypadła z CLAUDE.md; typ czyta się z liberii, akcentu,
> rozmiaru sylwetki (0.93 / 1 / 1.14) i dekoru głowy. Nogi jadą na piwotach
> z bind pose'u, broń wisi w gnieździe `handR`. WAŻKA zostaje proceduralna.
> Poprawki po oglądzie (2026-08-18): podwozie urosło do 2,15 m (PATROL ×1.05),
> liberia PATROLU to granat LAPD, emisja paneli zbita do 0.5, a z jednostek
> naziemnych wypadł CAŁY doklejany dekor (koguty, naramienniki, pas służby,
> antena - model ma własną). PATROL trzyma Glocka oburącz w postawie
> izoscelicznej (`poseArm` + odwrotność kwaternionu na mocowaniu broni).
> Do dorobienia: tekstury pancerza z `TexGen` (oznaczenia LSPD, numery
> taktyczne), własne modele SZTURMU i TARANU (mają dostać inne sylwetki niż
> PATROL) i ewentualna decymacja (6,4 tys. trójkątów na bota).

- Ujednolicić sylwetkę wszystkich typów do bota z emblematu gry (źródło:
  `status-1-logo.png`, pipeline `tools/gen_logo.py`) - jedna rodzina designu
  zamiast obecnych „kółek i kwadratów per typ".
- **Usuwamy regułę kształt-głowy→typ** (obecnie wymaganą w CLAUDE.md - przy
  realizacji zaktualizować konwencje). Rozpoznawalność typów zostaje na:
  liberii (kolor pancerza), kolorze/kształcie oka, akcentach (antena, daszek,
  obręcz) i **rozmiarze sylwetki** (scout smukły, heavy masywny).
- Nowe tekstury przez `TexGen` (płyty pancerza, oznaczenia LSPD, numery
  taktyczne). Budżet trójkątów pilnować - boty spawnują się dziesiątkami
  (helpery `enemyBox`/`enemyCyl` zostają).
- Zostają w mocy: przód = lokalne +Z, `userData.isHead` na głowie,
  `userData.enemyRef` na każdym meshu, biały pas służby + strobo.

### MENU-3 · Bestiariusz dronów - M - ✅ ZROBIONE (2026-08-18)

> `js/bestiary.js` + ekran `screen-bestiary` z menu głównego: lista czterech
> jednostek, obracający się model w osobnej scenie (ten sam composer, jak
> panorama), karta z uzbrojeniem, opisem i danymi czytanymi wprost
> z `ENEMY_TYPES`. Testy: `tests/bestiary_test.py`.
> Do rozważenia: odblokowywanie wpisów dopiero po pierwszym spotkaniu
> jednostki i podgląd bossa SENTINEL-1.

### BOT-2 · WAŻKA jako częsty, prosty przeciwnik od początku - M - ✅ ZROBIONE (2026-07-13)

> Rebalans (hp 30, dmg 3, acc 0.45, 120 pkt / 10 kr), wpisy w `waves[]`
> od S-01 (i w bramach S-06), fale areny z uav od fali 1, formuła endless
> dostała człon uav. S-01 zapowiada WAŻKĘ w odprawie i linii SYSTEMU.

- Obecnie UAV to rzadkość - ma być podstawowym, tanim przeciwnikiem obecnym
  praktycznie od pierwszych misji (fabularnie pasuje: drony latające to
  najtańsza linia SENTINEL).
- Rebalans: mniej HP, słabszy ostrzał, może wariant „rój" (2-3 naraz).
  Wpisy w `waves[]` misji od S-01, mix w arenie endless od wczesnych fal.
- Dropy: zostaje amunicja (`rollDrop`).
- Zależność zwrotna: RUCH-2 robi z WAŻKI kontrę na camping na skrzyniach.

---

### BOT-3 · Rework przeciwników: modele, animacje, bronie - L

Kontynuacja BOT-1: podwozie stoi, ale wszystkie typy naziemne dzielą JEDEN
model, ruszają się dwoma piwotami nóg i trzymają tego samego Glocka.

- **Modele per typ**: osobne sylwetki dla SZTURMU i TARANU (dziś tylko skala
  0.93 / 1 / 1.14 i kolor liberii). Źródło: kolejne modele CC0/CC-BY przez
  `tools/gen_models.py` albo mocniejsza nadbudowa proceduralna. Reguła
  „NIE doklejamy dekoru" (decyzja 2026-08-18) zostaje - różnica ma być
  w geometrii źródłowej, nie w naklejanych bryłach.
- **Animacje**: dziś noga macha sinusem, a ramię stoi w jednej pozie
  (`poseArm`). Do zrobienia: cykl chodu z fazą (krok/dosun, pochylenie przy
  szarży), **animacja śmierci** (upadek zamiast zniknięcia), **flinch** po
  trafieniu, przeładowanie. Do decyzji: czy pipeline wypieka klipy animacji
  ze źródła (model ma skinning i `inverseBindMatrices`), czy dalej kręcimy
  piwotami części ręcznie - klipy są ładniejsze, ale to spora zmiana
  w `gen_models.py` i `modelkit.js`.
- **Bronie botów**: karabin dla SZTURMU, strzelba dla TARANU zamiast Glocka
  u wszystkich. Po BRON-1 modele już będą - gniazdo `handR` + odwrotność
  kwaternionu ramienia uniosą każdą bryłę. Za bronią idą dźwięki
  (`enemyShot` ma już pozycję 3D) i zasięgi z `ENEMY_TYPES`.
- **Budżet trójkątów**: 6,4 tys. na bota × dziesiątki sztuk na arenie -
  przy nowych modelach **decymacja obowiązkowa** (dziś odsunięta „do
  dorobienia" w BOT-1).
- Bez zmian: przód = lokalne +Z, `userData.isHead` na głowie,
  `userData.enemyRef` na każdym meshu, geometrie cache'owane
  (`_modelGeoCache`), wpis w bestiariuszu (MENU-3) jedzie z `ENEMY_TYPES`.

### BOT-4 · System statusów gracza (stun / daze) - M · **PREREKWIZYT dla BOT-5, BOT-7, BOT-8, BOT-9**

Tonfa RIOTA, ładunek porażający MECHA, gaz łzawiący, granat prądowy i wariant
oszałamiający wieżyczki to jedno i to samo zjawisko widziane z pięciu stron.
Jeden system, zanim powstanie pierwszy z nich - inaczej każdy przeciwnik dorobi
własną wersję i nie da się tego zbalansować.

- `player.stun` - paraliż: blokada ruchu (obrót kamery ZOSTAJE wolny, jak przy
  `radioHoldT` - odbieranie myszy w FPS-ie jest nie do przyjęcia).
- `player.daze` - oszołomienie: rozmycie ekranu, spowolnienie, przytłumienie
  miksu (`duckFilter` już to potrafi).
- Oba z czasem trwania i wygaszaniem; jedno miejsce w `updatePlayer`, jedno
  w HUD-zie, jedno w audio, reset w `resetLevelState`, podgląd w `__test`.
- **Anti-frustracja:** krótko (0,4-0,8 s), z telegrafem przed trafieniem
  i krótką odpornością po wyjściu ze stanu, żeby kilka jednostek nie zapętliło
  gracza w bezruchu.

### BOT-5 · Warianty SENTINELA (pałka, paralizator, glock, karabin, strzelba) - S

Najtańsze urozmaicenie fal w całej roadmapie: to samo podwozie, inna broń
w gnieździe `handR`. Modele broni są już wypieczone, `poseArm` uniesie każdą
bryłę, więc wariant = wpis w `ENEMY_TYPES` + inny `buildModel` w ręce
(+ dźwięk w `enemyShot` i zasięg). Pałka wchodzi w zwarcie i ogłusza (BOT-4),
paralizator robi to na dystans. Zazębia się z BOT-3 („bronie botów").

### BOT-6 · DRON - następca WAŻKI na modelu Stinger - M

Model `assets_src/Stinger Drone by Aaron Clifford - 6CUQX98vha4.glb`
(CC-BY → kredyt w README). Mechanika lotu zostaje bez zmian (`fly` +
`resolveCollisions(..., minTop)`), nowa jest sylwetka i profil balansowy:
**mały damage, wysoka prędkość, groźny w roju** (3-6 sztuk). Balans idzie
w liczebność, nie w HP - to przeciwnik od zarządzania tłumem.

### BOT-7 · RIOT - tarcza i zwarcie - L (po BOT-4)

Podwozie ROSS + tarcza (`assets_src/Police Shield by CreativeTrio`) w lewej
ręce, tonfa w prawej. Rola: **idzie PRZED grupą i osłania ją tarczą**.
Trzy nowe mechaniki:

- **Kierunkowa redukcja obrażeń** - trafienia w stożek przodu pochłania tarcza.
  Własny mesh z `userData.shieldRef` (NIE `enemyRef`, inaczej policzy się jako
  trafienie w bota); tarcza ma osobne HP i może paść.
- **Formacja** - RIOT trzyma się na linii gracz↔centroid grupy, między nimi.
  Prosty sterownik pozycji docelowej, bez pełnej nawigacji (ta jest w PROP-3).
- **Ogłuszenie w zwarciu** - uderzenie tonfą daje `daze` + krótki `stun`
  z systemu BOT-4.

Pętla, o którą tu chodzi: **obejdź tarczę zamiast strzelać w nią** - domyka ją
walka wręcz (BRON-5).

### BOT-8 · RIOT LETHAL - S (po BOT-7)

To samo podwozie i tarcza, ale zamiast tonfy pistolet (`weapon: 'pistol'`) -
osłania grupę i strzela zza tarczy. Po BOT-7 prawie darmowy: różnica to broń
w ręce i wpis w `ENEMY_TYPES`.

### BOT-9 · SENTRY / wieżyczka - M (po BOT-4)

Przeciwnik **stacjonarny**: statyczna podstawa + obrotowa głowica, skanuje stożek o zadanym zasięgu i otwiera ogień
po wykryciu gracza (średnie obrażenia, wysoka szybkostrzelność). Stawiana
w ciasnych przejściach - jej rolą jest **odmawianie terenu**, nie pościg:
zamyka korytarz, dopóki gracz go nie obejdzie albo nie zniszczy wieżyczki.
Jedyny przeciwnik w spisie, który karze stanie w miejscu na dystansie (reszta
albo szarżuje, albo jest wolna), więc warto ją zrobić wcześnie.

- **Telegraf obowiązkowy** (decyzja użytkownika 2026-08-18): ~sekunda
  namierzania ze świecącą głowicą, ZANIM padnie pierwszy strzał. Ma być
  zagadką „przebiegnij albo obejdź", nie strzałem z zaskoczenia w ciemnym
  korytarzu.
- **Model wybrany (2026-08-18): Space Kit Kenneya, CC0**
  (https://poly.pizza/l/M8xXmqhHiU). Trzy powody: CC0 (zero warunków),
  **GLB w pobraniu - wchodzi do `gen_models.py` bez konwersji przez Blendera**
  (jedyna pozycja w spisie przeciwników bez tego kroku), a paczka zawiera
  **dwa turrety: `Turret` i `Double Turret`**. To daje wariantom RÓŻNE
  SYLWETKI za darmo - gracz musi rozpoznać z odległości, czy wieżyczka go
  zabije, czy tylko zablokuje przejście; sam kolor na to nie wystarczy.
  Propozycja: pojedyncza lufa = oszałamiająca, podwójna = letalna.
  Zastrzeżenie: to kit SPACE, więc sci-fi, nie policja z Los Santos -
  przy turrecie nieszkodliwe (neutralna bryła, materiały nadajemy własne).
  *Alternatywa odrzucona:* turret ze Sketchfaba
  (`free-turret-low-poly-640f6c10...`) - strony nie dało się zweryfikować
  (renderuje się JS-em), więc licencja i formaty NIEPOTWIERDZONE. Wracać
  do niej tylko po ręcznym sprawdzeniu licencji.
- **Warianty w duchu policyjnym**: letalna (pociski) i oszałamiająca
  (`daze`/`stun` z BOT-4 zamiast obrażeń - blokuje przejście, nie zabija).
  Wariant oszałamiający jest mocniejszy projektowo: nie kończy biegu, więc
  można go stawiać gęściej i agresywniej.
- **Bot czy prop?** Technicznie bliżej jej do propa (zero nawigacji
  i anti-stucka), ale prop odcina ją od fal, dropów i licznika zabójstw.
  Rekomendacja: typ w `ENEMY_TYPES` z prędkością 0 i pominiętą nawigacją -
  reżyser fal i ekonomia działają wtedy bez wyjątków. Własny collider, HP
  i kierunkowy stożek widzenia i tak dochodzą.

### BOT-10 · MECH - mini-boss - XL (po BOT-4, BOT-9)

Najcięższy przeciwnik, służy w rejonach o najwyższej przestępczości.

**Model wybrany (2026-08-18): „Modular Mech" rcorre, CC BY 4.0**
(https://rcorre.itch.io/modular-mech) - kredyt w README obowiązkowy.
Wybrany z trzech kandydatów; dwa pozostałe odpadły na licencji, nie na
wyglądzie, i **nie wolno do nich wracać**:

- *Practice Mech* (normansoftworx) - licencja zakazuje redystrybucji, a my
  commitujemy plik źródłowy do `assets_src/` razem z wynikiem. Konflikt
  wprost z zasadą odtwarzalności zasobów.
- *Mech* (hackeddesign) - CC BY-**NC-SA**: NC zamyka komercjalizację na
  stałe, SA jest zaraźliwe.

Dlaczego rcorre pasuje technicznie:

- **Weapon attachment points jako Empty objects** = nasze `sockets`
  z `gen_models.py` (jak `handR`) - gotowe piwoty pod gatling i wyrzutnie,
  bez zgadywania.
- **Osobna, obracana głowa** - dokładnie to, czego wymaga „wolny obrót,
  groźny tylko na linii ognia"; ta sama mechanika co głowica w BOT-9.
- **Model jest modularny** - podział na części wyjdzie po węzłach, czysto,
  zamiast po dominującym joincie.
- **Ma animacje chodu** - materiał na BOT-3, gdyby doszło do wypiekania klipów.

⚠️ **Konwersja:** źródło to .blend/FBX/Godot, a `gen_models.py` czyta glTF.
Potrzebny jednorazowy eksport do `.glb` w Blenderze; do `assets_src/` trafia
ten `.glb`. Pixel-artowa paleta AAP-64 jest bez znaczenia - wypiekamy SAMĄ
geometrię, kolory nadaje nasz resolver materiałów.

⚠️ **Groza nie jest w sylwetce.** To stylizowany low-poly walker, więc
„wielki i przerażający" musi zrobić **skala i zachowanie**: duży `scaleMul`,
wolny obrót, dudnienie kroków w audio, wstrząs kamery. Sam model tego nie
udźwignie.

Uzbrojenie:

- **Gatling** - nowy `weapon: 'gatling'`: rozkręcanie lufy (telegraf!), długa
  seria, wysoka szybkostrzelność, niska celność.
- **Ładunki porażające** - trafienie = `stun`.
- **Granaty łzawiące** - `daze` (rozmycie, oszołomienie, spowolnienie).
- **Obszarowe granaty prądowe** - strefa, w której gracz jest sparaliżowany,
  póki z niej nie wyjdzie.

Projektowany tak, żeby **ucieczka była lepsza niż walka**: duże HP, wolny
obrót, groźny wyłącznie na linii ognia. Ostatni w kolejce - największy zakres
prac (cztery nowe systemy broni naraz), mimo że model jest już wybrany.

### BOT-11 · Pojazdy dostawcze - widoczne źródło spawnów - L (po BOT-6)

Dziś boty **pojawiają się z powietrza, bez uzasadnienia** - reżyser fal
stawia je na spawnach i tyle. Pojazd, który wjeżdża albo nadlatuje, zrzuca
jednostki i odjeżdża, zamienia spawn w **wydarzenie, które gracz widzi
i może uprzedzić**: słychać nadjeżdżający transporter, wiadomo, z której
strony przyjdzie fala, opłaca się tam być pierwszym. To jest właściwy powód
tej pozycji - fabuła jest dodatkiem.

Modele (oba GLTF/GLB - **bez konwersji przez Blendera**):

- **M939 Truck** by J-Toastie, CC BY 3.0 (https://poly.pizza/m/y8lBpvMlim) -
  transporter NAZIEMNY. Podjeżdża, otwiera się, wysypują się drony i roboty.
  Ten sam autor co Glock i FPS Arms, więc styl się klei. Pasuje do LSPD
  bez zgrzytu.
- **Speeder ze Space Kitu Kenneya**, CC0 (ta sama paczka co BOT-9) -
  **wyłącznie jako unoszący się dropship**, nie jako pojazd naziemny.
  „Spacecraft speeder" jako radiowóz w Los Santos to rozjazd ze światem;
  jako maszyna zrzucająca rój dronów w powietrzu broni się bez problemu.

Zakres techniczny:

- Pojazd to **prop z animacją trasy**, nie bot: wjazd po zadanej ścieżce,
  postój na czas zrzutu, odjazd. Zero nawigacji i anti-stucka.
- **Spawn przypięty do pojazdu** - reżyser fal (`waves.js`) dostaje nowy
  rodzaj punktu spawnu: „przy pojeździe X, gdy dojedzie". Jednostki wychodzą
  z drzwi/luku (socket na modelu), a nie materializują się w powietrzu.
- **Collider tylko przy pojeździe naziemnym** - stojący M939 staje się
  osłoną taktyczną na środku areny (i zmienia układ walki na czas fali).
  Dropship wisi wysoko, więc nie koliduje.
- **Audio jest połową efektu**: silnik z dopplerem na dojeździe, syk luku,
  łomot lądujących jednostek. Wszystko syntetyczne, z pozycją 3D
  (`tone`/`burst` przyjmują `pos`).
- Do decyzji: czy pojazd da się zniszczyć (przerwanie zrzutu = realna
  nagroda za agresję), czy jest nietykalny jak dekoracja.

---

## Bronie

### BRON-1 · Rework broni na modele 3D - L - ✅ ZROBIONE (2026-08-18)

> Wszystkie pięć broni jedzie na wypieczonych modelach (`tools/gen_models.py`
> → `js/models.js`, materiały nasze): Glock (pistolet - jedyny spoza paczki,
> decyzja użytkownika) plus **cztery bronie z JEDNEJ paczki Quaterniusa
> (CC0)**: SMG jako nowa 5. broń w slocie [2] (id `smg`), strzelba, karabin
> i snajperka (dwa ostatnie modele wskazane przez użytkownika).
> Pierwsze podejście szło na realistycznych modelach (MP5SD, Mossberg 590A1) -
> wypadły, bo przy smukłych proporcjach czytały się za drobno obok
> stylizowanych brył Quaterniusa; materiały całej rodziny idą teraz przez
> jeden resolver `quatMat()` używający materiałów Glocka (`vmMatDark` +
> `vmMatMid`) - bez drewna i bez osobnej czerni, żeby cała piątka wyglądała
> na jedną rodzinę sprzętu. Modele są celowo PONAD wymiary rzeczywiste
> (length: SMG 1.00, strzelba 1.45, karabin 1.05, snajperka 1.58) i kotwiczone
> ZA TYŁ (kolba na stałym z, przyrost skali idzie w ekranowy rozmiar chwytu,
> a kolby nie łykają kamery przy ADS); po oglądzie SMG i snajperka poszły
> 0.10 bliżej kamery, a cała czwórka 0.03 niżej od pistoletu - `adsPos`
> kompensuje oba przesunięcia, więc pozycja celowania się nie zmienia. Punkty celownicze to drobne zielone
> emitery na przyrządach WSZYSTKICH pięciu broni (z Glockiem włącznie) -
> odlane muszki były ciemne na ciemnym i niewidoczne;
> widoczność kropek pilnuje raycast w `tests/shots_weapons.py` (wyłapał, że
> kropka SMG celowała w mostek zabudowanej szyny). Pipeline dostał flagę
> `bindWorld` (rigi, których IBM nie znosi się z grafem węzłów - użyta przy
> nieaktualnym już Mossbergu). Wyrównanie ADS zweryfikowane liczbowo
> (odchył ≤0.002 NDC). Dźwięki: SMG ma stłumiony strzał, karabin własny
> (`shot('rifle')`). Sklep: `w_smg` 50 kr → `w_shotgun` 80 → `w_rifle` 110
> → `w_sniper` 140.
> **Aktualizacja 2026-08-21 - strzelba wróciła na Mossberga.** Zgłoszenie
> użytkownika: model nie czytał się jak strzelba, tylko jak karabin
> powtarzalny, bo strzelba Quaterniusa NIE MA łoża - rura magazynka biegnie
> goła do komory. Pompki nie dało się z niej wyciąć (`split` nie ma czego
> wyciąć), więc slot 3 dostał **Mossberga 590A1 by J-Toastie [CC-BY]**, ten
> sam autor co Glock i ręce. Model jest rigowany, łoże to osobna kość, więc
> pompka chodzi naprawdę - i to nie tylko przy przeładowaniu: cykluje po
> KAŻDYM strzale, razem z dłonią wsparcia. Zarzut „za drobne" z pierwszego
> podejścia go nie dotyczy: proporcjonalnie jest wyższy od poprzednika
> (wys/dł 0,203 vs 0,164, czyli 0,295 m zamiast 0,238 przy `length` 1.45).
> Przyrządy to ghost ring, więc kropka siedzi w środku apertury; `adsPos.z`
> zszedł na -0.40, bo lita kolba przy -0.54 zajmowała prawą połowę ekranu
> (ta sama decyzja co przy SMG). Chwyt obu rąk przeliczony od zera
> (`tests/shots_weapons.py`: kropka w osi, ucięte końce ramion poza kadrem
> 1.43/9.00); dostrojenie na oko zostaje do DEVRIG.
>
> Do rozważenia: cięższy dźwięk snajperki i animacja cyklu zamka Glocka
> (część `slide` czeka w userData, dziś rusza tylko przy przeładowaniu).

Docelowe pierwowzory (sylwetka i charakter, nie kopia 1:1):

| Broń w grze | Model |
|---|---|
| Pistolet [1] | Glock by J-Toastie [CC-BY] |
| SMG [2] | Submachine Gun by Quaternius [CC0] |
| Strzelba [3] | Mossberg 590A1 by J-Toastie [CC-BY] |
| Karabin (auto) [4] | Assault Rifle by Quaternius [CC0] |
| Snajperka [5] | Sniper Rifle by Quaternius [CC0] |

- Ścieżka: model CC0/CC-BY → `tools/gen_models.py` (`--probe` na orientację
  i granice) → wpis w `MODELS` → `buildModel` z naszą mapą materiałów.
  Proceduralne bryły zostają tylko jako plan B dla broni, dla której nie
  będzie sensownego źródła.
- **Przyrządy z odlewu, nie doklejane** (decyzja 2026-08-18): geometrię
  muszki i szczerbinki mierzyć probem po `js/models.js` (najwyższe wierzchołki
  części zamka, kubełkowane po Z, POTEM po X), różnicę wysokości znosić
  przechyłem całego modelu, `adsPos` weryfikować liczbowo
  (`vm.localToWorld(punkt).project(camera)` → środek ekranu).
- Te same modele trafiają do rąk botów (BOT-3) - gniazdo `handR` już to unosi.
- Kontrakt bez zmian: każda broń musi mieć działające `adsPos` (muszka
  w osi kamery), nigdy nie przybliżać viewmodelu do kamery (near plane 0.08).
  Three-dot proceduralny dokładamy tylko tam, gdzie model nie ma własnych
  przyrządów.
- Przy okazji: dopasować dźwięki strzałów do nowego charakteru broni
  (Barrett powinien mieć wyraźnie cięższy strzał niż obecna snajperka).

---

### BRON-2 · Ręce gracza na viewmodelu - S/M

Dziś broń wisi w kadrze bez rąk. Ręce dopięte jako **dzieci grupy viewmodelu**
(`camera.add(g)` w `weapons.js`) jadą za darmo z ADS-em, odrzutem,
przeładowaniem i sway'em - zero riggingu, zero IK. Dłoń jest sztywno
przyklejona do chwytu, bo w FPS nie widać, że się nie zgina.

- **Proceduralnie, nie z pipeline'u.** `tools/gen_models.py` daje samą
  geometrię w bind pose, a statyczna dłoń nie owinie się wokół chwytu Glocka
  i łoża AR tak samo - trzeba by pozować ją per broń albo wypiekać skinning.
  Helper `vmHand(parent, x, y, z, rot)` obok `vmBox`/`vmCyl`: dłoń = spłaszczony
  box, kciuk = mały box, przedramię = `vmCyl` w rękawie. Nowe materiały:
  `vmMatGlove` (czarna taktyczna rękawica, wysokie `roughness`) i `vmMatSleeve`
  (granat LSPD `0x30528c`, ten sam co liberia PATROLU).
- **Near plane 0.08**: przedramię NIE może iść w stronę kamery - urwać je na
  krawędzi kadru. Ta sama zasada co „nigdy nie przybliżaj broni do kamery".
- **Muszka jest święta**: przy ADS trzy kropki (albo odlane przyrządy Glocka)
  muszą zostać czyste. Dłoń wspierająca siedzi na łożu, poniżej linii
  celowania. Jeśli zasłania - przesuwamy DŁOŃ, nigdy `adsPos`.
- **Oświetlenie**: viewmodel łapie światła sceny, płaska czarna rękawica
  zniknie w ciemnej arenie - jaśniejsze szwy albo tealowy akcent na nadgarstku.
- Snajperka gratis (`zoom: true` chowa cały viewmodel). Weryfikacja zrzutami
  (`tests/shots2.py`) - na ciemnym viewmodelu okiem tego nie ocenisz, jak przy
  przyrządach Glocka.
- **v2 (opcjonalnie)**: rozdzielenie dłoni na osobną podgrupę, żeby przy
  przeładowaniu ręka wyciągała magazynek. Dziś animuje się cała grupa i dłonie
  jadą z bronią - to wystarcza na start.
- Kolejność: **po BRON-1 dla danej broni** (ręka musi trafić w chwyt gotowego
  modelu). Pistolet da się zrobić od zaraz. Szacunek: ~1 h na pistolet,
  ~3 h na komplet.

---

### BRON-3 · Animacja inspekcji broni - S

Klawisz **F**: postać obraca broń w dłoni i ogląda ją z bliska, jak w Counter-
Strike. Czysty smaczek - nie wpływa na rozgrywkę, ale to najtańszy sposób,
żeby pokazać wypieczone modele z BRON-1 i ręce z BRON-2.

- **Gdzie**: nowy stan obok `reloadTimer` w `js/weapons.js` (`inspectTimer` +
  `inspectDuration`) i gałąź w `updateViewmodel(dt)` - ta sama mechanika, co
  animacja przeładowania, tylko dłuższa i bez skutków w logice.
- **Ruch**: broń wyjeżdża do środka kadru, obraca się wokół osi Y (pokazać
  drugą stronę zamka), lekki przechył na X, powrót do `VM_BASE`. Krzywa
  ease-in-out, ~2,5-3 s. **Nigdy nie przybliżać do kamery** (near plane 0.08)
  - „bliżej" robimy obrotem i wjazdem do środka kadru, nie zmniejszaniem `z`.
- **Przerywalność**: strzał, ADS, przeładowanie, zmiana broni i sprint
  natychmiast anulują inspekcję (`inspectTimer = 0`), bez blokowania inputu.
  Gracz nigdy nie może przez to zginąć.
- **Blokady**: nie startuje przy `game.noCombat`, w trakcie przeładowania,
  przy `zoom: true` z aktywną lunetą i poza stanem `playing`.
- **Klawisz F trzeba dopisać do `GAME_KEYS`** w `js/input.js:21` - inaczej
  wypada z tarczy skrótów i z listy Keyboard Lock (BUG-3).
- Dźwięk: cichy szczęk metalu przez `AudioSys` (helper `tone`/`burst`,
  z `jitter`) - bez pozycji, to dźwięk „przy uchu".
- Per broń: docelowo osobna krzywa dla każdej (rewolwerowy obrót Glocka vs
  pokazanie lunety Barretta), ale v1 może być jedna wspólna dla wszystkich.
- Kolejność: **po BRON-1 i BRON-2** - inspekcja pustej bryły bez rąk nie ma
  czego pokazywać. Szacunek: ~2 h na wspólną animację, ~1 h na wariant per broń.

---

### BRON-4 · Dodatki do broni - M · REKOMENDACJA: TAK, ale w wersji kosmetycznej

Kolekcja „Gun Attachments" (Pichuliru, poly.pizza/l/IdFEbWDKa8): tłumik,
chwyt przedni, latarka, laser, red dot, holo, celownik powiększający, luneta,
luneta karabinowa. Pasuje do naszego pipeline'u wprost - to te same `.glb`,
co bronie z BRON-1, więc idą przez `tools/gen_models.py` bez nowej mechaniki.

**Dlaczego TAK:** trzy z pięciu broni mają dziś przyrządy tak ciemne, że
musiały dostać sztuczną zieloną kropkę (`vmMatDot`). Odlany red dot albo
holo rozwiązuje to u źródła - świecąca siatka JEST celownikiem, zamiast
doklejanego emitera. Do tego pięć broni zaczyna wyglądać jak system sprzętu,
a nie jak pięć osobnych brył.

**Dlaczego NIE robimy z tego systemu modyfikacji:** pełne „przypnij dodatek
w Zbrojowni" to nowy ekran UI, nowy wymiar balansu (celność/rozrzut/ADS per
kombinacja), zapis konfiguracji w `status1_save` i przeliczanie `adsPos` dla
KAŻDEJ pary broń+optyka. Przy jednej arenie i jednym typie bota to koszt
bez pokrycia w rozgrywce.

**Zakres v1 (kosmetyka, ~3-4 h):**
- 2-3 modele do `MODELS` w `gen_models.py`: red dot, holo, tłumik.
  Konwencja jak przy broniach - `--probe` na orientację, `center: True`,
  materiały nasze przez `quatMat()` (rodzina ma zostać spójna).
- Montaż na sztywno w `buildViewmodel()`, jeden dodatek na broń, doklejony
  do roota viewmodelu: red dot na karabinie i SMG, holo na strzelbie,
  tłumik zostaje przy SMG (dziś jest częścią bryły). Snajperka i Glock bez
  zmian.
- **Świecąca siatka zamiast `vmMatDot`**: mały emiter w środku szkła
  celownika (ten sam zielony `0x00ff44`), ale osadzony w odlanym korpusie -
  wtedy przestaje wyglądać jak kropka wisząca nad muszką.
- **`adsPos` trzeba przeliczyć od zera** dla każdej broni z optyką: linia
  celowania idzie teraz przez środek szkła, nie przez muszkę. Przechył
  modelu (`root.rotation.x`) prawdopodobnie zjedzie do zera - odlana optyka
  jest równoległa do lufy, a to muszka ze szczerbinką się nie zgadzały.
  Weryfikacja liczbowa `tests/shots_weapons.py` (raycast po osi kamery musi
  trafić w emiter siatki, odchył ≤0.002 NDC) - bez tego ani kroku.
- Uwaga na near plane 0.08: optyka podnosi bryłę, przy ADS łatwo o wjazd
  w kamerę - `adsPos.z` odsuwać, nigdy nie przybliżać.
- Licencja: sprawdzić przy pobieraniu (poly.pizza nie pokazuje jej w liście);
  bierzemy tylko CC0/CC-BY, `.glb` do `assets_src/`, autor do README.

**v2 (dopiero gdyby gra urosła):** wybór optyki w Zbrojowni jako pozycja
sklepu `att_*` per broń, z `adsPos` w danych `WEAPONS` zamiast na sztywno
w `buildViewmodel()`. Sens ma dopiero po PROG-1 (drzewko) - inaczej to
kolejna rzecz do kupienia za kredyty, która nic nie zmienia.

Kolejność: po BRON-1 (jest), **przed BRON-2** - ręka wspierająca ma trafić
w chwyt przedni, jeśli go dołożymy.

### BRON-5 · Walka wręcz - M (razem z BOT-7)

Klawisz melee (V albo F) z modelami **noża** i **pałki/tonfy** jako
viewmodelami. Krótki zasięg, wysokie obrażenia, natychmiastowe, bez amunicji -
naturalna odpowiedź na RIOTA (BOT-7), który sam wchodzi w zwarcie.

- **Trafienie z boku lub tyłu RIOTA omija tarczę** - to domyka pętlę „obejdź
  tarczę zamiast strzelać w nią" i jest głównym powodem, dla którego ta pozycja
  istnieje. Robić razem z BOT-7, nie osobno.
- Modele przez `tools/gen_models.py` jak reszta broni; pałka/tonfa to ten sam
  rekwizyt, co u wariantu SENTINELA z BOT-5 - jedna geometria, dwa zastosowania.
- Zasady viewmodeli bez zmian: brak ADS, więc **bez przyrządów i bez zielonej
  kropki**; animacja zamachu NIE zbliża bryły do kamery (near plane 0.08) -
  ruch idzie w bok i w dół, nie w głąb kadru.
- Do decyzji: osobny slot (klawisz 6) czy szybki atak nakładany na bieżącą broń
  bez jej chowania. Drugie jest lepsze w walce, pierwsze tańsze w kodzie.

---

## Menu i oprawa

### MENU-1 · Menu główne z animowaną panoramą Los Santos - L - ✅ ZROBIONE (2026-08-14)

> Zrealizowane wg rekomendacji: lekka scena Three.js w `js/menubg.js`
> (3 pasma wieżowców z boxów + okna z `TexGen.makeCityWindows`, neony,
> drony SENTINEL ze strobo, reflektory, smog, dryf kamery), renderowana
> współdzielonym composerem (bloom gratis) przez przełączenie `renderPass`
> w `tick`. Układ menu w stylu Cyberpunka (kolumna po lewej, pozycje
> tekstowe), panorama w tonacji niebiesko-czerwonej z doświetlonym dołem
> kadru. Menu: Kampania / Arena bez końca / Zbrojownia / Ustawienia /
> Statystyki; stary ekran startowy został jako ekran wejścia do areny.
> HUD rozgrywki chowany na ekranach nawigacji (`body.menu-bg`).
> Szczegóły w CLAUDE.md (Konwencje techniczne → Menu główne);
> testy: `tests/menu_test.py`.

### MENU-2 · Synth-ambient w menu (SUNO) - M + decyzja

⚠️ **Koliduje z twardą zasadą projektu** („audio w 100% syntetyczne, SUNO
rozważone i odrzucone" - CLAUDE.md). Powód odrzucenia był techniczny
(przy `file://` plik audio wypada poza graf WebAudio) - ale **jest droga
obejścia, której wtedy nie rozważono**:

- Utwór zakodowany jako **base64 w pliku JS** (jak tekstury) → `atob` →
  `ArrayBuffer` → `decodeAudioData` → `AudioBufferSourceNode`. Zero fetch,
  zero CORS, działa z `file://`, a dźwięk **zostaje w grafie WebAudio**
  (limiter, ducking, crossfade do muzyki proceduralnej przy starcie gry).
  Do zweryfikowania testem Playwright przed commitem do planu.
- Koszt: ~1 MB/min przy 96 kbps mono + 33% narzutu base64 → pętla 1,5-2 min
  ≈ 2-2,5 MB w repo. Akceptowalne dla jednego utworu menu; nie skalować tego
  na całą ścieżkę dźwiękową.
- Zasada po zmianie: **wyjątek tylko dla menu** (ambient nie musi reagować
  na rozgrywkę - `moodBlend` i sidechain nie są potrzebne); w rozgrywce
  muzyka zostaje proceduralna. Licencja: wymaga płatnego planu SUNO
  (komercyjne prawa do outputu).
- Plan B (gdyby weryfikacja `file://` zawiodła): ambient proceduralny na
  istniejącym sekwencerze (nowy mood „menu" - rozstrojone pady już są).

### MENU-4 · Panorama menu z modeli 3D zamiast boxów - M (po MAPA-1)

- Wieżowce w `js/menubg.js` to dziś `BoxGeometry` z teksturą okien. Podmienić
  na moduły **City Kitu** (Kenney, CC0 - patrz MAPA-1), a sylwetkę horyzontu
  na **Blocks Skyline** (jedna bryła, daleko, utopiona w mgle).
- Zostaje bez zmian: stały seed (miasto identyczne co boot), neony
  `multiplyScalar(2.8)` (inaczej ACES zjada je do pasteli), tonacja
  niebiesko-czerwona, doświetlony dół kadru, drony SENTINEL ze strobo,
  współdzielony composer i `menuBgActive()`.
- **Okna to ryzyko**: dziś `TexGen.makeCityWindows` siada na UV boxa. Moduł
  kitu bez UV będzie płaską plamą - albo atlas z MAPA-1, albo emissive
  per moduł. Bez tego panorama zgaśnie i będzie gorzej niż dziś.
- Wydajność: 3 pasma wieżowców → `InstancedMesh` per element kitu.
  Testy `tests/menu_test.py` muszą przejść bez zmian (`__test.menuBg`).

### PROP-12 · Panorama miasta jako skybox w rozgrywce - M

- Ta sama panorama co w MENU-1, użyta jako tło aren (za murami granicznymi):
  sylwetki wieżowców na horyzoncie zamiast czystego nieba. Buduje spójność
  „symulacje dzieją się w hali treningowej w mieście" i jest naturalnym
  krokiem do SCENA-1. Generowana raz do `CanvasTexture`/geometrii low-poly.

### MENU-5 · Przebudowa całego UI w stylu menu głównego (cyberpunk) - M

Menu główne (MENU-1) ma spójny, cyberpunkowy język wizualny: lewa kolumna
na półprzezroczystym gradientowym panelu, tekstowe pozycje zamiast guzików,
tealowa ramka na aktywnej, czerwień na reszcie, hover przebarwiający na teal,
stempel wersji na dole. **Reszta interfejsu jest wciąż w starym stylu**
(zwykłe przyciski, prostokątne panele) - HUD, pauza, sklep/Zbrojownia,
ustawienia, ekrany końca/wygranej, statystyki, bestiariusz, odprawy misji,
`screen-lock`, panel dev.

Cel: **jeden język dla całego UI**, wyprowadzony z menu, a nie dziesięć
wariantów. Zakres:

- **Tokeny w `styles.css`** (kolory, ramki, gradienty panelu, typografia,
  stany hover/active) jako zmienne CSS - żeby nowy ekran dziedziczył styl,
  zamiast go kopiować. To jest właściwa robota tej pozycji; przemalowanie
  ekranów bez tokenów po prostu powtórzy problem.
- **Wspólne klasy komponentów**: panel, lista pozycji, przycisk pierwszo-
  i drugorzędny, nagłówek ekranu (`.screen-mark` już istnieje), wiersz
  ustawień, kafel sklepu.
- **HUD** w tym samym języku: kreskowane ramki, tealowe akcenty, złoto na
  kredytach/headshotach (paleta z CLAUDE.md zostaje bez zmian).
- **Bez zmian w markupie tam, gdzie się da** - `index.html` ma statyczne
  placeholdery `[data-icon]` obsługiwane RAZ przy ładowaniu; przebudowa
  markupu dynamicznych ekranów musi sama wstawiać `UI_ICONS[key]`.

Uwaga na czytelność: menu jest na ciemnej panoramie i może pozwolić sobie na
niski kontrast, **HUD w trakcie walki nie może** - te same tokeny, ale HUD
dostaje mocniejsze tło pod tekstem. Ekrany po rozgrywce (pauza/over/won) leżą
na zamrożonym świecie gry, nie na panoramie, więc też potrzebują własnego
przyciemnienia.

Do decyzji: czy robić to jednym przejściem, czy ekran po ekranie (tokeny
najpierw, potem migracja) - drugie jest bezpieczniejsze i testowalne
zrzutami po każdym kroku.

---

## Mapa i propy 3D

Budowanie mapy z gotowych propów 3D zamiast wyłącznie z proceduralnych klocków.
Ocena zaproponowanych źródeł (2026-08-18):

| Źródło | Autor / licencja | Werdykt |
|---|---|---|
| [City Kit](https://poly.pizza/bundle/City-Kit-0CkvGrBJ0u) (31 modeli) | Kenney · **CC0** | ✅ **TAK - to jest ten kit.** Modularne budynki (low/small/large/skyscraper) + detale: markizy, szyldy, części elewacji. Jedna skala, low-poly, robione pod siatkę, GLTF. CC0 = zero atrybucji. Podstawa MAPA-2 i MENU-4. |
| [Blocks Skyline](https://poly.pizza/m/6TaAIsfCgFc) | Anna dream brush · CC-BY 3.0 | 🟡 **Tak, ale tylko jako daleki horyzont** (MENU-4 / PROP-12). To sylwetka miasta w jednej bryle, nie kit do chodzenia. Wymaga kredytu w README. |
| [Urban Park v1](https://poly.pizza/m/9T6Xrllwd0P) | Yogoshimo 2.0 · CC-BY 3.0 | ❌ **Nie do rozgrywki.** 36 tys. poly na jeden kawałek to więcej niż pięć botów, a to gotowa diorama (park + zabudowa razem), nie modularny kit - nie da się z tego złożyć areny. Ewentualnie jeden set-piece tła po decymacji. |
| Pojazdy | - | Brać **kity Kenney'a** (Car Kit / City Kit Roads), nie pojedyncze modele - spójna skala i styl z City Kitem, CC0. Szczegóły w MAPA-3. |

Pierwowzorem stylu zostaje low-poly Kenney'a: to gra o czystych sylwetkach
i neonach, a nie o fotorealizmie - miks kitu z proceduralnymi murami się obroni.

### MAPA-1 · Kit propów 3D w pipeline modeli - M · **PREREKWIZYT dla MAPA-2/3 i MENU-4**

- **Blokada techniczna, którą trzeba zdjąć najpierw:** `tools/gen_models.py`
  piecze dziś **tylko pozycje + normalne** (int16/int8, base64) - bez UV, bo
  boty i broń malujemy własnymi materiałami. Kenney maluje kity **atlasem
  tekstury**; bez UV budynek wyjdzie jednolitą plamą koloru.
- Dwie drogi, wybór po `--probe` na pierwszym budynku:
  a) **pakowanie UV** (uint16) + wypiek atlasu do `data:` URI w `js/models.js`
     - pamiętać o CORS: przy `file://` tekstura MUSI być data URI, nie PNG
     w `assets/` (patrz CLAUDE.md → Architektura);
  b) **mapowanie materiał źródłowy → nasz materiał** per część (tak działa
     `matFor` przy Glocku i SENTINELU) - działa, jeśli model dzieli się na
     sensowne części (ściana / okno / dach). Tańsze i spójniejsze z paletą.
- Instancing: elementy kitu powtarzają się dziesiątkami → `InstancedMesh`
  per moduł. Cache geometrii (`_modelGeoCache` w `modelkit.js`) już jest.
- Źródłowe `.glb` do `assets_src/`, wynik do `js/models.js` - plik źródłowy
  commitujemy razem z wynikiem (zasada z CLAUDE.md). CC0 nie wymaga kredytu,
  ale i tak wymienić w README dla porządku.

### MAPA-2 · Arena budowana z modułów kitu - L (po MAPA-1)

- Generator dostaje styl `city` operujący na **modułach kitu** zamiast na
  `addBlock`: siatka ulic, kwartały zabudowy, chodniki, detale (markizy,
  szyldy) jako dekor.
- **Kolizje zostają okrąg-vs-AABB**: każdy moduł wnosi PROSTY osiowy collider
  z bounding boxa, nie geometrię modelu. Obroty inne niż wielokrotność 90°
  są zakazane - to twarde ograniczenie silnika kolizji.
- Teardown: geometrie kitu są **współdzielone przez cache** → w `clearArena`
  ich NIE zwalniamy (jak `decorGroup` - tylko remove). Zwalniamy dalej to,
  co per-build (`logMats`, `propMatsToDispose`).
- W mocy: determinizm `__test.arenaHash`, `keepClear` dla spawnów, MARGIN 2.2
  na przesmyki botów, flood-fill `validateArena`.
- Etapy, żeby nie utknąć: (a) jeden kwartał z kitu obok istniejących klocków →
  (b) pełny styl `city` → (c) wnętrza i wielopoziomowość (wymaga RUCH-2).
- Zależność: **PROP-3 (nawigacja botów) przed pełnym miastem** - dziś AI idzie
  po linii prostej i na rogach budynków będzie klinować masowo.

### MAPA-3 · Pojazdy jako propy z colliderami - M (po MAPA-1)

- Radiowozy LSPD, cywilne auta, dostawczaki: osłona, orientacja w terenie
  i budowanie klimatu ulicy. Źródło: CC0 kit pojazdów Kenney'a (spójna skala
  z City Kitem), nie luźne modele z różnych źródeł.
- Malowanie nasze: liberia LSPD (ta sama paleta co drony), koguty na
  współdzielonych `matStrobeR/B` - animacja strobo już istnieje i jest
  wyłączalna w ustawieniach (PROP-6).
- Collider = jeden osiowy AABB z bounding boxa (jak MAPA-2), nie kształt auta.
- Opcjonalnie: wariant niszczalny przez `userData.propRef` - wzorzec
  generatora z `props.js` (AoE przy zniszczeniu) działa bez zmian.
  Uwaga: propy to **płaskie meshe w `worldGroup`**, nigdy zagnieżdżone `Group`
  (LOS botów jest nierekurencyjny).

---

## Sceny miejskie (największy projekt wizualny)

### PROP-3 · Nawigacja botów - L · **PREREKWIZYT dla SCENA-1**

- Obecna AI idzie po linii prostej + anti-stuck z objazdem bocznym - w mieście
  (ulice, zaułki, wnętrza) będzie masowo klinować się na rogach budynków.
- Graf waypointów generowany razem ze sceną (węzły na skrzyżowaniach
  i w przesmykach, `validateArena` już robi flood-fill - to jego rozszerzenie)
  + prosty A*. Boty daleko od gracza idą po grafie, blisko przełączają się
  na obecne sterowanie bezpośrednie.
- Anti-stuck zostaje jako siatka bezpieczeństwa.

### SCENA-1 · Przebudowa aren na sceny miejskie - XL

> ⚠️ **Częściowo wchłonięte przez MAPA-2** (2026-08-18): geometria miasta
> jedzie z kitu, nie z proceduralnych brył. Tu zostaje to, czego kit nie
> załatwia: tekstury nawierzchni, oświetlenie sceny, wydajność i dramaturgia
> układu.

- Z abstrakcyjnych aren na sceny: **ulice, budynki (wejścia/parterowe
  wnętrza?), pojazdy, latarnie, chodniki, barierki**. Generator dostaje
  nowy styl `city`: siatka ulic + bloki zabudowy (osiowe boxy - pasują
  do ograniczenia kolizji okrąg-vs-AABB), pojazdy jako propy z colliderami.
- Nowe zestawy `TexGen`: asfalt z pasami, elewacje z oknami (emissive nocą),
  beton chodnika, blacha pojazdów. Pamiętać: `worldUV` dla ścian budynków,
  `SRGBColorSpace` tylko na mapach koloru/emisji.
- Wydajność: dużo brył → merged geometry per materiał / `InstancedMesh`
  dla powtarzalnych propów (latarnie, pojazdy); dyscyplina teardownu
  (dispose geometrii z `worldGroup`) bez zmian.
- Zasady niezmienne: `keepClear` dla spawnów, MARGIN dla przesmyków botów,
  determinizm `arenaHash`, przeszkody tylko osiowe.
- Etapowanie (żeby nie utknąć): (a) styl `city` w generatorze na istniejących
  klockach → (b) nowe tekstury/propy → (c) wnętrza/wielopoziomowość (wymaga
  RUCH-2).

### SCENA-2 · Autorskie sceny dla misji fabularnych - L (po SCENA-1)

- Dla misji o ciężarze fabularnym (finał, epilog, pierwsza odprawa) scena
  budowana z **ręcznie zaprojektowanych danych**, nie z generatora: konkretny
  układ, konkretne oświetlenie, konkretna dramaturgia (np. finał - dziedziniec
  komendy nocą, kolumna radiowozów, rampa garażu).
- Technicznie: rozszerzenie `arena` w danych misji o pełną deklaratywną listę
  brył/propów/świateł (setPieces już tak działają - to ich uogólnienie).
  Generator zostaje dla aren treningowych i trybu endless.

---

## Progresja

### PROG-1 · Drzewko umiejętności zamiast kredytów - L

Przebudowa progresji kampanii: **sklep z kredytami znika, wchodzi drzewko
umiejętności**, a bronie odblokowują się fabularnie. Arena bez końca zostaje
przy punktach i sklepie między falami (rekord ma sens tylko z ekonomią w biegu).

- **Punkty umiejętności** zamiast kredytów: przyznawane za ukończenie misji
  (+ opcjonalnie za medale - do decyzji). Zabójstwa NIE dają punktów - dzięki
  temu cały mechanizm rollbacku kredytów przy porażce/restarcie (anty-farming)
  robi się zbędny i można go usunąć.
- **Drzewko** (obecne ulepszenia sklepu jako baza + nowe modyfikatory),
  proponowane gałęzie:
  - *Przetrwanie*: pancerz (redukcja obrażeń), większe HP, szybsza regeneracja
    z apteczek;
  - *Ogień*: większy zapas amunicji, szybsze przeładowanie, mniejszy rozrzut
    ADS, bonus obrażeń headshotów;
  - *Mobilność*: szybszy sprint, wyższy skok, mocniejszy bunnyhop, wślizg
    (spina się z PROP-2 - wślizg może być węzłem drzewka).
  Węzły z zależnościami (kup poprzednika), koszt rośnie w głąb gałęzi.
- **Bronie fabularnie**: pole `unlockWeapon` w danych misji (missions.js) -
  np. strzelba po S-02, karabin po S-04, snajperka po S-06 (dobór przy
  realizacji, zgrany z designem misji: nowa broń tam, gdzie misja jej uczy).
  Pozycje `w_*` znikają ze sklepu kampanii.
- **Zbrojownia** (tryb `armory`) staje się ekranem drzewka; zasada
  idempotencji efektów zostaje w mocy (`applyAllShopEffects` →
  `applySkillTree`, żadnych `+=` - loadout odtwarzany z zapisu).
- **Zapis**: migracja do v2 (`run.credits`/poziomy sklepu → punkty + kupione
  węzły); stary zapis konwertować, nie kasować (przelicznik kredyty→punkty).
- **HUD/UI**: licznik kredytów w kampanii → punkty umiejętności; ikony węzłów
  w `UI_ICONS`; ekran drzewka po polsku, spójny z ekranami odpraw.
- **Endless bez zmian**: kredyty, sklep między falami, kupowanie broni jak
  dotąd - dwie ekonomie żyją obok siebie (rozdzielone już dziś przez tryb
  sklepu). Do decyzji: czy endless startuje z pełnym arsenałem, czy kupuje
  bronie po staremu.
- Kolejność względem balansu: **PROG-1 przed TRUD-1** - rebalans trudności
  ma sens dopiero, gdy wiadomo, jakie modyfikatory gracz może mieć.

## Trudność i balans

### TRUD-1 · Globalne podniesienie poziomu trudności - M

- Podnieść bazę: celność/obrażenia botów, tempo spawnu, agresja (krótszy
  dystans utrzymywany przez scout/assault), mniej amunicji z dropów.
- Jedno miejsce składania mnożników zostaje (`startNextWave`); rebalans
  progów medali po zmianie (CHRONOMETR/OCALAŁY/PRECYZJA muszą pozostać
  osiągalne, ale nietrywialne).
- Po rebalansie przejść pełną kampanię testem `phase5d_test.py` + ręcznie
  na normal; easy ma zostać przystępne (skalowanie przez `DIFFICULTIES`,
  nie przez bazę - do rozstrzygnięcia przy realizacji, co ruszamy).

---

## Platformy i technologia

### TECH-1 · Sterowanie dotykowe - L

- Wirtualna gałka ruchu (lewy kciuk), celowanie przeciągnięciem (prawa
  połowa ekranu), przyciski: strzał, ADS, skok, przeładowanie, zmiana broni,
  kucanie (RUCH-1). Pointer Events, multi-touch.
- HUD: skalowanie i strefy bezpieczne pod kciuki; auto-detekcja dotyku
  (`pointer: coarse`) + przełącznik w ustawieniach (PROP-1).
- Wydajność na telefonach: przełączniki bloom/cieni z PROP-1 stają się
  koniecznością, nie opcją. PWA już jest (manifest + ikony).
- Pointer lock nie istnieje na mobile - ścieżka sterowania kamerą musi
  ominąć PointerLockControls (obrót liczony z delty dotyku).

### TECH-2 · Multiplayer co-op w trybie endless - XL

- Zakres: **co-op 2 graczy w arenie endless** (nie PvP, nie kampania) -
  najmniejszy sensowny krok w multiplayer.
- Problem sygnalizacji vs „zero backendu" - trzy opcje:
  1. **Ręczna wymiana SDP** (skopiuj-wklej kod pokoju) - zero backendu,
     brzydki UX, ale uczciwy pierwszy krok;
  2. lekki darmowy broker (PeerJS cloud / darmowy tier) - najlepszy UX,
     łamie zasadę zero-backendu „miękko" (tylko handshake, gra dalej P2P);
  3. odłożyć do wyczerpania single-playera (zgodnie z dotychczasową notatką).
- Architektura: host-authoritative (boty, fale i obrażenia liczy host; gość
  wysyła input/pozycję). DataChannel unreliable dla pozycji, reliable dla
  zdarzeń. Duży, osobny projekt - realnie ostatnia pozycja roadmapy.

---

## Propozycje dodatkowe (Claude)

### PROP-1 · Ustawienia w pauzie - M - ✅ ZROBIONE (2026-08-14)

> Ekran `screen-settings` (`js/settings.js`), otwierany ze startu i z pauzy:
> czułość myszy (30-200%), głośność ogólna/muzyki (`AudioSys.setVolumes`),
> przełączniki bloom/cieni i strobo dronów (PROP-6). Zapis w localStorage
> (`status1_settings`), stosowane na żywo; diagnostyka `__test.settings`.

Czułość myszy, głośność master/muzyki (`master.gain` i `musicGain.gain` już
czekają w `AudioSys`), przełącznik bloom/cieni, zapis w localStorage.
Tanie, a odblokowuje TECH-1 (wydajność) i PROP-6 (dostępność).

### PROP-2 · Wślizg (slide) - S (po RUCH-1) - ✅ ZROBIONE (2026-08-14)

> Kucnięcie przy prędkości sprintu = wślizg ~0,55 s: kierunek utrwalony na
> wejściu, prędkość ~1,1× i wygasa; skok w trakcie zachowuje pęd (synergia
> z bunnyhopem), potem 0,8 s cooldownu. Przechył kamery, poszerzony FOV,
> dźwięk szurnięcia; diagnostyka `__test.slide`.

Kucnięcie w sprincie = krótki wślizg z zachowaniem pędu (synergia
z bunnyhopem - sekcje `gates` zrobią się przyjemniejsze).

### PROP-4 · Granaty - M - ✅ ZROBIONE (2026-08-14)

> Klawisz G (`js/grenades.js`): pula pocisków, łuk z grawitacją, odbicia od
> podłogi i ścian (przelatuje NAD niskimi osłonami - `minTop`), zapalnik
> 1,7 s, AoE 4,5 m (95→edge, spada liniowo), 50% obrażeń własnych, rani
> propy. Zapas: 2 na start poziomu, sklep „Granaty ×2" (limit 4), licznik
> na HUD; diagnostyka `__test.grenades`.

Klawisz G, łuk z grawitacją (fizyka jak cząsteczki), obrażenia obszarowe
z odrzutem - wzorzec AoE już jest w generatorach (props.js). Pozycja
w sklepie + ikona + dźwięk.

### PROP-5 · Radar / kompas - M

Kierunki botów na obwódce ekranu albo mały radar; off-screen chevrony celów
już istnieją - to ich rozszerzenie o kontakty wroga. Ważniejsze po SCENA-1
(w mieście łatwiej zgubić orientację).

### PROP-6 · Dostępność - S - ✅ CZĘŚCIOWO (2026-08-14)

> Wyłącznik strobo dronów jest w ekranie ustawień (PROP-1): zamiast migania
> oba paski świecą stałym, średnim blaskiem. Zostało: remapowanie klawiszy
> i tryb dla daltonistów.

Wyłącznik strobo dronów (migotanie!), remapowanie klawiszy, opcjonalnie tryb
dla daltonistów (liberie mają różnić się też jasnością). Część ustawień
z PROP-1.

### PROP-7 · Ekran wyników misji - M

Po misji: wykres HP w czasie, celność per broń, timeline zabójstw, porównanie
z najlepszym czasem. Dane już częściowo zbierane (medale).

### PROP-8 · Nagroda za komplet medali - S

30/33 medali = bonus (skórka broni „chrom LSPD"? złota liberia dronów?)
+ linia w outro. Liczniki w zapisie już są.

### PROP-9 · Audio otoczenia - M (razem ze SCENA-1)

Materiał podłoża pod krokami (asfalt/beton/metal), pogłos zależny od
otoczenia (ciasny zaułek vs otwarta ulica), ambient sceny (wiatr, odległy
ruch, syreny). Wszystko syntetyczne - rozszerzenie istniejących pętli.

### PROP-10 · Checkpointy w dłuższych misjach - M

Misje wieloetapowe (łańcuchy `after`) wznawiane od ostatniego ukończonego
celu zamiast od zera - im trudniejsza gra (TRUD-1), tym bardziej potrzebne.
Po PROG-1 bez komplikacji ekonomicznych (punkty tylko za ukończenie misji).

---

## Proponowana kolejność

1. **Faza 1 - fundamenty i szybkie wygrane:** RUCH-1, RUCH-2, BOT-2,
   PROG-1 → TRUD-1, PROP-1, PROP-6. Gra robi się trudniejsza, uczciwsza
   i przyjemniejsza w ruchu bez ruszania wizualiów; trudność balansujemy
   dopiero na nowej progresji.
2. **Faza 2 - tożsamość wizualna:** BOT-1, BRON-1 → BRON-4 → BRON-2 → BRON-3, BOT-3, MENU-1,
   MENU-2,
   MENU-4, MENU-5, PROP-12. Gra zaczyna wyglądać jak „STATUS 1", nie jak
   prototyp. **MENU-5 (tokeny UI) warto zrobić wcześnie w tej fazie** - każdy
   nowy ekran dodany później dziedziczy styl zamiast go dublować.
   **MAPA-1 przed MENU-4** - panorama z kitu wymaga gotowego pipeline'u.
3. **Faza 3 - świat:** MAPA-1 → MAPA-2 + MAPA-3, PROP-3, potem SCENA-1,
   PROP-9. Największy skok jakościowy; **nawigacja botów (PROP-3) PRZED
   pełnym miastem** - inaczej AI klinuje na rogach budynków.
4. **Faza 4 - bestiariusz:** BOT-4 (prerekwizyt!) → BOT-5 + BOT-6 (tanie,
   od razu odświeżają fale) → BOT-9 → BOT-7 + BRON-5 (razem) → BOT-8 →
   BOT-10 na koniec, BOT-11 razem z BOT-6 albo tuż po nim. Gra przestaje zadawać jedno pytanie taktyczne.
   Można wpleść w Fazę 2/3 - nowi przeciwnicy nie czekają na miasto.
5. **Faza 5 - zasięg:** TECH-1, potem TECH-2. Reszta PROP-ów wchodzi między
   fazy jako przerywniki.

## Decyzje do podjęcia (przy realizacji danej pozycji)

- **PROG-1:** czy medale też dają punkty umiejętności (obok premii za
  misję)? Po której misji która broń? Czy endless startuje z pełnym
  arsenałem, czy kupuje bronie po staremu?
- **MENU-2:** czy łagodzimy zasadę „zero plików audio" dla menu (wymaga
  weryfikacji ścieżki base64 → `decodeAudioData` pod `file://` + płatnego
  planu SUNO)? Plan B: ambient proceduralny.
- **BRON-1:** co z SMG (pierwowzór?) - nie było go w wytycznych. Czy dla
  każdej broni znajdzie się model CC0/CC-BY, czy część robimy proceduralnie?
- **BRON-4:** czy dokładamy chwyt przedni (wymusza pozowanie ręki
  wspierającej w BRON-2), czy zostajemy przy samej optyce i tłumiku?
- **MAPA-1:** atlas z UV czy mapowanie materiałów per część? (rozstrzygnąć
  probem na pierwszym budynku, nie z góry)
- **BOT-3:** wypiekamy klipy animacji ze źródła (skinning w `gen_models.py`),
  czy zostajemy przy ręcznym kręceniu piwotami części?
- **Zakres po wycięciu kampanii:** czy PROG-1, SCENA-2 i PROP-7/8/10 (wszystkie
  zakładają misje) zostają w roadmapie, czy lecą za MISJA-\*?
- **TECH-2:** który wariant sygnalizacji (ręczne SDP / lekki broker /
  odłożyć)?
- **BOT-9:** wieżyczka jako typ w `ENEMY_TYPES` z prędkością 0 (fale, dropy,
  licznik zabójstw działają) czy jako prop z props.js (czyściej technicznie,
  ale poza ekonomią)? Rekomendacja: typ.
- **BOT-10:** model wybrany (rcorre „Modular Mech", CC BY 4.0). Zostało:
  czy wypiekamy jego animacje chodu (razem z decyzją z BOT-3), i czy cztery
  rodzaje uzbrojenia wchodzą naraz, czy MECH debiutuje z samym gatlingiem.
- **BOT-11:** czy pojazd dostawczy da się zniszczyć (przerwanie zrzutu jako
  nagroda za agresję), czy jest nietykalną dekoracją?
- **BRON-5:** osobny slot broni (klawisz 6) czy szybki atak nakładany na
  bieżącą broń bez chowania jej?
- **TRUD-1:** podnosimy bazę czy mnożniki `DIFFICULTIES` (easy ma zostać
  przystępne)?
