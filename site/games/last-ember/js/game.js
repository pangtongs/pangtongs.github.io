'use strict';
// Game state, the fixed-timestep simulation, and run flow (stages, saves, shops).

class Game {
  constructor() {
    this.meta = Store.loadMeta();
    this.settings = Store.loadSettings();
    this.renderer = new Renderer($('game'));
    this.renderer.setQuality(this.settings.quality);
    this.hud = new Hud();
    this.grid = new SpatialGrid();
    this.fx = new Effects();
    this.keys = {};
    this.stick = {x: 0, y: 0};
    this.running = false;
    this.paused = true;
    this.selectedStage = clamp(this.meta.unlocked || 1, 1, STAGE_COUNT);
    this.accumulator = 0;
    this.dirty = true;
    this.reset();
    this.bind();
    UI.renderSpellbook();
    UI.buildMarket(this);
    UI.renderMenu(this);
  }

  get wallet() { return this.meta.souls || 0; }
  set wallet(v) { this.meta.souls = v; }
  get viewW() { return this.renderer.W; }
  get viewH() { return this.renderer.H; }
  get xpMultiplier() { return this.player.bargains.hunted ? 1.5 : 1; }
  get difficultyDef() { return DIFFICULTIES[this.difficulty] || DIFFICULTIES.standard; }

  reset() {
    const p = this.player = new Player();
    p.atk *= 1 + (this.meta.atk || 0) * META_UPGRADES.atk.per;
    p.maxHp *= 1 + (this.meta.hp || 0) * META_UPGRADES.hp.per;
    p.hp = p.maxHp;
    this.time = 0; this.stage = 1; this.stageTime = 0; this.growthClock = 0;
    this.difficulty = this.settings.difficulty;
    this.stageClearPending = false; this.stageComplete = false; this.stageLootCollected = 0; this.lastArtifact = '';
    this.souls = 0; this.gemsCount = 0; this.coins = 0;
    this.yields = {gems: 1, coins: 1};
    this.dropRemainders = {gems: 0, coins: 0};
    this.marketRanks = Object.fromEntries(Object.keys(MARKET).map(k => [k, 0]));
    this.enemies = []; this.drops = []; this.projectiles = []; this.enemyShots = []; this.chests = []; this.meteors = [];
    this.nearby = [];
    this.fx.clear();
    this.spawnCD = 0; this.bossCD = stageInfo(1).seconds;
    this.miniCD = 55; this.miniCount = 0; this.minisDefeated = 0; this.miniGoal = 3;
    this.levelQueue = 0; this.boss = null; this.autoSaveCD = 20;
    $('bossUI').classList.add('hidden');
  }

  // ---------- Input and buttons ----------
  bind() {
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'escape'].includes(k)) e.preventDefault();
      const blocking = ['levelOverlay', 'stageOverlay', 'marketOverlay', 'spellBookOverlay', 'chestOverlay', 'originOverlay'].some(isOpen);
      if ((k === 'escape' || k === 'p') && !e.repeat && this.running && !blocking) this.togglePause();
    });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    addEventListener('resize', () => { this.dirty = true; });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (this.running && !this.paused) this.togglePause();
      this.persist();
    });
    addEventListener('pagehide', () => this.persist());
    this.bindStick();

    const on = (id, fn) => { $(id).onclick = fn; };
    document.querySelectorAll('[data-menu]').forEach(b => { b.onclick = () => this.openMenuPanel(b.dataset.menu); });
    document.querySelectorAll('[data-meta-buy]').forEach(b => { b.onclick = () => this.buyMeta(b.dataset.metaBuy); });
    document.querySelectorAll('[data-setting]').forEach(b => {
      b.onclick = () => { const k = b.dataset.setting; this.settings[k] = !this.settings[k]; this.saveSettings(); };
    });
    on('qualitySetting', () => {
      const levels = ['auto', 'high', 'low'];
      this.settings.quality = levels[(levels.indexOf(this.settings.quality) + 1) % levels.length];
      this.renderer.setQuality(this.settings.quality);
      this.saveSettings();
    });
    on('difficultySetting', () => {
      const levels = Object.keys(DIFFICULTIES);
      this.settings.difficulty = levels[(levels.indexOf(this.settings.difficulty) + 1) % levels.length];
      this.saveSettings();
    });
    on('startBtn', () => this.startStage(this.selectedStage));
    on('loadBtn', () => this.loadRun());
    on('restartBtn', () => this.showMenu());
    on('pauseBtn', () => this.togglePause());
    on('resumeBtn', () => this.togglePause());
    on('saveBtn', () => this.saveRun());
    on('menuBtn', () => { this.saveRun(true); this.showMenu(); });
    on('marketBtn', () => this.openMarket());
    on('pauseMarketBtn', () => { hide('pauseOverlay'); this.openMarket(); });
    on('closeMarket', () => this.closeMarket());
    on('nextStage', () => this.nextStage());
    on('finishBtn', () => this.showStageClear());
    document.querySelectorAll('[data-open-spellbook]').forEach(b => { b.onclick = () => this.openSpellbook(); });
    on('openSpellbook', () => this.openSpellbook());
    on('closeSpellbook', () => this.closeSpellbook());
  }

  bindStick() {
    const el = $('joystick'), nub = $('nub');
    let active = false;
    const move = e => {
      if (!active) return;
      const r = el.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      const m = Math.hypot(x, y), d = Math.min(m, 44);
      this.stick = {x: m ? x / m * d / 44 : 0, y: m ? y / m * d / 44 : 0};
      nub.style.transform = `translate(${this.stick.x * 44}px,${this.stick.y * 44}px)`;
    };
    const end = () => { active = false; this.stick = {x: 0, y: 0}; nub.style.transform = ''; };
    el.addEventListener('pointerdown', e => { active = true; el.setPointerCapture(e.pointerId); move(e); });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ---------- Main loop ----------
  frame(now) {
    const elapsed = now - (this.last ?? now);
    this.last = now;
    const active = this.running && !this.paused;
    if (active) {
      this.accumulator += Math.min(elapsed / 1000, .1);
      let steps = 0;
      while (this.accumulator >= SIM_STEP && steps < 6) {
        this.step(SIM_STEP);
        this.accumulator -= SIM_STEP;
        steps++;
        if (!this.running || this.paused) { this.accumulator = 0; break; }
      }
      if (elapsed < 200) this.renderer.trackFrame(elapsed);
    }
    if (active || this.dirty) { this.renderer.draw(this); this.dirty = false; }
    if (this.running) this.hud.update(this, now);
    this.hud.perf(this, this.renderer, this.settings.showFps && this.running);
    requestAnimationFrame(t => this.frame(t));
  }

  setPaused(v) {
    this.paused = v;
    this.accumulator = 0;
    this.dirty = true;
    this.hud.update(this, performance.now(), true);
  }

  // One fixed simulation step.
  step(dt) {
    const p = this.player;
    this.time += dt; this.stageTime += dt; this.growthClock += dt;
    this.spawnCD -= dt; this.bossCD -= dt; this.miniCD -= dt;
    p.invuln = Math.max(0, p.invuln - dt);
    p.lifeHealWindow += dt;
    if (p.lifeHealWindow >= 1) { p.lifeHealWindow %= 1; p.lifeHealUsed = 0; }
    this.passiveGrowth();

    const regen = p.shieldRegen + p.maxHp * (p.shieldRegenPct + .001 * p.passiveRanks.aegisGrowth);
    if (p.bargains.glassWick) p.shield = 0;
    else if (p.shield < p.shieldCap) p.shield = Math.min(p.shieldCap, p.shield + regen * dt);

    if (this.spawnCD <= 0 && !this.stageClearPending) {
      this.spawn();
      this.spawnCD = Math.max(.14, (.78 - this.stageTime * .003 - this.stage * .055) / (1 + (this.stage - 1) * .16)) / this.difficultyDef.spawns / (p.bargains.hunted ? 1.3 : 1);
    }
    if (this.miniCD <= 0 && this.miniCount < this.miniGoal && !this.boss && !this.stageClearPending) this.spawnMiniBoss();
    if (this.bossCD <= 0 && !this.boss && !this.stageClearPending) { this.spawnBoss(); this.bossCD = 9999; }

    this.movePlayer(dt);

    compact(this.enemies, e => !e.dead);
    const count = this.enemies.length;
    for (let i = 0; i < count; i++) {
      const e = this.enemies[i];
      if (!e.dead) e.update(dt, this);
      if (!this.running) return;
    }
    this.grid.rebuild(this.enemies);
    this.separateCrowd();
    this.findNearby();

    compact(this.drops, d => d.update(dt, this));
    if (this.paused) return;
    compact(this.chests, c => c.update(dt, this));
    if (this.paused) return;
    compact(this.projectiles, q => q.update(dt, this));
    compact(this.enemyShots, q => q.update(dt, this));
    if (!this.running) return;
    compact(this.meteors, m => m.update(dt, this));
    this.fx.update(dt);
    castSpells(this, dt);

    this.autoSaveCD -= dt;
    if (this.autoSaveCD <= 0) { this.autoSaveCD = 20; this.persist(); }
  }

  passiveGrowth() {
    const p = this.player, r = p.passiveRanks;
    while (this.growthClock >= 60) {
      this.growthClock -= 60;
      if (r.heartGrowth) { const gain = p.maxHp * .06 * r.heartGrowth; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); }
      if (r.emberGrowth) p.atk *= 1 + .04 * r.emberGrowth;
      if (r.aegisGrowth) { const gain = p.maxHp * .08 * r.aegisGrowth; p.shieldBonusCap += gain; p.shield += gain; }
      if (r.heartGrowth || r.emberGrowth || r.aegisGrowth) this.toast('PASSIVE GROWTH · POWER INCREASED');
    }
  }

  movePlayer(dt) {
    const p = this.player, k = this.keys;
    const sx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + this.stick.x;
    const sy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0) + this.stick.y;
    const m = Math.hypot(sx, sy);
    if (m) {
      p.x += sx / m * p.speed * dt; p.y += sy / m * p.speed * dt;
      p.facing = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 2 : 1) : (sy > 0 ? 0 : 3);
    }
    p.x = clamp(p.x, -ARENA_X, ARENA_X);
    p.y = clamp(p.y, -ARENA_Y, ARENA_Y);
  }

  // Keeps the horde from collapsing into one stacked blob. Overlap up to 25% is allowed so
  // crowds stay dense; heavier bodies (bosses) shove lighter ones.
  separateCrowd() {
    for (const e of this.enemies) {
      if (e.dead) continue;
      this.grid.forEachInRadius(e.x, e.y, e.r, o => {
        if (o.id <= e.id) return; // each pair once
        const min = (e.r + o.r) * .75;
        let dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy);
        if (d >= min) return;
        if (d < .01) { dx = Math.random() - .5; dy = Math.random() - .5; d = Math.hypot(dx, dy); }
        const me = e.boss || e.mini ? e.r * e.r * 6 : e.r * e.r, mo = o.boss || o.mini ? o.r * o.r * 6 : o.r * o.r;
        const push = (min - d) * .35 / d;
        e.x = clamp(e.x - dx * push * mo / (me + mo), -ARENA_X, ARENA_X); e.y = clamp(e.y - dy * push * mo / (me + mo), -ARENA_Y, ARENA_Y);
        o.x = clamp(o.x + dx * push * me / (me + mo), -ARENA_X, ARENA_X); o.y = clamp(o.y + dy * push * me / (me + mo), -ARENA_Y, ARENA_Y);
      });
    }
  }

  // The three enemies closest to the player, shared by every spell this step.
  findNearby() {
    const p = this.player, near = this.nearby;
    near.length = 0;
    let d0 = Infinity, d1 = Infinity, d2 = Infinity, e0 = null, e1 = null, e2 = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d < d0) { d2 = d1; e2 = e1; d1 = d0; e1 = e0; d0 = d; e0 = e; }
      else if (d < d1) { d2 = d1; e2 = e1; d1 = d; e1 = e; }
      else if (d < d2) { d2 = d; e2 = e; }
    }
    if (e0) near.push(e0);
    if (e1) near.push(e1);
    if (e2) near.push(e2);
  }

  forEachEnemyNear(x, y, r, fn, centerOnly = false) { this.grid.forEachInRadius(x, y, r, fn, centerOnly); }

  // ---------- Spawning ----------
  addEnemy(type, x, y) {
    if (this.enemies.length >= MAX_ENEMIES) return null;
    const e = new Enemy(this, type, clamp(x, -ARENA_X, ARENA_X), clamp(y, -ARENA_Y, ARENA_Y));
    this.enemies.push(e);
    return e;
  }

  spawn() {
    const p = this.player, W = this.viewW, H = this.viewH;
    const edge = Math.floor(rand(0, 4)), left = p.x - W / 2, top = p.y - H / 2;
    let x = edge === 0 ? left - 28 : edge === 1 ? left + W + 28 : left + rand(0, W);
    let y = edge === 2 ? top - 28 : edge === 3 ? top + H + 28 : top + rand(0, H);
    x = clamp(x, -ARENA_X + 25, ARENA_X - 25);
    y = clamp(y, -ARENA_Y + 25, ARENA_Y - 25);
    const roll = Math.random(), type = SPAWN_TABLE.find(([, w]) => roll < w)[0];
    if (type === 'sentinel') { // turrets appear in a ring around the player instead
      const a = rand(0, TAU), r = rand(250, 390);
      x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
    }
    this.addEnemy(type, x, y);
  }

  spawnMiniBoss() {
    if (this.enemies.filter(e => e.mini && !e.dead).length >= 2) { this.miniCD = 10; return; }
    const p = this.player;
    const e = new Enemy(this, 'mini', clamp(p.x + rand(-this.viewW * .38, this.viewW * .38), -ARENA_X + 55, ARENA_X - 55), clamp(p.y - this.viewH / 2 - 35, -ARENA_Y + 55, ARENA_Y - 55));
    this.enemies.push(e);
    this.miniCount++;
    this.miniCD = 55;
    this.toast('MINI BOSS · ' + e.name.toUpperCase());
  }

  spawnBoss() {
    const p = this.player;
    const e = new Enemy(this, 'boss', clamp(p.x + rand(-this.viewW * .35, this.viewW * .35), -ARENA_X + 65, ARENA_X - 65), clamp(p.y - this.viewH / 2 - 48, -ARENA_Y + 65, ARENA_Y - 65));
    this.enemies.push(e);
    this.boss = e;
    this.toast(`${e.name.toUpperCase()} APPROACHES!`);
  }

  // ---------- Combat ----------
  burst(x, y, color, n) { if (this.settings.particles) this.fx.particles.burst(x, y, color, n); }

  damage(n) {
    const p = this.player;
    if (p.invuln > 0) return;
    p.invuln = .55;
    if (p.shield > 0) { const s = Math.min(p.shield, n); p.shield -= s; n -= s; }
    if (n > 0) p.hp -= n;
    if (this.settings.damageNumbers) this.fx.texts.add(p.x, p.y - 18, `-${Math.ceil(n)}`, '#ff718b');
    if (p.hp <= 0) this.endRun(false);
  }

  hit(e, n, color) {
    if (e.dead) return;
    const p = this.player;
    const dealt = (n * p.atk + p.maxHp * p.hpDamage) * this.damageMultiplier(e);
    const actual = Math.min(Math.max(0, e.hp), dealt);
    e.hp -= dealt;
    const rank = p.passiveRanks.leech;
    if (rank && p.hp < p.maxHp) {
      const cap = p.maxHp * (.015 + .005 * rank);
      const heal = Math.min(actual * .008 * rank, Math.max(0, cap - p.lifeHealUsed), p.maxHp - p.hp);
      p.hp += heal; p.lifeHealUsed += heal;
    }
    e.hit = .08;
    if (this.settings.damageNumbers) this.fx.texts.add(e.x, e.y - e.r, String(Math.round(dealt)), color);
    if (p.path === 'frost') e.slow = Math.max(e.slow, 1.5);
    this.burst(e.x, e.y, color, 2);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    if (e.dead) return;
    e.dead = true;
    const drop = (dx, dy, type, value) => this.addDrop(e.x + dx, e.y + dy, type, value);
    if (e.boss) {
      this.boss = null;
      drop(0, 0, 'xp', 55 + e.tier * 35);
      drop(-22, 0, 'soul', 12 + e.tier * 10);
      drop(22, 0, 'gems', this.dropValue('gems', 5 + e.tier * 3));
      drop(0, 22, 'coins', this.dropValue('coins', 9 + e.tier * 5));
      this.chests.push(new Chest(e.x, e.y, e.tier));
      this.stageClearPending = true;
      this.toast(`TIER ${e.tier} CHEST DROPPED · COLLECT IT`);
    } else if (e.mini) {
      this.minisDefeated++;
      drop(0, 0, 'xp', 32 + this.stage * 6);
      drop(-15, 0, 'soul', 3 + this.stage);
      drop(15, 0, 'gems', this.dropValue('gems', 4 + this.stage));
      drop(0, 15, 'coins', this.dropValue('coins', 5 + this.stage));
      this.toast(e.name.toUpperCase() + ' DEFEATED · BONUS LOOT');
    } else {
      const def = ENEMY_TYPES[e.type];
      drop(0, 0, 'xp', def.xp);
      if (e.type === 'brood') for (let j = 0; j < 3; j++) this.addEnemy('ghoul', e.x + rand(-32, 32), e.y + rand(-32, 32));
      const roll = Math.random();
      if (roll < (def.soulChance || .22)) drop(8, 0, 'soul', 1);
      else if (roll < .58) drop(8, 0, 'gems', this.dropValue('gems', 1));
      else if (roll < .9) drop(8, 0, 'coins', this.dropValue('coins', def.coins || 1));
      if (e.type === 'skeleton' && Math.random() < .12) drop(-8, 0, 'coins', this.dropValue('coins', 1));
    }
    this.burst(e.x, e.y, e.color, e.boss ? 24 : 8);
    if (this.player.bargains.volatile && !e.boss) this.explode(e);
  }

  // Situational damage bonuses: Path of Frost, Berserker's Oath, Close Quarters.
  damageMultiplier(e) {
    const p = this.player, b = p.bargains;
    let m = p.path === 'frost' && e.slow > 0 ? 1.2 : 1;
    if (b.berserker) m *= 1 + (1 - clamp(p.hp / p.maxHp, 0, 1)) * .8;
    if (b.closeQuarters) m *= dist2(p.x, p.y, e.x, e.y) < CLOSE_QUARTERS_RANGE * CLOSE_QUARTERS_RANGE ? 1.6 : .6;
    return m;
  }

  // Volatile Core: a slain foe bursts, hurting nearby foes and the player if too close.
  // Chains are intended; each enemy can only die (and burst) once.
  explode(e) {
    const p = this.player, radius = 70;
    this.fx.shockwave(e.x, e.y, radius, .3, '#ff8a4c');
    this.forEachEnemyNear(e.x, e.y, radius, o => this.hit(o, e.maxHp * .5 / p.atk, '#ffae6b'));
    if (this.running && dist(e, p) < radius + p.r) this.damage(e.damage * .6);
  }

  // Past MAX_GEMS, new XP folds into the nearest XP drop so the floor never floods.
  addDrop(x, y, type, value) {
    if (type === 'xp' && this.drops.length >= MAX_GEMS) {
      let best = null, bd = Infinity;
      for (const d of this.drops) {
        if (d.type !== 'xp') continue;
        const dd = dist2(x, y, d.x, d.y);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best) { best.value += value; best.life = Math.max(best.life, 20); return; }
    }
    this.drops.push(new Drop(x, y, type, value));
  }

  dropValue(type, base) {
    const raw = base * this.yields[type] + (this.dropRemainders[type] || 0), amount = Math.floor(raw);
    this.dropRemainders[type] = raw - amount;
    return Math.max(1, amount);
  }

  collect(d) {
    if (d.type === 'xp') this.gainXP(d.value * this.xpMultiplier);
    else if (d.type === 'soul') { this.souls += d.value; this.wallet += d.value; }
    else if (d.type === 'gems') this.gemsCount += d.value;
    else this.coins += d.value;
    this.burst(d.x, d.y, DROP_COLORS[d.type], 5);
  }

  gainXP(n) {
    const p = this.player;
    p.xp += n;
    while (p.xp >= p.nextXp) { p.xp -= p.nextXp; p.level++; p.nextXp = Math.floor(p.nextXp * 1.35 + 5); this.levelQueue++; }
    if (this.levelQueue && !this.paused) this.levelUp();
  }

  levelUp() { this.setPaused(true); UI.showLevelUp(this); }

  takeLevelChoice(o) {
    o.take();
    this.levelQueue = Math.max(0, this.levelQueue - 1);
    hide('levelOverlay');
    this.setPaused(false);
    if (this.levelQueue) this.levelUp();
    else if (this.stageComplete) { this.saveRun(true); this.showStageClear(); }
  }

  openChest(x, y, tier) { this.setPaused(true); UI.showChest(this, tier, x, y); }

  toast(s) {
    const t = $('toast');
    t.textContent = s;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 2100);
  }

  // ---------- Market ----------
  balance(currency) { return currency === 'gems' ? this.gemsCount : this.coins; }
  marketCost(kind) { const item = MARKET[kind]; return Math.ceil(item.base * Math.pow(item.growth, this.marketRanks[kind])); }

  openMarket() {
    if (!this.running) return;
    this.marketWasPaused = this.paused;
    this.setPaused(true);
    show('marketOverlay');
    UI.renderMarket(this);
  }
  closeMarket() {
    hide('marketOverlay');
    this.setPaused(this.marketWasPaused);
    $('pauseOverlay').classList.toggle('hidden', !this.paused);
  }

  purchase(kind) {
    const item = MARKET[kind], p = this.player;
    if (item.max && this.marketRanks[kind] >= item.max) { this.toast('Investment maxed'); return; }
    const cost = this.marketCost(kind);
    if (this.balance(item.currency) < cost) { this.toast(`Not enough ${item.currency === 'gems' ? 'gems' : 'gold'}`); return; }
    if (item.currency === 'gems') this.gemsCount -= cost; else this.coins -= cost;
    this.marketRanks[kind]++;
    const messages = {
      attack: () => { p.atk *= 1.12; return 'Attack +12%'; },
      haste: () => { p.castCooldown *= .92; return 'Spells 8% faster'; },
      speed: () => { p.speed *= 1.1; return 'Speed +10%'; },
      hp: () => { const gain = p.maxHp * .12; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); return 'Max HP +12%'; },
      shield: () => { const gain = p.maxHp * .25; p.shieldBonusCap += gain; p.shield += gain; p.shieldRegenPct += .001; return 'Shield +25% max HP · regen +0.1% HP/s'; },
      coinYield: () => { this.yields.coins *= YIELD_STEP; return `Gold drops ×${this.yields.coins.toFixed(2)}`; },
      gemYield: () => { this.yields.gems *= YIELD_STEP; return `Gem drops ×${this.yields.gems.toFixed(2)}`; },
    };
    this.toast(messages[kind]());
    UI.renderMarket(this);
    this.hud.update(this, performance.now(), true);
  }

  // ---------- Menus and overlays ----------
  openMenuPanel(panel = 'home') {
    for (const id of ['Home', 'Start', 'Upgrades', 'Stats', 'Settings']) $('menu' + id).classList.toggle('hidden', id.toLowerCase() !== panel);
    UI.renderMenu(this);
  }

  showMenu() {
    this.running = false;
    this.setPaused(true);
    this.persist();
    hideAllOverlays();
    show('startOverlay');
    this.openMenuPanel('home');
  }

  openSpellbook() {
    this.bookWasPaused = this.paused;
    this.paused = true;
    $('closeSpellbook').textContent = this.running ? 'BACK TO GAME' : 'BACK TO MENU';
    show('spellBookOverlay');
  }
  closeSpellbook() { hide('spellBookOverlay'); this.setPaused(this.bookWasPaused); }

  togglePause() {
    if (!this.running) return;
    this.setPaused(!this.paused);
    if (this.paused) { $('saveStatus').textContent = ''; this.persist(); }
    $('pauseOverlay').classList.toggle('hidden', !this.paused);
  }

  buyMeta(key) {
    const cost = metaCost(this.meta[key] || 0);
    if (this.wallet < cost) { this.toast('Not enough souls'); return; }
    this.wallet -= cost;
    this.meta[key] = (this.meta[key] || 0) + 1;
    this.saveMeta();
    UI.renderMenu(this);
    this.toast(key === 'atk' ? 'Base ATK increased!' : 'Max HP increased!');
  }

  saveSettings() { Store.write('settings', this.settings); UI.renderMenu(this); }
  saveMeta() { Store.write('meta', this.meta); }
  // Checkpoint: souls and the current run.
  persist() { this.saveMeta(); if (this.running) this.saveRun(true); }

  // ---------- Run flow ----------
  startStage(stage) {
    this.reset();
    this.stage = stage;
    this.bossCD = stageInfo(stage).seconds;
    this.miniGoal = Math.max(3, Math.floor((this.bossCD - 20) / 55));
    if (stage > 1) { // later stages start with a head start matching the expected build
      const boost = stage - 1, p = this.player;
      p.atk *= 1 + boost * .14; p.maxHp *= 1 + boost * .22; p.hp = p.maxHp; p.shield += boost * 12;
    }
    this.running = true;
    this.setPaused(true);
    hide('startOverlay');
    UI.showOrigins(this);
  }

  pickOrigin(key) {
    const p = this.player, o = ORIGINS[key];
    p.origin = key;
    p.skills[o.spell] = Math.max(2, p.skills[o.spell]);
    p.cool[o.spell] = 0;
    hide('originOverlay');
    this.setPaused(false);
    this.saveRun(true);
    this.toast(`${o.name.toUpperCase()} SPELL AWAKENED`);
  }

  collectStageLoot() {
    let xp = 0;
    const found = this.drops.length;
    for (const d of this.drops) {
      if (d.type === 'xp') xp += d.value;
      else if (d.type === 'soul') { this.souls += d.value; this.wallet += d.value; }
      else if (d.type === 'gems') this.gemsCount += d.value;
      else this.coins += d.value;
    }
    this.drops.length = 0;
    if (xp) this.gainXP(xp * this.xpMultiplier);
    return found;
  }

  clearStage() {
    this.stageComplete = true;
    this.stageClearPending = true;
    this.setPaused(true);
    this.stageLootCollected = this.collectStageLoot();
    if (this.stage < STAGE_COUNT) this.meta.unlocked = Math.max(this.meta.unlocked || 1, this.stage + 1);
    this.saveMeta();
    $('stagePortrait').src = `assets/boss-${this.stage - 1}.webp`;
    $('stageTitle').textContent = this.stage === STAGE_COUNT ? 'RIFT CONQUERED' : `STAGE ${this.stage} CLEAR`;
    this.saveRun(true);
    if (this.levelQueue) this.levelUp(); else this.showStageClear();
  }

  showStageClear() {
    if (!this.stageComplete) return;
    this.setPaused(true);
    show('stageOverlay');
    $('stageSummary').textContent = `${stageInfo(this.stage).boss} defeated. ${this.stageLootCollected || 0} remaining drops collected · Level ${this.player.level} · ${this.souls} souls earned · ${this.gemsCount} gems · ${this.coins} gold. Artifact: ${this.lastArtifact}.`;
  }

  // Saves the build as a run on the next stage, then returns to the menu to continue it.
  nextStage() {
    hide('stageOverlay');
    if (this.stage === STAGE_COUNT) { this.endRun(true); return; }
    const next = this.snapshot(), p = next.player;
    Object.assign(next, {stage: this.stage + 1, stageTime: 0, bossCD: stageInfo(this.stage + 1).seconds, miniCD: 55, miniCount: 0, minisDefeated: 0,
      miniGoal: Math.max(3, Math.floor((stageInfo(this.stage + 1).seconds - 20) / 55)), stageClearPending: false, stageComplete: false,
      enemyShots: [], enemies: [], drops: [], chests: []});
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .3);
    p.shield += 20;
    this.saveRun(true, next);
    this.showMenu();
  }

  endRun(won) {
    this.running = false;
    this.setPaused(true);
    Store.remove('run');
    this.saveMeta();
    show('gameOver');
    $('gameOverTitle').textContent = won ? 'THE RIFT IS YOURS' : 'THE EMBERS FADE';
    $('runSummary').textContent = `You ${won ? 'cleared all ' + STAGE_COUNT + ' stages' : 'reached stage ' + this.stage} at level ${this.player.level} after ${formatTime(this.time)}. Earned ${this.souls} souls this run · ${this.wallet} in your permanent wallet.`;
    UI.renderMetaShop(this);
  }

  // ---------- Saves ----------
  snapshot() {
    const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
    return {
      version: SAVE_VERSION, savedAt: Date.now(),
      ...pick(this, ['stage', 'difficulty', 'time', 'stageTime', 'growthClock', 'bossCD', 'miniCD', 'miniCount', 'minisDefeated', 'miniGoal',
        'spawnCD', 'stageClearPending', 'stageComplete', 'levelQueue', 'stageLootCollected', 'lastArtifact', 'souls', 'gemsCount', 'coins']),
      yields: {...this.yields}, dropRemainders: {...this.dropRemainders}, marketRanks: {...this.marketRanks},
      player: JSON.parse(JSON.stringify(this.player)),
      enemies: this.enemies.filter(e => !e.dead).map(e => ({...e})),
      drops: this.drops.map(d => ({...d})),
      chests: this.chests.map(c => ({...c})),
      enemyShots: this.enemyShots.map(q => ({...q})),
    };
  }

  saveRun(silent = false, data = this.snapshot()) {
    const ok = Store.write('run', data);
    if (silent) return;
    $('saveStatus').textContent = ok ? 'Saved. Continue is available from the main menu.' : 'Save failed on this device.';
    this.toast(ok ? 'RUN SAVED' : 'Could not save run');
  }

  loadRun() {
    const data = Store.loadRun();
    if (!data || !this.restore(data)) { this.toast('No valid saved run'); UI.renderMenu(this); return; }
    this.toast('RUN LOADED');
  }

  restore(data) {
    if (data.stage < 1 || data.stage > STAGE_COUNT || !data.player) return false;
    this.reset();
    const {player, enemies, drops, chests, enemyShots, yields, dropRemainders, marketRanks, version, savedAt, ...state} = data;
    Object.assign(this, state);
    this.yields = {...this.yields, ...yields};
    this.dropRemainders = {...this.dropRemainders, ...dropRemainders};
    this.marketRanks = {...this.marketRanks, ...marketRanks};
    const base = new Player();
    this.player = Object.assign(base, player, {
      skills: {...base.skills, ...player.skills}, passiveRanks: {...base.passiveRanks, ...player.passiveRanks}, cool: {...base.cool, ...player.cool},
      bargains: {...player.bargains},
    });
    this.enemies = (enemies || []).map(e => Enemy.restore(this, e));
    this.boss = this.enemies.find(e => e.boss) || null;
    this.drops = (drops || []).map(d => Object.assign(new Drop(d.x, d.y, d.type, d.value), d));
    this.chests = (chests || []).map(c => Object.assign(new Chest(c.x, c.y, c.tier), c));
    this.enemyShots = (enemyShots || []).map(q => Object.assign(new EnemyShot(q.x, q.y, 0, q.kind, q.damage), q));
    this.keys = {};
    this.running = true;
    hideAllOverlays();
    this.setPaused(false);
    if (this.stageComplete) { this.setPaused(true); if (this.levelQueue) this.levelUp(); else this.showStageClear(); }
    return true;
  }
}
