/* Exterior and interior floor editor, available through DEBUG → Edit area jalan. */
const floorEditor = {
  key: '0',
  undo: [],
  redo: [],
  stroke: null,
  selection: null,
  saved: true,
  fill: 'walkable',
  zoom: 1,
  pan: null,
  space: false,
  server: null,
  writing: false,
  projectSaved: null,
  connection: 0,
};
const floorEditorText = key => I18N.t('debug.editor.' + key);
function floorEditorCell(clientX, clientY, box, clamp = false) {
  if (
    !clamp &&
    (clientX < box.left ||
      clientY < box.top ||
      clientX >= box.left + box.width ||
      clientY >= box.top + box.height)
  )
    return null;
  return [
    Math.max(0, Math.min(96, Math.round(((clientX - box.left) / box.width) * 96))),
    Math.max(0, Math.min(64, Math.round(((clientY - box.top) / box.height) * 64))),
  ];
}
function floorEditorPaintCell(rows, col, row, open) {
  if (col < 0 || col >= 97 || row < 0 || row >= 65) return;
  rows[row] = rows[row].slice(0, col) + (open ? '#' : '.') + rows[row].slice(col + 1);
}
function floorEditorPaintBlock(rows, from, to, open) {
  const left = Math.max(0, Math.min(from[0], to[0])),
    right = Math.min(96, Math.max(from[0], to[0])),
    top = Math.max(0, Math.min(from[1], to[1])),
    bottom = Math.min(64, Math.max(from[1], to[1]));
  for (let row = top; row <= bottom; row++)
    rows[row] =
      rows[row].slice(0, left) + (open ? '#' : '.').repeat(right - left + 1) + rows[row].slice(right + 1);
}
// A drag paints its whole box in one colour; the right button paints the other colour.
function startFloorStroke(cell, pointer, open = floorEditor.fill === 'walkable') {
  const rows = [...effectiveFloorRows(floorEditor.key)];
  floorEditor.selection = null;
  floorEditor.stroke = {
    key: floorEditor.key,
    before: [...rows],
    rows,
    start: cell,
    last: cell,
    open,
    pointer,
  };
  moveFloorStroke(cell);
}
function moveFloorStroke(cell) {
  const stroke = floorEditor.stroke;
  if (!stroke) return;
  // Rebuild the preview from the original floor, so shrinking a box leaves no paint behind.
  stroke.rows = [...stroke.before];
  floorEditorPaintBlock(stroke.rows, stroke.start, cell, stroke.open);
  stroke.last = cell;
  paintFloorEditor();
}
// On the later chapters' maps and in every room the hero stands on a cell only where the
// 16px body fits: the cells to its left and right are floor too (see groundWalkable and
// roomWalkable). Beyond a room's wall is solid; beyond a world map's edge is the next map.
function floorEditorNeedsBody(key) {
  return /^\d+$/.test(key) ? [1, 2, 3].includes(chapterOf(Number(key))) : key !== 'gang';
}
function floorEditorFits(rows, key, col, row) {
  if (rows[row][col] !== '#') return false;
  if (!floorEditorNeedsBody(key)) return true;
  const room = !/^\d+$/.test(key),
    floor = c => (c < 0 || c > 96 ? !room : rows[row][c] === '#');
  return floor(col - 1) && floor(col + 1);
}
// Places the hero can no longer reach on the painted floor: doors, people, habitats and
// exits. The walk starts at the map's spawn and, on the world maps, wherever the floor
// meets a map edge (the hero can come in from the neighbouring map).
function floorEditorScene(key) {
  return /^\d+$/.test(key) ? PLACES[Number(key)] : ROOMS[key === 'gang' ? 'gangsenggol' : key];
}
function floorEditorUnreachable(key, rows) {
  const scene = floorEditorScene(key);
  if (!scene?.spawn) return [];
  const fits = (c, r) => r >= 0 && r < 65 && c >= 0 && c < 97 && floorEditorFits(rows, key, c, r),
    seen = new Set(),
    queue = [],
    visit = (c, r) => {
      if (!fits(c, r) || seen.has(r * 97 + c)) return;
      seen.add(r * 97 + c);
      queue.push([c, r]);
    };
  const [sc, sr] = scene.spawn.map(v => Math.round(v / 10));
  for (let d = 0; d <= 3 && !queue.length; d++)
    for (let r = sr - d; r <= sr + d; r++) for (let c = sc - d; c <= sc + d; c++) visit(c, r);
  if (/^\d+$/.test(key))
    for (let i = 0; i < 97; i++) (visit(i, 0), visit(i, 64), visit(0, i % 65), visit(96, i % 65));
  for (let h = 0; h < queue.length; h++) {
    const [c, r] = queue[h];
    (visit(c + 1, r), visit(c - 1, r), visit(c, r + 1), visit(c, r - 1));
  }
  // The same window routeTo searches: three cells around a point, eight below it.
  const near = ([x, y]) => {
    [x, y] = [Math.max(0, Math.min(960, x)), Math.max(0, Math.min(640, y))];
    for (let r = Math.floor(y / 10) - 3; r <= Math.ceil(y / 10) + 8; r++)
      for (let c = Math.floor(x / 10) - 3; c <= Math.ceil(x / 10) + 3; c++)
        if (seen.has(r * 97 + c)) return true;
    return false;
  };
  return scene.points.filter(p => !near([p.x, p.y]) && !(p.at && near(p.at)));
}
function paintFloorEditor() {
  if (modalKind !== 'floor-editor') return;
  const surface = $('floorEditorCanvas'),
    c = surface.getContext('2d'),
    rows = floorEditor.stroke?.rows || effectiveFloorRows(floorEditor.key),
    scene = floorEditScene(floorEditor.key),
    image = images[floorEditImage(floorEditor.key)];
  c.clearRect(0, 0, 960, 640);
  c.imageSmoothingEnabled = false;
  if (image?.complete && image.naturalWidth) {
    if (scene.tile >= 0) {
      const w = image.naturalWidth / 2,
        h = image.naturalHeight / 2;
      c.drawImage(image, (scene.tile % 2) * w, Math.floor(scene.tile / 2) * h, w, h, 0, 0, 960, 640);
    } else c.drawImage(image, 0, 0, 960, 640);
  }
  // Green is walkable. Orange is painted but too narrow for the hero, so the game
  // treats it as blocked; a path needs to be three cells wide.
  let narrow = 0;
  rows.forEach((line, row) => {
    for (let col = 0; col < 97; col++) {
      if (line[col] !== '#') {
        c.fillStyle = '#8896aaa0';
        c.fillRect(col * 10 - 3, row * 10 - 3, 6, 6);
      } else if (floorEditorFits(rows, floorEditor.key, col, row)) {
        c.fillStyle = '#35e06ab0';
        c.fillRect(col * 10 - 3, row * 10 - 3, 6, 6);
      } else {
        narrow++;
        c.fillStyle = '#ff8a1ff0';
        c.fillRect(col * 10 - 4, row * 10 - 4, 8, 8);
      }
    }
  });
  // The box being dragged, or an outline of the last one painted.
  const selection =
    floorEditor.stroke || (floorEditor.selection?.key === floorEditor.key ? floorEditor.selection : null);
  // Places cut off by the painted floor get a red ring.
  const unreachable = floorEditorUnreachable(floorEditor.key, rows);
  c.save();
  c.strokeStyle = '#ff3b3b';
  c.lineWidth = 3;
  for (const p of unreachable) {
    const [x, y] = p.at || [p.x, p.y];
    c.beginPath();
    c.arc(x, y, 16, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
  if (selection) {
    const left = Math.max(0, Math.min(selection.start[0], selection.last[0]) * 10 - 5),
      top = Math.max(0, Math.min(selection.start[1], selection.last[1]) * 10 - 5),
      right = Math.min(960, Math.max(selection.start[0], selection.last[0]) * 10 + 5),
      bottom = Math.min(640, Math.max(selection.start[1], selection.last[1]) * 10 + 5);
    c.save();
    if (floorEditor.stroke) {
      c.fillStyle = selection.open ? '#35e06a30' : '#8896aa55';
      c.fillRect(left, top, right - left, bottom - top);
    }
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.setLineDash([6, 3]);
    c.strokeRect(left + 1, top + 1, right - left - 2, bottom - top - 2);
    c.restore();
  }
  $('floorEditorUndo').disabled = !floorEditor.undo.length;
  $('floorEditorRedo').disabled = !floorEditor.redo.length;
  for (const [id, fill] of [
    ['floorEditorGreen', 'walkable'],
    ['floorEditorBlocked', 'blocked'],
  ])
    $(id).setAttribute('aria-pressed', String(floorEditor.fill === fill));
  $('floorEditorSave').disabled = !floorEditor.server || floorEditor.writing;
  $('floorEditorSave').textContent = floorEditorText(floorEditor.writing ? 'savingProject' : 'saveProject');
  const status = floorEditor.writing
    ? 'savingProject'
    : !floorEditor.saved
      ? 'unsaved'
      : floorEditor.projectSaved === floorEditor.key
        ? 'projectSaved'
        : floorEditor.server
          ? 'saved'
          : 'serverNeeded';
  $('floorEditorStatus').textContent =
    floorEditorText(status) +
    (narrow ? ' ' + I18N.t('debug.editor.narrow', { n: narrow }) : '') +
    (unreachable.length
      ? ' ' + I18N.t('debug.editor.unreachable', { places: unreachable.map(p => tr(p.name)).join(', ') })
      : '');
}
function loadFloorEditorImage() {
  const image = loadMapImage(floorEditImage(floorEditor.key));
  if (!image.complete) image.addEventListener?.('load', paintFloorEditor, { once: true });
  paintFloorEditor();
}
function commitFloorEditor(key, before, after) {
  if (before.every((row, i) => row === after[i])) return;
  floorEditor.undo.push({ key, before: [...before], after: [...after] });
  if (floorEditor.undo.length > 100) floorEditor.undo.shift();
  floorEditor.redo = [];
  floorEditor.projectSaved = null;
  floorEditor.saved = setEditedFloor(key, after);
  paintFloorEditor();
}
function finishFloorStroke() {
  const stroke = floorEditor.stroke;
  if (!stroke) return;
  floorEditor.stroke = null;
  floorEditor.selection = { key: stroke.key, start: [...stroke.start], last: [...stroke.last] };
  commitFloorEditor(stroke.key, stroke.before, stroke.rows);
  paintFloorEditor();
}
function setFloorEditorFill(fill) {
  floorEditor.fill = fill;
  paintFloorEditor();
}
// The map zooms inside the editor (never the page) and scrolls in every direction.
const FLOOR_EDITOR_ZOOMS = [1, 1.5, 2, 3, 4];
function setFloorEditorZoom(zoom, clientX, clientY) {
  const stage = $('floorEditorStage'),
    surface = $('floorEditorCanvas');
  if (!stage) return;
  zoom = Math.max(1, Math.min(4, zoom));
  const before = surface.getBoundingClientRect(),
    view = stage.getBoundingClientRect();
  // Keep the point under the cursor (or the middle of the view) in place.
  clientX ??= view.left + view.width / 2;
  clientY ??= view.top + view.height / 2;
  const fx = (clientX - before.left) / (before.width || 1),
    fy = (clientY - before.top) / (before.height || 1);
  floorEditor.zoom = zoom;
  stage.style.setProperty('--zoom', String(zoom));
  $('floorEditorZoom').textContent = Math.round(zoom * 100) + '%';
  const after = surface.getBoundingClientRect();
  stage.scrollLeft += after.left + fx * after.width - clientX;
  stage.scrollTop += after.top + fy * after.height - clientY;
}
function stepFloorEditorZoom(direction, clientX, clientY) {
  const index = FLOOR_EDITOR_ZOOMS.findIndex(z => z >= floorEditor.zoom - 0.01);
  setFloorEditorZoom(
    FLOOR_EDITOR_ZOOMS[Math.max(0, Math.min(FLOOR_EDITOR_ZOOMS.length - 1, index + direction))],
    clientX,
    clientY,
  );
}
function panFloorEditor(dx, dy) {
  const stage = $('floorEditorStage');
  if (!stage) return;
  stage.scrollLeft += dx;
  stage.scrollTop += dy;
}
function cancelFloorStroke() {
  // Pointer capture is also released after a completed drag. Keep its selected box.
  if (!floorEditor.stroke) return;
  floorEditor.stroke = null;
  floorEditor.selection = null;
  paintFloorEditor();
}
function floorEditorHistory(redo = false) {
  finishFloorStroke();
  const entry = (redo ? floorEditor.redo : floorEditor.undo).pop();
  if (!entry) return;
  (redo ? floorEditor.undo : floorEditor.redo).push(entry);
  floorEditor.projectSaved = null;
  floorEditor.key = entry.key;
  $('floorEditorMap').value = entry.key;
  floorEditor.saved = setEditedFloor(entry.key, redo ? entry.after : entry.before);
  loadFloorEditorImage();
}
async function connectFloorEditor() {
  const connection = ++floorEditor.connection;
  floorEditor.server = null;
  try {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
    const response = await fetch('/__editor/floors', { cache: 'no-store' });
    if (!response.ok) return;
    const server = await response.json();
    if (connection === floorEditor.connection && server.token && server.revision) floorEditor.server = server;
  } catch {
  } finally {
    paintFloorEditor();
  }
}
async function saveFloorEditorProject() {
  if (!DEBUG || !floorEditor.server || floorEditor.writing) return false;
  finishFloorStroke();
  const key = floorEditor.key,
    rows = [...effectiveFloorRows(key)],
    server = floorEditor.server;
  // A floor that cuts off a door, person or exit is saved only on a second click.
  const cut = floorEditorUnreachable(key, rows),
    signature = key + '|' + rows.join('');
  if (cut.length && floorEditor.confirmCut !== signature) {
    floorEditor.confirmCut = signature;
    toast(I18N.t('debug.editor.confirmCut', { places: cut.map(p => tr(p.name)).join(', ') }));
    return false;
  }
  floorEditor.confirmCut = null;
  floorEditor.writing = true;
  paintFloorEditor();
  try {
    const response = await fetch('/__editor/floors', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Wargamon-Editor': server.token },
      body: JSON.stringify({
        version: 1,
        revision: server.revision,
        maps: {
          [key]: { image: floorEditImage(key), rows },
        },
      }),
    });
    if (!response.ok) {
      toast(floorEditorText(response.status === 409 ? 'projectConflict' : 'projectFailed'));
      return false;
    }
    const result = await response.json();
    if (!result.saved?.includes(key) || !result.revision) throw new Error('Invalid editor save');
    server.revision = result.revision;
    FLOORS[key] = rows;
    // Keep any newer painting done while the request was saving as an unsaved draft.
    if (floorEdits[key]?.rows.every((row, index) => row === rows[index])) delete floorEdits[key];
    floorEditor.saved = persistFloorEdits();
    if (effectiveFloorRows(key).every((row, index) => row === rows[index])) floorEditor.projectSaved = key;
    toast(floorEditorText('projectSaved'));
    return true;
  } catch {
    toast(floorEditorText('projectFailed'));
    return false;
  } finally {
    floorEditor.writing = false;
    paintFloorEditor();
  }
}
// A stroke in progress is kept. Once the editor is closed the player stands on the edited
// floor; the editor's own page has no game running behind it, so closing goes to the game.
function closeFloorEditor(reason) {
  finishFloorStroke();
  if (reason !== 'close') return;
  if (floorEditorPage) return location.assign('./?debug');
  recoverFloor();
  resetScene();
  settlePosition();
  update();
}
function openFloorEditor(key = null) {
  if (!DEBUG || battle || locked) return;
  resetScene();
  floorEditor.key = key && FLOORS[key] ? key : currentFloorEditKey();
  if (floorEditorPage) document.title = floorEditorText('title') + ' · Wargamon';
  floorEditor.stroke = null;
  floorEditor.selection = null;
  floorEditor.undo = [];
  floorEditor.redo = [];
  const outdoors = WORLD_CHAPTERS.flatMap(chapter => chapter.order)
    .map((id, index) => {
      const key = id === GANG_GRID_INDEX ? 'gang' : String(id),
        name = id === GANG_GRID_INDEX ? ROOMS.gangsenggol.name.split('.')[0] : REGIONS[id].name;
      return `<option value="${key}"${key === floorEditor.key ? ' selected' : ''}>${index + 1}. ${name}</option>`;
    })
    .join('');
  const interiors = Object.entries(ROOMS)
    .filter(([key]) => key !== 'gangsenggol' && floorEditImage(key))
    .map(
      ([key, scene]) =>
        `<option value="${key}"${key === floorEditor.key ? ' selected' : ''}>${scene.name}</option>`,
    )
    .join('');
  const options = `<optgroup label="${floorEditorText('outdoors')}">${outdoors}</optgroup><optgroup label="${floorEditorText('interiors')}">${interiors}</optgroup>`;
  modal(
    `<div class="floor-editor"><div class="floor-editor-tools">
    <h2>${floorEditorText('title')}</h2>
    <select id="floorEditorMap" aria-label="${floorEditorText('map')}">${options}</select>
    <div class="floor-editor-fill" role="group" aria-label="${floorEditorText('fill')}">
    <button id="floorEditorGreen" data-floor-edit="fill-walkable" aria-pressed="${floorEditor.fill === 'walkable'}"><span class="floor-swatch walkable"></span>${floorEditorText('walkable')}</button>
    <button id="floorEditorBlocked" data-floor-edit="fill-blocked" aria-pressed="${floorEditor.fill === 'blocked'}"><span class="floor-swatch blocked"></span>${floorEditorText('blocked')}</button>
    <kbd class="floor-key" title="${floorEditorText('toggle')}">X</kbd></div>
    <button id="floorEditorUndo" data-floor-edit="undo">${floorEditorText('undo')}</button>
    <button id="floorEditorRedo" data-floor-edit="redo">${floorEditorText('redo')}</button>
    <button data-floor-edit="reset">${floorEditorText('reset')}</button>
    ${floorEditorPage ? '' : `<a class="floor-editor-page" href="area-jalan.html?map=${encodeURIComponent(floorEditor.key)}" target="_blank" rel="noopener">${floorEditorText('ownPage')} ↗</a>`}
    <div class="floor-editor-zoom" role="group" aria-label="Zoom">
    <button data-floor-edit="zoom-out" aria-label="Zoom out">−</button>
    <span id="floorEditorZoom">${Math.round(floorEditor.zoom * 100)}%</span>
    <button data-floor-edit="zoom-in" aria-label="Zoom in">+</button></div>
    </div><p class="floor-editor-help">${floorEditorText('help')}</p>
    <div id="floorEditorStage" class="floor-editor-stage" style="--zoom:${floorEditor.zoom}"><canvas id="floorEditorCanvas" width="960" height="640" aria-label="${floorEditorText('canvas')}"></canvas></div>
    <p id="floorEditorStatus" role="status"></p></div>`,
    'floor-editor',
    `<button id="floorEditorSave" data-floor-edit="save-project" disabled>${floorEditorText('saveProject')}</button>
    <button data-floor-edit="done">${floorEditorText('done')}</button>`,
    { onClose: closeFloorEditor },
  );
  $('floorEditorMap').addEventListener('change', event => {
    finishFloorStroke();
    floorEditor.key = event.target.value;
    floorEditor.selection = null;
    // On its own page the address follows the map, so it can be bookmarked or shared.
    if (floorEditorPage)
      history.replaceState?.(null, '', '?debug&floor=' + encodeURIComponent(floorEditor.key));
    loadFloorEditorImage();
  });
  const surface = $('floorEditorCanvas');
  surface.addEventListener('pointerdown', event => {
    // The middle button, or Space with the left button, drags the view instead of painting.
    if (event.button === 1 || (event.button === 0 && floorEditor.space)) {
      event.preventDefault();
      const stage = $('floorEditorStage');
      floorEditor.pan = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: stage.scrollLeft,
        top: stage.scrollTop,
      };
      return;
    }
    if (![0, 2].includes(event.button) || event.isPrimary === false) return;
    const cell = floorEditorCell(event.clientX, event.clientY, surface.getBoundingClientRect());
    if (!cell) return;
    event.preventDefault();
    // A fresh press also recovers a previous gesture whose release was missed.
    finishFloorStroke();
    startFloorStroke(cell, event.pointerId, (floorEditor.fill === 'walkable') !== (event.button === 2));
    try {
      surface.setPointerCapture(event.pointerId);
    } catch {
      // Document listeners still finish a drag when capture is unavailable.
    }
  });
  surface.addEventListener('contextmenu', event => event.preventDefault());
  // Ctrl/Cmd + wheel (and a trackpad pinch) zooms at the cursor; a plain wheel or
  // two-finger swipe scrolls the map, including left and right.
  $('floorEditorStage').addEventListener(
    'wheel',
    event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setFloorEditorZoom(floorEditor.zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    },
    { passive: false },
  );
  surface.addEventListener('lostpointercapture', event => {
    if (modalKind === 'floor-editor' && floorEditor.stroke?.pointer === event.pointerId) finishFloorStroke();
  });
  loadFloorEditorImage();
  connectFloorEditor();
}
// Subscribe once: releases outside the canvas must not strand a stroke, and reopening
// the editor must not accumulate handlers for its old canvases.
document.addEventListener('pointermove', event => {
  const pan = floorEditor.pan;
  if (modalKind === 'floor-editor' && pan?.pointer === event.pointerId) {
    const stage = $('floorEditorStage');
    stage.scrollLeft = pan.left - (event.clientX - pan.x);
    stage.scrollTop = pan.top - (event.clientY - pan.y);
    return;
  }
  if (modalKind !== 'floor-editor' || floorEditor.stroke?.pointer !== event.pointerId) return;
  if (event.pointerType === 'mouse' && event.buttons === 0) {
    finishFloorStroke();
    return;
  }
  event.preventDefault();
  moveFloorStroke(
    floorEditorCell(event.clientX, event.clientY, $('floorEditorCanvas').getBoundingClientRect(), true),
  );
});
document.addEventListener('pointerup', event => {
  if (floorEditor.pan?.pointer === event.pointerId) floorEditor.pan = null;
  if (modalKind !== 'floor-editor' || floorEditor.stroke?.pointer !== event.pointerId) return;
  moveFloorStroke(
    floorEditorCell(event.clientX, event.clientY, $('floorEditorCanvas').getBoundingClientRect(), true),
  );
  finishFloorStroke();
});
document.addEventListener('pointercancel', event => {
  if (floorEditor.pan?.pointer === event.pointerId) floorEditor.pan = null;
  if (modalKind === 'floor-editor' && floorEditor.stroke?.pointer === event.pointerId) cancelFloorStroke();
});
// Arrow keys or WASD move around the map; + and − zoom; 0 shows the whole map.
const FLOOR_EDITOR_PAN = {
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
};
document.addEventListener('keyup', event => {
  if (event.key !== ' ') return;
  floorEditor.space = false;
  $('floorEditorStage')?.classList.remove('panning');
});
// X swaps green and gray; Ctrl/Cmd+Z undoes and Shift+Ctrl/Cmd+Z redoes; Space+drag pans.
document.addEventListener('keydown', event => {
  if (modalKind !== 'floor-editor' || event.target.tagName === 'SELECT') return;
  const key = event.key.toLowerCase(),
    plain = !event.metaKey && !event.ctrlKey && !event.altKey;
  if (key === ' ' && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    floorEditor.space = true;
    $('floorEditorStage')?.classList.add('panning');
  } else if (FLOOR_EDITOR_PAN[key] && plain) {
    event.preventDefault();
    const step = event.shiftKey ? 400 : 160;
    panFloorEditor(FLOOR_EDITOR_PAN[key][0] * step, FLOOR_EDITOR_PAN[key][1] * step);
  } else if (['+', '='].includes(key) && plain) {
    event.preventDefault();
    stepFloorEditorZoom(1);
  } else if (['-', '_'].includes(key) && plain) {
    event.preventDefault();
    stepFloorEditorZoom(-1);
  } else if (key === '0' && plain) {
    event.preventDefault();
    setFloorEditorZoom(1);
  } else if (key === 'x' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    setFloorEditorFill(floorEditor.fill === 'walkable' ? 'blocked' : 'walkable');
  } else if (key === 'z' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    floorEditorHistory(event.shiftKey);
  }
});
onClick(event => {
  if (!DEBUG || modalKind !== 'floor-editor') return;
  const action = event.target.closest('[data-floor-edit]')?.dataset.floorEdit;
  if (action === 'fill-walkable') setFloorEditorFill('walkable');
  if (action === 'fill-blocked') setFloorEditorFill('blocked');
  if (action === 'zoom-in') stepFloorEditorZoom(1);
  if (action === 'zoom-out') stepFloorEditorZoom(-1);
  if (action === 'undo') floorEditorHistory();
  if (action === 'redo') floorEditorHistory(true);
  if (action === 'reset')
    commitFloorEditor(
      floorEditor.key,
      [...effectiveFloorRows(floorEditor.key)],
      [...FLOORS[floorEditor.key]],
    );
  if (action === 'save-project') saveFloorEditorProject();
  if (action === 'done') {
    closeModal();
  }
});
