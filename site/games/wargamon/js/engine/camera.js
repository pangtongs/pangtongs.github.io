/* The camera, clicks on the map, recovery onto the floor and the nearest point. */

// Camera coordinates are world units. A map spans 2.56 camera views, not one static page.
let camera = { x: 0, y: 0, width: 600, height: 400, scene: null };
// The view follows world position, never the current region or an entrance.
// Neighboring paintings are visible before crossing. Only empty world cells
// limit the view, so a map change cannot hide or reveal a neighbor suddenly.
function continuousWorldCamera(x, y) {
  const chapter = WORLD_CHAPTERS[chapterOf()],
    [col, row] = chapter.cell,
    origin = chapter.seamless ? [col * 960, row * 640] : worldOrigin(),
    width = chapter.seamless ? 1920 : 960,
    height = chapter.seamless ? 1280 : 640;
  return {
    x: Math.max(origin[0], Math.min(origin[0] + width - camera.width, x)),
    y: Math.max(origin[1], Math.min(origin[1] + height - camera.height, y)),
  };
}
function cameraPosition(snap = false) {
  const p = state.room ? { x: state.x, y: state.y } : worldPosition(),
    scene = state.room ? state.region + ':' + state.room : 'world:' + chapterOf();
  let x = p.x - camera.width / 2,
    y = p.y - camera.height * 0.56;
  if (state.room) {
    x = Math.max(0, Math.min(960 - camera.width, x));
    y = Math.max(0, Math.min(640 - camera.height, y));
  } else ({ x, y } = continuousWorldCamera(x, y));
  if (snap || camera.scene !== scene || Math.hypot(camera.x - x, camera.y - y) > 250) {
    camera.x = x;
    camera.y = y;
  } else {
    camera.x += (x - camera.x) * 0.25;
    camera.y += (y - camera.y) * 0.25;
  }
  if (!state.room) Object.assign(camera, continuousWorldCamera(camera.x, camera.y));
  camera.scene = scene;
  return camera;
}
function canvasToWorld(clientX, clientY, box = canvas.getBoundingClientRect()) {
  return {
    x: camera.x + ((clientX - box.left) / box.width) * camera.width,
    y: camera.y + ((clientY - box.top) / box.height) * camera.height,
  };
}
function mapClick(e) {
  if (modalKind || battle || locked) return;
  const point = canvasToWorld(e.clientX, e.clientY);
  if (state.room) {
    const p = findHitPoint(spots(), point);
    if (p) autoWalk(p);
    else if (walkable(point.x, point.y)) autoWalkGround(point);
    return;
  }
  for (const i of visibleRegionIndices().filter(regionAvailable)) {
    const [ox, oy] = worldOrigin(i),
      local = { x: point.x - ox, y: point.y - oy };
    const p = findHitPoint(regionPoints(i), local);
    if (p) {
      walkWorldTarget(p, i);
      return;
    }
  }
  if (worldWalkable(point.x, point.y)) followWorldPath(worldRoute(worldPosition(), point));
  else toast('Ikuti jalan. Jalur antarwilayah terbuka setelah tujuan selesai.');
}
function insideRect(x, y, r) {
  return x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3];
}
// A player saved on furniture moves to the nearest floor; room and progress are kept.
function recoverFloor() {
  if (!state.room) {
    // Keep old local save positions when usable; recover positions on replaced
    // buildings or the former connecting roads without changing game progress.
    if (walkable(state.x, state.y)) return;
    const gang = inGang(),
      cells = floorCells(gang ? 'gang' : state.region)
        .map(([x, y]) => (gang ? [GANG_WORLD.x + x, GANG_WORLD.y + y] : [x, y]))
        .filter(([x, y]) => walkable(x, y));
    cells.sort(
      (a, b) => Math.hypot(a[0] - state.x, a[1] - state.y) - Math.hypot(b[0] - state.x, b[1] - state.y),
    );
    if (cells.length) [state.x, state.y] = cells[0];
    followerTrail = [];
    cameraPosition(true);
    return;
  }
  if (walkable(state.x, state.y)) return;
  // A floor edit can block both the player's position and the room's old spawn.
  // Recover to the nearest usable cell in this room without moving to an exterior.
  const cells = [];
  for (let y = 0; y <= 640; y += 10)
    for (let x = 0; x <= 960; x += 10) if (walkable(x, y)) cells.push([x, y]);
  cells.sort(
    (a, b) => Math.hypot(a[0] - state.x, a[1] - state.y) - Math.hypot(b[0] - state.x, b[1] - state.y),
  );
  if (cells.length) [state.x, state.y] = cells[0];
  followerTrail = [];
  cameraPosition(true);
}
function resetScene() {
  navigation++;
  held = null;
  followerTrail = [];
  followerPosition = null;
  followerMotion.last = null;
  heroMotion.last = null;
  camera.scene = null;
  cameraPosition(true);
}
// Choose an actually reachable approach, then interact without landing on a character.
async function walkWorldTarget(p, i = state.region, activate = true) {
  if (modalKind || battle || locked || !p) return;
  const target = globalPoint(i, p),
    start = worldPosition(),
    candidates = [];
  // Tarsion is a solid world creature and needs the same approach as a resident.
  if (p.portrait !== undefined || p.key === 'tarsion') {
    for (const r of [35, 45, 55])
      for (let n = 0; n < 8; n++)
        candidates.push({
          x: target.x + Math.cos((n * Math.PI) / 4) * r,
          y: target.y + Math.sin((n * Math.PI) / 4) * r,
        });
  } else candidates.push(target);
  candidates.sort(
    (a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y),
  );
  let path = null;
  for (const dest of candidates) {
    if (!worldWalkable(dest.x, dest.y)) continue;
    const trial = worldRoute(start, dest);
    if (trial && Math.hypot(trial.at(-1).x - target.x, trial.at(-1).y - target.y) < 66) {
      path = trial;
      break;
    }
  }
  if (!path) {
    toast('Jalur belum terbuka. Gunakan Ke tujuan untuk petunjuk.');
    return;
  }
  if (await followWorldPath(path)) {
    if (activate && state.region === i) interact(p);
    update();
  }
}
// Every cell reachable from `start` in 10px steps that passes `test`.
function nearestConnectedFloor(test, start) {
  const queue = [start],
    seen = new Set(),
    out = [];
  for (let k = 0; k < queue.length; k++) {
    const p = queue[k],
      key = p.join(',');
    if (seen.has(key) || !test(...p)) continue;
    seen.add(key);
    out.push(p);
    for (const [dx, dy] of [
      [10, 0],
      [-10, 0],
      [0, 10],
      [0, -10],
    ]) {
      const x = p[0] + dx,
        y = p[1] + dy;
      if (x >= 20 && x <= 940 && y >= 20 && y <= 620 && !seen.has(x + ',' + y)) queue.push([x, y]);
    }
  }
  return out;
}
let hoveredPlace = null;
function objectHit(p, pos) {
  return (
    pos.x >= p.x - 32 && pos.x <= p.x + 32 && pos.y >= p.y - (p.key === 'door' ? 70 : 45) && pos.y <= p.y + 14
  );
}
// One deterministic nearby target. Hover may inspect another, but E always matches its hint.
function nearest() {
  return (
    spots()
      .filter(p => p.labelMode !== 'passage')
      .sort(
        (a, b) =>
          Math.hypot(state.x - a.x, state.y - a.y) - Math.hypot(state.x - b.x, state.y - b.y) ||
          pointIdentity(a).localeCompare(pointIdentity(b)),
      )[0] || null
  );
}
function showPlaceLabel(p) {
  const active = nearest();
  if (hoveredPlace) return hoveredPlace === pointIdentity(p);
  return (
    active &&
    Math.hypot(active.x - state.x, active.y - state.y) <= 100 &&
    pointIdentity(active) === pointIdentity(p)
  );
}
// spots() returns trainer copies; identity must not depend on object reference equality.
function pointIdentity(p) {
  let r = p.regionIndex;
  if (r === undefined)
    r = PLACES.findIndex(place =>
      place.points.some(
        q => q.key === p.key && q.id === p.id && q.room === p.room && q.x === p.x && q.y === p.y,
      ),
    );
  return [state.room || (r < 0 ? state.region : r), p.key, p.id ?? p.room ?? '', p.x, p.y].join(':');
}
