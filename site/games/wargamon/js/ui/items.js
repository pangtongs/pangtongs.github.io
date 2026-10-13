/* Items: the bag, shops, held gear and medicine. */
const LEAGUE_ITEMS = {
  maxpotion: { name: 'Jamu Pekat', price: 8000, desc: 'HP satu teman sadar penuh; status tetap.' },
  revive: { name: 'Balsem Sadar', price: 6000, desc: 'Bangunkan teman pingsan dengan 50% HP.' },
  ultraballs: {
    name: 'Kapsul Ultra',
    price: 6000,
    desc: 'Peluang tangkap lebih tinggi; tetap perlu melemahkan lawan.',
  },
  scarf: { name: 'Syal Semangat', price: 12000, desc: 'Dipegang satu teman: damage +12%.' },
  vest: { name: 'Rompi Pelindung', price: 12000, desc: 'Dipegang satu teman: damage masuk −12%.' },
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
LEAGUE_ITEMS.turbine = { name: 'Dinamo Industri', price: 0, desc: 'Listrik +20%; hadiah kontrak bengkel.' };
const ITEM_LABELS = {
  balls: ['Kapsul Rantau', 'Tangkap Wargamon liar.'],
  potions: ['Jamu', 'Pulih 40 HP; status tetap.'],
  antidotes: ['Penawar', 'Bersihkan status satu teman.'],
};
// A one-time stipend keeps old and new saves playable under the new economy.
function economyMigration() {
  if (state.economyRevision === 24) return;
  state.economyRevision = 24;
  state.money += 100000;
  for (const m of [...state.team, ...(state.storage || [])])
    if (m.id === 19) {
      const extra = Math.max(0, SPECIES[19].base + m.level * 5 - m.max);
      m.max += extra;
      if (m.hp > 0) m.hp += extra;
    }
}
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
  if (!itemCount(k)) return 'Habis';
  if (k === 'revive') return m.hp > 0 ? 'Masih sadar' : 'Pingsan';
  if (k === 'antidotes') return hasCondition(m) ? '' : 'Tidak ada status';
  return m.hp === 0 ? 'Perlu dibangunkan' : m.hp === m.max ? 'HP penuh' : '';
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
  lunchbox: {
    name: 'Rantang Hangat',
    price: 180000,
    desc: 'Pulih 5% HP setiap giliran; serangan berkurang 10%.',
  },
  sambal: { name: 'Sambal Nekat', price: 170000, desc: 'Kerusakan +25%; kehilangan 4% HP setiap giliran.' },
  coil: { name: 'Obat Nyamuk', price: 190000, desc: 'Kebal Tidur; menerima kerusakan Api 25% lebih besar.' },
  rescue: {
    name: 'Jimat Siaga',
    price: 230000,
    desc: 'Bangkit dengan 25% HP sekali per pertarungan; serangan berkurang 10%.',
  },
  capacitor: {
    name: 'Kapasitor Impor',
    price: 600000,
    desc: 'Mulai dengan 3 Tempo; serangan +15%, kerusakan diterima +15%.',
  },
  medkit: {
    name: 'Medkit Impor',
    price: 650000,
    desc: 'Pulih 8% HP setiap giliran dan cegah satu status; serangan berkurang 10%.',
  },
  umbrella: {
    name: 'Payung Lipat',
    price: 180000,
    desc: 'Kerusakan Air berkurang 30%; kerusakan Listrik bertambah 25%.',
  },
});
LEAGUE_ITEMS.scarf.desc = 'Kerusakan +12%; kerusakan diterima +10%.';
LEAGUE_ITEMS.vest.desc = 'Kerusakan diterima berkurang 12%; serangan berkurang 10%.';
ITEM_LABELS.potions[1] = 'Pulih 30% HP, minimal 40; status tetap.';
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
async function useMedicine(k, i) {
  if (modalKind !== 'medicine' || locked || battle?.busy || !canUseMedicine(k, state.team[i])) return;
  const m = state.team[i],
    b = battle;
  addItem(k, -1);
  if (k === 'antidotes') clearStatus(m);
  else m.hp = Math.min(m.max, m.hp + medicineAmount(k, m));
  update();
  save();
  if (!b) {
    medicineMenu(k);
    return;
  }
  closeModal();
  b.busy = true;
  locked = true;
  passTurn(state.team[0]);
  state.team[0].interrupted = false;
  b.log = medicineInfo(k).name + ' digunakan. ' + tick(state.team[0]);
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
  if (['clinic', 'festivalclinic', 'researchlab'].includes(state.room)) return BAG_MEDICINES;
  const stall = nearest();
  if (stall?.key === 'shop' && STALL_STOCK[stall.sells]) return STALL_STOCK[stall.sells];
  const stock = ['balls', 'potions', 'antidotes'];
  if (state.region >= 4 || state.room === 'shop') stock.push('ultraballs', 'maxpotion', 'revive');
  if (!['mbg', 'warung'].includes(state.room))
    stock.push(
      ...gearKeys.filter(k => k !== 'turbine' && (state.region >= 8 || !['capacitor', 'medkit'].includes(k))),
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
    `<h2>Perlengkapan</h2><p class="equipment-explainer">Barang yang dipakai Wargamon untuk membantu saat bertarung. <b>Satu teman memakai satu barang.</b></p><div class="equipment-owner">${art(m.id)}<h3>${SPECIES[m.id].name}</h3></div><section class="equipped-slot">${it ? itemIcon(m.heldItem) : '<span class="guide-icon">🎒</span>'}<div><b>${it?.name || 'Slot kosong'}</b><p>${it?.desc || 'Pilih barang dari tas untuk dipasang.'}</p></div>${it ? `<button data-league="equip" data-id="${i}" data-key="none">Lepas</button>` : ''}</section><h3>Di dalam tas</h3>${owned.length ? `<div class="equipment-grid">${owned.map(k => `<section class="equipment-card">${itemIcon(k)}<h3>${LEAGUE_ITEMS[k].name}</h3><p>${LEAGUE_ITEMS[k].desc}</p><small>Tersedia: ${itemCount(k)}</small><button data-league="equip" data-id="${i}" data-key="${k}">${it ? 'Ganti perlengkapan' : 'Pasang'}</button></section>`).join('')}</div>` : '<p class="equipment-empty">Belum ada perlengkapan di tas. Cari di kios sepanjang perjalanan.</p>'}`,
    'equipment',
    '<button data-over="backbag">Tim & Tas</button>',
  );
}
function medicineMenu(k) {
  if (locked || !BAG_MEDICINES.includes(k)) return;
  const it = medicineInfo(k);
  modal(
    `<h2>${itemIcon(k)}${it.name} <span class="bag-quantity">×${itemCount(k)}</span></h2><p>${it.desc}${battle ? ' Memakai satu giliran.' : ''}</p><div class="medicine-target-grid">${state.team
      .map((m, i) => {
        const eligible = canUseMedicine(k, m);
        return `<button class="medicine-target" data-over="medicine" data-key="${k}" data-id="${i}" ${eligible ? '' : 'disabled'}>${art(m.id)}<span class="medicine-target-info"><b>${SPECIES[m.id].name}</b><span>Lv.${m.level}, HP ${m.hp}/${m.max}</span>${health(m)}${statusBadge(m)}<span class="medicine-target-result">${eligible ? (k === 'revive' ? `Bangun → ${Math.ceil(m.max * 0.5)} HP` : k === 'antidotes' ? 'Bersihkan status' : `Pulih → ${Math.min(m.max, m.hp + medicineAmount(k, m))} HP`) : medicineUnavailable(k, m)}</span></span></button>`;
      })
      .join('')}</div>`,
    'medicine',
    battle
      ? '<button data-every="bag">← Barang</button><button data-act="close">Kembali bertarung</button>'
      : '<button data-over="backbag">Tim & Tas</button><button data-act="close">Tutup</button>',
  );
}
