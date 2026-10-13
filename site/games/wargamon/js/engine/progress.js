/* Story progress: what is open, what may be challenged, what comes next. */

// What a leader is still waiting for: challengers to beat first, or the task of their area.
const LEADER_GATES = {
  17: { before: [13, 14, 15, 23] },
  26: { region: 5 },
  29: { region: 6 },
  32: { region: 7 },
  34: { before: [33], task: 'rail' },
  36: { before: [35], task: 'orders' },
  38: { before: [37], task: 'gears' },
  40: { before: [39], task: 'irrigation' },
  42: { before: [41] },
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
  if (id === 42) return state.defeated.includes(41);
  if (ELITE_IDS.includes(id))
    return state.region === 14 && leagueState().active && ELITE_IDS[leagueState().stage] === id;
  if (id === 38) return state.defeated.includes(37) && has('gears');
  if (id === 40) return state.defeated.includes(39) && has('irrigation');
  if (id === 34) return state.defeated.includes(33) && has('rail');
  if (id === 36) return state.defeated.includes(35) && has('orders');
  const r = id === 26 ? 5 : id === 29 ? 6 : id === 32 ? 7 : null;
  if (r !== null)
    return has(REGIONS[r].quest) && REGIONS[r].required.slice(0, 2).every(n => state.defeated.includes(n));
  if (id === 17) return [13, 14, 15, 23].every(i => state.defeated.includes(i));
  return true;
}

function gateReady(r) {
  if (r === 12) return [41, 42].every(i => state.defeated.includes(i));
  if (r === 13) return state.defeated.includes(43);
  if (r === 14) return has('champion');
  if (r === 4) return state.finished;
  const trainersDone = REGIONS[r].required.every(i => state.defeated.includes(i));
  return trainersDone && (r < 4 ? questDone(r) : has(REGIONS[r].quest));
}
function maxUnlocked() {
  return Math.max(...PLACES.map((_, i) => i).filter(regionAvailable));
}
function maxUnlockedChapter() {
  if (debugFlags.openAll) return 3;
  let chapter = state.finished ? 1 : 0;
  const requirements = [
    [0, 1, 2],
    [3, 4, 5, 9],
    [6, 10, 11, 8],
  ];
  while (chapter < 3 && requirements[chapter].every(gateReady)) chapter++;
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
  return id === 19 ? gateReady(6) : id === 18 ? regionAvailable(7) : false;
}

// --- The next thing to do, shown above the map and followed by "Ke tujuan".
function nextObjective() {
  const found = branchObjective();
  let o = found;
  if (!o) {
    o = storyObjective();
    o = { ...o, title: canonicalText(o.title), detail: canonicalText(o.detail) };
  }
  o = { ...o, title: immersiveCopy(o.title), detail: immersiveCopy(o.detail) };
  // The League desk and the Champion Hall are inside the arena building.
  if (o.region === 14 && o.key === 'league')
    return {
      ...o,
      room: 'leaguearena',
      detail: 'Masuk gedung Liga melalui tangga utara, lalu daftar di meja arena.',
    };
  if (o.region === 14 && o.key === 'hall') return { ...o, key: 'latehall', room: 'leaguearena' };
  return o;
}
// Two pairs of regions open together; point at whichever the player is working on.
function branchObjective() {
  for (const [a, b] of [[10, 11]])
    if (regionAvailable(b) && gateReady(6) && ![a, b].every(gateReady)) {
      const r =
        [a, b].includes(state.region) && !gateReady(state.region) ? state.region : !gateReady(a) ? a : b;
      const reg = REGIONS[r],
        first = reg.required.find(id => !state.defeated.includes(id) && canChallenge(id));
      if (first !== undefined)
        return {
          title: 'Temui ' + TRAINERS[first].name + '.',
          detail: 'Kamu boleh memilih ' + REGIONS[a].name + ' atau ' + REGIONS[b].name + ' lebih dulu.',
          region: r,
          key: 'trainer',
          id: first,
          room: r === 6 && first === 29 ? 'tidearena' : r === 7 && first === 32 ? 'observatory' : null,
        };
      if (!has(reg.quest))
        return {
          title: reg.questName,
          detail: reg.questText,
          region: r,
          key: { 6: 'valves', 7: 'signals', 10: 'gears', 11: 'irrigation' }[r],
          room: r === 6 ? 'tidelab' : r === 7 ? 'observatory' : null,
        };
    }
  return null;
}
function storyObjective() {
  if (!state.finished) return openingObjective();
  if (!gateReady(5)) return chapterObjective([5]);
  if (!gateReady(9)) return stationObjective([9]);
  if (!gateReady(6)) return chapterObjective([6]);
  if (![10, 11].every(gateReady)) return wadukObjective();
  if (!gateReady(8)) return stationObjective([8]);
  if (!gateReady(7)) return chapterObjective([7]);
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
      'Cerita utama selesai. Kamu sudah punya Lencana Beton.',
      'Kalau mau, coba adu penalti di lapangan Sukamaju, temui penantang di rute lain, atau lengkapi Wargadex.',
      0,
      'shoot',
    );
  if (!has('parcel'))
    return obj(
      'Ambil bekal dari Bu Sari.',
      'Masuk Warung Bu Sari di Sukamaju, lalu bicara dengan beliau.',
      0,
      'quest',
      'warung',
    );
  for (const id of REGIONS[0].required)
    if (!state.defeated.includes(id))
      return obj(
        'Tanding melawan ' + TRAINERS[id].name + '.',
        'Temui empat penantang Sukamaju sebelum meminta surat jalan.',
        0,
        'trainer',
        id === 9 ? 'warung' : null,
        id,
      );
  if (!has('permit'))
    return obj(
      'Minta surat jalan kepada Pak RT.',
      'Masuk Pos RT. Pak RT ada di depan meja, bukan bangunan kosong.',
      0,
      'permit',
      'rt',
    );
  if (!has('delivery'))
    return obj(
      'Antar bekal ke pangkalan ojek.',
      'Bicara dengan petugas Pos Ojek di Padang Ojek.',
      1,
      'quest',
    );
  for (const id of REGIONS[1].required)
    if (!state.defeated.includes(id))
      return obj(
        'Lewati tantangan ' + TRAINERS[id].name + '.',
        'Menang untuk membuka jalur menuju hutan.',
        1,
        'trainer',
        null,
        id,
      );
  if (state.trash.length < 3) {
    const id = [0, 1, 2].find(i => !state.trash.includes(i));
    return obj(
      'Bersihkan jalur hutan: ' + state.trash.length + '/3 kantong.',
      'Ikuti jalur krem yang terlihat. Kolam dan daerah di luar jalur tidak bisa dilewati.',
      2,
      'trash',
      null,
      id,
    );
  }
  if (!state.stamps.includes('sri'))
    return obj(
      'Minta stempel Bu Sri di Pasar Rakyat.',
      'Kumpulkan dua stempel dari warga, lalu tanding dengan Iqbol di lapak selatan.',
      3,
      'stamp',
    );
  if (!state.stamps.includes('warung'))
    return obj(
      'Ambil stempel Bu Imah di balai pasar.',
      'Masuk Pasar Rakyat, lalu bicara dengan Bu Imah di sisi kiri aula.',
      3,
      'stamp',
      'warungcity',
    );
  if (state.seen.filter(i => i < 12).length < 3)
    return obj(
      'Kenali minimal tiga jenis dasar Wargamon.',
      'Koleksi saat ini ' +
        state.seen.filter(i => i < 12).length +
        '/3. Tangkap jenis yang belum kamu miliki.',
      2,
      'wild',
    );
  if (!has('ticket'))
    return obj(
      'Tukar stempel dengan kartu perjalanan.',
      'Temui Pak Darto di meja perjalanan di dalam balai Pasar Rakyat.',
      3,
      'quest',
      'warungcity',
    );
  if (!state.defeated.includes(12))
    return obj(
      'Temui Iqbol di lapak selatan pasar.',
      'Kartu sudah terbit. Menangkan pertandingan ini sebelum ujian di Balai Beton.',
      3,
      'trainer',
      null,
      12,
    );
  for (const id of [13, 14, 15, 23])
    if (!state.defeated.includes(id))
      return obj(
        'Arena Beton: kalahkan ' + TRAINERS[id].name + '.',
        'Masuk gedung gym dan tuntaskan empat pertandingan kualifikasi.',
        4,
        'trainer',
        'gym',
        id,
      );
  return obj(
    'Final: kalahkan Joko Widuduk.',
    'Joko menunggu di belakang aula Balai Beton. Setelah lencana, lanjutkan ke Festival Arus.',
    4,
    'trainer',
    'gym',
    17,
  );
}
// Chapters 6 to 8: festival, coast and summit, then the two optional legends.
function chapterObjective(regions = [5, 6, 7]) {
  if (!state.finished) return openingObjective();
  const o = (title, detail, region, key, room = null, id = null) => ({
    title,
    detail,
    region,
    key,
    room,
    id,
  });
  for (const [r, ids, key, roomKey, puzzle, label] of [
    [5, [24, 25, 26], 'circuit', null, 'power', 'panel listrik'],
    [6, [27, 28, 29], 'tides', 'tidelab', 'valves', 'katup suaka'],
    [7, [30, 31, 32], 'orbit', 'observatory', 'signals', 'teleskop'],
  ]) {
    if (!regions.includes(r)) continue;
    for (const id of ids.slice(0, 2))
      if (!state.defeated.includes(id))
        return o(
          REGIONS[r].name + ': temui ' + TRAINERS[id].name + '.',
          REGIONS[r].goal,
          r,
          'trainer',
          r === 6 && id === 27 ? 'tidearena' : null,
          id,
        );
    if (!has(key)) return o('Selesaikan puzzle ' + label + '.', REGIONS[r].questText, r, puzzle, roomKey);
    const boss = ids[2];
    if (!state.defeated.includes(boss))
      return o(
        'Rebut ' + REGIONS[r].badge + ' dari ' + TRAINERS[boss].name + '.',
        'Puzzle sudah selesai. Siapkan tim, lalu masuk arena.',
        r,
        'trainer',
        r === 5 ? 'stage' : r === 6 ? 'tidearena' : 'observatory',
        boss,
      );
  }
  chapterState();
  if (!state.legendCaught.includes(19))
    return o(
      'Opsional: temui Rajapari di dermaga suaka.',
      'Cerita selesai! Legenda bisa dicoba lagi jika kalah atau kabur. Tim penuh? Tangkapan masuk Titipan.',
      6,
      'legend',
      null,
      19,
    );
  if (!state.seen.includes(18))
    return o(
      'Opsional: temui Jalakawatt di gardu gunung.',
      'Cerita selesai! Lemahkan HP dan beri status sebelum melempar kapsul.',
      7,
      'legend',
      null,
      18,
    );
  return o(
    'Semua bab selesai. empat lencana dan legenda suaka!',
    'Jelajahi ulang, atur tim, atau adu penalti di lapangan Sukamaju.',
    0,
    'shoot',
  );
}
// Chapters 9 and 10: the station and the night market.
function stationObjective(regions = [8, 9]) {
  const o = (title, detail, region, key, id = null) => ({
    title,
    detail,
    region,
    key,
    room: region === 9 ? 'mallatrium' : null,
    id,
  });
  for (const [r, first, boss, quest, key] of [
    [8, 33, 34, 'rail', 'rail'],
    [9, 35, 36, 'orders', 'dispatch'],
  ]) {
    if (!regions.includes(r)) continue;
    if (!state.defeated.includes(first))
      return o(
        REGIONS[r].name + ': temui ' + TRAINERS[first].name + '.',
        REGIONS[r].goal,
        r,
        'trainer',
        first,
      );
    if (!has(quest)) {
      if (r === 9 && deliveryState().carry) {
        const d = deliveryState(),
          order = DELIVERY_ORDERS[d.done];
        return o(
          'Antar ' + order.item + ' ke ' + order.name + '.',
          'Sisa ' + deliveryRemaining() + ' langkah hangat.',
          9,
          'parcel',
          order.target,
        );
      }
      return o(
        r === 8 ? 'Sambungkan rel ke Peron 2.' : 'Ambil pesanan di dapur kiriman.',
        REGIONS[r].questText,
        r,
        key,
      );
    }
    if (!state.defeated.includes(boss))
      return o(
        'Rebut ' + REGIONS[r].badge + ' dari ' + TRAINERS[boss].name + '.',
        'Tantangan wilayah selesai. Siapkan tim dan dekati arena.',
        r,
        'trainer',
        boss,
      );
  }
  const optional = chapterObjective();
  if (optional.key === 'legend') return optional;
  return o(
    'Enam lencana lengkap!',
    'Koleksi 38 bentuk, tumbuhkan Satecil di Lv.36, atau tanding ulang.',
    9,
    'trainer',
    36,
  );
}
// Chapters 11 and 12: the workshop village and the reservoir park.
function wadukObjective() {
  for (const [r, first, boss, key] of [
    [10, 37, 38, 'gears'],
    [11, 39, 40, 'irrigation'],
  ]) {
    const o = (title, detail, k, id = null) => ({ title, detail, region: r, key: k, room: null, id });
    if (!state.defeated.includes(first))
      return o('Temui ' + TRAINERS[first].name + '.', REGIONS[r].goal, 'trainer', first);
    if (!has(key)) return o(REGIONS[r].questName + '.', REGIONS[r].questText, key);
    if (!state.defeated.includes(boss))
      return o(
        'Rebut ' + REGIONS[r].badge + '.',
        'Siapkan tim lalu tantang ' + TRAINERS[boss].name + '.',
        'trainer',
        boss,
      );
  }
  return {
    title: 'Delapan lencana lengkap!',
    detail: 'Koleksi 42 bentuk atau coba susunan tim baru.',
    region: 11,
    key: 'trainer',
    id: 40,
    room: null,
  };
}
// Chapters 13 to 15: the caldera, the observatory and the League.
function leagueObjective() {
  const obj = (title, detail, region, key, id = null) => ({ title, detail, region, key, id, room: null });
  for (const [id, r] of [
    [41, 12],
    [42, 12],
    [43, 13],
  ])
    if (!state.defeated.includes(id))
      return obj('Temui ' + TRAINERS[id].name + '.', REGIONS[r].goal, r, 'trainer', id);
  if (!has('champion'))
    return obj(
      leagueState().active
        ? 'Liga ' + (leagueState().stage + 1) + '/5, ' + TRAINERS[ELITE_IDS[leagueState().stage]].name
        : 'Tantang Elite Four dan sang Juara.',
      leagueState().active
        ? 'HP terbawa. Gunakan bekal dari Tim & Tas, lalu lanjutkan pertandingan.'
        : 'Siapkan enam teman dan bekal. Daftar di pelataran Liga.',
      14,
      'league',
    );
  if (!ownsTarsion()) {
    const q = legendQuest();
    return obj(
      'Mata di Balik Kubah, ' +
        (q.open ? 'dekati Tarsion.' : q.started ? 'selaraskan tiga panel.' : 'kembali ke observatorium.'),
      q.open
        ? 'Tarsion menunggu di pelataran. Lemahkan HP dan beri status; satu tangkapan per perjalanan.'
        : q.started
          ? 'Matahari ke Timur; Bulan berlawanan; Bintang satu langkah searah jarum jam dari Bulan.'
          : 'Satu quest opsional untuk berteman dengan penjaga observatorium.',
      13,
      q.started && !q.open ? 'resonator' : 'tarsion',
      q.started && !q.open ? 0 : null,
    );
  }
  return obj(
    'Juara Liga dan sahabat Tarsion!',
    `Lihat Balai Juara, lengkapi ${SPECIES.length} bentuk, atau ulangi Liga dengan lawan lebih kuat.`,
    14,
    'hall',
  );
}
function questDone(r = state.region) {
  if (r === 0) return has('parcel') && has('permit');
  if (r === 2) return state.trash.length === 3;
  if (r === 4) return state.finished;
  return has(REGIONS[r].quest);
}
function objectiveTarget(o) {
  return spots().find(p => p.key === o.key && (o.id === null || p.id === o.id));
}
