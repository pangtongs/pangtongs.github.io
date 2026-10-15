'use strict';
// Game methods: in-run market, auto-buy and permanent soul upgrades. Mixed into Game.

mixin(Game, {
  balance(currency) { return currency === 'gems' ? this.gemsCount : this.coins; },
  marketCost(kind) { const item = MARKET[kind]; return Math.ceil(item.base * Math.pow(item.growth, this.marketRanks[kind]) * (this.route === 'merchant' ? .65 : 1)); },

  openMarket() {
    if (!this.running) return;
    this.marketWasPaused = this.paused;
    this.setPaused(true);
    show('marketOverlay');
    UI.renderMarket(this);
  },
  closeMarket() {
    hide('marketOverlay');
    this.setPaused(this.marketWasPaused);
    $('pauseOverlay').classList.toggle('hidden', !this.paused);
  },

  // Toggle the auto-buy target for this item's currency (one per currency).
  setAutoBuy(kind) {
    const cur = MARKET[kind].currency;
    this.autoBuy[cur] = this.autoBuy[cur] === kind ? null : kind;
    this.runAutoBuy(cur);
    UI.renderMarket(this);
    this.hud.update(this, performance.now(), true);
  },

  runAutoBuy(currency) {
    const kind = this.autoBuy[currency];
    if (!kind) return;
    for (let i = 0; i < 5 && this.balance(currency) >= this.marketCost(kind); i++) {
      this.purchase(kind, true);
    }
  },

  purchase(kind, auto = false) {
    const item = MARKET[kind], p = this.player;
    const cost = this.marketCost(kind);
    if (this.balance(item.currency) < cost) { this.toast(`Not enough ${item.currency === 'gems' ? 'gems' : 'gold'}`); return; }
    if (item.currency === 'gems') this.gemsCount -= cost; else this.coins -= cost;
    const rank = this.marketRanks[kind]++, next = rank + 1;
    const ratio = marketFactor(kind, next) / marketFactor(kind, rank);
    const gain = marketPower(next) - marketPower(rank);
    const messages = {
      attack: () => { p.atk *= ratio; return `Attack +${percent(ratio - 1)}%`; },
      haste: () => { p.castCooldown /= ratio; return `Cast rate +${percent(ratio - 1)}%`; },
      speed: () => { p.speed *= ratio; return `Speed +${percent(ratio - 1)}%`; },
      hp: () => { const added = p.maxHp * (ratio - 1); p.maxHp += added; p.hp = Math.min(p.maxHp, p.hp + added); return `Max HP +${percent(ratio - 1)}%`; },
      shield: () => { const added = p.maxHp * .25 * gain; p.shieldBonusCap += added; p.shield = Math.min(p.shieldCap, p.shield + added); p.shieldRegenPct += .001 * gain; return `Shield +${percent(.25 * gain)}% max HP`; },
      coinYield: () => { this.yields.coins *= ratio; return `Gold drops ×${this.yields.coins.toFixed(2)}`; },
      gemYield: () => { this.yields.gems *= ratio; return `Gem drops ×${this.yields.gems.toFixed(2)}`; },
    };
    this.toast((auto ? 'AUTO-BUY · ' : '') + messages[kind]());
    if (isOpen('marketOverlay')) UI.renderMarket(this);
    this.hud.update(this, performance.now(), true);
  },

  // Den of Magic. perk(key): owned rank; perkCost: next rank's price, or null when maxed.
  perk(key) { return key === 'atk' || key === 'hp' ? this.meta[key] || 0 : (this.meta.perks || {})[key] || 0; },
  perkCost(key) { const d = META_PERKS[key], rank = this.perk(key); return d.costs ? d.costs[rank] ?? null : Math.ceil(d.base * Math.pow(META_COST_GROWTH, rank)); },
  perkLocked(key) { return (META_PERKS[key].stage || 0) > (this.meta.stats.bestStage || 0); },
  buyMeta(key) {
    const def = META_PERKS[key], cost = this.perkCost(key);
    if (cost === null || this.perkLocked(key)) return;
    if (this.wallet < cost) { this.toast('Not enough souls'); return; }
    this.wallet -= cost;
    if (key === 'atk' || key === 'hp') this.meta[key] = this.perk(key) + 1;
    else (this.meta.perks || (this.meta.perks = {}))[key] = this.perk(key) + 1;
    this.saveMeta();
    Sound.play('levelup');
    this.checkAchievements();
    UI.renderMenu(this);
    this.toast(`${def.name.toUpperCase()} · ${def.desc(this.perk(key)).toUpperCase()}`);
  },
});
