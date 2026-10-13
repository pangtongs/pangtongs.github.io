/* Skill-based penalties. All outcomes derive from visible aim, power and keeper position. */
let football = null;
/* Sukamaju futsal field: enter through the gate drawn in town.webp. */
const futsalPenalty = PLACES[0].points.find(p => p.key === 'shoot');
futsalPenalty.x = 580;
futsalPenalty.y = 430;
futsalPenalty.name = 'ADU PENALTI, mulai';
const FUTSAL_RULES = Object.freeze({
  shots: 5,
  target: 3,
  reward: 3000,
  rewardLimit: 3,
  goalTop: 100,
  goalBottom: 250,
  goalX: 688,
});
const futsalClamp = (n, a, b) => Math.max(a, Math.min(b, n));
const futsalPowerAt = t => (1 - Math.cos((t * Math.PI * 2) / 2.6)) / 2;
function futsalResolveShot(aim, power, keeper) {
  aim = futsalClamp(aim, -1, 1);
  power = futsalClamp(power, 0, 1);
  const drift = power > 0.78 ? (power - 0.78) * 210 : power < 0.55 ? (0.55 - power) * 60 : 0;
  const targetY = 175 + aim * 65 + (aim < 0 ? -1 : 1) * drift;
  const duration = 0.48 + (1 - power) * 0.55;
  const reach = Math.max(0, duration - 0.26) * 52 + 8;
  const keeperEnd = keeper + futsalClamp(targetY - keeper, -reach, reach);
  const wide = targetY < FUTSAL_RULES.goalTop + 6 || targetY > FUTSAL_RULES.goalBottom - 6;
  const kind = wide ? 'wide' : Math.abs(targetY - keeperEnd) < 22 ? 'saved' : 'goal';
  return { targetY, keeperStart: keeper, keeperEnd, duration, power, kind };
}
let futsalFrame = 0;
const ft = (key, params) => I18N.t('futsal.' + key, params);
loadMapImage('img/characters/futsal-keeper.webp', false, 'low');
function futsalAssetState() {
  const im = images['img/characters/futsal-keeper.webp'];
  return !im?.complete ? 'loading' : im.naturalWidth ? 'ready' : 'failed';
}
function penaltyGame() {
  if (futsalFrame) cancelAnimationFrame(futsalFrame);
  football = {
    stage: 'aim',
    aim: -0.65,
    clock: 0,
    chargeTime: 0,
    power: 0,
    keeper: 175,
    shots: 0,
    goals: 0,
    results: [],
    lastTime: null,
    flightTime: 0,
    shot: null,
    paid: 0,
  };
  modal(
    `<section class="futsal-game"><header class="futsal-heading"><div><small>${ft('eyebrow')}</small><h2>${ft('title')}</h2></div><strong id="futsalScore"></strong></header><div class="futsal-rounds" id="futsalRounds" aria-label="${ft('shots')}"></div><canvas id="futsalCanvas" width="800" height="360" aria-label="${ft('canvas')}"></canvas><p class="futsal-instruction">${ft('instructions')}</p><label class="futsal-aim" for="futsalAim"><span>${ft('aim')}</span><input id="futsalAim" type="range" min="-100" max="100" step="1" value="-65" aria-label="${ft('aim')}"><span class="futsal-aim-labels"><span>${ft('upper')}</span><span>${ft('lower')}</span></span></label><div class="futsal-power-heading"><span>${ft('power')}</span><strong id="futsalPowerLabel">${ft('ready')}</strong></div><div class="futsal-meter" role="img" aria-label="${ft('meter')}"><span class="futsal-sweet"></span><i id="futsalNeedle"></i></div><p id="futsalStatus" class="futsal-status" role="status" aria-live="polite"></p><div class="futsal-actions"><button id="futsalAction" data-futsal="action"></button><button id="futsalResetAim" data-futsal="aim" hidden>${ft('reaim')}</button><button data-act="close">${ft('exit')}</button></div><p id="futsalReward" class="futsal-reward"></p><small class="futsal-keyboard">${ft('keyboard')}</small></section>`,
    'penalty',
  );
  const c = $('futsalCanvas');
  const aimAt = e => {
    if (!football || football.stage !== 'aim') return;
    const b = c.getBoundingClientRect();
    football.aim = futsalClamp((((e.clientY - b.top) / b.height) * 360 - 175) / 65, -1, 1);
    $('futsalAim').value = Math.round(football.aim * 100);
  };
  c.addEventListener('pointerdown', e => {
    e.preventDefault();
    c.setPointerCapture?.(e.pointerId);
    aimAt(e);
  });
  c.addEventListener('pointermove', e => {
    if (e.buttons === 1) aimAt(e);
  });
  $('futsalAim').addEventListener('input', e => {
    if (football?.stage === 'aim') football.aim = Number(e.target.value) / 100;
  });
  futsalRefresh();
  futsalFrame = requestAnimationFrame(futsalTick);
}
function futsalRefresh() {
  const f = football;
  if (!f || modalKind !== 'penalty') return;
  $('futsalScore').textContent = ft('score', { goals: f.goals, total: FUTSAL_RULES.shots });
  $('futsalRounds').innerHTML = Array.from(
    { length: 5 },
    (_, i) =>
      `<span class="futsal-round ${f.results[i] || ''} ${i === f.shots && f.stage !== 'done' ? 'current' : ''}" aria-label="${ft('shotNumber', { n: i + 1 })}${f.results[i] ? ', ' + ft(f.results[i]) : ''}">${f.results[i] ? (f.results[i] === 'goal' ? '✓' : '×') : i + 1}</span>`,
  ).join('');
  const btn = $('futsalAction');
  btn.disabled = f.stage === 'flight';
  btn.textContent = ft(
    { aim: 'prepare', charge: 'kick', flight: 'flying', result: 'next', done: 'replay' }[f.stage],
  );
  const assetState = futsalAssetState();
  if (assetState !== 'ready') {
    btn.disabled = assetState === 'loading';
    btn.textContent = ft(assetState === 'loading' ? 'loading' : 'retry');
  }
  $('futsalAim').disabled = f.stage !== 'aim';
  $('futsalResetAim').hidden = f.stage !== 'charge';
  let message = ft('aimHelp');
  if (f.stage === 'charge') message = ft('chargeHelp');
  if (f.stage === 'flight') message = ft('flying');
  if (f.stage === 'result' || f.stage === 'done') message = ft(f.shot.kind + 'Help');
  if (f.stage === 'done')
    message =
      ft(f.goals >= FUTSAL_RULES.target ? 'win' : 'practice', { goals: f.goals }) +
      ' ' +
      (f.paid ? ft('paid', { amount: money(f.paid) }) : f.goals >= FUTSAL_RULES.target ? ft('cap') : '');
  $('futsalStatus').textContent = message;
  $('futsalStatus').className =
    'futsal-status ' + (f.stage === 'result' || f.stage === 'done' ? f.shot.kind : '');
  $('futsalReward').textContent = ft('reward', {
    amount: money(3000),
    left: Math.max(0, 3 - (state.penalties || 0)),
  });
}
function futsalAction() {
  const f = football;
  if (!f || modalKind !== 'penalty') return;
  if (futsalAssetState() !== 'ready') {
    if (futsalAssetState() === 'failed') loadMapImage('img/characters/futsal-keeper.webp', true);
    futsalRefresh();
    return;
  }
  if (f.stage === 'aim') {
    f.stage = 'charge';
    f.chargeTime = 0;
    f.power = 0;
  } else if (f.stage === 'charge') {
    f.shot = futsalResolveShot(f.aim, f.power, f.keeper);
    f.stage = 'flight';
    f.flightTime = 0;
    beep(440, 0.07);
  } else if (f.stage === 'result') {
    f.stage = 'aim';
    f.shot = null;
    f.power = 0;
  } else if (f.stage === 'done') {
    penaltyGame();
    return;
  }
  futsalRefresh();
}
function futsalFinishShot() {
  const f = football;
  if (!f || f.stage !== 'flight') return;
  f.shots++;
  f.results.push(f.shot.kind);
  if (f.shot.kind === 'goal') f.goals++;
  f.stage = f.shots === FUTSAL_RULES.shots ? 'done' : 'result';
  if (
    f.stage === 'done' &&
    f.goals >= FUTSAL_RULES.target &&
    (state.penalties || 0) < FUTSAL_RULES.rewardLimit
  ) {
    f.paid = FUTSAL_RULES.reward;
    state.money += f.paid;
    state.penalties = (state.penalties || 0) + 1;
    update();
  }
  beep(f.shot.kind === 'goal' ? 900 : 220, 0.1);
  futsalRefresh();
}
function futsalTick(time) {
  const f = football;
  if (!f || modalKind !== 'penalty') {
    futsalFrame = 0;
    return;
  }
  const dt = f.lastTime === null ? 0 : Math.min(0.05, Math.max(0, (time - f.lastTime) / 1000));
  f.lastTime = time;
  const assetState = futsalAssetState();
  if (f.assetState !== assetState) {
    f.assetState = assetState;
    futsalRefresh();
  }
  if (!document.hidden && assetState === 'ready') {
    f.clock += dt;
    if (f.stage === 'aim' || f.stage === 'charge')
      f.keeper = 175 + 55 * Math.sin(f.clock * (1.35 + f.shots * 0.12));
    if (f.stage === 'charge') {
      f.chargeTime += dt;
      f.power = futsalPowerAt(f.chargeTime);
    }
    if (f.stage === 'flight') {
      f.flightTime += dt;
      const progress = futsalClamp((f.flightTime - 0.18) / (f.shot.duration - 0.18), 0, 1);
      f.keeper = f.shot.keeperStart + (f.shot.keeperEnd - f.shot.keeperStart) * progress;
      if (f.flightTime >= f.shot.duration + 0.35) futsalFinishShot();
    }
  }
  $('futsalNeedle').style.left = f.power * 100 + '%';
  $('futsalPowerLabel').textContent =
    f.stage === 'aim'
      ? ft('ready')
      : Math.round(f.power * 100) + '%' + (f.power >= 0.55 && f.power <= 0.78 ? ', ' + ft('sweet') : '');
  futsalDraw(f);
  futsalFrame = requestAnimationFrame(futsalTick);
}
function futsalDraw(f) {
  const c = $('futsalCanvas'),
    g = c.getContext('2d'),
    town = images['img/maps/exterior/1-1.webp'];
  g.clearRect(0, 0, 800, 360);
  if (town?.complete && town.naturalWidth)
    g.drawImage(
      town,
      (1040 / 1536) * town.naturalWidth,
      (680 / 1024) * town.naturalHeight,
      (496 / 1536) * town.naturalWidth,
      (224 / 1024) * town.naturalHeight,
      0,
      0,
      800,
      360,
    );
  else {
    g.fillStyle = '#25674c';
    g.fillRect(0, 0, 800, 360);
  }
  // Aiming and motion cues are functional game geometry over the original pitch art.
  const target = 175 + f.aim * 65;
  if (f.stage === 'aim' || f.stage === 'charge') {
    g.save();
    g.strokeStyle = '#faffd1b3';
    g.lineWidth = 2;
    g.setLineDash([7, 9]);
    g.beginPath();
    g.moveTo(235, 210);
    g.lineTo(FUTSAL_RULES.goalX, target);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#f7ff96';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(FUTSAL_RULES.goalX, target, 12, 0, Math.PI * 2);
    g.moveTo(FUTSAL_RULES.goalX - 18, target);
    g.lineTo(FUTSAL_RULES.goalX + 18, target);
    g.moveTo(FUTSAL_RULES.goalX, target - 18);
    g.lineTo(FUTSAL_RULES.goalX, target + 18);
    g.stroke();
    g.restore();
  }
  const sprite = (im, bounds, x, y, h) => {
    if (!im || !bounds) return;
    const [sx, sy, sw, sh] = bounds,
      w = (h * sw) / sh;
    g.drawImage(im, sx, sy, sw, sh, x - w / 2, y - h, w, h);
  };
  const hero = images['img/characters/hero-traveler.webp'];
  if (hero?.complete && hero.naturalWidth)
    sprite(hero, HERO_FRAMES[1][f.stage === 'flight' ? 1 : 0], 204, 225, 62);
  const keeper = images['img/characters/futsal-keeper.webp'];
  if (keeper?.complete && keeper.naturalWidth) {
    g.save();
    g.translate(661, f.keeper + 21);
    if (f.stage === 'flight') g.rotate(futsalClamp((f.keeper - f.shot.keeperStart) / 100, -0.35, 0.35));
    sprite(keeper, [0, 0, keeper.naturalWidth, keeper.naturalHeight], 0, 0, 78);
    g.restore();
  }
  let bx = 235,
    by = 210,
    scale = 1;
  if (f.shot) {
    const u = futsalClamp(f.flightTime / f.shot.duration, 0, 1);
    bx = 235 + (FUTSAL_RULES.goalX - 235) * u;
    by = 210 + (f.shot.targetY - 210) * u;
    scale = 1 + 0.35 * Math.sin(u * Math.PI);
    if (u === 1 && f.shot.kind === 'saved') bx -= Math.min(40, (f.flightTime - f.shot.duration) * 65);
    if (u === 1 && f.shot.kind === 'goal') bx += Math.min(21, (f.flightTime - f.shot.duration) * 65);
  }
  g.fillStyle = '#102c2966';
  g.beginPath();
  g.ellipse(bx, by + 5, 9, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(bx, by);
  g.rotate(f.flightTime * 12);
  g.fillStyle = '#fffdf0';
  g.strokeStyle = '#203e3a';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 7 * scale, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#203e3a';
  g.fillRect(-2, -2, 4, 4);
  g.restore();
}
onClick(e => {
  const b = e.target.closest('[data-futsal]');
  if (!b || !football || modalKind !== 'penalty') return;
  if (b.dataset.futsal === 'action') futsalAction();
  else if (b.dataset.futsal === 'aim' && football.stage === 'charge') {
    football.stage = 'aim';
    football.power = 0;
    futsalRefresh();
  }
});
document.addEventListener(
  'keydown',
  e => {
    if (!football || modalKind !== 'penalty') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeModal();
      return;
    }
    if (e.key === ' ' && e.target?.tagName !== 'INPUT') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) futsalAction();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (football.stage === 'aim') {
        football.aim = futsalClamp(
          football.aim + (['ArrowUp', 'ArrowLeft'].includes(e.key) ? -0.06 : 0.06),
          -1,
          1,
        );
        $('futsalAim').value = football.aim * 100;
      }
    }
  },
  true,
);
