'use strict';
// Spell fusions: when two related spells both reach FUSION_RANK, a third power awakens
// and casts on its own cooldown. Discovered fusions are remembered across runs and
// listed in the spellbook; level-up cards say when they would complete one.

const FUSION_RANK = 4;
const FUSION_CD_SCALE = 1.4; // all fusion cooldowns, tuned with tools/sim.js

// power(g, a, b): damage scale from the two spell ranks and the mage's level.
const fusionPower = (g, key) => {
  const f = FUSIONS[key], s = g.player.skills;
  return 12 + (s[f.needs[0]] + s[f.needs[1]]) * 4 + g.player.level * .4; // tuned with tools/sim.js
};

const FUSIONS = {
  steam: {name: 'Steam Burst', needs: ['fire', 'ice'], icon: 'ice', cd: 3.2,
    desc: 'Scalding steam erupts on the nearest foe, burning and slowing everything around it.',
    cast(g, dmg, near) {
      const t = near[0]; if (!t) return false;
      g.forEachEnemyNear(t.x, t.y, 105, e => { g.hit(e, dmg, '#e8f6ff'); e.slow = Math.max(e.slow, 2); });
      g.fx.shockwave(t.x, t.y, 105, .45, '#e8f6ff'); g.burst(t.x, t.y, '#ffffff', 16);
      Sound.play('boom');
    }},
  plague: {name: 'Plague Storm', needs: ['lightning', 'venom'], icon: 'venom', cd: 3,
    desc: 'Green lightning leaps between six foes and leaves each one poisoned.',
    cast(g, dmg) {
      const chain = nearestN(g, 6); if (!chain.length) return false;
      chain.forEach((e, i) => {
        if (i < chain.length - 1) g.fx.arc(e.x, e.y, chain[i + 1].x, chain[i + 1].y);
        g.hit(e, dmg * .6, '#8af1a1'); e.poisonTime = 4; e.poisonDps = Math.max(e.poisonDps, dmg * .2); e.burning = false;
      });
      Sound.play('zap');
    }},
  hellhounds: {name: 'Hellhounds', needs: ['wolves', 'whip'], icon: 'wolves', cd: 2.2,
    desc: 'Your spirit wolves catch fire: each one bursts into flame, burning foes around it.',
    cast(g, dmg) {
      if (!g.allies.length) return false;
      for (const w of g.allies) {
        g.forEachEnemyNear(w.x, w.y, 64, e => { g.hit(e, dmg * .5, '#ffb15e'); e.poisonTime = 3; e.poisonDps = Math.max(e.poisonDps, dmg * .3); e.burning = true; });
        g.fx.shockwave(w.x, w.y, 64, .3, '#ff8a3d');
      }
    }},
  blackstar: {name: 'Black Star', needs: ['orb', 'starfall'], icon: 'starfall', cd: 6,
    desc: 'A dark star drags nearby foes together, then crashes down on them.',
    cast(g, dmg, near) {
      const t = near[0]; if (!t) return false;
      const x = t.x, y = t.y;
      g.forEachEnemyNear(x, y, 170, e => { if (!e.boss && !e.mini) { e.x += (x - e.x) * .3; e.y += (y - e.y) * .3; } });
      g.fx.shockwave(x, y, 170, .5, '#9a6bff');
      g.meteors.push(new Meteor(x, y, dmg * 2, .5, 'comet'));
    }},
  mirror: {name: 'Mirror Blades', needs: ['ward', 'blades'], icon: 'ward', cd: 3.5,
    desc: 'Eight mirrored blades fan out from you toward the closest foes.',
    cast(g, dmg) {
      const p = g.player, foes = nearestN(g, 8); if (!foes.length) return false;
      for (let i = 0; i < 8; i++) g.projectiles.push(new Projectile(p.x, p.y, foes[i % foes.length], dmg * .55, 'blade', {pierce: 1}));
    }},
  flare: {name: 'Solar Flare', needs: ['disc', 'nova'], icon: 'disc', cd: 5,
    desc: 'A ring of six sun discs bursts outward from you and sweeps back.',
    cast(g, dmg) {
      const p = g.player;
      for (let i = 0; i < 6; i++) g.discs.push(new SunDisc(p.x, p.y, i * TAU / 6 + g.time, dmg * .7, .8));
      g.fx.shockwave(p.x, p.y, 90, .35, '#ffd36b');
    }},
  torrent: {name: 'Arcane Torrent', needs: ['bolt', 'lightning'], icon: 'bolt', cd: 2.4,
    desc: 'Five charged bolts lance out at once, each piercing through two foes.',
    cast(g, dmg) {
      const p = g.player, foes = nearestN(g, 5); if (!foes.length) return false;
      for (const e of foes) g.projectiles.push(new Projectile(p.x, p.y, e, dmg * .6, 'arcane', {pierce: 2, scale: 1.2}));
    }},
  inferno: {name: 'Inferno Lash', needs: ['fire', 'whip'], icon: 'whip', cd: 4,
    desc: 'Your lashes scorch the ground ahead, leaving burning patches for four seconds.',
    cast(g, dmg, near) {
      const t = near[0]; if (!t) return false;
      const p = g.player, a = angle(p, t);
      for (let i = 1; i <= 3; i++) g.zones.push(new PoisonCloud(p.x + Math.cos(a) * 55 * i, p.y + Math.sin(a) * 55 * i, 50, 4, dmg * .5, '#ff8a3d'));
    }},
};

// Fusions whose two spells are both at FUSION_RANK or higher.
function activeFusions(p) {
  return Object.keys(FUSIONS).filter(k => FUSIONS[k].needs.every(s => p.skills[s] >= FUSION_RANK));
}

// The fusion a spell rank-up would complete, if any.
function fusionCompletedBy(p, spell) {
  return Object.keys(FUSIONS).find(k => {
    const n = FUSIONS[k].needs;
    return n.includes(spell) && p.skills[spell] + 1 === FUSION_RANK && n.every(s => s === spell || p.skills[s] >= FUSION_RANK);
  });
}

function castFusions(g, dt) {
  const p = g.player, cool = p.fusionCool || (p.fusionCool = {});
  for (const key of activeFusions(p)) {
    if (cool[key] === undefined) { // newly awakened
      cool[key] = 1;
      const known = g.meta.fusions || (g.meta.fusions = {});
      g.toast(`${known[key] ? 'FUSION' : 'NEW FUSION DISCOVERED'} · ${FUSIONS[key].name.toUpperCase()}`);
      known[key] = true;
      Sound.play('evolve');
      g.fx.shockwave(p.x, p.y, 120, .5, '#ffd36b');
    }
    if ((cool[key] -= dt) > 0) continue;
    const f = FUSIONS[key];
    if (f.cast(g, fusionPower(g, key), g.nearby) === false) { cool[key] = .5; continue; }
    cool[key] = f.cd * FUSION_CD_SCALE * p.castCooldown;
  }
}
