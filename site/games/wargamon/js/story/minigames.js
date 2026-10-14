/* Minigames around town: the angklung (and dangdut, gamelan, barongsai) rhythm game,
   kite flying at Padang Ojek, congklak with Mbah Sepuh and haggling at Pasar Rakyat.
   Each is short, works with keys (always shown as badges) and touch, and pays once a day. */

// --- Shared: the record and the daily prize, which grows with the journey like futsal's.
function miniState() {
  state.minigames ??= {};
  state.minigames.paid ??= {};
  return state.minigames;
}
const miniPaidToday = kind => miniState().paid[kind] === dayNumber();
function miniPrize(kind) {
  const s = miniState();
  if (s.paid[kind] === dayNumber()) return '';
  s.paid[kind] = dayNumber();
  const tier = futsalTier(),
    items =
      tier === 0
        ? [
            ['balls', 2],
            ['potions', 1],
          ]
        : tier === 1
          ? [
              ['ultraballs', 1],
              ['potions', 2],
            ]
          : [
              ['ultraballs', 2],
              ['maxpotion', 1],
            ];
  items.forEach(([k, n]) => addItem(k, n));
  update();
  return I18N.t('mini.prize', { items: items.map(([k, n]) => `${medicineInfo(k).name} ×${n}`).join(', ') });
}
const miniRewardLine = kind => I18N.t(miniPaidToday(kind) ? 'mini.paid' : 'mini.reward');
const miniClamp = (n, a, b) => Math.max(a, Math.min(b, n));
const miniKey = k => `<kbd class="battle-key" aria-hidden="true">${k}</kbd>`;

// --- The arcade frame: a canvas game in a dialog, like the futsal penalty. A spec gives
// start() (the game's own fields), step(g, dt), act(g, action), done(g), finish(g) (pays
// and returns the result text), status(g), score(g) and draw(g, ctx). Controls are buttons
// with their key badge; `hold` controls act while pressed (pointer or key held down).
let arcade = null,
  arcadeFrame = 0;
const ARCADE_W = 640,
  ARCADE_H = 300;
function openArcade(spec) {
  if (arcadeFrame) cancelAnimationFrame(arcadeFrame);
  arcadeFrame = 0;
  const game = { spec, clock: 0, last: null, over: false, result: '', held: new Set(), ...spec.start() };
  arcade = game;
  const pad = spec.controls
    .map(
      c =>
        `<button class="mini-control" data-mini-act="${c.act}" ${c.hold ? 'data-mini-hold="1"' : ''}>${miniKey(c.label)}<span>${I18N.t(c.text)}</span></button>`,
    )
    .join('');
  modal(
    `<section class="futsal-game mini-game mini-${spec.kind}"><header class="futsal-heading"><div><small>${spec.eyebrow}</small><h2>${spec.title}</h2></div><strong id="miniScore"></strong></header><canvas id="miniCanvas" width="${ARCADE_W}" height="${ARCADE_H}" aria-label="${spec.title}"></canvas><p class="futsal-instruction">${spec.rules}</p><p id="miniStatus" class="futsal-status" role="status" aria-live="polite"></p><div class="mini-pad">${pad}</div><div class="futsal-actions"><button id="miniAgain" data-mini-act="again" hidden>${miniKey('Enter')}${I18N.t('mini.again')}</button><button data-act="close">${I18N.t('mini.exit')}</button></div><p id="miniReward" class="futsal-reward">${spec.reward()}</p></section>`,
    'minigame',
    null,
    {
      onClose() {
        if (arcadeFrame) cancelAnimationFrame(arcadeFrame);
        arcadeFrame = 0;
        if (arcade === game) arcade = null;
      },
    },
  );
  for (const b of $('modal').querySelectorAll('[data-mini-hold]')) {
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      arcadeHold(b.dataset.miniAct, true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      b.addEventListener(type, () => arcadeHold(b.dataset.miniAct, false));
  }
  arcadeRefresh();
  arcadeFrame = requestAnimationFrame(arcadeTick);
}
function arcadeRefresh() {
  const g = arcade;
  if (!g || modalKind !== 'minigame') return;
  $('miniScore').textContent = g.spec.score(g);
  $('miniStatus').textContent = g.over ? g.result : g.spec.status(g);
  $('miniAgain').hidden = !g.over;
  $('miniReward').textContent = g.spec.reward();
}
function arcadeAct(action) {
  const g = arcade;
  if (!g || modalKind !== 'minigame') return;
  if (action === 'again') {
    if (g.over) openArcade(g.spec);
    return;
  }
  if (g.over) return;
  g.spec.act(g, action);
  arcadeCheck();
}
function arcadeHold(action, down) {
  const g = arcade;
  if (!g || modalKind !== 'minigame') return;
  if (down) g.held.add(action);
  else g.held.delete(action);
}
// One step of play, also driven directly by the tests.
function arcadeAdvance(dt) {
  const g = arcade;
  if (!g || g.over) return;
  g.clock += dt;
  g.spec.step(g, dt);
  arcadeCheck();
}
function arcadeCheck() {
  const g = arcade;
  if (!g || g.over || !g.spec.done(g)) return;
  g.over = true;
  g.result = g.spec.finish(g);
  save();
  update();
  arcadeRefresh();
}
function arcadeTick(time) {
  const g = arcade;
  if (!g || modalKind !== 'minigame') {
    arcadeFrame = 0;
    return;
  }
  const dt = g.last === null ? 0 : Math.min(0.05, Math.max(0, (time - g.last) / 1000));
  g.last = time;
  if (!document.hidden) arcadeAdvance(dt);
  if (!g.over) arcadeRefresh();
  const canvas = $('miniCanvas');
  if (canvas?.getContext) g.spec.draw(g, canvas.getContext('2d'));
  arcadeFrame = requestAnimationFrame(arcadeTick);
}
onClick(e => {
  const b = e.target.closest('[data-mini-act]');
  // Hold controls answer to the pointer itself, not to the click that follows it.
  if (!b || b.disabled || b.dataset.miniHold) return;
  arcadeAct(b.dataset.miniAct);
});
const arcadeControl = key =>
  arcade?.spec.controls.find(c => c.keys.some(k => k.toLowerCase() === key.toLowerCase()));
document.addEventListener(
  'keydown',
  e => {
    if (!arcade || modalKind !== 'minigame') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeModal();
      return;
    }
    if (e.key === 'Enter' && arcade.over) {
      e.preventDefault();
      e.stopImmediatePropagation();
      arcadeAct('again');
      return;
    }
    const c = arcadeControl(e.key);
    if (!c) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (c.hold) arcadeHold(c.act, true);
    else if (!e.repeat) arcadeAct(c.act);
  },
  true,
);
document.addEventListener(
  'keyup',
  e => {
    const c = arcade && modalKind === 'minigame' && arcadeControl(e.key);
    if (c?.hold) arcadeHold(c.act, false);
  },
  true,
);
// Drawing helpers that only use the canvas calls every browser has.
function miniBox(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function miniDot(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function miniLabel(g, text, x, y) {
  g.fillStyle = '#10302c';
  g.font = '600 12px system-ui, sans-serif';
  g.fillText?.(text, x, y);
}
function miniBar(g, x, y, w, value, color) {
  miniBox(g, x, y, w, 12, '#0d2224');
  miniBox(g, x + 1, y + 1, (w - 2) * miniClamp(value, 0, 1), 10, color);
}

// --- Instruments, synthesised with the soundscape's voices (no recordings).
function instrumentNote(voice, hz) {
  if (!audioPreferences.effects || audioPreferences.effectsVolume <= 0 || !audioUnlocked || document.hidden)
    return;
  const ac = audioContext();
  if (!ac) return;
  const v = (audioPreferences.effectsVolume / 100) * 0.08,
    t = ac.currentTime;
  if (voice === 'angklung')
    // Bamboo tubes rattling in their frame: quick repeats of a note and its octave.
    for (let i = 0; i < 4; i++) {
      tone(hz, t + i * 0.055, 0.09, v * (1 - i * 0.18), 'triangle');
      tone(hz * 2, t + i * 0.055 + 0.02, 0.07, v * 0.4 * (1 - i * 0.18), 'sine');
    }
  else if (voice === 'gamelan') {
    // A bonang kettle: a long bell tone with a bright inharmonic overtone.
    tone(hz, t, 1.1, v, 'sine');
    tone(hz * 2.76, t, 0.5, v * 0.25, 'sine');
  } else if (voice === 'dangdut') {
    percussion(t, hz > 300, v * 1.6);
    tone(hz, t, 0.2, v * 0.5, 'triangle');
  } else {
    // Barongsai: the big drum, and the cymbal on the top lane.
    percussion(t, hz > 300, v * 2);
    if (hz > 400) shaker(t, v * 0.9);
  }
}

// --- Rhythm game. Notes fall down four lanes; press the lane's key (D F J K, or 1-4) or
// tap the lane as a note crosses the line. Within 0.08 s is Pas (2 points), within 0.2 s
// Bagus (1), later is a miss. 60% of the points passes and earns the day's prize.
// Charts: one character per eighth note, the lane (1-4) or a rest (.). Original patterns.
const RHYTHM_TRACKS = {
  angklung: {
    bpm: 104,
    voice: 'angklung',
    pitches: [262, 294, 330, 392],
    chart: '1.2.3.4...3.2.1...1.3.2.4...4.3.2.1...2.2.3.3.4...1.2.3.2.1.......',
  },
  dangdut: {
    bpm: 116,
    voice: 'dangdut',
    pitches: [130, 196, 330, 392],
    chart: '1..21..21.3.4...1..21..23.4.3...1..21..2443321......',
  },
  gamelan: {
    bpm: 88,
    voice: 'gamelan',
    pitches: [294, 311, 370, 440],
    chart: '1...2...3...2...1.2.3.4.3.2.1...4...3...2...1.......',
  },
  barongsai: {
    bpm: 120,
    voice: 'barongsai',
    pitches: [110, 130, 330, 520],
    chart: '1.1.2.1.4...1.1.2.2.3.4.1.1.2.1.4...3.3.2.2.1.1.4.4.......',
  },
};
const RHYTHM_LEAD = 2,
  RHYTHM_FALL = 1.6,
  RHYTHM_PERFECT = 0.08,
  RHYTHM_GOOD = 0.2,
  RHYTHM_PASS = 0.6,
  RHYTHM_HIT_Y = 250,
  RHYTHM_KEYS = [
    ['D', '1'],
    ['F', '2'],
    ['J', '3'],
    ['K', '4'],
  ];
function rhythmNotes(track) {
  const t = RHYTHM_TRACKS[track],
    step = 60 / t.bpm / 2;
  return [...t.chart].flatMap((ch, i) =>
    /[1-4]/.test(ch) ? [{ lane: Number(ch) - 1, time: RHYTHM_LEAD + i * step, hit: null }] : [],
  );
}
// A press in a lane: judges the nearest open note there. Returns 'perfect', 'good' or 'miss'.
function rhythmJudge(g, lane) {
  const t = g.clock,
    note = g.notes
      .filter(n => n.lane === lane && !n.hit && Math.abs(t - n.time) <= RHYTHM_GOOD)
      .sort((a, b) => Math.abs(t - a.time) - Math.abs(t - b.time))[0];
  if (!note) {
    g.combo = 0;
    g.flash = { lane, kind: 'miss', at: t };
    return 'miss';
  }
  note.hit = Math.abs(t - note.time) <= RHYTHM_PERFECT ? 'perfect' : 'good';
  g.points += note.hit === 'perfect' ? 2 : 1;
  g.combo++;
  g.best = Math.max(g.best, g.combo);
  g.flash = { lane, kind: note.hit, at: t };
  instrumentNote(RHYTHM_TRACKS[g.track].voice, RHYTHM_TRACKS[g.track].pitches[lane]);
  return note.hit;
}
function rhythmStep(g) {
  for (const n of g.notes)
    if (!n.hit && g.clock - n.time > RHYTHM_GOOD) {
      n.hit = 'miss';
      g.combo = 0;
    }
}
const rhythmScore = g => g.points / (g.notes.length * 2);
// Where each track is played, and what a passing show pays.
const RHYTHM_AFTER = { barongsai: passed => barongsaiAfter(passed) };
function rhythmGame(track) {
  const t = (k, p) => I18N.t(`rhythm.${track}.${k}`, p);
  openArcade({
    kind: 'rhythm',
    eyebrow: t('eyebrow'),
    title: t('title'),
    rules: I18N.t('rhythm.rules') + ' ' + t('rules'),
    controls: RHYTHM_KEYS.map(([key, num], lane) => ({
      act: String(lane),
      label: key,
      text: `rhythm.lane.${lane}`,
      keys: [key, num],
    })),
    start: () => ({ track, notes: rhythmNotes(track), points: 0, combo: 0, best: 0, flash: null }),
    step: rhythmStep,
    act: (g, a) => rhythmJudge(g, Number(a)),
    done: g => g.notes.every(n => n.hit),
    finish(g) {
      const score = rhythmScore(g),
        passed = score >= RHYTHM_PASS,
        prize = passed ? miniPrize('rhythm-' + track) : '',
        extra = RHYTHM_AFTER[track]?.(passed) || '';
      return [
        I18N.t(passed ? 'rhythm.pass' : 'rhythm.fail', { n: Math.round(score * 100), combo: g.best }),
        prize,
        extra,
      ]
        .filter(Boolean)
        .join(' ');
    },
    status: g =>
      g.clock < RHYTHM_LEAD - 0.4 ? I18N.t('rhythm.ready') : I18N.t('rhythm.combo', { n: g.combo }),
    score: g => `${Math.round(rhythmScore(g) * 100)}%`,
    reward: () => miniRewardLine('rhythm-' + track),
    draw: rhythmDraw,
  });
}
function rhythmDraw(g, c) {
  const lanes = ['#e7c35a', '#7fd0a8', '#7fb4e6', '#e58f8f'],
    w = ARCADE_W / 4;
  miniBox(c, 0, 0, ARCADE_W, ARCADE_H, '#14302d');
  for (let i = 0; i < 4; i++) {
    miniBox(c, i * w + 2, 0, w - 4, ARCADE_H, i % 2 ? '#183a36' : '#1b403b');
    const lit = g.flash && g.flash.lane === i && g.clock - g.flash.at < 0.15;
    miniBox(
      c,
      i * w + 8,
      RHYTHM_HIT_Y - 4,
      w - 16,
      8,
      lit ? (g.flash.kind === 'miss' ? '#c56957' : '#fffbe0') : '#5b8279',
    );
  }
  for (const n of g.notes) {
    if (n.hit) continue;
    const y = RHYTHM_HIT_Y - ((n.time - g.clock) / RHYTHM_FALL) * RHYTHM_HIT_Y;
    if (y < -20 || y > ARCADE_H + 20) continue;
    // An angklung tube shape: a rounded body with a slot on top.
    miniBox(c, n.lane * w + w / 2 - 18, y - 10, 36, 20, lanes[n.lane]);
    miniBox(c, n.lane * w + w / 2 - 6, y - 16, 12, 6, lanes[n.lane]);
  }
}

// --- Kite flying (layangan) at Padang Ojek. Hold "Tarik" (Space) to pull the string: the
// kite climbs, and the string tightens faster in a strong gust. Let go to give it line:
// the tension eases while the kite sinks unless the wind carries it. Too tight and the
// string snaps (putus), too low and the kite falls. Still up and high after 25 seconds
// wins, and the kite Wargamon notice: Bebeangin (Layangawang when grown) come down to
// play in Padang Ojek and Pesisir Suaka for the next few wild encounters today.
const KITE_TIME = 25,
  KITE_WIN_ALT = 40,
  KITE_LURE = 3,
  KITE_SPECIES = 80;
const kiteWind = (t, seed) =>
  miniClamp(0.55 + 0.3 * Math.sin(0.8 * t + seed) + 0.2 * Math.sin(2.1 * t + seed * 1.7), 0, 1);
function kiteStep(g, dt, pulling = g.held.has('pull')) {
  const wind = kiteWind(g.clock, g.seed);
  g.wind = wind;
  if (pulling) {
    g.tension += (0.25 + 0.55 * wind) * dt;
    g.alt += (6 + 12 * wind) * dt;
  } else {
    g.tension -= 0.45 * dt;
    g.alt += (wind * 10 - 7) * dt;
  }
  g.tension = miniClamp(g.tension, 0, 1);
  g.alt = Math.min(100, g.alt);
  if (g.tension >= 1) g.end = 'snap';
  else if (g.alt <= 0) g.end = 'fall';
}
function kiteFinish(g) {
  if (g.end) return I18N.t(`kite.${g.end}`);
  if (g.alt < KITE_WIN_ALT) return I18N.t('kite.low');
  const s = miniState();
  s.kite = { day: dayNumber(), left: KITE_LURE };
  return [I18N.t('kite.win', { name: SPECIES[KITE_SPECIES].name, n: KITE_LURE }), miniPrize('kite')]
    .filter(Boolean)
    .join(' ');
}
// The lure: the kite Wargamon come ten times as often where they live, for a few
// encounters on the day of the flight.
const KITE_REGIONS = [REGION.PADANG_OJEK, REGION.PESISIR];
function kiteLureBoost(id, r = state.region) {
  const k = state.minigames?.kite;
  return k?.day === dayNumber() && k.left > 0 && KITE_REGIONS.includes(r) && speciesRoot(id) === KITE_SPECIES
    ? 10
    : 1;
}
// Called after a wild encounter is rolled: one lured encounter is used up.
function spendKiteLure(r = state.region) {
  const k = state.minigames?.kite;
  if (k?.day === dayNumber() && k.left > 0 && KITE_REGIONS.includes(r)) k.left--;
}
function kiteGame() {
  openArcade({
    kind: 'kite',
    eyebrow: I18N.t('kite.eyebrow'),
    title: I18N.t('kite.title'),
    rules: I18N.t('kite.rules', { n: KITE_TIME }),
    controls: [
      { act: 'pull', label: I18N.t('mini.key.space'), text: 'kite.pull', keys: [' ', 'ArrowUp'], hold: true },
    ],
    start: () => ({ alt: 30, tension: 0.3, wind: 0.5, seed: dayNumber() % 7, end: null }),
    step: (g, dt) => kiteStep(g, dt),
    act() {},
    done: g => !!g.end || g.clock >= KITE_TIME,
    finish: kiteFinish,
    status: g =>
      I18N.t(g.tension > 0.8 ? 'kite.tight' : g.alt < 15 ? 'kite.sinking' : 'kite.flying', {
        n: Math.max(0, Math.ceil(KITE_TIME - g.clock)),
      }),
    score: g => `${Math.round(g.alt)} m`,
    reward: () => miniRewardLine('kite'),
    draw: kiteDraw,
  });
}
function kiteDraw(g, c) {
  miniBox(c, 0, 0, ARCADE_W, ARCADE_H, '#8fc7e3');
  miniBox(c, 0, ARCADE_H - 40, ARCADE_W, 40, '#6a9a4a');
  const x = 380 + Math.sin(g.clock * 1.3) * 40 * g.wind,
    y = ARCADE_H - 50 - g.alt * 2.2;
  c.strokeStyle = g.tension > 0.8 ? '#c0392b' : '#f4f4f4';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(70, ARCADE_H - 46);
  c.lineTo(x, y + 18);
  c.stroke();
  // A bebean (fish-shaped Balinese kite) in red and white.
  c.fillStyle = '#d9473b';
  c.beginPath();
  c.moveTo(x, y - 18);
  c.lineTo(x + 16, y);
  c.lineTo(x, y + 18);
  c.lineTo(x - 16, y);
  c.fill();
  miniBox(c, x - 2, y - 18, 4, 36, '#fff6e6');
  for (let i = 1; i < 6; i++)
    miniBox(c, x - 2 + Math.sin(g.clock * 4 + i) * 4, y + 18 + i * 7, 4, 5, i % 2 ? '#fff6e6' : '#d9473b');
  miniDot(c, 70, ARCADE_H - 44, 6, '#7b5a35');
  miniBar(c, 16, 14, 180, g.tension, g.tension > 0.8 ? '#c56957' : '#83d068');
  miniBar(c, 16, 32, 180, g.wind, '#e8f4ff');
  miniLabel(c, I18N.t('kite.meter.tension'), 204, 24);
  miniLabel(c, I18N.t('kite.meter.wind'), 204, 42);
}

// --- Congklak (dakon) with Mbah Sepuh at the Padang Ojek pos. Seven holes a side and a
// rumah (store) at each end; seven seeds in every hole. Pick one of your holes and sow its
// seeds one by one anticlockwise into the next holes and your own rumah, never Mbah's.
// - The last seed in your rumah: play again.
// - The last seed in a hole that already had seeds: pick them all up and keep sowing.
// - The last seed in an empty hole on your side: "nembak", it takes the seeds in the hole
//   opposite into your rumah, with itself; on Mbah's side the turn just ends.
// When the player to move has no seeds on their side, each side's seeds go to its own
// rumah and the fuller rumah wins.
// Board indices: your holes 0-6 left to right, your rumah 7, Mbah's holes 8-14 (shown
// right to left along the top), Mbah's rumah 15. Hole i faces hole 14 - i.
const CONGKLAK_SEEDS = 7,
  CONGKLAK_STORE = [7, 15],
  CONGKLAK_RELAY_CAP = 200;
const congklakHoles = side => Array.from({ length: 7 }, (_, i) => i + side * 8);
const congklakSideOf = i => (i < 7 ? 0 : i > 7 && i < 15 ? 1 : -1);
function congklakBoard() {
  const b = Array(16).fill(CONGKLAK_SEEDS);
  b[7] = b[15] = 0;
  return b;
}
const congklakHasSeeds = (b, side) => congklakHoles(side).some(i => b[i] > 0);
// One move: returns the new board, whether the player goes again, and how it ended.
function congklakSow(board, side, hole) {
  const b = board.slice(),
    own = CONGKLAK_STORE[side],
    theirs = CONGKLAK_STORE[1 - side];
  let i = hole,
    hand = b[i],
    laps = 0;
  b[i] = 0;
  for (;;) {
    while (hand > 0) {
      i = (i + 1) % 16;
      if (i === theirs) continue;
      b[i]++;
      hand--;
    }
    if (i === own) return { board: b, again: true, end: 'home', at: i };
    if (b[i] > 1) {
      if (++laps > CONGKLAK_RELAY_CAP) return { board: b, again: false, end: 'stop', at: i };
      hand = b[i];
      b[i] = 0;
      continue;
    }
    if (congklakSideOf(i) === side && b[14 - i] > 0) {
      const taken = b[14 - i] + 1;
      b[own] += taken;
      b[14 - i] = 0;
      b[i] = 0;
      return { board: b, again: false, end: 'nembak', at: i, taken };
    }
    return { board: b, again: false, end: congklakSideOf(i) === side ? 'empty' : 'mati', at: i };
  }
}
// Mbah's choice: the hole that leaves his rumah furthest ahead, following his extra turns
// a few moves deep.
function congklakBest(board, side, depth = 3) {
  let best = null;
  for (const h of congklakHoles(side)) {
    if (!board[h]) continue;
    const r = congklakSow(board, side, h);
    let score = r.board[CONGKLAK_STORE[side]] - r.board[CONGKLAK_STORE[1 - side]];
    if (r.again && depth > 1 && congklakHasSeeds(r.board, side))
      score = congklakBest(r.board, side, depth - 1).score;
    if (!best || score > best.score) best = { hole: h, score };
  }
  return best || { hole: -1, score: board[CONGKLAK_STORE[side]] - board[CONGKLAK_STORE[1 - side]] };
}
// The end of the game: each side's seeds into its own rumah.
function congklakSweep(b) {
  for (const side of [0, 1])
    for (const i of congklakHoles(side)) {
      b[CONGKLAK_STORE[side]] += b[i];
      b[i] = 0;
    }
  return b;
}
let congklak = null;
const CONGKLAK_MBAH_DELAY = 900;
function congklakGame() {
  if (battle) return;
  congklak = { board: congklakBoard(), turn: 0, over: false, log: I18N.t('congklak.start'), token: {} };
  congklakRender();
}
function congklakRender() {
  const k = congklak;
  if (!k) return;
  const b = k.board,
    hole = (i, mine) =>
      mine
        ? `<button class="congklak-hole mine" data-congklak="${i}" ${k.over || k.turn !== 0 || !b[i] ? 'disabled' : ''} aria-label="${I18N.t('congklak.hole', { n: i + 1, seeds: b[i] })}">${miniKey(i + 1)}<b>${b[i]}</b></button>`
        : `<span class="congklak-hole" aria-label="${I18N.t('congklak.mbahHole', { seeds: b[i] })}"><b>${b[i]}</b></span>`;
  const top = [14, 13, 12, 11, 10, 9, 8].map(i => hole(i, false)).join(''),
    bottom = congklakHoles(0)
      .map(i => hole(i, true))
      .join('');
  modal(
    `<div class="portrait-head">${trainerArt(71)}<div><span class="eyebrow">${I18N.t('congklak.eyebrow')}</span><h2>${I18N.t('congklak.title')}</h2></div></div><p>${I18N.t('congklak.rules')}</p><div class="congklak-board"><span class="congklak-store" aria-label="${I18N.t('congklak.mbahStore', { n: b[15] })}"><small>${I18N.t('congklak.mbah')}</small><b>${b[15]}</b></span><div class="congklak-rows"><div class="congklak-row">${top}</div><div class="congklak-row">${bottom}</div></div><span class="congklak-store mine" aria-label="${I18N.t('congklak.yourStore', { n: b[7] })}"><small>${I18N.t('congklak.you')}</small><b>${b[7]}</b></span></div><p class="futsal-status" role="status" aria-live="polite">${k.log}</p><p class="story-hint">${miniRewardLine('congklak')}</p>${k.over ? `<div class="actions"><button class="action" data-congklak="again">${I18N.t('mini.again')}</button></div>` : ''}${closeButton()}`,
    'congklak',
    null,
    {
      // A redraw replaces this dialog with the next one of the same game.
      onClose(reason) {
        if (reason === 'close' && congklak === k) congklak = null;
      },
    },
  );
}
// Plays one move for whoever's turn it is, then hands over or ends the game.
function congklakMove(hole) {
  const k = congklak;
  if (!k || k.over || !k.board[hole] || congklakSideOf(hole) !== k.turn) return false;
  const side = k.turn,
    r = congklakSow(k.board, side, hole),
    who = side ? 'mbah' : 'you';
  k.board = r.board;
  k.log = I18N.t(`congklak.${who}.${r.end}`, { n: r.taken || 0 });
  const next = r.again ? side : 1 - side;
  if (!congklakHasSeeds(k.board, next)) {
    congklakSweep(k.board);
    k.over = true;
    const [you, mbah] = [k.board[7], k.board[15]],
      result = you > mbah ? 'win' : you < mbah ? 'lose' : 'draw';
    k.log += ' ' + I18N.t(`congklak.${result}`, { you, mbah });
    if (result === 'win') {
      const prize = miniPrize('congklak');
      if (prize) k.log += ' ' + prize;
    }
    save();
  } else k.turn = next;
  if (modalKind === 'congklak') congklakRender();
  if (!k.over && k.turn === 1) {
    const token = (k.token = {});
    setTimeout(() => {
      if (congklak === k && k.token === token && k.turn === 1 && !k.over)
        congklakMove(congklakBest(k.board, 1, 2).hole);
    }, CONGKLAK_MBAH_DELAY);
  }
  return true;
}
onClick(e => {
  const b = e.target.closest('[data-congklak]');
  if (!b || b.disabled || modalKind !== 'congklak') return;
  if (b.dataset.congklak === 'again') congklakGame();
  else if (congklak?.turn === 0) congklakMove(Number(b.dataset.congklak));
});
document.addEventListener(
  'keydown',
  e => {
    if (modalKind !== 'congklak' || !congklak || !/^[1-7]$/.test(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (congklak.turn === 0 && !e.repeat) congklakMove(Number(e.key) - 1);
  },
  true,
);

// --- Tawar-menawar (haggling) at Pasar Rakyat. One stall a day has a good with an asking
// price and a lowest price it never shows. Offer, and the seller answers with a lower
// price; an offer close enough to that answer (or above the lowest price, as the answers
// come down) is taken. Low offers wear out the seller's patience (sabar), insulting ones
// fast; at zero the stall closes on you for the day. Once a session, pretending to walk
// away (pura-pura pergi) makes a patient seller call you back with a better price; an
// impatient one lets you go. After five rounds the last price stands, take it or leave it.
const BARGAIN_GOODS = [
  { key: 'buah', item: 'potions', n: 4, ask: 20000, floor: 12000 },
  { key: 'batik', item: 'scarf', n: 1, ask: 160000, floor: 95000 },
  { key: 'loak', item: 'balls', n: 5, ask: 60000, floor: 40000 },
  { key: 'jamu', item: 'antidotes', n: 4, ask: 15000, floor: 8000 },
];
const BARGAIN_ROUNDS = 5,
  BARGAIN_STEP = 500;
const round500 = n => Math.round(n / BARGAIN_STEP) * BARGAIN_STEP;
function bargainNew(day = dayNumber()) {
  const g = BARGAIN_GOODS[dayMix(day * 7 + 3) % BARGAIN_GOODS.length],
    wiggle = ((dayMix(day * 11 + 1) % 21) - 10) / 100;
  return {
    day,
    good: g.key,
    ask: g.ask,
    counter: g.ask,
    floor: round500(g.floor * (1 + wiggle)),
    mood: 100,
    rounds: 0,
    offer: round500(g.ask * 0.6),
    feint: false,
    done: null,
    deal: null,
    price: null,
    line: 'open',
  };
}
const bargainGood = b => BARGAIN_GOODS.find(g => g.key === b.good);
// An offer: 'deal' (the seller takes it), 'counter' (a lower price back), 'angry' (the stall
// closes for today) or 'final' (no more rounds, the last price stands).
function bargainOffer(b, offer) {
  if (b.done) return b.done;
  offer = miniClamp(round500(offer), BARGAIN_STEP, b.counter);
  b.offer = offer;
  b.rounds++;
  if (offer >= b.counter || offer >= b.floor + (b.counter - b.floor) * 0.3) {
    b.done = 'deal';
    b.deal = offer;
    b.line = 'deal';
    return 'deal';
  }
  const hurt = offer < b.floor * 0.7 ? 40 : offer < b.floor ? 20 : 10;
  b.mood -= hurt;
  b.line = hurt === 40 ? 'insult' : hurt === 20 ? 'below' : 'close';
  b.counter = Math.max(b.floor, round500(b.counter - (b.counter - Math.max(offer, b.floor)) * 0.45));
  if (b.mood <= 0) {
    b.done = 'angry';
    b.line = 'angry';
  } else if (b.rounds >= BARGAIN_ROUNDS) {
    b.done = 'final';
    b.line = 'final';
  }
  return b.done || 'counter';
}
function bargainFeint(b) {
  if (b.feint || b.done) return b.done || 'used';
  b.feint = true;
  if (b.mood >= 50) {
    b.counter = Math.max(b.floor, round500(b.counter * 0.88));
    b.line = 'called';
    return 'called';
  }
  b.done = 'angry';
  b.line = 'gone';
  return 'angry';
}
// Today's session, kept in the save so closing the dialog does not reset the seller.
function bargainToday() {
  const s = miniState();
  if (s.bargain?.day !== dayNumber()) s.bargain = bargainNew();
  return s.bargain;
}
function bargainCard() {
  const b = bargainToday(),
    g = bargainGood(b);
  return `<section class="dine-card bargain-card"><h3>${I18N.t('bargain.card')}</h3><p>${I18N.t('bargain.today', { good: I18N.t(`bargain.${g.key}.name`), price: money(b.ask) })}</p><button class="action secondary" data-bargain="open" ${b.price !== null ? 'disabled' : ''}>${I18N.t(b.price !== null ? 'bargain.bought' : 'bargain.go')}</button></section>`;
}
function bargainMenu() {
  if (battle) return;
  const b = bargainToday(),
    g = bargainGood(b),
    closed = b.done === 'angry' || b.price !== null,
    canPay = state.money >= b.offer;
  modal(
    `<span class="eyebrow">${I18N.t('bargain.eyebrow')}</span><h2>${I18N.t(`bargain.${g.key}.name`)}</h2><p>${I18N.t(`bargain.${g.key}.desc`)}</p><p>“${I18N.t(`bargain.line.${b.line}`, { price: money(b.counter) })}”</p><div class="decision-receipt"><div><span>${I18N.t('bargain.asking')}</span><b>${money(b.counter)}</b></div><div><span>${I18N.t('bargain.patience')}</span><b>${Math.max(0, b.mood)}%</b></div><div><span>${I18N.t('bargain.round')}</span><b>${Math.min(b.rounds, BARGAIN_ROUNDS)}/${BARGAIN_ROUNDS}</b></div></div>${
      closed
        ? `<p class="story-hint">${I18N.t(b.price !== null ? 'bargain.paid' : 'bargain.closed', { price: money(b.price || 0) })}</p>`
        : `<div class="bargain-offer"><button class="secondary" data-bargain="down">${miniKey('←')}−${money(1000)}</button><strong id="bargainOffer">${money(b.offer)}</strong><button class="secondary" data-bargain="up">${miniKey('→')}+${money(1000)}</button></div><div class="actions">${
            b.done === 'final'
              ? ''
              : `<button class="action" data-bargain="offer" ${canPay ? '' : 'disabled'}>${miniKey('Enter')}${I18N.t('bargain.offer')}</button>`
          }<button class="secondary" data-bargain="take" ${state.money >= b.counter ? '' : 'disabled'}>${I18N.t('bargain.take', { price: money(b.counter) })}</button>${
            b.feint || b.done
              ? ''
              : `<button class="secondary" data-bargain="feint">${I18N.t('bargain.feint')}</button>`
          }</div>`
    }<p class="menu-subtitle">${I18N.t('bargain.rules')}</p>${closeButton()}`,
    'bargain',
  );
}
// Pays for the good at the agreed price.
function bargainBuy(b, price) {
  if (b.price !== null || state.money < price) return false;
  const g = bargainGood(b);
  state.money -= price;
  b.price = price;
  b.done = 'deal';
  addItem(g.item, g.n);
  update();
  save();
  toast(I18N.t('bargain.got', { good: I18N.t(`bargain.${g.key}.name`), price: money(price) }));
  return true;
}
function bargainAction(kind) {
  if (modalKind !== 'bargain') return;
  const b = bargainToday();
  if (b.price !== null || b.done === 'angry') return;
  if (kind === 'up' || kind === 'down') {
    b.offer = miniClamp(b.offer + (kind === 'up' ? 1000 : -1000), BARGAIN_STEP, b.counter);
  } else if (kind === 'offer' && b.done !== 'final' && state.money >= b.offer) {
    if (bargainOffer(b, b.offer) === 'deal') bargainBuy(b, b.deal);
  } else if (kind === 'take' && state.money >= b.counter) bargainBuy(b, b.counter);
  else if (kind === 'feint') bargainFeint(b);
  save();
  bargainMenu();
}
onClick(e => {
  const b = e.target.closest('[data-bargain]');
  if (!b || b.disabled) return;
  if (b.dataset.bargain === 'open') bargainMenu();
  else bargainAction(b.dataset.bargain);
});
document.addEventListener(
  'keydown',
  e => {
    if (modalKind !== 'bargain') return;
    const kind = { ArrowLeft: 'down', ArrowRight: 'up', Enter: 'offer' }[e.key];
    if (!kind || e.repeat) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    bargainAction(kind);
  },
  true,
);
