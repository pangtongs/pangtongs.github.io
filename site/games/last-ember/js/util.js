'use strict';
// Small math and array helpers shared by every module.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const $ = id => document.getElementById(id);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Remove items in place without allocating a new array. keep(item) returns false to drop.
function compact(arr, keep) {
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const item = arr[r];
    if (keep(item)) arr[w++] = item;
  }
  arr.length = w;
  return arr;
}

const formatTime = seconds => {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
