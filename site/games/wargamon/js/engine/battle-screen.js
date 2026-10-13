/* What the player sees in battle: the battle screen, trainer introductions and the
   capture, switch and item pickers. */

// --- Battle screen.
function renderBattle() {
  if (!battle) return;
  const b = battle,
    m = normalise(state.team[0]),
    e = normalise(b.enemy),
    wild = b.trainer === null,
    off = b.busy ? 'disabled' : '';
  const teammate = state.team.find((mon, i) => i > 0 && mon.hp > 0);
  const teammateIcon = teammate
    ? art(teammate.id).replace('class="sprite', 'class="battle-team-icon sprite')
    : '';
  const fighter = (mon, side) =>
    `<div class="fighter ${side}">${monArt(mon)}<div class="fighter-info"><strong>${monName(mon)}</strong><small>${typeLabel(mon.id)}, Lv.${mon.level}</small>${hpBar(mon)}<small>${mon.hp}/${mon.max} HP</small>${state.team.includes(mon) ? xpBar(mon) : ''}${statusBadge(mon)}${side === 'you' ? fullnessBadge(mon) + mealBuffBadge() : ''}</div></div>`;
  const moves = kit(m.id, m)
    .map(
      (mv, i) =>
        `<button data-act="battle" data-move="m${i}" ${b.busy || m.cooldowns[i] > 0 || tempo(m) < tempoCost(mv) ? 'disabled' : ''}>${moveCard(mv, m, i, b.enemy)}</button>`,
    )
    .join('');
  const tools = `<button data-act="battle" data-move="brace" ${off}>Bersiap, +1 Tempo</button><button data-every="catchmenu" ${b.busy || !wild ? 'disabled' : ''}>${itemIcon('balls')}Tangkap</button><button data-every="switch" ${b.busy || !teammate ? 'disabled' : ''}>${teammateIcon}Ganti tim</button><button data-every="bag" ${off}>${itemIcon('potions')}Pakai barang</button>${wild ? `<button class="battle-run" data-act="battle" data-move="run" ${off}>Kabur</button>` : ''}`;
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
  const intent = `<div class="battle-intent"><span class="tempo-caption">${I18N.t('battle.tempo')}</span><span class="tempo-pips" aria-label="${I18N.t('battle.tempo.value', { current: tempo(m) })}">${pips}</span></div>`;
  const html = `<div class="battle-head">${wild ? '' : trainerArt(TRAINERS[b.trainer].portrait)}<span>${wild ? 'WARGAMON LIAR' : TRAINERS[b.trainer].name.toUpperCase() + '<br>'}<!--roster--></span></div>${fighter(e, 'enemy')}${fighter(m, 'you')}<div class="battle-menu status-combat"><!--intent--><div class="battle-log" role="status">${log}</div><div class="creature-moves">${moves}</div><div class="battle-tools">${tools}</div></div>`;
  $('battle').innerHTML = translateHTML(html)
    .replace('<!--roster-->', () => trainerRoster(b))
    .replace('<!--intent-->', () => intent);
  battleBackdrop();
}

// --- Before a trainer fight: why it is closed, or who you are about to face.
function showTrainerIntro(id) {
  if (ELITE_IDS.includes(id) && !canChallenge(id)) {
    leagueMenu();
    return;
  }
  if (!canChallenge(id) && lockedLeaderScene(id)) return;
  const t = TRAINERS[id];
  // Each League clear raises the Elite by five levels, up to 80.
  const shownLevel = lv => (ELITE_IDS.includes(id) ? Math.min(80, lv + leagueState().clears * 5) : lv);
  modal(
    `<div class="portrait-head">${trainerArt(t.portrait)}<div><span class="eyebrow">${t.role.toUpperCase()}</span><h2>${t.name}</h2><p>${state.defeated.includes(id) ? 'Tanding ulang, hadiah lebih kecil' : t.team.length + ' Wargamon, pertandingan warga'}</p></div></div><p>“${t.line}”</p><div class="opponent-team">${t.team.map(([sid, lv]) => `<div class="opponent-mon">${art(sid, true)}<span>${SPECIES[sid].name}<br>Lv.${shownLevel(lv)}, ${typeLabel(sid)}</span></div>`).join('')}</div><div class="actions"><button class="action" data-act="starttrainer" data-id="${id}">Gas, tanding!</button>${closeButton('Siapkan tim dulu')}</div>`,
    'trainer',
  );
}
function catchMenu() {
  if (!battle || battle.busy || locked || battle.trainer !== null) return;
  modal(
    `<h2>Tangkap</h2><div class="bag-medicine-grid">${['balls', 'ultraballs'].map(k => `<button data-every="catch" data-key="${k}" ${!itemCount(k) ? 'disabled' : ''}>${itemIcon(k)}<b>${k === 'balls' ? 'Kapsul Rantau' : 'Kapsul Ultra'}</b><span>×${itemCount(k)}</span></button>`).join('')}</div>`,
    'catch',
    closeButton('Kembali'),
  );
}
function battleSwitchMenu() {
  if (!battle || battle.busy || locked) return;
  modal(
    `<h2>Ganti tim</h2><p>Memilih teman lain memakai satu giliran.</p><div class="medicine-target-grid">${state.team.map((mon, i) => `<button class="medicine-target" data-act="lead" data-id="${i}" ${i === 0 || !mon.hp ? 'disabled' : ''}>${art(mon.id)}<span class="medicine-target-info"><b>${SPECIES[mon.id].name}</b><span>Lv.${mon.level}, HP ${mon.hp}/${mon.max}</span>${health(mon)}${statusBadge(mon)}<span class="medicine-target-result">${i === 0 ? 'Sedang bertarung' : mon.hp ? 'Pilih teman' : 'Pingsan'}</span></span></button>`).join('')}</div>`,
    'battle-switch',
    closeButton('Kembali bertarung'),
  );
}
function battleItemMenu() {
  if (!battle || battle.busy || locked) return;
  const items = BAG_MEDICINES.map(key => {
    const item = medicineInfo(key),
      available = state.team.some(mon => canUseMedicine(key, mon));
    return `<button class="bag-medicine" data-over="medmenu" data-key="${key}" ${available ? '' : 'disabled'}>${itemIcon(key)}<span class="bag-item-heading"><b>${item.name}</b><span class="bag-quantity">×${itemCount(key)}</span></span><span class="bag-item-effect">${item.desc}</span></button>`;
  }).join('');
  modal(
    `<h2>Pakai barang</h2><p>Memakai obat saat bertarung menghabiskan satu giliran.</p><div class="bag-medicine-grid">${items}</div>`,
    'battle-items',
    closeButton('Kembali bertarung'),
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
