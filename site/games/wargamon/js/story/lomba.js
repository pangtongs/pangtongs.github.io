/* Lomba 17-an: in Agustusan week (agustusan() in futsal-penalty.js) the Sukamaju pitch
   hosts the classic Independence Day contests besides the penalty shoot-out: panjat
   pinang (the greasy pole), balap karung (the sack race) and makan kerupuk (the cracker-
   eating race), with Krupik in the cracker's place. Every contest won pays once a day;
   the first win of each in a year earns a Pita Merah Putih (red-and-white ribbon), and all
   three ribbons in one year the Bendera Merah Putih prize. */

const LOMBA_KINDS = ['pinang', 'karung', 'kerupuk'];
// Rp17.845 for 17-8-1945.
const BENDERA_MONEY = 17845;
function lombaRecord(year = new Date().getFullYear()) {
  const a = (state.agustus ??= { cups: [], kerupuk: -1 });
  a.lomba ??= {};
  a.pita ??= 0;
  return (a.lomba[year] ??= { won: [], day: {} });
}
// A finished contest: the day's prize for a win, a ribbon for the year's first win of it,
// the flag for the third ribbon. Returns the text for the result line.
function lombaPrize(kind, win) {
  if (!win) return '';
  const rec = lombaRecord(),
    lines = [];
  if (rec.day[kind] !== dayNumber()) {
    rec.day[kind] = dayNumber();
    addItem('balls', 2);
    state.money += 5000;
    lines.push(I18N.t('lomba.daily', { money: money(5000) }));
  }
  if (!rec.won.includes(kind)) {
    rec.won.push(kind);
    state.agustus.pita++;
    addItem('ultraballs', 1);
    lines.push(I18N.t('lomba.pita', { n: rec.won.length, total: LOMBA_KINDS.length }));
    if (rec.won.length === LOMBA_KINDS.length) {
      state.money += BENDERA_MONEY;
      addItem('vest', 1);
      lines.push(I18N.t('lomba.bendera', { money: money(BENDERA_MONEY) }));
    }
  }
  update();
  return lines.join(' ');
}
// The pitch during Agustusan: pick a contest.
function lombaHub() {
  if (battle) return;
  const rec = lombaRecord(),
    card = (kind, act) =>
      `<section class="bazaar-item lomba-item"><span class="guest-icon" aria-hidden="true">${{ penalti: '⚽', pinang: '🎋', karung: '🥔', kerupuk: '🍘' }[kind]}</span><div><b>${I18N.t(`lomba.${kind}.name`)}</b><p>${I18N.t(`lomba.${kind}.desc`)}</p>${LOMBA_KINDS.includes(kind) ? `<small>${I18N.t(rec.won.includes(kind) ? 'lomba.hasPita' : 'lomba.noPita')}</small>` : ''}</div><button class="action" data-lomba="${act}">${I18N.t('lomba.play')}</button></section>`;
  modal(
    `<span class="eyebrow">${I18N.t('futsal.lomba.eyebrow')}</span><h2>${I18N.t('lomba.title')}</h2><p>${I18N.t('lomba.intro')}</p><div class="bazaar-goods">${card('penalti', 'penalti')}${LOMBA_KINDS.map(k => card(k, k)).join('')}</div><p class="story-hint">${I18N.t('lomba.ribbons', { n: rec.won.length, total: LOMBA_KINDS.length, all: state.agustus.pita })}</p>${closeButton()}`,
    'lomba',
  );
}

// --- Panjat pinang: climb hand over hand, alternating left and right. Grabbing with the
// same hand twice slips you down; the grease drags you down all the time. Reach the
// prizes at the top within 20 seconds.
const PINANG_TIME = 20,
  PINANG_CLIMB = 4,
  PINANG_SLIP = 3,
  PINANG_GREASE = 4.5;
function pinangGrab(g, hand) {
  if (g.lastHand === hand) {
    g.h = Math.max(0, g.h - PINANG_SLIP);
    g.slips++;
    g.slipAt = g.clock;
  } else g.h = Math.min(100, g.h + PINANG_CLIMB);
  g.lastHand = hand;
}
function pinangGame() {
  openArcade({
    kind: 'pinang',
    eyebrow: I18N.t('futsal.lomba.eyebrow'),
    title: I18N.t('lomba.pinang.name'),
    rules: I18N.t('lomba.pinang.rules', { n: PINANG_TIME }),
    controls: [
      { act: 'left', label: '←', text: 'lomba.pinang.left', keys: ['ArrowLeft', 'a'] },
      { act: 'right', label: '→', text: 'lomba.pinang.right', keys: ['ArrowRight', 'd'] },
    ],
    start: () => ({ h: 0, lastHand: null, slips: 0, slipAt: -1 }),
    step(g, dt) {
      if (g.h < 100) g.h = Math.max(0, g.h - PINANG_GREASE * dt);
    },
    act: pinangGrab,
    done: g => g.h >= 100 || g.clock >= PINANG_TIME,
    finish: g =>
      g.h >= 100
        ? [I18N.t('lomba.pinang.win'), lombaPrize('pinang', true)].filter(Boolean).join(' ')
        : I18N.t('lomba.pinang.lose', { n: Math.round(g.h) }),
    status: g =>
      I18N.t(g.clock - g.slipAt < 0.6 ? 'lomba.pinang.slip' : 'lomba.pinang.status', {
        n: Math.max(0, Math.ceil(PINANG_TIME - g.clock)),
      }),
    score: g => `${Math.round(g.h)}%`,
    reward: () => lombaReward('pinang'),
    draw(g, c) {
      miniBox(c, 0, 0, ARCADE_W, ARCADE_H, '#9fd3e8');
      miniBox(c, 0, ARCADE_H - 30, ARCADE_W, 30, '#5f8f45');
      miniBox(c, 310, 30, 20, ARCADE_H - 60, '#8a5a32');
      for (let y = 40; y < ARCADE_H - 30; y += 24) miniBox(c, 312, y, 4, 10, '#c49a6a');
      // The prize ring at the top, hung with red-and-white flags.
      miniBox(c, 270, 22, 100, 8, '#7b4a28');
      for (let i = 0; i < 5; i++) miniBox(c, 274 + i * 20, 30, 10, 14, i % 2 ? '#fff' : '#d9473b');
      const y = ARCADE_H - 60 - (g.h / 100) * (ARCADE_H - 100);
      miniBox(c, 304, y, 32, 16, '#d9473b');
      miniBox(c, 304, y + 16, 32, 16, '#fff');
      miniDot(c, 320, y - 8, 9, '#e9b98c');
    },
  });
}
const lombaReward = kind =>
  I18N.t(lombaRecord().day[kind] === dayNumber() ? 'lomba.paidToday' : 'lomba.reward');

// --- Balap karung: hop in a sack to the 100 m line. Press Hop as the sack's spring peaks
// (the bar in the green): a good hop goes 4.5 m, a perfect one 6 m, a mistimed one trips
// you for a moment. Beat Dik Ucup, Bang Jali and Mbak Sinta to the line.
const KARUNG_PERIOD = 0.8,
  KARUNG_AIR = 0.35,
  KARUNG_TRIP = 0.8,
  KARUNG_LIMIT = 30,
  KARUNG_RIVALS = [18, 20, 23];
const karungSpring = t => (Math.sin((t * Math.PI * 2) / KARUNG_PERIOD) + 1) / 2;
function karungHop(g) {
  if (g.clock < g.busyUntil) return 'busy';
  const s = karungSpring(g.clock);
  if (s >= 0.9) {
    g.x += 6;
    g.busyUntil = g.clock + KARUNG_AIR;
    return (g.lastHop = 'perfect');
  }
  if (s >= 0.7) {
    g.x += 4.5;
    g.busyUntil = g.clock + KARUNG_AIR;
    return (g.lastHop = 'good');
  }
  g.busyUntil = g.clock + KARUNG_TRIP;
  g.trips++;
  return (g.lastHop = 'trip');
}
const karungRivalAt = (g, i) => Math.min(100, (g.clock / KARUNG_RIVALS[i]) * 100);
function karungPlace(g) {
  const t = g.finishAt ?? g.clock;
  return 1 + KARUNG_RIVALS.filter(s => s < t).length;
}
function karungGame() {
  openArcade({
    kind: 'karung',
    eyebrow: I18N.t('futsal.lomba.eyebrow'),
    title: I18N.t('lomba.karung.name'),
    rules: I18N.t('lomba.karung.rules'),
    controls: [
      { act: 'hop', label: I18N.t('mini.key.space'), text: 'lomba.karung.hop', keys: [' ', 'ArrowUp'] },
    ],
    start: () => ({ x: 0, busyUntil: 0, trips: 0, lastHop: null, finishAt: null }),
    step(g) {
      if (g.x >= 100 && g.finishAt === null) g.finishAt = g.clock;
    },
    act: g => karungHop(g),
    done: g => g.finishAt !== null || g.clock >= KARUNG_LIMIT,
    finish(g) {
      if (g.finishAt === null) return I18N.t('lomba.karung.slow');
      const place = karungPlace(g);
      return [
        I18N.t('lomba.karung.done', { place, time: g.finishAt.toFixed(1) }),
        lombaPrize('karung', place === 1),
      ]
        .filter(Boolean)
        .join(' ');
    },
    status: g => (g.lastHop ? I18N.t(`lomba.karung.${g.lastHop}`) : I18N.t('lomba.karung.status')),
    score: g => `${Math.min(100, Math.round(g.x))} m`,
    reward: () => lombaReward('karung'),
    draw(g, c) {
      miniBox(c, 0, 0, ARCADE_W, ARCADE_H, '#d8eef4');
      miniBox(c, 0, 80, ARCADE_W, ARCADE_H - 80, '#76a85a');
      miniBox(c, 590, 80, 6, ARCADE_H - 80, '#ffffff');
      const lane = (i, x, color, me) => {
        const y = 110 + i * 45,
          px = 30 + (x / 100) * 560,
          lift = me && g.clock < g.busyUntil && g.lastHop !== 'trip' ? 10 : 0;
        miniBox(c, px - 10, y - lift, 20, 26, '#b28a55');
        miniDot(c, px, y - 8 - lift, 8, color);
      };
      KARUNG_RIVALS.forEach((_, i) => lane(i, karungRivalAt(g, i), '#e9b98c', false));
      lane(3, Math.min(100, g.x), '#f2d0a4', true);
      miniBar(c, 20, 20, 200, karungSpring(g.clock), karungSpring(g.clock) >= 0.7 ? '#83d068' : '#c69e53');
    },
  });
}

// --- Makan kerupuk: hands behind your back, eat the cracker hanging on a string before
// Krupik finishes its own. Bite when the swinging cracker is in front of your mouth; a
// miss bumps your nose and costs a moment. Six bites finish it; Krupik needs 14 seconds.
// The first win of the year makes Krupik so cross it challenges you to a match.
const KERUPUK_BITES = 6,
  KERUPUK_RIVAL = 14,
  KERUPUK_STUN = 0.5,
  KERUPUK_SPECIES = 24;
const kerupukSwing = g => Math.sin(g.clock * (2.2 + g.bites * 0.25));
function kerupukBite(g) {
  if (g.clock < g.stunUntil) return 'busy';
  if (Math.abs(kerupukSwing(g)) < 0.3) {
    g.bites++;
    return (g.lastBite = 'bite');
  }
  g.stunUntil = g.clock + KERUPUK_STUN;
  return (g.lastBite = 'miss');
}
function kerupukGame() {
  const krupik = SPECIES[KERUPUK_SPECIES].name;
  openArcade({
    kind: 'kerupuk',
    eyebrow: I18N.t('futsal.lomba.eyebrow'),
    title: I18N.t('lomba.kerupuk.name'),
    rules: I18N.t('lomba.kerupuk.rules', { name: krupik, n: KERUPUK_RIVAL }),
    controls: [
      { act: 'bite', label: I18N.t('mini.key.space'), text: 'lomba.kerupuk.bite', keys: [' ', 'ArrowUp'] },
    ],
    start: () => ({ bites: 0, stunUntil: 0, lastBite: null, wonAt: null }),
    step(g) {
      if (g.bites >= KERUPUK_BITES && g.wonAt === null) g.wonAt = g.clock;
    },
    act: g => kerupukBite(g),
    done: g => g.bites >= KERUPUK_BITES || g.clock >= KERUPUK_RIVAL,
    finish(g) {
      const win = g.bites >= KERUPUK_BITES && g.clock < KERUPUK_RIVAL;
      if (!win) return I18N.t('lomba.kerupuk.lose', { name: krupik });
      const lines = [I18N.t('lomba.kerupuk.win', { name: krupik }), lombaPrize('kerupuk', true)];
      const rec = lombaRecord();
      if (!rec.krupik) {
        rec.krupik = true;
        lines.push(I18N.t('lomba.kerupuk.challenge', { name: krupik }));
        whenFree(() => {
          startBattle(null, [[KERUPUK_SPECIES, Math.min(LEVEL_CAP, Math.max(5, teamLevel()))]]);
          if (!battle) return;
          battle.log = I18N.t('lomba.kerupuk.battle', { name: krupik });
          renderBattle();
        });
      }
      return lines.filter(Boolean).join(' ');
    },
    status: g =>
      g.lastBite === 'miss' && g.clock < g.stunUntil
        ? I18N.t('lomba.kerupuk.miss')
        : I18N.t('lomba.kerupuk.status', { n: KERUPUK_BITES - g.bites, name: krupik }),
    score: g => `${g.bites}/${KERUPUK_BITES}`,
    reward: () => lombaReward('kerupuk'),
    draw(g, c) {
      miniBox(c, 0, 0, ARCADE_W, ARCADE_H, '#f3e7c4');
      miniBox(c, 0, 40, ARCADE_W, 6, '#7b4a28');
      const swing = kerupukSwing(g),
        x = 220 + swing * 70;
      c.strokeStyle = '#7b4a28';
      c.beginPath();
      c.moveTo(220, 46);
      c.lineTo(x, 130);
      c.stroke();
      // The cracker shrinks with each bite.
      miniDot(c, x, 145, 26 * (1 - g.bites / (KERUPUK_BITES + 1)), '#f6d58a');
      miniDot(c, 220, 215, 22, '#e9b98c');
      miniBox(c, 196, 237, 48, 50, '#d9473b');
      // Krupik's cracker and its progress at the next string.
      const k = Math.min(1, g.clock / KERUPUK_RIVAL);
      miniDot(c, 460, 145, 26 * (1 - k * 0.85), '#f6d58a');
      miniDot(c, 460, 215, 20, '#e2724f');
      miniBar(c, 380, 270, 160, k, '#e2724f');
      miniBar(c, 140, 270, 160, g.bites / KERUPUK_BITES, '#83d068');
    },
  });
}

onClick(e => {
  const b = e.target.closest('[data-lomba]');
  if (!b || b.disabled || modalKind !== 'lomba' || !agustusan()) return;
  const kind = b.dataset.lomba;
  if (kind === 'penalti') penaltyGame();
  else ({ pinang: pinangGame, karung: karungGame, kerupuk: kerupukGame })[kind]?.();
});
