'use strict';
const $ = id => document.getElementById(id);
const money = n => 'Rp' + n.toLocaleString('id-ID');
const fresh = () => ({
  v: 2,
  mapRevision: 3,
  chapterTwoRevision: 1,
  room: null,
  stamps: [],
  antidotes: 3,
  meals: 0,
  penalties: 0,
  region: 0,
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
  lastStep = 0,
  migration = false;
// Opening the page with ?debug turns on the tools in js/ui/debug.js. Debug play
// has its own autosave, started as a copy of the real one, so it cannot spoil it.
const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search || '');
const debugFlags = { openAll: false, floor: false, walkAll: false };
const KEY = DEBUG ? 'wargamon-debug' : 'wargamon-v2';
if (DEBUG)
  try {
    if (localStorage.getItem(KEY) === null && localStorage.getItem('wargamon-v2') !== null)
      localStorage.setItem(KEY, localStorage.getItem('wargamon-v2'));
  } catch {}
function validSave(s) {
  return (
    s &&
    s.v === 2 &&
    Number.isInteger(s.region) &&
    s.region >= 0 &&
    s.region < REGIONS.length &&
    Array.isArray(s.team) &&
    s.team.length <= 6 &&
    (!s.storage ||
      (Array.isArray(s.storage) &&
        s.storage.every(m => SPECIES[m.id] && m.hp >= 0 && m.max > 0 && m.level > 0))) &&
    s.team.every(m => SPECIES[m.id] && m.hp >= 0 && m.max > 0 && m.level > 0) &&
    ['defeated', 'quests', 'trash', 'seen', 'visited'].every(k => Array.isArray(s[k]))
  );
}
try {
  const raw = localStorage.getItem(KEY),
    s = raw && JSON.parse(raw);
  if (validSave(s)) state = s;
  else if (!raw) {
    const old = JSON.parse(localStorage.getItem('wargamon-v1'));
    if (old?.team?.length && old.team.every(m => SPECIES[m.id] && m.max > 0)) {
      state = {
        ...fresh(),
        team: old.team.map(m => ({ ...m, hp: m.max })),
        seen: old.seen || old.team.map(m => m.id),
        money: Math.max(25000, old.money || 0),
        balls: Math.max(8, old.balls || 0),
        potions: Math.max(5, old.potions || 0),
      };
      migration = true;
    }
  }
} catch {}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    $('saveStatus').textContent = `${Math.floor(state.seconds / 60)} menit, tersimpan otomatis`;
  } catch {
    $('saveStatus').textContent = 'Simpan tidak tersedia di browser ini';
  }
}
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
// A creature's own picture: a rare-coloured one keeps its colours everywhere it is shown.
const monArt = m =>
  m.variant ? art(m.id).replace('class="sprite', 'class="sprite variant-colours') : art(m.id);
const monName = m => SPECIES[m.id].name + (m.variant ? ' ✦' : '');
function xpBar(m) {
  const required = m.level * 20,
    current = Math.max(0, Math.min(required, Number(m.xp) || 0));
  return `<div class="xp-progress"><div class="xp-caption"><span>XP ${current}/${required}</span><span>Lv.${m.level + 1}</span></div><div class="xp-track" role="progressbar" aria-label="${SPECIES[m.id].name}: XP menuju level ${m.level + 1}" aria-valuemin="0" aria-valuemax="${required}" aria-valuenow="${current}"><i style="width:${(current / required) * 100}%"></i></div></div>`;
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
const delay = ms => new Promise(r => setTimeout(r, battle ? ms / battleSpeed : ms));
function has(q) {
  return state.quests.includes(q);
}
const closeButton = (text = 'Lanjut') => `<button class="action" data-act="close">${text}</button>`;
function chooseStarter() {
  modal(
    `<span class="eyebrow">BAB 1, BERANGKAT DARI SUKAMAJU</span><h2>Teman pertama, perjalanan panjang.</h2><p>${I18N.t('text.067')}</p><div class="starters">${SPECIES.slice(
      0,
      3,
    )
      .map(
        (s, i) =>
          `<button class="starter" data-act="starter" data-id="${i}">${art(i)}<strong>${s.name}</strong><small>${s.type.toUpperCase()}, LEVEL 5</small><span class="desc">${s.desc}</span></button>`,
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
      `<span class="eyebrow">BAB ${chapterOf() + 1} DARI ${WORLD_CHAPTERS.length}</span><h2>${region().name}</h2><p>${region().story}</p><p class="quest-line">${region().goal}</p>${closeButton('Ayo, berangkat!')}`,
    );
  }
}
function damage(a, d, special) {
  let mult = 1;
  if (special) {
    if (SPECIES[a.id].strong.includes(SPECIES[d.id].type)) mult = 1.6;
    else if (SPECIES[d.id].strong.includes(SPECIES[a.id].type)) mult = 0.7;
  }
  return {
    amount: Math.max(
      3,
      Math.round((special ? 10 + a.level * 0.8 : 8 + a.level * 0.6) * (0.9 + Math.random() * 0.2) * mult),
    ),
    mult,
  };
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
function person(x, y) {
  ctx.save();
  ctx.translate(Math.round(x - 12), Math.round(y - 30));
  ctx.fillStyle = '#0a202d55';
  ctx.beginPath();
  ctx.ellipse(12, 33, 14, 5, 0, 0, 7);
  ctx.fill();
  for (const [a, b, c, d, color] of [
    [2, 0, 4, 1, '#182832'],
    [1, 1, 6, 2, '#e65248'],
    [2, 3, 4, 3, '#efb77b'],
    [3, 4, 1, 1, '#493c35'],
    [1, 6, 6, 4, '#51b3af'],
    [0, 7, 1, 3, '#efb77b'],
    [7, 7, 1, 3, '#efb77b'],
    [2, 10, 2, 2, '#253442'],
    [5, 10, 2, 2, '#253442'],
  ]) {
    ctx.fillStyle = color;
    ctx.fillRect(a * 3, b * 3, c * 3, d * 3);
  }
  ctx.fillStyle = '#edca65';
  ctx.fillRect(0, 20, 5, 9);
  ctx.fillStyle = '#fff4ca';
  ctx.fillRect(9, 4, 9, 3);
  ctx.restore();
}
// Drawing starts once every script has loaded; `draw` is looked up at call time.
document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(t => draw(t)), { once: true });
const directions = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};
document.addEventListener('keydown', e => {
  if (e.key === 'Tab' && modalKind) {
    const f = [...$('modal').querySelectorAll('button:not(:disabled)')];
    if (f.length && (e.shiftKey ? document.activeElement === f[0] : document.activeElement === f.at(-1))) {
      e.preventDefault();
      (e.shiftKey ? f.at(-1) : f[0]).focus();
    }
    return;
  }
  // Escape closes the open dialog; with nothing open it brings up the menu.
  if (e.key === 'Escape') {
    if (modalKind) closeModal();
    else if (!battle && !locked) {
      e.preventDefault();
      gameMenu();
    }
    return;
  }
  if (directions[e.key] && !modalKind) {
    e.preventDefault();
    held = directions[e.key];
    navigation++;
  }
  if (['e', 'E', ' '].includes(e.key) && !modalKind) {
    e.preventDefault();
    interact();
  }
  if (['t', 'T'].includes(e.key)) {
    e.preventDefault();
    if (typeof quickTeamToggle === 'function') quickTeamToggle();
    else if (!modalKind) teamMenu();
  }
  if (['g', 'G'].includes(e.key) && !locked) {
    e.preventDefault();
    if (modalKind === 'dex') closeModal();
    else if (!modalKind) dex();
  }
  if (['o', 'O'].includes(e.key) && !locked && !battle) {
    e.preventDefault();
    if (modalKind === 'settings') closeModal();
    else if (!modalKind) gameMenu();
  }
  if (['m', 'M'].includes(e.key) && !locked && !battle) {
    e.preventDefault();
    if (modalKind === 'map') closeModal();
    else if (!modalKind) mapMenu();
  }
});
document.addEventListener('keyup', e => {
  if (directions[e.key] === held) held = null;
});
window.addEventListener('blur', () => {
  held = null;
  navigation++;
  save();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    held = null;
    navigation++;
    save();
  }
});
// One held pointer owns movement; capture keeps releases reliable outside the button.
let movementPointer = null;
function releaseMovementPointer(e) {
  if (movementPointer === null || (e?.pointerId !== undefined && e.pointerId !== movementPointer)) return;
  movementPointer = null;
  held = null;
}
document.querySelectorAll('.dpad [data-move]').forEach(b => {
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (e.button !== 0 || movementPointer !== null || modalKind || battle || locked) return;
    navigation++;
    movementPointer = e.pointerId;
    held = b.dataset.move;
    b.setPointerCapture(e.pointerId);
  });
  b.addEventListener('lostpointercapture', releaseMovementPointer);
});
for (const event of ['pointerup', 'pointercancel']) document.addEventListener(event, releaseMovementPointer);
window.addEventListener('blur', () => releaseMovementPointer());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseMovementPointer();
});
// Android selection menus and iOS callouts must not intercept press-and-hold controls.
for (const event of ['contextmenu', 'selectstart', 'dragstart'])
  document.addEventListener(event, e => {
    if (e.target.closest?.('.mobile-controls,.game-dock')) e.preventDefault();
  });
canvas.addEventListener('click', e => mapClick(e));
// The page has one click listener. Each feature registers its handler with
// onClick(); handlers run in the order they were registered.
const clickHandlers = [];
function onClick(handler) {
  if (arguments.length !== 1) throw new Error('onClick takes one handler');
  clickHandlers.push(handler);
}
document.addEventListener('click', event => {
  for (const handler of clickHandlers)
    try {
      handler(event);
    } catch (error) {
      // One failing handler must not stop the others; the error is still reported.
      setTimeout(() => {
        throw error;
      });
    }
});
onClick(async e => {
  const b = e.target.closest('button[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act,
    id = Number(b.dataset.id);
  switch (act) {
    case 'close':
      closeModal();
      break;
    case 'starter':
      state.team = [makeMon(id)];
      state.seen = [id];
      closeModal(true);
      update();
      story();
      break;
    case 'travel':
      travel(id);
      break;
    case 'ojek':
      rideOjek(id);
      break;
    case 'starttrainer':
      if (canChallenge(id)) startBattle(id, TRAINERS[id].team);
      break;
    case 'battle':
      await action(b.dataset.move);
      break;
    case 'lead':
      if (id === 0 || !state.team[id]?.hp || locked) return;
      if (battle) passTurn(state.team[0]);
      [state.team[0], state.team[id]] = [state.team[id], state.team[0]];
      update();
      if (battle) {
        closeModal();
        battle.focus = false;
        battle.log = 'Ayo, ' + SPECIES[state.team[0].id].name + '!';
        battle.busy = true;
        locked = true;
        renderBattle();
        await delay(500);
        await enemyTurn();
      } else teamMenu();
      break;
    case 'dex':
      dex();
      break;
  }
});
setInterval(() => {
  if (!document.hidden && state.team.length) {
    state.seconds++;
    if (state.seconds % 15 === 0) save();
  }
}, 1000);
// Brings any save (autosave, slot or imported backup) up to the current game:
// fields added since it was written, rooms that moved, ground that became solid.
function migrateSave() {
  delete state.adventureClaims;
  [...state.team, ...(state.storage || [])].forEach(m => {
    normalise(m);
    clearBattleFlags(m);
  });
  state.stamps ??= [];
  state.meals ??= 0;
  state.penalties ??= 0;
  state.restUsed ??= false;
  state.antidotes ??= 3;
  state.storage ??= [];
  if (state.mapRevision !== 3) {
    state.mapRevision = 3;
    state.room = null;
    [state.x, state.y] = place().spawn;
    if (has('parcel') && [0, 1].every(i => state.defeated.includes(i)) && !has('permit'))
      state.quests.push('permit');
  }
  // Rooms that became outdoor places keep the player's spot in their new location.
  migrateGangRoom();
  if (state.room === 'futsal') {
    if (state.region === 3) {
      state.room = 'warungcity';
      state.x = 700;
      state.y = 330;
      state.returnPosition = { x: 470, y: 180 };
    } else {
      state.room = null;
      state.x = 640;
      state.y = 510;
      state.returnPosition = null;
    }
  }
  if (state.room && !ROOMS[state.room]) state.room = null;
  // The replacement chapter retains all IDs, quests, victories and owned creatures.
  // Only positions referring to the former paintings are replaced once.
  if (state.chapterTwoRevision !== 1) {
    state.chapterTwoRevision = 1;
    if ([3, 4, 5, 9].includes(state.region)) {
      if (state.region === 3 && state.room === 'shop') state.room = 'terminalshop';
      const owner = {
        clinic: 3,
        warungcity: 3,
        gym: 4,
        stage: 5,
        terminalshop: 9,
        mallatrium: 9,
        pasarsubuh: 9,
      };
      if (owner[state.room] !== undefined) state.region = owner[state.room];
      if (state.room) {
        if (ROOMS[state.room].spawn) [state.x, state.y] = ROOMS[state.room].spawn;
        const door = place().points.find(p => p.room === state.room);
        state.returnPosition = door ? { x: door.x, y: door.y } : { x: place().spawn[0], y: place().spawn[1] };
        if (state.room === 'pasarsubuh')
          state.lateParent = { room: 'mallatrium', x: 580, y: 450, returnPosition: { x: 485, y: 375 } };
        else delete state.lateParent;
        sceneReturn = state.returnPosition;
      } else if ([3, 4, 5].includes(state.region)) {
        [state.x, state.y] = place().spawn;
        state.returnPosition = null;
      }
    }
  }
  // The three starters and their adults were strengthened; older saves catch up.
  for (const m of [...state.team, ...state.storage]) {
    const expected = SPECIES[m.id].base + m.level * 5;
    if ([0, 1, 2, 12, 13, 14].includes(m.id) && m.max < expected) {
      m.hp += expected - m.max;
      m.max = expected;
    }
  }
  leagueState();
  legendQuest();
  // A position saved on ground that is now solid moves to the nearest floor.
  recoverFloor();
  if (
    state.team.length &&
    !state.room &&
    !localTerrain(state.region, state.x, state.y) &&
    !(state.region === 0 && state.x >= 960 && state.x < 1920 && state.y >= 0 && state.y < 640)
  ) {
    const cells = floorCells(state.region);
    const floor = cells?.length
      ? cells.reduce((a, b) =>
          Math.hypot(b[0] - state.x, b[1] - state.y) < Math.hypot(a[0] - state.x, a[1] - state.y) ? b : a,
        )
      : null;
    if (floor) [state.x, state.y] = floor;
  }
  // The same for a player saved in Gang Senggol on ground that is no longer lane.
  if (
    state.team.length &&
    !state.room &&
    state.region === 0 &&
    state.x >= 960 &&
    !groundWalkable(state.x, state.y)
  ) {
    let best = null;
    FLOORS.gang.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue;
        const x = gangWorldX(c * 10),
          y = GANG_WORLD.y + r * 10;
        if (!best || Math.hypot(x - state.x, y - state.y) < Math.hypot(best[0] - state.x, best[1] - state.y))
          best = [x, y];
      }
    });
    if (best) [state.x, state.y] = best;
  }
}
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
  if (m.balanceRevision !== 1) {
    const next = SPECIES[m.id].base + m.level * 5;
    if (m.max !== next) {
      m.hp = m.hp > 0 ? Math.max(1, Math.min(next, Math.round((m.hp / m.max) * next))) : 0;
      m.max = next;
    }
    m.balanceRevision = 1;
  }
  return m;
};
