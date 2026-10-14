'use strict';
// World objects and their per-step behavior. Drawing lives in render.js.
// Every entity that can be removed mid-step carries a `dead` flag; the owning list is
// compacted once per step instead of splicing inside loops.

class Player {
  constructor() {
    this.x = 0; this.y = 0; this.r = 12; this.facing = 0;
    this.maxHp = 100; this.hp = 100;
    this.shield = 30; this.shieldRegen = .8; this.shieldRegenPct = 0; this.shieldBonusCap = 0;
    this.lifeHealWindow = 0; this.lifeHealUsed = 0;
    this.speed = 178; this.atk = 1; this.hpDamage = 0;
    this.level = 1; this.xp = 0; this.nextXp = 10;
    this.skills = {bolt: 1, echo: 0, orb: 0, fire: 0, lightning: 0, ice: 0, venom: 0, nova: 0, blades: 0, starfall: 0, ward: 0, whip: 0, disc: 0, wolves: 0};
    this.passiveRanks = {leech: 0, heartGrowth: 0, emberGrowth: 0, aegisGrowth: 0, keen: 0, lodestone: 0, fleet: 0};
    this.critChance = .05; this.critMult = 1.75;
    this.bargains = {}; // keys of BARGAINS taken this run
    this.evolved = {};  // spell -> chosen EVOLUTIONS form
    this.ultimatePower = 1; this.ultimateHaste = 1; this.castCooldown = 1;
    this.pickupRange = 100;
    this.origin = null; this.path = null; this.ultimate = null;
    this.cool = {basic: 0, fire: 0, lightning: 0, ice: 0, venom: 0, nova: 0, blades: 0, starfall: 0, ward: 0, whip: 0, disc: 0, ult: 15};
    this.wardTime = 0; // seconds the Mirror Ward stays up
    this.invuln = 0;
    this.slowTime = 0; // slowed by frost hazards
    this.rerolls = 0; this.secondWind = false; // Den of Magic perks, set at run start
    this.dashT = 0; this.dashCD = 0; this.dashX = 0; this.dashY = 1; // dash: seconds left, cooldown, direction
  }
  get shieldCap() { return this.bargains.glassWick ? 0 : this.maxHp * .5 + this.shieldBonusCap; }
}

class Enemy {
  static nextId = 0;

  constructor(g, type, x, y) {
    this.type = type; this.x = x; this.y = y;
    this.hit = 0; this.slow = 0; this.poisonTime = 0; this.poisonDps = 0; this.poisonTick = 0;
    this.frozen = 0; this.shock = 0; // Glacial Spike freeze, Static Field shock (seconds)
    this.boss = type === 'boss'; this.mini = type === 'mini';
    const stage = stageInfo(g.stage);
    this.miniKind = this.mini ? stage.minis[g.miniCount % stage.minis.length] : 0;
    this.tier = this.boss ? g.stage : 0;
    this.level = (g.stage - 1) * 3 + 1 + Math.floor(g.stageTime / 20);
    const diff = g.heatDef;
    const def = ENEMY_TYPES[type], mini = MINI_BOSSES[this.miniKind];
    this.name = this.boss ? stage.boss : this.mini ? mini.name : type;

    // Act I curves are unchanged. Act II multiplies on top so enemies keep pace with a
    // build that has been growing for eight stages (tuned with tools/sim.js).
    const beyond = Math.max(0, g.stage - 8);
    const actHp = Math.pow(1.22, beyond), actDamage = Math.pow(1.16, beyond);
    const stagePressure = 1 + (g.stage - 1) * .28;
    const scale = (1 + (this.level - 1) * .15) * stagePressure * diff.hp;
    const bossAct = (beyond ? 3.5 * Math.pow(1.36, beyond - 1) : 1) * diff.bossHp;
    this.maxHp = this.boss ? 650 * Math.pow(1.48, Math.min(this.tier, 8) - 1) * bossAct * diff.hp * (1 + Math.floor(g.stageTime / 20) * .055)
      : this.mini ? 210 * (1 + g.stage * .4) * actHp * diff.hp * diff.miniHp * (1 + g.stageTime / 300)
      : def.hp * scale * actHp;
    if (g.player.bargains.cursedHoard) this.maxHp *= 1.3;
    this.hp = this.maxHp;
    this.speed = (this.boss ? 28 + Math.min(this.tier, 10) * 2 : this.mini ? mini.speed : def.speed)
      * (1 + (this.level - 1) * .055) * (1 + (Math.min(g.stage, 10) - 1) * .045) * diff.speed;
    // Regular foes never outrun the mage, so kiting and Fleetfoot keep working deep in a run.
    if (!this.boss && !this.mini && type !== 'goblin') this.speed = Math.min(this.speed, (ENEMY_SPEED_CAP + (beyond ? 12 : 0)) * diff.speed);
    this.r = this.boss ? 27 + Math.min(this.tier, 8) * 3 : this.mini ? 23 : def.r;
    this.damage = (this.boss ? 14 + this.tier * 4 : this.mini ? 13 + g.stage * 2 : def.damage)
      * (1 + (this.level - 1) * (this.boss ? .035 : .085)) * (1 + (g.stage - 1) * .1) * diff.damage * actDamage;
    // Damage multiplier for Act II boss moves (Act I moves use their original fixed numbers).
    this.moveScale = this.boss && beyond ? 1.15 * Math.pow(1.14, beyond) * diff.damage : diff.damage;
    this.color = this.boss ? stage.accent : this.mini ? mini.color : def.color;
    this.attackCD = 0; this.chargeTime = 0; this.skillCD = 4; this.enraged = false;
    this.windup = 0; this.windupMax = 0; this.move = null; this.tele = null;
    this.dashT = 0; this.dvx = 0; this.dvy = 0; this.dashHit = false; this.dashDamage = 0;
    this.moveIndex = 0; this.waves = null; this.fuseT = 0; this.actCD = rand(.5, 2);
    this.shotCD = rand(1, 3);
    this.dead = false;
    this.id = Enemy.nextId++;
  }
  static restore(g, data) { return Object.assign(new Enemy(g, data.type, data.x, data.y), data, {dead: false, id: Enemy.nextId++, move: null, windup: 0, tele: null, dashT: 0, waves: null}); }

  get def() { return ENEMY_TYPES[this.type]; }

  update(dt, g) {
    if (this.slow > 0) this.slow -= dt;
    if (this.poisonTime > 0) {
      this.poisonTime -= dt; this.poisonTick += dt;
      if (this.poisonTick >= .5) { this.poisonTick -= .5; g.hit(this, this.poisonDps * .5, this.burning ? '#ffb15e' : '#8af1a1'); }
    }
    if (this.dead) return;
    const p = g.player;
    this.hit = Math.max(0, this.hit - dt);
    if (this.shock > 0) this.shock -= dt;
    if (this.frozen > 0) { this.frozen -= this.boss ? dt * 3 : dt; return; } // bosses thaw three times faster
    const def0 = !this.boss && !this.mini && this.def;
    // Treasure goblins run away from the player and escape after a while.
    if (def0 && def0.flee && (this.fleeT = (this.fleeT || 0) + dt) > def0.flee) { g.kill(this, true); g.toast('THE GOBLIN ESCAPED'); return; }
    const a = Math.atan2(p.y - this.y, p.x - this.x) + (def0 && def0.flee ? Math.PI : 0);

    if (this.dashT > 0) this.dash(dt, g);
    else {
      // Rooted while winding up a charge, blink or fuse; slowed during other windups.
      const rooted = this.fuseT > 0 || (this.windup > 0 && this.move && (this.move.type === 'charge' || this.move.type === 'blink'));
      const v = rooted ? 0 : this.speed * (this.slow > 0 ? .7 : 1) * (this.enraged ? this.phaseSpeed : 1) * (this.chargeTime > 0 ? 2.1 : 1) * (this.windup > 0 ? .3 : 1);
      this.chargeTime = Math.max(0, this.chargeTime - dt);
      this.x = clamp(this.x + Math.cos(a) * v * dt, -ARENA_X, ARENA_X);
      this.y = clamp(this.y + Math.sin(a) * v * dt, -ARENA_Y, ARENA_Y);
    }
    const d = Math.hypot(p.x - this.x, p.y - this.y);

    const def = !this.boss && !this.mini && this.def;
    if (def && def.shot) {
      this.shotCD -= dt;
      if (this.shotCD <= 0 && d < 520) {
        for (let i = 0; i < def.shot.count; i++) g.enemyShots.push(new EnemyShot(this.x, this.y, a + (i - (def.shot.count - 1) / 2) * def.shot.spread, this.type, this.damage));
        this.shotCD = def.shot.cd * g.heatDef.shotCD;
      }
    }
    if (def && def.fuse && this.updateFuse(dt, g, d)) return;

    this.attackCD -= dt;
    if (this.damage > 0 && d < this.r + p.r && this.attackCD <= 0) { g.damage(this.damage); this.attackCD = this.boss ? .75 : .85; }

    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) { const m = this.move, tele = this.tele; this.tele = null; this.resolveMove(m, g, tele); }
    }
    if (this.waves) this.updateWaves(dt, g);

    if (this.boss) this.bossThink(dt, g);
    else if (this.mini) this.miniThink(dt, g);
    else if (def && def.charge) this.chargerThink(dt, g, d);
  }

  // ---------- Moves (bosses, mini bosses and chargers share these) ----------
  get phaseSpeed() { const ph = this.boss && stageInfo(this.tier).phase2; return ph ? ph.speed : 1; }

  startMove(m, g) {
    const p = g.player;
    this.move = m;
    this.windup = this.windupMax = m.windup || .6;
    if (this.boss) Sound.play('warn');
    if (m.type === 'slam') this.tele = {type: 'circle', x: this.x, y: this.y, r: m.radius, follow: true};
    else if (m.type === 'charge') {
      const a = angle(this, p);
      this.dvx = Math.cos(a); this.dvy = Math.sin(a);
      this.tele = {type: 'line', a, len: m.distance, w: this.r * 2};
    } else if (m.type === 'blink') {
      const a = rand(0, TAU), r = 150;
      const tx = clamp(p.x + Math.cos(a) * r, -ARENA_X, ARENA_X), ty = clamp(p.y + Math.sin(a) * r, -ARENA_Y, ARENA_Y);
      this.tele = {type: 'blink', x: tx, y: ty, r: m.radius};
    } else this.tele = {type: 'glow'};
  }

  resolveMove(m, g, tele) {
    if (!m) return;
    const p = g.player, scale = m.prescaled ? 1 : this.moveScale; // prescaled: damage already includes difficulty
    const shot = (kind, a, mult = .42) => g.enemyShots.push(new EnemyShot(this.x, this.y, a, kind, Math.max(8, this.damage * mult)));
    switch (m.type) {
      case 'blink':
        g.burst(this.x, this.y, this.color, 16);
        if (tele) { this.x = tele.x; this.y = tele.y; }
        // fall through: arrive with a slam
      case 'slam': {
        const r = m.radius;
        g.fx.shockwave(this.x, this.y, r, .5, this.boss && this.tier >= 3 ? this.color : '#ff6f85');
        g.burst(this.x, this.y, this.color, 24);
        if (this.boss) { Sound.play('slam'); g.shake(9); }
        if (dist(this, p) < r + p.r) g.damage(m.damage * scale);
        if (m.summon) for (let i = 0; i < m.summon.count; i++) g.addEnemy(m.summon.type, this.x + rand(-55, 55), this.y + rand(-55, 55));
        if (m.shots) {
          const n = m.shots.count;
          for (let i = 0; i < n; i++) shot(m.shots.kind, angle(this, p) + (i - (n - 1) / 2) * (m.shots.ring ? TAU / n : m.shots.spread));
        }
        break;
      }
      case 'charge':
        this.dashT = m.distance / m.speed;
        this.dvx *= m.speed; this.dvy *= m.speed;
        this.dashHit = false; this.dashDamage = m.damage * scale;
        break;
      case 'zones':
        for (let i = 0; i < m.count + g.heatDef.hazards; i++) {
          const off = i === 0 ? 0 : m.spread, a = rand(0, TAU);
          g.hazards.push(new Hazard(p.x + Math.cos(a) * rand(off * .4, off), p.y + Math.sin(a) * rand(off * .4, off), m, m.damage * scale));
        }
        break;
      case 'ring':
        this.waves = {kind: m.kind, count: m.count, left: m.waves || 1, timer: 0, offset: rand(0, TAU)};
        break;
      case 'fan':
        for (let i = 0; i < m.count; i++) shot(m.kind, angle(this, p) + (i - (m.count - 1) / 2) * m.spread);
        break;
      case 'summon': {
        const adds = Array.isArray(m.add) ? m.add : [m.add];
        for (let i = 0; i < (m.count || adds.length); i++) g.addEnemy(adds[i % adds.length], this.x + rand(-60, 60), this.y + rand(-60, 60));
        g.fx.shockwave(this.x, this.y, 60, .4, this.color);
        break;
      }
      case 'rush':
        this.chargeTime = 1.1;
        g.fx.shockwave(this.x, this.y, 45, .4, this.color);
        break;
    }
    this.move = null;
  }

  // Ring attacks fire in waves a quarter second apart, each rotated half a step.
  updateWaves(dt, g) {
    const w = this.waves;
    w.timer -= dt;
    if (w.timer > 0) return;
    for (let i = 0; i < w.count; i++) g.enemyShots.push(new EnemyShot(this.x, this.y, w.offset + i * TAU / w.count, w.kind, Math.max(8, this.damage * .42)));
    w.offset += Math.PI / w.count;
    w.timer = .28;
    if (--w.left <= 0) this.waves = null;
  }

  dash(dt, g) {
    const p = g.player;
    this.dashT -= dt;
    this.x = clamp(this.x + this.dvx * dt, -ARENA_X, ARENA_X);
    this.y = clamp(this.y + this.dvy * dt, -ARENA_Y, ARENA_Y);
    if (!this.dashHit && dist(this, p) < this.r + p.r + 4) { this.dashHit = true; g.damage(this.dashDamage); }
    if (this.dashT <= 0) { this.dvx = this.dvy = 0; }
  }

  bossThink(dt, g) {
    const st = stageInfo(this.tier), ph = st.phase2;
    if (ph && !this.enraged && this.hp < this.maxHp * g.heatDef.phase2At) {
      this.enraged = true;
      g.toast(`${this.name.toUpperCase()} ENRAGES!`);
      Sound.play('boss'); g.shake(8); g.freeze(.15);
      g.fx.shockwave(this.x, this.y, 120, .6, this.color);
    }
    if (this.windup > 0 || this.dashT > 0 || this.waves) return;
    this.skillCD -= dt;
    if (this.skillCD > 0) return;
    const moves = this.enraged && ph && ph.extra ? [...st.moves, ph.extra] : st.moves;
    this.startMove(moves[this.moveIndex++ % moves.length], g);
    this.skillCD = (this.enraged && ph ? ph.cooldown : st.cooldown) * g.heatDef.bossCD;
  }

  miniThink(dt, g) {
    if (this.windup > 0 || this.waves) return;
    this.skillCD -= dt;
    if (this.skillCD > 0) return;
    const mini = MINI_BOSSES[this.miniKind];
    this.startMove({windup: .5, ...mini.skill}, g);
    this.skillCD = mini.cd;
  }

  chargerThink(dt, g, d) {
    const c = this.def.charge;
    this.actCD -= dt;
    if (this.windup > 0 || this.dashT > 0 || this.actCD > 0 || d > c.range) return;
    this.startMove({type: 'charge', windup: c.windup, speed: c.speed, distance: c.speed * c.time, damage: this.damage * 1.5, prescaled: true}, g);
    this.actCD = c.cd;
  }

  // Bomber: roots beside the player, flashes, then explodes. Returns true once it has blown up.
  updateFuse(dt, g, d) {
    const f = this.def.fuse, p = g.player;
    if (this.fuseT <= 0) { if (d < f.range) this.fuseT = f.time; return false; }
    this.fuseT -= dt;
    if (this.fuseT > 0) return false;
    g.fx.shockwave(this.x, this.y, f.radius, .45, '#ffb347');
    g.burst(this.x, this.y, '#ffd36b', 22);
    Sound.play('boom'); g.shake(6);
    if (dist(this, p) < f.radius + p.r) g.damage(this.damage * f.damage / this.def.damage);
    g.kill(this, true);
    return true;
  }
}

// A telegraphed ground hazard: a ring fills in for `delay` seconds, erupts, then may
// linger as a slowing or burning field.
class Hazard {
  constructor(x, y, m, damage) {
    this.x = clamp(x, -ARENA_X, ARENA_X); this.y = clamp(y, -ARENA_Y, ARENA_Y);
    this.r = m.radius; this.delay = m.delay; this.damage = damage; this.color = m.color || '#ff6f85';
    this.linger = m.linger || 0; this.slow = !!m.slow; this.dps = m.dps ? m.dps * damage / m.damage : 0;
    this.t = 0; this.erupted = false; this.tick = 0;
  }
  update(dt, g) {
    this.t += dt;
    const p = g.player, inside = dist(this, p) < this.r + p.r * .5;
    if (!this.erupted) {
      if (this.t < this.delay) return true;
      this.erupted = true;
      g.fx.shockwave(this.x, this.y, this.r, .4, this.color);
      g.burst(this.x, this.y, this.color, 14);
      Sound.play('boom');
      if (inside) { g.damage(this.damage); if (this.slow) p.slowTime = 2; }
    } else if (inside) {
      if (this.slow) p.slowTime = Math.max(p.slowTime, .35);
      if (this.dps && (this.tick -= dt) <= 0) { this.tick = .5; g.damage(this.dps * .5, true); }
    }
    return this.t < this.delay + this.linger;
  }
}

// Player projectiles. opts (from evolutions):
//   pierce   keep flying through this many more foes      scale   draw size multiplier
//   blast    explosion radius override                      freeze  seconds to freeze foes hit
//   shatter  split into three seeking shards on impact      cloud   leave a poison cloud
class Projectile {
  constructor(x, y, target, damage, kind, opts = {}) {
    this.x = x; this.y = y; this.target = target; this.damage = damage; this.kind = kind;
    this.speed = kind === 'fire' ? 275 : kind === 'blade' ? 470 : 390;
    this.r = (kind === 'fire' || kind === 'arcane' ? 6 : 5) * (opts.scale || 1);
    this.life = 3; this.vx = 1; this.vy = 0;
    this.pierce = opts.pierce || 0; this.scale = opts.scale || 1; this.blast = opts.blast || 0;
    this.freeze = opts.freeze || 0; this.shatter = !!opts.shatter; this.cloud = !!opts.cloud;
    this.hitIds = this.pierce ? new Set() : null;
  }
  // Returns false when the projectile is spent.
  update(dt, g) {
    this.life -= dt;
    if (this.life <= 0) return false;
    if (this.target.dead) {
      this.target = this.pierce ? this.nextTarget(g) : g.grid.nearest(this.x, this.y);
      if (!this.target) return false;
    }
    const t = this.target, a = Math.atan2(t.y - this.y, t.x - this.x);
    this.vx = Math.cos(a); this.vy = Math.sin(a);
    this.x += this.vx * this.speed * dt; this.y += this.vy * this.speed * dt;
    const rr = this.r + t.r;
    if (dist2(this.x, this.y, t.x, t.y) >= rr * rr) return true;

    if (this.kind === 'fire' || this.kind === 'venom') {
      const venom = this.kind === 'venom', radius = this.blast || (venom ? 72 : 54), color = venom ? '#8bea9b' : '#ffb15e';
      g.burst(this.x, this.y, venom ? '#8bea9b' : '#ff9860', 24);
      Sound.play('boom');
      g.fx.shockwave(this.x, this.y, radius, venom ? .38 : .32, venom ? '#81dc9a' : '#ff9c46');
      g.forEachEnemyNear(this.x, this.y, radius, e => {
        g.hit(e, this.damage, color);
        if (venom) { e.poisonTime = 3; if (this.damage * .35 >= e.poisonDps) { e.poisonDps = this.damage * .35; e.burning = false; } }
      }, true);
      if (this.cloud) g.zones.push(new PoisonCloud(this.x, this.y, 80, 4, this.damage * .5));
      return false;
    }
    g.hit(t, this.damage, this.kind === 'ice' ? '#a6edff' : this.kind === 'blade' ? '#efb0ff' : '#93b9ff');
    if (this.kind === 'ice') { t.slow = Math.max(t.slow, 2); if (this.freeze) t.frozen = Math.max(t.frozen, this.freeze); }
    if (this.shatter) {
      const others = [];
      g.forEachEnemyNear(t.x, t.y, 240, e => { if (e !== t) others.push(e); });
      others.sort((a, b) => dist2(a.x, a.y, t.x, t.y) - dist2(b.x, b.y, t.x, t.y));
      for (let i = 0; i < Math.min(3, others.length); i++) g.projectiles.push(new Projectile(t.x, t.y, others[i], this.damage * .4, 'ice', {scale: .7}));
    }
    if (this.pierce > 0) {
      this.pierce--;
      this.hitIds.add(t.id);
      this.target = this.nextTarget(g);
      return !!this.target;
    }
    return false;
  }
  // Pierce: the closest foe ahead that this projectile has not hit yet.
  nextTarget(g) {
    let best = null, bd = Infinity;
    g.forEachEnemyNear(this.x, this.y, 280, e => {
      if (this.hitIds.has(e.id)) return;
      const d = dist2(this.x, this.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }
}

// Plague Cloud: a lingering patch that poisons every foe inside it.
class PoisonCloud {
  constructor(x, y, r, life, dps) { Object.assign(this, {x, y, r, life, max: life, dps, tick: 0}); }
  update(dt, g) {
    this.life -= dt;
    if ((this.tick -= dt) <= 0) {
      this.tick = .5;
      g.forEachEnemyNear(this.x, this.y, this.r, e => g.hit(e, this.dps * .5, '#8bea9b'));
    }
    return this.life > 0;
  }
}

// Sun Disc: flies out toward a foe, then curves back to the player, hitting every foe
// once on each pass.
class SunDisc {
  constructor(x, y, a, damage, scale = 1) {
    this.x = x; this.y = y; this.vx = Math.cos(a); this.vy = Math.sin(a);
    this.damage = damage; this.scale = scale; this.r = 16 * scale;
    this.out = 0; this.returning = false; this.hitIds = new Set(); this.spin = 0;
  }
  update(dt, g) {
    const p = g.player;
    this.spin += dt * 14;
    if (!this.returning) {
      this.x += this.vx * 420 * dt; this.y += this.vy * 420 * dt; this.out += 420 * dt;
      if (this.out >= 280) { this.returning = true; this.hitIds.clear(); }
    } else {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.x += Math.cos(a) * 500 * dt; this.y += Math.sin(a) * 500 * dt;
      if (dist(this, p) < 20) return false;
    }
    g.forEachEnemyNear(this.x, this.y, this.r, e => {
      if (this.hitIds.has(e.id)) return;
      this.hitIds.add(e.id);
      g.hit(e, this.damage, '#ffd36b');
    });
    return true;
  }
}

// Spirit Wolf: hunts the foe nearest the player, bites, and returns to heel when idle.
class Wolf {
  constructor(x, y, slot) { this.x = x; this.y = y; this.slot = slot; this.target = null; this.biteCD = 0; this.face = 1; this.scale = 1; }
  update(dt, g, damage, alpha) {
    const p = g.player;
    this.biteCD -= dt;
    if (!this.target || this.target.dead || dist(this.target, p) > 360) this.target = g.nearby[this.slot % Math.max(1, g.nearby.length)] || null;
    let tx, ty;
    if (this.target) { tx = this.target.x; ty = this.target.y; }
    else { const a = g.time + this.slot * 2.1; tx = p.x + Math.cos(a) * 46; ty = p.y + Math.sin(a) * 46; }
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    const reach = this.target ? this.target.r + 10 * this.scale : 6;
    if (d > reach) { const v = Math.min(d - reach, 270 * dt); this.x += dx / d * v; this.y += dy / d * v; if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1; }
    if (this.target && d <= reach + 2 && this.biteCD <= 0) {
      this.biteCD = .9;
      g.hit(this.target, damage, '#bfe9ff');
      if (alpha) { this.target.slow = Math.max(this.target.slow, 1.5); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .005 * g.heatDef.heal); }
    }
  }
}

class EnemyShot {
  constructor(x, y, a, kind, damage) {
    this.x = x; this.y = y; this.vx = Math.cos(a) * 170; this.vy = Math.sin(a) * 170;
    this.kind = kind; this.damage = damage; this.life = 3; this.r = kind === 'spitter' ? 9 : 6;
  }
  update(dt, g) {
    if (this.dead) return false; // destroyed by Mirror Ward
    this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
    const p = g.player, rr = this.r + p.r;
    if (dist2(this.x, this.y, p.x, p.y) < rr * rr) {
      g.damage(this.damage);
      if (this.kind === 'spitter') g.fx.shockwave(this.x, this.y, 35, .35, '#8bea9b');
      return false;
    }
    return this.life > 0 && Math.abs(this.x) <= ARENA_X + 50 && Math.abs(this.y) <= ARENA_Y + 50;
  }
}

// XP, souls, gems and gold on the ground.
class Drop {
  constructor(x, y, type, value) {
    this.x = clamp(x, -ARENA_X, ARENA_X); this.y = clamp(y, -ARENA_Y, ARENA_Y);
    this.type = type; this.value = value; this.life = 32; this.phase = rand(0, 6);
  }
  update(dt, g) {
    this.life -= dt; this.phase += dt * 5;
    const p = g.player, dx = p.x - this.x, dy = p.y - this.y;
    const range = g.pickupRange;
    if (Math.abs(dx) > range || Math.abs(dy) > range) return this.life > 0; // cheap reject
    const d = Math.hypot(dx, dy);
    if (d < range) {
      const v = (1 - d / (range + 10)) * 340 * dt / (d || 1);
      this.x += dx * v; this.y += dy * v;
    }
    if (d < p.r + 10) { g.collect(this); return false; }
    return this.life > 0;
  }
}

class Chest {
  constructor(x, y, tier) { this.x = clamp(x, -ARENA_X, ARENA_X); this.y = clamp(y, -ARENA_Y, ARENA_Y); this.tier = tier; this.phase = 0; this.r = 14; }
  update(dt, g) {
    this.phase += dt * 3;
    if (dist(this, g.player) < this.r + g.player.r + 8) {
      g.burst(this.x, this.y, this.tier >= 3 ? '#c78cff' : '#ffd578', 28);
      g.openChest(this.x, this.y, this.tier);
      return false;
    }
    return true;
  }
}

class Meteor {
  constructor(x, y, damage, delay, kind = 'starfall') {
    this.x = x; this.y = y; this.damage = damage; this.delay = delay; this.kind = kind;
    this.t = 0; this.struck = false; this.r = kind === 'armageddon' ? 106 : kind === 'comet' ? 125 : 68;
  }
  update(dt, g) {
    this.t += dt;
    if (!this.struck && this.t >= this.delay) {
      this.struck = true;
      const big = this.kind !== 'starfall';
      Sound.play(big ? 'bigboom' : 'boom');
      if (big) g.shake(this.kind === 'comet' ? 10 : 6);
      g.burst(this.x, this.y, this.kind === 'armageddon' ? '#ff934b' : '#ffce8b', this.kind === 'armageddon' ? 28 : 18);
      g.fx.shockwave(this.x, this.y, this.r, .52, '#ff9e58', 'meteor');
      g.forEachEnemyNear(this.x, this.y, this.r, e => g.hit(e, this.damage, '#ffc57b'));
    }
    return this.t < this.delay + .52;
  }
}
