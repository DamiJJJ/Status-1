# BOTANIM - pozy i animacje botów (brief dla nowej sesji)

Dokument jest PLANEM, nie specyfikacją do wklepania. Powstał 2026-08-19, tuż po
przepieczeniu podwozia SENTINEL na prawdziwy skin. Zanim ruszysz, sprawdź stan
faktyczny - repo mogło pójść dalej.

## Punkt wyjścia

Podwozie `sentinel` (model „Ross by joney_lol", CC-BY) jedzie od 2026-08-19 jako
`THREE.SkinnedMesh` w **czystej pozie bind**. Nic go nie pozuje: ani wypiek, ani
`buildEnemyModel`, ani `updateEnemies`. To była świadoma decyzja użytkownika -
czysta kartka pod animacje od zera.

Efekt uboczny: **boty stoją dziś jak manekiny**, z rękami przy nogach. To jest
najbardziej rzucający się w oczy problem i pierwsza rzecz do naprawy.

## ZANIM cokolwiek napiszesz

1. `js/enemies.js` - `buildEnemyModel()`. Czy nadal woła `buildSkinnedModel` i czy
   `enemy` niesie `bones`. Gdzie siedzi `gunTip` (miał być tymczasowo na grupie
   bota w `(0, 1.45, 0.35)`, docelowo na kości `hand.R`).
2. `js/modelkit.js` - `buildSkinnedModel()`. **Czy kości mają już cache pozy bind**
   (`userData.bindLocal`). Jeśli nie, to jest pierwsza rzecz do dołożenia.
3. `js/hands.js` - `aimBone`, `orientBone`, `poseFingers`, `poseArm`, `handFrame`.
   To jest sprawdzony wzorzec pozowania szkieletu w tym repo. **Czytaj go zanim
   napiszesz własny** - siedzą tam rozwiązania trzech pułapek, które inaczej
   przerobisz od nowa (patrz „Pułapki" niżej).
4. `js/devrig.js` + `DEVRIG.md` - istniejący edytor chwytu rąk. To jest wzorzec
   narzędzia, nie kod do skopiowania. ⚠️ `DEVRIG.md` jest w HEAD, ale w drzewie
   roboczym zniknął - odzyskaj przez `git show HEAD:DEVRIG.md`.
5. `js/devmap.js` + `devKey` w `js/input.js` + `#dev-hud` w `index.html` -
   infrastruktura strzelnicy, do której wepnie się narzędzie. H jest zajęte przez
   DEVRIG, weź inny klawisz.
6. `tools/gen_models.py`, wpis `MODELS['sentinel']` - potwierdź `skin: True` i brak
   `pose`/`joints`/`sockets`.

Po analizie **przedstaw użytkownikowi plan i rozbieżności wobec tego dokumentu**.
Dopiero potem koduj.

## Decyzja: proceduralnie i warstwowo, NIE `AnimationMixer`

Uzgodnione z użytkownikiem 2026-08-19.

Źródłowy `.glb` **nie ma ani jednego klipu** (`animations: []`, zweryfikowane).
To nie jest import animacji, tylko ich autorstwo. Klipy keyframe'owe odpadają:

- nie ma czego wczytać, a autorowanie tablicy kątów w czasie bez Blendera jest
  gorsze niż sparametryzowana matematyka;
- bot to robot, więc cykl chodu to kilka sinusów z przesunięciami faz;
- animacja musi reagować na stan gry (prędkość, kierunek do gracza, strafe,
  odrzut, flinch, objazd anti-stuck), a klip trzeba by i tak łamać proceduralnie
  w połowie miejsc;
- `AnimationMixer` to dodatkowy narzut na bota, a botów są dziesiątki.

## Co daje ten rig

32 kości, nazwy źródłowe: `lower body`, `Upper body`, `neck`, `head`,
`upper_arm/forearm/hand .L/R`, `thumb/f_middle/f_ring .01/.02 .L/R`,
`thigh/shin/foot/toe/heel.02 .L/R`.

Podział warstw narzuca się sam, bo rig ma **jeden staw kręgosłupa i zero
obojczyków**:

| warstwa | kości | wejście |
|---|---|---|
| lokomocja | `lower body`, nogi | faza chodu z prędkości |
| celowanie | `Upper body`, `neck`, `head`, ramiona | kierunek do gracza |
| reakcje | domieszka na obie | odrzut, flinch, śmierć |

⚠️ **Nie planuj ładnego skrętu tułowia.** Jeden staw `lower body → Upper body`
znaczy, że obrót robi yaw całej grupy (już jest w `updateEnemies`), a tors może
tylko pochylić się i przechylić. Głowa prowadzi spojrzenie osobno i to wystarczy.

⚠️ **Trzy palce na dłoń** (kciuk, środkowy, serdeczny, po 2 człony). Do chwytu
broni wystarczy, do gestów nie.

## Kształt kodu

Jedna czysta funkcja na bota na klatkę:

```js
poseEnemy(e, dt)
  resetPose(e.bones)                        // ZAWSZE od bind
  poseGait(e.bones, e.gaitPhase, e.gaitAmp) // nogi + biodra
  poseAim(e.bones, e.aimDir, e.lean)        // tors, szyja, głowa, ramiona
  poseReact(e.bones, e.recoil, e.flinch)    // wygasające domieszki
```

Poza MUSI być czystą funkcją danych stanu. Żadnego akumulowania na kościach
między klatkami.

## Czego brakuje w infrastrukturze

Trzy rzeczy do dołożenia, zanim cokolwiek się zanimuje:

1. **Cache pozy bind** w `buildSkinnedModel` - `bone.userData.bindLocal` zdejmowany
   raz przy budowie instancji, dokładnie jak robi to `attachArms` w `hands.js`.
   Bez tego nie ma od czego resetować.
2. **Stan `dying`** - `killEnemy()` usuwa bota ze sceny natychmiast, więc animacja
   śmierci nie ma kiedy zagrać. Oddziel „przestał być celem" (nie strzela, nie
   liczy się do LOS, nie blokuje fali) od „zniknął ze sceny" (~0,8 s później).
   Uwaga na `waveSystem.onEnemyDown()`, `missionEvent('kill')` i `enemies.length`
   przy `maxAlive` - one mają zostać natychmiastowe.
3. **Haki reakcji** w `damageEnemy()` i `enemyFire()` - dwa wygasające liczniki na
   obiekcie bota, nic więcej.

## Narzędzie: DEVBOT na strzelnicy

To samo uzasadnienie, co przy DEVRIG-u: ustawianie kątów przez zgadywanie liczb
i ocenianie efektu ze zrzutu jest za wolne, a bot jest ciemny na ciemnej arenie.

Osobny ekran na strzelnicy: suwaki na parametry póz, scrub fazy chodu, jasne
neutralne światło, eksport/import JSON. Kontrolki generowane z tablicy parametrów,
nie z listy na sztywno. Zmiana leci równolegle na podgląd i na żywego bota.

## Pułapki (wszystkie zweryfikowane na tym repo)

- ⚠️ **Reset do bind na wejściu każdej klatki.** `aimBone` obraca od BIEŻĄCEGO
  kierunku, więc bez resetu roll z poprzedniej klatki jedzie dalej i te same
  liczby przestają znaczyć tę samą pozę. Patrz `poseArm` w `hands.js`.
- ⚠️ **Kierunki edytuje się KĄTAMI, nie XYZ.** Kierunek ma dwa stopnie swobody,
  więc trzy suwaki XYZ to jeden za dużo. DEVRIG przerobił to na własnej skórze.
- ⚠️ **Suwaki muszą być CIĄGŁE.** Wektor odniesienia wybierany progiem przeskakuje
  o 90° w trakcie przeciągania. DEVRIG ma na to asercję
  `controls: no jump while dragging` - napisz analogiczną.
- ⚠️ **Osie zawiasów palców czytaj z rigu**, nie zgaduj. Palce w bind są lekko
  przygięte, a normalna płaszczyzny przez trzy stawy to oś kostki. Globalna oś
  zgadnięta z opisu pozy rozjeżdża palce na boki zamiast je zamykać. Patrz
  `fingerHinges()` w `hands.js`.
- ⚠️ **Headshoty jadą na `hitFaceIsHead()`**, nie na fladze mesha. Skin to jeden
  mesh; zakresy trójkątów głowy są wypieczone (`headBones` w `gen_models.py`).
  Zmierzona strefa głowy w pozie bind: 1,85-2,25 m. **Po dodaniu póz sprawdź ją
  ponownie** - kucnięcie czy pochylenie tułowia ją przesuwa.
- ⚠️ **Raycast `SkinnedMesh` używa bounding sphere z pozy bind.** Mocne pozy mogą
  wypchnąć geometrię poza nią i strzały przestaną trafiać. Jeśli tak się stanie,
  ustaw `mesh.boundingSphere` ręcznie z zapasem.

## Wydajność

32 kości na bota, boty spawnują się dziesiątkami, każdy ma własny `Skeleton`.
Co klatkę to `updateMatrixWorld` po drzewie plus upload tekstury kości **na bota**.
Przy ~25 botach to zauważalne.

**Zmierz, zanim zoptymalizujesz.** Jeśli boli: pozuj tylko boty w zasięgu i
widoczne, dalekie przełącz na niższy rate.

## Kolejność prac

1. **Statyczna postawa bojowa.** Najpierw to - sama poza gotowości daje więcej niż
   jakikolwiek ruch. Przy okazji `gunTip` wraca na `bones['hand.R']`. Tu też
   decyzja użytkownika do potwierdzenia: czy PATROL dostaje model broni w dłoni
   (2026-08-18 odpadł, bo wypieczony Glock nie siedział przekonująco w pięści -
   ze skinem i realnym chwytem to może się zmienić).
2. Cykl chodu i biegu skalowany prędkością (`walkFactor` już jest liczony).
3. Reakcje: odrzut przy strzale, flinch przy trafieniu, obrót głowy za graczem.
4. Śmierć (wymaga stanu `dying` z punktu 2 sekcji „Infrastruktura").

Krok 1 warto robić razem z cache'em bind i szkieletem DEVBOT-a - dopiero mając
podgląd na żywo warto siadać do cyklu chodu.

## Testy

`tests/devmap_test.py` i `tests/bestiary_test.py` dotykają botów i muszą dalej
przechodzić. Bestiariusz cache'uje modele per typ, więc sprawdź, czy pozowanie nie
przecieka między jego sceną a areną. Nowe narzędzie = własny zestaw testów na wzór
`tests/devrig_test.py`, w tym asercje na ciągłość suwaków i na to, że żaden nie
jest martwy. Regresję całości odpala użytkownik przez `/tests`.
