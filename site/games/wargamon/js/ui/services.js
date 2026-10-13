/* Services: food, rest, the clinic, storage and the move tutor. */
function depositMon(i) {
  if (!atDaycare() || battle || locked || state.team.length <= 1 || !state.team[i]) return false;
  if (state.team[i].hp > 0 && !state.team.some((m, n) => n !== i && m.hp > 0)) {
    toast('Sisakan satu teman yang masih sadar.');
    return false;
  }
  state.storage.push(state.team.splice(i, 1)[0]);
  resetScene();
  update();
  return true;
}
function withdrawMon(i) {
  if (!atDaycare() || battle || locked || state.team.length >= 6 || !state.storage[i]) return false;
  const m = state.storage.splice(i, 1)[0];
  state.team.push(m);
  const evolved = checkEvolution(m);
  update();
  if (evolved) toast(evolved);
  return true;
}
// Medical costs are explicit. Rest stops are free; food never cleanses a condition.
const CLINIC_FEE = 5000;
const REST_FEE = 0;
function restAtCamp() {
  const p = nearest();
  if (
    modalKind !== 'rest' ||
    leagueState().active ||
    battle ||
    !p ||
    p.key !== 'camp' ||
    Math.hypot(state.x - p.x, state.y - p.y) > 70
  )
    return;
  if (!state.team.some(m => m.hp < m.max)) {
    toast('HP tim sudah penuh.');
    return;
  }
  if (state.money < REST_FEE) {
    toast('Uang belum cukup.');
    return;
  }
  state.money -= REST_FEE;
  state.team.forEach(m => (m.hp = m.max));
  closeModal();
  update();
  toast('Istirahat selesai. HP penuh; status tetap.');
}
// The workshop's service bay: a mechanic tunes the team up instead of a clinic.
function pitStop(p = nearest()) {
  const needs = state.team.some(m => m.hp < m.max || hasCondition(m));
  modal(
    `<div class="portrait-head">${trainerArt(p.portrait)}<div><span class="eyebrow">${I18N.t('pitstop.role')}</span><h2>${p.name.split(',')[0]}</h2></div></div><p>“${I18N.t(needs ? 'pitstop.offer' : 'pitstop.fine')}”</p><button class="action" data-pitstop="service" ${!needs || state.money < CLINIC_FEE ? 'disabled' : ''}>${I18N.t('pitstop.button', { fee: money(CLINIC_FEE) })}</button>${closeButton()}`,
    'pitstop',
  );
}
onClick(event => {
  const b = event.target.closest('[data-pitstop]');
  if (!b || b.disabled || modalKind !== 'pitstop' || state.money < CLINIC_FEE) return;
  state.money -= CLINIC_FEE;
  for (const m of state.team) {
    clearStatus(m);
    m.hp = m.max;
  }
  closeModal();
  update();
  toast(I18N.t('pitstop.done'));
});
// Storage uses a visible swap picker when the active team is full.
let storageSelection = null;
function daycareMenu(page = 0) {
  if (battle || locked) return;
  state.storage ??= [];
  if (!atDaycare()) {
    modal(
      `<h2>Titipan Wargamon</h2><p>${state.storage.length ? I18N.t('ui.0429', { n: state.storage.length }) : I18N.t('daycare.away.none')}</p>${closeButton()}`,
      'daycare',
    );
    return;
  }
  page = Math.max(0, Math.min(Math.floor(Math.max(0, state.storage.length - 1) / 6), page));
  const card = (m, i, stored) =>
    `<section class="target-card">${monArt(m)}<b>${monName(m)}, Lv.${m.level}</b><small>${typeLabel(m.id)}, HP ${m.hp}/${m.max}</small>${statusBadge(m)}<button data-over="${stored ? 'retrieve' : 'deposit'}" data-id="${i}" ${!stored && state.team.length <= 1 ? 'disabled' : ''}>${stored ? (state.team.length === 6 ? 'Tukar dengan tim' : 'Ambil') : 'Titip'}</button></section>`;
  modal(
    `<h2>Titipan</h2><p>Tim ${state.team.length}/6, Dititipkan ${state.storage.length}. HP dan status tidak berubah.</p><h3>Tim aktif</h3><div class="target-grid">${state.team.map((m, i) => card(m, i, false)).join('')}</div><h3>Titipan</h3><div class="target-grid">${
      state.storage
        .slice(page * 6, page * 6 + 6)
        .map((m, i) => card(m, page * 6 + i, true))
        .join('') || '<p>Belum ada titipan.</p>'
    }</div><div class="actions"><button data-refresh="storagepage" data-id="${page - 1}" ${page === 0 ? 'disabled' : ''}>←</button><span>${page + 1}/${Math.max(1, Math.ceil(state.storage.length / 6))}</span><button data-refresh="storagepage" data-id="${page + 1}" ${page * 6 + 6 >= state.storage.length ? 'disabled' : ''}>→</button></div>${closeButton()}`,
    'daycare',
  );
}
function retrieveStored(i) {
  if (!atDaycare() || battle || locked || !state.storage[i]) return;
  if (state.team.length < 6) {
    withdrawMon(i);
    daycareMenu();
    return;
  }
  storageSelection = i;
  modal(
    `<h2>Tukar ${SPECIES[state.storage[i].id].name}</h2><p>Pilih teman aktif yang akan dititipkan.</p><div class="target-grid">${state.team.map((m, n) => `<button class="target-card" data-over="swap" data-id="${n}">${art(m.id)}<b>${SPECIES[m.id].name}</b><span>Lv.${m.level}, HP ${m.hp}/${m.max}</span>${statusBadge(m)}</button>`).join('')}</div>${closeButton('Batal')}`,
    'swap',
  );
}
function swapStored(i) {
  if (
    modalKind !== 'swap' ||
    !atDaycare() ||
    battle ||
    locked ||
    !state.team[i] ||
    !state.storage[storageSelection]
  )
    return false;
  const incoming = state.storage[storageSelection];
  if (!incoming.hp && !state.team.some((m, n) => n !== i && m.hp > 0)) {
    toast('Sisakan satu teman yang sadar.');
    return false;
  }
  [state.team[i], state.storage[storageSelection]] = [incoming, state.team[i]];
  const evolved = checkEvolution(incoming);
  storageSelection = null;
  resetScene();
  update();
  daycareMenu();
  if (evolved) toast(evolved);
  return true;
}
let tutorSlot = 0;
function teachMove(i, k) {
  if (
    modalKind !== 'tutor' ||
    battle ||
    locked ||
    !atTutor() ||
    !state.team[i] ||
    !(k === 'none' || TUTOR_MOVES[k])
  )
    return false;
  const m = state.team[i];
  if (k === 'none') {
    delete m.learnedMoves;
    delete m.tutorMove;
  } else {
    if (state.money < 25000 || tutorSlot >= kit(m.id, m).length) return false;
    m.learnedMoves ??= m.tutorMove ? { 3: m.tutorMove } : {};
    // A move the creature already knows, in any slot, is not sold a second time.
    if (m.learnedMoves[tutorSlot] === k || kit(m.id, m).some(mv => mv.name === TUTOR_MOVES[k].name)) {
      toast(I18N.t('tutor.alreadyKnown'));
      return false;
    }
    state.money -= 25000;
    m.learnedMoves[tutorSlot] = k;
    delete m.tutorMove;
  }
  m.cooldowns = {};
  update();
  tutorMenu(i);
  return true;
}
function clinicReception() {
  const nurse = spots().find(p => p.key === 'clinic');
  modal(
    `<div class="portrait-head">${trainerArt(nurse.portrait)}<div><h2>Selamat datang di klinik</h2><p>Perawat Sinta</p></div></div><div class="menu-actions"><button data-ui="checkup">✚ Periksa tim<small>Pemeriksaan gratis, tanpa pemulihan</small></button><button data-ui="treatment">♥ Rawat tim<small>HP & status pulih, ${money(CLINIC_FEE)}</small></button></div>${closeButton()}`,
    'reception',
  );
}
/* Food has separate service rules. MBG is always free and safe; paid canteen meals
   can also treat status. The chosen dish is saved for the rotating menu. */
const MBG_DISHES = ['Nasi telur dan sayur', 'Bubur ayam hangat', 'Nasi tempe dan tumis kacang'];
const CANTEEN_DISHES = [
  { name: 'Pisang dan teh hangat', price: 5000, heal: 0.5, cleanse: false },
  { name: 'Nasi lauk lengkap', price: 18000, heal: 1, cleanse: true },
];
function foodT(key, fallback, params = {}) {
  return typeof I18N === 'undefined'
    ? fallback.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
    : I18N.t(key, params);
}
// The basecamp warung sells what its chalkboard lists.
const WARUNG_KALDERA_MENU = [
  { name: 'Kopi', price: 5000, fill: 20 },
  { name: 'Jahe', price: 5000, fill: 20 },
  { name: 'Teh', price: 4000, fill: 15 },
  { name: 'Indomie', price: 6000, fill: 60 },
  { name: 'Semangat', price: 0, fill: 0 },
];
function foodService() {
  return { canteen: 'canteen', leaguearena: 'canteen', calderacamp: 'warung' }[state.room] ?? 'mbg';
}
function mbgDishIndex() {
  return (state.meals || 0) % MBG_DISHES.length;
}
// The tutor is a three-step choice: teammate, slot, then replacement move.
function tutorMenu(i = 0) {
  if (battle || locked || !atTutor() || !state.team[i]) return;
  const m = state.team[i],
    moves = kit(m.id, m);
  tutorSlot = Math.max(0, Math.min(tutorSlot, moves.length - 1));
  modal(
    `<div class="portrait-head tutor-head">${trainerArt(spots().find(p => p.key === 'tutor')?.portrait ?? 3)}<div><h2>${spots().find(p => p.key === 'tutor')?.name || 'Bu Ramu, Tutor Jurus'}</h2><p>Ganti satu jurus, Rp25.000</p></div></div>
 <section class="tutor-step"><h3>1. Pilih teman</h3><div class="tutor-team">${state.team.map((mon, n) => `<button data-league="tutor" data-id="${n}" aria-pressed="${n === i}">${creatureChip(mon.id, `Lv.${mon.level}`)}</button>`).join('')}</div></section>
 <section class="tutor-step"><h3>2. Pilih jurus yang diganti</h3><div class="tutor-slot-grid">${moves.map((mv, s) => `<button data-over="tutorslot" data-id="${i}" data-slot="${s}" aria-pressed="${s === tutorSlot}"><span class="slot-number">${s + 1}</span><span>${mv.name}</span><small>${TYPE_ICONS[mv.type]} ${mv.type}</small></button>`).join('')}</div></section>
 <section class="tutor-step"><h3>3. Pilih jurus baru</h3><div class="tutor-options">${Object.entries(
   TUTOR_MOVES,
 )
   .map(
     ([k, mv]) =>
       `<section class="move-card tutor-move">${moveCard(mv)}<button data-over="teach" data-id="${i}" data-key="${k}" ${state.money < 25000 ? 'disabled' : ''}>Ajarkan ke slot ${tutorSlot + 1}, Rp25.000</button></section>`,
   )
   .join('')}</div></section>
 <button class="tutor-restore secondary" data-over="teach" data-id="${i}" data-key="none">Pulihkan jurus asli, gratis</button>${closeButton('Selesai')}`,
    'tutor',
  );
}
/* Three independent needs: rest restores HP, food restores fullness, care treats conditions. */
const MBG_POISON_CHANCE = 0.05;
function meal() {
  if (foodService() === 'mbg') {
    const dish = foodT(`food.mbg.dish.${mbgDishIndex()}`, MBG_DISHES[mbgDishIndex()]);
    modal(
      `<h2>${foodT('food.mbg.title', 'Dapur MBG')}</h2><p>${foodT('food.mbg.offer', 'Menu hari ini: {dish}. Gratis, Kenyang tim menjadi 100. Ada peluang 20% satu teman keracunan.', { dish })}</p><button class="action" data-new="eat">${foodT('food.mbg.take', 'Ambil porsi')}</button>${closeButton('Nanti')}`,
      'meal',
    );
    return;
  }
  if (foodService() === 'warung') {
    modal(
      `<h2>${foodT('food.warung.title', 'Warung Kopi Kaldera')}</h2><p>${foodT('food.warung.intro', '“Pesan apa, Kak? Harga sesuai papan.”')}</p><div class="meal-grid">${WARUNG_KALDERA_MENU.map((dish, i) => `<button class="action" data-new="eat" data-dish="${i}" ${state.money < dish.price ? 'disabled' : ''}><b>${foodT(`food.warung.dish.${i}`, dish.name)}</b><small>${dish.price ? money(dish.price) : foodT('food.warung.free', 'Gratis')}${dish.fill ? ', ' + foodT('food.warung.fill', 'Kenyang +{fill}', { fill: dish.fill }) : ''}</small></button>`).join('')}</div>${closeButton('Nanti')}`,
      'meal',
    );
    return;
  }
  modal(
    `<h2>${foodT('food.canteen.title', 'Kantin Arena')}</h2><p>${foodT('food.canteen.intro', 'Makanan kantin aman. Pilih porsi sesuai kebutuhan tim.')}</p><div class="actions">${CANTEEN_DISHES.map((dish, i) => `<button class="action" data-new="eat" data-dish="${i}" ${state.money < dish.price ? 'disabled' : ''}><b>${foodT(`food.canteen.dish.${i}`, dish.name)}</b><small>${money(dish.price)}, ${foodT(i ? 'food.canteen.full' : 'food.canteen.half', i ? 'Kenyang 100' : 'Kenyang +40')}</small></button>`).join('')}</div>${closeButton('Nanti')}`,
    'meal',
  );
}
function eatMeal(index = 0) {
  if (battle || locked || modalKind !== 'meal') return;
  if (foodService() === 'mbg') {
    const dish = foodT(`food.mbg.dish.${mbgDishIndex()}`, MBG_DISHES[mbgDishIndex()]);
    state.meals = (state.meals || 0) + 1;
    state.team.forEach(m => (normalise(m).fullness = 100));
    let sick = null;
    if (state.team.length && Math.random() < MBG_POISON_CHANCE) {
      sick = state.team[Math.floor(Math.random() * state.team.length)];
      sick.conditions.poison = 4;
    }
    update();
    modal(
      `<h2>${foodT('food.mbg.doneTitle', 'Sudah makan')}</h2><p>${foodT(sick ? 'food.mbg.sick' : 'food.mbg.done', sick ? '{dish} mengisi Kenyang tim. {mon} keracunan dan perlu Penawar atau puskesmas. Kondisi lain tetap ada.' : '{dish} mengisi Kenyang tim. HP dan kondisi tidak berubah.', { dish, mon: sick ? SPECIES[sick.id].name : '' })}</p>${closeButton('Lanjut')}`,
    );
    return;
  }
  if (foodService() === 'warung') {
    const dish = WARUNG_KALDERA_MENU[Number(index)];
    if (!dish || state.money < dish.price) return;
    state.money -= dish.price;
    state.team.forEach(m => (normalise(m).fullness = Math.min(100, m.fullness + dish.fill)));
    update();
    modal(
      `<h2>${foodT('food.canteen.doneTitle', 'Pesanan siap')}</h2><p>${dish.fill ? foodT('food.warung.result', 'Kenyang tim bertambah {fill}. HP dan kondisi tetap.', { fill: dish.fill }) : foodT('food.warung.spirit', '“Semangat, ya! Puncaknya tinggal sedikit lagi.” Gratis, dan timmu tersenyum.')}</p>${closeButton('Lanjut')}`,
    );
    return;
  }
  const dish = CANTEEN_DISHES[Number(index)];
  if (!dish || state.money < dish.price) return;
  state.money -= dish.price;
  state.team.forEach(m => {
    normalise(m);
    m.fullness = Number(index) === 0 ? Math.min(100, m.fullness + 40) : 100;
  });
  update();
  modal(
    `<h2>${foodT('food.canteen.doneTitle', 'Pesanan siap')}</h2><p>${foodT(`food.canteen.result.${Number(index) ? 'full' : 'half'}`, Number(index) ? 'Kenyang tim menjadi 100. HP dan kondisi tetap.' : 'Kenyang tim bertambah 40. HP dan kondisi tetap.')}</p>${closeButton('Lanjut')}`,
  );
}
function freeTreatment() {
  const needed = state.team.some(m => hasCondition(m));
  modal(
    `<h2>${foodT('health.clinic.title', 'Puskesmas')}</h2><p>${foodT('health.clinic.body', 'Perawatan menghapus semua kondisi tiap anggota tim, termasuk Racun, Terbakar, Tidur, dan Kesetrum. HP dan Kenyang tetap. Biaya {fee} per tim.', { fee: money(CLINIC_FEE) })}</p><p>${foodT('health.clinic.money', 'Uang: {money}', { money: money(state.money) })}</p><button class="action" data-refresh="treat" ${state.money < CLINIC_FEE || !needed ? 'disabled' : ''}>${foodT('health.clinic.treat', 'Rawat tim')}</button>${!needed ? `<p>${foodT('health.clinic.healthy', 'Tim tidak memiliki kondisi yang perlu dirawat.')}</p>` : ''}${closeButton()}`,
    'clinic',
  );
}
function payTreatment() {
  if (
    battle ||
    locked ||
    modalKind !== 'clinic' ||
    state.money < CLINIC_FEE ||
    !state.team.some(m => hasCondition(m))
  )
    return false;
  state.money -= CLINIC_FEE;
  state.team.forEach(clearStatus);
  closeModal();
  update();
  toast(foodT('health.clinic.done', 'Kondisi tim sudah dirawat. HP dan Kenyang tetap.'));
  return true;
}
function checkup() {
  modal(
    `<h2>${foodT('health.checkup.title', 'Pemeriksaan tim, gratis')}</h2><div class="target-grid">${state.team.map(m => `<section class="target-card">${art(m.id)}<b>${SPECIES[m.id].name}</b><span>HP ${m.hp}/${m.max}</span>${statusBadge(m)}${health(m)}<small>${hasCondition(m) ? foodT('health.checkup.condition', 'Ada kondisi: rawat di puskesmas atau pakai Penawar.') : m.hp < m.max ? foodT('health.checkup.hp', 'HP kurang: istirahat atau pakai obat.') : m.fullness < 25 ? foodT('health.checkup.hungry', 'Lapar: makan untuk mengembalikan daya serang.') : foodT('health.checkup.good', 'Kondisi baik.')}</small></section>`).join('')}</div>${closeButton()}`,
    'checkup',
  );
}

// Bu Sari's tea restores every teammate, including fainted ones. It is a chosen
// service: a defeat leaves HP at zero until the player comes here and pays.
onClick(event => {
  const button = event.target.closest('[data-warung]');
  if (!button || button.disabled || modalKind !== 'warung' || state.room !== 'warung' || battle || locked)
    return;
  const sari = ROOMS.warung.points.find(p => p.key === 'quest');
  if (Math.hypot(state.x - sari.x, state.y - sari.y) > reachOf(sari) || !state.team.some(m => m.hp < m.max))
    return;
  const fee = mealFee(1000);
  state.money -= fee;
  state.team.forEach(m => (m.hp = m.max));
  update();
  questDialog({ teaHealed: true });
  toast(I18N.t('tea.full') + (fee ? '' : ' ' + I18N.t('heal.free')));
});
