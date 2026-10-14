'use strict';
// Entry point.
// Embers drifting up behind the main menu (pure CSS animation, created once).
$('menuEmbers').innerHTML = Array.from({length: 26}, () =>
  `<i style="left:${rand(0, 100).toFixed(1)}%;--drift:${rand(-80, 80).toFixed(0)}px;animation-duration:${rand(6, 13).toFixed(1)}s;animation-delay:-${rand(0, 13).toFixed(1)}s;transform:scale(${rand(.5, 1.3).toFixed(2)})"></i>`).join('');
const game = new Game();
requestAnimationFrame(t => game.frame(t));
// Installable and playable offline (needs http/https; skipped when opened as a file).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
