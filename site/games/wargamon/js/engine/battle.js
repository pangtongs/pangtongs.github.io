/* Battle rules: conditions, moves, damage, evolution and experience. */

// --- Conditions and markers on one creature.
function statusBadge(m) {
  const conditions = Object.entries(m.conditions || {})
    .filter(([k, n]) => STATUS[k] && n > 0)
    .map(
      ([k, n]) =>
        `<span class="status-pill" style="--status:${STATUS[k].color}" title="${STATUS[k].desc}">${STATUS[k].name}, ${n}</span>`,
    );
  const tactical = [
    m.sugar ? 'Gula, ' + m.sugar + ', Api/Listrik' : '',
    m.healBlock ? 'Pemulihan terkunci, ' + m.healBlock : '',
    m.ward ? 'Lentera status' : '',
    m.shell ? 'Tameng kerupuk' : '',
    m.reflect ? 'Pantulan siap' : '',
    m.interrupted ? 'Giliran terganggu' : '',
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
  if (target.heldItem === 'coil' && name === 'sleep') return species.name + ' kebal Tidur.';
  if (
    (name === 'burn' && types.includes('Api')) ||
    (name === 'paralysis' && types.includes('Listrik')) ||
    (name === 'poison' && types.includes('Logam')) ||
    (name === 'sleep' && target.id === 20)
  )
    return `${species.name} kebal ${STATUS[name].name}.`;
  // Someone who has just woken up cannot be put straight back to sleep.
  if (name === 'sleep' && target.sleepGuard > 0) return `${species.name} masih segar, tidak tertidur.`;
  if (target.ward) {
    target.ward = 0;
    return `Lentera melindungi ${species.name} dari ${STATUS[name].name}!`;
  }
  normalise(target);
  // Sleep costs exactly one turn, so it is never a gamble on how long it lasts.
  target.conditions[name] = name === 'poison' ? 4 : name === 'sleep' ? 1 : 3;
  return `${species.name}: ${STATUS[name].name}!`;
}
// End of a creature's turn: conditions hurt and count down, then held gear acts.
function tick(m) {
  const parts = [];
  if (m.hp && hasCondition(m))
    for (const [status, turns] of Object.entries(m.conditions)) {
      if (!STATUS[status] || turns <= 0) continue;
      if (status === 'poison' || status === 'burn') {
        const loss = Math.min(m.hp, Math.max(1, Math.ceil(m.max * (status === 'poison' ? 0.08 : 0.05))));
        m.hp -= loss;
        parts.push(`${SPECIES[m.id].name} −${loss} HP (${STATUS[status].name}).`);
      }
      if (--m.conditions[status] <= 0) {
        delete m.conditions[status];
        if (status === 'sleep') m.sleepGuard = 2;
        parts.push(`${SPECIES[m.id].name} pulih dari ${STATUS[status].name}.`);
      }
    }
  let text = parts.join(' ');
  if (!m.hp || !battle) return text;
  const rate =
    m.heldItem === 'lunchbox' ? 0.05 : m.heldItem === 'medkit' ? 0.08 : m.heldItem === 'sambal' ? -0.04 : 0;
  if (rate && !(rate > 0 && m.healBlock)) {
    const hp = m.hp;
    m.hp = Math.max(0, Math.min(m.max, m.hp + Math.sign(rate) * Math.ceil(m.max * Math.abs(rate))));
    if (m.hp !== hp)
      text += ' ' + LEAGUE_ITEMS[m.heldItem].name + ': ' + (m.hp > hp ? '+' : '') + (m.hp - hp) + ' HP.';
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
    return `${SPECIES[m.id].name} kaget oleh peluit! Giliran terlewat.`;
  }
  if (hasCondition(m, 'sleep')) return `${SPECIES[m.id].name} masih tertidur. Giliran terlewat.`;
  if (hasCondition(m, 'paralysis') && Math.random() < 0.3)
    return `${SPECIES[m.id].name} kesetrum dan gagal bergerak.`;
  return '';
}

// --- Moves.
function moveDescription(m) {
  const bits = [m.power ? 'Daya ' + m.power : 'Dukungan', m.type];
  if (m.status) bits.push(`${Math.round((m.chance ?? 1) * 100)}% ${STATUS[m.status].name}`);
  if (m.heal) bits.push(`pulih ${Math.round(m.heal * 100)}%`);
  if (m.drain) bits.push(`serap ${Math.round(m.drain * 100)}% damage`);
  if (m.cleanse) bits.push('bersihkan status');
  if (m.reflect) bits.push('pantulkan pukulan berikutnya 35%');
  if (m.pierce) bits.push('tembus resistansi & pantulan');
  if (m.interrupt) bits.push('ganggu giliran berikutnya');
  if (m.recoil) bits.push(`recoil ${Math.round(m.recoil * 100)}%`);
  if (m.wetBonus) bits.push('bonus 25% vs Basah');
  if (m.accuracy) bits.push('akurasi ' + m.accuracy * 100 + '%');
  if (m.cooldown) bits.push(`jeda ${m.cooldown} giliran`);
  if (m.seal) bits.push('kunci jurus non-dasar terkuat lawan 2 giliran');
  if (m.mark) bits.push('beri Gula: bonus damage pada Api/Listrik berikutnya');
  if (m.teamHeal) bits.push('pulihkan ' + Math.round(m.teamHeal * 100) + '% HP semua teman sadar');
  if (m.teamCleanse) bits.push('bersihkan status seluruh tim');
  if (m.teamWard) bits.push('tim kebal satu pemberian status per anggota');
  if (m.shell) bits.push('kurangi pukulan berikutnya ' + Math.round(m.shell * 100) + '%');
  if (m.tailwind) bits.push('kurangi jeda jurus tim 1 giliran');
  if (m.dispel) bits.push('hapus tameng, pantulan & lentera lawan');
  if (m.healBlock) bits.push('blokir heal/drain lawan selama 2 giliran');
  return bits.join(', ');
}
function moveCard(mv, m = null, i = 0, enemy = null) {
  const cd = m?.cooldowns[i] || 0,
    cost = tempoCost(mv),
    mult = enemy && mv.power ? typeMultiplier(mv.type, enemy) : 1;
  const recovery = mv.cooldown ? `Jeda setelah dipakai: ${mv.cooldown} giliran` : 'Tidak ada jeda';
  return `<span class="move-heading"><b>${mv.name}</b><span class="cooldown" title="${recovery}">${cd ? `Jeda ${cd}` : 'Siap'}</span></span><span class="move-tags"><span style="background:${TYPE_COLORS[mv.type]}">${TYPE_ICONS[mv.type]} ${mv.type}</span><span>${mv.power ? 'Daya ' + mv.power : 'Dukungan'}</span><span>◎ ${Math.round((mv.accuracy ?? 1) * 100)}%</span><span title="Tempo yang dipakai atau dibangun">${cost ? 'Tempo −' + cost : 'Tempo +1'}</span></span><small>${moveSummary(mv)}</small>${enemy && mv.power ? `<span class="move-matchup ${mult > 1 ? 'effective' : mult < 1 ? 'resisted' : ''}">×${Number(mult.toFixed(2))}</span>` : ''}`;
}
// A move in three steps: Tempo and accuracy, then damage, then its side effects.
function useMove(a, d, i) {
  const text = attemptMove(a, d, i);
  playCue(a.lastMiss ? 'error' : kit(a.id, a)[i]?.heal ? 'heal' : 'hit');
  return text;
}
function attemptMove(a, d, i) {
  const mv = kit(a.id, a)[i];
  if (!mv) return '';
  const cost = tempoCost(mv);
  if (tempo(a) < cost) return 'Tempo belum cukup.';
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
    return `${SPECIES[a.id].name}: ${mv.name} meleset! Tempo dan jeda tetap terpakai.`;
  }
  a.lastMiss = false;
  a.turnDamage =
    1 +
    (a.id === 19 && hasCondition(d, 'soaked') ? 0.15 : 0) +
    (a.heldItem === 'turbine' && mv.type === 'Listrik' ? 0.2 : 0);
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
    text += 'Pelindung lawan disingkirkan. ';
  }
  text += strikeWithMove(a, d, i);
  const hit = mv.power && d.hp < beforeHP;
  if (hit && burning && [0, 12].includes(a.id) && mv.type === 'Api' && d.hp > 0) {
    const dmg = Math.min(d.hp, 3 + Math.ceil(a.level * 0.25));
    d.hp -= dmg;
    text += ` Sambal Meresap: −${dmg} HP tambahan!`;
  }
  if (hit && sugar && ['Api', 'Listrik'].includes(mv.type) && d.hp > 0) {
    const dmg = Math.min(d.hp, 6 + Math.ceil(a.level * 0.4));
    d.hp -= dmg;
    d.sugar = 0;
    text += ` Kombo gula: −${dmg} HP!`;
  }
  if (healBlocked && (mv.heal || mv.drain)) text += ' Getah Sepat menahan pemulihan.';
  if (a.hp > 0) {
    if (mv.shell) {
      a.shell = mv.shell;
      text += ' Tameng siap menerima satu pukulan.';
    }
    if (mv.teamHeal) {
      let total = 0;
      for (const ally of alliesFor(a)) {
        if (ally.hp <= 0 || ally.healBlock) continue;
        const amount = Math.min(ally.max - ally.hp, Math.ceil(ally.max * mv.teamHeal));
        ally.hp += amount;
        total += amount;
      }
      text += ` Tim pulih total ${total} HP.`;
    }
    if (mv.teamCleanse) {
      alliesFor(a).forEach(clearStatus);
      text += ' Semua status tim bersih.';
    }
    if (mv.teamWard) {
      alliesFor(a)
        .filter(m => m.hp > 0)
        .forEach(m => (m.ward = 1));
      text += ' Setiap anggota terlindung dari satu status.';
    }
    if (mv.tailwind) {
      alliesFor(a).forEach(m =>
        Object.keys(m.cooldowns).forEach(k => {
          if (m !== a || Number(k) !== i) m.cooldowns[k] = Math.max(0, m.cooldowns[k] - 1);
        }),
      );
      text += ' Jeda jurus tim berkurang 1.';
    }
  }
  if (d.hp > 0) {
    if (mv.mark) {
      d.sugar = 4;
      text += ' Gula menempel: susul dengan Api atau Listrik!';
    }
    if (mv.healBlock) {
      d.healBlock = 3;
      text += ' Pemulihan terkunci selama 2 giliran.';
    }
    if (mv.seal) {
      const best = kit(d.id, d)
        .map((m, i) => ({ m, i }))
        .filter(v => v.i > 0 && v.m.power > 0)
        .sort((a, b) => b.m.power - a.m.power)[0];
      if (best) {
        d.cooldowns[best.i] = Math.max(d.cooldowns[best.i] || 0, 2);
        text += ` ${best.m.name} dikunci selama 2 giliran.`;
      }
    }
  }
  return text;
}
function strikeWithMove(a, d, index) {
  const mv = kit(a.id, a)[index];
  if (!mv) return '';
  a.cooldowns[index] = mv.cooldown ?? 0;
  let text = `${SPECIES[a.id].name}: ${mv.name}!`;
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
        (hasAura(a.id) ? 1.15 : 1) *
        (hasAura(d.id) ? 0.85 : 1) *
        (state.team.includes(a) && mealBuff('power') ? 1.1 : 1) *
        (state.team.includes(d) && mealBuff('guard') ? 0.9 : 1),
    );
    if (mv.wetBonus && hasCondition(d, 'soaked')) dmg = Math.round(dmg * 1.25);
    if (a.heldItem === 'scarf') dmg = Math.round(dmg * 1.12);
    if (d.heldItem === 'vest') dmg = Math.round(dmg * 0.88);
    dmg = Math.round(dmg * (a.turnDamage || 1) * gearDamage(a, d, mv));
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
    text += ` −${dealt} HP.${mult > 1 ? ' Super efektif!' : mult < 1 ? ' Kurang efektif.' : ''}`;
    if (d.reflect && !mv.pierce) {
      const back = Math.max(1, Math.round(dealt * 0.35));
      a.hp = Math.max(0, a.hp - back);
      d.reflect = false;
      text += ` Recehan memantul: −${back} HP.`;
    }
    if (mv.drain && a.hp > 0 && !a.healBlock) {
      const h = Math.min(a.max - a.hp, Math.round(dealt * mv.drain));
      a.hp += h;
      text += ` Serap +${h} HP.`;
    }
    if (mv.recoil) {
      const back = Math.ceil(dealt * mv.recoil);
      a.hp = Math.max(0, a.hp - back);
      text += ` Recoil −${back} HP.`;
    }
  }
  if (mv.heal && a.hp > 0 && !a.healBlock) {
    const h = Math.min(a.max - a.hp, Math.ceil(a.max * mv.heal));
    a.hp += h;
    text += ` Pulih +${h} HP.`;
  }
  if (mv.cleanse) {
    clearStatus(a);
    text += ' Status dibersihkan.';
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
  return `${old} berevolusi menjadi ${SPECIES[m.id].name}!`;
}
// Equal-level battles retain their balance. Experience improves damage and resilience.
function levelDamageScale(attacker, defender) {
  return Math.max(
    0.35,
    Math.min(2.2, Math.pow((Math.max(1, attacker.level) + 20) / (Math.max(1, defender.level) + 20), 0.65)),
  );
}
// Legends and the rare bird fight with an aura: harder hits, and blows soften against them.
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
function planEnemy() {
  if (!battle) return;
  const a = battle.enemy,
    d = state.team[0];
  const options = kit(a.id, a)
    .map((mv, i) => ({ mv, i }))
    .filter(v => !(a.cooldowns[v.i] > 0) && tempo(a) >= tempoCost(v.mv));
  const pick = options
    .map(v => ({
      ...v,
      score:
        (v.mv.power || 0) * (v.mv.accuracy ?? 1) * typeMultiplier(v.mv.type, d) +
        tacticalMoveScore(v.mv, a, d) +
        (v.mv.heal ? (1 - a.hp / a.max) * 75 : 0) +
        (v.mv.status && !hasCondition(d, v.mv.status) ? 12 : 0) +
        (v.mv.tempoCost === 0 && tempo(a) < 2 ? 15 : 0),
    }))
    .sort((a, b) => b.score - a.score)[0];
  battle.intent = pick?.i ?? -1;
}
/* Describe effects from the move data, rather than a generic Tempo slogan. */
function moveSummary(m) {
  const effects = [];
  if (m.status)
    effects.push(`${Math.round((m.chance ?? 1) * 100)}% peluang memberi status ${STATUS[m.status].name}.`);
  if (m.heal) effects.push(`Memulihkan ${Math.round(m.heal * 100)}% HP sendiri.`);
  if (m.drain) effects.push(`Memulihkan HP sebesar ${Math.round(m.drain * 100)}% kerusakan yang diberikan.`);
  if (m.recoil)
    effects.push(`Kehilangan HP sebesar ${Math.round(m.recoil * 100)}% kerusakan yang diberikan.`);
  if (m.cleanse) effects.push('Menghapus status diri sendiri.');
  if (m.reflect) effects.push('Memantulkan 35% kerusakan dari pukulan berikutnya.');
  if (m.pierce) effects.push('Menembus ketahanan tipe dan pantulan lawan.');
  if (m.interrupt) effects.push('Membuat lawan melewatkan giliran berikutnya.');
  if (m.wetBonus) effects.push('Kerusakan bertambah 25% terhadap lawan Basah.');
  if (m.seal) effects.push('Mengunci jurus serangan terkuat lawan, selain jurus pertama, selama 2 giliran.');
  if (m.mark)
    effects.push('Memberi lapisan gula: serangan Api atau Listrik berikutnya mendapat bonus kerusakan.');
  if (m.teamHeal)
    effects.push(`Memulihkan ${Math.round(m.teamHeal * 100)}% HP setiap anggota tim yang masih sadar.`);
  if (m.teamCleanse) effects.push('Menghapus status seluruh tim.');
  if (m.teamWard) effects.push('Melindungi setiap anggota tim dari satu pemberian status.');
  if (m.shell) effects.push(`Mengurangi kerusakan pukulan berikutnya sebesar ${Math.round(m.shell * 100)}%.`);
  if (m.tailwind) effects.push('Mempercepat kesiapan jurus tim sebanyak 1 giliran.');
  if (m.dispel) effects.push('Menghapus tameng, pantulan, dan pelindung status lawan.');
  if (m.healBlock) effects.push('Mencegah lawan memulihkan atau menyerap HP selama 2 giliran.');
  return (
    effects.join(' ') ||
    (tempoCost(m) === 0
      ? 'Serangan ringan yang menambah 1 Tempo.'
      : `Serangan langsung yang menggunakan ${tempoCost(m)} Tempo.`)
  );
}
function gearDamage(a, d, mv) {
  let n = 1;
  if (['vest', 'lunchbox', 'rescue', 'medkit'].includes(a.heldItem)) n *= 0.9;
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
  return `<section class="combat-stats"><div><small>HP maksimum, Lv.${level}</small><b>${hp}</b></div><div><small>Daya jurus</small><b>${kit(
    id,
    m,
  )
    .filter(mv => mv.power)
    .map(mv => mv.power)
    .join(' / ')}</b></div></section>`;
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
