/* The Wargadex: species pages, silhouettes for the unmet, and collection gifts. */
// Collecting pays off: each milestone of owned species brings a gift, once.
const DEX_MILESTONES = [
  { at: 10, gift: { balls: 5, potions: 3 } },
  { at: 20, gift: { balls: 5, ultraballs: 2 } },
  { at: 40, gift: { ultraballs: 5, maxpotion: 3 } },
  { at: 60, gift: { ultraballs: 5, scarf: 1, vest: 1 } },
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
    whenFree(() => dexGiftDialog(at, gift));
  }
}
// A collection gift is a moment: its own dialog with what was added to the bag.
function dexGiftDialog(at, gift) {
  const rows = Object.entries(gift)
    .filter(([k]) => k !== 'collector' && k !== 'money')
    .map(([k, n]) => `<div><span>${itemIcon(k)} ${medicineInfo(k).name}</span><b>×${n}</b></div>`)
    .join('');
  modal(
    `<span class="eyebrow">WARGADEX</span><h2>${I18N.t('dex.gift.title', { n: at })}</h2><p>${I18N.t(`dex.milestone.${at}`)}</p>${rows ? `<div class="decision-receipt">${rows}</div>` : ''}<p class="story-hint">${nextDexMilestone().replace(/^ · /, '') || I18N.t('dex.gift.done')}</p>${closeButton()}`,
    'dex-gift',
  );
}
// The collector's card from the last milestone makes rare finds twice as likely.
const rareBoost = () => (state.collector ? 2 : 1) * lanternBoost();

// --- Wargadex.
// Met or owned species are known; the rest show only a silhouette.
const dexKnown = id => state.seen.includes(id) || (state.met || []).includes(id);
const dexName = id => (dexKnown(id) ? SPECIES[id].name : '???');
const dexArt = id =>
  dexKnown(id) ? art(id) : art(id).replace('class="sprite', 'class="sprite dex-silhouette');
function nextDexMilestone() {
  const next = DEX_MILESTONES.find(m => !(state.dexRewards || []).includes(m.at));
  return next ? ' · ' + I18N.t('dex.next', { n: next.at - state.seen.length }) : '';
}
// The batik palettes of this species' rare-coloured creatures you own, each named once.
function dexBatik(id) {
  const keys = [
    ...new Set(
      [...state.team, ...(state.storage || [])]
        .filter(m => m.id === id)
        .map(batikFor)
        .filter(Boolean),
    ),
  ];
  return keys.length
    ? `<p class="dex-batik">${I18N.t('dex.batik', { list: keys.map(batikName).join(', ') })}</p>`
    : '';
}
function dex(id = dexSelection, tab = dexTab) {
  if (locked || modalKind === 'starter') return;
  dexSelection = Math.max(0, Math.min(SPECIES.length - 1, Number(id) || 0));
  dexTab = ['info', 'moves', 'habitat', 'evolution'].includes(tab) ? tab : 'info';
  const s = SPECIES[dexSelection],
    start = Math.floor(DEX_ORDER.indexOf(dexSelection) / 8) * 8;
  const member = [...state.team, ...(state.storage || [])].find(m => m.id === dexSelection),
    owned = !!member,
    known = dexKnown(dexSelection);
  const galomangRender =
    dexSelection === 2
      ? `<details><summary>${I18N.t('dex.galomang.summary')}</summary><img class="render-galomang" src="img/characters/galomang-render.webp" alt="${I18N.t('dex.galomang.alt')}"><p>${I18N.t('dex.galomang.note')}</p></details>`
      : '';
  // A Wargamon not yet met keeps its secrets: a silhouette, no name and no details.
  const detail = !known
    ? `<p class="dex-unknown">${I18N.t('dex.unknown')}</p>`
    : dexTab === 'info'
      ? `${combatStats(dexSelection, member)}${galomangRender}<h3>${s.role || I18N.t('dex.roleFallback')}</h3><p>${s.desc}</p>${dexSelection === 20 ? `<p><b>${I18N.t('dex.coffeeEyes')}</b> ${I18N.t('dex.coffeeEyes.effect')}</p>` : ''}`
      : dexTab === 'moves'
        ? `<div class="dex-moves">${kit(dexSelection)
            .map(m => `<div><b>${TYPE_ICONS[m.type]} ${m.name}</b><p>${moveDescription(m)}</p></div>`)
            .join('')}</div>`
        : dexTab === 'habitat'
          ? dexHabitat(dexSelection)
          : dexEvolution(dexSelection);
  modal(
    `<div class="dex-device"><div class="dex-heading"><div><small>WARGADEX</small><h2>#${String(dexNumber(dexSelection)).padStart(3, '0')} ${dexName(dexSelection)}</h2></div><span>${I18N.t('dex.count', { owned: state.seen.length, total: SPECIES.length, met: (state.met || []).length })}${nextDexMilestone()}</span></div><label class="dex-jump">${I18N.t('dex.search')}<select data-dex="jump" aria-label="${I18N.t('ui.dex.choose')}">${DEX_ORDER.map((i, n) => `<option value="${i}" ${i === dexSelection ? 'selected' : ''}>${String(n + 1).padStart(3, '0')}, ${dexName(i)}</option>`).join('')}</select></label><div class="dex-layout"><nav class="dex-index" aria-label="${I18N.t('ui.dex.list')}">${DEX_ORDER.slice(
      start,
      start + 8,
    )
      .map(
        (id, n) =>
          `<button data-dex="select" data-id="${id}" aria-current="${id === dexSelection}"><span>${String(start + n + 1).padStart(3, '0')}</span>${dexArt(id)}<span>${dexName(id)}</span></button>`,
      )
      .join(
        '',
      )}</nav><section class="dex-detail"><div class="dex-profile">${dexArt(dexSelection)}<div><div class="dex-types">${known ? s.types.map(t => `<span>${TYPE_ICONS[t]} ${t}</span>`).join('') : '<span>?</span>'}</div><p>${owned ? '● ' + I18N.t('dex.status.owned') : state.seen.includes(dexSelection) ? '✓ ' + I18N.t('dex.status.seen') : I18N.t('dex.status.none')}${s.legendary ? I18N.t('dex.legendSuffix') : ''}</p>${dexBatik(dexSelection)}</div></div><nav class="dex-tabs" aria-label="${I18N.t('ui.dex.details')}">${[
      ['info', 'Info'],
      ['moves', I18N.t('dex.tab.moves')],
      ['habitat', 'Habitat'],
      ['evolution', I18N.t('dex.tab.evolution')],
    ]
      .map(
        ([key, label]) =>
          `<button data-dex="tab" data-tab="${key}" aria-pressed="${dexTab === key}" ${known ? '' : 'disabled'}>${label}</button>`,
      )
      .join('')}</nav><div class="dex-page" tabindex="0">${detail}</div></section></div></div>`,
    'dex',
    `<button class="action secondary" data-dex="prev" ${dexNumber(dexSelection) === 1 ? 'disabled' : ''}>${I18N.t('common.prevArrow')}</button><span>${dexNumber(dexSelection)} / ${SPECIES.length}</span><button class="action secondary" data-dex="next" ${dexNumber(dexSelection) === SPECIES.length ? 'disabled' : ''}>${I18N.t('common.nextArrow')}</button><button class="action" data-act="close">${I18N.t('common.close')}</button>`,
  );
}
