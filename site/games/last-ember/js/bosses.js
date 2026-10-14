'use strict';
// Boss set pieces. Every boss has a signature mechanic that awakens when it falls below
// its phase-two threshold (half HP, or 60% at Heat 7), announced with its own card.
// Gilded Mimic's gold spill runs for the whole fight.

// Signature per boss art index (stage 1..16, endless reuses Act II).
const BOSS_SIGNATURE = ['quake', 'warhorn', 'mirror', 'inferno', 'quake', 'warhorn', 'storm', 'eclipse',
  'blizzard', 'gold', 'thorns', 'quake', 'eclipse', 'mirror', 'eclipse', 'inferno',
  'lances', 'shatter', 'tide', 'hollow'];

// Hazard moves used by signatures; damage is scaled by the boss like its own moves.
const SIG_MOVES = {
  quake:   {type: 'zones', windup: 0, count: 3, radius: 75, delay: 1.1, damage: 34, spread: 220, color: '#c9a27a'},
  inferno: {type: 'zones', windup: 0, count: 2, radius: 70, delay: .9, damage: 26, spread: 120, linger: 5, dps: 16, color: '#ff5a2e'},
  storm:   {type: 'zones', windup: 0, count: 4, radius: 46, delay: .7, damage: 30, spread: 260, color: '#9df8ff'},
  lance:   {type: 'zones', windup: 0, radius: 40, delay: 1.1, damage: 40, color: '#ff7a3a'},
  tide:    {type: 'zones', windup: 0, radius: 48, delay: 1.5, damage: 45, slow: true, color: '#7fe3ff'},
};

const SIGNATURES = {
  quake:    {name: 'QUAKE', line: 'THE GROUND BREAKS · BOULDERS FALL', every: 5,
    tick: (g, b) => b.resolveMove(SIG_MOVES.quake, g, null), onStart: g => g.shake(12)},
  warhorn:  {name: 'WAR HORN', line: 'ELITE GUARDS ANSWER THE CALL', every: 9,
    tick(g, b) {
      const types = Object.keys(stageInfo(g.stage).roster).filter(t => ENEMY_TYPES[t].speed > 0 && !ENEMY_TYPES[t].fuse);
      for (let i = 0; i < 2; i++) {
        const e = g.addEnemy(types[i % types.length], b.x + rand(-80, 80), b.y + rand(-80, 80));
        if (e) { e.elite = true; e.maxHp *= 3; e.hp = e.maxHp; e.r *= 1.25; }
      }
      Sound.play('warn');
    }},
  mirror:   {name: 'MIRROR WALLS', line: 'ITS SHOTS NOW REBOUND FROM THE WALLS', every: 0},
  inferno:  {name: 'INFERNO', line: 'THE FLOOR ITSELF BURNS', every: 3.5,
    tick: (g, b) => b.resolveMove(SIG_MOVES.inferno, g, null)},
  storm:    {name: 'TEMPEST', line: 'LIGHTNING STRIKES WITHOUT END', every: 2.6,
    tick: (g, b) => { b.resolveMove(SIG_MOVES.storm, g, null); Sound.play('zap'); }},
  eclipse:  {name: 'ECLIPSE', line: 'YOUR LIGHT GROWS DIM', every: 0},
  blizzard: {name: 'WHITEOUT', line: 'THE COLD SLOWS EVERY STEP', every: .25,
    tick: g => { g.player.slowTime = Math.max(g.player.slowTime, .3); if (g.settings.particles) for (let i = 0; i < 6; i++) g.fx.particles.burst(g.player.x + rand(-g.viewW / 2, g.viewW / 2), g.player.y + rand(-g.viewH / 2, g.viewH / 2), '#e8f6ff', 1); }},
  gold:     {name: 'GOLDEN FRENZY', line: 'IT SPILLS GOLD AS IT BLEEDS · AND BITES HARDER', every: 0,
    onStart: (g, b) => { b.damage *= 1.25; }},
  lances:   {name: 'RAIN OF LANCES', line: 'BURNING LANCES FALL IN LINES', every: 4,
    tick(g, b) { // a line of strikes across the mage's position, one gap to dash through
      const p = g.player, a = rand(0, Math.PI), gap = Math.floor(rand(1, 8));
      for (let i = 0; i < 9; i++) if (i !== gap && i !== gap + 1) {
        const d = (i - 4) * 70;
        g.hazards.push(new Hazard(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, SIG_MOVES.lance, SIG_MOVES.lance.damage * b.moveScale));
      }
    }},
  shatter:  {name: 'SHATTERED GLASS', line: 'SHARDS CONVERGE FROM EVERY SIDE', every: 5,
    tick(g, b) { // three points around the mage fire shards inward
      const p = g.player, a0 = rand(0, TAU);
      for (let k = 0; k < 3; k++) {
        const a = a0 + k * TAU / 3, x = p.x + Math.cos(a) * 300, y = p.y + Math.sin(a) * 300;
        for (let i = -2; i <= 2; i++) g.enemyShots.push(new EnemyShot(x, y, Math.atan2(p.y - y, p.x - x) + i * .16, 'sentinel', Math.max(8, b.damage * .35)));
      }
      Sound.play('warn');
    }},
  tide:     {name: 'THE TIDE', line: 'A WAVE SWEEPS THE SEA · FIND THE GAP', every: 6.5,
    tick(g, b) { // a wall of water across the arena with one gap
      const p = g.player, horizontal = Math.random() < .5, gap = rand(-200, 200);
      for (let d = -520; d <= 520; d += 80) {
        if (Math.abs(d - gap) < 90) continue;
        g.hazards.push(new Hazard(horizontal ? p.x + d : p.x + rand(-20, 20), horizontal ? p.y + rand(-20, 20) : p.y + d, SIG_MOVES.tide, SIG_MOVES.tide.damage * b.moveScale));
      }
      Sound.play('warn');
    }},
  hollow:   {name: 'THE HOLLOW FLAME', line: 'ALL LIGHT FAILS · EVERY TERROR AT ONCE', every: 3.2,
    tick(g, b) { const order = ['lances', 'shatter', 'tide']; SIGNATURES[order[(b.hollowI = (b.hollowI || 0) + 1) % 3]].tick(g, b); }},
  thorns:   {name: 'THORN CAGE', line: 'THORNS CLOSE IN · DASH THROUGH THE GAPS', every: 8,
    tick(g) {
      const p = g.player, gap = rand(0, TAU);
      for (let i = 0; i < 10; i++) {
        const a = gap + .45 + i * (TAU - .9) / 9;
        g.obstacles.push({x: p.x + Math.cos(a) * 175, y: p.y + Math.sin(a) * 175, r: 24, kind: 'thorn', v: i % 3, life: 6});
      }
      Sound.play('warn');
    }},
};

mixin(Game, {
  get bossSignature() { return this.boss && this.boss.signed ? this.boss.signature : null; },

  // Called every step while a boss is alive.
  stepBossSignature(dt) {
    const b = this.boss;
    if (!b || b.dead) { this.darkness = Math.min(1, (this.darkness ?? 1) + dt); return; }
    b.signature = b.signature || BOSS_SIGNATURE[stageInfo(b.tier).art] || 'quake';
    const sig = SIGNATURES[b.signature];
    if (!b.signed && b.hp < b.maxHp * this.heatDef.phase2At) {
      b.signed = true; b.sigT = 1.5;
      if (sig.onStart) sig.onStart(this, b);
      this.phaseCard(b, sig);
    }
    const dark = b.signed && (b.signature === 'eclipse' || b.signature === 'hollow') ? .45 : 1;
    this.darkness = (this.darkness ?? 1) + (dark - (this.darkness ?? 1)) * Math.min(1, dt * 2);
    if (b.signed && sig.every && (b.sigT -= dt) <= 0) { b.sigT = sig.every; sig.tick(this, b); }
  },

  phaseCard(b, sig) {
    const card = $('bossCard');
    $('bossCardAct').textContent = `${b.name.toUpperCase()} · PHASE TWO`;
    $('bossCardName').textContent = tr(sig.name);
    $('bossCardLine').textContent = tr(sig.line);
    card.classList.add('hidden'); void card.offsetWidth; card.classList.remove('hidden');
    clearTimeout(this.bossCardTimer);
    this.bossCardTimer = setTimeout(() => card.classList.add('hidden'), 2700);
    Sound.play('boss'); this.shake(10); this.freeze(.2);
    this.fx.shockwave(b.x, b.y, 200, .7, b.color);
  },

  // Gilded Mimic: every 10% of its HP lost spills a pile of gold.
  bossGoldSpill(e) {
    const mark = Math.floor((1 - clamp(e.hp / e.maxHp, 0, 1)) * 10);
    while ((e.goldMark || 0) < mark) {
      e.goldMark = (e.goldMark || 0) + 1;
      const a = rand(0, TAU);
      this.addDrop(e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, 'coins', this.dropValue('coins', 3 + this.stage));
    }
  },
});
