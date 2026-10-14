/* Gang Senggol is an outdoor world tile adjoining Sukamaju's east road.
   Pasar Subuh remains an optional room. Old Gang room saves migrate below. */

// The replacement image already shares its west/north edges with town/forest.
const gangWorldX = x => GANG_WORLD.x + x;
const gangImageX = x => x - GANG_WORLD.x;
const GANG_POINTS = ROOMS.gangsenggol.points.map(point => ({
  ...point,
  x: gangWorldX(point.x),
  y: point.y + GANG_WORLD.y,
  district: 'gang',
}));
const inGang = () =>
  !state.room &&
  state.region === REGION.SUKAMAJU &&
  state.x >= GANG_WORLD.x &&
  state.x < GANG_WORLD.x + 960 &&
  state.y >= GANG_WORLD.y &&
  state.y < GANG_WORLD.y + 640;
function districtDecision() {
  return (state.districtDecision ??= {});
}
function syncGangLocation() {
  if (inGang()) {
    $('location').textContent = I18N.t('gang.name');
    canvas.setAttribute('aria-label', I18N.t('gang.name'));
    $('mapLabel').innerHTML = `${I18N.t('gang.label')}<small>${I18N.t('gang.between')}</small>`;
  } else if (!state.room && state.region === REGION.SUKAMAJU) {
    $('location').textContent = REGIONS[REGION.SUKAMAJU].name;
    canvas.setAttribute('aria-label', REGIONS[REGION.SUKAMAJU].name);
    $('mapLabel').innerHTML =
      `${REGIONS[REGION.SUKAMAJU].name.toUpperCase()}<small>${I18N.t('hud.map.explore')}</small>`;
  }
}
function districtScene(point) {
  const d = districtDecision(),
    kind = point.scene,
    gang = point.district === 'gang';
  // Residents are introduced with their portrait, like every other character.
  const head = title =>
    point.portrait === undefined
      ? `<h2>${title}</h2>`
      : `<div class="portrait-head">${trainerArt(point.portrait)}<div><h2>${title}</h2></div></div>`;
  if (gang && kind === 'watch') {
    if (!d.gangWatch) {
      d.gangWatch = true;
      update();
    }
    return modal(
      `${head(I18N.t('gang.watch.title'))}<p>${I18N.t(d.gang === 'community' ? 'gang.watch.open' : 'gang.watch.map')}</p>${rondaOffer()}${closeButton()}`,
      'district',
    );
  }
  if (gang && kind === 'guide') {
    const done =
      d.gang === 'community'
        ? I18N.t('gang.guide.community')
        : d.gang === 'paid'
          ? I18N.t('gang.guide.paid')
          : null;
    return modal(
      `${head('Bang Jali')}<p>${done || I18N.t('gang.guide.offer')}</p>${d.gang ? '' : `<div class="actions"><button data-district="community" ${!d.gangWatch || !d.gangReka ? 'disabled' : ''}>${I18N.t('gang.guide.sign')}</button><button data-district="paid" ${state.money < 25000 ? 'disabled' : ''}>${I18N.t('gang.guide.pay')}</button></div><p>${I18N.t(!d.gangReka ? 'gang.guide.needReka' : !d.gangWatch ? 'gang.guide.needMap' : 'gang.guide.ready')}</p>`}${closeButton()}`,
      'district',
    );
  }
  if (gang && kind === 'food')
    return modal(
      `${head('Warung Pecel Lele')}<p>${I18N.t('district.food')}</p><button data-district="snack" ${state.money < 12000 ? 'disabled' : ''}>${I18N.t('district.snack')}</button>${closeButton()}`,
      'district',
    );
  if (gang && kind === 'advocate') {
    if (!d.gangReka) {
      d.gangReka = true;
      update();
    }
    return modal(
      `${head(I18N.t('district.title.reka'))}<p>${I18N.t(d.gang === 'paid' ? 'gang.reka.paid' : d.gang === 'community' ? 'gang.reka.community' : 'gang.reka.ask')}</p>${closeButton()}`,
      'district',
    );
  }
  if (!gang && kind === 'tree')
    return modal(
      `<h2>${I18N.t('district.title.tree')}</h2><p>${I18N.t('district.tree')}</p>${closeButton()}`,
      'district',
    );
  if (!gang && kind === 'silver')
    return modal(
      `${head(I18N.t('district.title.silver'))}<p>${I18N.t('district.silver')}</p>${closeButton()}`,
      'district',
    );
  if (!gang && kind === 'busker')
    return modal(
      `${head(I18N.t('district.title.busker'))}<p>${I18N.t(d.market === 'drain' ? 'district.busker.drain' : d.market === 'stalls' ? 'district.busker.stalls' : 'district.busker')}</p>${closeButton()}`,
      'district',
    );
  if (!gang && kind === 'vendor')
    return modal(
      `${head(I18N.t('district.title.nira'))}<p>${I18N.t(d.market === 'drain' ? 'district.marketDrain' : d.market === 'stalls' ? 'district.marketStalls' : 'district.vendor')}</p>${d.market ? '' : `<div class="actions"><button data-district="drain" ${state.money < 50000 ? 'disabled' : ''}>${I18N.t('district.pump')}</button><button data-district="stalls">${I18N.t('district.stalls')}</button></div>`}<div class="actions"><button class="action secondary" data-bazaar="open">${I18N.t('bazaar.open')}</button></div>${closeButton()}`,
      'district',
    );
  if (!gang && kind === 'pump')
    return modal(
      `<h2>${I18N.t('district.title.pump')}</h2><p>${I18N.t(d.market === 'drain' ? 'district.pump.drain' : d.market === 'stalls' ? 'district.pump.stalls' : 'district.pump.intro')}</p>${closeButton()}`,
      'district',
    );
}
onClick(event => {
  const button = event.target.closest('[data-district]');
  if (!button || button.disabled || modalKind !== 'district') return;
  const d = districtDecision(),
    choice = button.dataset.district;
  if (choice === 'snack') {
    if (state.money < 12000) return;
    state.money -= 12000;
    state.team.forEach(mon => {
      if (mon.hp > 0) mon.hp = Math.min(mon.max, mon.hp + Math.ceil(mon.max * 0.2));
    });
    toast(I18N.t('district.toast.snack'));
  } else if (['community', 'paid'].includes(choice) && !d.gang) {
    if (
      (choice === 'community' && (!d.gangWatch || !d.gangReka)) ||
      (choice === 'paid' && state.money < 25000)
    )
      return;
    d.gang = choice;
    if (choice === 'paid') state.money -= 25000;
    else {
      state.potions += 2;
      state.balls += 2;
    }
    toast(I18N.t(choice === 'paid' ? 'gang.toast.paid' : 'gang.toast.community'));
  } else if (['drain', 'stalls'].includes(choice) && !d.market) {
    if (choice === 'drain' && state.money < 50000) return;
    d.market = choice;
    if (choice === 'drain') {
      state.money -= 50000;
      state.balls += 3;
    } else state.potions += 2;
    toast(I18N.t(choice === 'drain' ? 'district.toast.drain' : 'district.toast.stalls'));
  } else return;
  update();
  closeModal();
});
function gangVisible() {
  return (
    camera.x < GANG_WORLD.x + 960 &&
    camera.x + camera.width > GANG_WORLD.x &&
    camera.y < GANG_WORLD.y + 640 &&
    camera.y + camera.height > GANG_WORLD.y
  );
}
function paintGangGround() {
  if (!gangVisible()) return;
  paintMap(ROOMS.gangsenggol, true, [GANG_WORLD.x, GANG_WORLD.y]);
}
// The alley's residents join the frame's actors, drawn back to front with everyone else.
function gangActors(actors, sheet) {
  if (!gangVisible()) return;
  for (const point of ROOMS.gangsenggol.points)
    if (point.portrait !== undefined)
      actors.push({
        y: GANG_WORLD.y + point.y,
        ox: GANG_WORLD.x,
        oy: GANG_WORLD.y,
        draw: () => drawActor(sheet, point.x, point.y, point.portrait),
      });
}
function paintGangLabels() {
  if (!gangVisible()) return;
  const player = worldPosition();
  ctx.save();
  ctx.translate(GANG_WORLD.x, GANG_WORLD.y);
  for (const point of ROOMS.gangsenggol.points) {
    if (Math.hypot(player.x - gangWorldX(point.x), player.y - (GANG_WORLD.y + point.y)) < 110)
      drawPointLabel(point);
  }
  ctx.restore();
}
// The alley painting is requested when it comes into view (visibleActorAssets) and
// warmed with the rest of the chapter after the first painted frame.
// Pointer taps on the neighboring tile use the same world route as movement.
canvas.addEventListener(
  'click',
  event => {
    if (state.room || busy()) return;
    const target = canvasToWorld(event.clientX, event.clientY),
      local = { x: gangImageX(target.x), y: target.y - GANG_WORLD.y };
    if (local.x < 0 || local.x > 960 || local.y < 0 || local.y > 640) return;
    event.stopImmediatePropagation();
    const point = ROOMS.gangsenggol.points.find(p => hitPoint(p, local));
    if (point) {
      const worldPoint = GANG_POINTS.find(p => p.scene === point.scene);
      walkWorldTarget(worldPoint, 0);
    } else if (worldWalkable(target.x, target.y)) followWorldPath(worldRoute(worldPosition(), target));
  },
  true,
);
// Keep the full travel journal available by choice. The play field remains the
// default, and one always-visible shortcut opens destinations directly.

let explorationPanel = false;
try {
  explorationPanel = localStorage.getItem('wargamon-exploration-panel') === 'true';
} catch {}
function setExplorationPanel(value) {
  explorationPanel = !!value;
  document.body.classList.toggle('show-exploration', explorationPanel);
  try {
    localStorage.setItem('wargamon-exploration-panel', String(explorationPanel));
  } catch {}
}
setExplorationPanel(explorationPanel);
const exploreQuick = document.createElement('button');
exploreQuick.type = 'button';
exploreQuick.className = 'explore-quick';
// The journal has a key like the other panels (T, M, G, O): J, printed on the button.
exploreQuick.id = 'journalBtn';
exploreQuick.innerHTML = I18N.t('explore.quick') + ' <kbd>J</kbd>';
exploreQuick.title = I18N.t('world.menuDetail');
exploreQuick.setAttribute('aria-keyshortcuts', 'J');
document.querySelector('.console-top').insertBefore(exploreQuick, $('teamStrip') || $('money'));
exploreQuick.addEventListener('click', worldInfoMenu);
// An earlier UI layer sets textContent on these buttons, removing the key caps.
// The G/O handlers already exist; keep their visible labels in sync with them.
for (const [id, key] of [
  ['dockDex', 'G'],
  ['gameMenu', 'O'],
]) {
  const button = $(id),
    label = button.textContent.trim() || (id === 'dockDex' ? 'Wargadex' : 'Menu');
  button.innerHTML = label + ' <kbd>' + key + '</kbd>';
  button.setAttribute?.('aria-keyshortcuts', key);
}
onClick(e => {
  if (!e.target.closest('[data-district-ui="panel"]')) return;
  if (window.matchMedia?.('(max-width:780px)').matches) {
    worldInfoMenu();
    return;
  }
  setExplorationPanel(!explorationPanel);
  gameMenu();
});
