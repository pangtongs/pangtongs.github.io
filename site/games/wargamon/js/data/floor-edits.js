/* Browser-authored floor grids. Editing is debug-only; saved floors also apply in normal play. */
const FLOOR_EDITS_KEY = 'wargamon-floor-edits-v1';
const FLOOR_EDIT_COLS = 97,
  FLOOR_EDIT_ROWS = 65,
  FLOOR_EDIT_STEP = 10;
// Old browser grids belong to the former paintings, even though their URLs match.
const FLOOR_ART_REVISIONS = {
  7: 'world-floor-review-2026-10-10',
  12: 'world-floor-review-2026-10-10',
  13: 'world-floor-review-2026-10-10',
  14: 'placement-review-2026-10-10',
  6: 'world-floor-review-2026-10-10',
  8: 'world-floor-review-2026-10-10',
  10: 'world-floor-review-2026-10-10',
  11: 'world-floor-review-2026-10-10',
  3: 'world-floor-review-2026-10-10',
  4: 'world-floor-review-2026-10-10',
  5: 'placement-review-2026-10-10',
  9: 'world-floor-review-2026-10-10',
};
function floorEditScene(key) {
  if (key === 'gang') return ROOMS.gangsenggol;
  if (/^\d+$/.test(key)) return PLACES[Number(key)];
  return key !== 'gangsenggol' && Object.hasOwn(ROOMS, key) && FLOORS[key] ? ROOMS[key] : undefined;
}
function floorEditImage(key) {
  const scene = floorEditScene(key);
  return scene ? scene.image || 'img/maps/interior/interiors.webp' : undefined;
}
function currentFloorEditKey() {
  return state.room
    ? state.room === 'gangsenggol'
      ? 'gang'
      : state.room
    : inGang()
      ? 'gang'
      : String(state.region);
}
function validateFloorEdits(data) {
  if (!data || data.version !== 1 || !data.maps || typeof data.maps !== 'object' || Array.isArray(data.maps))
    throw new Error('Invalid floor archive');
  const maps = {};
  for (const [key, value] of Object.entries(data.maps)) {
    const revision = FLOOR_ART_REVISIONS[key];
    if (revision && value?.revision !== revision) continue;
    if (
      !floorEditImage(key) ||
      value?.image !== floorEditImage(key) ||
      !Array.isArray(value.rows) ||
      value.rows.length !== FLOOR_EDIT_ROWS ||
      value.rows.some(
        row => typeof row !== 'string' || row.length !== FLOOR_EDIT_COLS || !/^[#.]+$/.test(row),
      )
    )
      throw new Error('Invalid floor grid: ' + key);
    maps[key] = { image: value.image, rows: [...value.rows], ...(revision ? { revision } : {}) };
  }
  return maps;
}
let floorEdits = {};
try {
  const saved = localStorage.getItem(FLOOR_EDITS_KEY);
  if (saved) floorEdits = validateFloorEdits(JSON.parse(saved));
} catch {}
function effectiveFloorRows(key) {
  return floorEdits[key]?.rows || FLOORS[key];
}
function effectiveFloorAt(key, x, y) {
  return (
    effectiveFloorRows(key)?.[Math.round(y / FLOOR_EDIT_STEP)]?.[Math.round(x / FLOOR_EDIT_STEP)] === '#'
  );
}
function floorEditArchive() {
  return { version: 1, cellSize: FLOOR_EDIT_STEP, width: 960, height: 640, maps: floorEdits };
}
function persistFloorEdits() {
  floorCellCache.clear();
  navigation++;
  held = null;
  try {
    localStorage.setItem(FLOOR_EDITS_KEY, JSON.stringify(floorEditArchive()));
    return true;
  } catch {
    return false;
  }
}
function setEditedFloor(key, rows) {
  if (!DEBUG) return false;
  const revision = FLOOR_ART_REVISIONS[key],
    grid = { image: floorEditImage(key), rows, ...(revision ? { revision } : {}) };
  validateFloorEdits({ version: 1, maps: { [key]: grid } });
  if (rows.every((row, i) => row === FLOORS[key][i])) delete floorEdits[key];
  else floorEdits[key] = { ...grid, rows: [...rows] };
  return persistFloorEdits();
}
