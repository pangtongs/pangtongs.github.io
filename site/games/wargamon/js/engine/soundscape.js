/* Original procedural chiptunes: town/route motifs, battle pulse and action cues. */
const defaultAudioPreferences = { music: true, effects: true, musicVolume: 25, effectsVolume: 40 };
let audioPreferences = { ...defaultAudioPreferences };
try {
  const saved = JSON.parse(localStorage.getItem('wargamon-audio') || '{}');
  if (saved && typeof saved === 'object') {
    for (const key of ['music', 'effects'])
      if (typeof saved[key] === 'boolean') audioPreferences[key] = saved[key];
    for (const key of ['musicVolume', 'effectsVolume'])
      if (Number.isFinite(saved[key])) audioPreferences[key] = Math.max(0, Math.min(100, saved[key]));
  }
} catch {}
let audioUnlocked = false,
  musicStep = 0,
  musicTimer = null,
  musicTheme = '',
  musicVoices = new Set();
function audioContext() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    audioUnlocked = true;
    return audioCtx;
  } catch {
    return null;
  }
}
function tone(hz, time, length, volume, type = 'triangle', music = false) {
  const ac = audioCtx;
  if (!ac || volume <= 0) return;
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz, time);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(volume, time + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, time + length);
  o.connect(g);
  g.connect(ac.destination);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
    musicVoices.delete(o);
  };
  if (music) musicVoices.add(o);
  o.start(time);
  o.stop(time + length + 0.02);
}
// Kendang-like low/high drum voices and a dry shaker are synthesized locally.
// No recorded song or external audio file is used.
function percussion(time, high, volume) {
  const ac = audioCtx;
  if (!ac || volume <= 0) return;
  const osc = ac.createOscillator(),
    gain = ac.createGain(),
    start = high ? 310 : 135;
  osc.type = high ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(start, time);
  osc.frequency.exponentialRampToValueAtTime?.(high ? 135 : 54, time + (high ? 0.08 : 0.16));
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + (high ? 0.11 : 0.2));
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
    musicVoices.delete(osc);
  };
  musicVoices.add(osc);
  osc.start(time);
  osc.stop(time + (high ? 0.12 : 0.21));
}
function shaker(time, volume) {
  const ac = audioCtx;
  if (!ac || volume <= 0) return;
  if (
    typeof ac.createBuffer !== 'function' ||
    typeof ac.createBufferSource !== 'function' ||
    typeof ac.createBiquadFilter !== 'function'
  )
    return;
  const size = Math.floor(ac.sampleRate * 0.07),
    buffer = ac.createBuffer(1, size, ac.sampleRate),
    data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const source = ac.createBufferSource(),
    filter = ac.createBiquadFilter(),
    gain = ac.createGain();
  source.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.value = 4400;
  gain.gain.value = volume;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
    musicVoices.delete(source);
  };
  musicVoices.add(source);
  source.start(time);
}
function playCue(kind = 'tap') {
  if (!audioPreferences.effects || audioPreferences.effectsVolume <= 0 || !audioUnlocked || document.hidden)
    return;
  const ac = audioContext();
  if (!ac) return;
  const v = (audioPreferences.effectsVolume / 100) * 0.065,
    notes = {
      tap: [660, 880],
      buy: [523, 659, 784],
      heal: [392, 523, 659, 784],
      hit: [180, 110],
      win: [523, 659, 784, 1046],
      error: [220, 164],
      catch: [659, 784, 1046],
    }[kind] || [660];
  notes.forEach((n, i) =>
    tone(n, ac.currentTime + i * 0.075, 0.12, v, kind === 'hit' ? 'sawtooth' : 'triangle'),
  );
}
function beep(f = 440, d = 0.09) {
  playCue(f >= 850 ? 'win' : f >= 680 ? 'buy' : f >= 600 ? 'heal' : f < 250 ? 'hit' : 'tap');
}
function stopMusic() {
  if (musicTimer !== null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
  for (const v of musicVoices) {
    try {
      v.stop();
    } catch {}
  }
  musicVoices.clear();
}
function scheduleMusic() {
  // Nyepi, the day of silence (calendar.js), has no music.
  if (
    !audioPreferences.music ||
    audioPreferences.musicVolume <= 0 ||
    !audioUnlocked ||
    document.hidden ||
    (typeof nyepiSilent === 'function' && nyepiSilent())
  ) {
    stopMusic();
    return;
  }
  const ac = audioContext();
  if (!ac) return;
  const theme = battle
    ? 'battle'
    : state.room
      ? 'inside'
      : [
            REGION.PADANG_OJEK,
            REGION.HUTAN,
            REGION.PUNCAK,
            REGION.WADUK,
            REGION.KALDERA,
            REGION.OBSERVATORIUM,
          ].includes(state.region)
        ? 'route'
        : 'town';
  if (theme !== musicTheme) {
    musicStep = 0;
    musicTheme = theme;
  }
  const motifs = {
      town: [60, 64, 67, 69, 67, 64, 62, 67, 64, 67, 72, 71, 69, 67, 64, 62],
      route: [60, 67, 69, 72, 69, 67, 64, 67, 62, 69, 71, 74, 71, 69, 67, 62],
      inside: [60, 64, 67, 64, 62, 65, 69, 65, 59, 62, 67, 72, 60, 64, 67, 72],
      battle: [57, 64, 60, 67, 57, 69, 67, 64, 55, 62, 59, 65, 55, 67, 65, 62],
    },
    step = musicStep++ % 16,
    beat = theme === 'battle' ? 0.175 : 0.245,
    vol = (audioPreferences.musicVolume / 100) * 0.037,
    midi = motifs[theme][step],
    now = ac.currentTime;
  // The off-beat bass, alternating kendang strokes, and shaker evoke a small
  // koplo ensemble while retaining each area's original melodic identity.
  tone(440 * 2 ** ((midi - 69) / 12), now, beat * 0.72, vol, step % 4 === 3 ? 'sine' : 'triangle', true);
  if (step % 2 === 0)
    tone(440 * 2 ** (((step < 8 ? 48 : 43) - 69) / 12), now, beat * 1.45, vol * 0.6, 'sine', true);
  else tone(440 * 2 ** (((step < 8 ? 55 : 50) - 69) / 12), now, beat * 0.52, vol * 0.42, 'triangle', true);
  percussion(now, step % 4 === 2 || step % 4 === 3, vol * (theme === 'battle' ? 1.65 : 1.25));
  if (step % 2 === 1 || theme === 'battle') shaker(now, vol * 0.35);
  musicTimer = setTimeout(scheduleMusic, beat * 1000);
}
function restartMusic() {
  stopMusic();
  if (audioPreferences.music && audioPreferences.musicVolume > 0 && audioUnlocked && !document.hidden)
    scheduleMusic();
}
function persistAudio() {
  localStorage.setItem('wargamon-audio', JSON.stringify(audioPreferences));
}
function audioMenu() {
  modal(
    `<h2>Audio permainan</h2><p>Melodi perjalanan berpadu ketukan kendang dan ritme koplo. Musik berubah saat menjelajah, masuk bangunan, dan bertanding.</p>${[
      ['music', 'Musik latar'],
      ['effects', 'Efek aksi'],
    ]
      .map(
        ([k, label]) =>
          `<section class="audio-row"><label><b>${label}</b></label><button data-audio="toggle" data-key="${k}" aria-pressed="${audioPreferences[k]}">${audioPreferences[k] ? 'Nyala' : 'Mati'}</button><label>Volume <input type="range" min="0" max="100" value="${audioPreferences[k + 'Volume']}" data-audio-volume="${k}" aria-label="Volume ${label}"></label></section>`,
      )
      .join(
        '',
      )}<button data-audio="sample">▶ Dengarkan efek pemulihan</button><p class="menu-subtitle">Audio berhenti saat tab tidak aktif. Pengaturan disimpan di perangkat ini.</p>`,
    'audio',
    `<button data-ui="menu">← Menu</button><button data-act="close">Tutup</button>`,
  );
}
document.addEventListener(
  'pointerdown',
  () => {
    if (!audioUnlocked) {
      audioContext();
      restartMusic();
    }
  },
  { once: true },
);
document.addEventListener(
  'keydown',
  () => {
    if (!audioUnlocked) {
      audioContext();
      restartMusic();
    }
  },
  { once: true },
);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMusic();
  else restartMusic();
});
onClick(e => {
  const b = e.target.closest('[data-audio]');
  if (b && !b.disabled) {
    audioContext();
    if (b.dataset.audio === 'toggle') {
      const k = b.dataset.key;
      if (!['music', 'effects'].includes(k)) return;
      audioPreferences[k] = !audioPreferences[k];
      persistAudio();
      restartMusic();
      audioMenu();
    } else playCue('heal');
    return;
  }
  if (e.target.closest('button:not(:disabled)')) playCue('tap');
});
document.addEventListener('input', e => {
  const k = e.target.dataset?.audioVolume;
  if (!['music', 'effects'].includes(k)) return;
  audioPreferences[k + 'Volume'] = Math.max(0, Math.min(100, Number(e.target.value) || 0));
  persistAudio();
  if (k === 'music') restartMusic();
});
