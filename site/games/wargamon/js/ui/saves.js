/* Ten manual save slots and starting a new journey. */
// Autosave is separate from the slots. A checkpoint from before slots existed is imported once.
const usableSlot = v => !!(v && validSave(v.data));
// The slot list exactly as stored, or null when there is none; throws when it cannot be read.
function storedSlots() {
  const raw = localStorage.getItem('wargamon-slots');
  if (raw == null || raw === '') return null;
  const v = JSON.parse(raw);
  if (!Array.isArray(v)) throw Error('slots');
  return v;
}
// Loadable slots; an empty or damaged slot is null here.
function readSlots() {
  try {
    const raw = localStorage.getItem('wargamon-slots');
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return Array.from({ length: 10 }, (_, i) => (usableSlot(v[i]) ? v[i] : null));
    }
    const old = JSON.parse(localStorage.getItem('wargamon-checkpoint'));
    return Array.from({ length: 10 }, (_, i) =>
      i === 0 && validSave(old) ? { data: old, savedAt: null } : null,
    );
  } catch {
    return Array(10).fill(null);
  }
}
// Slots holding something that is not a usable save (from a damaged or a newer game). They
// stay exactly as found: never loaded, and only written over after a copy went to quarantine.
function damagedSlots() {
  try {
    const v = storedSlots() || [];
    return v.slice(0, 10).flatMap((slot, i) => (slot != null && !usableSlot(slot) ? [i] : []));
  } catch {
    return [];
  }
}
// Writing one slot leaves every other stored entry as it was, damaged ones included.
function writeSlot(i) {
  if (i < 0 || i > 9 || locked || !state.team.length) return false;
  try {
    let slots;
    try {
      slots = storedSlots();
    } catch {
      // The whole list is unreadable: keep a copy before a new list replaces it.
      if (!quarantineSave('slots', localStorage.getItem('wargamon-slots'))) throw Error('quarantine');
    }
    slots = slots ? [...slots] : readSlots();
    while (slots.length < 10) slots.push(null);
    if (
      slots[i] != null &&
      !usableSlot(slots[i]) &&
      !quarantineSave('slot ' + (i + 1), JSON.stringify(slots[i]))
    )
      throw Error('quarantine');
    slots[i] = { data: JSON.parse(JSON.stringify(state)), savedAt: new Date().toISOString() };
    localStorage.setItem('wargamon-slots', JSON.stringify(slots));
    save();
    return true;
  } catch {
    toast(I18N.t('saves.writeFailed'));
    return false;
  }
}
function slotMenu(mode = 'load') {
  if (battle || locked) return;
  const damaged = damagedSlots();
  modal(
    `<h2>${I18N.t(mode === 'load' ? 'saves.loadTitle' : 'saves.saveTitle')}</h2><p>${I18N.t('saves.note')}</p>${damaged.length ? `<p class="save-notice">${I18N.t('saves.damaged.note')}</p>` : ''}<div class="save-slots">${readSlots()
      .map(
        (v, i) =>
          `<button data-refresh="slot" data-mode="${mode}" data-id="${i}" ${!v && mode === 'load' ? 'disabled' : ''}><b>Slot ${i + 1}</b><span>${v ? I18N.t('saves.slot.place', { place: tr(REGIONS[v.data.region].name), n: Math.floor(v.data.seconds / 60) }) : I18N.t(damaged.includes(i) ? 'saves.slot.damaged' : 'saves.slot.empty')}</span><small>${v ? I18N.t('saves.slot.team', { n: v.data.team.length, stored: v.data.storage?.length || 0 }) : ''}</small></button>`,
      )
      .join('')}</div>${closeButton(I18N.t('common.cancel'))}`,
    'slots',
  );
}
function loadMenu() {
  slotMenu('load');
}
function loadCheckpoint(i = 0) {
  const v = readSlots()[i];
  if (!v || !validSave(v.data)) return;
  state = JSON.parse(JSON.stringify(v.data));
  migrateSave();
  state.team.forEach(checkEvolution);
  // A loaded slot autosaves again once the unreadable autosave is safely copied away.
  unblockAutosave();
  closeModal(true);
  resetScene();
  if (!walkable(state.x, state.y)) {
    [state.x, state.y] = state.room ? [480, 555] : place().spawn;
  }
  settleState();
  update();
  resetScene();
  toast(I18N.t('saves.loaded', { n: i + 1 }));
}
function beginFreshGame() {
  state = fresh();
  state.storage = [];
  battle = null;
  locked = false;
  football = null;
  state.room = null;
  closeModal(true);
  $('battle').classList.add('hidden');
  resetScene();
  settleState();
  update();
  chooseStarter();
}
function newGameMenu() {
  if (battle || locked) return;
  modal(
    `<h2>${I18N.t('saves.new.title')}</h2><p>${I18N.t('saves.new.body')}</p><div class="actions"><button class="action" data-refresh="newgame">${I18N.t('saves.new.confirm')}</button>${closeButton(I18N.t('common.cancel'))}</div>`,
    'newgame',
  );
}
function startNewGame() {
  if (state.team.length) {
    const damaged = damagedSlots(),
      empty = readSlots().findIndex((v, i) => !v && !damaged.includes(i));
    if (empty < 0) {
      slotMenu('new');
      return;
    }
    if (!writeSlot(empty)) return;
  }
  beginFreshGame();
}
