/* Start-up, loaded last. The scripts above only declare data and functions.
   Here the saved game is brought up to date, the page buttons are wired and
   the first screen is shown. Nothing else may read `state` while loading. */

// --- Saved game.
migrateSave();
const initialEvolutions = state.team.map(checkEvolution).filter(Boolean);

// --- Page buttons. Each calls the function by name, so there is one place to look.
for (const [id, handler] of Object.entries({
  teamBtn: () => quickTeamToggle(),
  partyOpen: () => quickTeamToggle(),
  quickTeam: () => quickTeamToggle(),
  screenTeam: () => quickTeamToggle(),
  help: () => help(),
  mapBtn: () => mapMenu(),
  dockMap: () => mapMenu(),
  quickDex: () => dex(),
  dockDex: () => dex(),
  gameMenu: () => gameMenu(),
  saveBtn: () => slotMenu('save'),
  loadBtn: () => loadMenu(),
  newBtn: () => newGameMenu(),
  guideBtn: () => guideObjective(),
  fullscreenBtn: () => fullscreenGame(),
  interact: () => interact(),
  wildBtn: () => findWild(),
  quickWild: () => $('wildBtn').click(),
  travelBtn: () => !battle && !locked && (state.room ? exitRoom() : walkConnection(1)),
}))
  $(id).onclick = handler;

// --- First screen. The opening dialog comes first: update() reflects whether one is open.
resetScene();
if (!state.team.length) chooseStarter();
else if (migration)
  modal(
    `<h2>Perjalananmu bertambah panjang!</h2><p>Tim, uang, dan koleksimu dari versi pertama tetap ikut. Liga baru dimulai di Sukamaju, dengan lima area dan Arena Beton sebagai tujuan akhir. Ambil bekal dari Bu Sari untuk berangkat.</p>${closeButton('Ayo, lanjut!')}`,
  );
else story();
if (initialEvolutions.length && modalKind !== 'starter')
  modal(
    `<h2>Teman lamamu tumbuh!</h2><p>${initialEvolutions.join('<br>')}</p>${closeButton('Lanjut perjalanan')}`,
  );
update();
refreshLoadingState();
updateWildLocator();
translateDOM(document.body);
