/* A battle as it happens: turns, capture, the start and end of a fight, and enemy switches. */

// --- Turns.
// A full team defeat ends the fight without healing or moving the player.
// With another teammate still standing, a charm or the next teammate can step in.
// Returns true when the whole team is down and the battle has ended.
async function partyFaint() {
  const lead = state.team[0];
  if (lead?.hp > 0) return false;
  // The charm acts first, so it can save the last conscious teammate too.
  if (lead && lead.hp === 0 && lead.heldItem === 'rescue' && !lead.rescueUsed) {
    lead.rescueUsed = true;
    lead.hp = Math.ceil(lead.max * 0.25);
    if (battle) battle.log += ' Jimat Siaga: ' + SPECIES[lead.id].name + ' bangkit!';
    renderBattle();
    return false;
  }
  const i = state.team.findIndex(m => m.hp > 0);
  if (i < 0) {
    endBattle();
    modal(
      `<h2>${I18N.t('battle.fainted.title')}</h2><p>${I18N.t('battle.fainted.body')}</p>${closeButton(I18N.t('battle.fainted.walk'))}`,
      'defeat',
    );
    return true;
  }
  [state.team[0], state.team[i]] = [state.team[i], state.team[0]];
  if (battle) battle.log += ' ' + SPECIES[state.team[0].id].name + ' maju!';
  return false;
}
async function enemyTurn() {
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
    b.log = I18N.t('battle.enemySwap', {
      trainer: TRAINERS[b.trainer].name,
      old: SPECIES[outgoing.id].name,
      next: SPECIES[b.enemy.id].name,
    });
    planEnemy();
    renderBattle();
    save();
    await delay(400);
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
  // Cooldowns are read before the turn begins, the same rule as the player's moves.
  const ready = b.intent >= 0 && !(e.cooldowns[b.intent] > 0),
    skip = beginTurn(e);
  if (skip) b.log = skip;
  else if (ready && tempo(e) >= tempoCost(kit(e.id, e)[b.intent])) b.log = useMove(e, m, b.intent);
  else {
    e.tempo = Math.min(3, tempo(e) + 1);
    e.braced = true;
    e.focused = true;
    b.log = SPECIES[e.id].name + ' bersiap: membangun Tempo dan menahan pukulan.';
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
  b.busy = false;
  locked = false;
  planEnemy();
  update();
  renderBattle();
}

// --- Wild encounters and capture.
// Ronda Malam: from 19:00 to 05:00 on the player's clock, night guests join the wild:
// glowing Mangglow in the grass and Lumilaut in the water.
const isNight = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 5;
};
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
      // and each region's own signature species turns up now and then.
      .map(id => ({
        id,
        weight: id < 3 ? 0.5 * rareBoost() : id === 18 ? rareBoost() : id === REGIONS[r].signature ? 5 : 12,
      }))
      .filter(v => !(r === 11 && v.id === 44 && c.choices.contract === 0 && !c.resolved.includes('contract')))
      .map(v => ({
        ...v,
        weight:
          r === 6 && c.choices.coast === 0 && !c.resolved.includes('coast')
            ? v.weight * (v.id === 22 ? 0.1 : 1)
            : v.weight,
      }))
      .concat(nightGuests(r))
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
async function throwCapsule(ultra) {
  const b = battle;
  if (!b || locked || b.busy || b.trainer !== null) return;
  const key = ultra ? 'ultraballs' : 'balls',
    e = b.enemy;
  if (!(state[key] > 0)) {
    toast('Kapsul habis.');
    return;
  }
  state[key]--;
  spendEnergy(state.team[0]);
  b.busy = true;
  locked = true;
  b.log = (ultra ? 'Kapsul Ultra' : 'Kapsul Rantau') + ' dilempar…';
  renderBattle();
  save();
  await delay(650);
  const bonus = hasCondition(e, 'sleep') || hasCondition(e, 'paralysis') ? 0.25 : hasCondition(e) ? 0.12 : 0,
    rare = SPECIES[e.id].legendary;
  const chance = Math.min(
    0.97,
    (rare ? 0.06 : 0.18) + (rare ? 0.55 : 0.7) * (1 - e.hp / e.max) + bonus + (ultra ? 0.18 : 0),
  );
  if (Math.random() < chance) {
    // A catch counts as a win for the team: it earns XP before the newcomer joins.
    const xp = gainXP(e),
      reserve = state.team.length >= 6;
    (reserve ? (state.storage ??= []) : state.team).push({ ...e, cooldowns: {}, xp: 0 });
    if (!state.seen.includes(e.id)) state.seen.push(e.id);
    b.log = SPECIES[e.id].name + ' ditangkap! ' + xp + '.';
    renderBattle();
    await delay(500);
    endBattle();
    toast(SPECIES[e.id].name + (reserve ? ' dikirim ke Titipan.' : ' bergabung!'));
  } else {
    passTurn(state.team[0]);
    state.team[0].interrupted = false;
    b.log = 'Kapsul terbuka. Lemahkan HP dan beri status.';
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
  if (!room() && state.region === 0)
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
function startBattle(id, team) {
  openBattle(id, team);
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
  planEnemy();
  for (const m of [...state.team, ...battle.enemies]) {
    m.rescueUsed = false;
    if (m.id === 19 || m.heldItem === 'capacitor') m.tempo = 3;
    if (m.heldItem === 'medkit') m.ward = true;
  }
  renderBattle();
}
// Leaves `battle` untouched when the fight is not allowed yet or nobody can stand.
function openBattle(id, team) {
  if (ELITE_IDS.includes(id)) {
    if (!canChallenge(id)) return;
    team = TRAINERS[id].team.map(([sid, lv]) => [sid, Math.min(80, lv + leagueState().clears * 5)]);
  }
  if (team?.some(([sid]) => sid === 47) && (!legendQuest().open || ownsTarsion() || state.region !== 13))
    return;
  state.team.forEach(m => {
    m.shell = 0;
    m.ward = 0;
    m.sugar = 0;
    m.healBlock = 0;
  });
  if (id !== null && !canChallenge(id)) {
    trainerIntro(id);
    return;
  }
  // A rematch keeps up with the player: never below the original levels, never far behind.
  if (id !== null && !ELITE_IDS.includes(id) && state.defeated.includes(id) && state.team.length) {
    const average = Math.round(state.team.reduce((n, m) => n + m.level, 0) / state.team.length);
    team = team.map(([sid, lv]) => [sid, Math.min(80, Math.max(lv, average - 2))]);
  }
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
  const enemies = team.map(([sid, lv]) => makeMon(sid, lv));
  // Every creature faced is recorded as met in the Wargadex, owned or not.
  state.met ??= [];
  for (const m of enemies) if (!state.met.includes(m.id)) state.met.push(m.id);
  battle = {
    trainer: id,
    enemies,
    index: 0,
    enemy: enemies[0],
    busy: false,
    focus: false,
    guard: false,
    enemyGuard: false,
    enemyPotion: false,
    rematch: id !== null && state.defeated.includes(id),
    log:
      id === null
        ? `${SPECIES[enemies[0].id].name} liar muncul!`
        : `${TRAINERS[id].name} mengirim ${SPECIES[enemies[0].id].name}!`,
  };
  $('battle').classList.remove('hidden');
  renderBattle();
  update();
  beep(200, 0.2);
  battle.enemies.forEach(normalise);
}
function endBattle() {
  for (const m of [...state.team, ...(state.storage || [])]) clearBattleFlags(m);
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
  update();
  // First-time players are told once where to recover on the opening maps.
  if (!healTipShown && state.region <= 1 && state.team.some(m => m.hp < m.max * 0.5)) {
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
// The player's choice for this turn: a move (m0..m3), brace, or running.
// Capsules, items and switching have their own dialogs.
async function action(move) {
  if (!battle || battle.busy || locked) return;
  const b = battle,
    lead = state.team[0],
    slot = /^m[0-3]$/.test(move) ? Number(move[1]) : -1;
  if (slot >= 0 && tempo(lead) < tempoCost(kit(lead.id, lead)[slot])) {
    toast('Bangun Tempo dengan jurus ringan atau Bersiap.');
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
      b.log = 'Bersiap: +1 Tempo, akurasi berikutnya +12%, pukulan berikutnya berkurang 55%.';
    }
    b.log += ' ' + tick(lead);
    renderBattle();
    await delay(400);
    if (await partyFaint()) return;
    await enemyTurn();
    return;
  }
  if (move === 'run') {
    endBattle();
    toast('Kembali ke tempat semula. Status belum hilang.');
    return;
  }
  if (slot < 0) return;
  const m = normalise(lead),
    e = normalise(b.enemy);
  if (!kit(m.id, m)[slot] || m.cooldowns[slot] > 0) {
    toast('Jurus masih dalam jeda. Pilih jurus lain.');
    return;
  }
  b.busy = true;
  locked = true;
  b.log = beginTurn(m) || useMove(m, e, slot);
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
  if (firstWin && state.defeated.includes(id)) celebrateBadge(id);
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
          `<h2>Juara Liga Nusantara!</h2><p>${TRAINERS[48].name} menyerahkan piala. Warga Sukamaju memenuhi tribun: perjalanan dari bekal Bu Sari kini tercatat di Balai Juara.</p><p>Hadiah Juara: Rp30.000. Peneliti mengirim kabar: Tarsion sudah mengenali sinyal timmu. Kembali ke observatorium untuk quest <b>Mata di Balik Kubah</b>.</p><div class="actions"><button class="action" data-league="hall">Balai Juara</button>${closeButton('Kembali ke pelataran')}</div>`,
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
// per trainer, so repeating one fight is not a money farm.
function battleReward(b) {
  if (b.trainer === null) return b.enemy.level * 150;
  if (!b.rematch) return 31000 + state.region * 1500 + b.enemy.level * 500;
  const today = new Date().toISOString().slice(0, 10);
  state.rematchPaid ??= {};
  if (state.rematchPaid[b.trainer] === today) return 2000;
  state.rematchPaid[b.trainer] = today;
  return 12000;
}
// XP, then either the trainer's next creature or the victory payout and dialog.
async function concludeEnemy() {
  const b = battle,
    e = b.enemy;
  b.log = `${SPECIES[e.id].name} kalah! +${gainXP(e)}.`;
  renderBattle();
  save();
  await delay(700);
  if (b.index < b.enemies.length - 1) {
    b.index++;
    b.enemy = b.enemies[b.index];
    b.enemyGuard = false;
    b.enemyPotion = false;
    b.log = `${TRAINERS[b.trainer].name} mengirim ${SPECIES[b.enemy.id].name}! ${b.enemies.length - b.index} lawan tersisa.`;
    renderBattle();
    await delay(500);
    b.busy = false;
    locked = false;
    update();
    renderBattle();
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
      ? `Menang! Seluruh tim mendapat XP. +${money(reward)}`
      : `Menang! +${money(reward)}${!b.rematch ? ', bonus 1 jamu' : ''}`;
  renderBattle();
  beep(880, 0.2);
  await delay(700);
  endBattle();
  if (ti === 17 && !wasFinished) {
    ending();
    return;
  }
  if (ti === null) {
    toast(`Menang! Seluruh tim mendapat XP. +${money(reward)}`);
    return;
  }
  const t = TRAINERS[ti],
    line = (b.rematch && TRAINER_REMATCH_LINES[ti]) || t.win;
  modal(
    `<div class="portrait-head">${trainerArt(t.portrait)}<div><span class="eyebrow">PERTANDINGAN SELESAI</span><h2>${I18N.t('battle.victory.title', { name: t.name })}</h2></div></div><p>“${line}”</p><p>+${money(reward)}${!gateWasReady && gateReady(state.region) ? ', Semua syarat area selesai. Gerbang berikutnya terbuka!' : ''}</p>${closeButton('Lanjut perjalanan')}`,
  );
}
// First win against a badge holder: the reward and the chapter's closing dialog.
function celebrateBadge(id) {
  if ([26, 29, 32].includes(id)) {
    const r = id === 26 ? 5 : id === 29 ? 6 : 7;
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
      `<span class="eyebrow">${REGIONS[r].badge.toUpperCase()}</span><h2>${id === 26 ? 'Festival kembali menyala!' : id === 29 ? 'Suaka kembali bernapas!' : 'Langit kembali terbaca!'}</h2><p>${TRAINERS[id].win}</p><p>Semua teman pulih penuh. Bekal perjalanan: 5 kapsul, 2 Kapsul Ultra, 5 jamu dan 2 Jamu Pekat.</p><p>${id === 26 ? 'Lampu panggung menyala. Lanjutkan ke atrium Wargamall untuk kiriman kuliner dan Arena Rasa.' : id === 29 ? 'Rajapari muncul di dermaga suaka. Menangkapnya opsional; jalur gunung sudah terbuka.' : 'Empat lencana lengkap! Jalur Stasiun Sela terbuka di timur gunung. Jalakawatt tetap menunggu di gardu.'}</p>${closeButton(id === 32 ? 'Lanjut mencari legenda' : 'Lanjut perjalanan')}`,
      'chapterwin',
    );
  } else if ([34, 36].includes(id)) {
    state.balls += 5;
    state.potions += 3;
    update();
    modal(
      `<h2>${id === 34 ? 'Lencana Peron!' : 'Lencana Rasa!'}</h2><p>${TRAINERS[id].win}</p><p>Bekal: 5 kapsul dan 3 jamu.</p><p>${id === 34 ? 'Bab Air & Taman berlanjut di jalur yang sudah terbuka.' : 'Selesaikan seluruh kegiatan bab Pusat Kota, lalu gunakan penghubung di dermaga Pasar Rakyat menuju Pesisir Suaka.'}</p>${closeButton('Lanjut')}`,
      'chapterwin',
    );
  } else if ([38, 40].includes(id)) {
    state.balls += 5;
    state.potions += 3;
    update();
    modal(
      `<h2>${REGIONS[id === 38 ? 10 : 11].badge}!</h2><p>${TRAINERS[id].win}</p><p>Bekal: 5 kapsul dan 3 jamu.</p>${closeButton('Lanjut')}`,
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
