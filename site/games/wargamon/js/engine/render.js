/* Drawing the map: the frame loop, region art, actors and place signs. */

// --- Frame loop.
// One animation frame: tickWorld() moves the world on, then paintFrame() draws it. A frame
// that throws is reported through the loading overlay and retried; it must never stop
// the loop for good. What is on screen (visibleActorAssets) is gathered once per frame
// and shared with the loading overlay.
function draw(t) {
  let onScreen = null;
  try {
    // The battle screen covers the whole map; repainting it underneath is wasted work.
    if (battleCoversMap()) {
      requestAnimationFrame(draw);
      refreshLoadingState();
      return;
    }
    frameCanvasBox = canvasResizeObserved ? null : canvas.getBoundingClientRect();
    paintFrame(t, tickWorld(t));
    frameCanvasBox = null;
    requestAnimationFrame(draw);
    lastPaintAt = Date.now();
    paintFailure = null;
    onScreen = visibleActorAssets();
    if (onScreen.every(asset => asset.ready)) {
      paintedScene = sceneToken();
      requestOfflineArt();
    }
  } catch (error) {
    frameCanvasBox = null;
    paintFailure = error;
    console.error('Map rendering failed', error);
    try {
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } catch {}
    setTimeout(() => requestAnimationFrame(draw), 1000);
  }
  refreshLoadingState(onScreen);
}
// --- The world between frames.
// tickWorld() is the only part of a frame that changes anything: the step of a held key, the
// camera following the hero, the follower's trail, the hero's and the follower's walking
// poses, and the hint bar. paintFrame() draws the state as it is plus what tickWorld()
// returns, and changes nothing (tests/render-tick.cjs).
// Walking by key is a fixed step of WALK_STEP px, at most one per frame and none sooner
// than WALK_INTERVAL ms after the last, so the pace is the same at any frame rate above
// about 22 per second.
const WALK_STEP = 7,
  WALK_INTERVAL = 45;
const HELD_STEPS = {
  up: [0, -WALK_STEP],
  down: [0, WALK_STEP],
  left: [-WALK_STEP, 0],
  right: [WALK_STEP, 0],
};
// t is the frame's timestamp, as requestAnimationFrame gives it.
function tickWorld(t) {
  fitCamera();
  if (held && t - lastStep > WALK_INTERVAL) {
    movement(...HELD_STEPS[held]);
    lastStep = t;
  }
  cameraPosition();
  const frame = { follower: trackFollower(), heroPose: null, followerPose: null };
  // Posed back to front, the order they are drawn in: a hero's step can turn the hero
  // (state.facing), and a follower that has just appeared takes the hero's facing.
  const poseHero = () => {
      if (state.team.length && heroSheetReady()) frame.heroPose = heroPose(t);
    },
    poseFollower = () => {
      if (frame.follower && followingMon()) frame.followerPose = followerPose(frame.follower, t);
    };
  if (frame.follower && frame.follower.y <= state.y + 0.5) {
    poseFollower();
    poseHero();
  } else {
    poseHero();
    poseFollower();
  }
  if (state.region === REGION.WARGAMALL && deliveryState().carry && !battle) setHint(deliveryHint());
  if (!battle && !modalKind) refreshReachHint();
  return frame;
}
const heroSheetReady = () => {
  const im = images['img/characters/hero-traveler.webp'];
  return !!(im?.complete && im.naturalWidth);
};
// A warm order on its way across Wargamall (story/expansion.js).
function deliveryHint() {
  return 'Pesanan hangat, ' + deliveryRemaining() + ' langkah, ' + DELIVERY_ORDERS[deliveryState().done].name;
}
// What E (or the touch INTERAKSI button) would do right now: pick up a find underfoot, or
// use the nearest point in reach. The hint and the button's label both say it, in key
// wording on a keyboard and touch wording on a phone.
const INTERACT_VERBS = {
  talk: [
    'trainer',
    'chat',
    'tutor',
    'quest',
    'uda',
    'mace',
    'daeng',
    'bli',
    'stamp',
    'daycare',
    'civic',
    'news',
    'dispatch',
  ],
  enter: ['door', 'district', 'hall', 'latehall', 'league'],
  go: ['exit', 'next', 'back'],
  shop: ['shop', 'pharmacy', 'latefood'],
  eat: ['meal', 'tea'],
  rest: ['camp', 'pitstop', 'clinic'],
  search: ['wild'],
};
function interactVerb(p) {
  const verb =
    Object.keys(INTERACT_VERBS).find(v => INTERACT_VERBS[v].includes(p.key)) || (p.room ? 'enter' : 'look');
  return I18N.t(`interact.verb.${verb}`);
}
function reachHintText(p) {
  return touchOnly()
    ? I18N.t('hint.reach.touch', { name: shortPlaceName(p), verb: interactVerb(p) })
    : 'E, ' + shortPlaceName(p);
}
function setInteractLabel(text) {
  const node = $('interactLabel');
  if (node && node.textContent !== text) node.textContent = text;
}
function refreshReachHint() {
  const find = state.room ? null : findUnderfoot(),
    p = nearest(),
    inReach = p && Math.hypot(p.x - state.x, p.y - state.y) <= reachOf(p);
  if (find) setHint(I18N.t(touchOnly() ? 'hint.find.touch' : 'hint.find.keys'));
  else if (inReach) setHint(reachHintText(p));
  else if (findUnderfoot(FIND_SPARKLE)) setHint(I18N.t('hint.find.near'));
  setInteractLabel(
    find
      ? I18N.t('interact.find')
      : inReach
        ? `${interactVerb(p)}: ${shortPlaceName(p)}`
        : I18N.t('interact.idle'),
  );
}
// Writing the same text every frame still costs the browser a style and layout pass.
function setHint(text) {
  const node = $('hint');
  if (node.textContent !== text) node.textContent = text;
}
function battleCoversMap() {
  const screen = battle && $('battle');
  return !!screen && !screen.classList.contains('hidden');
}
// The canvas size is read once per resize when the browser can report resizes,
// otherwise once per frame; never several times in one frame.
let worldCanvasBox = null,
  frameCanvasBox = null,
  canvasResizeObserved = false;
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(() => (worldCanvasBox = null)).observe(canvas);
  canvasResizeObserved = true;
}
function canvasBox() {
  if (canvasResizeObserved) return (worldCanvasBox ||= canvas.getBoundingClientRect());
  return frameCanvasBox || canvas.getBoundingClientRect();
}
// Match the browser's backing pixels without changing the camera or map scale. Beyond
// twice the CSS size a phone's extra pixels are invisible but cost fill rate and memory.
function resizeWorldCanvas() {
  const box = canvasBox(),
    ratio = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1),
    width = Math.max(1, Math.round(box.width * ratio)),
    height = Math.max(1, Math.round(box.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
// A frame wider than 3:2 shows the standard 600×400 view. A taller frame, such as a
// phone held upright, keeps the height and narrows the width, so nothing is squashed.
function fitCamera() {
  const box = canvasBox(),
    aspect = box.height > 0 ? box.width / box.height : 1.5;
  camera.height = 400;
  camera.width = aspect >= 1.5 ? 600 : Math.max(240, Math.round(400 * aspect));
}
// Draws one frame of the map from the state, the camera and tickWorld()'s frame.
function paintFrame(t, frame) {
  mapFontSize = Math.round(Math.max(14, Math.min(25, (14 * camera.width) / Math.max(1, canvasBox().width))));
  resizeWorldCanvas();
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / camera.width, canvas.height / camera.height);
  ctx.translate(-camera.x, -camera.y);
  frameLabels.length = 0;
  frameActorRects.length = 0;
  labelShift.clear();
  const actors = [];
  const sheet = images['img/characters/trainers.webp'];
  // People and creatures are drawn from the back of the scene to the front, so
  // whoever stands lower on the screen is drawn over whoever stands behind them.
  const paintActors = () =>
    actors
      .sort((a, b) => a.y - b.y)
      .forEach(actor => {
        ctx.save();
        ctx.translate(actor.ox || 0, actor.oy || 0);
        actor.draw();
        if (actor.labelRect) frameActorRects.push(screenLabelRect(actor.labelRect));
        ctx.restore();
      });
  if (state.room) {
    paintMap(room());
    for (const p of spots()) if (p.portrait !== undefined) pushPerson(actors, p, sheet);
    const follower = frame.follower;
    if (follower)
      actors.push({
        y: follower.y,
        labelRect: actorLabelRect(follower.x, follower.y, true),
        draw: () => drawFollower(follower, frame.followerPose),
      });
    if (state.team.length)
      actors.push({
        y: state.y + 0.5,
        labelRect: actorLabelRect(state.x, state.y),
        draw: () =>
          drawActor(images['img/characters/hero-traveler.webp'], state.x, state.y, null, frame.heroPose),
      });
    paintActors();
    spots().forEach(drawPointLabel);
  } else {
    paintTerrain();
    paintGangGround();
    const visible = [];
    for (let i = 0; i < PLACES.length; i++) {
      const [x, y] = worldOrigin(i);
      if (
        x > camera.x + camera.width ||
        x + 960 < camera.x ||
        y > camera.y + camera.height ||
        y + 640 < camera.y
      )
        continue;
      visible.push(i);
      ctx.save();
      ctx.translate(x, y);
      paintMap(PLACES[i], true, [x, y]);
      paintHabitats(PLACES[i], i);
      ctx.restore();
    }
    for (const i of visible) {
      ctx.save();
      ctx.translate(...worldOrigin(i));
      paintBoundary(i);
      ctx.restore();
    }
    for (const i of visible) {
      ctx.save();
      ctx.translate(...worldOrigin(i));
      paintAmbient(i, t);
      ctx.restore();
      const [ox, oy] = worldOrigin(i);
      for (const p of regionPoints(i)) if (p.portrait !== undefined) pushPerson(actors, p, sheet, ox, oy);
      for (const b of ROAD_ENDS)
        if (b.region === i) actors.push({ y: oy + b.y, ox, oy, draw: () => drawRoadBlock(b) });
    }
    gangActors(actors, sheet);
    const [hx, hy] = worldOrigin();
    const follower = frame.follower;
    if (follower)
      actors.push({
        y: hy + follower.y,
        ox: hx,
        oy: hy,
        labelRect: actorLabelRect(follower.x, follower.y, true),
        draw: () => drawFollower(follower, frame.followerPose),
      });
    if (state.team.length)
      actors.push({
        y: hy + state.y + 0.5,
        ox: hx,
        oy: hy,
        labelRect: actorLabelRect(state.x, state.y),
        draw: () =>
          drawActor(images['img/characters/hero-traveler.webp'], state.x, state.y, null, frame.heroPose),
      });
    paintActors();
    paintNight();
    for (const i of visible) {
      ctx.save();
      ctx.translate(...worldOrigin(i));
      regionPoints(i).forEach(p => {
        if (p.key === 'connector' && !regionAvailable(p.to))
          drawPointLabel({ ...p, name: 'JALUR TERKUNCI, lihat tujuan', color: '#edba86' });
        else drawPointLabel(p);
      });
      // A closed road names itself to whoever walks up to it.
      const [ox, oy] = worldOrigin(i),
        hero = worldPosition();
      for (const b of ROAD_ENDS)
        if (b.region === i && Math.hypot(hero.x - ox - b.x, hero.y - oy - b.y) < 90)
          drawLabelText(roadBlockPoint(b));
      ctx.restore();
    }
    paintGangLabels();
  }
  if (DEBUG && debugFlags.floor) paintDebugFloor();
  ctx.restore();
}

// A person, with the stall they keep: its back drawn behind them, its counter in front.
function pushPerson(actors, p, sheet, ox = 0, oy = 0) {
  const drawPerson = () => {
    if (!p.worldSprite) {
      drawActor(sheet, p.x, p.y, p.portrait);
      return;
    }
    const sprite = images[p.worldSprite];
    if (!sprite?.complete || !sprite.naturalWidth) return;
    const h = p.worldSpriteHeight,
      w = (h * sprite.naturalWidth) / sprite.naturalHeight;
    // Keep the interaction target at the customer edge when the seat is farther back.
    ctx.drawImage(sprite, p.x - w / 2, p.y + (p.worldSpriteOffsetY || 0) - h, w, h);
  };
  // Someone serving from behind a painted counter shows only above its top edge.
  const draw = p.behind
    ? () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x - 80, p.y - 200, 160, p.behind - (p.y - 200));
        ctx.clip();
        drawPerson();
        ctx.restore();
      }
    : drawPerson;
  const labelRect = p.worldSprite
    ? [p.x - 27, p.y + (p.worldSpriteOffsetY || 0) - p.worldSpriteHeight - 4, p.x + 27, p.y + 8]
    : actorLabelRect(p.x, p.y);
  const top = p.worldSprite ? p.y + (p.worldSpriteOffsetY || 0) - p.worldSpriteHeight : p.y - personHeight(p);
  actors.push({
    y: oy + p.y,
    ox,
    oy,
    labelRect,
    draw:
      p.key === 'trainer'
        ? () => {
            draw();
            drawTrainerMark(p, top);
          }
        : draw,
  });
  if (STALLS[p.stall]) {
    actors.push({ y: oy + p.y - 0.5, ox, oy, draw: () => STALLS[p.stall].back(p.x, p.y) });
    actors.push({ y: oy + p.y + 0.5, ox, oy, draw: () => STALLS[p.stall].front(p.x, p.y) });
  }
}
// Above a trainer's head: a small "!" while a battle is on offer, a faint tick once won.
// Trainers who cannot be challenged yet show nothing. It sits clear of the face.
function drawTrainerMark(p, top) {
  const beaten = state.defeated.includes(p.id);
  if (!beaten && !canChallenge(p.id)) return;
  const x = Math.round(p.x),
    y = Math.round(top) - 4;
  ctx.save();
  if (beaten) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#112c2acc';
    ctx.fillRect(x - 6, y - 9, 12, 9);
    ctx.strokeStyle = '#8fe0a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 5);
    ctx.lineTo(x - 1, y - 3);
    ctx.lineTo(x + 3, y - 7);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#112c2a';
    ctx.fillRect(x - 5, y - 14, 10, 13);
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.fillStyle = '#f3dc9a';
    ctx.fillRect(x - 4, y - 13, 8, 11);
    ctx.fillStyle = '#112c2a';
    ctx.fillRect(x - 1, y - 11, 2, 5);
    ctx.fillRect(x - 1, y - 5, 2, 2);
  }
  ctx.restore();
}
// A door shows a faint mat with a chevron pointing in, so entrances read at a glance.
function drawDoorMarker(p) {
  const x = Math.round(p.x),
    y = Math.round(p.y),
    glow = 0.35 + 0.15 * Math.sin(Date.now() / 450);
  ctx.save();
  ctx.fillStyle = `rgba(17, 44, 42, ${glow})`;
  ctx.fillRect(x - 12, y - 3, 24, 6);
  ctx.strokeStyle = `rgba(243, 220, 154, ${glow + 0.2})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 4);
  ctx.lineTo(x, y - 9);
  ctx.lineTo(x + 5, y - 4);
  ctx.stroke();
  ctx.restore();
}
// Pixel-art stalls. (x, y) is where the keeper's feet are, behind the counter.
function stallAwning(x, y, colours) {
  ctx.fillStyle = '#3d2a1c';
  ctx.fillRect(x - 33, y - 58, 4, 62);
  ctx.fillRect(x + 29, y - 58, 4, 62);
  for (let n = 0; n < 8; n++) {
    ctx.fillStyle = colours[n % 2];
    ctx.fillRect(x - 36 + n * 9, y - 66, 9, 12);
    ctx.beginPath();
    ctx.moveTo(x - 36 + n * 9, y - 54);
    ctx.lineTo(x - 31.5 + n * 9, y - 49);
    ctx.lineTo(x - 27 + n * 9, y - 54);
    ctx.fill();
  }
  ctx.fillStyle = '#00000033';
  ctx.fillRect(x - 36, y - 54, 72, 2);
}
function stallCounter(x, y, top, goods) {
  ctx.fillStyle = '#14282055';
  ctx.fillRect(x - 34, y + 4, 68, 5);
  ctx.fillStyle = '#6b4a2e';
  ctx.fillRect(x - 32, y - 14, 64, 18);
  ctx.fillStyle = '#87603b';
  for (let n = 0; n < 4; n++) ctx.fillRect(x - 30 + n * 16, y - 10, 14, 12);
  ctx.fillStyle = top;
  ctx.fillRect(x - 34, y - 18, 68, 5);
  for (const [dx, w, h, c] of goods) {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx, y - 18 - h, w, h);
  }
}
const STALLS = {
  daycare: {
    back(x, y) {
      stallAwning(x, y, ['#4c9a6a', '#f2ecd5']);
      // A shelf of resting capsules.
      ctx.fillStyle = '#5a3e27';
      ctx.fillRect(x - 28, y - 47, 56, 4);
      for (let n = 0; n < 5; n++) {
        const cx = x - 22 + n * 11;
        ctx.fillStyle = '#f6f2e6';
        ctx.beginPath();
        ctx.arc(cx, y - 51, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c8423a';
        ctx.beginPath();
        ctx.arc(cx, y - 51, 4, Math.PI, Math.PI * 2);
        ctx.fill();
      }
    },
    front(x, y) {
      stallCounter(x, y, '#cfe3c7', [[-28, 12, 8, '#f3dc9a']]);
      // Sign: a creature resting on a cushion.
      ctx.fillStyle = '#f7f2df';
      ctx.fillRect(x + 4, y - 12, 24, 13);
      ctx.fillStyle = '#4c9a6a';
      ctx.beginPath();
      ctx.ellipse(x + 16, y - 5, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f3b44';
      ctx.fillRect(x + 12, y - 8, 2, 2);
      ctx.fillRect(x + 18, y - 8, 2, 2);
    },
  },
};
// --- Region and room art.
function mapPaintBounds(origin) {
  if (!origin) return [0, 0, 960, 640];
  const sx = canvas.width / camera.width,
    sy = canvas.height / camera.height,
    left = Math.round((origin[0] - camera.x) * sx),
    top = Math.round((origin[1] - camera.y) * sy),
    right = Math.round((origin[0] + 960 - camera.x) * sx),
    bottom = Math.round((origin[1] + 640 - camera.y) * sy);
  // Facing paintings share the same backing-pixel boundary. Fractional image
  // edges otherwise leave a dark hairline as the continuous camera moves.
  return [left, top, right - left, bottom - top];
}
function paintMap(p, base = true, origin = null) {
  const im = images[p.image || 'img/maps/interior/interiors.webp'];
  if (base && im?.complete && im.naturalWidth) {
    const bounds = mapPaintBounds(origin);
    if (origin) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (p.tile < 0) ctx.drawImage(im, ...bounds);
    else {
      const w = im.naturalWidth / 2,
        h = im.naturalHeight / 2;
      ctx.drawImage(im, (p.tile % 2) * w, Math.floor(p.tile / 2) * h, w, h, ...bounds);
    }
    if (origin) ctx.restore();
  }
}
// A legend waits on the map, at the place it belongs to, until it joins a team.
const legendImages = new Map();
function paintLegends(i, t) {
  for (const p of PLACES[i].points) {
    if (p.key !== 'legend' || !p.at) continue;
    if ((state.legendCaught || []).includes(p.id)) continue;
    const src = creaturePortraitPath(p.id);
    if (!legendImages.has(src)) {
      const im = new Image();
      im.src = src;
      legendImages.set(src, im);
    }
    const im = legendImages.get(src),
      [x, y] = p.at,
      bob = Math.sin(t / 500) * 3;
    ctx.save();
    ctx.fillStyle = '#0a2c3a66';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 236, 150, ${0.45 + 0.25 * Math.sin(t / 300)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 26, 34, 38, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (im.complete && im.naturalWidth) ctx.drawImage(im, x - 30, y - 58 + bob, 60, 60);
    ctx.restore();
  }
}
// Tarsion waits in the observatory courtyard until it joins the team.
function paintAmbient(i, t) {
  paintLegends(i, t);
  paintFindSparkle(i, t);
  if (i !== REGION.OBSERVATORIUM || ownsTarsion()) return;
  const p = PLACES[REGION.OBSERVATORIUM].points.find(p => p.key === 'tarsion'),
    cell = followerCells.get('8:5:0');
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#10293977';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 1, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (cell) {
    const [sx, sy, sw, sh] = cell.rect,
      h = 54,
      w = (sw * h) / sh;
    ctx.drawImage(cell.canvas, sx, sy, sw, sh, p.x - w / 2, p.y - h, w, h);
  } else if (tarsionWorldPortrait.complete && tarsionWorldPortrait.naturalWidth)
    ctx.drawImage(tarsionWorldPortrait, p.x - 27, p.y - 54, 54, 54);
  if (!legendQuest().open) {
    ctx.strokeStyle = '#6ee5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 20, 28, 34, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Actors. `portrait` selects a character; without one the image is the player or a follower.
// A resident without a sprite yet: a magenta-and-black checkered figure with a "?",
// impossible to mistake for finished art (see docs/art-requests/resident-sprites-2026-10-13.md).
function drawPlaceholderPerson(x, y) {
  const h = state.room ? 47 : 36,
    w = 18,
    top = y - h;
  ctx.save();
  ctx.fillStyle = '#14282055';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let row = 0; row < h; row += 4)
    for (let col = 0; col < w; col += 4) {
      ctx.fillStyle = ((row + col) / 4) % 2 ? '#ff2bd6' : '#1a1a1a';
      ctx.fillRect(x - w / 2 + col, top + row, Math.min(4, w - col), Math.min(4, h - row));
    }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - w / 2, top, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(h * 0.5)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('?', x, top + h * 0.62);
  ctx.restore();
}
// The hero (portrait null) is drawn in the pose tickWorld() chose for this frame.
function drawActor(im, x, y, portrait = null, pose = null) {
  if (portrait === null) {
    drawPlayerSprite(im, x, y, pose);
    return;
  }
  const shadow = (rx, end = 7) => {
    ctx.fillStyle = '#14282055';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, rx, 3, 0, 0, end);
    ctx.fill();
  };
  if (isPlaceholderPortrait(portrait)) {
    drawPlaceholderPerson(x, y);
    return;
  }
  if (portrait === 90 || portrait === 91) {
    const sprite =
      images[
        portrait === 90 ? 'img/characters/wargamaret-kasir.webp' : 'img/characters/wargamaret-sela.webp'
      ];
    if (!sprite?.complete || !sprite.naturalWidth) return;
    const h = personHeight({ portrait }),
      w = (h * sprite.naturalWidth) / sprite.naturalHeight;
    ctx.save();
    shadow(9, Math.PI * 2);
    ctx.drawImage(sprite, x - w / 2, y - h, w, h);
    ctx.restore();
    return;
  }
  if (Object.hasOwn(SERVICE_PORTRAITS, portrait)) {
    const cell = serviceCells.get(Number(portrait));
    if (!cell) return;
    const [sx, sy, sw, sh] = cell.bounds,
      h = personHeight({ portrait });
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    shadow(8, Math.PI * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cell.canvas, sx, sy, sw, sh, x - (h * sw) / sh / 2, y - h, (h * sw) / sh, h);
    ctx.restore();
    return;
  }
  if (RESIDENTS[portrait]) {
    const cell = unifiedActors.get(actorRole(portrait));
    if (!cell) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    shadow(8);
    const [sx, sy, sw, sh] = cell.bounds,
      h = personHeight({ portrait });
    ctx.drawImage(cell.canvas, sx, sy, sw, sh, x - (h * sw) / sh / 2, y - h, (h * sw) / sh, h);
    ctx.restore();
    return;
  }
  const cell = castCells.get(portrait);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  shadow(9);
  if (cell) {
    const [sx, sy, sw, sh] = cell.bounds,
      h = personHeight({ portrait }),
      w = (h * sw) / sh;
    ctx.drawImage(cell.canvas, sx, sy, sw, sh, x - w / 2, y - h, w, h);
  } else if (portrait < 8 && im?.naturalWidth) {
    const sw = im.naturalWidth / 4,
      sh = im.naturalHeight / 2,
      h = personHeight({ portrait });
    ctx.drawImage(im, (portrait % 4) * sw, Math.floor(portrait / 4) * sh, sw, sh, x - h / 2, y - h, h, h);
  }
  ctx.restore();
}
function drawPlayerSprite(im, x, y, pose) {
  const scale = state.room ? 0.78 : 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (im === images['img/characters/hero-traveler.webp']) {
    if (im?.complete && im.naturalWidth && pose) {
      const [sx, sy, sw, sh] = HERO_FRAMES[pose.row][pose.column],
        height = 68,
        width = (height * sw) / sh;
      ctx.save();
      ctx.fillStyle = '#10272040';
      ctx.beginPath();
      ctx.ellipse(0, 1, 15, 5, 0, 0, 7);
      ctx.fill();
      ctx.drawImage(im, sx, sy, sw, sh, -width / 2, -height, width, height);
      ctx.restore();
    }
  } else if (im?.complete && im.naturalWidth) {
    ctx.save();
    ctx.fillStyle = '#10272040';
    ctx.beginPath();
    ctx.ellipse(0, 1, 17, 5, 0, 0, 7);
    ctx.fill();
    ctx.drawImage(im, -32, -65, 64, 64);
    ctx.restore();
  }
  ctx.restore();
}

// --- Place signs.
function drawMapProp(p) {
  if (p === futsalPenalty) return;
  if (['tarsion', 'resonator', 'tutor', 'hall', 'league'].includes(p.key)) return;

  if (p.key === 'door' && p.portrait === undefined) {
    drawDoorMarker(p);
    return;
  }
  if (p.portrait !== undefined || p.key === 'wild' || p.stall === 'painted') return;
  const x = Math.round(p.x),
    y = Math.round(p.y);
  ctx.save();
  ctx.fillStyle = '#122b2844';
  ctx.fillRect(x - 20, y - 3, 40, 7);
  if (p.key === 'camp') {
    ctx.fillStyle = '#674831';
    ctx.fillRect(x - 28, y - 24, 56, 28);
    ctx.fillStyle = '#c2a767';
    ctx.fillRect(x - 26, y - 22, 52, 24);
    ctx.fillStyle = '#587a65';
    for (let n = 0; n < 5; n++) ctx.fillRect(x - 25, y - 21 + n * 5, 50, 2);
    ctx.fillStyle = '#dbcc97';
    for (let n = 0; n < 8; n++) ctx.fillRect(x - 24 + n * 7, y - 21, 2, 23);
    ctx.fillStyle = '#274c4e';
    ctx.fillRect(x - 20, y - 21, 12, 20);
    ctx.fillStyle = '#759b85';
    ctx.fillRect(x - 19, y - 20, 10, 16);
  } else if (['tea', 'meal', 'shop', 'antidote'].includes(p.key)) {
    ctx.fillStyle = '#503b2b';
    ctx.fillRect(x - 22, y - 6, 5, 10);
    ctx.fillRect(x + 17, y - 6, 5, 10);
    ctx.fillStyle = '#b5824f';
    ctx.fillRect(x - 25, y - 20, 50, 15);
    ctx.fillStyle = '#dec08b';
    ctx.fillRect(x - 25, y - 22, 50, 5);
    ctx.fillStyle = p.key === 'antidote' ? '#d9ece0' : '#e0a951';
    ctx.fillRect(x - 14, y - 35, 12, 13);
    ctx.fillStyle = '#538878';
    ctx.fillRect(x + 4, y - 32, 12, 10);
    ctx.fillStyle = '#edf0c8';
    ctx.fillRect(x + 6, y - 34, 8, 3);
  } else if (p.stall === 'panel') {
    // A control cabinet: steel body, a lit screen and a row of switches.
    ctx.fillStyle = '#3c4a52';
    ctx.fillRect(x - 15, y - 40, 30, 42);
    ctx.fillStyle = '#6d7f88';
    ctx.fillRect(x - 13, y - 38, 26, 38);
    ctx.fillStyle = '#1d3b2f';
    ctx.fillRect(x - 10, y - 34, 20, 12);
    ctx.fillStyle = '#7cf0a8';
    ctx.fillRect(x - 8, y - 32, 6, 2);
    ctx.fillRect(x - 8, y - 28, 12, 2);
    for (const [dx, c] of [
      [-9, '#e46f4c'],
      [-2, '#f3dc9a'],
      [5, '#7fb7d9'],
    ]) {
      ctx.fillStyle = c;
      ctx.fillRect(x + dx, y - 16, 5, 5);
    }
    ctx.fillStyle = '#2b353b';
    ctx.fillRect(x - 13, y - 6, 26, 3);
  } else if (['news', 'board', 'quest', 'researchnote', 'tradecode'].includes(p.key)) {
    // A notice board on two legs with pinned papers.
    ctx.fillStyle = '#4a3423';
    ctx.fillRect(x - 20, y - 30, 4, 32);
    ctx.fillRect(x + 16, y - 30, 4, 32);
    ctx.fillStyle = '#8a5f3a';
    ctx.fillRect(x - 24, y - 44, 48, 28);
    ctx.fillStyle = '#c99a62';
    ctx.fillRect(x - 21, y - 41, 42, 22);
    for (const [dx, dy, w, h, c] of [
      [-18, -39, 12, 9, '#f7f2df'],
      [-4, -38, 10, 12, '#f3dc9a'],
      [8, -40, 11, 8, '#e8f1f4'],
      [-16, -28, 14, 7, '#f7f2df'],
    ]) {
      ctx.fillStyle = c;
      ctx.fillRect(x + dx, y + dy, w, h);
      ctx.fillStyle = '#c8423a';
      ctx.fillRect(x + dx + w / 2 - 1, y + dy, 2, 2);
    }
  } else if (p.key === 'trash') {
    ctx.fillStyle = '#d2c3a1';
    ctx.fillRect(x - 8, y - 13, 16, 12);
    ctx.fillStyle = '#768f91';
    ctx.fillRect(x - 3, y - 18, 9, 8);
  } else if (p.key === 'spring') {
    ctx.fillStyle = '#526663';
    ctx.fillRect(x - 23, y - 18, 46, 21);
    ctx.fillStyle = '#79c9d0';
    ctx.fillRect(x - 18, y - 15, 36, 13);
  } else {
    ctx.fillStyle = '#503c2e';
    ctx.fillRect(x - 3, y - 23, 6, 26);
    ctx.fillStyle = '#c39d65';
    ctx.fillRect(x - 19, y - 39, 38, 23);
    ctx.fillStyle = '#715539';
    ctx.fillRect(x - 17, y - 37, 34, 19);
    ctx.fillStyle = '#ead7a2';
    if (['next', 'back', 'exit'].includes(p.key)) {
      const right = p.key === 'next';
      ctx.fillRect(x - 10, y - 29, 20, 3);
      ctx.fillRect(x + (right ? 6 : -10), y - 32, 4, 9);
    } else {
      ctx.fillRect(x - 12, y - 32, 24, 2);
      ctx.fillRect(x - 12, y - 26, 17, 2);
    }
  }
  ctx.restore();
}
// Ronda Malam: outdoors at night the world dims to blue, with warm light around the
// player. Labels are drawn afterwards, so they stay readable.
function paintNight() {
  // Nyepi (calendar.js): the lights stay off, day and night.
  if (!state.room && typeof nyepiShade === 'function' && nyepiShade(ctx, camera)) return;
  if (state.room || typeof isNight !== 'function' || !isNight()) return;
  ctx.save();
  ctx.fillStyle = 'rgba(12, 20, 58, 0.42)';
  ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
  const p = worldPosition(),
    glow = ctx.createRadialGradient?.(p.x, p.y - 20, 10, p.x, p.y - 20, 130);
  if (glow) {
    glow.addColorStop(0, 'rgba(255, 214, 150, 0.22)');
    glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 140, p.y - 160, 280, 280);
  }
  ctx.restore();
}
function updateWildLocator() {
  const point = !state.room && followingMon() && region().wild.length && spots().find(p => p.key === 'wild');
  locator.hidden = !point || !!battle || !!modalKind;
  if (!point) return;
  const label = I18N.t(isNight() ? 'wild.find.night' : 'wild.find');
  locator.querySelector('span:last-child').textContent = label;
  locator.setAttribute('aria-label', label);
}
