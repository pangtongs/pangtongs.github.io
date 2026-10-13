/* Ten manual save slots and starting a new journey. */
// Autosave is separate from the slots. A checkpoint from before slots existed is imported once.
function readSlots() {
  try {
    const raw = localStorage.getItem('wargamon-slots');
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v))
        return Array.from({ length: 10 }, (_, i) => (v[i] && validSave(v[i].data) ? v[i] : null));
    }
    const old = JSON.parse(localStorage.getItem('wargamon-checkpoint'));
    return Array.from({ length: 10 }, (_, i) =>
      i === 0 && validSave(old) ? { data: old, savedAt: null } : null,
    );
  } catch {
    return Array(10).fill(null);
  }
}
function writeSlot(i) {
  if (i < 0 || i > 9 || locked || !state.team.length) return false;
  try {
    const slots = readSlots();
    slots[i] = { data: JSON.parse(JSON.stringify(state)), savedAt: new Date().toISOString() };
    localStorage.setItem('wargamon-slots', JSON.stringify(slots));
    save();
    return true;
  } catch {
    toast('Slot belum tersimpan. Penyimpanan browser penuh atau tidak tersedia.');
    return false;
  }
}
function slotMenu(mode = 'load') {
  if (battle || locked) return;
  modal(
    `<h2>${mode === 'load' ? 'Muat perjalanan' : 'Pilih slot simpan'}</h2><p>10 slot manual, autosave terpisah.</p><div class="save-slots">${readSlots()
      .map(
        (v, i) =>
          `<button data-refresh="slot" data-mode="${mode}" data-id="${i}" ${!v && mode === 'load' ? 'disabled' : ''}><b>Slot ${i + 1}</b><span>${v ? REGIONS[v.data.region].name + ', ' + Math.floor(v.data.seconds / 60) + ' menit' : 'Kosong'}</span><small>${v ? v.data.team.length + ' aktif, ' + (v.data.storage?.length || 0) + ' dititipkan' : ''}</small></button>`,
      )
      .join('')}</div>${closeButton('Batal')}`,
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
  closeModal(true);
  resetScene();
  if (!walkable(state.x, state.y)) {
    [state.x, state.y] = state.room ? [480, 555] : place().spawn;
  }
  update();
  resetScene();
  toast('Slot ' + (i + 1) + ' dimuat.');
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
  update();
  chooseStarter();
}
function newGameMenu() {
  if (battle || locked) return;
  modal(
    `<h2>Perjalanan baru?</h2><p>Perjalanan sekarang disimpan ke slot kosong. Jika semua penuh, pilih slot yang akan diganti.</p><div class="actions"><button class="action" data-refresh="newgame">Simpan & mulai baru</button>${closeButton('Batal')}</div>`,
    'newgame',
  );
}
function startNewGame() {
  if (state.team.length) {
    const empty = readSlots().findIndex(v => !v);
    if (empty < 0) {
      slotMenu('new');
      return;
    }
    if (!writeSlot(empty)) return;
  }
  beginFreshGame();
}
