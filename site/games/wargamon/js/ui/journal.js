/* The travel map and the journal: chapters, badges, side activities and places. */
function mapMenu(page = chapterOf()) {
  if (battle || locked || modalKind === 'starter') return;
  page = Math.max(0, Math.min(WORLD_CHAPTERS.length - 1, Number(page) || 0));
  const [[a, b], [c, d]] = WORLD_CHAPTERS[page].tiles;
  // The four maps sit as they do in the world, with the ways between them in the gaps.
  const cells = [card(a), joint(a, b, '↔'), card(b), joint(a, c, '↕'), '<span></span>', joint(b, d, '↕')];
  cells.push(card(c), joint(c, d, '↔'), card(d));
  modal(
    `<h2>${I18N.t('map.title')}</h2><div class="actions">${WORLD_CHAPTERS.map((chapter, i) => `<button data-league="map" data-id="${i}" aria-pressed="${i === page}">${chapter.name}</button>`).join('')}</div><p>${I18N.t('world.chapter.travel')}</p><div class="travel-grid">${cells.join('')}</div>`,
    'map',
    closeButton(),
  );
  // The map the player is on is outlined and scrolled into view, however far down it sits.
  setTimeout(() => $('modal').querySelector('.travel-slot.here')?.scrollIntoView?.({ block: 'center' }), 0);
  function card(i) {
    const gang = i === GANG_GRID_INDEX,
      r = gang ? { name: 'Gang Senggol', subtitle: I18N.t('place.gang.subtitle') } : REGIONS[i],
      p = gang ? ROOMS.gangsenggol : PLACES[i],
      tile = p.tile,
      open = regionAvailable(i);
    const here = gang ? inGang() : i === state.region && !inGang();
    const dot = here ? travelHereDot(i) : '';
    return `<div class="travel-slot${here ? ' here' : ''}"><button class="travel-card" data-act="travel" data-id="${i}" ${!open ? 'disabled' : ''}><span class="travel-preview" style="background-image:url('${p.image}');background-size:${tile < 0 ? 'cover' : '200% 200%'};background-position:${tile < 0 ? 'center' : (tile % 2) * 100 + '% ' + Math.floor(tile / 2) * 100 + '%'}">${dot}</span><b>${r.name}</b><small>${here ? I18N.t('map.here') : !open ? I18N.t('ui.travel.locked') : page !== chapterOf() ? I18N.t('world.chapter.connector') : r.subtitle}</small>${open ? travelStats(i) : ''}</button>${canRideOjek(i) && !here ? `<button class="ojek-ride" data-act="ojek" data-id="${i}" ${state.money < OJEK_FARE ? 'disabled' : ''}>${I18N.t('ojek.ride.button', { fare: money(OJEK_FARE) })}</button>` : ''}</div>`;
  }
  function joint(from, to, mark) {
    return mapsJoined(from, to)
      ? `<span class="travel-link" title="${I18N.t('map.joined')}" aria-label="${I18N.t('map.joined')}">${mark}</span>`
      : '<span></span>';
  }
}
// "You are here" on the map card: the hero's place in the painting, or the door of the
// building the hero is inside.
function travelHereDot(i) {
  let x = state.x,
    y = state.y;
  if (i === GANG_GRID_INDEX) [x, y] = [worldPosition().x - GANG_WORLD.x, worldPosition().y - GANG_WORLD.y];
  else if (state.room) {
    const door = PLACES[i].points.find(p => p.room === state.room) ||
      PLACES[i].points.find(p => p.room === state.lateParent?.room) || {
        x: PLACES[i].spawn[0],
        y: PLACES[i].spawn[1],
      };
    [x, y] = [door.x, door.y];
  }
  const pct = (n, size) => Math.max(2, Math.min(98, (n / size) * 100)).toFixed(1);
  return `<i class="travel-here" style="left:${pct(x, 960)}%;top:${pct(y, 640)}%" aria-label="${I18N.t('map.here')}"></i>`;
}
// Two neighbouring maps share a way across: a measured opening, or (where a chapter is
// painted as one town) floor running over the shared edge for at least a body's width.
function mapsJoined(a, b) {
  if (WORLD_LINKS.some(l => (l.from === a && l.to === b) || (l.from === b && l.to === a))) return true;
  if (chapterOf(a) === 3 || chapterOf(a) !== chapterOf(b)) return false;
  const [ax, ay] = WORLD_PAINT_GRID[a],
    [bx, by] = WORLD_PAINT_GRID[b];
  if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return false;
  const rows = i => effectiveFloorRows(i === GANG_GRID_INDEX ? 'gang' : String(i)),
    [first, second] = ax + ay < bx + by ? [rows(a), rows(b)] : [rows(b), rows(a)],
    across = ax !== bx;
  let run = 0;
  for (let k = 0; k < (across ? 65 : 97); k++) {
    const near = across ? first[k][95] + first[k][96] : first[63][k] + first[64][k],
      far = across ? second[k][0] + second[k][1] : second[0][k] + second[1][k];
    run = near === '##' && far === '##' ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
}
// What a map offers at a glance: places to recover, shops, and trainers still to beat.
// Rooms behind its doors count too (the clinic, the gym's trainers).
const HEAL_KEYS = ['camp', 'clinic', 'pitstop', 'tea', 'meal'],
  SHOP_KEYS = ['shop', 'pharmacy'];
function mapOffers(i) {
  const seen = new Set(),
    points = [];
  const visit = list => {
    for (const p of list.filter(pointVisible)) {
      points.push(p);
      if (p.room && ROOMS[p.room] && !seen.has(p.room)) {
        seen.add(p.room);
        visit(ROOMS[p.room].points);
      }
    }
  };
  visit(i === GANG_GRID_INDEX ? ROOMS.gangsenggol.points : PLACES[i].points);
  const trainers = points.filter(p => p.key === 'trainer');
  return {
    heal: points.filter(p => HEAL_KEYS.includes(p.key)).length,
    shop: points.filter(p => SHOP_KEYS.includes(p.key)).length,
    trainers: trainers.length,
    unbeaten: new Set(trainers.filter(p => !state.defeated.includes(p.id)).map(p => p.id)).size,
  };
}
function travelStats(i) {
  const o = mapOffers(i),
    stats = [];
  if (o.heal) stats.push(['heal', I18N.t('map.stat.heal', { n: o.heal })]);
  if (o.shop) stats.push(['shop', I18N.t('map.stat.shop', { n: o.shop })]);
  if (o.unbeaten) stats.push(['trainers', I18N.t('map.stat.trainers', { n: o.unbeaten })]);
  else if (o.trainers) stats.push(['cleared', I18N.t('map.stat.cleared')]);
  return stats.length
    ? `<span class="travel-stats">${stats.map(([k, text]) => `<span class="travel-stat ${k}">${text}</span>`).join('')}</span>`
    : '';
}
/* Shared creature identity in selection menus; use existing sprite art. */
function creatureChip(id, extra = '') {
  return `<span class="creature-chip">${art(id)}<span><b>${SPECIES[id].name}</b>${extra ? `<small>${extra}</small>` : ''}</span></span>`;
}
// The journal lists every Lencana, earned or still ahead.
const BADGE_REGIONS = [
  REGION.HUTAN,
  REGION.BALAI_BETON,
  REGION.FESTIVAL,
  REGION.PESISIR,
  REGION.WARGAMALL,
  REGION.BENGKEL,
  REGION.WADUK,
  REGION.STASIUN,
  REGION.PUNCAK,
];
function journalBadges() {
  const earned = BADGE_REGIONS.filter(r => gateReady(r));
  return `<section><small>${I18N.t('journal.badges', { n: earned.length, total: BADGE_REGIONS.length })}</small><ul class="badge-list">${BADGE_REGIONS.map(r => `<li class="${earned.includes(r) ? 'earned' : ''}">${earned.includes(r) ? '★' : '☆'} ${REGIONS[r].badge}</li>`).join('')}</ul></section>`;
}
// What the side jobs offer right now, so they are found without asking around.
function journalSideActivities() {
  const today = dayNumber(),
    rematches = state.defeated.filter(
      id => !ELITE_IDS.includes(id) && state.rematchPaid?.[id] !== today,
    ).length,
    jobs = chapterState().jobs,
    // Before 22:00 the Ronda is listed under what is coming instead.
    ronda = !rondaTime()
      ? ''
      : state.rondaDone === rondaNight()
        ? 'journal.ronda.done'
        : 'journal.ronda.open';
  const rows = [
    ronda && I18N.t(ronda),
    I18N.t('journal.bazaar', {
      goods: bazaarStock()
        .map(k => I18N.t(`bazaar.${k}.name`))
        .join(', '),
    }),
    I18N.t('journal.guest', { name: guestText(pasarGuest(), 'name') }),
    agustusan() ? I18N.t('journal.agustus') : '',
    // Holidays running now (calendar.js), each with a button to its card.
    ...calendarTodayRows(),
    has('orders')
      ? I18N.t('journal.delivery', { n: jobs?.day === dayNumber() ? jobs.today : 0, full: DELIVERY_FULL_PAY })
      : '',
    rematches ? I18N.t('journal.rematch', { n: rematches }) : '',
  ].filter(Boolean);
  return `<section><small>${I18N.t('journal.side')}</small><ul class="side-list">${rows.map(r => `<li>${r}</li>`).join('')}</ul></section>${journalUpcoming()}`;
}
// What the calendar and the clock bring later, so seasonal events are known off-season too.
function journalUpcoming(now = new Date()) {
  const rows = [];
  if (!rondaTime(now.getHours()))
    rows.push(
      `${I18N.t('journal.ronda.day')} ${I18N.t('upcoming.inHours', { n: (RONDA_START - now.getHours() + 24) % 24 || 24 })}`,
    );
  if (state.arisan) {
    const n = (7 - ((dayNumber() + 3) % 7)) % 7;
    rows.push(
      I18N.t('upcoming.arisan', { when: n ? I18N.t('upcoming.inDays', { n }) : I18N.t('upcoming.today') }),
    );
  }
  if (!agustusan(now))
    rows.push(I18N.t('upcoming.agustus', { when: I18N.t('upcoming.inDays', { n: daysToAgustus(now) }) }));
  // The other holidays of the calendar, soonest first.
  rows.push(...calendarUpcomingRows(now));
  return rows.length
    ? `<section><small>${I18N.t('upcoming.title')}</small><ul class="side-list upcoming-list">${rows.map(r => `<li>${r}</li>`).join('')}</ul></section>`
    : '';
}
// Whole days from `now` to the next 10 August, when the Lomba 17-an opens.
function daysToAgustus(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(now.getFullYear(), 7, 10);
  if (start <= today) start = new Date(now.getFullYear() + 1, 7, 10);
  return Math.round((start - today) / 86400000);
}

// --- Welcome back. After a night or more away (a new calendar day and at least eight
// hours), the first screen is one card: where the journey stands and what today brings.
const WELCOME_AWAY_MS = 8 * 3600000;
function noteSeen(now = Date.now()) {
  if (state.team.length) state.lastSeen = now;
}
function welcomeBack(now = Date.now()) {
  const last = Number(state.lastSeen),
    day = t => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);
  noteSeen(now);
  if (!state.team.length || !Number.isFinite(last) || last <= 0) return false;
  const days = day(now) - day(last);
  if (days < 1 || now - last < WELCOME_AWAY_MS) return false;
  whenFree(() => welcomeCard(days));
  return true;
}
function welcomeCard(days) {
  const r = room(),
    where = r ? I18N.t('welcome.inRoom', { room: r.name, region: region().name }) : region().name,
    badges = BADGE_REGIONS.filter(i => gateReady(i)).length,
    guest = dailyGuest(),
    team = state.team
      .map(
        m =>
          `<div class="welcome-mon">${monArt(m)}<span><b>${monName(m)}</b> Lv.${m.level}<small>${m.hp}/${m.max} HP</small>${hpBar(m)}</span></div>`,
      )
      .join(''),
    today = [
      I18N.t('welcome.trader', { name: guestText(pasarGuest(), 'name') }),
      regionAvailable(guest.region)
        ? I18N.t('welcome.guest', { name: SPECIES[guest.id].name, region: REGIONS[guest.region].name })
        : I18N.t('journal.guest.locked'),
      I18N.t(rondaTime() ? 'journal.ronda.open' : 'welcome.ronda'),
      I18N.t('journal.bazaar', {
        goods: bazaarStock()
          .map(k => I18N.t(`bazaar.${k}.name`))
          .join(', '),
      }),
      agustusan() ? I18N.t('journal.agustus') : '',
      ...activeEvents()
        .filter(e => e.key !== 'agustus')
        .map(e => I18N.t(`cal.${e.key}.today`)),
      journalNews(),
    ].filter(Boolean);
  modal(
    `<div class="welcome-back"><span class="eyebrow">${I18N.t('welcome.eyebrow')}</span><h2>${I18N.t('welcome.title', { n: days })}</h2><p>${I18N.t('welcome.where', { place: where })} ${I18N.t('welcome.badges', { n: badges, total: BADGE_REGIONS.length })}</p><div class="welcome-team">${team}</div><h3>${I18N.t('welcome.today')}</h3><ul class="side-list">${today.map(t => `<li>${t}</li>`).join('')}</ul><div class="actions"><button class="secondary" data-ui="worldinfo">${I18N.t('welcome.journal')}</button>${closeButton(I18N.t('welcome.go'))}</div></div>`,
    'welcome',
  );
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
 <section><small>${I18N.t('journal.mainGoal')}</small><h3>${escapeHTML(value('nextObjective'))}</h3><p>${escapeHTML(value('objectiveDetail'))}</p><button data-world="guide">${I18N.t('hud.guide')}</button></section>
 <section><small>${I18N.t('journal.heading', { count: escapeHTML(value('chapterCount')) })}</small><h3>${escapeHTML(value('journalTitle'))}</h3><p>${escapeHTML(value('journalGoal'))}</p><div>${document.getElementById('quests')?.innerHTML || ''}</div><p>${escapeHTML(value('tip'))}</p></section>
 ${journalBadges()}${journalSeberang()}${journalSideActivities()}${journalExploration()}
 <section><small>${I18N.t('journal.habitat', { levels: escapeHTML(value('wildLevels')) })}</small><p>${escapeHTML(
   region()
     .wild.map(id => SPECIES[id].name)
     .join(', '),
 )}</p>${wild ? `<button data-world="wild">${I18N.t('wild.find')}</button>` : ''}</section>
 <section><small>${I18N.t('world.places')}</small><div class="world-places">${sites || `<p>${I18N.t('world.noPlaces')}</p>`}</div></section>
 </div>${closeButton(I18N.t('menu.resume'))}`,
    'world-info',
  );
}
