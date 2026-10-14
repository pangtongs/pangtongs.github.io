/* Story progress: what is open, what may be challenged, what comes next. */

// What a leader is still waiting for: challengers to beat first, or the task of their area.
const LEADER_GATES = {
  17: { before: [13, 14, 15, 23] },
  26: { region: REGION.FESTIVAL },
  29: { region: REGION.PESISIR },
  32: { region: REGION.PUNCAK },
  34: { before: [33], task: 'rail' },
  36: { before: [35], task: 'orders' },
  38: { before: [37], task: 'gears' },
  40: { before: [39], task: 'irrigation' },
  42: { before: [41] },
  // Chapter five (SEBERANG_GATED): the Cap leaders after their area's task, then
  // Barisan Bara's admin after the valley elder and its Mandor Besi after admin and dalang.
  59: { before: [55, 58], task: 'pinisi' },
  64: { before: [60, 62, 63], task: 'ulin' },
  68: { before: [65, 67], task: 'tongkonan' },
  69: { before: [68] },
  70: { before: [71], task: 'dieng' },
  74: { before: [69, 70] },
};
function leaderGate(id) {
  const g = LEADER_GATES[id];
  if (!g) return null;
  const before = g.region !== undefined ? REGIONS[g.region].required.slice(0, 2) : g.before,
    task = g.region !== undefined ? REGIONS[g.region].quest : g.task;
  const waiting = before.filter(n => !state.defeated.includes(n));
  if (waiting.length) return { kind: 'trainer', waiting };
  if (task && !has(task)) return { kind: 'task' };
  return null;
}
// A leader who is not ready yet says why, in their own voice.
function lockedLeaderScene(id) {
  const gate = leaderGate(id);
  if (!gate) return false;
  const names =
    gate.kind === 'trainer' ? gate.waiting.map(n => TRAINERS[n].name).join(I18N.t('list.and')) : '';
  speak(id, I18N.t(`gate.leader.${id}.${gate.kind}`, { names }), localObjective());
  return true;
}
// The person who looks after a device stops the player until they have battled.
function deviceGateScene(trainerId, region) {
  speak(trainerId, I18N.t(`gate.device.${region}`), localObjective());
}
// The next objective, but only when it belongs to the area the player is in.
function localObjective() {
  const o = nextObjective();
  return o.region === state.region ? o.title : '';
}
function canChallenge(id) {
  if (SEBERANG_GATED.includes(id)) return !leaderGate(id);
  if (id === 42) return state.defeated.includes(41);
  if (ELITE_IDS.includes(id))
    return state.region === REGION.LIGA && leagueState().active && ELITE_IDS[leagueState().stage] === id;
  if (id === 38) return state.defeated.includes(37) && has('gears');
  if (id === 40) return state.defeated.includes(39) && has('irrigation');
  if (id === 34) return state.defeated.includes(33) && has('rail');
  if (id === 36) return state.defeated.includes(35) && has('orders');
  const r = regionOfLeader(id);
  if (r !== null)
    return has(REGIONS[r].quest) && REGIONS[r].required.slice(0, 2).every(n => state.defeated.includes(n));
  if (id === 17) return [13, 14, 15, 23].every(i => state.defeated.includes(i));
  if (id === 51) return has('champion');
  if (id === 52) return has('champion') && state.defeated.includes(51);
  return true;
}

function gateReady(r) {
  if (r === REGION.KALDERA) return [41, 42].every(i => state.defeated.includes(i));
  if (r === REGION.OBSERVATORIUM) return state.defeated.includes(43);
  if (r === REGION.LIGA) return has('champion');
  if (r === REGION.BALAI_BETON) return state.finished;
  const trainersDone = REGIONS[r].required.every(i => state.defeated.includes(i));
  return trainersDone && (r < REGION.BALAI_BETON ? questDone(r) : has(REGIONS[r].quest));
}
function maxUnlocked() {
  return Math.max(...PLACES.map((_, i) => i).filter(regionAvailable));
}
function maxUnlockedChapter() {
  if (debugFlags.openAll) return WORLD_CHAPTERS.length - 1;
  let chapter = state.finished ? 1 : 0;
  const requirements = [
    [REGION.SUKAMAJU, REGION.PADANG_OJEK, REGION.HUTAN],
    [REGION.PASAR_RAKYAT, REGION.BALAI_BETON, REGION.FESTIVAL, REGION.WARGAMALL],
    [REGION.PESISIR, REGION.BENGKEL, REGION.WADUK, REGION.STASIUN],
  ];
  while (chapter < 3 && requirements[chapter].every(gateReady)) chapter++;
  // The Champion may sail across the sea with Pak Darto.
  if (chapter === 3 && has('champion')) chapter = 4;
  // Older checkpoints retain access to the chapter they already reached.
  return Math.max(chapter, chapterOf(), ...(state.visited || []).map(i => chapterOf(i)));
}
function regionAvailable(i) {
  const chapter = chapterOf(i);
  return chapter >= 0 && chapter <= maxUnlockedChapter();
}
function legendReady(id) {
  const c = civicState();
  if (id === 19 && c.choices.coast === 0 && !c.resolved.includes('coast')) return false;
  return id === 19 ? gateReady(REGION.PESISIR) : id === 18 ? regionAvailable(REGION.PUNCAK) : false;
}

// --- The next thing to do, shown above the map and followed by "Ke tujuan".
function nextObjective() {
  const found = branchObjective();
  let o = found;
  if (!o) {
    o = storyObjective();
    o = { ...o, title: canonicalText(o.title), detail: canonicalText(o.detail) };
  }
  // The League desk and the Champion Hall are inside the arena building.
  if (o.region === REGION.LIGA && o.key === 'league')
    return {
      ...o,
      room: 'leaguearena',
      detail: I18N.t('objective.league.enterArena'),
    };
  if (o.region === REGION.LIGA && o.key === 'hall') return { ...o, key: 'latehall', room: 'leaguearena' };
  return o;
}
// Two pairs of regions open together; point at whichever the player is working on.
function branchObjective() {
  for (const [a, b] of [[REGION.BENGKEL, REGION.WADUK]])
    if (regionAvailable(b) && gateReady(REGION.PESISIR) && ![a, b].every(gateReady)) {
      const r =
        [a, b].includes(state.region) && !gateReady(state.region) ? state.region : !gateReady(a) ? a : b;
      const reg = REGIONS[r],
        first = reg.required.find(id => !state.defeated.includes(id) && canChallenge(id));
      if (first !== undefined)
        return {
          title: I18N.t('objective.meet', { name: tr(TRAINERS[first].name) }),
          detail: I18N.t('objective.branch.choose', {
            first: tr(REGIONS[a].name),
            second: tr(REGIONS[b].name),
          }),
          region: r,
          key: 'trainer',
          id: first,
          room:
            r === REGION.PESISIR && first === 29
              ? 'tidearena'
              : r === REGION.PUNCAK && first === 32
                ? 'observatory'
                : null,
        };
      if (!has(reg.quest))
        return {
          title: reg.questName,
          detail: reg.questText,
          region: r,
          key: {
            [REGION.PESISIR]: 'valves',
            [REGION.PUNCAK]: 'signals',
            [REGION.BENGKEL]: 'gears',
            [REGION.WADUK]: 'irrigation',
          }[r],
          room: r === REGION.PESISIR ? 'tidelab' : r === REGION.PUNCAK ? 'observatory' : null,
        };
    }
  return null;
}
function storyObjective() {
  if (!state.finished) return openingObjective();
  if (!gateReady(REGION.FESTIVAL)) return chapterObjective([REGION.FESTIVAL]);
  if (!gateReady(REGION.WARGAMALL)) return stationObjective([REGION.WARGAMALL]);
  if (!gateReady(REGION.PESISIR)) return chapterObjective([REGION.PESISIR]);
  if (![REGION.BENGKEL, REGION.WADUK].every(gateReady)) return wadukObjective();
  if (!gateReady(REGION.STASIUN)) return stationObjective([REGION.STASIUN]);
  if (!gateReady(REGION.PUNCAK)) return chapterObjective([REGION.PUNCAK]);
  return leagueObjective();
}
// Chapters 1 to 5: Sukamaju to the Beton badge.
function openingObjective() {
  const obj = (title, detail, r, key, roomKey = null, id = null) => ({
    title,
    detail,
    region: r,
    key,
    room: roomKey,
    id,
  });
  if (state.finished)
    return obj(
      I18N.t('objective.finished.title'),
      I18N.t('objective.finished.detail'),
      REGION.SUKAMAJU,
      'shoot',
    );
  if (!has('parcel'))
    return obj(
      I18N.t('objective.parcel.title'),
      I18N.t('objective.parcel.detail'),
      REGION.SUKAMAJU,
      'quest',
      'warung',
    );
  // A second Wargamon first: the local trainers each bring two.
  if (state.team.length + (state.storage?.length || 0) < 2 && !state.defeated.length)
    return obj(I18N.t('opening.partner.title'), I18N.t('opening.partner.detail'), REGION.SUKAMAJU, 'wild');
  for (const id of REGIONS[REGION.SUKAMAJU].required)
    if (!state.defeated.includes(id))
      return obj(
        I18N.t('objective.sukamaju.trainer.title', { name: tr(TRAINERS[id].name) }),
        I18N.t('objective.sukamaju.trainer.detail'),
        REGION.SUKAMAJU,
        'trainer',
        id === 9 ? 'warung' : null,
        id,
      );
  if (!has('permit'))
    return obj(
      I18N.t('objective.sukamaju.permit.title'),
      I18N.t('objective.sukamaju.permit.detail'),
      REGION.SUKAMAJU,
      'permit',
      'rt',
    );
  if (!has('delivery'))
    return obj(
      I18N.t('objective.ojek.delivery.title'),
      I18N.t('objective.ojek.delivery.detail'),
      REGION.PADANG_OJEK,
      'quest',
    );
  for (const id of REGIONS[REGION.PADANG_OJEK].required)
    if (!state.defeated.includes(id))
      return obj(
        I18N.t('objective.ojek.trainer.title', { name: tr(TRAINERS[id].name) }),
        I18N.t('objective.ojek.trainer.detail'),
        REGION.PADANG_OJEK,
        'trainer',
        null,
        id,
      );
  if (state.trash.length < 3) {
    const id = [0, 1, 2].find(i => !state.trash.includes(i));
    return obj(
      I18N.t('objective.forest.trash.title', { n: state.trash.length }),
      I18N.t('objective.forest.trash.detail'),
      REGION.HUTAN,
      'trash',
      null,
      id,
    );
  }
  if (!state.stamps.includes('sri'))
    return obj(
      I18N.t('objective.market.stampSri.title'),
      I18N.t('objective.market.stampSri.detail'),
      REGION.PASAR_RAKYAT,
      'stamp',
    );
  if (!state.stamps.includes('warung'))
    return obj(
      I18N.t('objective.market.stampImah.title'),
      I18N.t('objective.market.stampImah.detail'),
      REGION.PASAR_RAKYAT,
      'stamp',
      'warungcity',
    );
  if (state.seen.filter(i => i < 12).length < 3)
    return obj(
      I18N.t('objective.market.seen.title'),
      I18N.t('objective.market.seen.detail', { n: state.seen.filter(i => i < 12).length }),
      REGION.HUTAN,
      'wild',
    );
  if (!has('ticket'))
    return obj(
      I18N.t('objective.market.ticket.title'),
      I18N.t('objective.market.ticket.detail'),
      REGION.PASAR_RAKYAT,
      'quest',
      'warungcity',
    );
  if (!state.defeated.includes(12))
    return obj(
      I18N.t('objective.market.iqbol.title'),
      I18N.t('objective.market.iqbol.detail'),
      REGION.PASAR_RAKYAT,
      'trainer',
      null,
      12,
    );
  for (const id of [13, 14, 15, 23])
    if (!state.defeated.includes(id))
      return obj(
        I18N.t('objective.beton.trainer.title', { name: tr(TRAINERS[id].name) }),
        I18N.t('objective.beton.trainer.detail'),
        REGION.BALAI_BETON,
        'trainer',
        'gym',
        id,
      );
  return obj(
    I18N.t('objective.beton.final.title'),
    I18N.t('objective.beton.final.detail'),
    REGION.BALAI_BETON,
    'trainer',
    'gym',
    17,
  );
}
// Chapters 6 to 8: festival, coast and summit, then the two optional legends.
function chapterObjective(regions = [REGION.FESTIVAL, REGION.PESISIR, REGION.PUNCAK]) {
  if (!state.finished) return openingObjective();
  const o = (title, detail, region, key, room = null, id = null) => ({
    title,
    detail,
    region,
    key,
    room,
    id,
  });
  for (const [r, ids, key, roomKey, puzzle] of [
    [REGION.FESTIVAL, [24, 25, 26], 'circuit', null, 'power'],
    [REGION.PESISIR, [27, 28, 29], 'tides', 'tidelab', 'valves'],
    [REGION.PUNCAK, [30, 31, 32], 'orbit', 'observatory', 'signals'],
  ]) {
    if (!regions.includes(r)) continue;
    for (const id of ids.slice(0, 2))
      if (!state.defeated.includes(id))
        return o(
          I18N.t('objective.regionMeet', { region: tr(REGIONS[r].name), name: tr(TRAINERS[id].name) }),
          REGIONS[r].goal,
          r,
          'trainer',
          r === REGION.PESISIR && id === 27 ? 'tidearena' : null,
          id,
        );
    if (!has(key))
      return o(
        I18N.t('objective.helpResidents', { task: I18N.t(`objective.task.${puzzle}`) }),
        REGIONS[r].questText,
        r,
        puzzle,
        roomKey,
      );
    const boss = ids[2];
    if (!state.defeated.includes(boss))
      return o(
        I18N.t('objective.badgeFrom.title', { badge: tr(REGIONS[r].badge), name: tr(TRAINERS[boss].name) }),
        I18N.t('objective.badgeFrom.detail'),
        r,
        'trainer',
        r === REGION.FESTIVAL ? 'stage' : r === REGION.PESISIR ? 'tidearena' : 'observatory',
        boss,
      );
  }
  chapterState();
  if (!state.legendCaught.includes(19))
    return o(
      I18N.t('objective.legend.rajapari.title'),
      I18N.t('objective.legend.rajapari.detail'),
      REGION.PESISIR,
      'legend',
      null,
      19,
    );
  if (!state.seen.includes(18))
    return o(
      I18N.t('objective.legend.jalakawatt.title'),
      I18N.t('objective.legend.jalakawatt.detail'),
      REGION.PUNCAK,
      'legend',
      null,
      18,
    );
  return o(
    I18N.t('objective.chaptersDone.title'),
    I18N.t('objective.chaptersDone.detail'),
    REGION.SUKAMAJU,
    'shoot',
  );
}
// Chapters 9 and 10: the station and the night market.
function stationObjective(regions = [REGION.STASIUN, REGION.WARGAMALL]) {
  const o = (title, detail, region, key, id = null) => ({
    title,
    detail,
    region,
    key,
    room: region === REGION.WARGAMALL ? 'mallatrium' : null,
    id,
  });
  for (const [r, first, boss, quest, key] of [
    [REGION.STASIUN, 33, 34, 'rail', 'rail'],
    [REGION.WARGAMALL, 35, 36, 'orders', 'dispatch'],
  ]) {
    if (!regions.includes(r)) continue;
    if (!state.defeated.includes(first))
      return o(
        I18N.t('objective.regionMeet', { region: tr(REGIONS[r].name), name: tr(TRAINERS[first].name) }),
        REGIONS[r].goal,
        r,
        'trainer',
        first,
      );
    if (!has(quest)) {
      if (r === REGION.WARGAMALL && deliveryState().carry) {
        const d = deliveryState(),
          order = DELIVERY_ORDERS[d.done];
        return o(
          I18N.t('objective.delivery.title', { item: tr(order.item), name: tr(order.name) }),
          I18N.t('objective.delivery.detail', { n: deliveryRemaining() }),
          REGION.WARGAMALL,
          'parcel',
          order.target,
        );
      }
      return o(
        I18N.t(r === REGION.STASIUN ? 'objective.rail.title' : 'objective.dispatch.title'),
        REGIONS[r].questText,
        r,
        key,
      );
    }
    if (!state.defeated.includes(boss))
      return o(
        I18N.t('objective.badgeFrom.title', { badge: tr(REGIONS[r].badge), name: tr(TRAINERS[boss].name) }),
        I18N.t('objective.station.badge.detail'),
        r,
        'trainer',
        boss,
      );
  }
  const optional = chapterObjective();
  if (optional.key === 'legend') return optional;
  return o(
    I18N.t('objective.sixBadges.title'),
    I18N.t('objective.sixBadges.detail'),
    REGION.WARGAMALL,
    'trainer',
    36,
  );
}
// Chapters 11 and 12: the workshop village and the reservoir park.
function wadukObjective() {
  for (const [r, first, boss, key] of [
    [REGION.BENGKEL, 37, 38, 'gears'],
    [REGION.WADUK, 39, 40, 'irrigation'],
  ]) {
    const o = (title, detail, k, id = null) => ({ title, detail, region: r, key: k, room: null, id });
    if (!state.defeated.includes(first))
      return o(
        I18N.t('objective.meet', { name: tr(TRAINERS[first].name) }),
        REGIONS[r].goal,
        'trainer',
        first,
      );
    if (!has(key)) return o(REGIONS[r].questName + '.', REGIONS[r].questText, key);
    if (!state.defeated.includes(boss))
      return o(
        I18N.t('objective.badge.title', { badge: tr(REGIONS[r].badge) }),
        I18N.t('objective.badge.detail', { name: tr(TRAINERS[boss].name) }),
        'trainer',
        boss,
      );
  }
  return {
    title: I18N.t('objective.nineBadges.title'),
    detail: I18N.t('objective.nineBadges.detail'),
    region: REGION.WADUK,
    key: 'trainer',
    id: 40,
    room: null,
  };
}
// Chapters 13 to 15: the caldera, the observatory and the League.
function leagueObjective() {
  const obj = (title, detail, region, key, id = null) => ({ title, detail, region, key, id, room: null });
  for (const [id, r] of [
    [41, REGION.KALDERA],
    [42, REGION.KALDERA],
    [43, REGION.OBSERVATORIUM],
  ])
    if (!state.defeated.includes(id))
      return obj(
        I18N.t('objective.meet', { name: tr(TRAINERS[id].name) }),
        REGIONS[r].goal,
        r,
        'trainer',
        id,
      );
  if (!has('champion'))
    return obj(
      leagueState().active
        ? I18N.t('objective.league.stage', {
            stage: leagueState().stage + 1,
            name: tr(TRAINERS[ELITE_IDS[leagueState().stage]].name),
          })
        : I18N.t('objective.league.challenge'),
      I18N.t(leagueState().active ? 'objective.league.active' : 'objective.league.prepare'),
      REGION.LIGA,
      'league',
    );
  if (!ownsTarsion()) {
    const q = legendQuest();
    return obj(
      I18N.t('objective.tarsion.title', {
        step: I18N.t(`objective.tarsion.step.${q.open ? 'open' : q.started ? 'started' : 'return'}`),
      }),
      I18N.t(`objective.tarsion.${q.open ? 'open' : q.started ? 'started' : 'return'}`),
      REGION.OBSERVATORIUM,
      q.started && !q.open ? 'resonator' : 'tarsion',
      q.started && !q.open ? 0 : null,
    );
  }
  // Mudik: the Champion goes home, where two old acquaintances wait.
  for (const [id, r] of [
    [51, REGION.SUKAMAJU],
    [52, REGION.PADANG_OJEK],
  ])
    if (!state.defeated.includes(id))
      return obj(
        I18N.t('mudik.objective.title', { name: TRAINERS[id].name }),
        I18N.t(id === 51 ? 'mudik.objective.rival' : 'mudik.objective.master'),
        r,
        'trainer',
        id,
      );
  const across = seberangObjective();
  if (across) return across;
  return obj(
    I18N.t('objective.champion.title'),
    I18N.t('objective.champion.detail', { n: SPECIES.filter((_, id) => speciesOffered(id)).length }),
    REGION.LIGA,
    'hall',
  );
}
function questDone(r = state.region) {
  if (r === REGION.SUKAMAJU) return has('parcel') && has('permit');
  if (r === REGION.HUTAN) return state.trash.length === 3;
  if (r === REGION.BALAI_BETON) return state.finished;
  return has(REGIONS[r].quest);
}
function objectiveTarget(o) {
  return spots().find(p => p.key === o.key && (o.id === null || p.id === o.id));
}
