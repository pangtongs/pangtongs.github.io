for (const name of ['img/maps/exterior/3-2.webp', 'img/maps/exterior/3-3.webp']) deferMapImage(name);
const WADUK_PUZZLES = {
  gears: {
    region: 10,
    first: 37,
    title: 'Roda Servis',
    names: ['Roda kecil', 'Roda sedang', 'Roda besar'],
    target: [2, 4, 1],
    hint: 'Roda kecil: 2 putaran. Roda sedang dua kali roda kecil. Roda besar setengah roda kecil. Roda kecil ikut memutar sedang; sedang ikut memutar besar.',
  },
  irrigation: {
    region: 11,
    first: 39,
    title: 'Irigasi Taman',
    names: ['Teratai', 'Rumput', 'Bunga'],
    target: [4, 2, 1],
    hint: 'Tujuh unit air tersedia. Teratai perlu dua kali rumput; rumput perlu dua kali bunga.',
  },
};
function wadukPuzzleState(key) {
  const p = chapterState();
  return (p[key] ??= { values: [0, 0, 0], message: '' });
}
function gearWheel(value, index) {
  return `<svg class="gear-wheel" viewBox="0 0 100 100" role="img" aria-label="Roda ${index + 1}, posisi ${value}"><g transform="rotate(${value * 72} 50 50)"><circle cx="50" cy="50" r="35" fill="none" stroke="#557b70" stroke-width="12"/>${Array.from({ length: 8 }, (_, n) => `<path d="M45 4h10v14H45z" fill="#557b70" transform="rotate(${n * 45} 50 50)"/>`).join('')}<path d="M50 50V18" stroke="#d16e2e" stroke-width="6"/></g><circle cx="50" cy="50" r="9" fill="#264a40"/></svg>`;
}
function changeWadukPuzzle(key, i) {
  const c = WADUK_PUZZLES[key];
  if (
    !c ||
    state.region !== c.region ||
    modalKind !== 'wadukPuzzle' ||
    !state.defeated.includes(c.first) ||
    has(key) ||
    ![0, 1, 2].includes(i)
  )
    return;
  const p = wadukPuzzleState(key);
  const next = (p.values[i] + 1) % 5;
  if (key === 'irrigation' && p.values.reduce((a, b) => a + b, 0) - p.values[i] + next > 7) {
    p.message = 'Air tersedia hanya 7 unit. Kurangi saluran lain dulu.';
    wadukPuzzleMenu(key);
    return;
  }
  p.values[i] = next;
  if (key === 'gears' && i < 2) p.values[i + 1] = (p.values[i + 1] + 1) % 5;
  p.message = '';
  save();
  wadukPuzzleMenu(key);
}
function checkWadukPuzzle(key) {
  const c = WADUK_PUZZLES[key];
  if (
    !c ||
    state.region !== c.region ||
    modalKind !== 'wadukPuzzle' ||
    !state.defeated.includes(c.first) ||
    has(key)
  )
    return;
  const p = wadukPuzzleState(key);
  if (p.values.every((v, i) => v === c.target[i])) awardQuest(key);
  else p.message = 'Belum pas. Cocokkan jumlah dan perbandingan pada petunjuk.';
  save();
  wadukPuzzleMenu(key);
}
onClick(e => {
  const b = e.target.closest('[data-waduk]');
  if (!b || b.disabled) return;
  if (b.dataset.waduk === 'turn') changeWadukPuzzle(b.dataset.key, Number(b.dataset.id));
  if (b.dataset.waduk === 'test') checkWadukPuzzle(b.dataset.key);
});
const wadukNpcs = new Image();
images['img/characters/waduk-npcs.webp'] = wadukNpcs;
wadukNpcs.onload = () => {
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('canvas');
    c.width = wadukNpcs.naturalWidth / 2;
    c.height = wadukNpcs.naturalHeight / 2;
    c.getContext('2d').drawImage(
      wadukNpcs,
      (i % 2) * c.width,
      Math.floor(i / 2) * c.height,
      c.width,
      c.height,
      0,
      0,
      c.width,
      c.height,
    );
    const bounds = isolateGeneratedSprite(c),
      id = 45 + i;
    castCells.set(id, { canvas: c, bounds });
    const style = document.createElement('style');
    style.textContent = `.trainer-sprite.cast${id}{background-image:url(${c.toDataURL()});background-size:contain;background-position:center;background-repeat:no-repeat}`;
    document.head.appendChild(style);
  }
};
wadukNpcs.src = 'img/characters/waduk-npcs.webp';
function quickTeamToggle() {
  if (locked || modalKind === 'starter') return;
  if (modalKind === 'team') {
    closeModal();
    return;
  }
  if (modalKind) {
    toast('Tutup percakapan dulu untuk membuka tim.');
    return;
  }
  navigation++;
  held = null;
  teamMenu();
}
function wadukPuzzleMenu(key) {
  if (key === 'irrigation') {
    irrigationMenu();
    return;
  }
  const cfg = WADUK_PUZZLES[key];
  if (!cfg || state.region !== cfg.region || battle) return;
  if (!state.defeated.includes(cfg.first)) {
    deviceGateScene(cfg.first, cfg.region);
    return;
  }
  const p = wadukPuzzleState(key),
    done = has(key);
  const controls = cfg.names
    .map(
      (name, i) =>
        `<section class="activity-panel"><b>${name}</b>${key === 'gears' ? gearWheel(p.values[i], i) : `<div class="puzzle-meter" aria-label="${name}: ${p.values[i]} dari 4">${Array.from({ length: 4 }, (_, n) => `<i class="${n < p.values[i] ? 'lit' : ''}"></i>`).join('')}</div>`}${done ? `<output>${p.values[i]} putaran</output>` : `<button data-waduk="turn" data-key="${key}" data-id="${i}">${p.values[i]} → ${(p.values[i] + 1) % 5}</button>`}</section>`,
    )
    .join('');
  modal(
    `<h2>${cfg.title}</h2><p>${done ? 'Roda telah terhubung. Arena siap digunakan.' : cfg.hint}</p><div class="waduk-puzzle ${key}">${controls}</div><p class="${done ? 'activity-complete' : ''}" role="status">${done ? 'Pengaturan tepat! Arena siap.' : p.message || 'Sentuh tombol untuk mengubah pengaturan.'}</p>${done ? '' : `<div class="actions"><button class="action" data-waduk="test" data-key="${key}">Uji pengaturan</button></div>`}${closeButton()}`,
    'wadukPuzzle',
  );
}
// The reservoir park's pipe grid: turn pipes until water crosses the middle row.
function irrigationMenu() {
  if (state.region !== 11 || battle || locked) return;
  if (!state.defeated.includes(39)) {
    modal(`<h2>Irigasi Taman</h2><p>Temui ${TRAINERS[39].name} untuk membuka aliran.</p>${closeButton()}`);
    return;
  }
  const ports = [
      [30, 0],
      [60, 30],
      [30, 60],
      [0, 30],
    ],
    flow = irrigationFlow(),
    done = has('irrigation');
  const cells = PIPE_BASE.map((_, i) => {
    const drawing = `<svg viewBox="0 0 60 60"><polyline points="${ports[pipePorts(i)[0]]} 30,30 ${ports[pipePorts(i)[1]]}" fill="none" stroke="${flow.path.includes(i) ? '#2486ad' : '#758980'}" stroke-width="12"/></svg>`;
    return done
      ? `<div class="pipe-result" aria-label="Pipa ${i + 1}">${drawing}</div>`
      : `<button data-over="pipe" data-id="${i}" aria-label="Putar pipa ${i + 1}">${drawing}</button>`;
  }).join('');
  modal(
    `<h2>Irigasi Taman</h2><p>${done ? 'Air kembali mengalir ke taman.' : 'Sambungkan air dari kiri baris tengah ke kanan baris tengah. Putar pipa; jangan biarkan aliran menuju tepi kosong.'}</p><div class="pipe-grid">${cells}</div><p class="${done ? 'activity-complete' : ''}" role="status">${done ? 'Air mengalir. Taman kembali hidup.' : irrigationState().message}</p>${done ? '' : '<button data-over="water">Buka aliran</button>'}${closeButton()}`,
    'irrigation',
  );
}
// Two open episodes: coast/mountain and workshop/reservoir can be completed in either order.
// Show decision access alongside the existing map, without adding a compulsory detour.
// Irrigation is now a connected pipe network, not another numeric wheel.
const PIPE_BASE = [
  [0, 1],
  [1, 3],
  [0, 1],
  [0, 1],
  [0, 2],
  [0, 1],
  [0, 1],
  [1, 3],
  [0, 1],
];
function irrigationState() {
  return (chapterState().pipes ??= { rot: [0, 0, 0, 0, 0, 0, 0, 0, 0], message: '' });
}
function pipePorts(i) {
  return PIPE_BASE[i].map(d => (d + irrigationState().rot[i]) % 4);
}
function irrigationFlow() {
  let cell = 3,
    entry = 3;
  const path = [];
  for (let n = 0; n < 12; n++) {
    if (path.includes(cell)) break;
    path.push(cell);
    const ports = pipePorts(cell);
    if (!ports.includes(entry)) break;
    const out = ports.find(v => v !== entry);
    if (cell === 5 && out === 1) return { ok: true, path };
    const x = cell % 3,
      y = Math.floor(cell / 3),
      [dx, dy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][out];
    if (x + dx < 0 || x + dx > 2 || y + dy < 0 || y + dy > 2) break;
    cell = (y + dy) * 3 + x + dx;
    entry = (out + 2) % 4;
  }
  return { ok: false, path };
}
