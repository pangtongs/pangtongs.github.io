'use strict';
// Achievements: one-time goals that pay souls. Event-driven ones are awarded where the
// event happens (g.achieve(key)); stat-based ones have a test(g) checked once a second
// and at stage clears. Earned keys live in meta.achievements.

const ACHIEVEMENTS = {
  firstBlood: {name: 'First Blood', desc: 'Slay your first foe.', souls: 5, test: g => g.meta.stats.kills >= 1},
  stage1:     {name: 'Kindled', desc: 'Clear stage 1.', souls: 10},
  act1:       {name: 'Through the Rift', desc: 'Clear stage 8 and finish Act I.', souls: 40},
  act2:       {name: 'Beyond the Pyre', desc: 'Clear stage 16 and finish Act II.', souls: 80},
  act3:       {name: 'The Last Ember', desc: 'Defeat the Hollow Flame on the Ember Throne.', souls: 150},
  endless5:   {name: 'Into the Deep', desc: 'Clear Endless depth 5.', souls: 100},
  combo100:   {name: 'Chain Reaction', desc: 'Reach a 100-kill combo.', souls: 25, test: g => g.combo >= 100},
  combo300:   {name: 'Inferno Chain', desc: 'Reach a 300-kill combo.', souls: 60, test: g => g.combo >= 300},
  fusion1:    {name: 'Alchemist', desc: 'Discover a spell fusion.', souls: 20, test: g => Object.keys(g.meta.fusions || {}).length >= 1},
  fusionAll:  {name: 'Grand Alchemist', desc: 'Discover all eight fusions.', souls: 100, test: g => Object.keys(g.meta.fusions || {}).length >= Object.keys(FUSIONS).length},
  evolve:     {name: 'Final Form', desc: 'Evolve a spell.', souls: 15, test: g => Object.keys(g.player.evolved).length >= 1},
  evolve3:    {name: 'Archmage', desc: 'Have three evolved spells in one run.', souls: 40, test: g => Object.keys(g.player.evolved).length >= 3},
  bargains3:  {name: 'Devil’s Accountant', desc: 'Strike three bargains in one run.', souls: 30, test: g => Object.keys(g.player.bargains).length >= 3},
  level30:    {name: 'Ascendant', desc: 'Reach level 30 in one run.', souls: 40, test: g => g.player.level >= 30},
  hearthNova: {name: 'Banked Fire', desc: 'Release a fully charged Hearth nova.', souls: 15},
  hearthKeep: {name: 'Keeper of the Flame', desc: 'Slay 150 foes while standing in your Hearth in one run.', souls: 30, test: g => (g.hearthKills || 0) >= 150},
  untouched:  {name: 'Untouchable', desc: 'Defeat a boss without taking damage during the fight.', souls: 60},
  heat5:      {name: 'Trial by Fire', desc: 'Clear a stage at Heat 5 or higher.', souls: 50},
  heat10:     {name: 'Last Light', desc: 'Clear a stage at Heat 10.', souls: 150},
  elite:      {name: 'The Hard Road', desc: 'Clear a stage reached by the Elite Road.', souls: 30},
  daily:      {name: 'Daily Flame', desc: 'Finish a Daily Ember run.', souls: 15},
  goblin:     {name: 'Pickpocket', desc: 'Catch a treasure goblin.', souls: 10},
  shrine:     {name: 'Surge Survivor', desc: 'Survive a cursed shrine’s surge.', souls: 10},
  allChars:   {name: 'Many Faces', desc: 'Start a run with all seven characters.', souls: 50, test: g => Object.keys(g.meta.stats.origins).length >= Object.keys(ORIGINS).length},
  denMaster:  {name: 'Master of the Den', desc: 'Buy every rank of every Den perk.', souls: 120, test: g => Object.keys(META_PERKS).every(k => g.perkCost(k) === null)},
};

mixin(Game, {
  achieve(key) {
    const got = this.meta.achievements || (this.meta.achievements = {});
    if (got[key] || !ACHIEVEMENTS[key]) return;
    const a = ACHIEVEMENTS[key];
    got[key] = Date.now();
    this.wallet += a.souls;
    this.saveMeta();
    Sound.play('evolve');
    this.toast(`ACHIEVEMENT · ${a.name.toUpperCase()} · +${a.souls} SOULS`);
  },

  checkAchievements() {
    const got = this.meta.achievements || {};
    for (const [key, a] of Object.entries(ACHIEVEMENTS)) if (!got[key] && a.test && a.test(this)) this.achieve(key);
  },

  // Stage-clear achievements.
  stageAchievements() {
    const s = this.stage;
    if (s >= 1) this.achieve('stage1');
    if (s >= 8) this.achieve('act1');
    if (s >= 16) this.achieve('act2');
    if (s >= STAGE_COUNT) this.achieve('act3');
    if (s - STAGE_COUNT >= 5) this.achieve('endless5');
    if ((this.heat || 0) >= 5) this.achieve('heat5');
    if ((this.heat || 0) >= 10) this.achieve('heat10');
    if (this.route === 'elite') this.achieve('elite');
    this.checkAchievements();
  },
});
