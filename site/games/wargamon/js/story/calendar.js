/* Kalender Warga: the holidays of the real calendar, on the player's own clock. Each event
   is announced under "Akan datang" in the journal before it starts, greets the player once
   when it begins, and pays its gift once per year (claims are keyed by event and year, so
   crossing midnight, a reload or a change of time zone never pays twice). */

// --- Dates. Fixed dates (17 Agustus, HUT Jakarta) read the local calendar directly. The
// lunar and lunisolar holidays move every year, so they come from this table, month and
// day in the local calendar ([month 1-12, day]).
// Sources of truth, in order: the Indonesian government's joint decree on national holidays
// and cuti bersama (SKB 3 Menteri) for the year; for Idul Fitri the Kemenag sidang isbat,
// which can move it by a day; Nyepi from the PHDI Saka calendar (the day after Tilem
// Kesanga); Imlek from the Chinese lunisolar calendar. 2026 follows the published decree;
// 2027-2032 are astronomical estimates to check against each new decree. A year missing
// here simply has no Imlek, Nyepi, Ramadan or Lebaran: nothing breaks.
const CALENDAR_TABLE = Object.freeze({
  2026: { imlek: [2, 17], nyepi: [3, 19], lebaran: [3, 20] },
  2027: { imlek: [2, 6], nyepi: [3, 8], lebaran: [3, 10] },
  2028: { imlek: [1, 26], nyepi: [3, 26], lebaran: [2, 27] },
  2029: { imlek: [2, 13], nyepi: [3, 15], lebaran: [2, 15] },
  2030: { imlek: [2, 3], nyepi: [3, 5], lebaran: [2, 5] },
  2031: { imlek: [1, 23], nyepi: [3, 24], lebaran: [1, 25] },
  2032: { imlek: [2, 11], nyepi: [3, 12], lebaran: [1, 14] },
  // Only for the Ramadan that starts in December 2032.
  2033: { lebaran: [1, 3] },
});
// Ramadan is taken as the 30 days before Lebaran (29 or 30 in practice).
const RAMADAN_DAYS = 30;
// Every event's window: [start, end) as local times. Nyepi runs from 06:00 to 06:00 the
// next morning, and its eve (Pengerupukan, the ogoh-ogoh parade) from the day before
// until Nyepi starts. An event's id names it and its table year: one claim per id.
function eventWindows(year) {
  const t = CALENDAR_TABLE[year] || {},
    at = ([month, day], n = 0, hour = 0) => new Date(year, month - 1, day + n, hour),
    list = [];
  if (t.imlek) list.push({ key: 'imlek', start: at(t.imlek, -1), end: at(t.imlek, 3), day: at(t.imlek) });
  if (t.nyepi) {
    list.push({ key: 'pengerupukan', start: at(t.nyepi, -1), end: at(t.nyepi, 0, 6), day: at(t.nyepi, -1) });
    list.push({ key: 'nyepi', start: at(t.nyepi, 0, 6), end: at(t.nyepi, 1, 6), day: at(t.nyepi) });
  }
  if (t.lebaran) {
    list.push({
      key: 'ramadan',
      start: at(t.lebaran, -RAMADAN_DAYS),
      end: at(t.lebaran),
      day: at(t.lebaran, -RAMADAN_DAYS),
    });
    list.push({ key: 'lebaran', start: at(t.lebaran), end: at(t.lebaran, 3), day: at(t.lebaran) });
  }
  // HUT Jakarta, the city's birthday on 22 June: ondel-ondel from the 20th to the 24th.
  list.push({ key: 'jakarta', start: at([6, 20]), end: at([6, 25]), day: at([6, 22]) });
  // 17 Agustus: the lomba (contests) from 10 to 24 August, as agustusan() has always said.
  list.push({ key: 'agustus', start: at([8, 10]), end: at([8, 25]), day: at([8, 17]) });
  return list.map(w => ({ ...w, id: `${w.key}-${year}` }));
}
const CALENDAR_EVENTS = ['imlek', 'pengerupukan', 'nyepi', 'ramadan', 'lebaran', 'jakarta', 'agustus'];
// Debug pages only (like ?agustus): ?debug&event=<name> forces one event on, today.
// `takjil` forces Ramadan with the dusk stalls open. Debug play keeps its own save.
const EVENT_FORCED = (() => {
  const name = DEBUG ? /[?&]event=([a-z]+)/.exec(location.search || '')?.[1] : null;
  return name === 'takjil' || CALENDAR_EVENTS.includes(name) ? name : null;
})();
const forcedKey = () => (EVENT_FORCED === 'takjil' ? 'ramadan' : EVENT_FORCED);
const localDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// The events running at `now`, oldest table year first.
function activeEvents(now = new Date()) {
  const y = now.getFullYear(),
    list = [y - 1, y, y + 1].flatMap(eventWindows).filter(w => w.start <= now && now < w.end);
  const forced = forcedKey();
  if (forced && !list.some(w => w.key === forced)) {
    const day = localDay(now);
    list.push({
      key: forced,
      start: day,
      end: new Date(y, now.getMonth(), now.getDate() + 1),
      day,
      id: `${forced}-${y}`,
    });
  }
  return list;
}
const eventActive = (key, now = new Date()) => activeEvents(now).find(w => w.key === key) || null;
// The next time an event starts after `now`, or null past the end of the table.
function nextEvent(key, now = new Date()) {
  const y = now.getFullYear();
  return (
    [y, y + 1, y + 2]
      .flatMap(eventWindows)
      .filter(w => w.key === key && w.start > now)
      .sort((a, b) => a.start - b.start)[0] || null
  );
}
// Whole calendar days from `now` to `date`.
const daysUntil = (date, now = new Date()) => Math.round((localDay(date) - localDay(now)) / 86400000);

// --- What the calendar has paid and shown. claimed holds `<event id>:<what>` entries.
function calendarState() {
  state.calendar ??= { claimed: [] };
  state.calendar.claimed ??= [];
  return state.calendar;
}
const claimedEvent = (e, what) => calendarState().claimed.includes(`${e.id}:${what}`);
// Marks a claim; false when it was already taken. The list keeps the latest 120 claims,
// far more than one year of events makes, so only claims of long-finished events leave it.
function claimEvent(e, what) {
  const c = calendarState(),
    tag = `${e.id}:${what}`;
  if (c.claimed.includes(tag)) return false;
  c.claimed.push(tag);
  if (c.claimed.length > 120) c.claimed.splice(0, c.claimed.length - 120);
  return true;
}
const teamLevel = () =>
  state.team.length ? Math.round(state.team.reduce((n, m) => n + m.level, 0) / state.team.length) : 5;
const eventText = (key, part, params) => I18N.t(`cal.${key}.${part}`, params);

// --- Gifts that come with the greeting.
// Lebaran: a THR (hari raya allowance) for everyone, growing with the badges, plus ketupat
// and opor that heal and feed the team with opor's guard for three fights. The Champion's
// Mudik THR from Pak RT (mudik.js) is a separate gift; whichever comes first on a day pays,
// the other one that day does not.
const SEASON_THR = 20000,
  SEASON_THR_BADGE = 2500;
const seasonThr = () => SEASON_THR + SEASON_THR_BADGE * BADGE_REGIONS.filter(r => gateReady(r)).length;
function lebaranGift(e) {
  if (!claimEvent(e, 'thr')) return '';
  const c = calendarState(),
    paidAtHome = state.lebaran?.home === dayNumber(),
    thr = paidAtHome ? 0 : seasonThr();
  state.money += thr;
  if (thr) c.thrDay = dayNumber();
  state.team.forEach(m => {
    m.hp = m.max;
    m.fullness = 100;
  });
  state.mealBuff = { kind: 'guard', left: 3 };
  update();
  return `<p class="story-hint">${thr ? eventText('lebaran', 'thr', { money: money(thr) }) : eventText('lebaran', 'thrHome')} ${eventText('lebaran', 'ketupat')}</p>`;
}
// Imlek: an angpao (red envelope) of Rp8.888, the lucky number.
const ANGPAO = 8888;
function imlekGift(e) {
  if (!claimEvent(e, 'angpao')) return '';
  state.money += ANGPAO;
  update();
  return `<p class="story-hint">${eventText('imlek', 'angpao', { money: money(ANGPAO) })}</p>`;
}
// HUT Jakarta: kerak telor from the ondel-ondel parade, power for three fights.
function jakartaGift(e) {
  if (!claimEvent(e, 'kerak')) return '';
  state.mealBuff = { kind: 'power', left: 3 };
  state.team.forEach(m => (m.fullness = 100));
  update();
  return `<p class="story-hint">${eventText('jakarta', 'kerak')}</p>`;
}
const EVENT_GIFTS = { lebaran: lebaranGift, imlek: imlekGift, jakarta: jakartaGift };
// What can be done during an event, as buttons on its card.
function eventActions(e) {
  const alive = state.team.some(m => m.hp > 0) ? '' : 'disabled';
  if (e.key === 'pengerupukan')
    return claimedEvent(e, 'boss')
      ? `<p>${eventText('pengerupukan', 'done')}</p>`
      : `<div class="actions"><button class="action" data-calendar="parade" ${alive}>${eventText('pengerupukan', 'go')}</button></div>`;
  if (e.key === 'imlek')
    return `<div class="actions"><button class="action" data-calendar="barongsai" ${alive}>${eventText('imlek', 'go')}</button></div>`;
  if (e.key === 'agustus') return `<p>${eventText('agustus', 'where')}</p>`;
  if (e.key === 'ramadan') return `<p>${takjilHours()}</p>`;
  return '';
}
// The event's card: shown once when it begins (with its gift) and again from the journal.
function eventCard(e, first = false) {
  const gift = first ? EVENT_GIFTS[e.key]?.(e) || '' : '';
  modal(
    `<span class="eyebrow">${I18N.t('cal.eyebrow')}</span><h2>${eventText(e.key, 'title')}</h2><p>${eventText(e.key, 'body')}</p>${gift}${eventActions(e)}${closeButton(eventText(e.key, 'close'))}`,
    'calendar',
  );
}
// Checked every second: greets an event once when it begins, when nothing else is open.
function calendarWatch(now = new Date()) {
  nyepiMusicCheck(now);
  if (!state.team.length || busy()) return false;
  const e = activeEvents(now).find(w => !claimedEvent(w, 'greet'));
  if (!e) return false;
  claimEvent(e, 'greet');
  eventCard(e, true);
  save();
  return true;
}
setInterval(() => calendarWatch(), 1000);

// --- Journal lines: what runs today and what is coming.
function calendarTodayRows(now = new Date()) {
  return activeEvents(now)
    .filter(e => e.key !== 'agustus')
    .map(
      e =>
        `${eventText(e.key, 'today')} <button class="secondary" data-calendar="open" data-key="${e.key}">${I18N.t('cal.open')}</button>`,
    );
}
function calendarUpcomingRows(now = new Date()) {
  return CALENDAR_EVENTS.filter(k => k !== 'agustus' && !eventActive(k, now))
    .map(k => nextEvent(k, now))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
    .map(e => {
      const n = daysUntil(e.start, now);
      return eventText(e.key, 'soon', {
        when: n ? I18N.t('upcoming.inDays', { n }) : I18N.t('upcoming.today'),
        date: `${e.day.getDate()}/${e.day.getMonth() + 1}`,
      });
    });
}

// --- Nyepi, the Balinese day of silence: no music, no wild encounters, shops and stalls
// closed, the lights dimmed. Clinics and their pharmacies stay open, and rest still works.
const nyepiSilent = (now = new Date()) => !!eventActive('nyepi', now);
function nyepiClosed() {
  if (!nyepiSilent() || ['clinic', 'researchlab'].includes(state.room)) return false;
  toast(eventText('nyepi', 'closed'));
  return true;
}
// Music stops for the day and starts again when the silence ends.
let nyepiHushed = false;
function nyepiMusicCheck(now = new Date()) {
  const quiet = nyepiSilent(now);
  if (quiet === nyepiHushed) return;
  nyepiHushed = quiet;
  if (quiet) stopMusic();
  else restartMusic();
}
// The eve: the ogoh-ogoh parade, and the giant Ogohgoro that wakes in it. A boss is never
// caught; beating it once per year pays the parade's prize.
const PARADE_PRIZE = 30000;
function startParade() {
  const e = eventActive('pengerupukan');
  if (!e || modalKind !== 'calendar' || battle || claimedEvent(e, 'boss') || !state.team.some(m => m.hp > 0))
    return;
  const level = Math.min(LEVEL_CAP, Math.max(8, teamLevel() + 3));
  closeModal(true);
  startBattle(null, [[EVENT_SPECIES.nyepi.boss, level]]);
  if (!battle) return;
  Object.assign(battle, {
    noCatch: true,
    header: eventText('pengerupukan', 'header'),
    after: outcome => paradeAfter(e, outcome),
    log: eventText('pengerupukan', 'log'),
  });
  renderBattle();
}
function paradeAfter(e, outcome) {
  if (outcome !== 'win' || !claimEvent(e, 'boss')) return;
  state.money += PARADE_PRIZE;
  addItem('ultraballs', 3);
  state.basketLeft = Math.max(state.basketLeft || 0, 5);
  update();
  save();
  whenFree(() =>
    modal(
      `<span class="eyebrow">${I18N.t('cal.eyebrow')}</span><h2>${eventText('pengerupukan', 'winTitle')}</h2><p>${eventText('pengerupukan', 'win', { money: money(PARADE_PRIZE) })}</p>${closeButton()}`,
      'calendar',
    ),
  );
}
// The quiet world: darker at night with no lamps, a little dim by day.
function nyepiShade(g, camera) {
  if (!nyepiSilent()) return false;
  g.save();
  g.fillStyle = isNight() ? 'rgba(4, 6, 20, 0.66)' : 'rgba(20, 24, 40, 0.2)';
  g.fillRect(camera.x, camera.y, camera.width, camera.height);
  g.restore();
  return true;
}

// --- Imlek: the barongsai (lion dance) performance is a drum game; the first good show of
// the year draws Barongcuan out to play. Barongcuan also visits the city's habitats.
function startBarongsai() {
  if (!eventActive('imlek') || modalKind !== 'calendar' || battle) return;
  rhythmGame('barongsai');
}
function barongsaiAfter(passed) {
  const e = eventActive('imlek');
  if (!passed || !e || !claimEvent(e, 'barong')) return '';
  const id = EVENT_SPECIES.imlek.guests[0];
  whenFree(() => {
    startBattle(null, [[id, Math.min(LEVEL_CAP, Math.max(8, teamLevel()))]]);
    if (!battle) return;
    battle.log = eventText('imlek', 'appears', { name: SPECIES[id].name });
    renderBattle();
  });
  return eventText('imlek', 'follow', { name: SPECIES[id].name });
}
// Event visitors in the wild: Barongcuan at Imlek, Ondelgondel for HUT Jakarta, both in
// the city's habitats (Pasar Rakyat and Wargamall).
const EVENT_GUEST_REGIONS = [REGION.PASAR_RAKYAT, REGION.WARGAMALL];
function calendarGuests(r = state.region, now = new Date()) {
  if (!EVENT_GUEST_REGIONS.includes(r)) return [];
  const list = [];
  if (eventActive('imlek', now))
    list.push(...EVENT_SPECIES.imlek.guests.map(id => ({ id, weight: 6, guest: true })));
  if (eventActive('jakarta', now))
    list.push(...EVENT_SPECIES.jakarta.guests.map(id => ({ id, weight: 8, guest: true })));
  return list;
}

// --- Ramadan: Pasar Takjil at dusk (17:30 to 19:00), the snacks for breaking the fast at
// the food stalls and at Bu Sari's warung. One of each a day.
const TAKJIL = [
  { key: 'kolak', price: 3000 },
  { key: 'esbuah', price: 3000, buff: 'focus' },
  { key: 'gorengan', price: 2000, buff: 'power' },
  { key: 'kurma', price: 2000, buff: 'guard' },
];
const TAKJIL_FROM = 17 * 60 + 30,
  TAKJIL_UNTIL = 19 * 60;
function takjilOpen(now = new Date()) {
  const minute = now.getHours() * 60 + now.getMinutes();
  return (
    !!eventActive('ramadan', now) &&
    !nyepiSilent(now) &&
    (EVENT_FORCED === 'takjil' || (minute >= TAKJIL_FROM && minute < TAKJIL_UNTIL))
  );
}
const takjilHours = () => eventText('ramadan', 'hours');
function takjilBought() {
  const c = calendarState();
  if (c.takjil?.day !== dayNumber()) c.takjil = { day: dayNumber(), bought: [] };
  return c.takjil.bought;
}
function takjilCard() {
  if (!eventActive('ramadan')) return '';
  if (!takjilOpen()) return `<p class="story-hint">${takjilHours()}</p>`;
  const bought = takjilBought();
  return `<section class="dine-card takjil-card"><h3>${I18N.t('cal.takjil.title')}</h3><p>${I18N.t('cal.takjil.body')}</p><div class="meal-grid">${TAKJIL.map(
    t =>
      `<button class="action secondary" data-takjil="${t.key}" ${bought.includes(t.key) || state.money < t.price ? 'disabled' : ''}><b>${I18N.t(`cal.takjil.${t.key}.name`)}, ${money(t.price)}</b><small>${I18N.t(bought.includes(t.key) ? 'cal.takjil.had' : `cal.takjil.${t.key}.desc`)}</small></button>`,
  ).join('')}</div></section>`;
}
function buyTakjil(key) {
  const t = TAKJIL.find(t => t.key === key),
    bought = takjilBought();
  if (!t || !['shop', 'warung'].includes(modalKind) || !takjilOpen() || bought.includes(key)) return false;
  if (state.money < t.price) return false;
  state.money -= t.price;
  bought.push(key);
  if (t.buff) {
    state.mealBuff = { kind: t.buff, left: 3 };
    state.team.forEach(m => (m.fullness = Math.min(100, (m.fullness ?? 75) + 15)));
  } else
    state.team.forEach(m => {
      if (m.hp > 0) m.hp = Math.min(m.max, m.hp + Math.ceil(m.max * 0.3));
      m.fullness = Math.min(100, (m.fullness ?? 75) + 30);
    });
  update();
  if (modalKind === 'shop') shop();
  else questDialog();
  toast(I18N.t(`cal.takjil.${key}.done`));
  return true;
}
// The night watch in Ramadan ends with a round of the alleys, kentongan in hand, to wake
// everyone for sahur; Pak Hansip's sahur fills the team.
const ramadanRonda = () =>
  eventActive('ramadan') ? `<p class="story-hint">${I18N.t('cal.ramadan.ronda')}</p>` : '';
function sahurAfterRonda() {
  if (!eventActive('ramadan')) return '';
  state.team.forEach(m => (m.fullness = 100));
  return ' ' + I18N.t('cal.ramadan.sahur');
}

// --- Seasonal greetings: the first line a resident says while an event runs.
const SEASON_CHATS = 3;
function seasonLine(p) {
  const e = activeEvents().find(e => e.key !== 'agustus');
  return e ? I18N.t(`cal.${e.key}.chat.${p.portrait % SEASON_CHATS}`) : '';
}

onClick(event => {
  const b = event.target.closest('[data-calendar], [data-takjil]');
  if (!b || b.disabled) return;
  if (b.dataset.takjil) {
    buyTakjil(b.dataset.takjil);
    return;
  }
  const kind = b.dataset.calendar;
  if (kind === 'parade') startParade();
  else if (kind === 'barongsai') startBarongsai();
  else if (kind === 'open') {
    const e = eventActive(b.dataset.key);
    if (e && !battle) eventCard(e);
  }
});
