'use strict';
// Game data. Balance numbers live here so tuning never means hunting through logic.

const ARENA_X = 1040, ARENA_Y = 790;   // movement limits for every entity center
const FLOOR_MARGIN = 16;                 // drawn floor extends this far past the limits (body width)
const MAX_ENEMIES = 180;
const KNOCKBACK = 120, KNOCK_COOLDOWN = .45; // px/s shove for 0.09s on an 11px foe; at most once per cooldown,
                                             // so a hail of hits jolts foes without pinning them in place
const COMBO_WINDOW = 2.5, COMBO_MIN = 15; // seconds between kills; smallest combo that pays
const ENEMY_DAMAGE_SCALE = 1.4; // from stage 3 on; stages 1-2 stay gentle for new players
const ENEMY_SPEED_CAP = 150;   // px/s for regular foes before Heat; the mage runs at 178
const MAX_GEMS = 260;          // extra XP merges into existing gems beyond this
const SIM_STEP = 1 / 60;       // fixed simulation timestep (seconds)
const SAVE_VERSION = 2;
const DASH = {time: .17, speed: 720, cooldown: 2.6}; // seconds, px/s, seconds

// Heat: optional difficulty, 0-10. Each level adds its rule on top of all lower levels,
// and every level adds 10% souls. Clearing a stage at your highest unlocked Heat
// unlocks the next one.
const HEAT_LEVELS = [
  null,
  {name: 'Swarm', rule: 'Regular enemies spawn 15% faster.', mod: h => { h.spawns *= 1.15; }},
  {name: 'Hardened', rule: 'Enemies have 20% more HP.', mod: h => { h.hp *= 1.2; }},
  {name: 'Sharp Fangs', rule: 'Enemies deal 15% more damage.', mod: h => { h.damage *= 1.15; }},
  {name: 'Elite Blood', rule: 'Mini bosses have 50% more HP and arrive 20% sooner.', mod: h => { h.miniHp *= 1.5; h.miniCD *= .8; }},
  {name: 'Hasted', rule: 'Enemies move 8% faster.', mod: h => { h.speed *= 1.08; }},
  {name: 'Volleys', rule: 'Ranged enemies fire 25% more often.', mod: h => { h.shotCD *= .75; }},
  {name: 'Tyrants', rule: 'Bosses have 30% more HP and enrage at 60% HP.', mod: h => { h.bossHp *= 1.3; h.phase2At = .6; }},
  {name: 'Embers Fade', rule: 'Your shield regenerates 40% slower.', mod: h => { h.shieldRegen *= .6; }},
  {name: 'Scorched Earth', rule: 'Hazard attacks add one more zone; bosses attack 15% more often.', mod: h => { h.hazards += 1; h.bossCD *= .85; }},
  {name: 'Last Light', rule: 'Healing is halved; enemies deal another 15% damage.', mod: h => { h.heal *= .5; h.damage *= 1.15; }},
];
const MAX_HEAT = HEAT_LEVELS.length - 1;
const heatCache = [];
function heatDef(level) {
  if (!heatCache[level]) {
    const h = {hp: 1, damage: 1, speed: 1, spawns: 1, miniHp: 1, miniCD: 1, shotCD: 1, bossHp: 1, phase2At: .5,
      shieldRegen: 1, heal: 1, hazards: 0, bossCD: 1, souls: 1 + .1 * level};
    for (let i = 1; i <= level; i++) HEAT_LEVELS[i].mod(h);
    heatCache[level] = h;
  }
  return heatCache[level];
}
// Saves and settings from before Heat used named difficulties.
const LEGACY_HEAT = {standard: 0, veteran: 3, nightmare: 6};


// ---------- Bosses ----------
// A boss cycles through its moves. Each move winds up (telegraphed), then resolves:
//   slam    damage around the boss; may also summon adds and fire shots
//   charge  dash along a line locked at the start of the windup
//   zones   hazard circles around the player that erupt after a delay, optionally lingering
//   ring    bursts of shots in every direction; fan: an aimed spread
//   summon  adds around the boss; blink: vanish and reappear beside the player, then slam
// phase2 applies below half HP: faster cycle, faster boss and an extra move.

// Act I bosses keep their original single combined attack, which grows with the tier.
const legacySlam = t => ({
  type: 'slam', windup: .85, radius: 65 + Math.min(t, 5) * 20, damage: 12 + t * 7,
  summon: t >= 2 ? {type: t === 5 ? 'brood' : 'skeleton', count: Math.min(5, 1 + Math.floor(t / 2))} : null,
  shots: t >= 4 ? {kind: t === 5 ? 'spitter' : t === 7 ? 'sentinel' : 'warlock', count: t >= 7 ? 8 : t === 6 ? 5 : 3, ring: t >= 7, spread: .24} : null,
});
const legacyBoss = t => ({moves: [legacySlam(t)], cooldown: 6 - t * .5, phase2: t >= 3 ? {cooldown: 3, speed: 1.3} : null});

// ---------- Stages ----------
// roster: spawn weights for regular enemies. minis: MINI_BOSSES indices, cycled.
// motif: floor decoration drawn in render.js.
const ACT_I_ROSTER = {ghoul: 42, skeleton: 20, sentinel: 13, warlock: 10, spitter: 8, brood: 7};
const STAGES = [
  {act: 1, name: 'Graveyard', boss: 'Grave Warden', seconds: 210, floor: '#102333', line: '#1b4052', accent: '#6bd4d2', motif: 'none',
    roster: ACT_I_ROSTER, minis: [0, 1, 2], ...legacyBoss(1)},
  {act: 1, name: 'Bone March', boss: 'Dread Knight', seconds: 225, floor: '#271c2b', line: '#613a43', accent: '#f7b28f', motif: 'slash',
    roster: ACT_I_ROSTER, minis: [0, 1, 2], ...legacyBoss(2)},
  {act: 1, name: 'Rift Throne', boss: 'Rift Sovereign', seconds: 240, floor: '#211a38', line: '#554079', accent: '#ba90ff', motif: 'triangle',
    roster: ACT_I_ROSTER, minis: [0, 1, 2], ...legacyBoss(3)},
  {act: 1, name: 'Cinder Roost', boss: 'Ash Phoenix', seconds: 255, floor: '#2b1a20', line: '#834332', accent: '#ff9a57', motif: 'spikes',
    roster: {...ACT_I_ROSTER, charger: 6}, minis: [0, 1, 2], ...legacyBoss(4)},
  {act: 1, name: 'Drowned Mire', boss: 'Mire Colossus', seconds: 270, floor: '#142921', line: '#315c46', accent: '#92d474', motif: 'ellipse',
    roster: {...ACT_I_ROSTER, charger: 6}, minis: [0, 1, 2], ...legacyBoss(5)},
  {act: 1, name: 'Clockwork Crypt', boss: 'Clockwork Reaper', seconds: 285, floor: '#24231e', line: '#776546', accent: '#eacb80', motif: 'gear',
    roster: {...ACT_I_ROSTER, charger: 6, bomber: 5}, minis: [0, 1, 2], ...legacyBoss(6)},
  {act: 1, name: 'Tempest Deep', boss: 'Storm Leviathan', seconds: 300, floor: '#122536', line: '#286486', accent: '#76dbff', motif: 'waves',
    roster: {...ACT_I_ROSTER, charger: 6, bomber: 5, splitter: 6}, minis: [0, 1, 2], ...legacyBoss(7)},
  {act: 1, name: 'Eclipse Spire', boss: 'Eclipse Seraph', seconds: 315, floor: '#201e2b', line: '#796b79', accent: '#ffdc91', motif: 'star',
    roster: {...ACT_I_ROSTER, charger: 6, bomber: 5, splitter: 6}, minis: [0, 1, 2], ...legacyBoss(8)},

  // Act II: Beyond the Rift. Every boss has its own move set and a second phase.
  {act: 2, name: 'Frostbound Hollow', boss: 'Rime Matriarch', seconds: 300, floor: '#13263a', line: '#3d6f94', accent: '#bfe9ff', motif: 'snow',
    roster: {ghoul: 30, skeleton: 18, sentinel: 12, splitter: 14, charger: 12, warlock: 8, bomber: 6}, minis: [3, 0, 1],
    cooldown: 4.2, moves: [
      {type: 'zones', windup: .5, count: 3, radius: 70, delay: 1.2, damage: 30, spread: 120, linger: 4, slow: true, color: '#9fdcff'},
      {type: 'ring', windup: .6, kind: 'sentinel', count: 12, waves: 2},
    ], phase2: {cooldown: 2.8, speed: 1.25, extra: {type: 'zones', windup: .4, count: 5, radius: 60, delay: 1, damage: 30, spread: 200, linger: 4, slow: true, color: '#9fdcff'}}},
  {act: 2, name: 'Sunken Bazaar', boss: 'Gilded Mimic', seconds: 300, floor: '#2a2214', line: '#7a5f2c', accent: '#ffd56b', motif: 'coin',
    roster: {ghoul: 26, skeleton: 22, bomber: 16, charger: 14, spitter: 10, warlock: 6, brood: 6}, minis: [4, 2, 0],
    cooldown: 4, moves: [
      {type: 'charge', windup: .75, speed: 560, distance: 560, damage: 40},
      {type: 'summon', windup: .6, add: 'bomber', count: 4},
      {type: 'fan', windup: .5, kind: 'spitter', count: 7, spread: .2},
    ], phase2: {cooldown: 2.6, speed: 1.2, extra: {type: 'charge', windup: .55, speed: 640, distance: 640, damage: 45}}},
  {act: 2, name: 'Thornwood Maze', boss: 'Briar Hag', seconds: 315, floor: '#15241a', line: '#3b5a32', accent: '#9be07a', motif: 'thorn',
    roster: {ghoul: 26, brood: 14, spitter: 16, splitter: 16, warlock: 10, sentinel: 10, charger: 8}, minis: [4, 1, 3],
    cooldown: 4.2, moves: [
      {type: 'zones', windup: .5, count: 4, radius: 65, delay: 1.1, damage: 32, spread: 160, linger: 5, dps: 18, color: '#7fd65a'},
      {type: 'summon', windup: .6, add: 'splitter', count: 3},
      {type: 'ring', windup: .6, kind: 'spitter', count: 10, waves: 1},
    ], phase2: {cooldown: 2.8, speed: 1.2, extra: {type: 'zones', windup: .4, count: 6, radius: 60, delay: 1, damage: 32, spread: 240, linger: 5, dps: 18, color: '#7fd65a'}}},
  {act: 2, name: 'Ashen Foundry', boss: 'Forgemaster', seconds: 315, floor: '#221a17', line: '#6b3d2a', accent: '#ff8a3d', motif: 'hex',
    roster: {skeleton: 26, charger: 18, bomber: 16, sentinel: 12, ghoul: 16, brood: 6, warlock: 6}, minis: [0, 4, 2],
    cooldown: 4.4, moves: [
      {type: 'slam', windup: 1, radius: 170, damage: 55, shots: {kind: 'warlock', count: 10, ring: true}},
      {type: 'charge', windup: .8, speed: 480, distance: 480, damage: 50},
      {type: 'zones', windup: .5, count: 3, radius: 80, delay: 1.3, damage: 45, spread: 140, color: '#ff8a3d'},
    ], phase2: {cooldown: 3, speed: 1.2, extra: {type: 'ring', windup: .5, kind: 'warlock', count: 16, waves: 3}}},
  {act: 2, name: 'Moonlit Necropolis', boss: 'Lich Regent', seconds: 330, floor: '#1a1729', line: '#4b4370', accent: '#c9a6ff', motif: 'cross',
    roster: {skeleton: 30, ghoul: 22, warlock: 14, splitter: 12, sentinel: 10, bomber: 6, brood: 6}, minis: [5, 1, 3],
    cooldown: 3.8, moves: [
      {type: 'blink', windup: .7, radius: 130, damage: 45},
      {type: 'summon', windup: .6, add: 'skeleton', count: 5},
      {type: 'ring', windup: .6, kind: 'warlock', count: 14, waves: 2},
    ], phase2: {cooldown: 2.5, speed: 1.25, extra: {type: 'zones', windup: .4, count: 5, radius: 70, delay: 1.1, damage: 40, spread: 200, color: '#c9a6ff'}}},
  {act: 2, name: 'Crystal Caverns', boss: 'Prism Wyrm', seconds: 330, floor: '#1b1730', line: '#5b3f7a', accent: '#ff9bf0', motif: 'diamond',
    roster: {spitter: 20, sentinel: 16, splitter: 16, charger: 14, ghoul: 18, warlock: 10, bomber: 6}, minis: [2, 5, 4],
    cooldown: 3.8, moves: [
      {type: 'ring', windup: .6, kind: 'sentinel', count: 18, waves: 3},
      {type: 'charge', windup: .7, speed: 600, distance: 600, damage: 50},
      {type: 'fan', windup: .4, kind: 'sentinel', count: 9, spread: .16},
    ], phase2: {cooldown: 2.4, speed: 1.3, extra: {type: 'zones', windup: .4, count: 4, radius: 75, delay: 1, damage: 45, spread: 180, color: '#ff9bf0'}}},
  {act: 2, name: 'Abyssal Gate', boss: 'Hollow King', seconds: 345, floor: '#100f1c', line: '#3a2f5c', accent: '#8f7bff', motif: 'eye',
    roster: {skeleton: 24, charger: 18, warlock: 14, splitter: 14, bomber: 10, sentinel: 10, brood: 10}, minis: [3, 4, 5],
    cooldown: 3.6, moves: [
      {type: 'blink', windup: .6, radius: 150, damage: 55},
      {type: 'charge', windup: .65, speed: 640, distance: 640, damage: 55},
      {type: 'slam', windup: .9, radius: 190, damage: 60, summon: {type: 'charger', count: 3}},
    ], phase2: {cooldown: 2.3, speed: 1.3, extra: {type: 'ring', windup: .5, kind: 'warlock', count: 20, waves: 3}}},
  {act: 2, name: 'The Last Pyre', boss: 'The Ash Tyrant', seconds: 360, floor: '#1f1110', line: '#7a2b1c', accent: '#ff5a2e', motif: 'flame',
    roster: {ghoul: 18, skeleton: 18, charger: 16, bomber: 14, splitter: 12, warlock: 10, sentinel: 8, spitter: 8, brood: 6}, minis: [0, 5, 3, 4],
    cooldown: 3.4, moves: [
      {type: 'zones', windup: .5, count: 5, radius: 80, delay: 1.1, damage: 55, spread: 220, linger: 4, dps: 25, color: '#ff5a2e'},
      {type: 'slam', windup: .9, radius: 200, damage: 70, shots: {kind: 'warlock', count: 16, ring: true}},
      {type: 'charge', windup: .6, speed: 660, distance: 660, damage: 60},
      {type: 'summon', windup: .5, add: 'bomber', count: 5},
    ], phase2: {cooldown: 2.1, speed: 1.3, extra: {type: 'ring', windup: .45, kind: 'warlock', count: 24, waves: 3}}},

  // Act III: The Ember Throne. The source of the dark; new foes (priest, ironclad, wisp).
  {act: 3, name: 'Ember Wastes', boss: 'The Cinder Knight', seconds: 360, floor: '#22140f', line: '#6e3420', accent: '#ff7a3a', motif: 'spikes',
    roster: {ghoul: 20, skeleton: 18, ironclad: 14, charger: 14, bomber: 10, priest: 8, warlock: 8, wisp: 8}, minis: [0, 4, 2],
    cooldown: 3.4, moves: [
      {type: 'charge', windup: .6, speed: 700, distance: 700, damage: 60},
      {type: 'slam', windup: .85, radius: 190, damage: 65, shots: {kind: 'warlock', count: 12, ring: true}},
      {type: 'zones', windup: .5, count: 4, radius: 75, delay: 1, damage: 55, spread: 200, linger: 4, dps: 22, color: '#ff7a3a'},
    ], phase2: {cooldown: 2.2, speed: 1.3, extra: {type: 'charge', windup: .45, speed: 760, distance: 760, damage: 60}}},
  {act: 3, name: 'Hall of Mirrors', boss: 'The Mirror Queen', seconds: 360, floor: '#1c1a26', line: '#5a5470', accent: '#e6dcff', motif: 'diamond',
    roster: {wisp: 18, sentinel: 16, warlock: 14, priest: 10, splitter: 12, ghoul: 16, ironclad: 8}, minis: [2, 5, 3],
    cooldown: 3.2, moves: [
      {type: 'blink', windup: .6, radius: 150, damage: 60},
      {type: 'fan', windup: .4, kind: 'sentinel', count: 11, spread: .14},
      {type: 'ring', windup: .5, kind: 'warlock', count: 20, waves: 3},
    ], phase2: {cooldown: 2.1, speed: 1.3, extra: {type: 'summon', windup: .5, add: 'wisp', count: 6}}},
  {act: 3, name: 'Starless Sea', boss: 'The Drowned God', seconds: 375, floor: '#0c1a20', line: '#1f4a55', accent: '#7fe3ff', motif: 'waves',
    roster: {spitter: 16, splitter: 14, ghoul: 18, brood: 10, priest: 10, ironclad: 12, wisp: 10, sentinel: 10}, minis: [3, 1, 4],
    cooldown: 3.3, moves: [
      {type: 'zones', windup: .5, count: 6, radius: 70, delay: 1.2, damage: 60, spread: 260, linger: 3, slow: true, color: '#7fe3ff'},
      {type: 'ring', windup: .6, kind: 'spitter', count: 18, waves: 2},
      {type: 'summon', windup: .5, add: ['brood', 'splitter'], count: 4},
    ], phase2: {cooldown: 2.2, speed: 1.25, extra: {type: 'slam', windup: .8, radius: 220, damage: 70, summon: {type: 'priest', count: 2}}}},
  {act: 3, name: 'The Ember Throne', boss: 'The Hollow Flame', seconds: 390, floor: '#140c14', line: '#4a2238', accent: '#ff9a4c', motif: 'flame',
    roster: {ghoul: 14, skeleton: 14, ironclad: 12, priest: 10, wisp: 12, charger: 12, bomber: 10, warlock: 10, splitter: 8}, minis: [0, 5, 2, 3],
    cooldown: 3, moves: [
      {type: 'blink', windup: .55, radius: 170, damage: 70},
      {type: 'zones', windup: .45, count: 6, radius: 80, delay: 1, damage: 65, spread: 240, linger: 4, dps: 28, color: '#ff9a4c'},
      {type: 'slam', windup: .85, radius: 210, damage: 75, shots: {kind: 'warlock', count: 20, ring: true}},
      {type: 'charge', windup: .5, speed: 760, distance: 760, damage: 70},
    ], phase2: {cooldown: 1.9, speed: 1.35, extra: {type: 'ring', windup: .4, kind: 'warlock', count: 28, waves: 3}}},
];
const STAGE_COUNT = STAGES.length;

// Routes: after a stage, choose how to reach the next one. The Road is always offered,
// plus two others picked per stage.
const ROUTES = {
  road:     {name: 'The Road', icon: 'bolt', desc: 'The next stage as it is.'},
  elite:    {name: 'Elite Road', icon: 'heat', desc: 'Foes have +30% HP and damage. Souls +50%, and the boss chest grants one extra artifact.'},
  merchant: {name: "Merchant's Road", icon: 'coin', desc: 'Market prices −35% for the stage, and you set out with 30 gems and 30 gold.'},
  shrine:   {name: 'Shrine Road', icon: 'aegisGrowth', desc: 'Heal to full now. Both stage events are cursed shrines, and their boons are doubled.'},
  swarm:    {name: 'Swarm Road', icon: 'hunted', desc: 'Foes arrive 40% faster. XP +40%.'},
};
// Boss arrival lines, by boss art index.
const BOSS_LINES = ['WAKES BENEATH THE GRAVES', 'MARCHES WITH THE BONE LEGION', 'TEARS THROUGH THE RIFT', 'RISES FROM THE ASHES',
  'HEAVES OUT OF THE MIRE', 'WINDS ITS DREADFUL CLOCK', 'SURGES FROM THE DEEP', 'DARKENS THE SKY',
  'FREEZES THE HOLLOW', 'HUNGERS FOR GOLD', 'CREEPS FROM THE THORNS', 'STOKES THE FORGE',
  'COMMANDS THE DEAD', 'SHATTERS INTO LIGHT', 'EMPTIES THE STARS', 'BURNS ALL THAT REMAINS',
  'RIDES OUT OF THE ASH', 'STEPS FROM EVERY MIRROR', 'RISES FROM THE STARLESS SEA', 'WAITS UPON THE EMBER THRONE'];
const ACT_NAMES = {1: 'Act I · The Rift', 2: 'Act II · Beyond the Rift', 3: 'Act III · The Ember Throne', 4: 'Endless · The Pyre Beyond'};
// art: boss portrait index. artifactTier: which ARTIFACTS pool its chest uses.
STAGES.forEach((s, i) => { s.art = i; s.artifactTier = i + 1; });

// Endless: after the last stage, depth d replays the Act II arenas and bosses in turn,
// with enemy scaling still rising (it is driven by the stage number).
const ENDLESS_SECONDS = 240;
const endlessCache = new Map();
function stageInfo(n) {
  if (n <= STAGE_COUNT) return STAGES[clamp(n - 1, 0, STAGE_COUNT - 1)];
  if (!endlessCache.has(n)) {
    const depth = n - STAGE_COUNT, base = STAGES[8 + (depth - 1) % (STAGE_COUNT - 8)]; // cycles Acts II and III
    endlessCache.set(n, {...base, act: 4, endless: depth, name: `Endless ${depth} · ${base.name}`, seconds: ENDLESS_SECONDS});
  }
  return endlessCache.get(n);
}
const chestName = tier => tier > STAGE_COUNT ? `ENDLESS ${tier - STAGE_COUNT}` : CHEST_TIER_NAMES[tier];
const CHEST_TIER_NAMES = ['', 'COMMON', 'RARE', 'LEGENDARY', 'MYTHIC', 'RELIC', 'ANCIENT', 'CELESTIAL', 'ASCENDANT',
  'GLACIAL', 'GILDED', 'BRAMBLE', 'FORGED', 'SPECTRAL', 'PRISMATIC', 'VOIDBORN', 'PRIMORDIAL', 'CINDER', 'MIRRORED', 'ABYSSAL', 'THRONE'];

// ---------- Enemies ----------
// shot: ranged attack fired when the player is within 520px.
// charge: stops, telegraphs a line, then dashes. fuse: stops beside the player and explodes.
// splitInto: spawns smaller copies on death.
const ENEMY_TYPES = {
  ghoul:     {hp: 22, speed: 75, r: 10, damage: 8,  xp: 3, color: '#9fdb72'},
  skeleton:  {hp: 58, speed: 42, r: 13, damage: 12, xp: 6, color: '#dac9a2', soulChance: .35, coins: 2},
  sentinel:  {hp: 48, speed: 0,  r: 16, damage: 8,  xp: 6, color: '#5cc7de', shot: {count: 1, spread: 0, cd: 2.8}},
  warlock:   {hp: 44, speed: 32, r: 12, damage: 8,  xp: 6, color: '#c78bf0', shot: {count: 3, spread: .25, cd: 3.5}},
  brood:     {hp: 86, speed: 33, r: 18, damage: 8,  xp: 9, color: '#b76977'},
  spitter:   {hp: 36, speed: 52, r: 11, damage: 8,  xp: 6, color: '#76d28c', shot: {count: 1, spread: 0, cd: 2.2}},
  charger:   {hp: 52, speed: 50, r: 13, damage: 14, xp: 7, color: '#ff9a4d', charge: {range: 280, windup: .6, speed: 430, time: .5, cd: 3.2}},
  bomber:    {hp: 30, speed: 72, r: 11, damage: 6,  xp: 5, color: '#f2d14b', fuse: {range: 62, time: .9, radius: 78, damage: 22}},
  splitter:  {hp: 70, speed: 40, r: 16, damage: 10, xp: 6, color: '#c77dff', splitInto: {type: 'splitling', count: 2}},
  splitling: {hp: 18, speed: 88, r: 9,  damage: 6,  xp: 2, color: '#e0b3ff'},
  // Act III foes. heals: restores nearby foes; armor: damage taken ×armor until below half HP; blink: hops toward the mage.
  priest:    {hp: 60, speed: 38, r: 12, damage: 8, xp: 9, color: '#9fe8b0', heals: {radius: 150, pct: .08, cd: 3}},
  ironclad:  {hp: 160, speed: 34, r: 16, damage: 16, xp: 12, color: '#9aa3ad', armor: .35, coins: 3},
  wisp:      {hp: 30, speed: 60, r: 10, damage: 10, xp: 5, color: '#b9a6ff', blink: {cd: 3.2, dist: 150}},
  goblin:    {hp: 140, speed: 125, r: 12, damage: 0, xp: 0, color: '#e6c34a', flee: 14}, // stage event: runs away, escapes after `flee` s
};
// Mini bosses. skill runs every `cd` seconds.
const MINI_BOSSES = [
  {name: 'Ember Brute', speed: 44, color: '#f58d68', cd: 5.2, skill: {type: 'rush'}},
  {name: 'Grave Caller', speed: 31, color: '#95ccaf', cd: 5.2, skill: {type: 'summon', add: ['ghoul', 'skeleton']}},
  {name: 'Rift Marksman', speed: 36, color: '#91c1ed', cd: 3.4, skill: {type: 'fan', kind: 'warlock', count: 5, spread: .18}},
  {name: 'Rime Stalker', speed: 52, color: '#bfe9ff', cd: 4.5, skill: {type: 'zones', count: 2, radius: 60, delay: 1.1, damage: 24, spread: 70, linger: 3, slow: true, color: '#9fdcff'}},
  {name: 'Thorn Knight', speed: 34, color: '#9be07a', cd: 4.2, skill: {type: 'ring', kind: 'spitter', count: 10}},
  {name: 'Lich Acolyte', speed: 30, color: '#c9a6ff', cd: 4.8, skill: {type: 'summon', add: ['skeleton', 'splitter']}},
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
  ward:      {name: 'Mirror Ward', icon: 'ward', path: 'void', desc: 'Raise a ward that destroys enemy shots and fires them back; longer and more often per rank.', book: 'Defensive: shots that touch the ward are reflected at your foes.'},
  whip:      {name: 'Ember Whip', icon: 'whip', path: 'demon', desc: 'A stronger, faster burning lash toward the nearest foe.', book: 'Sweeps a wide burning arc in front of you.'},
  disc:      {name: 'Sun Disc', icon: 'disc', path: 'storm', desc: 'A stronger, faster boomerang that cuts on the way out and back.', book: 'A golden boomerang that hits everything on both passes.'},
  wolves:    {name: 'Spirit Wolves', icon: 'wolves', path: 'frost', desc: 'Another spirit wolf every two ranks; stronger bites.', book: 'Companion wolves that hunt the foes nearest you.'},
  starfall:  {name: 'Starfall', icon: 'starfall', path: 'demon', desc: 'More and stronger targeted falling stars.', book: 'Targeted falling stars.'},
};
const SPELL_MAX_RANK = 5;

// Evolutions: when a spell reaches max rank, the next level up offers its two forms.
// Each changes how the spell behaves; the behaviour lives in spells.js and entities.js.
const EVOLUTIONS = {
  bolt:      {barrage: {name: 'Arcane Barrage', desc: 'Fires a bolt at each of the three nearest foes, each at 60% damage.'},
              lance: {name: 'Arcane Lance', desc: 'Bolts pierce through four foes and deal 40% more damage.'}},
  orb:       {halo: {name: 'Twin Halo', desc: 'Two more orbs circle on a wide outer ring, turning the other way.'},
              gravity: {name: 'Gravity Well', desc: 'Orbs strike 60% more often and slow what they touch.'}},
  fire:      {meteor: {name: 'Meteor Core', desc: 'One huge fireball: 2.6× damage and double blast radius, cast less often.'},
              cinder: {name: 'Cinder Spray', desc: 'Four smaller fireballs at once, each at 45% damage.'}},
  lightning: {chain: {name: 'Storm Chain', desc: 'Lightning arcs through seven foes instead of three, at 70% damage.'},
              thunderhead: {name: 'Thunderhead', desc: 'Each strike also blasts everything around its target.'}},
  ice:       {spike: {name: 'Glacial Spike', desc: 'Shards pierce three foes and freeze them solid for a moment.'},
              blizzard: {name: 'Blizzard', desc: 'Shards shatter on impact into three smaller seeking shards.'}},
  venom:     {plague: {name: 'Plague Cloud', desc: 'The burst leaves a poison cloud that eats at foes for four seconds.'},
              contagion: {name: 'Contagion', desc: 'Poisoned foes that die spread their poison to everything nearby.'}},
  nova:      {tempest: {name: 'Tempest Ring', desc: 'A second ring, 45% wider at 70% damage, follows each nova.'},
              static: {name: 'Static Field', desc: 'Foes hit are shocked: they take 30% more damage from everything for 3s.'}},
  blades:    {storm: {name: 'Blade Storm', desc: 'Six blades per volley instead of three, each at 65% damage.'},
              reaper: {name: 'Reaper’s Edge', desc: 'Blades pierce two more foes and deal 50% more damage.'}},
  ward:      {bulwark: {name: 'Bulwark', desc: 'The ward lasts twice as long, and every shot it blocks restores shield equal to 3% max HP.'},
              retort: {name: 'Retort', desc: 'Reflected shots deal double damage and pierce two foes.'}},
  whip:      {lash: {name: 'Cyclone Lash', desc: 'The whip spins a full circle around you.'},
              brand: {name: 'Searing Brand', desc: 'Foes struck burn for 40% of the hit each second for 3s.'}},
  disc:      {twin: {name: 'Twin Suns', desc: 'Throws two discs in opposite directions.'},
              eclipse: {name: 'Eclipse Disc', desc: 'A disc 60% larger that deals 50% more damage.'}},
  wolves:    {pack: {name: 'Wolf Pack', desc: 'Two more wolves join the pack, each at 75% bite damage.'},
              alpha: {name: 'Alpha', desc: 'One giant wolf with triple bite damage; its bites slow foes and heal you 0.5% max HP.'}},
  starfall:  {shower: {name: 'Meteor Shower', desc: 'Five stars fall per cast, each at 60% damage.'},
              comet: {name: 'Comet', desc: 'One comet with 3.5× damage and a far wider impact.'}},
};
const evolvedAs = (p, spell, form) => p.evolved[spell] === form;

const PATHS = {
  demon: {ultimate: 'armageddon', name: 'Path of Demon', icon: 'fire', book: 'Attack +50%; max HP −20%.',
    apply: p => { p.maxHp *= .8; p.hp = Math.min(p.hp, p.maxHp); p.atk *= 1.5; }},
  storm: {ultimate: 'solar', name: 'Path of Storm', icon: 'lightning', book: 'Spells cast 20% faster.',
    apply: p => { p.castCooldown *= .8; }},
  frost: {ultimate: 'aura', name: 'Path of Frost', icon: 'ice', book: 'Every hit chills (slows) the foe; chilled foes take +25% damage.',
    apply: () => {}},
  void:  {ultimate: 'void', name: 'Path of Void', icon: 'void', book: 'Attack +20%; gain shield equal to 25% max HP.',
    apply: p => { p.atk *= 1.2; p.shield += p.maxHp * .25; p.shieldBonusCap += p.maxHp * .25; }},
};

// firstCooldown: delay before the first cast after awakening.
const ULTIMATES = {
  armageddon: {name: 'Armageddon', icon: 'starfall', art: 'armageddon', firstCooldown: 4, book: 'Seven heavy meteors every 10 seconds, aimed at the nearest foes.', desc: 'Seven heavy meteors rain down every 10 seconds, most of them on the nearest foes.'},
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
    description: 'Rank 2 Orbiting Orb. Close-range hits → every hit chills, +25% vs chilled → rapid aura pulses.',
    book: 'Orbiting orb at rank 2 → Path of Frost → Berserker Aura. Close range control and pulses.'},
  void:  {name: 'Void', spell: 'blades', title: 'Void Blades', path: 'void', ultimate: 'void',
    description: 'Rank 2 Spirit Blades. Seeking missiles → attack and shield → sweeping scythes.',
    book: 'Three seeking blades at rank 2 → Path of Void → Void Scythes. Sweeping damage and shield.'},
  // Characters unlocked in the Den of Magic (perk: the META_PERKS key that unlocks them).
  hexblade: {name: 'Hexblade', spell: 'whip', title: 'Hexblade · Ember Whip', path: 'demon', ultimate: 'void', perk: 'hexblade',
    description: 'Rank 2 Ember Whip. Your dash slices every foe it passes through and recharges 30% faster.',
    book: 'Ember Whip at rank 2. A close-range duellist: the dash is a weapon. Path of Demon → Void Scythes.'},
  warden: {name: 'Warden', spell: 'wolves', title: 'Warden · Spirit Wolves', path: 'void', ultimate: 'aura', perk: 'warden', extra: {ward: 1},
    description: 'Rank 2 Spirit Wolves and Mirror Ward. One extra wolf, wolves bite 50% harder, max HP +20%.',
    book: 'Spirit Wolves at rank 2 plus Mirror Ward. A pack leader who lets the wolves fight. Path of Void → Berserker Aura.'},
  starcaller: {name: 'Starcaller', spell: 'starfall', title: 'Starcaller · Starfall', path: 'storm', ultimate: 'armageddon', perk: 'starcaller',
    description: 'Rank 2 Starfall. Critical chance +15% and critical damage +40%.',
    book: 'Starfall at rank 2. Every hit can be a big one. Path of Storm → Armageddon.'},
};

// Bargains: one appears at each spell level up until all are taken. Each grants a strong
// bonus at a real cost; the effects outside apply() live in game.js and spells.js.
const BARGAINS = {
  bloodPact:     {name: 'Blood Pact', icon: 'pact', gain: '+40% damage', cost: 'Every spell cast drains 0.3% of your current HP',
    apply: p => { p.atk *= 1.4; }},
  glassWick:     {name: 'Glass Wick', icon: 'wick', gain: 'Spells cast 35% faster', cost: 'You can never hold a shield again',
    apply: p => { p.castCooldown *= .74; p.shield = 0; }},
  volatile:      {name: 'Volatile Core', icon: 'volatile', gain: 'Slain foes explode for half their max HP', cost: 'The blasts hurt you too',
    apply: () => {}},
  cursedHoard:   {name: 'Cursed Hoard', icon: 'hoard', gain: 'Gem and gold drops ×2', cost: 'Enemies that appear from now on have +30% HP',
    apply: (p, g) => { g.yields.gems *= 2; g.yields.coins *= 2; }},
  berserker:     {name: "Berserker's Oath", icon: 'oath', gain: 'Up to +80% damage as your HP falls', cost: 'Max HP −30%',
    apply: p => { p.maxHp *= .7; p.hp = Math.min(p.hp, p.maxHp); }},
  hunted:        {name: 'Hunted', icon: 'hunted', gain: '+50% XP', cost: 'Enemies spawn 30% faster',
    apply: () => {}},
  closeQuarters: {name: 'Close Quarters', icon: 'quarters', gain: '+60% damage to foes within 160px', cost: '−40% damage to foes farther away',
    apply: () => {}},
  overcharge:    {name: 'Overcharge', icon: 'overcharge', gain: 'Ultimate cooldowns −40%', cost: 'Every other spell casts 15% slower',
    apply: p => { p.castCooldown *= 1.15; p.ultimateHaste *= .52; }}, // .52 × 1.15 ≈ .6 on the ultimate
};
const CLOSE_QUARTERS_RANGE = 160;

const PASSIVES = {
  leech:       {name: 'Crimson Siphon', desc: 'Heal 0.8% of damage dealt per rank (capped each second).', book: 'Heal for a portion of damage dealt, capped each second.'},
  heartGrowth: {name: 'Living Heart', desc: 'Each minute, max HP grows by 6% of the stage’s base HP per rank; heal the gain.', book: 'Max HP +6% of base per rank each minute; heal the gain.'},
  emberGrowth: {name: 'Ember Ascension', desc: 'Each minute, attack grows by 4% of the stage’s base attack per rank.', book: 'Attack +4% of base per rank each minute.'},
  keen:        {name: 'Keen Eye', desc: 'Critical chance +4% and critical damage +10% per rank (base 5% for 175%).', book: 'Critical hits: +4% chance and +10% damage per rank.'},
  lodestone:   {name: 'Lodestone', desc: 'Pickup range +25% per rank.', book: 'Gems, gold and souls are pulled in from farther away.'},
  fleet:       {name: 'Fleetfoot', desc: 'Move speed +6% per rank.', book: 'Move faster.'},
  aegisGrowth: {name: 'Growing Aegis', desc: 'Each minute, gain shield and capacity equal to 8% of the stage’s base HP per rank; +0.1% max HP/sec regeneration per rank.', book: 'Shield and capacity +8% of base HP per rank each minute; regen +0.1% max HP/sec.'},
};

// Boss chest artifacts per stage tier. fx: {p, healHp(f), ward(f, regen), passive(key, n), spell(key, n), yields(f)}
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
  9: [['Rimeheart', 'heart', 'Max HP +45%; heal to full.', fx => { fx.healHp(.45); fx.p.hp = fx.p.maxHp; }],
      ['Glacier Lens', 'ice', 'Frost Shards +2 ranks; cast 15% faster.', fx => { fx.spell('ice', 2); fx.p.castCooldown *= .85; }],
      ['Frozen Aegis', 'shield', 'Shield and capacity +90% max HP; regeneration +0.4% max HP/sec.', fx => fx.ward(.9, .004)]],
  10: [['Mimic Tooth', 'attack', 'Attack +45%; gem and gold drops ×1.5.', fx => { fx.p.atk *= 1.45; fx.yields(1.5); }],
      ['Golden Idol', 'coin', 'Gem and gold drops ×2; max HP +20%.', fx => { fx.yields(2); fx.healHp(.2); }],
      ['Gilded Plate', 'shield', 'Max HP +25%; shield and capacity +100% max HP.', fx => { fx.healHp(.25); fx.ward(1); }]],
  11: [['Briar Crown', 'heartGrowth', 'Max HP +40%; Living Heart +2 ranks.', fx => { fx.healHp(.4); fx.passive('heartGrowth', 2); }],
      ['Thorn Whip', 'venom', 'Venom Bloom +2 ranks; attack +40%.', fx => { fx.spell('venom', 2); fx.p.atk *= 1.4; }],
      ['Bramble Ward', 'aegisGrowth', 'Shield and capacity +100% max HP; Growing Aegis +2 ranks.', fx => { fx.ward(1); fx.passive('aegisGrowth', 2); }]],
  12: [['Forge Core', 'emberGrowth', 'Attack +50%; Ember Ascension +2 ranks.', fx => { fx.p.atk *= 1.5; fx.passive('emberGrowth', 2); }],
      ['Great Bellows', 'solar', 'Cast 20% faster; ultimate damage +40%.', fx => { fx.p.castCooldown *= .8; fx.p.ultimatePower *= 1.4; }],
      ['Anvil Plate', 'shield', 'Shield and capacity +120% max HP; regeneration +0.5% max HP/sec.', fx => fx.ward(1.2, .005)]],
  13: [['Phylactery', 'leech', 'Lifesteal +2 ranks; max HP +40%.', fx => { fx.passive('leech', 2); fx.healHp(.4); }],
      ['Regent Scepter', 'starfall', 'Ultimate damage +90%; attack +30%.', fx => { fx.p.ultimatePower *= 1.9; fx.p.atk *= 1.3; }],
      ['Bone Throne', 'heart', 'Max HP +60%; each hit gains 4% max HP damage.', fx => { fx.healHp(.6); fx.p.hpDamage += .04; }]],
  14: [['Prism Shard', 'lightning', 'Chain Lightning +2 ranks; attack +45%.', fx => { fx.spell('lightning', 2); fx.p.atk *= 1.45; }],
      ['Refractor', 'orb', 'Orbiting Orb +2 ranks; cast 15% faster.', fx => { fx.spell('orb', 2); fx.p.castCooldown *= .85; }],
      ['Crystal Shell', 'shield', 'Shield and capacity +140% max HP; regeneration +0.5% max HP/sec.', fx => fx.ward(1.4, .005)]],
  15: [['Hollow Crown', 'attack', 'Attack +60%.', fx => { fx.p.atk *= 1.6; }],
      ['Void Mantle', 'aegisGrowth', 'Shield and capacity +150% max HP; Growing Aegis +2 ranks.', fx => { fx.ward(1.5); fx.passive('aegisGrowth', 2); }],
      ['Starless Heart', 'heartGrowth', 'Max HP +70%; Living Heart +2 ranks.', fx => { fx.healHp(.7); fx.passive('heartGrowth', 2); }]],
  16: [['Tyrant Ember', 'fire', 'Fireball +2 ranks; attack +70%.', fx => { fx.spell('fire', 2); fx.p.atk *= 1.7; }],
      ['Pyre Crown', 'starfall', 'Ultimate damage +100%; cast 20% faster.', fx => { fx.p.ultimatePower *= 2; fx.p.castCooldown *= .8; }],
      ['Last Light', 'heart', 'Max HP +80%; heal to full.', fx => { fx.healHp(.8); fx.p.hp = fx.p.maxHp; }]],
  17: [['Cinder Lance', 'attack', 'Attack +70%; dash recharges 20% faster.', fx => { fx.p.atk *= 1.7; fx.p.dashBonus = (fx.p.dashBonus || 0) + .2; }],
      ['Knight’s Oath', 'shield', 'Shield and capacity +160% max HP.', fx => fx.ward(1.6)],
      ['Ashen Heart', 'heart', 'Max HP +80%; Crimson Siphon +2 ranks.', fx => { fx.healHp(.8); fx.passive('leech', 2); }]],
  18: [['Shard Crown', 'keen', 'Critical chance +12%; critical damage +50%.', fx => { fx.p.critChance += .12; fx.p.critMult += .5; }],
      ['Glass Mantle', 'ward', 'Mirror Ward +2 ranks; attack +50%.', fx => { fx.spell('ward', 2); fx.p.atk *= 1.5; }],
      ['Silver Vein', 'heart', 'Max HP +90%.', fx => fx.healHp(.9)]],
  19: [['Tide Heart', 'heartGrowth', 'Max HP +90%; Living Heart +2 ranks.', fx => { fx.healHp(.9); fx.passive('heartGrowth', 2); }],
      ['Abyssal Pearl', 'attack', 'Attack +80%.', fx => { fx.p.atk *= 1.8; }],
      ['Lantern of the Deep', 'lodestone', 'Cast 25% faster; Lodestone +2 ranks.', fx => { fx.p.castCooldown *= .75; fx.passive('lodestone', 2); }]],
  20: [['Hollow Crown', 'starfall', 'Ultimate damage +120%; attack +60%.', fx => { fx.p.ultimatePower *= 2.2; fx.p.atk *= 1.6; }],
      ['Last Ember', 'fire', 'Attack +100%.', fx => { fx.p.atk *= 2; }],
      ['Throne Ward', 'shield', 'Max HP +100%; shield and capacity +100% max HP.', fx => { fx.healHp(1); fx.ward(1); }]],
};

// In-run market. Costs grow by `growth` per purchase; `max` caps investments.
// short: label for the HUD's auto-buy progress.
const MARKET = {
  attack:    {currency: 'gems',  base: 6,  growth: 1.8, short: 'ATK', label: 'ATK +12%', note: 'Stackable for this run'},
  haste:     {currency: 'gems',  base: 12, growth: 1.8, short: 'HASTE', label: 'Spells 8% faster', note: 'Reduces all cast cooldowns'},
  coinYield: {currency: 'gems',  base: 5,  growth: 1.9, max: 4, yieldOf: 'coins', short: 'GOLD×'},
  hp:        {currency: 'coins', base: 12, growth: 1.8, short: 'HP', label: 'Max HP +12%', note: 'Heal the added HP'},
  shield:    {currency: 'coins', base: 14, growth: 1.8, short: 'SHIELD', label: 'Shield +25% max HP', note: 'Plus 0.1% max HP/sec regen'},
  speed:     {currency: 'coins', base: 10, growth: 1.8, short: 'SPEED', label: 'Speed +10%', note: 'Move faster, stackable'},
  gemYield:  {currency: 'coins', base: 12, growth: 1.9, max: 4, yieldOf: 'gems', short: 'GEM×'},
};
const YIELD_STEP = 1.35;

// Permanent soul upgrades (the Den of Magic). Each perk has a few ranks with set costs;
// deeper perks open once you have cleared a given stage, so every run works toward one.
// atk and hp keep their old save keys (meta.atk, meta.hp); the rest live in meta.perks.
const META_UPGRADES = {atk: {per: .10}, hp: {per: .20}};
const META_PERKS = {
  atk:      {name: 'Ember Focus', icon: 'emberGrowth', costs: [30, 50, 80, 120, 170], desc: n => `Attack +${n * 10}%`},
  hp:       {name: 'Living Vigor', icon: 'heartGrowth', costs: [30, 50, 80, 120, 170], desc: n => `Max HP +${n * 20}%`},
  magnet:   {name: 'Lodestar', icon: 'lodestone', costs: [35, 80], desc: n => `Pickup range +${n * 20}%`},
  reroll:   {name: 'Second Thoughts', icon: 'keen', costs: [40, 90, 160], stage: 1, desc: n => `Reroll level-up cards ${n} time${n > 1 ? 's' : ''} per run (R)`},
  dash:     {name: 'Quickstep', icon: 'fleet', costs: [50, 110], stage: 1, desc: n => `Dash recharges ${n * 15}% faster`},
  purse:    {name: 'Golden Start', icon: 'coin', costs: [60, 140], stage: 2, desc: n => `Start each run with ${n * 25} gems and ${n * 25} gold`},
  origin:   {name: 'Deep Roots', icon: 'fire', costs: [120], stage: 3, desc: () => 'Your first spell starts at rank 3'},
  revive:   {name: 'Second Wind', icon: 'aegisGrowth', costs: [200], stage: 4, desc: () => 'Once per run, a lethal hit leaves you at 40% HP'},
  souls:    {name: 'Soul Harvest', icon: 'soul', costs: [80, 160, 260], stage: 6, desc: n => `Souls +${n * 10}%`},
  hexblade:   {name: 'Hexblade', icon: 'whip', costs: [150], stage: 2, character: true, desc: () => 'Unlocks the Hexblade: the dash slices foes'},
  warden:     {name: 'Warden', icon: 'wolves', costs: [150], stage: 3, character: true, desc: () => 'Unlocks the Warden: a stronger wolf pack'},
  starcaller: {name: 'Starcaller', icon: 'starfall', costs: [220], stage: 5, character: true, desc: () => 'Unlocks the Starcaller: frequent, brutal crits'},
  treasure: {name: 'Treasure Sense', icon: 'gems', costs: [260], stage: 8, desc: () => 'Every boss chest grants one extra artifact'},
};
// Pre-Den saves could buy attack and HP without limit; ranks above the cap are refunded.
const legacyMetaCost = rank => Math.ceil(30 * Math.pow(1.55, rank));

const DROP_COLORS = {xp: '#71efff', soul: '#c478ff', gems: '#63e4c9', coins: '#ffd374'};

// Spellbook content, rendered into the book overlay at startup.
const SPELLBOOK = [
  {title: 'FIRST SPELLS · FOUR PLAYSTYLES', cards: Object.values(ORIGINS).map(o => ({icon: SPELLS[o.spell].icon, name: `${o.name} · ${SPELLS[o.spell].name}`, text: o.book}))},
  {title: 'ALL BASIC SPELLS · RANK 1–5', cards: [
    ...Object.values(SPELLS).map(s => ({icon: s.icon, name: s.name, text: s.book})),
    {icon: 'bolt', name: 'Arcane Echo', text: 'Extra damage on the homing bolt when the spell pool is exhausted.'}]},
  {title: 'EVOLUTIONS · AT RANK 5, PICK ONE FORM', cards: Object.entries(EVOLUTIONS).flatMap(([spell, forms]) =>
    Object.values(forms).map(f => ({icon: SPELLS[spell].icon, name: f.name, text: `${SPELLS[spell].name}: ${f.desc}`})))},
  {title: 'PATHS · LEVEL 5 · YOUR SIGNATURE OR A CROSSOVER', cards: Object.entries(ORIGINS).map(([, o]) => ({icon: PATHS[o.path].icon, name: PATHS[o.path].name, text: `${PATHS[o.path].book} ${o.name} signature.`}))},
  {title: 'ULTIMATES · LEVEL 12 · YOUR SIGNATURE OR YOUR PATH’S', cards: Object.entries(ORIGINS).map(([, o]) => ({icon: ULTIMATES[o.ultimate].art, name: ULTIMATES[o.ultimate].name, text: `${ULTIMATES[o.ultimate].book} ${o.name} signature.`}))},
  {title: 'BARGAINS · POWER AT A PRICE', cards: Object.values(BARGAINS).map(b => ({icon: b.icon, name: b.name, text: `${b.gain}. Cost: ${b.cost.charAt(0).toLowerCase()}${b.cost.slice(1)}.`}))},
  {title: 'PASSIVE GROWTH · RANK 1–5', cards: Object.entries(PASSIVES).map(([key, s]) => ({icon: key, name: s.name, text: s.book}))},
];
