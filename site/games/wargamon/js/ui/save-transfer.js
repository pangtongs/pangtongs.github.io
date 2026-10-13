/* Portable progress: reject the entire file before touching browser storage. */
const SAVE_FILE_FORMAT = 'wargamon-save',
  SAVE_FILE_VERSION = 1,
  SAVE_FILE_LIMIT = 2 * 1024 * 1024;
const saveText = key => I18N.t('saveTransfer.' + key);
// Save values are identifiers and numbers. Markup characters never belong in
// one, so no imported string or key can become HTML on any screen.
const SAVE_TEXT = /^[^<>&"'`]{0,200}$/;
function safeValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return SAVE_TEXT.test(value);
  if (typeof value !== 'object' || depth > 8) return false;
  if (Array.isArray(value)) return value.length <= 2000 && value.every(v => safeValue(v, depth + 1));
  const keys = Object.keys(value);
  return (
    keys.length <= 500 &&
    keys.every(k => SAVE_TEXT.test(k) && k !== '__proto__' && safeValue(value[k], depth + 1))
  );
}
const indexList = (list, size) =>
  Array.isArray(list) && list.length <= 2000 && list.every(n => Number.isInteger(n) && n >= 0 && n < size);
function safeConditions(c) {
  return (
    c === undefined ||
    (c !== null &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      Object.entries(c).every(
        ([name, turns]) =>
          Object.hasOwn(STATUS, name) && Number.isFinite(turns) && turns >= 0 && turns <= 100,
      ))
  );
}
function safeMon(m) {
  return (
    m &&
    typeof m === 'object' &&
    Number.isInteger(m.id) &&
    m.id >= 0 &&
    m.id < SPECIES.length &&
    Number.isInteger(m.level) &&
    m.level >= 1 &&
    m.level <= 1000 &&
    Number.isFinite(m.hp) &&
    m.hp >= 0 &&
    Number.isFinite(m.max) &&
    m.max > 0 &&
    m.hp <= m.max &&
    Number.isFinite(m.xp) &&
    m.xp >= 0 &&
    m.xp <= 10000000 &&
    (m.cooldowns === undefined ||
      (m.cooldowns !== null &&
        typeof m.cooldowns === 'object' &&
        !Array.isArray(m.cooldowns) &&
        Object.values(m.cooldowns).every(n => Number.isInteger(n) && n >= 0 && n <= 100))) &&
    (m.status == null || Object.hasOwn(STATUS, m.status)) &&
    safeConditions(m.conditions) &&
    (m.heldItem == null || (typeof m.heldItem === 'string' && Object.hasOwn(LEAGUE_ITEMS, m.heldItem)))
  );
}
function safeProgress(s) {
  if (
    !s ||
    typeof s !== 'object' ||
    !safeValue(s) ||
    !Array.isArray(s.team) ||
    !s.team.every(safeMon) ||
    !Array.isArray(s.storage) ||
    s.storage.length > 1000 ||
    !s.storage.every(safeMon) ||
    !validSave(s)
  )
    return false;
  if (
    !['money', 'balls', 'potions', 'seconds', 'steps', 'wins'].every(
      k => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1000000000,
    )
  )
    return false;
  if (
    !['x', 'y'].every(k => Number.isFinite(s[k]) && Math.abs(s[k]) <= 100000) ||
    !['quests', 'trash'].every(k => s[k].length <= 2000)
  )
    return false;
  if (
    !indexList(s.seen, SPECIES.length) ||
    !indexList(s.defeated, TRAINERS.length) ||
    !indexList(s.visited, REGIONS.length)
  )
    return false;
  if (s.legendCaught !== undefined && !indexList(s.legendCaught, SPECIES.length)) return false;
  if (s.room !== null && s.room !== undefined && !Object.hasOwn(ROOMS, s.room)) return false;
  return true;
}
function createSaveArchive() {
  const autosave = JSON.parse(JSON.stringify(state)),
    slots = readSlots().map(v =>
      v ? { data: JSON.parse(JSON.stringify(v.data)), savedAt: v.savedAt || null } : null,
    );
  return {
    format: SAVE_FILE_FORMAT,
    version: SAVE_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    autosave,
    slots,
  };
}
function checkSaveArchive(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.format !== SAVE_FILE_FORMAT ||
    value.version !== SAVE_FILE_VERSION
  )
    throw Error(saveText('unsupported'));
  if (
    !Array.isArray(value.slots) ||
    value.slots.length !== 10 ||
    value.slots.some(
      v =>
        v !== null &&
        (!v ||
          !safeProgress(v.data) ||
          (v.savedAt !== null && (typeof v.savedAt !== 'string' || !SAVE_TEXT.test(v.savedAt)))),
    )
  )
    throw Error(saveText('invalid'));
  if (value.autosave !== null && !safeProgress(value.autosave)) throw Error(saveText('invalid'));
  if (!value.autosave && !value.slots.some(Boolean)) throw Error(saveText('empty'));
  return value;
}
// A value that makes a check throw is an invalid file, never a raw engine error.
function validateSaveArchive(value) {
  const known = ['unsupported', 'invalid', 'empty'].map(saveText);
  try {
    return checkSaveArchive(value);
  } catch (error) {
    throw Error(known.includes(error.message) ? error.message : saveText('invalid'));
  }
}
function parseSaveArchive(raw) {
  if (typeof raw !== 'string' || raw.length > SAVE_FILE_LIMIT) throw Error(saveText('tooLarge'));
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error(saveText('invalid'));
  }
  return validateSaveArchive(value);
}
function applySaveArchive(value) {
  const archive = validateSaveArchive(value),
    next = archive.autosave || archive.slots.find(Boolean).data;
  const oldAuto = localStorage.getItem(KEY),
    oldSlots = localStorage.getItem('wargamon-slots');
  try {
    localStorage.setItem('wargamon-slots', JSON.stringify(archive.slots));
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (error) {
    try {
      if (oldSlots === null) localStorage.removeItem('wargamon-slots');
      else localStorage.setItem('wargamon-slots', oldSlots);
      if (oldAuto === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, oldAuto);
    } catch {}
    throw Error(saveText('storage'));
  }
  state = JSON.parse(JSON.stringify(next));
  migrateSave();
  battle = null;
  locked = false;
  $('battle').classList.add('hidden');
  $('battle').innerHTML = '';
  closeModal(true);
  resetScene();
  if (!walkable(state.x, state.y)) [state.x, state.y] = state.room ? [480, 555] : place().spawn;
  update();
  resetScene();
  toast(saveText('restored'));
}
function downloadSaveArchive() {
  if (!state.team.length && !readSlots().some(Boolean)) {
    toast(saveText('empty'));
    return;
  }
  const archive = createSaveArchive();
  validateSaveArchive(archive);
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = 'wargamon-save-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(saveText('downloaded'));
}
let pendingSaveArchive = null;
function reviewSaveArchive(archive) {
  pendingSaveArchive = archive;
  const active = archive.autosave || archive.slots.find(Boolean).data,
    count = archive.slots.filter(Boolean).length;
  modal(
    `<h2>${saveText('reviewTitle')}</h2><p>${saveText('reviewDetails').replace('{place}', REGIONS[active.region].name).replace('{count}', count).replace('{team}', active.team.length)}</p><p>${saveText('replaceWarning')}</p><div class="actions"><button class="action" data-save-transfer="confirm">${saveText('confirm')}</button><button class="secondary" data-save-transfer="cancel">${saveText('cancel')}</button></div>`,
    'save-restore',
  );
}
async function chooseSaveArchive() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > SAVE_FILE_LIMIT) throw Error(saveText('tooLarge'));
      reviewSaveArchive(parseSaveArchive(await file.text()));
    } catch (error) {
      pendingSaveArchive = null;
      modal(
        `<h2>${saveText('errorTitle')}</h2><p>${error.message}</p>${closeButton(saveText('cancel'))}`,
        'save-error',
      );
    }
  });
  input.click();
}
onClick(event => {
  const button = event.target.closest('[data-save-transfer]');
  if (!button || button.disabled) return;
  switch (button.dataset.saveTransfer) {
    case 'export':
      try {
        downloadSaveArchive();
      } catch {
        toast(saveText('storage'));
      }
      break;
    case 'import':
      chooseSaveArchive();
      break;
    case 'confirm':
      if (pendingSaveArchive) {
        try {
          applySaveArchive(pendingSaveArchive);
        } catch (error) {
          toast(error.message);
        } finally {
          pendingSaveArchive = null;
        }
      }
      break;
    case 'cancel':
      pendingSaveArchive = null;
      gameMenu();
      break;
  }
});
