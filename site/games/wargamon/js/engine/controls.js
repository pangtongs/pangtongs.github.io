/* Input: delegated click handlers, keys and pointer tracking for every screen. */
onClick(e => {
  const b = e.target.closest('button[data-new]');
  if (!b || b.disabled) return;
  const act = b.dataset.new;
  if (act === 'goto') {
    if (!modalKind && !battle) autoWalk(spots()[+b.dataset.index]);
    return;
  }
  if (act === 'eat') eatMeal(b.dataset.dish);
  if (act === 'sri-battle' && state.region === REGION.PASAR_RAKYAT && state.stamps.includes('sri'))
    trainerIntro(10);
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreenBtn').textContent = document.fullscreenElement ? 'Keluar layar penuh' : 'Layar penuh';
});
// Keep the D-pad inside fullscreen; viewport-sized mobile menus live above every map control.
const controls = document.querySelector('.mobile-controls'),
  shell = document.querySelector('.console'),
  placesNav = document.querySelector('.places-nav');
if (shell?.insertBefore && controls) shell.insertBefore(controls, placesNav);
onClick(e => {
  const b = e.target.closest('[data-info-page]');
  if (b?.dataset.infoPage !== undefined) help(Number(b.dataset.infoPage));
});
onClick(e => {
  const b = e.target.closest('[data-refresh]');
  if (!b || b.disabled) return;
  const d = b.dataset,
    id = Number(d.id);
  switch (d.refresh) {
    case 'type':
      typeChart(d.type);
      break;
    case 'daycare':
      daycareMenu();
      break;
    case 'storagepage':
      daycareMenu(id);
      break;
    case 'newgame':
      startNewGame();
      break;
    case 'treat':
      payTreatment();
      break;
    case 'rest':
      restAtCamp();
      break;
    case 'slot':
      if (d.mode === 'load') {
        loadCheckpoint(id);
        break;
      }
      if (readSlots()[id] || damagedSlots().includes(id)) {
        modal(
          `<h2>Ganti slot ${id + 1}?</h2><p>Perjalanan dalam slot ini akan diganti.</p><button class="action" data-refresh="writeslot" data-id="${id}" data-mode="${d.mode}">Ganti & simpan</button>${closeButton('Batal')}`,
          'slots',
        );
      } else if (writeSlot(id)) {
        closeModal();
        toast('Slot ' + (id + 1) + ' tersimpan.');
        if (d.mode === 'new') beginFreshGame();
      }
      break;
    case 'writeslot':
      if (writeSlot(id)) {
        closeModal();
        toast('Slot ' + (id + 1) + ' tersimpan.');
        if (d.mode === 'new') beginFreshGame();
      }
      break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const b = e.target.closest?.('[data-refresh="type"]');
  if (b) {
    e.preventDefault();
    typeChart(b.dataset.type);
  }
});
canvas.addEventListener('pointermove', e => {
  if (battle || modalKind) {
    hoveredPlace = null;
    return;
  }
  const w = canvasToWorld(e.clientX, e.clientY);
  let found = null;
  if (state.room) found = findHitPoint(spots(), w);
  else
    for (const i of visibleRegionIndices().filter(regionAvailable)) {
      const [ox, oy] = worldOrigin(i);
      found = findHitPoint(regionPoints(i), { x: w.x - ox, y: w.y - oy });
      if (found) break;
    }
  hoveredPlace = found ? pointIdentity(found) : null;
  canvas.style.cursor = found ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => {
  hoveredPlace = null;
  canvas.style.cursor = 'default';
});
onClick(e => {
  const b = e.target.closest('[data-dex]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.dex === 'select') dex(Number(d.id), dexTab);
  if (d.dex === 'tab') dex(dexSelection, d.tab);
  if (d.dex === 'prev') stepDex(-1);
  if (d.dex === 'next') stepDex(1);
});
document.addEventListener('change', e => {
  if (e.target.matches?.('[data-dex="jump"]')) dex(Number(e.target.value), dexTab);
});
document.addEventListener('keydown', e => {
  if (modalKind !== 'dex' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    stepDex(e.key === 'ArrowLeft' ? -1 : 1);
  }
});
// Controls marked data-over share one guarded dispatcher.
onClick(async e => {
  const b = e.target.closest('[data-over]');
  if (!b || b.disabled) return;
  const d = b.dataset,
    i = Number(d.id);
  switch (d.over) {
    case 'backbag':
      teamMenu();
      break;
    case 'kit':
      if (state.team[i]) kitMenu(state.team[i].id, state.team[i]);
      break;
    case 'retrieve':
      retrieveStored(i);
      break;
    case 'deposit':
      depositMon(i);
      daycareMenu();
      break;
    case 'swap':
      swapStored(i);
      break;
    case 'medmenu':
      // With one teammate there is nobody to choose: the item goes straight to it.
      if (state.team.length === 1 && canUseMedicine(d.key, state.team[0])) await useMedicine(d.key, 0, true);
      else medicineMenu(d.key);
      break;
    case 'medicine':
      await useMedicine(d.key, i);
      break;
    case 'tutorslot':
      tutorSlot = Number(d.slot);
      tutorMenu(i);
      break;
    case 'teach':
      teachMove(i, d.key, d.confirm === '1');
      break;
    case 'decision':
      decideCivic(d.key, i);
      break;
    case 'consequence':
      resolveConsequence(d.key);
      break;
    case 'pipe':
      if (
        modalKind === 'irrigation' &&
        state.region === REGION.WADUK &&
        !has('irrigation') &&
        i >= 0 &&
        i < 9
      ) {
        irrigationState().rot[i] = (irrigationState().rot[i] + 1) % 4;
        save();
        wadukPuzzleMenu('irrigation');
      }
      break;
    case 'water':
      if (modalKind === 'irrigation' && state.region === REGION.WADUK && !has('irrigation')) {
        if (irrigationFlow().ok) awardQuest('irrigation');
        else irrigationState().message = 'Air belum mencapai taman. Ikuti pipa biru dan sambungkan ujungnya.';
        update();
        wadukPuzzleMenu('irrigation');
      }
      break;
  }
});
// Controls marked data-ui.
onClick(e => {
  const b = e.target.closest('[data-ui]');
  if (!b || b.disabled) return;
  switch (b.dataset.ui) {
    case 'menu':
      gameMenu();
      break;
    case 'info':
      help(0);
      break;
    case 'save':
      slotMenu('save');
      break;
    case 'load':
      loadMenu();
      break;
    case 'new':
      newGameMenu();
      break;
    case 'fullscreen':
      closeModal();
      fullscreenGame();
      break;
    case 'audio':
      audioMenu();
      break;
    case 'speed':
      setBattleSpeed(battleSpeed === 2 ? 1 : 2);
      gameMenu();
      break;
    case 'checkup':
      checkup();
      break;
    case 'treatment':
      freeTreatment();
      break;
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset?.ui !== 'language') return;
  if (battle || locked) return;
  save();
  I18N.setLocale(e.target.value);
});
$('dockDex').textContent = 'Wargadex';
$('gameMenu').textContent = 'Menu';
onClick(async e => {
  const b = e.target.closest('[data-every]');
  if (!b || b.disabled) return;
  switch (b.dataset.every) {
    case 'quantity':
      if (modalKind === 'shop' && [1, 5, 10].includes(Number(b.dataset.id))) {
        shopQuantity = Number(b.dataset.id);
        shop();
      }
      break;
    case 'buy':
      purchase(b.dataset.key);
      break;
    case 'catchmenu':
      catchMenu();
      break;
    case 'catch':
      if (modalKind === 'catch' && ['balls', 'ultraballs'].includes(b.dataset.key)) {
        closeModal();
        await advancedCatch(b.dataset.key === 'ultraballs');
      }
      break;
    case 'switch':
      battleSwitchMenu();
      break;
    case 'bag':
      battleItemMenu();
      break;
    case 'speed':
      setBattleSpeed(battleSpeed === 2 ? 1 : 2);
      renderBattle();
      break;
    case 'tipsok':
      state.tipsSeen = { ...state.tipsSeen, [b.dataset.tip === 'catch' ? 'catch' : 'battle']: true };
      save();
      renderBattle();
      break;
  }
});
onClick(e => {
  const button = e.target.closest('[data-news="publish"]');
  if (button && !button.disabled) publishNews(button.dataset.key);
});
onClick(event => {
  const button = event.target.closest('button[data-world]');
  if (!button || button.disabled) return;
  const action = button.dataset.world;
  if (action === 'guide') {
    closeModal();
    document.getElementById('guideBtn').click();
    return;
  }
  if (action === 'wild') {
    closeModal();
    document.getElementById('wildBtn').click();
    return;
  }
  if (action === 'place') {
    const spot = spots()[Number(button.dataset.index)];
    closeModal();
    if (spot && !battle) autoWalk(spot);
  }
});
onClick(event => {
  if (event.target.closest('button[data-ui="worldinfo"]')) worldInfoMenu();
});
onClick(event => {
  if (!event.target.closest('[data-wild-retry]') || !pendingWild) return;
  for (const id of [pendingWild.id, ...state.team.map(mon => mon.id)]) {
    const name = creaturePortraitPath(id);
    portraitRequests.delete(name);
    if (images[name] && imageState(images[name]) !== 'ready') loadMapImage(name, true);
  }
  revealWildEncounter(pendingWild);
});
const locator = document.createElement('button');
locator.id = 'wildLocator';
locator.className = 'wild-locator';
locator.type = 'button';
// A grass tuft under a magnifying glass: search the long grass.
locator.innerHTML =
  '<svg class="wild-grass" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 22c1-5 2-8 4-10-1 4-1 7 0 10zM7 22c0-6 1-10 3-13 0 5 0 9 1 13zM12 22c1-3 2-5 4-6-1 2-1 4-1 6z" fill="#a8cf72"/><circle cx="16.5" cy="7.5" r="4.5" fill="none" stroke="#f4dd7a" stroke-width="2.4"/><path d="M19.8 10.8 23 14" stroke="#f4dd7a" stroke-width="2.6" stroke-linecap="round"/></svg><span></span>';
$('screen').append(locator);
locator.addEventListener('click', () => findWild());
setInterval(updateWildLocator, 400);
