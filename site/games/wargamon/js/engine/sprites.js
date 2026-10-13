/* Character, follower and facade art: loading sheets and cutting them into sprites. */
for (const name of ['img/maps/interior/interiors.webp']) {
  const im = new Image();
  im.src = name;
  images[name] = im;
}
for (const name of ['img/maps/interior/clinic.webp']) {
  const im = new Image();
  im.src = name;
  images[name] = im;
}
// Portraits share one transparent, feet-anchored rendering path.
const castCells = new Map();
function prepareCast(im, sheet) {
  if (!im.naturalWidth || !document.createElement) return;
  for (let j = 0; j < (sheet === 2 ? 9 : 12); j++) {
    const c = document.createElement('canvas');
    c.width = im.naturalWidth / 4;
    const column = j % 4,
      row = Math.floor(j / 4),
      scan = document.createElement('canvas');
    scan.width = c.width;
    scan.height = im.naturalHeight;
    const sc = scan.getContext('2d');
    sc.drawImage(im, column * c.width, 0, c.width, im.naturalHeight, 0, 0, c.width, im.naturalHeight);
    const pixels = sc.getImageData(0, 0, c.width, scan.height).data;
    const boundary = n => {
      if (n === 0) return 0;
      if (n === 3) return scan.height;
      let best = Math.round((n * scan.height) / 3),
        score = Infinity;
      for (let y = best - 45; y < Math.round((n * scan.height) / 3) + 45; y++) {
        let count = 0;
        for (let x = 0; x < c.width; x++) if (pixels[(y * c.width + x) * 4 + 3] > 30) count++;
        const cost = count * 100 + Math.abs(y - (n * scan.height) / 3);
        if (cost < score) {
          score = cost;
          best = y;
        }
      }
      return best;
    };
    const y0 = boundary(row),
      y1 = boundary(row + 1);
    c.height = y1 - y0;
    const cc = c.getContext('2d');
    cc.drawImage(scan, 0, y0, c.width, c.height, 0, 0, c.width, c.height);
    const bounds = isolateSprite(c);
    castCells.set(8 + sheet * 12 + j, { canvas: c, bounds });
    const style = document.createElement('style');
    style.textContent = `.trainer-sprite.cast${8 + sheet * 12 + j}{background-image:url(${c.toDataURL()});background-size:contain;background-position:center;background-repeat:no-repeat;mix-blend-mode:normal;filter:none}`;
    document.head.appendChild(style);
  }
}
[
  'img/characters/characters-a.webp',
  'img/characters/characters-b.webp',
  'img/characters/characters-c.webp',
].forEach((name, i) => {
  const im = new Image();
  images[name] = im;
  im.onload = () => prepareCast(im, i);
  im.src = name;
});
function prepareServices() {
  const im = images['img/characters/trainers.webp'];
  if (!im?.naturalWidth || !document.createElement) return;
  for (let id = 0; id < 8; id++) {
    const c = document.createElement('canvas');
    c.width = im.naturalWidth / 4;
    c.height = im.naturalHeight / 2;
    c.getContext('2d').drawImage(
      im,
      (id % 4) * c.width,
      Math.floor(id / 4) * c.height,
      c.width,
      c.height,
      0,
      0,
      c.width,
      c.height,
    );
    castCells.set(id, { canvas: c, bounds: isolateSprite(c) });
    const style = document.createElement('style');
    style.textContent = `.trainer-sprite.cast${id}{background-image:url(${c.toDataURL()});background-size:contain;background-position:center;background-repeat:no-repeat}`;
    document.head.appendChild(style);
  }
}
if (images['img/characters/trainers.webp'].complete) prepareServices();
else images['img/characters/trainers.webp'].addEventListener?.('load', prepareServices);
registerFollowerSheet(9, followerAtlasPath(9), bearFollowers => {
  for (let col = 0; col < 4; col++) {
    const w = Math.floor(bearFollowers.naturalWidth / 4),
      c = document.createElement('canvas');
    c.width = w;
    c.height = bearFollowers.naturalHeight;
    c.getContext('2d').drawImage(bearFollowers, col * w, 0, w, c.height, 0, 0, w, c.height);
    followerCells.set('9:0:' + col, { canvas: c, rect: isolateGeneratedSprite(c) });
  }
});
// Padded portrait crops and four follower directions per species.
registerFollowerSheet(10, followerAtlasPath(10), distinctFollowers => {
  for (let r = 0; r < 3; r++)
    for (let col = 0; col < 4; col++) {
      const w = distinctFollowers.naturalWidth / 4,
        h = distinctFollowers.naturalHeight / 3,
        c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(distinctFollowers, col * w, r * h, w, h, 0, 0, w, h);
      followerCells.set('10:' + r + ':' + col, { canvas: c, rect: isolateGeneratedSprite(c) });
    }
});
function isolateActor(canvas) {
  const c = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    im = c.getImageData(0, 0, w, h),
    d = im.data,
    seen = new Uint8Array(w * h),
    queue = [];
  function add(n) {
    if (n < 0 || n >= w * h || seen[n]) return;
    seen[n] = 1;
    const k = n * 4,
      lo = Math.min(d[k], d[k + 1], d[k + 2]),
      hi = Math.max(d[k], d[k + 1], d[k + 2]);
    if (d[k + 3] < 20 || (lo > 170 && hi - lo < 15)) {
      d[k + 3] = 0;
      queue.push(n);
    }
  }
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i],
      x = n % w;
    if (x) add(n - 1);
    if (x < w - 1) add(n + 1);
    add(n - w);
    add(n + w);
  }
  let l = w,
    t = h,
    r = -1,
    b = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 20) {
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
      }
  c.putImageData(im, 0, 0);
  return r < 0 ? [0, 0, w, h] : [l, t, r - l + 1, b - t + 1];
}
const unifiedActors = new Map(),
  unifiedUrls = new Map();
const femaleTrainers = new Set([0, 6, 8, 10, 15, 16, 18, 21, 25, 27, 29, 31, 36, 39, 42, 46]);
// Townspeople drawn from the shared character sheet: portrait number to sheet cell.
const RESIDENTS = {
  60: { role: 3, label: 'Perawat' },
  61: { role: 4, label: 'Apoteker' },
  62: { role: 2, label: 'Petugas ronda' },
  63: { role: 1, label: 'Penjual warung' },
  64: { role: 9, label: 'Relawan' },
  65: { role: 5, label: 'Pengamen' },
};
function actorRole(portrait) {
  if (RESIDENTS[portrait]) return RESIDENTS[portrait].role;
  const t = TRAINERS.find(t => t.portrait === portrait),
    i = TRAINERS.indexOf(t);
  if (!t) return { 0: 0, 1: 1, 2: 1, 3: 2, 4: 8, 5: 3, 6: 6, 7: 10 }[portrait] ?? 8;
  const female = femaleTrainers.has(i),
    role = (t.role || '') + ' ' + (t.name || '');
  if (/peneliti|ilmuwan|surya|habibie|hitun/i.test(role)) return female ? 7 : 4;
  if (/atlet|bulu|tangkis|olahraga|natsir|senjaya|selam/i.test(role)) return female ? 9 : 6;
  if (/penyanyi|singer|musik|aktor|artis|pelawak|komedian|raisa|agnes|tulus/i.test(role))
    return female ? 5 : 10;
  if (/pendaki|hiker|gunung/i.test(role)) return female ? 9 : 6;
  if (i === 0) return 2;
  return female ? 11 : 2;
}
const unifiedSheet = new Image();
unifiedSheet.onload = () => {
  const xs = [0, 324, 648, 972, 1295],
    ys = [0, 434, 814, 1214];
  for (let i = 0; i < 12; i++) {
    const col = i % 4,
      row = Math.floor(i / 4),
      c = document.createElement('canvas');
    c.width = xs[col + 1] - xs[col];
    c.height = ys[row + 1] - ys[row];
    c.getContext('2d').drawImage(unifiedSheet, xs[col], ys[row], c.width, c.height, 0, 0, c.width, c.height);
    const bounds = isolateActor(c);
    unifiedActors.set(i, { canvas: c, bounds });
    const out = document.createElement('canvas');
    out.width = out.height = 256;
    const [sx, sy, sw, sh] = bounds,
      hh = 240,
      ww = (hh * sw) / sh;
    out.getContext('2d').drawImage(c, sx, sy, sw, sh, (256 - ww) / 2, 8, ww, hh);
    unifiedUrls.set(i, out.toDataURL());
  }
  const style = document.createElement('style');
  style.textContent = [...unifiedUrls]
    .map(
      ([i, url]) =>
        `:root .trainer-sprite.unified-actor.actor-role-${i}{background-image:url(${url});background-size:contain;background-position:center;background-repeat:no-repeat;filter:none}`,
    )
    .join('');
  document.head.appendChild(style);
};
unifiedSheet.src = 'img/characters/characters-unified.webp';
/* Measured cells; edge-connected matte removal preserves eyes and pale body details. */
registerFollowerSheet(11, followerAtlasPath(11), balanceFollowers => {
  const ys = [0, 247, 490, 685, 913, 1140, 1382, 1659];
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 4; col++) {
      const c = document.createElement('canvas');
      c.width = 237;
      c.height = ys[row + 1] - ys[row];
      c.getContext('2d').drawImage(balanceFollowers, col * 237, ys[row], 237, c.height, 0, 0, 237, c.height);
      followerCells.set(`11:${row}:${col}`, { canvas: c, rect: isolateActor(c) });
    }
});
for (const key of LATE_ROOM_KEYS) deferMapImage(ROOMS[key].image);
const EVERYDAY_FOLLOWERS = [
  { sheet: 12, x: [0, 328, 656, 984, 1312], y: [0, 263, 477, 732, 959, 1199] },
  { sheet: 13, x: [0, 280, 561, 842, 1122], y: [0, 319, 561, 836, 1070, 1402] },
  { sheet: 14, x: [0, 280, 561, 842, 1122], y: [0, 280, 561, 820, 1100, 1402] },
];
for (const spec of EVERYDAY_FOLLOWERS)
  registerFollowerSheet(spec.sheet, followerAtlasPath(spec.sheet), im => {
    for (let r = 0; r < 5; r++)
      for (let col = 0; col < 4; col++) {
        const c = document.createElement('canvas');
        c.width = spec.x[col + 1] - spec.x[col];
        c.height = spec.y[r + 1] - spec.y[r];
        c.getContext('2d').drawImage(im, spec.x[col], spec.y[r], c.width, c.height, 0, 0, c.width, c.height);
        followerCells.set(spec.sheet + ':' + r + ':' + col, { canvas: c, rect: isolateSprite(c) });
      }
  });
/* Service characters use the cast proportions in dialogue and on the map. */
const SERVICE_PORTRAITS = {
  0: 'Tukang parkir',
  1: 'Pengemudi ojek',
  2: 'Manusia silver',
  3: 'Ibu warung',
  4: 'Pendaki',
  5: 'Tenaga medis',
  6: 'Pak kantin',
  7: 'Pak RT',
};
const serviceCells = new Map(),
  serviceSheet = new Image();
serviceSheet.onload = () => {
  const xs = [100, 500, 885, 1275, 1680],
    ys = [0, 445, 887];
  for (let id = 0; id < 8; id++) {
    const col = id % 4,
      row = Math.floor(id / 4),
      c = document.createElement('canvas');
    c.width = xs[col + 1] - xs[col];
    c.height = ys[row + 1] - ys[row];
    c.getContext('2d').drawImage(serviceSheet, xs[col], ys[row], c.width, c.height, 0, 0, c.width, c.height);
    serviceCells.set(id, { canvas: c, bounds: isolateActor(c) });
    const b = serviceCells.get(id).bounds,
      out = document.createElement('canvas');
    out.width = out.height = 256;
    const scale = 238 / Math.max(b[2], b[3]);
    out.getContext('2d').drawImage(c, ...b, (256 - b[2] * scale) / 2, 8, b[2] * scale, b[3] * scale);
    const style = document.createElement('style');
    style.textContent = `:root .trainer-sprite.trainer-sprite.service-${id}{background-image:url(${out.toDataURL()});background-size:contain;background-position:center;background-repeat:no-repeat}`;
    document.head.appendChild(style);
  }
};
serviceSheet.src = 'img/characters/npcs-modern.webp';
images['img/characters/npcs-modern.webp'] = serviceSheet;
