/* Input: movement keys, battle keys, the d-pad and the shared click bus with the
 `data-act` actions. Loaded right after game.js, before any script that adds a click
 handler. */
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
// Battle keys. Each is printed on its button for the whole fight, so they are learned
// by looking, not remembered from a help page.
const BATTLE_KEYS = {
  1: () => action('m0'),
  2: () => action('m1'),
  3: () => action('m2'),
  4: () => action('m3'),
  5: () => action('m4'),
  b: () => action('brace'),
  c: () => battle.trainer === null && catchMenu(),
  s: () => battleSwitchMenu(),
  i: () => battleItemMenu(),
  r: () => battle.trainer === null && action('run'),
  x: () => {
    setBattleSpeed(battleSpeed === 2 ? 1 : 2);
    renderBattle();
  },
};
// A key pressed while the last turn is still playing out is kept (only the latest one)
// and used as soon as the fight is ready again, instead of being lost.
let bufferedBattleKey = null;
function pressBattleKey(handler) {
  if (!battle.busy && !locked) {
    bufferedBattleKey = null;
    handler();
  } else bufferedBattleKey = { handler, fight: battle, at: Date.now() };
}
function flushBattleKey() {
  const k = bufferedBattleKey;
  if (!k) return;
  if (!battle || battle !== k.fight || Date.now() - k.at > 6000) bufferedBattleKey = null;
  else if (!battle.busy && !locked && !modalKind) {
    bufferedBattleKey = null;
    k.handler();
  }
}
setInterval(flushBattleKey, 60);
// True on a phone or tablet without a mouse: there the keyboard badges and key wording are
// replaced by touch wording. Any device with a precise pointer keeps the keys visible.
const touchOnly = () => !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
// Option lists in the catch, switch and item dialogs: number keys pick an option and the
// arrow keys move between them, like the battle buttons.
const PICK_DIALOGS = ['catch', 'battle-switch', 'battle-items', 'medicine'];
function pickDialogKey(e) {
  if (!PICK_DIALOGS.includes(modalKind) || e.metaKey || e.ctrlKey || e.altKey) return false;
  const options = [...$('modal').querySelectorAll('[data-pick]')];
  if (!options.length) return false;
  if (/^[1-9]$/.test(e.key)) {
    const option = options[Number(e.key) - 1];
    e.preventDefault();
    if (option && !option.disabled) option.click();
    return true;
  }
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return false;
  e.preventDefault();
  const enabled = options.filter(o => !o.disabled);
  if (!enabled.length) return true;
  const at = enabled.indexOf(document.activeElement);
  enabled[
    at < 0 ? (step > 0 ? 0 : enabled.length - 1) : (at + step + enabled.length) % enabled.length
  ].focus();
  return true;
}
document.addEventListener('keydown', e => {
  const battleKey = battle && !modalKind && !e.metaKey && !e.ctrlKey && BATTLE_KEYS[e.key.toLowerCase()];
  if (battleKey) {
    e.preventDefault();
    pressBattleKey(battleKey);
    return;
  }
  if (pickDialogKey(e)) return;
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
  if (['j', 'J'].includes(e.key) && !locked && !battle) {
    e.preventDefault();
    if (modalKind === 'world-info') closeModal();
    else if (!modalKind) worldInfoMenu();
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
// Sliding the held finger onto another arrow changes direction without lifting it.
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
  b.addEventListener('pointermove', e => {
    if (e.pointerId !== movementPointer) return;
    const under = document.elementFromPoint?.(e.clientX, e.clientY)?.closest?.('.dpad [data-move]');
    if (under && under.dataset.move !== held) {
      held = under.dataset.move;
      navigation++;
    }
  });
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
      settleState();
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
    case 'team':
      closeModal(true);
      teamMenu();
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
        battle.log = I18N.t('battle.log.go', { name: tr(SPECIES[state.team[0].id].name) });
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
