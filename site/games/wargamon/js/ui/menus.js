/* Dialogs and the panels around the map. */

// --- Dialog frame.
// A dialog that starts something (an animation, a stroke in progress) passes onClose to stop
// it. It runs once, when the dialog is closed (reason 'close', after it has left the page)
// or replaced by another dialog (reason 'replace', while it is still shown).
let dialogTeardown = null;
function endDialog(reason) {
  const teardown = dialogTeardown;
  dialogTeardown = null;
  teardown?.(reason);
}
// Every dialog goes through here once: translated, worded for play, names made canonical,
// its close button moved to a pinned footer.
function modal(html, kind = 'dialog', footer = null, { onClose = null } = {}) {
  endDialog('replace');
  html = canonicalText(translateHTML(html));
  if (footer !== null) footer = translateHTML(footer);
  held = null;
  navigation++;
  previousFocus = document.activeElement;
  let label = I18N.t('common.close');
  const closers = [...html.matchAll(/<button\b[^>]*data-act="close"[^>]*>([\s\S]*?)<\/button>/g)];
  if (closers.length) label = closers.at(-1)[1];
  html = html.replace(/<button\b[^>]*data-act="close"[^>]*>[\s\S]*?<\/button>/g, '');
  const controls =
    kind === 'starter' ? '' : (footer ?? `<button class="action" data-act="close">${label}</button>`);
  $('modal').innerHTML =
    `<section class="dialog menu-frame ${kind === 'dex' ? 'dex-frame' : ''}" role="dialog" aria-modal="true" aria-label="${kind === 'dex' ? 'Wargadex' : I18N.t('menu.aria')}"><div class="dialog-body">${html}<!--dialog-end--></div>${controls ? `<div class="dialog-controls">${controls}</div>` : ''}</section>`;
  $('modal').classList.remove('hidden');
  modalKind = kind;
  dialogTeardown = onClose;
  setTimeout(() => $('modal').querySelector('button')?.focus(), 0);
  translateDOM($('modal'));
}
// Adds content at the end of the open dialog's body. What is already there (inputs,
// listeners) stays as it is.
function appendMenu(html) {
  $('modal').querySelector('.dialog-body').insertAdjacentHTML('beforeend', translateHTML(html));
}
function closeModal(force = false) {
  if (modalKind === 'starter' && !force) return;
  $('modal').classList.add('hidden');
  $('modal').innerHTML = '';
  modalKind = '';
  endDialog('close');
  previousFocus?.focus?.();
}
function toast(message) {
  $('toast').textContent = tr(message);
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  // Long messages stay up longer: about one second per 12 characters, 3 to 8 seconds.
  const ms = Math.max(3000, Math.min(8000, $('toast').textContent.length * 85));
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), ms);
}
// Portrait of a character by portrait number.
// Residents show a deliberately loud placeholder until their real sprite cell is ready.
const isPlaceholderPortrait = id => Number(id) >= 100 && !castCells.has(Number(id));
function trainerArt(id) {
  if (isPlaceholderPortrait(id))
    return `<div class="trainer-sprite placeholder-actor" role="img" aria-label="${I18N.t('resident.placeholder')}"><span>?</span></div>`;
  if (Object.hasOwn(SERVICE_PORTRAITS, id))
    return `<div class="trainer-sprite service-portrait service-${id}" role="img" aria-label="${SERVICE_PORTRAITS[id]}"></div>`;
  if (RESIDENTS[id])
    return `<div class="trainer-sprite unified-actor actor-role-${actorRole(id)}" role="img" aria-label="${RESIDENTS[id].label}"></div>`;
  return `<div class="trainer-sprite cast${id} ${id < 8 ? 't' + id : ''}" role="img" aria-label="${TRAINERS.find(t => t.portrait === id)?.name || I18N.t('common.resident')}"></div>`;
}

// A character speaks, with their portrait. A short hint can sit underneath in small type.
function speak(who, line, hint = '') {
  const t = typeof who === 'number' ? TRAINERS[who] : who;
  modal(
    `<div class="portrait-head">${trainerArt(t.portrait)}<div>${t.role ? `<span class="eyebrow">${t.role.toUpperCase()}</span>` : ''}<h2>${t.name}</h2></div></div><p>“${line}”</p>${hint ? `<p class="story-hint">${hint}</p>` : ''}${closeButton()}`,
    'speech',
  );
}

// Journal locations follow the actual actor placement, including optional rooms.
function trainerLocationLabel(id) {
  if (place().points.some(p => p.id === id && ['trainer', 'stamp'].includes(p.key)))
    return I18N.t('journal.trainer.onMap');
  const key = Object.keys(ROOMS).find(key => ROOMS[key].points.some(p => p.key === 'trainer' && p.id === id));
  return key
    ? I18N.t('journal.trainer.room', { room: tr(ROOMS[key].name) })
    : I18N.t('journal.trainer.onMap');
}

// --- The panels around the map. Called after anything that changes what they show.
// update() only shows the game: it writes the header, journal, team, habitat panel,
// objective and toolbar, and autosaves what it showed. It may read anything, but it
// must not change `state`, the battle, the camera or the follower, and must not open
// a dialog. Bookkeeping happens where the change happens, before update() is called:
//   settleState()        the whole state was replaced, the team just formed or a
//                        fight ended: both of the below
//   settlePosition()     the player was put somewhere (camera.js)
//   checkDexMilestones() a creature joined outside a fight (dex.js)
// tests/pure-update.cjs holds update() to this.
function settleState() {
  checkDexMilestones();
  settlePosition();
}
function update() {
  const r = region(),
    activeRoom = room();
  // Header and journal.
  $('money').textContent = money(state.money);
  $('regionEyebrow').textContent = I18N.t('hud.eyebrow', {
    n: chapterOf() + 1,
    region: tr(r.name).toUpperCase(),
  });
  $('chapterTitle').textContent = activeRoom ? activeRoom.name : r.subtitle;
  $('location').textContent = activeRoom ? activeRoom.name : r.name;
  $('world').setAttribute('aria-label', activeRoom ? activeRoom.name : r.name);
  $('mapLabel').innerHTML =
    `${activeRoom ? activeRoom.name.toUpperCase() : r.name.toUpperCase()}<small>${I18N.t(activeRoom ? 'hud.map.roomExit' : r.trainers.length ? 'hud.map.explore' : r.wild.length ? 'hud.map.wild' : 'hud.map.peaceful')}</small>`;
  $('chapterCount').textContent =
    String(chapterOf() + 1).padStart(2, '0') + ' / ' + String(WORLD_CHAPTERS.length).padStart(2, '0');
  $('journalTitle').textContent = r.questName;
  $('journalGoal').textContent = r.goal;
  $('quests').innerHTML =
    `<div class="quest ${questDone() ? 'done' : 'active'}"><span class="badge">${questDone() ? '✓' : '!'}</span><div><strong>${r.questName}</strong><small>${state.region === REGION.HUTAN ? I18N.t('hud.quest.trash', { n: state.trash.length }) : state.region === REGION.PASAR_RAKYAT ? I18N.t('hud.quest.stamps', { n: state.stamps.length }) : I18N.t(questDone() ? 'common.done' : 'hud.quest.hint')}</small></div></div>` +
    r.trainers
      // The post-game cast stays out of the journal until it shows up on the map.
      .filter(id => place().points.every(p => p.id !== id || p.key !== 'trainer' || pointVisible(p)))
      .map(
        id =>
          `<div class="quest ${state.defeated.includes(id) ? 'done' : ''}"><span class="badge">${state.defeated.includes(id) ? '✓' : '•'}</span><div><strong>${TRAINERS[id].name}</strong><small>${trainerLineup(id).length} Wargamon, ${trainerLocationLabel(id)}</small></div></div>`,
      )
      .join('');
  $('tip').textContent = r.questText;
  $('party').innerHTML = state.team
    .slice(0, 3)
    .map(
      m =>
        `<div class="party-row">${monArt(m)}<div class="party-info"><strong>${monName(m)}</strong><small>Lv.${m.level}, ${m.hp}/${m.max}</small>${statusBadge(m)}${health(m)}</div></div>`,
    )
    .join('');
  renderTeamStrip();
  // Habitat panel.
  $('wildLevels').textContent = r.wild.length ? `Lv. ${r.levels.join('-')}` : I18N.t('hud.wild.peaceful');
  // Portraits are rebuilt only when the region changes, so they are not re-requested on every update.
  const wildList = $('wildSpecies');
  if (wildList._speciesRegion !== state.region) {
    if (r.wild.length)
      wildList.innerHTML = `<div class="wild-roster">${r.wild.map(id => creatureChip(id)).join('')}</div>`;
    else wildList.textContent = I18N.t('hud.wild.none');
    wildList._speciesRegion = state.region;
  }
  $('wildBtn').disabled = !!battle || locked || !!activeRoom || !r.wild.length || !followingMon();
  $('wildBtn').textContent = I18N.t(
    activeRoom ? 'hud.wild.leaveFirst' : r.wild.length ? 'hud.wild.search' : 'hud.wild.noHabitat',
  );
  $('wildHint').textContent = I18N.t(activeRoom ? 'hud.wild.hintRoom' : 'hud.wild.hint');
  $('placesList').innerHTML = spots()
    .map((p, i) => `<button data-new="goto" data-index="${i}">${p.name}</button>`)
    .join('');
  $('travelBtn').textContent = I18N.t(
    state.room
      ? 'hud.travel.exit'
      : state.region === REGIONS.length - 1
        ? 'hud.travel.map'
        : 'hud.travel.next',
  );
  save();
  // Objective strip and toolbar.
  const o = nextObjective();
  $('nextObjective').textContent = o.title;
  $('objectiveDetail').textContent = o.detail;
  $('guideBtn').textContent = I18N.t('hud.guide');
  $('guideBtn').disabled = !!battle || locked || !state.team.length;
  $('saveBtn').disabled = !!battle || locked || !state.team.length;
  $('loadBtn').disabled = !!battle || locked;
  $('newBtn').disabled = !!battle || locked;
  if (state.team.length && !battle)
    $('hint').textContent = followingMon()
      ? touchOnly()
        ? I18N.t('hint.touch', { name: SPECIES[followingMon().id].name })
        : I18N.t('hint.keys', { name: tr(SPECIES[followingMon().id].name) })
      : I18N.t('battle.fainted.hint');
  else if (state.region === REGION.HUTAN && !state.room) $('hint').textContent = I18N.t('hint.forest');
  $('screenTeam').disabled = locked || modalKind === 'starter';
  $('screenTeam').textContent = I18N.t(modalKind === 'team' ? 'hud.team.close' : 'hud.team.open');
  for (const id of ['quests', 'tip', 'journalGoal', 'objectiveDetail']) {
    const node = $(id);
    if (node?.innerHTML) node.innerHTML = canonicalText(node.innerHTML);
  }
  translateDOM(document.body);
  syncGangLocation();
}

// The team at a glance beside the money: one portrait and HP bar per creature, red and
// pulsing under a quarter of its HP. A tap opens Tim & Tas.
function renderTeamStrip() {
  const strip = $('teamStrip');
  if (!strip) return;
  const html = state.team
    .map((m, i) => {
      const share = m.max ? m.hp / m.max : 0,
        level = !m.hp ? 'fainted' : share < 0.25 ? 'low' : share <= 0.5 ? 'mid' : 'ok',
        label = I18N.t('strip.member', { name: tr(SPECIES[m.id].name), hp: m.hp, max: m.max });
      return `<button type="button" class="team-chip ${level}" data-strip="${i}" title="${label}" aria-label="${label}">${monArt(m)}<i class="team-chip-hp"><i style="width:${Math.max(0, Math.round(share * 100))}%"></i></i></button>`;
    })
    .join('');
  if (strip._html !== html) {
    strip.innerHTML = html;
    strip._html = html;
  }
  strip.setAttribute('aria-label', I18N.t('strip.aria'));
  strip.hidden = !state.team.length;
}
onClick(e => {
  if (e.target.closest?.('[data-strip]')) quickTeamToggle();
});

// A dialog that must not interrupt another one (a gift, the welcome back card) waits here
// until no fight, dialog or scripted walk is running, then shows in order.
const freeQueue = [];
function whenFree(show) {
  freeQueue.push(show);
  showQueuedDialog();
}
function showQueuedDialog() {
  if (freeQueue.length && !busy() && state.team.length) freeQueue.shift()();
}
setInterval(() => {
  showQueuedDialog();
  if (!document.hidden) noteSeen();
}, 400);

// --- Info pages.
function guideCards(cards, examples = false) {
  return `<div class="guide-grid">${cards.map(([icon, title, detail], index) => `<section class="guide-card"><span class="guide-icon" aria-hidden="true">${icon}</span><div><b>${title}</b><p>${detail}</p>${examples ? `<div class="guide-example"><small>${I18N.t('help.example')}</small>${index < 2 ? `<div class="guide-meter ${index ? 'fullness' : 'hp'}"><span style="width:${index ? 40 : 60}%">${index ? '40 / 100' : '60 / 100'}</span></div>` : `<span class="guide-condition">✚ ${STATUS.poison.name}</span>`}</div>` : ''}</div></section>`).join('')}</div>`;
}
// The levels a help card quotes come from the move rules, so the text cannot drift.
const HELP_LEVELS = { early: LEVEL_MOVE_AT, late: LATE_MOVE_AT };
function help(page = 0) {
  if (page === 4) {
    typeChart('Api');
    return;
  }
  // Each card is an icon and the catalog entries help.<key>.title and help.<key>.detail.
  const cards = list =>
    list.map(([icon, key]) => [
      icon,
      I18N.t(`help.${key}.title`, HELP_LEVELS),
      I18N.t(`help.${key}.detail`, HELP_LEVELS),
    ]);
  const basics = cards([
    ['⌨', 'basics.walk'],
    ['☝', 'basics.talk'],
    ['🗺', 'basics.map'],
    ['🎒', 'basics.team'],
    ['📓', 'basics.guide'],
    ['▣', 'basics.save'],
    ['↥', 'basics.load'],
    ['↺', 'basics.new'],
  ]);
  const battleCards = cards([
    ['①', 'battle.light'],
    ['③', 'battle.heavy'],
    ['🛡', 'battle.brace'],
    ['⇄', 'battle.switch'],
    ['◎', 'battle.accuracy'],
    ['↑', 'battle.level'],
  ]);
  const healthCards = cards([
    ['♥', 'health.hp'],
    ['🍚', 'health.fullness'],
    ['✚', 'health.condition'],
  ]);
  const recovery = cards([
    ['🍱', 'recovery.canteen'],
    ['🥣', 'recovery.mbg'],
    ['🛏', 'recovery.rest'],
    ['🏥', 'recovery.clinic'],
    [itemIcon('potions'), 'recovery.jamu'],
    [itemIcon('antidotes'), 'recovery.antidote'],
  ]);
  // Catching, the team, gear, the fifth move and evolution: what grows over a journey.
  const teamCards = cards([
    [itemIcon('balls'), 'team.catch'],
    [itemIcon('ultraballs'), 'team.odds'],
    ['👥', 'team.size'],
    ['🎽', 'team.gear'],
    ['⑤', 'team.moves'],
    ['✨', 'team.evolve'],
  ]);
  const title = I18N.t(`help.title.${[0, 1, 2, 3, 5].includes(page) ? page : 0}`);
  const body =
    page === 5
      ? guideCards(teamCards)
      : page === 1
        ? guideCards(battleCards)
        : page === 3
          ? guideCards(recovery)
          : page === 2
            ? guideCards(healthCards, true) +
              `<h3>${I18N.t('help.conditions')}</h3><div class="status-grid">${Object.values(STATUS)
                .map(s => `<div><b>${s.name}</b><small>${s.desc}</small></div>`)
                .join('')}</div>`
            : guideCards(basics);
  modal(
    `<div class="info-page"><h2>${title}</h2>${infoNav(page)}${body}${closeButton(I18N.t('common.close'))}</div>`,
    'help',
  );
}

// --- Team, bag and moves.
function teamMenu() {
  if (!state.team.length || locked || modalKind === 'starter') return;
  const bag = BAG_MEDICINES.map(k => {
    const it = medicineInfo(k),
      available = state.team.some(m => canUseMedicine(k, m));
    return `<button class="bag-medicine" data-over="medmenu" data-key="${k}" ${available ? '' : 'disabled'}>${itemIcon(k)}<span class="bag-item-heading"><b>${it.name}</b><span class="bag-quantity">×${itemCount(k)}</span></span><span class="bag-item-effect">${it.desc}</span><small>${I18N.t(!itemCount(k) ? 'medicine.unavailable.empty' : available ? 'bag.pickMon' : k === 'revive' ? 'bag.noneFainted' : 'bag.notNeeded')}</small></button>`;
  }).join('');
  modal(
    `<h2>${I18N.t('bag.teamAndBag')}</h2><section class="bag-panel" aria-label="${I18N.t('bag.medicineAria')}"><h3>${I18N.t('bag.medicine')}</h3><div class="bag-medicine-grid">${bag}</div></section>${goodsPanel()}<div class="team-menu-nav"><button class="action secondary" data-act="dex">Wargadex</button>${!battle ? `<button class="action secondary" data-refresh="daycare">${I18N.t('bag.daycare', { n: state.storage?.length || 0 })}</button>` : ''}<span>${I18N.t('bag.capsules', { n: state.balls, ultra: itemCount('ultraballs') })}</span></div><h3>${I18N.t('team.active', { n: state.team.length })}</h3><div class="team-list">${state.team.map((m, i) => `<section class="team-card">${monArt(m)}<div class="meta"><strong>${monName(m)}, Lv.${m.level}</strong>${batikTag(m)}<p>${typeLabel(m.id)}, HP ${m.hp}/${m.max}</p>${statusBadge(m)}${fullnessBadge(m)}${health(m)}</div><div class="team-member-actions"><button data-act="lead" data-id="${i}" ${i === 0 || !m.hp ? 'disabled' : ''}>${I18N.t(!m.hp ? 'team.fainted' : i === 0 ? 'team.lead' : 'team.pick')}</button><button data-over="kit" data-id="${i}">${I18N.t('team.moves')}</button>${!battle ? `<button data-league="equipment" data-id="${i}">${LEAGUE_ITEMS[m.heldItem]?.name || I18N.t('equipment.title')}</button>` : ''}</div></section>`).join('')}</div>${closeButton(I18N.t('common.back'))}`,
    'team',
  );
}
function kitMenu(id, mon = null) {
  modal(
    `<div class="portrait-head">${art(id)}<div><h2>${SPECIES[id].name}</h2><p>${typeLabel(id)}</p></div></div><p>${SPECIES[id].desc}</p><div class="kit-list">${kit(
      id,
      mon,
    )
      .map(mv => `<section class="move-card">${moveCard(mv)}</section>`)
      .join('')}</div>${closeButton()}`,
    'kit',
  );
  appendMenu(combatStats(id, mon));
}

// --- Menu.
function gameMenu() {
  if (locked || battle || modalKind === 'starter') return;
  const panelLabel = window.matchMedia?.('(max-width:780px)').matches
    ? I18N.t('world.menu')
    : I18N.t(explorationPanel ? 'explore.hide' : 'explore.show');
  modal(
    `<h2>${I18N.t('menu.title')}</h2><div class="menu-actions"><button data-ui="worldinfo">${I18N.t('world.menu')}<small>${I18N.t('world.menuDetail')}</small></button><button data-ui="info">ⓘ ${I18N.t('menu.guide')}<small>${I18N.t('menu.guide.hint')}</small></button><button data-ui="save">▣ ${I18N.t('menu.save')}<small>${I18N.t('menu.save.hint')}</small></button><button data-ui="load">↥ ${I18N.t('menu.load')}<small>${I18N.t('menu.load.hint')}</small></button><button data-ui="audio">♫ Audio<small>${I18N.t('menu.audio.hint')}</small></button><button data-ui="fullscreen">⛶ ${I18N.t('menu.fullscreen')}<small>${I18N.t('menu.fullscreen.hint')}</small></button></div><div class="save-transfer-actions"><button data-save-transfer="export">${saveText('export')}</button><button data-save-transfer="import">${saveText('import')}</button><button data-code="menu">${I18N.t('teamCode.title')}</button></div><div class="settings-bottom"><button class="secondary" data-district-ui="panel">${panelLabel}</button><label>Bahasa / Language <select data-ui="language">${I18N.options()}</select></label><button class="secondary" data-ui="speed" aria-pressed="${battleSpeed === 2}">${I18N.t('settings.speed', { n: battleSpeed })}</button><button class="secondary" data-ui="new">${I18N.t('menu.newGame')}</button></div>${closeButton(I18N.t('menu.resume'))}`,
    'settings',
  );
}
let typeSelected = 'Api';
async function fullscreenGame() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  try {
    await document.querySelector('.console').requestFullscreen();
  } catch {
    toast(I18N.t('menu.fullscreen.unsupported'));
  }
}
const TYPE_ICONS = {
  Api: '🔥',
  Daun: '🌿',
  Air: '💧',
  Batu: '🪨',
  Logam: '⚙️',
  Listrik: '⚡',
  Angin: '🌪️',
  Normal: '◯',
};
function infoNav(page) {
  return `<div class="info-tabs">${[0, 1, 5, 2, 3, 4].map(i => `<button class="${i === page ? 'selected' : ''}" data-info-page="${i}">${I18N.t(`help.tab.${i}`)}</button>`).join('')}</div>`;
}
function typeChart(selected = 'Api') {
  if (!TYPE_ICONS[selected]) selected = 'Api';
  typeSelected = selected;
  const ts = Object.keys(TYPE_ICONS),
    strong = typeStrengths(selected),
    weak = typeWeaknesses(selected),
    pos = ts.map((t, i) => [
      300 + 235 * Math.cos((i * Math.PI) / 4),
      145 + 110 * Math.sin((i * Math.PI) / 4),
    ]),
    sel = ts.indexOf(selected),
    edges = ts
      .map((t, i) => {
        const outgoing = strong.includes(t),
          incoming = weak.includes(t);
        if (!outgoing && !incoming) return '';
        const a = pos[outgoing ? sel : i],
          b = pos[outgoing ? i : sel],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          d = Math.hypot(dx, dy),
          color = outgoing ? '#24784b' : '#bc5a22';
        return `<line x1="${a[0] + (dx / d) * 32}" y1="${a[1] + (dy / d) * 27}" x2="${b[0] - (dx / d) * 37}" y2="${b[1] - (dy / d) * 30}" stroke="${color}" stroke-width="3" marker-end="url(#${outgoing ? 'good' : 'bad'})"/>`;
      })
      .join('');
  modal(
    `<div class="info-page"><h2>${I18N.t('types.title')}</h2>${infoNav(4)}<svg class="type-graph" viewBox="0 0 600 290" role="img" aria-label="${I18N.t('types.aria')}"><defs>${['good', 'bad'].map((s, i) => `<marker id="${s}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${i ? '#bc5a22' : '#24784b'}"/></marker>`).join('')}</defs>${edges}${ts.map((t, i) => `<g role="button" tabindex="0" data-refresh="type" data-type="${t}" aria-label="${I18N.t('types.pick', { type: tr(t) })}" style="cursor:pointer"><rect x="${pos[i][0] - 43}" y="${pos[i][1] - 25}" width="86" height="50" rx="16" fill="${t === selected ? '#234b3a' : '#dde6c9'}"/><text x="${pos[i][0]}" y="${pos[i][1] + 6}" text-anchor="middle" font-size="16" fill="${t === selected ? '#fff' : '#233b37'}">${TYPE_ICONS[t]} ${t}</text></g>`).join('')}</svg><div class="type-summary"><p><b>${I18N.t('types.strong')}</b> ${strong.map(t => TYPE_ICONS[t] + ' ' + t).join(', ') || I18N.t('types.none')} <small>×1,6</small></p><p><b>${I18N.t('types.weak')}</b> ${weak.map(t => TYPE_ICONS[t] + ' ' + t).join(', ') || I18N.t('types.none')} <small>${I18N.t('types.fromFoe')}</small></p></div><p class="type-footnote">${I18N.t('types.footnote')}</p>${closeButton(I18N.t('common.close'))}</div>`,
    'chart',
  );
}
