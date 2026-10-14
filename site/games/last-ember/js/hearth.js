'use strict';
// The Hearth: plant your ember on the ground to make a pool of light. Inside it you deal
// more damage, heal and recharge your shield faster, but nearby foes break off to attack
// the flame. Recall it (same key) for a fire nova that grows the longer it burned; if the
// foes snuff it out, it takes a long time to rekindle. Mixed into Game.

const HEARTH = {r: 140, damage: 1.3, heal: .012, shieldRegen: 2, lure: 230,
  hp: 1.5,            // share of the mage's max HP
  armor: .5,          // foes deal this share of their damage to it
  mend: .04,          // share of its HP restored per second while the mage tends it
  maxCharge: 12,      // seconds of burning that the recall nova grows with
  recallCD: 5, snuffedCD: 18};

mixin(Game, {
  get hearthBonus() {
    const h = this.hearth, p = this.player;
    return h && dist2(h.x, h.y, p.x, p.y) < HEARTH.r * HEARTH.r;
  },

  // Plant if there is no Hearth; recall if there is.
  useHearth() {
    if (!this.running || this.paused) return;
    const p = this.player;
    if (this.hearth) { this.recallHearth(); return; }
    if (this.hearthCD > 0) { this.toast(`THE HEARTH REKINDLES IN ${Math.ceil(this.hearthCD)}s`); return; }
    const hp = p.maxHp * HEARTH.hp;
    this.hearth = {x: p.x, y: p.y + 6, hp, maxHp: hp, t: 0};
    pushOutOfObstacles(this.obstacles, this.hearth, 24);
    Sound.play('ward'); this.fx.shockwave(p.x, p.y, HEARTH.r, .4, '#ffb064');
    this.tip('hearth2', 'TIP · PRESS AGAIN TO RECALL THE HEARTH WITH A FIRE NOVA');
  },

  recallHearth() {
    const h = this.hearth, p = this.player;
    const k = Math.min(h.t, HEARTH.maxCharge) / HEARTH.maxCharge, r = 120 + 80 * k;
    const dmg = (25 + 14 * p.level) * (.4 + 1.6 * k) * (this.mut('ember') ? 1.5 : 1);
    this.forEachEnemyNear(h.x, h.y, r, e => this.hit(e, dmg, '#ffb064'));
    this.fx.shockwave(h.x, h.y, r, .55, '#ff8a3d');
    this.burst(h.x, h.y, '#ffb064', 30);
    Sound.play(k > .6 ? 'bigboom' : 'boom'); this.shake(4 + 6 * k);
    if (k >= 1) this.toast('FULL HEARTH NOVA');
    this.hearth = null; this.hearthCD = HEARTH.recallCD * (this.mut('ember') ? .5 : 1);
  },

  stepHearth(dt) {
    if (this.hearthCD > 0) this.hearthCD -= dt;
    const h = this.hearth;
    if (!h) return;
    h.t += dt;
    const p = this.player;
    if (this.hearthBonus) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * HEARTH.mend * dt);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * HEARTH.heal * this.heatDef.heal * dt);
      if (p.shield < p.shieldCap) p.shield = Math.min(p.shieldCap, p.shield + p.shieldRegen * (HEARTH.shieldRegen - 1) * dt);
    }
    if (h.hp <= 0) {
      this.hearth = null; this.hearthCD = HEARTH.snuffedCD * (this.mut('ember') ? .5 : 1);
      this.fx.shockwave(h.x, h.y, 90, .5, '#556070');
      Sound.play('shieldBreak'); this.shake(5);
      this.toast('THE HEARTH IS SNUFFED OUT');
    }
  },
});
