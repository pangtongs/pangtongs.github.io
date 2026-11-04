'use strict';
// Game methods: menus and overlays, stage flow (start, clear, continue, end) and saves.
// Mixed into Game.

mixin(Game, {
  openMenuPanel(panel = 'home') {
    for (const id of ['Home', 'Start', 'Upgrades', 'Stats', 'Settings', 'Help']) $('menu' + id).classList.toggle('hidden', id.toLowerCase() !== panel);
    document.querySelector('.menuModal').classList.toggle('selectingStage', panel === 'start');
    UI.renderMenu(this);
  },

  showMenu() {
    this.leaveDaily();
    this.running = false;
    this.setPaused(true);
    this.persist();
    hideAllOverlays();
    show('startOverlay');
    hide('hearthStatus');
    this.openMenuPanel('home');
  },

  openSpellbook() {
    UI.renderSpellbook(this);
    this.bookWasPaused = this.paused;
    this.setPaused(true);
    $('closeSpellbook').textContent = this.running ? 'BACK TO GAME' : 'BACK TO MENU';
    show('spellBookOverlay');
  },
  closeSpellbook() { hide('spellBookOverlay'); this.setPaused(this.bookWasPaused); },

  togglePause() {
    if (!this.running) return;
    this.setPaused(!this.paused);
    if (this.paused) { $('saveStatus').textContent = ''; this.persist(); }
    $('pauseOverlay').classList.toggle('hidden', !this.paused);
  },



  saveSettings() { Store.write('settings', this.settings); document.body.classList.toggle('reducedMotion', !!this.settings.reducedMotion); UI.renderMenu(this); },
  saveMeta() { Store.write('meta', this.meta); },
  // Checkpoint: souls and the current run.
  persist() { this.saveMeta(); if (this.running) this.saveRun(true); },

  // ---------- Run flow ----------
  startStage(stage, {heat, daily = null, journey = null} = {}) {
    Store.keepLocalData();
    if (this.daily) this.leaveDaily();
    this.reset();
    this.meta.stats.runs++;
    this.stage = stage;
    if (heat !== undefined) this.heat = clamp(heat, 0, MAX_HEAT);
    this.daily = daily;
    this.journey = journey || {time: 0, souls: 0, kills: 0};
    if (daily) {
      Math.random = seededRandom(daily.seed + stage * 7919);
      this.applyDailyMutators();
    }
    this.bossCD = stageInfo(stage).seconds;
    this.miniCD = 55 * this.heatDef.miniCD;
    this.miniGoal = Math.max(3, Math.floor((this.bossCD - 20) / 55));
    this.running = true;
    hideAllOverlays();
    this.setPaused(true);
    UI.showOrigins(this);
    this.saveRun(true);
    if (daily) this.pickOrigin(daily.origin);
  },

  pickOrigin(key) {
    const p = this.player, o = ORIGINS[key];
    p.origin = key;
    this.meta.stats.origins[key] = (this.meta.stats.origins[key] || 0) + 1;
    p.skills[o.spell] = Math.max(2 + (this.perk('origin') ? 1 : 0), p.skills[o.spell]);
    for (const [s, n] of Object.entries(o.extra || {})) p.skills[s] = Math.max(n, p.skills[s]);
    if (key === 'warden') { const gain = p.maxHp * .2; p.maxHp += gain; p.hp += gain; }
    if (key === 'starcaller') { p.critChance += .15; p.critMult += .4; }
    p.cool[o.spell] = 0;
    hide('originOverlay');
    this.setPaused(false);
    this.saveRun(true);
    this.toast(`${o.name.toUpperCase()} SPELL AWAKENED`);
  },

  collectStageLoot() {
    let xp = 0;
    const found = this.drops.length;
    for (const d of this.drops) {
      if (d.type === 'xp') xp += d.value;
      else if (d.type === 'soul') { const v = Math.round(d.value * this.soulMult); this.souls += v; this.wallet += v; }
      else if (d.type === 'gems') this.gemsCount += d.value;
      else this.coins += d.value;
    }
    this.drops.length = 0;
    this.runAutoBuy('gems');
    this.runAutoBuy('coins');
    if (xp) this.gainXP(xp * this.xpMultiplier);
    return found;
  },

  clearStage() {
    this.stageComplete = true;
    this.stageClearPending = true;
    this.setPaused(true);
    this.stageLootCollected = this.collectStageLoot();
    if (this.stage < STAGE_COUNT) this.meta.unlocked = Math.max(this.meta.unlocked || 1, this.stage + 1);
    const st = this.meta.stats, t = Math.round(this.stageTime);
    st.bestStage = Math.max(st.bestStage, this.stage);
    if (this.stage > STAGE_COUNT) st.endlessBest = Math.max(st.endlessBest, this.stage - STAGE_COUNT);
    else if (!st.fastest[this.stage] || t < st.fastest[this.stage]) st.fastest[this.stage] = t;
    st.highestHeat = Math.max(st.highestHeat, this.heat || 0);
    this.unlockHeat();
    this.stageAchievements();
    this.saveMeta();
    // Winning ends the stage: bank remaining loot without asking for powers that
    // would be discarded at the next level-1 start.
    this.levelQueue = 0;
    hide('levelOverlay');
    this.saveRun(true);
    this.showStageClear();
  },

  showStageClear() {
    if (!this.stageComplete) return;
    this.setPaused(true);
    show('stageOverlay');
    // From the last stage on, the choice is endless (descend) or finishing the run.
    const st = stageInfo(this.stage), last = this.stage === STAGE_COUNT, endless = this.stage > STAGE_COUNT, final = last || endless;
    const actEnd = !final && stageInfo(this.stage + 1).act !== st.act;
    $('stagePortrait').src = `assets/boss-${st.art}.webp`;
    $('stageTitle').textContent = last ? 'THE EMBER THRONE FALLS' : endless ? `DEPTH ${st.endless} CLEARED`
      : actEnd ? `${ACT_NAMES[st.act].split(' · ')[0].toUpperCase()} COMPLETE` : `STAGE ${this.stage} CLEAR`;
    $('continueStage').textContent = last ? 'ENTER ENDLESS · DEPTH 1' : endless ? `DESCEND · DEPTH ${st.endless + 1}`
      : `CONTINUE TO STAGE ${this.stage + 1} · ${stageInfo(this.stage + 1).name.toUpperCase()}`;
    $('nextStage').textContent = final ? 'FINISH THE RUN' : 'SAVE & RETURN TO MENU';
    requestAnimationFrame(() => I18N.localize($('stageOverlay')));
    $('stageSummary').textContent = `${stageInfo(this.stage).boss} defeated. Level ${this.player.level} · ${this.souls} souls earned.`;
  },

  // Clearing a stage at your highest unlocked Heat unlocks the next level, as long as the
  // stage is at least as deep as that level, so Heat 10 cannot be farmed on stage 1.
  unlockHeat() {
    const heat = this.heat || 0;
    if (!this.daily && heat < MAX_HEAT && heat >= (this.meta.heatUnlocked || 0) && this.stage >= heat + 1) {
      this.meta.heatUnlocked = heat + 1;
      this.toast(`HEAT ${heat + 1} UNLOCKED · ${HEAT_LEVELS[heat + 1].name.toUpperCase()}`);
    }
  },

  // Only non-combat records cross a stage boundary. The saved checkpoint goes
  // through startStage just like selecting that stage from the menu.
  continueStage() {
    if (!this.running || !this.stageComplete) return;
    this.restore(this.nextStageSnapshot());
  },

  nextStage() {
    if (!this.running || !this.stageComplete) return;
    hide('stageOverlay');
    if (this.stage >= STAGE_COUNT) { this.endRun(true); return; }
    this.saveRun(true, this.nextStageSnapshot());
    this.showMenu();
  },

  nextStageSnapshot() {
    return {
      version: SAVE_VERSION, savedAt: Date.now(), freshStage: true,
      stage: this.stage + 1, heat: this.heat, daily: this.daily,
      journey: {time: this.journey.time + this.time, souls: this.journey.souls + this.souls, kills: this.journey.kills + this.runKills},
      player: new Player(),
    };
  },

  // The boss arrival card: act, name and a line of flavour, held for a moment on screen.
  bossCard(e) {
    const st = stageInfo(this.stage), card = $('bossCard');
    $('bossCardAct').textContent = this.stage > STAGE_COUNT ? `DEPTH ${st.endless}` : `${ACT_NAMES[st.act].split(' · ')[0].toUpperCase()} · STAGE ${this.stage}`;
    $('bossCardName').textContent = e.name.toUpperCase();
    $('bossCardLine').textContent = tr(BOSS_LINES[st.art] || 'APPROACHES');
    $('bossCardAct').textContent = tr($('bossCardAct').textContent);
    card.classList.add('hidden'); void card.offsetWidth; card.classList.remove('hidden');
    clearTimeout(this.bossCardTimer);
    this.bossCardTimer = setTimeout(() => card.classList.add('hidden'), 2700);
  },

  // Calling with at least 60s left earns 25% more boss souls.
  get canCallBoss() { return this.running && !this.boss && !this.stageClearPending && this.bossCD > 0 && this.stageTime >= 45; },
  callBoss() {
    if (!this.canCallBoss) return;
    this.earlySummon = this.bossCD >= 60;
    this.bossCD = 0;
    this.toast(this.earlySummon ? 'BOSS CALLED EARLY · +25% BOSS SOULS' : 'BOSS CALLED');
  },

  endRun(won) {
    this.leaveDaily();
    const daily = this.recordDaily();
    if (daily) this.achieve('daily');
    this.running = false;
    this.setPaused(true);
    Sound.play(won ? 'victory' : 'death');
    Store.remove('run');
    this.meta.stats[won ? 'wins' : 'deaths']++;
    this.saveMeta();
    show('gameOver');
    hide('hearthStatus');
    const depth = this.stage - STAGE_COUNT;
    $('gameOverTitle').textContent = won ? 'THE RIFT IS YOURS' : 'THE EMBERS FADE';
    const reached = depth > 0 ? `${won ? 'cleared' : 'reached'} endless depth ${won ? depth : depth} (best ${this.meta.stats.endlessBest})`
      : won ? `cleared stage ${this.stage}` : `reached stage ${this.stage}`;
    $('runSummary').textContent = `You ${reached} at level ${this.player.level} after ${formatTime(this.journey.time + this.time)}. Earned ${this.journey.souls + this.souls} souls this run · ${this.wallet} in your permanent wallet.`;
    if (daily) $('runSummary').textContent += ` Daily Ember ${daily.run.date}: stage ${daily.run.stage} in ${formatTime(daily.run.time)}${daily.improved ? ' · NEW DAILY BEST' : ` · today's best: stage ${daily.best.stage} in ${formatTime(daily.best.time)}`}.`;
    UI.renderMetaShop(this);
  },

  restoreBackup(source) {
    Store.importBackup(source);
    // pagehide persists the in-memory meta too; replace it before reloading so it
    // cannot overwrite the imported wallet with the old one.
    this.running = false;
    this.meta = Store.loadMeta(); this.settings = Store.loadSettings();
    this.setPaused(true);
  },

  // ---------- Saves ----------
  snapshot() {
    const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
    return {
      version: SAVE_VERSION, savedAt: Date.now(),
      ...pick(this, ['stage', 'heat', 'time', 'stageTime', 'growthClock', 'bossCD', 'miniCD', 'miniCount', 'minisDefeated', 'miniGoal',
        'spawnCD', 'stageClearPending', 'stageComplete', 'levelQueue', 'stageLootCollected', 'journey', 'souls', 'gemsCount', 'coins', 'earlySummon', 'eventIndex', 'lastEvent', 'surgeT', 'hearth', 'hearthCD', 'daily', 'runKills']),
      yields: {...this.yields}, dropRemainders: {...this.dropRemainders}, marketRanks: {...this.marketRanks}, autoBuy: {...this.autoBuy},
      player: JSON.parse(JSON.stringify(this.player)),
      enemies: this.enemies.filter(e => !e.dead).map(e => ({...e})),
      drops: this.drops.map(d => ({...d})),
      chests: this.chests.map(c => ({...c})),
      enemyShots: this.enemyShots.map(q => ({...q})),
    };
  },

  saveRun(silent = false, data = this.snapshot()) {
    const ok = Store.write('run', data);
    if (silent) return;
    $('saveStatus').textContent = ok ? 'Saved. Continue is available from the main menu.' : 'Save failed on this device.';
    this.toast(ok ? 'RUN SAVED' : 'Could not save run');
  },

  loadRun() {
    const data = Store.loadRun();
    if (!data || !this.restore(data)) { this.toast('No valid saved run'); UI.renderMenu(this); return; }
    this.toast('RUN LOADED');
  },

  restore(data) {
    if (data.stage < 1 || !data.player) return false;
    // Old runs relied on inherited builds and a different enemy curve. Keep the
    // stage, Heat and daily challenge, and restart it under the new rules.
    if (data.freshStage || data.version !== SAVE_VERSION) {
      this.startStage(data.stage, {heat: data.heat, daily: data.daily, journey: data.journey});
      if (data.version !== SAVE_VERSION) this.toast('UPDATED STAGE RULES · STARTING THIS STAGE WITH A FRESH BUILD');
      return true;
    }
    this.reset();
    const {player, enemies, drops, chests, enemyShots, yields, dropRemainders, marketRanks, autoBuy, version, savedAt, ...state} = data;
    Object.assign(this, state);
    if (typeof state.difficulty === 'string') { this.heat = LEGACY_HEAT[state.difficulty] || 0; delete this.difficulty; }
    this.yields = {...this.yields, ...yields};
    this.dropRemainders = {...this.dropRemainders, ...dropRemainders};
    this.marketRanks = {...this.marketRanks, ...marketRanks};
    this.autoBuy = {...this.autoBuy, ...autoBuy};
    const base = new Player();
    this.player = Object.assign(base, player, {
      skills: {...base.skills, ...player.skills}, passiveRanks: {...base.passiveRanks, ...player.passiveRanks}, cool: {...base.cool, ...player.cool},
      bargains: {...player.bargains}, evolved: {...player.evolved},
    });
    this.enemies = (enemies || []).map(e => Enemy.restore(this, e));
    this.boss = this.enemies.find(e => e.boss) || null;
    this.drops = (drops || []).map(d => Object.assign(new Drop(d.x, d.y, d.type, d.value), d));
    this.chests = (chests || []).map(c => Object.assign(new Chest(c.x, c.y, c.tier), c));
    this.enemyShots = (enemyShots || []).map(q => Object.assign(new EnemyShot(q.x, q.y, 0, q.kind, q.damage), q));
    this.keys = {};
    this.siegeAnchor = {x: this.player.x, y: this.player.y}; this.siegeClock = 0; this.siegeStrikes = 0;
    // A resumed daily run picks its seeded sequence back up (not identical, but seeded).
    if (this.daily) Math.random = seededRandom(this.daily.seed + this.stage * 7919 + Math.round(this.time));
    this.running = true;
    hideAllOverlays();
    this.setPaused(false);
    // Reopen whatever choice was on screen when the run was saved.
    if (this.stageComplete) { this.levelQueue = 0; this.showStageClear(); }
    else if (this.stageClearPending && !this.boss && !this.chests.length) this.chests.push(new Chest(this.player.x, this.player.y - 40, this.stage)); // older saves
    else if (!this.player.origin) { this.setPaused(true); UI.showOrigins(this); }
    else if (this.levelQueue) this.levelUp();
    return true;
  },
});
