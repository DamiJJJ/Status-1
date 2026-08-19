"use strict";

/* Kampania odcięta 2026-08-18 (decyzja użytkownika): campaign.js i missions.js
   leżą w _kosz/kampania/ razem ze swoimi testami. Ten plik trzyma minimalny
   zestaw globali, które reszta gry wola BEZWARUNKOWO - dzięki temu nie trzeba
   było przeorywać 18 plików, a powrót kampanii to podmiana tego pliku z
   powrotem na tamte dwa.

   Gałęzie `if (game.mode === 'campaign')` zostały w kodzie i są martwe:
   `game.mode` jest już zawsze 'arena'. */

/* ---- trudność: arena zawsze chodzi na normalu, żeby rekord znaczył to samo ---- */
const DIFFICULTIES = {
  normal: { id: "normal", name: "Normalny", hpMul: 1, accMul: 1, dmgMul: 1, creditMul: 1, timerMul: 1, pressureMul: 1 },
};
function difficulty() {
  return DIFFICULTIES.normal;
}

/* ---- haki celów misji: puste, ale liczą statystyki służby ---- */

const STATS_KEY = "status1_stats";
let lifeStats = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(STATS_KEY));
    if (d && typeof d.kills === "number") return d;
  } catch (e) {
    /* brak / uszkodzone -> od zera */
  }
  return { kills: 0, shots: 0, hits: 0 };
})();
let statsDirty = false,
  statsSavedAt = 0;

/* zapis jest dławiony: seria z SMG to kilkanaście strzałów na sekundę,
   a każdy setItem to synchroniczny zapis na dysk */
function statsFlush(force = false) {
  if (!statsDirty) return;
  const now = performance.now();
  if (!force && now - statsSavedAt < 5000) return;
  statsSavedAt = now;
  statsDirty = false;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(lifeStats));
  } catch (e) {
    /* ignore */
  }
}

function missionEvent(ev) {
  if (game.dev) return; // the dev range must not inflate the service stats
  if (ev === "kill") {
    lifeStats.kills++;
    statsDirty = true;
    statsFlush();
  }
}
function missionShot(hit) {
  if (game.dev) return;
  lifeStats.shots++;
  if (hit) lifeStats.hits++;
  statsDirty = true;
  statsFlush();
}
function missionHpTrack() {
  /* medal counter lived in the campaign */
}

/* ---- radio: dialogi były częścią kampanii ---- */
let radioHoldT = 0;
function updateRadio() {
  /* no queue without missions */
}

/* ---- nawigacja menu ---- */
function backToMenu() {
  game.state = "menu";
  game.dev = false; // leaving the range always lands in the normal menu flow
  renderMenuMeta();
  showScreen("menu");
}

function renderMenuMeta() {
  // the endless arena is cut (2026-08-18) - the range is the only mode
  el("menu-progress").textContent = "DEV 0.1.0";
}

function openStats() {
  game.state = "stats";
  renderStats();
  showScreen("stats");
}

function renderStats() {
  statsFlush(true);
  const s = lifeStats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const row = (k, v) => `<div class="stats-row"><span>${k}</span><b>${v}</b></div>`;
  el("stats-list").innerHTML =
    '<div class="stats-section">Służba (łącznie)</div>' + row("Zneutralizowane drony", s.kills) + row("Oddane strzały", s.shots) + row("Celność", `${acc}%`);
}
