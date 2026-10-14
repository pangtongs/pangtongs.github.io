/* Items: the bag, shops, held gear and medicine. */
// Name and description come from the catalog: item.<key>.name and item.<key>.desc.
const itemText = (key, price) => ({
  name: I18N.t(`item.${key}.name`),
  price,
  desc: I18N.t(`item.${key}.desc`),
});
const LEAGUE_ITEMS = {
  maxpotion: itemText('maxpotion', 8000),
  revive: itemText('revive', 6000),
  ultraballs: itemText('ultraballs', 6000),
  scarf: itemText('scarf', 12000),
  vest: itemText('vest', 12000),
};
// Medicine is cheap enough to carry; capsules stay the main expense.
const PRICES = {
  balls: 12000,
  potions: 4000,
  antidotes: 3000,
  maxpotion: 15000,
  revive: 12000,
  ultraballs: 35000,
  scarf: 150000,
  vest: 150000,
};
for (const [k, v] of Object.entries(LEAGUE_ITEMS)) v.price = PRICES[k] || v.price;
LEAGUE_ITEMS.turbine = itemText('turbine', 0);
const ITEM_LABELS = Object.fromEntries(
  ['balls', 'potions', 'antidotes'].map(k => [k, [I18N.t(`item.${k}.name`), I18N.t(`item.${k}.desc`)]]),
);
function canUseMedicine(k, m) {
  return (
    !!m &&
    itemCount(k) > 0 &&
    (k === 'revive'
      ? m.hp === 0
      : k === 'antidotes'
        ? hasCondition(m)
        : ['potions', 'maxpotion'].includes(k) && m.hp > 0 && m.hp < m.max)
  );
}
const BAG_MEDICINES = ['potions', 'antidotes', 'maxpotion', 'revive'];
function medicineInfo(k) {
  return LEAGUE_ITEMS[k] || { name: ITEM_LABELS[k][0], desc: ITEM_LABELS[k][1] };
}
function medicineUnavailable(k, m) {
  if (!itemCount(k)) return I18N.t('medicine.unavailable.empty');
  if (k === 'revive')
    return I18N.t(m.hp > 0 ? 'medicine.unavailable.conscious' : 'medicine.unavailable.fainted');
  if (k === 'antidotes') return hasCondition(m) ? '' : I18N.t('medicine.unavailable.noStatus');
  return m.hp === 0
    ? I18N.t('medicine.unavailable.needsRevive')
    : m.hp === m.max
      ? I18N.t('medicine.unavailable.fullHp')
      : '';
}
const ITEM_ART = Object.freeze({
  balls: 'img/items/item-balls.webp',
  ultraballs: 'img/items/item-ultraballs.webp',
  potions: 'img/items/item-potions.webp',
  antidotes: 'img/items/item-antidotes.webp',
  maxpotion: 'img/items/item-maxpotion.webp',
  revive: 'img/items/item-revive.webp',
  scarf: 'img/items/item-scarf.webp',
  vest: 'img/items/item-vest.webp',
  turbine: 'img/items/item-turbine.webp',
  lunchbox: 'img/items/item-lunchbox.webp',
  sambal: 'img/items/item-sambal.webp',
  coil: 'img/items/item-coil.webp',
  rescue: 'img/items/item-rescue.webp',
  capacitor: 'img/items/item-capacitor.webp',
  medkit: 'img/items/item-medkit.webp',
  umbrella: 'img/items/item-umbrella.webp',
});
function itemIcon(key) {
  const file = ITEM_ART[key];
  return file ? `<img class="item-icon pixel-item" src="${file}" alt="" width="40" height="40">` : '';
}
const gearKeys = [
  'scarf',
  'vest',
  'turbine',
  'lunchbox',
  'sambal',
  'coil',
  'rescue',
  'capacitor',
  'medkit',
  'umbrella',
];
Object.assign(LEAGUE_ITEMS, {
  lunchbox: itemText('lunchbox', 180000),
  sambal: itemText('sambal', 170000),
  coil: itemText('coil', 190000),
  rescue: itemText('rescue', 230000),
  capacitor: itemText('capacitor', 600000),
  medkit: itemText('medkit', 650000),
  umbrella: itemText('umbrella', 180000),
});
for (const k of gearKeys) PRICES[k] = LEAGUE_ITEMS[k].price;
function itemCount(k) {
  return gearKeys.includes(k) ? state.gear?.[k] || 0 : state[k] || 0;
}
function addItem(k, n) {
  if (gearKeys.includes(k)) {
    state.gear ??= {};
    state.gear[k] = Math.max(0, (state.gear[k] || 0) + n);
  } else state[k] = Math.max(0, (state[k] || 0) + n);
}
function medicineAmount(k, m) {
  return k === 'revive'
    ? Math.ceil(m.max * 0.5)
    : k === 'maxpotion'
      ? m.max
      : Math.max(40, Math.ceil(m.max * 0.3));
}
// `direct`: chosen from the bag with only one teammate, so no target dialog was shown.
async function useMedicine(k, i, direct = false) {
  if (
    (modalKind !== 'medicine' && !direct) ||
    locked ||
    battle?.busy ||
    battle?.guest?.noItems ||
    !canUseMedicine(k, state.team[i])
  )
    return;
  const m = state.team[i],
    b = battle;
  addItem(k, -1);
  if (k === 'antidotes') clearStatus(m);
  else m.hp = Math.min(m.max, m.hp + medicineAmount(k, m));
  update();
  save();
  if (!b) {
    if (!direct) {
      medicineMenu(k);
      return;
    }
    teamMenu();
    toast(I18N.t('medicine.usedOn', { item: medicineInfo(k).name, name: tr(SPECIES[m.id].name) }));
    return;
  }
  closeModal();
  b.busy = true;
  locked = true;
  passTurn(state.team[0]);
  state.team[0].interrupted = false;
  b.log = I18N.t('medicine.used', { item: medicineInfo(k).name }) + ' ' + tick(state.team[0]);
  renderBattle();
  if (await partyFaint()) return;
  await enemyTurn();
}
let shopQuantity = 1;
// What a stall sells when it is not a general store.
const STALL_STOCK = {
  medicine: ['potions', 'antidotes', 'maxpotion'],
  parts: ['balls', 'ultraballs', 'vest', 'capacitor'],
  food: ['potions', 'maxpotion', 'lunchbox', 'sambal'],
};
function shopStock() {
  if (['clinic', 'researchlab'].includes(state.room)) return BAG_MEDICINES;
  const stall = nearest(),
    // The costly gear arrives with chapter three's Stasiun Sela, not at Wargamall.
    lateGear = storyReached(REGION.STASIUN);
  if (stall?.key === 'shop' && STALL_STOCK[stall.sells])
    return STALL_STOCK[stall.sells].filter(k => lateGear || !['capacitor', 'medkit'].includes(k));
  const stock = ['balls', 'potions', 'antidotes'];
  if (storyReached(REGION.BALAI_BETON) || state.room === 'shop')
    stock.push('ultraballs', 'maxpotion', 'revive');
  if (!['mbg', 'warung'].includes(state.room))
    stock.push(
      ...gearKeys.filter(k => k !== 'turbine' && (lateGear || !['capacitor', 'medkit'].includes(k))),
    );
  return stock;
}
function purchase(k, n = shopQuantity) {
  if (
    modalKind !== 'shop' ||
    battle ||
    locked ||
    leagueState().active ||
    !shopStock().includes(k) ||
    ![1, 5, 10].includes(n) ||
    !PRICES[k] ||
    state.money < PRICES[k] * n
  )
    return false;
  state.money -= PRICES[k] * n;
  addItem(k, n);
  update();
  save();
  shop();
  return true;
}
function equipItem(i, k) {
  if (
    modalKind !== 'equipment' ||
    battle ||
    locked ||
    !state.team[i] ||
    !(k === 'none' || gearKeys.includes(k)) ||
    (k !== 'none' && itemCount(k) < 1)
  )
    return;
  const m = state.team[i];
  if (m.heldItem) addItem(m.heldItem, 1);
  m.heldItem = k === 'none' ? null : k;
  if (m.heldItem) addItem(k, -1);
  update();
  save();
  equipmentMenu(i);
}
function equipmentMenu(i = 0) {
  if (battle || locked || !state.team[i]) return;
  const m = state.team[i],
    it = LEAGUE_ITEMS[m.heldItem],
    owned = gearKeys.filter(k => itemCount(k) > 0);
  modal(
    `<h2>${I18N.t('equipment.title')}</h2><p class="equipment-explainer">${I18N.t('equipment.explainer')} <b>${I18N.t('equipment.oneEach')}</b></p><div class="equipment-owner">${art(m.id)}<h3>${SPECIES[m.id].name}</h3></div><section class="equipped-slot">${it ? itemIcon(m.heldItem) : '<span class="guide-icon">🎒</span>'}<div><b>${it?.name || I18N.t('equipment.emptySlot')}</b><p>${it?.desc || I18N.t('equipment.emptyHint')}</p></div>${it ? `<button data-league="equip" data-id="${i}" data-key="none">${I18N.t('equipment.unequip')}</button>` : ''}</section><h3>${I18N.t('equipment.inBag')}</h3>${owned.length ? `<div class="equipment-grid">${owned.map(k => `<section class="equipment-card">${itemIcon(k)}<h3>${LEAGUE_ITEMS[k].name}</h3><p>${LEAGUE_ITEMS[k].desc}</p><small>${I18N.t('equipment.available', { n: itemCount(k) })}</small><button data-league="equip" data-id="${i}" data-key="${k}">${I18N.t(it ? 'equipment.change' : 'equipment.equip')}</button></section>`).join('')}</div>` : `<p class="equipment-empty">${I18N.t('equipment.none')}</p>`}`,
    'equipment',
    `<button data-over="backbag">${I18N.t('bag.teamAndBag')}</button>`,
  );
}
function medicineMenu(k) {
  if (locked || !BAG_MEDICINES.includes(k)) return;
  const it = medicineInfo(k);
  modal(
    `<h2>${itemIcon(k)}${it.name} <span class="bag-quantity">×${itemCount(k)}</span></h2><p>${it.desc}${battle ? ' ' + I18N.t('medicine.usesTurn') : ''}</p><div class="medicine-target-grid">${state.team
      .map((m, i) => {
        const eligible = canUseMedicine(k, m);
        return `<button class="medicine-target" data-over="medicine" data-pick data-key="${k}" data-id="${i}" ${eligible ? '' : 'disabled'}>${pickKey(i)}${art(m.id)}<span class="medicine-target-info"><b>${SPECIES[m.id].name}</b><span>Lv.${m.level}, HP ${m.hp}/${m.max}</span>${health(m)}${statusBadge(m)}<span class="medicine-target-result">${eligible ? (k === 'revive' ? I18N.t('medicine.result.revive', { n: Math.ceil(m.max * 0.5) }) : k === 'antidotes' ? I18N.t('medicine.result.cleanse') : I18N.t('medicine.result.heal', { n: Math.min(m.max, m.hp + medicineAmount(k, m)) })) : medicineUnavailable(k, m)}</span></span></button>`;
      })
      .join('')}</div>`,
    'medicine',
    battle
      ? `<button data-every="bag">${I18N.t('battle.item.back')}</button><button data-act="close">${I18N.t('battle.backToFight')}</button>`
      : `<button data-over="backbag">${I18N.t('bag.teamAndBag')}</button><button data-act="close">${I18N.t('common.close')}</button>`,
  );
}
