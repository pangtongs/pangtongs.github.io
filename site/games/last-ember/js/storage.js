'use strict';
// localStorage access. Writes are synchronous and can stall a frame, so the game calls
// these at checkpoints (pause, stage end, death, tab hidden, periodic autosave), never
// per pickup.

const Store = {
  keys: {meta: 'lastEmber.meta', settings: 'lastEmber.settings', run: 'lastEmber.run'},
  read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(this.keys[key])); return v ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(this.keys[key], JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(this.keys[key]); } catch {} },

  // Permanent progress. stats: lifetime records shown on the Stats screen.
  loadMeta() {
    const saved = this.read('meta', {});
    const stats = {runs: 0, wins: 0, deaths: 0, kills: 0, bosses: 0, bestStage: 0, endlessBest: 0, highestHeat: 0, playTime: 0, fastest: {}, origins: {}, ...saved.stats};
    return {atk: 0, hp: 0, souls: 0, unlocked: 1, heatUnlocked: 0, ...saved, stats};
  },
  loadSettings() {
    return {damageNumbers: true, particles: true, showFps: false, sound: true, music: true, screenShake: true, quality: 'auto', ...this.read('settings', {})};
  },
  loadRun() {
    const run = this.read('run', null);
    return run && run.version === SAVE_VERSION ? run : null;
  },
};
