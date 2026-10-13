'use strict';
// Game data. Balance numbers live here so tuning never means hunting through logic.

const ARENA_X = 1040, ARENA_Y = 790;   // movement limits for every entity center
const FLOOR_MARGIN = 16;                 // drawn floor extends this far past the limits (body width)
const MAX_ENEMIES = 180;
const MAX_GEMS = 260;          // extra XP merges into existing gems beyond this
const SIM_STEP = 1 / 60;       // fixed simulation timestep (seconds)
const SAVE_VERSION = 2;

const DIFFICULTIES = {
  standard: {hp: 1, damage: 1, speed: 1, spawns: 1, legend: 'Enemy HP, damage, speed, spawn rate: baseline'},
  veteran: {hp: 1.3, damage: 1.14, speed: 1.04, spawns: 1.16, legend: 'HP +30% · damage +14% · speed +4% · regular spawns +16%'},
  nightmare: {hp: 1.7, damage: 1.30, speed: 1.08, spawns: 1.35, legend: 'HP +70% · damage +30% · speed +8% · regular spawns +35%'},
};

const STAGES = [
  {name: 'Graveyard', boss: 'Grave Warden', seconds: 210, floor: '#102333', line: '#1b4052', accent: '#6bd4d2'},
  {name: 'Bone March', boss: 'Dread Knight', seconds: 225, floor: '#271c2b', line: '#613a43', accent: '#f7b28f'},
  {name: 'Rift Throne', boss: 'Rift Sovereign', seconds: 240, floor: '#211a38', line: '#554079', accent: '#ba90ff'},
  {name: 'Cinder Roost', boss: 'Ash Phoenix', seconds: 255, floor: '#2b1a20', line: '#834332', accent: '#ff9a57'},
  {name: 'Drowned Mire', boss: 'Mire Colossus', seconds: 270, floor: '#142921', line: '#315c46', accent: '#92d474'},
  {name: 'Clockwork Crypt', boss: 'Clockwork Reaper', seconds: 285, floor: '#24231e', line: '#776546', accent: '#eacb80'},
  {name: 'Tempest Deep', boss: 'Storm Leviathan', seconds: 300, floor: '#122536', line: '#286486', accent: '#76dbff'},
  {name: 'Eclipse Spire', boss: 'Eclipse Seraph', seconds: 315, floor: '#201e2b', line: '#796b79', accent: '#ffdc91'},
];
const STAGE_COUNT = STAGES.length;
const stageInfo = n => STAGES[clamp(n - 1, 0, STAGE_COUNT - 1)];
const CHEST_TIER_NAMES = ['', 'COMMON', 'RARE', 'LEGENDARY', 'MYTHIC', 'RELIC', 'ANCIENT', 'CELESTIAL', 'ASCENDANT'];

// Regular enemies. shot: ranged attack fired when the player is within 520px.
const ENEMY_TYPES = {
  ghoul:    {hp: 22, speed: 75, r: 10, damage: 8,  xp: 3, color: '#9fdb72'},
  skeleton: {hp: 58, speed: 42, r: 13, damage: 12, xp: 6, color: '#dac9a2', soulChance: .35, coins: 2},
  sentinel: {hp: 48, speed: 0,  r: 16, damage: 8,  xp: 6, color: '#5cc7de', shot: {count: 1, spread: 0, cd: 2.8}},
  warlock:  {hp: 44, speed: 32, r: 12, damage: 8,  xp: 6, color: '#c78bf0', shot: {count: 3, spread: .25, cd: 3.5}},
  brood:    {hp: 86, speed: 33, r: 18, damage: 8,  xp: 9, color: '#b76977'},
  spitter:  {hp: 36, speed: 52, r: 11, damage: 8,  xp: 6, color: '#76d28c', shot: {count: 1, spread: 0, cd: 2.2}},
};
// Cumulative spawn weights.
const SPAWN_TABLE = [['ghoul', .42], ['skeleton', .62], ['sentinel', .75], ['warlock', .85], ['spitter', .93], ['brood', 1]];
const MINI_BOSSES = [
  {name: 'Ember Brute', speed: 44, color: '#f58d68'},
  {name: 'Grave Caller', speed: 31, color: '#95ccaf'},
  {name: 'Rift Marksman', speed: 36, color: '#91c1ed'},
];

// Spells learned from level ups. Casting math lives in spells.js.
// path: the Path a spell leans toward; level 5 and 12 offer a crossover to the Path
// (and its Ultimate) your other spells point at most.
const SPELLS = {
  bolt:      {name: 'Arcane Bolt', icon: 'bolt', desc: 'Stronger, faster homing bolts.', book: 'Starting homing projectile. Rank up for stronger, faster bolts.'},
  orb:       {name: 'Orbiting Magic Orb', icon: 'orb', path: 'frost', desc: 'Add an orb that shreds touching enemies.', book: 'Circles farther around you and hits touching foes.'},
  fire:      {name: 'Fireball', icon: 'fire', path: 'demon', desc: 'A stronger fireball with a shorter cooldown.', book: 'Explosive splash damage.'},
  lightning: {name: 'Chain Lightning', icon: 'lightning', path: 'storm', desc: 'Stronger lightning across three targets.', book: 'Arcs across three enemies.'},
  ice:       {name: 'Frost Shards', icon: 'ice', path: 'frost', desc: 'Faster frost bolts that slow enemies.', book: 'Homing slow bolts.'},
  venom:     {name: 'Venom Bloom', icon: 'venom', path: 'void', desc: 'Stronger poison explosion and damage over time.', book: 'Poison area explosion.'},
  nova:      {name: 'Thunder Nova', icon: 'nova', path: 'storm', desc: 'Wider, stronger shock ring.', book: 'Close range shock ring.'},
  blades:    {name: 'Spirit Blades', icon: 'blades', path: 'void', desc: 'Stronger volley of three seeking blades.', book: 'Three seeking missiles.'},
  starfall:  {name: 'Starfall', icon: 'starfall', path: 'demon', desc: 'More and stronger targeted falling stars.', book: 'Targeted falling stars.'},
};
const SPELL_MAX_RANK = 5;

const PATHS = {
  demon: {ultimate: 'armageddon', name: 'Path of Demon', icon: 'fire', book: 'Attack +50%; max HP −20%.',
    apply: p => { p.maxHp *= .8; p.hp = Math.min(p.hp, p.maxHp); p.atk *= 1.5; }},
  storm: {ultimate: 'solar', name: 'Path of Storm', icon: 'lightning', book: 'Spells cast 20% faster.',
    apply: p => { p.castCooldown *= .8; }},
  frost: {ultimate: 'aura', name: 'Path of Frost', icon: 'ice', book: 'Slow enemies and deal +20% damage on repeat hits.',
    apply: () => {}},
  void:  {ultimate: 'void', name: 'Path of Void', icon: 'void', book: 'Attack +20%; gain shield equal to 25% max HP.',
    apply: p => { p.atk *= 1.2; p.shield += p.maxHp * .25; p.shieldBonusCap += p.maxHp * .25; }},
};

// firstCooldown: delay before the first cast after awakening.
const ULTIMATES = {
  armageddon: {name: 'Armageddon', icon: 'starfall', art: 'armageddon', firstCooldown: 4, book: 'Seven heavy meteors every 15 seconds.', desc: 'Seven heavy meteors rain across the arena every 15 seconds.'},
  solar:      {name: 'Solar Lance', icon: 'solar', art: 'solar', firstCooldown: 2, book: 'Piercing beam every 6 seconds.', desc: 'Piercing beam cuts through the horde every 6 seconds.'},
  aura:       {name: 'Berserker Aura', icon: 'nova', art: 'aura', firstCooldown: .5, book: 'Rapid pulse around the mage.', desc: 'Rapid high damage pulses strike nearby foes.'},
  void:       {name: 'Void Scythes', icon: 'void', art: 'void', firstCooldown: 1, book: 'Twin sweeping blades every 3 seconds.', desc: 'Twin arc blades sweep a large radius every 3 seconds.'},
};

const ORIGINS = {
  ember: {name: 'Ember', spell: 'fire', title: 'Ember Fireball', path: 'demon', ultimate: 'armageddon',
    description: 'Rank 2 Fireball. Explosive burst → +50% attack at the cost of 20% max HP → meteor rain.',
    book: 'Explosive fireball at rank 2 → Path of Demon → Armageddon. High burst, lower max HP.'},
  storm: {name: 'Storm', spell: 'lightning', title: 'Storm Lightning', path: 'storm', ultimate: 'solar',
    description: 'Rank 2 Chain Lightning. Multi-target arcs → 20% faster casts → piercing beam.',
    book: 'Three target lightning at rank 2 → Path of Storm → Solar Lance. Fast casts and piercing damage.'},
  frost: {name: 'Frost', spell: 'orb', title: 'Frost Orb', path: 'frost', ultimate: 'aura',
    description: 'Rank 2 Orbiting Orb. Close-range hits → slow and repeat-hit damage → rapid aura pulses.',
    book: 'Orbiting orb at rank 2 → Path of Frost → Berserker Aura. Close range control and pulses.'},
  void:  {name: 'Void', spell: 'blades', title: 'Void Blades', path: 'void', ultimate: 'void',
    description: 'Rank 2 Spirit Blades. Seeking missiles → attack and shield → sweeping scythes.',
    book: 'Three seeking blades at rank 2 → Path of Void → Void Scythes. Sweeping damage and shield.'},
};

// Bargains: one appears at each spell level up until all are taken. Each grants a strong
// bonus at a real cost; the effects outside apply() live in game.js and spells.js.
const BARGAINS = {
  bloodPact:     {name: 'Blood Pact', icon: 'leech', gain: '+40% damage', cost: 'Every spell cast drains 0.3% of your current HP',
    apply: p => { p.atk *= 1.4; }},
  glassWick:     {name: 'Glass Wick', icon: 'ice', gain: 'Spells cast 35% faster', cost: 'You can never hold a shield again',
    apply: p => { p.castCooldown *= .74; p.shield = 0; }},
  volatile:      {name: 'Volatile Core', icon: 'fire', gain: 'Slain foes explode for half their max HP', cost: 'The blasts hurt you too',
    apply: () => {}},
  cursedHoard:   {name: 'Cursed Hoard', icon: 'coin', gain: 'Gem and gold drops ×2', cost: 'Enemies that appear from now on have +30% HP',
    apply: (p, g) => { g.yields.gems *= 2; g.yields.coins *= 2; }},
  berserker:     {name: "Berserker's Oath", icon: 'attack', gain: 'Up to +80% damage as your HP falls', cost: 'Max HP −30%',
    apply: p => { p.maxHp *= .7; p.hp = Math.min(p.hp, p.maxHp); }},
  hunted:        {name: 'Hunted', icon: 'soul', gain: '+50% XP', cost: 'Enemies spawn 30% faster',
    apply: () => {}},
  closeQuarters: {name: 'Close Quarters', icon: 'blades', gain: '+60% damage to foes within 160px', cost: '−40% damage to foes farther away',
    apply: () => {}},
  overcharge:    {name: 'Overcharge', icon: 'solar', gain: 'Ultimate cooldowns −40%', cost: 'Every other spell casts 15% slower',
    apply: p => { p.castCooldown *= 1.15; p.ultimateHaste *= .52; }}, // .52 × 1.15 ≈ .6 on the ultimate
};
const CLOSE_QUARTERS_RANGE = 160;

const PASSIVES = {
  leech:       {name: 'Crimson Siphon', desc: 'Heal 0.8% of damage dealt per rank (capped each second).', book: 'Heal for a portion of damage dealt, capped each second.'},
  heartGrowth: {name: 'Living Heart', desc: 'Max HP +6% per rank each minute; heal the gained HP.', book: 'Max HP +6% per rank each minute; heal the gain.'},
  emberGrowth: {name: 'Ember Ascension', desc: 'Attack +4% per rank each minute, compounding.', book: 'Attack +4% per rank each minute.'},
  aegisGrowth: {name: 'Growing Aegis', desc: 'Each minute, gain shield and capacity equal to 8% max HP per rank; +0.1% max HP/sec regeneration per rank.', book: 'Shield and capacity +8% max HP per rank each minute; regen +0.1% max HP/sec.'},
};

// Boss chest artifacts per stage tier. fx: {healHp(f), ward(f, regen), p}
const ARTIFACTS = {
  1: [['Warden Heart', 'heart', 'Max HP +20%; heal the added HP.', fx => fx.healHp(.2)],
      ['Ember Fang', 'attack', 'Attack +25%.', fx => { fx.p.atk *= 1.25; }],
      ['Guardstone', 'shield', 'Shield and capacity +30% max HP; regeneration +0.2% max HP/sec.', fx => fx.ward(.3, .002)]],
  2: [['Bone Furnace', 'heart', 'Max HP +25%; each hit gains 2% max HP damage.', fx => { fx.healHp(.25); fx.p.hpDamage += .02; }],
      ['Storm Core', 'lightning', 'Attack +30%; cast 10% faster.', fx => { fx.p.atk *= 1.3; fx.p.castCooldown *= .9; }],
      ['Knight Plate', 'shield', 'Max HP +20%; shield and capacity +35% max HP.', fx => { fx.healHp(.2); fx.ward(.35); }]],
  3: [['Rift Heart', 'heart', 'Max HP +40%; each hit gains 4% max HP damage.', fx => { fx.healHp(.4); fx.p.hpDamage += .04; }],
      ['Cataclysm Crown', 'starfall', 'Ultimate damage +75%; attack +20%.', fx => { fx.p.ultimatePower *= 1.75; fx.p.atk *= 1.2; }],
      ['Sovereign Relic', 'shield', 'Attack +35%; shield and capacity +45% max HP.', fx => { fx.p.atk *= 1.35; fx.ward(.45); }]],
  4: [['Phoenix Blood', 'leech', 'Lifesteal +2 ranks; heal 25% max HP.', fx => { fx.passive('leech', 2); fx.p.hp = Math.min(fx.p.maxHp, fx.p.hp + fx.p.maxHp * .25); }],
      ['Cinder Pinion', 'emberGrowth', 'Attack +35%; Ember Ascension +1 rank.', fx => { fx.p.atk *= 1.35; fx.passive('emberGrowth', 1); }],
      ['Ashen Mantle', 'shield', 'Shield and capacity +50% max HP; regeneration +0.25% max HP/sec.', fx => fx.ward(.5, .0025)]],
  5: [['Mireheart Seed', 'heartGrowth', 'Max HP +30%; Living Heart +1 rank.', fx => { fx.healHp(.3); fx.passive('heartGrowth', 1); }],
      ['Bog Venom', 'venom', 'Poison Bloom +2 ranks; attack +25%.', fx => { fx.p.skills.venom = Math.min(SPELL_MAX_RANK, fx.p.skills.venom + 2); fx.p.atk *= 1.25; }],
      ['Colossus Bark', 'aegisGrowth', 'Shield and capacity +55% max HP; Growing Aegis +1 rank.', fx => { fx.ward(.55); fx.passive('aegisGrowth', 1); }]],
  6: [['Reaper Gear', 'solar', 'Cast 20% faster; attack +25%.', fx => { fx.p.castCooldown *= .8; fx.p.atk *= 1.25; }],
      ['Pendulum Fang', 'leech', 'Lifesteal +2 ranks; max HP +20%.', fx => { fx.passive('leech', 2); fx.healHp(.2); }],
      ['Bronze Bulwark', 'shield', 'Shield and capacity +60% max HP; regeneration +0.3% max HP/sec.', fx => fx.ward(.6, .003)]],
  7: [['Storm Eye', 'lightning', 'Chain Lightning +2 ranks; attack +35%.', fx => { fx.p.skills.lightning = Math.min(SPELL_MAX_RANK, fx.p.skills.lightning + 2); fx.p.atk *= 1.35; }],
      ['Leviathan Scale', 'aegisGrowth', 'Shield and capacity +70% max HP; Growing Aegis +2 ranks.', fx => { fx.ward(.7); fx.passive('aegisGrowth', 2); }],
      ['Tidal Current', 'ice', 'Move 25% faster; cast 15% faster.', fx => { fx.p.speed *= 1.25; fx.p.castCooldown *= .85; }]],
  8: [['Eclipse Crown', 'starfall', 'Ultimate damage +65%; attack +25%.', fx => { fx.p.ultimatePower *= 1.65; fx.p.atk *= 1.25; }],
      ['Dawnheart', 'heartGrowth', 'Max HP +50%; Living Heart +2 ranks.', fx => { fx.healHp(.5); fx.passive('heartGrowth', 2); }],
      ['Seraph Ward', 'aegisGrowth', 'Shield and capacity +85% max HP; regeneration +0.4% max HP/sec.', fx => fx.ward(.85, .004)]],
};

// In-run market. Costs grow by `growth` per purchase; `max` caps investments.
const MARKET = {
  attack:    {currency: 'gems',  base: 6,  growth: 1.8, label: 'ATK +12%', note: 'Stackable for this run'},
  haste:     {currency: 'gems',  base: 12, growth: 1.8, label: 'Spells 8% faster', note: 'Reduces all cast cooldowns'},
  coinYield: {currency: 'gems',  base: 5,  growth: 1.9, max: 4, yieldOf: 'coins'},
  hp:        {currency: 'coins', base: 12, growth: 1.8, label: 'Max HP +12%', note: 'Heal the added HP'},
  shield:    {currency: 'coins', base: 14, growth: 1.8, label: 'Shield +25% max HP', note: 'Plus 0.1% max HP/sec regen'},
  speed:     {currency: 'coins', base: 10, growth: 1.8, label: 'Speed +10%', note: 'Move faster, stackable'},
  gemYield:  {currency: 'coins', base: 12, growth: 1.9, max: 4, yieldOf: 'gems'},
};
const YIELD_STEP = 1.35;

// Permanent soul upgrades bought from the menu.
const META_UPGRADES = {atk: {per: .10}, hp: {per: .20}};
const metaCost = rank => Math.ceil(30 * Math.pow(1.55, rank));

const DROP_COLORS = {xp: '#71efff', soul: '#c478ff', gems: '#63e4c9', coins: '#ffd374'};

// Spellbook content, rendered into the book overlay at startup.
const SPELLBOOK = [
  {title: 'FIRST SPELLS · FOUR PLAYSTYLES', cards: Object.values(ORIGINS).map(o => ({icon: SPELLS[o.spell].icon, name: `${o.name} · ${SPELLS[o.spell].name}`, text: o.book}))},
  {title: 'ALL BASIC SPELLS · RANK 1–5', cards: [
    ...Object.values(SPELLS).map(s => ({icon: s.icon, name: s.name, text: s.book})),
    {icon: 'bolt', name: 'Arcane Echo', text: 'Extra damage on the homing bolt when the spell pool is exhausted.'}]},
  {title: 'PATHS · LEVEL 5 · YOUR SIGNATURE OR A CROSSOVER', cards: Object.entries(ORIGINS).map(([, o]) => ({icon: PATHS[o.path].icon, name: PATHS[o.path].name, text: `${PATHS[o.path].book} ${o.name} signature.`}))},
  {title: 'ULTIMATES · LEVEL 12 · YOUR SIGNATURE OR YOUR PATH’S', cards: Object.entries(ORIGINS).map(([, o]) => ({icon: ULTIMATES[o.ultimate].art, name: ULTIMATES[o.ultimate].name, text: `${ULTIMATES[o.ultimate].book} ${o.name} signature.`}))},
  {title: 'BARGAINS · POWER AT A PRICE', cards: Object.values(BARGAINS).map(b => ({icon: b.icon, name: b.name, text: `${b.gain}. Cost: ${b.cost.charAt(0).toLowerCase()}${b.cost.slice(1)}.`}))},
  {title: 'PASSIVE GROWTH · RANK 1–5', cards: Object.entries(PASSIVES).map(([key, s]) => ({icon: key, name: s.name, text: s.book}))},
];
