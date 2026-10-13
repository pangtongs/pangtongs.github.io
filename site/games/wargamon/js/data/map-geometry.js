/* Four chapters, four paintings each. Stable region IDs preserve existing saves. */
const WORLD_MAP_GAP = 0;
const WORLD_MAP_WIDTH = 960,
  WORLD_MAP_HEIGHT = 640;
// Maps own whole grid cells. Roads fit the cells; roads never shift a map.
function buildWorldGrid(count, connections) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid map-grid size');
  const steps = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] },
    cells = Array(count);
  cells[0] = [0, 0];
  for (const link of connections)
    if (
      !Object.hasOwn(steps, link.edge) ||
      ![link.from, link.to].every(i => Number.isInteger(i) && i >= 0 && i < count) ||
      link.from === link.to
    )
      throw new Error('Invalid map-grid connection');
  let changed = true;
  while (changed) {
    changed = false;
    for (const { from, to, edge } of connections) {
      const [dx, dy] = steps[edge],
        a = cells[from],
        b = cells[to];
      if (a && b) {
        if (b[0] !== a[0] + dx || b[1] !== a[1] + dy)
          throw new Error(`Conflicting map-grid connection ${from}/${to}`);
      } else if (a) {
        cells[to] = [a[0] + dx, a[1] + dy];
        changed = true;
      } else if (b) {
        cells[from] = [b[0] - dx, b[1] - dy];
        changed = true;
      }
    }
  }
  const occupied = new Set();
  for (let i = 0; i < count; i++) {
    if (!cells[i]) throw new Error(`Map ${i} has no grid connection`);
    const key = cells[i].join(',');
    if (occupied.has(key)) throw new Error(`Map ${i} overlaps an occupied grid cell`);
    occupied.add(key);
  }
  return cells;
}
const GANG_GRID_INDEX = PLACES.length;
const WORLD_CHAPTERS = [
  {
    name: 'Kampung',
    order: [0, 1, GANG_GRID_INDEX, 2],
    tiles: [
      [1, 2],
      [0, GANG_GRID_INDEX],
    ],
    cell: [0, -1],
    seamless: true,
  },
  {
    name: 'Pusat Kota',
    order: [3, 4, 5, 9],
    tiles: [
      [4, 3],
      [5, 9],
    ],
    cell: [2, -1],
    seamless: true,
  },
  {
    name: 'Air & Taman',
    order: [6, 10, 11, 8],
    tiles: [
      [8, 10],
      [6, 11],
    ],
    cell: [2, 1],
    seamless: true,
  },
  {
    name: 'Menuju Liga',
    order: [7, 12, 13, 14],
    tiles: [
      [12, 14],
      [7, 13],
    ],
    cell: [0, 1],
    seamless: true,
  },
];
function chapterOf(i = state.region) {
  return WORLD_CHAPTERS.findIndex(chapter => chapter.order.includes(i));
}
function buildChapterGrid(chapters) {
  if (
    chapters.length !== 4 ||
    chapters.some(
      c =>
        c.order.length !== 4 ||
        c.tiles.length !== 2 ||
        c.tiles.some(row => row.length !== 2) ||
        new Set(c.order).size !== 4 ||
        c.tiles.flat().some(id => !c.order.includes(id)),
    )
  )
    throw new Error('Each chapter needs four unique maps in a 2 × 2 rectangle');
  const cells = Array(PLACES.length + 1),
    occupied = new Set();
  for (const chapter of chapters)
    chapter.tiles.forEach((row, y) =>
      row.forEach((id, x) => {
        const cell = [chapter.cell[0] + x, chapter.cell[1] + y],
          key = cell.join(',');
        if (cells[id] || occupied.has(key)) throw new Error('Overlapping chapter map');
        cells[id] = cell;
        occupied.add(key);
      }),
    );
  if (cells.includes(undefined) || occupied.size !== 16)
    throw new Error('Each chapter needs four unique maps');
  return cells;
}
const WORLD_PAINT_GRID = buildChapterGrid(WORLD_CHAPTERS),
  WORLD_GRID = WORLD_PAINT_GRID.slice(0, PLACES.length),
  WORLD_PAINT_ORIGINS = WORLD_PAINT_GRID.map(([col, row]) => [col * WORLD_MAP_WIDTH, row * WORLD_MAP_HEIGHT]),
  WORLD_ORIGINS = WORLD_PAINT_ORIGINS.slice(0, PLACES.length),
  GANG_WORLD = { x: WORLD_PAINT_ORIGINS[GANG_GRID_INDEX][0], y: WORLD_PAINT_ORIGINS[GANG_GRID_INDEX][1] };
// Only paintings within the same chapter share a walkable border.
const WORLD_CONNECTIONS = [
  { from: 0, to: 1, edge: 'north', width: 25, at: 510 },
  { from: 1, to: 2, edge: 'east', width: 18, at: 530 },
  // Measured public openings in the user's replacement paintings.
  { from: 4, to: 5, edge: 'south', width: 76, at: 697 },
  { from: 5, to: 9, edge: 'east', width: 30, at: 35 },
  { from: 3, to: 9, edge: 'south', width: 30, at: 430, inset: 10 },
  { from: 6, to: 8, edge: 'north', width: 70, at: 540 },
  { from: 8, to: 10, edge: 'east', width: 25, at: 315, inset: 10 },
  { from: 10, to: 11, edge: 'south', width: 30, at: 90 },
  { from: 7, to: 12, edge: 'north', width: 35, at: 510 },
  { from: 12, to: 14, edge: 'east', width: 16, at: 390 },
  // Stop before the monument's crown; the courtyard path continues around it.
  { from: 14, to: 13, edge: 'south', width: 40, at: 560, inset: 10 },
];
const WORLD_LINKS = WORLD_CONNECTIONS.map(link => {
  const [ox, oy] = WORLD_ORIGINS[link.from],
    [tx, ty] = WORLD_ORIGINS[link.to],
    vertical = link.edge === 'north' || link.edge === 'south',
    inset = link.inset ?? 30,
    start = vertical
      ? [ox + link.at, oy + (link.edge === 'north' ? inset : 640 - inset)]
      : [ox + (link.edge === 'west' ? inset : 960 - inset), oy + link.at],
    end = vertical
      ? [tx + link.at, ty + (link.edge === 'north' ? 640 - inset : inset)]
      : [tx + (link.edge === 'west' ? 960 - inset : inset), ty + link.at],
    gap =
      link.edge === 'north'
        ? [
            [start[0], oy],
            [end[0], ty + 640],
          ]
        : link.edge === 'south'
          ? [
              [start[0], oy + 640],
              [end[0], ty],
            ]
          : link.edge === 'west'
            ? [
                [ox, start[1]],
                [tx + 960, end[1]],
              ]
            : [
                [ox + 960, start[1]],
                [tx, end[1]],
              ];
  if (gap[0][0] !== gap[1][0] || gap[0][1] !== gap[1][1])
    throw new Error(`Map entrances ${link.from}/${link.to} must match on their shared grid edge`);
  return { ...link, points: [start, end], gap };
});
const CHAPTER_CONNECTORS = [
  { from: 2, to: 5, exit: [945, 330], entry: [755, 595] },
  { from: 3, to: 6, exit: [575, 215], entry: [115, 225] },
  // The north landing beyond the workshop's railway staircase ends this chapter.
  { from: 10, to: 7, exit: [125, 15], entry: [515, 585] },
];
// Replace obsolete linear-route signs with destinations belonging to this world.
for (let i = 0; i < PLACES.length; i++) {
  const previousPassages = PLACES[i].points.filter(p => ['next', 'back'].includes(p.key));
  PLACES[i].points = PLACES[i].points.filter(p => !['next', 'back'].includes(p.key));
  const chapter = WORLD_CHAPTERS[chapterOf(i)];
  if (!chapter.seamless) {
    const peers = chapter.order,
      position = peers.indexOf(i);
    for (const destination of [peers[position - 1], peers[position + 1]].filter(n => n !== undefined)) {
      const original = previousPassages.find(
        p => p.key === (peers.indexOf(destination) < position ? 'back' : 'next'),
      );
      PLACES[i].points.push({
        key: 'passage',
        labelOffsetY: 45,
        name: REGIONS[destination].name,
        x: original?.x ?? PLACES[i].spawn[0],
        y: original?.y ?? PLACES[i].spawn[1],
        to: destination,
        mark: '↔',
        color: '#f3dc9a',
      });
    }
  }
}
for (const link of WORLD_LINKS)
  for (const [i, destination, point] of [
    [link.from, link.to, link.points[0]],
    [link.to, link.from, link.points[1]],
  ]) {
    const origin = WORLD_ORIGINS[i];
    PLACES[i].points.push({
      key: 'passage',
      name: REGIONS[destination].name,
      x: point[0] - origin[0],
      y: point[1] - origin[1],
      to: destination,
      mark: '↔',
      color: '#f3dc9a',
      labelMode: 'passage',
    });
  }
for (const connector of CHAPTER_CONNECTORS)
  for (const [i, destination, point] of [
    [connector.from, connector.to, connector.exit],
    [connector.to, connector.from, connector.entry],
  ])
    PLACES[i].points.push({
      key: 'connector',
      labelOffsetY: i === 7 ? 65 : 0,
      name: 'Penghubung: ' + WORLD_CHAPTERS[chapterOf(destination)].name,
      x: point[0],
      y: point[1],
      to: destination,
      mark: '↔',
      color: '#f3dc9a',
    });
// Buildings drawn over a map painting are solid; everything painted is part of the
// traced floors in js/data/floors.js.
const SOLID_MAP_OBJECTS = {};
// Kota Beton's services are painted into its base map; collision is traced in FLOORS.
// Outdoor clinics are integrated into their own map backgrounds.
const CLINIC_EXTERIORS = [];
