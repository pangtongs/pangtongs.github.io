/* Services: food, rest, the clinic, storage and the move tutor. */
function depositMon(i) {
  if (!atDaycare() || battle || locked || state.team.length <= 1 || !state.team[i]) return false;
  if (state.team[i].hp > 0 && !state.team.some((m, n) => n !== i && m.hp > 0)) {
    toast(I18N.t('daycare.keepOneAwake'));
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
  checkDexMilestones();
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
    toast(I18N.t('rest.fullHp'));
    return;
  }
  if (state.money < REST_FEE) {
    toast(I18N.t('common.notEnoughMoney'));
    return;
  }
  state.money -= REST_FEE;
  state.team.forEach(m => (m.hp = m.max));
  closeModal();
  update();
  toast(I18N.t('rest.done'));
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
      `<h2>${I18N.t('daycare.title')}</h2><p>${state.storage.length ? I18N.t('daycare.away.count', { n: state.storage.length }) : I18N.t('daycare.away.none')}</p>${closeButton()}`,
      'daycare',
    );
    return;
  }
  page = Math.max(0, Math.min(Math.floor(Math.max(0, state.storage.length - 1) / 6), page));
  const card = (m, i, stored) =>
    `<section class="target-card">${monArt(m)}<b>${monName(m)}, Lv.${m.level}</b>${batikTag(m)}<small>${typeLabel(m.id)}, HP ${m.hp}/${m.max}</small>${statusBadge(m)}<button data-over="${stored ? 'retrieve' : 'deposit'}" data-id="${i}" ${!stored && state.team.length <= 1 ? 'disabled' : ''}>${I18N.t(stored ? (state.team.length === 6 ? 'daycare.swapWithTeam' : 'daycare.withdraw') : 'daycare.deposit')}</button></section>`;
  modal(
    `<h2>${I18N.t('daycare.shortTitle')}</h2><p>${I18N.t('daycare.summary', { n: state.team.length, stored: state.storage.length })}</p><h3>${I18N.t('daycare.activeTeam')}</h3><div class="target-grid">${state.team.map((m, i) => card(m, i, false)).join('')}</div><h3>${I18N.t('daycare.shortTitle')}</h3><div class="target-grid">${
      state.storage
        .slice(page * 6, page * 6 + 6)
        .map((m, i) => card(m, page * 6 + i, true))
        .join('') || `<p>${I18N.t('daycare.empty')}</p>`
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
    `<h2>${I18N.t('daycare.swap.title', { name: tr(SPECIES[state.storage[i].id].name) })}</h2><p>${I18N.t('daycare.swap.pick')}</p><div class="target-grid">${state.team.map((m, n) => `<button class="target-card" data-over="swap" data-id="${n}">${art(m.id)}<b>${SPECIES[m.id].name}</b><span>Lv.${m.level}, HP ${m.hp}/${m.max}</span>${statusBadge(m)}</button>`).join('')}</div>${closeButton(I18N.t('common.cancel'))}`,
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
    toast(I18N.t('daycare.keepOneConscious'));
    return false;
  }
  [state.team[i], state.storage[storageSelection]] = [incoming, state.team[i]];
  const evolved = checkEvolution(incoming);
  storageSelection = null;
  resetScene();
  checkDexMilestones();
  update();
  daycareMenu();
  if (evolved) toast(evolved);
  return true;
}
// The slot the tutor replaces. It starts on the last slot for each teammate: slot 1 is
// usually the only free (0-Tempo) move, and losing it leaves nothing to use every turn.
let tutorSlot = null,
  tutorFor = null;
// Whether replacing the slot's move with `k` would leave the creature no 0-Tempo move.
function tutorTakesFreeMove(m, slot, k) {
  const moves = kit(m.id, m);
  return (
    tempoCost(TUTOR_MOVES[k]) > 0 &&
    tempoCost(moves[slot]) === 0 &&
    !moves.some((mv, s) => s !== slot && tempoCost(mv) === 0)
  );
}
function teachMove(i, k, confirmed = false) {
  if (
    modalKind !== 'tutor' ||
    battle ||
    locked ||
    !atTutor() ||
    !state.team[i] ||
    !(k === 'none' || tutorOffers().includes(k))
  )
    return false;
  const m = state.team[i];
  if (k === 'none') {
    delete m.learnedMoves;
  } else {
    if (state.money < 25000 || tutorSlot >= kit(m.id, m).length) return false;
    m.learnedMoves ??= {};
    // A move the creature already knows, in any slot, is not sold a second time.
    if (m.learnedMoves[tutorSlot] === k || kit(m.id, m).some(mv => mv.name === TUTOR_MOVES[k].name)) {
      toast(I18N.t('tutor.alreadyKnown'));
      return false;
    }
    if (!confirmed && tutorTakesFreeMove(m, tutorSlot, k)) {
      const old = kit(m.id, m)[tutorSlot];
      modal(
        `<h2>${I18N.t('tutor.freeWarn.title')}</h2><p>${I18N.t('tutor.freeWarn.body', { old: old.name, name: monName(m), move: TUTOR_MOVES[k].name })}</p><div class="actions"><button class="action" data-over="teach" data-id="${i}" data-key="${k}" data-confirm="1">${I18N.t('tutor.freeWarn.confirm')}</button></div>`,
        'tutor',
        `<button class="secondary" data-league="tutor" data-id="${i}">${I18N.t('tutor.freeWarn.back')}</button>`,
      );
      return false;
    }
    state.money -= 25000;
    m.learnedMoves[tutorSlot] = k;
  }
  m.cooldowns = {};
  update();
  tutorMenu(i);
  return true;
}
function clinicReception() {
  const nurse = spots().find(p => p.key === 'clinic');
  modal(
    `<div class="portrait-head">${trainerArt(nurse.portrait)}<div><h2>${I18N.t('clinic.welcome')}</h2><p>${I18N.t('clinic.nurse')}</p></div></div><div class="menu-actions"><button data-ui="checkup">✚ ${I18N.t('clinic.checkup')}<small>${I18N.t('clinic.checkup.hint')}</small></button><button data-ui="treatment">♥ ${I18N.t('clinic.treat')}<small>${I18N.t('clinic.treat.hint', { fee: money(CLINIC_FEE) })}</small></button></div>${closeButton()}`,
    'reception',
  );
}
/* Food has separate service rules. MBG is always free and safe; paid canteen meals
   can also treat status. The chosen dish is saved for the rotating menu. */
// Dish names are catalog entries: food.mbg.dish.<n>, food.canteen.dish.<n>, food.warung.dish.<n>.
const MBG_DISH_COUNT = 3;
const CANTEEN_DISHES = [
  { price: 5000, heal: 0.5, cleanse: false },
  { price: 18000, heal: 1, cleanse: true },
];
// The basecamp warung sells what its chalkboard lists: coffee, ginger, tea, noodles, and spirit.
const WARUNG_KALDERA_MENU = [
  { price: 5000, fill: 20 },
  { price: 5000, fill: 20 },
  { price: 4000, fill: 15 },
  { price: 6000, fill: 60 },
  { price: 0, fill: 0 },
];
function foodService() {
  return { leaguearena: 'canteen', calderacamp: 'warung' }[state.room] ?? 'mbg';
}
function mbgDishIndex() {
  return (state.meals || 0) % MBG_DISH_COUNT;
}
// The tutor is a three-step choice: teammate, slot, then replacement move.
function tutorMenu(i = 0) {
  if (battle || locked || !atTutor() || !state.team[i]) return;
  const m = state.team[i],
    moves = kit(m.id, m);
  if (tutorFor !== i || tutorSlot === null) tutorSlot = moves.length - 1;
  tutorSlot = Math.max(0, Math.min(tutorSlot, moves.length - 1));
  tutorFor = i;
  modal(
    `<div class="portrait-head tutor-head">${trainerArt(spots().find(p => p.key === 'tutor')?.portrait ?? 3)}<div><h2>${spots().find(p => p.key === 'tutor')?.name || I18N.t('tutor.defaultName')}</h2><p>${I18N.t('tutor.price')}</p></div></div>
 <section class="tutor-step"><h3>${I18N.t('tutor.step.mon')}</h3><div class="tutor-team">${state.team.map((mon, n) => `<button data-league="tutor" data-id="${n}" aria-pressed="${n === i}">${creatureChip(mon.id, `Lv.${mon.level}`)}</button>`).join('')}</div></section>
 <section class="tutor-step"><h3>${I18N.t('tutor.step.slot')}</h3><div class="tutor-slot-grid">${moves.map((mv, s) => `<button data-over="tutorslot" data-id="${i}" data-slot="${s}" aria-pressed="${s === tutorSlot}"><span class="slot-number">${s + 1}</span><span>${mv.name}</span><small>${TYPE_ICONS[mv.type]} ${mv.type}</small></button>`).join('')}</div></section>
 <section class="tutor-step"><h3>${I18N.t('tutor.step.move')}</h3><div class="tutor-options">${tutorOffers()
   .map(k => [k, TUTOR_MOVES[k]])
   .map(
     ([k, mv]) =>
       `<section class="move-card tutor-move">${moveCard(mv)}<button data-over="teach" data-id="${i}" data-key="${k}" ${state.money < 25000 ? 'disabled' : ''}>${I18N.t('tutor.teach', { n: tutorSlot + 1 })}</button></section>`,
   )
   .join('')}</div></section>
 <button class="tutor-restore secondary" data-over="teach" data-id="${i}" data-key="none">${I18N.t('tutor.restore')}</button>${closeButton(I18N.t('common.done'))}`,
    'tutor',
  );
}
/* Three independent needs: rest restores HP, food restores fullness, care treats conditions. */
const MBG_POISON_CHANCE = 0.05;
function meal() {
  if (nyepiClosed()) return;
  if (foodService() === 'mbg') {
    const dish = I18N.t(`food.mbg.dish.${mbgDishIndex()}`);
    modal(
      `<h2>${I18N.t('food.mbg.title')}</h2><p>${I18N.t('food.mbg.offer', { dish })}</p><button class="action" data-new="eat">${I18N.t('food.mbg.take')}</button>${closeButton(I18N.t('common.later'))}`,
      'meal',
    );
    return;
  }
  if (foodService() === 'warung') {
    modal(
      `<h2>${I18N.t('food.warung.title')}</h2><p>${I18N.t('food.warung.intro')}</p><div class="meal-grid">${WARUNG_KALDERA_MENU.map((dish, i) => `<button class="action" data-new="eat" data-dish="${i}" ${state.money < dish.price ? 'disabled' : ''}><b>${I18N.t(`food.warung.dish.${i}`)}</b><small>${dish.price ? money(dish.price) : I18N.t('food.warung.free')}${dish.fill ? ', ' + I18N.t('food.warung.fill', { fill: dish.fill }) : ''}</small></button>`).join('')}</div>${closeButton(I18N.t('common.later'))}`,
      'meal',
    );
    return;
  }
  modal(
    `<h2>${I18N.t('food.canteen.title')}</h2><p>${I18N.t('food.canteen.intro')}</p><div class="actions">${CANTEEN_DISHES.map((dish, i) => `<button class="action" data-new="eat" data-dish="${i}" ${state.money < dish.price ? 'disabled' : ''}><b>${I18N.t(`food.canteen.dish.${i}`)}</b><small>${money(dish.price)}, ${I18N.t(i ? 'food.canteen.full' : 'food.canteen.half')}</small></button>`).join('')}</div>${closeButton(I18N.t('common.later'))}`,
    'meal',
  );
}
function eatMeal(index = 0) {
  if (battle || locked || modalKind !== 'meal') return;
  if (foodService() === 'mbg') {
    const dish = I18N.t(`food.mbg.dish.${mbgDishIndex()}`);
    state.meals = (state.meals || 0) + 1;
    state.team.forEach(m => (normalise(m).fullness = 100));
    let sick = null;
    if (state.team.length && Math.random() < MBG_POISON_CHANCE) {
      sick = state.team[Math.floor(Math.random() * state.team.length)];
      sick.conditions.poison = 4;
    }
    update();
    modal(
      `<h2>${I18N.t('food.mbg.doneTitle')}</h2><p>${I18N.t(sick ? 'food.mbg.sick' : 'food.mbg.done', { dish, mon: sick ? tr(SPECIES[sick.id].name) : '' })}</p>${closeButton()}`,
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
      `<h2>${I18N.t('food.canteen.doneTitle')}</h2><p>${dish.fill ? I18N.t('food.warung.result', { fill: dish.fill }) : I18N.t('food.warung.spirit')}</p>${closeButton()}`,
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
    `<h2>${I18N.t('food.canteen.doneTitle')}</h2><p>${I18N.t(`food.canteen.result.${Number(index) ? 'full' : 'half'}`)}</p>${closeButton()}`,
  );
}
function freeTreatment() {
  const needed = state.team.some(m => hasCondition(m));
  modal(
    `<h2>${I18N.t('health.clinic.title')}</h2><p>${I18N.t('health.clinic.body', { fee: money(CLINIC_FEE) })}</p><p>${I18N.t('health.clinic.money', { money: money(state.money) })}</p><button class="action" data-refresh="treat" ${state.money < CLINIC_FEE || !needed ? 'disabled' : ''}>${I18N.t('health.clinic.treat')}</button>${!needed ? `<p>${I18N.t('health.clinic.healthy')}</p>` : ''}${closeButton()}`,
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
  toast(I18N.t('health.clinic.done'));
  return true;
}
function checkup() {
  modal(
    `<h2>${I18N.t('health.checkup.title')}</h2><div class="target-grid">${state.team.map(m => `<section class="target-card">${art(m.id)}<b>${SPECIES[m.id].name}</b><span>HP ${m.hp}/${m.max}</span>${statusBadge(m)}${health(m)}<small>${hasCondition(m) ? I18N.t('health.checkup.condition') : m.hp < m.max ? I18N.t('health.checkup.hp') : m.fullness < 25 ? I18N.t('health.checkup.hungry') : I18N.t('health.checkup.good')}</small></section>`).join('')}</div>${closeButton()}`,
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
