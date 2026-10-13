/* Debug tools. They exist only when the page is opened with ?debug, for example
   http://localhost:8000/?debug. Debug play uses its own autosave (see game.js). */
function paintDebugFloor() {
  ctx.save();
  const view = state.room ? { x: 0, y: 0, width: 960, height: 640 } : camera;
  for (let y = Math.floor(view.y / 10) * 10; y <= view.y + view.height; y += 10)
    for (let x = Math.floor(view.x / 10) * 10; x <= view.x + view.width; x += 10) {
      const open = state.room
        ? roomWalkable(state.room, x, y) &&
          (debugWalkAll() || !personBlocks(people(room().points), x, y, { x: -99, y: -99 }))
        : worldWalkable(x, y);
      ctx.fillStyle = open ? '#35e06aa0' : '#8896aa70';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  ctx.restore();
}
if (DEBUG) {
  try {
    Object.assign(debugFlags, JSON.parse(sessionStorage.getItem('wargamon-debug-flags')) || {});
  } catch {}
  // Do not carry an old unrestricted-walking session over a new collision layout.
  // The user can deliberately enable it again after seeing the updated paths.
  try {
    const revision = Object.values(FLOOR_ART_REVISIONS).join('|');
    if (sessionStorage.getItem('wargamon-debug-floor-revision') !== revision) {
      debugFlags.walkAll = false;
      sessionStorage.setItem('wargamon-debug-floor-revision', revision);
      sessionStorage.setItem('wargamon-debug-flags', JSON.stringify(debugFlags));
    }
  } catch {}
  // The panel folds into a small tab in the header so it never covers the game's controls.
  let debugOpen = false;
  try {
    debugOpen = sessionStorage.getItem('wargamon-debug-open') === 'true';
  } catch {}
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  const renderDebugPanel = () => {
    panel.classList.toggle('open', debugOpen);
    const toggle = `<button class="debug-toggle" data-debug="toggle" aria-expanded="${debugOpen}">DEBUG ${debugOpen ? '▴' : '▾'}</button>`;
    if (!debugOpen) {
      panel.innerHTML = toggle;
      return;
    }
    panel.innerHTML = `${toggle}<button data-debug="floor" aria-pressed="${debugFlags.floor}">Area jalan</button><button data-debug="editFloor">${I18N.t('debug.editor.open')}</button><button data-debug="editArt">${I18N.t('debug.artEditor')}</button><button data-debug="walkAll" aria-pressed="${debugFlags.walkAll}">${I18N.t('debug.walkAll')}</button><button data-debug="open" aria-pressed="${debugFlags.openAll}">Buka semua peta</button><button data-debug="level">Tim Lv.80</button><button data-debug="heal">Pulihkan tim</button><button data-debug="money">+Rp1.000.000</button><select data-debug="go" aria-label="Pindah wilayah"><option value="">Pindah ke…</option>${WORLD_CHAPTERS.flatMap(
      c => c.order,
    )
      .map(
        (id, index) =>
          `<option value="${id}">${index + 1}. ${id === GANG_GRID_INDEX ? ROOMS.gangsenggol.name.split('.')[0] : REGIONS[id].name}</option>`,
      )
      .join('')}</select><small>Simpanan debug terpisah dari permainan biasa.</small>`;
  };
  renderDebugPanel();
  document.body.append(panel);
  const keepFlags = () => {
    try {
      sessionStorage.setItem('wargamon-debug-flags', JSON.stringify(debugFlags));
    } catch {}
    renderDebugPanel();
    update();
  };
  panel.addEventListener('click', event => {
    const action = event.target.closest('button[data-debug]')?.dataset.debug;
    if (!action) return;
    event.stopPropagation();
    if (action === 'editArt') {
      const key = inGang() ? 'gang' : String(state.region);
      window.open('art-editor.html?map=' + encodeURIComponent(key), '_blank', 'noopener');
      return;
    }
    if (action === 'toggle') {
      debugOpen = !debugOpen;
      try {
        sessionStorage.setItem('wargamon-debug-open', String(debugOpen));
      } catch {}
      renderDebugPanel();
      return;
    }
    if (action === 'editFloor') {
      openFloorEditor();
      if (modalKind !== 'floor-editor') return;
      debugOpen = false;
      try {
        sessionStorage.setItem('wargamon-debug-open', 'false');
      } catch {}
      renderDebugPanel();
      return;
    }
    if (action === 'floor') debugFlags.floor = !debugFlags.floor;
    else if (action === 'walkAll') {
      debugFlags.walkAll = !debugFlags.walkAll;
      resetScene();
      if (!debugFlags.walkAll) recoverFloor();
    } else if (action === 'open') debugFlags.openAll = !debugFlags.openAll;
    else if (action === 'money') state.money += 1000000;
    else if (!state.team.length) {
      toast('Pilih teman pertama dulu.');
      return;
    } else
      for (const m of [...state.team, ...(state.storage || [])]) {
        if (action === 'level') m.level = 80;
        m.max = SPECIES[m.id].base + m.level * 5;
        normalise(m);
        m.hp = m.max;
        m.conditions = {};
        m.fullness = 100;
      }
    keepFlags();
  });
  panel.addEventListener('change', event => {
    const i = Number(event.target.value);
    if (event.target.dataset.debug !== 'go' || event.target.value === '' || battle) return;
    // Going somewhere locked only makes sense with every map open.
    debugFlags.openAll = true;
    closeModal(true);
    state.room = null;
    if (chapterOf(i) < 0) return;
    state.region = i === GANG_GRID_INDEX ? 0 : i;
    if (i === GANG_GRID_INDEX) setWorldPosition(GANG_WORLD.x + 500, GANG_WORLD.y + 310);
    else [state.x, state.y] = PLACES[i].spawn;
    resetScene();
    keepFlags();
  });
}
