'use strict';
// Stage events: twice a stage something happens on top of the horde.
//   elite   a ring of champion enemies (4x HP, gold ring, extra loot)
//   goblin  a treasure goblin that runs from you and escapes after 14s
//   shrine  stand in it to awaken a 20s surge of enemies; survive it for a boon

const EVENT_TIMES = [75, 165];        // stage seconds; skipped if the boss is near or out
const EVENT_KINDS = ['elite', 'goblin', 'shrine'];
const SURGE_SECONDS = 20;

// Shrine boons, one at random when a surge is survived.
const SHRINE_BOONS = [
  {text: 'ATTACK +10%', take: g => { g.player.atk *= 1.1; }},
  {text: 'MAX HP +12%', take: g => { const p = g.player, gain = p.maxHp * .12; p.maxHp += gain; p.hp = Math.min(p.maxHp, p.hp + gain); }},
  {text: 'A FREE LEVEL', take: g => g.gainXP(g.player.nextXp - g.player.xp)},
  {text: 'SOULS', take: g => { const v = Math.round((10 + g.stage * 2) * g.soulMult); g.souls += v; g.wallet += v; }},
];

class Shrine {
  constructor(x, y) { this.x = clamp(x, -ARENA_X + 80, ARENA_X - 80); this.y = clamp(y, -ARENA_Y + 80, ARENA_Y - 80); this.r = 60; this.charge = 0; this.life = 40; }
  update(dt, g) {
    this.life -= dt;
    pushOutOfObstacles(g.obstacles, this, 34);
    if (dist(this, g.player) < this.r) this.charge += dt;
    if (this.charge >= 2.5) { g.startSurge(this); return false; }
    return this.life > 0;
  }
}

mixin(Game, {
  // Stage-authored pressure, independent of the player's damage or purchases.
  // A marked strike prevents an otherwise complete build from winning unattended.
  stepSiege(dt) {
    const p = this.player;
    if (this.stage < SIEGE.stage || this.stageClearPending || this.stageComplete) { this.siegeClock = 0; this.siegeStrikes = 0; return; }
    if (dist2(p.x, p.y, this.siegeAnchor.x, this.siegeAnchor.y) > SIEGE.move * SIEGE.move) {
      this.siegeAnchor = {x: p.x, y: p.y}; this.siegeClock = 0; this.siegeStrikes = 0;
    }
    if ((this.siegeClock += dt) < SIEGE.wait) return;
    this.siegeClock = 0;
    this.hazards.push(new Hazard(p.x, p.y, SIEGE, (16 + this.stage * 5) * Math.pow(1.18, Math.max(0, this.stage - 8)) * this.heatDef.damage * Math.pow(1.6, this.siegeStrikes++)));
    Sound.play('warn');
    if (this.siegeStrikes > 1) this.tip('siege2', 'MOVE TO A NEW AREA · MARKED STRIKES ARE GROWING STRONGER');
    this.tip('siege', 'MARKED STRIKE · MOVE OR DASH OUT OF THE CIRCLE');
  },

  stepEvents(dt) {
    if (this.surgeT > 0 && (this.surgeT -= dt) <= 0) this.endSurge();
    compact(this.shrines, s => s.update(dt, this));
    const at = EVENT_TIMES[this.eventIndex];
    if (at === undefined || this.stageTime < at) return;
    this.eventIndex++;
    if (this.boss || this.stageClearPending || this.bossCD < 30) return;
    const kinds = this.route === 'shrine' ? ['shrine'] : EVENT_KINDS.filter(k => k !== this.lastEvent);
    this.startEvent(kinds[Math.floor(Math.random() * kinds.length)]);
  },

  startEvent(kind) {
    const p = this.player;
    this.lastEvent = kind;
    Sound.play('warn');
    if (kind === 'elite') {
      const types = Object.keys(stageInfo(this.stage).roster).filter(t => ENEMY_TYPES[t].speed > 0);
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6, e = this.addEnemy(types[i % types.length], p.x + Math.cos(a) * 340, p.y + Math.sin(a) * 340);
        if (e) { e.elite = true; e.maxHp *= 4; e.hp = e.maxHp; e.r *= 1.25; e.damage *= 1.3; }
      }
      this.toast('ELITE WAVE · CHAMPIONS APPROACH');
    } else if (kind === 'goblin') {
      const a = rand(0, TAU);
      this.addEnemy('goblin', p.x + Math.cos(a) * 280, p.y + Math.sin(a) * 280);
      this.toast('TREASURE GOBLIN · CATCH IT BEFORE IT ESCAPES');
    } else {
      const a = rand(0, TAU), r = rand(260, 380);
      this.shrines.push(new Shrine(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r));
      this.toast('CURSED SHRINE · STAND IN IT TO AWAKEN A SURGE');
    }
  },

  startSurge(shrine) {
    this.surgeT = SURGE_SECONDS;
    this.fx.shockwave(shrine.x, shrine.y, 140, .6, '#c77dff');
    Sound.play('boss'); this.shake(6);
    this.toast(`THE SHRINE AWAKENS · SURVIVE ${SURGE_SECONDS}s`);
  },

  endSurge() {
    const boon = SHRINE_BOONS[Math.floor(Math.random() * SHRINE_BOONS.length)];
    boon.take(this);
    if (this.route === 'shrine') boon.take(this);
    this.achieve('shrine');
    Sound.play('chest');
    this.toast(`SURGE SURVIVED · ${boon.text}`);
  },

  // Extra loot for event enemies; returns true if the kill was handled here.
  eventLoot(e, drop) {
    if (e.type === 'goblin') {
      this.achieve('goblin');
      drop(0, 0, 'xp', 30 + this.stage * 4);
      drop(-14, 0, 'gems', this.dropValue('gems', 12 + this.stage));
      drop(14, 0, 'coins', this.dropValue('coins', 16 + this.stage * 2));
      drop(0, 14, 'soul', 4 + Math.floor(this.stage / 2));
      Sound.play('chest');
      this.toast('GOBLIN CAUGHT · TREASURE SPILLS');
      return true;
    }
    if (e.elite) {
      drop(-10, 6, 'gems', this.dropValue('gems', 3));
      drop(10, 6, 'coins', this.dropValue('coins', 4));
      drop(0, -10, 'soul', 2);
    }
    return false;
  },

  // A line for the HUD while an event is running.
  get eventStatus() {
    if (this.surgeT > 0) return `SHRINE SURGE · SURVIVE ${Math.ceil(this.surgeT)}s`;
    const gob = this.enemies.find(e => e.type === 'goblin' && !e.dead);
    if (gob) return `CATCH THE GOBLIN · ${Math.max(0, Math.ceil(ENEMY_TYPES.goblin.flee - gob.fleeT))}s`;
    if (this.shrines.length) return 'A CURSED SHRINE WAITS';
    return '';
  },
});
