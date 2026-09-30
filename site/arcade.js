/* Shared arcade runtime, loaded by the catalog shell (index.html) and by every game.
   Games run inside the shell's iframe; opening a game URL directly redirects into the
   shell so the sidebar is always there. Exposes window.Arcade: game registry, saved
   stats, sound, modal, toast and confetti. */
(function () {
    'use strict';

    // Resolve links from this script's own location so they work from any depth.
    const BASE = new URL('.', document.currentScript.src).href;
    const url = path => BASE + path;

    const CATEGORIES = ['Arcade', 'Puzzle', 'Word', 'Casino'];

    const GAMES = [
        {
            id: '2048', file: 'games/2048.html', name: 'Pet 2048', icon: '🐹', accent: '#f6b26b', category: 'Puzzle',
            tagline: 'Merge matching pets and evolve all the way to the whale.',
            stat: 'Best score',
            how: 'Arrow keys, WASD or swipe to slide every pet. Two of the same merge into the next one.'
        },
        {
            id: 'snake', file: 'games/snake.html', name: 'Snake', icon: '🐍', accent: '#4ade80', category: 'Arcade',
            tagline: 'Eat, grow, and don\'t bite your own tail.',
            stat: 'Best score',
            how: 'Arrow keys, WASD or swipe to steer. Space pauses. Grab the star before it fades for bonus points.'
        },
        {
            id: 'flappy', file: 'games/flappy_bird.html', name: 'Flappy Bird', icon: '🐦', accent: '#38bdf8', category: 'Arcade',
            tagline: 'One button. Thread the pipes. It gets faster.',
            stat: 'Best score',
            how: 'Space, click or tap to flap. Pipes get faster and tighter as your score climbs.'
        },
        {
            id: 'mines', file: 'games/minesweeper.html', name: 'Minesweeper', icon: '💣', accent: '#2dd4bf', category: 'Puzzle',
            tagline: 'Read the numbers, flag the mines, clear the field.',
            stat: 'Wins',
            how: 'Click to dig, right-click or long-press to flag. Click a number whose mines are all flagged to clear around it. The first click is always safe.'
        },
        {
            id: 'sudoku', file: 'games/sudoku.html', name: 'Sudoku', icon: '🔢', accent: '#a78bfa', category: 'Puzzle',
            tagline: 'Proper puzzles with one solution, notes and hints.',
            stat: 'Puzzles solved',
            how: 'Pick a cell, then a number. N toggles notes, arrows move, Backspace erases. Your puzzle is saved as you go.'
        },
        {
            id: 'memory', file: 'games/memory.html', name: 'Memory Match', icon: '🧠', accent: '#f472b6', category: 'Puzzle',
            tagline: 'Flip two cards, find the pairs, beat your best.',
            stat: 'Wins',
            how: 'Flip two cards at a time. Matching pairs stay face up. Fewer moves earns more stars.'
        },
        {
            id: 'hangman', file: 'games/hangman.html', name: 'Hangman', icon: '🔤', accent: '#fbbf24', category: 'Word',
            tagline: 'Guess the word before the drawing is done.',
            stat: 'Best streak',
            how: 'Type or tap letters. Six wrong guesses and the round is lost. Win in a row to build a streak.'
        },
        {
            id: 'slot', file: 'games/slot.html', name: 'Neon Slots', icon: '🎰', accent: '#fb7185', category: 'Casino',
            tagline: 'Five paylines, fair odds, play-money credits.',
            stat: 'Biggest win',
            how: 'Set a bet and spin (Space works too). Three in a row on any of the five lines pays. Credits are play money.'
        }
    ];

    // ---------- Saved state ----------
    // The shell and the game iframe share one localStorage entry. Every write re-reads it
    // first so neither document overwrites the other's changes with a stale copy.

    const KEY = 'arcade:v1';
    const blank = () => ({ stats: {}, last: {}, data: {}, favs: [], ui: {}, muted: false });

    function read() {
        try {
            return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {});
        } catch (e) {
            return null;   // storage unavailable: keep using the in-memory copy
        }
    }

    let state = read() || blank();
    const listeners = [];

    function update(change) {
        state = read() || state;
        change(state);
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        } catch (e) { /* private mode: changes last for this page only */ }
        listeners.forEach(fn => fn());
    }

    // Fires when the *other* document (shell or game) writes.
    window.addEventListener('storage', e => {
        if (e.key !== KEY && e.key !== null) return;
        state = read() || state;
        listeners.forEach(fn => fn());
    });

    const fmt = n => Number(n || 0).toLocaleString('en-US');
    const el = (tag, cls, html) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (html != null) node.innerHTML = html;
        return node;
    };

    const game = GAMES.find(g => g.id === document.body.dataset.game) || null;
    const next = game && GAMES[(GAMES.indexOf(game) + 1) % GAMES.length];
    const embedded = window.top !== window.self;

    if (game && !embedded) {
        // Opened directly (old link, bookmark): show it inside the catalog instead.
        document.documentElement.style.visibility = 'hidden';
        location.replace(url('index.html#/' + game.id));
    }

    if (game) {
        document.documentElement.style.setProperty('--accent', game.accent);
        document.body.classList.add('embed');
        update(s => s.last[game.id] = Date.now());
        const main = document.querySelector('main');
        if (main) main.after(el('p', 'how', `<b>How to play</b>${game.how}`));

        // A few shortcuts belong to the shell; pass them up since the iframe has focus.
        document.addEventListener('keydown', e => {
            const palette = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
            const sidebar = e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey;
            if (!palette && !sidebar) return;
            e.preventDefault();
            window.parent.postMessage({ arcade: 'key', key: palette ? 'k' : '[' }, '*');
        });
    }

    // ---------- Sound ----------

    // Each sound is a short run of [frequency, duration, wave] notes.
    const SOUNDS = {
        tap: [[520, 0.05, 'triangle']],
        move: [[260, 0.05, 'sine']],
        good: [[660, 0.07, 'triangle'], [880, 0.11, 'triangle']],
        bad: [[190, 0.16, 'sawtooth']],
        win: [[523, 0.09, 'triangle'], [659, 0.09, 'triangle'], [784, 0.09, 'triangle'], [1047, 0.24, 'triangle']],
        lose: [[392, 0.14, 'triangle'], [330, 0.14, 'triangle'], [247, 0.3, 'triangle']],
        tick: [[140, 0.05, 'square']]
    };
    let audio = null;

    function sfx(name) {
        if (state.muted) return;
        const notes = SOUNDS[name];
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!notes || !Ctx) return;
        try {
            audio = audio || new Ctx();
            if (audio.state === 'suspended') audio.resume();
            let at = audio.currentTime;
            notes.forEach(([freq, dur, wave]) => {
                const osc = audio.createOscillator();
                const gain = audio.createGain();
                osc.type = wave;
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.07, at);
                gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
                osc.connect(gain).connect(audio.destination);
                osc.start(at);
                osc.stop(at + dur);
                at += dur * 0.9;
            });
        } catch (e) { /* audio blocked until a user gesture */ }
    }

    // ---------- Modal / toast / confetti ----------

    let modalEl = null;

    function closeModal() {
        if (modalEl) modalEl.remove();
        modalEl = null;
    }

    // options: { emoji, title, text, stats: [[label, value]], actions: [{ label, primary, run }] }
    function modal(options) {
        closeModal();
        const wrap = el('div', 'modal-wrap', `
            <div class="modal" role="dialog" aria-modal="true">
                ${options.emoji ? `<div class="modal-emoji">${options.emoji}</div>` : ''}
                <h2>${options.title}</h2>
                ${options.text ? `<p>${options.text}</p>` : ''}
                ${options.stats ? `<dl class="modal-stats">${options.stats.map(([k, v]) =>
                    `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
                <div class="modal-actions"></div>
                ${next ? `<a class="modal-next" href="${url('index.html#/' + next.id)}" target="_top">Next up: ${next.icon} ${next.name} →</a>` : ''}
            </div>`);
        const actions = wrap.querySelector('.modal-actions');
        let primary = null;
        (options.actions || [{ label: 'OK', primary: true }]).forEach(action => {
            const btn = el('button', 'btn' + (action.primary ? ' primary' : ''), action.label);
            btn.addEventListener('click', () => {
                closeModal();
                if (action.run) action.run();
            });
            if (action.primary) primary = btn;
            actions.append(btn);
        });
        wrap.addEventListener('click', e => {
            if (e.target === wrap) closeModal();
        });
        document.body.append(wrap);
        modalEl = wrap;
        // Focus late so a key still held from gameplay can't trigger the button.
        setTimeout(() => {
            if (modalEl === wrap && primary) primary.focus();
        }, 350);
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modalEl) closeModal();
    });

    let toastEl = null;
    function toast(message) {
        if (toastEl) toastEl.remove();
        const node = toastEl = el('div', 'toast');
        node.textContent = message;
        document.body.append(node);
        setTimeout(() => node.remove(), 1800);
    }

    function confetti() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const canvas = el('canvas', 'confetti');
        const ctx = canvas.getContext('2d');
        const w = canvas.width = window.innerWidth;
        const h = canvas.height = window.innerHeight;
        const colors = ['#fbbf24', '#f472b6', '#38bdf8', '#4ade80', '#a78bfa', '#ffffff'];
        const bits = Array.from({ length: 130 }, () => ({
            x: w / 2 + (Math.random() - 0.5) * w * 0.3,
            y: h * 0.42,
            vx: (Math.random() - 0.5) * 16,
            vy: -Math.random() * 15 - 4,
            size: Math.random() * 7 + 4,
            spin: Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)]
        }));
        document.body.append(canvas);
        let frame = 0;
        (function tick() {
            ctx.clearRect(0, 0, w, h);
            bits.forEach(b => {
                b.x += b.vx;
                b.y += b.vy;
                b.vy += 0.42;
                b.vx *= 0.99;
                b.spin += 0.2;
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.rotate(b.spin);
                ctx.globalAlpha = Math.max(0, 1 - frame / 130);
                ctx.fillStyle = b.color;
                ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
                ctx.restore();
            });
            if (++frame < 130) requestAnimationFrame(tick);
            else canvas.remove();
        })();
    }

    // ---------- Public API ----------

    window.Arcade = {
        games: GAMES,
        categories: CATEGORIES,
        game,
        url,
        fmt,
        sfx,
        modal,
        closeModal,
        modalOpen: () => !!modalEl,
        toast,
        confetti,
        time(seconds) {
            const s = Math.floor(seconds);
            return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        },
        onChange: fn => listeners.push(fn),

        // The one number per game shown in the sidebar and catalog.
        stat: gameId => state.stats[gameId] || 0,
        lastPlayed: gameId => state.last[gameId] || 0,
        // Keep the highest value; returns true when it is a new record.
        bump(gameId, value) {
            if (value <= (state.stats[gameId] || 0)) return false;
            update(s => s.stats[gameId] = Math.max(value, s.stats[gameId] || 0));
            return true;
        },
        add(gameId, amount) {
            update(s => s.stats[gameId] = (s.stats[gameId] || 0) + amount);
        },
        // Free-form per-game storage (in-progress boards, settings, per-mode bests).
        data: gameId => state.data[gameId] || {},
        saveData(gameId, value) {
            update(s => s.data[gameId] = value);
        },

        isFav: gameId => state.favs.includes(gameId),
        toggleFav(gameId) {
            update(s => s.favs = s.favs.includes(gameId) ? s.favs.filter(f => f !== gameId) : [...s.favs, gameId]);
        },
        muted: () => state.muted,
        setMuted(value) {
            update(s => s.muted = value);
        },
        ui: key => state.ui[key],
        setUi(key, value) {
            update(s => s.ui[key] = value);
        }
    };
})();
