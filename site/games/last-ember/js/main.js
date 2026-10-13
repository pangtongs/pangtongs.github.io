'use strict';
// Entry point.
const game = new Game();
requestAnimationFrame(t => game.frame(t));
