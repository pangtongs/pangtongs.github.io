/* Menara Tanding: the post-Champion battle tower, a desk in Balai Juara. A run climbs
   floor after floor against generated teams of the species no trainer fields, at rising
   levels, without the bag and without healing, except a short rest every few floors.
   Cleared floors earn Poin Menara to trade for supplies and gear; 10, 25 and 50 floors in
   one run earn a trophy. The best streak is kept. */
const TOWER_REST_EVERY = 5,
  // A short rest: each conscious teammate gets back this share of its HP, and conditions clear.
  TOWER_REST_SHARE = 0.3,
  TOWER_PORTRAITS = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115],
  TOWER_NAMES = [
    'Bayu',
    'Sekar',
    'Dimas',
    'Laras',
    'Wulan',
    'Gilang',
    'Ratna',
    'Fajar',
    'Intan',
    'Yoga',
    'Melati',
    'Rangga',
    'Citra',
    'Arya',
    'Kinanti',
    'Bima',
  ],
  // Gear tower trainers hold, the strongest first; later floors hand out more of it.
  TOWER_GEAR = [
    'vest',
    'scarf',
    'turbine',
    'rescue',
    'capacitor',
    'medkit',
    'sambal',
    'coil',
    'lunchbox',
    'umbrella',
  ],
  TOWER_TROPHIES = Object.freeze([
    { floor: 10, key: 'bronze', points: 5 },
    { floor: 25, key: 'silver', points: 10 },
    { floor: 50, key: 'gold', points: 25 },
  ]),
  // What Poin Menara buy: [item, how many, cost].
  TOWER_SHOP = Object.freeze([
    ['ultraballs', 2, 3],
    ['maxpotion', 1, 2],
    ['revive', 1, 2],
    ['scarf', 1, 6],
    ['vest', 1, 6],
    ['umbrella', 1, 6],
    ['coil', 1, 7],
    ['rescue', 1, 8],
    ['capacitor', 1, 15],
    ['medkit', 1, 15],
  ]);
const freshTower = () => ({
  active: false,
  floor: 0,
  seed: 0,
  best: 0,
  points: 0,
  runs: 0,
  trophies: [],
  party: null,
});
function towerState() {
  const t = (state.tower ??= freshTower());
  for (const [k, v] of Object.entries(freshTower())) t[k] ??= v;
  if (!Array.isArray(t.trophies)) t.trophies = [];
  return t;
}
// The species no trainer fields (teams and reserves), legends and creatures the world does
// not offer yet (a later chapter's, an event's) aside: the tower's whole pool.
let towerPoolCache = null;
function towerPool() {
  if (towerPoolCache) return towerPoolCache;
  const fielded = new Set();
  for (const t of TRAINERS) for (const [sid] of t.team) fielded.add(sid);
  for (const t of Object.values(TRAINER_TACTICS)) if (t.reserve) fielded.add(t.reserve.mon[0]);
  return (towerPoolCache = SPECIES.map((s, id) => id).filter(
    id => !fielded.has(id) && !SPECIES[id].legendary && speciesOffered(id),
  ));
}
// A seeded generator (mulberry32), so a floor's team is the same until it is fought.
function towerRandom(seed) {
  let a = batikHash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const towerLevel = n => Math.min(LEVEL_CAP, 49 + n);
const towerSize = n => Math.min(6, 3 + Math.floor((n - 1) / 10));
const towerTier = n => (n >= 50 ? 'maestro' : n >= 25 ? 'jawara' : n >= 10 ? 'pendekar' : 'penantang');
// Floor `n` of the run with this seed: a team from the pool, its plan and gear.
// Floors 1-3 fight plainly; from 4 trainers have a style, from 6 they hold gear (one more
// piece every six floors), from 12 they carry Jamu.
function towerFloor(n, seed) {
  const rand = towerRandom(`${seed}:${n}`),
    pool = towerPool().slice(),
    size = Math.min(towerSize(n), pool.length),
    level = towerLevel(n),
    gear = Math.min(size, Math.floor(n / 6)),
    team = [];
  for (let i = 0; i < size; i++) {
    const sid = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    team.push({ sid, lv: i === size - 1 ? Math.min(LEVEL_CAP, level + 1) : level, item: null });
  }
  // The ace holds the first piece, then the creatures before it.
  const pieces = TOWER_GEAR.slice();
  for (let g = 0; g < gear; g++)
    team[size - 1 - g].item = pieces.splice(Math.floor(rand() * Math.min(pieces.length, 4 + g)), 1)[0];
  return {
    kind: 'tower',
    floor: n,
    // A title by height, then a first name: Penantang Laras, Jawara Bima.
    name: `${I18N.t(`tower.tier.${towerTier(n)}`)} ${TOWER_NAMES[Math.floor(rand() * TOWER_NAMES.length)]}`,
    portrait: TOWER_PORTRAITS[Math.floor(rand() * TOWER_PORTRAITS.length)],
    style: n < 4 ? null : ['status', 'guard', 'aggressive'][Math.floor(rand() * 3)],
    potions: n >= 30 ? 2 : n >= 12 ? 1 : 0,
    noItems: true,
    team,
  };
}
// The team as the tower last saw it. Between floors nothing outside heals it: on the next
// floor each creature has at most this HP and exactly these conditions.
const towerFamily = id => SPECIES[id].from ?? id;
function towerSnapshot() {
  return state.team.map(m => ({ id: m.id, hp: m.hp, conditions: { ...(m.conditions || {}) } }));
}
// Pairs each teammate with its snapshot entry (same family, so an evolution still counts),
// or returns null when the team is not the one that started.
function towerPairs(party) {
  if (!Array.isArray(party) || party.length !== state.team.length) return null;
  const left = party.slice(),
    pairs = [];
  for (const m of state.team) {
    const i = left.findIndex(p => SPECIES[p.id] && towerFamily(p.id) === towerFamily(m.id));
    if (i < 0) return null;
    pairs.push([m, left.splice(i, 1)[0]]);
  }
  return pairs;
}
function towerPoints(floor) {
  return 1 + (floor % 5 === 0 ? 1 : 0) + (floor % 10 === 0 ? 2 : 0);
}
const atTowerDesk = () => state.region === REGION.LIGA && state.room === 'championhall';
const towerKey = k => I18N.t(`tower.${k}`);
// Tower trainers wear the townspeople sheets; a preview drawn before they arrive shows the
// loud placeholder until then, and is redrawn when they do.
function requestTowerCast() {
  for (const name of ['img/characters/residents-a.webp', 'img/characters/residents-b.webp']) {
    const image = loadMapImage(name);
    if (image.complete && image.naturalWidth) continue;
    image.addEventListener?.('load', () =>
      setTimeout(() => {
        for (const el of document.querySelectorAll('[data-tower-portrait]'))
          el.outerHTML = towerPortrait(Number(el.dataset.towerPortrait));
      }, 0),
    );
  }
}
const towerPortrait = id => trainerArt(id).replace('<div ', `<div data-tower-portrait="${id}" `);
function towerTeamPreview(floor) {
  return `<div class="opponent-team">${floor.team
    .map(
      ({ sid, lv, item }) =>
        `<div class="opponent-mon">${art(sid, true)}<span>${SPECIES[sid].name}<br>Lv.${lv}, ${typeLabel(sid)}${LEAGUE_ITEMS[item] ? `<br><small>${I18N.t('battle.heldItem', { item: LEAGUE_ITEMS[item].name })}</small>` : ''}</span></div>`,
    )
    .join(
      '',
    )}</div><p class="trainer-plan">${floor.style ? I18N.t(`trainer.style.${floor.style}`) : towerKey('style.plain')} ${I18N.t('trainer.potions', { n: floor.potions })}</p>`;
}
function towerRecord(t) {
  const trophies = TOWER_TROPHIES.filter(x => t.trophies.includes(x.key));
  return `<div class="tower-record"><span>${I18N.t('tower.best', { n: t.best })}</span><span>${I18N.t('tower.points', { n: t.points })}</span><span>${trophies.length ? trophies.map(x => '🏆 ' + towerKey(`trophy.${x.key}`)).join(' ') : towerKey('trophy.none')}</span></div>`;
}
// The desk: rules, the record and either the start button or the next floor.
addInteraction(TEAM_INTERACTIONS, 'tower', () => towerMenu());
function towerMenu(banner = '') {
  if (battle || locked) return;
  if (!has('champion')) {
    modal(`<h2>${towerKey('name')}</h2><p>${towerKey('locked')}</p>${closeButton()}`, 'tower');
    return;
  }
  requestTowerCast();
  const t = towerState(),
    next = t.floor + 1,
    rules = `<details ${t.runs ? '' : 'open'}><summary>${towerKey('rules.title')}</summary><ol class="tower-rules"><li>${towerKey('rules.pool')}</li><li>${I18N.t('tower.rules.levels', { n: towerLevel(1) })}</li><li>${towerKey('rules.noItems')}</li><li>${I18N.t('tower.rules.rest', { n: TOWER_REST_EVERY, pct: Math.round(TOWER_REST_SHARE * 100) })}</li><li>${towerKey('rules.sameTeam')}</li><li>${towerKey('rules.end')}</li><li>${towerKey('rules.rewards')}</li></ol></details>`;
  let body;
  if (!t.active)
    body = `<p>${towerKey('intro')}</p><div class="actions"><button class="action" data-tower="start" ${state.team.some(m => m.hp > 0) ? '' : 'disabled'}>${towerKey('start')}</button><button class="secondary" data-tower="shop">${towerKey('shop')}</button></div>`;
  else {
    const floor = towerFloor(next, t.seed),
      mismatch = !towerPairs(t.party);
    body = `<h3>${I18N.t('tower.nextFloor', { n: next })}${next % TOWER_REST_EVERY === 0 ? ' · ' + towerKey('restAfter') : ''}</h3><div class="portrait-head">${towerPortrait(floor.portrait)}<div><h3>${floor.name}</h3><p>${I18N.t('tower.floorTeam', { n: floor.team.length })}</p></div></div>${towerTeamPreview(floor)}${mismatch ? `<p class="save-notice" role="alert">${towerKey('mismatch')}</p>` : ''}<div class="actions"><button class="action" data-tower="fight" ${mismatch || !state.team.some(m => m.hp > 0) ? 'disabled' : ''}>${I18N.t('tower.fight', { n: next })}</button><button class="secondary" data-tower="quit">${towerKey('quit')}</button><button class="secondary" data-tower="shop">${towerKey('shop')}</button></div>`;
  }
  modal(
    `<span class="eyebrow">${towerKey('eyebrow')}</span><h2>${towerKey('name')}</h2>${banner}${towerRecord(t)}${body}${rules}${closeButton(I18N.t('league.prepare'))}`,
    'tower',
  );
}
function startTower() {
  const t = towerState();
  if (modalKind !== 'tower' || battle || locked || t.active || !has('champion') || !atTowerDesk())
    return false;
  if (!state.team.some(m => m.hp > 0)) return false;
  Object.assign(t, {
    active: true,
    floor: 0,
    seed: Math.floor(Math.random() * 4294967296) >>> 0,
    party: towerSnapshot(),
  });
  t.runs++;
  save();
  towerMenu();
  return true;
}
// Sends the team up to the next floor, as the tower last saw it.
function fightTower() {
  const t = towerState();
  if (modalKind !== 'tower' || battle || locked || !t.active || !atTowerDesk()) return false;
  const pairs = towerPairs(t.party);
  if (!pairs) return false;
  for (const [m, p] of pairs) {
    m.hp = Math.max(0, Math.min(m.hp, p.hp));
    m.conditions = { ...p.conditions };
  }
  if (!state.team.some(m => m.hp > 0)) return false;
  startGuestBattle(towerFloor(t.floor + 1, t.seed));
  return !!battle;
}
function endTowerRun() {
  const t = towerState();
  t.active = false;
  t.party = null;
  save();
}
function quitTower() {
  const t = towerState();
  if (modalKind !== 'tower' || battle || locked || !t.active) return;
  const floors = t.floor;
  endTowerRun();
  towerMenu(`<p class="activity-complete" role="status">${I18N.t('tower.quitDone', { n: floors })}</p>`);
}
// After a floor: points, a trophy at 10, 25 and 50, the rest every few floors, or the end.
function towerAfter(won) {
  const t = towerState();
  if (!t.active) return;
  if (!won) {
    const floors = t.floor;
    endTowerRun();
    modal(
      `<span class="eyebrow">${towerKey('eyebrow')}</span><h2>${towerKey('lost.title')}</h2><p>${I18N.t('tower.lost.body', { floor: floors + 1, n: floors })}</p>${towerRecord(t)}<p>${I18N.t('battle.fainted.body')}</p>${closeButton(I18N.t('battle.fainted.walk'))}`,
      'tower-result',
    );
    return;
  }
  t.floor++;
  let gained = towerPoints(t.floor);
  const notes = [];
  const record = t.floor > t.best;
  t.best = Math.max(t.best, t.floor);
  for (const trophy of TOWER_TROPHIES)
    if (t.floor === trophy.floor && !t.trophies.includes(trophy.key)) {
      t.trophies.push(trophy.key);
      gained += trophy.points;
      notes.push(I18N.t('tower.trophyWon', { trophy: towerKey(`trophy.${trophy.key}`), n: trophy.points }));
    }
  t.points += gained;
  if (t.floor % TOWER_REST_EVERY === 0) {
    for (const m of state.team)
      if (m.hp > 0) {
        m.hp = Math.min(m.max, m.hp + Math.ceil(m.max * TOWER_REST_SHARE));
        m.conditions = {};
      }
    notes.push(I18N.t('tower.rested', { pct: Math.round(TOWER_REST_SHARE * 100) }));
  }
  t.party = towerSnapshot();
  update();
  save();
  towerMenu(
    `<p class="activity-complete" role="status">${I18N.t('tower.cleared', { floor: t.floor, n: gained })}${record && t.floor > 1 ? ' ' + towerKey('newRecord') : ''}</p>${notes.map(n => `<p class="story-hint">${n}</p>`).join('')}`,
  );
}
function towerShop() {
  if (battle || locked || !has('champion')) return;
  const t = towerState();
  modal(
    `<h2>${towerKey('shop')}</h2><p>${I18N.t('tower.points', { n: t.points })}</p><div class="equipment-grid">${TOWER_SHOP.map(
      ([key, n, cost], i) =>
        `<section class="equipment-card">${itemIcon(key)}<h3>${medicineInfo(key).name}${n > 1 ? ' ×' + n : ''}</h3><p>${medicineInfo(key).desc}</p><small>${I18N.t('equipment.available', { n: itemCount(key) })}</small><button data-tower="buy" data-id="${i}" ${t.points < cost ? 'disabled' : ''}>${I18N.t('tower.cost', { n: cost })}</button></section>`,
    ).join('')}</div>`,
    'tower-shop',
    `<button class="secondary" data-tower="menu">${towerKey('back')}</button>`,
  );
}
function buyTowerItem(i) {
  const t = towerState(),
    entry = TOWER_SHOP[i];
  if (modalKind !== 'tower-shop' || battle || locked || !entry || t.points < entry[2]) return false;
  t.points -= entry[2];
  addItem(entry[0], entry[1]);
  update();
  save();
  towerShop();
  return true;
}
// One line for Balai Juara's record.
function towerHallNote() {
  const t = towerState();
  return t.runs ? `<p>${I18N.t('tower.hallNote', { n: t.best, trophies: t.trophies.length })}</p>` : '';
}
// Where a guest battle (battle-flow.js) ends: the tower, or a ghost team (team-codes.js).
function guestBattleOver(b, won) {
  if (b.guest.kind === 'tower') towerAfter(won);
  else if (b.guest.kind === 'ghost') ghostBattleOver(b, won);
}
onClick(e => {
  const b = e.target.closest('[data-tower]');
  if (!b || b.disabled) return;
  switch (b.dataset.tower) {
    case 'start':
      startTower();
      break;
    case 'fight':
      fightTower();
      break;
    case 'quit':
      quitTower();
      break;
    case 'shop':
      towerShop();
      break;
    case 'buy':
      buyTowerItem(Number(b.dataset.id));
      break;
    case 'menu':
      towerMenu();
      break;
  }
});
