/* Place labels: layout that steps aside for faces and other labels, and hit-testing
   for clicks on a label or a point. */
// The object on the ground and, when the player is near or hovering, its name.
function drawPointLabel(p) {
  if (p.labelMode === 'passage') return;
  if (p.key === 'wild' && !state.room) {
    // Keep habitats discoverable without a permanent banner over nearby people.
    const [x, y] = p.at || [p.x, p.y];
    ctx.fillStyle = '#173d24f0';
    ctx.beginPath();
    ctx.arc(x, y - 10, 11, 0, Math.PI * 2);
    ctx.fill();
    drawPaw(x, y - 10);
    if (showPlaceLabel(p)) drawLabelText(p);
    return;
  }
  if (p.labelMode === 'scene-sign') return;
  drawMapProp(p);
  if (showPlaceLabel(p)) drawLabelText(p);
}
// Labels drawn this frame, in screen space, so a new label can step aside instead of
// covering one that is already there. The shift is remembered for clicks.
const frameLabels = [];
const frameActorRects = [];
const labelShift = new Map();
const labelId = p => `${p.key}|${p.name}|${p.x}|${p.y}`;
function actorLabelRect(x, y, follower = false) {
  const half = follower ? 25 : 22;
  return [x - half, y - (state.room ? 58 : 43), x + half, y + 9];
}
function screenLabelRect(r) {
  const m = ctx.getTransform?.() || { a: 1, d: 1, e: 0, f: 0 };
  return [m.a * r[0] + m.e, m.d * r[1] + m.f, m.a * r[2] + m.e, m.d * r[3] + m.f];
}
const labelRectsOverlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
// A person's name plate stays on the person: above the head, or under the feet when the
// hero or a follower stands where the plate would go. It never wanders off to the side.
function placePersonLabel(p, b) {
  const below = p.y + 16 + b.h / 2 - b.y,
    screen = dy => screenLabelRect([b.x - b.w / 2, b.y + dy - b.h / 2, b.x + b.w / 2, b.y + dy + b.h / 2]),
    fits = r => r[1] >= 4 && (!Number.isFinite(canvas.height) || r[3] <= canvas.height - 4),
    clear = r => !frameActorRects.some(o => labelRectsOverlap(r, o));
  for (const dy of [0, below]) {
    const r = screen(dy);
    if (fits(r) && clear(r)) {
      frameLabels.push(r);
      return { dx: 0, dy, under: dy !== 0 };
    }
  }
  frameLabels.push(screen(0));
  return { dx: 0, dy: 0, under: false };
}
function placeLabel(p, b) {
  if (p.portrait !== undefined) return placePersonLabel(p, b);
  const step = b.h + 8,
    side = b.w / 2 + 38,
    candidates = [
      [0, 0],
      [0, step],
      [0, -step],
      [-side, 0],
      [side, 0],
      [-side, -step],
      [side, -step],
      [-side, step],
      [side, step],
      ...[2, 3, 4, 5, 6].flatMap(n => [
        [0, n * step],
        [0, -n * step],
      ]),
    ];
  for (const [dx, dy] of candidates) {
    const r = screenLabelRect([
      b.x + dx - b.w / 2,
      b.y + dy - b.h / 2,
      b.x + dx + b.w / 2,
      b.y + dy + b.h / 2,
    ]);
    const visible =
      !Number.isFinite(canvas.width) ||
      (r[0] >= 4 && r[1] >= 4 && r[2] <= canvas.width - 4 && r[3] <= canvas.height - 4);
    if (visible && ![...frameLabels, ...frameActorRects].some(o => labelRectsOverlap(r, o))) {
      frameLabels.push(r);
      return { dx, dy };
    }
  }
  // The hint remains available when a very small viewport has no clear label space.
  return null;
}
function drawLabelText(p) {
  const b = labelBox(p, true),
    shift = placeLabel(p, b);
  labelShift.set(labelId(p), shift);
  if (!shift) return;
  b.x += shift.dx;
  b.y += shift.dy;
  const wild = p.key === 'wild';
  ctx.fillStyle = wild ? '#173d24f0' : '#112c2af0';
  ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  ctx.font = `bold ${b.font}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7ffe3';
  // A habitat shows its own name after a paw print, so it reads as a place to find Wargamon.
  if (wild) drawPaw(b.x - b.w / 2 + 13, b.y);
  ctx.fillText(tr(b.text), b.x + (wild ? 9 : 0), b.y + b.font * 0.34);
  // A small pointer ties a name plate to its person.
  if (p.portrait !== undefined) {
    const tip = shift.under ? b.y - b.h / 2 : b.y + b.h / 2,
      out = shift.under ? -6 : 6;
    ctx.fillStyle = p.color || '#f3dc9a';
    ctx.beginPath();
    ctx.moveTo(b.x - 6, tip);
    ctx.lineTo(b.x + 6, tip);
    ctx.lineTo(b.x, tip + out);
    ctx.fill();
  }
}
function drawPaw(x, y) {
  ctx.fillStyle = '#b9e482';
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 4.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy] of [
    [-4.5, -2.5],
    [0, -5],
    [4.5, -2.5],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}
function labelBox(p, unshifted = false) {
  const shift = (!unshifted && labelShift.get(labelId(p))) || { dx: 0, dy: 0 };
  const [x, y] = p.key === 'wild' && p.at ? p.at : [p.x, p.y];
  let text = shortPlaceName(p);
  if (p.key === 'trainer' && state.defeated.includes(p.id)) text = '✓ ' + text;
  ctx.font = 'bold 14px Arial';
  const w = Math.min(285, ctx.measureText(text).width + (p.key === 'wild' ? 38 : 20));
  while (ctx.measureText(text).width > w - 16 && text.length > 4) text = text.slice(0, -2) + '…';
  return {
    text,
    w,
    h: 27,
    font: 14,
    x: Math.max(w / 2 + 5, Math.min(955 - w / 2, x)) + shift.dx,
    // A person's plate sits above the head; a place's label above its marker.
    y: (p.portrait !== undefined ? y - personHeight(p) - 21 : y - 48 + (p.labelOffsetY || 0)) + shift.dy,
  };
}
function hitPointLabel(p, pos) {
  if (!labelShift.get(labelId(p)) || !showPlaceLabel(p)) return false;
  const b = labelBox(p);
  return insideRect(pos.x, pos.y, [b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2]);
}
function findHitPoint(points, pos) {
  // A shifted, visible label owns its click; array order must not select a neighbour.
  return (
    points.find(p => hitPointLabel(p, pos)) ||
    points
      .filter(p => hitPoint(p, pos))
      .sort(
        (a, b) =>
          Math.hypot(pos.x - a.x, pos.y - a.y + (a.portrait !== undefined ? personHeight() / 2 : 0)) -
          Math.hypot(pos.x - b.x, pos.y - b.y + (b.portrait !== undefined ? personHeight() / 2 : 0)),
      )[0]
  );
}
function hitPoint(p, pos) {
  if (p.labelMode === 'passage') return false;
  if (p.key === 'wild' && Math.hypot(p.x - pos.x, p.y - pos.y) <= 39) return true;
  if (p.key === 'wild' && p.at && Math.hypot(p.at[0] - pos.x, p.at[1] - pos.y) <= 39) return true;
  return objectHit(p, pos) || hitPointLabel(p, pos);
}
function shortPlaceName(p) {
  let name;
  if (p.key === 'trainer')
    name = (p.labelName || p.name) + (p.optional ? ', ' + I18N.t('festival.optional') : '');
  else if (p.key === 'wild') name = p.name.split(',')[0];
  else
    name = p.name
      .split(', ')[0]
      .replace(/[↵←→]/g, '')
      .trim()
      .replace(/\bWARGAMARET\b/, 'Wargamaret')
      .replace(/\bMINIMARKET\b/, 'Minimarket')
      .replace(/\bWARUNG TERMINAL\b/, 'Warung Terminal')
      .replace(/\bPOS RT\b/, 'Pos RT')
      .replace(/\bDAPUR MBG\b/, 'Dapur MBG')
      .split(' ')
      .map(w => (['RT', 'MBG', 'UKS'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ');
  return name.replace(/Uks Arena/gi, 'Klinik Beton');
}
let mapFontSize = 14;
