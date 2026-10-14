/* Culture around town, each with something to do: the angklung and dangdut stage with Kak
   Lala, kite flying with Mbak Sinta, wayang and gamelan at the balai with Pak Joni, pencak
   silat with Kakek Rimba, the reog troupe backstage, congklak with Mbah Sepuh at the pos
   ojek, haggling at Pasar Rakyat, and cilok and seblak at every food stall. */

// --- Hosts: residents (and crew) who offer an activity besides their usual line. The
// chat shows the line as always, with the host's activities underneath.
const CULTURE_HOSTS = {
  'Kak Lala': () =>
    `<div class="actions"><button class="action" data-culture="angklung">${I18N.t('culture.lala.angklung')}</button><button class="action secondary" data-culture="dangdut">${I18N.t('culture.lala.dangdut')}</button></div><p class="story-hint">${miniRewardLine('rhythm-angklung')}</p>`,
  'Mbak Sinta': () =>
    `<p>${I18N.t('culture.sinta.offer', { name: SPECIES[KITE_SPECIES].name })}</p><div class="actions"><button class="action" data-culture="kite">${I18N.t('culture.sinta.kite')}</button></div>`,
  'Pak Joni': () => wayangPanel(),
  'Kakek Rimba': () => silatPanel(),
  'Kak Dewi': () => reogPanel(),
};
const cultureHost = p => CULTURE_HOSTS[p.name.split(', ')[0]];
// Called from a chat (interact.js) with the line it would say. True when this is a host.
function cultureChat(p, line) {
  const panel = cultureHost(p);
  if (!panel || battle) return false;
  const [name, role] = p.name.split(', ');
  modal(
    `<div class="portrait-head">${trainerArt(p.portrait)}<div>${role ? `<span class="eyebrow">${role.toUpperCase()}</span>` : ''}<h2>${name}</h2></div></div><p>“${line}”</p>${panel()}${closeButton()}`,
    'speech',
  );
  return true;
}

// --- Wayang at the balai: Pak Joni is also the dalang (puppeteer). Every evening he tells
// the next part of the lakon (play) "Wargamon Penjaga Kampung", one part a day, to the
// gamelan; the seventh part ends it with a gift. Before the show the gamelan needs a hand.
const WAYANG_PARTS = 7;
function wayangState() {
  const s = miniState();
  s.wayang ??= { heard: 0, day: -1 };
  return s.wayang;
}
function wayangPanel() {
  const w = wayangState(),
    done = w.heard >= WAYANG_PARTS,
    today = w.day === dayNumber();
  return `<h3>${I18N.t('culture.wayang.title')}</h3><p>${I18N.t(done ? 'culture.wayang.over' : today ? 'culture.wayang.tomorrow' : 'culture.wayang.offer', { n: w.heard + 1, total: WAYANG_PARTS })}</p><div class="actions">${done || today ? '' : `<button class="action" data-culture="wayang">${I18N.t('culture.wayang.listen')}</button>`}<button class="action secondary" data-culture="gamelan">${I18N.t('culture.wayang.gamelan')}</button></div><p class="story-hint">${I18N.t('culture.wayang.progress', { n: w.heard, total: WAYANG_PARTS })}</p>`;
}
function wayangListen() {
  const w = wayangState();
  if (modalKind !== 'speech' || w.heard >= WAYANG_PARTS || w.day === dayNumber()) return false;
  w.day = dayNumber();
  w.heard++;
  let gift = '';
  if (w.heard === WAYANG_PARTS) {
    addItem('ultraballs', 3);
    state.money += 25000;
    gift = `<p class="story-hint">${I18N.t('culture.wayang.gift', { money: money(25000) })}</p>`;
  }
  update();
  save();
  modal(
    `<span class="eyebrow">${I18N.t('culture.wayang.eyebrow', { n: w.heard, total: WAYANG_PARTS })}</span><h2>${I18N.t(`culture.wayang.part.${w.heard - 1}.title`)}</h2><p>${I18N.t(`culture.wayang.part.${w.heard - 1}.body`)}</p>${gift}${closeButton()}`,
    'speech',
  );
  return true;
}

// --- Pencak silat with Kakek Rimba: three moves of his, read from his stance. A kick
// (weight on the back foot) is blocked (tangkis), a punch (fists at the hip) dodged (elak),
// a sweep (low and wide) jumped (lompat). Three right answers earn the focus of a silat
// warm-up for three fights, once a day.
const SILAT_MOVES = ['tendang', 'pukul', 'sapu'],
  SILAT_ANSWER = { tendang: 'tangkis', pukul: 'elak', sapu: 'lompat' },
  SILAT_ROUNDS = 3;
let silat = null;
const silatMove = (day, round) => SILAT_MOVES[dayMix(day * 5 + round) % SILAT_MOVES.length];
function silatPanel() {
  return `<p>${I18N.t('culture.silat.offer')}</p><div class="actions"><button class="action" data-culture="silat" ${miniPaidToday('silat') ? 'disabled' : ''}>${I18N.t(miniPaidToday('silat') ? 'culture.silat.done' : 'culture.silat.go')}</button></div>`;
}
function silatStart() {
  if (modalKind !== 'speech' || miniPaidToday('silat')) return;
  silat = { round: 0, right: 0 };
  silatRender('');
}
function silatRender(feedback) {
  const s = silat,
    move = silatMove(dayNumber(), s.round),
    over = s.round >= SILAT_ROUNDS;
  modal(
    `<div class="portrait-head">${trainerArt(102)}<div><span class="eyebrow">${I18N.t('culture.silat.eyebrow')}</span><h2>${I18N.t('culture.silat.title')}</h2></div></div><p>${I18N.t('culture.silat.rules')}</p>${feedback ? `<p class="futsal-status">${feedback}</p>` : ''}${
      over
        ? `<p>${silatResult()}</p>`
        : `<p><b>${I18N.t('culture.silat.round', { n: s.round + 1, total: SILAT_ROUNDS })}</b> ${I18N.t(`culture.silat.stance.${move}`)}</p><div class="actions">${['tangkis', 'elak', 'lompat'].map((a, i) => `<button class="action secondary" data-silat="${a}">${miniKey(i + 1)}${I18N.t(`culture.silat.${a}`)}</button>`).join('')}</div>`
    }${closeButton()}`,
    'silat',
  );
}
function silatAnswer(answer) {
  const s = silat;
  if (!s || modalKind !== 'silat' || s.round >= SILAT_ROUNDS) return false;
  const move = silatMove(dayNumber(), s.round),
    right = SILAT_ANSWER[move] === answer;
  if (right) s.right++;
  s.round++;
  silatRender(
    I18N.t(right ? 'culture.silat.right' : 'culture.silat.wrong', {
      answer: I18N.t(`culture.silat.${SILAT_ANSWER[move]}`),
    }),
  );
  return right;
}
function silatResult() {
  const s = silat;
  if (s.right < SILAT_ROUNDS) return I18N.t('culture.silat.again', { n: s.right, total: SILAT_ROUNDS });
  if (!miniPaidToday('silat')) {
    miniState().paid.silat = dayNumber();
    state.mealBuff = { kind: 'focus', left: 3 };
    update();
    save();
  }
  return I18N.t('culture.silat.win');
}
document.addEventListener(
  'keydown',
  e => {
    if (modalKind !== 'silat' || !/^[1-3]$/.test(e.key) || e.repeat) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    silatAnswer(['tangkis', 'elak', 'lompat'][Number(e.key) - 1]);
  },
  true,
);

// --- Reog Ponorogo backstage at the festival: the warok's dadak merak (the peacock mask)
// weighs fifty kilos and is held up with the teeth. A teammate strong enough (level 25, or
// a Batu or Logam type from level 15) holds it for a moment and the troupe's cheering
// gives the team power for three fights, once a day.
const reogStrong = m =>
  m.hp > 0 &&
  (m.level >= 25 || (m.level >= 15 && SPECIES[m.id].types.some(t => t === 'Batu' || t === 'Logam')));
function reogPanel() {
  return `<p>${I18N.t('culture.reog.offer')}</p><div class="actions"><button class="action" data-culture="reog" ${miniPaidToday('reog') ? 'disabled' : ''}>${I18N.t(miniPaidToday('reog') ? 'culture.reog.done' : 'culture.reog.go')}</button></div>`;
}
function reogTry() {
  if (modalKind !== 'speech' || miniPaidToday('reog')) return false;
  const m = state.team.find(reogStrong);
  if (m) {
    miniState().paid.reog = dayNumber();
    state.mealBuff = { kind: 'power', left: 3 };
    update();
    save();
  }
  modal(
    `<span class="eyebrow">${I18N.t('culture.reog.eyebrow')}</span><h2>${I18N.t('culture.reog.title')}</h2><p>${m ? I18N.t('culture.reog.lift', { name: SPECIES[m.id].name }) : I18N.t('culture.reog.fail')}</p>${closeButton()}`,
    'speech',
  );
  return !!m;
}

// --- Jajanan at every food stall: cilok (tapioca balls on a stick, cheap and filling) and
// seblak, whose level of chilli you pick: each level is a fight of power, but from level 4
// the lead gets Terbakar (burned) from the heat unless it is an Api type, who love it.
const CILOK_PRICE = 2000,
  SEBLAK_PRICE = 4000;
function jajananCard() {
  return `<section class="dine-card jajanan-card"><h3>${I18N.t('culture.jajan.title')}</h3><div class="meal-grid"><button class="action secondary" data-jajan="cilok" ${state.money < CILOK_PRICE ? 'disabled' : ''}><b>${I18N.t('culture.jajan.cilok', { price: money(CILOK_PRICE) })}</b><small>${I18N.t('culture.jajan.cilokDesc')}</small></button></div><p>${I18N.t('culture.jajan.seblak', { price: money(SEBLAK_PRICE) })}</p><div class="seblak-levels">${[1, 2, 3, 4, 5].map(n => `<button class="secondary" data-jajan="seblak" data-level="${n}" ${state.money < SEBLAK_PRICE ? 'disabled' : ''}>${I18N.t('culture.jajan.level', { n })}</button>`).join('')}</div></section>`;
}
function eatJajanan(kind, level = 1) {
  if (modalKind !== 'shop' || battle || nyepiSilent()) return false;
  if (kind === 'cilok') {
    if (state.money < CILOK_PRICE) return false;
    state.money -= CILOK_PRICE;
    state.team.forEach(m => (m.fullness = Math.min(100, (m.fullness ?? 75) + 35)));
    update();
    shop();
    toast(I18N.t('culture.jajan.cilokDone'));
    return true;
  }
  level = Math.max(1, Math.min(5, Math.round(level)));
  if (state.money < SEBLAK_PRICE) return false;
  state.money -= SEBLAK_PRICE;
  state.mealBuff = { kind: 'power', left: level };
  state.team.forEach(m => (m.fullness = Math.min(100, (m.fullness ?? 75) + 25)));
  const lead = state.team.find(m => m.hp > 0),
    burned = level >= 4 && lead && !SPECIES[lead.id].types.includes('Api');
  if (burned) {
    lead.conditions ??= {};
    lead.conditions.burn = 3;
  }
  update();
  shop();
  toast(
    I18N.t(
      burned
        ? 'culture.jajan.seblakHot'
        : lead && level >= 4
          ? 'culture.jajan.seblakApi'
          : 'culture.jajan.seblakDone',
      {
        n: level,
        name: lead ? SPECIES[lead.id].name : '',
      },
    ),
  );
  return true;
}

// --- Congklak with Mbah Sepuh at the Padang Ojek pos: offered at its resting spot.
function campExtras(p) {
  return state.region === REGION.PADANG_OJEK && !state.room
    ? `<h3>${I18N.t('congklak.camp.title')}</h3><p>${I18N.t('congklak.camp.body')}</p><button class="action secondary" data-culture="congklak">${I18N.t('congklak.camp.play')}</button>`
    : '';
}

onClick(e => {
  const b = e.target.closest('[data-culture], [data-silat], [data-jajan]');
  if (!b || b.disabled || battle) return;
  if (b.dataset.silat) {
    silatAnswer(b.dataset.silat);
    return;
  }
  if (b.dataset.jajan) {
    eatJajanan(b.dataset.jajan, Number(b.dataset.level) || 1);
    return;
  }
  const what = b.dataset.culture;
  if (['angklung', 'dangdut', 'gamelan'].includes(what)) rhythmGame(what);
  else if (what === 'kite') kiteGame();
  else if (what === 'wayang') wayangListen();
  else if (what === 'silat') silatStart();
  else if (what === 'reog') reogTry();
  else if (what === 'congklak') congklakGame();
});
