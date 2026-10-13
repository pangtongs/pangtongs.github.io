'use strict';
// Image loading and the sprite cache.
//
// Glows (shadowBlur) and gradients are expensive to rasterize, and the original game
// paid that cost for every gem, bolt and enemy every frame. Here each look is drawn
// once into a small offscreen canvas and blitted with drawImage afterwards.

const loadImage = src => { const im = new Image(); im.src = src; return im; };
const mageImages = ['mage-0', 'mage-1', 'mage-2', 'mage-north'].map(n => loadImage(`assets/${n}.webp`));
const bossImages = STAGES.map((_, i) => loadImage(`assets/boss-${i}.webp`));
const imageReady = im => im.complete && im.naturalWidth > 0;

const SPRITE_RES = 2; // offscreen pixels per world unit, so sprites stay sharp on 2x screens
const SHADOW_BLUR = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');

// A pre-rendered image centered on its anchor. draw(ctx) paints around (0,0) in world units.
function makeSprite(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SPRITE_RES);
  c.height = Math.ceil(h * SPRITE_RES);
  const x = c.getContext('2d');
  // shadowBlur ignores the transform, so scale it to match the supersampling.
  Object.defineProperty(x, 'shadowBlur', {set: v => SHADOW_BLUR.set.call(x, v * SPRITE_RES), get: () => SHADOW_BLUR.get.call(x) / SPRITE_RES});
  x.scale(SPRITE_RES, SPRITE_RES);
  x.translate(w / 2, h / 2);
  draw(x);
  const sprite = {img: c, w, h, hw: w / 2, hh: h / 2};
  toBitmap(sprite);
  return sprite;
}

// Swap a sprite's canvas for an immutable ImageBitmap once ready. Bitmaps blit fast
// whether the main canvas is GPU- or CPU-backed; a GPU canvas used as a source for a
// CPU canvas would otherwise be read back on every draw.
function toBitmap(sprite) {
  if (typeof createImageBitmap !== 'function') return;
  createImageBitmap(sprite.img).then(bm => { sprite.img = bm; }, () => {});
}

// Solid-white copy of a sprite or image, used for the hit flash.
function whiteSilhouette(src, w, h) {
  const c = document.createElement('canvas');
  c.width = src.width || src.naturalWidth;
  c.height = src.height || src.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  const sprite = {img: c, w, h, hw: w / 2, hh: h / 2};
  toBitmap(sprite);
  return sprite;
}

const Sprites = {
  cache: new Map(),
  get(key, build) {
    let s = this.cache.get(key);
    if (!s) { s = build(); this.cache.set(key, s); }
    return s;
  },

  gem(type) {
    return this.get('gem:' + type, () => makeSprite(34, 34, c => {
      if (type === 'coins') {
        c.shadowColor = '#ffc761'; c.shadowBlur = 7;
        c.fillStyle = '#d78c38'; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = '#ffe5a3'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.stroke();
        c.fillStyle = '#fff0b8'; c.beginPath(); c.arc(-1, -1, 2, 0, TAU); c.fill();
      } else if (type === 'soul') {
        c.shadowColor = '#b06cff'; c.shadowBlur = 12;
        c.fillStyle = '#9b57e9'; c.beginPath(); c.moveTo(1, -10);
        c.bezierCurveTo(-10, -2, -9, 6, -2, 9); c.bezierCurveTo(1, 5, 8, 7, 9, 0); c.bezierCurveTo(10, -5, 5, -7, 1, -10); c.fill();
        c.shadowBlur = 0;
        c.fillStyle = '#eadaff'; c.beginPath(); c.moveTo(1, -3);
        c.bezierCurveTo(-2, 1, -3, 4, 1, 6); c.bezierCurveTo(4, 3, 5, 0, 1, -3); c.fill();
      } else {
        const tint = type === 'xp' ? '#62e7ff' : '#44d5a9';
        c.rotate(Math.PI / 4);
        c.shadowColor = tint; c.shadowBlur = 9; c.fillStyle = tint;
        c.beginPath(); c.moveTo(0, -7); c.lineTo(6, 0); c.lineTo(0, 7); c.lineTo(-6, 0); c.closePath(); c.fill();
        c.shadowBlur = 0; c.fillStyle = '#e9ffff';
        c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 1); c.lineTo(-5, 0); c.fill();
      }
    }));
  },

  // Projectiles point along +x; callers rotate.
  projectile(kind) {
    return this.get('proj:' + kind, () => makeSprite(kind === 'fire' ? 84 : 56, 44, c => {
      if (kind === 'fire') {
        c.shadowColor = '#ff6d1f'; c.shadowBlur = 24; c.fillStyle = '#e8401f';
        c.beginPath(); c.moveTo(10, 0); c.quadraticCurveTo(-5, -11, -13, -5); c.quadraticCurveTo(-22, -4, -23, -11);
        c.quadraticCurveTo(-21, 2, -34, 5); c.quadraticCurveTo(-13, 5, -18, 10); c.quadraticCurveTo(-3, 8, 10, 0); c.fill();
        c.fillStyle = '#ffae34'; c.beginPath(); c.moveTo(10, 0); c.quadraticCurveTo(-3, -7, -12, -3);
        c.quadraticCurveTo(-19, 0, -22, 4); c.quadraticCurveTo(-4, 8, 10, 0); c.fill();
        c.shadowBlur = 12; c.fillStyle = '#fff4aa'; c.beginPath(); c.ellipse(2, 0, 8, 4, 0, 0, TAU); c.fill();
        return;
      }
      const tint = kind === 'venom' ? '#70e6a2' : kind === 'ice' ? '#9beaff' : kind === 'blade' ? '#e9aeff' : '#83c1ff';
      c.shadowColor = tint; c.shadowBlur = 16;
      if (kind === 'ice') {
        c.fillStyle = '#6ac8f2'; c.beginPath(); c.moveTo(14, 0); c.lineTo(-3, -8); c.lineTo(-12, 0); c.lineTo(-3, 8); c.closePath(); c.fill();
        c.fillStyle = '#e4fbff'; c.beginPath(); c.moveTo(13, 0); c.lineTo(-2, -4); c.lineTo(-8, 0); c.closePath(); c.fill();
      } else if (kind === 'blade') {
        c.strokeStyle = '#aa67e2'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 12, -1.1, 1.35); c.stroke();
        c.strokeStyle = '#f3daff'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 12, -1.1, 1.35); c.stroke();
        c.fillStyle = '#fff0ff'; c.beginPath(); c.moveTo(5, -11); c.lineTo(17, -12); c.lineTo(9, -4); c.fill();
      } else {
        const trail = c.createLinearGradient(-20, 0, 10, 0);
        trail.addColorStop(0, '#0000'); trail.addColorStop(.55, tint + '88'); trail.addColorStop(1, tint);
        c.fillStyle = trail; c.beginPath(); c.ellipse(-5, 0, 18, kind === 'venom' ? 7 : 5, 0, 0, TAU); c.fill();
        const core = c.createRadialGradient(3, -2, 1, 0, 0, 9);
        core.addColorStop(0, '#ffffff'); core.addColorStop(.3, kind === 'venom' ? '#c8ffb8' : '#d9f4ff'); core.addColorStop(1, tint + '00');
        c.fillStyle = core; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill();
        if (kind === 'venom') { c.shadowBlur = 0; c.strokeStyle = '#d7ffbf'; c.lineWidth = 1.5; c.beginPath(); c.arc(2, -2, 3, 0, TAU); c.stroke(); }
      }
    }));
  },

  // Hostile shots share one look that player spells never use: a red danger rim and
  // glow around a dark core, with the shooter's colour only in the centre.
  enemyShot(kind) {
    return this.get('shot:' + kind, () => makeSprite(60, 44, c => {
      const r = kind === 'spitter' ? 9 : 7;
      const tint = kind === 'warlock' ? '#d490ff' : kind === 'sentinel' ? '#7af1ff' : '#a4f072';
      // Smoky red tail
      const tail = c.createLinearGradient(-r - 16, 0, 0, 0);
      tail.addColorStop(0, '#ff2d5500'); tail.addColorStop(1, '#ff2d55aa');
      c.fillStyle = tail; c.beginPath(); c.ellipse(-r - 4, 0, r + 10, r * .7, 0, 0, TAU); c.fill();
      // Glow, dark body, red rim
      c.shadowColor = '#ff2d55'; c.shadowBlur = 12;
      c.fillStyle = '#22060f'; c.beginPath(); c.arc(0, 0, r + 3, 0, TAU); c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = '#ff4d6d'; c.lineWidth = 2.5; c.stroke();
      // Shooter colour in the core, shaped by type
      c.fillStyle = tint; c.beginPath();
      if (kind === 'sentinel') { c.moveTo(r - 1, 0); c.lineTo(-r + 2, -r + 2); c.lineTo(-r + 2, r - 2); c.closePath(); }
      else if (kind === 'warlock') { c.arc(0, 0, r - 1, -1.4, 1.4); c.lineTo(-1, 0); c.closePath(); }
      else c.arc(0, 0, r - 1.5, 0, TAU);
      c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(1.5, -1.5, 1.6, 0, TAU); c.fill();
    }));
  },

  orb() {
    return this.get('orb', () => makeSprite(48, 48, c => {
      c.shadowColor = '#b77fff'; c.shadowBlur = 18;
      const g = c.createRadialGradient(-2, -2, 1, 0, 0, 14);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.3, '#e7c7ff'); g.addColorStop(.66, '#9d70de'); g.addColorStop(1, '#8d61c100');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
    }));
  },

  // Falling meteor head with its flame tail, pre-tilted.
  meteor(scale) {
    return this.get('meteor:' + scale, () => makeSprite(110 * scale, 160 * scale, c => {
      c.translate(0, 30 * scale); c.rotate(.24);
      c.shadowColor = '#ff6a21'; c.shadowBlur = 25 * scale;
      const flame = c.createLinearGradient(0, -85 * scale, 0, 12 * scale);
      flame.addColorStop(0, '#ff3b1800'); flame.addColorStop(.42, '#ee4b27aa'); flame.addColorStop(.8, '#ffad3f'); flame.addColorStop(1, '#fff6ca');
      c.fillStyle = flame; c.beginPath(); c.moveTo(0, 12 * scale);
      c.quadraticCurveTo(-16 * scale, -5 * scale, -10 * scale, -23 * scale); c.quadraticCurveTo(-13 * scale, -50 * scale, -6 * scale, -72 * scale);
      c.quadraticCurveTo(-1 * scale, -45 * scale, 6 * scale, -65 * scale); c.quadraticCurveTo(9 * scale, -31 * scale, 15 * scale, -7 * scale);
      c.quadraticCurveTo(10 * scale, 10 * scale, 0, 12 * scale); c.fill();
      const rock = c.createRadialGradient(-4 * scale, -5 * scale, 2, 0, 0, 18 * scale);
      rock.addColorStop(0, '#fff5bd'); rock.addColorStop(.35, '#ffc155'); rock.addColorStop(.7, '#eb622e'); rock.addColorStop(1, '#592333');
      c.fillStyle = rock; c.beginPath(); c.arc(0, 0, 15 * scale, 0, TAU); c.fill();
      c.shadowBlur = 0; c.strokeStyle = '#ffd47b'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 16 * scale, -1.8, 1); c.stroke();
    }));
  },

  // Soft radial glow, scaled to any radius at draw time. Kinds: ring (shockwave), flash (impact), aura.
  glow(color, kind = 'ring') {
    return this.get(`glow:${kind}:${color}`, () => makeSprite(128, 128, c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 64);
      if (kind === 'flash') { g.addColorStop(0, '#fff4c9aa'); g.addColorStop(.32, '#ffad5890'); g.addColorStop(1, '#ff6a1600'); }
      else if (kind === 'aura') { g.addColorStop(0, color + '00'); g.addColorStop(.3, color + '00'); g.addColorStop(.75, color + '44'); g.addColorStop(1, color + '00'); }
      else { g.addColorStop(0, color + '00'); g.addColorStop(.7, color + '20'); g.addColorStop(1, color + '00'); }
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 64, 0, TAU); c.fill();
    }));
  },

  // Regular enemy bodies; the flash variant paints the body white for hit feedback.
  enemy(type, flash = false) {
    const key = `enemy:${type}:${flash}`;
    return this.get(key, () => makeSprite(64, 64, c => drawEnemyBody(c, type, flash ? '#fff' : ENEMY_TYPES[type].color)));
  },

  // Boss portrait art, plus a white copy for the hit flash. Null until the image loads.
  portrait(index, flash = false) {
    const im = bossImages[index];
    if (!imageReady(im)) return null;
    const base = this.get('portrait:' + index, () => ({img: im, w: im.naturalWidth, h: im.naturalHeight}));
    return flash ? this.get('portrait:' + index + ':flash', () => whiteSilhouette(im, base.w, base.h)) : base;
  },
};

// Hand-drawn pixel bodies from the original art, painted once into sprites.
function drawEnemyBody(c, type, body) {
  const ink = '#16202a';
  const r = ENEMY_TYPES[type].r;
  c.fillStyle = '#0007'; c.beginPath(); c.ellipse(0, r * .85, r * .95, 4, 0, 0, TAU); c.fill();
  if (type === 'ghoul') {
    c.fillStyle = ink; c.fillRect(-12, -3, 6, 15); c.fillRect(7, -1, 6, 13); c.fillRect(-11, 9, 8, 5); c.fillRect(5, 8, 9, 5);
    c.fillStyle = body; c.fillRect(-8, -7, 16, 17); c.fillRect(-6, -13, 12, 10); c.fillRect(-12, -3, 6, 9); c.fillRect(7, -4, 6, 10);
    c.fillRect(-13, 4, 4, 5); c.fillRect(10, 5, 4, 5); c.fillRect(-5, -15, 3, 3); c.fillRect(3, -14, 3, 3);
    c.fillStyle = '#d9ff9d'; c.fillRect(-4, -10, 3, 3); c.fillRect(3, -10, 3, 3);
    c.fillStyle = '#243b35'; c.fillRect(-2, -3, 4, 2); c.fillRect(-9, 4, 4, 3);
    return;
  }
  if (type === 'skeleton') {
    c.fillStyle = ink; c.fillRect(-12, 1, 5, 12); c.fillRect(7, 1, 5, 12); c.fillRect(-12, 11, 7, 3); c.fillRect(6, 11, 7, 3);
    c.fillRect(-14, -7, 5, 12); c.fillRect(9, -7, 5, 12);
    c.fillStyle = body; c.fillRect(-7, -13, 14, 12); c.fillRect(-5, -17, 10, 5); c.fillRect(-8, 0, 16, 7); c.fillRect(-6, 7, 4, 6); c.fillRect(2, 7, 4, 6);
    c.fillStyle = '#7a7064'; c.fillRect(-5, -9, 3, 3); c.fillRect(2, -9, 3, 3); c.fillRect(-2, -4, 4, 2); c.fillRect(-7, 2, 14, 2); c.fillRect(-5, 5, 10, 2);
    return;
  }
  // Diamond-framed casters and brutes
  c.fillStyle = ink; c.beginPath(); c.moveTo(0, -r - 5); c.lineTo(r + 4, 0); c.lineTo(0, r + 5); c.lineTo(-r - 4, 0); c.closePath(); c.fill();
  c.fillStyle = body; c.beginPath(); c.arc(0, 0, r - 3, 0, TAU); c.fill();
  if (type === 'sentinel') {
    c.strokeStyle = '#b3f5ff'; c.lineWidth = 3; c.strokeRect(-9, -9, 18, 18); c.fillStyle = '#092033'; c.fillRect(-4, -4, 8, 8);
  } else if (type === 'warlock') {
    c.fillStyle = '#241b37'; c.beginPath(); c.moveTo(0, -19); c.lineTo(12, 7); c.lineTo(-12, 7); c.fill();
    c.fillStyle = '#f6d9ff'; c.fillRect(-6, -1, 4, 3); c.fillRect(3, -1, 4, 3);
  } else if (type === 'brood') {
    c.strokeStyle = '#f0a9ab'; c.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); c.lineTo(Math.cos(a) * 24, Math.sin(a) * 24); c.stroke(); }
    c.fillStyle = '#402236'; c.fillRect(-5, -3, 10, 7);
  } else {
    c.fillStyle = '#184936'; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill(); c.fillStyle = '#dcff95'; c.fillRect(-3, -4, 6, 5);
  }
}

// Inline SVG icons for artifacts that have no painted art.
const SIGILS = {
  heart: '<path d="M12 21 3.5 12.5a5 5 0 0 1 7-7L12 7l1.5-1.5a5 5 0 0 1 7 7L12 21Z"/>',
  shield: '<path d="M12 2 3 6v6c0 5 3 8 9 10 6-2 9-5 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  attack: '<path d="m5 19 14-14M14 4l6 6M3 17l4 4m0-6 2 2"/>',
  // Bargains: each drawn for its own deal.
  pact: '<path d="M12 3c-3 5-6 8-6 11a6 6 0 0 0 12 0c0-3-3-6-6-11Z"/><path d="M9 14h6M12 11v6"/>',                         // blood drop marked with a cross
  wick: '<path d="M8 21h8M9 21V10h6v11"/><path d="M12 10V7"/><path d="M12 7c-2-1.5-1.5-4 0-5 1.5 1 2 3.5 0 5Z"/><path d="m10 13 2 2-1 2 2 2"/>', // cracked glass candle
  volatile: '<circle cx="11" cy="14" r="6"/><path d="m15 9 2-2"/><path d="M18 3v2M21 6h-2M20.5 3.5 19 5"/><path d="M8.5 12.5 10 14"/>', // bomb with a lit fuse
  hoard: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 10v4c0 1.4 3.1 2.5 7 2.5"/><circle cx="17.5" cy="17.5" r="3.5"/><path d="M16.3 17h.01M18.7 17h.01M16.5 19h2"/>', // coin stack with a skull coin
  oath: '<path d="M12 21 3.5 12.5a5 5 0 0 1 7-7L12 7l1.5-1.5a5 5 0 0 1 7 7L12 21Z"/><path d="m12 7-1.5 4 3 2-2 4"/>', // cracked heart
  hunted: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',       // crosshair
  quarters: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3.5"/><path d="m5 5 3.5 3.5M19 5l-3.5 3.5M5 19l3.5-3.5M19 19l-3.5-3.5"/>', // close ring with inward strikes
  overcharge: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4"/><path d="m12 8-3 4h4l-3 4"/>',        // battery with a lightning bolt
};
const iconMarkup = key => SIGILS[key] ? `<svg class="sigil" viewBox="0 0 24 24" aria-hidden="true">${SIGILS[key]}</svg>` : '';
