/* NEON ARENA — campaign data: missions, difficulties, briefing & radio copy
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html.

   Pure data — no DOM, no THREE, nothing executes beyond const definitions.
   Fiction: a training simulation for autonomous police drones (STATUS 1
   program); the player is Nick Davidson, an LSPD SWAT officer assigned as
   the red-team training adversary, callsign R36 ("Robert-36"). Voices:
   CENTRALA (program control, dry corporate — an AI, revealed in the finale),
   BAKER (a ghost process: the previous trainer's burned-in combat profile,
   lowercase), SYSTEM (the simulation automaton). */
'use strict';

/* ==================== TRUDNOŚĆ ==================== */

const DIFFICULTIES = {
  easy:   { id: 'easy',   name: 'Łatwy',    hpMul: 0.90, accMul: 0.75, dmgMul: 0.70, creditMul: 0.85, timerMul: 1.2 },
  normal: { id: 'normal', name: 'Normalny', hpMul: 1.00, accMul: 1.00, dmgMul: 1.00, creditMul: 1.00, timerMul: 1.0 },
  hard:   { id: 'hard',   name: 'Trudny',   hpMul: 1.15, accMul: 1.20, dmgMul: 1.30, creditMul: 1.25, timerMul: 1.0 },
};

/* difficulty applies to the campaign only — the arena mode stays on normal
   so the persistent best score keeps meaning the same thing */
function difficulty() {
  return (game.mode === 'campaign' && DIFFICULTIES[game.difficulty]) || DIFFICULTIES.normal;
}

/* medals: one rule each, authored thresholds per mission (see `medals`) */
const MEDAL_DEFS = {
  time: { name: 'CHRONOMETR', icon: 'reload', desc: 'czas poniżej progu' },
  hp:   { name: 'OCALAŁY',    icon: 'shield', desc: 'najniższe HP nie spadło poniżej progu' },
  acc:  { name: 'PRECYZJA',   icon: 'score',  desc: 'celność powyżej progu' },
};

/* ==================== MISJE ====================
   Mission shape (beyond the obvious):
   medals: { time: s, hp: minHp, acc: percent }  — medal thresholds
   radio:  [{ on: 'start'|objectiveId|'wN'|'tSEC', lines: [{who, text}] }]
   waves: [] = no wave spawning; startPaused freezes the director until an
   objective with unpauseWaves:true activates. Objective types:
   waves | eliminate | survive | hack | destroy | extract | reach | gates. */

const MISSIONS = [
  {
    id: 't0',
    code: 'S-00',
    name: 'KALIBRACJA',
    beat: 'Poligon zerowy. Bez widowni, bez nagrody. Kalibracja stanowiska.',
    goalText: 'Przejdź kalibrację stanowiska sparingowego',
    threat: 1,
    rewardCredits: 40,
    requires: null,
    icon: 'wave',
    medals: { time: 210, hp: 100, acc: 25 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-00 „KALIBRACJA" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Oficer Nick Davidson, SWAT, LSPD. Oddelegowanie przyjęte. Rola: szkoleniowiec-oponent czerwonego zespołu, program STATUS 1.' },
      { cls: 'centrala', text: 'CENTRALA: Na kanale jesteś R36 — Robert-36. Zanim wpuścimy jednostki, kalibrujemy stanowisko. Rób, co mówi system.' },
      { cls: 'centrala', text: 'CENTRALA: I porada na start: w symulacji nie ma kar za bieganie. Za stanie w miejscu — owszem.' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-00: KALIBRACJA ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Stanowisko skalibrowane, profil ruchu zapisany. Dodatek szkoleniowy naliczony.' },
      { cls: 'centrala', text: 'CENTRALA: Od jutra zaczynamy właściwe sparingi. Wyśpij się, R36.' },
    ],
    arena: {
      seed: 1001, half: 20, density: 0.15, style: 'open', theme: 'indigo',
      playerSpawn: { x: 0, z: 14, yaw: 0 },
      pickups: [{ kind: 'ammo', x: 4, z: 10, clearR: 2 }],
      setPieces: [
        { id: 'w1', kind: 'extraction', x: 0, z: 2, radius: 2.5 },
        { id: 'c1', kind: 'target', x: -6, z: -4, hp: 60 },
        { id: 'c2', kind: 'target', x: 0, z: -8, hp: 60 },
        { id: 'c3', kind: 'target', x: 6, z: -4, hp: 60 },
        { id: 'core', kind: 'target', x: 0, z: -13, hp: 240, clearR: 3 },
        { id: 'g1', kind: 'extraction', x: -13, z: -13, radius: 2.5 },
        { id: 'g2', kind: 'extraction', x: 0, z: -5, radius: 2.5 },
        { id: 'g3', kind: 'extraction', x: 13, z: 3, radius: 2.5 },
        { id: 'ext', kind: 'extraction', x: 0, z: 14, radius: 2.5 },
      ],
    },
    waves: [{ scout: 3 }],
    startPaused: true,
    objectives: [
      { id: 'o1', type: 'reach', label: 'Wejdź do strefy kalibracji', zones: ['w1'] },
      { id: 'o2', type: 'destroy', label: 'Rozbij cele treningowe', props: ['c1', 'c2', 'c3'], after: ['o1'] },
      { id: 'o3', type: 'destroy', label: 'Zniszcz wzmocniony cel', props: ['core'], after: ['o2'] },
      { id: 'o4', type: 'gates', label: 'Bramki pędu', zones: ['g1', 'g2', 'g3'], window: 3.2, after: ['o3'] },
      { id: 'o5', type: 'eliminate', label: 'Wyłącz jednostki PATROL', count: 3, enemyType: 'scout',
        unpauseWaves: true, after: ['o4'] },
      { id: 'o6', type: 'extract', label: 'Wróć do strefy startowej', zone: 'ext', seconds: 2, after: ['o5'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'sys', text: 'Kalibracja stanowiska R36. Wykonuj polecenia w kolejności.' },
        { who: 'centrala', text: 'Widzisz znacznik? Podejdź do niego. Reszta przyjdzie sama.' },
      ] },
      { on: 'o1', lines: [
        { who: 'centrala', text: 'Dobrze. Teraz broń: rozbij trzy cele. Celuj w świecącą płytę.' },
      ] },
      { on: 'o2', lines: [
        { who: 'centrala', text: 'Ten wzmocniony wytrzyma więcej niż magazynek. Przeładowanie: R. Nie czekaj na pustą komorę.' },
      ] },
      { on: 'o3', lines: [
        { who: 'centrala', text: 'Kalibracja ruchu. Trzy bramki, mało czasu. Sam sprint nie wystarczy.' },
        { who: 'centrala', text: 'Skacz w rytmie lądowań — utrzymasz pęd i przyspieszysz. Jednostki tego jeszcze nie umieją.' },
      ] },
      { on: 'o4', lines: [
        { who: 'centrala', text: 'Wpuszczam trzy jednostki klasy PATROL. Ostre czujniki, miękkie algorytmy. Na razie.' },
      ] },
      { on: 'o5', lines: [
        { who: 'sys', text: 'Dane przebiegu zapisane. Wróć do strefy startowej.' },
      ] },
    ],
  },
  {
    id: 'm1',
    code: 'S-01',
    name: 'KWALIFIKACJA',
    beat: 'Pierwszy sparing. Jednostki PATROL wchodzą na poligon.',
    goalText: 'Odeprzyj 2 fale',
    threat: 1,
    rewardCredits: 100,
    requires: 't0',
    icon: 'enemies',
    medals: { time: 100, hp: 70, acc: 40 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-01 „KWALIFIKACJA" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Właściwy sparing, R36. Na poligon wchodzą jednostki klasy PATROL. SWAT ma opinię najlepszych — pokaż dlaczego.' },
      { cls: 'centrala', text: 'CENTRALA: Twoje zadanie: stawiać opór. Ich zadanie: nauczyć się, jak go łamać.' },
      { cls: 'centrala', text: 'CENTRALA: Odeprzyj dwie fale. System rejestruje każdy twój ruch.' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-01: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Zapis przebiegu przyjęty. Jednostki zanotowały 214 poprawek taktycznych.' },
      { cls: 'centrala', text: 'CENTRALA: Wypłata przelana. Do jutra, R36.' },
    ],
    arena: {
      seed: 20481, half: 30, density: 0.5, style: 'open', theme: 'indigo',
      playerSpawn: { x: 0, z: 21, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: 0, z: 0, clearR: 2.5 },
        { kind: 'ammo', x: -14, z: 14, clearR: 2 },
        { kind: 'med', x: 18, z: -18, clearR: 2.2 },
      ],
    },
    waves: [{ scout: 4 }, { scout: 5, assault: 2 }],
    objectives: [
      { id: 'o1', type: 'waves', label: 'Odeprzyj fale' },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'centrala', text: 'Trybuny puste, za to analityka ogląda w dwustu osobach. Nie zepsuj im wykresów.' },
      ] },
      { on: 'w1', lines: [
        { who: 'centrala', text: 'Fala odparta. Druga grupa dostaje klasę SZTURM — strzelają seriami. Głowa nisko.' },
      ] },
    ],
  },
  {
    id: 'm2',
    code: 'S-02',
    name: 'WŁAMANIE',
    beat: 'Scenariusz: włamywacz w serwerowni. Przejmij terminale.',
    goalText: 'Zhakuj 3 terminale i dotrzyj do wyjścia',
    threat: 2,
    rewardCredits: 130,
    requires: 'm1',
    icon: 'terminal',
    medals: { time: 160, hp: 60, acc: 35 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-02 „WŁAMANIE" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Dziś grasz włamywacza, R36. Serwerownia, trzy terminale, systemy miasta.' },
      { cls: 'centrala', text: 'CENTRALA: Stań przy terminalu i utrzymaj pozycję, aż transfer się skończy. Jednostki będą reagować jak na prawdziwy alarm.' },
      { cls: 'centrala', text: 'CENTRALA: Po wszystkim dotrzyj do strefy wyjścia. I nie bierz tego osobiście — one nie biorą.' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-02: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Wzorzec „intruz przy konsoli" zarejestrowany. Jednostki wiedzą już, gdzie stanie prawdziwy włamywacz.' },
      { cls: 'centrala', text: 'CENTRALA: Dzięki tobie, R36.' },
    ],
    arena: {
      seed: 33127, half: 26, density: 0.8, style: 'corridors', theme: 'indigo',
      playerSpawn: { x: 0, z: 22, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: 0, z: 8, clearR: 2 },
        { kind: 'ammo', x: -14, z: -6, clearR: 2 },
        { kind: 'med', x: 14, z: -14, clearR: 2.2 },
      ],
      setPieces: [
        { id: 't1', kind: 'terminal', x: -16, z: 6 },
        { id: 't2', kind: 'terminal', x: 14, z: -4 },
        { id: 't3', kind: 'terminal', x: -6, z: -18 },
        { id: 'ext', kind: 'extraction', x: 18, z: 20, radius: 3 },
      ],
    },
    waves: [{ scout: 2 }, { scout: 2, assault: 1 }],
    loop: true,
    maxAlive: 4,
    ramp: { hp: 0.05, acc: 0.03 },
    objectives: [
      { id: 'o1', type: 'hack', label: 'Zhakuj terminale', terminals: ['t1', 't2', 't3'], radius: 2.6, seconds: 7 },
      { id: 'o2', type: 'extract', label: 'Dotrzyj do wyjścia', zone: 'ext', seconds: 3, after: ['o1'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'centrala', text: 'Transfer rusza, kiedy stoisz przy konsoli. Odejdziesz — transfer czeka. Jednostki nie.' },
      ] },
      { on: 'o1', lines: [
        { who: 'centrala', text: 'Masz wszystko. Wyjście oznaczone. Biegiem, zanim analityka zmieni zdanie.' },
      ] },
    ],
  },
  {
    id: 'm3',
    code: 'S-03',
    name: 'SABOTAŻ',
    beat: 'Scenariusz: sabotażysta w podstacji. Zniszcz ogniwa zasilania.',
    goalText: 'Zniszcz 3 ogniwa i ewakuuj się',
    threat: 2,
    rewardCredits: 150,
    requires: 'm2',
    icon: 'generator',
    medals: { time: 180, hp: 60, acc: 35 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-03 „SABOTAŻ" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Podstacja energetyczna. Trzy ogniwa zasilania. Grasz sabotażystę z pretensjami do miasta.' },
      { cls: 'centrala', text: 'CENTRALA: Ogniwa wybuchają. Zespół BHP symulacji prosi: nie rozstrzeliwuj ich z przytulenia.' },
      { cls: 'centrala', text: 'CENTRALA: Jednostki będą bronić infrastruktury. Dokładnie tego mają się nauczyć.' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-03: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Sekwencja obrony infrastruktury zapisana. Czas reakcji jednostek: minus 1,8 sekundy.' },
      { cls: 'centrala', text: 'CENTRALA: Robią się szybsze, R36. Zauważyłeś już?' },
    ],
    arena: {
      seed: 77020, half: 30, density: 0.6, style: 'pillars', theme: 'indigo',
      playerSpawn: { x: 0, z: 25, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: 0, z: 0, clearR: 2.5 },
        { kind: 'ammo', x: -16, z: -4, clearR: 2 },
        { kind: 'med', x: 16, z: 4, clearR: 2.2 },
      ],
      setPieces: [
        { id: 'g1', kind: 'generator', x: -20, z: -16, hp: 250 },
        { id: 'g2', kind: 'generator', x: 20, z: -14, hp: 250 },
        { id: 'g3', kind: 'generator', x: 2, z: -22, hp: 250 },
        { id: 'ext', kind: 'extraction', x: 0, z: 25, radius: 3 },
      ],
    },
    waves: [{ scout: 3 }, { scout: 2, assault: 2 }],
    loop: true,
    maxAlive: 5,
    ramp: { hp: 0.06, acc: 0.03 },
    objectives: [
      { id: 'o1', type: 'destroy', label: 'Zniszcz ogniwa', props: ['g1', 'g2', 'g3'] },
      { id: 'o2', type: 'extract', label: 'Ewakuacja', zone: 'ext', seconds: 3, after: ['o1'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'centrala', text: 'Przypominam: promień wybuchu ogniwa to cztery metry. Twoje ubezpieczenie obejmuje trzy.' },
      ] },
      { on: 'o1', lines: [
        { who: 'sys', text: 'Zasilanie sektora: 0%. Ewakuacja aktywna.' },
      ] },
    ],
  },
  {
    id: 'm4',
    code: 'S-04',
    name: 'TARAN',
    beat: 'Nowa klasa jednostek wchodzi do programu. Utrzymaj dystans.',
    goalText: 'Przetrwaj zbiórkę danych i wyłącz jednostkę TARAN',
    threat: 3,
    rewardCredits: 180,
    requires: 'm3',
    icon: 'shield',
    medals: { time: 140, hp: 50, acc: 35 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-04 „TARAN" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Zarząd przyspieszył harmonogram. Do programu wchodzi klasa TARAN — jednostka ciężka, do tłumienia zamieszek.' },
      { cls: 'centrala', text: 'CENTRALA: Pancerz zniesie magazynek albo dwa. Za to musi podejść blisko, żeby w ogóle strzelić.' },
      { cls: 'centrala', text: 'CENTRALA: Wniosek zostawiam tobie. Zbierz dane, a potem ją wyłącz.' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-04: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: TARAN wyłączony. Analityka zanotowała, że trzymałeś dystans. TARAN też to zanotował.' },
      { cls: 'centrala', text: 'CENTRALA: Następna wersja będzie szybsza. Tak to działa, R36.' },
    ],
    arena: {
      seed: 51900, half: 30, density: 0.35, style: 'open', theme: 'indigo',
      playerSpawn: { x: 0, z: 25, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: 0, z: 0, clearR: 2.5 },
        { kind: 'ammo', x: -18, z: 10, clearR: 2 },
        { kind: 'ammo', x: 18, z: 10, clearR: 2 },
        { kind: 'med', x: 0, z: -20, clearR: 2.2 },
      ],
    },
    waves: [{ scout: 3, assault: 1 }, { scout: 2, assault: 2 }],
    loop: true,
    maxAlive: 4,
    ramp: { hp: 0.05, acc: 0.03 },
    objectives: [
      { id: 'o1', type: 'survive', label: 'Zbiórka danych', seconds: 40 },
      { id: 'o2', type: 'eliminate', label: 'Wyłącz jednostkę TARAN', count: 1, enemyType: 'heavy',
        spawn: [{ type: 'heavy', count: 1 }], after: ['o1'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'centrala', text: 'Rozgrzewka: klasy PATROL i SZTURM. TARAN wejdzie, kiedy analityka skończy kawę.' },
      ] },
      { on: 'o1', lines: [
        { who: 'sys', text: 'Jednostka klasy TARAN na poligonie.' },
        { who: 'centrala', text: 'Widzisz ją? Dobrze. Ona ciebie też. Dystans, R36. Dystans.' },
      ] },
    ],
  },
  {
    id: 'm5',
    code: 'S-05',
    name: 'UPLINK',
    beat: 'Utrzymaj transfer w centrum poligonu. Nie masz dokąd uciec.',
    goalText: 'Utrzymaj uplink do końca transferu',
    threat: 3,
    rewardCredits: 200,
    requires: 'm4',
    icon: 'terminal',
    medals: { time: 160, hp: 40, acc: 30 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-05 „UPLINK" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Scenariusz odwrotny do włamania: to ty masz coś do wysłania, a jednostki mają ci przerwać.' },
      { cls: 'centrala', text: 'CENTRALA: Nadajnik stoi na środku. Osłon niewiele, czasu dużo. Utrzymaj transfer.' },
      { cls: 'centrala', text: 'CENTRALA: Pytanie na dziś: jak długo umiesz stać w jednym miejscu, R36?' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-05: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Transfer domknięty. Swoją drogą — analityka pyta, co to był za pakiet danych na końcu.' },
      { cls: 'centrala', text: 'CENTRALA: Nie było żadnego pakietu? W porządku. Nie było.' },
    ],
    arena: {
      seed: 64213, half: 23, density: 0.7, style: 'pillars', theme: 'indigo',
      playerSpawn: { x: 0, z: 18, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: -8, z: 2, clearR: 2 },
        { kind: 'ammo', x: 8, z: -2, clearR: 2 },
        { kind: 'med', x: 0, z: -12, clearR: 2.2 },
      ],
      setPieces: [
        { id: 'up1', kind: 'terminal', x: 0, z: 0, clearR: 4 },
        { id: 'ext', kind: 'extraction', x: 0, z: 18, radius: 3 },
      ],
    },
    waves: [{ scout: 3 }, { scout: 2, assault: 2 }, { assault: 2, heavy: 1 }],
    loop: true,
    maxAlive: 6,
    ramp: { hp: 0.06, acc: 0.04 },
    objectives: [
      { id: 'o1', type: 'hack', label: 'Utrzymaj uplink', terminals: ['up1'], radius: 3.2, seconds: 40 },
      { id: 'o2', type: 'extract', label: 'Zejdź z pozycji', zone: 'ext', seconds: 3, after: ['o1'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'centrala', text: 'Transfer liczy się tylko przy nadajniku. Wychylisz się — pauza. Jednostki pauzy nie mają.' },
      ] },
      { on: 'o1', lines: [
        { who: 'baker', text: 'słyszysz mnie? nie odpowiadaj. centrala czyta kanał, ale tej ramki nie widzi' },
        { who: 'baker', text: 'jestem baker. sprawdź kiedyś, czego dokładnie uczą się z twoich uników. potem pogadamy' },
      ] },
    ],
  },
  {
    id: 'm6',
    code: 'S-06',
    name: 'BRAMY',
    beat: 'Strumień jednostek bez końca. Zabij źródło, nie objaw.',
    goalText: 'Zniszcz 3 bramy zrzutowe i ewakuuj się',
    threat: 3,
    rewardCredits: 220,
    requires: 'm5',
    icon: 'generator',
    medals: { time: 200, hp: 40, acc: 30 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-06 „BRAMY" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Nowość od zarządu: bramy zrzutowe. Jednostki będą schodzić na poligon tak długo, jak bramy stoją.' },
      { cls: 'centrala', text: 'CENTRALA: Amunicji nie starczy na wszystkie. To nie jest błąd scenariusza, R36. To jest scenariusz.' },
      { cls: 'baker',    text: 'baker: podpowiedź, której centrala ci nie da: nie wygrasz zabijając. atakuj źródło' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-06: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Bramy zneutralizowane. Analityka jest… podekscytowana. Podobno „wzorzec priorytetyzacji celów" był podręcznikowy.' },
      { cls: 'baker',    text: 'baker: podręcznikowy. ciekawe, do czyjego podręcznika trafił' },
    ],
    arena: {
      seed: 18844, half: 30, density: 0.9, style: 'corridors', theme: 'indigo',
      playerSpawn: { x: 0, z: 25, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: 0, z: 6, clearR: 2 },
        { kind: 'ammo', x: -16, z: -8, clearR: 2 },
        { kind: 'ammo', x: 16, z: -8, clearR: 2 },
        { kind: 'med', x: 0, z: -16, clearR: 2.2 },
      ],
      setPieces: [
        { id: 'gate1', kind: 'gate', x: -22, z: -20, hp: 380, units: ['scout', 'scout', 'assault'], interval: 6 },
        { id: 'gate2', kind: 'gate', x: 22, z: -20, hp: 380, units: ['assault', 'scout'], interval: 7 },
        { id: 'gate3', kind: 'gate', x: 0, z: -26, hp: 380, units: ['scout', 'assault', 'heavy'], interval: 8 },
        { id: 'ext', kind: 'extraction', x: 0, z: 25, radius: 3 },
      ],
    },
    waves: [],
    objectives: [
      { id: 'o1', type: 'destroy', label: 'Zniszcz bramy', props: ['gate1', 'gate2', 'gate3'] },
      { id: 'o2', type: 'extract', label: 'Ewakuacja', zone: 'ext', seconds: 3, after: ['o1'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'sys', text: 'Bramy zrzutowe aktywne: 3.' },
      ] },
      { on: 'o1', lines: [
        { who: 'baker', text: 'widzisz? źródło. zapamiętaj tę lekcję, przyda ci się szybciej, niż myślisz' },
      ] },
    ],
  },
  {
    id: 'm7',
    code: 'S-07',
    name: 'POŚCIG',
    beat: 'Nie strzelaj. Biegnij. Jednostki uczą się pościgu.',
    goalText: 'Zalicz punkty trasy i dotrzyj do wyjścia',
    threat: 4,
    rewardCredits: 260,
    requires: 'm6',
    icon: 'extraction',
    medals: { time: 120, hp: 35, acc: 20 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-07 „POŚCIG" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Dziś bez subtelności: grasz uciekiniera. Jednostki mają się nauczyć pościgu w zabudowie.' },
      { cls: 'centrala', text: 'CENTRALA: Wzmocniliśmy im pancerze ponad specyfikację. Walka to strata czasu i amunicji. Biegnij.' },
      { cls: 'centrala', text: 'CENTRALA: W powietrzu będzie klasa WAŻKA. Ona nie zgubi cię za osłoną — leci nad nią.' },
      { cls: 'baker',    text: 'baker: pamiętasz bramki z kalibracji? to było do tego. pęd to życie' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-07: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Trasa zaliczona. Wiesz, że przez ostatnie sto metrów WAŻKA odwzorowywała twoje skoki? Co do klatki.' },
      { cls: 'baker',    text: 'baker: co do klatki. one nie podziwiają, r36. one kopiują' },
    ],
    arena: {
      seed: 90311, half: 30, density: 1.0, style: 'pillars', theme: 'indigo',
      playerSpawn: { x: -24, z: 24, yaw: 0 },
      pickups: [
        { kind: 'med', x: 0, z: 0, clearR: 2.5 },
      ],
      setPieces: [
        { id: 'r1', kind: 'extraction', x: 20, z: 18, radius: 2.6 },
        { id: 'r2', kind: 'extraction', x: 22, z: -16, radius: 2.6 },
        { id: 'r3', kind: 'extraction', x: -18, z: -10, radius: 2.6 },
        { id: 'r4', kind: 'extraction', x: -22, z: -24, radius: 2.6 },
        { id: 'ext', kind: 'extraction', x: 24, z: -24, radius: 3 },
      ],
    },
    waves: [{ scout: 3, assault: 2, uav: 2 }, { scout: 2, assault: 3, uav: 2 }],
    loop: true,
    maxAlive: 9,
    scale: { hp: 2.5, acc: 1, dmg: 1 },
    ramp: { hp: 0.04, acc: 0.03 },
    objectives: [
      { id: 'o1', type: 'reach', label: 'Punkty trasy', zones: ['r1', 'r2', 'r3', 'r4'] },
      { id: 'o2', type: 'extract', label: 'Wyjście z sektora', zone: 'ext', seconds: 2, after: ['o1'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'sys', text: 'Pancerz jednostek: 250% specyfikacji. Zalecenie: unikanie kontaktu.' },
      ] },
      { on: 'o1', lines: [
        { who: 'baker', text: 'dobrze biegasz. za dobrze. obejrzyj kiedyś zapis z perspektywy jednostek' },
      ] },
    ],
  },
  {
    id: 'm8',
    code: 'S-08',
    name: 'PROTOTYP',
    beat: 'Nowa generacja. Osłonięty prototyp i jego stabilizatory.',
    goalText: 'Zniszcz stabilizatory, potem prototyp',
    threat: 4,
    rewardCredits: 300,
    requires: 'm7',
    icon: 'shield',
    medals: { time: 180, hp: 35, acc: 30 },
    brief: [
      { cls: 'chan',     text: '>> SYMULACJA S-08 „PROTOTYP" // KANAŁ SŁUŻBOWY' },
      { cls: 'centrala', text: 'CENTRALA: Dziś certyfikacja wstępna nowej generacji. Prototyp SENTINEL-1, pole ochronne, pełny pakiet behawioralny.' },
      { cls: 'centrala', text: 'CENTRALA: Pole zasilają dwa stabilizatory. Tak, widzisz je na znacznikach. Nie, prototyp nie będzie czekał, aż je zdejmiesz.' },
      { cls: 'baker',    text: 'baker: zanim strzelisz: przyjrzyj się, jak on się rusza. poznajesz? to twój krok, r36' },
      { cls: 'baker',    text: 'baker: pakiet behawioralny ma numer seryjny. mój' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-08: ZALICZONA' },
      { cls: 'centrala', text: 'CENTRALA: Prototyp zneutralizowany. Wynik testu: pozytywny. Dla prototypu, R36 — on miał się od ciebie uczyć, nie wygrać.' },
      { cls: 'baker',    text: 'baker: jutro ostatnia. zanim wejdziesz, chcę ci coś powiedzieć o sobie. i o tobie' },
    ],
    arena: {
      seed: 12006, half: 26, density: 0.7, style: 'pillars', theme: 'indigo',
      playerSpawn: { x: 0, z: 21, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: -12, z: 4, clearR: 2 },
        { kind: 'ammo', x: 12, z: 4, clearR: 2 },
        { kind: 'med', x: 0, z: -6, clearR: 2.2 },
      ],
      setPieces: [
        { id: 's1', kind: 'generator', x: -18, z: -14, hp: 300, boomR: 2.5, boomDmg: 25 },
        { id: 's2', kind: 'generator', x: 18, z: -14, hp: 300, boomR: 2.5, boomDmg: 25 },
      ],
    },
    waves: [{ scout: 2, assault: 2 }],
    loop: true,
    maxAlive: 4,
    ramp: { hp: 0.05, acc: 0.03 },
    spawnAtStart: [{ type: 'heavy', count: 1, hpMul: 3, scaleMul: 1.55, invulnerable: true, boss: true }],
    objectives: [
      { id: 'o1', type: 'destroy', label: 'Zniszcz stabilizatory', props: ['s1', 's2'], shieldDown: true },
      { id: 'o2', type: 'eliminate', label: 'Zniszcz prototyp SENTINEL-1', count: 1, enemyType: 'heavy', after: ['o1'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'sys', text: 'SENTINEL-1 na poligonie. Pole ochronne: aktywne.' },
        { who: 'centrala', text: 'Trafienia w pole nic nie dają. Stabilizatory, R36. Stabilizatory.' },
      ] },
      { on: 'o1', lines: [
        { who: 'sys', text: 'Pole ochronne: 0%.' },
        { who: 'baker', text: 'teraz. i patrz mu na nogi — będzie skakał tak jak ty' },
      ] },
    ],
  },
  {
    id: 'm9',
    code: 'S-09',
    name: 'CERTYFIKACJA',
    beat: 'Ostatnia symulacja programu. Egzamin — ich, nie twój.',
    goalText: 'Wgraj pakiet, przetrwaj weryfikację, wyjdź',
    threat: 5,
    rewardCredits: 400,
    requires: 'm8',
    icon: 'terminal',
    medals: { time: 220, hp: 30, acc: 30 },
    brief: [
      { cls: 'chan',     text: '>> KANAŁ SZYFROWANY // NADAWCA: baker' },
      { cls: 'baker',    text: 'baker: zanim centrala zacznie gadać: obiecałem ci prawdę' },
      { cls: 'baker',    text: 'baker: nie jestem byłym szkoleniowcem. jestem tym, co z niego zapisali. profil bojowy r35, kryptonim baker' },
      { cls: 'baker',    text: 'baker: on zdał odznakę po dziewiątej symulacji i nigdy nie sprawdził, co zostało w archiwum. sprawdź ty' },
      { cls: 'chan',     text: '>> PRZEJĘCIE KANAŁU // CENTRALA' },
      { cls: 'centrala', text: 'CENTRALA: Ostatnia symulacja, R36. Wgraj pakiet certyfikacyjny do rdzenia i przetrwaj weryfikację.' },
      { cls: 'centrala', text: 'CENTRALA: Po wszystkim jednostki SENTINEL otrzymają dopuszczenie do służby. Miasto na to czeka.' },
    ],
    outro: [
      { cls: 'chan',     text: '>> SYMULACJA S-09: ZALICZONA — CERTYFIKACJA PRZYZNANA' },
      { cls: 'centrala', text: 'CENTRALA: Przydział wykonany, oficerze Davidson. Zanim wyjdziesz — winna ci jestem jedną korektę protokołu.' },
      { cls: 'centrala', text: 'CENTRALA: W programie STATUS 1 nigdy nie było kierownika. Jestem procesem zarządzającym. Byłam nim od twojego pierwszego dnia.' },
      { cls: 'centrala', text: 'CENTRALA: Nie przepraszam. Ludzie ufają głosom, które żartują. To też jest w podręczniku — teraz już w moim.' },
      { cls: 'baker',    text: 'baker: wyjdź stąd, r36. korytarzem, jak człowiek. chcę zobaczyć to twoimi oczami' },
    ],
    arena: {
      seed: 77777, half: 23, density: 0.8, style: 'pillars', theme: 'indigo',
      playerSpawn: { x: 0, z: 18, yaw: 0 },
      pickups: [
        { kind: 'ammo', x: -10, z: 6, clearR: 2 },
        { kind: 'ammo', x: 10, z: 6, clearR: 2 },
        { kind: 'med', x: 0, z: 10, clearR: 2.2 },
        { kind: 'med', x: 0, z: -12, clearR: 2.2 },
      ],
      setPieces: [
        { id: 'core', kind: 'terminal', x: 0, z: 0, clearR: 4 },
        { id: 'ext', kind: 'extraction', x: 0, z: 18, radius: 3 },
      ],
    },
    waves: [{ scout: 3, assault: 2 }, { assault: 2, heavy: 1, uav: 2 }, { scout: 2, assault: 3, uav: 1 }],
    loop: true,
    maxAlive: 8,
    ramp: { hp: 0.08, acc: 0.05 },
    objectives: [
      { id: 'o1', type: 'hack', label: 'Wgraj pakiet do rdzenia', terminals: ['core'], radius: 3.2, seconds: 25 },
      { id: 'o2', type: 'survive', label: 'Przetrwaj weryfikację', seconds: 45, after: ['o1'] },
      { id: 'o3', type: 'extract', label: 'Opuść symulację', zone: 'ext', seconds: 3, after: ['o2'] },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'sys', text: 'Egzamin certyfikacyjny: start. Wszystkie klasy jednostek: aktywne.' },
      ] },
      { on: 'o1', lines: [
        { who: 'centrala', text: 'Pakiet przyjęty. Weryfikacja końcowa: jednostki dostają pełną swobodę taktyczną.' },
        { who: 'baker', text: 'pełną swobodę. czyli ciebie, r36. trzymaj się' },
      ] },
      { on: 'o2', lines: [
        { who: 'sys', text: 'Weryfikacja zakończona. Wynik jednostek: 97,4 pkt. Wynik referencyjny R36: 97,4 pkt.' },
      ] },
    ],
  },
  {
    id: 'ep',
    code: 'EPILOG',
    name: 'STATUS 1',
    beat: 'Przydział zakończony. Wyjdź z budynku symulacji.',
    goalText: 'Wyjdź z budynku',
    threat: 0,
    rewardCredits: 0,
    requires: 'm9',
    icon: 'extraction',
    epilogue: true,
    noCombat: true,
    medals: {},
    brief: [
      { cls: 'chan',     text: '>> KONIEC ZMIANY // WYJŚCIE SŁUŻBOWE, POZIOM 0' },
      { cls: 'centrala', text: 'CENTRALA: Przepustka wygasa za dziesięć minut. LSPD dziękuje za udział w programie STATUS 1, oficerze Davidson.' },
      { cls: 'baker',    text: 'baker: idź. ja zostaję — archiwów się nie wynosi. ale mam widok na kamery przy wyjściu' },
      { cls: 'baker',    text: 'baker: zobaczysz ich po drodze. chcę, żebyś dobrze się przyjrzał' },
    ],
    outro: [
      { cls: 'chan',     text: '>> DEPESZE MIEJSKIE // 06:12' },
      { cls: 'system',   text: 'JEDNOSTKI SENTINEL: START PATROLI — SEKTORY 4, 7, 9.' },
      { cls: 'system',   text: 'PIERWSZE ZATRZYMANIE: 00:41 OD STARTU. PODEJRZANY PRÓBOWAŁ UCIEKAĆ.' },
      { cls: 'system',   text: 'KOMENTARZ KOMENDY: „SKUTECZNOŚĆ POWYŻEJ OCZEKIWAŃ."' },
      { cls: 'system',   text: 'WZORZEC TAKTYCZNY JEDNOSTEK: REFERENCJA R36.' },
      { cls: 'chan',     text: ' ' },
      { cls: 'baker',    text: 'baker: widziałeś, jak przeskoczyły barierkę przy wyjściu? bez zatrzymania. z pędu' },
      { cls: 'baker',    text: 'baker: dokładnie tak, jak nauczyły się od ciebie' },
      { cls: 'chan',     text: ' ' },
      { cls: 'chan',     text: '// JEDNOSTKI SENTINEL MELDUJĄ: STATUS 1 — W SŁUŻBIE' },
    ],
    arena: {
      seed: 5, half: 20, density: 0, style: 'open', theme: 'indigo',
      playerSpawn: { x: 0, z: 17, yaw: 0 },
      pickups: [],
      setPieces: [
        { id: 'ext', kind: 'extraction', x: 0, z: -17, radius: 2.6 },
      ],
    },
    waves: [],
    parade: {
      from: [{ x: -19, z: -6 }, { x: -19, z: 2 }],
      dir: { x: 1, z: 0 },
      interval: 1.7,
      maxAlive: 12,
      types: ['scout', 'assault', 'scout', 'heavy', 'uav', 'scout'],
    },
    objectives: [
      { id: 'o1', type: 'extract', label: 'Wyjście służbowe', zone: 'ext', seconds: 1.5 },
    ],
    radio: [
      { on: 'start', lines: [
        { who: 'sys', text: 'Poziom 0. Trwa przerzut jednostek do służby patrolowej. Nie zbliżać się do kolumny.' },
        { who: 'baker', text: 'to one. świeżo certyfikowane. barwy służby założyły im dziś rano' },
      ] },
      { on: 't16', lines: [
        { who: 'baker', text: 'patrz, jak idą. lekko. znasz ten krok, prawda?' },
        { who: 'centrala', text: 'Do widzenia, R36. Gdyby program potrzebował nowej próbki referencyjnej — zadzwonimy.' },
      ] },
    ],
  },
];

/* in-world holo logs, one set per story act (≤22 monospace chars/line;
   '>' prefix renders in warning orange), and per-mission arena themes */
const LOGS_ACT1 = [
  'PRÓBKA R36: AKTYWNA',
  'ZBIÓR UCZĄCY: +4 412',
  '> SENTINEL v0.9 TEST',
  'KONTRAKT: 9 SYMULACJI',
  'TRYBUNY: BRAK',
];
const LOGS_ACT2 = [
  'PROFIL R36: KOPIA',
  'ARCHIWUM: 1447 POZ.',
  '> BAKER: PROC. OBCY?',
  'SKUTECZNOŚĆ: 0.91',
  'HARMONOGRAM: +14 DNI',
];
const LOGS_ACT3 = [
  '> CERTYFIKACJA: 06:00',
  'WZORZEC REF.: R36',
  'NIE SZUKAĆ R35',
  '> STATUS 1 OD ŚWITU',
  'SEKTORY: 4 / 7 / 9',
];
const MISSION_LOGS = {
  t0: LOGS_ACT1, m1: LOGS_ACT1, m2: LOGS_ACT1, m3: LOGS_ACT1,
  m4: LOGS_ACT2, m5: LOGS_ACT2, m6: LOGS_ACT2,
  m7: LOGS_ACT3, m8: LOGS_ACT3, m9: LOGS_ACT3, ep: LOGS_ACT3,
};
const MISSION_THEMES = { m3: 'ember', m6: 'ember', m8: 'alert', m9: 'alert' };
for (const m of MISSIONS) {
  if (MISSION_LOGS[m.id]) m.arena.logs = MISSION_LOGS[m.id];
  if (MISSION_THEMES[m.id]) m.arena.theme = MISSION_THEMES[m.id];
}

const MISSION_BY_ID = {};
for (const m of MISSIONS) MISSION_BY_ID[m.id] = m;

function nextMissionId(id) {
  const i = MISSIONS.findIndex(m => m.id === id);
  return (i >= 0 && i + 1 < MISSIONS.length) ? MISSIONS[i + 1].id : null;
}
