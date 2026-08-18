# DEVRIG - edytor chwytu i animacji broni (brief dla nowej sesji)

Dokument jest POMYSŁEM, nie specyfikacją do wklepania. Wersja projektu,
w której to ma powstać, leży na innym komputerze i wyprzedza to repo.

## ZANIM cokolwiek napiszesz

Najpierw przeanalizuj stan faktyczny w repo, w którym jesteś. Nie zakładaj,
że poniższe opisy pasują do kodu, ktory widzisz. Sprawdz co najmniej:

1. `js/weapons.js` - `buildViewmodel()` i `updateViewmodel()`. Czy modele
   broni mają już doczepione ręce? Jak są ułożone (kod, dane, wypieczona poza)?
2. `js/modelkit.js` - co dokładnie zwraca `buildModel()` w `parts` i `sockets`.
3. `tools/gen_models.py` - wpisy w `MODELS` dla broni i rąk. **Kluczowe:
   czy dłoń jest jedną bryłą, czy palce wyszły jako osobne części.**
   Jeśli dłoń jest jedną częścią, palców NIE DA SIĘ animować bez ponownego
   wypieczenia z inną mapą jointów. Zgłoś to użytkownikowi zanim ruszysz dalej.
4. `js/devmap.js` + `#dev-hud` w `index.html` + `devKey` w `js/input.js` -
   istniejąca infrastruktura dev, do której to się wpina.
5. Czy istniejące animacje (bieg, przeładowanie, ADS) są liczone wzorami
   w kodzie, czy są już jakimiś danymi.

Po analizie **przedstaw użytkownikowi plan i rozbieżności wobec tego
dokumentu**. Dopiero potem koduj.

## Problem

Ręce trzymające broń są źle ułożone. Ustawianie palców i zgięć przez
zgadywanie kątów Eulera w kodzie i ocenianie efektu ze zrzutu jest wolne
i niedokładne (ciemna broń na ciemnym tle). Użytkownik nie chce wchodzić
w modelarstwo w Blenderze. Broni będzie więcej (w tym broń biała, np. pałka),
animacji też (bieg, przeładowanie, celowanie, uderzenie kolbą).

## Rozwiązanie

Graficzne narzędzie deweloperskie w grze, w którym użytkownik sam ustawia
pozy myszką, a wynik eksportuje jako dane.

### Krok 0: animacje muszą przestać być kodem

Dopóki poza jest wyrażeniem (`Math.sin(...)`), narzędzie nie ma czego
edytować. Pozy i klatki lądują w danych, np. `js/rig_data.js`:

```js
const RIG = {
  rifle: {
    grip: { handR: { pos:[x,y,z], rot:[x,y,z] }, thumb: {...}, index: {...} },
    clips: {
      idle:   [{ t: 0, pose: {...} }],
      run:    [{ t: 0, pose: {...} }, { t: 0.5, pose: {...} }],
      reload: [{ t: 0, pose: {...} }, { t: 0.35, pose: {...} }, { t: 1, pose: {...} }],
      ads:    [{ t: 0, pose: {...} }, { t: 1, pose: {...} }],
    }
  }
}
```

Runtime robi już tylko interpolację między klatkami. Ta sama filozofia co
"misja = dane" w kampanii.

### Etap 1: edytor statycznej pozy chwytu

Nowy `js/devrig.js` + panel w `index.html` + klawisz w `devKey` (i w `GAME_KEYS`).
Dostępny TYLKO przy `game.dev` (Strzelnica).

- lista części czytana DYNAMICZNIE z `buildModel().parts`, nie zaszyta na sztywno
- wybór broni (1..5) i części (handR, kciuk, palce, handL)
- suwaki pos XYZ / rot XYZ / skala, wpisywane wprost w `part.position`
  i `part.rotation`, efekt widoczny w tej samej klatce
- **orbit-kamera wokół broni** - z widoku FPS połowa chwytu jest zasłonięta,
  bez tego narzędzie jest bezużyteczne
- **jasne światło dev** na czas edycji
- przyciski: reset, kopiuj JSON do schowka, wklej JSON

Skala: ~250 linii.

### Etap 2: oś czasu i klipy

- wybór klipu (idle / run / reload / ads / melee) i dodawanie nowych
- oś czasu z klatkami kluczowymi: dodaj / usuń / duplikuj / przesuń
- odtwarzanie z pętlą i **spowolnieniem** (błędy widać dopiero przy ~0.2x tempa)
- eksport całego rigu jednym JSON-em

Skala: ~250 linii.

### Etap 3: migracja istniejących animacji na dane

Przepięcie obecnych animacji z kodu na format `RIG`. To musi się dziać na
tej wersji projektu, w której te animacje faktycznie żyją.

### Później

Podgląd hitboxa melee na tej samej osi czasu (pałka, uderzenie kolbą).

## Ograniczenia projektu (patrz CLAUDE.md)

- klasyczne skrypty, NIE moduły ES; nowy plik wpinany przez `<script defer>`
  w `index.html` we właściwej kolejności; `'use strict';` na górze
- narzędzie jest wyłącznie dev: nie może dotykać rozgrywki, zapisu, rekordu
  areny ani statystyk służby (`game.dev` już to izoluje)
- komentarze w kodzie po angielsku, UI po polsku
