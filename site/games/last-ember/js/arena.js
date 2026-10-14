'use strict';
// Arena obstacles: pillars, gravestones, crystals, rocks and thornbushes that break up
// the open floor. Each stage gets its own layout from a fixed seed, so it is the same on
// every visit and needs no saving. Obstacles are circles: the mage and foes are pushed
// out of them, enemy shots and charges stop against them, and the mage's spells pass
// over them (cover protects you, never your targets).

// Obstacle look per boss art index (stage), and how many to place.
const OBSTACLE_STYLE = ['tomb', 'rock', 'crystal', 'rock', 'rock', 'pillar', 'rock', 'pillar',
  'crystal', 'pillar', 'thorn', 'pillar', 'tomb', 'crystal', 'pillar', 'rock'];
const OBSTACLE_COUNT = 20, OBSTACLE_CLEAR = 230; // and nothing within this of the arena centre

function makeObstacles(stage) {
  let seed = (stage * 2654435761) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const kind = OBSTACLE_STYLE[stageInfo(stage).art] || 'rock', out = [];
  for (let tries = 0; out.length < OBSTACLE_COUNT && tries < 600; tries++) {
    const r = 20 + rnd() * 24, x = (rnd() * 2 - 1) * (ARENA_X - 90), y = (rnd() * 2 - 1) * (ARENA_Y - 90);
    if (Math.hypot(x, y) < OBSTACLE_CLEAR) continue;
    // Wide gaps between obstacles, so nothing (the mage included) gets trapped.
    if (out.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 130)) continue;
    out.push({x, y, r, kind, v: Math.floor(rnd() * 3)});
  }
  return out;
}

// Pushes a body of radius r out of every obstacle. Returns true if it touched one.
function pushOutOfObstacles(obs, b, r) {
  let hit = false;
  for (const o of obs) {
    const dx = b.x - o.x, dy = b.y - o.y, min = o.r + r;
    if (dx > min || dx < -min || dy > min || dy < -min) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || .01;
    b.x = o.x + dx / d * min; b.y = o.y + dy / d * min;
    hit = true;
  }
  return hit;
}

function insideObstacle(obs, x, y, pad = 0) {
  for (const o of obs) { const dx = x - o.x, dy = y - o.y, m = o.r + pad; if (dx * dx + dy * dy < m * m) return true; }
  return false;
}

// One painted look per style and size, cached as a sprite. Drawn top-down with a little
// height: a shadow, a body and a lit top.
function obstacleSprite(kind, r, v, scene) {
  const R = Math.round(r / 4) * 4;
  return Sprites.get(`ob:${kind}:${R}:${v}:${scene.name}`, () => makeSprite(R * 2.6, R * 3.6, c => {
    const line = scene.line, accent = scene.accent;
    c.fillStyle = '#0008'; c.beginPath(); c.ellipse(0, R * .55, R * 1.1, R * .45, 0, 0, TAU); c.fill();
    const shade = (x0, y0, x1, y1, a, b) => { const gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    c.lineWidth = 2; c.strokeStyle = '#0009';
    if (kind === 'pillar') {
      c.fillStyle = shade(-R, 0, R, 0, '#6b6470', '#2a262e');
      c.beginPath(); c.rect(-R * .78, -R * 1.25, R * 1.56, R * 1.7); c.fill(); c.stroke();
      for (let i = -1; i <= 1; i++) { c.strokeStyle = '#0005'; c.beginPath(); c.moveTo(i * R * .4, -R * 1.2); c.lineTo(i * R * .4, R * .4); c.stroke(); }
      c.fillStyle = shade(0, -R * 1.6, 0, -R * .9, '#9a92a0', '#58515e'); c.strokeStyle = '#0009';
      c.beginPath(); c.ellipse(0, -R * 1.25, R * .95, R * .38, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = accent; c.globalAlpha = .5; c.beginPath(); c.ellipse(0, -R * 1.27, R * .35, R * .13, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
    } else if (kind === 'tomb') {
      c.fillStyle = shade(-R, 0, R, 0, '#7d7a80', '#36343b');
      c.beginPath(); c.moveTo(-R * .7, R * .4); c.lineTo(-R * .7, -R * .8); c.arc(0, -R * .8, R * .7, Math.PI, 0); c.lineTo(R * .7, R * .4); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#0006'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, -R * 1.05); c.lineTo(0, -R * .2); c.moveTo(-R * .28, -R * .75); c.lineTo(R * .28, -R * .75); c.stroke();
      c.fillStyle = '#4f7a4a'; c.globalAlpha = .6; c.beginPath(); c.ellipse(-R * .3, R * .35, R * .5, R * .16, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
    } else if (kind === 'crystal') {
      const shards = [[-.45, .9, -.2], [0, 1.45, 0], [.45, 1, .25]];
      for (const [ox, h, tilt] of shards) {
        c.fillStyle = shade(ox * R - R * .3, 0, ox * R + R * .3, 0, accent, line);
        c.beginPath(); c.moveTo(ox * R - R * .28, R * .35); c.lineTo(ox * R + tilt * R - R * .05, -h * R); c.lineTo(ox * R + R * .28, R * .35); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#ffffff55'; c.beginPath(); c.moveTo(ox * R - R * .12, R * .2); c.lineTo(ox * R + tilt * R - R * .05, -h * R * .9); c.lineTo(ox * R, R * .2); c.fill();
      }
    } else if (kind === 'thorn') {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU, rr = R * (.55 + (i % 3) * .15);
        c.fillStyle = i % 2 ? '#2f4a26' : '#3d5f30';
        c.beginPath(); c.arc(Math.cos(a) * R * .35, Math.sin(a) * R * .25 - R * .3, rr * .6, 0, TAU); c.fill();
      }
      c.strokeStyle = '#1b2a14'; c.lineWidth = 2;
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * R * .5, Math.sin(a) * R * .35 - R * .3); c.lineTo(Math.cos(a) * R * .95, Math.sin(a) * R * .7 - R * .3); c.stroke(); }
      c.fillStyle = '#b0304a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc((i - 1) * R * .4, -R * (.4 + (i % 2) * .3), R * .1, 0, TAU); c.fill(); }
    } else { // rock
      c.fillStyle = shade(-R, -R, R, R, '#77706a', '#2b2826');
      c.beginPath();
      const pts = 9;
      for (let i = 0; i <= pts; i++) {
        const a = i / pts * TAU, rr = R * (.85 + ((i * 7 + v * 3) % 5) * .05);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * .8 - R * .3;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffffff22'; c.beginPath(); c.ellipse(-R * .25, -R * .65, R * .45, R * .2, -.3, 0, TAU); c.fill();
      c.strokeStyle = '#0006'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-R * .2, -R * .3); c.lineTo(R * .15, R * .1); c.lineTo(R * .1, R * .35); c.stroke();
      if (scene.motif === 'flame' || scene.motif === 'spikes') { c.strokeStyle = '#ff7a2a'; c.globalAlpha = .8; c.beginPath(); c.moveTo(-R * .5, -R * .1); c.lineTo(-R * .1, -R * .2); c.lineTo(R * .3, -R * .05); c.stroke(); c.globalAlpha = 1; }
    }
  }));
}
