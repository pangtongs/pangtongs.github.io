/* Battle rules: conditions, moves, damage, evolution and experience. */

// --- Conditions and markers on one creature.
function statusBadge(m) {
  const conditions = Object.entries(m.conditions || {})
    .filter(([k, n]) => STATUS[k] && n > 0)
    .map(
      ([k, n]) =>
        `<span class="status-pill" style="--status:${STATUS[k].color}" title="${STATUS[k].desc}">${I18N.t('status.turns', { name: STATUS[k].name, n })}</span>`,
    );
  const tactical = [
    m.sugar ? I18N.t('battle.tactical.sugar', { n: m.sugar }) : '',
    m.healBlock ? I18N.t('battle.tactical.healBlock', { n: m.healBlock }) : '',
    m.ward ? I18N.t('battle.tactical.ward') : '',
    m.shell ? I18N.t('battle.tactical.shell') : '',
    m.reflect ? I18N.t('battle.tactical.reflect') : '',
    m.interrupted ? I18N.t('battle.tactical.interrupted') : '',
  ]
    .filter(Boolean)
    .map(s => `<span class="status-pill tactical-pill">${s}</span>`);
  return conditions.join('') + tactical.join('');
}
// Hunger is a combat stat: below 25 it weakens attacks, so it is shown with the conditions.
function fullnessBadge(m) {
  const fullness = m.fullness ?? 75;
  return `<span class="fullness-pill ${fullness < 25 ? 'hungry' : ''}" title="${I18N.t('health.fullness.hint')}">${I18N.t('health.fullness', { n: fullness })}</span>`;
}
function clearStatus(m) {
  m.conditions = {};
  m.status = null;
  m.statusTurns = 0;
  m.reflect = false;
  m.interrupted = false;
  m.healBlock = 0;
  m.sugar = 0;
}
function inflict(target, name) {
  const species = SPECIES[target.id],
    types = species.types;
  const named = { name: tr(species.name), status: tr(STATUS[name].name) };
  if (target.heldItem === 'coil' && name === 'sleep') return I18N.t('battle.log.immune', named);
  if (
    (name === 'burn' && types.includes('Api')) ||
    (name === 'paralysis' && types.includes('Listrik')) ||
    (name === 'poison' && types.includes('Logam')) ||
    (name === 'sleep' && target.id === 20)
  )
    return I18N.t('battle.log.immune', named);
  // Someone who has just woken up cannot be put straight back to sleep.
  if (name === 'sleep' && target.sleepGuard > 0) return I18N.t('battle.log.sleepGuard', named);
  if (target.ward) {
    target.ward = 0;
    return I18N.t('battle.log.ward', named);
  }
  normalise(target);
  // Sleep costs exactly one turn, so it is never a gamble on how long it lasts.
  target.conditions[name] = name === 'poison' ? 4 : name === 'sleep' ? 1 : 3;
  return I18N.t('battle.log.inflicted', named);
}
// End of a creature's turn: conditions hurt and count down, then held gear acts.
function tick(m) {
  soakField(m);
  const parts = [];
  if (m.hp && hasCondition(m))
    for (const [status, turns] of Object.entries(m.conditions)) {
      if (!STATUS[status] || turns <= 0) continue;
      if (status === 'poison' || status === 'burn') {
        const loss = Math.min(m.hp, Math.max(1, Math.ceil(m.max * (status === 'poison' ? 0.08 : 0.05))));
        m.hp -= loss;
        parts.push(
          I18N.t('battle.log.dot', {
            name: tr(SPECIES[m.id].name),
            n: loss,
            status: tr(STATUS[status].name),
          }),
        );
      }
      if (--m.conditions[status] <= 0) {
        delete m.conditions[status];
        if (status === 'sleep') m.sleepGuard = 2;
        parts.push(
          I18N.t('battle.log.recovered', { name: tr(SPECIES[m.id].name), status: tr(STATUS[status].name) }),
        );
      }
    }
  let text = parts.join(' ');
  if (!m.hp || !battle) return text;
  const rate =
    m.heldItem === 'lunchbox' ? 0.05 : m.heldItem === 'medkit' ? 0.05 : m.heldItem === 'sambal' ? -0.04 : 0;
  if (rate && !(rate > 0 && m.healBlock)) {
    const hp = m.hp;
    m.hp = Math.max(0, Math.min(m.max, m.hp + Math.sign(rate) * Math.ceil(m.max * Math.abs(rate))));
    if (m.hp !== hp)
      text +=
        ' ' +
        I18N.t('battle.log.heldItem', {
          item: tr(LEAGUE_ITEMS[m.heldItem].name),
          amount: (m.hp > hp ? '+' : '') + (m.hp - hp),
        });
  }
  return text;
}
// Counters that run down once per turn, whatever the turn was spent on.
function passTurn(m) {
  if (m.sleepGuard > 0) m.sleepGuard--;
  if (m.healBlock > 0) m.healBlock--;
  if (m.sugar > 0) m.sugar--;
  Object.keys(m.cooldowns || {}).forEach(i => (m.cooldowns[i] = Math.max(0, m.cooldowns[i] - 1)));
}
// Start of a creature's turn. A non-empty result means the turn is lost.
function beginTurn(m) {
  passTurn(m);
  spendEnergy(m);
  if (m.interrupted) {
    m.interrupted = false;
    return I18N.t('battle.log.whistle', { name: tr(SPECIES[m.id].name) });
  }
  if (hasCondition(m, 'sleep')) return I18N.t('battle.log.asleep', { name: tr(SPECIES[m.id].name) });
  if (hasCondition(m, 'paralysis') && Math.random() < 0.3)
    return I18N.t('battle.log.paralysed', { name: tr(SPECIES[m.id].name) });
  return '';
}

// --- Moves.
function moveDescription(m) {
  const pct = v => Math.round(v * 100);
  const bits = [
    m.power ? I18N.t('move.desc.power', { n: m.power }) : I18N.t('move.desc.support'),
    tr(m.type),
  ];
  if (m.status)
    bits.push(I18N.t('move.desc.status', { n: pct(m.chance ?? 1), status: tr(STATUS[m.status].name) }));
  if (m.heal) bits.push(I18N.t('move.desc.heal', { n: pct(m.heal) }));
  if (m.drain) bits.push(I18N.t('move.desc.drain', { n: pct(m.drain) }));
  if (m.cleanse) bits.push(I18N.t('move.desc.cleanse'));
  if (m.reflect) bits.push(I18N.t('move.desc.reflect'));
  if (m.pierce) bits.push(I18N.t('move.desc.pierce'));
  if (m.interrupt) bits.push(I18N.t('move.desc.interrupt'));
  if (m.recoil) bits.push(I18N.t('move.desc.recoil', { n: pct(m.recoil) }));
  if (m.wetBonus) bits.push(I18N.t('move.desc.wetBonus'));
  if (m.accuracy) bits.push(I18N.t('move.desc.accuracy', { n: m.accuracy * 100 }));
  if (m.cooldown) bits.push(I18N.t('move.desc.cooldown', { n: m.cooldown }));
  if (m.seal) bits.push(I18N.t('move.desc.seal'));
  if (m.mark) bits.push(I18N.t('move.desc.mark'));
  if (m.teamHeal) bits.push(I18N.t('move.desc.teamHeal', { n: pct(m.teamHeal) }));
  if (m.teamCleanse) bits.push(I18N.t('move.desc.teamCleanse'));
  if (m.teamWard) bits.push(I18N.t('move.desc.teamWard'));
  if (m.shell) bits.push(I18N.t('move.desc.shell', { n: pct(m.shell) }));
  if (m.tailwind) bits.push(I18N.t('move.desc.tailwind'));
  if (m.dispel) bits.push(I18N.t('move.desc.dispel'));
  if (m.healBlock) bits.push(I18N.t('move.desc.healBlock'));
  if (isHeavy(m)) bits.push(I18N.t('move.desc.slow'));
  return bits.join(', ');
}
function moveCard(mv, m = null, i = 0, enemy = null) {
  const cd = m?.cooldowns[i] || 0,
    cost = tempoCost(mv),
    // The number shown is the one the hit uses: type matchup (a piercing move ignores
    // resistance) times the arena's rule.
    type = enemy && mv.power ? typeMultiplier(mv.type, enemy) : 1,
    mult = (mv.pierce && type < 1 ? 1 : type) * (enemy && mv.power ? fieldPower(mv) : 1);
  const recovery = mv.cooldown
    ? I18N.t('move.card.recovery', { n: mv.cooldown })
    : I18N.t('move.card.noRecovery');
  return `<span class="move-heading"><b>${mv.name}</b><span class="cooldown" title="${recovery}">${cd ? I18N.t('move.card.cooldown', { n: cd }) : I18N.t('move.card.ready')}</span></span><span class="move-tags"><span style="background:${TYPE_COLORS[mv.type]}">${TYPE_ICONS[mv.type]} ${mv.type}</span><span>${mv.power ? I18N.t('move.desc.power', { n: mv.power }) : I18N.t('move.desc.support')}</span><span>◎ ${Math.round((mv.accuracy ?? 1) * 100)}%</span><span title="${I18N.t('move.card.tempoHint')}">${cost ? 'Tempo −' + cost : 'Tempo +1'}</span>${isHeavy(mv) ? `<span class="move-slow" title="${I18N.t('move.effect.slow')}">${I18N.t('move.card.slow')}</span>` : ''}</span><small>${moveSummary(mv)}</small>${enemy && mv.power ? `<span class="move-matchup ${mult > 1 ? 'effective' : mult < 1 ? 'resisted' : ''}">×${Number(mult.toFixed(2))}${type > 1 ? ' ' + I18N.t('battle.matchup.strong') : type < 1 ? ' ' + I18N.t('battle.matchup.weak') : ''}</span>` : ''}`;
}
// A move in three steps: Tempo and accuracy, then damage, then its side effects.
function useMove(a, d, i) {
  const beforeHP = d.hp;
  if (battle) battle.hit = null;
  const text = attemptMove(a, d, i);
  if (battle && kit(a.id, a)[i]?.power && d.hp < beforeHP) {
    battle.hit = {
      side: d === battle.enemy ? 'enemy' : 'you',
      type: kit(a.id, a)[i].type,
      damage: beforeHP - d.hp,
      expiresAt: Date.now() + 300,
    };
  }
  playCue(a.lastMiss ? 'error' : kit(a.id, a)[i]?.heal ? 'heal' : 'hit');
  return text;
}
function attemptMove(a, d, i) {
  const mv = kit(a.id, a)[i];
  if (!mv) return '';
  const cost = tempoCost(mv);
  if (tempo(a) < cost) return I18N.t('battle.log.noTempo');
  // A full Tempo bar powers up the next light move instead of going to waste.
  const surge = !cost && tempo(a) === 3;
  a.tempo = Math.min(3, tempo(a) + (cost ? -cost : 1));
  a.cooldowns[i] = mv.cooldown || 0;
  a.braced = false;
  const accuracy = Math.min(
    1,
    (mv.accuracy ?? 1) + (a.focused ? 0.12 : 0) + (state.team.includes(a) && mealBuff('focus') ? 0.08 : 0),
  );
  a.focused = false;
  if (Math.random() > accuracy) {
    a.lastMiss = true;
    return I18N.t('battle.log.miss', { name: tr(SPECIES[a.id].name), move: tr(mv.name) });
  }
  a.lastMiss = false;
  a.turnDamage =
    1 +
    (a.id === 19 && hasCondition(d, 'soaked') ? 0.15 : 0) +
    (a.heldItem === 'turbine' && mv.type === 'Listrik' ? 0.2 : 0) +
    (surge ? 0.2 : 0);
  const result = applyMoveEffects(a, d, i);
  a.turnDamage = 1;
  return result;
}
function applyMoveEffects(a, d, i) {
  const mv = kit(a.id, a)[i];
  if (!mv) return '';
  const burning = hasCondition(d, 'burn'),
    sugar = d.sugar > 0,
    beforeHP = d.hp,
    healBlocked = a.healBlock > 0;
  let text = '';
  if (mv.dispel) {
    d.shell = 0;
    d.reflect = false;
    d.ward = 0;
    text += I18N.t('battle.log.dispel') + ' ';
  }
  text += strikeWithMove(a, d, i);
  const hit = mv.power && d.hp < beforeHP;
  if (hit && burning && [0, 12].includes(a.id) && mv.type === 'Api' && d.hp > 0) {
    const dmg = Math.min(d.hp, 3 + Math.ceil(a.level * 0.25));
    d.hp -= dmg;
    text += ' ' + I18N.t('battle.log.sambal', { n: dmg });
  }
  if (hit && sugar && ['Api', 'Listrik'].includes(mv.type) && d.hp > 0) {
    const dmg = Math.min(d.hp, 6 + Math.ceil(a.level * 0.4));
    d.hp -= dmg;
    d.sugar = 0;
    text += ' ' + I18N.t('battle.log.sugarCombo', { n: dmg });
  }
  if (healBlocked && (mv.heal || mv.drain)) text += ' ' + I18N.t('battle.log.healBlocked');
  if (a.hp > 0) {
    if (mv.shell) {
      a.shell = mv.shell;
      text += ' ' + I18N.t('battle.log.shell');
    }
    if (mv.teamHeal) {
      let total = 0;
      for (const ally of alliesFor(a)) {
        if (ally.hp <= 0 || ally.healBlock) continue;
        const amount = Math.min(ally.max - ally.hp, Math.ceil(ally.max * mv.teamHeal));
        ally.hp += amount;
        total += amount;
      }
      text += ' ' + I18N.t('battle.log.teamHeal', { n: total });
    }
    if (mv.teamCleanse) {
      alliesFor(a).forEach(clearStatus);
      text += ' ' + I18N.t('battle.log.teamCleanse');
    }
    if (mv.teamWard) {
      alliesFor(a)
        .filter(m => m.hp > 0)
        .forEach(m => (m.ward = 1));
      text += ' ' + I18N.t('battle.log.teamWard');
    }
    if (mv.tailwind) {
      alliesFor(a).forEach(m =>
        Object.keys(m.cooldowns).forEach(k => {
          if (m !== a || Number(k) !== i) m.cooldowns[k] = Math.max(0, m.cooldowns[k] - 1);
        }),
      );
      text += ' ' + I18N.t('battle.log.tailwind');
    }
  }
  if (d.hp > 0) {
    if (mv.mark) {
      d.sugar = 4;
      text += ' ' + I18N.t('battle.log.sugar');
    }
    if (mv.healBlock) {
      d.healBlock = 3;
      text += ' ' + I18N.t('battle.log.healBlock');
    }
    if (mv.seal) {
      const best = kit(d.id, d)
        .map((m, i) => ({ m, i }))
        .filter(v => v.i > 0 && v.m.power > 0)
        .sort((a, b) => b.m.power - a.m.power)[0];
      if (best) {
        d.cooldowns[best.i] = Math.max(d.cooldowns[best.i] || 0, 2);
        text += ' ' + I18N.t('battle.log.seal', { move: tr(best.m.name) });
      }
    }
  }
  return text;
}
function strikeWithMove(a, d, index) {
  const mv = kit(a.id, a)[index];
  if (!mv) return '';
  a.cooldowns[index] = mv.cooldown ?? 0;
  let text = I18N.t('battle.log.move', { name: tr(SPECIES[a.id].name), move: tr(mv.name) });
  if (mv.power) {
    let mult = typeMultiplier(mv.type, d);
    if (mv.pierce && mult < 1) mult = 1;
    let dmg = Math.round(
      (mv.power + a.level * 0.65) *
        levelDamageScale(a, d) *
        mult *
        (0.9 + Math.random() * 0.2) *
        (hasCondition(a, 'burn') ? 0.8 : 1) *
        (a.fullness < 25 ? 0.85 : 1) *
        (SPECIES[a.id].types.includes(mv.type) ? 1.2 : 1) *
        (hasCondition(d, 'sleep') || hasCondition(d, 'paralysis') ? 1.1 : 1) *
        (hasAura(a.id) ? AURA_DEALT : 1) *
        (hasAura(d.id) ? AURA_TAKEN : 1) *
        (SPECIES_TRAITS[a.id].attack / SPECIES_TRAITS[d.id].defence) *
        (state.team.includes(a) && mealBuff('power') ? 1.1 : 1) *
        (state.team.includes(d) && mealBuff('guard') ? 0.9 : 1),
    );
    if (mv.wetBonus && hasCondition(d, 'soaked')) dmg = Math.round(dmg * 1.25);
    if (a.heldItem === 'scarf') dmg = Math.round(dmg * 1.12);
    if (d.heldItem === 'vest') dmg = Math.round(dmg * 0.88);
    dmg = Math.round(dmg * (a.turnDamage || 1) * gearDamage(a, d, mv) * fieldPower(mv));
    if (d.braced) {
      dmg = Math.round(dmg * 0.45);
      d.braced = false;
    }
    dmg = Math.max(3, dmg);
    if (d.shell) {
      dmg = Math.max(1, Math.round(dmg * (1 - d.shell)));
      d.shell = 0;
    }
    const dealt = Math.min(d.hp, dmg);
    d.hp -= dealt;
    text += ` −${dealt} HP.${mult > 1 ? ' ' + I18N.t('battle.log.superEffective') : mult < 1 ? ' ' + I18N.t('battle.log.notEffective') : ''}`;
    if (d.reflect && !mv.pierce) {
      const back = Math.max(1, Math.round(dealt * 0.35));
      a.hp = Math.max(0, a.hp - back);
      d.reflect = false;
      text += ' ' + I18N.t('battle.log.reflected', { n: back });
    }
    if (mv.drain && a.hp > 0 && !a.healBlock) {
      const h = Math.min(a.max - a.hp, Math.round(dealt * mv.drain));
      a.hp += h;
      text += ' ' + I18N.t('battle.log.drain', { n: h });
    }
    if (mv.recoil) {
      const back = Math.ceil(dealt * mv.recoil);
      a.hp = Math.max(0, a.hp - back);
      text += ' ' + I18N.t('battle.log.recoil', { n: back });
    }
  }
  if (mv.heal && a.hp > 0 && !a.healBlock) {
    const h = Math.min(a.max - a.hp, Math.ceil(a.max * mv.heal));
    a.hp += h;
    text += ' ' + I18N.t('battle.log.heal', { n: h });
  }
  if (mv.cleanse) {
    clearStatus(a);
    text += ' ' + I18N.t('battle.log.cleanse');
  }
  if (mv.status && d.hp > 0 && Math.random() < (mv.chance ?? 1)) text += ' ' + inflict(d, mv.status);
  if (mv.reflect) a.reflect = true;
  if (mv.interrupt && d.hp > 0) d.interrupted = true;
  return text;
}

function checkEvolution(m) {
  const e = EVOLUTIONS[m.id];
  if (!e || m.level < e.level) return '';
  const old = SPECIES[m.id].name,
    growth = Math.max(0, SPECIES[e.to].base - SPECIES[m.id].base);
  m.id = e.to;
  m.max += growth;
  if (m.hp > 0) m.hp = Math.min(m.max, m.hp + growth);
  m.cooldowns = {};
  if (!state.seen.includes(m.id)) state.seen.push(m.id);
  return I18N.t('battle.log.evolved', { old: tr(old), name: tr(SPECIES[m.id].name) });
}
// Equal-level battles retain their balance. Experience improves damage and resilience.
function levelDamageScale(attacker, defender) {
  return Math.max(
    0.35,
    Math.min(2.2, Math.pow((Math.max(1, attacker.level) + 20) / (Math.max(1, defender.level) + 20), 0.65)),
  );
}
// Legends and the rare bird fight with an aura: harder hits, and blows soften against them.
// It is kept light, so a legend on the team is an edge rather than the whole plan.
const AURA_DEALT = 1.07,
  AURA_TAKEN = 0.93;
const hasAura = id => !!(SPECIES[id]?.legendary || SPECIES[id]?.rarity === 'rare');
function hasCondition(m, name) {
  return name ? !!m.conditions?.[name] : Object.values(m.conditions || {}).some(n => n > 0);
}
function spendEnergy(m, amount = 3) {
  m.fullness = Math.max(0, (m.fullness ?? 75) - amount);
}
const TYPE_COLORS = {
  Api: '#bd4527',
  Air: '#267ba4',
  Daun: '#467d35',
  Batu: '#846743',
  Logam: '#606c80',
  Listrik: '#967400',
  Angin: '#427c87',
  Normal: '#796589',
};
const tempo = m => Math.max(0, Math.min(3, m.tempo ?? 1));
const tempoCost = mv => mv.tempoCost ?? ((mv.cooldown || 0) >= 3 ? 2 : mv.power >= 22 ? 1 : 0);
// A heavy move spends 2 Tempo and needs a wind-up: the player's lands after the enemy acts.
const isHeavy = mv => tempoCost(mv) >= 2;
function planEnemy() {
  if (!battle) return;
  const a = battle.enemy,
    d = state.team[0];
  const options = kit(a.id, a)
    .map((mv, i) => ({ mv, i }))
    .filter(v => !(a.cooldowns[v.i] > 0) && tempo(a) >= tempoCost(v.mv));
  // A trainer's style (TRAINER_TACTICS) tilts the weights; wild creatures use the plain ones.
  const style = battle.style,
    weight = { hit: 1, status: 12, tactics: 1, heal: 75, shield: 0 };
  if (style === 'aggressive') Object.assign(weight, { hit: 1.2, status: 0 });
  if (style === 'status') Object.assign(weight, { status: 30, tactics: 1.5 });
  if (style === 'guard') Object.assign(weight, { heal: 110, shield: 15 });
  // A trainer with a plan also counts its own-type bonus and takes a knockout when it sees one.
  const planned = !!style,
    own = mv => (planned && SPECIES[a.id].types.includes(mv.type) ? 1.2 : 1),
    finishes = mv =>
      planned &&
      mv.power &&
      (mv.power + a.level * 0.65) * levelDamageScale(a, d) * typeMultiplier(mv.type, d) * own(mv) * 0.9 >=
        d.hp;
  const pick = options
    .map(v => ({
      ...v,
      score:
        (v.mv.power || 0) * (v.mv.accuracy ?? 1) * typeMultiplier(v.mv.type, d) * own(v.mv) * weight.hit +
        (finishes(v.mv) ? 40 * (v.mv.accuracy ?? 1) : 0) +
        tacticalMoveScore(v.mv, a, d) * weight.tactics +
        (v.mv.heal ? (1 - a.hp / a.max) * weight.heal : 0) +
        (v.mv.status && !hasCondition(d, v.mv.status) ? weight.status : 0) +
        ((v.mv.shell && !a.shell) || (v.mv.reflect && !a.reflect) || (v.mv.teamWard && !a.ward)
          ? weight.shield
          : 0) +
        (v.mv.tempoCost === 0 && tempo(a) < 2 ? 15 : 0),
    }))
    .sort((a, b) => b.score - a.score)[0];
  battle.intent = pick?.i ?? -1;
}
/* Describe effects from the move data, rather than a generic Tempo slogan. */
function moveSummary(m) {
  const pct = v => Math.round(v * 100);
  const effects = [];
  if (m.status)
    effects.push(I18N.t('move.effect.status', { n: pct(m.chance ?? 1), status: tr(STATUS[m.status].name) }));
  // Flags in the order the summary lists them; the ones with a share carry it as {n}.
  const flags = {
    heal: m.heal,
    drain: m.drain,
    recoil: m.recoil,
    cleanse: 0,
    reflect: 0,
    pierce: 0,
    interrupt: 0,
    wetBonus: 0,
    seal: 0,
    mark: 0,
    teamHeal: m.teamHeal,
    teamCleanse: 0,
    teamWard: 0,
    shell: m.shell,
    tailwind: 0,
    dispel: 0,
    healBlock: 0,
  };
  for (const [flag, share] of Object.entries(flags))
    if (m[flag]) effects.push(I18N.t(`move.effect.${flag}`, share ? { n: pct(share) } : {}));
  if (isHeavy(m)) effects.push(I18N.t('move.effect.slow'));
  return (
    effects.join(' ') ||
    (tempoCost(m) === 0 ? I18N.t('move.effect.light') : I18N.t('move.effect.direct', { n: tempoCost(m) }))
  );
}
function gearDamage(a, d, mv) {
  let n = 1;
  // Healing and rescue gear costs some punch. The vest already trades nothing but its
  // slot: with a 10% damage cut on top it lost more fights than no gear at all.
  if (['lunchbox', 'rescue', 'medkit'].includes(a.heldItem)) n *= 0.9;
  if (a.heldItem === 'sambal') n *= 1.25;
  if (a.heldItem === 'capacitor') n *= 1.15;
  if (d.heldItem === 'scarf') n *= 1.1;
  if (d.heldItem === 'capacitor') n *= 1.15;
  if (d.heldItem === 'coil' && mv.type === 'Api') n *= 1.25;
  if (d.heldItem === 'umbrella') n *= mv.type === 'Air' ? 0.7 : mv.type === 'Listrik' ? 1.25 : 1;
  return n;
}
function combatStats(id, m = null) {
  const level = m?.level || 30,
    hp = m?.max || SPECIES[id].base + level * 5;
  return `<section class="combat-stats"><div><small>${I18N.t('battle.stats.maxHp', { level })}</small><b>${hp}</b></div><div><small>${I18N.t('battle.stats.power')}</small><b>${kit(
    id,
    m,
  )
    .filter(mv => mv.power)
    .map(mv => mv.power)
    .join(
      ' / ',
    )}</b></div><div><small>${I18N.t('battle.stats.attack')}</small><b>${traitLabel(SPECIES_TRAITS[id].attack)}</b></div><div><small>${I18N.t('battle.stats.defence')}</small><b>${traitLabel(SPECIES_TRAITS[id].defence)}</b></div></section>`;
}
// A trait as the change it makes: +4%, −3%, or ±0%.
function traitLabel(n) {
  const pct = Math.round((n - 1) * 100);
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${-pct}%` : '±0%';
}
// XP follows the gap in levels: an easy win teaches little, a strong opponent teaches
// a lot. Teammates at least three levels behind the strongest member learn double.
function xpFor(m, enemy) {
  const gap = Math.max(0.3, Math.min(1.5, (enemy.level / Math.max(1, m.level)) ** 2));
  return Math.max(3, Math.round(enemy.level * (battle?.rematch ? 3 : 8) * gap));
}
function gainXP(enemy) {
  const highest = Math.max(...state.team.map(m => m.level)),
    lead = state.team[0],
    messages = [];
  let catchingUp = false,
    leadAmount = 0;
  for (const m of state.team) {
    const extra = highest - m.level >= 3 ? 2 : 1,
      amount = xpFor(m, enemy) * extra,
      moves = kit(m.id, m).length;
    catchingUp ||= extra > 1;
    if (m === lead) leadAmount = amount;
    m.xp += amount;
    while (m.xp >= m.level * 20) {
      m.xp -= m.level * 20;
      m.level++;
      m.max += 5;
      if (m.hp > 0) m.hp = Math.min(m.max, m.hp + 10);
      messages.push(SPECIES[m.id].name + ' Lv.' + m.level);
    }
    const evolution = checkEvolution(m);
    if (evolution) messages.push(evolution);
    else if (kit(m.id, m).length > moves)
      messages.push(I18N.t('battle.learned', { name: SPECIES[m.id].name, move: kit(m.id, m).at(-1).name }));
  }
  return `${I18N.t('battle.xp', { n: leadAmount, name: SPECIES[lead.id].name })}${catchingUp ? ', ' + I18N.t('battle.xp.catchUp') : ''}${messages.length ? ', ' + messages.join(', ') : ''}`;
}
