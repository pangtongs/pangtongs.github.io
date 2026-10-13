/* Elements, what each is strong against, and the conditions a creature can carry. */
const ELEMENTS = {
  Api: ['Daun', 'Logam'],
  Daun: ['Air', 'Batu'],
  Air: ['Api', 'Batu'],
  Batu: ['Api', 'Listrik'],
  Logam: ['Listrik', 'Batu'],
  Listrik: ['Air', 'Angin'],
  // Wind scatters flame, so Fire has a second counter and Wind a second target.
  Angin: ['Daun', 'Api'],
  Normal: ['Angin'],
};
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
