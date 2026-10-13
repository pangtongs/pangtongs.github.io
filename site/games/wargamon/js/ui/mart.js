/* A visitable shop with its own floor, staff, and a small recurring town story. */
deferMapImage('img/maps/interior/wargamaret-staff.webp').src = 'img/maps/interior/wargamaret-staff.webp';
for (const name of ['kasir', 'sela'])
  deferMapImage(`img/characters/wargamaret-${name}.webp`).src = `img/characters/wargamaret-${name}.webp`;
// The terminal minimarket has its own cashier.
const terminalCashier = { name: 'Bu Nita, kasir', portrait: 3 };
bindCharacter(
  ROOMS.terminalshop.points.find(p => p.key === 'shop'),
  terminalCashier,
);
function martState() {
  return (state.martStory ??= { started: false, checked: false, completed: false, warm: false });
}
function martPortrait(name) {
  return `<img class="mart-portrait" src="img/characters/wargamaret-${name}.webp" alt="">`;
}
function martSela() {
  const story = martState();
  let line,
    buttons = '';
  if (story.completed) {
    line = story.warm ? I18N.t('mart.sela.warm') : I18N.t('mart.sela.done');
    if (!story.warm) buttons = `<button data-mart="warm">${I18N.t('mart.sela.chat')}</button>`;
  } else if (story.checked) {
    line = I18N.t('mart.sela.checked');
    buttons = `<button data-mart="finish">${I18N.t('mart.sela.report')}</button>`;
  } else if (story.started) {
    line = I18N.t('mart.sela.waiting');
  } else {
    line = I18N.t('mart.sela.intro');
    buttons = `<button data-mart="start">${I18N.t('mart.sela.help')}</button>`;
  }
  modal(
    `<div class="mart-dialog-head">${martPortrait('sela')}<div><span>${I18N.t('mart.sela.role')}</span><h2>${I18N.t('mart.sela.name')}</h2><p>${line}</p></div></div>${buttons ? `<div class="mart-actions">${buttons}</div>` : ''}`,
    'mart',
  );
}
function martPrices() {
  const story = martState();
  story.started = true;
  story.checked = true;
  update();
  modal(
    `<h2>${I18N.t('mart.prices.title')}</h2><div class="mart-price-grid"><div><small>${I18N.t('mart.prices.local')}</small><strong>${money(PRICES.potions)}</strong><p>${I18N.t('mart.prices.localDesc')}</p></div><div><small>${I18N.t('mart.prices.import')}</small><strong>Rp1.250.000</strong><p>${I18N.t('mart.prices.importDesc')}</p></div></div><p>${story.completed ? I18N.t('mart.prices.done') : I18N.t('mart.prices.return')}</p>`,
    'mart',
  );
}
onClick(e => {
  const button = e.target.closest?.('[data-mart]');
  if (!button || button.disabled || state.room !== 'shop' || modalKind !== 'mart') return;
  const story = martState();
  if (button.dataset.mart === 'start') story.started = true;
  else if (button.dataset.mart === 'finish' && story.checked && !story.completed) {
    story.completed = true;
    addItem('potions', 1);
  } else if (button.dataset.mart === 'warm' && story.completed) story.warm = true;
  else return;
  update();
  martSela();
});
