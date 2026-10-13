/* Two connected chapters, with saved rail and delivery challenges. */
for (const name of ['img/maps/exterior/3-4.webp', 'img/maps/exterior/2-4.webp']) deferMapImage(name);
const RAIL_CELLS = [
  { x: 0, y: 1, curve: false },
  { x: 1, y: 1, curve: true },
  { x: 1, y: 0, curve: true },
  { x: 2, y: 0, curve: true },
  { x: 2, y: 1, curve: true },
  { x: 3, y: 1, curve: false },
];
function railState() {
  const p = chapterState();
  return (p.rail ??= {
    rot: [1, 1, 2, 0, 2, 1],
    message: 'Putar petak rel. Hubungkan kiri ke Peron 2 lewat jalur atas.',
  });
}
function railPorts(i) {
  return (RAIL_CELLS[i].curve ? [0, 1] : [1, 3]).map(d => (d + railState().rot[i]) % 4);
}
function traceRail() {
  let i = 0,
    entry = 3;
  const visited = [];
  for (let step = 0; step < 12; step++) {
    if (visited.includes(i)) return { ok: false, path: visited };
    visited.push(i);
    const ports = railPorts(i);
    if (!ports.includes(entry)) return { ok: false, path: visited };
    const exit = ports.find(p => p !== entry),
      cell = RAIL_CELLS[i];
    if (cell.x === 3 && cell.y === 1 && exit === 1) return { ok: true, path: visited };
    const [dx, dy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][exit],
      next = RAIL_CELLS.findIndex(c => c.x === cell.x + dx && c.y === cell.y + dy);
    if (next < 0) return { ok: false, path: visited };
    i = next;
    entry = (exit + 2) % 4;
  }
  return { ok: false, path: visited };
}
function railMenu() {
  if (state.region !== 8 || battle) return;
  if (!state.defeated.includes(33)) {
    deviceGateScene(33, 8);
    return;
  }
  const r = railState(),
    points = [
      [30, 2],
      [58, 30],
      [30, 58],
      [2, 30],
    ],
    tile = (x, y) => {
      const i = RAIL_CELLS.findIndex(c => c.x === x && c.y === y);
      if (i < 0) return '<div class="rail-empty"></div>';
      const ps = railPorts(i);
      return `<button data-extra="railturn" data-id="${i}" aria-label="Putar rel ${String.fromCharCode(65 + x)}${y + 1}" ${has('rail') ? 'disabled' : ''}><svg viewBox="0 0 60 60" aria-hidden="true"><polyline points="${points[ps[0]].join(',')} 30,30 ${points[ps[1]].join(',')}" fill="none" stroke="#244d42" stroke-width="9"/><circle cx="30" cy="30" r="4" fill="#d99d32"/></svg><small>${String.fromCharCode(65 + x)}${y + 1}</small></button>`;
    };
  modal(
    `<h2>Panel Wesel</h2><p>Masuk dari kiri baris 2 → keluar kanan baris 2.</p><div class="rail-grid">${Array.from({ length: 12 }, (_, n) => tile(n % 4, Math.floor(n / 4))).join('')}</div><p role="status">${has('rail') ? trainerText('story.rail.ready', 'Peron 2 tersambung! {trainer34} siap ditantang.', { trainer34: 34 }) : r.message}</p><div class="actions"><button class="action" data-extra="railtest" ${has('rail') ? 'disabled' : ''}>Uji jalur</button>${closeButton('Kembali')}</div>`,
    'rail',
  );
}
function turnRail(i) {
  if (state.region !== 8 || !state.defeated.includes(33) || has('rail') || !RAIL_CELLS[i]) return;
  railState().rot[i] = (railState().rot[i] + 1) % 4;
  save();
  railMenu();
}
function testRail() {
  if (state.region !== 8 || !state.defeated.includes(33) || has('rail')) return;
  const result = traceRail();
  if (result.ok) {
    awardQuest('rail');
    update();
  } else railState().message = 'Rel belum menyambung. Cocokkan kedua ujung tiap petak, termasuk jalur atas.';
  save();
  railMenu();
}
const DELIVERY_ORDERS = [
  { item: 'Kopi hangat', icon: '☕', name: 'Kedai Kopi', target: 0 },
  { item: 'Tempe renyah', icon: '🍱', name: 'Kedai Tempe', target: 1 },
  { item: 'Sate bumbu kacang', icon: '🍢', name: 'Kedai Sate', target: 2 },
];
function deliveryState() {
  const p = chapterState();
  return (p.delivery ??= { done: 0, carry: null });
}
function deliveryRemaining() {
  const d = deliveryState();
  return d.carry ? Math.max(0, 100 - (state.steps - d.carry.started)) : 0;
}
function dispatchMenu() {
  if (state.region !== 9 || state.room !== 'mallatrium' || battle) return;
  if (!state.defeated.includes(35)) {
    deviceGateScene(35, 9);
    return;
  }
  const d = deliveryState();
  if (has('orders')) {
    modal(
      `<h2>Semua lapak siap!</h2><p>${trainerText('story.dispatch.ready', '{trainer36} menunggu di ruang acara atrium.', { trainer36: 36 })}</p>${closeButton()}`,
    );
    return;
  }
  const o = DELIVERY_ORDERS[d.done];
  modal(
    `<h2>Dapur Kiriman, ${d.done}/3</h2><p class="parcel-icon">${o.icon}</p><p><b>${o.item} → ${o.name}</b></p><p>Antar dalam 100 langkah. Berjalan atau sentuh lapak; Ke tujuan juga membantu. Pesanan dingin bisa diambil ulang gratis.</p>${d.carry ? `<p>Sisa ${deliveryRemaining()} langkah.</p>` : ''}<div class="actions"><button class="action" data-extra="pickup">${d.carry ? 'Ambil ulang' : 'Ambil pesanan'}</button>${closeButton('Nanti')}</div>`,
    'dispatch',
  );
}
function pickupOrder() {
  if (state.region !== 9 || state.room !== 'mallatrium' || !state.defeated.includes(35) || has('orders'))
    return;
  deliveryState().carry = { started: state.steps };
  closeModal();
  update();
  toast('Pesanan siap. Ikuti tujuan menuju lapak.');
}
function deliverOrder(id) {
  if (state.region !== 9 || state.room !== 'mallatrium' || has('orders')) return;
  const d = deliveryState();
  if (!d.carry) {
    toast('Ambil pesanan dari Dapur Kiriman dulu.');
    return;
  }
  if (deliveryRemaining() === 0) {
    d.carry = null;
    update();
    toast('Pesanan sudah dingin. Ambil ulang gratis di dapur.');
    return;
  }
  if (DELIVERY_ORDERS[d.done].target !== id) {
    toast('Lapak berbeda. Lihat tujuan pesananmu.');
    return;
  }
  d.done++;
  d.carry = null;
  if (d.done === 3) awardQuest('orders');
  update();
  modal(
    `<h2>${d.done === 3 ? 'Semua pesanan tiba!' : 'Pesanan diterima!'}</h2><p>${d.done === 3 ? trainerText('story.dispatch.done', '{trainer36} siap membuka Arena Rasa di atrium.', { trainer36: 36 }) : 'Kembali ke dapur untuk pesanan berikutnya.'}</p>${closeButton()}`,
    'delivery',
  );
}
const npcExpansionImage = new Image();
images['img/characters/expansion-npcs.webp'] = npcExpansionImage;
npcExpansionImage.onload = () => {
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('canvas');
    c.width = npcExpansionImage.naturalWidth / 2;
    c.height = npcExpansionImage.naturalHeight / 2;
    c.getContext('2d').drawImage(
      npcExpansionImage,
      (i % 2) * c.width,
      Math.floor(i / 2) * c.height,
      c.width,
      c.height,
      0,
      0,
      c.width,
      c.height,
    );
    const cc = c.getContext('2d'),
      pixels = cc.getImageData(0, 0, c.width, c.height);
    for (let k = 3; k < pixels.data.length; k += 4) if (pixels.data[k] < 90) pixels.data[k] = 0;
    cc.putImageData(pixels, 0, 0);
    const bounds = isolateGeneratedSprite(c),
      id = 41 + i;
    castCells.set(id, { canvas: c, bounds });
    const style = document.createElement('style');
    style.textContent = `.trainer-sprite.cast${id}{background-image:url(${c.toDataURL()});background-size:contain;background-position:center;background-repeat:no-repeat}`;
    document.head.appendChild(style);
  }
};
npcExpansionImage.src = 'img/characters/expansion-npcs.webp';
onClick(e => {
  const b = e.target.closest('[data-extra]');
  if (!b || b.disabled) return;
  if (b.dataset.extra === 'railturn') turnRail(Number(b.dataset.id));
  if (b.dataset.extra === 'railtest') testRail();
  if (b.dataset.extra === 'pickup') pickupOrder();
});
