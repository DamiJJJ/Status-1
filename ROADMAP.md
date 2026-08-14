# ROADMAPA — STATUS 1

Plan rozwoju gry po przebudowie na kampanię (2026-07). Każda pozycja ma stały
identyfikator — nad pozycjami pracujemy oddzielnie, w dowolnej kolejności, ale
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
| MISJA-1 | ✅ Endless-spawn przy celach typu hack/strefy | M | 1 |
| MISJA-4 | ✅ Blokada końca misji do końca dialogu | S | 1 |
| MISJA-5 | ✅ Tutorial: blokada ruchu podczas instrukcji | S | 1 |
| PROG-1 | Drzewko umiejętności zamiast kredytów; bronie odblokowywane fabularnie | L | 1 |
| TRUD-1 | Globalne podniesienie poziomu trudności | M | 1 |
| BOT-2 | ✅ WAŻKA jako częsty przeciwnik od początku | M | 1 |
| PROP-1 | ✅ Ustawienia w pauzie | M | 1 |
| PROP-6 | Dostępność (✅ wyłącznik strobo; remap klawiszy — otwarte) | S | 1 |
| BOT-1 | Redesign botów wg emblematu z logo | L | 2 |
| BRON-1 | Remodeling broni na realne odpowiedniki | L | 2 |
| MENU-1 | ✅ Menu główne z animowaną panoramą Los Santos | L | 2 |
| MENU-2 | Synth-ambient w menu (SUNO) | M + decyzja | 2 |
| PROP-12 | Panorama miasta jako skybox w rozgrywce | M | 2 |
| PROP-3 | Nawigacja botów (graf waypointów) | L | 3 |
| SCENA-1 | Przebudowa aren na sceny miejskie | XL | 3 |
| SCENA-2 | Autorskie sceny dla misji fabularnych | L | 3 |
| MISJA-2 | Finał kampanii: skryptowana przegrana | M | 3 |
| MISJA-3 | Cutscenka epilogu z oczu gracza | M | 3 |
| PROP-9 | Audio otoczenia: materiał podłoża, pogłos per scena | M | 3 |
| TECH-1 | Sterowanie dotykowe (mobile) | L | 4 |
| TECH-2 | Multiplayer co-op w trybie endless | XL | 4 |
| PROP-2 | ✅ Wślizg (slide) | S | — |
| PROP-4 | ✅ Granaty | M | — |
| PROP-5 | Radar / kompas | M | — |
| PROP-7 | Ekran wyników misji ze szczegółami | M | — |
| PROP-8 | Nagroda za komplet medali | S | — |
| PROP-10 | Checkpointy w dłuższych misjach | M | — |
| PROP-11 | Dzienny seed areny endless | S | — |

---

## Bugi — do naprawy przed wszystkim innym

### BUG-1 · Zepsuty pointer lock po „Ponów" — S/M — ✅ ZROBIONE (2026-07-13)

> Przyczyną był handler `pointerlockerror`, który mimo odmowy locka odpalał
> `beginPlaying()`. Teraz odmowa pokazuje ekran `screen-lock` („kliknij, aby
> grać" — świeży gest), stan `playing` włącza wyłącznie zdarzenie `lock`,
> a `__test.pointerLock`/`wantLock` wystawiają stan do testów. Opcjonalny
> link „graj bez przechwycenia myszy" zachowuje starą ścieżkę awaryjną.

- Objaw: po kliknięciu „Ponów" kursor myszy nie znika, nie da się celować,
  ESC i inne klawisze przestają działać — gra jest nieużywalna do przeładowania
  strony.
- Prawdopodobna przyczyna: `requestPointerLock()` po restarcie nie dostaje
  locka. Chrome ma **~1,25 s karencji** po wyjściu z pointer locka przez ESC —
  wywołanie w tym oknie kończy się cichym `SecurityError`, a gra już „myśli",
  że działa. Do tego stan `input.js`/ekranów może się rozjeżdżać (gra ruszyła,
  ale handler `pointerlockchange` nigdy nie przyszedł).
- Kierunek naprawy: nie startować rozgrywki „na ślepo" — po kliknięciu
  „Ponów" czekać na faktyczne zdarzenie `pointerlockchange` (albo obsłużyć
  `pointerlockerror` → pokazać nakładkę „kliknij, aby wrócić do gry", jak przy
  pierwszym starcie). Każda ścieżka wejścia do gry (start / ponów / wznów /
  następna misja) musi przechodzić przez jeden wspólny punkt akwizycji locka.
- Test: Playwright nie pokryje prawdziwego pointer locka — do weryfikacji
  ręcznej; w `__test` warto wystawić stan locka, żeby przynajmniej rozjazd
  stanu był widoczny.

### BUG-2 · Brak wyjścia do menu / przerwania misji — S — ✅ ZROBIONE (2026-07-13)

> W pauzie doszedł przycisk „Przerwij misję" / „Wyjdź do menu" (`quitToMenu`):
> kampania robi `mission.abort()` (rollback kredytów jak przy porażce) i wraca
> do wyboru misji; arena zapisuje rekord i wraca na ekran startowy.

- W trakcie gry nie da się wyjść do ekranu startowego — pauza nie daje opcji
  przerwania misji; jedyna droga to przeładowanie strony.
- Dodać w pauzie „Przerwij misję / wyjdź do menu": porzucenie misji
  (rollback kredytów jak przy porażce), `clearArena` + powrót na ekran
  startowy, poprawne zwolnienie pointer locka. W arenie endless analogicznie
  (zapis rekordu przed wyjściem).
- Wiąże się z MENU-1 (docelowo wraca się do nowego menu głównego), ale nie
  ma sensu czekać — opcja w pauzie potrzebna od zaraz.

### BUG-3 · Skróty przeglądarki w grze — S — ✅ ZROBIONE (2026-08-14)

> Kucanie/wślizg na Ctrl przy trzymanym W generowały Ctrl+W (zamknięcie
> karty!), a Ctrl+T/D dokładały karty i zakładki. Tarcza w trzech warstwach
> (input.js): `preventDefault` klawiszy gry i każdej kombinacji z Ctrl
> (przed early-outem `e.repeat` — trzymane W przychodzi jako repeat) + wheel
> z `{passive:false}`; **pełny ekran z Keyboard Lock** przy wejściu do gry
> (opcja „Pełny ekran w grze" w ustawieniach, domyślnie ON — tylko
> w fullscreenie Chrome oddaje stronie Ctrl+W/T); `beforeunload` w trakcie
> biegu zamienia okienkowe Ctrl+W/F5 w pytanie „opuścić stronę?".
> Objaw zgłoszony przy pierwszym graniu wślizgiem (PROP-2).

---

## Ruch gracza

### RUCH-1 · Kucanie — M — ✅ ZROBIONE (2026-07-13)

> Ctrl/C (trzymane): `player.eyeH` lerpuje PLAYER_EYE↔CROUCH_EYE, ruch ×0.55,
> rozrzut z biodra ×0.65, sprint przerwany, płytszy/wolniejszy head-bob.
> Boty celują w `player.pos.y` (LOS mierzył do `player.pos` już wcześniej).

- Klawisz (domyślnie Ctrl/C): obniżenie `PLAYER_EYE` (płynny lerp, nie skok),
  spowolnienie ruchu, mniejszy rozrzut z biodra jako bonus.
- **Boty muszą to widzieć**: ich LOS i punkt celowania mierzą do pozycji oka —
  kucnięcie za niską osłoną ma realnie chować gracza (sprawdzić `enemyFire()`
  i test LOS w enemies.js).
- Interakcje do ogarnięcia: sway/head-bob (inna amplituda w kuckach), ADS
  (dozwolone), sprint (kucanie je przerywa), reset w `resetLevelState`.
- Synergia z PROP-2 (wślizg) i RUCH-2 (kucnięcie pod niskim przesmykiem —
  opcjonalnie później).

### RUCH-2 · Wchodzenie na niskie przeszkody — L

- Dziś podłoże to **płaska płaszczyzna** (`player.pos.y <= PLAYER_EYE`
  w player.js), a kolizje to okrąg-vs-AABB **tylko w XZ** — nie ma pojęcia
  „stania na czymś". Trzeba dodać wysokość podłoża pod graczem: najwyższy
  top collidera pod stopami → grunt; schodzenie z krawędzi = spadanie.
- Do tego **step-up/mantle**: przeszkody niższe niż ~0.5 m pokonywane
  automatycznie, wyższe (do ~1.2 m) skokiem z doskoku.
- Konsekwencje dla AI: gracz na skrzyni jest poza zasięgiem botów naziemnych —
  to jest wprost powód, żeby WAŻKA była częsta (BOT-2): drony karzą camping
  na wysokości. Boty z bronią dystansową i tak dosięgną.
- Uważać na: bunnyhop (`sinceLand` liczone od lądowania — także na skrzyni),
  smugi strzałów botów, spawn pickupów, `__teleport` w testach.

---

## Przeciwnicy

### BOT-1 · Redesign botów wg emblematu z logo — L

- Ujednolicić sylwetkę wszystkich typów do bota z emblematu gry (źródło:
  `status-1-logo.png`, pipeline `tools/gen_logo.py`) — jedna rodzina designu
  zamiast obecnych „kółek i kwadratów per typ".
- **Usuwamy regułę kształt-głowy→typ** (obecnie wymaganą w CLAUDE.md — przy
  realizacji zaktualizować konwencje). Rozpoznawalność typów zostaje na:
  liberii (kolor pancerza), kolorze/kształcie oka, akcentach (antena, daszek,
  obręcz) i **rozmiarze sylwetki** (scout smukły, heavy masywny).
- Nowe tekstury przez `TexGen` (płyty pancerza, oznaczenia LSPD, numery
  taktyczne). Budżet trójkątów pilnować — boty spawnują się dziesiątkami
  (helpery `enemyBox`/`enemyCyl` zostają).
- Zostają w mocy: przód = lokalne +Z, `userData.isHead` na głowie,
  `userData.enemyRef` na każdym meshu, biały pas służby + strobo.

### BOT-2 · WAŻKA jako częsty, prosty przeciwnik od początku — M — ✅ ZROBIONE (2026-07-13)

> Rebalans (hp 30, dmg 3, acc 0.45, 120 pkt / 10 kr), wpisy w `waves[]`
> od S-01 (i w bramach S-06), fale areny z uav od fali 1, formuła endless
> dostała człon uav. S-01 zapowiada WAŻKĘ w odprawie i linii SYSTEMU.

- Obecnie UAV to rzadkość — ma być podstawowym, tanim przeciwnikiem obecnym
  praktycznie od pierwszych misji (fabularnie pasuje: drony latające to
  najtańsza linia SENTINEL).
- Rebalans: mniej HP, słabszy ostrzał, może wariant „rój" (2-3 naraz).
  Wpisy w `waves[]` misji od S-01, mix w arenie endless od wczesnych fal.
- Dropy: zostaje amunicja (`rollDrop`).
- Zależność zwrotna: RUCH-2 robi z WAŻKI kontrę na camping na skrzyniach.

---

## Bronie

### BRON-1 · Remodeling na realne odpowiedniki — L

Docelowe pierwowzory (sylwetka i charakter, nie kopia 1:1):

| Broń w grze | Pierwowzór |
|---|---|
| Pistolet | Glock 17 |
| Strzelba | Remington 870 |
| Karabin (auto) | AR-15 / M4 |
| Snajperka | Barrett M82 (.50) |
| SMG | do decyzji — propozycja: MP5SD (mamy już tłumik) |

- Nadal **wyłącznie geometria proceduralna** (zasada „wszystko generowane"):
  `ExtrudeGeometry`/`LatheGeometry`/fazowania dają rozpoznawalne sylwetki
  (chwyt Glocka, pompka Remingtona, uchwyt do przenoszenia AR, hamulec
  wylotowy Barretta) bez zewnętrznych modeli.
- Kontrakt bez zmian: komplet muszka three-dot + szczerbinka + `adsPos`
  na każdej broni (kropki na jednej wysokości, słupki osadzone na bryle),
  nigdy nie przybliżać viewmodelu do kamery (near plane 0.08).
- Przy okazji: dopasować dźwięki strzałów do nowego charakteru broni
  (Barrett powinien mieć wyraźnie cięższy strzał niż obecna snajperka).

---

## Menu i oprawa

### MENU-1 · Menu główne z animowaną panoramą Los Santos — L — ✅ ZROBIONE (2026-08-14)

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

### MENU-2 · Synth-ambient w menu (SUNO) — M + decyzja

⚠️ **Koliduje z twardą zasadą projektu** („audio w 100% syntetyczne, SUNO
rozważone i odrzucone" — CLAUDE.md). Powód odrzucenia był techniczny
(przy `file://` plik audio wypada poza graf WebAudio) — ale **jest droga
obejścia, której wtedy nie rozważono**:

- Utwór zakodowany jako **base64 w pliku JS** (jak tekstury) → `atob` →
  `ArrayBuffer` → `decodeAudioData` → `AudioBufferSourceNode`. Zero fetch,
  zero CORS, działa z `file://`, a dźwięk **zostaje w grafie WebAudio**
  (limiter, ducking, crossfade do muzyki proceduralnej przy starcie gry).
  Do zweryfikowania testem Playwright przed commitem do planu.
- Koszt: ~1 MB/min przy 96 kbps mono + 33% narzutu base64 → pętla 1,5–2 min
  ≈ 2–2,5 MB w repo. Akceptowalne dla jednego utworu menu; nie skalować tego
  na całą ścieżkę dźwiękową.
- Zasada po zmianie: **wyjątek tylko dla menu** (ambient nie musi reagować
  na rozgrywkę — `moodBlend` i sidechain nie są potrzebne); w rozgrywce
  muzyka zostaje proceduralna. Licencja: wymaga płatnego planu SUNO
  (komercyjne prawa do outputu).
- Plan B (gdyby weryfikacja `file://` zawiodła): ambient proceduralny na
  istniejącym sekwencerze (nowy mood „menu" — rozstrojone pady już są).

### PROP-12 · Panorama miasta jako skybox w rozgrywce — M

- Ta sama panorama co w MENU-1, użyta jako tło aren (za murami granicznymi):
  sylwetki wieżowców na horyzoncie zamiast czystego nieba. Buduje spójność
  „symulacje dzieją się w hali treningowej w mieście" i jest naturalnym
  krokiem do SCENA-1. Generowana raz do `CanvasTexture`/geometrii low-poly.

---

## Sceny miejskie (największy projekt wizualny)

### PROP-3 · Nawigacja botów — L · **PREREKWIZYT dla SCENA-1**

- Obecna AI idzie po linii prostej + anti-stuck z objazdem bocznym — w mieście
  (ulice, zaułki, wnętrza) będzie masowo klinować się na rogach budynków.
- Graf waypointów generowany razem ze sceną (węzły na skrzyżowaniach
  i w przesmykach, `validateArena` już robi flood-fill — to jego rozszerzenie)
  + prosty A*. Boty daleko od gracza idą po grafie, blisko przełączają się
  na obecne sterowanie bezpośrednie.
- Anti-stuck zostaje jako siatka bezpieczeństwa.

### SCENA-1 · Przebudowa aren na sceny miejskie — XL

- Z abstrakcyjnych aren na sceny: **ulice, budynki (wejścia/parterowe
  wnętrza?), pojazdy, latarnie, chodniki, barierki**. Generator dostaje
  nowy styl `city`: siatka ulic + bloki zabudowy (osiowe boxy — pasują
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

### SCENA-2 · Autorskie sceny dla misji fabularnych — L (po SCENA-1)

- Dla misji o ciężarze fabularnym (finał, epilog, pierwsza odprawa) scena
  budowana z **ręcznie zaprojektowanych danych**, nie z generatora: konkretny
  układ, konkretne oświetlenie, konkretna dramaturgia (np. finał — dziedziniec
  komendy nocą, kolumna radiowozów, rampa garażu).
- Technicznie: rozszerzenie `arena` w danych misji o pełną deklaratywną listę
  brył/propów/świateł (setPieces już tak działają — to ich uogólnienie).
  Generator zostaje dla aren treningowych i trybu endless.

---

## Fabuła i misje

### MISJA-1 · Endless-spawn przy celach hack/strefy — M — ✅ ZROBIONE (2026-07-13)

> `waveSystem.setPressure(on)`: cele hack/survive/gates włączają ciągłą dokrutkę
> (interwał ~3,6 s × `pressureMul` trudności, tempo rośnie z czasem celu, skład
> z bieżącej fali; szanuje `paused` i `maxAlive`). Wyłączana w `finishObjective`.

- Problem: przy celach typu „przejmij/czekaj" fale można obejść — zostawić
  jednego bota i mieć spokój przez całą misję.
- Rozwiązanie: podczas aktywnego celu `hack`/`survive`/`gates` reżyser fal
  przechodzi na **ciągły dopływ** (polityka `loop` + `maxAlive` już istnieje
  w `waves.reset(policy)` — dodać narastające tempo spawnu w czasie celu,
  żeby przeciągania nie dało się przeczekać).
- Balans: dopływ ma wymuszać ruch, nie zamieniać misji w rzeźnię — tempo
  zależne od trudności i `mission.scale`; po ukończeniu celu dobić resztkę
  i wrócić do skryptu fal.

### MISJA-2 · Finał kampanii: skryptowana przegrana — M

- Ostatnia misja bojowa kończy się **śmiercią gracza pod przeważającą falą**:
  spawn eskaluje bez sufitu, aż gracz padnie — i to jest sukces fabularny
  (drony przeszkolone perfekcyjnie). Śmierć odpala outro zamiast ekranu
  porażki.
- Kluczowe, żeby nie wyglądało jak bug: radio zapowiada eskalację
  („test obciążeniowy — bez warunku przetrwania"), HUD może pokazywać
  licznik pokonanych zamiast paska celu, outro wprost domyka.
- Medale tej misji przełożyć na nową miarę (czas przetrwania / liczba
  zestrzeleń), bo „ukończ z HP ≥ X" traci sens.
- Technicznie: nowy typ celu (`lastStand`?) + gałąź w obsłudze śmierci gracza
  (śmierć w tej misji = complete, nie fail; rollback kredytów NIE dotyczy).

### MISJA-3 · Cutscenka epilogu z oczu gracza — M

- Zamiast swobodnego chodzenia w epilogu: **skryptowany przemarsz** — input
  wyłączony, postać sama idzie wąskim korytarzem i mija kolumnę wychodzących
  dronów; kamera z head-bobem (reuse cyklu `swayPhase`), lekki letterbox.
- Reuse istniejącego `noCombat` + `parade`; nowość: ścieżka kamery (spline
  z waypointów) i blokada inputu z zachowaniem obrotu głowy w małym stożku
  (± kilkanaście stopni — gracz może się rozglądać, ale nie zatrzymać).
- Finałowy typewriter STATUS 1 zostaje jako zwieńczenie.

### MISJA-4 · Blokada końca misji do końca dialogu — S — ✅ ZROBIONE (2026-07-13)

> Komplet celów ustawia `mission.completePending` (spawny od razu stają);
> debrief odpala się przy pustej kolejce radia. Zegar misji stoi w oczekiwaniu
> (bez kary do CHRONOMETRU). Decyzja: porażka przerywa dialog, sukces czeka.

- Ukończenie ostatniego celu nie kończy misji, dopóki kolejka radia nie jest
  pusta (typewriter dopisał + krótka pauza). Ekran końcowy czeka na
  `radioQueue.length === 0`.
- Dotyczy też: śmierć gracza w trakcie dialogu fabularnego (dialog dogrywa
  się na ekranie porażki? — do decyzji przy realizacji; prościej: porażka
  przerywa dialog, sukces czeka).

### MISJA-5 · Tutorial: blokada ruchu podczas instrukcji — S — ✅ ZROBIONE (2026-07-13)

> Flaga `hold: true` na wyzwalaczach `radio[]` (S-00: start/o1/o2/o3 — kwestie
> bojowe o4/o5 wolne): WSAD/skok zablokowane, póki linia się pisze (+0,5 s),
> obrót kamery zostaje. W TEST linie dopisują się natychmiast.

- Dopóki linia instruktażowa się „pisze" (typewriter aktywny), gracz nie może
  ruszyć dalej: blokada WSAD/skoku (obrót kamery zostaje — zamrożenie myszy
  jest nieprzyjemne), odblokowanie po dopisaniu linii + ~0,5 s.
- Wdrożyć jako flagę na wpisach `radio[]` (np. `hold: true`), żeby działało
  tylko tam, gdzie trzeba (S-00), a nie globalnie.

---

## Progresja

### PROG-1 · Drzewko umiejętności zamiast kredytów — L

Przebudowa progresji kampanii: **sklep z kredytami znika, wchodzi drzewko
umiejętności**, a bronie odblokowują się fabularnie. Arena bez końca zostaje
przy punktach i sklepie między falami (rekord ma sens tylko z ekonomią w biegu).

- **Punkty umiejętności** zamiast kredytów: przyznawane za ukończenie misji
  (+ opcjonalnie za medale — do decyzji). Zabójstwa NIE dają punktów — dzięki
  temu cały mechanizm rollbacku kredytów przy porażce/restarcie (anty-farming)
  robi się zbędny i można go usunąć.
- **Drzewko** (obecne ulepszenia sklepu jako baza + nowe modyfikatory),
  proponowane gałęzie:
  - *Przetrwanie*: pancerz (redukcja obrażeń), większe HP, szybsza regeneracja
    z apteczek;
  - *Ogień*: większy zapas amunicji, szybsze przeładowanie, mniejszy rozrzut
    ADS, bonus obrażeń headshotów;
  - *Mobilność*: szybszy sprint, wyższy skok, mocniejszy bunnyhop, wślizg
    (spina się z PROP-2 — wślizg może być węzłem drzewka).
  Węzły z zależnościami (kup poprzednika), koszt rośnie w głąb gałęzi.
- **Bronie fabularnie**: pole `unlockWeapon` w danych misji (missions.js) —
  np. strzelba po S-02, karabin po S-04, snajperka po S-06 (dobór przy
  realizacji, zgrany z designem misji: nowa broń tam, gdzie misja jej uczy).
  Pozycje `w_*` znikają ze sklepu kampanii.
- **Zbrojownia** (tryb `armory`) staje się ekranem drzewka; zasada
  idempotencji efektów zostaje w mocy (`applyAllShopEffects` →
  `applySkillTree`, żadnych `+=` — loadout odtwarzany z zapisu).
- **Zapis**: migracja do v2 (`run.credits`/poziomy sklepu → punkty + kupione
  węzły); stary zapis konwertować, nie kasować (przelicznik kredyty→punkty).
- **HUD/UI**: licznik kredytów w kampanii → punkty umiejętności; ikony węzłów
  w `UI_ICONS`; ekran drzewka po polsku, spójny z ekranami odpraw.
- **Endless bez zmian**: kredyty, sklep między falami, kupowanie broni jak
  dotąd — dwie ekonomie żyją obok siebie (rozdzielone już dziś przez tryb
  sklepu). Do decyzji: czy endless startuje z pełnym arsenałem, czy kupuje
  bronie po staremu.
- Kolejność względem balansu: **PROG-1 przed TRUD-1** — rebalans trudności
  ma sens dopiero, gdy wiadomo, jakie modyfikatory gracz może mieć.

## Trudność i balans

### TRUD-1 · Globalne podniesienie poziomu trudności — M

- Podnieść bazę: celność/obrażenia botów, tempo spawnu, agresja (krótszy
  dystans utrzymywany przez scout/assault), mniej amunicji z dropów.
- Jedno miejsce składania mnożników zostaje (`startNextWave`); rebalans
  progów medali po zmianie (CHRONOMETR/OCALAŁY/PRECYZJA muszą pozostać
  osiągalne, ale nietrywialne).
- Po rebalansie przejść pełną kampanię testem `phase5d_test.py` + ręcznie
  na normal; easy ma zostać przystępne (skalowanie przez `DIFFICULTIES`,
  nie przez bazę — do rozstrzygnięcia przy realizacji, co ruszamy).

---

## Platformy i technologia

### TECH-1 · Sterowanie dotykowe — L

- Wirtualna gałka ruchu (lewy kciuk), celowanie przeciągnięciem (prawa
  połowa ekranu), przyciski: strzał, ADS, skok, przeładowanie, zmiana broni,
  kucanie (RUCH-1). Pointer Events, multi-touch.
- HUD: skalowanie i strefy bezpieczne pod kciuki; auto-detekcja dotyku
  (`pointer: coarse`) + przełącznik w ustawieniach (PROP-1).
- Wydajność na telefonach: przełączniki bloom/cieni z PROP-1 stają się
  koniecznością, nie opcją. PWA już jest (manifest + ikony).
- Pointer lock nie istnieje na mobile — ścieżka sterowania kamerą musi
  ominąć PointerLockControls (obrót liczony z delty dotyku).

### TECH-2 · Multiplayer co-op w trybie endless — XL

- Zakres: **co-op 2 graczy w arenie endless** (nie PvP, nie kampania) —
  najmniejszy sensowny krok w multiplayer.
- Problem sygnalizacji vs „zero backendu" — trzy opcje:
  1. **Ręczna wymiana SDP** (skopiuj-wklej kod pokoju) — zero backendu,
     brzydki UX, ale uczciwy pierwszy krok;
  2. lekki darmowy broker (PeerJS cloud / darmowy tier) — najlepszy UX,
     łamie zasadę zero-backendu „miękko" (tylko handshake, gra dalej P2P);
  3. odłożyć do wyczerpania single-playera (zgodnie z dotychczasową notatką).
- Architektura: host-authoritative (boty, fale i obrażenia liczy host; gość
  wysyła input/pozycję). DataChannel unreliable dla pozycji, reliable dla
  zdarzeń. Duży, osobny projekt — realnie ostatnia pozycja roadmapy.

---

## Propozycje dodatkowe (Claude)

### PROP-1 · Ustawienia w pauzie — M — ✅ ZROBIONE (2026-08-14)

> Ekran `screen-settings` (`js/settings.js`), otwierany ze startu i z pauzy:
> czułość myszy (30–200%), głośność ogólna/muzyki (`AudioSys.setVolumes`),
> przełączniki bloom/cieni i strobo dronów (PROP-6). Zapis w localStorage
> (`status1_settings`), stosowane na żywo; diagnostyka `__test.settings`.

Czułość myszy, głośność master/muzyki (`master.gain` i `musicGain.gain` już
czekają w `AudioSys`), przełącznik bloom/cieni, zapis w localStorage.
Tanie, a odblokowuje TECH-1 (wydajność) i PROP-6 (dostępność).

### PROP-2 · Wślizg (slide) — S (po RUCH-1) — ✅ ZROBIONE (2026-08-14)

> Kucnięcie przy prędkości sprintu = wślizg ~0,55 s: kierunek utrwalony na
> wejściu, prędkość ~1,1× i wygasa; skok w trakcie zachowuje pęd (synergia
> z bunnyhopem), potem 0,8 s cooldownu. Przechył kamery, poszerzony FOV,
> dźwięk szurnięcia; diagnostyka `__test.slide`.

Kucnięcie w sprincie = krótki wślizg z zachowaniem pędu (synergia
z bunnyhopem — sekcje `gates` zrobią się przyjemniejsze).

### PROP-4 · Granaty — M — ✅ ZROBIONE (2026-08-14)

> Klawisz G (`js/grenades.js`): pula pocisków, łuk z grawitacją, odbicia od
> podłogi i ścian (przelatuje NAD niskimi osłonami — `minTop`), zapalnik
> 1,7 s, AoE 4,5 m (95→edge, spada liniowo), 50% obrażeń własnych, rani
> propy. Zapas: 2 na start poziomu, sklep „Granaty ×2" (limit 4), licznik
> na HUD; diagnostyka `__test.grenades`.

Klawisz G, łuk z grawitacją (fizyka jak cząsteczki), obrażenia obszarowe
z odrzutem — wzorzec AoE już jest w generatorach (props.js). Pozycja
w sklepie + ikona + dźwięk.

### PROP-5 · Radar / kompas — M

Kierunki botów na obwódce ekranu albo mały radar; off-screen chevrony celów
już istnieją — to ich rozszerzenie o kontakty wroga. Ważniejsze po SCENA-1
(w mieście łatwiej zgubić orientację).

### PROP-6 · Dostępność — S — ✅ CZĘŚCIOWO (2026-08-14)

> Wyłącznik strobo dronów jest w ekranie ustawień (PROP-1): zamiast migania
> oba paski świecą stałym, średnim blaskiem. Zostało: remapowanie klawiszy
> i tryb dla daltonistów.

Wyłącznik strobo dronów (migotanie!), remapowanie klawiszy, opcjonalnie tryb
dla daltonistów (liberie mają różnić się też jasnością). Część ustawień
z PROP-1.

### PROP-7 · Ekran wyników misji — M

Po misji: wykres HP w czasie, celność per broń, timeline zabójstw, porównanie
z najlepszym czasem. Dane już częściowo zbierane (medale).

### PROP-8 · Nagroda za komplet medali — S

30/33 medali = bonus (skórka broni „chrom LSPD"? złota liberia dronów?)
+ linia w outro. Liczniki w zapisie już są.

### PROP-9 · Audio otoczenia — M (razem ze SCENA-1)

Materiał podłoża pod krokami (asfalt/beton/metal), pogłos zależny od
otoczenia (ciasny zaułek vs otwarta ulica), ambient sceny (wiatr, odległy
ruch, syreny). Wszystko syntetyczne — rozszerzenie istniejących pętli.

### PROP-10 · Checkpointy w dłuższych misjach — M

Misje wieloetapowe (łańcuchy `after`) wznawiane od ostatniego ukończonego
celu zamiast od zera — im trudniejsza gra (TRUD-1), tym bardziej potrzebne.
Po PROG-1 bez komplikacji ekonomicznych (punkty tylko za ukończenie misji).

### PROP-11 · Dzienny seed areny endless — S

Jeden wspólny seed dziennie (z daty) obok losowego — rekordy porównywalne
między graczami; z TECH-2 zrobi się z tego wspólna tablica wyników.

---

## Proponowana kolejność

1. **Faza 1 — fundamenty i szybkie wygrane:** RUCH-1, RUCH-2, MISJA-4,
   MISJA-5, MISJA-1, BOT-2, PROG-1 → TRUD-1, PROP-1, PROP-6. Gra robi się
   trudniejsza, uczciwsza i przyjemniejsza w ruchu bez ruszania wizualiów;
   trudność balansujemy dopiero na nowej progresji.
2. **Faza 2 — tożsamość wizualna:** BOT-1, BRON-1, MENU-1, MENU-2, PROP-12.
   Gra zaczyna wyglądać jak „STATUS 1", nie jak prototyp.
3. **Faza 3 — świat i fabuła:** PROP-3 → SCENA-1 → SCENA-2, MISJA-2, MISJA-3,
   PROP-9. Największy skok jakościowy; nawigacja botów PRZED miastem.
4. **Faza 4 — zasięg:** TECH-1, potem TECH-2. Reszta PROP-ów wchodzi między
   fazy jako przerywniki.

## Decyzje do podjęcia (przy realizacji danej pozycji)

- **PROG-1:** czy medale też dają punkty umiejętności (obok premii za
  misję)? Po której misji która broń? Czy endless startuje z pełnym
  arsenałem, czy kupuje bronie po staremu?
- **MENU-2:** czy łagodzimy zasadę „zero plików audio" dla menu (wymaga
  weryfikacji ścieżki base64 → `decodeAudioData` pod `file://` + płatnego
  planu SUNO)? Plan B: ambient proceduralny.
- **BRON-1:** co z SMG (pierwowzór?) — nie było go w wytycznych.
- **TECH-2:** który wariant sygnalizacji (ręczne SDP / lekki broker /
  odłożyć)?
- **MISJA-4:** czy porażka przerywa dialog, czy dialog dogrywa się na ekranie
  porażki?
- **TRUD-1:** podnosimy bazę czy mnożniki `DIFFICULTIES` (easy ma zostać
  przystępne)?
