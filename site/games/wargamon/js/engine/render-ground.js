/* Ground drawn over the paintings: habitats in their pixel style, and the debug
   views of terrain and map borders. */
function paintTerrain() {
  ctx.fillStyle = '#537346';
  ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
  ctx.fillStyle = '#173f2b99';
  ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
}
// Match the visible perimeter to localTerrain's 20..940 / 20..620 bounds.
function borderLink(i, x, y) {
  const [ox, oy] = worldOrigin(i);
  return WORLD_LINKS.find(l => (l.from === i || l.to === i) && linkContains(l, x + ox, y + oy));
}
function paintBoundary(i) {
  ctx.save();
  // Each locked road has a physical striped barrier at its border opening.
  for (const edge of ['top', 'bottom', 'left', 'right']) {
    const vertical = edge === 'left' || edge === 'right',
      limit = vertical ? 620 : 940;
    for (let n = 20; n <= limit; n += 4) {
      const x = vertical ? (edge === 'left' ? 20 : 940) : n,
        y = vertical ? n : edge === 'top' ? 20 : 620,
        l = borderLink(i, x, y),
        blocked = l && !regionAvailable(l.to);
      if (blocked) {
        ctx.fillStyle = Math.floor(n / 8) % 2 ? '#e9ba59' : '#3b3930';
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
    }
  }
  ctx.restore();
}
// A closed road: a striped sawhorse across it (several small ones across a road that runs
// sideways) and a no-entry sign, in the colours of a locked opening.
function drawRoadBlock(b) {
  const horse = (cx, cy, w) => {
    ctx.fillStyle = '#14282055';
    ctx.fillRect(cx - w / 2, cy - 2, w, 4);
    ctx.fillStyle = '#3b3930';
    ctx.fillRect(cx - w / 2 + 2, cy - 15, 3, 15);
    ctx.fillRect(cx + w / 2 - 5, cy - 15, 3, 15);
    for (let n = 0; n < w; n += 8) {
      ctx.fillStyle = Math.floor(n / 8) % 2 ? '#3b3930' : '#e9ba59';
      ctx.fillRect(cx - w / 2 + n, cy - 17, Math.min(8, w - n), 6);
    }
    ctx.fillStyle = '#f7f2df55';
    ctx.fillRect(cx - w / 2, cy - 17, w, 1);
  };
  const sign = (cx, cy) => {
    ctx.fillStyle = '#3b3930';
    ctx.fillRect(cx - 1, cy - 30, 2, 14);
    ctx.fillStyle = '#c8423a';
    ctx.beginPath();
    ctx.arc(cx, cy - 33, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7f2df';
    ctx.fillRect(cx - 4, cy - 34, 8, 2);
  };
  ctx.save();
  if (b.axis === 'x') {
    horse(b.x, b.y, b.span);
    // At the top of a map the sign stands beside the barrier, where it can be seen.
    if (b.y >= 36) sign(b.x, b.y - 2);
    else sign(b.x + b.span / 2 + 9, b.y + 30);
  } else {
    const count = Math.max(2, Math.round(b.span / 30));
    for (let k = 0; k < count; k++) horse(b.x, b.y - b.span / 2 + ((k + 0.5) * b.span) / count + 8, 22);
    sign(b.x, b.y - b.span / 2 + 8);
  }
  ctx.restore();
}
// The name a closed road shows when the player walks up to it.
const roadBlockPoint = b => ({
  key: 'roadblock',
  name: I18N.t('world.roadClosed'),
  x: b.x,
  y: b.axis === 'x' ? b.y : b.y - b.span / 2 + 8,
  color: '#e9ba59',
});
/* A habitat is drawn in the map's pixel style, in the ground it belongs to: tall grass,
   rippling water beside a pier or shore, or warm rubble. `at` places the drawing when
   the player stands on a path or pier next to it. */
const GRASS_TUFT = [
  '..l...l....l..',
  '.lm..lm.l..lm.',
  '.lml.lml.lmlml',
  'lmmlmmmlmmmlmm',
  'dmmmmmmmmmmmmd',
  '.dddddddddddd.',
];
const RUBBLE = ['....hh....', '..hhmmh...', '.hmmmmmh.h', 'hmmmdmmmhm', 'dmmdddmmmd', '.dddddddd.'];
const HABITAT_COLOURS = {
  l: '#a9dc6b',
  m: '#4c9a3e',
  d: '#1f4d2c',
  h: '#b9ad9c',
};
function paintPixels(rows, colours, ox, oy, size = 3) {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') continue;
      ctx.fillStyle = colours[row[c]];
      ctx.fillRect(ox + c * size, oy + r * size, size, size);
    }
  });
}
function drawWildGround(point) {
  const [x, y] = point.at || [point.x, point.y],
    t = Date.now() / 1000;
  ctx.save();
  ctx.translate(x, y);
  if (point.habitat === 'water') {
    // Fish stir the surface: expanding rings and a darker shadow under them.
    ctx.fillStyle = '#0b3c5588';
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 3; k++) {
      const phase = (t * 0.6 + k / 3) % 1;
      ctx.strokeStyle = `rgba(225, 250, 255, ${0.75 * (1 - phase)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8 + phase * 30, 3 + phase * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8fbff';
    for (const [dx, dy] of [
      [-6, -4],
      [5, -7],
      [12, -2],
    ])
      if (Math.sin(t * 3 + dx) > 0.2) ctx.fillRect(dx, dy, 3, 3);
  } else if (point.habitat === 'rock') {
    ctx.fillStyle = '#14282066';
    ctx.beginPath();
    ctx.ellipse(0, 8, 32, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    const colours = { ...HABITAT_COLOURS, m: '#6e6559', d: '#3b342d' };
    paintPixels(RUBBLE, colours, -32, -8);
    paintPixels(RUBBLE, colours, 2, -12);
    // Warm air rises from the rubble.
    ctx.fillStyle = 'rgba(240, 236, 226, 0.45)';
    for (let k = 0; k < 3; k++) {
      const rise = (t * 12 + k * 9) % 26;
      ctx.fillRect(-10 + k * 9, -14 - rise, 3, 3);
    }
  } else {
    ctx.fillStyle = '#14282066';
    ctx.beginPath();
    ctx.ellipse(0, 8, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [ox, oy] of [
      [-40, -10],
      [-2, -12],
      [-21, -4],
    ])
      paintPixels(GRASS_TUFT, HABITAT_COLOURS, ox, oy);
  }
  ctx.restore();
}
function paintHabitats(place) {
  for (const point of place.points)
    if (point.key === 'wild' && point.renderGround !== false) drawWildGround(point);
}
