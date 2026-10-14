/* Batik colours. One wild encounter in 128 is rare-coloured (interact.js); such a creature
   wears one batik palette for life, stored on it as `batik` (a key of BATIK_PALETTES).
   The palette is a gradient map over the portrait's own shading, with the motif of its
   cloth woven faintly into the body. Recoloured pictures are made once per species and
   palette and cached: portraits as object URLs, follower frames as canvases. */

// Keys are stored in saves and team codes by position: append, never reorder.
const BATIK_PALETTES = Object.freeze({
  // Yogyakarta soga brown on cream, with the diagonal knife-edge bands.
  parang: { stops: ['#21110a', '#5e3215', '#b27434', '#f1dcae'], motif: 'parang' },
  // Indigo and white with four-petal palm-fruit rings.
  kawung: { stops: ['#0f1a33', '#29487a', '#8ea9cc', '#f3ecdc'], motif: 'kawung' },
  // Cirebon cloud: deep sea blue to sky, concentric cloud lines.
  megamendung: { stops: ['#0a2440', '#1a5c97', '#5eaedf', '#eaf6fc'], motif: 'cloud' },
  // Truntum: a night-dark ground with small blossoms, plum to rose.
  truntum: { stops: ['#1a0c1d', '#55203b', '#c24a6c', '#f8dccb'], motif: 'truntum' },
  // Sidomukti: gold on dark olive with a diamond lattice.
  sidomukti: { stops: ['#1b170b', '#4c4220', '#b0933c', '#f3e6ad'], motif: 'lattice' },
  // Lasem: the coast's chicken-blood red with dotted scatter.
  lasem: { stops: ['#2a0909', '#8a1b1b', '#da5a3c', '#f8e5c4'], motif: 'dots' },
});
const BATIK_KEYS = Object.keys(BATIK_PALETTES);
// A small stable hash (FNV-1a) of any text.
function batikHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
// The palette a seed always gives.
const batikFromSeed = seed => BATIK_KEYS[batikHash(seed) % BATIK_KEYS.length];
// A new rare creature's palette: drawn once, then kept on the creature.
const rollBatik = id => batikFromSeed(`${id}:${Math.random()}:${Date.now()}`);
// The palette a creature wears, or null for ordinary colours.
function batikFor(m) {
  if (!m?.variant) return null;
  return Object.hasOwn(BATIK_PALETTES, m.batik) ? m.batik : 'parang';
}
const batikName = key => I18N.t(`batik.${key}`);
// A short tag for team and storage cards.
function batikTag(m) {
  const key = batikFor(m);
  return key
    ? `<span class="batik-tag batik-tag-${key}" title="${I18N.t('batik.note')}">✦ ${batikName(key)}</span>`
    : '';
}

// --- Recolouring.
const hexRGB = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const BATIK_RAMPS = Object.fromEntries(
  BATIK_KEYS.map(key => {
    // 256 entries: the palette's four stops spread over the light range.
    const stops = BATIK_PALETTES[key].stops.map(hexRGB),
      ramp = new Uint8ClampedArray(256 * 3);
    for (let v = 0; v < 256; v++) {
      const t = (v / 255) * (stops.length - 1),
        i = Math.min(stops.length - 2, Math.floor(t)),
        f = t - i;
      for (let c = 0; c < 3; c++) ramp[v * 3 + c] = stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f;
    }
    return [key, ramp];
  }),
);
// How strongly the motif marks a pixel, 0 to 1. `u`, `v` are in motif cells.
const BATIK_MOTIFS = {
  parang(u, v) {
    const d = (((u + v) % 1) + 1) % 1;
    return d > 0.44 && d < 0.56 ? 1 : d > 0.36 && d < 0.4 ? 0.5 : 0;
  },
  kawung(u, v) {
    const x = (((u % 1) + 1) % 1) - 0.5,
      y = (((v % 1) + 1) % 1) - 0.5;
    // Four ellipses meeting at the centre of each cell.
    let ring = 0;
    for (const [cx, cy, rx, ry] of [
      [0, -0.25, 0.14, 0.22],
      [0, 0.25, 0.14, 0.22],
      [-0.25, 0, 0.22, 0.14],
      [0.25, 0, 0.22, 0.14],
    ]) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e > 0.7 && e < 1.05) ring = 1;
    }
    return ring;
  },
  cloud(u, v) {
    const x = (((u % 1) + 1) % 1) - 0.5,
      y = (((v % 1) + 1) % 1) - 0.3,
      r = Math.hypot(x * 1.3, y) * 9 + Math.sin(x * 12) * 0.35;
    return r < 4.6 && r % 1 < 0.22 ? 1 : 0;
  },
  truntum(u, v) {
    const x = (((u % 1) + 1) % 1) - 0.5,
      y = (((v % 1) + 1) % 1) - 0.5,
      a = Math.atan2(y, x),
      r = Math.hypot(x, y);
    return r < 0.16 + 0.07 * Math.cos(a * 4) ? 1 : 0;
  },
  lattice(u, v) {
    const d = Math.abs(((((u + 0.5) % 1) + 1) % 1) - 0.5) + Math.abs(((((v + 0.5) % 1) + 1) % 1) - 0.5);
    return d > 0.43 ? 1 : d > 0.2 && d < 0.25 ? 0.6 : 0;
  },
  dots(u, v) {
    const x = (((u % 1) + 1) % 1) - 0.5,
      y = (((v % 1) + 1) % 1) - 0.5,
      off = Math.floor(u) % 2 ? 0.25 : -0.25;
    return Math.hypot(x, y - off) < 0.11 || Math.hypot(x - 0.5, y + off) < 0.07 ? 1 : 0;
  },
};
// Recolours RGBA pixels in place. Shared by portraits and follower frames, and kept free
// of the DOM so tests can check it on a plain array.
function batikPixels(data, w, h, key, cells = 7) {
  const palette = BATIK_PALETTES[key] || BATIK_PALETTES.parang,
    ramp = BATIK_RAMPS[key] || BATIK_RAMPS.parang,
    motif = BATIK_MOTIFS[palette.motif],
    light = hexRGB(palette.stops[3]),
    dark = hexRGB(palette.stops[0]),
    size = Math.max(w, h) / cells;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (data[p + 3] < 8) continue;
      const r = data[p],
        g = data[p + 1],
        b = data[p + 2],
        lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b),
        // Outlines and deep shadow stay dark, so the creature keeps its shape.
        keep = lum < 36 ? 0.55 : 0.18;
      let nr = ramp[lum * 3] * (1 - keep) + r * keep,
        ng = ramp[lum * 3 + 1] * (1 - keep) + g * keep,
        nb = ramp[lum * 3 + 2] * (1 - keep) + b * keep;
      const mark = lum > 36 && lum < 235 ? motif(x / size, y / size) * 0.3 : 0;
      if (mark) {
        // The motif is drawn in the palette's light colour on dark cloth, dark on light.
        const ink = lum < 128 ? light : dark;
        nr += (ink[0] - nr) * mark;
        ng += (ink[1] - ng) * mark;
        nb += (ink[2] - nb) * mark;
      }
      data[p] = nr;
      data[p + 1] = ng;
      data[p + 2] = nb;
    }
  return data;
}
// A recoloured copy of an image or canvas, at most `limit` pixels on its long side.
function batikCanvas(source, key, limit = 0) {
  const sw = source.naturalWidth || source.width,
    sh = source.naturalHeight || source.height,
    scale = limit && Math.max(sw, sh) > limit ? limit / Math.max(sw, sh) : 1,
    c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  const cc = c.getContext('2d', { willReadFrequently: true });
  cc.drawImage(source, 0, 0, c.width, c.height);
  const pixels = cc.getImageData(0, 0, c.width, c.height);
  batikPixels(pixels.data, c.width, c.height, key);
  cc.putImageData(pixels, 0, 0);
  return c;
}

// --- Portraits. Until a recoloured portrait is ready, the plain one shows with a CSS
// approximation of its palette; when it is ready, every copy on screen switches over.
const batikPortraits = new Map();
function batikPortraitURL(id, key) {
  const name = `${id}:${key}`,
    hit = batikPortraits.get(name);
  if (typeof hit === 'string') return hit;
  if (hit) return null;
  const src = creaturePortraitPath(id);
  if (!src || typeof Image.prototype.addEventListener !== 'function') return null;
  batikPortraits.set(name, { pending: true });
  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => {
    try {
      const canvas = batikCanvas(image, key, 384),
        done = url => {
          batikPortraits.set(name, url);
          for (const el of document.querySelectorAll(`img[data-batik="${name}"]`)) {
            el.src = url;
            el.classList.remove('variant-colours');
          }
        };
      if (canvas.toBlob) canvas.toBlob(blob => done(blob ? URL.createObjectURL(blob) : canvas.toDataURL()));
      else done(canvas.toDataURL());
    } catch {
      batikPortraits.set(name, { failed: true });
    }
  });
  image.addEventListener('error', () => batikPortraits.set(name, { failed: true }));
  image.src = src;
  return null;
}
function batikArt(m) {
  const key = batikFor(m),
    url = batikPortraitURL(m.id, key),
    plain = art(m.id);
  if (!plain) return '';
  return url
    ? plain.replace(/src="[^"]*"/, `src="${url}"`).replace('class="sprite', `class="sprite batik-colours`)
    : plain.replace(
        'class="sprite',
        `data-batik="${m.id}:${key}" class="sprite variant-colours batik-${key}`,
      );
}

// --- Followers: the frame drawn on the map, recoloured once per frame and palette.
const batikFrames = new WeakMap();
function batikFrame(source, key) {
  if (!source || !key) return source;
  let byKey = batikFrames.get(source);
  if (!byKey) batikFrames.set(source, (byKey = new Map()));
  if (!byKey.has(key)) {
    try {
      byKey.set(key, batikCanvas(source, key));
    } catch {
      byKey.set(key, source);
    }
  }
  return byKey.get(key);
}
