'use strict';
// Automatic spell casting. Runs once per simulation step.
// g.nearby holds the three enemies closest to the player, computed once per step and
// shared by every spell instead of each spell sorting the whole horde.

const ORB_RADIUS = 76;

// Blood Pact: every cast drains a slice of current HP. It never kills on its own.
function bloodCost(p) {
  if (p.bargains.bloodPact) p.hp = Math.max(Math.min(p.hp, 1), p.hp * .997);
}

// The n enemies closest to the player (for spells that need more than g.nearby's three).
function nearestN(g, n) {
  const p = g.player;
  return g.enemies.filter(e => !e.dead).sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y)).slice(0, n);
}

function castSpells(g, dt) {
  const p = g.player, s = p.skills, cd = p.cool, haste = p.castCooldown, ev = p.evolved;
  for (const k in cd) cd[k] -= dt;
  const near = g.nearby, target = near[0];

  if (target && cd.basic <= 0) {
    const dmg = 10 + p.level * .7 + (s.bolt - 1) * 6 + s.echo * 4;
    if (ev.bolt === 'barrage') for (const e of near) g.projectiles.push(new Projectile(p.x, p.y, e, dmg * .6, 'arcane'));
    else if (ev.bolt === 'lance') g.projectiles.push(new Projectile(p.x, p.y, target, dmg * 1.4, 'arcane', {pierce: 3, scale: 1.3}));
    else g.projectiles.push(new Projectile(p.x, p.y, target, dmg, 'arcane'));
    cd.basic = Math.max(.4, .8 - (s.bolt - 1) * .07) * haste;
    bloodCost(p);
  }
  if (s.fire && cd.fire <= 0 && target) {
    const dmg = 15 + s.fire * 8, base = Math.max(.48, 1.75 - s.fire * .18) * haste;
    if (ev.fire === 'meteor') { g.projectiles.push(new Projectile(p.x, p.y, target, dmg * 2.6, 'fire', {scale: 1.8, blast: 108})); cd.fire = base * 1.7; }
    else if (ev.fire === 'cinder') { for (let i = 0; i < 4; i++) g.projectiles.push(new Projectile(p.x, p.y, near[i % near.length], dmg * .45, 'fire', {scale: .8, blast: 44})); cd.fire = base; }
    else { g.projectiles.push(new Projectile(p.x, p.y, target, dmg, 'fire')); cd.fire = base; }
    bloodCost(p);
  }
  if (s.lightning && cd.lightning <= 0 && near.length) {
    const chain = ev.lightning === 'chain' ? nearestN(g, 7) : near, dmg = (12 + s.lightning * 7) * (ev.lightning === 'chain' ? .7 : 1);
    chain.forEach((e, i) => {
      if (i < chain.length - 1) g.fx.arc(e.x, e.y, chain[i + 1].x, chain[i + 1].y);
      if (ev.lightning === 'thunderhead') {
        g.fx.shockwave(e.x, e.y, 60, .3, '#9df8ff');
        g.forEachEnemyNear(e.x, e.y, 60, o => { if (o !== e) g.hit(o, dmg * .4, '#9df8ff'); });
      }
      g.hit(e, dmg, '#9df8ff');
    });
    cd.lightning = Math.max(1.3, 4.3 - s.lightning * .45) * haste;
    bloodCost(p);
  }
  if (target && s.ice && cd.ice <= 0) {
    const opts = ev.ice === 'spike' ? {pierce: 2, freeze: .8, scale: 1.25} : ev.ice === 'blizzard' ? {shatter: true} : {};
    g.projectiles.push(new Projectile(p.x, p.y, target, 17 + s.ice * 9, 'ice', opts));
    cd.ice = Math.max(.8, 2.5 - s.ice * .25) * haste;
    bloodCost(p);
  }
  if (target && s.venom && cd.venom <= 0) {
    g.projectiles.push(new Projectile(p.x, p.y, target, 16 + s.venom * 7, 'venom', {cloud: ev.venom === 'plague'}));
    cd.venom = Math.max(1.5, 4.5 - s.venom * .4) * haste;
    bloodCost(p);
  }
  if (s.blades && cd.blades <= 0 && near.length) {
    const count = ev.blades === 'storm' ? 6 : 3, reaper = ev.blades === 'reaper';
    for (let i = 0; i < count; i++) {
      g.projectiles.push(new Projectile(p.x + Math.cos(i * TAU / count) * 10, p.y + Math.sin(i * TAU / count) * 10, near[i % near.length],
        (12 + s.blades * 8) * (reaper ? 1.5 : count > 3 ? .65 : 1), 'blade', reaper ? {pierce: 2} : {}));
    }
    cd.blades = Math.max(.9, 3.1 - s.blades * .3) * haste;
    bloodCost(p);
  }
  if (s.nova && cd.nova <= 0 && target && dist(target, p) < 150) {
    const radius = 105 + s.nova * 11, dmg = 18 + s.nova * 10;
    const pulse = (r, mult = 1) => {
      g.forEachEnemyNear(p.x, p.y, r, e => { g.hit(e, dmg * mult, '#b3efff'); if (ev.nova === 'static') e.shock = 3; });
      g.fx.shockwave(p.x, p.y, r, .4, ev.nova === 'static' ? '#ffe36b' : '#8bdcff');
    };
    pulse(radius);
    if (ev.nova === 'tempest') g.after(.35, () => pulse(radius * 1.45, .7));
    cd.nova = Math.max(1.4, 5 - s.nova * .45) * haste;
    bloodCost(p);
  }
  if (s.starfall && cd.starfall <= 0 && near.length) {
    const dmg = 35 + s.starfall * 14;
    if (ev.starfall === 'comet') g.meteors.push(new Meteor(target.x, target.y, dmg * 3.5, .7, 'comet'));
    else {
      const count = ev.starfall === 'shower' ? 5 : Math.min(2, 1 + Math.floor(s.starfall / 3));
      for (let i = 0; i < count; i++) {
        const e = near[i % near.length], spread = i >= near.length ? 70 : 0;
        g.meteors.push(new Meteor(e.x + rand(-spread, spread), e.y + rand(-spread, spread), dmg * (count > 2 ? .6 : 1), .55 + i * .12, 'starfall'));
      }
    }
    cd.starfall = Math.max(3.7, 7 - s.starfall * .45) * haste;
    bloodCost(p);
  }
  if (s.orb) {
    // Each orb touches foes near it; the random roll spreads hits to about 5 per second.
    const n = s.orb, dmg = 9 + n * 4, gravity = ev.orb === 'gravity', chance = dt * (gravity ? 8 : 5);
    for (const o of orbPositions(g)) {
      g.forEachEnemyNear(o.x, o.y, 10, e => {
        if (Math.random() >= chance) return;
        g.hit(e, dmg, '#cf9aff');
        if (gravity) e.slow = Math.max(e.slow, 1.5);
      });
    }
  }
  if (p.ultimate && cd.ult <= 0) castUltimate(g, p, target, near);
}

// Where every orb is right now; Twin Halo adds two on a wider ring turning the other way.
function orbPositions(g) {
  const p = g.player, n = p.skills.orb, out = [];
  for (let i = 0; i < n; i++) { const a = g.time * 2 + i * TAU / n; out.push({x: p.x + Math.cos(a) * ORB_RADIUS, y: p.y + Math.sin(a) * ORB_RADIUS}); }
  if (n && p.evolved.orb === 'halo') for (let i = 0; i < 2; i++) { const a = -g.time * 1.4 + i * Math.PI; out.push({x: p.x + Math.cos(a) * 130, y: p.y + Math.sin(a) * 130}); }
  return out;
}

function castUltimate(g, p, target, near) {
  const power = p.ultimatePower, cooldown = seconds => seconds * p.castCooldown * p.ultimateHaste;
  switch (p.ultimate) {
    case 'aura':
      g.forEachEnemyNear(p.x, p.y, 108, e => g.hit(e, 34 * power, '#ff76a8'));
      g.fx.shockwave(p.x, p.y, 108, .35, '#ff5299');
      g.burst(p.x, p.y, '#ff76a8', 14);
      p.cool.ult = cooldown(.6);
      bloodCost(p);
      break;
    case 'armageddon':
      // The first three meteors hunt the nearest foes; the rest scatter across the screen.
      for (let i = 0; i < 7; i++) {
        const focus = near[i % Math.max(1, near.length)];
        const aimed = i < 3 && focus;
        const x = aimed ? focus.x : p.x + rand(-g.viewW * .48, g.viewW * .48);
        const y = aimed ? focus.y : p.y + rand(-g.viewH * .48, g.viewH * .48);
        g.meteors.push(new Meteor(x, y, 110 * power, .65 + i * .18, 'armageddon'));
      }
      g.toast('ARMAGEDDON');
      p.cool.ult = cooldown(15);
      bloodCost(p);
      break;
    case 'solar': {
      if (!target) return;
      const a = angle(p, target), x2 = p.x + Math.cos(a) * 650, y2 = p.y + Math.sin(a) * 650;
      const dx = x2 - p.x, dy = y2 - p.y, len = dx * dx + dy * dy;
      for (const e of g.enemies) {
        if (e.dead) continue;
        const t = clamp(((e.x - p.x) * dx + (e.y - p.y) * dy) / len, 0, 1);
        if (Math.hypot(e.x - (p.x + t * dx), e.y - (p.y + t * dy)) < e.r + 22) g.hit(e, 185 * power, '#fff1a4');
      }
      g.fx.beam(p.x, p.y, x2, y2);
      g.burst(p.x, p.y, '#fff0a0', 26);
      p.cool.ult = cooldown(6);
      bloodCost(p);
      break;
    }
    case 'void':
      g.forEachEnemyNear(p.x, p.y, 140, e => g.hit(e, 115 * power, '#d2a1ff'));
      g.fx.shockwave(p.x, p.y, 140, .5, '#ae7aff', 'scythe');
      g.burst(p.x, p.y, '#b684ff', 26);
      p.cool.ult = cooldown(3);
      bloodCost(p);
      break;
  }
}
