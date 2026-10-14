/* Kabar Warga of the day: one headline a day, seeded by the date like the other daily
   rotations, announces the weather or a town mishap that brings one element's wild
   Wargamon out more often. The journal and every Kabar Warga board carry it. */

// Each condition favours one element (a clear day favours none). `weight` is how often
// the condition is drawn: clear days are the most common.
const NEWS_CONDITIONS = Object.freeze([
  { key: 'cerah', type: null, weight: 3 },
  { key: 'banjir', type: 'Air', weight: 1 },
  { key: 'matilampu', type: 'Listrik', weight: 1 },
  { key: 'kemarau', type: 'Api', weight: 1 },
  { key: 'angin', type: 'Angin', weight: 1 },
  { key: 'hujan', type: 'Daun', weight: 1 },
  { key: 'longsor', type: 'Batu', weight: 1 },
  { key: 'krl', type: 'Normal', weight: 1 },
  { key: 'rongsok', type: 'Logam', weight: 1 },
]);
// A favoured element's wild creatures come this many times as often.
const NEWS_BOOST = 2.5;
function newsOfDay(day = dayNumber()) {
  const total = NEWS_CONDITIONS.reduce((n, c) => n + c.weight, 0);
  let roll = dayMix(day * 13 + 5) % total;
  for (const c of NEWS_CONDITIONS) {
    roll -= c.weight;
    if (roll < 0) return c;
  }
  return NEWS_CONDITIONS[0];
}
// Kabar lain: a second, lighter story a day from around the country.
const NEWS_STORIES = 8;
const newsStory = (day = dayNumber()) => dayMix(day * 29 + 11) % NEWS_STORIES;

// The weight a wild creature has today: the news of the day, and a kite flown well
// (minigames.js) drawing the kite Wargamon down. encounterWeights stays the base table;
// encounter() rolls on these.
function newsBoost(id, day = dayNumber()) {
  const type = newsOfDay(day).type;
  return type && SPECIES[id].types.includes(type) ? NEWS_BOOST : 1;
}
function todaysWeights(r = state.region) {
  return encounterWeights(r)
    .concat(calendarGuests(r))
    .map(v => ({ ...v, weight: v.weight * newsBoost(v.id) * kiteLureBoost(v.id, r) }));
}

const newsHeadline = (c = newsOfDay()) => I18N.t(`dailynews.${c.key}.headline`);
const newsEffect = (c = newsOfDay()) =>
  c.type ? I18N.t('dailynews.effect', { type: c.type }) : I18N.t('dailynews.effect.none');
// The journal's line, with the effect spelled out.
const journalNews = () => I18N.t('journal.news', { headline: newsHeadline(), effect: newsEffect() });
// The board: the headline, its lead, the effect and the lighter story.
function dailyNewsPanel() {
  const c = newsOfDay();
  return `<section class="news-arc daily-news"><div class="news-arc-heading"><h3>${I18N.t('dailynews.head')}</h3></div><article class="news-case"><span class="news-case-kicker">${I18N.t('dailynews.kicker')}</span><h4>${newsHeadline(c)}</h4><p>${I18N.t(`dailynews.${c.key}.lead`)}</p><strong>${newsEffect(c)}</strong></article><article class="news-case"><span class="news-case-kicker">${I18N.t('dailynews.other')}</span><p>${I18N.t(`dailynews.story.${newsStory()}`)}</p></article></section>`;
}
