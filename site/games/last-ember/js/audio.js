'use strict';
// Synthesized sound: effects and a generative music loop, all built from oscillators
// and noise at runtime, so there are no audio files to download.
//
// Browsers only allow audio after a user gesture, so the context is created on the
// first pointer or key press. Frequent sounds (hits, pickups) are rate-limited so a big
// fight stays readable instead of turning into noise.

const Sound = {
  ctx: null, master: null, sfxGain: null, musicGain: null, noise: null,
  sfxOn: true, musicOn: true,
  last: {},       // sound name -> last play time, for rate limiting
  music: {on: false, next: 0, step: 0, intensity: 0},

  init(settings) {
    this.sfxOn = settings.sound !== false;
    this.musicOn = settings.music !== false;
    const unlock = () => {
      this.start();
      removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock);
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  },

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    this.master = this.ctx.createGain(); this.master.gain.value = .8;
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxOn ? .55 : 0;
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicOn ? .18 : 0;
    this.sfxGain.connect(this.master); this.musicGain.connect(this.master);
    this.master.connect(comp); comp.connect(this.ctx.destination);
    // One second of white noise, reused by every noisy sound.
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },

  setSfx(on) { this.sfxOn = on; if (this.sfxGain) this.sfxGain.gain.value = on ? .55 : 0; },
  setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = on ? .18 : 0; },

  // ---------- Building blocks ----------
  tone(freq, dur, {type = 'sine', vol = .3, at = 0, slide = 0, attack = .005, dest = this.sfxGain} = {}) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .02);
  },
  burst(dur, {vol = .3, at = 0, freq = 1200, q = .7, sweep = 0, type = 'lowpass'} = {}) {
    const c = this.ctx, t = c.currentTime + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t); src.stop(t + dur + .02);
  },

  // ---------- Effects ----------
  // gap: minimum seconds between two plays of the same sound.
  play(name, opts = {}) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const def = SOUNDS[name];
    if (!def) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || -1) < (def.gap || 0)) return;
    this.last[name] = now;
    def.fn(this, opts);
  },

  // ---------- Music ----------
  // A slow minor progression with a bass pulse and an arpeggio. Intensity (0-1) adds
  // notes and speed; a boss fight raises it. Scheduled a little ahead of time.
  updateMusic(intensity, playing) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const m = this.music;
    m.intensity += (intensity - m.intensity) * .05;
    if (!playing || !this.musicOn) { m.next = 0; return; }
    const now = this.ctx.currentTime;
    if (m.next < now) m.next = now + .05;
    const beat = .42 - m.intensity * .14;
    while (m.next < now + .25) {
      this.musicStep(m.step++, m.next, beat);
      m.next += beat;
    }
  },
  musicStep(step, t, beat) {
    const chords = MUSIC_ACTS[this.act || 1] || MUSIC_ACTS[1];
    const chord = chords[Math.floor(step / 8) % chords.length], hz = n => 440 * Math.pow(2, (n - 69) / 12);
    const at = t - this.ctx.currentTime, k = this.music.intensity, dest = this.musicGain;
    if (step % 8 === 0) for (const n of chord) this.tone(hz(n - 12), beat * 8, {type: 'triangle', vol: .09, at, attack: .4, dest});
    if (step % 2 === 0) this.tone(hz(chord[0] - 24), beat * 1.6, {type: 'sine', vol: .22 + k * .1, at, dest});
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    if (k > .15 || step % 2 === 0) this.tone(hz(chord[arp[step % 8]] + 12), beat * .9, {type: 'square', vol: .025 + k * .03, at, dest});
    if (k > .5 && step % 2 === 1) this.tone(hz(chord[(step >> 1) % 3] + 24), beat * .5, {type: 'triangle', vol: .03, at, dest});
  },
};

// Chord progressions per act, so each part of the journey has its own mood.
const MUSIC_ACTS = {
  1: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],   // Am F G Em
  2: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]],   // Dm Bb C A
  3: [[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 51, 54]],   // Em C Dm B
};

// Sound recipes. Each runs on the Sound object when played.
const SOUNDS = {
  click:   {gap: .03, fn: s => s.tone(660, .06, {type: 'triangle', vol: .15})},
  hit:     {gap: .045, fn: s => s.tone(rand(220, 300), .05, {type: 'square', vol: .05, slide: .6})},
  crit:    {gap: .06, fn: s => { s.tone(880, .08, {type: 'square', vol: .08, slide: 1.5}); s.tone(1320, .06, {type: 'triangle', vol: .06, at: .02}); }},
  kill:    {gap: .05, fn: s => s.burst(.09, {vol: .12, freq: 1800, sweep: .3})},
  pickup:  {gap: .03, fn: (s, o) => s.tone(700 + Math.min(12, o.combo || 0) * 45, .06, {type: 'sine', vol: .09})},
  coin:    {gap: .06, fn: s => { s.tone(1046, .07, {type: 'square', vol: .05}); s.tone(1568, .12, {type: 'square', vol: .05, at: .05}); }},
  soul:    {gap: .1, fn: s => s.tone(520, .3, {type: 'sine', vol: .12, slide: 1.8})},
  hurt:    {gap: .12, fn: s => { s.tone(160, .18, {type: 'sawtooth', vol: .2, slide: .5}); s.burst(.12, {vol: .12, freq: 900}); }},
  levelup: {gap: .3, fn: s => [523, 659, 784, 1046].forEach((f, i) => s.tone(f, .18, {type: 'triangle', vol: .16, at: i * .07}))},
  evolve:  {gap: .3, fn: s => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => s.tone(f, .3, {type: 'triangle', vol: .14, at: i * .06}))},
  boom:    {gap: .07, fn: s => { s.burst(.35, {vol: .3, freq: 700, sweep: .2}); s.tone(90, .3, {type: 'sine', vol: .25, slide: .5}); }},
  bigboom: {gap: .15, fn: s => { s.burst(.7, {vol: .4, freq: 500, sweep: .15}); s.tone(60, .6, {type: 'sine', vol: .35, slide: .4}); }},
  warn:    {gap: .25, fn: s => { s.tone(880, .09, {type: 'square', vol: .07}); s.tone(880, .09, {type: 'square', vol: .07, at: .14}); }},
  slam:    {gap: .2, fn: s => { s.tone(70, .5, {type: 'sine', vol: .4, slide: .45}); s.burst(.4, {vol: .3, freq: 400, sweep: .3}); }},
  boss:    {gap: 1, fn: s => { s.tone(110, 1.2, {type: 'sawtooth', vol: .16, attack: .2, slide: .7}); s.tone(73, 1.4, {type: 'square', vol: .1, attack: .3}); }},
  chest:   {gap: .5, fn: s => [659, 784, 988, 1318].forEach((f, i) => s.tone(f, .25, {type: 'sine', vol: .14, at: i * .05}))},
  zap:     {gap: .08, fn: s => s.burst(.12, {vol: .1, freq: 3000, type: 'bandpass', q: 3, sweep: .5})},
  block:   {gap: .1, fn: s => s.tone(1200, .07, {type: 'triangle', vol: .08, slide: .8})},
  shieldBreak: {gap: .4, fn: s => { s.burst(.25, {vol: .18, freq: 2600, type: 'bandpass', q: 2, sweep: .4}); s.tone(500, .25, {type: 'triangle', vol: .12, slide: .4}); }},
  dash:    {gap: .1, fn: s => s.burst(.16, {vol: .14, freq: 1400, type: 'bandpass', q: 1.5, sweep: 2.2})},
  ult:     {gap: .25, fn: s => { s.burst(.4, {vol: .2, freq: 900, sweep: .3}); s.tone(220, .4, {type: 'sawtooth', vol: .08, slide: 2}); }},
  escape:  {gap: .5, fn: s => [784, 659, 523].forEach((f, i) => s.tone(f, .15, {type: 'square', vol: .06, at: i * .08}))},
  ward:    {gap: .08, fn: s => s.tone(1400, .1, {type: 'triangle', vol: .07, slide: .7})},
  death:   {gap: 1, fn: s => [392, 330, 262, 196].forEach((f, i) => s.tone(f, .45, {type: 'triangle', vol: .18, at: i * .18}))},
  victory: {gap: 1, fn: s => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => s.tone(f, .35, {type: 'triangle', vol: .17, at: i * .12}))},
};
