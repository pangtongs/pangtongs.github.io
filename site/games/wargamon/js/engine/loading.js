/* Loading state must survive a slow/failed image and a stopped animation frame. */
let loadingAsset = '',
  loadingSince = Date.now(),
  lastPaintAt = 0,
  paintFailure = null,
  retryCount = 0,
  paintedScene = '';
let warmedRegion = -1;
// Facades painted over a region's base artwork.
function facadeSheets(i) {
  const names = [];
  return names;
}
function transitionSheets(i) {
  return WORLD_CHAPTERS[chapterOf(i)].order
    .filter(id => id !== i)
    .map(id => (id === GANG_GRID_INDEX ? ROOMS.gangsenggol.image : PLACES[id].image));
}
// Character portrait numbers by the sheet that holds them. `cut` tells whether the
// sprite for a portrait has been cut out of its sheet yet.
const PORTRAIT_SHEETS = [
  { from: 0, to: 7, name: 'img/characters/npcs-modern.webp', cut: id => serviceCells.has(id) },
  { from: 8, to: 19, name: 'img/characters/characters-a.webp', cut: id => castCells.has(id) },
  { from: 20, to: 31, name: 'img/characters/characters-b.webp', cut: id => castCells.has(id) },
  { from: 32, to: 40, name: 'img/characters/characters-c.webp', cut: id => castCells.has(id) },
  { from: 41, to: 44, name: 'img/characters/expansion-npcs.webp', cut: id => castCells.has(id) },
  { from: 45, to: 48, name: 'img/characters/waduk-npcs.webp', cut: id => castCells.has(id) },
  { from: 49, to: 56, name: 'img/characters/league-npcs.webp', cut: id => castCells.has(id) },
  { from: 66, to: 73, name: 'img/characters/late-npcs.webp', cut: id => castCells.has(id) },
  { from: 100, to: 107, name: 'img/characters/residents-a.webp', cut: id => castCells.has(id) },
  { from: 108, to: 115, name: 'img/characters/residents-b.webp', cut: id => castCells.has(id) },
  {
    from: 60,
    to: 65,
    name: 'img/characters/characters-unified.webp',
    cut: id => unifiedActors.has(actorRole(id)),
  },
  { from: 90, to: 90, name: 'img/characters/wargamaret-kasir.webp' },
  { from: 91, to: 91, name: 'img/characters/wargamaret-sela.webp' },
];
function portraitSheet(id) {
  return PORTRAIT_SHEETS.find(sheet => id >= sheet.from && id <= sheet.to);
}
function currentMapAsset() {
  if (inGang()) return ROOMS.gangsenggol.image;
  const p = room() || place();
  return p.image || 'img/maps/interior/interiors.webp';
}
function sceneToken() {
  return [
    state.region,
    state.room || '',
    navigation,
    inGang() ? 'gang' : '',
    ...(state.team || []).map(m => m.id),
  ].join(':');
}
function visibleRegionIndices() {
  if (state.room) return [];
  const view = camera;
  return PLACES.map((_, i) => i).filter(i => {
    if (chapterOf(i) !== chapterOf()) return false;
    if (!WORLD_CHAPTERS[chapterOf()].seamless && i !== state.region) return false;
    const [x, y] = worldOrigin(i);
    return x <= view.x + view.width && x + 960 >= view.x && y <= view.y + view.height && y + 640 >= view.y;
  });
}
function loadMapImage(name, force = false, priority = 'high') {
  let image = images[name];
  if (!image || force) {
    image = new Image();
    images[name] = image;
    image.addEventListener?.('load', refreshLoadingState);
    image.addEventListener?.('error', refreshLoadingState);
  }
  if (!image.src || force) {
    image.fetchPriority = priority;
    image.src = force ? `${name}?retry=${Date.now()}` : name;
  }
  return image;
}
const decodedImages = new WeakMap();
function imageState(image) {
  if (!image.complete) return 'loading';
  if (!image.naturalWidth) return 'failed';
  if (typeof image.decode !== 'function') return 'ready';
  const src = image.currentSrc || image.src;
  let record = decodedImages.get(image);
  if (!record || record.src !== src) {
    record = { src, status: 'loading' };
    decodedImages.set(image, record);
    image.decode().then(
      () => {
        if (decodedImages.get(image) === record) {
          record.status = 'ready';
          refreshLoadingState();
        }
      },
      () => {
        if (decodedImages.get(image) === record) {
          record.status = image.naturalWidth ? 'ready' : 'failed';
          refreshLoadingState();
        }
      },
    );
  }
  return record.status;
}
// `onScreen` is this frame's visibleActorAssets() when the caller already has it. Image
// events and timers call this too, with an event or nothing.
function refreshLoadingState(onScreen) {
  // Cached images can finish while the remaining story scripts are still loading.
  if (typeof inGang !== 'function') return;
  const name = currentMapAsset(),
    node = $('sceneLoading');
  if (!node) return;
  if (name !== loadingAsset) {
    loadingAsset = name;
    loadingSince = Date.now();
    retryCount = 0;
    paintFailure = null;
    releaseOtherChapters();
  }
  const image = loadMapImage(name),
    mapState = imageState(image),
    ready = mapState === 'ready';
  // Everything on screen is requested, but outside only the region the player stands in
  // holds up the map: a neighbour coming into view near the border paints when ready
  // instead of flashing the loading screen.
  if (!Array.isArray(onScreen)) onScreen = visibleActorAssets();
  const regions = visibleRegionIndices(),
    actors =
      state.room || (regions.length === 1 && regions[0] === state.region)
        ? onScreen
        : visibleActorAssets(regions.filter(i => i === state.region)),
    allReady = ready && actors.every(asset => asset.ready);
  const failed = mapState === 'failed' || actors.some(asset => asset.failed),
    slow = Date.now() - loadingSince > 12000;
  const canRetry = failed || slow || !!paintFailure;
  // Crossing a painted outdoor border does not need a new full-screen gate
  // when the neighboring artwork is already ready. The next frame paints it.
  const outdoorBorder = !state.room && paintedScene && paintedScene.split(':')[1] === '';
  node.style.display =
    allReady && !paintFailure && (paintedScene === sceneToken() || outdoorBorder) ? 'none' : 'flex';
  if (!state.room && paintedScene === sceneToken() && warmedRegion !== state.region) {
    warmedRegion = state.region;
    setTimeout(() => warmNearbyRegions(state.region), 0);
  }
  const label = I18N.t(
      paintFailure
        ? 'loading.paintFailed'
        : failed
          ? 'loading.sceneFailed'
          : slow
            ? 'loading.sceneSlow'
            : 'loading.scene',
    ),
    title = node.querySelector('b');
  if (title && title.textContent !== label) title.textContent = label;
  const retry = node.querySelector('[data-load-retry]');
  if (retry) retry.hidden = !canRetry;
  node.setAttribute?.('aria-busy', String(!allReady && !failed && !paintFailure));
}
// Only pixels needed for the current frame may block the map. Trainer teams,
// encounters, unopened interiors and regions out of view load on demand or as
// background work. Once the current map is painted, its neighbours and the rest of
// the chapter download at low priority, so walking on rarely meets a loading screen;
// a neighbour that comes into view first is requested at once by the frame itself.
function warmNearbyRegions(index) {
  if (state.room) return;
  const neighbors = new Set([index]);
  for (const link of WORLD_LINKS) {
    if (link.from === index) neighbors.add(link.to);
    if (link.to === index) neighbors.add(link.from);
  }
  for (const i of neighbors) {
    const area = PLACES[i];
    if (!area) continue;
    loadMapImage(area.image || 'img/maps/interior/interiors.webp', false, 'low');
    for (const name of facadeSheets(i)) loadMapImage(name, false, 'low');
  }
  for (const name of transitionSheets(index)) loadMapImage(name, false, 'low');
}
// Map paintings and room art of one chapter: its regions, the rooms behind their
// doors (and rooms opening off those rooms).
function chapterArt(chapter = chapterOf()) {
  const regions = WORLD_CHAPTERS[chapter]?.order || [],
    names = new Set(),
    rooms = [];
  for (const i of regions) {
    if (i === GANG_GRID_INDEX) {
      names.add(ROOMS.gangsenggol.image);
      continue;
    }
    names.add(PLACES[i]?.image || 'img/maps/interior/interiors.webp');
    for (const p of PLACES[i]?.points || []) if (p.room) rooms.push(p.room);
  }
  const seen = new Set();
  while (rooms.length) {
    const key = rooms.pop();
    if (seen.has(key) || !ROOMS[key]) continue;
    seen.add(key);
    names.add(ROOMS[key].image || 'img/maps/interior/interiors.webp');
    for (const p of ROOMS[key].points || []) if (p.room) rooms.push(p.room);
  }
  return names;
}
// A decoded map painting holds about 6 MB of memory. Paintings of the chapters the
// player is not in are dropped when the chapter changes; walking back requests them
// again through loadMapImage like any other unloaded image.
let artChapter = -1;
function releaseOtherChapters() {
  const chapter = chapterOf();
  if (chapter < 0 || chapter === artChapter) return;
  artChapter = chapter;
  const keep = chapterArt(chapter);
  keep.add(currentMapAsset());
  for (const name of Object.keys(images)) {
    if (!name.startsWith('img/maps/') || keep.has(name)) continue;
    const image = images[name];
    delete images[name];
    if (image?.removeAttribute) image.removeAttribute('src');
    else if (image) image.src = '';
  }
}
function retryMap() {
  const name = currentMapAsset(),
    map = loadMapImage(name),
    assets = visibleActorAssets();
  const retryNames = new Set(assets.filter(asset => !asset.ready).map(asset => asset.name));
  if (imageState(map) !== 'ready') retryNames.add(name);
  loadingAsset = name;
  loadingSince = Date.now();
  paintFailure = null;
  retryCount++;
  for (const assetName of retryNames) {
    const image = images[assetName];
    if (image) image.src = `${assetName}?retry=${Date.now()}`;
    else loadMapImage(assetName, true);
    const species = SPECIES.findIndex((_, id) => creaturePortraitPath(id) === assetName);
    if (species >= 0) {
      portraitRequests.delete(assetName);
      preparePortrait(species).catch(() => {});
    }
  }
  // A completed image cannot repair a failed draw. Schedule another frame.
  if (!retryNames.size) requestAnimationFrame(() => refreshLoadingState());
  refreshLoadingState();
}
// A failed portrait is an empty retry tile, never another species or item.
const missingPortrait =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="2" y="2" width="92" height="92" rx="12" fill="#e5ecdd" stroke="#819782" stroke-dasharray="5 5"/><path d="M64 36a22 22 0 1 0 6 18M64 25v12H52" fill="none" stroke="#28594a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  );
function failedPortrait(img) {
  if (!img?.matches?.('img.sprite') || img.src === missingPortrait) return;
  img.dataset.portraitRetry ||= img.currentSrc || img.src;
  img.src = missingPortrait;
  img.classList.add('portrait-failed');
  img.title = I18N.t('loading.portraitFailed');
  img.setAttribute('aria-label', I18N.t('loading.portraitFailedLabel', { name: img.alt || 'Wargamon' }));
  img.tabIndex = 0;
}
function retryPortrait(img) {
  if (!img?.classList?.contains('portrait-failed') || !img.dataset.portraitRetry) return false;
  const original = img.dataset.portraitRetry;
  img.src = original + (original.includes('?') ? '&' : '?') + 'retry=' + Date.now();
  return true;
}
document.addEventListener('error', e => failedPortrait(e.target), true);
document.addEventListener(
  'load',
  e => {
    const img = e.target;
    if (
      !img?.matches?.('img.sprite') ||
      !img.classList.contains('portrait-failed') ||
      img.src === missingPortrait
    )
      return;
    img.classList.remove('portrait-failed');
    img.removeAttribute('title');
    img.removeAttribute('aria-label');
    img.removeAttribute('tabindex');
  },
  true,
);
document.addEventListener(
  'click',
  e => {
    if (retryPortrait(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true,
);
document.addEventListener(
  'keydown',
  e => {
    if ((e.key === 'Enter' || e.key === ' ') && retryPortrait(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true,
);
// The original retry handler now delegates here instead of restarting every sprite sheet.
onClick(e => {
  const b = e.target.closest('[data-load-retry]');
  if (b && !b.hidden) retryMap();
});
for (const im of Object.values(images)) {
  im.addEventListener?.('load', refreshLoadingState);
  im.addEventListener?.('error', refreshLoadingState);
}
setInterval(refreshLoadingState, 1000);
// A trainer preview is part of the encounter, not optional decoration. Fetch
// and decode the whole roster before showing its cards or starting the fight.
const portraitRequests = new Map();
globalThis.portraitDisplayURLs = new Map();
function preparePortrait(id) {
  const name = creaturePortraitPath(id);
  if (!name) return Promise.reject(new Error('No portrait for species ' + id));
  if (portraitRequests.has(name)) return portraitRequests.get(name);
  let image = loadMapImage(name);
  if (imageState(image) === 'failed') image = loadMapImage(name, true);
  const requestedImage = image;
  const request = new Promise((resolve, reject) => {
    const loaded = () => {
      if (!requestedImage.naturalWidth) {
        reject(new Error('Portrait could not load: ' + name));
        return;
      }
      const ready = () => {
        decodedImages.set(requestedImage, {
          src: requestedImage.currentSrc || requestedImage.src,
          status: 'ready',
        });
        if (requestedImage.src.includes('?retry='))
          globalThis.portraitDisplayURLs.set(id, requestedImage.src);
        resolve();
      };
      if (typeof requestedImage.decode === 'function') requestedImage.decode().then(ready, reject);
      else ready();
    };
    if (requestedImage.complete) loaded();
    else {
      requestedImage.addEventListener('load', loaded, { once: true });
      requestedImage.addEventListener('error', () => reject(new Error('Portrait could not load: ' + name)), {
        once: true,
      });
    }
  });
  portraitRequests.set(name, request);
  request.catch(() => {
    if (portraitRequests.get(name) === request) portraitRequests.delete(name);
  });
  return request;
}
// After the first map is painted, the remaining shared art downloads one or two files
// at a time at low priority: item icons (so a shop or battle menu never shows iconless
// buttons), the character sheets of the people in this chapter, then every Wargamon
// portrait. Nothing waits for it: a fight still waits for its own portraits, and a
// person coming into view requests their sheet at once. Data saver and slow links
// keep only the item icons.
let backgroundArtStarted = false;
function slowConnection() {
  const connection = typeof navigator === 'undefined' ? null : navigator.connection;
  return !!connection && (connection.saveData || /(?:^|-)2g$|^3g$/.test(connection.effectiveType || ''));
}
function backgroundArtNames() {
  const names = Object.values(typeof ITEM_ART === 'undefined' ? {} : ITEM_ART);
  if (slowConnection()) return names.filter(Boolean);
  for (const name of Object.keys(images)) if (name.startsWith('img/characters/')) names.push(name);
  for (const sheet of PORTRAIT_SHEETS) names.push(sheet.name);
  for (const mon of state.team || []) names.push(creaturePortraitPath(mon.id));
  SPECIES.forEach((_, id) => names.push(creaturePortraitPath(id)));
  return [...new Set(names.filter(Boolean))];
}
function whenLoaded(image) {
  return new Promise(resolve => {
    if (image.complete || typeof image.addEventListener !== 'function') return resolve();
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  });
}
function idle() {
  return new Promise(resolve =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => resolve(), { timeout: 2000 })
      : setTimeout(resolve, 50),
  );
}
async function preloadBackgroundArt() {
  if (backgroundArtStarted) return;
  backgroundArtStarted = true;
  const jobs = backgroundArtNames();
  let next = 0;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (next < jobs.length) {
        const name = jobs[next++];
        if (images[name]?.src) continue;
        await idle();
        await whenLoaded(loadMapImage(name, false, 'low'));
      }
    }),
  );
}
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator)
  navigator.serviceWorker
    .register('service-worker.js')
    // The worker was called offline-assets.js before the files were sorted into folders.
    .then(() => navigator.serviceWorker.getRegistrations())
    .then(all =>
      all
        .filter(r => /offline-assets\.js$/.test((r.active || r.waiting || r.installing)?.scriptURL || ''))
        .forEach(r => r.unregister()),
    )
    .catch(() => {});
// A new worker takes over as soon as it is installed, but this page still runs the
// scripts it started with. Offer a reload rather than mixing old and new code.
// The first install (no previous worker) needs no notice.
if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller)
  navigator.serviceWorker.addEventListener?.('controllerchange', showUpdateNotice, { once: true });
function showUpdateNotice() {
  if (document.getElementById('updateNotice')) return;
  const button = document.createElement('button');
  button.id = 'updateNotice';
  button.type = 'button';
  button.textContent = I18N.t('update.available');
  button.setAttribute('aria-live', 'polite');
  Object.assign(button.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'max(16px, env(safe-area-inset-bottom))',
    transform: 'translateX(-50%)',
    zIndex: '1000',
    width: 'max-content',
    maxWidth: 'calc(100vw - 32px)',
    whiteSpace: 'normal',
    padding: '10px 16px',
    border: '1px solid #f3dc9a',
    borderRadius: '10px',
    background: '#101d29',
    color: '#f3dc9a',
    font: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 6px 18px #0008',
  });
  button.addEventListener('click', () => location.reload());
  document.body.appendChild(button);
}
// The worker downloads the remaining art only after the first map is on
// screen, so the offline copy never competes with the first playable frame.
let offlineArtRequested = false;
function requestOfflineArt() {
  setTimeout(preloadBackgroundArt, 0);
  if (offlineArtRequested || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  offlineArtRequested = true;
  // The worker stores this chapter's paintings and the team first.
  const first = [
    ...chapterArt(),
    'img/characters/hero-traveler.webp',
    'img/characters/trainers.webp',
    ...(state.team || []).map(mon => creaturePortraitPath(mon.id)),
  ].filter(Boolean);
  navigator.serviceWorker.ready
    .then(registration => registration.active?.postMessage({ type: 'warm-art', first }))
    .catch(() => {});
}
function trainerPortraitIds(id) {
  return [
    ...new Set([
      ...(TRAINERS[id]?.team || []).map(([species]) => species),
      ...(state.team || []).map(mon => mon.id),
    ]),
  ];
}
onClick(e => {
  const button = e.target.closest('[data-load-trainer]');
  if (!button) return;
  const id = Number(button.dataset.loadTrainer);
  if (modalKind !== 'trainer-loading' || !TRAINERS[id]) return;
  for (const species of trainerPortraitIds(id)) {
    const name = creaturePortraitPath(species);
    portraitRequests.delete(name);
    if (images[name] && imageState(images[name]) !== 'ready') loadMapImage(name, true);
  }
  closeModal();
  trainerIntro(id);
});
// A trainer preview is part of the encounter. Fetch and decode the whole
// roster before showing its cards or starting the fight.
function trainerIntro(id, intro = null) {
  // Headless tests use a minimal Image stub. Browsers have the event API.
  if (typeof Image.prototype.addEventListener !== 'function' || !TRAINERS[id]?.team || !canChallenge(id))
    return showTrainerIntro(id, intro);
  const ids = trainerPortraitIds(id);
  if (ids.every(species => imageState(loadMapImage(creaturePortraitPath(species))) === 'ready'))
    return showTrainerIntro(id, intro);
  modal(
    `<h2>${TRAINERS[id].name}</h2><p>${I18N.t('loading.trainer')}</p><p role="status">${I18N.t('loading.trainerCount', { count: ids.length })}</p>`,
    'trainer-loading',
    `<button data-load-trainer="${id}">${I18N.t('loading.retry')}</button>${closeButton(I18N.t('loading.back'))}`,
  );
  const scene = sceneToken();
  Promise.all(ids.map(preparePortrait)).then(
    () => {
      if (modalKind === 'trainer-loading' && sceneToken() === scene) showTrainerIntro(id, intro);
    },
    () => {
      if (modalKind === 'trainer-loading' && sceneToken() === scene)
        modal(
          `<h2>${I18N.t('loading.trainerFailed')}</h2><p>${I18N.t('loading.trainerRetry', { name: TRAINERS[id].name })}</p>`,
          'trainer-loading',
          `<button data-load-trainer="${id}">${I18N.t('loading.retry')}</button>${closeButton(I18N.t('loading.back'))}`,
        );
    },
  );
}

// Only pixels needed for the current frame may block the map. Trainer teams,
// encounters, and unopened interiors load on demand or as background work.
function visibleActorAssets(regions = visibleRegionIndices()) {
  const names = new Map(),
    need = (name, prepared = () => true) => {
      if (name) {
        const checks = names.get(name) || [];
        checks.push(prepared);
        names.set(name, checks);
      }
    };
  const visible = regions;
  for (const i of visible) need(PLACES[i].image || 'img/maps/interior/interiors.webp');
  for (const i of visible) for (const name of facadeSheets(i)) need(name);
  if (visible.includes(13) && !ownsTarsion()) need(creaturePortraitPath(47));
  if (state.team?.length) {
    need('img/characters/hero-traveler.webp');
  }
  const following = followingMon();
  if (following) {
    const frame = followerFrameFor(following.id);
    if (frame) {
      const source = requestFollowerSheet(frame.sheet);
      need(source?.name, () => followerCells.has(`${frame.sheet}:${frame.row}:0`));
    } else need(creaturePortraitPath(following.id));
  }
  const points = state.room ? spots() : visible.flatMap(i => regionPoints(i));
  for (const point of points || []) {
    if (point.worldSprite) {
      need(point.worldSprite);
      continue;
    }
    const id = point.portrait;
    if (id === undefined) continue;
    const source = portraitSheet(id);
    if (source) need(source.name, source.cut && (() => source.cut(id)));
  }
  // The alley can remain visible from the neighboring forest as the camera
  // follows the same world position across a region change.
  if (gangVisible())
    for (const name of ['img/maps/exterior/1-3.webp', 'img/characters/trainers.webp'])
      if (!names.has(name)) need(name);
  return [...names].map(([name, checks]) => {
    const image = loadMapImage(name),
      status = imageState(image);
    return { name, ready: status === 'ready' && checks.every(check => check()), failed: status === 'failed' };
  });
}
