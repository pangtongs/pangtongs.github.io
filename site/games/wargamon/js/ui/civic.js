// A civic decision: the choice while it is open, the receipt once it is made.
function civicMenu(key) {
  const c = CIVIC[key],
    v = civicState().choices[key];
  if (!c || state.region !== c.region || battle || locked) return;
  if (v === undefined) {
    modal(
      `<div class="portrait-head">${trainerArt(c.portrait)}<div><h2>${c.name}</h2><p>${c.speaker}</p></div></div><p>${c.body}</p><div class="decision-grid">${c.options.map((o, i) => `<section><h3>${o.name}</h3><p>${o.detail}</p><button data-over="decision" data-key="${key}" data-id="${i}" ${state.money < (o.fee || 0) ? 'disabled' : ''}>${o.name}</button></section>`).join('')}</div><p>Pilihan disimpan dan akan dibicarakan lagi di wilayah berikutnya.</p>${closeButton('Pikirkan dulu')}`,
      'civic',
    );
    return;
  }
  const o = c.options[v];
  const rewards = key === 'permit' ? [[v === 0 ? 'revive' : 'antidotes', 3]] : o.item ? [[o.item, 1]] : [];
  modal(
    `<h2>Keputusan tercatat</h2><p>${c.name}, <b>${o.name}</b></p><div class="decision-receipt"><div><span>Dibayar</span><b>−${money(o.fee || 0)}</b></div>${o.cash ? `<div><span>Diterima</span><b>+${money(o.cash)}</b></div>` : ''}${rewards.map(([k, n]) => `<div><span>${itemIcon(k)} ${medicineInfo(k)?.name || LEAGUE_ITEMS[k]?.name}</span><b>+${n} di tas</b></div>`).join('')}<div><span>Sisa uang</span><b>${money(state.money)}</b></div></div><h3>Yang terjadi selanjutnya</h3><p>${o.detail}</p><p class="menu-subtitle">Keputusan ini sudah tersimpan. Tidak ada pembayaran kedua di sini.</p>`,
    'civic',
    `<button data-over="backbag">Lihat tas</button><button data-act="close">Lanjut perjalanan</button>`,
  );
}
// Kabar Warga: what earlier decisions now ask of the player, the record of choices, and the news desk.
function consequences() {
  const c = civicState(),
    blocks = [];
  if (c.choices.permit !== undefined && state.region >= 9 && !c.claimed.includes('permit'))
    blocks.push(
      c.choices.permit === 0
        ? '<section><h3>Calo datang lagi</h3><p>Obatmu tiba cepat, tetapi Pak Map sekarang meminta Rp40.000. Bayar agar kiosnya terus melayanimu, atau laporkan dan belanja di koperasi.</p><button data-over="consequence" data-key="pay">Bayar Rp40.000</button><button data-over="consequence" data-key="report">Laporkan, kios calo tutup</button></section>'
        : '<section><h3>Kiriman susulan tiba</h3><p>Pedagang melewati satu malam tanpa obat. Koperasi sekarang menyerahkan tiga Balsem Sadar; loket resmi tetap terbuka.</p><button data-over="consequence" data-key="delivery">Terima kiriman</button></section>',
    );
  if (c.choices.contract === 0 && !c.resolved.includes('contract'))
    blocks.push(
      `<section><h3>Waduk tercemar</h3><p>Sejumlah Belutara mati setelah limpasan pabrik. Habitat mereka hilang. Teknisi bisa memasang penyaring; dinamo tetap milikmu.</p><button data-over="consequence" data-key="contract">Pasang penyaring, ${money(civicRepairFee('contract'))}</button></section>`,
    );
  if (c.choices.coast === 0 && !c.resolved.includes('coast'))
    blocks.push(
      `<section><h3>Teluk sepi</h3><p>Dermaga baru membantu nelayan, tetapi menutup tempat bertelur. Buat jalur pemulihan agar Rajapari kembali.</p><button data-over="consequence" data-key="coast">Pulihkan teluk, ${money(civicRepairFee('coast'))}</button></section>`,
    );
  modal(
    `<h2>Kabar Warga</h2>${blocks.join('') || '<p>Belum ada urusan yang menunggu. Keputusan di pesisir, Balai Beton, dan bengkel akan kembali di sini.</p>'}<h3>Jejak keputusan</h3>${Object.entries(
      c.choices,
    )
      .map(
        ([k, v]) =>
          `<p>${CIVIC[k].name}: ${CIVIC[k].options[v].name}${c.resolved.includes(k) ? ', dampak dipulihkan' : ''}</p>`,
      )
      .join('')}${closeButton()}`,
    'consequences',
  );
  const published = (c.published ??= []);
  appendMenu(
    `<section class="news-arc"><div class="news-arc-heading"><h3>${I18N.t('news.head')}</h3><span>${I18N.t('news.progress', { count: published.length })}</span></div><p>${I18N.t('news.intro')}</p><div class="news-cases">${NEWS_CASES.map(
      ({ key, region, headline, lead }) => {
        const choice = c.choices[key],
          done = published.includes(key),
          available = choice !== undefined;
        const outcome = available
          ? CIVIC[key].options[choice].name
          : state.region >= region
            ? I18N.t('news.awaitChoice')
            : I18N.t('news.locked', { area: REGIONS[region].name });
        return `<article class="news-case"><span class="news-case-kicker">${REGIONS[region].name}</span><h4>${I18N.t(headline)}</h4><p>${I18N.t(lead)}</p><strong>${outcome}</strong>${done ? `<span class="news-published">${I18N.t('news.published')}</span>` : available ? `<button data-news="publish" data-key="${key}">${I18N.t('news.publish')}</button>` : ''}</article>`;
      },
    ).join(
      '',
    )}</div><p class="news-arc-reward">${published.length === 3 ? I18N.t('news.complete') : I18N.t('news.reward')}</p></section>`,
  );
}
// Three civic decisions: explicit trade-offs now, persistent consequences later.
const CIVIC = {
  contract: {
    region: 10,
    name: 'Kontrak Bengkel',
    speaker: 'Bu Lasmi',
    portrait: 3,
    body: 'Pabrik menawarkan pekerjaan dan dinamo. Saluran pembuangannya belum siap. Menunda kontrak menjaga waduk, tetapi bengkel kehilangan pesanan bulan ini.',
    options: [
      {
        name: 'Terima kontrak',
        detail:
          'Dinamo Industri: jurus Listrik +20%. Limbah menghilangkan habitat Belutara di waduk; pemulihan habitat nanti Rp75.000.',
        item: 'turbine',
      },
      {
        name: 'Tunda sampai aman',
        detail: 'Dapat Rompi Pelindung. Habitat tetap hidup; tidak mendapat Dinamo Industri.',
        item: 'vest',
      },
    ],
  },
  coast: {
    region: 6,
    name: 'Dermaga untuk Siapa?',
    speaker: 'Pak Tambat',
    portrait: 4,
    body: 'Investor membayar dermaga baru agar nelayan tidak kehilangan hasil tangkapan. Jalurnya melewati tempat bertelur Rajapari. Koperasi bisa membangun jalur kecil tanpa menutup habitat, tetapi perlu iuran.',
    options: [
      {
        name: 'Dermaga ekspres',
        detail:
          'Terima Rp120.000. Tangkapan liar pesisir lebih jarang dan Rajapari menunggu sampai kamu membayar restorasi Rp60.000.',
        cash: 120000,
      },
      {
        name: 'Jalur koperasi',
        detail: 'Bayar Rp20.000. Habitat tetap utuh, Rajapari tetap dapat ditemui setelah lencana.',
        fee: 20000,
      },
    ],
  },
  permit: {
    region: 4,
    name: 'Tarif Resmi, Jalur Belakang',
    speaker: 'Pak Map',
    portrait: 7,
    body: '“Tarif resmi izin kios Rp15.000. Kalau butuh hari ini, uang pelicin Rp50.000, tanpa kuitansi.” Pedagang menunggu obat. Membayar mempercepat kiriman, tetapi calo akan kembali menagih. Melapor membuat kiriman tertunda.',
    options: [
      {
        name: 'Bayar uang pelicin',
        detail: 'Rp50.000: kiriman tiba, dapat 3 Balsem Sadar. Di Wargamall calo meminta Rp40.000 lagi.',
        fee: 50000,
      },
      {
        name: 'Urus resmi & laporkan',
        detail:
          'Rp15.000: dapat 3 Penawar. Di Wargamall koperasi memberi 3 Balsem Sadar setelah kiriman susulan tiba.',
        fee: 15000,
      },
    ],
  },
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
    if (state.region < 9 || c.claimed.includes('permit') || c.choices.permit === undefined) return false;
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
  { key: 'permit', region: 4, headline: 'news.permit.headline', lead: 'news.permit.lead' },
  { key: 'coast', region: 6, headline: 'news.coast.headline', lead: 'news.coast.lead' },
  { key: 'contract', region: 10, headline: 'news.contract.headline', lead: 'news.contract.lead' },
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
