/* Dialogs and the panels around the map. */

// --- Dialog frame.
// Every dialog goes through here once: translated, worded for play, names made canonical,
// its close button moved to a pinned footer.
function modal(html, kind = 'dialog', footer = null) {
  html = canonicalText(immersiveCopy(translateHTML(html)));
  if (footer !== null) {
    footer = translateHTML(footer);
    if (footer) footer = immersiveCopy(footer);
  }
  held = null;
  navigation++;
  previousFocus = document.activeElement;
  let label = 'Tutup';
  const closers = [...html.matchAll(/<button\b[^>]*data-act="close"[^>]*>([\s\S]*?)<\/button>/g)];
  if (closers.length) label = closers.at(-1)[1];
  html = html.replace(/<button\b[^>]*data-act="close"[^>]*>[\s\S]*?<\/button>/g, '');
  const controls =
    kind === 'starter' ? '' : (footer ?? `<button class="action" data-act="close">${label}</button>`);
  $('modal').innerHTML =
    `<section class="dialog menu-frame ${kind === 'dex' ? 'dex-frame' : ''}" role="dialog" aria-modal="true" aria-label="${kind === 'dex' ? 'Wargadex' : 'Menu permainan'}"><div class="dialog-body">${html}<!--dialog-end--></div>${controls ? `<div class="dialog-controls">${controls}</div>` : ''}</section>`;
  $('modal').classList.remove('hidden');
  modalKind = kind;
  setTimeout(() => $('modal').querySelector('button')?.focus(), 0);
  translateDOM($('modal'));
}
// Adds content at the end of the open dialog's body.
function appendMenu(html) {
  $('modal').innerHTML = $('modal').innerHTML.replace(
    '<!--dialog-end-->',
    translateHTML(html) + '<!--dialog-end-->',
  );
}
function closeModal(force = false) {
  const editedFloor = modalKind === 'floor-editor';
  if (editedFloor) finishFloorStroke();
  if (modalKind === 'penalty') {
    if (futsalFrame) cancelAnimationFrame(futsalFrame);
    futsalFrame = 0;
    football = null;
  }
  if (modalKind === 'starter' && !force) return;
  $('modal').classList.add('hidden');
  $('modal').innerHTML = '';
  modalKind = '';
  if (editedFloor) {
    recoverFloor();
    resetScene();
    update();
  }
  previousFocus?.focus?.();
}
function toast(message) {
  $('toast').textContent = tr(message);
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3000);
}
// Portrait of a character by portrait number.
function trainerArt(id) {
  if (Object.hasOwn(SERVICE_PORTRAITS, id))
    return `<div class="trainer-sprite service-portrait service-${id}" role="img" aria-label="${SERVICE_PORTRAITS[id]}"></div>`;
  if (RESIDENTS[id])
    return `<div class="trainer-sprite unified-actor actor-role-${actorRole(id)}" role="img" aria-label="${RESIDENTS[id].label}"></div>`;
  return `<div class="trainer-sprite cast${id} ${id < 8 ? 't' + id : ''}" role="img" aria-label="${TRAINERS.find(t => t.portrait === id)?.name || 'Warga'}"></div>`;
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
  if (place().points.some(p => p.id === id && ['trainer', 'stamp'].includes(p.key))) return tr('di peta');
  const key = Object.keys(ROOMS).find(key => ROOMS[key].points.some(p => p.key === 'trainer' && p.id === id));
  return key ? I18N.t('journal.trainer.room', { room: tr(ROOMS[key].name) }) : tr('di peta');
}

// --- The panels around the map. Called after anything that changes what they show.
// Collecting pays off: each milestone of owned species brings a gift, once.
const DEX_MILESTONES = [
  { at: 20, gift: { balls: 5, ultraballs: 2 } },
  { at: 40, gift: { ultraballs: 5, maxpotion: 3 } },
  { at: 60, gift: { ultraballs: 5, money: 100000 } },
  { at: 80, gift: { collector: 1 } },
];
function checkDexMilestones() {
  if (!state.team?.length || battle) return;
  state.dexRewards ??= [];
  for (const { at, gift } of DEX_MILESTONES) {
    if (state.seen.length < at || state.dexRewards.includes(at)) continue;
    state.dexRewards.push(at);
    for (const [k, n] of Object.entries(gift))
      if (k === 'money') state.money += n;
      else if (k === 'collector') state.collector = true;
      else addItem(k, n);
    toast(I18N.t(`dex.milestone.${at}`));
  }
}
// The collector's card from the last milestone makes rare finds twice as likely.
const rareBoost = () => (state.collector ? 2 : 1);
function update() {
  checkDexMilestones();
  // A save from the terminal's former shared shop room belongs to the terminal minimarket.
  const moved = state.region === 3 && state.room === 'shop';
  if (moved) {
    state.room = 'terminalshop';
    state.region = 9;
    state.returnPosition = { x: 120, y: 400 };
    sceneReturn = state.returnPosition;
  }
  economyMigration();
  // A player standing on ground that is not walkable moves to the nearest floor.
  if (
    !state.room &&
    !battle &&
    state.team.length &&
    !groundWalkable(state.x + worldOrigin()[0], state.y + worldOrigin()[1]) &&
    !(state.region === 0 && state.x >= 960 && state.x < 1920 && state.y >= 0 && state.y < 640)
  ) {
    const cells = floorCells(state.region);
    if (cells?.length) {
      [state.x, state.y] = cells.reduce((a, b) =>
        Math.hypot(b[0] - state.x, b[1] - state.y) < Math.hypot(a[0] - state.x, a[1] - state.y) ? b : a,
      );
      resetScene();
    }
  }
  recoverFloor();
  chapterState();
  const r = region(),
    activeRoom = room();
  // Header and journal.
  $('money').textContent = money(state.money);
  $('regionEyebrow').textContent = `BAB ${chapterOf() + 1}, ${r.name.toUpperCase()}`;
  $('chapterTitle').textContent = activeRoom ? activeRoom.name : r.subtitle;
  $('location').textContent = activeRoom ? activeRoom.name : r.name;
  $('world').setAttribute('aria-label', activeRoom ? activeRoom.name : r.name);
  $('mapLabel').innerHTML =
    `${activeRoom ? activeRoom.name.toUpperCase() : r.name.toUpperCase()}<small>${activeRoom ? 'PINTU BAWAH, KELUAR' : r.trainers.length ? 'JELAJAH & WARGAMON' : 'AREA ' + (r.wild.length ? 'ALAM, TANPA PENANTANG' : 'DAMAI, TANPA PERTARUNGAN')}</small>`;
  $('chapterCount').textContent = String(chapterOf() + 1).padStart(2, '0') + ' / 4';
  $('journalTitle').textContent = r.questName;
  $('journalGoal').textContent = r.goal;
  $('quests').innerHTML =
    `<div class="quest ${questDone() ? 'done' : 'active'}"><span class="badge">${questDone() ? '✓' : '!'}</span><div><strong>${r.questName}</strong><small>${state.region === 2 ? state.trash.length + '/3 sampah' : state.region === 3 ? state.stamps.length + '/2 stempel' : questDone() ? 'Selesai' : 'Lihat petunjuk di bawah'}</small></div></div>` +
    r.trainers
      .map(
        id =>
          `<div class="quest ${state.defeated.includes(id) ? 'done' : ''}"><span class="badge">${state.defeated.includes(id) ? '✓' : '•'}</span><div><strong>${TRAINERS[id].name}</strong><small>${TRAINERS[id].team.length} Wargamon, ${trainerLocationLabel(id)}</small></div></div>`,
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
  // Habitat panel.
  $('wildLevels').textContent = r.wild.length ? `Lv. ${r.levels.join('-')}` : 'KOTA DAMAI';
  // Portraits are rebuilt only when the region changes, so they are not re-requested on every update.
  const wildList = $('wildSpecies');
  if (wildList._speciesRegion !== state.region) {
    if (r.wild.length)
      wildList.innerHTML = `<div class="wild-roster">${r.wild.map(id => creatureChip(id)).join('')}</div>`;
    else wildList.textContent = 'Tak ada pertemuan liar di area ini.';
    wildList._speciesRegion = state.region;
  }
  $('wildBtn').disabled = !!battle || locked || !!activeRoom || !r.wild.length || !followingMon();
  $('wildBtn').textContent = activeRoom
    ? 'Keluar dulu untuk mencari'
    : r.wild.length
      ? 'Cari Wargamon liar'
      : 'Tidak ada habitat di sini';
  $('wildHint').textContent = activeRoom
    ? 'Gunakan pintu keluar di bagian bawah ruangan.'
    : 'Gunakan Cari Wargamon liar untuk berjalan ke lokasi pencarian di wilayah ini.';
  $('placesList').innerHTML = spots()
    .map((p, i) => `<button data-new="goto" data-index="${i}">${p.name}</button>`)
    .join('');
  $('travelBtn').textContent = state.room
    ? 'Keluar bangunan'
    : state.region === REGIONS.length - 1
      ? 'Peta perjalanan'
      : 'Area berikutnya →';
  save();
  // Objective strip and toolbar.
  const o = nextObjective();
  $('nextObjective').textContent = o.title;
  $('objectiveDetail').textContent = o.detail;
  $('guideBtn').textContent = 'Ke tujuan →';
  $('guideBtn').disabled = !!battle || locked || !state.team.length;
  $('saveBtn').disabled = !!battle || locked || !state.team.length;
  $('loadBtn').disabled = !!battle || locked;
  $('newBtn').disabled = !!battle || locked;
  if (state.team.length && !battle)
    $('hint').textContent = followingMon()
      ? SPECIES[followingMon().id].name + ' mengikuti, M: peta, E: interaksi'
      : I18N.t('battle.fainted.hint');
  else if (state.region === 2 && !state.room)
    $('hint').textContent = 'Jalur krem bisa dilewati. Klik jalur atau tujuan.';
  $('screenTeam').disabled = locked || modalKind === 'starter';
  $('screenTeam').textContent = modalKind === 'team' ? 'Tutup Tim [T]' : 'Tim & Tas [T]';
  for (const id of ['quests', 'tip', 'journalGoal', 'objectiveDetail']) {
    const node = $(id);
    if (node?.innerHTML) node.innerHTML = canonicalText(node.innerHTML);
  }
  translateDOM(document.body);
  syncGangLocation();
  if (moved) save();
}

// --- Info pages.
function guideCards(cards, examples = false) {
  return `<div class="guide-grid">${cards.map(([icon, title, detail], index) => `<section class="guide-card"><span class="guide-icon" aria-hidden="true">${icon}</span><div><b>${title}</b><p>${detail}</p>${examples ? `<div class="guide-example"><small>Contoh</small>${index < 2 ? `<div class="guide-meter ${index ? 'fullness' : 'hp'}"><span style="width:${index ? 40 : 60}%">${index ? '40 / 100' : '60 / 100'}</span></div>` : '<span class="guide-condition">✚ Racun</span>'}</div>` : ''}</div></section>`).join('')}</div>`;
}
function help(page = 0) {
  if (page === 4) {
    typeChart('Api');
    return;
  }
  const basics = [
    ['⌨', 'Jalan', 'Tekan WASD atau panah. Bisa juga klik lantai.'],
    ['☝', 'Bicara & masuk', 'Klik orang, pintu, atau lapak. Bisa juga dekati lalu tekan E.'],
    ['🗺', 'Peta · M', 'Klik Peta untuk memilih wilayah yang sudah terbuka.'],
    ['🎒', 'Tim & Tas · T', 'Klik teman untuk melihat jurus, memberi obat, atau memasang perlengkapan.'],
    ['➜', 'Ke tujuan', 'Klik tombol di atas peta untuk berjalan ke tujuanmu.'],
    ['▣', 'Simpan', 'Simpan perjalananmu di salah satu dari 10 slot.'],
    ['↥', 'Muat', 'Pilih simpanan untuk melanjutkan dari sana.'],
    ['↺', 'Game baru', 'Mulai petualangan dari awal dengan tim baru.'],
  ];
  const battleCards = [
    ['①', 'Jurus ringan → +1 Tempo', 'Kumpulkan hingga 3 Tempo untuk memakai jurus besar.'],
    ['③', 'Jurus besar → pakai Tempo', 'Periksa biaya Tempo dan jedanya sebelum memilih.'],
    [
      '🛡',
      'Bersiap → tahan pukulan',
      'Kurangi satu pukulan 55%, dapat +1 Tempo dan akurasi +12% untuk jurus berikutnya.',
    ],
    ['⇄', 'Ganti teman → 1 giliran', 'Pilih teman dengan tipe yang unggul melawan lawan.'],
    ['◎', 'Akurasi → peluang kena', 'Jurus bisa meleset; Tempo dan jeda tetap terpakai.'],
    ['↑', 'Level → lebih kuat', 'Naik level menambah HP dan memperkuat serangan.'],
  ];
  const healthCards = [
    ['♥', 'HP · tenaga bertarung', 'HP habis → pingsan. Jamu atau istirahat mengisi HP.'],
    [
      '🍚',
      'Kenyang · isi perut',
      'Makan mengisi Kenyang. Tiap giliran −3; di bawah 25, serangan melemah 15%.',
    ],
    [
      '✚',
      'Kondisi · sakit atau gangguan',
      'Racun, tidur, dan kondisi lain punya efek sendiri. Penawar atau klinik membersihkannya.',
    ],
  ];
  const recovery = [
    ['🍱', 'Kantin / warung → Kenyang', 'Makanan berbayar aman untuk mengisi perut.'],
    ['🥣', 'MBG → Kenyang 100', 'Gratis. Ada peluang 20% satu teman keracunan.'],
    ['🛏', 'Istirahat → HP penuh', 'Kondisi dan Kenyang tetap.'],
    ['🏥', 'Klinik → rawat kondisi', 'Merawat semua kondisi, termasuk beberapa sekaligus.'],
    [itemIcon('potions'), 'Jamu → HP', 'Gunakan dari Tim & Tas untuk teman yang masih sadar.'],
    [itemIcon('antidotes'), 'Penawar → kondisi', 'Pilih teman yang sakit di Tim & Tas.'],
  ];
  const title = ['Cara bermain', 'Pertarungan', 'HP, Kenyang & Kondisi', 'Pemulihan'][page] || 'Cara bermain';
  const body =
    page === 1
      ? guideCards(battleCards)
      : page === 3
        ? guideCards(recovery)
        : page === 2
          ? guideCards(healthCards, true) +
            `<h3>Kenali kondisinya</h3><div class="status-grid">${Object.values(STATUS)
              .map(s => `<div><b>${s.name}</b><small>${s.desc}</small></div>`)
              .join('')}</div>`
          : guideCards(basics);
  modal(
    `<div class="info-page"><h2>${title}</h2>${infoNav(page)}${body}${closeButton('Tutup')}</div>`,
    'help',
  );
}

// --- Wargadex.
function nextDexMilestone() {
  const next = DEX_MILESTONES.find(m => !(state.dexRewards || []).includes(m.at));
  return next ? ' · ' + I18N.t('dex.next', { n: next.at - state.seen.length }) : '';
}
function dex(id = dexSelection, tab = dexTab) {
  if (locked || modalKind === 'starter') return;
  dexSelection = Math.max(0, Math.min(SPECIES.length - 1, Number(id) || 0));
  dexTab = ['info', 'moves', 'habitat', 'evolution'].includes(tab) ? tab : 'info';
  const s = SPECIES[dexSelection],
    start = Math.floor(DEX_ORDER.indexOf(dexSelection) / 8) * 8;
  const member = [...state.team, ...(state.storage || [])].find(m => m.id === dexSelection),
    owned = !!member;
  const galomangRender =
    dexSelection === 2
      ? '<details><summary>Galomang, ilustrasi 3D</summary><img class="render-galomang" src="img/characters/galomang-render.webp" alt="Galomang, kelomang oranye dengan galon biru transparan"><p>Ilustrasi bergaya render 3D. Dibuat dengan AI; bukan model Blender.</p></details>'
      : '';
  const detail =
    dexTab === 'info'
      ? `${combatStats(dexSelection, member)}${galomangRender}<h3>${s.role || 'Wargamon Nusantara'}</h3><p>${s.desc}</p>${dexSelection === 20 ? '<p><b>Mata Kopi:</b> kebal Tidur.</p>' : ''}`
      : dexTab === 'moves'
        ? `<div class="dex-moves">${kit(dexSelection)
            .map(m => `<div><b>${TYPE_ICONS[m.type]} ${m.name}</b><p>${moveDescription(m)}</p></div>`)
            .join('')}</div>`
        : dexTab === 'habitat'
          ? dexHabitat(dexSelection)
          : dexEvolution(dexSelection);
  modal(
    `<div class="dex-device"><div class="dex-heading"><div><small>WARGADEX</small><h2>#${String(dexNumber(dexSelection)).padStart(3, '0')} ${s.name}</h2></div><span>${I18N.t('dex.count', { owned: state.seen.length, total: SPECIES.length, met: (state.met || []).length })}${nextDexMilestone()}</span></div><label class="dex-jump">Cari Wargamon<select data-dex="jump" aria-label="Pilih Wargamon">${DEX_ORDER.map((i, n) => `<option value="${i}" ${i === dexSelection ? 'selected' : ''}>${String(n + 1).padStart(3, '0')}, ${SPECIES[i].name}</option>`).join('')}</select></label><div class="dex-layout"><nav class="dex-index" aria-label="Daftar Wargamon">${DEX_ORDER.slice(
      start,
      start + 8,
    )
      .map(
        (id, n) =>
          `<button data-dex="select" data-id="${id}" aria-current="${id === dexSelection}"><span>${String(start + n + 1).padStart(3, '0')}</span>${art(id)}<span>${SPECIES[id].name}</span></button>`,
      )
      .join(
        '',
      )}</nav><section class="dex-detail"><div class="dex-profile">${art(dexSelection)}<div><div class="dex-types">${s.types.map(t => `<span>${TYPE_ICONS[t]} ${t}</span>`).join('')}</div><p>${owned ? '● Dalam koleksi' : state.seen.includes(dexSelection) ? '✓ Tercatat' : 'Belum dikoleksi'}${s.legendary ? ', Legenda' : ''}</p></div></div><nav class="dex-tabs" aria-label="Rincian Wargamon">${[
      ['info', 'Info'],
      ['moves', 'Jurus'],
      ['habitat', 'Habitat'],
      ['evolution', 'Evolusi'],
    ]
      .map(
        ([key, label]) =>
          `<button data-dex="tab" data-tab="${key}" aria-pressed="${dexTab === key}">${label}</button>`,
      )
      .join('')}</nav><div class="dex-page" tabindex="0">${detail}</div></section></div></div>`,
    'dex',
    `<button class="action secondary" data-dex="prev" ${dexNumber(dexSelection) === 1 ? 'disabled' : ''}>← Sebelumnya</button><span>${dexNumber(dexSelection)} / ${SPECIES.length}</span><button class="action secondary" data-dex="next" ${dexNumber(dexSelection) === SPECIES.length ? 'disabled' : ''}>Berikutnya →</button><button class="action" data-act="close">Tutup</button>`,
  );
}

// --- Team, bag and moves.
function teamMenu() {
  if (!state.team.length || locked || modalKind === 'starter') return;
  const bag = BAG_MEDICINES.map(k => {
    const it = medicineInfo(k),
      available = state.team.some(m => canUseMedicine(k, m));
    return `<button class="bag-medicine" data-over="medmenu" data-key="${k}" ${available ? '' : 'disabled'}>${itemIcon(k)}<span class="bag-item-heading"><b>${it.name}</b><span class="bag-quantity">×${itemCount(k)}</span></span><span class="bag-item-effect">${it.desc}</span><small>${!itemCount(k) ? 'Habis' : available ? 'Pilih Wargamon →' : k === 'revive' ? 'Tidak ada yang pingsan' : 'Tidak diperlukan'}</small></button>`;
  }).join('');
  modal(
    `<h2>Tim & Tas</h2><section class="bag-panel" aria-label="Obat dalam tas"><h3>Obat</h3><div class="bag-medicine-grid">${bag}</div></section><div class="team-menu-nav"><button class="action secondary" data-act="dex">Wargadex</button>${!battle ? `<button class="action secondary" data-refresh="daycare">Titipan (${state.storage?.length || 0})</button>` : ''}<span>${state.balls} kapsul, ${itemCount('ultraballs')} kapsul ultra</span></div><h3>Tim aktif, ${state.team.length}/6</h3><div class="team-list">${state.team.map((m, i) => `<section class="team-card">${art(m.id)}<div class="meta"><strong>${SPECIES[m.id].name}, Lv.${m.level}</strong><p>${typeLabel(m.id)}, HP ${m.hp}/${m.max}</p>${statusBadge(m)}${fullnessBadge(m)}${health(m)}</div><div class="team-member-actions"><button data-act="lead" data-id="${i}" ${i === 0 || !m.hp ? 'disabled' : ''}>${!m.hp ? I18N.t('legacy.279') : i === 0 ? 'Aktif' : 'Pilih'}</button><button data-over="kit" data-id="${i}">Jurus</button>${!battle ? `<button data-league="equipment" data-id="${i}">${LEAGUE_ITEMS[m.heldItem]?.name || 'Perlengkapan'}</button>` : ''}</div></section>`).join('')}</div>${closeButton('Kembali')}`,
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

// --- Shops.
// A food stall also serves a meal on the spot, like Bu Sari's tea in Sukamaju: the
// whole team recovers its HP and Fullness, fainted teammates included. Conditions stay
// for the clinic. A player without the money eats on the house, so a defeat never
// leaves the team stuck at zero HP.
const DINE_PRICE = 2000;
const mealFee = price => (state.money < price ? 0 : price);
const mealNeeded = () => state.team.some(m => m.hp < m.max || (m.fullness ?? 75) < 100);
function dineDish(p) {
  return I18N.t(
    /kopi/i.test(p.name)
      ? 'dine.dish.coffee'
      : /warteg|warung|nasi/i.test(p.name)
        ? 'dine.dish.rice'
        : 'dine.dish.tea',
  );
}
// The stall's special dish: a meal and a three-battle effect that suits the food.
const SPECIAL_PRICE = 6000;
const MEAL_BUFFS = {
  power: { dish: 'dine.special.rice', effect: 'dine.effect.power' },
  focus: { dish: 'dine.special.coffee', effect: 'dine.effect.focus' },
  guard: { dish: 'dine.special.tea', effect: 'dine.effect.guard' },
};
const stallBuff = p =>
  /kopi/i.test(p.name) ? 'focus' : /warteg|warung|nasi/i.test(p.name) ? 'power' : 'guard';
const mealBuff = kind => (state.mealBuff?.kind === kind && state.mealBuff.left > 0 ? state.mealBuff : null);
function mealBuffBadge() {
  const b = state.mealBuff;
  return b?.left > 0
    ? `<span class="fullness-pill meal-pill">${I18N.t(MEAL_BUFFS[b.kind].effect)} · ${I18N.t('dine.left', { n: b.left })}</span>`
    : '';
}
function specialButton(p) {
  const buff = MEAL_BUFFS[stallBuff(p)];
  return `<button class="action secondary" data-dine-special="${p.name}" ${state.money < SPECIAL_PRICE ? 'disabled' : ''}><b>${I18N.t(buff.dish)}, ${money(SPECIAL_PRICE)}</b><small>${I18N.t('dine.special.body', { effect: I18N.t(buff.effect) })}</small></button>`;
}
function dineCard(p) {
  const needed = mealNeeded(),
    fee = mealFee(DINE_PRICE);
  return `<section class="dine-card"><h3>${I18N.t('dine.title')}</h3><p>${I18N.t('dine.body', { dish: dineDish(p) })}</p><button class="action" data-dine="${p.name}" ${!needed ? 'disabled' : ''}>${I18N.t(needed ? 'dine.button' : 'dine.full', { price: fee ? money(fee) : I18N.t('heal.freePrice') })}</button>${specialButton(p)}</section>`;
}
onClick(event => {
  const button = event.target.closest('[data-dine]');
  if (!button || button.disabled || modalKind !== 'shop' || battle || locked || state.room) return;
  const p = nearest();
  if (
    p?.key !== 'shop' ||
    p.sells !== 'food' ||
    p.name !== button.dataset.dine ||
    Math.hypot(state.x - p.x, state.y - p.y) > reachOf(p) ||
    !mealNeeded()
  )
    return;
  const fee = mealFee(DINE_PRICE);
  state.money -= fee;
  state.team.forEach(m => {
    m.hp = m.max;
    m.fullness = 100;
  });
  update();
  shop();
  toast(I18N.t('dine.done', { dish: dineDish(p) }) + (fee ? '' : ' ' + I18N.t('heal.free')));
});
onClick(event => {
  const button = event.target.closest('[data-dine-special]');
  if (!button || button.disabled || modalKind !== 'shop' || battle || locked || state.room) return;
  const p = nearest();
  if (
    p?.key !== 'shop' ||
    p.sells !== 'food' ||
    p.name !== button.dataset.dineSpecial ||
    Math.hypot(state.x - p.x, state.y - p.y) > reachOf(p) ||
    state.money < SPECIAL_PRICE
  )
    return;
  const kind = stallBuff(p);
  state.money -= SPECIAL_PRICE;
  state.team.forEach(m => {
    m.hp = m.max;
    m.fullness = 100;
  });
  state.mealBuff = { kind, left: 3 };
  update();
  shop();
  toast(
    I18N.t('dine.special.done', {
      dish: I18N.t(MEAL_BUFFS[kind].dish),
      effect: I18N.t(MEAL_BUFFS[kind].effect),
    }),
  );
});
function shop() {
  const closed = state.room === 'shop' ? I18N.t('mart.closed') : 'Koperasi tutup selama rangkaian Liga.';
  if (leagueState().active) {
    toast(closed);
    return;
  }
  const stock = (inBag, buy) =>
    `<p class="wallet">${money(state.money)}</p><div class="quantity-picker">${[1, 5, 10].map(n => `<button data-every="quantity" data-id="${n}" aria-pressed="${shopQuantity === n}">×${n}</button>`).join('')}</div><div class="shop-grid">${shopStock()
      .map(k => {
        const it = medicineInfo(k),
          price = PRICES[k] * shopQuantity;
        return `<section class="shop-card"><div class="shop-item-heading">${itemIcon(k)}<h3>${it.name}</h3></div><p>${it.desc}</p><small>${inBag}: ${itemCount(k)}</small><button data-every="buy" data-key="${k}" ${state.money < price ? 'disabled' : ''}>${buy(price)}</button></section>`;
      })
      .join('')}</div>`;
  if (state.room === 'shop') {
    modal(
      `<div class="mart-dialog-head">${martPortrait('kasir')}<div><span>${I18N.t('mart.staff.role')}</span><h2>Wargamaret</h2><p>${I18N.t('mart.staff.line')}</p></div></div>${stock(I18N.t('mart.stock'), price => I18N.t('mart.buy', { count: shopQuantity, price: money(price) }))}`,
      'shop',
      closeButton(),
    );
    return;
  }
  const pharmacy = ['clinic', 'festivalclinic', 'researchlab'].includes(state.room);
  const roomShop = {
    calderacoop: 'Koperasi Kaldera',
    calderacamp: 'Warung Pendaki',
    researchlab: 'Apotek Penelitian',
    terminalshop: I18N.t('terminal.shop.name'),
  };
  const nearby = nearest();
  const activeShop =
    nearby?.key === 'shop' && Math.hypot(state.x - nearby.x, state.y - nearby.y) <= reachOf(nearby)
      ? nearby
      : null;
  const shopName =
    roomShop[state.room] ||
    (state.room === 'workshopparts' ? ROOMS.workshopparts.name : null) ||
    (pharmacy ? 'Apotek' : activeShop?.title || activeShop?.name || 'Koperasi Bekal');
  const clerk = ['terminalshop', 'workshopparts'].includes(state.room)
    ? spots().find(p => p.key === 'shop')
    : null;
  modal(
    `${clerk ? `<div class="portrait-head">${trainerArt(clerk.portrait)}<div><h2>${shopName}</h2><p>${state.room === 'workshopparts' ? clerk.name.split(',')[0] : I18N.t('terminal.shop.cashier')}</p></div></div>` : `<h2>${shopName}</h2>`}${activeShop?.sells === 'food' ? dineCard(activeShop) : ''}${stock('Di tas', price => `Beli ${shopQuantity}, ${money(price)}`)}`,
    'shop',
    closeButton(),
  );
}

// --- Menu.
function gameMenu() {
  if (locked || battle || modalKind === 'starter') return;
  const panelLabel = window.matchMedia?.('(max-width:780px)').matches
    ? I18N.t('world.menu')
    : I18N.t(explorationPanel ? 'explore.hide' : 'explore.show');
  modal(
    `<h2>Menu perjalanan</h2><div class="menu-actions"><button data-ui="worldinfo">${I18N.t('world.menu')}<small>${I18N.t('world.menuDetail')}</small></button><button data-ui="info">ⓘ Panduan<small>Tipe, jurus & pemulihan</small></button><button data-ui="save">▣ Simpan<small>Pilih satu dari 10 slot</small></button><button data-ui="load">↥ Muat<small>Lanjutkan simpanan</small></button><button data-ui="audio">♫ Audio<small>Musik & efek permainan</small></button><button data-ui="fullscreen">⛶ Layar penuh<small>Menu tetap bisa dibuka</small></button></div><div class="save-transfer-actions"><button data-save-transfer="export">${saveText('export')}</button><button data-save-transfer="import">${saveText('import')}</button></div><div class="settings-bottom"><button class="secondary" data-district-ui="panel">${panelLabel}</button><label>Bahasa / Language <select data-ui="language">${I18N.options()}</select></label><button class="secondary" data-ui="speed" aria-pressed="${battleSpeed === 2}">${I18N.t('settings.speed', { n: battleSpeed })}</button><button class="secondary" data-ui="new">Game baru</button></div>${closeButton('Kembali bermain')}`,
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
    toast('Browser ini tidak mendukung layar penuh.');
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
  return `<div class="info-tabs">${['Dasar', 'Pertarungan', 'Status', 'Pemulihan', 'Tipe'].map((s, i) => `<button class="${i === page ? 'selected' : ''}" data-info-page="${i}">${s}</button>`).join('')}</div>`;
}
function typeChart(selected = 'Api') {
  if (!TYPE_ICONS[selected]) selected = 'Api';
  typeSelected = selected;
  const ts = Object.keys(TYPE_ICONS),
    strong = ELEMENTS[selected] || [],
    weak = ts.filter(t => ELEMENTS[t]?.includes(selected)),
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
    `<div class="info-page"><h2>Bagan Tipe</h2>${infoNav(4)}<svg class="type-graph" viewBox="0 0 600 290" role="img" aria-label="Panah menunjukkan tipe yang unggul"><defs>${['good', 'bad'].map((s, i) => `<marker id="${s}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${i ? '#bc5a22' : '#24784b'}"/></marker>`).join('')}</defs>${edges}${ts.map((t, i) => `<g role="button" tabindex="0" data-refresh="type" data-type="${t}" aria-label="Pilih ${t}" style="cursor:pointer"><rect x="${pos[i][0] - 43}" y="${pos[i][1] - 25}" width="86" height="50" rx="16" fill="${t === selected ? '#234b3a' : '#dde6c9'}"/><text x="${pos[i][0]}" y="${pos[i][1] + 6}" text-anchor="middle" font-size="16" fill="${t === selected ? '#fff' : '#233b37'}">${TYPE_ICONS[t]} ${t}</text></g>`).join('')}</svg><div class="type-summary"><p><b>Unggul →</b> ${strong.map(t => TYPE_ICONS[t] + ' ' + t).join(', ') || 'Tidak ada'} <small>×1,6</small></p><p><b>← Lemah terhadap</b> ${weak.map(t => TYPE_ICONS[t] + ' ' + t).join(', ') || 'Tidak ada'} <small>×1,6 dari lawan</small></p></div><p class="type-footnote">Panah menuju tipe yang kalah. Arah terbalik: ×0,7. Tipe ganda menghitung kedua tipe.</p>${closeButton('Tutup')}</div>`,
    'chart',
  );
}
function mapMenu(page = chapterOf()) {
  if (battle || locked || modalKind === 'starter') return;
  page = Math.max(0, Math.min(3, Number(page) || 0));
  modal(
    `<h2>Peta Perjalanan</h2><div class="actions">${WORLD_CHAPTERS.map((chapter, i) => `<button data-league="map" data-id="${i}" aria-pressed="${i === page}">${chapter.name}</button>`).join('')}</div><p>Empat wilayah dalam satu bab. Antar bab melalui penghubung.</p><div class="travel-grid">${WORLD_CHAPTERS[
      page
    ].tiles
      .flat()
      .map(i => {
        const gang = i === GANG_GRID_INDEX,
          r = gang ? { name: 'Gang Senggol', subtitle: 'Lorong dan cerita warga' } : REGIONS[i],
          p = gang ? ROOMS.gangsenggol : PLACES[i],
          tile = p.tile;
        const here = gang ? inGang() : i === state.region && !inGang();
        return `<div class="travel-slot"><button class="travel-card" data-act="travel" data-id="${i}" ${!regionAvailable(i) ? 'disabled' : ''}><span class="travel-preview" style="background-image:url('${p.image}');background-size:${tile < 0 ? 'cover' : '200% 200%'};background-position:${tile < 0 ? 'center' : (tile % 2) * 100 + '% ' + Math.floor(tile / 2) * 100 + '%'}"></span><b>${r.name}</b><small>${here ? 'Kamu di sini' : !regionAvailable(i) ? 'Selesaikan bab sebelumnya' : page !== chapterOf() ? 'Lewat penghubung bab' : r.subtitle}</small></button>${canRideOjek(i) && !here ? `<button class="ojek-ride" data-act="ojek" data-id="${i}" ${state.money < OJEK_FARE ? 'disabled' : ''}>${I18N.t('ojek.ride.button', { fare: money(OJEK_FARE) })}</button>` : ''}</div>`;
      })
      .join('')}</div>`,
    'map',
    closeButton(),
  );
}
/* Shared creature identity in selection menus; use existing sprite art. */
function creatureChip(id, extra = '') {
  return `<span class="creature-chip">${art(id)}<span><b>${SPECIES[id].name}</b>${extra ? `<small>${extra}</small>` : ''}</span></span>`;
}
function worldInfoMenu() {
  if (battle || locked || modalKind === 'starter') return;
  const value = id => document.getElementById(id)?.textContent || '';
  const escapeHTML = s =>
    String(s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const sites = spots()
    .map(
      (spot, index) =>
        `<button class="secondary" data-world="place" data-index="${index}">${escapeHTML(spot.name)}</button>`,
    )
    .join('');
  const wild = !document.getElementById('wildBtn').disabled;
  modal(
    `<div class="world-info"><h2>${escapeHTML(value('location'))}</h2>
 <section><small>TUJUAN UTAMA</small><h3>${escapeHTML(value('nextObjective'))}</h3><p>${escapeHTML(value('objectiveDetail'))}</p><button data-world="guide">Ke tujuan →</button></section>
 <section><small>JURNAL PERJALANAN, ${escapeHTML(value('chapterCount'))}</small><h3>${escapeHTML(value('journalTitle'))}</h3><p>${escapeHTML(value('journalGoal'))}</p><div>${document.getElementById('quests')?.innerHTML || ''}</div><p>${escapeHTML(value('tip'))}</p></section>
 <section><small>HABITAT WARGAMON LIAR, ${escapeHTML(value('wildLevels'))}</small><p>${escapeHTML(
   region()
     .wild.map(id => SPECIES[id].name)
     .join(', '),
 )}</p>${wild ? '<button data-world="wild">Cari Wargamon liar</button>' : ''}</section>
 <section><small>${I18N.t('world.places')}</small><div class="world-places">${sites || `<p>${I18N.t('world.noPlaces')}</p>`}</div></section>
 </div>${closeButton('Kembali bermain')}`,
    'world-info',
  );
}
