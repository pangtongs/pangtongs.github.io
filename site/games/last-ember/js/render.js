'use strict';
// World rendering. Everything is drawn with drawImage from the sprite cache, culled to
// the camera view, with no shadowBlur or per-frame gradients.

const QUALITY_LEVELS = {high: 2, low: 1};
const CB_DANGER = '#ffe600'; // colour-blind mode: one bright yellow for every danger
const VIEW_MIN = 600, VIEW_MAX = 960; // world units across the screen's short side
const ENEMY_ART_SCALE = 3.3; // painted enemy size as a multiple of its collision radius
const PROJECTILE_GLOW = {arcane: '#6fb6ff', fire: '#ff8a2a', ice: '#8fe6ff', venom: '#66e08e', blade: '#d58cff'};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false});
    this.quality = 'auto';
    this.autoRatio = 2;          // current pixel ratio chosen by auto quality
    this.frameTimes = [];
    this.view = {x0: 0, y0: 0, x1: 0, y1: 0};
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  get maxRatio() { return Math.min(devicePixelRatio || 1, 2); }
  get ratio() {
    if (this.quality === 'auto') return Math.min(this.maxRatio, this.autoRatio);
    return Math.min(this.maxRatio, QUALITY_LEVELS[this.quality]);
  }

  setQuality(q) { this.quality = q; this.autoRatio = 2; this.frameTimes.length = 0; this.resize(); }

  // Camera zoom keeps the visible arena similar on every screen: a phone zooms out so
  // foes are seen before they arrive, and a big monitor zooms in so it is no easier.
  // W and H are the view size in world units; px is canvas pixels per world unit.
  resize() {
    const short = Math.min(innerWidth, innerHeight);
    this.zoom = short < VIEW_MIN ? short / VIEW_MIN : short > VIEW_MAX ? short / VIEW_MAX : 1;
    this.W = innerWidth / this.zoom; this.H = innerHeight / this.zoom;
    this.px = this.ratio * this.zoom;
    this.canvas.width = Math.round(innerWidth * this.ratio);
    this.canvas.height = Math.round(innerHeight * this.ratio);
  }

  // Auto quality: if frames run long while playing, lower the render resolution a step.
  trackFrame(ms) {
    if (this.quality !== 'auto' || this.autoRatio <= 1) return;
    const t = this.frameTimes;
    t.push(ms);
    if (t.length < 90) return;
    const avg = t.reduce((a, b) => a + b, 0) / t.length;
    t.length = 0;
    if (avg > 21 && this.ratio > 1) { this.autoRatio = Math.max(1, this.ratio - .5); this.resize(); }
  }

  // Maps world coordinates to the canvas with an optional rotation about (x, y).
  place(x, y, rot = 0) {
    const s = this.px, tx = (x - this.camX + this.W / 2) * s, ty = (y - this.camY + this.H / 2) * s;
    if (!rot) this.ctx.setTransform(s, 0, 0, s, tx, ty);
    else { const c = Math.cos(rot) * s, n = Math.sin(rot) * s; this.ctx.setTransform(c, n, -n, c, tx, ty); }
  }
  worldTransform() {
    const s = this.px;
    this.ctx.setTransform(s, 0, 0, s, (this.W / 2 - this.camX) * s, (this.H / 2 - this.camY) * s);
  }
  visible(x, y, margin) {
    const v = this.view;
    return x > v.x0 - margin && x < v.x1 + margin && y > v.y0 - margin && y < v.y1 + margin;
  }
  sprite(s, x, y, rot = 0, scale = 1) {
    this.place(x, y, rot);
    this.ctx.drawImage(s.img, -s.hw * scale, -s.hh * scale, s.w * scale, s.h * scale);
  }

  draw(g) {
    const c = this.ctx, p = g.player;
    this.t = g.time; this.faceX = p.x; this.cb = !!g.settings.colorblind; this.calm = !!g.settings.reducedMotion;
    const shake = g.shakeAmt || 0;
    this.camX = p.x + (shake ? rand(-shake, shake) : 0); this.camY = p.y + (shake ? rand(-shake, shake) : 0);
    const v = this.view;
    v.x0 = p.x - this.W / 2; v.x1 = p.x + this.W / 2; v.y0 = p.y - this.H / 2; v.y1 = p.y + this.H / 2;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#060d18';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.worldTransform();
    this.drawFloor(g);

    for (const d of g.drops) if (this.visible(d.x, d.y, 20)) this.sprite(Sprites.gem(d.type), d.x, d.y + Math.sin(d.phase) * 2);
    this.worldTransform();
    for (const ch of g.chests) this.drawChest(ch);
    this.drawHazards(g);
    this.drawClouds(g);
    this.drawShrines(g);
    for (const m of g.meteors) this.drawMeteor(m);
    for (const q of g.projectiles) if (this.visible(q.x, q.y, 40)) this.sprite(Sprites.projectile(q.kind), q.x, q.y, Math.atan2(q.vy, q.vx), q.scale || 1);
    this.drawObstacles(g);
    this.drawHearth(g);
    this.drawCorpses(g);
    for (const e of g.enemies) if (!e.dead && this.visible(e.x, e.y, e.boss ? 200 : 60)) this.drawEnemy(e);

    this.worldTransform();
    this.drawArcs(g);
    this.drawShockwaves(g);
    this.drawBeams(g);
    if (g.settings.particles) g.fx.particles.draw(c, v);
    this.drawOrbs(g);
    this.drawNewSpells(g);
    this.drawAura(g);
    this.drawPlayer(g);
    this.drawLighting(g);
    // Enemy shots and telegraphs sit above the darkness so danger always reads clearly.
    this.worldTransform();
    for (const e of g.enemies) if (!e.dead && e.tele && e.windup > 0 && this.visible(e.x, e.y, 400)) this.drawTelegraph(e);
    for (const q of g.enemyShots) if (this.visible(q.x, q.y, 30)) this.sprite(Sprites.enemyShot(q.kind), q.x, q.y, Math.atan2(q.vy, q.vx));
    this.worldTransform();
    if (this.cb) { // colour-blind mode: every enemy shot gets a bright ring
      c.strokeStyle = CB_DANGER; c.lineWidth = 2; c.beginPath();
      for (const q of g.enemyShots) if (this.visible(q.x, q.y, 30)) { c.moveTo(q.x + q.r + 4, q.y); c.arc(q.x, q.y, q.r + 4, 0, TAU); }
      c.stroke();
    }
    if (g.settings.damageNumbers) g.fx.texts.draw(c, v, 1 / Math.min(1, this.zoom));
    this.drawPointers(g);

    if (g.time < 8 && g.running) {
      c.setTransform(this.px, 0, 0, this.px, 0, 0);
      c.textAlign = 'center'; c.fillStyle = '#b9d4e699'; c.font = '11px monospace';
      c.fillText(tr('MOVE · COLLECT GEMS · BUILD YOUR SPELLS'), this.W / 2, this.H - 18);
    }
  }

  drawFloor(g) {
    const c = this.ctx, v = this.view, scene = stageInfo(g.stage);
    // The floor ends exactly where movement stops (plus the player's body), so every
    // visible tile is walkable and the wall is the real boundary.
    const fx = ARENA_X + FLOOR_MARGIN, fy = ARENA_Y + FLOOR_MARGIN;
    const x0 = Math.max(-fx, v.x0), x1 = Math.min(fx, v.x1), y0 = Math.max(-fy, v.y0), y1 = Math.min(fy, v.y1);
    if (x1 > x0 && y1 > y0) {
      c.fillStyle = this.floorPattern(scene);
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // Wall sits just outside the floor.
    c.strokeStyle = scene.line; c.lineWidth = 12;
    c.strokeRect(-fx - 6, -fy - 6, fx * 2 + 12, fy * 2 + 12);
    c.strokeStyle = scene.accent; c.globalAlpha = .35; c.lineWidth = 2;
    c.strokeRect(-fx - 1, -fy - 1, fx * 2 + 2, fy * 2 + 2);

    // Scattered stage decorations: rings everywhere, plus the stage's motif. Early stages
    // draw their motif in the line colour, later ones in the accent colour.
    const subtle = ['slash', 'triangle'].includes(scene.motif);
    c.strokeStyle = scene.line; c.globalAlpha = .35; c.lineWidth = 2; c.beginPath();
    const spots = [];
    for (let i = 0; i < 38; i++) {
      const x = (i * 397) % 2080 - 1040, y = (i * 613) % 1610 - 805;
      if (x < v.x0 - 25 || x > v.x1 + 25 || y < v.y0 - 25 || y > v.y1 + 25) continue;
      const r = 7 + (i % 3) * 6;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      if (subtle) this.motif(scene.motif, x, y, i); else spots.push(x, y, i);
    }
    c.stroke();
    if (spots.length && scene.motif !== 'none') {
      c.strokeStyle = scene.accent; c.fillStyle = scene.accent; c.globalAlpha = .25; c.beginPath();
      for (let k = 0; k < spots.length; k += 3) this.motif(scene.motif, spots[k], spots[k + 1], spots[k + 2]);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  // A stone floor texture per stage, painted once: worn flagstones with mottling, cracks
  // and pebbles in the stage's colours. Tiles seamlessly; anchored to world coordinates.
  floorPattern(scene) {
    const cache = this.floors || (this.floors = new Map());
    if (cache.has(scene.name)) return cache.get(scene.name);
    const T = 256, R = 2, cv = document.createElement('canvas');
    cv.width = cv.height = T * R;
    const c = cv.getContext('2d');
    c.scale(R, R);
    let seed = 7;
    for (const ch of scene.name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    // Draws f at (x, y) and at its wrapped copies, so marks crossing an edge tile cleanly.
    const wrap = (x, y, r, f) => { for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) if (x + ox > -r && x + ox < T + r && y + oy > -r && y + oy < T + r) f(x + ox, y + oy); };
    c.fillStyle = scene.floor; c.fillRect(0, 0, T, T);
    for (let i = 0; i < 90; i++) { // mottling
      const x = rnd() * T, y = rnd() * T, r = 10 + rnd() * 34;
      c.globalAlpha = .05 + rnd() * .07; c.fillStyle = rnd() < .5 ? '#000' : scene.line;
      wrap(x, y, r, (px, py) => { c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill(); });
    }
    // Flagstones: rows of 64 with staggered joints, each stone slightly lighter or darker.
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const x = col * 64 + (row % 2) * 32, y = row * 64;
      c.globalAlpha = rnd() * .035; c.fillStyle = rnd() < .5 ? '#000' : '#fff';
      wrap(x + 32, y + 32, 64, (px, py) => c.fillRect(px - 31, py - 31, 62, 62));
    }
    c.globalAlpha = .3; c.strokeStyle = '#0006'; c.lineWidth = 1.5;
    for (let row = 0; row < 4; row++) {
      c.beginPath(); c.moveTo(0, row * 64); c.lineTo(T, row * 64); c.stroke();
      for (let col = 0; col <= 4; col++) { const x = (col * 64 + (row % 2) * 32) % T; c.beginPath(); c.moveTo(x, row * 64); c.lineTo(x, row * 64 + 64); c.stroke(); }
    }
    c.globalAlpha = .1; c.strokeStyle = scene.line; c.lineWidth = 1;
    for (let row = 0; row < 4; row++) { c.beginPath(); c.moveTo(0, row * 64 + 1.5); c.lineTo(T, row * 64 + 1.5); c.stroke(); }
    c.strokeStyle = '#000'; c.globalAlpha = .25; c.lineWidth = 1;
    for (let i = 0; i < 9; i++) { // cracks
      let x = rnd() * T, y = rnd() * T, a = rnd() * TAU;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += rnd() - .5; x += Math.cos(a) * 7; y += Math.sin(a) * 7; c.lineTo(x, y); }
      c.stroke();
    }
    for (let i = 0; i < 40; i++) { // pebbles and grit
      const x = rnd() * T, y = rnd() * T, r = .6 + rnd() * 1.8;
      c.globalAlpha = .25 + rnd() * .25; c.fillStyle = rnd() < .7 ? scene.line : scene.accent;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    const pattern = this.ctx.createPattern(cv, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(1 / R));
    cache.set(scene.name, pattern);
    return pattern;
  }

  // Darkness and light, the game's signature look. A low-resolution darkness mask is
  // cleared around every light source and stretched over the frame, then warm glows are
  // added on top. Costs one small canvas and a few dozen blits per frame.
  drawLighting(g) {
    const p = g.player, S = 4; // CSS pixels per mask pixel
    let L = this.light;
    const w = Math.ceil(this.W / S) + 1, h = Math.ceil(this.H / S) + 1;
    if (!L || L.w !== w || L.h !== h) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      L = this.light = {cv, c: cv.getContext('2d'), w, h, spot: this.lightSpot()};
    }
    const lc = L.c, ox = this.W / 2 - this.camX, oy = this.H / 2 - this.camY;
    // The darkness turns red when hurt, and pulses red while HP is low.
    const hpLow = p.hp / p.maxHp < .3 && g.running ? .5 + .5 * Math.sin(g.time * 7) : 0;
    const red = Math.max(hpLow * .6, (g.hurtFlash || 0) * 4);
    lc.globalCompositeOperation = 'copy';
    lc.globalAlpha = 1;
    lc.fillStyle = red ? `rgba(${3 + red * 110 | 0},4,10,${.64 + red * .1})` : 'rgba(3,5,12,.64)';
    lc.fillRect(0, 0, w, h);
    lc.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a = 1) => {
      const sx = (x + ox) / S, sy = (y + oy) / S, sr = r / S;
      if (sx < -sr || sy < -sr || sx > w + sr || sy > h + sr) return;
      lc.globalAlpha = a; lc.drawImage(L.spot, sx - sr, sy - sr, sr * 2, sr * 2);
    };
    const flicker = g.settings.reducedMotion ? 1 : 1 + Math.sin(g.time * 9) * .015 + Math.sin(g.time * 23) * .01;
    light(p.x, p.y - 10, Math.max(this.W, this.H) * .52 * flicker * (g.darkness ?? 1));
    light(p.x, p.y - 10, 120, .6);
    let n = 0;
    for (const q of g.projectiles) if (n++ < 60) light(q.x, q.y, 70 * (q.scale || 1), .55);
    for (const m of g.meteors) light(m.x, m.y, m.r * 1.6, m.struck ? 1 : .5);
    for (const s of g.fx.shockwaves) light(s.x, s.y, s.r * 1.4, clamp(s.life / s.max, 0, 1));
    for (const b of g.fx.beams) { light(b.x1, b.y1, 120, .8); light((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, 200, .8); light(b.x2, b.y2, 120, .8); }
    for (const h of g.hazards) light(h.x, h.y, h.r * 1.5, .7);
    for (const ch of g.chests) light(ch.x, ch.y, 110 + Math.sin(ch.phase * 2) * 10, .9);
    for (const s of g.shrines) light(s.x, s.y, s.r * 2.2, .8);
    if (g.hearth) { light(g.hearth.x, g.hearth.y, HEARTH.r * 2.3 * flicker); light(g.hearth.x, g.hearth.y, 60, .8); }
    for (const z of g.zones) if (z.color) light(z.x, z.y, z.r * 1.8, .6);
    for (const d of g.discs) light(d.x, d.y, 80, .6);
    for (const e of g.enemies) if ((e.boss || e.mini || e.elite) && !e.dead) light(e.x, e.y, e.boss ? 180 : 110, .45);
    if (p.wardTime > 0) light(p.x, p.y, WARD_RADIUS * 2, .8);
    this.worldTransform();
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(L.cv, 0, 0, w * S * this.px, h * S * this.px);
    // Warm additive glow: the ember on the staff and every fire in the air.
    c.globalCompositeOperation = 'lighter';
    this.worldTransform();
    const ember = Sprites.glow('#ff9a3c', 'warm');
    c.globalAlpha = .55 * flicker; this.sprite(ember, p.x - 14, p.y - 30, 0, 50 / 64);
    c.globalAlpha = .18; this.sprite(ember, p.x, p.y - 6, 0, 150 / 64);
    n = 0;
    for (const q of g.projectiles) {
      if (n++ >= 60 || !this.visible(q.x, q.y, 40)) continue;
      c.globalAlpha = .35; this.sprite(Sprites.glow(PROJECTILE_GLOW[q.kind] || '#ffb070', 'warm'), q.x, q.y, 0, 34 * (q.scale || 1) / 64);
    }
    for (const d of g.drops) if (d.type === 'soul' && this.visible(d.x, d.y, 30)) { c.globalAlpha = .4; this.sprite(Sprites.glow('#c48bff', 'warm'), d.x, d.y, 0, 26 / 64); }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  lightSpot() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#000'); gr.addColorStop(.45, '#000d'); gr.addColorStop(.75, '#0005'); gr.addColorStop(1, '#0000');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    return cv;
  }

  // Edge-of-screen arrows toward things worth finding: the boss, mini bosses, chests,
  // shrines and treasure goblins.
  drawPointers(g) {
    const c = this.ctx, p = g.player, targets = [];
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.boss) targets.push([e, '#ff5a7a', 1.4]);
      else if (e.mini) targets.push([e, '#ffb347', 1.1]);
      else if (e.type === 'goblin') targets.push([e, '#ffd76b', 1]);
    }
    for (const ch of g.chests) targets.push([ch, '#7fe3ff', 1.1]);
    for (const s of g.shrines) targets.push([s, '#c77dff', 1]);
    if (g.hearth) targets.push([g.hearth, '#ffb064', .9]);
    if (!targets.length) return;
    // Arrows keep clear of the HUD along the top edge.
    const W = this.W, H = this.H, m = 26, top = (innerWidth <= 700 ? 125 : 95) / this.zoom;
    c.setTransform(this.px, 0, 0, this.px, 0, 0);
    for (const [t, color, size] of targets) {
      const dx = t.x - p.x, dy = t.y - p.y;
      if (Math.abs(dx) < W / 2 - 10 && Math.abs(dy) < H / 2 - 10) continue;
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
      const x = W / 2 + dx * k, y = clamp(H / 2 + dy * k, top, H - m), a = Math.atan2(dy, dx), pulse = 1 + .12 * Math.sin(g.time * 6);
      c.save(); c.translate(x, y); c.rotate(a); c.scale(size * pulse, size * pulse);
      c.globalAlpha = .9; c.fillStyle = color; c.strokeStyle = '#0009'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, -8); c.lineTo(-3, 0); c.lineTo(-7, 8); c.closePath(); c.stroke(); c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // Adds one decoration of the given motif to the current path at (x, y).
  motif(name, x, y, i) {
    const c = this.ctx, star = (n, r1, r2, rot = 0) => {
      for (let j = 0; j < n * 2; j++) {
        const a = rot + j * Math.PI / n, rad = j % 2 ? r2 : r1, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (j === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
    };
    switch (name) {
      case 'slash': c.moveTo(x - 9, y + 8); c.lineTo(x + 8, y - 9); break;
      case 'triangle': c.moveTo(x, y - 15); c.lineTo(x + 13, y + 5); c.lineTo(x - 13, y + 5); c.closePath(); break;
      case 'spikes': c.moveTo(x - 10, y + 10); c.lineTo(x, y - 14); c.lineTo(x + 10, y + 10); break;
      case 'ellipse': c.moveTo(x + 18, y); c.ellipse(x, y, 18, 7, .4, 0, TAU); break;
      case 'gear':
        c.moveTo(x + 13, y); c.arc(x, y, 13, 0, TAU);
        for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; c.rect(x + Math.cos(a) * 15 - 2, y + Math.sin(a) * 15 - 2, 4, 4); }
        break;
      case 'waves':
        for (let j = 0; j < 3; j++) { const x0 = x - 8 + j * 7; c.moveTo(x0 + Math.cos(j * .4) * 12, y + Math.sin(j * .4) * 12); c.arc(x0, y, 12, j * .4, Math.PI + j * .4); }
        break;
      case 'star': star(4, 19, 7); break;
      case 'snow':
        for (let j = 0; j < 3; j++) { const a = j * Math.PI / 3; c.moveTo(x - Math.cos(a) * 16, y - Math.sin(a) * 16); c.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16); }
        break;
      case 'coin': c.moveTo(x + 10, y + 4); c.ellipse(x, y + 4, 10, 4, 0, 0, TAU); c.moveTo(x + 10, y - 3); c.ellipse(x, y - 3, 10, 4, 0, 0, TAU); break;
      case 'thorn':
        c.moveTo(x - 18, y + 6); c.quadraticCurveTo(x, y - 14, x + 18, y + 4);
        for (let j = -1; j <= 1; j++) { c.moveTo(x + j * 8, y - 3 + Math.abs(j) * 2); c.lineTo(x + j * 8 + 3, y - 10 + Math.abs(j) * 2); }
        break;
      case 'hex':
        for (let j = 0; j <= 6; j++) { const a = j * Math.PI / 3, px = x + Math.cos(a) * 14, py = y + Math.sin(a) * 14; if (j === 0) c.moveTo(px, py); else c.lineTo(px, py); }
        break;
      case 'cross': c.moveTo(x, y - 16); c.lineTo(x, y + 14); c.moveTo(x - 8, y - 7); c.lineTo(x + 8, y - 7); c.rect(x - 11, y + 14, 22, 4); break;
      case 'diamond': star(2, 18, 7, i % 2 ? 0 : Math.PI / 4); break;
      case 'eye': c.moveTo(x - 18, y); c.quadraticCurveTo(x, y - 12, x + 18, y); c.quadraticCurveTo(x, y + 12, x - 18, y); c.moveTo(x + 4, y); c.arc(x, y, 4, 0, TAU); break;
      case 'flame': c.moveTo(x, y + 12); c.quadraticCurveTo(x - 12, y, x - 2, y - 16); c.quadraticCurveTo(x + 2, y - 6, x + 6, y - 10); c.quadraticCurveTo(x + 12, y + 2, x, y + 12); break;
    }
  }

  // Ground hazards: a ring that fills toward eruption, then a pulsing pool while it lingers.
  drawHazards(g) {
    const c = this.ctx;
    for (const h of g.hazards) {
      if (!this.visible(h.x, h.y, h.r)) continue;
      c.fillStyle = c.strokeStyle = this.cb ? CB_DANGER : h.color;
      if (!h.erupted) {
        const k = h.t / h.delay;
        c.globalAlpha = .1 + k * .15; c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.fill();
        c.globalAlpha = .35 + k * .5; c.beginPath(); c.arc(h.x, h.y, h.r * k, 0, TAU); c.fill();
        c.globalAlpha = .9; c.lineWidth = 2; c.setLineDash([7, 5]); c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.stroke(); c.setLineDash([]);
      } else {
        const left = 1 - (h.t - h.delay) / Math.max(.01, h.linger);
        c.globalAlpha = (.16 + .06 * Math.sin(g.time * 6)) * left; c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.fill();
        c.globalAlpha = .5 * left; c.lineWidth = 2; c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  // Cursed shrines: a rune circle that fills while the player stands in it.
  drawShrines(g) {
    const c = this.ctx;
    for (const s of g.shrines) {
      if (!this.visible(s.x, s.y, s.r)) continue;
      c.globalAlpha = .18 + .08 * Math.sin(g.time * 4); c.fillStyle = '#9a5cff';
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
      c.globalAlpha = .9; c.strokeStyle = '#d6b3ff'; c.lineWidth = 2; c.setLineDash([10, 6]); c.stroke(); c.setLineDash([]);
      c.beginPath(); for (let i = 0; i < 5; i++) { const a = g.time * .6 + i * TAU * 2 / 5, x = s.x + Math.cos(a) * s.r * .7, y = s.y + Math.sin(a) * s.r * .7; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); c.stroke();
      if (s.charge > 0) { c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.arc(s.x, s.y, s.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * s.charge / 2.5); c.stroke(); }
    }
    c.globalAlpha = 1;
  }

  // Plague Cloud patches.
  drawClouds(g) {
    const c = this.ctx;
    for (const z of g.zones) {
      if (!this.visible(z.x, z.y, z.r)) continue;
      const k = Math.min(1, z.life / z.max * 2);
      c.globalAlpha = .22 * k; c.fillStyle = z.color || '#5fd17a';
      c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill();
      c.globalAlpha = .35 * k; c.fillStyle = z.color ? '#ffd08a' : '#9af0a8';
      for (let i = 0; i < 5; i++) { const a = g.time * .7 + i * 1.26; c.beginPath(); c.arc(z.x + Math.cos(a) * z.r * .55, z.y + Math.sin(a * 1.3) * z.r * .45, z.r * .28, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
  }

  drawChest(ch) {
    if (!this.visible(ch.x, ch.y, 30)) return;
    const c = this.ctx, scene = stageInfo(ch.tier);
    this.place(Math.round(ch.x), Math.round(ch.y + Math.sin(ch.phase) * 2));
    c.fillStyle = '#0008'; c.fillRect(-15, 13, 30, 5);
    c.fillStyle = scene.line; c.fillRect(-13, -10, 26, 22);
    c.fillStyle = scene.accent; c.fillRect(-13, -10, 26, 5); c.fillRect(-3, -10, 6, 22); c.fillRect(-13, 4, 26, 4);
    c.fillStyle = '#132238'; c.fillRect(-3, -1, 6, 5);
    this.worldTransform();
  }

  drawMeteor(m) {
    if (!this.visible(m.x, m.y, m.r + 240)) return;
    const c = this.ctx;
    if (!m.struck) {
      const t = clamp(m.t / m.delay, 0, 1);
      this.place(m.x, m.y);
      c.globalAlpha = .45 + t * .45;
      c.strokeStyle = '#ffb565'; c.lineWidth = 2 + t * 2; c.setLineDash([9, 6]);
      c.beginPath(); c.arc(0, 0, m.r * (.85 - t * .22), 0, TAU); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#ffe6ac'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, m.r * (.68 - t * .15), -Math.PI * .4, Math.PI * .55); c.stroke();
      c.globalAlpha = 1;
      const k = m.kind === 'comet' ? 1.9 : m.kind === 'armageddon' ? 1.45 : 1;
      this.sprite(Sprites.meteor(k), m.x - 55 * (1 - t), m.y - 230 * (1 - t) - 30 * k);
    } else {
      c.globalAlpha = clamp(1 - (m.t - m.delay) / .52, 0, 1);
      this.sprite(Sprites.glow('#ff9e58', 'flash'), m.x, m.y, 0, m.r * .85 / 64);
      c.globalAlpha = 1;
    }
    this.worldTransform();
  }

  // Windup warnings: where a slam lands, a charge's path, a blink's arrival, a cast glow.
  drawTelegraph(e) {
    const t = e.tele, c = this.ctx;
    if (!t || e.windup <= 0) return;
    const k = 1 - e.windup / e.windupMax, color = this.cb ? CB_DANGER : e.boss || e.mini ? e.color : '#ff7a4d';
    this.worldTransform();
    c.fillStyle = color; c.strokeStyle = color;
    if (t.type === 'circle') {
      c.globalAlpha = .12 + k * .2; c.beginPath(); c.arc(e.x, e.y, t.r, 0, TAU); c.fill();
      c.globalAlpha = 1; c.lineWidth = 2; c.stroke();
    } else if (t.type === 'line') {
      this.place(e.x, e.y, t.a);
      c.globalAlpha = .14 + k * .22; c.fillRect(0, -t.w / 2, t.len, t.w);
      c.globalAlpha = .9; c.fillRect(0, -1.5, t.len * k, 3);
      this.worldTransform();
    } else if (t.type === 'blink') {
      c.globalAlpha = .15 + k * .25; c.beginPath(); c.arc(t.x, t.y, t.r, 0, TAU); c.fill();
      c.globalAlpha = 1; c.lineWidth = 2; c.setLineDash([8, 6]); c.stroke(); c.setLineDash([]);
    } else {
      c.globalAlpha = .5 + .4 * Math.sin(k * 20); c.lineWidth = 3;
      c.beginPath(); c.arc(e.x, e.y, e.r * (e.boss ? 1.9 : 1.3) + k * 10, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;
  }

  // Frozen foes get an ice shell; shocked foes a crackling yellow ring. Assumes place(e).
  drawStatus(e) {
    if (!(e.frozen > 0) && !(e.shock > 0)) return;
    const c = this.ctx, r = e.r + 4;
    if (e.frozen > 0) { c.globalAlpha = .45; c.fillStyle = '#bfe9ff'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.globalAlpha = .9; c.strokeStyle = '#e8f8ff'; c.lineWidth = 2; c.stroke(); }
    if (e.shock > 0) { c.globalAlpha = .8; c.strokeStyle = '#ffe36b'; c.lineWidth = 1.5; c.setLineDash([3, 4]); c.beginPath(); c.arc(0, 0, r + 2, 0, TAU); c.stroke(); c.setLineDash([]); }
    c.globalAlpha = 1;
  }

  drawEnemy(e) {
    const c = this.ctx, x = Math.round(e.x), y = Math.round(e.y);
    if (!e.boss && !e.mini) {
      if (e.fuseT > 0) { // bomber about to blow: blast radius and a flashing body
        const f = ENEMY_TYPES[e.type].fuse;
        this.worldTransform();
        c.strokeStyle = '#ffb347'; c.globalAlpha = .7; c.lineWidth = 2; c.setLineDash([6, 5]);
        c.beginPath(); c.arc(e.x, e.y, f.radius, 0, TAU); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      }
      const flash = e.hit > 0 || (e.fuseT > 0 && Math.floor(e.fuseT * 12) % 2 === 0);
      if (e.elite) { // champions: gold ring and a larger body
        this.place(x, y);
        c.strokeStyle = '#ffd36b'; c.lineWidth = 3; c.globalAlpha = .85;
        c.beginPath(); c.arc(0, 0, e.r + 6, 0, TAU); c.stroke(); c.globalAlpha = 1;
      }
      const art = Sprites.enemyArt(e.type, flash), k = e.elite ? 1.25 : 1;
      if (art) {
        // Painted art: a soft shadow, a little walking bob, and facing toward the mage.
        // Walk cycle: a waddle (sway about the feet) and a bob; knockback tilts the body.
        const moving = ENEMY_TYPES[e.type].speed && !(e.frozen > 0) && !this.calm, ph = this.t * 9 + e.id * 1.7;
        const size = e.r * ENEMY_ART_SCALE * k, bob = moving ? Math.abs(Math.sin(ph)) * .07 : 0;
        const sway = (moving ? Math.sin(ph) * .09 : 0) + (e.kb > 0 ? Math.sign(e.kbx || 1) * .25 : 0);
        this.place(x, y);
        c.fillStyle = '#0007'; c.beginPath(); c.ellipse(0, e.r * .8, e.r * .95 * k, e.r * .32 * k, 0, 0, TAU); c.fill();
        c.translate(0, e.r * .8); c.rotate(sway); c.translate(0, -e.r * .8);
        c.scale(this.faceX > x ? -1 : 1, 1 + bob);
        c.drawImage(art.img, -size / 2, -size * .62, size, size);
        this.place(x, y);
      } else this.sprite(Sprites.enemy(e.type, flash), x, y, 0, k);
      this.drawStatus(e);
      if (ENEMY_TYPES[e.type].armor && !e.broken) { // intact armour: a steel ring
        c.strokeStyle = '#cfd6dd'; c.globalAlpha = .75; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, e.r * k + 5, 0, TAU); c.stroke(); c.globalAlpha = 1;
      }
      if (e.hp < e.maxHp) {
        const w = e.r * 2, top = art ? -e.r * ENEMY_ART_SCALE * k * .62 - 4 : -e.r - 7;
        c.fillStyle = '#111a25'; c.fillRect(-w / 2, top, w, 3);
        c.fillStyle = '#ff8b71'; c.fillRect(-w / 2, top, w * Math.max(0, e.hp) / e.maxHp, 3);
      }
      return;
    }

    const px = e.boss ? 1.7 : 1, kind = e.mini ? 'mini' : 'boss', art = e.mini ? e.miniKind : stageInfo(e.tier).art;
    this.place(x, y);
    // A blinking boss fades out over its windup.
    const fade = e.tele && e.tele.type === 'blink' ? Math.max(.15, e.windup / e.windupMax) : 1;
    c.globalAlpha = fade;
    c.fillStyle = '#0007'; c.beginPath(); c.ellipse(0, e.r * .85 * px, e.r * .95 * px, 4 * px, 0, 0, TAU); c.fill();
    const portrait = Sprites.portrait(kind, art);
    if (portrait) {
      const size = (e.mini ? 70 : 96) * px, ox = (e.mini ? -35 : -48) * px, oy = (e.mini ? -51 : -66) * px;
      c.drawImage(portrait.img, ox, oy, size, size);
      if (e.hit > 0) { c.globalAlpha = .45 * fade; c.drawImage(Sprites.portrait(kind, art, true).img, ox, oy, size, size); }
    } else {
      c.fillStyle = e.hit > 0 ? '#fff' : e.color; c.beginPath(); c.arc(0, 0, e.r, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    const w = 65;
    c.fillStyle = '#08131e'; c.fillRect(-w / 2, -54, w, 5);
    c.fillStyle = '#ff698d'; c.fillRect(-w / 2, -54, w * Math.max(0, e.hp) / e.maxHp, 5);
    c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
    c.fillText(e.mini ? `${e.name} · Lv ${e.level}` : `Lv ${e.level}`, 0, -59);
  }

  // The Hearth: its pool of light, a brazier, and its health while foes attack it.
  drawHearth(g) {
    const h = g.hearth, c = this.ctx;
    if (!h || !this.visible(h.x, h.y, HEARTH.r)) return;
    const k = Math.min(h.t, HEARTH.maxCharge) / HEARTH.maxCharge;
    c.globalAlpha = .1 + .04 * Math.sin(g.time * 5); c.fillStyle = '#ff9a3c';
    c.beginPath(); c.arc(h.x, h.y, HEARTH.r, 0, TAU); c.fill();
    c.globalAlpha = .55; c.strokeStyle = '#ffb064'; c.lineWidth = 2; c.setLineDash([10, 8]); c.lineDashOffset = -g.time * 20;
    c.stroke(); c.setLineDash([]);
    // Charge arc: how strong the recall nova has grown.
    c.globalAlpha = .9; c.strokeStyle = k >= 1 ? '#fff1a8' : '#ff8a3d'; c.lineWidth = 4;
    c.beginPath(); c.arc(h.x, h.y, HEARTH.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    c.globalAlpha = 1;
    this.sprite(Sprites.hearth(), h.x, h.y, 0, 1 + .04 * Math.sin(g.time * 9));
    this.worldTransform();
    if (h.hp < h.maxHp) {
      c.fillStyle = '#111a25'; c.fillRect(h.x - 20, h.y - 34, 40, 4);
      c.fillStyle = '#ffb064'; c.fillRect(h.x - 20, h.y - 34, 40 * Math.max(0, h.hp) / h.maxHp, 4);
    }
  }

  drawObstacles(g) {
    const scene = stageInfo(g.stage);
    for (const o of g.obstacles) if (this.visible(o.x, o.y, o.r * 2)) this.sprite(obstacleSprite(o.kind, o.r, o.v, scene), o.x, o.y);
    this.worldTransform();
  }

  // Dying foes flash white, swell and flatten as they fade.
  drawCorpses(g) {
    const c = this.ctx;
    for (const d of g.fx.corpses) {
      if (!this.visible(d.x, d.y, 40)) continue;
      const k = clamp(d.life / d.max, 0, 1), art = Sprites.enemyArt(d.type, k > .7);
      this.place(d.x, d.y);
      c.globalAlpha = k;
      c.scale(1 + (1 - k) * .45, .25 + k * .75);
      if (art) { const size = d.r * ENEMY_ART_SCALE; c.drawImage(art.img, -size / 2, -size * .62, size, size); }
      else { c.fillStyle = k > .7 ? '#fff' : d.color; c.beginPath(); c.arc(0, 0, d.r, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    this.worldTransform();
  }

  drawArcs(g) {
    const c = this.ctx;
    for (const a of g.fx.arcs) {
      const mx = (a.x1 + a.x2) / 2 + Math.sin(g.time * 93) * 8, my = (a.y1 + a.y2) / 2 + Math.cos(g.time * 89) * 8;
      c.beginPath(); c.moveTo(a.x1, a.y1); c.lineTo(mx, my); c.lineTo(a.x2, a.y2);
      const alpha = clamp(a.life / a.max, 0, 1);
      c.globalAlpha = alpha * .3; c.strokeStyle = '#50deff'; c.lineWidth = 16; c.stroke();
      c.globalAlpha = alpha; c.strokeStyle = '#60dfff'; c.lineWidth = 7; c.stroke();
      c.strokeStyle = '#f2ffff'; c.lineWidth = 2; c.stroke();
    }
    c.globalAlpha = 1;
  }

  drawShockwaves(g) {
    const c = this.ctx;
    for (const s of g.fx.shockwaves) {
      if (!this.visible(s.x, s.y, s.r)) continue;
      const progress = 1 - s.life / s.max, alpha = clamp(1 - progress, 0, 1);
      c.globalAlpha = alpha;
      this.sprite(Sprites.glow(s.type === 'meteor' ? '#ff8d3c' : s.color, s.type === 'meteor' ? 'flash' : 'ring'), s.x, s.y, 0, s.r / 64);
      this.worldTransform();
      const r = s.r * (.3 + progress * .7);
      c.strokeStyle = s.color; c.beginPath(); c.arc(s.x, s.y, r, 0, TAU);
      c.globalAlpha = alpha * .3; c.lineWidth = s.type === 'scythe' ? 18 : 13; c.stroke();
      c.globalAlpha = alpha; c.lineWidth = s.type === 'scythe' ? 8 : 5; c.stroke();
      if (s.type === 'scythe') {
        c.strokeStyle = '#f6d4ff'; c.lineWidth = 5;
        for (let i = 0; i < 2; i++) { const a0 = g.time * 6 + i * Math.PI; c.beginPath(); c.arc(s.x, s.y, r, a0, a0 + 1.25); c.stroke(); }
      }
    }
    c.globalAlpha = 1;
  }

  drawBeams(g) {
    const c = this.ctx;
    for (const b of g.fx.beams) {
      const alpha = clamp(b.life / b.max, 0, 1);
      c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2);
      c.globalAlpha = alpha * .3; c.strokeStyle = '#ffe78c'; c.lineWidth = 64; c.stroke();
      c.globalAlpha = alpha; c.strokeStyle = '#ffab52'; c.lineWidth = 36; c.stroke();
      c.strokeStyle = '#fff7bc'; c.lineWidth = 12; c.stroke();
    }
    c.globalAlpha = 1;
  }

  drawOrbs(g) {
    const p = g.player, n = p.skills.orb;
    if (!n) return;
    const c = this.ctx, orb = Sprites.orb();
    for (const {x, y} of orbPositions(g)) {
      this.sprite(orb, x, y);
      this.worldTransform();
      c.strokeStyle = '#e5c2ff'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 10, g.time * 3, g.time * 3 + Math.PI * 1.15); c.stroke();
    }
  }

  // Sun Discs, Spirit Wolves, the Mirror Ward and Ember Whip swings.
  drawNewSpells(g) {
    const c = this.ctx, p = g.player;
    for (const d of g.discs) if (this.visible(d.x, d.y, 40)) this.sprite(Sprites.disc(), d.x, d.y, d.spin, d.scale);
    for (const w of g.allies) {
      if (!this.visible(w.x, w.y, 40)) continue;
      const s = Sprites.wolf();
      this.place(w.x, w.y);
      c.scale(w.face * w.scale, w.scale);
      c.drawImage(s.img, -s.hw, -s.hh, s.w, s.h);
    }
    this.worldTransform();
    if (p.wardTime > 0) {
      c.globalAlpha = .18 + .1 * Math.sin(g.time * 18); c.fillStyle = '#d8ecff';
      c.beginPath(); c.arc(p.x, p.y, WARD_RADIUS, 0, TAU); c.fill();
      c.globalAlpha = .85; c.strokeStyle = '#f2f8ff'; c.lineWidth = 3; c.stroke();
    }
    for (const s of g.fx.swings) {
      const k = s.life / s.max;
      c.globalAlpha = k; c.lineCap = 'round';
      c.strokeStyle = '#ff8a3d'; c.lineWidth = 14;
      c.beginPath(); c.arc(s.x, s.y, s.r * .8, s.a - s.half, s.a + s.half); c.stroke();
      c.strokeStyle = '#ffe09a'; c.lineWidth = 4; c.stroke();
      c.lineCap = 'butt';
    }
    c.globalAlpha = 1;
  }

  drawAura(g) {
    const p = g.player;
    if (p.ultimate !== 'aura') return;
    const c = this.ctx;
    c.globalAlpha = .13 + .05 * Math.sin(g.time * 5);
    this.sprite(Sprites.glow('#ff73a0', 'aura'), p.x, p.y, 0, 110 / 64);
    this.worldTransform();
    c.globalAlpha = .42; c.strokeStyle = '#ff8bb8'; c.lineWidth = 2;
    c.beginPath(); c.arc(p.x, p.y, 108, 0, TAU); c.stroke();
    c.globalAlpha = 1;
  }

  drawPlayer(g) {
    const c = this.ctx, p = g.player, mage = mageImages[p.facing];
    if (p.dashT > 0 && imageReady(mage)) { // afterimages trailing the dash
      for (let i = 1; i <= 3; i++) {
        this.place(Math.round(p.x - p.dashX * i * 16), Math.round(p.y - p.dashY * i * 16));
        c.globalAlpha = .28 / i; c.drawImage(mage, -32, -50, 64, 80);
      }
      c.globalAlpha = 1;
    }
    this.place(Math.round(p.x), Math.round(p.y));
    // Dash recharge: a thin arc at the feet that fills as the dash comes back.
    if (p.dashCD > 0 && g.running) {
      const k = 1 - p.dashCD / g.dashCooldown;
      c.strokeStyle = '#ffb064'; c.globalAlpha = .7; c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(0, 15, 22, 8, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke(); c.globalAlpha = 1;
    }
    if (p.invuln > 0 && p.dashT <= 0 && Math.floor(g.time * 20) % 2) c.globalAlpha = .45;
    c.fillStyle = '#0007'; c.beginPath(); c.ellipse(0, 15, 18, 6, 0, 0, TAU); c.fill();
    if (imageReady(mage)) c.drawImage(mage, -32, -50, 64, 80);
    else { c.fillStyle = '#515087'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
}
