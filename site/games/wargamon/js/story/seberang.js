/* Chapter five, Seberang: across the sea after the League. Pak Darto sails the Champion
   from the League to Teluk Pinisi; four local tasks earn four Caps in the Paspor
   Seberang, and Barisan Bara (the Kota Sagara militia from Warga Tactics) is driven out
   step by step until its Mandor Besi falls at Kawah Dieng and Elangkasa returns. */
for (const n of [1, 2, 3, 4]) deferMapImage(`img/maps/exterior/5-${n}.webp`);

const ELANGKASA = 85,
  ELANGKASA_LEVEL = 75,
  KOMODOBRAK = 89,
  KOMODO_LEVEL = 64;
// The carvings face north, east and south, as Ne' Tominaa says (seberang.carving.clue).
const CARVING_TARGET = [0, 1, 2],
  CARVING_START = [2, 3, 0];
// Mesin Bara 1 and 2 are guarded by one Barisan Bara member each; the third by both.
const MACHINE_GUARDS = [[72], [73], [72, 73]];
// The Cap each local leader gives, by region (SEBERANG_LEADERS in regions.js).
function seberangState() {
  const s = (state.seberang ??= {});
  s.pegs ??= [];
  s.marks ??= [];
  s.machines ??= [];
  if (!Array.isArray(s.carvings) || s.carvings.length !== 3) s.carvings = CARVING_START.slice();
  s.komodoDay ??= -1;
  return s;
}
const ownsElangkasa = () =>
  (state.legendCaught || []).includes(ELANGKASA) || savedMons().some(m => m.id === ELANGKASA);
const seberangDone = () => has('seberang');

// Pak Darto talks to anyone; the chapter's tasks, Komodo and Elangkasa need a team.
addInteraction(OPEN_INTERACTIONS, 'darto', () => dartoMenu());
addInteraction(TEAM_INTERACTIONS, 'seberang', p => seberangPoint(p));
addInteraction(TEAM_INTERACTIONS, 'komodo', () => komodoMenu());
addInteraction(TEAM_INTERACTIONS, 'elangkasa', () => elangkasaMenu());

// --- The four local tasks.
function seberangPoint(p) {
  if (busy() || !state.team.length) return;
  const s = seberangState();
  if (p.task === 'peg') {
    if (!s.pegs.includes(p.id)) {
      s.pegs.push(p.id);
      update();
    }
    toast(I18N.t(s.pegs.length === 3 ? 'seberang.peg.done' : 'seberang.peg.count', { n: s.pegs.length }));
    return;
  }
  if (p.task === 'hull') {
    if (has('pinisi'))
      modal(
        `<h2>${I18N.t('seberang.hull.title')}</h2><p>${I18N.t('seberang.hull.after')}</p>${closeButton()}`,
      );
    else if (s.pegs.length < 3)
      modal(
        `<h2>${I18N.t('seberang.hull.title')}</h2><p>${I18N.t('seberang.hull.need', { n: s.pegs.length })}</p>${closeButton()}`,
      );
    else {
      awardQuest('pinisi');
      modal(
        `<span class="eyebrow">${I18N.t('seberang.eyebrow')}</span><h2>${I18N.t('seberang.hull.launch.title')}</h2><p>${I18N.t('seberang.hull.launch.body')}</p><p class="story-hint">${I18N.t('seberang.hull.launch.next', { name: TRAINERS[59].name })}</p>${closeButton()}`,
        'seberang',
      );
    }
    return;
  }
  if (p.task === 'mark') {
    if (!s.marks.includes(p.id)) {
      s.marks.push(p.id);
      if (s.marks.length === 3) {
        awardQuest('ulin');
        modal(
          `<span class="eyebrow">${I18N.t('seberang.eyebrow')}</span><h2>${I18N.t('seberang.mark.done.title')}</h2><p>${I18N.t('seberang.mark.done.body', { name: TRAINERS[64].name })}</p>${closeButton()}`,
          'seberang',
        );
        return;
      }
      update();
    }
    toast(I18N.t('seberang.mark.count', { n: s.marks.length }));
    return;
  }
  if (p.task === 'carving') {
    carvingMenu();
    return;
  }
  if (p.task === 'machine') machineMenu(p.id);
}
// Three carvings must face the directions in the elder's saying. Bang Patok Palsu's fake
// boundary stakes close the courtyard until he is beaten.
const CARVING_NAMES = ['kerbau', 'ayam', 'matahari'];
function carvingMenu() {
  if (!state.defeated.includes(67)) {
    speak(67, I18N.t('seberang.carving.blocked'), localObjective());
    return;
  }
  const s = seberangState(),
    done = has('tongkonan');
  modal(
    `<span class="eyebrow">${I18N.t('seberang.eyebrow')}</span><h2>${I18N.t('seberang.carving.title')}</h2><p>${I18N.t(done ? 'seberang.carving.done' : 'seberang.carving.clue')}</p><div class="waduk-puzzle resonance">${CARVING_NAMES.map((name, i) => `<section class="activity-panel"><b>${I18N.t(`seberang.carving.${name}`)}</b>${done ? `<output>${RESONANCE_DIRS[s.carvings[i]]}</output>` : `<button data-seberang="rotate" data-id="${i}">${RESONANCE_DIRS[s.carvings[i]]}</button>`}</section>`).join('')}</div><p role="status" class="${done ? 'activity-complete' : ''}">${done ? I18N.t('seberang.carving.status.done', { name: TRAINERS[68].name }) : s.message || I18N.t('seberang.carving.hint')}</p>${done ? '' : `<div class="actions"><button class="action" data-seberang="carve">${I18N.t('seberang.carving.check')}</button></div>`}${closeButton()}`,
    'carving',
  );
}
function rotateCarving(i) {
  if (modalKind !== 'carving' || has('tongkonan') || ![0, 1, 2].includes(i) || !state.defeated.includes(67))
    return;
  const s = seberangState();
  s.carvings[i] = (s.carvings[i] + 1) % 4;
  s.message = '';
  save();
  carvingMenu();
}
function checkCarvings() {
  if (modalKind !== 'carving' || has('tongkonan') || !state.defeated.includes(67)) return;
  const s = seberangState();
  if (s.carvings.every((v, i) => v === CARVING_TARGET[i])) {
    s.message = '';
    awardQuest('tongkonan');
  } else s.message = I18N.t('seberang.carving.wrong');
  save();
  carvingMenu();
}
function machineMenu(i) {
  const s = seberangState(),
    guards = MACHINE_GUARDS[i];
  if (!guards) return;
  const waiting = guards.filter(id => !state.defeated.includes(id));
  if (waiting.length && !s.machines.includes(i)) {
    speak(waiting[0], I18N.t('seberang.machine.guarded'), localObjective());
    return;
  }
  if (!s.machines.includes(i)) {
    s.machines.push(i);
    if (s.machines.length === 3) awardQuest('dieng');
    else update();
  }
  modal(
    `<span class="eyebrow">${I18N.t('seberang.eyebrow')}</span><h2>${I18N.t('seberang.machine.title', { n: i + 1 })}</h2><p>${I18N.t(s.machines.length === 3 ? 'seberang.machine.allOff' : 'seberang.machine.off', { n: s.machines.length, name: TRAINERS[70].name })}</p>${closeButton()}`,
    'seberang',
  );
}

// --- Special encounters: Komodobrak on the islet, Elangkasa on the crater rim.
function komodoMenu() {
  if (busy() || !state.team.length) return;
  const s = seberangState();
  if (!has('pinisi')) {
    modal(
      `<h2>${I18N.t('seberang.komodo.title')}</h2><p>${I18N.t('seberang.komodo.locked')}</p>${closeButton()}`,
    );
    return;
  }
  const today = s.komodoDay === dayNumber();
  modal(
    `<span class="eyebrow">${I18N.t('legend.eyebrow.rare')}</span><div class="portrait-head">${art(KOMODOBRAK)}<div><h2>${SPECIES[KOMODOBRAK].name}</h2><p>${typeLabel(KOMODOBRAK)}</p></div></div><p>${I18N.t(today ? 'seberang.komodo.tomorrow' : 'seberang.komodo.body')}</p><div class="actions"><button class="action" data-seberang="komodo" ${today || !followingMon() ? 'disabled' : ''}>${I18N.t('legend.approach')}</button>${closeButton(I18N.t('trainer.prepare'))}</div>`,
    'komodo',
  );
}
function startKomodo() {
  const s = seberangState();
  if (modalKind !== 'komodo' || !has('pinisi') || s.komodoDay === dayNumber() || !followingMon()) return;
  s.komodoDay = dayNumber();
  closeModal();
  startBattle(null, [[KOMODOBRAK, KOMODO_LEVEL]]);
}
function elangkasaMenu() {
  if (busy() || !state.team.length) return;
  if (!state.defeated.includes(74)) {
    modal(
      `<h2>${I18N.t('legend.locked.legendary')}</h2><p>${I18N.t('seberang.elangkasa.locked')}</p>${closeButton()}`,
    );
    return;
  }
  if (ownsElangkasa()) {
    modal(
      `<h2>${I18N.t('legend.known.title', { name: tr(SPECIES[ELANGKASA].name) })}</h2><p>${I18N.t('seberang.elangkasa.owned')}</p>${closeButton()}`,
    );
    return;
  }
  modal(
    `<span class="eyebrow">${I18N.t('legend.eyebrow.legendary')}</span><div class="portrait-head">${art(ELANGKASA)}<div><h2>${SPECIES[ELANGKASA].name}, Lv.${ELANGKASA_LEVEL}</h2><p>${typeLabel(ELANGKASA)}</p></div></div><p>${SPECIES[ELANGKASA].desc}</p><p>${I18N.t('seberang.elangkasa.body')}</p><div class="actions"><button class="action" data-seberang="elangkasa" ${state.balls + (state.ultraballs || 0) < 1 || !followingMon() ? 'disabled' : ''}>${I18N.t('legend.approach')}</button>${closeButton(I18N.t('trainer.prepare'))}</div>`,
    'elangkasa',
  );
}
function startElangkasa() {
  if (modalKind !== 'elangkasa' || !state.defeated.includes(74) || ownsElangkasa() || !followingMon()) return;
  closeModal();
  startBattle(null, [[ELANGKASA, ELANGKASA_LEVEL]]);
}

// --- Victories: Caps, the admin's papers, the Mandor Besi, the defector's gift.
function celebrateSeberang(id) {
  const r = SEBERANG_LEADERS[id];
  if (r !== undefined) {
    state.team.forEach(m => {
      m.hp = m.max;
      clearStatus(m);
    });
    addItem('ultraballs', 3);
    addItem('maxpotion', 2);
    update();
    modal(
      `<span class="eyebrow">${REGIONS[r].badge.toUpperCase()}</span><h2>${I18N.t('seberang.cap.title', { cap: REGIONS[r].badge })}</h2><p>${TRAINERS[id].win}</p><p>${I18N.t('seberang.cap.supplies')}</p><p>${I18N.t(`seberang.cap.next.${r}`)}</p>${closeButton(I18N.t('common.continueJourney'))}`,
      'chapterwin',
    );
    return;
  }
  if (id === 69)
    modal(
      `<span class="eyebrow">${I18N.t('seberang.bara.eyebrow')}</span><h2>${I18N.t('seberang.admin.title')}</h2><p>${TRAINERS[69].win}</p><p>${I18N.t('seberang.admin.body')}</p>${closeButton(I18N.t('common.continueJourney'))}`,
      'chapterwin',
    );
  if (id === 74) {
    if (!has('seberang')) state.quests.push('seberang');
    state.money += 150000;
    addItem('ultraballs', 5);
    update();
    syncUniverse();
    modal(
      `<span class="eyebrow">${I18N.t('seberang.bara.eyebrow')}</span><h2>${I18N.t('seberang.boss.title')}</h2><p>${TRAINERS[74].win}</p><p>${I18N.t('seberang.boss.body')}</p><p class="story-hint">${I18N.t('seberang.boss.elangkasa')}</p>${closeButton(I18N.t('common.continueJourney'))}`,
      'chapterwin',
    );
  }
  if (id === 75 && !state.defectorGift) {
    state.defectorGift = true;
    const gift = makeMon(KOMODOBRAK, 62);
    (state.team.length < 6 ? state.team : (state.storage ??= [])).push(gift);
    if (!state.seen.includes(KOMODOBRAK)) state.seen.push(KOMODOBRAK);
    checkDexMilestones();
    update();
    modal(
      `<span class="eyebrow">${I18N.t('universe.eyebrow')}</span><div class="portrait-head">${art(KOMODOBRAK)}<div><h2>${I18N.t('universe.defector.gift.title')}</h2><p>${SPECIES[KOMODOBRAK].name}, Lv.62</p></div></div><p>${TRAINERS[75].win}</p><p>${I18N.t('universe.defector.gift.body')}</p>${closeButton()}`,
      'chapterwin',
    );
  }
}
// Once Elangkasa has joined, Pak Darto's closing scene points across to Kota Sagara.
function seberangEnding() {
  const s = seberangState();
  if (s.ending || !ownsElangkasa() || !seberangDone()) return false;
  s.ending = true;
  syncUniverse();
  save();
  modal(
    `<div class="portrait-head">${trainerArt(7)}<div><span class="eyebrow">${I18N.t('seberang.eyebrow')}</span><h2>${I18N.t('seberang.ending.title')}</h2></div></div><p>${I18N.t('seberang.ending.body')}</p><p>“${I18N.t('seberang.ending.darto')}”</p><p class="story-hint">${I18N.t('seberang.ending.tactics')} <a href="${WARGA_TACTICS_URL}" target="_blank" rel="noopener">${I18N.t('universe.tactics.open')}</a></p>${closeButton(I18N.t('common.continueJourney'))}`,
    'chapterwin',
  );
  return true;
}
// The first landing in Seberang: the crossing on Pak Darto's pinisi.
function seberangCrossing() {
  if (busy() || !state.team?.length || chapterOf() !== 4) return false;
  const s = seberangState();
  if (s.crossed) return false;
  s.crossed = true;
  save();
  modal(
    `<div class="portrait-head">${trainerArt(7)}<div><span class="eyebrow">${I18N.t('seberang.eyebrow')}</span><h2>${I18N.t('seberang.crossing.title')}</h2></div></div><p>${I18N.t('seberang.crossing.body')}</p><p class="quest-line">${REGIONS[REGION.TELUK_PINISI].goal}</p>${closeButton(I18N.t('story.depart'))}`,
    'seberang',
  );
  return true;
}
setInterval(() => {
  if (seberangCrossing()) return;
  if (!busy() && state.team?.length && state.seberang && !state.seberang.ending) seberangEnding();
}, 700);

// --- Pak Darto: the travel-card man of Pasar Rakyat, who kept the night watch at a ronda
// post in Kota Sagara before he moved. He sails the Champion across and brings news from
// the city (the other game's milestones, universe.js).
function dartoMenu() {
  if (busy()) return;
  const stage = !has('pinisi')
    ? 'arrive'
    : !state.defeated.includes(69)
      ? 'middle'
      : !seberangDone()
        ? 'dieng'
        : ownsElangkasa()
          ? 'after'
          : 'elang';
  modal(
    `<div class="portrait-head">${trainerArt(7)}<div><span class="eyebrow">${I18N.t('seberang.darto.role')}</span><h2>Pak Darto</h2></div></div><p>“${I18N.t(`seberang.darto.${stage}`)}”</p>${universeNewsHtml()}${stage === 'after' ? `<p><a href="${WARGA_TACTICS_URL}" target="_blank" rel="noopener">${I18N.t('universe.tactics.open')}</a></p>` : ''}${closeButton()}`,
    'darto',
  );
}

// --- The next step of the chapter, after the Champion's home-coming.
function seberangObjective() {
  if (!has('champion')) return null;
  const s = seberangState(),
    o = (title, detail, region, key, id = null) => ({ title, detail, region, key, id, room: null });
  const meet = (id, r) =>
    o(
      I18N.t('objective.regionMeet', { region: tr(REGIONS[r].name), name: tr(TRAINERS[id].name) }),
      REGIONS[r].goal,
      r,
      'trainer',
      id,
    );
  if (!state.visited.includes(REGION.TELUK_PINISI))
    return o(
      I18N.t('seberang.objective.sail.title'),
      I18N.t('seberang.objective.sail.detail'),
      REGION.LIGA,
      'connector',
    );
  for (const id of [55, 58]) if (!state.defeated.includes(id)) return meet(id, REGION.TELUK_PINISI);
  if (s.pegs.length < 3)
    return o(
      I18N.t('seberang.objective.peg', { n: s.pegs.length }),
      REGIONS[REGION.TELUK_PINISI].questText,
      REGION.TELUK_PINISI,
      'seberang',
      [0, 1, 2].find(i => !s.pegs.includes(i)),
    );
  if (!has('pinisi'))
    return o(
      REGIONS[REGION.TELUK_PINISI].questName,
      REGIONS[REGION.TELUK_PINISI].questText,
      REGION.TELUK_PINISI,
      'seberang',
      3,
    );
  if (!state.defeated.includes(59)) return meet(59, REGION.TELUK_PINISI);
  for (const id of [60, 62, 63]) if (!state.defeated.includes(id)) return meet(id, REGION.RIMBA_ULIN);
  if (!has('ulin'))
    return o(
      I18N.t('seberang.objective.mark', { n: s.marks.length }),
      REGIONS[REGION.RIMBA_ULIN].questText,
      REGION.RIMBA_ULIN,
      'seberang',
      [0, 1, 2].find(i => !s.marks.includes(i)),
    );
  if (!state.defeated.includes(64)) return meet(64, REGION.RIMBA_ULIN);
  for (const id of [65, 67]) if (!state.defeated.includes(id)) return meet(id, REGION.TONGKONAN);
  if (!has('tongkonan'))
    return o(
      REGIONS[REGION.TONGKONAN].questName,
      REGIONS[REGION.TONGKONAN].questText,
      REGION.TONGKONAN,
      'seberang',
      0,
    );
  for (const id of [68, 69]) if (!state.defeated.includes(id)) return meet(id, REGION.TONGKONAN);
  for (const id of [72, 73]) if (!state.defeated.includes(id)) return meet(id, REGION.DIENG);
  if (!has('dieng'))
    return o(
      I18N.t('seberang.objective.machine', { n: s.machines.length }),
      REGIONS[REGION.DIENG].questText,
      REGION.DIENG,
      'seberang',
      [0, 1, 2].find(i => !s.machines.includes(i)),
    );
  for (const id of [71, 70, 74]) if (!state.defeated.includes(id)) return meet(id, REGION.DIENG);
  if (!ownsElangkasa())
    return o(
      I18N.t('seberang.objective.elangkasa.title'),
      I18N.t('seberang.objective.elangkasa.detail'),
      REGION.DIENG,
      'elangkasa',
    );
  return null;
}

// --- The Paspor Seberang in the journal: four Caps and how Barisan Bara is doing.
function journalSeberang() {
  if (!has('champion')) return '';
  const caps = Object.entries(SEBERANG_LEADERS).map(([id, r]) => [
    REGIONS[r].badge,
    state.defeated.includes(Number(id)),
  ]);
  const bara = !state.defeated.includes(58)
    ? 'harbour'
    : !state.defeated.includes(69)
      ? 'valley'
      : !seberangDone()
        ? 'crater'
        : 'gone';
  return `<section><small>${I18N.t('journal.seberang', { n: caps.filter(c => c[1]).length })}</small><ul class="badge-list">${caps.map(([name, got]) => `<li class="${got ? 'earned' : ''}">${got ? '★' : '☆'} ${name}</li>`).join('')}</ul><p>${I18N.t(`journal.bara.${bara}`)}</p></section>`;
}

// Barisan Bara's footprints before the sea: each civic decision the player has met shows
// one clue in Kabar Warga, so the militia behind the calo, the factory and the express pier
// is known before the crossing.
function baraClues() {
  const c = civicState().choices,
    clues = ['permit', 'contract', 'coast'].filter(k => c[k] !== undefined);
  if (state.defeated.includes(53)) clues.push('tagih');
  if (state.defeated.includes(54)) clues.push('asap');
  if (!clues.length) return '';
  return `<section class="news-arc bara-clues"><h3>${I18N.t('bara.clues.title')}</h3><ul class="side-list">${clues.map(k => `<li>${I18N.t(`bara.clue.${k}`)}</li>`).join('')}</ul><p>${I18N.t(has('champion') ? 'bara.clues.sail' : 'bara.clues.more')}</p></section>`;
}

onClick(e => {
  const b = e.target.closest('[data-seberang]');
  if (!b || b.disabled) return;
  const a = b.dataset.seberang;
  if (a === 'rotate') rotateCarving(Number(b.dataset.id));
  if (a === 'carve') checkCarvings();
  if (a === 'komodo') startKomodo();
  if (a === 'elangkasa') startElangkasa();
});
