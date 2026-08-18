/* KOSZ - jednostki wycofane z gry 2026-08-18 (decyzja uzytkownika).

   To NIE jest ladowany plik: index.html go nie zaciaga i nic go nie importuje.
   Lezy tu jako gotowy material do wklejenia z powrotem, gdyby SZTURM, TARAN
   albo WAZKA mialy wrocic. Wszystkie trzy dzielily podwozie SENTINEL z PATROLEM
   (poza WAZKA, ktora ma wlasny model quadkoptera ponizej).

   Co trzeba przywrocic razem z jednostka:
     1) wpis w ENEMY_TYPES (js/enemies.js)
     2) jej galaz modelu w buildEnemyModel (ponizej)
     3) wpis w BESTIARY (js/bestiary.js)
     4) udzial w falach (WAVE_DEFS / getWaveDef w js/waves.js)
   WAZKA dodatkowo wymaga materialow matLivery / matStrobeR / matStrobeB
   i obslugi lotu (pole `fly`, `minTop` w resolveCollisions) - ta ostatnia
   ZOSTALA w silniku, wiec wystarczy oddac model i typ. */
'use strict';

/* ==================== ENEMY_TYPES ==================== */

const REMOVED_ENEMY_TYPES = {
  // SZTURM (assault): burst auto rifle, fastest; drops ammo
  assault: {
    weapon: 'auto', burstCount: 4, burstInterval: 0.13,
    hp: 45, speed: 5.6, damage: 3, fireCooldown: 1.7, range: 26, preferred: 10,
    accuracy: 0.45, points: 150, credits: 15, radius: 0.55, scale: 0.95,
    body: 0x2f55c4, accent: 0xff8906,
  },
  // TARAN (heavy): shotgun - must close in, hits hard; drops medkits
  heavy: {
    weapon: 'shotgun',
    hp: 220, speed: 2.9, damage: 30, fireCooldown: 2.4, range: 15, preferred: 7,
    accuracy: 0.75, points: 300, credits: 30, radius: 0.7, scale: 1.25,
    body: 0x1c2748, accent: 0xff5470,
  },
  // WAZKA (uav): hovering quadcopter - flies OVER low cover
  uav: {
    weapon: 'pistol', fly: 3.0,
    hp: 30, speed: 6.4, damage: 3, fireCooldown: 1.15, range: 24, preferred: 9,
    accuracy: 0.45, points: 120, credits: 10, radius: 0.5, scale: 1,
    body: 0x4f7fe0, accent: 0x9fe8ff,
  },
};

/* ==================== MODELE ==================== */

/* WAZKA: hovering quadcopter, built around y=0 (updateEnemies keeps the group
   at t.fly meters). Eye = head (precision reward). Wracalo to na poczatek
   buildEnemyModel, przed galezia podwozia SENTINEL. */
function buildUavModel(g, t, matBody, matDark, matEye) {
  enemyBox(g, matBody, 0.55, 0.2, 0.55, 0, 0, 0);                       // hull
  enemyBox(g, matLivery, 0.57, 0.05, 0.3, 0, 0.02, 0);                  // white service stripe
  const rotors = [];
  for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    enemyBox(g, matDark, 0.4, 0.05, 0.08, ax * 0.38, 0.05, az * 0.38,
      { ry: Math.atan2(az, ax) });                                      // arm
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 10), matDark);
    rot.position.set(ax * 0.52, 0.12, az * 0.52);
    g.add(rot);
    rotors.push(rot);
  }
  enemyBox(g, matStrobeR, 0.1, 0.06, 0.1, -0.1, 0.16, 0);               // strobe bar
  enemyBox(g, matStrobeB, 0.1, 0.06, 0.1, 0.1, 0.16, 0);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), matEye);
  eye.position.set(0, -0.05, 0.3);
  eye.userData.isHead = true;
  g.add(eye);
  enemyCyl(g, matDark, 0.025, 0.26, 0, -0.16, 0.14);                    // gun under the hull
  const gunTip = new THREE.Object3D();
  gunTip.position.set(0, -0.16, 0.32);
  g.add(gunTip);
  g.scale.setScalar(t.scale);
  return { group: g, gunTip, legL: null, legR: null, rotors };
}

/* jedyny material uzywany wylacznie przez WAZKE */
const matLiveryRemoved = 'new THREE.MeshStandardMaterial({ color: 0xcfd8ee, roughness: 0.7, flatShading: true })';

/* Bronie SZTURMU i TARANU: wisialy w grupie `gun` na prawym ramieniu podwozia
   SENTINEL, w galezi po t.weapon. */
function buildRemovedBotGuns(gun, t, matDark, matBodyDim) {
  let tipZ;
  if (t.weapon === 'shotgun') {
    enemyBox(gun, matDark, 0.1, 0.13, 0.4, 0, 0.02, 0.16);
    enemyCyl(gun, matDark, 0.032, 0.34, 0, 0.05, 0.42);          // barrel
    enemyCyl(gun, matDark, 0.024, 0.34, 0, 0.0, 0.42);           // tube magazine
    enemyBox(gun, matBodyDim, 0.07, 0.06, 0.12, 0, -0.01, 0.36); // pump
    tipZ = 0.6;
  } else if (t.weapon === 'auto') {
    enemyBox(gun, matDark, 0.08, 0.11, 0.44, 0, 0.02, 0.18);
    enemyCyl(gun, matDark, 0.021, 0.3, 0, 0.05, 0.52);           // barrel
    enemyBox(gun, matDark, 0.04, 0.16, 0.08, 0, -0.08, 0.2, { rx: 0.2 }); // magazine
    enemyBox(gun, matDark, 0.035, 0.035, 0.16, 0, 0.09, 0.06);   // top rail
    tipZ = 0.68;
  }
  return tipZ;
}

/* sylwetka per typ (mnoznik skali calej grupy) */
const REMOVED_SILHOUETTE = { assault: 1, heavy: 1.15 };

/* ==================== FALE ARENY (przed cieciem) ==================== */

const REMOVED_WAVE_DEFS = [
  { scout: 3, uav: 2 },
  { scout: 4, assault: 2, uav: 2 },
  { scout: 4, assault: 2, heavy: 2, uav: 2 },
  { scout: 4, assault: 3, heavy: 2, uav: 2 },
  { scout: 5, assault: 4, heavy: 3, uav: 3 },
];

function removedGetWaveDef(wave) {
  if (wave <= REMOVED_WAVE_DEFS.length) return REMOVED_WAVE_DEFS[wave - 1];
  return { scout: 4 + Math.ceil(wave / 2), assault: wave - 2, heavy: wave - 4,
           uav: Math.ceil(wave / 2) };
}

/* ==================== KARTY BESTIARIUSZA ==================== */

const REMOVED_BESTIARY = [
  {
    type: 'assault', name: 'SZTURM', code: 'SENTINEL A-4',
    weapon: 'Karabin automatyczny (serie po 4)',
    role: 'Jednostka szturmowa',
    desc: 'Najszybsza jednostka naziemna. Skraca dystans i tnie seriami, ' +
          'liczac na to, ze nie zdazysz przeladowac. Pojedynczo do opanowania, ' +
          'w trojke wypycha z kazdej oslony.',
    drop: 'Amunicja',
  },
  {
    type: 'heavy', name: 'TARAN', code: 'SENTINEL H-9',
    weapon: 'Strzelba, obrazenia malejace z dystansem',
    role: 'Jednostka wylomowa',
    desc: 'Chodzacy taran: wolny, opancerzony, zabojczy z bliska. Wygrywa sie ' +
          'z nim dystansem i katami - na otwartej przestrzeni jedno wejscie ' +
          'w jego zasieg konczy symulacje.',
    drop: 'Apteczka',
  },
  {
    type: 'uav', name: 'WAZKA', code: 'SENTINEL D-1',
    weapon: 'Lekkie dzialko podwieszane',
    role: 'Dron zwiadowczy',
    desc: 'Najtansza linia programu STATUS 1. Wisi na pulapie i przelatuje ' +
          'NAD niskimi oslonami, wiec kucanie za skrzynia nic nie daje. Malo ' +
          'punktow wytrzymalosci - problemem jest kat, nie pancerz.',
    drop: 'Amunicja',
    cam: { y: 1.32, dist: 3.0, look: 1.16 },
  },
];
