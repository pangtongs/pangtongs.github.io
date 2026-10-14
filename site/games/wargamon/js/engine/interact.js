/* Using what is on the map: activity points, conversations and wild encounters. */

// --- Using an activity point.
// Someone behind a counter or up on a stage is reached from the floor in front.
const reachOf = p => (p.behind || p.raised ? 95 : 70);
const chatTurns = new Map();
// Acts on the given point, or the nearest one, when the player stands within reach.
// What a point does is looked up by its key, in this order:
//   1. A hidden find underfoot (story/finds.js) comes before any marked point, when E is
//      pressed without a particular point.
//   2. OPEN_INTERACTIONS: places and people that work before the player has a team. A
//      handler there may return PASS_ON to hand the point to the next stage.
//   3. With no team, nothing else happens.
//   4. TEAM_INTERACTIONS: everything else. A key without a handler does nothing.
function interact(p) {
  if (!p && pickUpFind()) return;
  p ??= nearest();
  if (!p || busy() || Math.hypot(state.x - p.x, state.y - p.y) > reachOf(p)) return;
  if (useInteraction(OPEN_INTERACTIONS, p) !== PASS_ON) return;
  if (!state.team.length) return;
  useInteraction(TEAM_INTERACTIONS, p);
}
// Returned by a handler that leaves the point to the next stage (or to nothing).
const PASS_ON = Symbol('pass on');
function useInteraction(table, p) {
  return Object.hasOwn(table, p.key) ? table[p.key](p) : PASS_ON;
}
// Scripts loaded after this one add the point kinds of their own chapter here. A key has
// one handler per stage; a second one is a mistake, not an override.
function addInteraction(table, key, handler) {
  if (Object.hasOwn(table, key)) throw Error(`Point key "${key}" already has a handler`);
  table[key] = handler;
}

// Stage 2: no team needed. Added elsewhere: darto (story/seberang.js).
const OPEN_INTERACTIONS = {
  pitstop: p => pitStop(p),
  camp: p => campDialog(p),
  // Gang Senggol and the dawn market play their own scenes; other district points do
  // nothing when used.
  district: p => (p.district === 'gang' || state.room === 'pasarsubuh' ? districtScene(p) : PASS_ON),
  chat: p => chatWith(p),
  latehall: () => enterRoom('championhall'),
  latefood: () => meal(),
  researchnote: () => readResearchNote(),
  // The clinic's own reception desk; a clinic point elsewhere treats for free (stage 4).
  clinic: () => (state.room === 'clinic' ? clinicReception() : PASS_ON),
  civic: p => useCivicPoint(p),
  news: () => consequences(),
  // Rajapari's shore waits while the coast decision is still open (ui/civic.js).
  legend: p =>
    p.id === 19 && civicState().choices.coast === 0 && !civicState().resolved.includes('coast')
      ? consequences()
      : PASS_ON,
};

// Stage 4: with a team. Added elsewhere: mart_sela and mart_prices (ui/mart.js), the
// reservoir puzzles (story/waduk.js), tower (story/tower.js), and seberang, komodo and
// elangkasa (story/seberang.js).
const TEAM_INTERACTIONS = {
  // Moving between places.
  door: p =>
    p.room === 'clinic'
      ? whenLeagueAllows(() => enterRoom(p.room), 'league.clinicClosed')
      : enterRoom(p.room),
  exit: () => exitRoom(),
  connector: p => useConnector(p),
  passage: p => travel(p.to),
  next: p => walkOn(p),
  back: p => walkOn(p),
  // People and creatures.
  trainer: p => trainerIntro(p.id),
  wild: p => encounter(p),
  quest: () => questDialog(),
  tutor: () => tutorMenu(),
  // Services. Most close while the League is running.
  pharmacy: () => shop(),
  shop: p => deliverJob(p) || whenLeagueAllows(() => shop()),
  daycare: () => whenLeagueAllows(() => daycareMenu()),
  clinic: () => whenLeagueAllows(() => freeTreatment()),
  meal: () => whenLeagueAllows(() => meal()),
  spring: () => useSpring(),
  tea: () => drinkTea(),
  // Story devices.
  league: () => leagueMenu(),
  hall: () => hallMenu(),
  tradecode: () => teamCodeMenu(),
  tarsion: () => tarsionMenu(),
  resonator: () => resonanceMenu(),
  rail: () => railMenu(),
  dispatch: () => dispatchMenu(),
  parcel: p => deliverOrder(p.id),
  power: () => puzzleGate(REGION.FESTIVAL) && powerMenu(),
  valves: () => puzzleGate(REGION.PESISIR) && valveMenu(),
  signals: () => puzzleGate(REGION.PUNCAK) && signalMenu(),
  legend: p => legendMenu(p.id),
  // In Agustusan week the pitch hosts all the Lomba 17-an (lomba.js).
  shoot: () => (agustusan() ? lombaHub() : penaltyGame()),
  // Chapter one and two errands.
  trash: p => pickUpTrash(p),
  permit: () => askForPermit(),
  stamp: () => collectStamp(),
  board: () => readBoard(),
  timetable: () => readTimetable(),
};

// --- What the handlers above do, where it takes more than one call.
// A service that closes for the League says so instead (the toast key may be given).
function whenLeagueAllows(use, closed = 'league.facilitiesClosed') {
  if (leagueState().active) toast(I18N.t(closed));
  else use();
}
// The road signs at the edge of an area: on the world map they walk across the seam;
// in a room they lead to the next area or back to the previous one.
function walkOn(p) {
  if (!state.room) walkConnection(p.key === 'next' ? 1 : -1);
  else if (p.key === 'next') nextArea();
  else travel(state.region - 1);
}
function campDialog(p) {
  modal(
    `<h2>${shortPlaceName(p)}</h2><p>${I18N.t('health.rest.body')}</p><button class="action" data-refresh="rest" ${state.money < REST_FEE || state.team.every(m => m.hp === m.max) ? 'disabled' : ''}>${I18N.t('health.rest.button')}</button>${waitButton()}${campExtras(p)}${closeButton(I18N.t('common.later'))}`,
    'rest',
  );
}
// Townspeople take turns through what they have to say.
function chatWith(p) {
  chatTurns.set(p.name, ((chatTurns.get(p.name) ?? -1) + 1) % p.lines.length);
  // Residents keep their lines as catalog keys; older chats hold the text itself.
  const raw = p.lines[chatTurns.get(p.name)],
    line = festiveLine(p, chatTurns.get(p.name)) || (/^resident\.\d+\.\d+$/.test(raw) ? I18N.t(raw) : raw);
  // Hosts of a cultural activity (culture.js) show it under their line.
  if (cultureChat(p, line)) return;
  if (p.portrait === undefined) {
    modal(`<h2>${p.name}</h2><p>${line}</p>${closeButton()}`, 'inspection');
    return;
  }
  const [name, role] = p.name.split(', ');
  speak({ name, role, portrait: p.portrait }, line);
}
function readResearchNote() {
  modal(
    `<h2>${I18N.t('research.note.title')}</h2><p>${I18N.t('research.note.body')}</p>` + closeButton(),
    'research',
  );
}
// The permit broker who was paid comes back as a shop, until he is reported.
function useCivicPoint(p) {
  if (p.id === 'permit' && civicState().choices.permit === 0 && civicState().claimed.includes('permit')) {
    if (civicState().resolved.includes('reported'))
      modal(
        `<h2>${I18N.t('civic.permit.sealed.title')}</h2><p>${I18N.t('civic.permit.sealed.body')}</p>${closeButton()}`,
      );
    else shop();
    return;
  }
  civicMenu(p.id);
}
// The spring hands out two jamu, once.
function useSpring() {
  if (state.springSupplies) {
    toast(I18N.t('spring.alreadyFull'));
    return;
  }
  state.springSupplies = true;
  state.potions += 2;
  update();
  modal(
    `<h2>${I18N.t('spring.title')}</h2><p>${I18N.t('spring.body')}</p><p>${I18N.t('spring.once')}</p>${closeButton()}`,
  );
}
function drinkTea() {
  if (!state.team.some(m => m.hp < m.max)) {
    toast(I18N.t('tea.fullHp'));
    return;
  }
  const teaFee = mealFee(1000);
  state.money -= teaFee;
  if (!teaFee) toast(I18N.t('heal.free'));
  // Bu Sari's stall is the first place to recover, so her tea restores the whole team.
  if (state.room === 'warung') {
    state.team.forEach(m => (m.hp = m.max));
    update();
    toast(I18N.t('tea.full'));
    return;
  }
  state.team.forEach(m => (m.hp = Math.min(m.max, m.hp + 25)));
  update();
  toast(I18N.t('tea.small'));
}
// Hutan Pinggir Kota's clean-up: three bags of rubbish.
function pickUpTrash(p) {
  if (!state.trash.includes(p.id)) state.trash.push(p.id);
  update();
  toast(I18N.t(state.trash.length === 3 ? 'trash.countDone' : 'trash.count', { n: state.trash.length }));
}
// Pak RT issues the travel permit once Bu Sari's parcel is in hand and Sukamaju's
// challengers are beaten.
function askForPermit() {
  const required = REGIONS[REGION.SUKAMAJU].required;
  if (!has('parcel') || !required.every(i => state.defeated.includes(i))) {
    const names = required
      .filter(i => !state.defeated.includes(i))
      .map(i => tr(TRAINERS[i].name))
      .join(', ');
    modal(
      `<h2>${I18N.t('permit.notYet.title')}</h2><p>“${I18N.t('permit.notYet.body', { list: names || I18N.t('permit.collectSupplies') })}”</p>${closeButton()}`,
    );
    return;
  }
  if (!has('permit')) state.quests.push('permit');
  update();
  modal(`<h2>${I18N.t('permit.issued.title')}</h2><p>${I18N.t('permit.issued.body')}</p>${closeButton()}`);
}
// Pasar Rakyat's two stamps: Bu Sri at the market, and the warung in the city.
function collectStamp() {
  const id = state.room === 'warungcity' ? 'warung' : 'sri';
  const sriHeader = () =>
    `<div class="portrait-head">${trainerArt(PLACES[REGION.PASAR_RAKYAT].points.find(point => point.key === 'stamp').portrait)}<div><h2>${I18N.t('terminal.stamp.sriName')}</h2><p>${I18N.t('terminal.stamp.role')}</p></div></div>`;
  const rematch =
    id === 'sri'
      ? `<button class="action secondary" data-new="sri-battle">${I18N.t('terminal.stamp.match')}</button>`
      : '';
  if (state.stamps.includes(id)) {
    const reminder = I18N.t(
      state.stamps.length === 2
        ? 'terminal.stamp.both'
        : id === 'sri'
          ? 'terminal.stamp.sriAgain'
          : 'terminal.stamp.warungAgain',
    );
    modal(
      `${id === 'sri' ? sriHeader() : `<h2>${I18N.t('terminal.stamp.warungName')}</h2>`}<p>${reminder}</p>${rematch}${closeButton()}`,
    );
    return;
  }
  state.stamps.push(id);
  update();
  modal(
    `${id === 'sri' ? sriHeader() : `<h2>${I18N.t('terminal.stamp.warungTitle')}</h2>`}<p>${I18N.t(id === 'sri' ? 'terminal.stamp.sriIntro' : 'terminal.stamp.warungIntro')} ${I18N.t('terminal.stamp.count', { n: state.stamps.length })}</p>${rematch}${closeButton()}`,
  );
}
// The notice board tells the area's story and its task.
function readBoard() {
  const paragraphs = region()
    .story.split(/\n\s*\n/)
    .map(text => `<p>${tr(text)}</p>`)
    .join('');
  modal(
    `<h2>${I18N.t('board.title')}</h2>${paragraphs}<p><b>${region().questText}</b></p><div class="actions">${closeButton()}</div>`,
  );
}
function readTimetable() {
  modal(
    `<h2>${I18N.t('terminal.timetable.title')}</h2><p>${I18N.t('terminal.timetable.body')}</p>${closeButton()}`,
    'timetable',
  );
}
let sceneReturn = null;
function findWild() {
  if (busy() || state.room || !region().wild.length) return;
  if (nyepiSilent()) {
    toast(I18N.t('cal.nyepi.noWild'));
    return;
  }
  if (!followingMon()) {
    toast(I18N.t('battle.fainted.recover'));
    return;
  }
  const p = nearestHabitat();
  if (!p) {
    toast(I18N.t('wild.noHabitat'));
    return;
  }
  if (Math.hypot(state.x - p.x, state.y - p.y) < 65) encounter(p);
  else autoWalk(p);
}
function questDialog({ teaHealed = false } = {}) {
  let title, body;
  if (state.region === REGION.SUKAMAJU) {
    const firstVisit = !has('parcel');
    title = firstVisit ? I18N.t('warung.firstVisit.title') : I18N.t('warung.tea.title');
    if (firstVisit) {
      state.quests.push('parcel');
      state.potions += 2;
    }
    body = `“${I18N.t(firstVisit ? 'warung.firstVisit.greeting' : 'warung.tea.greeting')}”</p><p>${I18N.t('warung.tea.hint')}`;
  } else if (state.region === REGION.PADANG_OJEK) {
    // The parcel and its reward come once; afterwards Bang Ujang just chats.
    const delivered = has('delivery');
    title = I18N.t(delivered ? 'ojek.chat.title' : 'ojek.parcel.title');
    if (!delivered) {
      state.quests.push('delivery');
      state.balls += 3;
      state.potions += 2;
    }
    const left = REGIONS[REGION.PADANG_OJEK].required.filter(id => !state.defeated.includes(id)).length;
    body = delivered
      ? `“${I18N.t(left ? 'ojek.chat.challengers' : 'ojek.chat.clear', { n: left })}”`
      : `“${I18N.t('ojek.parcel.received')}”`;
  } else if (state.region === REGION.PASAR_RAKYAT) {
    title = I18N.t('terminal.ticket.title');
    if (has('ticket')) body = I18N.t('terminal.ticket.again');
    else if (state.stamps.length < 2) body = I18N.t('terminal.ticket.needStamps');
    else if (state.seen.filter(i => i < 12).length < 3) body = `“${I18N.t('terminal.ticket.needSeen')}”`;
    else {
      state.quests.push('ticket');
      state.balls += 3;
      body = `“${I18N.t('terminal.ticket.first')}”`;
    }
  } else {
    title = I18N.t('route.notes.title');
    body = region().questText;
  }
  if (!state.balls && state.money < 3000) {
    state.balls = 1;
    body += ' ' + I18N.t('quest.emergencyCapsule');
  }
  update();
  if (state.room === 'warung' && state.region === REGION.SUKAMAJU) {
    const sari = ROOMS.warung.points.find(p => p.key === 'quest');
    modal(
      `<div class="portrait-head">${trainerArt(sari.portrait)}<div><h2>Bu Sari</h2><p>${title}</p></div></div><p>${body}</p>${teaHealed ? `<p class="story-hint" role="status">${I18N.t('tea.full')}</p>` : ''}<button class="action" data-warung="tea" ${!state.team.some(m => m.hp < m.max) ? 'disabled' : ''}>${I18N.t(state.team.some(m => m.hp === 0) ? 'warung.tea.reviveButton' : 'warung.tea.button')}</button>${takjilCard()}${closeButton()}`,
      'warung',
    );
  } else modal(`<h2>${title}</h2><p>${body}</p>${closeButton()}`);
}
const LATE_ROOM_KEYS = ['leaguearena', 'championhall', 'researchlab', 'calderacamp', 'calderacoop'];
let pendingWild = null;
function startWild(request) {
  startBattle(null, [[request.id, request.level]]);
  if (battle && request.variant) {
    battle.enemy.variant = true;
    battle.enemy.batik = rollBatik(request.id);
    battle.log = I18N.t('wild.variant.batik', {
      name: SPECIES[request.id].name,
      batik: batikName(battle.enemy.batik),
    });
    renderBattle();
  }
}
function revealWildEncounter(request) {
  const ids = new Set([request.id, ...state.team.map(mon => mon.id)]);
  Promise.all([...ids].map(preparePortrait)).then(
    () => {
      if (pendingWild !== request || modalKind !== 'wild-loading' || state.region !== request.region) return;
      pendingWild = null;
      closeModal();
      startWild(request);
    },
    () => {
      if (pendingWild !== request || modalKind !== 'wild-loading') return;
      modal(
        `<h2>${I18N.t('wild.failed')}</h2><button data-wild-retry="true">${I18N.t('loading.retry')}</button>${closeButton(I18N.t('loading.back'))}`,
        'wild-loading',
      );
    },
  );
}
// The habitat of this region nearest to the player.
function nearestHabitat() {
  const habitats = spots().filter(p => p.key === 'wild');
  return habitats.sort(
    (a, b) => Math.hypot(state.x - a.x, state.y - a.y) - Math.hypot(state.x - b.x, state.y - b.y),
  )[0];
}
function encounter(habitat = nearestHabitat()) {
  if (busy() || state.room || !state.team.length || !region().wild.length) return;
  // Nyepi: the day of silence keeps everyone, wild Wargamon included, indoors.
  if (nyepiSilent()) {
    toast(I18N.t('cal.nyepi.noWild'));
    return;
  }
  if (!followingMon()) {
    toast(I18N.t('battle.fainted.recover'));
    return;
  }
  // Weighted pick: starters and the rare bird are uncommon, and civic decisions
  // can thin or remove a habitat. A habitat with its own species list (water beside
  // a pier, grass on the quay) draws only from those. Today's news and a kite flown well
  // shift the weights (daily-news.js).
  const pool = todaysWeights().filter(v =>
    v.night
      ? v.night === (habitat?.habitat === 'water' ? 'water' : 'grass')
      : v.guest
        ? guestHabitat(habitat, v.id)
        : !habitat?.species || habitat.species.includes(v.id),
  );
  if (!pool.length) return;
  let roll = Math.random() * pool.reduce((n, v) => n + v.weight, 0),
    id = pool.at(-1).id;
  for (const v of pool) {
    roll -= v.weight;
    if (roll < 0) {
      id = v.id;
      break;
    }
  }
  spendLantern();
  spendKiteLure();
  // A habitat may keep its own ages: Kawah Dieng's temple yard has young Stupik.
  const levels = habitat?.levels || regionLevels(),
    level = levels[0] + Math.floor(Math.random() * (levels[1] - levels[0] + 1));
  // A creature found above its evolution level has already grown into its next form.
  // A lost starter (ids 0-2) is the exception: it is still young, so the Wargadex
  // entry for its first form can be filled.
  while (id > 2 && EVOLUTIONS[id] && level >= EVOLUTIONS[id].level) id = EVOLUTIONS[id].to;
  // One wild creature in 128 wears rare colours.
  pendingWild = { region: state.region, id, level, variant: Math.random() < rareBoost() / 128 };
  if (
    [id, ...state.team.map(mon => mon.id)].every(
      species => imageState(loadMapImage(creaturePortraitPath(species))) === 'ready',
    )
  ) {
    const request = pendingWild;
    pendingWild = null;
    startWild(request);
    return;
  }
  modal(
    `<h2>${I18N.t('wild.loading')}</h2><p role="status">${SPECIES[id].name}</p>${closeButton(I18N.t('loading.back'))}`,
    'wild-loading',
  );
  revealWildEncounter(pendingWild);
}
