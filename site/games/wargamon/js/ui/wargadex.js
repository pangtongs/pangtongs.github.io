/* Wargadex: display order and its detail pages. */
let dexSelection = 0,
  dexTab = 'info';
// Display numbers are independent of stable species IDs used by existing saves.
const DEX_ORDER = [];
const dexAdded = new Set();
function addDexFamily(id) {
  if (dexAdded.has(id)) return;
  dexAdded.add(id);
  DEX_ORDER.push(id);
  if (EVOLUTIONS[id]) addDexFamily(EVOLUTIONS[id].to);
}
SPECIES.forEach((s, id) => {
  if (s.from === undefined) addDexFamily(id);
});
SPECIES.forEach((s, id) => addDexFamily(id));
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
  const rs = REGIONS.map((r, i) => ({ ...r, id: i })).filter(r => r.wild.includes(id));
  return `${id < 3 ? '<p>Teman awal. Pertemuan liar sangat langka.</p>' : ''}<div class="dex-habitats">${rs.map(r => `<div><b>${r.name}</b><small>Lv.${r.levels.join('-')}${!regionAvailable(r.id) ? ', Belum terbuka' : ''}</small></div>`).join('')}</div>${!rs.length ? '<p>Tidak ditemukan di habitat ini.</p>' : ''}`;
}
function dexEvolution(id) {
  const root = SPECIES[id].from ?? id,
    e = EVOLUTIONS[root],
    card = i =>
      `<button class="dex-evo-mon" data-dex="select" data-id="${i}">${art(i)}<b>${SPECIES[i].name}</b></button>`;
  return e
    ? `<div class="dex-evolution">${card(root)}<span>Lv.${e.level}<br>→</span>${card(e.to)}</div><p>${SPECIES[e.to].evolutionChange || 'Bentuk kecil berubah menjadi bentuk dewasa dengan peran baru.'}</p><p>Berevolusi sekali. Tidak ada tahap ketiga.</p>`
    : `<div class="dex-evolution">${card(id)}</div><p>${SPECIES[id].legendary ? 'Legenda ini tidak berevolusi.' : 'Tidak berevolusi. Ini bentuk akhirnya.'}</p>`;
}
