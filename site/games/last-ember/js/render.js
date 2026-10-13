'use strict';
// World rendering. Everything is drawn with drawImage from the sprite cache, culled to
// the camera view, with no shadowBlur or per-frame gradients.

const QUALITY_LEVELS = {high: 2, low: 1};

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

  resize() {
    this.W = innerWidth; this.H = innerHeight;
    this.px = this.ratio;
    this.canvas.width = Math.round(this.W * this.px);
    this.canvas.height = Math.round(this.H * this.px);
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
    this.camX = p.x; this.camY = p.y;
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
    for (const m of g.meteors) this.drawMeteor(m);
    for (const q of g.projectiles) if (this.visible(q.x, q.y, 40)) this.sprite(Sprites.projectile(q.kind), q.x, q.y, Math.atan2(q.vy, q.vx));
    for (const q of g.enemyShots) if (this.visible(q.x, q.y, 30)) this.sprite(Sprites.enemyShot(q.kind), q.x, q.y, Math.atan2(q.vy, q.vx));
    for (const e of g.enemies) if (!e.dead && this.visible(e.x, e.y, e.boss ? 200 : 60)) this.drawEnemy(e);

    this.worldTransform();
    this.drawArcs(g);
    this.drawShockwaves(g);
    this.drawBeams(g);
    if (g.settings.particles) g.fx.particles.draw(c, v);
    this.drawOrbs(g);
    this.drawAura(g);
    this.drawPlayer(g);
    this.worldTransform();
    if (g.settings.damageNumbers) g.fx.texts.draw(c, v);

    if (g.time < 8 && g.running) {
      c.setTransform(this.px, 0, 0, this.px, 0, 0);
      c.textAlign = 'center'; c.fillStyle = '#b9d4e699'; c.font = '11px monospace';
      c.fillText('MOVE · COLLECT GEMS · BUILD YOUR SPELLS', this.W / 2, this.H - 18);
    }
  }

  drawFloor(g) {
    const c = this.ctx, v = this.view, scene = stageInfo(g.stage);
    // The floor ends exactly where movement stops (plus the player's body), so every
    // visible tile is walkable and the wall is the real boundary.
    const fx = ARENA_X + FLOOR_MARGIN, fy = ARENA_Y + FLOOR_MARGIN;
    const x0 = Math.max(-fx, v.x0), x1 = Math.min(fx, v.x1), y0 = Math.max(-fy, v.y0), y1 = Math.min(fy, v.y1);
    if (x1 > x0 && y1 > y0) {
      c.fillStyle = scene.floor;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);

      // Grid, clipped to the floor: one path, one stroke.
      c.globalAlpha = .26; c.strokeStyle = scene.line; c.lineWidth = 1; c.beginPath();
      for (let x = Math.ceil(x0 / 32) * 32; x <= x1; x += 32) { c.moveTo(x, y0); c.lineTo(x, y1); }
      for (let y = Math.ceil(y0 / 32) * 32; y <= y1; y += 32) { c.moveTo(x0, y); c.lineTo(x1, y); }
      c.stroke();
      c.globalAlpha = 1;
    }
    // Wall sits just outside the floor.
    c.strokeStyle = scene.line; c.lineWidth = 12;
    c.strokeRect(-fx - 6, -fy - 6, fx * 2 + 12, fy * 2 + 12);
    c.strokeStyle = scene.accent; c.globalAlpha = .35; c.lineWidth = 2;
    c.strokeRect(-fx - 1, -fy - 1, fx * 2 + 2, fy * 2 + 2);

    // Scattered stage decorations: rings everywhere, plus a stage motif from stage 2 on.
    c.strokeStyle = scene.line; c.globalAlpha = .35; c.lineWidth = 2; c.beginPath();
    const motif = [];
    for (let i = 0; i < 38; i++) {
      const x = (i * 397) % 2080 - 1040, y = (i * 613) % 1610 - 805;
      if (x < v.x0 - 25 || x > v.x1 + 25 || y < v.y0 - 25 || y > v.y1 + 25) continue;
      const r = 7 + (i % 3) * 6;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      if (g.stage === 2) { c.moveTo(x - 9, y + 8); c.lineTo(x + 8, y - 9); }
      if (g.stage === 3) { c.moveTo(x, y - 15); c.lineTo(x + 13, y + 5); c.lineTo(x - 13, y + 5); c.closePath(); }
      if (g.stage >= 4) motif.push(x, y);
    }
    c.stroke();
    if (motif.length) {
      c.strokeStyle = scene.accent; c.fillStyle = scene.accent; c.globalAlpha = .25; c.beginPath();
      for (let k = 0; k < motif.length; k += 2) this.motif(g.stage, motif[k], motif[k + 1]);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  motif(stage, x, y) {
    const c = this.ctx;
    if (stage === 4) { c.moveTo(x - 10, y + 10); c.lineTo(x, y - 14); c.lineTo(x + 10, y + 10); }
    else if (stage === 5) { c.moveTo(x + 18, y); c.ellipse(x, y, 18, 7, .4, 0, TAU); }
    else if (stage === 6) {
      c.moveTo(x + 13, y); c.arc(x, y, 13, 0, TAU);
      for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; c.rect(x + Math.cos(a) * 15 - 2, y + Math.sin(a) * 15 - 2, 4, 4); }
    } else if (stage === 7) {
      for (let j = 0; j < 3; j++) { const x0 = x - 8 + j * 7; c.moveTo(x0 + Math.cos(j * .4) * 12, y + Math.sin(j * .4) * 12); c.arc(x0, y, 12, j * .4, Math.PI + j * .4); }
    } else {
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4, rad = j % 2 ? 7 : 19, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (j === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
    }
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
      const s = Sprites.meteor(m.kind === 'armageddon' ? 1.45 : 1);
      this.sprite(s, m.x - 55 * (1 - t), m.y - 230 * (1 - t) - 30 * (m.kind === 'armageddon' ? 1.45 : 1));
    } else {
      c.globalAlpha = clamp(1 - (m.t - m.delay) / .52, 0, 1);
      this.sprite(Sprites.glow('#ff9e58', 'flash'), m.x, m.y, 0, m.r * .85 / 64);
      c.globalAlpha = 1;
    }
    this.worldTransform();
  }

  drawEnemy(e) {
    const c = this.ctx, x = Math.round(e.x), y = Math.round(e.y);
    if (!e.boss && !e.mini) {
      this.sprite(Sprites.enemy(e.type, e.hit > 0), x, y);
      if (e.hp < e.maxHp) {
        const w = e.r * 2;
        c.fillStyle = '#111a25'; c.fillRect(-w / 2, -e.r - 7, w, 3);
        c.fillStyle = '#ff8b71'; c.fillRect(-w / 2, -e.r - 7, w * Math.max(0, e.hp) / e.maxHp, 3);
      }
      return;
    }

    const px = e.boss ? 1.7 : 1, art = e.mini ? e.miniKind : e.tier - 1;
    this.place(x, y);
    if (e.boss && e.windup > 0) {
      // Telegraph shows the real slam radius and fills in as the slam approaches.
      const color = e.tier >= 3 ? stageInfo(e.tier).accent : '#ff8191';
      c.globalAlpha = .12 + (1 - e.windup / .85) * .18; c.fillStyle = color;
      c.beginPath(); c.arc(0, 0, e.slamRadius, 0, TAU); c.fill();
      c.globalAlpha = 1; c.strokeStyle = color; c.lineWidth = 2; c.stroke();
    }
    c.fillStyle = '#0007'; c.beginPath(); c.ellipse(0, e.r * .85 * px, e.r * .95 * px, 4 * px, 0, 0, TAU); c.fill();
    const portrait = Sprites.portrait(art);
    if (portrait) {
      const size = (e.mini ? 70 : 96) * px, ox = (e.mini ? -35 : -48) * px, oy = (e.mini ? -51 : -66) * px;
      c.drawImage(portrait.img, ox, oy, size, size);
      if (e.hit > 0) { c.globalAlpha = .45; c.drawImage(Sprites.portrait(art, true).img, ox, oy, size, size); c.globalAlpha = 1; }
    } else {
      c.fillStyle = e.hit > 0 ? '#fff' : e.color; c.beginPath(); c.arc(0, 0, e.r, 0, TAU); c.fill();
    }
    const w = 65;
    c.fillStyle = '#08131e'; c.fillRect(-w / 2, -54, w, 5);
    c.fillStyle = '#ff698d'; c.fillRect(-w / 2, -54, w * Math.max(0, e.hp) / e.maxHp, 5);
    c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
    c.fillText(e.mini ? `${e.name} · Lv ${e.level}` : `Lv ${e.level}`, 0, -59);
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
    for (let i = 0; i < n; i++) {
      const a = g.time * 2 + i * TAU / n, x = p.x + Math.cos(a) * ORB_RADIUS, y = p.y + Math.sin(a) * ORB_RADIUS;
      this.sprite(orb, x, y);
      this.worldTransform();
      c.strokeStyle = '#e5c2ff'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 10, g.time * 3, g.time * 3 + Math.PI * 1.15); c.stroke();
    }
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
    const c = this.ctx, p = g.player;
    this.place(Math.round(p.x), Math.round(p.y));
    if (p.invuln > 0 && Math.floor(g.time * 20) % 2) c.globalAlpha = .45;
    c.fillStyle = '#0007'; c.beginPath(); c.ellipse(0, 15, 18, 6, 0, 0, TAU); c.fill();
    const mage = mageImages[p.facing];
    if (imageReady(mage)) c.drawImage(mage, -32, -50, 64, 80);
    else { c.fillStyle = '#515087'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
}
