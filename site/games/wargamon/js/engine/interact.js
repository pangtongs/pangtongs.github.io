/* Using what is on the map: activity points, conversations and wild encounters. */

// --- Using an activity point.
// Someone behind a counter or up on a stage is reached from the floor in front.
const reachOf = p => (p.behind || p.raised ? 95 : 70);
const chatTurns = new Map();
// Acts on the given point, or the nearest one, when the player stands within reach.
function interact(p) {
  p ??= nearest();
  if (!p || battle || modalKind || locked || Math.hypot(state.x - p.x, state.y - p.y) > reachOf(p)) return;
  // Places that work even before a team exists.
  switch (p.key) {
    case 'pitstop':
      pitStop(p);
      return;
    case 'camp':
      modal(
        `<h2>${shortPlaceName(p)}</h2><p>${foodT('health.rest.body', 'Istirahat gratis memulihkan HP tim sepenuhnya. Kondisi dan Kenyang tetap.')}</p><button class="action" data-refresh="rest" ${state.money < REST_FEE || state.team.every(m => m.hp === m.max) ? 'disabled' : ''}>${foodT('health.rest.button', 'Istirahat')}</button>${closeButton('Nanti')}`,
        'rest',
      );
      return;
    case 'district':
      if (p.district === 'gang' || state.room === 'pasarsubuh') {
        districtScene(p);
        return;
      }
      break;
    case 'chat': {
      // Townspeople take turns through what they have to say.
      chatTurns.set(p.name, ((chatTurns.get(p.name) ?? -1) + 1) % p.lines.length);
      if (p.portrait === undefined) {
        modal(`<h2>${p.name}</h2><p>${p.lines[chatTurns.get(p.name)]}</p>${closeButton()}`, 'inspection');
        return;
      }
      const [name, role] = p.name.split(', ');
      speak({ name, role, portrait: p.portrait }, p.lines[chatTurns.get(p.name)]);
      return;
    }
    case 'latehall':
      enterRoom('championhall');
      return;
    case 'latefood':
      meal();
      return;
    case 'researchnote':
      modal(
        '<h2>Catatan Peneliti</h2><p>Token laboratorium habis sebelum dana cair. Warga menyalakan kembali alat dengan dinamo bekas bengkel. Raih gelar Juara, lalu selaraskan panel di pelataran untuk membebaskan Tarsion.</p>' +
          closeButton(),
        'research',
      );
      return;
    case 'clinic':
      if (['clinic', 'festivalclinic'].includes(state.room)) {
        clinicReception();
        return;
      }
      break;
    case 'civic':
      // The permit broker who was paid comes back as a shop, until he is reported.
      if (p.id === 'permit' && civicState().choices.permit === 0 && civicState().claimed.includes('permit')) {
        if (civicState().resolved.includes('reported'))
          modal(
            `<h2>Loket disegel</h2><p>Kios Pak Map ditutup setelah laporanmu. Koperasi dan minimarket tetap buka.</p>${closeButton()}`,
          );
        else shop();
        return;
      }
      civicMenu(p.id);
      return;
    case 'news':
      consequences();
      return;
    case 'legend':
      if (p.id === 19 && civicState().choices.coast === 0 && !civicState().resolved.includes('coast')) {
        consequences();
        return;
      }
      break;
  }
  if (!state.team.length) return;
  if (p.key === 'mart_sela' || p.key === 'mart_prices') {
    if (state.room === 'shop') p.key === 'mart_sela' ? martSela() : martPrices();
    return;
  }
  const leagueRunning = leagueState().active;
  const closedForLeague = () =>
    toast('Gunakan bekal dari Tas. Fasilitas dibuka kembali setelah rangkaian Liga selesai.');
  if (WADUK_PUZZLES[p.key]) {
    wadukPuzzleMenu(p.key);
    return;
  }
  switch (p.key) {
    case 'door':
      if (leagueRunning && p.room === 'clinic') toast('Klinik dibuka kembali setelah rangkaian Liga.');
      else enterRoom(p.room);
      return;
    case 'exit':
      exitRoom();
      return;
    case 'connector':
      useConnector(p);
      return;
    case 'passage':
      travel(p.to);
      return;
    case 'next':
    case 'back':
      if (!state.room) walkConnection(p.key === 'next' ? 1 : -1);
      else if (p.key === 'next') nextArea();
      else travel(state.region - 1);
      return;
    case 'trainer':
      trainerIntro(p.id);
      return;
    case 'wild':
      encounter(p);
      return;
    case 'quest':
      questDialog();
      return;
    // Services.
    case 'pharmacy':
      shop();
      return;
    case 'shop':
      if (leagueRunning) closedForLeague();
      else shop();
      return;
    case 'daycare':
      if (leagueRunning) closedForLeague();
      else daycareMenu();
      return;
    case 'clinic':
      if (leagueRunning) closedForLeague();
      else freeTreatment();
      return;
    case 'coach':
      freeTreatment();
      return;
    case 'meal':
      if (leagueRunning) closedForLeague();
      else meal();
      return;
    case 'tutor':
      tutorMenu();
      return;
    case 'spring':
      if (state.springSupplies) {
        toast('Botolmu sudah penuh dari kolam tadi.');
        return;
      }
      state.springSupplies = true;
      state.potions += 2;
      update();
      modal(
        `<h2>Kolam Hutan</h2><p>Kolam ini diisi mata air dari bukit, airnya jernih dan dingin. Kamu menyeduh daun sirih dari tepi kolam dan mengisi dua botol jamu untuk perjalanan.</p><p>Botolnya hanya cukup diisi sekali.</p>${closeButton()}`,
      );
      return;
    case 'tea':
      if (!state.team.some(m => m.hp < m.max)) {
        toast('HP tim sudah penuh. Tidak perlu membeli teh.');
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
      toast('Tim +25 HP. Status tidak berubah.');
      return;
    // Story devices.
    case 'league':
      leagueMenu();
      return;
    case 'hall':
      hallMenu();
      return;
    case 'tarsion':
      tarsionMenu();
      return;
    case 'resonator':
      resonanceMenu();
      return;
    case 'rail':
      railMenu();
      return;
    case 'dispatch':
      dispatchMenu();
      return;
    case 'parcel':
      deliverOrder(p.id);
      return;
    case 'power':
      if (puzzleGate(5)) powerMenu();
      return;
    case 'valves':
      if (puzzleGate(6)) valveMenu();
      return;
    case 'signals':
      if (puzzleGate(7)) signalMenu();
      return;
    case 'legend':
      legendMenu(p.id);
      return;
    case 'shoot':
      penaltyGame();
      return;
    case 'trash':
      if (!state.trash.includes(p.id)) state.trash.push(p.id);
      update();
      toast(
        `Kantong terkumpul ${state.trash.length}/3${state.trash.length === 3 ? ', pintu terminal terbuka' : ''}`,
      );
      return;
    case 'permit':
      if (!has('parcel') || !REGIONS[0].required.every(i => state.defeated.includes(i))) {
        const names = REGIONS[0].required
          .filter(i => !state.defeated.includes(i))
          .map(i => TRAINERS[i].name)
          .join(', ');
        modal(
          `<h2>Pak RT belum bisa tanda tangan</h2><p>“Ambil bekal Bu Sari dan selesaikan pertandingan di Sukamaju dulu. Yang belum: ${names || 'ambil bekal'}. Fotokopi KTP Wargamon tidak perlu.”</p>${closeButton()}`,
        );
        return;
      }
      if (!has('permit')) state.quests.push('permit');
      update();
      modal(
        `<h2>Surat jalan terbit!</h2><p>“Satu tanda tangan, nol pungutan. Jangan sampai suratnya dimakan Galomang.” Sekarang berangkat ke Padang Ojek.</p>${closeButton()}`,
      );
      return;
    case 'stamp': {
      const id = state.room === 'warungcity' ? 'warung' : 'sri';
      const sriHeader = () =>
        `<div class="portrait-head">${trainerArt(PLACES[3].points.find(point => point.key === 'stamp').portrait)}<div><h2>${I18N.t('terminal.stamp.sriName')}</h2><p>${I18N.t('terminal.stamp.role')}</p></div></div>`;
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
        `${id === 'sri' ? sriHeader() : '<h2>Stempel warung didapat</h2>'}<p>${id === 'sri' ? I18N.t('terminal.stamp.sriIntro') : '“Sudah makan? Oke, stempel jalan.”'} ${state.stamps.length}/2 stempel terkumpul. Setelah lengkap, ke loket.</p>${rematch}${closeButton()}`,
      );
      return;
    }
    case 'board': {
      const paragraphs = region()
        .story.split(/\n\s*\n/)
        .map(text => `<p>${tr(text)}</p>`)
        .join('');
      modal(
        `<h2>Papan informasi warga</h2>${paragraphs}<p><b>${region().questText}</b></p><div class="actions">${closeButton()}</div>`,
      );
      return;
    }
    case 'timetable':
      modal(
        `<h2>Jadwal keberangkatan</h2><p>${I18N.t('terminal.timetable.body')}</p>${closeButton()}`,
        'timetable',
      );
      return;
  }
}
let sceneReturn = null;
function findWild() {
  if (battle || modalKind || locked || state.room || !region().wild.length) return;
  if (!followingMon()) {
    toast(I18N.t('battle.fainted.recover'));
    return;
  }
  const p = nearestHabitat();
  if (!p) {
    toast('Tidak ada habitat di sini.');
    return;
  }
  if (Math.hypot(state.x - p.x, state.y - p.y) < 65) encounter(p);
  else autoWalk(p);
}
function questDialog({ teaHealed = false } = {}) {
  let title, body;
  if (state.region === 0) {
    const firstVisit = !has('parcel');
    title = firstVisit ? I18N.t('text.132') : I18N.t('warung.tea.title');
    if (firstVisit) {
      state.quests.push('parcel');
      state.potions += 2;
    }
    body = `“${I18N.t(firstVisit ? 'text.133' : 'warung.tea.greeting')}”</p><p>${I18N.t('warung.tea.hint')}`;
  } else if (state.region === 1) {
    // The parcel and its reward come once; afterwards Bang Ujang just chats.
    const delivered = has('delivery');
    title = delivered ? 'Bang Ujang, pos ojek' : 'Titipan sampai';
    if (!delivered) {
      state.quests.push('delivery');
      state.balls += 3;
      state.potions += 2;
    }
    const left = REGIONS[1].required.filter(id => !state.defeated.includes(id)).length;
    body = delivered
      ? `“${I18N.t(left ? 'ojek.chat.challengers' : 'ojek.chat.clear', { n: left })}”`
      : '“Bekal diterima! Ada tiga kapsul dan dua jamu untuk perjalananmu. Selesaikan tiga penantang di padang sebelum masuk hutan.”';
  } else if (state.region === 3) {
    title = 'Loket perjalanan';
    if (has('ticket')) body = I18N.t('terminal.ticket.again');
    else if (state.stamps.length < 2) body = I18N.t('terminal.ticket.needStamps');
    else if (state.seen.filter(i => i < 12).length < 3)
      body =
        '“Stempel lengkap. Tapi calon peserta arena perlu mengenal minimal tiga jenis dasar Wargamon. Cari teman di hutan atau padang dulu.”';
    else {
      state.quests.push('ticket');
      state.balls += 3;
      body =
        '“Kartu beres! Tiga kapsul bonus. Kalahkan Iqbol di lapak selatan, lalu lanjut ke Balai Beton di sebelah pasar.”';
    }
  } else {
    title = 'Catatan jalur';
    body = region().questText;
  }
  if (!state.balls && state.money < 3000) {
    state.balls = 1;
    body += ' Satu kapsul darurat diberikan gratis.';
  }
  update();
  if (state.room === 'warung' && state.region === 0) {
    const sari = ROOMS.warung.points.find(p => p.key === 'quest');
    modal(
      `<div class="portrait-head">${trainerArt(sari.portrait)}<div><h2>Bu Sari</h2><p>${title}</p></div></div><p>${body}</p>${teaHealed ? `<p class="story-hint" role="status">${I18N.t('tea.full')}</p>` : ''}<button class="action" data-warung="tea" ${!state.team.some(m => m.hp < m.max) ? 'disabled' : ''}>${I18N.t(state.team.some(m => m.hp === 0) ? 'warung.tea.reviveButton' : 'warung.tea.button')}</button>${closeButton()}`,
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
    battle.log = I18N.t('wild.variant', { name: SPECIES[request.id].name });
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
  if (battle || modalKind || locked || state.room || !state.team.length || !region().wild.length) return;
  if (!followingMon()) {
    toast(I18N.t('battle.fainted.recover'));
    return;
  }
  // Weighted pick: starters and the rare bird are uncommon, and civic decisions
  // can thin or remove a habitat. A habitat with its own species list (water beside
  // a pier, grass on the quay) draws only from those.
  const pool = encounterWeights().filter(v =>
    v.night
      ? v.night === (habitat?.habitat === 'water' ? 'water' : 'grass')
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
  const levels = region().levels,
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
