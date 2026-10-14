/* New story progression, persistent world puzzles, legendary encounters and a path follower. */
// Later rooms download when entered (or after the first frame of their chapter).
for (const name of [
  'img/maps/interior/chapter-interiors.webp',
  ...['warungcity', 'gym', 'stage', 'mallatrium'].map(key => ROOMS[key].image),
])
  deferMapImage(name);
function chapterState() {
  state.puzzles ??= {};
  state.legendCaught ??= [];
  return state.puzzles;
}
function awardQuest(key) {
  if (has(key)) return false;
  state.quests.push(key);
  state.balls += 3;
  state.potions += 3;
  update();
  return true;
}
// A completed first arena remains sufficient for old saves to open the expansion.
function ending() {
  modal(
    `<span class="eyebrow">${I18N.t('ending.beton.eyebrow')}</span><h2>${I18N.t('ending.beton.title')}</h2><p>${I18N.t('ending.beton.invite', { name: tr(TRAINERS[17].name) })}</p><p>${I18N.t('ending.beton.next')}</p><div class="actions"><button class="action" data-chapter="depart">${I18N.t('ending.beton.depart')}</button>${closeButton(I18N.t('trainer.prepare'))}</div>`,
    'ending',
  );
}
function puzzleAllowed(r) {
  return REGIONS[r].required.slice(0, 2).every(id => state.defeated.includes(id));
}
function puzzleGate(r) {
  if (puzzleAllowed(r)) return true;
  deviceGateScene(
    REGIONS[r].required.slice(0, 2).find(id => !state.defeated.includes(id)),
    r,
  );
  return false;
}
// Lights Out: each breaker flips itself and its orthogonal neighbours. Seed is solvable.
function flipPower(board, i) {
  for (const n of [i, i - 3, i + 3, ...(i % 3 ? [i - 1] : []), ...(i % 3 < 2 ? [i + 1] : [])])
    if (n >= 0 && n < 9) board[n] = !board[n];
  return board;
}
function newPower() {
  const board = Array(9).fill(true);
  [0, 4, 8].forEach(i => flipPower(board, i));
  return { board, moves: 0 };
}
function powerMenu() {
  const p = (chapterState().power ??= newPower()),
    done = has('circuit');
  modal(
    `<span class="eyebrow">${I18N.t('power.eyebrow')}</span><h2>${I18N.t(done ? 'power.titleDone' : 'power.title')}</h2><p>${done ? I18N.t('power.done') : `${I18N.t('power.help.before')} <b>${I18N.t('power.help.bold')}</b> ${I18N.t('power.help.after')}`}</p><div class="power-grid">${p.board.map((on, i) => (done ? `<div class="power-result lit">${i + 1}<small>ON</small></div>` : `<button data-chapter="power" data-id="${i}" class="${on ? 'lit' : ''}" aria-pressed="${on}">${i + 1}<small>${on ? 'ON' : 'OFF'}</small></button>`)).join('')}</div><p class="${done ? 'activity-complete' : ''}" role="status">${done ? I18N.t('story.power.ready', { trainer26: trainerName(26) }) : I18N.t('power.progress', { n: p.board.filter(Boolean).length, moves: p.moves })}</p>${done ? '' : `<details><summary>${I18N.t('power.notes')}</summary><p>${I18N.t('power.notes.body')}</p></details><div class="actions"><button class="action secondary" data-chapter="powerreset">${I18N.t('power.reset')}</button></div>`}${closeButton()}`,
    'power',
  );
}
function pressPower(i) {
  if (has('circuit') || !Number.isInteger(i) || i < 0 || i > 8) return;
  const p = (chapterState().power ??= newPower());
  flipPower(p.board, i);
  p.moves++;
  if (p.board.every(Boolean)) awardQuest('circuit');
  update();
  powerMenu();
}
// Conserved water: six units must be split by the sluices, never manufactured by a button.
// Each round's clue is the catalog entry tide.clue.<round>.
const TIDE_ROUNDS = [
  { start: [0, 4, 2], target: [2, 1, 3] },
  { start: [3, 0, 3], target: [1, 3, 2] },
  { start: [1, 4, 1], target: [3, 2, 1] },
];
function valveState() {
  const p = (chapterState().valves ??= {});
  if (!Number.isInteger(p.round)) {
    p.round = 0;
    p.flow = TIDE_ROUNDS[0].start.slice();
    p.feedback = '';
  }
  return p;
}
function valveMenu() {
  const p = valveState(),
    done = has('tides'),
    names = [0, 1, 2].map(i => I18N.t(`tide.channel.${i}`));
  const clue = I18N.t(`tide.clue.${Math.min(p.round, 2)}`);
  const intro = done ? I18N.t('tide.doneIntro') : I18N.t('tide.intro', { round: p.round + 1, clue });
  const feedback = done
    ? I18N.t('tide.done', {
        trainer: trainerName(29),
      })
    : p.feedback || I18N.t('tide.hint');
  modal(
    `<span class="eyebrow">${I18N.t('tide.eyebrow')}</span><h2>${done ? I18N.t('tide.titleDone') : I18N.t('tide.title')}</h2><p>${intro}</p><div class="reservoir">${I18N.t('tide.total', { flow: p.flow.reduce((a, b) => a + b, 0) })}</div><div class="sluices">${names.map((n, i) => `<div><b>${n}</b><div class="flow-meter" aria-label="${n}: ${I18N.t('tide.amount', { flow: p.flow[i] })}">${Array.from({ length: 6 }, (_, j) => `<i class="${j < p.flow[i] ? 'filled' : ''}"></i>`).join('')}</div><p>${I18N.t('tide.amount', { flow: p.flow[i] })}</p>${done ? '' : names.map((dest, j) => (i === j ? '' : `<button data-chapter="valve" data-id="${i}" data-delta="${j}" ${p.flow[i] === 0 ? 'disabled' : ''}>${I18N.t('tide.send', { name: dest })}</button>`)).join(' ')}</div>`).join('')}</div><p role="status" class="${done ? 'activity-complete' : ''}">${feedback}</p>${done ? '' : `<button class="action" data-chapter="valvetest">${I18N.t('tide.test')}</button>`}${closeButton()}`,
    'valves',
  );
}
function turnValve(from, to) {
  if (has('tides') || ![0, 1, 2].includes(from) || ![0, 1, 2].includes(to) || from === to) return;
  const p = valveState();
  if (!p.flow[from]) return;
  p.flow[from]--;
  p.flow[to]++;
  p.feedback = '';
  update();
  valveMenu();
}
function testValves() {
  if (has('tides')) return;
  const p = valveState(),
    target = TIDE_ROUNDS[p.round].target;
  if (p.flow.every((value, i) => value === target[i])) {
    p.round++;
    if (p.round === TIDE_ROUNDS.length) {
      awardQuest('tides');
      p.feedback = '';
    } else {
      p.flow = TIDE_ROUNDS[p.round].start.slice();
      p.feedback = I18N.t('tide.next');
    }
  } else p.feedback = I18N.t('tide.retry');
  update();
  valveMenu();
}
const SIGNAL_PATTERNS = [
  [0, 2, 1],
  [3, 0, 2, 1],
  [1, 3, 2, 0, 1],
];
const SIGNAL_NAMES = ['north', 'east', 'south', 'west'].map(k => I18N.t(`direction.${k}`));
function signalMenu() {
  const p = (chapterState().signals ??= { round: 0, input: [], revealed: true });
  if (has('orbit')) {
    modal(
      `<h2>${I18N.t('signal.doneTitle')}</h2><p>${I18N.t('signal.doneBody')}</p>${closeButton()}`,
      'signals',
    );
    return;
  }
  const seq = SIGNAL_PATTERNS[p.round];
  modal(
    `<span class="eyebrow">${I18N.t('signal.eyebrow', { n: p.round + 1 })}</span><h2>${I18N.t('signal.title')}</h2><p>${I18N.t('signal.help.before')} <b>${I18N.t('signal.start')}</b>${I18N.t('signal.help.after')}</p><div class="signal-sequence" role="status">${p.revealed ? seq.map((n, i) => `<span>${i + 1}. ${SIGNAL_NAMES[n]}</span>`).join('') : I18N.t('signal.progress', { n: p.input.length, total: seq.length })}</div><div class="signal-controls">${SIGNAL_NAMES.map((n, i) => `<button data-chapter="signal" data-id="${i}" ${p.revealed ? 'disabled' : ''}>${n}</button>`).join('')}</div><div class="actions"><button class="action" data-chapter="signalstart">${I18N.t(p.revealed ? 'signal.start' : 'signal.showAgain')}</button>${closeButton(I18N.t('signal.saveClose'))}</div>`,
    'signals',
  );
}
function pressSignal(i) {
  const p = chapterState().signals;
  if (!p || has('orbit') || p.revealed || ![0, 1, 2, 3].includes(i)) return;
  if (SIGNAL_PATTERNS[p.round][p.input.length] !== i) {
    p.input = [];
    p.revealed = true;
    toast(I18N.t('signal.wrong'));
  } else {
    p.input.push(i);
    beep(300 + i * 130);
    if (p.input.length === SIGNAL_PATTERNS[p.round].length) {
      p.round++;
      p.input = [];
      p.revealed = true;
      if (p.round === 3) awardQuest('orbit');
    }
  }
  update();
  signalMenu();
}
function legendMenu(id) {
  chapterState();
  const legendary = SPECIES[id].legendary;
  if (!legendReady(id)) {
    modal(
      `<h2>${I18N.t(legendary ? 'legend.locked.legendary' : 'legend.locked.rare')}</h2><p>${I18N.t(id === 19 ? 'legend.locked.19' : 'legend.locked.18')}</p>${closeButton()}`,
    );
    return;
  }
  if (legendary && (state.legendCaught.includes(id) || state.seen.includes(id))) {
    modal(
      `<h2>${I18N.t('legend.known.title', { name: tr(SPECIES[id].name) })}</h2><p>${I18N.t('legend.known.body')}</p>${closeButton()}`,
    );
    return;
  }
  modal(
    `<span class="eyebrow">${I18N.t(legendary ? 'legend.eyebrow.legendary' : 'legend.eyebrow.rare')}</span><div class="portrait-head">${art(id)}<div><h2>${SPECIES[id].name}</h2><p>${typeLabel(id)}</p></div></div><p>${SPECIES[id].desc}</p><p>Lv.${id === 19 ? 27 : REGIONS[REGION.PUNCAK].levels[1]}. ${I18N.t(legendary ? 'legend.oncePerTrip' : 'legend.notLegendary')}</p><p>${state.team.length >= 6 ? I18N.t('legend.teamFull') : ''}</p><div class="actions"><button class="action" data-chapter="legend" data-id="${id}" ${!state.balls && !legendary ? 'disabled' : ''}>${I18N.t(legendary ? 'legend.approach' : 'legend.inspect')}</button>${closeButton(I18N.t('trainer.prepare'))}</div>`,
    'legend',
  );
}
// The follower uses the player's actual path, including turns and click-to-walk routes.
let followerTrail = [],
  followerScene = '',
  followerPosition = null;
onClick(e => {
  const b = e.target.closest('button[data-chapter]');
  if (!b || b.disabled) return;
  const a = b.dataset.chapter,
    i = Number(b.dataset.id);
  if (a === 'depart') {
    closeModal();
    travel(REGION.FESTIVAL);
  }
  if (a === 'power') pressPower(i);
  if (a === 'powerreset' && !has('circuit')) {
    chapterState().power = newPower();
    update();
    powerMenu();
  }
  if (a === 'valve') turnValve(i, Number(b.dataset.delta));
  if (a === 'valvetest') testValves();
  if (a === 'signal') pressSignal(i);
  if (a === 'signalstart') {
    const p = chapterState().signals;
    p.input = [];
    p.revealed = !p.revealed;
    update();
    signalMenu();
  }
  if (
    a === 'legend' &&
    legendReady(i) &&
    (!SPECIES[i].legendary || (!state.legendCaught.includes(i) && !state.seen.includes(i)))
  ) {
    if (!state.balls) {
      if (!SPECIES[i].legendary) {
        toast(I18N.t('legend.buyCapsules'));
        return;
      }
      // The volunteers lend capsules once; after that the player brings their own.
      if (state.legendLoan) {
        toast(I18N.t('legend.buyCapsules'));
        return;
      }
      state.legendLoan = true;
      state.balls = 3;
      toast(I18N.t('legend.loan'));
    }
    startBattle(null, [[i, i === 19 ? 27 : REGIONS[REGION.PUNCAK].levels[1]]]);
  }
});
