/* Where the hero can stand: painted floors, solid people, world coordinates and routes
   between regions. Coordinates are local to one region (960 x 640) or one room unless
   a function says world. */

// --- Floors. Coordinates are local to one region (960 x 640) or one room.
// A floor generated from a map painting (js/data/floors.js): one character per 10px cell.
const paintedFloor = (rows, x, y) => rows[Math.round(y / 10)]?.[Math.round(x / 10)] === '#';
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
  return effectiveFloorAt(i, x, y) && !(SOLID_MAP_OBJECTS[i] || []).some(r => insideRect(x, y, r));
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
function insidePerson(p, x, y) {
  const counter = p.stall && p.stall !== 'painted',
    height = personHeight(p),
    tall = p.tall || height > (state.room ? 52 : 42),
    up = counter || tall ? height : PERSON_BOX.up;
  return Math.abs(x - p.x) < (counter ? 34 : PERSON_BOX.half) && y > p.y - up && y < p.y + PERSON_BOX.down;
}
const people = points => points.filter(p => p.portrait !== undefined);
function personBlocks(feet, x, y, from) {
  return feet.some(p => insidePerson(p, x, y) && !insidePerson(p, from.x, from.y));
}
let worldPeopleCache = null;
// Tarsion stands in the observatory courtyard as solid as a person until it joins the
// team. Owning it is checked at most a few times a second; walking asks constantly.
const tarsionHere = { at: -Infinity, here: false };
function worldPeople() {
  worldPeopleCache ??= PLACES.flatMap((place, i) =>
    people(place.points).map(p => ({ ...p, ...globalPoint(i, p) })),
  );
  const now = Date.now();
  if (now - tarsionHere.at > 250) {
    tarsionHere.at = now;
    tarsionHere.here = typeof ownsTarsion === 'function' && !ownsTarsion();
  }
  const extra = typeof GANG_POINTS === 'undefined' ? [] : people(GANG_POINTS);
  if (tarsionHere.here) {
    const p = PLACES[13].points.find(p => p.key === 'tarsion');
    extra.push({ ...p, ...globalPoint(13, p) });
  }
  return extra.length ? [...worldPeopleCache, ...extra] : worldPeopleCache;
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
function worldWalkable(x, y) {
  if (debugWalkAll()) return groundWalkable(x, y);
  if (freeWalkAt(x, y)) return true;
  if (personBlocks(worldPeople(), x, y, worldPosition())) return false;
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
  const step = 10,
    key = (x, y) => x + ',' + y;
  const node = p => {
    let best = null,
      d = Infinity;
    for (let yy = Math.round(p.y / step) - 3; yy <= Math.round(p.y / step) + 3; yy++)
      for (let xx = Math.round(p.x / step) - 3; xx <= Math.round(p.x / step) + 3; xx++) {
        const dd = Math.hypot(xx * step - p.x, yy * step - p.y);
        if (dd < d && worldWalkable(xx * step, yy * step)) {
          d = dd;
          best = { x: xx, y: yy };
        }
      }
    return best;
  };
  const a = node(start),
    b = node(goal);
  if (!a || !b) return null;
  const first = key(a.x, a.y),
    last = key(b.x, b.y),
    cost = new Map([[first, 0]]),
    prev = new Map([[first, null]]),
    closed = new Set(),
    heap = [];
  const push = n => {
    heap.push(n);
    let i = heap.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= n.f) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = n;
  };
  const pop = () => {
    const result = heap[0],
      tail = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++;
        if (heap[c].f >= tail.f) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = tail;
    }
    return result;
  };
  push({ ...a, k: first, f: 0 });
  while (heap.length && closed.size < 120000) {
    const cur = pop();
    if (closed.has(cur.k)) continue;
    if (cur.k === last) {
      const path = [];
      let k = last;
      while (k !== null) {
        const [x, y] = k.split(',').map(Number);
        path.push({ x: x * step, y: y * step });
        k = prev.get(k);
      }
      return path.reverse();
    }
    closed.add(cur.k);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cur.x + dx,
        y = cur.y + dy,
        k = key(x, y),
        g = cost.get(cur.k) + 1;
      if (closed.has(k) || g >= (cost.get(k) ?? Infinity) || !worldWalkable(x * step, y * step)) continue;
      cost.set(k, g);
      prev.set(k, cur.k);
      push({ x, y, k, f: g + Math.abs(x - b.x) + Math.abs(y - b.y) });
    }
  }
  return null;
}
async function followWorldPath(path) {
  if (!path) {
    toast('Belum ada jalan terbuka ke sana. Lihat tujuan berikutnya.');
    return false;
  }
  const nav = ++navigation;
  for (const p of path) {
    if (nav !== navigation || battle || modalKind || held) return false;
    setWorldPosition(p.x, p.y);
    state.steps++;
    await delay(24);
  }
  return nav === navigation;
}
async function walkConnection(direction) {
  if (state.room || battle || modalKind || locked) return;
  const chapter = WORLD_CHAPTERS[chapterOf()],
    position = chapter.order.indexOf(state.region),
    destination = chapter.order[position + direction];
  if (destination !== undefined) await travel(destination);
  else mapMenu();
}
