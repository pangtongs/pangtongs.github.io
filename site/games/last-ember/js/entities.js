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
    this.skills = {bolt: 1, echo: 0, orb: 0, fire: 0, lightning: 0, ice: 0, venom: 0, nova: 0, blades: 0, starfall: 0};
    this.passiveRanks = {leech: 0, heartGrowth: 0, emberGrowth: 0, aegisGrowth: 0};
    this.bargains = {}; // keys of BARGAINS taken this run
    this.ultimatePower = 1; this.ultimateHaste = 1; this.castCooldown = 1;
    this.pickupRange = 100;
    this.origin = null; this.path = null; this.ultimate = null;
    this.cool = {basic: 0, fire: 0, lightning: 0, ice: 0, venom: 0, nova: 0, blades: 0, starfall: 0, ult: 15};
    this.invuln = 0;
  }
  get shieldCap() { return this.bargains.glassWick ? 0 : this.maxHp * .5 + this.shieldBonusCap; }
}

class Enemy {
  static nextId = 0;

  constructor(g, type, x, y) {
    this.type = type; this.x = x; this.y = y;
    this.hit = 0; this.slow = 0; this.poisonTime = 0; this.poisonDps = 0; this.poisonTick = 0;
    this.boss = type === 'boss'; this.mini = type === 'mini';
    this.miniKind = this.mini ? g.miniCount % MINI_BOSSES.length : 0;
    this.tier = this.boss ? g.stage : 0;
    this.level = (g.stage - 1) * 3 + 1 + Math.floor(g.stageTime / 20);
    const diff = DIFFICULTIES[g.difficulty] || DIFFICULTIES.standard;
    const def = ENEMY_TYPES[type], mini = MINI_BOSSES[this.miniKind];
    this.name = this.boss ? stageInfo(this.tier).boss : this.mini ? mini.name : type;

    const stagePressure = 1 + (g.stage - 1) * .28;
    const scale = (1 + (this.level - 1) * .15) * stagePressure * diff.hp;
    this.maxHp = this.boss ? 650 * Math.pow(1.48, this.tier - 1) * diff.hp * (1 + Math.floor(g.stageTime / 20) * .055)
      : this.mini ? 210 * (1 + g.stage * .4) * diff.hp * (1 + g.stageTime / 300)
      : def.hp * scale;
    if (g.player.bargains.cursedHoard) this.maxHp *= 1.3;
    this.hp = this.maxHp;
    this.speed = (this.boss ? 28 + this.tier * 2 : this.mini ? mini.speed : def.speed)
      * (1 + (this.level - 1) * .055) * (1 + (g.stage - 1) * .045) * diff.speed;
    this.r = this.boss ? 27 + this.tier * 3 : this.mini ? 23 : def.r;
    this.damage = (this.boss ? 14 + this.tier * 4 : this.mini ? 13 + g.stage * 2 : def.damage)
      * (1 + (this.level - 1) * (this.boss ? .035 : .085)) * (1 + (g.stage - 1) * .1) * diff.damage;
    this.color = this.boss ? stageInfo(this.tier).accent : this.mini ? mini.color : def.color;
    this.attackCD = 0; this.chargeTime = 0; this.skillCD = 4; this.windup = 0; this.enraged = false;
    this.shotCD = rand(1, 3);
    this.dead = false;
    this.id = Enemy.nextId++;
  }
  static restore(g, data) { return Object.assign(new Enemy(g, data.type, data.x, data.y), data, {dead: false, id: Enemy.nextId++}); }

  // Radius of the boss slam, also drawn as its telegraph.
  get slamRadius() { return 65 + Math.min(this.tier, 5) * 20; }

  update(dt, g) {
    if (this.slow > 0) this.slow -= dt;
    if (this.poisonTime > 0) {
      this.poisonTime -= dt; this.poisonTick += dt;
      if (this.poisonTick >= .5) { this.poisonTick -= .5; g.hit(this, this.poisonDps * .5, '#8af1a1'); }
    }
    if (this.dead) return;
    const p = g.player;
    this.hit = Math.max(0, this.hit - dt);
    this.enraged = this.boss && this.tier >= 3 && this.hp < this.maxHp * .5;
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    const v = this.speed * (this.slow > 0 ? .7 : 1) * (this.enraged ? 1.3 : 1) * (this.chargeTime > 0 ? 2.1 : 1) * (this.windup > 0 ? .3 : 1);
    this.chargeTime = Math.max(0, this.chargeTime - dt);
    this.x = clamp(this.x + Math.cos(a) * v * dt, -ARENA_X, ARENA_X);
    this.y = clamp(this.y + Math.sin(a) * v * dt, -ARENA_Y, ARENA_Y);
    const d = Math.hypot(p.x - this.x, p.y - this.y);

    const shot = !this.boss && !this.mini && ENEMY_TYPES[this.type].shot;
    this.shotCD -= dt;
    if (shot && this.shotCD <= 0 && d < 520) {
      for (let i = 0; i < shot.count; i++) g.enemyShots.push(new EnemyShot(this.x, this.y, a + (i - (shot.count - 1) / 2) * shot.spread, this.type, this.damage));
      this.shotCD = shot.cd;
    }

    this.attackCD -= dt;
    if (d < this.r + p.r && this.attackCD <= 0) { g.damage(this.damage); this.attackCD = this.boss ? .75 : .85; }

    if (this.mini) this.miniSkill(dt, g, a);
    if (this.boss) this.bossSkill(dt, g);
  }

  miniSkill(dt, g, a) {
    this.skillCD -= dt;
    if (this.skillCD > 0) return;
    if (this.miniKind === 0) {
      this.chargeTime = 1.1;
      g.fx.shockwave(this.x, this.y, 45, .4, this.color);
    } else if (this.miniKind === 1) {
      for (let i = 0; i < 2; i++) g.addEnemy(i ? 'skeleton' : 'ghoul', this.x + rand(-48, 48), this.y + rand(-48, 48));
    } else {
      for (let i = -2; i <= 2; i++) g.enemyShots.push(new EnemyShot(this.x, this.y, a + i * .18, 'warlock', this.damage * .55));
    }
    this.skillCD = this.miniKind === 2 ? 3.4 : 5.2;
  }

  bossSkill(dt, g) {
    this.skillCD -= dt;
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup > 0) return;
      const radius = this.slamRadius, p = g.player;
      g.fx.shockwave(this.x, this.y, radius, .5, this.tier >= 3 ? stageInfo(this.tier).accent : '#ff6f85');
      g.burst(this.x, this.y, this.color, 24);
      if (dist(this, p) < radius + p.r) g.damage(12 + this.tier * 7);
      if (this.tier >= 2) {
        const n = Math.min(5, 1 + Math.floor(this.tier / 2));
        for (let i = 0; i < n; i++) g.addEnemy(this.tier === 5 ? 'brood' : 'skeleton', this.x + rand(-55, 55), this.y + rand(-55, 55));
      }
      if (this.tier >= 4) {
        const n = this.tier >= 7 ? 8 : this.tier === 6 ? 5 : 3;
        const kind = this.tier === 5 ? 'spitter' : this.tier === 7 ? 'sentinel' : 'warlock';
        for (let i = 0; i < n; i++) {
          const a = angle(this, p) + (i - (n - 1) / 2) * (this.tier >= 7 ? TAU / n : .24);
          g.enemyShots.push(new EnemyShot(this.x, this.y, a, kind, Math.max(8, this.damage * .42)));
        }
      }
    } else if (this.skillCD <= 0) {
      this.windup = .85;
      this.skillCD = this.enraged ? 3 : 6 - this.tier * .5;
    }
  }
}

class Projectile {
  constructor(x, y, target, damage, kind) {
    this.x = x; this.y = y; this.target = target; this.damage = damage; this.kind = kind;
    this.speed = kind === 'fire' ? 275 : kind === 'blade' ? 470 : 390;
    this.r = kind === 'fire' || kind === 'arcane' ? 6 : 5;
    this.life = 3; this.vx = 1; this.vy = 0;
  }
  // Returns false when the projectile is spent.
  update(dt, g) {
    this.life -= dt;
    if (this.life <= 0) return false;
    if (this.target.dead) {
      this.target = g.grid.nearest(this.x, this.y);
      if (!this.target) return false;
    }
    const t = this.target, a = Math.atan2(t.y - this.y, t.x - this.x);
    this.vx = Math.cos(a); this.vy = Math.sin(a);
    this.x += this.vx * this.speed * dt; this.y += this.vy * this.speed * dt;
    const rr = this.r + t.r;
    if (dist2(this.x, this.y, t.x, t.y) >= rr * rr) return true;

    if (this.kind === 'fire' || this.kind === 'venom') {
      const venom = this.kind === 'venom', radius = venom ? 72 : 54, color = venom ? '#8bea9b' : '#ffb15e';
      g.burst(this.x, this.y, venom ? '#8bea9b' : '#ff9860', 24);
      g.fx.shockwave(this.x, this.y, radius, venom ? .38 : .32, venom ? '#81dc9a' : '#ff9c46');
      g.forEachEnemyNear(this.x, this.y, radius, e => {
        g.hit(e, this.damage, color);
        if (venom) { e.poisonTime = 3; e.poisonDps = this.damage * .35; }
      }, true);
    } else {
      g.hit(t, this.damage, this.kind === 'ice' ? '#a6edff' : this.kind === 'blade' ? '#efb0ff' : '#93b9ff');
      if (this.kind === 'ice') t.slow = Math.max(t.slow, 2);
    }
    return false;
  }
}

class EnemyShot {
  constructor(x, y, a, kind, damage) {
    this.x = x; this.y = y; this.vx = Math.cos(a) * 170; this.vy = Math.sin(a) * 170;
    this.kind = kind; this.damage = damage; this.life = 3; this.r = kind === 'spitter' ? 9 : 6;
  }
  update(dt, g) {
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
    const range = p.pickupRange;
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
    this.t = 0; this.struck = false; this.r = kind === 'armageddon' ? 106 : 68;
  }
  update(dt, g) {
    this.t += dt;
    if (!this.struck && this.t >= this.delay) {
      this.struck = true;
      g.burst(this.x, this.y, this.kind === 'armageddon' ? '#ff934b' : '#ffce8b', this.kind === 'armageddon' ? 28 : 18);
      g.fx.shockwave(this.x, this.y, this.r, .52, '#ff9e58', 'meteor');
      g.forEachEnemyNear(this.x, this.y, this.r, e => g.hit(e, this.damage, '#ffc57b'));
    }
    return this.t < this.delay + .52;
  }
}
