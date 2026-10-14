/* The world: activity points, rooms, travel and movement. */

// --- Activity points.
// Points of the room or region the player is in.
// A point marked `after` appears once that quest is done (the post-game Mudik cast).
// worldPeople (terrain.js) caches who stands in the world, keyed by state.quests and
// debugFlags.openAll only. Anything else this reads must join that key, or people would
// stay hidden or shown after it changes (tests/world-crowd-cache.cjs checks the source).
const pointVisible = p => !p.after || has(p.after) || !!debugFlags.openAll;
function spots() {
  let visible = room()
    ? room().points.some(p => p.key === 'exit')
      ? [...room().points]
      : [...room().points, marker('exit', I18N.t('world.exitMarker'), 480, 570)]
    : place()
        .points.filter(p => (p.key !== 'trash' || !state.trash.includes(p.id)) && pointVisible(p))
        .map(p => (p.key === 'trainer' ? { ...p, mark: state.defeated.includes(p.id) ? '✓' : '!' } : p));
  visible = visible.filter(p => p.key !== 'tarsion' || !ownsTarsion());
  if (inGang()) return GANG_POINTS;
  return visible;
}
// Points of any region, for drawing neighbours that are on screen.
function regionPoints(i) {
  return PLACES[i].points
    .filter(p => (p.key !== 'trash' || !state.trash.includes(p.id)) && pointVisible(p))
    .map(p => ({ ...p, regionIndex: i }))
    .filter(p => p.key !== 'tarsion' || !ownsTarsion());
}
function atDaycare() {
  if (leagueState().active) return false;
  // At any Titipan counter, inside or out. Pos RT keeps its counter anywhere in the room.
  return (
    state.room === 'rt' ||
    spots().some(p => p.key === 'daycare' && Math.hypot(p.x - state.x, p.y - state.y) < 75)
  );
}

// --- Rooms.
function enterRoom(key) {
  if (!ROOMS[key] || battle) return;
  // Rooms reached from another room remember it, so the door leads back there.
  if (state.room)
    state.lateParent = {
      room: state.room,
      x: state.x,
      y: state.y,
      returnPosition: state.returnPosition,
      parent: state.lateParent || null,
    };
  sceneReturn = { x: state.x, y: state.y };
  state.returnPosition = sceneReturn;
  state.room = key;
  [state.x, state.y] = ROOMS[key].spawn || [480, 555];
  navigation++;
  held = null;
  closeModal();
  settlePosition();
  update();
  cameraPosition(true);
  if (key === 'pasarsubuh') {
    if (!state.districtVisited?.includes(key)) {
      (state.districtVisited ??= []).push(key);
      save();
      modal(
        `<h2>${ROOMS[key].name}</h2><p>${I18N.t('market.intro')}</p>${closeButton(I18N.t('common.explore'))}`,
        'district-intro',
      );
    }
  }
}
function exitRoom() {
  if (state.room && state.lateParent && ROOMS[state.lateParent.room]) {
    const p = state.lateParent;
    if (p.parent) state.lateParent = p.parent;
    else delete state.lateParent;
    state.room = p.room;
    state.x = p.x;
    state.y = p.y;
    state.returnPosition = p.returnPosition;
    sceneReturn = p.returnPosition;
    recoverFloor();
    navigation++;
    held = null;
    closeModal();
    cameraPosition(true);
    settlePosition();
    update();
    return;
  }
  if (state.room) {
    const p = state.returnPosition || { x: place().spawn[0], y: place().spawn[1] };
    state.room = null;
    state.x = p.x;
    state.y = p.y;
    recoverFloor();
    navigation++;
    closeModal();
    settlePosition();
    update();
  }
  cameraPosition(true);
}

// --- Travel between regions.
async function travel(id) {
  if (battle || locked || !regionAvailable(id)) return false;
  closeModal();
  while (state.room) exitRoom();
  const destinationChapter = chapterOf(id);
  while (destinationChapter !== chapterOf()) {
    const currentChapter = chapterOf();
    const direction = Math.sign(destinationChapter - currentChapter),
      connector = CHAPTER_CONNECTORS.find(
        link => chapterOf(direction > 0 ? link.from : link.to) === currentChapter,
      ),
      source = direction > 0 ? connector?.from : connector?.to;
    if (source === undefined) return false;
    const point = PLACES[source].points.find(
      p => p.key === 'connector' && chapterOf(p.to) === currentChapter + direction,
    );
    if (!WORLD_CHAPTERS[currentChapter].seamless && state.region !== source)
      arriveRegion(source, PLACES[source].spawn);
    await walkWorldTarget(point, source);
    // A connector is one leg of the journey, not the requested destination.
    // A failed walk, cancellation or locked next chapter must stop the journey.
    if (chapterOf() !== currentChapter + direction || battle || locked || held) return false;
    // The arrival story can be read before continuing to the selected map.
    if (modalKind) return false;
  }
  const currentChapter = chapterOf();
  if (id === GANG_GRID_INDEX) {
    const [x, y] = ROOMS.gangsenggol.spawn;
    const path = worldRoute(worldPosition(), { x: GANG_WORLD.x + x, y: GANG_WORLD.y + y });
    return followWorldPath(path);
  }
  if (id === state.region && !inGang()) return true;
  if (!WORLD_CHAPTERS[currentChapter].seamless) {
    arriveRegion(id, PLACES[id].spawn);
    return true;
  }
  const [x, y] = PLACES[id].spawn;
  await walkWorldTarget({ x, y }, id, false);
  return state.region === id;
}
// Ojek Online: a paid ride straight to a region already visited, instead of walking.
const OJEK_FARE = 2000;
function canRideOjek(id) {
  return (
    id !== GANG_GRID_INDEX &&
    regionAvailable(id) &&
    state.visited.includes(id) &&
    (id !== state.region || !!state.room || inGang())
  );
}
function rideOjek(id) {
  if (battle || locked || !canRideOjek(id) || state.money < OJEK_FARE) return false;
  state.money -= OJEK_FARE;
  closeModal(true);
  while (state.room) exitRoom();
  arriveRegion(id, PLACES[id].spawn);
  cameraPosition(true);
  toast(I18N.t('ojek.ride.done', { place: REGIONS[id].name, fare: money(OJEK_FARE) }));
  return true;
}
function arriveRegion(id, coordinates) {
  if (leagueState().active && id !== REGION.LIGA) abandonLeague();
  state.room = null;
  state.region = id;
  [state.x, state.y] = coordinates;
  if (!state.visited.includes(id)) state.visited.push(id);
  resetScene();
  recoverFloor();
  settlePosition();
  update();
  story();
}
function useConnector(point) {
  if (!regionAvailable(point.to)) {
    const objective = nextObjective();
    modal(
      `<h2>${I18N.t('connector.closed.title')}</h2><p>${objective.title}</p><p>${objective.detail}</p>${closeButton(I18N.t('connector.closed.button'))}`,
    );
    return;
  }
  const link = CHAPTER_CONNECTORS.find(
    l => (l.from === state.region && l.to === point.to) || (l.to === state.region && l.from === point.to),
  );
  if (!link) return;
  arriveRegion(point.to, link.from === state.region ? link.entry : link.exit);
}
function nextArea() {
  if (!state.room) {
    mapMenu();
    return;
  }
  if (state.room) exitRoom();
}
// Moves the player to a world coordinate; returns true when that crossed into another region.
function setWorldPosition(x, y) {
  const wasInGang = inGang(),
    previous = state.region;
  const from = worldPosition();
  if (Math.hypot(x - from.x, y - from.y) < 100) faceMovement(x - from.x, y - from.y);
  // Gang uses Sukamaju's save-coordinate origin, including when entered from
  // the forest above it. Border ownership is half-open, like the painted grid.
  let next = gangContains(x, y) ? 0 : previous;
  for (const i of WORLD_CHAPTERS[chapterOf(previous)].order.filter(i => i !== GANG_GRID_INDEX)) {
    const [ox, oy] = worldOrigin(i);
    if (x >= ox && x < ox + 960 && y >= oy && y < oy + 640) {
      next = i;
      break;
    }
  }
  state.region = next;
  state.x = x - worldOrigin()[0];
  state.y = y - worldOrigin()[1];
  const changed = previous !== next;
  if (changed) {
    if (!state.visited.includes(next)) state.visited.push(next);
    update();
    toast(REGIONS[next].name + ', ' + REGIONS[next].subtitle);
  }
  if (previous === 14 && state.region !== REGION.LIGA) abandonLeague();
  const nowInGang = inGang();
  if (!wasInGang && nowInGang && !(state.districtVisited ??= []).includes('gangsenggol')) {
    state.districtVisited.push('gangsenggol');
    save();
    toast(I18N.t('gang.arrive'));
  }
  if (wasInGang !== nowInGang) syncGangLocation();
  roadAmbush();
  return changed;
}

// --- Walking.
function movement(dx, dy) {
  if (!modalKind && !battle && state.team.length) faceMovement(dx, dy);
  if (state.room) {
    if (battle || modalKind || !state.team.length) return;
    const x = state.x + dx,
      y = state.y + dy;
    if (walkable(x, y)) {
      state.x = x;
      state.y = y;
      state.steps++;
    }
    refreshHint();
    return;
  }
  if (busy() || !state.team.length) return;
  const p = worldPosition(),
    x = p.x + dx,
    y = p.y + dy;
  if (worldWalkable(x, y)) {
    setWorldPosition(x, y);
    state.steps++;
  }
  refreshHint();
}
// The hint bar names what E would use from where the player stands. Called after every
// step, typed or walked by a click.
function refreshHint() {
  const near = nearest();
  $('hint').textContent =
    near && Math.hypot(state.x - near.x, state.y - near.y) <= reachOf(near)
      ? reachHintText(near)
      : I18N.t(state.room ? 'hint.room' : 'hint.region');
}
// A path of 10px steps to a point in the current room or region, or null.
function routeTo(x, y) {
  if (!state.room) {
    const origin = [...worldOrigin()],
      path = worldRoute(worldPosition(), { x: x + origin[0], y: y + origin[1] });
    return path?.map(p => ({ x: p.x - origin[0], y: p.y - origin[1] })) || null;
  }
  // Breadth-first search over the room's floor grid.
  const step = 10,
    cols = 97,
    rows = 65,
    idx = (x, y) => y * cols + x;
  function node(px, py) {
    let best = null,
      dist = Infinity;
    for (
      let yy = Math.max(1, Math.floor(py / step) - 3);
      // Below a point the search reaches further: staff behind a counter are served
      // from the floor in front of it.
      yy <= Math.min(rows - 2, Math.ceil(py / step) + 8);
      yy++
    )
      for (
        let xx = Math.max(1, Math.floor(px / step) - 3);
        xx <= Math.min(cols - 2, Math.ceil(px / step) + 3);
        xx++
      ) {
        if (!walkable(xx * step, yy * step)) continue;
        const d = Math.hypot(xx * step - px, yy * step - py);
        if (d < dist) {
          best = [xx, yy];
          dist = d;
        }
      }
    return best;
  }
  const from = node(state.x, state.y),
    to = node(x, y);
  if (!from || !to) return null;
  const start = idx(...from),
    end = idx(...to),
    queue = [start],
    prev = new Map([[start, -1]]);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === end) break;
    const cx = cur % cols,
      cy = Math.floor(cur / cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx,
        ny = cy + dy,
        n = idx(nx, ny);
      if (
        nx < 1 ||
        ny < 1 ||
        nx >= cols - 1 ||
        ny >= rows - 1 ||
        prev.has(n) ||
        !walkable(nx * step, ny * step)
      )
        continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(end)) return null;
  const path = [];
  for (let cur = end; cur !== -1; cur = prev.get(cur))
    path.push({ x: (cur % cols) * step, y: Math.floor(cur / cols) * step });
  return path.reverse();
}
// Walk to an activity point and use it. Characters are approached from a free side.
async function autoWalk(p) {
  if (!state.room) return walkWorldTarget(p);
  if (modalKind || battle || !p) return;
  let path = null;
  if (p.portrait !== undefined) {
    // routeTo ends on the 10px floor grid, so a side is only taken when the cell the walk
    // really ends on is still within reach; otherwise the click would walk up and stop.
    const inReach = route => route && Math.hypot(route.at(-1).x - p.x, route.at(-1).y - p.y) <= reachOf(p),
      candidates = [
        [50, 0],
        [-50, 0],
        [0, 50],
        [0, -50],
        [40, 40],
        [-40, 40],
        [40, -40],
        [-40, -40],
      ]
        .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
        .filter(c => walkable(c.x, c.y))
        .map(c => routeTo(c.x, c.y))
        .filter(inReach)
        .sort((a, b) => a.length - b.length);
    path = candidates[0] || null;
  }
  path ??= routeTo(p.x, p.y);
  if (!path) {
    toast(I18N.t('route.blocked'));
    return;
  }
  const nav = ++navigation;
  for (const pos of path) {
    if (nav !== navigation || battle || modalKind || held) return refreshHint();
    state.x = pos.x;
    state.y = pos.y;
    state.steps++;
    await delay(24);
  }
  refreshHint();
  if (nav === navigation) interact(p);
}
// Walk to a spot on the ground without using anything there.
async function autoWalkGround(dest) {
  if (!state.room) return followWorldPath(worldRoute(worldPosition(), globalPoint(state.region, dest)));
  const path = routeTo(dest.x, dest.y);
  if (!path) return;
  const nav = ++navigation;
  for (const p of path) {
    if (nav !== navigation || battle || modalKind || held) return refreshHint();
    state.x = p.x;
    state.y = p.y;
    await delay(24);
  }
  refreshHint();
}
// Where the lead creature stands: 30px back along the player's recent path,
// or beside the player when there is no path yet.
function followingMon() {
  return state.team.find(m => m.hp > 0) || null;
}
function trackFollower() {
  if (!followingMon()) {
    followerTrail = [];
    followerPosition = null;
    return null;
  }
  const trailed = followerOnTrail();
  if (trailed) return trailed;
  const origin = state.room ? [0, 0] : worldOrigin();
  for (const [dx, dy] of [
    [-20, 0],
    [20, 0],
    [0, 20],
    [0, -20],
  ])
    if (walkable(state.x + dx, state.y + dy)) {
      followerTrail = [
        { x: state.x + origin[0] + dx * 1.6, y: state.y + origin[1] + dy * 1.6 },
        { x: state.x + origin[0], y: state.y + origin[1] },
      ];
      return { x: state.x + dx, y: state.y + dy };
    }
  return { x: state.x - 12, y: state.y + 8 };
}
function followerOnTrail() {
  const mon = followingMon();
  if (!mon) return null;
  const scene = (state.room ? state.region + ':' + state.room : 'world') + ':' + mon.id,
    p = state.room ? { x: state.x, y: state.y } : worldPosition(),
    last = followerTrail.at(-1);
  if (scene !== followerScene || !last || Math.hypot(last.x - p.x, last.y - p.y) > 100) {
    followerScene = scene;
    followerTrail = [p];
    followerPosition = null;
    return null;
  }
  if (Math.hypot(last.x - p.x, last.y - p.y) >= 3) followerTrail.push(p);
  let length = 0;
  for (let i = followerTrail.length - 1; i > 0; i--) {
    const a = followerTrail[i],
      b = followerTrail[i - 1],
      d = Math.hypot(a.x - b.x, a.y - b.y);
    if (length + d >= 30) {
      const f = (30 - length) / d,
        origin = state.room ? [0, 0] : worldOrigin();
      followerPosition = { x: a.x + (b.x - a.x) * f - origin[0], y: a.y + (b.y - a.y) * f - origin[1] };
      if (i > 1) followerTrail.splice(0, i - 1);
      return followerPosition;
    }
    length += d;
  }
  return null;
}
// "Ke tujuan": travel, enter the right room and walk to the next objective.
async function guideObjective() {
  if (battle || locked || modalKind === 'starter') return;
  closeModal();
  const o = nextObjective();
  if (state.region !== o.region) {
    const arrived = await travel(o.region);
    if (!arrived || modalKind) return;
  }
  if (state.room !== o.room) {
    if (state.room) exitRoom();
    if (o.room) {
      const door = spots().find(p => p.room === o.room);
      if (!door) {
        toast(I18N.t('route.noTarget'));
        return;
      }
      await autoWalk(door);
      if (modalKind || state.room !== o.room) return;
    }
  }
  const p = objectiveTarget(o);
  if (p) await autoWalk(p);
}
