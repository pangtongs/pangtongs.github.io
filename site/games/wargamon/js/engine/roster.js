/* Directional walking, dual-type combat, and species-specific tactical identities. */
for (const name of ['img/characters/hero-traveler.webp']) {
  const im = new Image();
  im.src = name;
  images[name] = im;
}
// The type chart lives in elements.js; this only adds the conditions a body carries.
const baseMatchup = (type, id) => typeMatchup(type, SPECIES[id].types);
function typeMultiplier(type, target) {
  let n = baseMatchup(type, target.id);
  if (hasCondition(target, 'soaked')) {
    if (type === 'Listrik') n *= 1.5;
    if (type === 'Api') n *= 0.7;
  }
  return n;
}
const alliesFor = m =>
  state.team.includes(m) ? state.team : battle?.enemies.includes(m) ? battle.enemies : [m];
function tacticalMoveScore(mv, a, d) {
  let score = 0;
  const allies = alliesFor(a);
  if (mv.teamHeal)
    score += allies.filter(m => m.hp > 0 && !m.healBlock).reduce((n, m) => n + (1 - m.hp / m.max) * 30, 0);
  if (mv.teamCleanse) score += allies.filter(m => hasCondition(m) || m.healBlock || m.sugar).length * 24;
  if (mv.teamWard && !a.ward) score += 12;
  if (mv.seal) score += kit(d.id, d).some((m, i) => i > 0 && m.power > 15 && !d.cooldowns[i]) ? 15 : 0;
  if (mv.mark && !d.sugar) score += 16;
  if (mv.healBlock && !d.healBlock) score += kit(d.id, d).some(m => m.heal || m.drain || m.teamHeal) ? 24 : 9;
  if (mv.dispel && (d.shell || d.reflect || d.ward)) score += 20;
  if (mv.shell && !a.shell && a.hp < a.max * 0.7) score += 17;
  if (mv.tailwind) score += allies.some(m => Object.values(m.cooldowns).some(n => n > 1)) ? 19 : 0;
  if (d.sugar && mv.power && ['Api', 'Listrik'].includes(mv.type)) score += 18;
  return score;
}
// New tactical effects are encounter-local; ordinary conditions keep their established persistence.
// Sprite source rectangles are measured from the actual atlas, not assumed equal margins.
// Each crop fits one complete pose. The previous side rows included part of
// the next pose and the back row lost the top of the hair.
const HERO_FRAMES = [
  [
    [196, 16, 141, 314],
    [467, 16, 151, 313],
    [741, 15, 148, 314],
  ],
  [
    [206, 364, 135, 307],
    [459, 364, 161, 307],
    [736, 364, 170, 307],
  ],
  [
    [194, 706, 139, 310],
    [452, 706, 168, 310],
    [721, 706, 177, 310],
  ],
  [
    [195, 1045, 143, 319],
    [461, 1045, 149, 324],
    [742, 1045, 153, 324],
  ],
];
const HERO_ROWS = { down: 0, right: 1, left: 2, up: 3 };
let heroMotion = { last: null, scene: null, distance: 0, lastMove: -1000 };
function faceMovement(dx, dy) {
  if (!dx && !dy) return;
  state.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}
function heroPose(t) {
  const p = state.room ? { x: state.x, y: state.y } : worldPosition(),
    scene = state.room ? state.region + ':' + state.room : 'world',
    old = heroMotion.last;
  if (old && heroMotion.scene === scene) {
    const dx = p.x - old.x,
      dy = p.y - old.y,
      d = Math.hypot(dx, dy);
    if (d > 0 && d < 100) {
      faceMovement(dx, dy);
      heroMotion.distance += d;
      heroMotion.lastMove = t;
    }
  } else heroMotion.lastMove = -1000;
  heroMotion.last = p;
  heroMotion.scene = scene;
  const moving = t - heroMotion.lastMove < 130 && !modalKind && !battle,
    cycle = [0, 1, 0, 2],
    column = moving ? cycle[Math.floor(heroMotion.distance / 14) % 4] : 0;
  return { row: HERO_ROWS[state.facing] ?? 0, column, moving };
}
// Dedicated overworld poses: six species per sheet, front/left/right/back columns.
const followerAtlasPath = sheet => `img/followers/follower-atlas-${String(sheet).padStart(2, '0')}.webp`;
const FOLLOWER_SHEETS = Array.from({ length: 9 }, (_, sheet) => followerAtlasPath(sheet));
const FOLLOWER_COLUMNS = { down: 0, left: 1, right: 2, up: 3 };
const followerCells = new Map();
const followerSources = new Map();
function registerFollowerSheet(sheet, name, prepare) {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => prepare(image);
  image.onerror = () => {
    image.failed = true;
  };
  images[name] = image;
  followerSources.set(sheet, { name, image });
}
function requestFollowerSheet(sheet) {
  const source = followerSources.get(sheet);
  if (source && !source.image.src) {
    source.image.fetchPriority = 'low';
    source.image.src = source.name;
  }
  return source;
}
let followerMotion = { last: null, scene: null, facing: 'down', lastMove: -1000, distance: 0 };
// Stable species IDs select one source sheet. IDs 70 to 79 have individual portraits
// but no directional follower sheet yet, so their own portrait is used below. Species
// from 80 on get one sheet each (CREATURE_FOLLOWER_FILES, sheet 100 + id) once it exists;
// until then the portrait, or its loud placeholder, follows the player.
const SPECIES_FOLLOWER_SHEET = 100;
function followerFrameFor(id) {
  if (id === 26) return { sheet: 17, row: 0 };
  if (id >= 80) return creatureFollowerFile(id) ? { sheet: SPECIES_FOLLOWER_SHEET + id, row: 0 } : null;
  if (id >= 70) return null;
  if (id >= 55) return { sheet: 12 + Math.floor((id - 55) / 5), row: (id - 55) % 5 };
  if (id >= 48) return { sheet: 11, row: id - 48 };
  if (id === 46) return { sheet: 9, row: 0 };
  if (id >= 42) return { sheet: 8, row: id - 42 };
  if (id >= 38) return { sheet: 7, row: id - 38 };
  if (id >= 34) return { sheet: 6, row: id - 34 };
  if (id === 30 || id === 31 || id === 33) return { sheet: 10, row: [30, 31, 33].indexOf(id) };
  return { sheet: Math.floor(id / 6), row: id % 6 };
}
function followerPose(p, t) {
  const id = followingMon().id,
    origin = state.room ? [0, 0] : worldOrigin(),
    point = { x: p.x + origin[0], y: p.y + origin[1] },
    scene = (state.room ? state.region + ':' + state.room : 'world') + ':' + id;
  if (followerMotion.last && followerMotion.scene === scene) {
    const dx = point.x - followerMotion.last.x,
      dy = point.y - followerMotion.last.y,
      d = Math.hypot(dx, dy);
    if (d > 0.05 && d < 100) {
      followerMotion.facing =
        Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      followerMotion.lastMove = t;
      followerMotion.distance += d;
    }
  } else {
    followerMotion.facing = state.facing || 'down';
    followerMotion.lastMove = -1000;
  }
  followerMotion.last = point;
  followerMotion.scene = scene;
  return {
    ...followerFrameFor(id),
    column: FOLLOWER_COLUMNS[followerMotion.facing],
    moving: t - followerMotion.lastMove < 130 && !modalKind && !battle,
    bob: Math.sin(followerMotion.distance / 6) * 1.5,
  };
}
/* Sprite isolation and follower sheet preparation live beside their consumers. */
function isolateSprite(canvas) {
  const c = canvas.getContext('2d', { willReadFrequently: true }),
    w = canvas.width,
    h = canvas.height,
    pixels = c.getImageData(0, 0, w, h),
    d = pixels.data,
    seen = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  const add = n => {
    if (n < 0 || n >= w * h || seen[n]) return;
    seen[n] = 1;
    const k = n * 4;
    if (d[k + 3] < 20 || (d[k] > 239 && d[k + 1] > 233 && d[k + 2] > 205)) {
      queue[tail++] = n;
      d[k + 3] = 0;
    }
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  while (head < tail) {
    const n = queue[head++],
      x = n % w;
    if (x) add(n - 1);
    if (x < w - 1) add(n + 1);
    add(n - w);
    add(n + w);
  }
  // Discard tiny disconnected neighbouring-sheet fragments, retaining substantial detached effects.
  seen.fill(0);
  const components = [];
  let largest = 0;
  for (let n = 0; n < w * h; n++) {
    if (seen[n] || d[n * 4 + 3] < 20) continue;
    head = 0;
    tail = 0;
    queue[tail++] = n;
    seen[n] = 1;
    const group = [];
    while (head < tail) {
      const at = queue[head++];
      group.push(at);
      const x = at % w;
      for (const next of [x ? at - 1 : -1, x < w - 1 ? at + 1 : -1, at - w, at + w])
        if (next >= 0 && next < w * h && !seen[next] && d[next * 4 + 3] >= 20) {
          seen[next] = 1;
          queue[tail++] = next;
        }
    }
    components.push(group);
    largest = Math.max(largest, group.length);
  }
  for (const group of components) if (group.length < largest * 0.012) for (const n of group) d[n * 4 + 3] = 0;
  let left = w,
    top = h,
    right = -1,
    bottom = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] >= 20) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  c.putImageData(pixels, 0, 0);
  return right < 0 ? [0, 0, w, h] : [left, top, right - left + 1, bottom - top + 1];
}
// Generated checker backgrounds are neutral gray. Remove their connected regions,
// including checker pockets, while preserving enclosed cream and white highlights.
function isolateGeneratedSprite(canvas) {
  const c = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    im = c.getImageData(0, 0, w, h),
    d = im.data,
    seen = new Uint8Array(w * h);
  const neutral = n => {
    const k = n * 4,
      lo = Math.min(d[k], d[k + 1], d[k + 2]),
      hi = Math.max(d[k], d[k + 1], d[k + 2]);
    return d[k + 3] < 20 || (lo >= 125 && hi - lo <= 22);
  };
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !neutral(start)) continue;
    const group = [start];
    seen[start] = 1;
    let edge = false,
      lo = 255,
      hi = 0;
    for (let q = 0; q < group.length; q++) {
      const n = group[q],
        x = n % w,
        y = Math.floor(n / w);
      edge ||= x === 0 || x === w - 1 || y === 0 || y === h - 1;
      lo = Math.min(lo, d[n * 4]);
      hi = Math.max(hi, d[n * 4]);
      for (const next of [x ? n - 1 : -1, x < w - 1 ? n + 1 : -1, n - w, n + w])
        if (next >= 0 && next < w * h && !seen[next] && neutral(next)) {
          seen[next] = 1;
          group.push(next);
        }
    }
    if (edge || (group.length > 32 && lo < 200 && hi > 225)) for (const n of group) d[n * 4 + 3] = 0;
  }
  c.putImageData(im, 0, 0);
  return isolateSprite(canvas);
}
// Slice follower poses at the measured row and column boundaries.
function followerRows(index, height) {
  const boundaries =
    index === 17 || index >= SPECIES_FOLLOWER_SHEET
      ? [0, height]
      : index === 8
        ? [0, 240, 520, 745, 1027, 1247, 1536].map(y => (y * height) / 1536)
        : index === 7
          ? [0, 310, 590, 880, 1254].map(y => (y * height) / 1254)
          : index === 6
            ? [0, 313, 627, 915, 1254].map(y => (y * height) / 1254)
            : index >= 5
              ? [0, 0.25, 0.5, 0.75, 1].map(y => y * height)
              : [0, 280, 520, 768, 1010, 1260, 1536].map(y => (y * height) / 1536);
  return boundaries.map(Math.round);
}
function prepareFollowerSheet(image, index) {
  const width = image.naturalWidth,
    height = image.naturalHeight,
    rows = followerRows(index, height);
  for (let row = 0; row < rows.length - 1; row++)
    for (let column = 0; column < 4; column++) {
      const columns =
        index === 5 && row === 2
          ? [0, 296, 610, 925, 1214].map(x => Math.round((x * width) / 1214))
          : [0, 1, 2, 3, 4].map(x => Math.round((x * width) / 4));
      const x = columns[column],
        y = rows[row],
        w = columns[column + 1] - x,
        h = rows[row + 1] - y;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(image, x, y, w, h, 0, 0, w, h);
      const rect = (index >= 5 && index !== 8 ? isolateGeneratedSprite : isolateSprite)(canvas);
      followerCells.set(`${index}:${row}:${column}`, { canvas, rect });
    }
}
FOLLOWER_SHEETS.forEach((name, index) =>
  registerFollowerSheet(index, name, image => prepareFollowerSheet(image, index)),
);
registerFollowerSheet(17, 'img/followers/follower-layanganak.webp', image => prepareFollowerSheet(image, 17));
for (const id of Object.keys(CREATURE_FOLLOWER_FILES).map(Number))
  if (creatureFollowerFile(id))
    registerFollowerSheet(SPECIES_FOLLOWER_SHEET + id, creatureFollowerFile(id), image =>
      prepareFollowerSheet(image, SPECIES_FOLLOWER_SHEET + id),
    );
// Render one correctly aligned shadow and sprite; don't patch drawImage globally.
const portraitFollowerImages = new Map();
function followerPortrait(id) {
  if (!portraitFollowerImages.has(id)) {
    const image = new Image();
    image.src = creaturePortraitPath(id);
    portraitFollowerImages.set(id, image);
  }
  return portraitFollowerImages.get(id);
}
// Draws the follower at the position and in the pose tickWorld() (render.js) chose.
function drawFollower(position, pose) {
  const mon = followingMon();
  if (!mon) return;
  const frame = followerFrameFor(mon.id);
  if (frame) requestFollowerSheet(frame.sheet);
  const p = position;
  if (!p || !pose) return;
  const id = mon.id,
    cell = pose.sheet === undefined ? null : followerCells.get(`${pose.sheet}:${pose.row}:${pose.column}`);
  const portrait = cell
    ? null
    : pose.sheet === undefined || followerSources.get(pose.sheet)?.image.failed
      ? followerPortrait(id)
      : null;
  if (!cell && !(portrait?.complete && portrait.naturalWidth)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(10,24,20,.5)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 1, state.room ? 10 : 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  // A rare-coloured follower walks in its batik palette (batik.js caches each frame).
  const batik = batikFor(mon);
  if (cell) {
    const [sx, sy, sw, sh] = cell.rect,
      size = state.room ? (id >= 55 ? 33 : 31) : id >= 55 ? 30 : 28,
      scale = size / Math.max(sw, sh),
      w = sw * scale,
      h = sh * scale;
    ctx.drawImage(
      batik ? batikFrame(cell.canvas, batik) : cell.canvas,
      sx,
      sy,
      sw,
      sh,
      Math.round(p.x - w / 2),
      Math.round(p.y - h - 1 + (pose.moving ? pose.bob : 0)),
      w,
      h,
    );
  } else {
    const size = state.room ? 38 : 32;
    ctx.drawImage(
      batik ? batikFrame(portrait, batik) : portrait,
      Math.round(p.x - size / 2),
      Math.round(p.y - size + 5),
      size,
      size,
    );
  }
  ctx.restore();
}
