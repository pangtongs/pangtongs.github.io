/* Elements, what each is strong against, and the conditions a creature can carry.

   ELEMENTS is the one type chart. Battles (typeMultiplier in roster.js), the ×1.6/×0.7
   label on move cards, the switch preview, the starter cards, the type page and the
   enemy AI all read it; species carry no matchup list of their own, their strengths
   and weaknesses follow from their types. An attack an element is strong against hits
   ×1.6; the reverse direction hits ×0.7; dual types multiply both.

   attacker → strong against       weak against (takes ×1.6 from)
   Api      → Daun, Logam           Air, Batu, Angin
   Daun     → Air, Batu             Api, Angin
   Air      → Api, Batu, Logam      Daun, Listrik
   Batu     → Api, Listrik, Normal  Daun, Air, Logam
   Logam    → Listrik, Batu         Api, Air
   Listrik  → Air, Angin            Batu, Logam
   Angin    → Daun, Api             Listrik, Normal
   Normal   → Angin                 Batu

   Every element beats at least one and loses to at least one, and no pair beats each
   other (tests/type-chart.cjs). */
const ELEMENTS = {
  Api: ['Daun', 'Logam'],
  Daun: ['Air', 'Batu'],
  // Water rusts metal, so Metal has a counter besides Fire.
  Air: ['Api', 'Batu', 'Logam'],
  // Everyday creatures break on stone: Normal is no longer the one type without a weakness.
  Batu: ['Api', 'Listrik', 'Normal'],
  Logam: ['Listrik', 'Batu'],
  Listrik: ['Air', 'Angin'],
  // Wind scatters flame, so Fire has a second counter and Wind a second target.
  Angin: ['Daun', 'Api'],
  Normal: ['Angin'],
};
// What one element beats, and what beats it.
const typeStrengths = type => ELEMENTS[type] || [];
const typeWeaknesses = type => Object.keys(ELEMENTS).filter(t => ELEMENTS[t].includes(type));
// The multiplier an attack of `type` deals to a body of `types` (one or two elements).
function typeMatchup(type, types) {
  let score = 0;
  for (const defending of types) {
    if (typeStrengths(type).includes(defending)) score++;
    else if (typeStrengths(defending).includes(type)) score--;
  }
  return score > 0 ? 1.6 ** score : score < 0 ? 0.7 ** -score : 1;
}
const STATUS = {
  poison: {
    name: 'Racun',
    desc: 'Kehilangan 8% HP maksimum di akhir giliran (4 giliran).',
    color: '#9c65c9',
  },
  burn: {
    name: 'Terbakar',
    desc: 'Serangan melemah 20%; kehilangan 5% HP di akhir giliran (3 giliran).',
    color: '#dc784b',
  },
  sleep: {
    name: 'Tidur',
    desc: 'Melewatkan 1 giliran, lalu bangun dan tidak bisa tertidur lagi selama 2 giliran.',
    color: '#658ab0',
  },
  paralysis: { name: 'Kesetrum', desc: '30% peluang gagal bergerak (3 giliran).', color: '#b6a436' },
  soaked: {
    name: 'Basah',
    desc: 'Serangan Listrik masuk 1,5×; serangan Api masuk 0,7× (3 giliran).',
    color: '#4f9bb7',
  },
};
const typeLabel = id => SPECIES[id].types.join(' / ');
