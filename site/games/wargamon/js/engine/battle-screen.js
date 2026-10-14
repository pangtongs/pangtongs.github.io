/* What the player sees in battle: the battle screen, trainer introductions and the
   capture, switch and item pickers. */

// --- Battle screen.
const HIT_EFFECT_TYPES = ['Api', 'Air', 'Daun', 'Batu', 'Logam', 'Listrik', 'Angin', 'Normal'];
function battleHitMarkup(side) {
  const hit = battle?.hit;
  if (!hit || hit.side !== side || hit.expiresAt <= Date.now()) return '';
  const found = HIT_EFFECT_TYPES.indexOf(hit.type),
    index = found < 0 ? 7 : found;
  return `<span class="battle-hit-effect" aria-hidden="true" style="background-position:${((index % 4) * 100) / 3}% ${Math.floor(index / 4) * 100}%"></span><span class="battle-damage-number" aria-hidden="true">−${hit.damage}</span>`;
}
function renderBattle() {
  if (!battle) return;
  // Where the team stood when the fight began, for the progress shown after a win.
  battle.startProgress ??= new Map(state.team.map(m => [m, xpTotal(m)]));
  const b = battle,
    m = normalise(state.team[0]),
    e = normalise(b.enemy),
    wild = b.trainer === null,
    off = b.busy ? 'disabled' : '';
  const teammate = state.team.find((mon, i) => i > 0 && mon.hp > 0);
  const teammateIcon = teammate
    ? art(teammate.id).replace('class="sprite', 'class="battle-team-icon sprite')
    : '';
  const fighter = (mon, side) => {
    const effect = battleHitMarkup(side);
    return `<div class="fighter ${side}${effect ? ' fighter-hit' : ''}"><div class="fighter-art">${monArt(mon)}${effect}</div><div class="fighter-info"><strong>${monName(mon)}</strong><small>${typeLabel(mon.id)}, Lv.${mon.level}</small>${hpBar(mon)}<small>${mon.hp}/${mon.max} HP</small>${state.team.includes(mon) ? xpBar(mon) : ''}${statusBadge(mon)}${heldItemPill(mon)}${side === 'you' ? fullnessBadge(mon) + mealBuffBadge() : ''}</div></div>`;
  };
  // Every control carries its keyboard key, always visible (see BATTLE_KEYS in game.js).
  const key = k => `<kbd class="battle-key" aria-hidden="true">${k}</kbd>`;
  const moves = kit(m.id, m)
    .map((mv, i) => {
      const cooling = m.cooldowns[i] > 0,
        short = tempo(m) < tempoCost(mv),
        reason = cooling
          ? I18N.t('battle.reason.cooldown', { n: m.cooldowns[i] })
          : short
            ? I18N.t('battle.reason.tempo', { n: tempoCost(mv) })
            : '';
      // The card shows one line of the effect; the whole text is the button's tooltip.
      return `<button data-act="battle" data-move="m${i}" title="${moveSummary(mv)
        .replace(/<[^>]*>/g, '')
        .replace(
          /"/g,
          '&quot;',
        )}" ${b.busy || cooling || short ? 'disabled' : ''}>${key(i + 1)}${moveCard(mv, m, i, b.enemy)}${reason ? `<span class="move-reason">${reason}</span>` : ''}</button>`;
    })
    .join('');
  const tools = `<button data-act="battle" data-move="brace" ${off}>${key('B')}${I18N.t('battle.tool.brace')}</button><button data-every="catchmenu" ${b.busy || !wild || b.noCatch ? 'disabled' : ''}>${key('C')}${itemIcon('balls')}${I18N.t('battle.tool.catch')}</button><button data-every="switch" ${b.busy || !teammate ? 'disabled' : ''}>${key('S')}${teammateIcon}${I18N.t('battle.tool.switch')}</button><button data-every="bag" ${off || (b.guest?.noItems ? 'disabled' : '')}>${key('I')}${itemIcon('potions')}${I18N.t('battle.item.action')}</button>${wild ? `<button class="battle-run" data-act="battle" data-move="run" ${off}>${key('R')}${I18N.t('battle.tool.run')}</button>` : ''}`;
  // The log keeps the last two events, so your move stays visible above the enemy's reply.
  const lines = (b.lines ??= []),
    last = lines.at(-1);
  if (last !== undefined && b.log.startsWith(last)) lines[lines.length - 1] = b.log;
  else if (b.log !== last) lines.push(b.log);
  if (lines.length > 2) lines.shift();
  const log = lines
    .map((line, i) => `<p${i < lines.length - 1 ? ' class="earlier"' : ''}>${line}</p>`)
    .join('');
  // The roster and Tempo strip come from the catalog already; everything else is translated here.
  const pips = [0, 1, 2].map(i => `<i class="${i < tempo(m) ? 'filled' : ''}"></i>`).join('');
  const intent = `<div class="battle-intent"><span class="tempo-caption">${I18N.t('battle.tempo')}</span><span class="tempo-pips" aria-label="${I18N.t('battle.tempo.value', { current: tempo(m) })}">${pips}</span>${tempo(m) === 3 ? `<span class="tempo-full">${I18N.t('battle.tempo.full')}</span>` : ''}<button class="battle-speed" data-every="speed">${key('X')}${I18N.t('settings.speed', { n: battleSpeed })}</button></div>${battleTips()}`;
  const html = `<div class="battle-head">${wild ? '' : trainerArt(battleTrainer(b).portrait)}<span>${wild ? b.header || I18N.t('battle.wildHeader') : battleTrainer(b).name.toUpperCase() + '<br>'}<!--roster--></span>${fieldChip(b)}</div>${fighter(e, 'enemy')}${fighter(m, 'you')}<div class="battle-menu status-combat"><!--intent--><div class="battle-log" role="status">${log}</div><div class="creature-moves">${moves}</div><div class="battle-tools">${tools}</div></div>`;
  $('battle').innerHTML = translateHTML(html)
    .replace('<!--roster-->', () => trainerRoster(b))
    .replace('<!--intent-->', () => intent);
  battleBackdrop();
}

// Held gear is never a secret: both sides show what they carry.
function heldItemPill(mon) {
  const item = LEAGUE_ITEMS[mon.heldItem];
  return item
    ? `<span class="status-pill tactical-pill" title="${item.desc}">${I18N.t('battle.heldItem', { item: item.name })}</span>`
    : '';
}
// What a trainer with a plan brings besides the team: their style and their Jamu.
function trainerPlan(id) {
  const t = TRAINER_TACTICS[id];
  return t
    ? `<p class="trainer-plan">${I18N.t(`trainer.style.${t.style}`)} ${I18N.t('trainer.potions', { n: t.potions })}${trainerLineup(id).length > trainerTeam(id).length ? ' ' + I18N.t('trainer.reserve') : ''}</p>`
    : '';
}
// The first trainer battle explains Tempo, the matchup badge and Brace, once; the first
// wild fight (usually the very first fight) explains catching, once.
function battleTips() {
  if (!battle) return '';
  if (battle.trainer === null) {
    // An event boss (calendar.js) cannot be caught, so it has no catching tips.
    if (state.tipsSeen?.catch || battle.noCatch) return '';
    return `<div class="battle-tips" role="note"><b>${I18N.t('battle.tips.catchTitle')}</b><ol><li>${I18N.t('battle.tips.weaken')}</li><li>${I18N.t('battle.tips.capsule')}</li><li>${I18N.t('battle.tips.run')}</li></ol><button class="action" data-every="tipsok" data-tip="catch">${I18N.t('battle.tips.ok')}</button></div>`;
  }
  if (state.tipsSeen?.battle) return '';
  return `<div class="battle-tips" role="note"><b>${I18N.t('battle.tips.title')}</b><ol><li>${I18N.t('battle.tips.tempo')}</li><li>${I18N.t('battle.tips.matchup')}</li><li>${I18N.t('battle.tips.brace')}</li><li>${I18N.t('battle.tips.heavy')}</li>${touchOnly() ? '' : `<li>${I18N.t('battle.tips.keys')}</li>`}</ol><button class="action" data-every="tipsok" data-tip="battle">${I18N.t('battle.tips.ok')}</button></div>`;
}
// An arena rule stays on screen for the whole fight, not only in the opening log line.
function fieldChip(b) {
  return b.field
    ? `<span class="field-chip field-${b.field}" title="${I18N.t(`field.${b.field}.note`)}">${I18N.t(`field.${b.field}.chip`)}</span>`
    : '';
}
// All the XP a creature has earned, so progress across level-ups can be measured.
const xpTotal = m => 10 * m.level * (m.level - 1) + (Number(m.xp) || 0);
// After a win: each teammate's XP gained, any level reached, and the bar to the next level.
function victoryProgress(b) {
  const start = b?.startProgress;
  if (!start) return '';
  const rows = state.team
    .filter(m => start.has(m))
    .map(m => {
      const gained = xpTotal(m) - start.get(m),
        before = levelAt(start.get(m)),
        up = m.level > before;
      return `<div class="victory-row">${monArt(m)}<div><b>${monName(m)}</b> <span class="victory-xp">+${gained} XP</span>${up ? ` <span class="victory-level">${I18N.t('battle.victory.levelUp', { from: before, to: m.level })}</span>` : ''}${xpBar(m)}</div></div>`;
    })
    .join('');
  return rows ? `<div class="victory-progress">${rows}</div>` : '';
}
function levelAt(total) {
  let level = 1;
  while (10 * (level + 1) * level <= total) level++;
  return level;
}
// The lead's progress in one line, for the short note after a wild win.
function leadProgressText() {
  const m = state.team[0];
  return m
    ? I18N.t('battle.win.progress', {
        name: tr(SPECIES[m.id].name),
        level: m.level,
        xp: m.xp,
        need: m.level * 20,
      })
    : '';
}
// Number badge for an option in a pick dialog (keys 1 to 9).
const pickKey = i => (i < 9 ? `<kbd class="pick-key" aria-hidden="true">${i + 1}</kbd>` : '');
// --- Before a trainer fight: why it is closed, or who you are about to face.
function showTrainerIntro(id, intro = null) {
  if (ELITE_IDS.includes(id) && !canChallenge(id)) {
    leagueMenu();
    return;
  }
  if (!canChallenge(id) && lockedLeaderScene(id)) return;
  const t = TRAINERS[id],
    beaten = state.defeated.includes(id),
    // A beaten trainer says their after-battle line instead of the first challenge.
    line = intro ?? (beaten ? TRAINER_REMATCH_LINES[id] || t.win : t.line);
  modal(
    `<div class="portrait-head">${trainerArt(t.portrait)}<div><span class="eyebrow">${t.role.toUpperCase()}</span><h2>${t.name}</h2><p>${beaten ? I18N.t('trainer.rematchNote') : `${trainerLineup(id).length} Wargamon, ${I18N.t('ui.trainer.match')}`}</p></div></div><p>“${line}”</p>${fieldRuleNote(id)}<div class="opponent-team">${trainerLineup(
      id,
    )
      .map(
        ({ sid, lv, item }) =>
          `<div class="opponent-mon">${art(sid, true)}<span>${SPECIES[sid].name}<br>Lv.${lv}, ${typeLabel(sid)}${LEAGUE_ITEMS[item] ? `<br><small>${I18N.t('battle.heldItem', { item: LEAGUE_ITEMS[item].name })}</small>` : ''}</span></div>`,
      )
      .join(
        '',
      )}</div>${trainerPlan(id)}<div class="actions"><button class="action" data-act="starttrainer" data-id="${id}">${I18N.t('trainer.start')}</button><button class="secondary" data-act="team">${I18N.t('trainer.prepare')}</button></div>`,
    'trainer',
  );
}
function catchMenu() {
  if (!battle || battle.busy || locked || battle.trainer !== null || battle.noCatch) return;
  modal(
    `<h2>${I18N.t('battle.tool.catch')}</h2><div class="bag-medicine-grid">${['balls', 'ultraballs'].map((k, i) => `<button data-every="catch" data-pick data-key="${k}" ${!itemCount(k) ? 'disabled' : ''}>${pickKey(i)}${itemIcon(k)}<b>${I18N.t(`item.${k}.name`)}</b><span>×${itemCount(k)}</span><small class="catch-odds">${I18N.t('battle.catchOdds', { n: Math.round(catchChance(battle.enemy, k === 'ultraballs') * 100) })}</small></button>`).join('')}</div>`,
    'catch',
    closeButton(I18N.t('common.back')),
  );
}
// How a teammate would fare: its best hit on the enemy, and the enemy's best on it.
function switchMatchup(mon) {
  const e = battle.enemy,
    best = (from, to) =>
      Math.max(
        1e-9,
        ...kit(from.id, from)
          .filter(mv => mv.power)
          .map(mv => typeMultiplier(mv.type, to)),
      );
  const out = best(mon, e),
    back = best(e, mon),
    tag = n => (n > 1 ? 'effective' : n < 1 ? 'resisted' : '');
  return `<span class="switch-matchup"><span class="${tag(out)}">${I18N.t('battle.switch.attack', { n: Number(out.toFixed(2)) })}</span><span class="${tag(back) === 'effective' ? 'resisted' : tag(back) === 'resisted' ? 'effective' : ''}">${I18N.t('battle.switch.defend', { n: Number(back.toFixed(2)) })}</span></span>`;
}
function battleSwitchMenu() {
  if (!battle || battle.busy || locked) return;
  modal(
    `<h2>${I18N.t('battle.tool.switch')}</h2><p>${I18N.t('battle.switch.turn')}</p><div class="medicine-target-grid">${state.team.map((mon, i) => `<button class="medicine-target" data-act="lead" data-id="${i}" data-pick ${i === 0 || !mon.hp ? 'disabled' : ''}>${pickKey(i)}${art(mon.id)}<span class="medicine-target-info"><b>${SPECIES[mon.id].name}</b><span>Lv.${mon.level}, HP ${mon.hp}/${mon.max}</span>${i > 0 && mon.hp ? switchMatchup(mon) : ''}${health(mon)}${statusBadge(mon)}<span class="medicine-target-result">${I18N.t(i === 0 ? 'battle.switch.current' : mon.hp ? 'battle.switch.pick' : 'team.fainted')}</span></span></button>`).join('')}</div>`,
    'battle-switch',
    closeButton(I18N.t('battle.backToFight')),
  );
}
function battleItemMenu() {
  if (!battle || battle.busy || locked) return;
  // Menara Tanding floors are fought without the bag.
  if (battle.guest?.noItems) {
    toast(I18N.t('tower.noItems'));
    return;
  }
  const items = BAG_MEDICINES.map((key, i) => {
    const item = medicineInfo(key),
      available = state.team.some(mon => canUseMedicine(key, mon));
    return `<button class="bag-medicine" data-over="medmenu" data-pick data-key="${key}" ${available ? '' : 'disabled'}>${pickKey(i)}${itemIcon(key)}<span class="bag-item-heading"><b>${item.name}</b><span class="bag-quantity">×${itemCount(key)}</span></span><span class="bag-item-effect">${item.desc}</span></button>`;
  }).join('');
  modal(
    `<h2>${I18N.t('battle.item.action')}</h2><p>${I18N.t('battle.item.turn')}</p><div class="bag-medicine-grid">${items}</div>`,
    'battle-items',
    closeButton(I18N.t('battle.backToFight')),
  );
}
function trainerRoster(b) {
  if (b.trainer === null) return '';
  const alive = b.enemies.filter(mon => mon.hp > 0).length,
    fallen = b.enemies.length - alive;
  const capsules = b.enemies
    .map((mon, i) => {
      const status = mon.hp <= 0 ? 'fallen' : i === b.index ? 'active' : 'ready';
      const label = I18N.t(`battle.roster.${status}`, { name: SPECIES[mon.id].name });
      return `<span class="roster-capsule ${status}" title="${label}" role="img" aria-label="${label}"><i></i></span>`;
    })
    .join('');
  return `<span class="trainer-roster" aria-label="${I18N.t('battle.roster.summary', { alive, fallen })}"><span class="roster-icons">${capsules}</span><small>${I18N.t('battle.roster.summary', { alive, fallen })}</small></span>`;
}
