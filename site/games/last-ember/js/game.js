'use strict';
// Game core: state, input, the fixed-timestep simulation and spawning.
// More Game methods are mixed in by combat.js, economy.js and flow.js.

class Game {
  constructor() {
    this.meta = Store.loadMeta();
    this.settings = Store.loadSettings();
    if (this.settings.heat === undefined) { // migrate a named difficulty to Heat
      this.settings.heat = LEGACY_HEAT[this.settings.difficulty] || 0;
      this.meta.heatUnlocked = Math.max(this.meta.heatUnlocked || 0, this.settings.heat);
    }
    this.renderer = new Renderer($('game'));
    this.renderer.setQuality(this.settings.quality);
    Sound.init(this.settings);
    this.shakeAmt = 0; this.hitStop = 0;
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
  get heatDef() { return heatDef(this.heat || 0); }

  reset() {
    const p = this.player = new Player();
    p.atk *= 1 + (this.meta.atk || 0) * META_UPGRADES.atk.per;
    p.maxHp *= 1 + (this.meta.hp || 0) * META_UPGRADES.hp.per;
    p.hp = p.maxHp;
    this.time = 0; this.stage = 1; this.stageTime = 0; this.growthClock = 0;
    this.heat = clamp(this.settings.heat || 0, 0, this.meta.heatUnlocked || 0);
    this.stageClearPending = false; this.stageComplete = false; this.stageLootCollected = 0; this.lastArtifact = '';
    this.souls = 0; this.gemsCount = 0; this.coins = 0;
    this.yields = {gems: 1, coins: 1};
    this.dropRemainders = {gems: 0, coins: 0};
    this.marketRanks = Object.fromEntries(Object.keys(MARKET).map(k => [k, 0]));
    this.autoBuy = {gems: null, coins: null}; // market item bought automatically per currency
    this.enemies = []; this.drops = []; this.projectiles = []; this.enemyShots = []; this.chests = []; this.meteors = []; this.hazards = []; this.zones = []; this.timers = []; this.discs = []; this.allies = []; this.shrines = [];
    this.surgeT = 0; this.eventIndex = 0; this.lastEvent = null;
    this.nearby = [];
    this.fx.clear();
    this.spawnCD = 0; this.bossCD = stageInfo(1).seconds;
    this.miniCD = 55; this.miniCount = 0; this.minisDefeated = 0; this.miniGoal = 3;
    this.levelQueue = 0; this.boss = null; this.autoSaveCD = 20; this.earlySummon = false; this.pendingChest = null;
    $('bossUI').classList.add('hidden');
  }

  // ---------- Input and buttons ----------
  bind() {
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'escape'].includes(k)) e.preventDefault();
      // Number keys pick the matching card on any open choice screen.
      if (/^[1-9]$/.test(e.key) && !e.repeat) {
        const box = ['levelOverlay', 'chestOverlay', 'originOverlay'].filter(isOpen).map(id => $(id).querySelector('.choices'))[0];
        const card = box && box.querySelectorAll('.choice')[+e.key - 1];
        if (card && !card.disabled) { card.click(); return; }
      }
      const blocking = ['levelOverlay', 'stageOverlay', 'marketOverlay', 'spellBookOverlay', 'chestOverlay', 'originOverlay'].some(isOpen);
      if ((k === 'escape' || k === 'p') && !e.repeat && this.running && !blocking) this.togglePause();
    });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    // Every button and card clicks audibly.
    document.addEventListener('click', e => { if (e.target.closest('button')) Sound.play('click'); });
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
      b.onclick = () => {
        const k = b.dataset.setting;
        this.settings[k] = !this.settings[k];
        Sound.setSfx(this.settings.sound); Sound.setMusic(this.settings.music);
        this.saveSettings();
      };
    });
    on('qualitySetting', () => {
      const levels = ['auto', 'high', 'low'];
      this.settings.quality = levels[(levels.indexOf(this.settings.quality) + 1) % levels.length];
      this.renderer.setQuality(this.settings.quality);
      this.saveSettings();
    });
    on('difficultySetting', () => {
      this.settings.heat = ((this.settings.heat || 0) + 1) % ((this.meta.heatUnlocked || 0) + 1);
      this.saveSettings();
    });
    on('startBtn', () => this.startStage(this.selectedStage));
    on('loadBtn', () => this.loadRun());
    on('restartBtn', () => this.showMenu());
    on('pauseBtn', () => this.togglePause());
    on('touchPause', () => this.togglePause());
    on('touchMarket', () => this.openMarket());
    on('resumeBtn', () => this.togglePause());
    on('saveBtn', () => this.saveRun());
    on('menuBtn', () => { this.saveRun(true); this.showMenu(); });
    on('marketBtn', () => this.openMarket());
    on('pauseMarketBtn', () => { hide('pauseOverlay'); this.openMarket(); });
    on('closeMarket', () => this.closeMarket());
    on('nextStage', () => this.nextStage());
    on('continueStage', () => this.continueStage());
    on('callBossBtn', () => this.callBoss());
    on('finishBtn', () => this.showStageClear());
    document.querySelectorAll('[data-open-spellbook]').forEach(b => { b.onclick = () => this.openSpellbook(); });
    on('openSpellbook', () => this.openSpellbook());
    on('closeSpellbook', () => this.closeSpellbook());
  }

  bindStick() {
    // Follows a single finger: other pointers on the stick are ignored.
    const el = $('joystick'), nub = $('nub');
    let active = null;
    const move = e => {
      if (e.pointerId !== active) return;
      const r = el.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      const m = Math.hypot(x, y), d = Math.min(m, 44);
      this.stick = {x: m ? x / m * d / 44 : 0, y: m ? y / m * d / 44 : 0};
      nub.style.transform = `translate(${this.stick.x * 44}px,${this.stick.y * 44}px)`;
    };
    const end = e => { if (e.pointerId !== active) return; active = null; this.stick = {x: 0, y: 0}; nub.style.transform = ''; };
    el.addEventListener('pointerdown', e => { if (active !== null) return; active = e.pointerId; el.setPointerCapture(e.pointerId); move(e); });
    el.addEventListener('pointermove', move);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, end);
  }

  // ---------- Main loop ----------
  frame(now) {
    const elapsed = now - (this.last ?? now);
    this.last = now;
    const active = this.running && !this.paused;
    if (active && this.hitStop > 0) { this.hitStop -= elapsed / 1000; this.accumulator = 0; } // freeze-frame on big moments
    else if (active) {
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
    this.shakeAmt = Math.max(0, this.shakeAmt - elapsed / 1000 * 40);
    Sound.updateMusic(this.boss ? .85 : Math.min(.55, this.enemies.length / 160), active);
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
    this.time += dt; this.stageTime += dt; this.growthClock += dt; this.meta.stats.playTime += dt;
    this.spawnCD -= dt; this.bossCD -= dt; this.miniCD -= dt;
    p.invuln = Math.max(0, p.invuln - dt);
    p.slowTime = Math.max(0, p.slowTime - dt);
    p.lifeHealWindow += dt;
    if (p.lifeHealWindow >= 1) { p.lifeHealWindow %= 1; p.lifeHealUsed = 0; }
    this.passiveGrowth();

    const regen = (p.shieldRegen + p.maxHp * (p.shieldRegenPct + .001 * p.passiveRanks.aegisGrowth)) * this.heatDef.shieldRegen;
    if (p.bargains.glassWick) p.shield = 0;
    else if (p.shield < p.shieldCap) p.shield = Math.min(p.shieldCap, p.shield + regen * dt);

    this.stepEvents(dt);
    if (this.spawnCD <= 0 && !this.stageClearPending) {
      this.spawn();
      this.spawnCD = Math.max(.14, (.78 - this.stageTime * .003 - this.stage * .055) / (1 + (this.stage - 1) * .16)) / this.heatDef.spawns / (p.bargains.hunted ? 1.3 : 1) / (this.surgeT > 0 ? 2.2 : 1);
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
    compact(this.hazards, h => h.update(dt, this));
    if (!this.running) return;
    compact(this.zones, z => z.update(dt, this));
    compact(this.discs, d => d.update(dt, this));
    compact(this.timers, t => (t.t -= dt) > 0 || (t.fn(), false));
    this.fx.update(dt);
    castSpells(this, dt);

    this.autoSaveCD -= dt;
    if (this.autoSaveCD <= 0) { this.autoSaveCD = 20; this.persist(); }
  }

  // Base HP and attack a fresh run would have on this stage. Growth passives add a share
  // of these each minute rather than a share of current stats, so long runs grow steadily
  // instead of compounding without limit.
  get baseHp() { return 100 * (1 + (this.meta.hp || 0) * META_UPGRADES.hp.per) * (1 + (this.stage - 1) * .22); }
  get baseAtk() { return (1 + (this.meta.atk || 0) * META_UPGRADES.atk.per) * (1 + (this.stage - 1) * .14); }

  passiveGrowth() {
    const p = this.player, r = p.passiveRanks;
    while (this.growthClock >= 60) {
      this.growthClock -= 60;
      if (r.heartGrowth) { const gain = this.baseHp * .06 * r.heartGrowth; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); }
      if (r.emberGrowth) p.atk += this.baseAtk * .04 * r.emberGrowth;
      if (r.aegisGrowth) { const gain = this.baseHp * .08 * r.aegisGrowth; p.shieldBonusCap += gain; p.shield += gain; }
      if (r.heartGrowth || r.emberGrowth || r.aegisGrowth) this.toast('PASSIVE GROWTH · POWER INCREASED');
    }
  }

  movePlayer(dt) {
    const p = this.player, k = this.keys;
    const sx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + this.stick.x;
    const sy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0) + this.stick.y;
    const m = Math.hypot(sx, sy);
    if (m) {
      const speed = p.speed * (1 + .06 * p.passiveRanks.fleet) * (p.slowTime > 0 ? .6 : 1);
      p.x += sx / m * speed * dt; p.y += sy / m * speed * dt;
      p.facing = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 2 : 1) : (sy > 0 ? 0 : 3);
    }
    p.x = clamp(p.x, -ARENA_X, ARENA_X);
    p.y = clamp(p.y, -ARENA_Y, ARENA_Y);
  }

  // Juice: camera shake (pixels, decays quickly) and a short freeze-frame.
  shake(amount) { if (this.settings.screenShake !== false) this.shakeAmt = Math.max(this.shakeAmt, amount); }
  freeze(seconds) { this.hitStop = Math.max(this.hitStop, seconds); }

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
    const type = this.rollEnemyType();
    if (type === 'sentinel') { // turrets appear in a ring around the player instead
      const a = rand(0, TAU), r = rand(250, 390);
      x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
    }
    this.addEnemy(type, x, y);
  }

  // Picks a regular enemy from the stage's roster weights.
  rollEnemyType() {
    const roster = stageInfo(this.stage).roster;
    let roll = Math.random() * Object.values(roster).reduce((a, b) => a + b, 0);
    for (const [type, w] of Object.entries(roster)) if ((roll -= w) < 0) return type;
    return 'ghoul';
  }

  spawnMiniBoss() {
    if (this.enemies.filter(e => e.mini && !e.dead).length >= 2) { this.miniCD = 10; return; }
    const p = this.player;
    const e = new Enemy(this, 'mini', clamp(p.x + rand(-this.viewW * .38, this.viewW * .38), -ARENA_X + 55, ARENA_X - 55), clamp(p.y - this.viewH / 2 - 35, -ARENA_Y + 55, ARENA_Y - 55));
    this.enemies.push(e);
    this.miniCount++;
    this.miniCD = 55 * this.heatDef.miniCD;
    this.toast('MINI BOSS · ' + e.name.toUpperCase());
  }

  spawnBoss() {
    const p = this.player;
    const e = new Enemy(this, 'boss', clamp(p.x + rand(-this.viewW * .35, this.viewW * .35), -ARENA_X + 65, ARENA_X - 65), clamp(p.y - this.viewH / 2 - 48, -ARENA_Y + 65, ARENA_Y - 65));
    this.enemies.push(e);
    this.boss = e;
    Sound.play('boss'); this.shake(6);
    this.toast(`${e.name.toUpperCase()} APPROACHES!`);
  }
}
