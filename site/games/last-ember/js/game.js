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
    I18N.lang = LANGS[this.settings.lang] ? this.settings.lang : 'en';
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
    I18N.set(I18N.lang);
    document.body.classList.toggle('reducedMotion', !!this.settings.reducedMotion);
  }

  get wallet() { return this.meta.souls || 0; }
  set wallet(v) { this.meta.souls = v; }
  get viewW() { return this.renderer.W; }
  get viewH() { return this.renderer.H; }
  get xpMultiplier() { return (this.player.bargains.hunted ? 1.5 : 1) * (this.route === 'swarm' ? 1.4 : 1) * (this.mut('swarm') ? 1.4 : 1) * (this.mut('giants') ? 1.3 : 1); }
  get heatDef() { return heatDef(this.heat || 0); }
  get soulMult() { return this.heatDef.souls * (1 + metaBonus('souls', this.perk('souls'))) * (this.route === 'elite' ? 1.5 : 1); }
  get dashCooldown() { return DASH.cooldown / (1 + .08 * this.player.passiveRanks.fleet) / (1 + metaBonus('dash', this.perk('dash'))) * (this.player.origin === 'hexblade' ? .7 : 1) / (1 + (this.player.dashBonus || 0)); }

  reset() {
    const p = this.player = new Player();
    p.atk *= 1 + metaBonus('atk', this.perk('atk'));
    p.maxHp *= 1 + metaBonus('hp', this.perk('hp'));
    p.hp = p.maxHp;
    p.rerolls = this.perk('reroll'); p.secondWind = this.perk('revive') > 0;
    this.time = 0; this.stage = 1; this.stageTime = 0; this.growthClock = 0;
    this.heat = clamp(this.settings.heat || 0, 0, this.meta.heatUnlocked || 0);
    this.stageClearPending = false; this.stageComplete = false; this.stageLootCollected = 0; this.lastArtifact = '';
    this.souls = 0; this.gemsCount = this.coins = startingPurse(this.perk('purse'));
    this.yields = {gems: 1, coins: 1};
    this.dropRemainders = {gems: 0, coins: 0};
    this.marketRanks = Object.fromEntries(Object.keys(MARKET).map(k => [k, 0]));
    this.autoBuy = {gems: null, coins: null}; // market item bought automatically per currency
    this.enemies = []; this.drops = []; this.projectiles = []; this.enemyShots = []; this.chests = []; this.meteors = []; this.hazards = []; this.zones = []; this.timers = []; this.discs = []; this.allies = []; this.shrines = [];
    this.surgeT = 0; this.eventIndex = 0; this.lastEvent = null; this.combo = 0; this.comboT = 0;
    this.nearby = [];
    this.obstacles = []; this.obstaclesFor = 0;
    this.siegeAnchor = {x: 0, y: 0}; this.siegeClock = 0; this.siegeStrikes = 0;
    this.hearth = null; this.hearthCD = 0; this.route = 'road'; this.daily = null; this.runKills = 0; this.hearthKills = 0; this.achieveClock = 0;
    this.fx.clear();
    this.spawnCD = 0; this.bossCD = stageInfo(1).seconds;
    this.miniCD = 55 * this.heatDef.miniCD; this.miniCount = 0; this.minisDefeated = 0; this.miniGoal = 3;
    this.levelQueue = 0; this.boss = null; this.autoSaveCD = 20; this.earlySummon = false; this.pendingChest = null;
    $('bossUI').classList.add('hidden');
  }

  // ---------- Input and buttons ----------
  bind() {
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'escape'].includes(k)) e.preventDefault();
      if ((k === ' ' || k === 'shift') && !e.repeat) this.requestDash();
      if (k === 'r' && !e.repeat) this.reroll();
      if (k === 'e' && !e.repeat) this.useHearth();
      // Number keys pick the matching card on any open choice screen.
      if (/^[1-9]$/.test(e.key) && !e.repeat) {
        const box = ['levelOverlay', 'chestOverlay', 'originOverlay'].filter(isOpen).map(id => $(id).querySelector('.choices'))[0];
        const card = box && box.querySelectorAll('.choice')[+e.key - 1];
        if (card && !card.disabled) { card.click(); return; }
      }
      if (k === 'escape' && !e.repeat) {
        if (isOpen('marketOverlay')) { this.closeMarket(); return; }
        if (isOpen('spellBookOverlay')) { this.closeSpellbook(); return; }
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
    on('rerollBtn', () => this.reroll());
    on('denBtn', () => { this.showMenu(); this.openMenuPanel('upgrades'); });
    document.querySelectorAll('[data-setting]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.setting;
        this.settings[k] = !this.settings[k];
        Sound.setSfx(this.settings.sound); Sound.setMusic(this.settings.music);
        this.saveSettings();
      };
    });
    on('exportSave', () => {
      this.persist(); this.saveSettings();
      const blob = new Blob([JSON.stringify(Store.backup(), null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `last-ember-${todayKey()}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $('backupStatus').textContent = tr('Backup exported. Keep this file to restore your progress.');
    });
    on('importSave', () => { $('saveFile').value = ''; $('saveFile').click(); });
    $('saveFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('Invalid backup');
        this.restoreBackup(await file.text());
        location.reload();
      } catch { $('backupStatus').textContent = tr('Could not restore this backup. Your current progress is unchanged.'); }
    };
    on('langSetting', () => {
      this.settings.lang = this.settings.lang === 'id' ? 'en' : 'id';
      I18N.set(this.settings.lang);
      this.saveSettings();
    });
    on('qualitySetting', () => {
      const levels = ['auto', 'high', 'low'];
      this.settings.quality = levels[(levels.indexOf(this.settings.quality) + 1) % levels.length];
      this.renderer.setQuality(this.settings.quality);
      this.saveSettings();
    });
    const cycleHeat = () => {
      this.settings.heat = ((this.settings.heat || 0) + 1) % ((this.meta.heatUnlocked || 0) + 1);
      this.saveSettings();
    };
    on('difficultySetting', cycleHeat);
    on('startHeatBtn', cycleHeat);
    on('startBtn', () => this.startStage(this.selectedStage));
    on('loadBtn', () => this.loadRun());
    on('restartBtn', () => this.showMenu());
    on('pauseBtn', () => this.togglePause());
    on('touchPause', () => this.togglePause());
    on('touchMarket', () => this.openMarket());
    $('touchDash').addEventListener('pointerdown', e => { e.preventDefault(); this.requestDash(); });
    $('touchHearth').addEventListener('pointerdown', e => { e.preventDefault(); this.useHearth(); });
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
    // A floating stick: touching anywhere in the left zone centres the stick under the
    // thumb. It follows a single finger; other pointers are ignored.
    const zone = $('stickZone'), el = $('joystick'), nub = $('nub');
    let active = null, cx = 0, cy = 0;
    const move = e => {
      if (e.pointerId !== active) return;
      const x = e.clientX - cx, y = e.clientY - cy;
      const m = Math.hypot(x, y), d = Math.min(m, 44);
      this.stick = {x: m > 4 ? x / m * d / 44 : 0, y: m > 4 ? y / m * d / 44 : 0};
      nub.style.transform = `translate(${this.stick.x * 44}px,${this.stick.y * 44}px)`;
    };
    const end = e => {
      if (e.pointerId !== active) return;
      active = null; this.stick = {x: 0, y: 0};
      nub.style.transform = ''; el.style.left = el.style.top = el.style.bottom = ''; el.classList.remove('active');
    };
    zone.addEventListener('pointerdown', e => {
      if (active !== null) return;
      active = e.pointerId; zone.setPointerCapture(e.pointerId);
      cx = e.clientX; cy = e.clientY;
      el.style.left = cx - 70 + 'px'; el.style.top = cy - 70 + 'px'; el.style.bottom = 'auto'; el.classList.add('active');
      move(e);
    });
    zone.addEventListener('pointermove', move);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, end);
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
    Sound.act = stageInfo(this.stage).act;
    Sound.updateMusic(this.boss ? .85 : Math.min(.55, this.enemies.length / 160), active);
    if (active || this.dirty) { this.renderer.draw(this); this.dirty = false; }
    if (this.running) this.hud.update(this, now);
    this.hud.perf(this, this.renderer, this.settings.showFps && this.running);
    requestAnimationFrame(t => this.frame(t));
  }

  setPaused(v) {
    this.paused = v;
    if (!v && this.running) Sound.start();
    this.accumulator = 0;
    this.dirty = true;
    this.hud.update(this, performance.now(), true);
  }

  // One fixed simulation step.
  step(dt) {
    const p = this.player;
    if (this.obstaclesFor !== this.stage) { this.obstacles = makeObstacles(this.stage); this.obstaclesFor = this.stage; }
    this.time += dt; this.stageTime += dt; this.growthClock += dt; this.meta.stats.playTime += dt;
    this.spawnCD -= dt; this.bossCD -= dt; this.miniCD -= dt;
    p.invuln = Math.max(0, p.invuln - dt);
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt);
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.endCombo();
    if ((this.achieveClock += dt) >= 1) { this.achieveClock = 0; this.checkAchievements(); }
    p.slowTime = Math.max(0, p.slowTime - dt);
    p.lifeHealWindow += dt;
    if (p.lifeHealWindow >= 1) { p.lifeHealWindow %= 1; p.lifeHealUsed = 0; }
    this.passiveGrowth();

    const regen = (p.shieldRegen + p.maxHp * (p.shieldRegenPct + .001 * p.passiveRanks.aegisGrowth)) * this.heatDef.shieldRegen;
    if (p.bargains.glassWick) p.shield = 0;
    else if (p.shield < p.shieldCap) p.shield = Math.min(p.shieldCap, p.shield + regen * dt);

    this.stepEvents(dt);
    this.stepSiege(dt);
    this.stepHearth(dt);
    if (this.stageTime > .5) this.tip('move', matchMedia('(pointer:coarse)').matches
      ? 'TIP · DRAG ON THE LEFT TO MOVE · YOUR SPELLS CAST THEMSELVES' : 'TIP · MOVE WITH WASD · YOUR SPELLS CAST THEMSELVES');
    if (this.stageTime > 20) this.tip('hearthGuide', matchMedia('(pointer:coarse)').matches
      ? 'TIP · TAP PLANT: STAND INSIDE THE FIRE FOR DAMAGE AND HEALING' : 'TIP · PRESS E TO PLANT YOUR HEARTH: MORE DAMAGE AND HEALING INSIDE ITS LIGHT');
    if (this.stageTime > 6) this.tip('dash', matchMedia('(pointer:coarse)').matches
      ? 'TIP · TAP DASH TO DART THROUGH FOES AND ATTACKS UNHARMED' : 'TIP · SPACE OR SHIFT DASHES THROUGH FOES AND ATTACKS UNHARMED');
    if (this.spawnCD <= 0 && !this.stageClearPending) {
      this.spawn();
      this.spawnCD = Math.max(.14, (.78 - this.stageTime * .003 - this.stage * .055) / (1 + (this.stage - 1) * .16)) / this.heatDef.spawns / (p.bargains.hunted ? 1.3 : 1) / (this.surgeT > 0 ? 2.2 : 1) / (this.route === 'swarm' ? 1.4 : 1) / (this.mut('swarm') ? 1.4 : 1);
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
    // Obstacles: foes slide around them, and a charging foe that hits one stops dead.
    for (const e of this.enemies) {
      if (e.dead || !pushOutOfObstacles(this.obstacles, e, e.r * .8) || !(e.dashT > 0)) continue;
      e.dashT = 0; e.dvx = e.dvy = 0;
      this.burst(e.x, e.y, '#d8cbb8', 10); this.shake(3);
    }
    this.stepBossSignature(dt);
    if (this.obstacles.some(o => o.life)) compact(this.obstacles, o => !o.life || (o.life -= dt) > 0); // thorn cages wither
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
  get baseHp() { return 100 * (1 + metaBonus('hp', this.perk('hp'))) * (1 + (this.stage - 1) * .22); }
  get baseAtk() { return (1 + metaBonus('atk', this.perk('atk'))) * (1 + (this.stage - 1) * .14); }

  passiveGrowth() {
    const p = this.player, r = p.passiveRanks;
    while (this.growthClock >= 60) {
      this.growthClock -= 60;
      // Growth follows the geometric mean of the stage baseline and your current stats,
      // so it keeps mattering as a build snowballs without compounding out of control.
      const hpRef = Math.sqrt(this.baseHp * Math.max(this.baseHp, p.maxHp)), atkRef = Math.sqrt(this.baseAtk * Math.max(this.baseAtk, p.atk));
      if (r.heartGrowth) { const gain = hpRef * .06 * r.heartGrowth; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); }
      if (r.emberGrowth) p.atk += atkRef * .04 * r.emberGrowth;
      if (r.aegisGrowth) { const gain = hpRef * .08 * r.aegisGrowth; p.shieldBonusCap += gain; p.shield += gain; }
      if (r.heartGrowth || r.emberGrowth || r.aegisGrowth) this.toast('PASSIVE GROWTH · POWER INCREASED');
    }
  }

  movePlayer(dt) {
    const p = this.player, k = this.keys;
    const sx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + this.stick.x;
    const sy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0) + this.stick.y;
    const m = Math.hypot(sx, sy);
    p.dashCD = Math.max(0, p.dashCD - dt);
    if (this.dashQueued && p.dashCD <= 0) this.startDash(m ? sx / m : 0, m ? sy / m : 0);
    this.dashQueued = false;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x = clamp(p.x + p.dashX * DASH.speed * dt, -ARENA_X, ARENA_X);
      p.y = clamp(p.y + p.dashY * DASH.speed * dt, -ARENA_Y, ARENA_Y);
      pushOutOfObstacles(this.obstacles, p, p.r);
      if (this.settings.particles) this.fx.particles.burst(p.x, p.y + 4, '#ffb064', 2);
      if (p.origin === 'hexblade') { // the Hexblade's dash cuts every foe it passes once
        const cut = this.dashCut || (this.dashCut = new Set());
        this.forEachEnemyNear(p.x, p.y, 34, e => { if (cut.has(e.id)) return; cut.add(e.id); this.hit(e, 30 + p.level * 6, '#ff9a4c'); });
      }
      return;
    }
    if (m) {
      const speed = p.speed * (1 + .06 * p.passiveRanks.fleet) * (p.slowTime > 0 ? .6 : 1);
      p.x += sx / m * speed * dt; p.y += sy / m * speed * dt;
      p.facing = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 2 : 1) : (sy > 0 ? 0 : 3);
    }
    p.x = clamp(p.x, -ARENA_X, ARENA_X);
    p.y = clamp(p.y, -ARENA_Y, ARENA_Y);
    pushOutOfObstacles(this.obstacles, p, p.r);
  }

  // Second Thoughts: redraw the current level-up cards.
  reroll() {
    const p = this.player;
    if (!isOpen('levelOverlay') || $('choices').dataset.tier !== 'SPELL' || !(p.rerolls > 0)) return;
    p.rerolls--;
    UI.showLevelUp(this);
  }

  // One-time hints, remembered across runs.
  tip(key, text) {
    const tips = this.meta.tips || (this.meta.tips = {});
    if (tips[key]) return;
    tips[key] = true;
    this.toast(text);
  }

  // Dash: a short burst that passes through enemies and attacks untouched.
  startDash(dx, dy) {
    const p = this.player;
    if (!dx && !dy) { const f = [[0, 1], [-1, 0], [1, 0], [0, -1]][p.facing] || [0, 1]; dx = f[0]; dy = f[1]; }
    p.dashX = dx; p.dashY = dy; p.dashT = DASH.time; this.dashCut = null;
    p.dashCD = this.dashCooldown;
    p.invuln = Math.max(p.invuln, DASH.time + .1);
    Sound.play('dash');
  }
  requestDash() { if (this.running && !this.paused) this.dashQueued = true; }

  // Juice: camera shake (pixels, decays quickly) and a short freeze-frame.
  shake(amount) { if (this.settings.screenShake !== false && !this.settings.reducedMotion) this.shakeAmt = Math.max(this.shakeAmt, amount); }
  freeze(seconds) { if (!this.settings.reducedMotion) this.hitStop = Math.max(this.hitStop, seconds); }

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
    let roster = stageInfo(this.stage).roster;
    // The first stage opens with melee foes only, so new players learn to move before
    // they learn to dodge.
    if (this.stage === 1 && this.stageTime < 40) roster = {ghoul: 3, skeleton: 1};
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
    this.tip('minis', 'TIP · EACH MINI BOSS SLAIN BRINGS THE FINAL BOSS 20s CLOSER');
    this.tip('arrows', 'TIP · EDGE ARROWS POINT TO BOSSES, CHESTS AND EVENTS');
  }

  spawnBoss() {
    const p = this.player;
    const e = new Enemy(this, 'boss', clamp(p.x + rand(-this.viewW * .35, this.viewW * .35), -ARENA_X + 65, ARENA_X - 65), clamp(p.y - this.viewH / 2 - 48, -ARENA_Y + 65, ARENA_Y - 65));
    this.enemies.push(e);
    this.boss = e; this.bossHurt = false;
    Sound.play('boss'); this.shake(8); this.freeze(.25);
    this.bossCard(e);
    this.tip('boss', 'TIP · COLOURED ZONES ARE ATTACKS · DASH OUT OF THEM');
  }
}
