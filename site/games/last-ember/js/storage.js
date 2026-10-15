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

  keepLocalData() {
    if (this.persistenceRequested) return;
    this.persistenceRequested = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },

  backup() {
    return {game: 'last-ember', version: 1, exportedAt: Date.now(), meta: this.read('meta', {}), settings: this.read('settings', {}), run: this.loadRun()};
  },

  importBackup(source) {
    // Validate everything before touching the current save. Failed writes roll back.
    if (source.length > 2_000_000) throw new Error('Invalid backup');
    const data = JSON.parse(source, (key, value) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Invalid backup');
      return value;
    });
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    const amount = v => Number.isSafeInteger(v) && v >= 0;
    if (!object(data) || data.game !== 'last-ember' || data.version !== 1 || !object(data.meta) || !object(data.settings)) throw new Error('Invalid backup');
    for (const k of ['atk', 'hp', 'souls', 'unlocked', 'heatUnlocked']) if (data.meta[k] !== undefined && !amount(data.meta[k])) throw new Error('Invalid backup');
    if (data.meta.perks !== undefined && (!object(data.meta.perks) || Object.values(data.meta.perks).some(v => !amount(v)))) throw new Error('Invalid backup');
    if (data.meta.stats !== undefined) {
      if (!object(data.meta.stats)) throw new Error('Invalid backup');
      for (const [key, value] of Object.entries(data.meta.stats)) {
        if (['fastest', 'origins'].includes(key)) { if (!object(value) || Object.values(value).some(n => !amount(n))) throw new Error('Invalid backup'); }
        else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid backup');
      }
    }
    if (data.run !== null && (!object(data.run) || data.run.version !== SAVE_VERSION || !amount(data.run.stage) || data.run.stage < 1 || !object(data.run.player) || typeof data.run.player.maxHp !== 'number' || !(data.run.player.maxHp > 0) || typeof data.run.player.atk !== 'number' || !(data.run.player.atk > 0))) throw new Error('Invalid backup');
    const before = Object.fromEntries(Object.keys(this.keys).map(k => [k, localStorage.getItem(this.keys[k])]));
    try {
      for (const k of Object.keys(this.keys)) {
        if (data[k] === null) localStorage.removeItem(this.keys[k]);
        else localStorage.setItem(this.keys[k], JSON.stringify(data[k]));
      }
    } catch (error) {
      for (const k of Object.keys(this.keys)) {
        try { if (before[k] === null) localStorage.removeItem(this.keys[k]); else localStorage.setItem(this.keys[k], before[k]); } catch {}
      }
      throw error;
    }
  },

  // Permanent progress. stats: lifetime records shown on the Stats screen.
  loadMeta() {
    const saved = this.read('meta', {});
    const stats = {runs: 0, wins: 0, deaths: 0, kills: 0, bosses: 0, bestStage: 0, endlessBest: 0, highestHeat: 0, playTime: 0, fastest: {}, origins: {}, ...saved.stats};
    const meta = {atk: 0, hp: 0, souls: 0, unlocked: 1, heatUnlocked: 0, tips: {}, perks: {}, ...saved, stats};
    return meta;
  },
  loadSettings() {
    return {damageNumbers: true, particles: true, showFps: false, sound: true, music: true, screenShake: true, quality: 'auto', lang: (navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en',
      colorblind: false, reducedMotion: false, ...this.read('settings', {})};
  },
  loadRun() {
    const run = this.read('run', null);
    return run && run.version === SAVE_VERSION ? run : null;
  },
};
