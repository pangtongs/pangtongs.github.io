'use strict';
const $ = id => document.getElementById(id);
const money = n => 'Rp' + n.toLocaleString('id-ID');
const fresh = () => ({
  v: 2,
  // A new game needs none of the migrations in save.js.
  schema: SAVE_SCHEMA,
  room: null,
  stamps: [],
  antidotes: 3,
  meals: 0,
  futsal: { best: 0, streak: 0, day: -1 },
  region: REGION.SUKAMAJU,
  x: 480,
  y: 320,
  money: 25000,
  balls: 8,
  potions: 5,
  storage: [],
  team: [],
  seen: [],
  defeated: [],
  quests: [],
  trash: [],
  visited: [],
  finds: [],
  ambushes: [],
  // Story puzzles and caught legends (story/chapters.js); loads fill them in migrateSave.
  puzzles: {},
  legendCaught: [],
  seconds: 0,
  wins: 0,
  steps: 0,
  finished: false,
});
let state = fresh(),
  battle = null,
  locked = false,
  modalKind = '',
  held = null,
  navigation = 0,
  previousFocus = null,
  audioCtx = null,
  toastTimer,
  lastStep = 0;
// Opening the page with ?debug turns on the tools in js/ui/debug.js. Debug play
// has its own autosave, started as a copy of the real one, so it cannot spoil it.
const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search || '');
const debugFlags = { openAll: false, floor: false, walkAll: false };
// area-jalan.html?map=6 opens the game straight into the walking-area editor (?debug&floor=6).
const floorEditorPage = DEBUG
  ? decodeURIComponent(
      /[?&]floor=([^&]+)/.exec(typeof location === 'undefined' ? '' : location.search || '')?.[1] || '',
    ) || null
  : null;
const KEY = DEBUG ? 'wargamon-debug' : 'wargamon-v2';
if (DEBUG)
  try {
    if (localStorage.getItem(KEY) === null && localStorage.getItem('wargamon-v2') !== null)
      localStorage.setItem(KEY, localStorage.getItem('wargamon-v2'));
  } catch {}
// An autosave that cannot be read is copied into quarantine before the new game's first
// save could replace it; the starter dialog tells the player ('kept', or 'blocked' when even
// the copy failed and autosaving stays off).
let saveQuarantine = '';
try {
  const raw = localStorage.getItem(KEY);
  if (raw != null) {
    let s = null;
    try {
      s = JSON.parse(raw);
    } catch {}
    if (validSave(s)) state = s;
    else if (quarantineSave('autosave', raw)) saveQuarantine = 'kept';
    else {
      saveQuarantine = 'blocked';
      autosaveBlocked = true;
    }
  }
} catch {}
const region = () => REGIONS[state.region];
const makeMon = (id, level = 5) => ({
  id,
  level,
  hp: SPECIES[id].base + level * 5,
  max: SPECIES[id].base + level * 5,
  xp: 0,
  conditions: {},
  fullness: 75,
  cooldowns: {},
});
const art = (id, eager = false) => {
  const src = globalThis.portraitDisplayURLs?.get(id) || creaturePortraitPath(id),
    species = SPECIES[id];
  return src && species
    ? `<img class="sprite mon${id}" src="${src}" alt="${species.name}" width="512" height="512" loading="${eager ? 'eager' : 'lazy'}" decoding="async" draggable="false">`
    : '';
};
// A creature's own picture: a rare-coloured one keeps its batik colours (batik.js)
// everywhere it is shown.
const monArt = m => (m.variant ? batikArt(m) : art(m.id));
const monName = m => SPECIES[m.id].name + (m.variant ? ' ✦' : '');
function xpBar(m) {
  const required = m.level * 20,
    current = Math.max(0, Math.min(required, Number(m.xp) || 0));
  return `<div class="xp-progress"><div class="xp-caption"><span>XP ${current}/${required}</span><span>Lv.${m.level + 1}</span></div><div class="xp-track" role="progressbar" aria-label="${I18N.t('xp.aria', { name: tr(SPECIES[m.id].name), level: m.level + 1 })}" aria-valuemin="0" aria-valuemax="${required}" aria-valuenow="${current}"><i style="width:${(current / required) * 100}%"></i></div></div>`;
}
const hpBar = m =>
  `<div class="hp"><i style="background:${m.hp / m.max <= 0.25 ? '#de4949' : m.hp / m.max <= 0.5 ? '#e4aa35' : '#38996b'};width:${Math.max(0, (m.hp / m.max) * 100)}%"></i></div>`;
const health = m => hpBar(m) + (state.team.includes(m) ? xpBar(m) : '');
// Battle pauses can run at double speed; the choice is this browser's own preference.
let battleSpeed = 1;
try {
  battleSpeed = localStorage.getItem('wargamon-battle-speed') === '2' ? 2 : 1;
} catch {}
function setBattleSpeed(n) {
  battleSpeed = n === 2 ? 2 : 1;
  try {
    localStorage.setItem('wargamon-battle-speed', String(battleSpeed));
  } catch {}
}
// True while a fight, a dialog or a scripted walk owns the input.
const busy = () => !!(battle || locked || modalKind);
const delay = ms => new Promise(r => setTimeout(r, battle ? ms / battleSpeed : ms));
function has(q) {
  return state.quests.includes(q);
}
const closeButton = (text = I18N.t('common.continue')) =>
  `<button class="action" data-act="close">${text}</button>`;
function chooseStarter() {
  // Shown once, on the first starter dialog after an unreadable autosave was set aside.
  const notice = saveQuarantine
    ? `<p class="save-notice" role="alert">${I18N.t(saveQuarantine === 'kept' ? 'save.quarantine.kept' : 'save.quarantine.blocked')}</p>`
    : '';
  saveQuarantine = '';
  modal(
    `<span class="eyebrow">${I18N.t('hud.eyebrow', { n: 1, region: I18N.t('starter.leaving') })}</span><h2>${I18N.t('starter.title')}</h2>${notice}<p>${I18N.t('starter.intro')}</p><div class="starters">${SPECIES.slice(
      0,
      3,
    )
      .map(
        (s, i) =>
          `<button class="starter" data-act="starter" data-id="${i}">${art(i)}<strong>${s.name}</strong><small>${s.type.toUpperCase()}, LEVEL 5</small><span class="starter-strong">${I18N.t('starter.strong', { types: typeStrengths(s.type).join(', ') })}</span><span class="desc">${s.desc}</span></button>`,
      )
      .join('')}</div>`,
    'starter',
  );
}
function story() {
  if (!state.visited.includes(state.region)) {
    state.visited.push(state.region);
    save();
    modal(
      `<span class="eyebrow">${I18N.t('chapter.count', { n: chapterOf() + 1, total: WORLD_CHAPTERS.length })}</span><h2>${region().name}</h2><p>${region().story}</p><p class="quest-line">${region().goal}</p>${closeButton(I18N.t('story.depart'))}`,
    );
  }
}
const canvas = $('world'),
  ctx = canvas.getContext('2d'),
  images = {};
for (const name of ['img/maps/exterior/1-1.webp', 'img/characters/trainers.webp']) {
  const im = new Image();
  im.src = name;
  images[name] = im;
}
// Register distant map art without competing with the visible map on first load.
function deferMapImage(name) {
  const im = new Image();
  images[name] = im;
  return im;
}
// Drawing starts once every script has loaded; `draw` is looked up at call time.
document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(t => draw(t)), { once: true });
setInterval(() => {
  if (!document.hidden && state.team.length) {
    state.seconds++;
    if (state.seconds % 15 === 0) save();
  }
}, 1000);
/* Place-specific exploration and status-driven combat. No dependencies. */
const place = () => PLACES[state.region];
const room = () => (state.room ? ROOMS[state.room] : null);
const normalise = m => {
  m.conditions ??= {};
  if (m.status && STATUS[m.status])
    m.conditions[m.status] = Math.max(m.conditions[m.status] || 0, m.statusTurns || 1);
  m.status = null;
  m.statusTurns = 0;
  m.fullness = Number.isFinite(m.fullness) ? Math.max(0, Math.min(100, Math.round(m.fullness))) : 75;
  m.cooldowns ??= {};
  m.xp ??= 0;
  return m;
};
