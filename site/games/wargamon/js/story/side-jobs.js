/* Side jobs that keep paying after the story: Bu Nira's dawn-market goods, delivery
   runs from the Wargamall kitchen, and the night watch with Pak Hansip. */

// --- Pasar Subuh: Bu Nira's rare goods. Two of three are on sale each day.
const BAZAAR_GOODS = {
  lantern: { price: 40000, icon: 'img/items/item-lantern-charm.webp' },
  basket: { price: 25000, icon: 'img/items/item-pandan-basket.webp' },
  honey: { price: 15000, icon: 'img/items/item-batik-honey.webp' },
};
const BAZAAR_ORDER = ['lantern', 'basket', 'honey'];
const dayNumber = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
// At dawn (04:00 to 07:00 on the player's clock) Bu Nira lays out all three goods.
function pasarDawn(hour = new Date().getHours()) {
  return hour >= 4 && hour < 7;
}
function bazaarStock() {
  const d = dayNumber();
  return (pasarDawn() ? [0, 1, 2] : [0, 1]).map(i => BAZAAR_ORDER[(d + i) % 3]);
}
const goodsCount = k => state.goods?.[k] || 0;
const goodsIcon = k => `<img class="goods-icon" src="${BAZAAR_GOODS[k].icon}" alt="" width="48" height="48">`;
function bazaarMenu() {
  if (battle || locked || state.room !== 'pasarsubuh' || nyepiClosed()) return;
  const stock = bazaarStock();
  modal(
    `<div class="portrait-head">${trainerArt(68)}<div><span class="eyebrow">${I18N.t('bazaar.eyebrow')}</span><h2>${I18N.t('bazaar.title')}</h2></div></div><p>${I18N.t('bazaar.intro')}</p><div class="bazaar-goods">${stock
      .map(
        k =>
          `<section class="bazaar-item">${goodsIcon(k)}<div><b>${I18N.t(`bazaar.${k}.name`)}</b><p>${I18N.t(`bazaar.${k}.desc`)}</p><small>${I18N.t('bazaar.owned', { n: goodsCount(k) })}</small></div><button class="action" data-bazaar="buy" data-key="${k}" ${state.money < BAZAAR_GOODS[k].price ? 'disabled' : ''}>${money(BAZAAR_GOODS[k].price)}</button></section>`,
      )
      .join(
        '',
      )}</div><p class="story-hint">${pasarDawn() ? I18N.t('bazaar.dawn') : I18N.t('bazaar.tomorrow', { name: I18N.t(`bazaar.${BAZAAR_ORDER[(dayNumber() + 2) % 3]}.name`) }) + ' ' + I18N.t('bazaar.dawnLater')}</p>${guestStall()}${closeButton()}`,
    'bazaar',
  );
}
// --- Visiting traders: one guest from another island sets up beside Bu Nira each day,
// with a greeting from home and one regional good. Food is eaten on the spot.
const PASAR_GUESTS = [
  { key: 'uda', icon: '🍛', meal: 'power' },
  { key: 'daeng', icon: '🍲', meal: 'guard' },
  { key: 'mace', icon: '🥣', meal: 'focus' },
  { key: 'bli', icon: '🌺', meal: null },
];
const GUEST_PRICE = 9000,
  GUEST_FIGHTS = 5;
const pasarGuest = (d = dayNumber()) => PASAR_GUESTS[d % PASAR_GUESTS.length];
const guestText = (g, part) => I18N.t(`bazaar.guest.${g.key}.${part}`);
function guestEffect(g) {
  return g.meal
    ? I18N.t('bazaar.guest.meal', { effect: I18N.t(MEAL_BUFFS[g.meal].effect), n: GUEST_FIGHTS })
    : I18N.t('bazaar.guest.canang');
}
function guestStall() {
  const g = pasarGuest(),
    bought = state.pasarGuest === dayNumber();
  return `<h3>${I18N.t('bazaar.guest.title')}</h3><section class="bazaar-item"><span class="guest-icon" aria-hidden="true">${g.icon}</span><div><b>${guestText(g, 'name')}</b><p>${guestText(g, 'greet')}</p><small>${guestText(g, 'good')}: ${guestEffect(g)}</small></div><button class="action" data-bazaar="guest" ${bought || state.money < GUEST_PRICE ? 'disabled' : ''}>${bought ? I18N.t('bazaar.guest.sold') : money(GUEST_PRICE)}</button></section><p class="story-hint">${I18N.t('bazaar.guest.next', { name: guestText(pasarGuest(dayNumber() + 1), 'name') })}</p>`;
}
// One guest good a day: a regional dish (HP, Kenyang and a five-fight effect) or Bli's canang.
function buyGuestGood() {
  const g = pasarGuest();
  if (modalKind !== 'bazaar' || state.pasarGuest === dayNumber() || state.money < GUEST_PRICE) return;
  state.money -= GUEST_PRICE;
  state.pasarGuest = dayNumber();
  if (g.meal) {
    state.team.forEach(m => {
      m.hp = m.max;
      m.fullness = 100;
    });
    state.mealBuff = { kind: g.meal, left: GUEST_FIGHTS };
  } else state.basketLeft = Math.max(state.basketLeft || 0, 5);
  update();
  bazaarMenu();
  toast(guestText(g, 'thanks'));
}
function buyGoods(k) {
  if (modalKind !== 'bazaar' || !bazaarStock().includes(k) || state.money < BAZAAR_GOODS[k].price) return;
  state.money -= BAZAAR_GOODS[k].price;
  state.goods ??= {};
  state.goods[k] = goodsCount(k) + 1;
  update();
  bazaarMenu();
  toast(I18N.t('bazaar.bought', { name: I18N.t(`bazaar.${k}.name`) }));
}
// Goods are carried in the bag and used from Tim & Tas.
function goodsPanel() {
  const owned = BAZAAR_ORDER.filter(k => goodsCount(k) > 0);
  const active = [
    state.lanternLeft > 0 ? I18N.t('bazaar.lantern.active', { n: state.lanternLeft }) : '',
    state.basketLeft > 0 ? I18N.t('bazaar.basket.active', { n: state.basketLeft }) : '',
  ].filter(Boolean);
  if (!owned.length && !active.length) return '';
  return `<section class="bag-panel" aria-label="${I18N.t('bazaar.bag')}"><h3>${I18N.t('bazaar.bag')}</h3>${active.length ? `<p class="story-hint">${active.join(' · ')}</p>` : ''}<div class="bag-medicine-grid">${owned
    .map(
      k =>
        `<button class="bag-medicine" data-goods="${k}" ${battle || !canUseGoods(k) ? 'disabled' : ''}>${goodsIcon(k)}<span class="bag-item-heading"><b>${I18N.t(`bazaar.${k}.name`)}</b><span class="bag-quantity">×${goodsCount(k)}</span></span><span class="bag-item-effect">${I18N.t(`bazaar.${k}.desc`)}</span><small>${I18N.t(canUseGoods(k) ? 'bazaar.use' : 'bazaar.notNeeded')}</small></button>`,
    )
    .join('')}</div></section>`;
}
function canUseGoods(k) {
  if (!goodsCount(k)) return false;
  if (k === 'lantern') return !(state.lanternLeft > 0);
  if (k === 'basket') return !(state.basketLeft > 0);
  return state.team.some(m => m.hp > 0 && (m.hp < m.max || (m.fullness ?? 75) < 100));
}
function useGoods(k) {
  if (battle || locked || !canUseGoods(k)) return;
  state.goods[k]--;
  if (k === 'lantern') state.lanternLeft = 30;
  else if (k === 'basket') state.basketLeft = 5;
  else
    state.team.forEach(m => {
      if (m.hp > 0) m.hp = Math.min(m.max, m.hp + Math.ceil(m.max * 0.5));
      m.fullness = 100;
    });
  update();
  teamMenu();
  toast(I18N.t(`bazaar.${k}.used`));
}
// The lantern doubles rare finds; the basket steadies the next few throws.
const lanternBoost = () => (state.lanternLeft > 0 ? 2 : 1);
const basketBonus = () => (state.basketLeft > 0 ? 0.1 : 0);
function spendLantern() {
  if (state.lanternLeft > 0) state.lanternLeft--;
}
function spendBasket() {
  if (state.basketLeft > 0) state.basketLeft--;
}

// --- Delivery runs from the Wargamall kitchen, after its story orders are done.
const DELIVERY_JOBS = [
  { region: REGION.WARGAMALL, name: 'Kopi Persada', item: 'delivery.job.coffee', icon: '☕' },
  { region: REGION.WARGAMALL, name: 'Warteg Warga', item: 'delivery.job.rice', icon: '🍛' },
  { region: REGION.WARGAMALL, name: 'Apotek Warga', item: 'delivery.job.jamu', icon: '🧴' },
  { region: REGION.BALAI_BETON, name: 'Warung Balai', item: 'delivery.job.snack', icon: '🍌' },
];
const DELIVERY_STEPS = 260;
const DELIVERY_FULL_PAY = 5;
// Pay grows with the journey, so a run is still worth doing late in the game.
const deliveryPay = () => Math.round((3000 + state.defeated.length * 250) / 500) * 500;
function jobState() {
  const p = chapterState();
  p.jobs ??= { active: null, day: -1, today: 0, total: 0 };
  if (p.jobs.day !== dayNumber()) Object.assign(p.jobs, { day: dayNumber(), today: 0 });
  return p.jobs;
}
const jobStepsLeft = () => {
  const j = jobState();
  return j.active ? Math.max(0, DELIVERY_STEPS - (state.steps - j.active.started)) : 0;
};
function jobsMenu() {
  const j = jobState(),
    job = j.active && DELIVERY_JOBS[j.active.target];
  modal(
    `<div class="portrait-head">${trainerArt(69)}<div><span class="eyebrow">${I18N.t('delivery.eyebrow')}</span><h2>${I18N.t('delivery.title')}</h2></div></div><p>${I18N.t('delivery.intro', { steps: DELIVERY_STEPS, full: DELIVERY_FULL_PAY })}</p>${
      job
        ? `<p class="parcel-icon">${job.icon}</p><p><b>${I18N.t(job.item)} → ${job.name}, ${REGIONS[job.region].name}</b></p><p>${I18N.t('delivery.left', { n: jobStepsLeft() })}</p>`
        : ''
    }<p>${I18N.t('delivery.today', { n: j.today, full: DELIVERY_FULL_PAY, total: j.total })}</p><h3>${I18N.t('arisan.title')}</h3>${arisanPanel()}<div class="actions"><button class="action" data-jobs="take">${job ? I18N.t('delivery.retake', { fee: money(DELIVERY_SWAP_FEE) }) : I18N.t('delivery.take')}</button>${closeButton()}</div>`,
    'jobs',
  );
}
// Swapping a running order costs a small fee, so the nearest shop can't be picked for free.
const DELIVERY_SWAP_FEE = 1000;
function takeJob() {
  if (modalKind !== 'jobs') return;
  const j = jobState(),
    last = j.active?.target ?? -1;
  if (j.active) {
    if (state.money < DELIVERY_SWAP_FEE) {
      toast(I18N.t('delivery.swapPoor', { fee: money(DELIVERY_SWAP_FEE) }));
      return;
    }
    state.money -= DELIVERY_SWAP_FEE;
  }
  // A new destination each time, never the same shop twice in a row.
  let target = Math.floor(Math.random() * DELIVERY_JOBS.length);
  if (target === last) target = (target + 1) % DELIVERY_JOBS.length;
  j.active = { target, started: state.steps };
  // Some routes have a rival who stops you on the way; beating them earns a tip.
  if (Math.random() < DELIVERY_AMBUSH_CHANCE)
    j.active.ambush = {
      at: state.steps + 50 + Math.floor(Math.random() * 80),
      trainer: DELIVERY_RIVALS[j.total % DELIVERY_RIVALS.length],
    };
  closeModal();
  update();
  const job = DELIVERY_JOBS[target];
  toast(
    I18N.t('delivery.taken', { item: I18N.t(job.item), shop: job.name, place: REGIONS[job.region].name }),
  );
}
// Called when the player talks to a shop: hands over a parcel meant for it.
function deliverJob(p) {
  const j = chapterState().jobs,
    job = j?.active && DELIVERY_JOBS[j.active.target];
  if (!job || state.room || state.region !== job.region || p.name !== job.name) return false;
  if (!jobStepsLeft()) {
    j.active = null;
    update();
    toast(I18N.t('delivery.cold'));
    return true;
  }
  jobState();
  const tip = j.active.ambush?.stage === 'won' ? deliveryTip() : 0;
  j.active = null;
  j.today++;
  j.total++;
  // The Ultra Capsule comes with every third full-pay run, so it shares the daily cap.
  const fullPay = j.today <= DELIVERY_FULL_PAY,
    pay = fullPay ? deliveryPay() : Math.round(deliveryPay() / 5 / 100) * 100,
    bonus = fullPay && j.today % 3 === 0,
    dues = fullPay && payArisan();
  state.money += pay + tip - (dues ? ARISAN_DUES : 0);
  if (bonus) addItem('ultraballs', 1);
  update();
  modal(
    `<h2>${I18N.t('delivery.done.title')}</h2><p>${I18N.t('delivery.done.body', { shop: job.name, pay: money(pay) })}${bonus ? ' ' + I18N.t('delivery.done.bonus') : ''}${tip ? ' ' + I18N.t('delivery.ambush.tip', { tip: money(tip) }) : ''}</p>${dues ? `<p class="story-hint">${I18N.t('arisan.paid', { fee: money(ARISAN_DUES), n: state.arisan.weeks[arisanWeek()], need: ARISAN_NEED })}</p>` : ''}${closeButton()}`,
    'delivery',
  );
  return true;
}

// --- Rivals on the route: a trainer who wants a match before the parcel goes through.
const DELIVERY_AMBUSH_CHANCE = 0.35,
  DELIVERY_RIVALS = [9, 2, 11];
const deliveryTip = () => Math.round(deliveryPay() / 2 / 500) * 500;
// Checked twice a second: the rival appears once the steps are walked, and after a
// fight the result is read from the win count.
function deliveryWatch() {
  const a = state.puzzles?.jobs?.active?.ambush;
  if (!a || busy()) return;
  if (a.stage === 'fight') {
    a.stage = state.wins > a.wins ? 'won' : 'lost';
    if (a.stage === 'won') toast(I18N.t('delivery.ambush.won', { tip: money(deliveryTip()) }));
    return;
  }
  // Rivals wait on the road, never indoors.
  if (a.stage || state.room || state.steps < a.at || !jobStepsLeft() || leagueState().active) return;
  a.stage = 'met';
  const t = TRAINERS[a.trainer];
  // The dialog's own close button is "Walk on"; Escape or another dialog means the same.
  modal(
    `<div class="portrait-head">${trainerArt(t.portrait)}<div><span class="eyebrow">${I18N.t('delivery.eyebrow')}</span><h2>${t.name}</h2></div></div><p>“${I18N.t(`delivery.ambush.${a.trainer}`)}”</p><p class="story-hint">${I18N.t('delivery.ambush.offer', { tip: money(deliveryTip()) })}</p><div class="actions"><button class="action" data-ambush="fight" ${state.team.some(m => m.hp > 0) ? '' : 'disabled'}>${I18N.t('delivery.ambush.fight')}</button></div>${closeButton(I18N.t('delivery.ambush.pass'))}`,
    'ambush',
    null,
    { onClose: passAmbush },
  );
}
// Walking on: the rival steps aside for good, the order stays warm.
function passAmbush() {
  const a = state.puzzles?.jobs?.active?.ambush;
  if (a?.stage !== 'met') return;
  a.stage = 'passed';
  save();
  toast(I18N.t('delivery.ambush.passed'));
}
function answerAmbush(choice) {
  const a = state.puzzles?.jobs?.active?.ambush;
  if (modalKind !== 'ambush' || a?.stage !== 'met') return;
  if (choice === 'pass') {
    closeModal();
    return;
  }
  a.stage = 'fight';
  a.wins = state.wins;
  closeModal(true);
  startBattle(a.trainer, TRAINERS[a.trainer].team);
}
setInterval(deliveryWatch, 500);

// --- Arisan Dapur: the kitchen's weekly savings circle. Each full-pay delivery puts
// Rp1.000 in the pot; a member who paid in three times in a week joins that week's
// kocokan (draw). Four members take turns, so the pot is yours once every four weeks;
// the other weeks the winner shares the snacks.
const ARISAN_DUES = 1000,
  ARISAN_NEED = 3,
  ARISAN_SEATS = 4;
// Weeks start on Monday (day 0 of the epoch was a Thursday).
const arisanWeek = (d = dayNumber()) => Math.floor((d + 3) / 7);
function payArisan() {
  const a = state.arisan;
  if (!a) return false;
  a.weeks[arisanWeek()] = (a.weeks[arisanWeek()] || 0) + 1;
  return true;
}
function joinArisan() {
  if (modalKind !== 'jobs' || state.arisan) return;
  state.arisan = { seat: (arisanWeek() + 1) % ARISAN_SEATS, weeks: {}, drawn: arisanWeek() - 1 };
  update();
  jobsMenu();
  toast(I18N.t('arisan.joined'));
}
// The draw for the latest finished week you qualified for, read when the menu opens.
function arisanDraw() {
  const a = state.arisan;
  if (!a) return '';
  const week = Object.keys(a.weeks)
    .map(Number)
    .filter(w => w < arisanWeek() && w > a.drawn && a.weeks[w] >= ARISAN_NEED)
    .sort((x, y) => y - x)[0];
  for (const w of Object.keys(a.weeks)) if (Number(w) < arisanWeek()) delete a.weeks[w];
  if (week === undefined) return '';
  a.drawn = week;
  const mine = week % ARISAN_SEATS === a.seat;
  if (mine) {
    addItem('ultraballs', 3);
    state.goods ??= {};
    state.goods.honey = goodsCount('honey') + 1;
    state.goods.basket = goodsCount('basket') + 1;
  } else addItem('potions', 2);
  update();
  return `<p class="story-hint">${I18N.t(mine ? 'arisan.won' : 'arisan.other', { name: I18N.t(`arisan.member.${week % ARISAN_SEATS}`) })}</p>`;
}
function arisanPanel() {
  const a = state.arisan;
  if (!a)
    return `<p>${I18N.t('arisan.offer', { fee: money(ARISAN_DUES), need: ARISAN_NEED })}</p><div class="actions"><button class="secondary" data-arisan="join">${I18N.t('arisan.join')}</button></div>`;
  const drawn = arisanDraw(),
    turn = (a.seat - (arisanWeek() % ARISAN_SEATS) + ARISAN_SEATS) % ARISAN_SEATS;
  return `${drawn}<p>${I18N.t('arisan.status', { n: a.weeks[arisanWeek()] || 0, need: ARISAN_NEED })} ${I18N.t(turn ? 'arisan.turnLater' : 'arisan.turnNow', { n: turn })}</p>`;
}

// --- Ronda Malam: three night fights in a row with Pak Hansip, once a night. The
// kentongan sounds at 22:00 (night creatures are out from 19:00); waiting for night
// on a bench or at the pos also starts the watch. The same chain of fights carries
// the macet on the road home in Mudik (state.ronda.kind === 'macet').
const RONDA_FIGHTS = 3,
  RONDA_START = 22,
  RONDA_GUEST_CHANCE = 0.35,
  RONDA_PANTUN = 4;
const rondaPay = level => 5000 + level * 400;
// The night a watch belongs to: after midnight still counts as the evening before.
const rondaNight = () => dayNumber() - (new Date().getHours() < 5 ? 1 : 0);
function rondaTime(hour = new Date().getHours()) {
  const now = Date.now();
  if (state.dayUntil > now) return false;
  if (state.nightUntil > now) return true;
  return hour >= RONDA_START || hour < 5;
}
function waitForRonda() {
  state.nightUntil = Date.now() + WAIT_MS;
  state.dayUntil = 0;
  save();
  closeModal();
  toast(I18N.t('wait.ronda.done'));
}
function rondaOffer() {
  if (!rondaTime())
    return `<p>${I18N.t(isNight() ? 'ronda.early' : 'ronda.day')}</p><div class="actions"><button class="action secondary" data-wait="ronda">${I18N.t('wait.ronda')}</button></div>`;
  if (state.rondaDone === rondaNight()) return `<p>${I18N.t('ronda.done')}</p>`;
  return `<p>${I18N.t('ronda.offer', { n: RONDA_FIGHTS })}</p>${ramadanRonda()}<div class="actions"><button class="action" data-ronda="start" ${!state.team.some(m => m.hp > 0) ? 'disabled' : ''}>${I18N.t('ronda.start')}</button></div>`;
}
function startRonda() {
  if (!rondaTime() || state.rondaDone === rondaNight() || battle || !state.team.some(m => m.hp > 0)) return;
  state.ronda = { night: rondaNight(), left: RONDA_FIGHTS };
  closeModal(true);
  rondaFight();
}
// Night visitors come from as far as the journey has reached: the visited region with
// the strongest wild creatures, plus the glowing night guests.
function rondaRegion() {
  return state.visited
    .filter(r => REGIONS[r]?.wild.length)
    .reduce((best, r) => (REGIONS[r].levels[0] > REGIONS[best].levels[0] ? r : best), 0);
}
const rondaPool = () => [
  ...new Set([...REGIONS[rondaRegion()].wild.filter(id => id > 2 && id !== 47), 28, 25]),
];
// The last fight of a watch sometimes brings a rare guest, drawn by the coffee at the pos.
const RONDA_GUESTS = [20, 18, 10];
function rondaFight() {
  const macet = state.ronda.kind === 'macet',
    guest = !macet && state.ronda.left === 1 && Math.random() < RONDA_GUEST_CHANCE,
    pool = macet ? macetPool() : rondaPool(),
    id = guest
      ? RONDA_GUESTS[state.ronda.night % RONDA_GUESTS.length]
      : pool[Math.floor(Math.random() * pool.length)],
    average = Math.round(state.team.reduce((n, m) => n + m.level, 0) / state.team.length),
    level = Math.min(LEVEL_CAP, Math.max(macet ? MUDIK_LEVELS[0] : 5, average) + (guest ? 3 : 0));
  let grown = id;
  while (EVOLUTIONS[grown] && level >= EVOLUTIONS[grown].level) grown = EVOLUTIONS[grown].to;
  startBattle(null, [[grown, level]]);
  if (battle) {
    battle.ronda = true;
    battle.log = I18N.t(macet ? 'mudik.macet.fight' : guest ? 'ronda.guest' : 'ronda.fight', {
      n: RONDA_FIGHTS - state.ronda.left + 1,
      total: RONDA_FIGHTS,
      name: SPECIES[grown].name,
    });
    renderBattle();
  }
}
// After a night fight: carry on, or finish the watch. A loss or retreat ends it.
// Between fights Pak Hansip pours kopi and passes gorengan (10% HP), and trades a pantun.
function rondaAfter(outcome) {
  if (!state.ronda) return;
  if (outcome !== 'win') {
    delete state.ronda;
    save();
    return;
  }
  state.ronda.left--;
  const macet = state.ronda.kind === 'macet';
  if (state.ronda.left > 0) {
    if (!macet)
      state.team.forEach(m => {
        if (m.hp > 0) m.hp = Math.min(m.max, m.hp + Math.ceil(m.max * 0.1));
      });
    update();
    const pantun = I18N.t(`ronda.pantun.${(state.ronda.night + state.ronda.left) % RONDA_PANTUN}`);
    modal(
      macet
        ? `<span class="eyebrow">${I18N.t('mudik.eyebrow')}</span><h2>${I18N.t('mudik.macet.next.title')}</h2><p>${I18N.t('mudik.macet.next.body', { n: state.ronda.left })}</p><div class="actions"><button class="action" data-ronda="next">${I18N.t('mudik.macet.next.go')}</button><button class="secondary" data-ronda="stop">${I18N.t('mudik.macet.later')}</button></div>`
        : `<h2>${I18N.t('ronda.next.title')}</h2><p>${I18N.t('ronda.next.body', { n: state.ronda.left })}</p><p class="story-hint"><b>${I18N.t('ronda.pantun.title')}</b><br>${pantun.replace(/\n/g, '<br>')}</p><div class="actions"><button class="action" data-ronda="next">${I18N.t('ronda.next.go')}</button><button class="secondary" data-ronda="stop">${I18N.t('ronda.next.stop')}</button></div>`,
      'ronda',
      null,
      // Leaving this dialog any other way than "next" (Escape, the close button, another
      // dialog) ends the chain like "stop": a chain left open would block the macet offer.
      { onClose: () => rondaContinuing || stopRonda() },
    );
    return;
  }
  if (macet) {
    delete state.ronda;
    lebaranHome();
    return;
  }
  delete state.ronda;
  state.rondaDone = rondaNight();
  const average = Math.round(state.team.reduce((n, m) => n + m.level, 0) / state.team.length);
  state.money += rondaPay(average);
  addItem('ultraballs', 2);
  state.goods ??= {};
  state.goods.lantern = goodsCount('lantern') + 1;
  const sahur = sahurAfterRonda();
  update();
  modal(
    `<div class="portrait-head">${trainerArt(72)}<div><h2>${I18N.t('ronda.reward.title')}</h2></div></div><p>${I18N.t('ronda.reward.body', { pay: money(rondaPay(average)) })}${sahur}</p>${closeButton()}`,
    'ronda',
  );
}

const onData = (attribute, handler) =>
  onClick(event => {
    const b = event.target.closest(`[data-${attribute}]`);
    if (b && !b.disabled) handler(b);
  });
onData('bazaar', b =>
  b.dataset.bazaar === 'open'
    ? bazaarMenu()
    : b.dataset.bazaar === 'guest'
      ? buyGuestGood()
      : buyGoods(b.dataset.key),
);
onData('goods', b => useGoods(b.dataset.goods));
onData('jobs', () => takeJob());
onData('arisan', () => joinArisan());
onData('ambush', b => answerAmbush(b.dataset.ambush));
onData('wait', b => (b.dataset.wait === 'ronda' ? waitForRonda() : waitForTime()));
// Ends a ronda or macet chain between fights; the next one can be started again.
let rondaContinuing = false;
function stopRonda() {
  if (!state.ronda || battle) return;
  const macet = state.ronda.kind === 'macet';
  delete state.ronda;
  save();
  toast(I18N.t(macet ? 'mudik.macet.stopped' : 'ronda.stopped'));
}
onData('ronda', b => {
  if (b.dataset.ronda === 'start') startRonda();
  else if (b.dataset.ronda === 'next' && state.ronda && modalKind === 'ronda') {
    rondaContinuing = true;
    closeModal(true);
    rondaContinuing = false;
    rondaFight();
  } else if (b.dataset.ronda === 'stop' && modalKind === 'ronda') closeModal();
});
