/* Where the hero can stand: painted floors, solid people, world coordinates and routes
   between regions. Coordinates are local to one region (960 x 640) or one room unless
   a function says world. */

// --- Floors. Coordinates are local to one region (960 x 640) or one room.
function localTerrain(i, x, y) {
  // Travel openings are traced in the painting too. A connecting road must never
  // turn a building, tree or pond into floor merely because it is near an edge.
  if (x < 0 || y < 0 || x > 960 || y > 640) return false;
  // In Menuju Liga the paintings share scenery at several edges, but only measured
  // public openings connect them. Pusat Kota is painted as one town: wherever the floor
  // continues across a seam, the hero walks across it.
  if (chapterOf(i) === 3 && (x < 8 || x > 952 || y < 8 || y > 632)) {
    const [ox, oy] = worldOrigin(i);
    // The hero is 16px wide: an opening admits the body, not just the centre of the feet,
    // so the painted floor beside the opening's centre line counts too.
    if (
      !WORLD_LINKS.some(link => (link.from === i || link.to === i) && linkContains(link, ox + x, oy + y, 10))
    )
      return false;
  }
  return effectiveFloorAt(i, x, y);
}
// Every room's floor is traced over its painting in art/floors.json; see js/data/floors.js.
function roomFloor(key, x, y) {
  return effectiveFloorAt(key === 'gangsenggol' ? 'gang' : key, x, y);
}
// Normal characters occupy the ground around their feet. Their heads do not
// close the road behind them; drawing order handles walking behind a person.
// Tall sprites and counters retain their larger occupied space. A player saved
// inside a footprint can still step out of it.
const PERSON_BOX = { half: 15, up: 12, down: 8 };
function personHeight(p = {}) {
  if (p.worldSprite) return p.worldSpriteHeight;
  if (p.key === 'tarsion') return 68;
  // The Wargamaret staff art is drawn at shop scale indoors and at street scale outside.
  if (p.portrait === 90 || p.portrait === 91) return state.room ? 51 : 38;
  if (Object.hasOwn(SERVICE_PORTRAITS, p.portrait)) return state.room ? 50 : 40;
  if (RESIDENTS[p.portrait]) return state.room ? 47 : 35;
  if (castCells.has(p.portrait)) return state.room ? 47 : 37;
  return state.room ? 48 : 38;
}
// No footprint is wider than a counter (34px to each side) or reaches below the feet.
const PERSON_REACH = 34;
function insidePerson(p, x, y) {
  // Walking and route finding ask about every person for every step; most are far away.
  if (x - p.x >= PERSON_REACH || p.x - x >= PERSON_REACH || y >= p.y + PERSON_BOX.down) return false;
  const counter = p.stall && p.stall !== 'painted',
    height = personHeight(p),
    tall = p.tall || height > (state.room ? 52 : 42),
    up = counter || tall ? height : PERSON_BOX.up;
  return Math.abs(x - p.x) < (counter ? 34 : PERSON_BOX.half) && y > p.y - up && y < p.y + PERSON_BOX.down;
}
const people = points => points.filter(p => p.portrait !== undefined);
// A long list of people (the whole world's) is grouped once into columns twice as wide as
// the widest footprint reaches, so a question about one point looks only at the two
// columns that can touch it. Route finding asks this for every cell.
const crowdColumns = new WeakMap();
function nearbyPeople(feet, x) {
  if (feet.length < 32) return feet;
  let columns = crowdColumns.get(feet);
  if (!columns) {
    columns = new Map();
    for (const p of feet) {
      const c = Math.floor(p.x / (2 * PERSON_REACH));
      if (!columns.has(c)) columns.set(c, []);
      columns.get(c).push(p);
    }
    crowdColumns.set(feet, columns);
  }
  // insidePerson needs |x - p.x| < PERSON_REACH: the point's column and the nearer neighbour.
  const c = Math.floor(x / (2 * PERSON_REACH)),
    side = x - c * 2 * PERSON_REACH < PERSON_REACH ? c - 1 : c + 1;
  return [...(columns.get(c) || []), ...(columns.get(side) || [])];
}
function personBlocks(feet, x, y, from) {
  return nearbyPeople(feet, x).some(p => insidePerson(p, x, y) && !insidePerson(p, from.x, from.y));
}
let worldPeopleCache = null;
// Tarsion stands in the observatory courtyard as solid as a person until it joins the
// team. Owning it is checked at most a few times a second; walking asks constantly.
const tarsionHere = { at: -Infinity, here: false };
// Who stands in the world changes only with progress: a quest done (people marked
// `after`), the debug open-all switch, Tarsion joining the team. The list is kept until
// one of those changes, so walking and route finding get the same array (and its
// columns, see nearbyPeople) every time. This relies on pointVisible (world.js) reading
// nothing but `after`, the quests and openAll; a new visibility rule must join the key.
const worldCrowd = { list: null, quests: null, done: -1, openAll: null, tarsion: null, gang: null };
function worldPeople() {
  worldPeopleCache ??= PLACES.flatMap((place, i) =>
    people(place.points).map(p => ({ ...p, ...globalPoint(i, p) })),
  );
  const now = Date.now();
  if (now - tarsionHere.at > 250) {
    tarsionHere.at = now;
    tarsionHere.here = typeof ownsTarsion === 'function' && !ownsTarsion();
  }
  const openAll = typeof debugFlags === 'object' && !!debugFlags.openAll,
    gang = typeof GANG_POINTS !== 'undefined';
  if (
    worldCrowd.list &&
    worldCrowd.quests === state.quests &&
    worldCrowd.done === state.quests.length &&
    worldCrowd.openAll === openAll &&
    worldCrowd.tarsion === tarsionHere.here &&
    worldCrowd.gang === gang
  )
    return worldCrowd.list;
  const extra = gang ? people(GANG_POINTS) : [];
  if (tarsionHere.here) {
    const p = PLACES[REGION.OBSERVATORIUM].points.find(p => p.key === 'tarsion');
    extra.push({ ...p, ...globalPoint(13, p) });
  }
  const present = worldPeopleCache.some(p => p.after)
    ? worldPeopleCache.filter(p => typeof pointVisible !== 'function' || pointVisible(p))
    : worldPeopleCache;
  Object.assign(worldCrowd, {
    list: extra.length ? [...present, ...extra] : present,
    quests: state.quests,
    done: state.quests.length,
    openAll,
    tarsion: tarsionHere.here,
    gang,
  });
  return worldCrowd.list;
}
// Inside, the hero's body must fit: half a body to each side and a little room in
// front, so the feet never reach the very edge of a counter, shelf or wall.
const debugWalkAll = () => DEBUG && debugFlags.walkAll;
function roomWalkable(key, x, y) {
  if (debugWalkAll()) return !!ROOMS[key] && x >= 0 && x < 960 && y >= 0 && y < 640;
  return (
    roomFloor(key, x, y) && roomFloor(key, x - 8, y) && roomFloor(key, x + 8, y) && roomFloor(key, x, y - 4)
  );
}
function walkable(x, y) {
  if (state.room)
    return (
      roomWalkable(state.room, x, y) &&
      (debugWalkAll() || !personBlocks(people(room().points), x, y, { x: state.x, y: state.y }))
    );
  return worldWalkable(x + worldOrigin()[0], y + worldOrigin()[1]);
}
// World coordinates: every unlocked region, the roads between them and the alley.
// `crowd` lets a caller asking about many cells at once gather worldPeople() once.
function worldWalkable(x, y, crowd = null) {
  if (debugWalkAll()) return groundWalkable(x, y);
  if (freeWalkAt(x, y)) return true;
  if (personBlocks(crowd || worldPeople(), x, y, worldPosition())) return false;
  return groundWalkable(x, y);
}
function gangContains(x, y) {
  return x >= GANG_WORLD.x && x < GANG_WORLD.x + 960 && y >= GANG_WORLD.y && y < GANG_WORLD.y + 640;
}
// Fully open scenes keep every painted pixel and shared border accessible;
// Scenery and residents stay open on scenes explicitly configured for free walking.
function freeWalkAt(x, y) {
  if (chapterOf() !== 0) return false;
  if (gangContains(x, y))
    return FREE_WALK_MAPS.has('gang') && effectiveFloorAt('gang', x - GANG_WORLD.x, y - GANG_WORLD.y);
  return WORLD_ORIGINS.some(
    ([ox, oy], i) =>
      FREE_WALK_MAPS.has(i) &&
      x >= ox &&
      x < ox + 960 &&
      y >= oy &&
      y < oy + 640 &&
      effectiveFloorAt(i, x - ox, y - oy),
  );
}
function groundWalkable(x, y) {
  if (freeWalkAt(x, y)) return true;
  const chapter = WORLD_CHAPTERS[chapterOf()],
    maps = chapter.seamless ? chapter.order : [state.region];
  if (chapterOf() === 0 && gangContains(x, y))
    return debugWalkAll() || effectiveFloorAt('gang', x - GANG_WORLD.x, y - GANG_WORLD.y);
  for (const i of maps.filter(i => i !== GANG_GRID_INDEX)) {
    const [ox, oy] = worldOrigin(i),
      lx = x - ox,
      ly = y - oy;
    if (lx >= 0 && lx < 960 && ly >= 0 && ly < 640) {
      if (!regionAvailable(i)) return false;
      if (debugWalkAll()) return true;
      if (![1, 2, 3].includes(chapterOf(i))) return localTerrain(i, lx, ly);
      // Reviewed chapter paths must fit the hero, including across a seam.
      return [
        [x, y],
        [x - 8, y],
        [x + 8, y],
        [x, y - 4],
      ].every(([px, py]) =>
        maps.some(j => {
          const [jx, jy] = worldOrigin(j),
            sx = px - jx,
            sy = py - jy;
          return sx >= 0 && sx < 960 && sy >= 0 && sy < 640 && localTerrain(j, sx, sy);
        }),
      );
    }
  }
  return false;
}
// Walkable cells of a region that connect to its spawn. Used to bring a player
// who was saved on ground that is now solid back onto the map.
const floorCellCache = new Map();
function floorCells(i) {
  if (!floorCellCache.has(i))
    floorCellCache.set(
      i,
      nearestConnectedFloor(
        (x, y) => (i === 'gang' ? roomFloor('gangsenggol', x, y) : localTerrain(i, x, y)),
        (i === 'gang' ? ROOMS.gangsenggol.spawn : PLACES[i].spawn).map(n => Math.round(n / 10) * 10),
      ),
    );
  return floorCellCache.get(i);
}

/* One continuous outdoor world. Saved positions stay local to their region for compatibility. */
// Region origins and facing travel openings are paired in data/map-geometry.js.
const worldOrigin = (i = state.region) => WORLD_ORIGINS[i];
const worldPosition = () => ({ x: state.x + worldOrigin()[0], y: state.y + worldOrigin()[1] });
const globalPoint = (i, p) => ({ x: p.x + worldOrigin(i)[0], y: p.y + worldOrigin(i)[1] });
const segmentDistance = (x, y, a, b, c, d) => {
  const den = (c - a) ** 2 + (d - b) ** 2,
    t = den ? Math.max(0, Math.min(1, ((x - a) * (c - a) + (y - b) * (d - b)) / den)) : 0;
  return Math.hypot(x - a - t * (c - a), y - b - t * (d - b));
};
function linkContains(link, x, y, slack = 0) {
  return link.points
    .slice(1)
    .some(
      (p, i) => segmentDistance(x, y, ...link.points[i], ...p) <= (link.width ? link.width / 2 : 27) + slack,
    );
}
// A* on the same collision surface the camera displays, including all opened connecting paths.
// Cells are 10px. One call owns a grid over the chapter's paintings: walkability is
// asked once per cell, and a breadth-first fill from the goal runs alongside the search,
// so an unreachable goal is known once the smaller of the two areas is used up.
function worldRoute(start, goal) {
  // Do not snap a destination in another chapter back onto this chapter's edge.
  // Sparse paintings now have clear grass there, so proximity is insufficient.
  const chapter = WORLD_CHAPTERS[chapterOf()],
    maps = chapter.seamless ? chapter.order : [state.region],
    ownsPoint = p =>
      maps.some(i => {
        const [x, y] = WORLD_PAINT_ORIGINS[i];
        return p.x >= x && p.x < x + 960 && p.y >= y && p.y < y + 640;
      });
  if (!ownsPoint(start) || !ownsPoint(goal)) return null;
  const step = 10;
  // Everything worldWalkable can accept lies inside these paintings (see groundWalkable
  // and freeWalkAt); a cell outside the grid is solid.
  const areas = [];
  for (const i of maps)
    for (const origin of [WORLD_PAINT_ORIGINS[i], WORLD_ORIGINS[i]]) if (origin) areas.push(origin);
  if (chapterOf() === 0) {
    areas.push([GANG_WORLD.x, GANG_WORLD.y]);
    for (const i of FREE_WALK_MAPS) if (WORLD_ORIGINS[i]) areas.push(WORLD_ORIGINS[i]);
  }
  const x0 = Math.floor(Math.min(...areas.map(a => a[0])) / step) - 1,
    y0 = Math.floor(Math.min(...areas.map(a => a[1])) / step) - 1,
    cols = Math.ceil((Math.max(...areas.map(a => a[0])) + 960) / step) + 2 - x0,
    rows = Math.ceil((Math.max(...areas.map(a => a[1])) + 640) / step) + 2 - y0,
    size = cols * rows;
  // 0 unknown, 1 walkable, 2 solid.
  const open = new Uint8Array(size),
    crowd = worldPeople();
  const walk = (x, y) => {
    const cx = x - x0,
      cy = y - y0;
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
    const k = cy * cols + cx;
    if (!open[k]) open[k] = worldWalkable(x * step, y * step, crowd) ? 1 : 2;
    return open[k] === 1;
  };
  const node = p => {
    let best = null,
      d = Infinity;
    for (let yy = Math.round(p.y / step) - 3; yy <= Math.round(p.y / step) + 3; yy++)
      for (let xx = Math.round(p.x / step) - 3; xx <= Math.round(p.x / step) + 3; xx++) {
        const dd = Math.hypot(xx * step - p.x, yy * step - p.y);
        if (dd < d && walk(xx, yy)) {
          d = dd;
          best = { x: xx, y: yy };
        }
      }
    return best;
  };
  const a = node(start),
    b = node(goal);
  if (!a || !b) return null;
  const index = (x, y) => (y - y0) * cols + (x - x0),
    first = index(a.x, a.y),
    last = index(b.x, b.y),
    cost = new Int32Array(size).fill(0x7fffffff),
    prev = new Int32Array(size).fill(-1),
    closed = new Uint8Array(size),
    heapK = [],
    heapF = [];
  cost[first] = 0;
  const push = (k, f) => {
    let i = heapK.length;
    heapK.push(k);
    heapF.push(f);
    while (i) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapK[i] = heapK[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heapK[i] = k;
    heapF[i] = f;
  };
  const pop = () => {
    const result = heapK[0],
      tailK = heapK.pop(),
      tailF = heapF.pop();
    if (heapK.length) {
      let i = 0;
      while (i * 2 + 1 < heapK.length) {
        let c = i * 2 + 1;
        if (c + 1 < heapK.length && heapF[c + 1] < heapF[c]) c++;
        if (heapF[c] >= tailF) break;
        heapK[i] = heapK[c];
        heapF[i] = heapF[c];
        i = c;
      }
      heapK[i] = tailK;
      heapF[i] = tailF;
    }
    return result;
  };
  // The goal's own area, filled one cell per search step. Moves are symmetric, so if
  // the fill ends without reaching the start, no route exists.
  const reached = new Uint8Array(size),
    fill = [last];
  reached[last] = 1;
  let fillAt = 0,
    explored = 0;
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  push(first, 0);
  while (heapK.length && explored < 120000) {
    if (fillAt < fill.length) {
      const k = fill[fillAt++],
        x = (k % cols) + x0,
        y = Math.floor(k / cols) + y0;
      for (const [dx, dy] of DIRS) {
        if (!walk(x + dx, y + dy)) continue;
        const n = index(x + dx, y + dy);
        if (reached[n]) continue;
        reached[n] = 1;
        fill.push(n);
      }
      if (fillAt === fill.length && !reached[first]) return null;
    }
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === last) {
      const path = [];
      for (let k = last; k !== -1; k = prev[k])
        path.push({ x: ((k % cols) + x0) * step, y: (Math.floor(k / cols) + y0) * step });
      return path.reverse();
    }
    closed[cur] = 1;
    explored++;
    const cx = (cur % cols) + x0,
      cy = Math.floor(cur / cols) + y0,
      g = cost[cur] + 1;
    for (const [dx, dy] of DIRS) {
      const x = cx + dx,
        y = cy + dy;
      if (!walk(x, y)) continue;
      const k = index(x, y);
      if (closed[k] || g >= cost[k]) continue;
      cost[k] = g;
      prev[k] = cur;
      push(k, g + Math.abs(x - b.x) + Math.abs(y - b.y));
    }
  }
  return null;
}
async function followWorldPath(path) {
  if (!path) {
    toast(I18N.t('route.noPath'));
    return false;
  }
  const nav = ++navigation;
  for (const p of path) {
    if (nav !== navigation || battle || modalKind || held) return (refreshHint(), false);
    setWorldPosition(p.x, p.y);
    state.steps++;
    await delay(24);
  }
  refreshHint();
  return nav === navigation;
}
async function walkConnection(direction) {
  if (state.room || busy()) return;
  const chapter = WORLD_CHAPTERS[chapterOf()],
    position = chapter.order.indexOf(state.region),
    destination = chapter.order[position + direction];
  if (destination !== undefined) await travel(destination);
  else mapMenu();
}
