/* Wargadex: display order and its detail pages. */
let dexSelection = 0,
  dexTab = 'info';
// Display numbers are independent of stable species IDs used by existing saves. A family
// is numbered together, first form first. The first 80 species keep the numbers their
// portrait files carry; species added later (even a new form of an old family, such as
// Satelawar) are numbered after them, in ID order.
const DEX_NUMBERED_SPECIES = 80;
const DEX_ORDER = [];
const dexAdded = new Set();
function addDexFamily(id, limit) {
  if (dexAdded.has(id) || id >= limit) return;
  dexAdded.add(id);
  DEX_ORDER.push(id);
  if (EVOLUTIONS[id]) addDexFamily(EVOLUTIONS[id].to, limit);
}
for (const limit of [DEX_NUMBERED_SPECIES, SPECIES.length]) {
  SPECIES.forEach((s, id) => {
    if (s.from === undefined || dexAdded.has(s.from)) addDexFamily(id, limit);
  });
  SPECIES.forEach((s, id) => addDexFamily(id, limit));
}
const dexNumber = id => DEX_ORDER.indexOf(id) + 1;
function stepDex(dir) {
  const n = DEX_ORDER.indexOf(dexSelection);
  dex(DEX_ORDER[Math.max(0, Math.min(DEX_ORDER.length - 1, n + dir))], dexTab);
}
function dexHabitat(id) {
  const s = SPECIES[id];
  if (s.from !== undefined)
    return `<p>Berevolusi dari <b>${SPECIES[s.from].name}</b> pada Lv.${EVOLUTIONS[s.from]?.level}.</p>`;
  if (id === 47)
    return '<p>Observatorium Sunyi. Selesaikan Liga, lalu quest <b>Mata di Balik Kubah</b>. Satu tangkapan per perjalanan.</p>';
  if (id === 19) return '<p>Dermaga Pesisir Suaka setelah Lencana Pasang. Satu tangkapan per perjalanan.</p>';
  // Species defined ahead of the content that offers them (CHAPTER5_SPECIES, EVENT_SPECIES).
  if (s.chapter === 5) return `<p>${I18N.t('dex.habitat.chapter5')}</p>`;
  if (s.event) return `<p>${I18N.t('dex.habitat.event.' + s.event)}</p>`;
  const rs = REGIONS.map((r, i) => ({ ...r, id: i })).filter(r => r.wild.includes(id));
  return `${id < 3 ? '<p>Teman awal. Pertemuan liar sangat langka.</p>' : ''}<div class="dex-habitats">${rs.map(r => `<div><b>${r.name}</b><small>Lv.${r.levels.join('-')}${!regionAvailable(r.id) ? ', Belum terbuka' : ''}</small></div>`).join('')}</div>${!rs.length ? '<p>Tidak ditemukan di habitat ini.</p>' : ''}`;
}
function dexEvolution(id) {
  const chain = [speciesRoot(id)],
    card = i =>
      `<button class="dex-evo-mon" data-dex="select" data-id="${i}">${art(i)}<b>${SPECIES[i].name}</b></button>`;
  while (EVOLUTIONS[chain.at(-1)]) chain.push(EVOLUTIONS[chain.at(-1)].to);
  if (chain.length === 1)
    return `<div class="dex-evolution">${card(id)}</div><p>${SPECIES[id].legendary ? 'Legenda ini tidak berevolusi.' : 'Tidak berevolusi. Ini bentuk akhirnya.'}</p>`;
  const steps = chain
    .map((i, n) => (n ? `<span>Lv.${EVOLUTIONS[chain[n - 1]].level}<br>→</span>` : '') + card(i))
    .join('');
  // The change described is the step into the selected form (from a first form: its first step).
  const into = chain.indexOf(id) > 0 ? id : chain[1];
  return `<div class="dex-evolution">${steps}</div><p>${SPECIES[into].evolutionChange || 'Bentuk kecil berubah menjadi bentuk dewasa dengan peran baru.'}</p><p>${chain.length === 2 ? 'Berevolusi sekali. Tidak ada tahap ketiga.' : I18N.t('dex.evolution.twice')}</p>`;
}
