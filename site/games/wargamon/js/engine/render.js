/* Drawing the map: the frame loop, region art, actors and place signs. */

// --- Frame loop.
// One animation frame. A frame that throws is reported through the loading
// overlay and retried; it must never stop the loop for good.
function draw(t) {
  try {
    heroMotion.time = t;
    paintFrame(t);
    sceneLoading();
    if (state.region === 9 && deliveryState().carry && !battle)
      $('hint').textContent =
        'Pesanan hangat, ' + deliveryRemaining() + ' langkah, ' + DELIVERY_ORDERS[deliveryState().done].name;
    if (!battle && !modalKind) {
      const p = nearest();
      if (p && Math.hypot(p.x - state.x, p.y - state.y) <= reachOf(p))
        $('hint').textContent = 'E, ' + shortPlaceName(p);
    }
    lastPaintAt = Date.now();
    paintFailure = null;
    if (visibleActorAssets().every(asset => asset.ready)) {
      paintedScene = sceneToken();
      requestOfflineArt();
    }
  } catch (error) {
    paintFailure = error;
    console.error('Map rendering failed', error);
    try {
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } catch {}
    setTimeout(() => requestAnimationFrame(draw), 1000);
  }
  refreshLoadingState();
}
// Match the browser's backing pixels without changing the camera or map scale.
function resizeWorldCanvas() {
  const box = canvas.getBoundingClientRect(),
    ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
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
  const box = canvas.getBoundingClientRect(),
    aspect = box.height > 0 ? box.width / box.height : 1.5;
  camera.height = 400;
  camera.width = aspect >= 1.5 ? 600 : Math.max(240, Math.round(400 * aspect));
}
function paintFrame(t) {
  fitCamera();
  mapFontSize = Math.round(
    Math.max(14, Math.min(25, (14 * camera.width) / Math.max(1, canvas.getBoundingClientRect().width))),
  );
  if (held && t - lastStep > 45) {
    const dirs = { up: [0, -7], down: [0, 7], left: [-7, 0], right: [7, 0] };
    movement(...dirs[held]);
    lastStep = t;
  }
  cameraPosition();
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
    const follower = trackFollower();
    if (follower)
      actors.push({
        y: follower.y,
        labelRect: actorLabelRect(follower.x, follower.y, true),
        draw: () => drawFollower(t, follower),
      });
    if (state.team.length)
      actors.push({
        y: state.y + 0.5,
        labelRect: actorLabelRect(state.x, state.y),
        draw: () => drawActor(images['img/characters/hero-traveler.webp'], state.x, state.y),
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
    }
    gangActors(actors, sheet);
    const [hx, hy] = worldOrigin();
    const follower = trackFollower();
    if (follower)
      actors.push({
        y: hy + follower.y,
        ox: hx,
        oy: hy,
        labelRect: actorLabelRect(follower.x, follower.y, true),
        draw: () => drawFollower(t, follower),
      });
    if (state.team.length)
      actors.push({
        y: hy + state.y + 0.5,
        ox: hx,
        oy: hy,
        labelRect: actorLabelRect(state.x, state.y),
        draw: () => drawActor(images['img/characters/hero-traveler.webp'], state.x, state.y),
      });
    paintActors();
    for (const i of visible) {
      ctx.save();
      ctx.translate(...worldOrigin(i));
      regionPoints(i).forEach(p => {
        if (p.key === 'connector' && !regionAvailable(p.to))
          drawPointLabel({ ...p, name: 'JALUR TERKUNCI, lihat tujuan', color: '#edba86' });
        else drawPointLabel(p);
      });
      ctx.restore();
    }
    paintGangLabels();
  }
  if (DEBUG && debugFlags.floor) paintDebugFloor();
  ctx.restore();
  requestAnimationFrame(draw);
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
  actors.push({ y: oy + p.y, ox, oy, labelRect, draw });
  if (STALLS[p.stall]) {
    actors.push({ y: oy + p.y - 0.5, ox, oy, draw: () => STALLS[p.stall].back(p.x, p.y) });
    actors.push({ y: oy + p.y + 0.5, ox, oy, draw: () => STALLS[p.stall].front(p.x, p.y) });
  }
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
  kiosk: {
    back(x, y) {
      stallAwning(x, y, ['#c8423a', '#f2e6cf']);
      ctx.fillStyle = '#5a3e27';
      ctx.fillRect(x - 28, y - 46, 56, 4);
      for (const [dx, c] of [
        [-26, '#e0a951'],
        [-16, '#5fae6a'],
        [-6, '#d9ece0'],
        [4, '#e46f4c'],
        [14, '#7fb7d9'],
      ]) {
        ctx.fillStyle = c;
        ctx.fillRect(x + dx, y - 54, 8, 8);
      }
    },
    front(x, y) {
      stallCounter(x, y, '#d9b27a', [
        [-26, 10, 7, '#e0a951'],
        [-12, 8, 9, '#538878'],
        [14, 12, 6, '#d9ece0'],
      ]);
    },
  },
  ticket: {
    back(x, y) {
      stallAwning(x, y, ['#2f6d9e', '#e6eef4']);
      ctx.fillStyle = '#f3dc9a';
      ctx.fillRect(x - 18, y - 48, 36, 9);
      ctx.fillStyle = '#2f3b44';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('LOKET', x, y - 41);
    },
    front(x, y) {
      stallCounter(x, y, '#c9d6de', [
        [-20, 14, 4, '#f7f2df'],
        [10, 10, 6, '#e46f4c'],
      ]);
    },
  },
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
  if (i !== 13 || ownsTarsion()) return;
  const p = PLACES[13].points.find(p => p.key === 'tarsion'),
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
function drawActor(im, x, y, portrait = null) {
  if (portrait === null) {
    drawPlayerSprite(im, x, y);
    return;
  }
  const shadow = (rx, end = 7) => {
    ctx.fillStyle = '#14282055';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, rx, 3, 0, 0, end);
    ctx.fill();
  };
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
function drawPlayerSprite(im, x, y) {
  const scale = state.room ? 0.78 : 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (im === images['img/characters/hero-traveler.webp']) {
    if (im?.complete && im.naturalWidth) {
      const pose = heroPose(heroMotion.time),
        [sx, sy, sw, sh] = HERO_FRAMES[pose.row][pose.column],
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

  if (p.portrait !== undefined || p.key === 'door' || p.key === 'wild' || p.stall === 'painted') return;
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
  } else if (['news', 'board', 'quest', 'researchnote'].includes(p.key)) {
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
function placeLabel(p, b) {
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
    x: Math.max(w / 2 + 5, Math.min(955 - w / 2, x + (p.labelOffsetX || 0))) + shift.dx,
    y: (p.portrait !== undefined ? y + 25 : y - 48) + (p.labelOffsetY || 0) + shift.dy,
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
function terrainTileAt(x, y) {
  let best = 0,
    d = Infinity;
  WORLD_ORIGINS.forEach(([ox, oy], i) => {
    const dd = Math.hypot(Math.max(ox - x, 0, x - ox - 960), Math.max(oy - y, 0, y - oy - 640));
    if (dd < d) {
      d = dd;
      best = i;
    }
  });
  return best === 5 ? 3 : best === 6 ? 2 : best === 7 ? 1 : 0;
}
function paintTerrain() {
  ctx.fillStyle = '#537346';
  ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
  ctx.fillStyle = '#173f2b99';
  ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
}
function strokeLink(l) {
  if (l.scene) return;
  if (l.gap) {
    // Both maps already paint their own paths. Blend only the short strip
    // between their facing edges; never draw a cap or pavement over either map.
    const [[ax, ay], [bx, by]] = l.gap,
      length = Math.hypot(bx - ax, by - ay),
      dx = (bx - ax) / length,
      dy = (by - ay) / length,
      vertical = ax === bx,
      [from, to] = l.colors || [
        [175, 166, 148],
        [175, 166, 148],
      ];
    for (let n = 0; n < length; n += 2) {
      const t = n / length,
        color = from.map((v, i) => Math.round(v + (to[i] - v) * t));
      ctx.fillStyle = `rgb(${color.join(',')})`;
      ctx.fillRect(
        Math.min(ax + dx * n, ax + dx * (n + 2)) - (vertical ? l.width / 2 : 0),
        Math.min(ay + dy * n, ay + dy * (n + 2)) - (vertical ? 0 : l.width / 2),
        vertical ? l.width : 2,
        vertical ? 2 : l.width,
      );
    }
    return;
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // A packed-earth path with a soft shadowed edge, like the paths painted in the maps.
  for (const [width, color] of [
    [l.width ? l.width + 6 : 58, '#2b3a2455'],
    [l.width || 52, '#8f7a57'],
    [l.width ? l.width - 6 : 46, '#c2ab80'],
    [l.width ? l.width - 22 : 30, '#cbb68d'],
  ]) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    l.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();
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
function updateWildLocator() {
  const point = !state.room && followingMon() && region().wild.length && spots().find(p => p.key === 'wild');
  locator.hidden = !point || !!battle || !!modalKind;
  if (!point) return;
  const label = I18N.t(isNight() ? 'wild.find.night' : 'wild.find');
  locator.querySelector('span:last-child').textContent = label;
  locator.setAttribute('aria-label', label);
}
