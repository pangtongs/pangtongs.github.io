/* A battle as it happens: turns, capture, the start and end of a fight, and enemy switches. */

// --- Turns.
// A full team defeat ends the fight without healing or moving the player, for a small
// fee (defeatFee).
// With another teammate still standing, a charm or the next teammate can step in.
// Returns true when the whole team is down and the battle has ended.
async function partyFaint() {
  const lead = state.team[0];
  if (lead?.hp > 0) return false;
  // The charm acts first, so it can save the last conscious teammate too.
  if (lead && lead.hp === 0 && lead.heldItem === 'rescue' && !lead.rescueUsed) {
    lead.rescueUsed = true;
    lead.hp = Math.ceil(lead.max * 0.25);
    if (battle) battle.log += ' ' + I18N.t('battle.log.rescue', { name: tr(SPECIES[lead.id].name) });
    renderBattle();
    return false;
  }
  const i = state.team.findIndex(m => m.hp > 0);
  if (i < 0 && battle?.guest) {
    // A tower floor or a ghost team: no fee, the record says what happens next.
    const b = battle;
    endBattle();
    update();
    save();
    guestBattleOver(b, false);
    return true;
  }
  if (i < 0) {
    if (battle?.ronda) rondaAfter('lose');
    battle?.after?.('lose');
    endBattle();
    const fee = defeatFee();
    state.money -= fee;
    update();
    save();
    modal(
      `<h2>${I18N.t('battle.fainted.title')}</h2><p>${I18N.t('battle.fainted.body')}</p>${fee ? `<p>${I18N.t('battle.fainted.fee', { fee: money(fee) })}</p>` : ''}${closeButton(I18N.t('battle.fainted.walk'))}`,
      'defeat',
    );
    return true;
  }
  [state.team[0], state.team[i]] = [state.team[i], state.team[0]];
  if (battle) battle.log += ' ' + I18N.t('battle.log.sendIn', { name: tr(SPECIES[state.team[0].id].name) });
  return false;
}
// Losing the whole team costs a little: what slips out of your pocket while you carry
// everyone off. Rp2.000 plus Rp1.500 per badge, never over Rp15.000 and never more than
// a tenth of your money, so a loss stings without leaving you unable to heal.
function defeatFee() {
  const badges = BADGE_REGIONS.filter(r => gateReady(r)).length;
  return Math.max(0, Math.min(Math.floor(state.money / 10), 2000 + badges * 1500, 15000));
}
// `windUp` is a heavy move the player started this turn: it lands after the enemy acts.
async function enemyTurn(windUp = null) {
  const b = battle;
  if (!b) return;
  // A trainer may swap to a better matchup instead of attacking, but never twice in a row.
  const choice = enemySwitchCandidate(b);
  if (choice >= 0) {
    b.busy = true;
    locked = true;
    const outgoing = b.enemy;
    [b.enemies[b.index], b.enemies[choice]] = [b.enemies[choice], b.enemies[b.index]];
    b.enemy = b.enemies[b.index];
    b.enemySwaps = (b.enemySwaps || 0) + 1;
    b.noSwapNext = true;
    b.enemyGuard = false;
    b.enemyPotion = false;
    b.log = I18N.t('battle.enemySwap', {
      trainer: battleTrainer(b).name,
      old: SPECIES[outgoing.id].name,
      next: SPECIES[b.enemy.id].name,
    });
    planEnemy();
    renderBattle();
    save();
    await delay(400);
    if (windUp) {
      await windUp();
      return;
    }
    b.busy = false;
    locked = false;
    update();
    renderBattle();
    return;
  }
  b.noSwapNext = false;
  const e = normalise(b.enemy),
    m = normalise(state.team[0]);
  b.busy = true;
  locked = true;
  if (b.potions > 0 && !b.enemyPotion && e.hp <= e.max * 0.3) {
    // A trainer gives one Jamu to a creature that is nearly down: the player's own Jamu,
    // with the same amount, and like the player's medicine (useMedicine in items.js) it
    // takes the turn. Medicine is the trainer's action, not the creature's, so on both
    // sides it works on a creature that is asleep or paralysed; the creature's turn still
    // passes (cooldowns count down, sleep and other conditions tick in tick() below).
    b.potions--;
    b.enemyPotion = true;
    passTurn(e);
    e.interrupted = false;
    const healed = Math.min(e.max - e.hp, medicineAmount('potions', e));
    e.hp += healed;
    b.log = I18N.t('battle.log.enemyPotion', {
      trainer: tr(battleTrainer(b).name),
      item: medicineInfo('potions').name,
      name: tr(SPECIES[e.id].name),
      n: healed,
    });
  } else {
    // A guard-style trainer braces once with each creature when it drops to half HP.
    const guarding = b.style === 'guard' && !b.enemyGuard && e.hp <= e.max * 0.5 && !e.braced;
    // Cooldowns are read before the turn begins, the same rule as the player's moves.
    const ready = b.intent >= 0 && !(e.cooldowns[b.intent] > 0),
      skip = beginTurn(e);
    if (skip) b.log = skip;
    else if (ready && !guarding && tempo(e) >= tempoCost(kit(e.id, e)[b.intent]))
      b.log = useMove(e, m, b.intent);
    else {
      if (guarding) b.enemyGuard = true;
      e.tempo = Math.min(3, tempo(e) + 1);
      e.braced = true;
      e.focused = true;
      b.log = I18N.t('battle.log.enemyBrace', { name: tr(SPECIES[e.id].name) });
    }
  }
  b.log += ' ' + tick(e);
  renderBattle();
  save();
  await delay(500);
  // A knocked-out enemy counts first: recoil or reflection never turns a win into a loss.
  if (!e.hp) {
    await enemyDefeated();
    return;
  }
  if (await partyFaint()) return;
  if (windUp) {
    await windUp();
    return;
  }
  b.busy = false;
  locked = false;
  planEnemy();
  update();
  renderBattle();
}

// --- Wild encounters and capture.
// Ronda Malam: from 19:00 to 05:00 on the player's clock, night guests join the wild:
// glowing Mangglow in the grass and Lumilaut in the water. Resting can also wait for
// night (or for morning), which lasts 20 minutes of play.
const WAIT_MS = 20 * 60 * 1000;
const isNight = () => {
  const now = Date.now();
  if (state.dayUntil > now) return false;
  if (state.nightUntil > now) return true;
  const h = new Date().getHours();
  return h >= 19 || h < 5;
};
function waitForTime() {
  const night = !isNight();
  state.nightUntil = night ? Date.now() + WAIT_MS : 0;
  state.dayUntil = night ? 0 : Date.now() + WAIT_MS;
  save();
  closeModal();
  toast(I18N.t(night ? 'wait.night.done' : 'wait.day.done'));
}
const waitButton = () =>
  `<button class="action secondary" data-wait="time">${I18N.t(isNight() ? 'wait.day' : 'wait.night')}</button>`;
function nightGuests(r = state.region) {
  if (!isNight() || r === 14) return [];
  return [
    { id: 28, weight: 8, night: 'grass' },
    { id: 25, weight: 8, night: 'water' },
  ].filter(g => !REGIONS[r].wild.includes(g.id));
}
function encounterWeights(r = state.region) {
  const c = civicState();
  return (
    REGIONS[r].wild
      // The other starters are a lucky find (about 1 in 300), the rare bird is uncommon,
      // each region's own signature species turns up now and then, and a species with its
      // own wildWeight (12 is common) keeps that rarity wherever it lives.
      .map(id => ({
        id,
        weight:
          id < 3
            ? 0.5 * rareBoost()
            : id === 18
              ? rareBoost()
              : id === REGIONS[r].signature
                ? 5
                : (SPECIES[id].wildWeight ?? 12),
      }))
      .filter(v => !(r === 11 && v.id === 44 && c.choices.contract === 0 && !c.resolved.includes('contract')))
      .map(v => ({
        ...v,
        weight:
          r === 6 && c.choices.coast === 0 && !c.resolved.includes('coast')
            ? v.weight * (v.id === 22 ? 0.1 : 1)
            : v.weight,
      }))
      .concat(nightGuests(r), dailyGuests(r))
  );
}
async function advancedCatch(ultra = false) {
  const id = battle?.enemy.id;
  await throwCapsule(ultra);
  // A legend that joined is recorded, so its one encounter is not offered again.
  if (SPECIES[id]?.legendary && [...state.team, ...(state.storage || [])].some(m => m.id === id)) {
    state.legendCaught ??= [];
    if (!state.legendCaught.includes(id)) state.legendCaught.push(id);
    save();
  }
}
// The chance a capsule holds: weaker and sleeping or stunned targets are easier;
// legends are hard. The catch menu shows this number.
function catchChance(e, ultra = false) {
  const bonus = hasCondition(e, 'sleep') || hasCondition(e, 'paralysis') ? 0.25 : hasCondition(e) ? 0.12 : 0,
    rare = SPECIES[e.id].legendary;
  return Math.min(
    0.97,
    (rare ? 0.06 : 0.18) +
      (rare ? 0.55 : 0.7) * (1 - e.hp / e.max) +
      bonus +
      (ultra ? 0.18 : 0) +
      basketBonus(),
  );
}
async function throwCapsule(ultra) {
  const b = battle;
  if (!b || locked || b.busy || b.trainer !== null || b.noCatch) return;
  const key = ultra ? 'ultraballs' : 'balls',
    e = b.enemy;
  if (!(state[key] > 0)) {
    toast(I18N.t('battle.capsule.empty'));
    return;
  }
  state[key]--;
  spendEnergy(state.team[0]);
  b.busy = true;
  locked = true;
  b.log = I18N.t('battle.log.throw', { capsule: I18N.t(ultra ? 'item.ultraballs.name' : 'item.balls.name') });
  renderBattle();
  save();
  await delay(650);
  const chance = catchChance(e, ultra);
  spendBasket();
  if (Math.random() < chance) {
    // A catch counts as a win for the team: it earns XP before the newcomer joins.
    const xp = gainXP(e),
      reserve = state.team.length >= 6;
    (reserve ? (state.storage ??= []) : state.team).push({ ...e, cooldowns: {}, xp: 0 });
    if (!state.seen.includes(e.id)) state.seen.push(e.id);
    b.log = I18N.t('battle.log.caught', { name: tr(SPECIES[e.id].name), xp });
    renderBattle();
    await delay(500);
    endBattle();
    toast(
      I18N.t(reserve ? 'battle.toast.toDaycare' : 'battle.toast.joined', { name: tr(SPECIES[e.id].name) }),
    );
    if (b.ronda) rondaAfter('win');
    b.after?.('caught');
  } else {
    passTurn(state.team[0]);
    state.team[0].interrupted = false;
    b.log = I18N.t('battle.log.capsuleOpened');
    b.log += ' ' + tick(state.team[0]);
    renderBattle();
    update();
    if (await partyFaint()) return;
    await enemyTurn();
  }
}
function battleBackdrop() {
  const scene = room() || place(),
    tile = scene.tile ?? -1,
    image = scene.image || (room() ? 'img/maps/interior/interiors.webp' : place().image);
  const arena = $('battle'),
    wash = 'linear-gradient(#b3d9c6d9,#d9e7bfe6 65%,#f4f1dcee)';
  if (ELITE_IDS.includes(battle.trainer)) {
    arena.style.backgroundImage = `${wash},url('img/maps/interior/leaguearena.webp')`;
    arena.style.backgroundSize = 'cover,cover';
    arena.style.backgroundPosition = 'center,center';
  } else {
    arena.style.backgroundImage = `${wash},url('${image}')`;
    arena.style.backgroundSize = tile < 0 ? 'cover,cover' : 'cover,200% 200%';
    arena.style.backgroundPosition =
      tile < 0 ? 'center,center' : `center,${(tile % 2) * 100}% ${Math.floor(tile / 2) * 100}%`;
  }
  // Sukamaju and its alley share one painted street as the outdoor backdrop.
  if (!room() && state.region === REGION.SUKAMAJU)
    arena.style.backgroundImage = `${wash},url('img/maps/exterior/1-1.webp')`;
}

// --- A battle from start to finish.
// Markers that only mean something during a fight. A save made mid-battle may hold them.
function clearBattleFlags(m) {
  for (const k of [
    'tempo',
    'braced',
    'focused',
    'turnDamage',
    'reflect',
    'interrupted',
    'lastMiss',
    'sleepGuard',
  ])
    delete m[k];
  m.shell = 0;
  m.ward = 0;
  m.sugar = 0;
  m.healBlock = 0;
}
let healTipShown = false;
// Who the player is facing: a trainer from TRAINERS, or a guest (a Menara Tanding floor
// or a ghost team from a code) that brings its own name, portrait and plan.
const battleTrainer = b => b.guest || TRAINERS[b.trainer];
// A guest battle: `guest` is { kind, name, portrait, style, potions, noItems, team }, with
// team entries { sid, lv, item, variant, batik, learnedMoves }. It plays like a trainer
// fight; the end goes to guestBattleOver (tower.js, team-codes.js) instead of the prize.
function startGuestBattle(guest) {
  startBattle(guest.kind, null, guest);
}
function startBattle(id, team, guest = null) {
  openBattle(id, team, guest);
  if (!battle) return;
  for (const m of state.team) {
    m.tempo = 1;
    m.braced = false;
    m.turnDamage = 1;
  }
  battle.enemies.forEach(m => {
    m.tempo = 1;
    m.braced = false;
  });
  beginFieldRule(id);
  planEnemy();
  for (const m of [...state.team, ...battle.enemies]) {
    m.rescueUsed = false;
    if (m.id === 19 || m.heldItem === 'capacitor') m.tempo = 3;
    if (m.heldItem === 'medkit') m.ward = true;
  }
  renderBattle();
}
// Leaves `battle` untouched when the fight is not allowed yet or nobody can stand.
// The team a trainer actually brings: Elites grow five levels per League clear, and a
// rematch keeps up with the player (never below the original levels, never far behind).
// The trainer preview shows exactly this team.
const LEVEL_CAP = 80;
function trainerTeam(id, t = TRAINERS[id].team) {
  if (ELITE_IDS.includes(id))
    return t.map(([sid, lv]) => [sid, Math.min(LEVEL_CAP, lv + leagueState().clears * 5)]);
  if (!state.defeated.includes(id) || !state.team.length) return t;
  const average = Math.round(state.team.reduce((n, m) => n + m.level, 0) / state.team.length);
  return t.map(([sid, lv]) => [sid, Math.min(LEVEL_CAP, Math.max(lv, average - 2))]);
}
// Who a trainer sends, in order, with held gear: the team, plus the reserve before the ace
// when the player brings a full team of six conscious creatures (TRAINER_TACTICS).
function trainerLineup(id, team = trainerTeam(id)) {
  const tactics = id === null ? null : TRAINER_TACTICS[id],
    lineup = team.map(([sid, lv], i) => ({ sid, lv, item: tactics?.items[i] ?? null }));
  if (!tactics || id === 48 || state.team.length < 6 || state.team.some(m => m.hp <= 0)) return lineup;
  const base = TRAINERS[id].team,
    reserve = tactics.reserve ?? { mon: [base[1][0], Math.max(...base.map(([, lv]) => lv)) - 2], item: null },
    [[sid, lv]] = trainerTeam(id, [reserve.mon]);
  lineup.splice(lineup.length - 1, 0, { sid, lv, item: reserve.item ?? null });
  return lineup;
}
function openBattle(id, team, guest = null) {
  if (guest) {
    if (!guest.team?.length) return;
  } else if (ELITE_IDS.includes(id)) {
    if (!canChallenge(id)) return;
    team = trainerTeam(id);
  }
  if (
    team?.some(([sid]) => sid === 47) &&
    (!legendQuest().open || ownsTarsion() || state.region !== REGION.OBSERVATORIUM)
  )
    return;
  state.team.forEach(m => {
    m.shell = 0;
    m.ward = 0;
    m.sugar = 0;
    m.healBlock = 0;
  });
  if (!guest && id !== null && !canChallenge(id)) {
    trainerIntro(id);
    return;
  }
  if (!guest && id !== null && !ELITE_IDS.includes(id) && state.defeated.includes(id))
    team = trainerTeam(id, team);
  state.team.forEach(m => {
    normalise(m);
    m.cooldowns = {};
    m.reflect = false;
    m.interrupted = false;
  });
  closeModal(true);
  if (!state.team.some(m => m.hp > 0)) {
    toast(I18N.t('battle.fainted.recover'));
    return;
  }
  if (!state.team[0].hp) {
    const i = state.team.findIndex(m => m.hp > 0);
    [state.team[0], state.team[i]] = [state.team[i], state.team[0]];
  }
  navigation++;
  held = null;
  const tactics = guest || (id === null ? null : TRAINER_TACTICS[id]),
    lineup = guest ? guest.team : trainerLineup(id, team),
    enemies = lineup.map(({ sid, lv, item, variant, batik, learnedMoves }) => ({
      ...makeMon(sid, lv),
      heldItem: item ?? null,
      ...(variant ? { variant: true, batik } : {}),
      ...(learnedMoves ? { learnedMoves: { ...learnedMoves } } : {}),
    }));
  // Every creature faced is recorded as met in the Wargadex, owned or not.
  state.met ??= [];
  for (const m of enemies) if (!state.met.includes(m.id)) state.met.push(m.id);
  battle = {
    trainer: id,
    guest,
    enemies,
    index: 0,
    enemy: enemies[0],
    busy: false,
    // A trainer's plan (TRAINER_TACTICS): move style and Jamu left in the bag.
    style: tactics?.style ?? null,
    potions: tactics?.potions ?? 0,
    // What the creature in front has already spent: its emergency brace and its Jamu.
    enemyGuard: false,
    enemyPotion: false,
    // Guests teach at the rematch rate: a streak is not an XP farm.
    rematch: !!guest || (id !== null && state.defeated.includes(id)),
    log:
      id === null
        ? I18N.t('battle.log.wildAppears', { name: tr(SPECIES[enemies[0].id].name) })
        : I18N.t('battle.log.trainerSends', {
            trainer: tr((guest || TRAINERS[id]).name),
            name: tr(SPECIES[enemies[0].id].name),
          }),
  };
  $('battle').classList.remove('hidden');
  renderBattle();
  update();
  beep(200, 0.2);
  battle.enemies.forEach(normalise);
}
function endBattle() {
  for (const m of [...state.team, ...(state.storage || [])]) clearBattleFlags(m);
  endFieldRule(battle);
  const b = battle,
    isElite = ELITE_IDS.includes(b?.trainer),
    won = isElite && b.index === b.enemies.length - 1 && b.enemy.hp <= 0;
  if (isElite && leagueState().active) {
    if (won) {
      const l = leagueState();
      l.stage++;
      if (l.stage === 5) {
        l.active = false;
        l.stage = 0;
        l.clears++;
        if (!has('champion')) state.quests.push('champion');
        l.hall.push({
          at: new Date().toISOString(),
          team: state.team.map(m => ({ id: m.id, level: m.level })),
          number: l.clears,
        });
        if (l.hall.length > 20) l.hall.shift();
        state.money += 30000;
      }
    } else abandonLeague();
  }
  state.team.forEach(m => {
    m.shell = 0;
    m.ward = 0;
    m.sugar = 0;
    m.healBlock = 0;
  });
  if (
    b?.trainer === null &&
    SPECIES[b.enemy.id]?.legendary &&
    [...state.team, ...(state.storage || [])].some(m => m.id === b.enemy.id)
  ) {
    chapterState();
    if (!state.legendCaught.includes(b.enemy.id)) state.legendCaught.push(b.enemy.id);
  }
  // A special dish lasts a number of fights, counted as each one ends.
  if (b && state.mealBuff?.left > 0 && --state.mealBuff.left <= 0) delete state.mealBuff;
  battle = null;
  locked = false;
  $('battle').classList.add('hidden');
  $('battle').innerHTML = '';
  // Collection gifts wait for the fight to end.
  settleState();
  update();
  // First-time players are told once where to recover on the opening maps.
  if (!healTipShown && state.region <= REGION.PADANG_OJEK && state.team.some(m => m.hp < m.max * 0.5)) {
    healTipShown = true;
    setTimeout(() => {
      if (!modalKind && !battle) toast(I18N.t('tip.heal'));
    }, 2600);
  }
  if (ownsTarsion() && !has('tarsion-friend')) {
    state.quests.push('tarsion-friend');
    save();
  }
}
// The player's choice for this turn: a move (m0..m4), brace, or running.
// Capsules, items and switching have their own dialogs.
async function action(move) {
  if (!battle || battle.busy || locked) return;
  const b = battle,
    lead = state.team[0],
    slot = /^m[0-4]$/.test(move) ? Number(move[1]) : -1;
  if (slot >= 0 && tempo(lead) < tempoCost(kit(lead.id, lead)[slot])) {
    toast(I18N.t('battle.toast.needTempo'));
    return;
  }
  if (move === 'brace') {
    b.busy = true;
    locked = true;
    const skip = beginTurn(lead);
    if (skip) b.log = skip;
    else {
      lead.tempo = Math.min(3, tempo(lead) + 1);
      lead.braced = true;
      lead.focused = true;
      b.log = I18N.t('battle.log.brace');
    }
    b.log += ' ' + tick(lead);
    renderBattle();
    await delay(400);
    if (await partyFaint()) return;
    await enemyTurn();
    return;
  }
  if (move === 'run') {
    if (b.ronda) rondaAfter('run');
    b.after?.('run');
    endBattle();
    toast(I18N.t('battle.toast.ran'));
    return;
  }
  if (slot < 0) return;
  const m = normalise(lead),
    e = normalise(b.enemy);
  if (!kit(m.id, m)[slot] || m.cooldowns[slot] > 0) {
    toast(I18N.t('battle.toast.cooling'));
    return;
  }
  b.busy = true;
  locked = true;
  const skip = beginTurn(m);
  // A heavy move (2 Tempo) needs a wind-up: the enemy acts first, then it lands if the
  // creature that started it is still in front and standing.
  if (!skip && isHeavy(kit(m.id, m)[slot])) {
    b.log = I18N.t('battle.log.windUp', { name: tr(SPECIES[m.id].name), move: tr(kit(m.id, m)[slot].name) });
    renderBattle();
    await delay(400);
    await enemyTurn(() => landWindUp(m, slot));
    return;
  }
  b.log = skip || useMove(m, e, slot);
  b.log += ' ' + tick(m);
  renderBattle();
  update();
  await delay(650);
  if (!e.hp) {
    await enemyDefeated();
    return;
  }
  if (await partyFaint()) return;
  await enemyTurn();
}
// The second half of a heavy move's turn, after the enemy has acted. The move is lost
// if the creature fell or left, fell asleep, had the move sealed or was whistled down.
async function landWindUp(m, slot) {
  const b = battle;
  if (!b) return;
  const e = b.enemy,
    broken = m.interrupted || hasCondition(m, 'sleep') || m.cooldowns[slot] > 0;
  m.interrupted = false;
  if (state.team[0] === m && m.hp > 0 && !broken) {
    b.log = useMove(m, e, slot) + ' ' + tick(m);
    renderBattle();
    update();
    await delay(650);
    if (!e.hp) {
      await enemyDefeated();
      return;
    }
    if (await partyFaint()) return;
  } else {
    b.log += ' ' + I18N.t('battle.log.windUpLost', { move: tr(kit(m.id, m)[slot].name) });
    // A lost wind-up still ends the creature's turn: poison, burn and sleep tick as usual.
    if (state.team[0] === m && m.hp > 0) {
      b.log += ' ' + tick(m);
      renderBattle();
      update();
      if (await partyFaint()) return;
    }
  }
  b.busy = false;
  locked = false;
  planEnemy();
  update();
  renderBattle();
}
// The enemy's HP reached zero: a charm may revive it, the trainer may send the next
// creature, or the fight is won and its rewards and story consequences follow.
async function enemyDefeated() {
  const b = battle,
    fallen = b?.enemy;
  if (fallen?.heldItem === 'rescue' && !fallen.rescueUsed && fallen.hp === 0) {
    fallen.rescueUsed = true;
    fallen.hp = Math.ceil(fallen.max * 0.25);
    if (await partyFaint()) return;
    b.busy = false;
    locked = false;
    planEnemy();
    renderBattle();
    return;
  }
  const id = b?.trainer,
    last = b && b.index === b.enemies.length - 1;
  const firstWin = id !== null && !state.defeated.includes(id);
  await concludeEnemy();
  if (battle) {
    normalise(battle.enemy);
    await partyFaint();
    if (battle) renderBattle();
  }
  if (firstWin && state.defeated.includes(id)) {
    celebrateBadge(id);
    celebrateMudik(id);
    celebrateSeberang(id);
  }
  if (last) {
    if (id === 42 && !has('kaldera')) {
      state.quests.push('kaldera');
      state.potions += 5;
      update();
    }
    if (id === 43 && !has('observatory-pass')) {
      state.quests.push('observatory-pass');
      state.money += 10000;
      update();
    }
    if (ELITE_IDS.includes(id) && !battle) {
      if (id === 48) {
        update();
        modal(
          `<h2>${I18N.t('league.champion.title')}</h2><p>${I18N.t('league.champion.trophy', { name: tr(TRAINERS[48].name) })}</p><p>${I18N.t('league.champion.reward')} <b>${I18N.t('quest.tarsion.name')}</b>.</p>${mudikNews()}<div class="actions"><button class="action" data-league="hall">${I18N.t('league.hall')}</button>${closeButton(I18N.t('league.backToCourtyard'))}</div>`,
          'champion',
        );
      } else leagueMenu();
    }
  }
  if (battle) {
    planEnemy();
    renderBattle();
  }
}
// The whole prize for a fight, shown exactly as paid. A wild creature leaves a little
// pocket money; a trainer pays by region and level. A rematch pays in full once a day
// per trainer and day on the player's clock (dayNumber, like every other daily reset),
// so repeating one fight is not a money farm.
function battleReward(b) {
  if (b.trainer === null) return b.enemy.level * 150;
  if (!b.rematch) return 31000 + Math.max(0, storyStep(state.region)) * 1500 + b.enemy.level * 500;
  const today = dayNumber();
  state.rematchPaid ??= {};
  if (state.rematchPaid[b.trainer] === today) return 2000;
  state.rematchPaid[b.trainer] = today;
  return 12000;
}
// XP, then either the trainer's next creature or the victory payout and dialog.
async function concludeEnemy() {
  const b = battle,
    e = b.enemy;
  b.log = I18N.t('battle.log.defeated', { name: tr(SPECIES[e.id].name), xp: gainXP(e) });
  renderBattle();
  save();
  await delay(700);
  if (b.index < b.enemies.length - 1) {
    b.index++;
    b.enemy = b.enemies[b.index];
    b.enemyGuard = false;
    b.enemyPotion = false;
    b.log = I18N.t('battle.log.trainerNext', {
      trainer: tr(battleTrainer(b).name),
      name: tr(SPECIES[b.enemy.id].name),
      n: b.enemies.length - b.index,
    });
    renderBattle();
    await delay(500);
    b.busy = false;
    locked = false;
    update();
    renderBattle();
    return;
  }
  if (b.guest) {
    state.wins++;
    b.log = I18N.t('battle.win.guest', { name: b.guest.name });
    renderBattle();
    beep(880, 0.2);
    await delay(700);
    endBattle();
    save();
    guestBattleOver(b, true);
    return;
  }
  const reward = battleReward(b),
    gateWasReady = gateReady(state.region);
  state.money += reward;
  state.wins++;
  const ti = b.trainer,
    wasFinished = state.finished;
  if (ti !== null && !state.defeated.includes(ti)) {
    state.defeated.push(ti);
    state.potions++;
  }
  if (ti === 17) state.finished = true;
  b.log =
    ti === null
      ? `${I18N.t('battle.win.wild')} +${money(reward)}`
      : I18N.t(b.rematch ? 'battle.win.trainer' : 'battle.win.trainerBonus', { reward: money(reward) });
  renderBattle();
  beep(880, 0.2);
  await delay(700);
  endBattle();
  if (ti === 17 && !wasFinished) {
    ending();
    return;
  }
  if (ti === null) {
    toast(`${I18N.t('battle.win.wild')} +${money(reward)}. ${leadProgressText()}`);
    if (b.ronda) rondaAfter('win');
    // An event battle (calendar.js) settles its own prize.
    b.after?.('win');
    return;
  }
  const t = TRAINERS[ti],
    line = (b.rematch && TRAINER_REMATCH_LINES[ti]) || t.win;
  modal(
    `<div class="portrait-head">${trainerArt(t.portrait)}<div><span class="eyebrow">${I18N.t('battle.victory.eyebrow')}</span><h2>${I18N.t('battle.victory.title', { name: t.name })}</h2></div></div><p>“${line}”</p><p>${!gateWasReady && gateReady(state.region) ? I18N.t('battle.victory.gateOpen', { reward: money(reward) }) : '+' + money(reward)}</p>${victoryProgress(b)}${closeButton(I18N.t('common.continueJourney'))}`,
  );
}
// First win against a badge holder: the reward and the chapter's closing dialog.
function celebrateBadge(id) {
  if (regionOfLeader(id) !== null) {
    const r = regionOfLeader(id);
    // The badge heals the team and fills the bag; levels are earned in battle.
    state.team.forEach(m => {
      m.hp = m.max;
      clearStatus(m);
    });
    state.balls += 5;
    state.potions += 5;
    addItem('ultraballs', 2);
    addItem('maxpotion', 2);
    update();
    modal(
      `<span class="eyebrow">${REGIONS[r].badge.toUpperCase()}</span><h2>${I18N.t(`badge.win.${id}.title`)}</h2><p>${TRAINERS[id].win}</p><p>${I18N.t('badge.win.supplies')}</p><p>${I18N.t(`badge.win.${id}.next`)}</p>${closeButton(I18N.t(id === 32 ? 'badge.win.findLegend' : 'common.continueJourney'))}`,
      'chapterwin',
    );
  } else if ([34, 36].includes(id)) {
    state.balls += 5;
    state.potions += 3;
    update();
    modal(
      `<h2>${I18N.t(`badge.win.${id}.title`)}</h2><p>${TRAINERS[id].win}</p><p>${I18N.t('badge.win.smallSupplies')}</p><p>${I18N.t(`badge.win.${id}.next`)}</p>${closeButton()}`,
      'chapterwin',
    );
  } else if ([38, 40].includes(id)) {
    state.balls += 5;
    state.potions += 3;
    update();
    modal(
      `<h2>${REGIONS[id === 38 ? 10 : 11].badge}!</h2><p>${TRAINERS[id].win}</p><p>${I18N.t('badge.win.smallSupplies')}</p>${closeButton()}`,
      'chapterwin',
    );
  }
}

/* Switching costs the enemy's action and preserves HP, status and cooldowns. */
function enemySwitchCandidate(b) {
  if (
    b.trainer === null ||
    b.noSwapNext ||
    b.enemies.length - b.index < 2 ||
    b.enemySwaps >= (b.enemies.length > 3 ? 2 : 1)
  )
    return -1;
  const player = state.team[0],
    current = b.enemy;
  if (!player?.hp || !current?.hp) return -1;
  const incoming = mon =>
    Math.max(
      ...kit(player.id, player)
        .filter(m => m.power)
        .map(m => typeMultiplier(m.type, mon)),
      1,
    );
  const outgoing = mon =>
    Math.max(
      ...kit(mon.id, mon)
        .filter(m => m.power)
        .map(m => typeMultiplier(m.type, player)),
      1,
    );
  const baseline = incoming(current),
    attack = outgoing(current);
  if (baseline < 1.5 && attack >= 1) return -1;
  let best = -1,
    bestGain = 0;
  for (let i = b.index + 1; i < b.enemies.length; i++) {
    const mon = b.enemies[i];
    if (!mon.hp || mon.hp / mon.max < 0.35) continue;
    const defense = incoming(mon),
      offense = outgoing(mon);
    const gain =
      (baseline - defense) * 1.25 + (offense - attack) + (mon.hp / mon.max - current.hp / current.max) * 0.25;
    if ((defense <= baseline * 0.7 || offense >= attack * 1.5) && gain > 0.55 && gain > bestGain) {
      best = i;
      bestGain = gain;
    }
  }
  return best;
}
