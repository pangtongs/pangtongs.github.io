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
        ${section.cards.map(c => `<div class="spellGuideCard"><div class="spellArt icon icon-${c.icon}"></div><strong>${c.name}</strong><small>${c.text}</small></div>`).join('')}
      </div></section>`).join('');
  },

  renderMenu(g) {
    const unlocked = clamp(g.meta.unlocked || 1, 1, STAGE_COUNT);
    g.selectedStage = clamp(g.selectedStage || unlocked, 1, unlocked);
    $('menuSouls').textContent = g.wallet;

    const box = $('stageSelect');
    box.innerHTML = '';
    STAGES.forEach((stage, i) => {
      const n = i + 1, b = document.createElement('button');
      b.className = 'stagePick' + (g.selectedStage === n ? ' selected' : '');
      b.disabled = n > unlocked;
      b.innerHTML = `<img src="assets/boss-${i}.webp" alt=""><strong>STAGE ${n} · ${stage.name}</strong><small>${n > unlocked ? 'Clear the previous stage' : 'Fresh stage run'}</small>`;
      b.onclick = () => { g.selectedStage = n; this.renderMenu(g); };
      box.appendChild(b);
    });

    const hasSave = !!Store.loadRun();
    $('loadBtn').disabled = !hasSave;
    $('menuSaveInfo').textContent = hasSave
      ? 'Continue resumes your saved build. Selecting any stage starts fresh.'
      : 'No saved run yet. Pause during a run to save. Progress stays in this browser.';

    this.renderMetaShop(g);
    $('menuAtkRank').textContent = g.meta.atk || 0;
    $('menuHpRank').textContent = g.meta.hp || 0;
    $('menuStatsGrid').innerHTML = [
      ['Stages unlocked', `${unlocked} / ${STAGE_COUNT}`], ['Base attack bonus', `+${(g.meta.atk || 0) * 10}%`],
      ['Max HP bonus', `+${(g.meta.hp || 0) * 20}%`], ['Attack upgrades', g.meta.atk || 0], ['HP upgrades', g.meta.hp || 0],
    ].map(([label, value]) => `<div>${label}<strong>${value}</strong></div>`).join('');

    document.querySelectorAll('[data-setting]').forEach(b => {
      const on = !!g.settings[b.dataset.setting];
      b.textContent = on ? 'ON' : 'OFF';
      b.setAttribute('aria-pressed', String(on));
    });
    $('qualitySetting').textContent = g.settings.quality.toUpperCase();
    $('difficultySetting').textContent = g.settings.difficulty.toUpperCase();
    $('difficultyLegend').innerHTML = Object.entries(DIFFICULTIES).map(([key, d]) =>
      `<div class="${key === g.settings.difficulty ? 'active' : ''}"><b>${key.toUpperCase()}</b><span>${d.legend}</span></div>`).join('');
  },

  // Both the menu and the game-over screen sell permanent upgrades.
  renderMetaShop(g) {
    document.querySelectorAll('[data-meta-buy]').forEach(b => {
      const cost = metaCost(g.meta[b.dataset.metaBuy] || 0);
      b.querySelector('span').textContent = cost;
      b.disabled = g.wallet < cost;
    });
    $('endSouls').textContent = g.wallet;
    $('endAtk').textContent = g.meta.atk || 0;
    $('endHp').textContent = g.meta.hp || 0;
    $('bonusText').textContent = `Permanent bonuses: ATK +${(g.meta.atk || 0) * 10}% · Max HP +${(g.meta.hp || 0) * 20}%`;
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
    const tier = p.level >= 5 && !p.path ? 'PATH' : p.level >= 12 && !p.ultimate ? 'ULTIMATE' : 'SPELL';
    $('levelTitle').textContent = `LEVEL ${p.level} · ${tier === 'PATH' ? 'CHOOSE YOUR PATH' : tier === 'ULTIMATE' ? 'AWAKEN AN ULTIMATE' : 'EVOLVE A SPELL'}`;

    let options;
    if (tier === 'PATH') {
      const paths = [origin.path, this.crossoverPath(p, origin.path)];
      $('levelDesc').textContent = `Keep your signature ${PATHS[paths[0]].name}, or cross over to ${PATHS[paths[1]].name} to match your other spells.`;
      options = paths.flatMap((key, i) => this.pathOptions(p, key, i ? 'CROSSOVER' : 'SIGNATURE'));
    } else if (tier === 'ULTIMATE') {
      const ults = this.ultimateChoices(p, origin);
      $('levelDesc').textContent = `Awaken your signature ${ULTIMATES[ults[0]].name}, or ${ULTIMATES[ults[1]].name} from ${PATHS[p.path] && PATHS[p.path].ultimate === ults[1] ? 'your Path' : 'your other spells'}.`;
      options = ults.flatMap((key, i) => this.ultimateOptions(p, key, i ? 'CROSSOVER' : 'SIGNATURE'));
    } else {
      $('levelDesc').textContent = 'Evolve a spell, build a passive power, or strike a bargain. Growth triggers every minute while you survive.';
      options = this.spellOptions(g);
    }
    const box = $('choices');
    box.dataset.tier = tier;
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
      card('Guard', 'shield and capacity +30% max HP', () => { p.shield += p.maxHp * .3; p.shieldBonusCap += p.maxHp * .3; }),
    ];
  },

  ultimateOptions(p, key, label) {
    const ult = ULTIMATES[key], grant = () => { p.ultimate = key; p.cool.ult = ult.firstCooldown; };
    const card = (variant, bonus, take) => ({name: `${ult.name} · ${variant}`, icon: ult.icon, tone: 'ULTIMATE', label: `${label} ULTIMATE`,
      desc: `${ult.desc} Bonus: ${bonus}.`, take: () => { grant(); take(); }});
    return [
      card('Power', 'ultimate damage +30%', () => { p.ultimatePower *= 1.3; }),
      card('Tempo', 'ultimate cooldowns 20% shorter', () => { p.ultimateHaste *= .8; }),
      card('Guard', 'shield and capacity +40% max HP', () => { p.shield += p.maxHp * .4; p.shieldBonusCap += p.maxHp * .4; }),
    ];
  },

  // Two passives, then owned spells, then new spells, up to five cards. While any bargain
  // is left, the last card is a bargain.
  spellOptions(g) {
    const p = g.player;
    const spells = Object.entries(SPELLS).filter(([key]) => p.skills[key] < SPELL_MAX_RANK).map(([key, s]) => ({
      key, name: `${s.name} · ${p.skills[key] + 1}/${SPELL_MAX_RANK}`, icon: s.icon, tone: 'SPELL', desc: s.desc,
      take: () => { p.skills[key]++; if (p.cool[key] !== undefined) p.cool[key] = 0; },
    }));
    const passives = Object.entries(PASSIVES).filter(([key]) => p.passiveRanks[key] < 5).map(([key, s]) => ({
      name: `${s.name} · ${p.passiveRanks[key] + 1}/5`, icon: key, tone: 'PASSIVE', desc: s.desc, take: () => { p.passiveRanks[key]++; },
    }));
    const bargains = Object.entries(BARGAINS).filter(([key]) => !p.bargains[key]).map(([key, b]) => ({
      name: b.name, icon: b.icon, tone: 'BARGAIN', desc: `<span class="gain">${b.gain}</span><span class="cost">${b.cost}</span>`,
      take: () => { p.bargains[key] = true; b.apply(p, g); g.toast(`BARGAIN STRUCK · ${b.name.toUpperCase()}`); },
    }));
    const slots = bargains.length ? 4 : 5;
    const options = shuffle(passives).slice(0, 2);
    const owned = shuffle(spells.filter(o => p.skills[o.key] > 0)), fresh = shuffle(spells.filter(o => p.skills[o.key] === 0));
    options.push(...owned.slice(0, Math.min(2, slots - options.length)));
    options.push(...fresh.slice(0, slots - options.length));
    options.push(...owned.filter(o => !options.includes(o)).slice(0, slots - options.length));
    while (options.length < slots) options.push({name: 'Arcane Echo', icon: 'bolt', tone: 'SPELL', desc: 'Increase your homing bolt damage by 4 per rank.', take: () => { p.skills.echo++; }});
    if (bargains.length) options.push(shuffle(bargains)[0]);
    return options;
  },

  showChest(g, tier, x, y) {
    const p = g.player;
    const fx = {
      p,
      healHp(f) { const gain = p.maxHp * f; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); },
      ward(f, regen = 0) { const gain = p.maxHp * f; p.shieldBonusCap += gain; p.shield += gain; p.shieldRegenPct += regen; },
      passive(key, n) { p.passiveRanks[key] = Math.min(5, p.passiveRanks[key] + n); },
    };
    $('chestTitle').textContent = `TIER ${tier} ${CHEST_TIER_NAMES[tier]} CHEST`;
    const box = $('chestChoices');
    box.innerHTML = '';
    for (const [name, icon, desc, take] of ARTIFACTS[tier]) {
      box.appendChild(choiceButton({icon, tone: 'ARTIFACT', name, desc}, () => {
        take(fx);
        g.lastArtifact = `${name} — ${desc}`;
        g.fx.texts.add(x, y - 36, name, '#ffd878');
        hide('chestOverlay');
        g.clearStage();
      }));
    }
    show('chestOverlay');
  },

  // Market buttons are created once, then relabeled whenever balances change.
  buildMarket(g) {
    for (const [kind, item] of Object.entries(MARKET)) {
      const b = document.createElement('button');
      b.className = 'button';
      b.dataset.purchase = kind;
      b.onclick = () => g.purchase(kind);
      document.querySelector(`.merchant[data-currency="${item.currency}"]`).appendChild(b);
    }
  },

  renderMarket(g) {
    $('marketBalance').textContent = `${g.gemsCount} GEMS · ${g.coins} GOLD · gem drops ×${g.yields.gems.toFixed(2)} · gold drops ×${g.yields.coins.toFixed(2)}`;
    for (const [kind, item] of Object.entries(MARKET)) {
      const b = document.querySelector(`[data-purchase="${kind}"]`);
      const rank = g.marketRanks[kind], cost = g.marketCost(kind), cur = CURRENCY_LABEL[item.currency];
      const affordable = g.balance(item.currency) >= cost;
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
