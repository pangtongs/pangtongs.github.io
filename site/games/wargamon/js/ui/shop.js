/* Shops and food stalls: stock, meals on the spot and the special dishes. */
// --- Shops.
// A food stall also serves a meal on the spot, like Bu Sari's tea in Sukamaju: the
// whole team recovers its HP and Fullness, fainted teammates included. Conditions stay
// for the clinic. A player without the money eats on the house, so a defeat never
// leaves the team stuck at zero HP.
const DINE_PRICE = 2000;
const mealFee = price => (state.money < price ? 0 : price);
const mealNeeded = () => state.team.some(m => m.hp < m.max || (m.fullness ?? 75) < 100);
function dineDish(p) {
  return I18N.t(
    /kopi/i.test(p.name)
      ? 'dine.dish.coffee'
      : /warteg|warung|nasi/i.test(p.name)
        ? 'dine.dish.rice'
        : 'dine.dish.tea',
  );
}
// The stall's special dish: a meal and a three-battle effect that suits the food.
const SPECIAL_PRICE = 6000;
const MEAL_BUFFS = {
  power: { dish: 'dine.special.rice', effect: 'dine.effect.power', icon: 'img/items/item-rendang.webp' },
  focus: { dish: 'dine.special.coffee', effect: 'dine.effect.focus', icon: 'img/items/item-kopi.webp' },
  guard: { dish: 'dine.special.tea', effect: 'dine.effect.guard', icon: 'img/items/item-wedang.webp' },
};
const stallBuff = p =>
  /kopi/i.test(p.name) ? 'focus' : /warteg|warung|nasi/i.test(p.name) ? 'power' : 'guard';
const mealBuff = kind => (state.mealBuff?.kind === kind && state.mealBuff.left > 0 ? state.mealBuff : null);
function mealBuffBadge() {
  const b = state.mealBuff;
  return b?.left > 0
    ? `<span class="fullness-pill meal-pill"><img class="meal-icon" src="${MEAL_BUFFS[b.kind].icon}" alt="">${I18N.t(MEAL_BUFFS[b.kind].effect)} · ${I18N.t('dine.left', { n: b.left })}</span>`
    : '';
}
function specialButton(p) {
  const buff = MEAL_BUFFS[stallBuff(p)];
  return `<button class="action secondary" data-dine-special="${p.name}" ${state.money < SPECIAL_PRICE ? 'disabled' : ''}><img class="special-dish-icon" src="${buff.icon}" alt=""><b>${I18N.t(buff.dish)}, ${money(SPECIAL_PRICE)}</b><small>${I18N.t('dine.special.body', { effect: I18N.t(buff.effect) })}</small></button>`;
}
function dineCard(p) {
  const needed = mealNeeded(),
    fee = mealFee(DINE_PRICE);
  return `<section class="dine-card"><h3>${I18N.t('dine.title')}</h3><p>${I18N.t('dine.body', { dish: dineDish(p) })}</p><button class="action" data-dine="${p.name}" ${!needed ? 'disabled' : ''}>${I18N.t(needed ? 'dine.button' : 'dine.full', { price: fee ? money(fee) : I18N.t('heal.freePrice') })}</button>${specialButton(p)}</section>`;
}
onClick(event => {
  const button = event.target.closest('[data-dine]');
  if (!button || button.disabled || modalKind !== 'shop' || battle || locked || state.room) return;
  const p = nearest();
  if (
    p?.key !== 'shop' ||
    p.sells !== 'food' ||
    p.name !== button.dataset.dine ||
    Math.hypot(state.x - p.x, state.y - p.y) > reachOf(p) ||
    !mealNeeded()
  )
    return;
  const fee = mealFee(DINE_PRICE);
  state.money -= fee;
  state.team.forEach(m => {
    m.hp = m.max;
    m.fullness = 100;
  });
  update();
  shop();
  toast(I18N.t('dine.done', { dish: dineDish(p) }) + (fee ? '' : ' ' + I18N.t('heal.free')));
});
onClick(event => {
  const button = event.target.closest('[data-dine-special]');
  if (!button || button.disabled || modalKind !== 'shop' || battle || locked || state.room) return;
  const p = nearest();
  if (
    p?.key !== 'shop' ||
    p.sells !== 'food' ||
    p.name !== button.dataset.dineSpecial ||
    Math.hypot(state.x - p.x, state.y - p.y) > reachOf(p) ||
    state.money < SPECIAL_PRICE
  )
    return;
  const kind = stallBuff(p);
  state.money -= SPECIAL_PRICE;
  state.team.forEach(m => {
    m.hp = m.max;
    m.fullness = 100;
  });
  state.mealBuff = { kind, left: 3 };
  update();
  shop();
  toast(
    I18N.t('dine.special.done', {
      dish: I18N.t(MEAL_BUFFS[kind].dish),
      effect: I18N.t(MEAL_BUFFS[kind].effect),
    }),
  );
});
function shop() {
  const closed = I18N.t(state.room === 'shop' ? 'mart.closed' : 'shop.closedLeague');
  if (leagueState().active) {
    toast(closed);
    return;
  }
  if (nyepiClosed()) return;
  const stock = (inBag, buy) =>
    `<p class="wallet">${money(state.money)}</p><div class="quantity-picker">${[1, 5, 10].map(n => `<button data-every="quantity" data-id="${n}" aria-pressed="${shopQuantity === n}">×${n}</button>`).join('')}</div><div class="shop-grid">${shopStock()
      .map(k => {
        const it = medicineInfo(k),
          price = PRICES[k] * shopQuantity;
        return `<section class="shop-card"><div class="shop-item-heading">${itemIcon(k)}<h3>${it.name}</h3></div><p>${it.desc}</p><small>${inBag}: ${itemCount(k)}</small><button data-every="buy" data-key="${k}" ${state.money < price ? 'disabled' : ''}>${buy(price)}</button></section>`;
      })
      .join('')}</div>`;
  if (state.room === 'shop') {
    modal(
      `<div class="mart-dialog-head">${martPortrait('kasir')}<div><span>${I18N.t('mart.staff.role')}</span><h2>Wargamaret</h2><p>${I18N.t('mart.staff.line')}</p></div></div>${stock(I18N.t('mart.stock'), price => I18N.t('mart.buy', { count: shopQuantity, price: money(price) }))}`,
      'shop',
      closeButton(),
    );
    return;
  }
  const pharmacy = ['clinic', 'researchlab'].includes(state.room);
  const roomShop = {
    calderacoop: I18N.t('shop.name.calderacoop'),
    calderacamp: I18N.t('shop.name.calderacamp'),
    researchlab: I18N.t('shop.name.researchlab'),
    terminalshop: I18N.t('terminal.shop.name'),
  };
  const nearby = nearest();
  const activeShop =
    nearby?.key === 'shop' && Math.hypot(state.x - nearby.x, state.y - nearby.y) <= reachOf(nearby)
      ? nearby
      : null;
  const shopName =
    roomShop[state.room] ||
    (state.room === 'workshopparts' ? ROOMS.workshopparts.name : null) ||
    (pharmacy
      ? I18N.t('shop.name.pharmacy')
      : activeShop?.title || activeShop?.name || I18N.t('shop.name.default'));
  const clerk = ['terminalshop', 'workshopparts'].includes(state.room)
    ? spots().find(p => p.key === 'shop')
    : null;
  modal(
    `${clerk ? `<div class="portrait-head">${trainerArt(clerk.portrait)}<div><h2>${shopName}</h2><p>${state.room === 'workshopparts' ? clerk.name.split(',')[0] : I18N.t('terminal.shop.cashier')}</p></div></div>` : `<h2>${shopName}</h2>`}${activeShop?.sells === 'food' ? dineCard(activeShop) + takjilCard() + jajananCard() : ''}${state.room === 'warungcity' ? bargainCard() : ''}${stock(I18N.t('mart.stock'), price => I18N.t('mart.buy', { count: shopQuantity, price: money(price) }))}`,
    'shop',
    closeButton(),
  );
}
