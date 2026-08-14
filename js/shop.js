/* NEON ARENA — between-wave shop
   Classic script (NOT an ES module): shares the global scope with the other
   js/ files; load order is defined by index.html. THREE and its addons are
   exposed on window by the bootstrap module in index.html. */
'use strict';

/* ==================== SKLEP (między falami) ==================== */

/* icon: key into UI_ICONS (js/icons.js); cat: tint class of the shop icon */
const SHOP_ITEMS = [
  { id: 'w_shotgun', name: 'Strzelba',    desc: 'Broń [2] — 8 śrucin, zabójcza z bliska',     basePrice: 50,  maxLevel: 1, level: 0, icon: 'shotgun', cat: 'weapon' },
  { id: 'w_smg',     name: 'Karabin SMG', desc: 'Broń [3] — szybki ogień automatyczny',       basePrice: 90,  maxLevel: 1, level: 0, icon: 'smg',     cat: 'weapon' },
  { id: 'w_sniper',  name: 'Snajperka',   desc: 'Broń [4] — ogromne obrażenia, zoom na PPM',  basePrice: 140, maxLevel: 1, level: 0, icon: 'sniper',  cat: 'weapon' },
  { id: 'heal',   name: 'Pełne leczenie',        desc: 'Przywraca zdrowie do maksimum',           basePrice: 30, maxLevel: Infinity, level: 0, icon: 'heal',   cat: 'consumable' },
  { id: 'ammo',   name: 'Pełna amunicja',        desc: 'Uzupełnia zapas wszystkich broni',        basePrice: 40, maxLevel: Infinity, level: 0, icon: 'ammo',   cat: 'consumable' },
  { id: 'nade',   name: 'Granaty ×2',            desc: 'Dwa granaty [G] — obrażenia obszarowe (maks. 4)', basePrice: 35, maxLevel: Infinity, level: 0, icon: 'grenade', cat: 'consumable' },
  { id: 'maxhp',  name: 'Pancerz',               desc: '+25 maksymalnego HP (doliczane od razu)', basePrice: 60, maxLevel: 2, level: 0, icon: 'shield', cat: 'upgrade' },
  { id: 'mag',    name: 'Powiększone magazynki', desc: '+50% pojemności magazynków i zapasu',     basePrice: 80, maxLevel: 2, level: 0, icon: 'mag',    cat: 'upgrade' },
  { id: 'reload', name: 'Szybkie przeładowanie', desc: '−15% czasu przeładowania',                basePrice: 70, maxLevel: 2, level: 0, icon: 'reload', cat: 'upgrade' },
  { id: 'dmg',    name: 'Lepsza amunicja',       desc: '+15% obrażeń wszystkich broni',           basePrice: 90, maxLevel: 3, level: 0, icon: 'dmg',    cat: 'upgrade' },
];

function shopPrice(item) {
  return Math.round(item.basePrice * (1 + 0.6 * item.level));
}

function shopLevel(id) {
  return SHOP_ITEMS.find(i => i.id === id).level;
}

/* Recompute EVERY derived stat from SHOP_ITEMS[].level. Idempotent — safe to
   call on buy, on run reset and on campaign load. (The old per-item apply was
   incremental — player.maxHp += 25 — and could not be replayed from a saved
   level count.) Consumables (heal/ammo) stay one-shot in buyShopItem. */
function applyAllShopEffects() {
  player.maxHp = 100 + 25 * shopLevel('maxhp');
  game.dmgMul = 1 + 0.15 * shopLevel('dmg');
  game.reloadMul = 1 - 0.15 * shopLevel('reload');
  const magL = shopLevel('mag');
  for (const w of WEAPONS) {
    w.magSize = Math.round(w.baseMag * (1 + 0.5 * magL));
    w.maxReserve = Math.round(w.baseMaxReserve * (1 + 0.5 * magL));
  }
  WEAPONS[0].owned = true;
  WEAPONS[1].owned = shopLevel('w_shotgun') > 0;
  WEAPONS[2].owned = shopLevel('w_smg') > 0;
  WEAPONS[3].owned = shopLevel('w_sniper') > 0;
  player.hp = Math.min(player.hp, player.maxHp);
  updateHpHud();
  updateWeaponHud();
}

function buyShopItem(id) {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item || item.level >= item.maxLevel) return;
  if (item.id === 'heal' && player.hp >= player.maxHp) return;
  if (item.id === 'nade' && game.grenades >= GRENADE_MAX) return;
  const price = shopPrice(item);
  if (game.credits < price) return;
  game.credits -= price;
  if (item.maxLevel !== Infinity) {
    item.level++;
    applyAllShopEffects();
    if (item.id === 'maxhp') { // armor also heals by the increment (as before)
      player.hp = Math.min(player.maxHp, player.hp + 25);
      updateHpHud();
    }
  } else if (item.id === 'heal') {
    player.hp = player.maxHp;
    updateHpHud();
  } else if (item.id === 'ammo') {
    for (const w of WEAPONS) w.reserve = w.maxReserve;
    updateWeaponHud();
  } else if (item.id === 'nade') {
    game.grenades = Math.min(GRENADE_MAX, game.grenades + 2);
    updateGrenadeHud();
  }
  AudioSys.buy();
  updateCreditsHud();
  renderShop();
}

function renderShop() {
  document.getElementById('shop-credits').textContent = game.credits;
  const cont = document.getElementById('shop-items');
  // the campaign armory hides consumables: every mission starts with full HP
  // and ammo for free, so every credit goes into permanent power
  const items = game.mode === 'campaign'
    ? SHOP_ITEMS.filter(i => i.cat !== 'consumable') : SHOP_ITEMS;
  cont.innerHTML = items.map(item => {
    const maxed = item.level >= item.maxLevel;
    const price = shopPrice(item);
    const lvl = item.maxLevel !== Infinity
      ? `<span class="si-lvl">${item.level}/${item.maxLevel}</span>` : '';
    const disabled = maxed || game.credits < price ||
      (item.id === 'heal' && player.hp >= player.maxHp) ||
      (item.id === 'nade' && game.grenades >= GRENADE_MAX);
    return `<div class="shop-item">
      <div class="si-icon si-icon--${item.cat}">${UI_ICONS[item.icon]}</div>
      <div class="si-info">
        <div class="si-name">${item.name}${lvl}</div>
        <div class="si-desc">${item.desc}</div>
      </div>
      <button class="btn-buy" data-item="${item.id}"${disabled ? ' disabled' : ''}>${maxed ? (item.id.startsWith('w_') ? 'KUPIONO' : 'MAX') : price + ' kr'}</button>
    </div>`;
  }).join('');
  cont.querySelectorAll('.btn-buy').forEach(b =>
    b.addEventListener('click', () => buyShopItem(b.dataset.item)));
}

function openShop({ armory = false, nextId = null } = {}) {
  game.state = 'shop';
  firing = false;
  setAiming(false);
  if (document.pointerLockElement) document.exitPointerLock();
  // one screen, two skins: between-wave shop (arena) vs armory (campaign)
  const next = nextId && MISSION_BY_ID[nextId];
  document.getElementById('shop-title').textContent = armory ? 'Zbrojownia' : 'Sklep';
  document.getElementById('shop-next').textContent =
    armory && next ? `Następna symulacja: ${next.code} — ${next.name} · ${'★'.repeat(next.threat)}` : '';
  document.getElementById('btn-shop-continue').textContent =
    armory ? 'Dalej — odprawa' : 'Do walki — następna fala';
  renderShop();
  showScreen('shop');
}

function continueFromShop() {
  if (game.state !== 'shop') return;
  if (game.mode === 'campaign') { armoryContinue(); return; }
  waveSystem.intermission = 1.5;
  hideScreens();
  if (TEST) { game.state = 'playing'; return; }
  wantLock = true;
  lockPointer();
}

function startEndless() {
  if (game.state !== 'won') return;
  game.endless = true;
  updateWaveHud();
  openShop();
}
