/* NEON ARENA — inline SVG icons for the UI (HUD, shop, weapon slots)
   All icons are 24×24, drawn with `currentColor`, so they follow the palette
   of the element they sit in (active slot = teal, disabled = dim, etc.).
   Inline SVG needs no files and works from file://.
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. */
'use strict';

/* ==================== IKONY UI (SVG) ==================== */

const UI_ICONS = {
  /* --- weapons (side view, muzzle to the right) --- */
  pistol: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="3" y="7" width="18" height="4.5" rx="1"/>
    <rect x="18.6" y="5" width="2" height="2.2"/>
    <path d="M5 11.5h4.5l-2 7H3z"/>
    <path d="M11 11.5h3.6l-1.3 3.4H11z"/>
  </svg>`,
  shotgun: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2 8.6l4-1.4v5.4l-4-1z"/>
    <rect x="6" y="8" width="16" height="3" rx="0.8"/>
    <rect x="13" y="11.6" width="5" height="2.3" rx="1"/>
    <path d="M8 11h3.4l-1.2 3.2H8.4z"/>
  </svg>`,
  smg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="1.6" y="7.6" width="1.8" height="4"/>
    <rect x="3" y="8.7" width="4" height="1.8"/>
    <rect x="6.4" y="7.2" width="11" height="4.8" rx="1"/>
    <rect x="17.4" y="8.5" width="4.6" height="2.2"/>
    <path d="M10 12h3.6l-1.6 6.8h-3.6z"/>
    <path d="M14.8 12h3l-1.3 4.4h-2.9z"/>
  </svg>`,
  sniper: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2 8.6l3.4-0.8v5l-3.4-1z"/>
    <rect x="5" y="9.4" width="15.6" height="2.4"/>
    <rect x="20.4" y="8.6" width="1.8" height="4"/>
    <rect x="8" y="5.4" width="7.4" height="2.8" rx="1.4"/>
    <rect x="9.6" y="7.8" width="1.5" height="2"/>
    <rect x="13" y="7.8" width="1.5" height="2"/>
    <path d="M15.6 11.8h3.1l-1.4 4.6h-2.9z"/>
    <path d="M10.8 11.8h3.1l-0.9 3.4h-3z"/>
  </svg>`,

  /* --- consumables / upgrades (shop) --- */
  heal: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.8 3.5h4.4v6.3h6.3v4.4h-6.3v6.3H9.8v-6.3H3.5V9.8h6.3z"/>
  </svg>`,
  ammo: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 10.6q0-3.2 2.1-4.4 2.1 1.2 2.1 4.4v8.9H3z"/>
    <path d="M9.9 10.6q0-3.2 2.1-4.4 2.1 1.2 2.1 4.4v8.9H9.9z"/>
    <path d="M16.8 10.6q0-3.2 2.1-4.4 2.1 1.2 2.1 4.4v8.9h-4.2z"/>
  </svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path fill-rule="evenodd" d="M12 2.6l7.6 2.7v6c0 4.9-3.1 8.1-7.6 9.8-4.5-1.7-7.6-4.9-7.6-9.8v-6z
      M10.7 7.8h2.6v2.9H16v2.6h-2.7v2.9h-2.6v-2.9H8v-2.6h2.7z"/>
  </svg>`,
  mag: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.5 3.5h6.5a1 1 0 0 1 1 1.1L12.8 16H5.4z"/>
    <rect x="4.4" y="17.2" width="9.6" height="3.2" rx="1"/>
    <path d="M17.6 4.4h2.2v2.7h2.7v2.2h-2.7V12h-2.2V9.3h-2.7V7.1h2.7z"/>
  </svg>`,
  reload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" aria-hidden="true">
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/>
    <path d="M17.6 2.4v4.5h-4.5" fill="currentColor" stroke="none"/>
  </svg>`,
  dmg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8.5 12.4q0-4 3.5-5.6 3.5 1.6 3.5 5.6v8.1h-7z"/>
    <path d="M12 1l4.6 4.2h-2.9v2.2h-3.4V5.2H7.4z"/>
  </svg>`,

  /* --- HUD stats --- */
  score: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="2.7"/>
    <rect x="11" y="1" width="2" height="4"/>
    <rect x="11" y="19" width="2" height="4"/>
    <rect x="1" y="11" width="4" height="2"/>
    <rect x="19" y="11" width="4" height="2"/>
  </svg>`,
  wave: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" aria-hidden="true">
    <path d="M4 20a6 6 0 0 1 6-6"/>
    <path d="M4 20a11 11 0 0 1 11-11"/>
    <path d="M4 20a16 16 0 0 1 16-16"/>
    <circle cx="4" cy="20" r="1.8" fill="currentColor" stroke="none"/>
  </svg>`,
  enemies: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path fill-rule="evenodd" d="M12 2.8a7.2 7.2 0 0 1 7.2 7.2c0 2.6-1.3 4.5-3 5.6v3.6H7.8v-3.6
      c-1.7-1.1-3-3-3-5.6A7.2 7.2 0 0 1 12 2.8z
      M9.1 8.4m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0z
      M14.9 8.4m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0z
      M11 14.6h2v3h-2z"/>
    <rect x="8.7" y="20.1" width="2" height="2.4"/>
    <rect x="13.3" y="20.1" width="2" height="2.4"/>
  </svg>`,
  credits: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.6l8.2 4.7v9.4L12 21.4l-8.2-4.7V7.3z" fill="none"
      stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,
};

/* Fill every <span data-icon="…"> placeholder in the static markup.
   Runs at load (defer scripts execute after the document is parsed);
   shop items are rendered later by renderShop(), which reads UI_ICONS
   directly. */
for (const node of document.querySelectorAll('[data-icon]')) {
  node.innerHTML = UI_ICONS[node.dataset.icon] || '';
}
