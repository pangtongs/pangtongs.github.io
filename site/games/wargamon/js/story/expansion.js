/* Two connected chapters, with saved rail and delivery challenges. */
for (const name of ['img/maps/exterior/3-4.webp', 'img/maps/exterior/2-4.webp']) deferMapImage(name);
const RAIL_CELLS = [
  { x: 0, y: 1, curve: false },
  { x: 1, y: 1, curve: true },
  { x: 1, y: 0, curve: true },
  { x: 2, y: 0, curve: true },
  { x: 2, y: 1, curve: true },
  { x: 3, y: 1, curve: false },
];
function railState() {
  const p = chapterState();
  return (p.rail ??= {
    rot: [1, 1, 2, 0, 2, 1],
    message: I18N.t('rail.start'),
  });
}
function railPorts(i) {
  return (RAIL_CELLS[i].curve ? [0, 1] : [1, 3]).map(d => (d + railState().rot[i]) % 4);
}
function traceRail() {
  let i = 0,
    entry = 3;
  const visited = [];
  for (let step = 0; step < 12; step++) {
    if (visited.includes(i)) return { ok: false, path: visited };
    visited.push(i);
    const ports = railPorts(i);
    if (!ports.includes(entry)) return { ok: false, path: visited };
    const exit = ports.find(p => p !== entry),
      cell = RAIL_CELLS[i];
    if (cell.x === 3 && cell.y === 1 && exit === 1) return { ok: true, path: visited };
    const [dx, dy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][exit],
      next = RAIL_CELLS.findIndex(c => c.x === cell.x + dx && c.y === cell.y + dy);
    if (next < 0) return { ok: false, path: visited };
    i = next;
    entry = (exit + 2) % 4;
  }
  return { ok: false, path: visited };
}
function railMenu() {
  if (state.region !== REGION.STASIUN || battle) return;
  if (!state.defeated.includes(33)) {
    deviceGateScene(33, 8);
    return;
  }
  const r = railState(),
    points = [
      [30, 2],
      [58, 30],
      [30, 58],
      [2, 30],
    ],
    tile = (x, y) => {
      const i = RAIL_CELLS.findIndex(c => c.x === x && c.y === y);
      if (i < 0) return '<div class="rail-empty"></div>';
      const ps = railPorts(i);
      return `<button data-extra="railturn" data-id="${i}" aria-label="${I18N.t('rail.turn.aria', { cell: String.fromCharCode(65 + x) + (y + 1) })}" ${has('rail') ? 'disabled' : ''}><svg viewBox="0 0 60 60" aria-hidden="true"><polyline points="${points[ps[0]].join(',')} 30,30 ${points[ps[1]].join(',')}" fill="none" stroke="#244d42" stroke-width="9"/><circle cx="30" cy="30" r="4" fill="#d99d32"/></svg><small>${String.fromCharCode(65 + x)}${y + 1}</small></button>`;
    };
  modal(
    `<h2>${I18N.t('rail.title')}</h2><p>${I18N.t('rail.help')}</p><div class="rail-grid">${Array.from({ length: 12 }, (_, n) => tile(n % 4, Math.floor(n / 4))).join('')}</div><p role="status">${has('rail') ? I18N.t('story.rail.ready', { trainer34: trainerName(34) }) : r.message}</p><div class="actions"><button class="action" data-extra="railtest" ${has('rail') ? 'disabled' : ''}>${I18N.t('rail.test')}</button>${closeButton(I18N.t('common.back'))}</div>`,
    'rail',
  );
}
function turnRail(i) {
  if (state.region !== REGION.STASIUN || !state.defeated.includes(33) || has('rail') || !RAIL_CELLS[i])
    return;
  railState().rot[i] = (railState().rot[i] + 1) % 4;
  save();
  railMenu();
}
function testRail() {
  if (state.region !== REGION.STASIUN || !state.defeated.includes(33) || has('rail')) return;
  const result = traceRail();
  if (result.ok) {
    awardQuest('rail');
    update();
  } else railState().message = I18N.t('rail.notYet');
  save();
  railMenu();
}
// Each order's dish and stall are catalog entries delivery.order.<n>.item and .name.
const DELIVERY_ORDERS = ['☕', '🍱', '🍢'].map((icon, target) => ({
  item: I18N.t(`delivery.order.${target}.item`),
  icon,
  name: I18N.t(`delivery.order.${target}.name`),
  target,
}));
function deliveryState() {
  const p = chapterState();
  return (p.delivery ??= { done: 0, carry: null });
}
function deliveryRemaining() {
  const d = deliveryState();
  return d.carry ? Math.max(0, 100 - (state.steps - d.carry.started)) : 0;
}
function dispatchMenu() {
  if (state.region !== REGION.WARGAMALL || state.room !== 'mallatrium' || battle) return;
  if (!state.defeated.includes(35)) {
    deviceGateScene(35, 9);
    return;
  }
  const d = deliveryState();
  const header = title => `<div class="portrait-head">${trainerArt(69)}<div><h2>${title}</h2></div></div>`;
  if (has('orders')) {
    // The story orders are done; the kitchen keeps offering paid runs into the city.
    jobsMenu();
    return;
  }
  const o = DELIVERY_ORDERS[d.done];
  modal(
    `${header(I18N.t('dispatch.title', { n: d.done }))}<p class="parcel-icon">${o.icon}</p><p><b>${o.item} → ${o.name}</b></p><p>${I18N.t('dispatch.rules')}</p>${d.carry ? `<p>${I18N.t('delivery.left', { n: deliveryRemaining() })}</p>` : ''}<div class="actions"><button class="action" data-extra="pickup">${I18N.t(d.carry ? 'dispatch.retake' : 'delivery.take')}</button>${closeButton(I18N.t('common.later'))}</div>`,
    'dispatch',
  );
}
function pickupOrder() {
  if (
    state.region !== REGION.WARGAMALL ||
    state.room !== 'mallatrium' ||
    !state.defeated.includes(35) ||
    has('orders')
  )
    return;
  deliveryState().carry = { started: state.steps };
  closeModal();
  update();
  toast(I18N.t('dispatch.ready'));
}
function deliverOrder(id) {
  if (state.region !== REGION.WARGAMALL || state.room !== 'mallatrium' || has('orders')) return;
  const d = deliveryState();
  if (!d.carry) {
    toast(I18N.t('dispatch.needOrder'));
    return;
  }
  if (deliveryRemaining() === 0) {
    d.carry = null;
    update();
    toast(I18N.t('dispatch.cold'));
    return;
  }
  if (DELIVERY_ORDERS[d.done].target !== id) {
    toast(I18N.t('dispatch.wrongStall'));
    return;
  }
  d.done++;
  d.carry = null;
  if (d.done === 3) awardQuest('orders');
  update();
  modal(
    `<h2>${I18N.t(d.done === 3 ? 'dispatch.allDone' : 'dispatch.received')}</h2><p>${d.done === 3 ? I18N.t('story.dispatch.done', { trainer36: trainerName(36) }) : I18N.t('dispatch.next')}</p>${closeButton()}`,
    'delivery',
  );
}
const npcExpansionImage = new Image();
images['img/characters/expansion-npcs.webp'] = npcExpansionImage;
npcExpansionImage.onload = () =>
  registerCastSheet(npcExpansionImage, 2, 2, 41, { isolate: isolateGeneratedSprite, alphaFloor: 90 });
// Requested when one of these people is on screen; see visibleActorAssets.
onClick(e => {
  const b = e.target.closest('[data-extra]');
  if (!b || b.disabled) return;
  if (b.dataset.extra === 'railturn') turnRail(Number(b.dataset.id));
  if (b.dataset.extra === 'railtest') testRail();
  if (b.dataset.extra === 'pickup') pickupOrder();
});
