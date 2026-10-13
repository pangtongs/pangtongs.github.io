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
  if (battle || locked || state.region !== 14) return;
  const l = leagueState();
  modal(
    `<h2>${l.active ? 'Rangkaian Liga' : 'Liga Nusantara'}</h2><p>Empat Elite, lalu Juara. Satu tim untuk lima pertandingan. Tidak ada pemulihan otomatis. Bekal boleh digunakan; klinik dan Titipan tutup selama rangkaian.</p><ol class="elite-line">${ELITE_IDS.map((id, i) => `<li class="${l.active && i === l.stage ? 'current' : ''}"><b>${l.active && i < l.stage ? '✓ ' : ''}${TRAINERS[id].name}</b><small>${TRAINERS[id].role}, ${TRAINERS[id].team.length} teman, Lv.${Math.min(80, TRAINERS[id].team.at(-1)[1] + l.clears * 5)}</small></li>`).join('')}</ol><p>${l.active ? 'Keluar wilayah, kalah, atau menyerah mengulang dari Elite pertama.' : 'Mulai saat HP dan bekal sudah siap. Menang membuka Balai Juara dan quest Tarsion.'}</p><div class="actions"><button class="action" data-league="${l.active ? 'continue' : 'begin'}">${l.active ? 'Lanjut, ' + (l.stage + 1) + '/5' : 'Mulai rangkaian'}</button>${closeButton('Siapkan tim')}</div>`,
    'league',
  );
}
function beginLeague() {
  if (battle || locked || state.region !== 14 || !gateReady(13) || !state.team.some(m => m.hp > 0)) return;
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
  toast('Rangkaian Liga berakhir. Daftar lagi untuk mencoba dari awal.');
}
function tarsionMenu() {
  if (state.region !== 13 || battle || locked) return;
  if (ownsTarsion()) {
    modal(
      `<h2>Pelataran kembali tenang</h2><p>Tarsion sudah menjadi temanmu. Quest ini selesai; tidak ada tangkapan kedua.</p>${closeButton()}`,
    );
    return;
  }
  if (!has('champion')) {
    modal(
      `<h2>Tarsion menunggu</h2><p>“Medannya terlalu kuat,” kata peneliti. “Raih gelar Juara, lalu kembali. Kita hanya perlu satu kalibrasi untuk membebaskannya.”</p>${closeButton()}`,
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
    `<div class="portrait-head">${art(47)}<div><h2>Tarsion, Lv.68</h2><p>${typeLabel(47)}</p></div></div><p>Medan penahan padam. Tarsion melangkah ke arahmu. Siapkan kapsul; jika kalah, kabur, atau membuatnya pingsan, ia tetap menunggu di sini.</p><div class="actions"><button class="action" data-league="legendfight" ${state.balls + (state.ultraballs || 0) < 1 ? 'disabled' : ''}>Dekati Tarsion</button>${closeButton('Siapkan tim')}</div>`,
    'tarsion',
  );
}
const RESONANCE_NAMES = ['Bulan', 'Matahari', 'Bintang'],
  RESONANCE_DIRS = ['↑ Utara', '→ Timur', '↓ Selatan', '← Barat'];
function resonanceMenu() {
  if (state.region !== 13 || battle || locked) return;
  if (!has('champion')) {
    tarsionMenu();
    return;
  }
  const q = legendQuest();
  q.started = true;
  save();
  modal(
    `<h2>Mata di Balik Kubah</h2><p>${q.open ? 'Medan penahan telah padam. Tarsion menunggu di pelataran.' : 'Catatan peneliti: <b>Matahari menghadap Timur.</b> Bulan berlawanan dengan Matahari. Bintang satu langkah searah jarum jam dari Bulan.'}</p><div class="waduk-puzzle resonance">${RESONANCE_NAMES.map((name, i) => `<section class="activity-panel"><b>${name}</b>${q.open ? `<output>${RESONANCE_DIRS[q.panels[i]]}</output>` : `<button data-league="rotate" data-id="${i}">${RESONANCE_DIRS[q.panels[i]]}</button>`}</section>`).join('')}</div><p class="${q.open ? 'activity-complete' : ''}" role="status">${q.open ? 'Medan terbuka. Tarsion menunggu di pelataran.' : q.message || 'Ketiga panel tersambung. Cocokkan arah lalu sinkronkan.'}</p>${q.open ? '' : `<div class="actions"><button class="action" data-league="align">Sinkronkan</button></div>`}${closeButton('Kembali ke pelataran')}`,
    'resonance',
  );
}
function rotateResonance(i) {
  if (
    modalKind !== 'resonance' ||
    state.region !== 13 ||
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
  if (modalKind !== 'resonance' || state.region !== 13 || !has('champion') || legendQuest().open) return;
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
      `<h2>Medan penahan padam</h2><p>Cincin Tarsion kembali berputar. Peneliti menyerahkan tiga Kapsul Ultra. Dekati Tarsion yang menunggu di pelataran utara.</p>${closeButton('Temui Tarsion')}`,
      'resonance-open',
    );
  } else {
    q.message = 'Sinyal belum bertemu. Periksa arah yang berlawanan dan urutan jarum jam.';
    save();
    resonanceMenu();
  }
}
// The legendary is an actual world sprite; the same point handles hover, walking and E.
const tarsionWorldPortrait = new Image();
tarsionWorldPortrait.src = creaturePortraitPath(47);
function atTutor() {
  return (
    !state.room &&
    [9, 12].includes(state.region) &&
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
      if (modalKind === 'tarsion' && legendQuest().open && !ownsTarsion() && state.region === 13)
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
const leagueNPCImage = new Image();
images['img/characters/league-npcs.webp'] = leagueNPCImage;
leagueNPCImage.onload = () => {
  for (let i = 0; i < 8; i++) {
    const c = document.createElement('canvas');
    c.width = leagueNPCImage.naturalWidth / 4;
    c.height = leagueNPCImage.naturalHeight / 2;
    c.getContext('2d').drawImage(
      leagueNPCImage,
      (i % 4) * c.width,
      Math.floor(i / 4) * c.height,
      c.width,
      c.height,
      0,
      0,
      c.width,
      c.height,
    );
    const bounds = isolateSprite(c),
      id = 49 + i;
    castCells.set(id, { canvas: c, bounds });
    const style = document.createElement('style');
    style.textContent = `.trainer-sprite.cast${id}{background-image:url(${c.toDataURL()});background-size:contain;background-position:center;background-repeat:no-repeat;filter:none;mix-blend-mode:normal}`;
    document.head.appendChild(style);
  }
};
leagueNPCImage.src = 'img/characters/league-npcs.webp';
function continueLeague() {
  // The Elite fights happen inside the arena; step in first when resuming elsewhere.
  if (state.region === 14 && !battle && !locked && leagueState().active && state.room !== 'leaguearena') {
    closeModal();
    if (state.room) exitRoom();
    if (state.room !== 'leaguearena') enterRoom('leaguearena');
  }
  const l = leagueState();
  if (battle || locked || !l.active || state.region !== 14) return;
  closeModal();
  trainerIntro(ELITE_IDS[l.stage]);
}
function hallMenu() {
  const l = leagueState();
  modal(
    `<img class="hall-preview" src="img/maps/interior/championhall.webp" alt=""><h2>Balai Juara</h2><p>${l.clears} kemenangan Liga. Pertandingan ulang naik 5 level per gelar, maksimal Lv.80.</p>${
      l.hall.length
        ? l.hall
            .slice()
            .reverse()
            .map(
              h =>
                `<section class="hall-entry"><b>Tim Juara #${h.number}</b><div class="hall-team">${h.team.map(m => `<div>${art(m.id)}<span>${SPECIES[m.id].name}<br>Lv.${m.level}</span></div>`).join('')}</div></section>`,
            )
            .join('')
        : '<p>Kalahkan Elite Four dan Juara untuk mencatat tim pertamamu.</p>'
    }${closeButton()}`,
    'hall',
  );
  appendMenu(journeyConsequences());
}
