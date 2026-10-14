/* One Warga universe: Wargamon and Warga Tactics are served from the same site
   (…/games/wargamon and …/games/warga-tactics), so they share localStorage. Each game
   leaves its milestones under one key and reads the other's. Full description:
   docs/warga-universe-link.md (the same text is in Warga Tactics' src/ui/universe.ts).

   localStorage['warga-universe-v1'] = {
     "v": 1,
     "wargamon": { "at": ISO time, "milestones": { "champion": true, "seberang": true,
                   "elangkasa": true }, "partner": { "name", "type", "level" } },
     "tactics":  { "at": ISO time, "milestones": { "firstWin": true, "finale": true } }
   }

   - Each game writes only its own section and keeps everything else as it found it.
   - A milestone counts only when it is exactly `true` and its name is known; anything
     else (missing key, broken JSON, wrong types) reads as "not yet". Nothing is taken away
     once unlocked: the unlock is recorded in this game's own save.
   - A breaking change gets a new key (warga-universe-v2), never a new meaning for v1. */
const UNIVERSE_KEY = 'warga-universe-v1',
  WARGA_TACTICS_URL = '../warga-tactics/';
// What Warga Tactics' milestones unlock here, as a quest key in this save.
const TACTICS_UNLOCKS = [
  // Winning a first story battle in Kota Sagara: a Barisan Bara defector sails to Teluk Pinisi.
  { milestone: 'firstWin', quest: 'warga-tactics' },
  // Finishing Serikat Lentera's campaign: Pak Darto passes on the union's thanks.
  { milestone: 'finale', quest: 'warga-tactics-finale', ultraballs: 3 },
];
function readUniverse() {
  try {
    const data = JSON.parse(localStorage.getItem(UNIVERSE_KEY));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
// The other game's milestones that are exactly true.
function tacticsMilestones(data = readUniverse()) {
  const m = data.tactics?.milestones;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return [];
  return TACTICS_UNLOCKS.map(u => u.milestone).filter(name => m[name] === true);
}
function wargamonMilestones() {
  const out = {};
  if (has('champion')) out.champion = true;
  if (has('seberang')) out.seberang = true;
  if (typeof ownsElangkasa === 'function' && ownsElangkasa()) out.elangkasa = true;
  return out;
}
// The lead creature, so the other game can name the ally it sends.
function universePartner() {
  const m = state.team?.[0];
  return m && SPECIES[m.id]
    ? { name: SPECIES[m.id].name, type: SPECIES[m.id].type, level: Math.max(1, Math.min(100, m.level | 0)) }
    : null;
}
// Applies what the other game unlocked, then writes this game's section when it changed.
// Returns the unlocks that were new.
function syncUniverse() {
  if (!state?.team?.length) return [];
  const data = readUniverse(),
    found = tacticsMilestones(data),
    fresh = [];
  for (const u of TACTICS_UNLOCKS)
    if (found.includes(u.milestone) && !has(u.quest)) {
      state.quests.push(u.quest);
      if (u.ultraballs) addItem('ultraballs', u.ultraballs);
      fresh.push(u);
    }
  if (fresh.length) {
    update();
    toast(I18N.t(`universe.unlock.${fresh.at(-1).milestone}`));
  }
  const milestones = wargamonMilestones(),
    partner = universePartner(),
    mine = data.wargamon && typeof data.wargamon === 'object' ? data.wargamon : {};
  if (
    JSON.stringify(mine.milestones || {}) !== JSON.stringify(milestones) ||
    JSON.stringify(mine.partner ?? null) !== JSON.stringify(partner)
  )
    try {
      localStorage.setItem(
        UNIVERSE_KEY,
        JSON.stringify({ ...data, v: 1, wargamon: { at: new Date().toISOString(), milestones, partner } }),
      );
    } catch {}
  return fresh;
}
// Pak Darto's news from Kota Sagara: what the other game says about the union there.
function universeNewsHtml() {
  const found = tacticsMilestones(),
    lines = found.length
      ? found.map(name => I18N.t(`universe.news.${name}`))
      : [I18N.t('universe.news.none')];
  return `<section class="news-arc universe-news"><h3>${I18N.t('universe.news.title')}</h3>${lines.map(line => `<p>${line}</p>`).join('')}</section>`;
}
setInterval(() => {
  if (!document.hidden) syncUniverse();
}, 5000);
// The other game may have been played in another tab.
if (typeof addEventListener === 'function')
  addEventListener('storage', event => {
    if (event?.key === UNIVERSE_KEY) syncUniverse();
  });
