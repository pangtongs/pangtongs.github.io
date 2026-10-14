/* Saves: what a valid save looks like, writing the autosave, and bringing any save
 (autosave, slot or imported backup) up to the current game. Loaded before game.js,
 which reads the autosave at start-up. */
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

// Data that fails to parse or validate is never written over. Before anything could replace
// it, it is copied into one quarantine list (KEY + '-quarantine'), with where it came from and
// when, so it can still be recovered by hand. Only the latest QUARANTINE_KEEP copies stay,
// so the list cannot grow until storage is full. Returns false when the copy could not be kept.
const QUARANTINE_KEEP = 5;
function quarantineSave(source, raw) {
  try {
    const key = KEY + '-quarantine',
      kept = localStorage.getItem(key);
    let list = [];
    if (kept != null) {
      try {
        list = JSON.parse(kept);
      } catch {
        list = null;
      }
      // A quarantine list that is itself unreadable becomes its first entry.
      if (!Array.isArray(list)) list = [{ source: 'quarantine', at: null, raw: kept }];
    }
    if (!list.some(entry => entry && entry.source === source && entry.raw === raw))
      list.push({ source, at: new Date().toISOString(), raw: String(raw) });
    localStorage.setItem(key, JSON.stringify(list.slice(-QUARANTINE_KEEP)));
    return true;
  } catch {
    return false;
  }
}
// Set at start-up when an unreadable autosave could not be copied away: autosaving then stops
// rather than replace the only copy.
let autosaveBlocked = false;
// Before another save takes over (an import, a loaded slot), the unreadable autosave gets
// one more try at quarantine. Once it is copied away, autosaving resumes; until then the
// game keeps its hands off it. Returns whether the autosave may be written.
function unblockAutosave() {
  if (!autosaveBlocked) return true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null || quarantineSave('autosave', raw)) autosaveBlocked = false;
  } catch {}
  return !autosaveBlocked;
}
function save() {
  if (autosaveBlocked) {
    $('saveStatus').textContent = I18N.t('save.blocked');
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    $('saveStatus').textContent = I18N.t('save.status', { n: Math.floor(state.seconds / 60) });
    // Milestones shared with Warga Tactics (story/universe.js).
    if (typeof syncUniverse === 'function') syncUniverse();
  } catch {
    $('saveStatus').textContent = I18N.t('save.unavailable');
  }
}

// Saves from this browser's storage are trusted less than the game's own data: any
// text in them loses the characters that could form markup when shown in a dialog.
function cleanSaveText(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (typeof value[key] === 'string') value[key] = value[key].replace(/[<>&"'`]/g, '');
    else cleanSaveText(value[key], depth + 1);
  }
}
const savedMons = () => [...state.team, ...state.storage];

// --- Migrations, oldest first. Entry n brings a save from schema n to schema n + 1; each
// runs once per save, from migrateSave, and a new game starts at SAVE_SCHEMA. Saves written
// before the schema number existed have schema 0. Some of them recorded a step in a flag
// of its own (balanceRevision, chapterTwoRevision, economyRevision); those steps read the
// flag, so a step such a save already took is not taken again, and then drop it.
const SAVE_MIGRATIONS = [
  // 1. Fields renamed or retired early on.
  () => {
    delete state.adventureClaims;
    // A single tutored move used to be stored as tutorMove and always took slot 4.
    for (const m of savedMons())
      if (m.tutorMove) {
        if (!m.learnedMoves && TUTOR_MOVES[m.tutorMove]) m.learnedMoves = { 3: m.tutorMove };
        delete m.tutorMove;
      }
  },
  // 2. Creature HP became base + 5 per level; a hurt creature keeps its share of HP.
  () => savedMons().forEach(rebalanceMon),
  // 3. The replacement chapter two retains all IDs, quests, victories and owned creatures.
  // Only positions referring to the former paintings are replaced.
  () => {
    const done = state.chapterTwoRevision === 1;
    delete state.chapterTwoRevision;
    if (
      done ||
      ![REGION.PASAR_RAKYAT, REGION.BALAI_BETON, REGION.FESTIVAL, REGION.WARGAMALL].includes(state.region)
    )
      return;
    if (state.region === REGION.PASAR_RAKYAT && state.room === 'shop') state.room = 'terminalshop';
    const owner = {
      clinic: REGION.PASAR_RAKYAT,
      warungcity: REGION.PASAR_RAKYAT,
      gym: REGION.BALAI_BETON,
      stage: REGION.FESTIVAL,
      terminalshop: REGION.WARGAMALL,
      mallatrium: REGION.WARGAMALL,
      pasarsubuh: REGION.WARGAMALL,
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
    } else if ([REGION.PASAR_RAKYAT, REGION.BALAI_BETON, REGION.FESTIVAL].includes(state.region)) {
      [state.x, state.y] = place().spawn;
      state.returnPosition = null;
    }
  },
  // 4. The three starters and their adults were strengthened; older saves catch up.
  () => {
    for (const m of savedMons()) {
      const expected = SPECIES[m.id].base + m.level * 5;
      if ([0, 1, 2, 12, 13, 14].includes(m.id) && m.max < expected) {
        m.hp += expected - m.max;
        m.max = expected;
      }
    }
  },
  // 5. A one-time stipend keeps old saves playable under the current economy.
  () => {
    const done = state.economyRevision === 24;
    delete state.economyRevision;
    if (done) return;
    state.money += 100000;
    for (const m of savedMons())
      if (m.id === 19) {
        const extra = Math.max(0, SPECIES[19].base + m.level * 5 - m.max);
        m.max += extra;
        if (m.hp > 0) m.hp += extra;
      }
  },
  // 6. A save from the terminal's former shared shop room belongs to the terminal minimarket.
  () => {
    if (state.region !== REGION.PASAR_RAKYAT || state.room !== 'shop') return;
    state.room = 'terminalshop';
    state.region = REGION.WARGAMALL;
    state.returnPosition = { x: 120, y: 400 };
    sceneReturn = state.returnPosition;
  },
  // 7. Hidden finds and road ambushes are recorded; an older save has met neither yet.
  () => {
    state.finds ??= [];
    state.ambushes ??= [];
  },
  // 8. Futsal pays a daily prize and keeps a goal record instead of three Rp3.000 prizes.
  () => {
    delete state.penalties;
    state.futsal ??= { best: 0, streak: 0, day: -1 };
  },
  // 9. Rematch prizes are dated by the player's local day number, not a UTC date string.
  () => {
    for (const [id, day] of Object.entries(state.rematchPaid || {}))
      if (typeof day === 'string') state.rematchPaid[id] = Math.floor(Date.parse(day) / 86400000) || -1;
  },
  // 10. Rare colours became batik palettes: each rare-coloured creature gets the one its
  // species and place in the save always give. The Menara Tanding record and the team-code
  // record start empty (tower.js, team-codes.js).
  () => {
    savedMons().forEach((m, i) => {
      if (m.variant && !Object.hasOwn(BATIK_PALETTES, m.batik)) m.batik = batikFromSeed(`${m.id}:${i}`);
    });
    state.tower ??= freshTower();
    state.trades ??= freshTrades();
  },
  // 11. Calendar events (calendar.js) and the minigames (minigames.js) keep records of
  // their own: claims per event and year, and each game's daily prize.
  () => {
    state.calendar ??= { claimed: [] };
    state.minigames ??= { paid: {} };
  },
];
const SAVE_SCHEMA = SAVE_MIGRATIONS.length;
// Migration 2 for one creature: rescales its HP to the current formula once.
function rebalanceMon(m) {
  if (m.balanceRevision !== 1) {
    const next = SPECIES[m.id].base + m.level * 5;
    if (m.max !== next) {
      m.hp = m.hp > 0 ? Math.max(1, Math.min(next, Math.round((m.hp / m.max) * next))) : 0;
      m.max = next;
    }
  }
  delete m.balanceRevision;
  return m;
}

// Brings any save (autosave, slot or imported backup) up to the current game: first the
// migrations it has not had yet, then the checks every load repeats against the current
// data, because maps and rooms change without a migration: fields added since, rooms that
// no longer exist, ground that became solid.
function migrateSave() {
  cleanSaveText(state);
  state.stamps ??= [];
  state.meals ??= 0;
  state.restUsed ??= false;
  state.antidotes ??= 3;
  state.storage ??= [];
  // Battles are not saved, so a ronda or macet chain cannot continue after a load.
  delete state.ronda;
  savedMons().forEach(m => {
    normalise(m);
    clearBattleFlags(m);
  });
  // A save standing in a room that no longer exists (or in Gang Senggol from when it
  // was a room) starts again at the Sukamaju spawn.
  if (state.room && (!Object.hasOwn(ROOMS, state.room) || state.room === 'gangsenggol')) {
    state.room = null;
    state.region = REGION.SUKAMAJU;
    [state.x, state.y] = PLACES[REGION.SUKAMAJU].spawn;
    state.returnPosition = null;
    delete state.lateParent;
  }
  const schema = Number.isInteger(state.schema) && state.schema > 0 ? state.schema : 0;
  for (let n = schema; n < SAVE_SCHEMA; n++) SAVE_MIGRATIONS[n]();
  state.schema = Math.max(schema, SAVE_SCHEMA);
  leagueState();
  legendQuest();
  towerState();
  tradeState();
  // Batik belongs to rare colours only; a rare creature without a known palette gets its own.
  savedMons().forEach((m, i) => {
    if (!m.variant) delete m.batik;
    else if (!Object.hasOwn(BATIK_PALETTES, m.batik)) m.batik = batikFromSeed(`${m.id}:${i}`);
  });
  // A position saved on ground that is now solid moves to the nearest floor.
  recoverFloor();
  if (
    state.team.length &&
    !state.room &&
    !localTerrain(state.region, state.x, state.y) &&
    !(state.region === REGION.SUKAMAJU && state.x >= 960 && state.x < 1920 && state.y >= 0 && state.y < 640)
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
    state.region === REGION.SUKAMAJU &&
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
