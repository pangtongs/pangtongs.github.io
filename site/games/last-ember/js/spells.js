'use strict';
// Automatic spell casting. Runs once per simulation step.
// g.nearby holds the three enemies closest to the player, computed once per step and
// shared by every spell instead of each spell sorting the whole horde.

const ORB_RADIUS = 76;

// Blood Pact: every cast drains a slice of current HP. It never kills on its own.
function bloodCost(p) {
  if (p.bargains.bloodPact) p.hp = Math.max(Math.min(p.hp, 1), p.hp * .997);
}

function castSpells(g, dt) {
  const p = g.player, s = p.skills, cd = p.cool, haste = p.castCooldown;
  for (const k in cd) cd[k] -= dt;
  const near = g.nearby, target = near[0];

  if (target && cd.basic <= 0) {
    g.projectiles.push(new Projectile(p.x, p.y, target, 10 + p.level * .7 + (s.bolt - 1) * 6 + s.echo * 4, 'arcane'));
    cd.basic = Math.max(.4, .8 - (s.bolt - 1) * .07) * haste;
    bloodCost(p);
  }
  if (s.fire && cd.fire <= 0 && target) {
    g.projectiles.push(new Projectile(p.x, p.y, target, 15 + s.fire * 8, 'fire'));
    cd.fire = Math.max(.48, 1.75 - s.fire * .18) * haste;
    bloodCost(p);
  }
  if (s.lightning && cd.lightning <= 0 && near.length) {
    near.forEach((e, i) => {
      if (i < near.length - 1) g.fx.arc(e.x, e.y, near[i + 1].x, near[i + 1].y);
      g.hit(e, 12 + s.lightning * 7, '#9df8ff');
    });
    cd.lightning = Math.max(1.3, 4.3 - s.lightning * .45) * haste;
    bloodCost(p);
  }
  if (target && s.ice && cd.ice <= 0) {
    g.projectiles.push(new Projectile(p.x, p.y, target, 17 + s.ice * 9, 'ice'));
    cd.ice = Math.max(.8, 2.5 - s.ice * .25) * haste;
    bloodCost(p);
  }
  if (target && s.venom && cd.venom <= 0) {
    g.projectiles.push(new Projectile(p.x, p.y, target, 16 + s.venom * 7, 'venom'));
    cd.venom = Math.max(1.5, 4.5 - s.venom * .4) * haste;
    bloodCost(p);
  }
  if (s.blades && cd.blades <= 0 && near.length) {
    for (let i = 0; i < 3; i++) g.projectiles.push(new Projectile(p.x + (i - 1) * 10, p.y, near[i % near.length], 12 + s.blades * 8, 'blade'));
    cd.blades = Math.max(.9, 3.1 - s.blades * .3) * haste;
    bloodCost(p);
  }
  if (s.nova && cd.nova <= 0 && target && dist(target, p) < 150) {
    const radius = 105 + s.nova * 11;
    g.forEachEnemyNear(p.x, p.y, radius, e => g.hit(e, 18 + s.nova * 10, '#b3efff'));
    g.fx.shockwave(p.x, p.y, radius, .4, '#8bdcff');
    cd.nova = Math.max(1.4, 5 - s.nova * .45) * haste;
    bloodCost(p);
  }
  if (s.starfall && cd.starfall <= 0 && near.length) {
    const count = Math.min(2, 1 + Math.floor(s.starfall / 3));
    for (let i = 0; i < count; i++) {
      const e = near[i % near.length];
      g.meteors.push(new Meteor(e.x, e.y, 35 + s.starfall * 14, .55 + i * .15, 'starfall'));
    }
    cd.starfall = Math.max(3.7, 7 - s.starfall * .45) * haste;
    bloodCost(p);
  }
  if (s.orb) {
    // Each orb touches foes near it; the random roll spreads hits to about 5 per second.
    const n = s.orb, base = g.time * 2, dmg = 9 + n * 4, chance = dt * 5;
    for (let i = 0; i < n; i++) {
      const a = base + i * TAU / n;
      g.forEachEnemyNear(p.x + Math.cos(a) * ORB_RADIUS, p.y + Math.sin(a) * ORB_RADIUS, 10, e => {
        if (Math.random() < chance) g.hit(e, dmg, '#cf9aff');
      });
    }
  }
  if (p.ultimate && cd.ult <= 0) castUltimate(g, p, target, near);
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
