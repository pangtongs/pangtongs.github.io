'use strict';
// Daily Ember: one seeded run per calendar day. Everyone playing on the same day gets the
// same character, Heat 2 and two mutators, and the same random sequence from the start
// (cards, spawns, events). The best result of the day is kept. Mixed into Game.

const DAILY_HEAT = 2;
const DAILY_MUTATORS = {
  glass:     {name: 'Glass Cannon', desc: 'Max HP −40%, attack +40%.'},
  swarm:     {name: 'The Swarm', desc: 'Foes arrive 40% faster; XP +40%.'},
  giants:    {name: 'Giants', desc: 'Foes are bigger with +40% HP; XP +30%.'},
  haste:     {name: 'Haste', desc: 'You and every foe move 20% faster.'},
  bargainer: {name: 'Devil’s Deal', desc: 'Start with a random bargain already struck.'},
  midas:     {name: 'Midas', desc: 'Gold drops ×2, gem drops ×0.5.'},
  ember:     {name: 'Hot Ember', desc: 'The Hearth recharges twice as fast and its nova is 50% stronger.'},
};

// mulberry32: small, fast, good enough for a game.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const nativeRandom = Math.random;

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The day's setup, derived only from the date.
function dailySetup(date = todayKey()) {
  let seed = 2166136261;
  for (const ch of date) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = seededRandom(seed), pick = list => list[Math.floor(rnd() * list.length)];
  const base = Object.keys(ORIGINS).filter(k => !ORIGINS[k].perk);
  const muts = Object.keys(DAILY_MUTATORS), first = pick(muts);
  return {date, seed, origin: pick(base), mutators: [first, pick(muts.filter(m => m !== first))]};
}

mixin(Game, {
  mut(key) { return !!(this.daily && this.daily.mutators.includes(key)); },

  startDaily() {
    const d = dailySetup();
    Math.random = seededRandom(d.seed);
    this.startStage(1);
    this.daily = d;
    this.heat = DAILY_HEAT;
    const p = this.player;
    if (this.mut('glass')) { p.maxHp *= .6; p.hp = p.maxHp; p.atk *= 1.4; }
    if (this.mut('haste')) p.speed *= 1.2;
    if (this.mut('midas')) { this.yields.coins *= 2; this.yields.gems *= .5; }
    if (this.mut('bargainer')) {
      const keys = Object.keys(BARGAINS).filter(k => k !== 'overcharge'), k = keys[Math.floor(Math.random() * keys.length)];
      p.bargains[k] = true; BARGAINS[k].apply(p, this);
    }
    this.pickOrigin(d.origin);
    this.toast(`DAILY EMBER · ${d.mutators.map(m => DAILY_MUTATORS[m].name.toUpperCase()).join(' · ')}`);
  },

  // Restores the browser's own randomness once a daily run is over.
  leaveDaily() { Math.random = nativeRandom; },

  // Best result of the day: deepest stage, then the fastest time to reach it.
  recordDaily() {
    const d = this.daily;
    if (!d) return null;
    const best = this.meta.daily && this.meta.daily.date === d.date ? this.meta.daily : null;
    const run = {date: d.date, stage: this.stage, time: Math.round(this.time), kills: this.runKills || 0};
    const better = !best || run.stage > best.stage || (run.stage === best.stage && run.time < best.time);
    if (better) this.meta.daily = run;
    return {run, best: better ? run : best, improved: better};
  },
});
