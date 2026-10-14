'use strict';
// Game methods: in-run market, auto-buy and permanent soul upgrades. Mixed into Game.

mixin(Game, {
  balance(currency) { return currency === 'gems' ? this.gemsCount : this.coins; },
  marketCost(kind) { const item = MARKET[kind]; return Math.ceil(item.base * Math.pow(item.growth, this.marketRanks[kind])); },

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
    const item = MARKET[kind];
    for (let i = 0; i < 5 && this.balance(currency) >= this.marketCost(kind); i++) {
      if (item.max && this.marketRanks[kind] >= item.max) break;
      this.purchase(kind, true);
    }
    if (item.max && this.marketRanks[kind] >= item.max) this.autoBuy[currency] = null;
  },

  purchase(kind, auto = false) {
    const item = MARKET[kind], p = this.player;
    if (item.max && this.marketRanks[kind] >= item.max) { this.toast('Investment maxed'); return; }
    const cost = this.marketCost(kind);
    if (this.balance(item.currency) < cost) { this.toast(`Not enough ${item.currency === 'gems' ? 'gems' : 'gold'}`); return; }
    if (item.currency === 'gems') this.gemsCount -= cost; else this.coins -= cost;
    this.marketRanks[kind]++;
    const messages = {
      attack: () => { p.atk *= 1.12; return 'Attack +12%'; },
      haste: () => { p.castCooldown *= .92; return 'Spells 8% faster'; },
      speed: () => { p.speed *= 1.1; return 'Speed +10%'; },
      hp: () => { const gain = p.maxHp * .12; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); return 'Max HP +12%'; },
      shield: () => { const gain = p.maxHp * .25; p.shieldBonusCap += gain; p.shield += gain; p.shieldRegenPct += .001; return 'Shield +25% max HP · regen +0.1% HP/s'; },
      coinYield: () => { this.yields.coins *= YIELD_STEP; return `Gold drops ×${this.yields.coins.toFixed(2)}`; },
      gemYield: () => { this.yields.gems *= YIELD_STEP; return `Gem drops ×${this.yields.gems.toFixed(2)}`; },
    };
    this.toast((auto ? 'AUTO-BUY · ' : '') + messages[kind]());
    if (isOpen('marketOverlay')) UI.renderMarket(this);
    this.hud.update(this, performance.now(), true);
  },

  buyMeta(key) {
    const cost = metaCost(this.meta[key] || 0);
    if (this.wallet < cost) { this.toast('Not enough souls'); return; }
    this.wallet -= cost;
    this.meta[key] = (this.meta[key] || 0) + 1;
    this.saveMeta();
    UI.renderMenu(this);
    this.toast(key === 'atk' ? 'Base ATK increased!' : 'Max HP increased!');
  },
});
