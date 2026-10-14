/* Wargadex page: renders window.WARGADEX (data.js, generated from the game) as a
   searchable creature index, a type chart and the sticker / 3D-print downloads.
   Template source: wargamon/scripts/wargadex-site/. */
(function () {
    'use strict';
    const D = window.WARGADEX;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const pad = n => String(n).padStart(3, '0');
    const MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js';

    const UI = {
        id: {
            back: '← Winston\'s Arcade', play: '▶ Main Wargamon',
            tagline: n => `${n} makhluk dari Liga Sekampung: tipe, evolusi, habitat dan jurus andalan.`,
            'tab.dex': 'Makhluk', 'tab.types': 'Tabel tipe', 'tab.extras': 'Stiker & 3D',
            search: 'Cari nama, jurus atau deskripsi…', allTypes: 'Semua tipe', allRegions: 'Semua habitat',
            allChapters: 'Semua bab', chapter: n => `Bab ${n}`, eventChapter: 'Acara kalender',
            allSpecial: 'Semua makhluk', legendary: 'Legenda', rare: 'Langka', event: 'Acara', has3d: 'Punya model 3D',
            sortAsc: 'No. ↑', sortDesc: 'No. ↓', sortName: 'A–Z',
            count: (n, t) => n === t ? `${t} makhluk` : `${n} dari ${t} makhluk`,
            none: 'Tidak ada makhluk yang cocok. Coba hapus filter.', reset: 'Hapus filter',
            artComing: 'Gambar menyusul', role: 'Peran', move: 'Jurus andalan', habitat: 'Habitat',
            evolution: 'Rantai evolusi', base: 'HP dasar', noEvo: 'Tidak berevolusi.', legendNoEvo: 'Legenda ini tidak berevolusi.',
            notWild: 'Tidak ditemukan liar.', evolvesFrom: (n, l) => `Berevolusi dari ${n} pada Lv.${l}.`,
            levels: l => `Lv.${l.join('–')}`, power: p => p ? `Kekuatan ${p}` : 'Pendukung',
            turntable: 'Putar model 3D', loading3d: 'Memuat model 3D…', model3d: 'Model 3D',
            stl: 'Unduh STL untuk cetak 3D', close: 'Tutup', prev: 'Sebelumnya', next: 'Berikutnya',
            strongVs: 'Kuat lawan', weakVs: 'Lemah lawan', weakTo: 'Rentan terhadap',
            chartTitle: 'Tabel tipe', chartIntro: 'Serangan yang kuat mengenai ×1.6, serangan yang lemah ×0.7; tipe ganda dikalikan keduanya. Baris = tipe penyerang, kolom = tipe bertahan.',
            attacker: 'Serang ↓ / Tahan →', mono: 'Tipe tunggal', dual: 'Juga tipe kedua',
            stickersTitle: 'Lembar stiker', stickersIntro: 'Lembar A4 300 dpi siap cetak, 20 stiker per lembar dengan garis potong abu-abu. Cetak di kertas stiker, lalu gunting atau potong dengan mesin.',
            sheet: (a, b, n) => `#${pad(a)}–#${pad(b)} · ${n} stiker`, pdf: 'Unduh semua (PDF)', png: 'PNG',
            printsTitle: 'Figur cetak 3D', printsIntro: 'Model dari versi 3D (Godot) dijadikan satu cangkang tertutup di atas alas bundar, tinggi sekitar 6 cm. File STL, siap untuk slicer.',
            modelsTitle: 'Model 3D', legendBadge: 'Legenda', rareBadge: 'Langka', eventBadge: 'Acara', bossBadge: 'Bos acara',
            footnote: 'Dibuat otomatis dari data game Wargamon. Nama makhluk adalah parodi; semua karya oleh Winston.',
        },
        en: {
            back: '← Winston\'s Arcade', play: '▶ Play Wargamon',
            tagline: n => `${n} creatures of the Liga Sekampung: types, evolutions, habitats and signature moves.`,
            'tab.dex': 'Creatures', 'tab.types': 'Type chart', 'tab.extras': 'Stickers & 3D',
            search: 'Search name, move or description…', allTypes: 'All types', allRegions: 'All habitats',
            allChapters: 'All chapters', chapter: n => `Chapter ${n}`, eventChapter: 'Calendar events',
            allSpecial: 'All creatures', legendary: 'Legendary', rare: 'Rare', event: 'Event', has3d: 'Has a 3D model',
            sortAsc: 'No. ↑', sortDesc: 'No. ↓', sortName: 'A–Z',
            count: (n, t) => n === t ? `${t} creatures` : `${n} of ${t} creatures`,
            none: 'No creature matches. Try clearing the filters.', reset: 'Clear filters',
            artComing: 'Art coming', role: 'Role', move: 'Signature move', habitat: 'Habitat',
            evolution: 'Evolution chain', base: 'Base HP', noEvo: 'Does not evolve.', legendNoEvo: 'This legend does not evolve.',
            notWild: 'Not found in the wild.', evolvesFrom: (n, l) => `Evolves from ${n} at Lv.${l}.`,
            levels: l => `Lv.${l.join('–')}`, power: p => p ? `Power ${p}` : 'Support',
            turntable: 'Spin the 3D model', loading3d: 'Loading 3D model…', model3d: '3D model',
            stl: 'Download STL for 3D printing', close: 'Close', prev: 'Previous', next: 'Next',
            strongVs: 'Strong against', weakVs: 'Weak against', weakTo: 'Weak to',
            chartTitle: 'Type chart', chartIntro: 'A strong attack hits ×1.6, a weak one ×0.7; dual types multiply both. Rows are the attacking type, columns the defending type.',
            attacker: 'Attack ↓ / Defend →', mono: 'Single type', dual: 'Also as second type',
            stickersTitle: 'Sticker sheets', stickersIntro: 'Print-ready A4 sheets at 300 dpi, 20 stickers each with a grey cut line. Print on sticker paper, then cut by hand or with a cutting machine.',
            sheet: (a, b, n) => `#${pad(a)}–#${pad(b)} · ${n} stickers`, pdf: 'Download all (PDF)', png: 'PNG',
            printsTitle: '3D-printable figures', printsIntro: 'Models from the 3D (Godot) version, turned into one closed shell on a round plinth, about 6 cm tall. STL files, ready for your slicer.',
            modelsTitle: '3D models', legendBadge: 'Legendary', rareBadge: 'Rare', eventBadge: 'Event', bossBadge: 'Event boss',
            footnote: 'Generated from the Wargamon game data. Creature names are parodies; all work by Winston.',
        },
    };

    let lang = 'id';
    try { if (localStorage.getItem('wargadex-lang') === 'en') lang = 'en'; } catch (e) { /* storage blocked */ }
    if (new URLSearchParams(location.search).get('lang') === 'en') lang = 'en';
    const L = (key, ...a) => { const v = UI[lang][key]; return typeof v === 'function' ? v(...a) : v; };
    const tx = obj => (obj && typeof obj === 'object' ? obj[lang] || obj.id : obj) || '';

    const TYPES = Object.fromEntries(D.types.map(t => [t.id, t]));
    const typeName = t => (lang === 'en' ? TYPES[t].en : t);
    const BY_ID = Object.fromEntries(D.entries.map(e => [e.id, e]));
    const state = { q: '', type: '', region: '', chapter: '', special: '', sort: 'asc' };

    // ---------- Shared bits ----------
    const pill = t => `<span class="type" style="--c:${TYPES[t].color}"><span aria-hidden="true">${TYPES[t].icon}</span>${esc(typeName(t))}</span>`;
    function portrait(e, cls = '') {
        if (e.img) return `<img class="art ${cls}" src="${e.img}" alt="${esc(e.name)}" loading="lazy" decoding="async" width="320" height="320">`;
        const c = TYPES[e.types[0]].color;
        return `<div class="art placeholder ${cls}" style="--c:${c}" role="img" aria-label="${esc(e.name)}: ${esc(L('artComing'))}">
            <span class="ph-icon" aria-hidden="true">${TYPES[e.types[0]].icon}</span><span class="ph-text">${esc(L('artComing'))}</span></div>`;
    }
    function badges(e) {
        const b = [];
        if (e.legendary) b.push(`<span class="badge legend">★ ${L('legendBadge')}</span>`);
        if (e.rare) b.push(`<span class="badge rare">◆ ${L('rareBadge')}</span>`);
        if (e.event) b.push(`<span class="badge event">✦ ${L(e.eventBoss ? 'bossBadge' : 'eventBadge')}</span>`);
        if (e.model) b.push(`<span class="badge model">3D</span>`);
        return b.join('');
    }
    const chapterLabel = n => (n ? `${L('chapter', n)} · ${tx(D.chapters[n - 1])}` : L('eventChapter'));

    // ---------- Index ----------
    function fillFilters() {
        const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
        $('q').placeholder = L('search');
        $('fType').innerHTML = opt('', L('allTypes'), state.type) + D.types.map(t => opt(t.id, `${t.icon} ${typeName(t.id)}`, state.type)).join('');
        $('fRegion').innerHTML = opt('', L('allRegions'), state.region) +
            D.regions.map((r, i) => (D.entries.some(e => e.habitats.includes(i)) ? opt(i, r.name, state.region) : '')).join('');
        $('fChapter').innerHTML = opt('', L('allChapters'), state.chapter) +
            D.chapters.map(c => opt(c.n, chapterLabel(c.n), state.chapter)).join('') + opt('0', L('eventChapter'), state.chapter);
        $('fSpecial').innerHTML = [['', 'allSpecial'], ['legendary', 'legendary'], ['rare', 'rare'], ['event', 'event'], ['model', 'has3d']]
            .map(([v, k]) => opt(v, L(k), state.special)).join('');
        $('sort').textContent = L(state.sort === 'asc' ? 'sortAsc' : state.sort === 'desc' ? 'sortDesc' : 'sortName');
    }
    const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    function matches(e) {
        if (state.type && !e.types.includes(state.type)) return false;
        if (state.region !== '' && !e.habitats.includes(Number(state.region))) return false;
        if (state.chapter !== '' && e.chapter !== Number(state.chapter)) return false;
        if (state.special === 'legendary' && !e.legendary) return false;
        if (state.special === 'rare' && !e.rare) return false;
        if (state.special === 'event' && !e.event) return false;
        if (state.special === 'model' && !e.model) return false;
        if (!state.q) return true;
        const q = fold(state.q.trim()).replace(/^#?0*(\d+)$/, '$1');
        if (/^\d+$/.test(q)) return String(e.no).startsWith(q);
        const hay = fold([e.name, e.desc.id, e.desc.en, e.move.name.id, e.move.name.en, e.role.id, e.role.en,
            ...e.types.map(t => t + ' ' + TYPES[t].en)].join(' '));
        return hay.includes(q);
    }
    function renderGrid() {
        let list = D.entries.filter(matches);
        if (state.sort === 'desc') list = list.slice().reverse();
        if (state.sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
        $('count').textContent = L('count', list.length, D.entries.length);
        $('grid').innerHTML = list.length ? list.map(e => `
            <a class="mon" href="#/${pad(e.no)}" style="--c:${TYPES[e.types[0]].color}" data-no="${e.no}">
                <div class="mon-art">${portrait(e)}<span class="no">#${pad(e.no)}</span><span class="badges">${badges(e)}</span></div>
                <div class="mon-body"><h3>${esc(e.name)}</h3><div class="types">${e.types.map(pill).join('')}</div>
                <p>${esc(tx(e.role))}</p></div>
            </a>`).join('') : `<div class="empty"><p>${L('none')}</p><button class="btn" id="reset">${L('reset')}</button></div>`;
        if ($('reset')) $('reset').onclick = () => { Object.assign(state, { q: '', type: '', region: '', chapter: '', special: '' }); $('q').value = ''; fillFilters(); renderGrid(); };
    }

    // ---------- Entry ----------
    let current = null;
    function habitatHtml(e) {
        const rows = e.habitats.map(i => {
            const r = D.regions[i];
            return `<li><b>${esc(r.name)}</b><small>${esc(tx(r.subtitle))} · ${L('chapter', r.chapter)} · ${L('levels', r.levels)}</small></li>`;
        }).join('');
        const from = e.chain.findIndex(c => c.id === e.id);
        const evolved = from > 0 ? `<p>${esc(L('evolvesFrom', BY_ID[e.chain[from - 1].id].name, e.chain[from].level))}</p>` : '';
        const note = e.note ? `<p class="note">${esc(tx(e.note))}</p>` : '';
        return evolved + note + (rows ? `<ul class="habitats">${rows}</ul>` : '') || `<p class="muted">${L('notWild')}</p>`;
    }
    function chainHtml(e) {
        if (e.chain.length === 1) return `<p class="muted">${L(e.legendary ? 'legendNoEvo' : 'noEvo')}</p>`;
        const steps = e.chain.map((c, n) => {
            const m = BY_ID[c.id];
            return (n ? `<span class="arrow">Lv.${c.level}<br>→</span>` : '') +
                `<a class="evo${m.id === e.id ? ' on' : ''}" href="#/${pad(m.no)}">${portrait(m, 'small')}<b>${esc(m.name)}</b><small>#${pad(m.no)}</small></a>`;
        }).join('');
        const into = e.chain.findIndex(c => c.id === e.id) > 0 ? e : BY_ID[e.chain[1].id];
        return `<div class="chain">${steps}</div>${into.evolutionChange ? `<p class="muted">${esc(tx(into.evolutionChange))}</p>` : ''}`;
    }
    function weaknesses(types) {
        // Multipliers an attack of each type deals to this body (the game's typeMatchup).
        return D.types.map(a => {
            let score = 0;
            for (const d of types) {
                if (a.strong.includes(d)) score++;
                else if (TYPES[d].strong.includes(a.id)) score--;
            }
            return { t: a.id, m: score > 0 ? 1.6 ** score : score < 0 ? 0.7 ** -score : 1 };
        });
    }
    function openEntry(no) {
        const e = D.entries.find(x => x.no === no);
        if (!e) return;
        current = e;
        const i = D.entries.indexOf(e), prev = D.entries[i - 1], next = D.entries[i + 1];
        const w = weaknesses(e.types);
        const fmt = m => '×' + Number(m.toFixed(2));
        const weak = w.filter(x => x.m > 1).map(x => `${pill(x.t)}<small>${fmt(x.m)}</small>`).join(' ');
        const resist = w.filter(x => x.m < 1).map(x => `${pill(x.t)}<small>${fmt(x.m)}</small>`).join(' ');
        $('entryBody').innerHTML = `
            <div class="entry-head" style="--c:${TYPES[e.types[0]].color}">
                <button class="icon x" id="close" aria-label="${L('close')}">✕</button>
                <div class="stage" id="stage">${portrait(e, 'big')}</div>
                <div class="entry-title">
                    <span class="no">#${pad(e.no)}</span>
                    <h2 id="entryName">${esc(e.name)}</h2>
                    <div class="types">${e.types.map(pill).join('')}</div>
                    <div class="badges">${badges(e)}</div>
                    <p class="chapter">${esc(chapterLabel(e.chapter))} · ${L('base')} ${e.base}</p>
                    ${e.model ? `<button class="btn primary" id="spin">⟳ ${L('turntable')}</button>` : ''}
                </div>
            </div>
            <div class="entry-body">
                <p class="desc">${esc(tx(e.desc))}</p>
                <section><h4>${L('role')}</h4><p>${esc(tx(e.role))}</p></section>
                <section><h4>${L('move')}</h4><div class="move" style="--c:${TYPES[e.move.type]?.color || '#666'}">
                    <b>${TYPES[e.move.type]?.icon || ''} ${esc(tx(e.move.name))}</b><span>${esc(typeName(e.move.type))} · ${L('power', e.move.power)}</span>
                    ${tx(e.move.text) ? `<small>${esc(tx(e.move.text))}</small>` : ''}</div></section>
                <section><h4>${L('evolution')}</h4>${chainHtml(e)}</section>
                <section><h4>${L('habitat')}</h4>${habitatHtml(e)}</section>
                <section class="matchups"><div><h4>${L('weakTo')}</h4><div class="types">${weak || '—'}</div></div>
                    <div><h4>${L('strongVs')} (${lang === 'en' ? 'resists' : 'tahan'})</h4><div class="types">${resist || '—'}</div></div></section>
                ${e.stl ? `<a class="btn stl" href="${e.stl}" download>⬇ ${L('stl')} <small>${(e.stlSize / 1048576).toFixed(1)} MB</small></a>` : ''}
            </div>
            <nav class="entry-nav">
                ${prev ? `<a class="btn" href="#/${pad(prev.no)}" aria-label="${L('prev')}">← #${pad(prev.no)} ${esc(prev.name)}</a>` : '<span></span>'}
                ${next ? `<a class="btn" href="#/${pad(next.no)}" aria-label="${L('next')}">#${pad(next.no)} ${esc(next.name)} →</a>` : '<span></span>'}
            </nav>`;
        const dlg = $('entry');
        if (!dlg.open) dlg.showModal();
        $('entryBody').scrollTop = 0;
        dlg.scrollTop = 0;
        $('close').onclick = () => closeEntry();
        if ($('spin')) $('spin').onclick = () => showModel(e);
        document.title = `#${pad(e.no)} ${e.name} · Wargadex`;
    }
    function closeEntry() {
        const dlg = $('entry');
        if (dlg.open) dlg.close();
    }

    // <model-viewer> is ~1 MB: loaded the first time someone asks for a turntable.
    let viewerLoading = null;
    function loadViewer() {
        if (customElements.get('model-viewer')) return Promise.resolve();
        if (!viewerLoading) viewerLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.type = 'module';
            s.src = MODEL_VIEWER;
            s.onload = () => customElements.whenDefined('model-viewer').then(resolve);
            s.onerror = reject;
            document.head.appendChild(s);
        });
        return viewerLoading;
    }
    function showModel(e) {
        const stage = $('stage');
        stage.classList.add('loading');
        stage.innerHTML = `<p class="muted">${L('loading3d')}</p>`;
        $('spin').remove();
        loadViewer().then(() => {
            if (current !== e) return;
            stage.classList.remove('loading');
            stage.innerHTML = `<model-viewer src="${e.model}" alt="${esc(e.name)}: ${esc(L('model3d'))}" camera-controls auto-rotate
                rotation-per-second="40deg" shadow-intensity="1" exposure="1.05" interaction-prompt="none" touch-action="pan-y"
                poster="${e.img || ''}"></model-viewer>`;
        }).catch(() => { stage.innerHTML = portrait(e, 'big'); });
    }

    // ---------- Type chart ----------
    function renderTypes() {
        const head = D.types.map(t => `<th scope="col" style="--c:${t.color}" title="${esc(typeName(t.id))}"><span>${t.icon}</span><small>${esc(typeName(t.id))}</small></th>`).join('');
        const rows = D.types.map(a => `<tr><th scope="row" style="--c:${a.color}"><span>${a.icon}</span> ${esc(typeName(a.id))}</th>${D.types.map(d => {
            const m = a.strong.includes(d.id) ? 1.6 : d.strong.includes(a.id) ? 0.7 : 1;
            return `<td class="${m > 1 ? 'up' : m < 1 ? 'down' : ''}" title="${esc(typeName(a.id))} → ${esc(typeName(d.id))}: ×${m}">${m === 1 ? '' : '×' + m}</td>`;
        }).join('')}</tr>`).join('');
        const cards = D.types.map(t => {
            const weakTo = D.types.filter(o => o.strong.includes(t.id)).map(o => pill(o.id)).join('');
            const mono = D.entries.filter(e => e.types[0] === t.id).length, dual = D.entries.filter(e => e.types[1] === t.id).length;
            return `<article class="type-card" style="--c:${t.color}">
                <h3><span>${t.icon}</span> ${esc(typeName(t.id))}${lang === 'en' ? ` <small>${esc(t.id)}</small>` : ''}</h3>
                <dl><dt>${L('strongVs')} ×1.6</dt><dd>${t.strong.map(pill).join('')}</dd>
                <dt>${L('weakTo')} ×1.6</dt><dd>${weakTo}</dd></dl>
                <a class="type-link" href="#/?type=${t.id}">${mono} ${L('mono').toLowerCase()} · ${dual} ${L('dual').toLowerCase()} →</a>
            </article>`;
        }).join('');
        $('types').innerHTML = `<div class="prose"><h2>${L('chartTitle')}</h2><p>${L('chartIntro')}</p></div>
            <div class="chart-wrap"><table class="chart"><thead><tr><th class="corner">${L('attacker')}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
            <div class="type-cards">${cards}</div>`;
    }

    // ---------- Stickers and prints ----------
    function renderExtras() {
        const st = D.stickers || {};
        const sheets = (st.sheets || []).map((s, n) => `<a class="sheet" href="${s.file}" download>
            <img src="${s.preview || s.file}" alt="${esc(L('stickersTitle'))} ${n + 1}" loading="lazy" width="480" height="679">
            <span><b>${n + 1}</b> ${L('sheet', s.from, s.to, s.count)}</span><span class="dl">⬇ ${L('png')}</span></a>`).join('');
        const withModel = D.entries.filter(e => e.model);
        const prints = withModel.map(e => `<div class="print">
            <a href="#/${pad(e.no)}">${portrait(e, 'small')}<b>${esc(e.name)}</b><small>#${pad(e.no)}</small></a>
            ${e.stl ? `<a class="btn" href="${e.stl}" download>⬇ STL <small>${(e.stlSize / 1048576).toFixed(1)} MB</small></a>` : ''}</div>`).join('');
        $('extras').innerHTML = `
            ${sheets ? `<div class="prose"><h2>${L('stickersTitle')}</h2><p>${L('stickersIntro')}</p>
                ${st.pdf ? `<p><a class="btn primary" href="${st.pdf}" download>⬇ ${L('pdf')}</a></p>` : ''}</div>
                <div class="sheets">${sheets}</div>` : ''}
            ${withModel.length ? `<div class="prose"><h2>${withModel.some(e => e.stl) ? L('printsTitle') : L('modelsTitle')}</h2><p>${L('printsIntro')}</p></div>
                <div class="prints">${prints}</div>` : ''}`;
    }

    // ---------- Language, routing ----------
    function applyLang() {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = L(el.dataset.i18n); });
        document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
        $('tagline').textContent = L('tagline', D.entries.length);
        $('footnote').textContent = L('footnote');
        fillFilters();
        renderGrid();
        renderTypes();
        renderExtras();
        if ($('entry').open && current) openEntry(current.no);
    }
    function route() {
        const hash = location.hash.replace(/^#\/?/, '');
        const [view, query] = hash.split('?');
        const tab = view === 'types' ? 'types' : view === 'extras' ? 'extras' : 'dex';
        document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== tab; });
        document.querySelectorAll('[data-tab]').forEach(a => a.setAttribute('aria-current', String(a.dataset.tab === tab)));
        if (query) {
            const p = new URLSearchParams(query);
            if (p.has('type')) { state.type = p.get('type'); fillFilters(); renderGrid(); }
        }
        const no = /^\d{1,3}$/.test(view) ? Number(view) : 0;
        if (no) openEntry(no);
        else {
            closeEntry();
            document.title = 'Wargadex · Wargamon';
        }
    }

    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
        lang = b.dataset.lang;
        try { localStorage.setItem('wargadex-lang', lang); } catch (e) { /* storage blocked */ }
        applyLang();
    }));
    $('q').addEventListener('input', e => { state.q = e.target.value; renderGrid(); });
    for (const [id, key] of [['fType', 'type'], ['fRegion', 'region'], ['fChapter', 'chapter'], ['fSpecial', 'special']])
        $(id).addEventListener('change', e => { state[key] = e.target.value; renderGrid(); });
    $('sort').addEventListener('click', () => {
        state.sort = { asc: 'desc', desc: 'name', name: 'asc' }[state.sort];
        fillFilters();
        renderGrid();
    });
    const dlg = $('entry');
    // Closing the dialog (Esc, backdrop, ✕) goes back to the list the visitor was on.
    dlg.addEventListener('close', () => {
        current = null;
        if (/^#\/?\d/.test(location.hash)) history.replaceState(null, '', '#/');
        document.title = 'Wargadex · Wargamon';
    });
    dlg.addEventListener('click', e => { if (e.target === dlg) closeEntry(); });
    document.addEventListener('keydown', e => {
        if (!dlg.open || !current || e.target.closest('model-viewer')) return;
        const i = D.entries.indexOf(current);
        const to = e.key === 'ArrowLeft' ? D.entries[i - 1] : e.key === 'ArrowRight' ? D.entries[i + 1] : null;
        if (to) location.hash = '#/' + pad(to.no);
    });
    window.addEventListener('hashchange', route);
    applyLang();
    route();
})();
