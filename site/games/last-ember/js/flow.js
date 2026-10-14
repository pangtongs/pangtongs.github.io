'use strict';
// Game methods: menus and overlays, stage flow (start, clear, continue, end) and saves.
// Mixed into Game.

mixin(Game, {
  openMenuPanel(panel = 'home') {
    for (const id of ['Home', 'Start', 'Upgrades', 'Stats', 'Settings']) $('menu' + id).classList.toggle('hidden', id.toLowerCase() !== panel);
    UI.renderMenu(this);
  },

  showMenu() {
    this.running = false;
    this.setPaused(true);
    this.persist();
    hideAllOverlays();
    show('startOverlay');
    this.openMenuPanel('home');
  },

  openSpellbook() {
    this.bookWasPaused = this.paused;
    this.paused = true;
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



  saveSettings() { Store.write('settings', this.settings); UI.renderMenu(this); },
  saveMeta() { Store.write('meta', this.meta); },
  // Checkpoint: souls and the current run.
  persist() { this.saveMeta(); if (this.running) this.saveRun(true); },

  // ---------- Run flow ----------
  startStage(stage) {
    this.reset();
    this.meta.stats.runs++;
    this.stage = stage;
    this.bossCD = stageInfo(stage).seconds;
    this.miniGoal = Math.max(3, Math.floor((this.bossCD - 20) / 55));
    if (stage > 1) {
      // A fresh run on a later stage starts near the build a continued run would have:
      // stats at about 80% of the measured curve (tools/sim.js) plus level ups to spend.
      const boost = stage - 1, p = this.player;
      p.atk *= .8 * Math.pow(1.28, boost); p.maxHp *= .8 * Math.pow(1.3, boost); p.hp = p.maxHp; p.shield += boost * 12;
      const levels = Math.min(14, boost * 2);
      for (let i = 0; i < levels; i++) { p.level++; p.nextXp = Math.floor(p.nextXp * 1.35 + 5); }
      this.levelQueue = levels;
    }
    this.running = true;
    this.setPaused(true);
    hide('startOverlay');
    UI.showOrigins(this);
  },

  pickOrigin(key) {
    const p = this.player, o = ORIGINS[key];
    p.origin = key;
    this.meta.stats.origins[key] = (this.meta.stats.origins[key] || 0) + 1;
    p.skills[o.spell] = Math.max(2, p.skills[o.spell]);
    p.cool[o.spell] = 0;
    hide('originOverlay');
    this.setPaused(false);
    this.saveRun(true);
    this.toast(`${o.name.toUpperCase()} SPELL AWAKENED`);
    if (this.levelQueue) this.levelUp(); // head-start level ups on later stages
  },

  collectStageLoot() {
    let xp = 0;
    const found = this.drops.length;
    for (const d of this.drops) {
      if (d.type === 'xp') xp += d.value;
      else if (d.type === 'soul') { const v = Math.round(d.value * this.heatDef.souls); this.souls += v; this.wallet += v; }
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
    this.pendingChest = null;
    this.setPaused(true);
    this.stageLootCollected = this.collectStageLoot();
    if (this.stage < STAGE_COUNT) this.meta.unlocked = Math.max(this.meta.unlocked || 1, this.stage + 1);
    const st = this.meta.stats, t = Math.round(this.stageTime);
    st.bestStage = Math.max(st.bestStage, this.stage);
    if (this.stage > STAGE_COUNT) st.endlessBest = Math.max(st.endlessBest, this.stage - STAGE_COUNT);
    else if (!st.fastest[this.stage] || t < st.fastest[this.stage]) st.fastest[this.stage] = t;
    st.highestHeat = Math.max(st.highestHeat, this.heat || 0);
    this.unlockHeat();
    this.saveMeta();
    this.saveRun(true);
    if (this.levelQueue) this.levelUp(); else this.showStageClear();
  },

  showStageClear() {
    if (!this.stageComplete) return;
    this.setPaused(true);
    show('stageOverlay');
    // From the last stage on, the choice is endless (descend) or finishing the run.
    const st = stageInfo(this.stage), last = this.stage === STAGE_COUNT, endless = this.stage > STAGE_COUNT, final = last || endless;
    const actEnd = !final && stageInfo(this.stage + 1).act !== st.act;
    $('stagePortrait').src = `assets/boss-${st.art}.webp`;
    $('stageTitle').textContent = last ? 'THE LAST PYRE FALLS' : endless ? `DEPTH ${st.endless} CLEARED`
      : actEnd ? `${ACT_NAMES[st.act].split(' · ')[0].toUpperCase()} COMPLETE` : `STAGE ${this.stage} CLEAR`;
    $('continueStage').textContent = last ? 'ENTER ENDLESS · DEPTH 1' : endless ? `DESCEND · DEPTH ${st.endless + 1}`
      : `CONTINUE TO STAGE ${this.stage + 1} · ${stageInfo(this.stage + 1).name.toUpperCase()}`;
    $('nextStage').textContent = final ? 'FINISH THE RUN' : 'SAVE & RETURN TO MENU';
    $('stageSummary').textContent = `${stageInfo(this.stage).boss} defeated. ${this.stageLootCollected || 0} remaining drops collected · Level ${this.player.level} · ${this.souls} souls earned · ${this.gemsCount} gems · ${this.coins} gold. Artifact: ${this.lastArtifact}.`;
  },

  // Clearing a stage at your highest unlocked Heat unlocks the next level, as long as the
  // stage is at least as deep as that level, so Heat 10 cannot be farmed on stage 1.
  unlockHeat() {
    const heat = this.heat || 0;
    if (heat < MAX_HEAT && heat >= (this.meta.heatUnlocked || 0) && this.stage >= heat + 1) {
      this.meta.heatUnlocked = heat + 1;
      this.toast(`HEAT ${heat + 1} UNLOCKED · ${HEAT_LEVELS[heat + 1].name.toUpperCase()}`);
    }
  },

  // Continue: carry the build straight into the next stage (or the next endless depth).
  continueStage() {
    hide('stageOverlay');
    const next = this.nextStageSnapshot();
    this.saveRun(true, next);
    this.restore(next);
    this.toast(stageInfo(this.stage).name.toUpperCase());
  },

  // Save & menu: store the build on the next stage; Continue Saved Run resumes it.
  // From the last stage on, this button finishes the run instead.
  nextStage() {
    hide('stageOverlay');
    if (this.stage >= STAGE_COUNT) { this.endRun(true); return; }
    this.saveRun(true, this.nextStageSnapshot());
    this.showMenu();
  },

  nextStageSnapshot() {
    const next = this.snapshot(), p = next.player;
    if (this.surgeT > 0) { this.surgeT = 0; this.endSurge(); } // a surge cut short by the stage end still pays out
    Object.assign(next, {stage: this.stage + 1, stageTime: 0, bossCD: stageInfo(this.stage + 1).seconds, miniCD: 55 * this.heatDef.miniCD, miniCount: 0, minisDefeated: 0,
      eventIndex: 0, surgeT: 0,
      miniGoal: Math.max(3, Math.floor((stageInfo(this.stage + 1).seconds - 20) / 55)), stageClearPending: false, stageComplete: false,
      enemyShots: [], enemies: [], drops: [], chests: []});
    next.earlySummon = false;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .3 * this.heatDef.heal);
    p.shield += 20;
    return next;
  },

  // Call the boss before the timer. With 60s or more to spare, its chest grants two artifacts.
  get canCallBoss() { return this.running && !this.boss && !this.stageClearPending && this.bossCD > 0 && this.stageTime >= 45; },
  callBoss() {
    if (!this.canCallBoss) return;
    this.earlySummon = this.bossCD >= 60;
    this.bossCD = 0;
    this.toast(this.earlySummon ? 'BOSS CALLED EARLY · ITS CHEST GRANTS TWO ARTIFACTS' : 'BOSS CALLED');
  },

  endRun(won) {
    this.running = false;
    this.setPaused(true);
    Sound.play(won ? 'victory' : 'death');
    Store.remove('run');
    this.meta.stats[won ? 'wins' : 'deaths']++;
    this.saveMeta();
    show('gameOver');
    const depth = this.stage - STAGE_COUNT;
    $('gameOverTitle').textContent = won ? 'THE RIFT IS YOURS' : 'THE EMBERS FADE';
    const reached = depth > 0 ? `${won ? 'cleared' : 'reached'} endless depth ${won ? depth : depth} (best ${this.meta.stats.endlessBest})`
      : won ? `cleared all ${STAGE_COUNT} stages` : `reached stage ${this.stage}`;
    $('runSummary').textContent = `You ${reached} at level ${this.player.level} after ${formatTime(this.time)}. Earned ${this.souls} souls this run · ${this.wallet} in your permanent wallet.`;
    UI.renderMetaShop(this);
  },

  // ---------- Saves ----------
  snapshot() {
    const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
    return {
      version: SAVE_VERSION, savedAt: Date.now(),
      ...pick(this, ['stage', 'heat', 'time', 'stageTime', 'growthClock', 'bossCD', 'miniCD', 'miniCount', 'minisDefeated', 'miniGoal',
        'spawnCD', 'stageClearPending', 'stageComplete', 'levelQueue', 'stageLootCollected', 'lastArtifact', 'souls', 'gemsCount', 'coins', 'earlySummon', 'pendingChest', 'eventIndex', 'lastEvent', 'surgeT']),
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
    this.running = true;
    hideAllOverlays();
    this.setPaused(false);
    // Reopen whatever choice was on screen when the run was saved.
    if (this.stageComplete) { this.setPaused(true); if (this.levelQueue) this.levelUp(); else this.showStageClear(); }
    else if (this.pendingChest) this.openChestAgain();
    else if (this.stageClearPending && !this.boss && !this.chests.length) this.chests.push(new Chest(this.player.x, this.player.y - 40, this.stage)); // older saves
    else if (!this.player.origin) { this.setPaused(true); UI.showOrigins(this); }
    else if (this.levelQueue) this.levelUp();
    return true;
  },
});
