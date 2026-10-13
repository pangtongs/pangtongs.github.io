/* Exterior and interior floor editor, available through DEBUG → Edit area jalan. */
const floorEditor = {
  key: '0',
  undo: [],
  redo: [],
  stroke: null,
  selection: null,
  saved: true,
  tool: 'rectangle',
  fill: 'walkable',
  size: 5,
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
function floorEditorPaintBrush(stroke, cell) {
  const radius = Math.floor(stroke.size / 2);
  floorEditorPaintBlock(
    stroke.rows,
    [cell[0] - radius, cell[1] - radius],
    [cell[0] + radius, cell[1] + radius],
    stroke.open,
  );
}
function startFloorStroke(cell, pointer) {
  const rows = [...effectiveFloorRows(floorEditor.key)];
  floorEditor.selection = null;
  floorEditor.stroke = {
    key: floorEditor.key,
    before: [...rows],
    rows,
    start: cell,
    last: cell,
    tool: floorEditor.tool,
    size: floorEditor.size,
    open: floorEditor.fill === 'walkable',
    pointer,
  };
  moveFloorStroke(cell);
}
function moveFloorStroke(cell) {
  const stroke = floorEditor.stroke;
  if (!stroke) return;
  if (stroke.tool === 'rectangle') {
    // Rebuild the preview from the original floor, so shrinking a selection leaves no paint behind.
    stroke.rows = [...stroke.before];
    floorEditorPaintBlock(stroke.rows, stroke.start, cell, stroke.open);
  } else {
    const [ax, ay] = stroke.last,
      [bx, by] = cell,
      steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let n = 0; n <= steps; n++)
      floorEditorPaintBrush(stroke, [
        Math.round(ax + ((bx - ax) * n) / (steps || 1)),
        Math.round(ay + ((by - ay) * n) / (steps || 1)),
      ]);
  }
  stroke.last = cell;
  paintFloorEditor();
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
  rows.forEach((line, row) => {
    for (let col = 0; col < 97; col++) {
      c.fillStyle = line[col] === '#' ? '#35e06ab0' : '#8896aaa0';
      c.fillRect(col * 10 - 3, row * 10 - 3, 6, 6);
    }
  });
  const selection =
    floorEditor.stroke?.tool === 'rectangle'
      ? floorEditor.stroke
      : floorEditor.selection?.key === floorEditor.key
        ? floorEditor.selection
        : null;
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
  $('floorEditorStatus').textContent = floorEditorText(status);
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
  if (stroke.tool === 'rectangle')
    floorEditor.selection = {
      key: stroke.key,
      start: [...stroke.start],
      last: [...stroke.last],
      open: stroke.open,
    };
  commitFloorEditor(stroke.key, stroke.before, stroke.rows);
  paintFloorEditor();
}
function fillFloorEditorSelection(fill) {
  finishFloorStroke();
  floorEditor.fill = fill;
  $('floorEditorFill').value = fill;
  const selection = floorEditor.selection;
  if (selection?.key === floorEditor.key) {
    const before = [...effectiveFloorRows(floorEditor.key)],
      after = [...before];
    selection.open = fill === 'walkable';
    floorEditorPaintBlock(after, selection.start, selection.last, selection.open);
    commitFloorEditor(floorEditor.key, before, after);
  }
  paintFloorEditor();
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
function exportFloorEditor() {
  finishFloorStroke();
  const archive = JSON.parse(JSON.stringify(floorEditArchive()));
  // Always include the selected map, even when it still matches the generated floor.
  archive.maps[floorEditor.key] ??= {
    image: floorEditImage(floorEditor.key),
    rows: [...effectiveFloorRows(floorEditor.key)],
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'wargamon-area-jalan.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importFloorEditor(text) {
  if (!DEBUG) return false;
  const maps = validateFloorEdits(JSON.parse(text));
  finishFloorStroke();
  for (const [key, value] of Object.entries(maps)) {
    const before = [...effectiveFloorRows(key)];
    commitFloorEditor(key, before, value.rows);
  }
  return true;
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
function openFloorEditor() {
  if (!DEBUG || battle || locked) return;
  resetScene();
  floorEditor.key = currentFloorEditKey();
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
    `<div class="floor-editor"><h2>${floorEditorText('title')}</h2>
    <p>${floorEditorText('help')}</p><div class="floor-editor-tools">
    <select id="floorEditorMap" aria-label="${floorEditorText('map')}">${options}</select>
    <button id="floorEditorUndo" data-floor-edit="undo">${floorEditorText('undo')}</button>
    <button id="floorEditorRedo" data-floor-edit="redo">${floorEditorText('redo')}</button>
    <button data-floor-edit="reset">${floorEditorText('reset')}</button>
    <details class="floor-editor-backup"><summary>${floorEditorText('backup')}</summary>
    <button data-floor-edit="export">${floorEditorText('export')}</button>
    <button data-floor-edit="import">${floorEditorText('import')}</button></details>
    <input id="floorEditorImport" type="file" accept="application/json,.json" hidden>
    </div><div class="floor-editor-tools floor-editor-paint-tools">
    <label>${floorEditorText('tool')} <select id="floorEditorTool">
    <option value="rectangle"${floorEditor.tool === 'rectangle' ? ' selected' : ''}>${floorEditorText('rectangle')}</option>
    <option value="brush"${floorEditor.tool === 'brush' ? ' selected' : ''}>${floorEditorText('brush')}</option></select></label>
    <label>${floorEditorText('fill')} <select id="floorEditorFill">
    <option value="blocked"${floorEditor.fill === 'blocked' ? ' selected' : ''}>${floorEditorText('blocked')}</option>
    <option value="walkable"${floorEditor.fill === 'walkable' ? ' selected' : ''}>${floorEditorText('walkable')}</option>
    </select></label>
    <label id="floorEditorSizeLabel"${floorEditor.tool === 'rectangle' ? ' hidden' : ''}>${floorEditorText('size')}
    <select id="floorEditorSize">${[1, 3, 5, 9, 15].map(size => `<option value="${size}"${size === floorEditor.size ? ' selected' : ''}>${size} × ${size}</option>`).join('')}</select></label>
    <button id="floorEditorGreen" class="floor-editor-green" data-floor-edit="fill-walkable" aria-pressed="${floorEditor.fill === 'walkable'}">${floorEditorText('allGreen')}</button>
    <button id="floorEditorBlocked" data-floor-edit="fill-blocked" aria-pressed="${floorEditor.fill === 'blocked'}">${floorEditorText('allBlocked')}</button>
    </div><canvas id="floorEditorCanvas" width="960" height="640" aria-label="${floorEditorText('canvas')}"></canvas>
    <p id="floorEditorStatus" role="status"></p></div>`,
    'floor-editor',
    `<button id="floorEditorSave" data-floor-edit="save-project" disabled>${floorEditorText('saveProject')}</button>
    <button data-floor-edit="done">${floorEditorText('done')}</button>`,
  );
  $('floorEditorMap').addEventListener('change', event => {
    finishFloorStroke();
    floorEditor.key = event.target.value;
    floorEditor.selection = null;
    loadFloorEditorImage();
  });
  $('floorEditorTool').addEventListener('change', event => {
    finishFloorStroke();
    floorEditor.tool = event.target.value;
    floorEditor.selection = null;
    $('floorEditorSizeLabel').hidden = floorEditor.tool !== 'brush';
  });
  $('floorEditorFill').addEventListener('change', event => {
    finishFloorStroke();
    floorEditor.fill = event.target.value;
    paintFloorEditor();
  });
  $('floorEditorSize').addEventListener('change', event => {
    finishFloorStroke();
    floorEditor.size = Number(event.target.value);
  });
  $('floorEditorImport').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      importFloorEditor(await file.text());
      paintFloorEditor();
    } catch {
      toast(floorEditorText('invalid'));
    }
    event.target.value = '';
  });
  const surface = $('floorEditorCanvas');
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const cell = floorEditorCell(event.clientX, event.clientY, surface.getBoundingClientRect());
    if (!cell) return;
    event.preventDefault();
    // A fresh press also recovers a previous gesture whose release was missed.
    finishFloorStroke();
    startFloorStroke(cell, event.pointerId);
    try {
      surface.setPointerCapture(event.pointerId);
    } catch {
      // Document listeners still finish a drag when capture is unavailable.
    }
  });
  surface.addEventListener('lostpointercapture', event => {
    if (modalKind === 'floor-editor' && floorEditor.stroke?.pointer === event.pointerId) finishFloorStroke();
  });
  loadFloorEditorImage();
  connectFloorEditor();
}
// Subscribe once: releases outside the canvas must not strand a stroke, and reopening
// the editor must not accumulate handlers for its old canvases.
document.addEventListener('pointermove', event => {
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
  if (modalKind !== 'floor-editor' || floorEditor.stroke?.pointer !== event.pointerId) return;
  moveFloorStroke(
    floorEditorCell(event.clientX, event.clientY, $('floorEditorCanvas').getBoundingClientRect(), true),
  );
  finishFloorStroke();
});
document.addEventListener('pointercancel', event => {
  if (modalKind === 'floor-editor' && floorEditor.stroke?.pointer === event.pointerId) cancelFloorStroke();
});
onClick(event => {
  if (!DEBUG || modalKind !== 'floor-editor') return;
  const action = event.target.closest('[data-floor-edit]')?.dataset.floorEdit;
  if (action === 'fill-walkable') fillFloorEditorSelection('walkable');
  if (action === 'fill-blocked') fillFloorEditorSelection('blocked');
  if (action === 'undo') floorEditorHistory();
  if (action === 'redo') floorEditorHistory(true);
  if (action === 'reset')
    commitFloorEditor(
      floorEditor.key,
      [...effectiveFloorRows(floorEditor.key)],
      [...FLOORS[floorEditor.key]],
    );
  if (action === 'export') exportFloorEditor();
  if (action === 'import') $('floorEditorImport').click();
  if (action === 'save-project') saveFloorEditorProject();
  if (action === 'done') {
    closeModal();
  }
});
