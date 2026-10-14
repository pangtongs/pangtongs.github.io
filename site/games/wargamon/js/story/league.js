/* League progression, one legendary quest, and late-game team preparation. */
for (const name of ['img/maps/exterior/4-2.webp', 'img/maps/exterior/4-3.webp', 'img/maps/exterior/4-4.webp'])
  deferMapImage(name);
const ELITE_IDS = [44, 45, 46, 47, 48];
function leagueState() {
  state.league ??= { active: false, stage: 0, clears: 0, hall: [] };
  state.league.hall ??= [];
  return state.league;
}
function legendQuest() {
  return (chapterState().tarsion ??= { started: false, panels: [0, 0, 0], open: false });
}
function ownsTarsion() {
  return (
    (state.legendCaught || []).includes(47) ||
    [...state.team, ...(state.storage || [])].some(m => m.id === 47)
  );
}
function leagueMenu() {
  if (battle || locked || state.region !== REGION.LIGA) return;
  const l = leagueState();
  modal(
    `<h2>${I18N.t(l.active ? 'league.run' : 'league.name')}</h2><p>${I18N.t('league.rules')}</p><ol class="elite-line">${ELITE_IDS.map((id, i) => `<li class="${l.active && i === l.stage ? 'current' : ''}"><b>${l.active && i < l.stage ? '✓ ' : ''}${TRAINERS[id].name}</b><small>${I18N.t('league.eliteLine', { role: tr(TRAINERS[id].role), n: trainerLineup(id).length, level: Math.min(80, TRAINERS[id].team.at(-1)[1] + l.clears * 5) })}</small></li>`).join('')}</ol><p>${I18N.t(l.active ? 'league.restartRule' : 'league.startHint')}</p><div class="actions"><button class="action" data-league="${l.active ? 'continue' : 'begin'}">${l.active ? I18N.t('league.continue', { n: l.stage + 1 }) : I18N.t('league.begin')}</button>${closeButton(I18N.t('league.prepare'))}</div>`,
    'league',
  );
}
function beginLeague() {
  if (
    battle ||
    locked ||
    state.region !== REGION.LIGA ||
    !gateReady(REGION.OBSERVATORIUM) ||
    !state.team.some(m => m.hp > 0)
  )
    return;
  const l = leagueState();
  if (!l.active) {
    l.active = true;
    l.stage = 0;
  }
  save();
  continueLeague();
}
function abandonLeague() {
  const l = leagueState();
  if (!l.active) return;
  l.active = false;
  l.stage = 0;
  save();
  toast(I18N.t('league.ended'));
}
function tarsionMenu() {
  if (state.region !== REGION.OBSERVATORIUM || battle || locked) return;
  if (ownsTarsion()) {
    modal(`<h2>${I18N.t('tarsion.done.title')}</h2><p>${I18N.t('tarsion.done.body')}</p>${closeButton()}`);
    return;
  }
  if (!has('champion')) {
    modal(
      `<h2>${I18N.t('tarsion.waiting.title')}</h2><p>${I18N.t('tarsion.waiting.body')}</p>${closeButton()}`,
    );
    return;
  }
  const q = legendQuest();
  if (!q.started) {
    q.started = true;
    save();
  }
  if (!q.open) {
    resonanceMenu();
    return;
  }
  modal(
    `<div class="portrait-head">${art(47)}<div><h2>Tarsion, Lv.68</h2><p>${typeLabel(47)}</p></div></div><p>${I18N.t('tarsion.open.body')}</p><div class="actions"><button class="action" data-league="legendfight" ${state.balls + (state.ultraballs || 0) < 1 ? 'disabled' : ''}>${I18N.t('tarsion.approach')}</button>${closeButton(I18N.t('league.prepare'))}</div>`,
    'tarsion',
  );
}
const RESONANCE_NAMES = ['moon', 'sun', 'star'].map(k => I18N.t(`resonance.${k}`)),
  RESONANCE_DIRS = [
    ['↑', 'north'],
    ['→', 'east'],
    ['↓', 'south'],
    ['←', 'west'],
  ].map(([arrow, k]) => `${arrow} ${I18N.t(`direction.${k}`)}`);
function resonanceMenu() {
  if (state.region !== REGION.OBSERVATORIUM || battle || locked) return;
  if (!has('champion')) {
    tarsionMenu();
    return;
  }
  const q = legendQuest();
  q.started = true;
  save();
  modal(
    `<h2>${I18N.t('quest.tarsion.name')}</h2><p>${q.open ? I18N.t('resonance.opened') : `${I18N.t('resonance.notes')} <b>${I18N.t('resonance.notes.sun')}</b> ${I18N.t('resonance.notes.rest')}`}</p><div class="waduk-puzzle resonance">${RESONANCE_NAMES.map((name, i) => `<section class="activity-panel"><b>${name}</b>${q.open ? `<output>${RESONANCE_DIRS[q.panels[i]]}</output>` : `<button data-league="rotate" data-id="${i}">${RESONANCE_DIRS[q.panels[i]]}</button>`}</section>`).join('')}</div><p class="${q.open ? 'activity-complete' : ''}" role="status">${q.open ? I18N.t('resonance.openStatus') : q.message || I18N.t('resonance.hint')}</p>${q.open ? '' : `<div class="actions"><button class="action" data-league="align">${I18N.t('resonance.align')}</button></div>`}${closeButton(I18N.t('league.backToCourtyard'))}`,
    'resonance',
  );
}
function rotateResonance(i) {
  if (
    modalKind !== 'resonance' ||
    state.region !== REGION.OBSERVATORIUM ||
    !has('champion') ||
    legendQuest().open ||
    ![0, 1, 2].includes(i)
  )
    return;
  const q = legendQuest();
  q.panels[i] = (q.panels[i] + 1) % 4;
  q.message = '';
  save();
  resonanceMenu();
}
function alignResonance() {
  if (
    modalKind !== 'resonance' ||
    state.region !== REGION.OBSERVATORIUM ||
    !has('champion') ||
    legendQuest().open
  )
    return;
  const q = legendQuest();
  if (q.panels.every((v, i) => v === [3, 1, 0][i])) {
    q.open = true;
    q.message = '';
    if (!has('tarsion-unsealed')) {
      state.quests.push('tarsion-unsealed');
      state.ultraballs = (state.ultraballs || 0) + 3;
    }
    update();
    modal(
      `<h2>${I18N.t('resonance.unsealed.title')}</h2><p>${I18N.t('resonance.unsealed.body')}</p>${closeButton(I18N.t('resonance.meet'))}`,
      'resonance-open',
    );
  } else {
    q.message = I18N.t('resonance.wrong');
    save();
    resonanceMenu();
  }
}
// The legendary is an actual world sprite; the same point handles hover, walking and E.
// Shared with the loading gate, which requests it when the observatory is in view.
const tarsionWorldPortrait = (images[creaturePortraitPath(47)] ||= new Image());
function atTutor() {
  return (
    !state.room &&
    [REGION.WARGAMALL, REGION.KALDERA].includes(state.region) &&
    spots().some(p => p.key === 'tutor' && Math.hypot(p.x - state.x, p.y - state.y) <= 70)
  );
}
// Browsing each mon's learned move shows the actual active fourth slot.
onClick(async e => {
  const b = e.target.closest('[data-league]');
  if (!b || b.disabled) return;
  const d = b.dataset,
    i = Number(d.id);
  switch (d.league) {
    case 'begin':
      beginLeague();
      break;
    case 'continue':
      continueLeague();
      break;
    case 'hall':
      hallMenu();
      break;
    case 'rotate':
      rotateResonance(i);
      break;
    case 'align':
      alignResonance();
      break;
    case 'legendfight':
      if (
        modalKind === 'tarsion' &&
        legendQuest().open &&
        !ownsTarsion() &&
        state.region === REGION.OBSERVATORIUM
      )
        startBattle(null, [[47, 68]]);
      break;
    case 'equipment':
      equipmentMenu(i);
      break;
    case 'equip':
      equipItem(i, d.key);
      break;
    case 'tutor':
      tutorMenu(i);
      break;
    case 'map':
      mapMenu(i);
      break;
  }
});
function prepareEightCast(image, firstPortrait) {
  registerCastSheet(image, 4, 2, firstPortrait, { css: 'filter:none;mix-blend-mode:normal' });
}
const leagueNPCImage = new Image();
images['img/characters/league-npcs.webp'] = leagueNPCImage;
leagueNPCImage.onload = () => prepareEightCast(leagueNPCImage, 49);
const lateNPCImage = new Image();
images['img/characters/late-npcs.webp'] = lateNPCImage;
lateNPCImage.onload = () => {
  prepareEightCast(lateNPCImage, 66);
  refreshLoadingState();
};
for (const [name, firstPortrait] of [
  ['img/characters/residents-a.webp', 100],
  ['img/characters/residents-b.webp', 108],
]) {
  const image = new Image();
  images[name] = image;
  image.onload = () => {
    prepareEightCast(image, firstPortrait);
    refreshLoadingState();
  };
}
// Cast sheets are requested when one of their people is on screen; see visibleActorAssets.
function continueLeague() {
  // The Elite fights happen inside the arena; step in first when resuming elsewhere.
  if (
    state.region === REGION.LIGA &&
    !battle &&
    !locked &&
    leagueState().active &&
    state.room !== 'leaguearena'
  ) {
    closeModal();
    if (state.room) exitRoom();
    if (state.room !== 'leaguearena') enterRoom('leaguearena');
  }
  const l = leagueState();
  if (battle || locked || !l.active || state.region !== REGION.LIGA) return;
  closeModal();
  trainerIntro(ELITE_IDS[l.stage]);
}
function hallMenu() {
  const l = leagueState();
  modal(
    `<img class="hall-preview" src="img/maps/interior/championhall.webp" alt=""><h2>${I18N.t('league.hall')}</h2><p>${I18N.t('hall.wins', { n: l.clears })}</p>${towerHallNote()}${
      l.hall.length
        ? l.hall
            .slice()
            .reverse()
            .map(
              h =>
                `<section class="hall-entry"><b>${I18N.t('hall.team', { n: h.number })}</b><div class="hall-team">${h.team.map(m => `<div>${art(m.id)}<span>${SPECIES[m.id].name}<br>Lv.${m.level}</span></div>`).join('')}</div></section>`,
            )
            .join('')
        : `<p>${I18N.t('hall.empty')}</p>`
    }${closeButton()}`,
    'hall',
  );
  appendMenu(journeyConsequences());
}
