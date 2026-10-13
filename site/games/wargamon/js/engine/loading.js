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
function refreshLoadingState() {
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
    if (!state.room) warmNearbyRegions(state.region);
  }
  const image = loadMapImage(name),
    mapState = imageState(image),
    ready = mapState === 'ready';
  // Everything on screen is requested, but outside only the region the player stands in
  // holds up the map: a neighbour coming into view near the border paints when ready
  // instead of flashing the loading screen.
  const onScreen = visibleActorAssets(),
    actors = state.room
      ? onScreen
      : visibleActorAssets(visibleRegionIndices().filter(i => i === state.region)),
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
  const message = paintFailure
    ? 'Peta belum berhasil digambar. Coba muat ulang peta.'
    : failed
      ? 'Gambar peta atau tokoh gagal dimuat. Coba lagi.'
      : slow
        ? 'Gambar masih diunduh. Koneksi sedang lambat.'
        : 'Menyiapkan peta dan tokoh…';
  const label = typeof tr === 'function' ? tr(message) : message,
    title = node.querySelector('b');
  if (title && title.textContent !== label) title.textContent = label;
  const retry = node.querySelector('[data-load-retry]');
  if (retry) retry.hidden = !canRetry;
  node.setAttribute?.('aria-busy', String(!allReady && !failed && !paintFailure));
}
// Only pixels needed for the current frame may block the map. Trainer teams,
// encounters, and unopened interiors load on demand or as background work.
function warmNearbyRegions(index) {
  if (state.room) return;
  for (const name of transitionSheets(index)) loadMapImage(name, false, 'high');
  const neighbors = new Set([index]);
  for (const link of WORLD_LINKS) {
    if (link.from === index) neighbors.add(link.to);
    if (link.to === index) neighbors.add(link.from);
  }
  for (const i of neighbors) {
    const area = PLACES[i];
    if (!area) continue;
    // Start direct neighbors with the active map, rather than waiting to reach
    // their border or to finish a first painted frame.
    const image = loadMapImage(area.image || 'img/maps/interior/interiors.webp', false, 'high');
    if (image.complete && image.naturalWidth) imageState(image);
    for (const name of facadeSheets(i)) loadMapImage(name, false, 'low');
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
  img.title = 'Gambar gagal dimuat. Ketuk untuk mencoba lagi.';
  img.setAttribute('aria-label', (img.alt || 'Wargamon') + ', gambar gagal dimuat, ketuk untuk mencoba lagi');
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
let sceneLoading = refreshLoadingState;
// The original retry handler now delegates here instead of restarting every sprite sheet.
onClick(e => {
  const b = e.target.closest('[data-load-retry]');
  if (b && !b.hidden) retryMap();
});
for (const im of Object.values(images)) {
  im.addEventListener?.('load', refreshLoadingState);
  im.addEventListener?.('error', refreshLoadingState);
}
// Small shared UI art is fetched globally, so an opened shop or battle menu
// never briefly shows iconless buttons.
for (const name of Object.values(ITEM_ART || {})) if (name) loadMapImage(name, false, 'low');
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
// Begin fetching every creature and item when the game opens. A later match
// can use decoded portraits immediately, even if the connection drops.
let fullArtReady = false;
async function preloadAllArt() {
  const panel = document.getElementById('assetPreload');
  if (!panel || fullArtReady) return;
  const message = panel.querySelector('span'),
    retry = panel.querySelector('[data-art-retry]'),
    continueButton = panel.querySelector('[data-art-continue]');
  panel.hidden = false;
  retry.hidden = true;
  continueButton.hidden = true;
  const jobs = [
    ...new Set(
      [...SPECIES.map((_, id) => creaturePortraitPath(id)), ...Object.values(ITEM_ART)].filter(Boolean),
    ),
  ];
  let done = 0,
    next = 0,
    failed = 0;
  const fetchOne = async name => {
    if (name.startsWith('img/creatures/'))
      await preparePortrait(SPECIES.findIndex((_, id) => creaturePortraitPath(id) === name));
    else
      await new Promise((resolve, reject) => {
        let image = loadMapImage(name, false, 'low');
        if (imageState(image) === 'failed') image = loadMapImage(name, true, 'low');
        const finish = () =>
          image.naturalWidth ? image.decode?.().then(resolve, reject) || resolve() : reject(new Error(name));
        if (image.complete) finish();
        else {
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', () => reject(new Error(name)), { once: true });
        }
      });
  };
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < jobs.length) {
        const name = jobs[next++];
        try {
          await fetchOne(name);
        } catch {
          failed++;
        }
        done++;
        message.textContent = `Menyiapkan gambar Wargamon dan barang: ${done}/${jobs.length}`;
      }
    }),
  );
  fullArtReady = failed === 0;
  if (fullArtReady) panel.hidden = true;
  else {
    message.textContent = `${failed} gambar belum termuat. Coba lagi saat koneksi tersedia.`;
    retry.hidden = false;
    continueButton.hidden = false;
  }
}
document.querySelector('[data-art-retry]')?.addEventListener?.('click', preloadAllArt);
document.querySelector('[data-art-continue]')?.addEventListener?.('click', () => {
  document.getElementById('assetPreload').hidden = true;
});
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
// The worker downloads the remaining art only after the first map is on
// screen, so the offline copy never competes with the first playable frame.
let offlineArtRequested = false;
function requestOfflineArt() {
  if (offlineArtRequested || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  offlineArtRequested = true;
  navigator.serviceWorker.ready
    .then(registration => registration.active?.postMessage('warm-art'))
    .catch(() => {});
}
window.addEventListener('load', () => preloadAllArt(), { once: true });
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
function trainerIntro(id) {
  // Headless tests use a minimal Image stub. Browsers have the event API.
  if (typeof Image.prototype.addEventListener !== 'function' || !TRAINERS[id]?.team || !canChallenge(id))
    return showTrainerIntro(id);
  const ids = trainerPortraitIds(id);
  if (ids.every(species => imageState(loadMapImage(creaturePortraitPath(species))) === 'ready'))
    return showTrainerIntro(id);
  modal(
    `<h2>${TRAINERS[id].name}</h2><p>${I18N.t('loading.trainer')}</p><p role="status">${I18N.t('loading.trainerCount', { count: ids.length })}</p>`,
    'trainer-loading',
    `<button data-load-trainer="${id}">${I18N.t('loading.retry')}</button>${closeButton(I18N.t('loading.back'))}`,
  );
  const scene = sceneToken();
  Promise.all(ids.map(preparePortrait)).then(
    () => {
      if (modalKind === 'trainer-loading' && sceneToken() === scene) showTrainerIntro(id);
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
  for (const i of visible) for (const name of [...facadeSheets(i), ...transitionSheets(i)]) need(name);
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
