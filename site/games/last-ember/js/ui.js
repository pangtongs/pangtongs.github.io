'use strict';
// Overlay screens: menus, level ups, chests, market, spellbook. Builders here read game
// state and wire buttons back to Game methods; they hold no state of their own.

const OVERLAYS = ['startOverlay', 'originOverlay', 'levelOverlay', 'chestOverlay', 'pauseOverlay', 'marketOverlay', 'stageOverlay', 'gameOver', 'spellBookOverlay'];
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');
const isOpen = id => !$(id).classList.contains('hidden');
const hideAllOverlays = () => OVERLAYS.forEach(hide);
const CURRENCY_LABEL = {gems: 'GEMS', coins: 'GOLD'};

// label overrides the small tag text; tone drives the card styling.
function choiceButton({icon, tone, label, name, desc}, onPick) {
  const b = document.createElement('button');
  b.className = 'choice';
  b.dataset.tone = tone;
  b.innerHTML = `<span class="choiceIcon icon icon-${icon}">${iconMarkup(icon)}</span><em>${label || tone}</em><b>${name}</b><small>${desc}</small>`;
  b.onclick = onPick;
  return b;
}

const UI = {
  renderSpellbook() {
    $('spellBookSections').innerHTML = SPELLBOOK.map(section => `
      <section class="bookSection"><h2>${section.title}</h2><div class="spellGuide">
        ${section.cards.map(c => `<div class="spellGuideCard"><div class="spellArt icon icon-${c.icon}">${iconMarkup(c.icon)}</div><strong>${c.name}</strong><small>${c.text}</small></div>`).join('')}
      </div></section>`).join('');
  },

  renderMenu(g) {
    const unlocked = clamp(g.meta.unlocked || 1, 1, STAGE_COUNT);
    g.selectedStage = clamp(g.selectedStage || unlocked, 1, unlocked);
    $('menuSouls').textContent = g.wallet;

    const box = $('stageSelect');
    const keepScroll = box.scrollTop;
    box.innerHTML = '';
    STAGES.forEach((stage, i) => {
      if (i === 0 || STAGES[i - 1].act !== stage.act) {
        const head = document.createElement('div');
        head.className = 'actHeader';
        head.textContent = ACT_NAMES[stage.act];
        box.appendChild(head);
      }
      const n = i + 1, b = document.createElement('button');
      b.className = 'stagePick' + (g.selectedStage === n ? ' selected' : '');
      b.disabled = n > unlocked;
      const best = g.meta.stats.fastest[n];
      b.innerHTML = `<img src="assets/boss-${i}.webp" alt=""><strong>${n} · ${stage.name}</strong><small>${n > unlocked ? 'Locked · clear stage ' + (n - 1)
        : best ? `${stage.boss} · best ${formatTime(best)}` : stage.boss}</small>`;
      b.onclick = () => { g.selectedStage = n; this.renderMenu(g); };
      box.appendChild(b);
    });
    // Keep the list where the player left it; on first show, bring the selection into view.
    const sel = box.querySelector('.selected');
    if (keepScroll || !sel) box.scrollTop = keepScroll;
    else requestAnimationFrame(() => { box.scrollTop += sel.getBoundingClientRect().top - box.getBoundingClientRect().top - 30; });

    const hasSave = !!Store.loadRun();
    $('loadBtn').disabled = !hasSave;
    $('menuSaveInfo').textContent = hasSave
      ? 'Continue resumes your saved build. Selecting any stage starts fresh.'
      : 'No saved run yet. Pause during a run to save. Progress stays in this browser.';

    this.renderMetaShop(g);
    const st = g.meta.stats, fav = Object.entries(st.origins).sort((a, b) => b[1] - a[1])[0];
    const fastest = Object.entries(st.fastest).sort((a, b) => a[0] - b[0]);
    $('menuStatsGrid').innerHTML = [
      ['Runs started', st.runs], ['Victories', st.wins], ['Deaths', st.deaths], ['Foes slain', st.kills.toLocaleString('en-US')],
      ['Bosses defeated', st.bosses], ['Best stage', st.bestStage > STAGE_COUNT ? `Endless ${st.bestStage - STAGE_COUNT}` : st.bestStage || '—'],
      ['Best endless depth', st.endlessBest || '—'], ['Highest Heat cleared', st.highestHeat || '—'],
      ['Time played', formatDuration(st.playTime)],
      ['Favourite origin', fav ? `${ORIGINS[fav[0]].name} (${fav[1]})` : '—'],
      ['Stages unlocked', `${unlocked} / ${STAGE_COUNT}`], ['Den perks', `${Object.keys(META_PERKS).reduce((n, k) => n + g.perk(k), 0)} / ${Object.values(META_PERKS).reduce((n, d) => n + d.costs.length, 0)} ranks`],
    ].map(([label, value]) => `<div>${label}<strong>${value}</strong></div>`).join('') +
      (fastest.length ? `<div class="statsWide">Fastest clears<strong class="fastest">${fastest.map(([s, t]) => `<span>${s}. ${STAGES[s - 1].name} <b>${formatTime(t)}</b></span>`).join('')}</strong></div>` : '');

    document.querySelectorAll('[data-setting]').forEach(b => {
      const on = !!g.settings[b.dataset.setting];
      b.textContent = on ? 'ON' : 'OFF';
      b.setAttribute('aria-pressed', String(on));
    });
    $('qualitySetting').textContent = g.settings.quality.toUpperCase();
    const heat = g.settings.heat || 0, unlockedHeat = g.meta.heatUnlocked || 0;
    $('difficultySetting').textContent = heat ? `HEAT ${heat}` : 'HEAT 0';
    $('startHeat').classList.toggle('hidden', !unlockedHeat);
    $('startHeatBtn').textContent = `HEAT ${heat}`;
    $('startHeatRule').textContent = heat ? `${HEAT_LEVELS[heat].name} · +${heat * 10}% souls · rules of Heat 1–${heat} apply` : `Baseline. Heat ${unlockedHeat} unlocked: raise it for more souls.`;
    $('difficultyLegend').innerHTML = `<div class="active"><b>HEAT 0</b><span>Baseline. Clear a stage to unlock Heat 1.</span></div>` +
      HEAT_LEVELS.slice(1).map((h, i) => {
        const level = i + 1, cls = level > unlockedHeat ? 'locked' : level <= heat ? 'active' : '';
        return `<div class="${cls}"><b>HEAT ${level} · ${h.name}</b><span>${level > unlockedHeat ? `Locked: clear stage ${level} or deeper at Heat ${level - 1}.` : h.rule}</span></div>`;
      }).join('') + `<p class="menuNote">Each Heat level adds 10% souls. Rules stack.</p>`;
  },

  // The Den of Magic: one card per perk with rank pips, its current and next effect, and
  // a buy button (or what it takes to unlock). The game-over screen shows a summary.
  renderMetaShop(g) {
    const affordable = Object.keys(META_PERKS).filter(k => !g.perkLocked(k) && g.perkCost(k) !== null && g.perkCost(k) <= g.wallet);
    $('perkList').innerHTML = Object.entries(META_PERKS).map(([key, d]) => {
      const rank = g.perk(key), cost = g.perkCost(key), locked = g.perkLocked(key), max = d.costs.length;
      const pips = d.costs.map((_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      const now = rank ? d.desc(rank) : 'Not owned';
      const next = cost === null ? 'Fully mastered' : locked ? `Clear stage ${d.stage} to unlock` : `Next: ${d.desc(rank + 1)}`;
      const btn = cost === null ? '<button class="button secondary" disabled>MAXED</button>'
        : locked ? '<button class="button secondary" disabled>LOCKED</button>'
        : `<button class="button" data-meta-buy="${key}" ${g.wallet < cost ? 'disabled' : ''}>BUY · ${cost} SOULS</button>`;
      return `<div class="perkCard${locked ? ' locked' : ''}${cost === null ? ' maxed' : ''}">
        <span class="choiceIcon icon icon-${d.icon}">${iconMarkup(d.icon)}</span>
        <div><b>${d.name}</b><span class="pips" title="${rank}/${max}">${pips}</span><small>${now}</small><small class="next">${next}</small></div>${btn}</div>`;
    }).join('');
    $('perkList').querySelectorAll('[data-meta-buy]').forEach(b => { b.onclick = () => g.buyMeta(b.dataset.metaBuy); });
    $('endSouls').textContent = g.wallet;
    $('endPerks').textContent = affordable.length;
    $('endNext').textContent = affordable.length ? 'Spend them in the Den of Magic before your next run.'
      : `Cheapest perk you can't afford yet: ${Math.min(...Object.keys(META_PERKS).filter(k => !g.perkLocked(k) && g.perkCost(k) !== null).map(k => g.perkCost(k)))} souls.`;
  },

  showOrigins(g) {
    const box = $('originChoices');
    box.innerHTML = '';
    for (const [key, o] of Object.entries(ORIGINS)) {
      box.appendChild(choiceButton({icon: SPELLS[o.spell].icon, tone: `LEVEL 1 · ${o.name.toUpperCase()}`, name: o.title, desc: o.description},
        () => g.pickOrigin(key)));
    }
    show('originOverlay');
  },

  showLevelUp(g) {
    const p = g.player, origin = ORIGINS[p.origin] || ORIGINS.ember;
    // A maxed spell that has not evolved yet gets its own evolution screen.
    const evolving = Object.keys(EVOLUTIONS).find(k => p.skills[k] >= SPELL_MAX_RANK && !p.evolved[k]);
    const tier = p.level >= 5 && !p.path ? 'PATH' : p.level >= 12 && !p.ultimate ? 'ULTIMATE' : evolving ? 'EVOLVE' : 'SPELL';
    $('levelTitle').textContent = `LEVEL ${p.level} · ${tier === 'PATH' ? 'CHOOSE YOUR PATH' : tier === 'ULTIMATE' ? 'AWAKEN AN ULTIMATE'
      : tier === 'EVOLVE' ? `${SPELLS[evolving].name.toUpperCase()} EVOLVES` : 'CHOOSE A POWER'}`;

    let options;
    if (tier === 'PATH') {
      const paths = [origin.path, this.crossoverPath(p, origin.path)];
      $('levelDesc').textContent = `Keep your signature ${PATHS[paths[0]].name}, or cross over to ${PATHS[paths[1]].name} to match your other spells.`;
      options = paths.flatMap((key, i) => this.pathOptions(p, key, i ? 'CROSSOVER' : 'SIGNATURE'));
    } else if (tier === 'ULTIMATE') {
      const ults = this.ultimateChoices(p, origin);
      $('levelDesc').textContent = `Awaken your signature ${ULTIMATES[ults[0]].name}, or ${ULTIMATES[ults[1]].name} from ${PATHS[p.path] && PATHS[p.path].ultimate === ults[1] ? 'your Path' : 'your other spells'}.`;
      options = ults.flatMap((key, i) => this.ultimateOptions(p, key, i ? 'CROSSOVER' : 'SIGNATURE'));
    } else if (tier === 'EVOLVE') {
      $('levelDesc').textContent = `${SPELLS[evolving].name} reached rank ${SPELL_MAX_RANK}. Choose its final form; it changes how the spell works for the rest of the run.`;
      options = Object.entries(EVOLUTIONS[evolving]).map(([form, f]) => ({
        name: f.name, icon: SPELLS[evolving].icon, tone: 'EVOLVE', label: `EVOLUTION · ${SPELLS[evolving].name}`, desc: f.desc,
        take: () => { p.evolved[evolving] = form; Sound.play('evolve'); g.toast(`${f.name.toUpperCase()} AWAKENED`); },
      }));
    } else {
      $('levelDesc').textContent = `Spells rank up to ${SPELL_MAX_RANK}, then evolve into a final form. Passives stack to 5. Bargains are powerful but cost you something.`;
      options = this.spellOptions(g);
    }
    $('levelWallet').innerHTML = `<span class="gems">GEMS <b>${g.gemsCount}</b></span><span class="coins">GOLD <b>${g.coins}</b></span>` +
      ['gems', 'coins'].filter(c => g.autoBuy[c]).map(c => `<span class="auto">AUTO ${MARKET[g.autoBuy[c]].short} ${g.balance(c)}/${g.marketCost(g.autoBuy[c])}</span>`).join('');
    const box = $('choices');
    box.dataset.tier = tier;
    $('rerollBtn').classList.toggle('hidden', tier !== 'SPELL' || !p.rerolls);
    $('rerollBtn').textContent = `↻ REROLL · ${p.rerolls} LEFT`;
    box.innerHTML = '';
    for (const o of options) box.appendChild(choiceButton(o, () => g.takeLevelChoice(o)));
    show('levelOverlay');
  },

  // The Path the player's non-signature spells lean toward most (ties broken at random).
  crossoverPath(p, exclude) {
    const score = {};
    for (const [key, spell] of Object.entries(SPELLS)) if (spell.path && spell.path !== exclude) score[spell.path] = (score[spell.path] || 0) + p.skills[key];
    const others = shuffle(Object.keys(PATHS).filter(k => k !== exclude));
    return others.reduce((best, k) => (score[k] || 0) > (score[best] || 0) ? k : best, others[0]);
  },

  // Signature ultimate, plus the one belonging to the chosen Path (or, if the Path is the
  // signature one, to the Path the other spells lean toward).
  ultimateChoices(p, origin) {
    const fromPath = PATHS[p.path]?.ultimate;
    const other = fromPath && fromPath !== origin.ultimate ? fromPath : PATHS[this.crossoverPath(p, origin.path)].ultimate;
    return [origin.ultimate, other];
  },

  pathOptions(p, key, label) {
    const path = PATHS[key], grant = () => { p.path = key; path.apply(p); };
    const card = (variant, bonus, take) => ({name: `${path.name} · ${variant}`, icon: path.icon, tone: 'PATH', label: `${label} PATH`,
      desc: `${path.book} Bonus: ${bonus}.`, take: () => { grant(); take(); }});
    return [
      card('Power', 'attack +15%', () => { p.atk *= 1.15; }),
      card('Tempo', 'cast spells 10% faster', () => { p.castCooldown *= .9; }),
      // Glass Wick forbids shields, so its Guard becomes max HP instead.
      p.bargains.glassWick ? card('Guard', 'max HP +20%', () => { const gain = p.maxHp * .2; p.maxHp += gain; p.hp += gain; })
        : card('Guard', 'shield and capacity +30% max HP', () => { p.shield += p.maxHp * .3; p.shieldBonusCap += p.maxHp * .3; }),
    ];
  },

  ultimateOptions(p, key, label) {
    const ult = ULTIMATES[key], grant = () => { p.ultimate = key; p.cool.ult = ult.firstCooldown; };
    const card = (variant, bonus, take) => ({name: `${ult.name} · ${variant}`, icon: ult.icon, tone: 'ULTIMATE', label: `${label} ULTIMATE`,
      desc: `${ult.desc} Bonus: ${bonus}.`, take: () => { grant(); take(); }});
    return [
      card('Power', 'ultimate damage +30%', () => { p.ultimatePower *= 1.3; }),
      card('Tempo', 'ultimate cooldowns 20% shorter', () => { p.ultimateHaste *= .8; }),
      p.bargains.glassWick ? card('Guard', 'max HP +25%', () => { const gain = p.maxHp * .25; p.maxHp += gain; p.hp += gain; })
        : card('Guard', 'shield and capacity +40% max HP', () => { p.shield += p.maxHp * .4; p.shieldBonusCap += p.maxHp * .4; }),
    ];
  },

  // Five cards: three spells, one passive and one bargain. Spells are drawn at random,
  // but include at least one you own and one you don't when both exist, so new spells
  // keep showing up. With no bargains left, a second passive takes that slot.
  spellOptions(g) {
    const p = g.player;
    const spells = Object.entries(SPELLS).filter(([key]) => p.skills[key] < SPELL_MAX_RANK).map(([key, s]) => ({
      key, name: `${s.name} · ${p.skills[key] + 1}/${SPELL_MAX_RANK}`, icon: s.icon, tone: 'SPELL', desc: s.desc,
      take: () => { p.skills[key]++; if (p.cool[key] !== undefined) p.cool[key] = 0; },
    }));
    const passives = shuffle(Object.entries(PASSIVES).filter(([key]) => p.passiveRanks[key] < 5 && !(key === 'aegisGrowth' && p.bargains.glassWick)).map(([key, s]) => ({
      name: `${s.name} · ${p.passiveRanks[key] + 1}/5`, icon: key, tone: 'PASSIVE', desc: s.desc, take: () => { p.passiveRanks[key]++; },
    })));
    // Overcharge only helps once an ultimate is awake (level 12).
    const bargains = shuffle(Object.entries(BARGAINS).filter(([key]) => !p.bargains[key] && (key !== 'overcharge' || p.ultimate)).map(([key, b]) => ({
      name: b.name, icon: b.icon, tone: 'BARGAIN', desc: `<span class="gain">${b.gain}</span><span class="cost">${b.cost}</span>`,
      take: () => { p.bargains[key] = true; b.apply(p, g); g.toast(`BARGAIN STRUCK · ${b.name.toUpperCase()}`); },
    })));

    const owned = shuffle(spells.filter(o => p.skills[o.key] > 0)), fresh = shuffle(spells.filter(o => p.skills[o.key] === 0));
    const picked = [];
    if (owned.length) picked.push(owned.shift());
    if (fresh.length) picked.push(fresh.shift());
    picked.push(...shuffle([...owned, ...fresh]).slice(0, 3 - picked.length));

    const options = shuffle(picked);
    options.push(...passives.splice(0, bargains.length ? 1 : 2));
    // Short on spells late in a run: top up with passives, then Arcane Echo.
    const slots = bargains.length ? 4 : 5;
    options.push(...passives.slice(0, slots - options.length));
    while (options.length < slots) options.push({name: 'Arcane Echo', icon: 'bolt', tone: 'SPELL', desc: 'Increase your homing bolt damage by 4 per rank.', take: () => { p.skills.echo++; }});
    if (bargains.length) options.push(bargains[0]);
    return options;
  },

  showChest(g) {
    const {tier, x, y} = g.pendingChest;
    const p = g.player;
    const fx = {
      p,
      healHp(f) { const gain = p.maxHp * f; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); },
      ward(f, regen = 0) { const gain = p.maxHp * f; p.shieldBonusCap += gain; p.shield += gain; p.shieldRegenPct += regen; },
      passive(key, n) { p.passiveRanks[key] = Math.min(5, p.passiveRanks[key] + n); },
      spell(key, n) { p.skills[key] = Math.min(SPELL_MAX_RANK, p.skills[key] + n); },
      yields(f) { g.yields.gems *= f; g.yields.coins *= f; },
    };
    // A boss called early with a minute to spare lets you take two artifacts.
    // pending.taken survives saves, so a reopened two-pick chest cannot give the same artifact twice.
    const pending = g.pendingChest;
    pending.taken = pending.taken || [];
    $('chestTitle').textContent = `TIER ${tier} ${chestName(tier)} CHEST`;
    $('chestDesc').textContent = pending.picks > 1 && !pending.taken.length ? `Choose ${pending.picks} artifacts. Their bonuses last for this run.`
      : pending.taken.length ? 'Choose one more artifact.' : 'Choose one stat artifact. Its bonus lasts for this run.';
    const box = $('chestChoices');
    box.innerHTML = '';
    for (const [name, icon, desc, take] of ARTIFACTS[stageInfo(tier).artifactTier]) {
      const b = choiceButton({icon, tone: 'ARTIFACT', name, desc}, () => {
        take(fx);
        b.disabled = true;
        pending.taken.push(`${name} — ${desc}`);
        g.fx.texts.add(x, y - 36, name, '#ffd878');
        if (--pending.picks > 0) { $('chestDesc').textContent = 'Choose one more artifact.'; return; }
        g.lastArtifact = pending.taken.join(' · ');
        hide('chestOverlay');
        g.clearStage();
      });
      b.disabled = pending.taken.some(t => t.startsWith(name + ' — '));
      box.appendChild(b);
    }
    show('chestOverlay');
  },

  // Market buttons are created once, then relabeled whenever balances change.
  buildMarket(g) {
    for (const [kind, item] of Object.entries(MARKET)) {
      const row = document.createElement('div');
      row.className = 'merchantRow';
      const b = document.createElement('button');
      b.className = 'button';
      b.dataset.purchase = kind;
      b.onclick = () => g.purchase(kind);
      const auto = document.createElement('button');
      auto.className = 'autoBtn';
      auto.dataset.auto = kind;
      auto.title = 'Buy automatically whenever affordable';
      auto.onclick = () => g.setAutoBuy(kind);
      row.append(b, auto);
      document.querySelector(`.merchant[data-currency="${item.currency}"]`).appendChild(row);
    }
  },

  renderMarket(g) {
    $('marketBalance').textContent = `${g.gemsCount} GEMS · ${g.coins} GOLD · gem drops ×${g.yields.gems.toFixed(2)} · gold drops ×${g.yields.coins.toFixed(2)}`;
    for (const [kind, item] of Object.entries(MARKET)) {
      const b = document.querySelector(`[data-purchase="${kind}"]`);
      const rank = g.marketRanks[kind], cost = g.marketCost(kind), cur = CURRENCY_LABEL[item.currency];
      const affordable = g.balance(item.currency) >= cost;
      const auto = document.querySelector(`[data-auto="${kind}"]`), on = g.autoBuy[item.currency] === kind;
      auto.textContent = on ? 'AUTO ✓' : 'AUTO';
      auto.setAttribute('aria-pressed', String(on));
      auto.disabled = !!item.max && rank >= item.max;
      if (item.yieldOf) {
        const name = item.yieldOf === 'gems' ? 'Gem' : 'Gold', mult = g.yields[item.yieldOf];
        const maxed = rank >= item.max;
        b.disabled = maxed || !affordable;
        b.innerHTML = maxed ? `MAXED · ${name} yield ×${mult.toFixed(2)}<small>Maximum investment reached</small>`
          : `${cost} ${cur} · ${name} yield ×${(mult * YIELD_STEP).toFixed(2)}<small>Future ${name.toLowerCase()} drops ×${YIELD_STEP} · ${rank + 1}/${item.max} · next cost ×${item.growth}</small>`;
      } else {
        b.disabled = !affordable;
        b.innerHTML = `${cost} ${cur} · ${item.label}<small>${item.note} · bought ${rank} · next cost ×${item.growth}</small>`;
      }
    }
  },
};
