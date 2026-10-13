'use strict';
// Uniform spatial grid over the arena, rebuilt once per simulation step.
// Area spells, orb contacts, projectile retargeting and crowd separation query it
// instead of scanning every enemy, which turns their O(n²) work into O(n).

class SpatialGrid {
  constructor(cell = 64) {
    this.cell = cell;
    this.minX = -ARENA_X - cell;
    this.minY = -ARENA_Y - cell;
    this.cols = Math.ceil((ARENA_X * 2 + cell * 2) / cell) + 1;
    this.rows = Math.ceil((ARENA_Y * 2 + cell * 2) / cell) + 1;
    this.cells = Array.from({length: this.cols * this.rows}, () => []);
    this.used = []; // indices of non-empty cells, so clearing is cheap
  }
  col(x) { return clamp(Math.floor((x - this.minX) / this.cell), 0, this.cols - 1); }
  row(y) { return clamp(Math.floor((y - this.minY) / this.cell), 0, this.rows - 1); }

  rebuild(items) {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
    for (const e of items) {
      if (e.dead) continue;
      const i = this.row(e.y) * this.cols + this.col(e.x);
      const bucket = this.cells[i];
      if (!bucket.length) this.used.push(i);
      bucket.push(e);
    }
  }

  // Calls fn(e) for each live enemy whose body overlaps the circle (x, y, r), or whose
  // center lies inside it when centerOnly is set. fn may kill enemies; dead ones are skipped.
  forEachInRadius(x, y, r, fn, centerOnly = false) {
    const pad = 60; // largest body radius (final boss), so edge overlaps are not missed
    const c0 = this.col(x - r - pad), c1 = this.col(x + r + pad);
    const r0 = this.row(y - r - pad), r1 = this.row(y + r + pad);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const bucket = this.cells[row * this.cols + col];
        for (let k = 0; k < bucket.length; k++) {
          const e = bucket[k];
          if (e.dead) continue;
          const rr = centerOnly ? r : r + e.r;
          if (dist2(x, y, e.x, e.y) < rr * rr) fn(e);
        }
      }
    }
  }

  // Nearest live enemy, searching outward ring by ring.
  nearest(x, y) {
    const cx = this.col(x), cy = this.row(y);
    const maxRing = Math.max(this.cols, this.rows);
    let best = null, bd = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let row = cy - ring; row <= cy + ring; row++) {
        if (row < 0 || row >= this.rows) continue;
        const edgeRow = row === cy - ring || row === cy + ring;
        for (let col = cx - ring; col <= cx + ring; col += edgeRow ? 1 : ring * 2 || 1) {
          if (col < 0 || col >= this.cols) continue;
          for (const e of this.cells[row * this.cols + col]) {
            if (e.dead) continue;
            const d = dist2(x, y, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
          }
        }
      }
      // Anything in a farther ring is at least ring*cell away.
      if (best && Math.sqrt(bd) <= ring * this.cell) break;
    }
    return best;
  }
}
