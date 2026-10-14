'use strict';
// DOM HUD. Refreshes at most 10 times a second and only writes values that changed,
// so the browser is not re-laying-out the HUD every frame.

class Hud {
  constructor() {
    this.el = {};
    for (const id of ['hpText', 'hpBar', 'shieldText', 'shieldBar', 'xpText', 'xpBar', 'souls', 'gems', 'coins', 'finishBtn',
      'stageGoal', 'wave', 'timer', 'spellTray', 'autoBuyInfo', 'bossUI', 'bossBar', 'bossName', 'bossPortrait', 'perf', 'pauseBtn', 'callBossBtn']) this.el[id] = $(id);
    this.cache = new Map();
    this.nextAt = 0;
    this.fps = {frames: 0, since: performance.now(), text: ''};
  }

  text(id, value) {
    if (this.cache.get(id) === value) return;
    this.cache.set(id, value);
    this.el[id].textContent = value;
  }
  bar(id, ratio) {
    const v = Math.round(clamp(ratio, 0, 1) * 200) / 200;
    if (this.cache.get(id) === v) return;
    this.cache.set(id, v);
    this.el[id].style.transform = `scaleX(${v})`;
  }
  toggle(id, cls, on) {
    const key = id + '.' + cls;
    if (this.cache.get(key) === on) return;
    this.cache.set(key, on);
    this.el[id].classList.toggle(cls, on);
  }

  // force: refresh now regardless of the 10 Hz budget (used after purchases, level ups).
  update(g, now = performance.now(), force = false) {
    if (!force && now < this.nextAt) return;
    this.nextAt = now + 100;
    const p = g.player;
    this.text('hpText', `${Math.ceil(Math.max(0, p.hp))} / ${Math.ceil(p.maxHp)}`);
    this.bar('hpBar', p.hp / p.maxHp);
    this.text('shieldText', String(Math.floor(p.shield)));
    this.bar('shieldBar', p.shield / Math.max(50, p.shieldCap));
    this.text('xpText', `${Math.floor(p.xp)} / ${p.nextXp}`);
    this.bar('xpBar', p.xp / p.nextXp);
    this.text('souls', String(g.wallet));
    this.text('gems', String(g.gemsCount));
    this.text('coins', String(g.coins));
    const auto = ['gems', 'coins'].filter(c => g.autoBuy[c]).map(c => `${MARKET[g.autoBuy[c]].short} ${g.balance(c)}/${g.marketCost(g.autoBuy[c])}`);
    this.toggle('autoBuyInfo', 'hidden', !auto.length);
    if (auto.length) this.text('autoBuyInfo', 'AUTO ' + auto.join(' · '));
    this.toggle('finishBtn', 'ready', !!g.stageComplete);
    this.toggle('callBossBtn', 'hidden', !g.canCallBoss);
    if (g.canCallBoss) this.text('callBossBtn', g.bossCD >= 60 ? `CALL BOSS · 2 ARTIFACTS` : 'CALL BOSS NOW');
    this.text('pauseBtn', g.paused && g.running ? '▶ RESUME' : 'Ⅱ PAUSE');
    this.text('stageGoal', g.stageComplete ? 'STAGE CLEARED · FINISH WHEN READY'
      : g.boss ? 'DEFEAT THE BOSS'
      : g.stageClearPending ? 'CLAIM THE CHEST'
      : g.eventStatus || `Mini bosses ${g.minisDefeated}/${g.miniGoal} · final boss in ${Math.max(0, Math.ceil(g.bossCD))}s`);
    this.text('wave', `${g.stage > STAGE_COUNT ? `ENDLESS ${g.stage - STAGE_COUNT}` : `STAGE ${g.stage}/${STAGE_COUNT}`} · LV ${p.level} · FOE LV ${(g.stage - 1) * 3 + 1 + Math.floor(g.stageTime / 20)} · HEAT ${g.heat || 0}`);
    this.text('timer', formatTime(g.time));
    this.updateBoss(g);
    this.updateTray(p);
  }

  updateBoss(g) {
    const b = g.boss;
    this.toggle('bossUI', 'hidden', !b);
    if (!b) return;
    this.bar('bossBar', b.hp / b.maxHp);
    this.text('bossName', `TIER ${b.tier} · ${b.name.toUpperCase()}`);
    const src = `assets/boss-${stageInfo(b.tier).art}.webp`;
    if (this.cache.get('bossPortrait') !== src) { this.cache.set('bossPortrait', src); this.el.bossPortrait.src = src; }
  }

  updateTray(p) {
    const spell = key => (p.evolved[key] ? 'evo:' : '') + SPELLS[key].icon;
    const chips = [spell('bolt')];
    for (const key of Object.keys(SPELLS)) if (key !== 'bolt' && p.skills[key]) chips.push(spell(key));
    for (const key of Object.keys(PASSIVES)) if (p.passiveRanks[key]) chips.push(key);
    if (p.path) chips.push(PATHS[p.path].icon);
    if (p.ultimate) chips.push(ULTIMATES[p.ultimate].icon);
    for (const key of Object.keys(BARGAINS)) if (p.bargains[key]) chips.push('bargain:' + BARGAINS[key].icon);
    const sig = chips.join(',');
    if (this.cache.get('tray') === sig) return;
    this.cache.set('tray', sig);
    this.el.spellTray.innerHTML = chips.map(chip => {
      const [kind, icon] = chip.includes(':') ? chip.split(':') : ['', chip];
      const cls = kind === 'bargain' ? ' bargain' : kind === 'evo' ? ' evolved' : '';
      return `<div class="spellChip${cls}"><i class="icon icon-${icon}">${iconMarkup(icon)}</i></div>`;
    }).join('');
  }

  // FPS overlay, refreshed twice a second when enabled.
  perf(g, renderer, visible) {
    this.toggle('perf', 'hidden', !visible);
    if (!visible) return;
    const f = this.fps, now = performance.now();
    f.frames++;
    if (now - f.since < 500) return;
    const fps = f.frames * 1000 / (now - f.since);
    f.frames = 0; f.since = now;
    this.el.perf.textContent = `${fps.toFixed(0)} fps · ${renderer.px}x\n` +
      `foes ${g.enemies.length} · drops ${g.drops.length} · fx ${g.fx.particles.n}`;
  }
}
