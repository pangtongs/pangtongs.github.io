'use strict';
// Game methods: damage, kills, loot, experience and level ups. Mixed into Game.

mixin(Game, {
  burst(x, y, color, n) { if (this.settings.particles) this.fx.particles.burst(x, y, color, n); },

  // tick: damage over time (lingering pools). It ignores and does not grant the
  // invulnerability window, so standing in a pool hurts at its full stated rate.
  damage(n, tick = false) {
    const p = this.player;
    if (p.dashT > 0) return;
    if (!tick) { if (p.invuln > 0) return; p.invuln = .55; }
    const hadShield = p.shield > 0;
    if (hadShield) { const s = Math.min(p.shield, n); p.shield -= s; n -= s; }
    if (n > 0) p.hp -= n;
    if (!tick) { Sound.play(n > 0 ? 'hurt' : 'block'); this.shake(n > 0 ? 4 : 2); }
    if (hadShield && p.shield <= 0) { Sound.play('shieldBreak'); this.fx.shockwave(p.x, p.y, 60, .35, '#7fd8ff'); }
    if (this.settings.damageNumbers && n >= .5) this.fx.texts.add(p.x, p.y - 18, `-${Math.ceil(n)}`, '#ff718b');
    if (n > 0 && !tick) this.hurtFlash = .25;
    if (n > 0 && this.boss) this.bossHurt = true;
    if (p.hp <= 0 && p.secondWind) { // Second Wind: survive once, blast foes back
      p.secondWind = false; p.hp = p.maxHp * .4; p.invuln = 2;
      this.fx.shockwave(p.x, p.y, 220, .6, '#ffb064');
      this.forEachEnemyNear(p.x, p.y, 220, e => { if (!e.boss && !e.mini) { const a = Math.atan2(e.y - p.y, e.x - p.x); e.x += Math.cos(a) * 120; e.y += Math.sin(a) * 120; } });
      Sound.play('evolve'); this.shake(10); this.freeze(.15);
      this.toast('SECOND WIND · THE EMBER REFUSES TO DIE');
    }
    if (p.hp <= 0) this.endRun(false);
  },

  hit(e, n, color, blast = false) {
    if (e.dead) return;
    const p = this.player;
    const crit = !blast && Math.random() < this.critChance;
    // Death blasts are fixed damage: no critical, HP-on-hit or spell multiplier loop.
    const dealt = blast ? n : (n * p.atk + p.maxHp * p.hpDamage) * this.damageMultiplier(e) * (crit ? this.critMult : 1);
    const actual = Math.min(Math.max(0, e.hp), dealt);
    e.hp -= dealt;
    const rank = p.passiveRanks.leech;
    if (rank && p.hp < p.maxHp) {
      const cap = p.maxHp * (.015 + .005 * rank);
      const heal = Math.min(actual * .008 * rank * this.heatDef.heal, Math.max(0, cap - p.lifeHealUsed), p.maxHp - p.hp);
      p.hp += heal; p.lifeHealUsed += heal;
    }
    e.hit = .08;
    if (e.boss && e.signature === 'gold') this.bossGoldSpill(e);
    if (!e.broken && !e.boss && !e.mini && ENEMY_TYPES[e.type].armor && e.hp <= e.maxHp * .5) { // armour breaks
      e.broken = true; this.burst(e.x, e.y, '#cfd6dd', 12); Sound.play('block');
      if (this.settings.damageNumbers) this.fx.texts.add(e.x, e.y - e.r - 10, tr('BROKEN'), '#cfd6dd');
    }
    if (p.path === 'frost' && !e.boss) e.slow = Math.max(e.slow, 1);
    // Knockback: regular foes are shoved away from the mage; heavier ones less.
    if (!e.boss && !e.mini && e.dashT <= 0 && !(e.fuseT > 0) && this.time >= (e.kbNext || 0)) {
      const a = Math.atan2(e.y - p.y, e.x - p.x), push = KNOCKBACK / Math.max(1, e.r / 11);
      e.kb = .09; e.kbx = Math.cos(a) * push; e.kby = Math.sin(a) * push; e.kbNext = this.time + KNOCK_COOLDOWN;
    }
    if (this.settings.damageNumbers) this.fx.texts.add(e.x, e.y - e.r, crit ? Math.round(dealt) + '!' : String(Math.round(dealt)), crit ? '#ffd34d' : color, crit);
    Sound.play(crit ? 'crit' : 'hit');
    if (p.path === 'frost') e.slow = Math.max(e.slow, 1.5);
    this.burst(e.x, e.y, color, 2);
    if (e.hp <= 0) this.kill(e, false, blast);
  },

  // noLoot: the enemy removed itself (a bomber blowing up), so it drops nothing.
  kill(e, noLoot = false, blast = false) {
    if (e.dead) return;
    e.dead = true;
    if (noLoot) return;
    this.meta.stats.kills++; this.runKills++;
    if (this.hearthBonus) this.hearthKills++;
    if (e.boss) this.meta.stats.bosses++;
    const drop = (dx, dy, type, value) => this.addDrop(e.x + dx, e.y + dy, type, value);
    if (e.boss) {
      if (!this.bossHurt) this.achieve('untouched');
      this.boss = null;
      drop(0, 0, 'xp', 55 + e.tier * 35);
      drop(-22, 0, 'soul', 12 + e.tier * 10);
      drop(22, 0, 'gems', this.dropValue('gems', 5 + e.tier * 3));
      drop(0, 22, 'coins', this.dropValue('coins', 9 + e.tier * 5));
      this.chests.push(new Chest(e.x, e.y, e.tier));
      this.stageClearPending = true;
      Sound.play('bigboom'); this.shake(14); this.freeze(.3);
      this.toast(`TIER ${e.tier} CHEST DROPPED · COLLECT IT`);
    } else if (e.mini) {
      this.minisDefeated++;
      // Each mini boss slain brings the final boss 20 seconds closer.
      if (!this.boss && !this.stageClearPending && this.bossCD > 25) this.bossCD = Math.max(25, this.bossCD - 20);
      Sound.play('boom'); this.shake(6); this.freeze(.06);
      drop(0, 0, 'xp', 32 + this.stage * 6);
      drop(-15, 0, 'soul', 3 + this.stage);
      drop(15, 0, 'gems', this.dropValue('gems', 4 + this.stage));
      drop(0, 15, 'coins', this.dropValue('coins', 5 + this.stage));
      this.toast(e.name.toUpperCase() + ' DEFEATED · BONUS LOOT');
    } else {
      const def = ENEMY_TYPES[e.type];
      Sound.play('kill');
      if (this.eventLoot(e, drop)) return;
      drop(0, 0, 'xp', def.xp);
      if (e.type === 'brood') for (let j = 0; j < 3; j++) this.addEnemy('ghoul', e.x + rand(-32, 32), e.y + rand(-32, 32));
      if (def.splitInto) for (let j = 0; j < def.splitInto.count; j++) this.addEnemy(def.splitInto.type, e.x + rand(-20, 20), e.y + rand(-20, 20));
      const roll = Math.random();
      if (roll < (def.soulChance || .22)) drop(8, 0, 'soul', 1);
      else if (roll < .58) drop(8, 0, 'gems', this.dropValue('gems', 1));
      else if (roll < .9) drop(8, 0, 'coins', this.dropValue('coins', def.coins || 1));
      if (e.type === 'skeleton' && Math.random() < .12) drop(-8, 0, 'coins', this.dropValue('coins', 1));
    }
    this.burst(e.x, e.y, e.color, e.boss ? 24 : 8);
    if (!e.boss && !e.mini) this.fx.corpse(e);
    // Kill combo: chains of kills within 2.5s; the chain pays out XP when it breaks.
    this.combo = (this.comboT > 0 ? this.combo || 0 : 0) + 1; this.comboT = COMBO_WINDOW;
    if (this.combo % 50 === 0) { Sound.play('chest'); this.fx.shockwave(this.player.x, this.player.y, 90, .4, '#ffd36b'); }
    this.meta.stats.bestCombo = Math.max(this.meta.stats.bestCombo || 0, this.combo);
    if (this.player.bargains.volatile && !e.boss && !e.mini && !blast) this.explode(e);
    // Contagion: a poisoned foe passes its poison to everything around it.
    if (e.poisonTime > 0 && this.player.evolved.venom === 'contagion') {
      this.fx.shockwave(e.x, e.y, 90, .35, '#81dc9a');
      this.forEachEnemyNear(e.x, e.y, 90, o => { o.poisonTime = 3; o.poisonDps = Math.max(o.poisonDps, e.poisonDps); });
    }
  },

  // Runs fn after `seconds` of game time (Tempest Ring's second pulse). Not saved.
  after(seconds, fn) { this.timers.push({t: seconds, fn}); },

  // Critical hits: 5% base, Keen Eye adds 4% chance and 10% damage per rank.
  get critChance() { return this.player.critChance + .04 * this.player.passiveRanks.keen; },
  get critMult() { return this.player.critMult + .1 * this.player.passiveRanks.keen; },
  get pickupRange() { return this.player.pickupRange * (1 + .25 * this.player.passiveRanks.lodestone) * (1 + metaBonus('magnet', this.perk('magnet'))); },

  // Situational damage bonuses: Path of Frost, Static Field shock, Berserker's Oath, Close Quarters.
  damageMultiplier(e) {
    const p = this.player, b = p.bargains;
    let m = p.path === 'frost' && e.slow > 0 ? 1.25 : 1;
    if (e.shock > 0) m *= 1.3;
    if (this.hearthBonus) m *= HEARTH.damage;
    // Ironclad armour: heavy damage reduction until the foe is below half HP.
    const armor = !e.boss && !e.mini && ENEMY_TYPES[e.type].armor;
    if (armor && !e.broken) m *= armor;
    if (b.berserker) m *= 1 + (1 - clamp(p.hp / p.maxHp, 0, 1)) * .8;
    if (b.closeQuarters) m *= dist2(p.x, p.y, e.x, e.y) < CLOSE_QUARTERS_RANGE * CLOSE_QUARTERS_RANGE ? 1.6 : .6;
    return m;
  },

  // Volatile Core: a slain foe bursts, hurting nearby foes and the player if too close.
  // Blast kills cannot burst again, and elite HP cannot turn one kill into a nuke.
  explode(e) {
    const p = this.player, radius = 60, damage = Math.min(e.maxHp * .15, 30 * p.atk);
    this.fx.shockwave(e.x, e.y, radius, .3, '#ff8a4c');
    this.forEachEnemyNear(e.x, e.y, radius, o => this.hit(o, damage, '#ffae6b', true));
    if (this.running && dist(e, p) < radius + p.r) this.damage(e.damage * .3);
  },

  // Past MAX_GEMS, new XP folds into the nearest XP drop so the floor never floods.
  addDrop(x, y, type, value) {
    if (type === 'xp' && this.drops.length >= MAX_GEMS) {
      let best = null, bd = Infinity;
      for (const d of this.drops) {
        if (d.type !== 'xp') continue;
        const dd = dist2(x, y, d.x, d.y);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best) { best.value += value; best.life = Math.max(best.life, 20); return; }
    }
    this.drops.push(new Drop(x, y, type, value));
  },

  dropValue(type, base) {
    const raw = base * this.yields[type] + (this.dropRemainders[type] || 0), amount = Math.floor(raw);
    this.dropRemainders[type] = raw - amount;
    return Math.max(1, amount);
  },

  collect(d) {
    if (d.type === 'xp') this.gainXP(d.value * this.xpMultiplier);
    else if (d.type === 'soul') { const v = Math.round(d.value * this.soulMult); this.souls += v; this.wallet += v; }
    else if (d.type === 'gems') this.gemsCount += d.value;
    else this.coins += d.value;
    if (d.type === 'gems' || d.type === 'coins') this.runAutoBuy(d.type);
    if (d.type === 'xp') this.tip('gems', 'TIP · GEMS GIVE XP · EACH LEVEL LETS YOU CHOOSE A NEW POWER');
    if (d.type === 'xp') { this.pickupCombo = this.time - (this.lastPickup || 0) < .4 ? (this.pickupCombo || 0) + 1 : 0; this.lastPickup = this.time; Sound.play('pickup', {combo: this.pickupCombo}); }
    else Sound.play(d.type === 'soul' ? 'soul' : 'coin');
    this.burst(d.x, d.y, DROP_COLORS[d.type], 5);
  },

  gainXP(n) {
    const p = this.player;
    p.xp += n;
    while (p.xp >= p.nextXp) { p.xp -= p.nextXp; p.level++; p.nextXp = Math.floor(p.nextXp * 1.35 + 5); this.levelQueue++; }
    if (this.levelQueue && !this.paused) this.levelUp();
  },

  levelUp() { this.setPaused(true); Sound.play('levelup'); UI.showLevelUp(this); },

  // A combo that lapses pays out XP that grows faster than the kill count.
  endCombo() {
    const n = this.combo || 0;
    this.combo = 0;
    if (n < COMBO_MIN) return;
    const xp = Math.round(Math.pow(n, 1.2) * .25 * (1 + (this.stage - 1) * .35));
    this.gainXP(xp * this.xpMultiplier);
    this.fx.texts.add(this.player.x, this.player.y - 46, `COMBO ${n} · +${xp} XP`, '#ffd36b', true);
  },

  // The level-up burst: a golden ring that shoves nearby foes back for breathing room.
  levelBurst() {
    const p = this.player;
    this.fx.shockwave(p.x, p.y, 150, .45, '#ffd36b');
    this.burst(p.x, p.y, '#ffe39a', 24);
    this.forEachEnemyNear(p.x, p.y, 150, e => { if (!e.boss && !e.mini) { const a = Math.atan2(e.y - p.y, e.x - p.x); e.kb = .2; e.kbx = Math.cos(a) * 420; e.kby = Math.sin(a) * 420; } });
  },

  takeLevelChoice(o) {
    o.take();
    this.levelQueue = Math.max(0, this.levelQueue - 1);
    hide('levelOverlay');
    this.setPaused(false);
    if (!this.levelQueue) this.levelBurst();
    if (this.levelQueue) this.levelUp();
    else if (this.stageComplete) { this.saveRun(true); this.showStageClear(); }
  },

  // The open chest is part of the run state, so a save taken while choosing (tab hidden,
  // page closed) reopens it on load instead of losing it.
  openChest(x, y, tier) {
    Sound.play('chest');
    this.pendingChest = {tier, x, y, picks: (this.earlySummon ? 2 : 1) + (this.perk('treasure') ? 1 : 0) + (this.route === 'elite' ? 1 : 0)};
    this.setPaused(true);
    UI.showChest(this);
  },

  openChestAgain() { this.setPaused(true); UI.showChest(this); },

  // Toasts queue instead of overwriting each other; a backlog plays faster.
  toast(s) {
    const q = this.toasts || (this.toasts = []);
    if (q.includes(s) || this.toastNow === s) return;
    q.push(s);
    if (q.length > 3) q.shift();
    if (!this.toastTimer) this.nextToast();
  },
  nextToast() {
    const t = $('toast'), s = this.toasts.shift();
    this.toastNow = s;
    if (!s) { t.classList.remove('on'); this.toastTimer = null; return; }
    t.textContent = tr(s);
    t.classList.add('on');
    this.toastTimer = setTimeout(() => this.nextToast(), this.toasts.length ? 1100 : 2000);
  },
});
