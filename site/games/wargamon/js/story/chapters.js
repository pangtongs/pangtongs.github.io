/* New story progression, persistent world puzzles, legendary encounters and a path follower. */
for (const name of [
  'img/maps/interior/chapter-interiors.webp',
  ...['warungcity', 'gym', 'stage', 'mallatrium'].map(key => ROOMS[key].image),
]) {
  const im = new Image();
  im.src = name;
  images[name] = im;
}
function chapterState() {
  state.puzzles ??= {};
  state.legendCaught ??= [];
  return state.puzzles;
}
function awardQuest(key) {
  if (has(key)) return false;
  state.quests.push(key);
  state.balls += 3;
  state.potions += 3;
  update();
  return true;
}
// A completed first arena remains sufficient for old saves to open the expansion.
function ending() {
  modal(
    `<span class="eyebrow">LENCANA BETON, BAB KERAMAIAN BERLANJUT</span><h2>Lencana Beton milikmu!</h2><p>${TRAINERS[17].name} menyerahkan undangan: “Festival di selatan balai sedang mati listrik. Kru panggung butuh bantuan.”</p><p>Lanjutkan ke Festival Arus, lalu selesaikan kiriman kuliner Wargamall. Setelah bab ini selesai, dermaga Pasar Rakyat menghubungkan perjalanan ke Pesisir Suaka.</p><div class="actions"><button class="action" data-chapter="depart">Ke Festival Arus</button>${closeButton('Siapkan tim dulu')}</div>`,
    'ending',
  );
}
function puzzleAllowed(r) {
  return REGIONS[r].required.slice(0, 2).every(id => state.defeated.includes(id));
}
function puzzleGate(r) {
  if (puzzleAllowed(r)) return true;
  deviceGateScene(
    REGIONS[r].required.slice(0, 2).find(id => !state.defeated.includes(id)),
    r,
  );
  return false;
}
// Lights Out: each breaker flips itself and its orthogonal neighbours. Seed is solvable.
function flipPower(board, i) {
  for (const n of [i, i - 3, i + 3, ...(i % 3 ? [i - 1] : []), ...(i % 3 < 2 ? [i + 1] : [])])
    if (n >= 0 && n < 9) board[n] = !board[n];
  return board;
}
function newPower() {
  const board = Array(9).fill(true);
  [0, 4, 8].forEach(i => flipPower(board, i));
  return { board, moves: 0 };
}
function powerMenu() {
  const p = (chapterState().power ??= newPower()),
    done = has('circuit');
  modal(
    `<span class="eyebrow">FESTIVAL ARUS, PANEL PANGGUNG</span><h2>${done ? 'Sembilan lampu menyala!' : 'Nyalakan semua lampu'}</h2><p>${done ? 'Aliran listrik pulih. Panggung aman untuk pertunjukan.' : 'Tekan satu sakelar untuk membalik lampunya dan lampu tepat di atas, bawah, kiri, kanan. Semua <b>9 lampu harus ON</b> agar panggung aman.'}</p><div class="power-grid">${p.board.map((on, i) => (done ? `<div class="power-result lit">${i + 1}<small>ON</small></div>` : `<button data-chapter="power" data-id="${i}" class="${on ? 'lit' : ''}" aria-pressed="${on}">${i + 1}<small>${on ? 'ON' : 'OFF'}</small></button>`)).join('')}</div><p class="${done ? 'activity-complete' : ''}" role="status">${done ? trainerText('story.power.ready', '{trainer26} siap di panggung. Bonus 3 kapsul + 3 jamu diterima.', { trainer26: 26 }) : `${p.board.filter(Boolean).length}/9 menyala, ${p.moves} tekanan. Progres tersimpan saat panel ditutup.`}</p>${done ? '' : `<details><summary>Catatan teknisi / bantuan</summary><p>Dari posisi awal: tekan 1, lalu 5, lalu 9. Jika sudah berubah, reset dahulu. Tidak ada hukuman untuk mencoba.</p></details><div class="actions"><button class="action secondary" data-chapter="powerreset">Reset panel</button></div>`}${closeButton()}`,
    'power',
  );
}
function pressPower(i) {
  if (has('circuit') || !Number.isInteger(i) || i < 0 || i > 8) return;
  const p = (chapterState().power ??= newPower());
  flipPower(p.board, i);
  p.moves++;
  if (p.board.every(Boolean)) awardQuest('circuit');
  update();
  powerMenu();
}
// Conserved water: six units must be split by the sluices, never manufactured by a button.
function tideT(key, fallback, params = {}) {
  return typeof I18N === 'undefined'
    ? fallback.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
    : I18N.t(key, params);
}
const TIDE_ROUNDS = [
  {
    start: [0, 4, 2],
    target: [2, 1, 3],
    clue: 'Mangrove perlu satu unit lebih banyak dari bak penelitian. Karang perlu satu unit lebih banyak dari mangrove.',
  },
  {
    start: [3, 0, 3],
    target: [1, 3, 2],
    clue: 'Bak penelitian perlu paling banyak. Karang perlu satu unit lebih sedikit dari bak; mangrove satu unit lebih sedikit dari karang.',
  },
  {
    start: [1, 4, 1],
    target: [3, 2, 1],
    clue: 'Mangrove perlu paling banyak. Bak penelitian perlu satu unit lebih sedikit; karang satu unit lebih sedikit lagi.',
  },
];
function valveState() {
  const p = (chapterState().valves ??= {});
  if (!Number.isInteger(p.round)) {
    p.round = 0;
    p.flow = TIDE_ROUNDS[0].start.slice();
    p.feedback = '';
  }
  return p;
}
function valveMenu() {
  const p = valveState(),
    done = has('tides'),
    round = TIDE_ROUNDS[Math.min(p.round, 2)],
    names = ['Mangrove', 'Bak penelitian', 'Karang'];
  const clue = tideT(`tide.clue.${p.round}`, round.clue);
  const intro = done
    ? tideT('tide.doneIntro', 'Sensor menyala di semua saluran.')
    : tideT(
        'tide.intro',
        'Uji {round} dari 3. Pompa mengalirkan tepat 6 unit. Pindahkan air antar saluran, lalu uji sensor. {clue}',
        { round: p.round + 1, clue },
      );
  const feedback = done
    ? tideT('tide.done', 'Sensor stabil. {trainer} siap bertanding. Bonus 3 kapsul + 3 jamu diterima.', {
        trainer: trainerName(29),
      })
    : p.feedback || tideT('tide.hint', 'Setiap tombol memindahkan satu unit; total air tetap enam.');
  modal(
    `<span class="eyebrow">PESISIR SUAKA, KONSOL KATUP</span><h2>${done ? tideT('tide.titleDone', 'Arus suaka seimbang') : tideT('tide.title', 'Alihkan air ke tiga saluran')}</h2><p>${intro}</p><div class="reservoir">${tideT('tide.total', 'Total aliran: {flow} / 6 unit', { flow: p.flow.reduce((a, b) => a + b, 0) })}</div><div class="sluices">${names.map((n, i) => `<div><b>${tideT(`tide.channel.${i}`, n)}</b><div class="flow-meter" aria-label="${n}: ${p.flow[i]} unit">${Array.from({ length: 6 }, (_, j) => `<i class="${j < p.flow[i] ? 'filled' : ''}"></i>`).join('')}</div><p>${tideT('tide.amount', '{flow} unit', { flow: p.flow[i] })}</p>${done ? '' : names.map((dest, j) => (i === j ? '' : `<button data-chapter="valve" data-id="${i}" data-delta="${j}" ${p.flow[i] === 0 ? 'disabled' : ''}>${tideT('tide.send', 'Ke {name}', { name: tideT(`tide.channel.${j}`, dest) })}</button>`)).join(' ')}</div>`).join('')}</div><p role="status" class="${done ? 'activity-complete' : ''}">${feedback}</p>${done ? '' : `<button class="action" data-chapter="valvetest">${tideT('tide.test', 'Uji sensor')}</button>`}${closeButton()}`,
    'valves',
  );
}
function turnValve(from, to) {
  if (has('tides') || ![0, 1, 2].includes(from) || ![0, 1, 2].includes(to) || from === to) return;
  const p = valveState();
  if (!p.flow[from]) return;
  p.flow[from]--;
  p.flow[to]++;
  p.feedback = '';
  update();
  valveMenu();
}
function testValves() {
  if (has('tides')) return;
  const p = valveState(),
    target = TIDE_ROUNDS[p.round].target;
  if (p.flow.every((value, i) => value === target[i])) {
    p.round++;
    if (p.round === TIDE_ROUNDS.length) {
      awardQuest('tides');
      p.feedback = '';
    } else {
      p.flow = TIDE_ROUNDS[p.round].start.slice();
      p.feedback = tideT('tide.next', 'Sensor stabil. Arus berubah; atur pembagian berikutnya.');
    }
  } else
    p.feedback = tideT(
      'tide.retry',
      'Sensor belum stabil. Periksa selisih aliran sesuai petunjuk, lalu coba lagi.',
    );
  update();
  valveMenu();
}
const SIGNAL_PATTERNS = [
  [0, 2, 1],
  [3, 0, 2, 1],
  [1, 3, 2, 0, 1],
];
const SIGNAL_NAMES = ['Utara', 'Timur', 'Selatan', 'Barat'];
function signalMenu() {
  const p = (chapterState().signals ??= { round: 0, input: [], revealed: true });
  if (has('orbit')) {
    modal(
      `<h2>Teleskop terkalibrasi!</h2><p>Tiga pola tersambung ke satelit cuaca. Bachar Hitung siap menerima tantangan final. Bonus 3 kapsul + 3 jamu diterima.</p>${closeButton()}`,
      'signals',
    );
    return;
  }
  const seq = SIGNAL_PATTERNS[p.round];
  modal(
    `<span class="eyebrow">PUNCAK SINYAL, KALIBRASI ${p.round + 1}/3</span><h2>Ikuti pulsa satelit</h2><p>Amati arah sinyal, tekan <b>Mulai input</b>, lalu ulangi urutannya. Tidak ada batas waktu. Salah satu arah? Hanya putaran ini yang diulang.</p><div class="signal-sequence" role="status">${p.revealed ? seq.map((n, i) => `<span>${i + 1}. ${SIGNAL_NAMES[n]}</span>`).join('') : `${p.input.length}/${seq.length} pulsa dimasukkan`}</div><div class="signal-controls">${SIGNAL_NAMES.map((n, i) => `<button data-chapter="signal" data-id="${i}" ${p.revealed ? 'disabled' : ''}>${n}</button>`).join('')}</div><div class="actions"><button class="action" data-chapter="signalstart">${p.revealed ? 'Mulai input' : 'Lihat pola lagi'}</button>${closeButton('Simpan & tutup')}</div>`,
    'signals',
  );
}
function pressSignal(i) {
  const p = chapterState().signals;
  if (!p || has('orbit') || p.revealed || ![0, 1, 2, 3].includes(i)) return;
  if (SIGNAL_PATTERNS[p.round][p.input.length] !== i) {
    p.input = [];
    p.revealed = true;
    toast('Arah belum cocok. Amati lagi; putaran sebelumnya tetap aman.');
  } else {
    p.input.push(i);
    beep(300 + i * 130);
    if (p.input.length === SIGNAL_PATTERNS[p.round].length) {
      p.round++;
      p.input = [];
      p.revealed = true;
      if (p.round === 3) awardQuest('orbit');
    }
  }
  update();
  signalMenu();
}
function legendMenu(id) {
  chapterState();
  const legendary = SPECIES[id].legendary;
  if (!legendReady(id)) {
    modal(
      `<h2>${legendary ? 'Suaka belum tenang' : 'Gardu belum terjangkau'}</h2><p>${id === 19 ? 'Pulihkan arus dan dapatkan Lencana Pasang.' : 'Buka jalur Puncak Sinyal setelah Lencana Pasang.'} Setelah itu, kembali ke sini.</p>${closeButton()}`,
    );
    return;
  }
  if (legendary && (state.legendCaught.includes(id) || state.seen.includes(id))) {
    modal(
      `<h2>${SPECIES[id].name} sudah mengenalmu</h2><p>Legenda ini hanya bisa ditangkap satu kali.</p>${closeButton()}`,
    );
    return;
  }
  modal(
    `<span class="eyebrow">${legendary ? 'LEGENDA SUAKA' : 'WARGAMON LANGKA'}, OPSIONAL</span><div class="portrait-head">${art(id)}<div><h2>${SPECIES[id].name}</h2><p>${typeLabel(id)}</p></div></div><p>${SPECIES[id].desc}</p><p>Lv.${id === 19 ? 27 : REGIONS[7].levels[1]}. ${legendary ? 'Satu per perjalanan. Bisa dicoba lagi jika kabur atau kalah.' : 'Bukan legenda. Bisa ditangkap lagi di gardu dan jarang muncul di semak gunung.'}</p><p>${state.team.length >= 6 ? 'Tim penuh: tangkapan dikirim ke Titipan.' : ''}</p><div class="actions"><button class="action" data-chapter="legend" data-id="${id}" ${!state.balls && !legendary ? 'disabled' : ''}>${legendary ? 'Dekati legenda' : 'Periksa gardu'}</button>${closeButton('Siapkan tim dulu')}</div>`,
    'legend',
  );
}
// The follower uses the player's actual path, including turns and click-to-walk routes.
let followerTrail = [],
  followerScene = '',
  followerPosition = null;
onClick(e => {
  const b = e.target.closest('button[data-chapter]');
  if (!b || b.disabled) return;
  const a = b.dataset.chapter,
    i = Number(b.dataset.id);
  if (a === 'depart') {
    closeModal();
    travel(5);
  }
  if (a === 'power') pressPower(i);
  if (a === 'powerreset' && !has('circuit')) {
    chapterState().power = newPower();
    update();
    powerMenu();
  }
  if (a === 'valve') turnValve(i, Number(b.dataset.delta));
  if (a === 'valvetest') testValves();
  if (a === 'signal') pressSignal(i);
  if (a === 'signalstart') {
    const p = chapterState().signals;
    p.input = [];
    p.revealed = !p.revealed;
    update();
    signalMenu();
  }
  if (
    a === 'legend' &&
    legendReady(i) &&
    (!SPECIES[i].legendary || (!state.legendCaught.includes(i) && !state.seen.includes(i)))
  ) {
    if (!state.balls) {
      if (!SPECIES[i].legendary) {
        toast('Beli kapsul dulu di koperasi.');
        return;
      }
      // The volunteers lend capsules once; after that the player brings their own.
      if (state.legendLoan) {
        toast('Beli kapsul dulu di koperasi.');
        return;
      }
      state.legendLoan = true;
      state.balls = 3;
      toast('Relawan meminjamkan tiga kapsul untuk penelitian.');
    }
    startBattle(null, [[i, i === 19 ? 27 : REGIONS[7].levels[1]]]);
  }
});
