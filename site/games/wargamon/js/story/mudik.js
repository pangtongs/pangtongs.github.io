/* Mudik: after the League the Champion goes home. Chapter one's wild Wargamon have
   grown up, an old friend from the same gang wants a rematch of their childhood, and
   the first ever League Champion waits in Padang Ojek with the Piala Mudik. */

const MUDIK_REGIONS = [REGION.SUKAMAJU, REGION.PADANG_OJEK, REGION.HUTAN];
const MUDIK_LEVELS = [55, 62];
// The level range of a region's wild creatures, raised at home once the player is Champion.
function regionLevels(r = state.region) {
  return has('champion') && MUDIK_REGIONS.includes(r) ? MUDIK_LEVELS : REGIONS[r].levels;
}
// The Champion's trophy scene ends with the news from home: who waits there.
function mudikNews() {
  return `<p><b>${I18N.t('mudik.intro.title')}</b> ${I18N.t('mudik.intro.body', { rival: TRAINERS[51].name, master: TRAINERS[52].name })}</p>`;
}
// Beating the old Champion earns the Piala Mudik, and Mbah's salam tempel.
const SALAM_TEMPEL = 20000;
function celebrateMudik(id) {
  if (id !== 52 || state.mudikCup) return;
  state.mudikCup = true;
  state.money += 100000 + SALAM_TEMPEL;
  addItem('ultraballs', 5);
  addItem('maxpotion', 3);
  update();
  modal(
    `<span class="eyebrow">${I18N.t('mudik.eyebrow')}</span><h2>${I18N.t('mudik.cup.title')}</h2><p>${TRAINERS[52].win}</p><p>${I18N.t('mudik.cup.body')}</p><p>${I18N.t('mudik.salam', { money: money(SALAM_TEMPEL) })}</p>${closeButton(I18N.t('mudik.cup.close'))}`,
    'chapterwin',
  );
}

// --- Lebaran on the road home. The first time the Champion reaches home ground, the
// mudik road is jammed: three fights in a row against Padang Ojek's vehicle Wargamon
// (the Ronda chain, state.ronda.kind === 'macet'). Clearing it brings the Champion home
// to ketupat and opor, "maaf lahir batin" and THR from Pak RT.
const LEBARAN_THR = 50000;
const macetPool = () => REGIONS[REGION.PADANG_OJEK].wild.filter(id => id > 2);
let macetShownIn = null;
// Checked twice a second: offers the macet once per arrival in a home region.
function mudikWatch() {
  if (!MUDIK_REGIONS.includes(state.region) || state.room) {
    macetShownIn = null;
    return;
  }
  // A chain only counts while one of its fights or its between-fights dialog is open;
  // one left over from an older version would otherwise block the macet for good.
  if (state.ronda && !battle && modalKind !== 'ronda') delete state.ronda;
  if (!has('champion') || state.lebaran || state.ronda || busy() || macetShownIn === state.region) return;
  macetShownIn = state.region;
  modal(
    `<span class="eyebrow">${I18N.t('mudik.eyebrow')}</span><h2>${I18N.t('mudik.macet.title')}</h2><p>${I18N.t('mudik.macet.body')}</p><div class="actions"><button class="action" data-mudik="macet" ${state.team.some(m => m.hp > 0) ? '' : 'disabled'}>${I18N.t('mudik.macet.go')}</button><button class="secondary" data-act="close">${I18N.t('mudik.macet.later')}</button></div>`,
    'macet',
  );
}
function startMacet() {
  if (modalKind !== 'macet' || state.lebaran || battle || !state.team.some(m => m.hp > 0)) return;
  state.ronda = { night: dayNumber(), left: RONDA_FIGHTS, kind: 'macet' };
  closeModal(true);
  rondaFight();
}
// Home at last: the Lebaran table heals and feeds the team, with opor's strength for three fights.
function lebaranHome() {
  state.lebaran = { home: dayNumber() };
  // On a Lebaran day the season's THR (calendar.js) may already have been paid: one THR a day.
  const thr = state.calendar?.thrDay === dayNumber() ? 0 : LEBARAN_THR;
  state.money += thr;
  state.team.forEach(m => {
    m.hp = m.max;
    m.fullness = 100;
    clearStatus(m);
  });
  state.mealBuff = { kind: 'power', left: 3 };
  update();
  modal(
    `<div class="portrait-head">${trainerArt(3)}<div><span class="eyebrow">${I18N.t('mudik.eyebrow')}</span><h2>${I18N.t('mudik.lebaran.title')}</h2></div></div><p>${I18N.t('mudik.lebaran.body')}</p><p>“${I18N.t('mudik.lebaran.maaf')}”</p><p class="story-hint">${thr ? I18N.t('mudik.lebaran.reward', { thr: money(thr), effect: I18N.t('dine.effect.power') }) : I18N.t('mudik.lebaran.rewardNoThr', { effect: I18N.t('dine.effect.power') })}</p>${closeButton(I18N.t('mudik.lebaran.close'))}`,
    'lebaran',
  );
}
setInterval(mudikWatch, 500);
onClick(event => {
  const b = event.target.closest('[data-mudik]');
  if (b && !b.disabled) startMacet();
});
