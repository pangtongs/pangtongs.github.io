/* Curiosity pays: hidden finds in quiet corners, and a rare guest in one habitat a day. */

// --- Hidden finds. Nothing marks them on the map: a faint sparkle shows only when the
// player stands a few steps away, and E picks the find up. Some lie where only a teammate
// of the right type can reach: a Batu type shifts a fallen rock, an Air type fetches from
// the water, a Daun type parts a thicket, a Listrik type wakes a dead lock. Each is taken
// once per save; the journal counts them per region without saying where they are.
const HIDDEN_FINDS = [
  // Sukamaju: behind the Pos RT flowerbed, the far corner of the futsal field.
  { id: 'sukamaju-posrt', region: REGION.SUKAMAJU, x: 850, y: 180, item: 'balls', n: 3 },
  { id: 'sukamaju-futsal', region: REGION.SUKAMAJU, x: 910, y: 550, item: 'potions', n: 3 },
  // Padang Ojek: under the north-east trees, in the waterfall's stream, the paddy path's end.
  { id: 'ojek-thicket', region: REGION.PADANG_OJEK, x: 740, y: 110, item: 'revive', n: 1 },
  { id: 'ojek-stream', region: REGION.PADANG_OJEK, x: 350, y: 160, item: 'ultraballs', n: 1, needs: 'Air' },
  { id: 'ojek-paddy', region: REGION.PADANG_OJEK, x: 120, y: 510, item: 'balls', n: 4 },
  // Pasar Rakyat: the end of the pier, the quay corner past the bins.
  { id: 'pasar-pier', region: REGION.PASAR_RAKYAT, x: 700, y: 130, item: 'maxpotion', n: 1 },
  { id: 'pasar-quay', region: REGION.PASAR_RAKYAT, x: 820, y: 370, item: 'balls', n: 5 },
  // Balai Beton: between the east cannon and the planter, the shaded pavement across the road.
  { id: 'beton-cannon', region: REGION.BALAI_BETON, x: 470, y: 520, item: 'ultraballs', n: 1 },
  { id: 'beton-pavement', region: REGION.BALAI_BETON, x: 750, y: 190, item: 'revive', n: 2 },
  // Festival Arus: a dead equipment case behind the stage speakers, the west tree line.
  {
    id: 'festival-speakers',
    region: REGION.FESTIVAL,
    x: 480,
    y: 200,
    item: 'lunchbox',
    n: 1,
    needs: 'Listrik',
  },
  { id: 'festival-trees', region: REGION.FESTIVAL, x: 100, y: 210, item: 'ultraballs', n: 2 },
  // Pesisir Suaka: between the moored boats, the east pier's end, the harbour's corner.
  { id: 'pesisir-boats', region: REGION.PESISIR, x: 210, y: 340, item: 'umbrella', n: 1, needs: 'Air' },
  { id: 'pesisir-pier', region: REGION.PESISIR, x: 710, y: 350, item: 'maxpotion', n: 2 },
  { id: 'pesisir-corner', region: REGION.PESISIR, x: 110, y: 80, item: 'ultraballs', n: 2 },
  // Puncak Sinyal: the rockfall at the old trail's end, the north-east fence.
  { id: 'puncak-rockfall', region: REGION.PUNCAK, x: 130, y: 150, item: 'vest', n: 1, needs: 'Batu' },
  { id: 'puncak-fence', region: REGION.PUNCAK, x: 610, y: 80, item: 'revive', n: 3 },
  // Stasiun Sela: under the platform roof, behind the lamp by the south hedge.
  { id: 'stasiun-shelter', region: REGION.STASIUN, x: 310, y: 240, item: 'scarf', n: 1 },
  { id: 'stasiun-hedge', region: REGION.STASIUN, x: 670, y: 550, item: 'ultraballs', n: 3 },
  // Wargamall: beside the coffee shop's tree, the canal wall in the north-east corner.
  { id: 'mall-kopi', region: REGION.WARGAMALL, x: 500, y: 470, item: 'maxpotion', n: 2 },
  { id: 'mall-canal', region: REGION.WARGAMALL, x: 920, y: 90, item: 'sambal', n: 1, needs: 'Air' },
  // Kampung Bengkel: inside the west hedge, by the lamp under the big tree.
  { id: 'bengkel-hedge', region: REGION.BENGKEL, x: 70, y: 380, item: 'coil', n: 1, needs: 'Daun' },
  { id: 'bengkel-lamp', region: REGION.BENGKEL, x: 260, y: 420, item: 'ultraballs', n: 2 },
  // Taman Waduk: under the north bridge, the plaza's east edge by the rocks.
  { id: 'waduk-bridge', region: REGION.WADUK, x: 380, y: 100, item: 'rescue', n: 1, needs: 'Air' },
  { id: 'waduk-rocks', region: REGION.WADUK, x: 750, y: 340, item: 'revive', n: 3 },
  // Jalur Kaldera: the rockfall closing the west trail, among the boulders to the south.
  { id: 'kaldera-rockfall', region: REGION.KALDERA, x: 60, y: 380, item: 'capacitor', n: 1, needs: 'Batu' },
  { id: 'kaldera-boulders', region: REGION.KALDERA, x: 510, y: 540, item: 'maxpotion', n: 3 },
  // Observatorium Sunyi: the stream below the north-west bridge, behind the east lamps.
  {
    id: 'observatorium-stream',
    region: REGION.OBSERVATORIUM,
    x: 110,
    y: 100,
    item: 'medkit',
    n: 1,
    needs: 'Air',
  },
  { id: 'observatorium-lamps', region: REGION.OBSERVATORIUM, x: 880, y: 280, item: 'ultraballs', n: 3 },
  // Liga Nusantara: behind the north-east fountain, the forest trail's lower bend.
  { id: 'liga-fountain', region: REGION.LIGA, x: 850, y: 310, item: 'ultraballs', n: 4 },
  { id: 'liga-trail', region: REGION.LIGA, x: 120, y: 570, item: 'maxpotion', n: 3 },
];
// How close the player must stand to see the sparkle, and to pick the find up.
const FIND_SPARKLE = 60,
  FIND_REACH = 28;
const findTaken = f => (state.finds ??= []).includes(f.id);
const regionFinds = (r = state.region) => HIDDEN_FINDS.filter(f => f.region === r);
// The unclaimed find the player stands on, outdoors in the current region.
function findUnderfoot(reach = FIND_REACH) {
  if (state.room || !state.team.length) return null;
  return regionFinds().find(f => !findTaken(f) && Math.hypot(state.x - f.x, state.y - f.y) <= reach) || null;
}
// E on a find: the item joins the bag, or the spot says which type could reach it.
// Returns true when a find was there, so the press does nothing else.
function pickUpFind() {
  if (busy()) return false;
  const f = findUnderfoot();
  if (!f) return false;
  const helper = f.needs && state.team.find(m => m.hp > 0 && SPECIES[m.id].types.includes(f.needs));
  if (f.needs && !helper) {
    modal(
      `<h2>${I18N.t('find.title')}</h2><p>${I18N.t(`find.needs.${f.needs}`)}</p>${closeButton()}`,
      'find',
    );
    return true;
  }
  state.finds.push(f.id);
  addItem(f.item, f.n);
  update();
  save();
  const item = medicineInfo(f.item).name,
    body = helper
      ? I18N.t(`find.helped.${f.needs}`, { name: tr(SPECIES[helper.id].name), item, n: f.n })
      : I18N.t('find.found', { item, n: f.n });
  const left = regionFinds().filter(g => !findTaken(g)).length;
  modal(
    `<h2>${I18N.t('find.title')}</h2><div class="decision-receipt"><div><span>${itemIcon(f.item)} ${item}</span><b>×${f.n}</b></div></div><p>${body}</p><p class="story-hint">${I18N.t(left ? 'find.more' : 'find.allHere')}</p>${closeButton()}`,
    'find',
  );
  return true;
}
// A faint sparkle over a nearby find, drawn in the region's own coordinates.
function paintFindSparkle(i, t) {
  if (i !== state.region || state.room || !state.team.length) return;
  for (const f of regionFinds(i)) {
    const d = Math.hypot(state.x - f.x, state.y - f.y);
    if (findTaken(f) || d > FIND_SPARKLE) continue;
    const pulse = (Math.sin(t / 260 + f.x) + 1) / 2,
      size = 2 + Math.round(pulse * 3);
    ctx.save();
    ctx.globalAlpha = (0.35 + 0.55 * pulse) * Math.min(1, (FIND_SPARKLE - d) / 20);
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(f.x - 1, f.y - 8 - size, 2, size * 2 + 2);
    ctx.fillRect(f.x - size - 1, f.y - 8, size * 2 + 2, 2);
    ctx.restore();
  }
}
// The journal's count: found here and in all, never where.
function findCounts(r = state.region) {
  const here = regionFinds(r);
  return {
    found: here.filter(findTaken).length,
    total: here.length,
    all: HIDDEN_FINDS.filter(findTaken).length,
    allTotal: HIDDEN_FINDS.length,
  };
}

// --- The habitat of the day. Each day one region's habitats host a rare guest: the
// signature creature of another region in the same chapter, seeded by the date like the
// other daily rotations, so everyone playing that day finds the same visitor.
const dayMix = n => {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};
const DAILY_GUEST_WEIGHT = 4;
function dailyGuest(day = dayNumber()) {
  const regions = REGIONS.map((_, i) => i).filter(i => REGIONS[i].wild.length),
    region = regions[dayMix(day) % regions.length],
    visitor = i =>
      i !== region && REGIONS[i].signature != null && !REGIONS[region].wild.includes(REGIONS[i].signature),
    near = regions.filter(i => visitor(i) && chapterOf(i) === chapterOf(region)),
    pool = (near.length ? near : regions.filter(visitor)).map(i => REGIONS[i].signature);
  return { region, id: pool[dayMix(day * 31 + 7) % pool.length] };
}
// The guest as an encounter weight, for the region hosting it today.
function dailyGuests(r = state.region) {
  const g = dailyGuest();
  return g.region === r ? [{ id: g.id, weight: DAILY_GUEST_WEIGHT, guest: true }] : [];
}

// Habitats with their own species list (water by a pier, grass on the quay) only take a
// guest that shares an element with someone on that list. When no habitat in the region
// would, every habitat does, so the journal's promise of a guest still holds.
function guestHabitat(habitat, id) {
  const fits = h =>
    !h?.species || h.species.some(s => SPECIES[s].types.some(t => SPECIES[id].types.includes(t)));
  return fits(habitat) || !spots().some(p => p.key === 'wild' && fits(p));
}

// The journal's exploration section: finds counted, and where today's guest is.
function journalExploration() {
  const c = findCounts(),
    g = dailyGuest(),
    rows = [
      c.total
        ? I18N.t('journal.finds.here', { region: tr(REGIONS[state.region].name), ...c })
        : I18N.t('journal.finds.all', c),
      regionAvailable(g.region)
        ? I18N.t('journal.rareGuest', { region: tr(REGIONS[g.region].name) })
        : I18N.t('journal.rareGuest.locked'),
      // Kabar Warga's condition of the day (daily-news.js).
      journalNews(),
    ];
  return `<section><small>${I18N.t('journal.explore')}</small><ul class="side-list">${rows.map(r => `<li>${r}</li>`).join('')}</ul></section>`;
}
