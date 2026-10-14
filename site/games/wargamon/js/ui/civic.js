// A civic decision: the choice while it is open, the receipt once it is made.
function civicMenu(key) {
  const c = CIVIC[key],
    v = civicState().choices[key];
  if (!c || state.region !== c.region || battle || locked) return;
  if (v === undefined) {
    modal(
      `<div class="portrait-head">${trainerArt(c.portrait)}<div><h2>${c.name}</h2><p>${c.speaker}</p></div></div><p>${c.body}</p><div class="decision-grid">${c.options.map((o, i) => `<section><h3>${o.name}</h3><p>${o.detail}</p><button data-over="decision" data-key="${key}" data-id="${i}" ${state.money < (o.fee || 0) ? 'disabled' : ''}>${o.name}</button></section>`).join('')}</div><p>${I18N.t('civic.savedNote')}</p>${closeButton(I18N.t('civic.thinkFirst'))}`,
      'civic',
    );
    return;
  }
  const o = c.options[v];
  const rewards = key === 'permit' ? [[v === 0 ? 'revive' : 'antidotes', 3]] : o.item ? [[o.item, 1]] : [];
  modal(
    `<h2>${I18N.t('civic.recorded')}</h2><p>${c.name}, <b>${o.name}</b></p><div class="decision-receipt"><div><span>${I18N.t('civic.paid')}</span><b>−${money(o.fee || 0)}</b></div>${o.cash ? `<div><span>${I18N.t('civic.received')}</span><b>+${money(o.cash)}</b></div>` : ''}${rewards.map(([k, n]) => `<div><span>${itemIcon(k)} ${medicineInfo(k)?.name || LEAGUE_ITEMS[k]?.name}</span><b>${I18N.t('civic.inBag', { n })}</b></div>`).join('')}<div><span>${I18N.t('civic.moneyLeft')}</span><b>${money(state.money)}</b></div></div><h3>${I18N.t('civic.whatNext')}</h3><p>${o.detail}</p><p class="menu-subtitle">${I18N.t('civic.noSecondPayment')}</p>`,
    'civic',
    `<button data-over="backbag">${I18N.t('civic.viewBag')}</button><button data-act="close">${I18N.t('common.continueJourney')}</button>`,
  );
}
// Kabar Warga: what earlier decisions now ask of the player, the record of choices, and the news desk.
function consequences() {
  const c = civicState(),
    blocks = [];
  if (c.choices.permit !== undefined && storyReached(REGION.WARGAMALL) && !c.claimed.includes('permit'))
    blocks.push(
      c.choices.permit === 0
        ? `<section><h3>${I18N.t('civic.broker.title')}</h3><p>${I18N.t('civic.broker.body')}</p><button data-over="consequence" data-key="pay">${I18N.t('civic.broker.pay')}</button><button data-over="consequence" data-key="report">${I18N.t('civic.broker.report')}</button></section>`
        : `<section><h3>${I18N.t('civic.delivery.title')}</h3><p>${I18N.t('civic.delivery.body')}</p><button data-over="consequence" data-key="delivery">${I18N.t('civic.delivery.accept')}</button></section>`,
    );
  if (c.choices.contract === 0 && !c.resolved.includes('contract'))
    blocks.push(
      `<section><h3>${I18N.t('civic.contract.polluted.title')}</h3><p>${I18N.t('civic.contract.polluted.body')}</p><button data-over="consequence" data-key="contract">${I18N.t('civic.contract.filter', { fee: money(civicRepairFee('contract')) })}</button></section>`,
    );
  if (c.choices.coast === 0 && !c.resolved.includes('coast'))
    blocks.push(
      `<section><h3>${I18N.t('civic.coast.damaged.title')}</h3><p>${I18N.t('civic.coast.damaged.body')}</p><button data-over="consequence" data-key="coast">${I18N.t('civic.coast.restore', { fee: money(civicRepairFee('coast')) })}</button></section>`,
    );
  modal(
    `<h2>${I18N.t('civic.news.title')}</h2>${blocks.join('') || `<p>${I18N.t('civic.news.empty')}</p>`}<h3>${I18N.t('civic.news.history')}</h3>${Object.entries(
      c.choices,
    )
      .map(
        ([k, v]) =>
          `<p>${CIVIC[k].name}: ${CIVIC[k].options[v].name}${c.resolved.includes(k) ? I18N.t('civic.news.restored') : ''}</p>`,
      )
      .join('')}${closeButton()}`,
    'consequences',
  );
  appendMenu(baraClues());
  const published = (c.published ??= []);
  appendMenu(
    `<section class="news-arc"><div class="news-arc-heading"><h3>${I18N.t('news.head')}</h3><span>${I18N.t('news.progress', { count: published.length })}</span></div><p>${I18N.t('news.intro')}</p><div class="news-cases">${NEWS_CASES.map(
      ({ key, region, headline, lead }) => {
        const choice = c.choices[key],
          done = published.includes(key),
          available = choice !== undefined;
        const outcome = available
          ? CIVIC[key].options[choice].name
          : storyReached(region)
            ? I18N.t('news.awaitChoice')
            : I18N.t('news.locked', { area: REGIONS[region].name });
        return `<article class="news-case"><span class="news-case-kicker">${REGIONS[region].name}</span><h4>${I18N.t(headline)}</h4><p>${I18N.t(lead)}</p><strong>${outcome}</strong>${done ? `<span class="news-published">${I18N.t('news.published')}</span>` : available ? `<button data-news="publish" data-key="${key}">${I18N.t('news.publish')}</button>` : ''}</article>`;
      },
    ).join(
      '',
    )}</div><p class="news-arc-reward">${published.length === 3 ? I18N.t('news.complete') : I18N.t('news.reward')}</p></section>`,
  );
  // Today's headline and what it brings out in the wild (daily-news.js).
  appendMenu(dailyNewsPanel());
}
// Three civic decisions: explicit trade-offs now, persistent consequences later.
// The text is in the catalog: civic.<key>.name, .body and .option.<n>.name / .detail.
const civicOption = (key, n, extra) => ({
  name: I18N.t(`civic.${key}.option.${n}.name`),
  detail: I18N.t(`civic.${key}.option.${n}.detail`),
  ...extra,
});
const civicDecision = (key, record, options) => ({
  ...record,
  name: I18N.t(`civic.${key}.name`),
  body: I18N.t(`civic.${key}.body`),
  options: options.map((extra, n) => civicOption(key, n, extra)),
});
const CIVIC = {
  contract: civicDecision('contract', { region: REGION.BENGKEL, speaker: 'Bu Lasmi', portrait: 3 }, [
    { item: 'turbine' },
    { item: 'vest' },
  ]),
  coast: civicDecision('coast', { region: REGION.PESISIR, speaker: 'Pak Tambat', portrait: 4 }, [
    { cash: 120000 },
    { fee: 20000 },
  ]),
  permit: civicDecision('permit', { region: REGION.BALAI_BETON, speaker: 'Pak Map', portrait: 7 }, [
    { fee: 50000 },
    { fee: 15000 },
  ]),
};
function civicState() {
  return (state.civic ??= { choices: {}, resolved: [], claimed: [] });
}
function civicRepairFee(key) {
  const base = { contract: 75000, coast: 60000 }[key];
  return base - (civicState().published?.includes(key) ? { contract: 20000, coast: 15000 }[key] : 0);
}
function decideCivic(key, i) {
  const c = CIVIC[key],
    s = civicState(),
    o = c?.options[i];
  if (
    modalKind !== 'civic' ||
    battle ||
    locked ||
    !o ||
    state.region !== c.region ||
    s.choices[key] !== undefined ||
    state.money < (o.fee || 0)
  )
    return false;
  s.choices[key] = i;
  state.money += (o.cash || 0) - (o.fee || 0);
  if (o.item) addItem(o.item, 1);
  if (key === 'permit') {
    if (i === 0) addItem('revive', 3);
    else addItem('antidotes', 3);
  }
  update();
  civicMenu(key);
  return true;
}
function resolveConsequence(key) {
  if (modalKind !== 'consequences' || battle || locked) return false;
  const c = civicState();
  if (['pay', 'report', 'delivery'].includes(key)) {
    if (!storyReached(REGION.WARGAMALL) || c.claimed.includes('permit') || c.choices.permit === undefined)
      return false;
    if (key === 'delivery') {
      if (c.choices.permit !== 1) return false;
      addItem('revive', 3);
    } else {
      if (c.choices.permit !== 0) return false;
      if (key === 'pay') {
        if (state.money < 40000) return false;
        state.money -= 40000;
      } else c.resolved.push('reported');
    }
    c.claimed.push('permit');
  } else {
    const fee = civicRepairFee(key);
    if (!fee || c.choices[key] !== 0 || c.resolved.includes(key) || state.money < fee) return false;
    state.money -= fee;
    c.resolved.push(key);
  }
  update();
  consequences();
  return true;
}
/* Kabar Warga follows the player's three civic decisions across cities. */
const NEWS_CASES = [
  { key: 'permit', region: REGION.BALAI_BETON, headline: 'news.permit.headline', lead: 'news.permit.lead' },
  { key: 'coast', region: REGION.PESISIR, headline: 'news.coast.headline', lead: 'news.coast.lead' },
  { key: 'contract', region: REGION.BENGKEL, headline: 'news.contract.headline', lead: 'news.contract.lead' },
];
function publishNews(key) {
  const civic = civicState();
  civic.published ??= [];
  if (
    modalKind !== 'consequences' ||
    battle ||
    locked ||
    !NEWS_CASES.some(c => c.key === key) ||
    civic.choices[key] === undefined ||
    civic.published.includes(key)
  )
    return false;
  civic.published.push(key);
  if (civic.published.length === 3 && !civic.newsReward) {
    civic.newsReward = true;
    addItem('ultraballs', 2);
    if (!has('kabar-warga')) state.quests.push('kabar-warga');
  }
  update();
  consequences();
  return true;
}
// The League records the team and the towns it left behind. The three civic
// branches remain visible here after the immediate rewards are spent.
function journeyConsequences() {
  const civic = civicState(),
    choice = civic.choices,
    resolved = civic.resolved || [],
    claimed = civic.claimed || [];
  const outcomes = [
    [
      'permit',
      choice.permit === undefined
        ? 'unvisited'
        : choice.permit === 1
          ? claimed.includes('permit')
            ? 'official'
            : 'officialPending'
          : resolved.includes('reported')
            ? 'reported'
            : claimed.includes('permit')
              ? 'paid'
              : 'brokerPending',
    ],
    [
      'coast',
      choice.coast === undefined
        ? 'unvisited'
        : choice.coast === 1
          ? 'cooperative'
          : resolved.includes('coast')
            ? 'restored'
            : 'damaged',
    ],
    [
      'contract',
      choice.contract === undefined
        ? 'unvisited'
        : choice.contract === 1
          ? 'safe'
          : resolved.includes('contract')
            ? 'filtered'
            : 'polluted',
    ],
  ];
  return `<section class="news-arc hall-consequences"><h3>${I18N.t('ending.head')}</h3><p>${I18N.t('ending.intro')}</p><div class="news-cases">${outcomes
    .map(
      ([key, result]) =>
        `<article class="news-case"><span class="news-case-kicker">${REGIONS[CIVIC[key].region].name}</span><h4>${I18N.t(`news.${key}.headline`)}</h4><p>${I18N.t(`ending.${key}.${result}`)}</p></article>`,
    )
    .join('')}</div></section>`;
}
// Each civic decision's point reads its portrait from the decision's record.
for (const [key, c] of Object.entries(CIVIC))
  bindCharacter(
    PLACES[c.region].points.find(p => p.key === 'civic' && p.id === key),
    c,
  );
