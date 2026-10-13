'use strict';
// Short-lived visual effects. Particles and damage numbers use fixed-size pools so a
// busy fight does not allocate thousands of objects per second or grow without bound.

class ParticlePool {
  constructor(capacity = 700) {
    this.cap = capacity;
    this.n = 0;
    this.x = new Float32Array(capacity); this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity); this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity); this.max = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.color = new Array(capacity);
  }
  clear() { this.n = 0; }
  burst(x, y, color, count) {
    for (let k = 0; k < count; k++) {
      if (this.n >= this.cap) return; // pool full: drop extras rather than stall
      const i = this.n++;
      this.x[i] = x; this.y[i] = y;
      this.vx[i] = rand(-80, 80); this.vy[i] = rand(-80, 80);
      this.max[i] = this.life[i] = rand(.2, .55);
      this.size[i] = rand(2, 4);
      this.color[i] = color;
    }
  }
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i] - dt;
      if (life <= 0) continue;
      this.life[w] = life; this.max[w] = this.max[i];
      this.x[w] = this.x[i] + this.vx[i] * dt; this.y[w] = this.y[i] + this.vy[i] * dt;
      this.vx[w] = this.vx[i] * .95; this.vy[w] = this.vy[i] * .95;
      this.size[w] = this.size[i]; this.color[w] = this.color[i];
      w++;
    }
    this.n = w;
  }
  draw(c, view) {
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i], y = this.y[i];
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
      const t = this.life[i] / this.max[i], s = this.size[i] * (.6 + t) * 1.6;
      c.globalAlpha = t;
      c.fillStyle = this.color[i];
      c.fillRect(x - s / 2, y - s / 2, s, s);
    }
    c.globalAlpha = 1;
  }
}

class FloatTextPool {
  constructor(capacity = 60) {
    this.items = Array.from({length: capacity}, () => ({x: 0, y: 0, text: '', color: '#fff', life: 0}));
    this.next = 0;
  }
  clear() { for (const t of this.items) t.life = 0; }
  // When full, the oldest number is recycled.
  add(x, y, text, color = '#fff') {
    const t = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    t.x = x; t.y = y; t.text = text; t.color = color; t.life = .7;
  }
  update(dt) {
    for (const t of this.items) if (t.life > 0) { t.life -= dt; t.y -= 32 * dt; }
  }
  draw(c, view) {
    c.font = 'bold 12px monospace';
    c.textAlign = 'center';
    for (const t of this.items) {
      if (t.life <= 0 || t.x < view.x0 || t.x > view.x1 || t.y < view.y0 || t.y > view.y1) continue;
      c.globalAlpha = clamp(t.life / .7, 0, 1);
      c.fillStyle = '#17142b'; c.fillText(t.text, t.x + 1, t.y + 1);
      c.fillStyle = t.color; c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
  }
}

// Expanding rings, lightning arcs and beams: few at a time, plain objects.
class Effects {
  constructor() {
    this.particles = new ParticlePool();
    this.texts = new FloatTextPool();
    this.shockwaves = [];
    this.arcs = [];
    this.beams = [];
  }
  clear() {
    this.particles.clear(); this.texts.clear();
    this.shockwaves.length = 0; this.arcs.length = 0; this.beams.length = 0;
  }
  shockwave(x, y, r, life, color, type) {
    if (this.shockwaves.length < 48) this.shockwaves.push({x, y, r, life, max: life, color, type});
  }
  arc(x1, y1, x2, y2) { this.arcs.push({x1, y1, x2, y2, life: .2, max: .2}); }
  beam(x1, y1, x2, y2) { this.beams.push({x1, y1, x2, y2, life: .45, max: .45}); }
  update(dt) {
    this.particles.update(dt);
    this.texts.update(dt);
    for (const list of [this.shockwaves, this.arcs, this.beams]) {
      for (const s of list) s.life -= dt;
      compact(list, s => s.life > 0);
    }
  }
}
