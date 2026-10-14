/* Team codes: a team as a short text to copy and send. Someone who enters it can battle it
   as a ghost team (an offline friend battle) as often as they like, and may once receive
   one creature from it in trade.

   Format: "WG1." followed by the base64url of these bytes:
     0      version (1)
     1      number of creatures, 1 to 6
     2-5    the sender's trade ID (uint32, big-endian), so nobody trades with themselves
     6      name length L (0 to 12), then L bytes of name: A-Z a-z 0-9 space . _ -
     then 6 bytes per creature:
            species (uint16), level (1 to LEVEL_CAP),
            held gear (0 none, else 1 + index in TEAM_CODE_ITEMS),
            tutored move (0 none, else 1 + index in TEAM_CODE_TUTOR),
            flags: bit 0 rare colours, bits 1-3 batik (index in BATIK_KEYS), bits 4-6 the
            tutored move's slot; bit 7 is always 0
     last 4 FNV-1a checksum of everything before it (uint32, big-endian)
   A six-creature team with a full name is 83 characters. The checksum catches typing and
   copying mistakes; it is no secret, so every code is also checked against the rules. */
const TEAM_CODE_PREFIX = 'WG1.',
  TEAM_CODE_VERSION = 1,
  TEAM_CODE_MAX = 200,
  // Stored in codes by position: append, never reorder.
  TEAM_CODE_ITEMS = [
    'scarf',
    'vest',
    'turbine',
    'lunchbox',
    'sambal',
    'coil',
    'rescue',
    'capacitor',
    'medkit',
    'umbrella',
  ],
  TEAM_CODE_TUTOR = [
    'ember',
    'splash',
    'spark',
    'leaf',
    'stone',
    'ward',
    'tide',
    'net',
    'wrench',
    'dew',
    'whistle',
    'tower',
    'valley',
    'sulfur',
    'gravel',
    'lens',
  ],
  TEAM_CODE_NAME = /^[A-Za-z0-9 ._-]{0,12}$/,
  // Trades: each code once, at most this many a day, and the codes already used are kept.
  TRADE_DAILY_LIMIT = 3,
  TRADE_MEMORY = 300;
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function toBase64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0),
      chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let c = 0; c < chars; c++) out += BASE64URL[(n >> (18 - 6 * c)) & 63];
  }
  return out;
}
// Null for anything that is not clean base64url.
function fromBase64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bytes = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let c = 0; c < 4; c++) n = (n << 6) | (c < chunk.length ? BASE64URL.indexOf(chunk[c]) : 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  // Leftover bits must be zero, so one team has exactly one spelling.
  return toBase64url(bytes) === text ? bytes : null;
}
function teamCodeChecksum(bytes) {
  let h = 0x811c9dc5 ^ 0x5747;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h >>> 0;
}
const uint32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const readUint32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
function tradeState() {
  const t = (state.trades ??= freshTrades());
  for (const [k, v] of Object.entries(freshTrades())) t[k] ??= v;
  if (!Array.isArray(t.used)) t.used = [];
  return t;
}
const freshTrades = () => ({ id: 0, name: '', used: [], day: -1, today: 0, received: 0, ghostWins: 0 });
// This save's trade ID, made once.
function tradeId() {
  const t = tradeState();
  if (!t.id) t.id = (Math.floor(Math.random() * 4294967295) >>> 0) + 1;
  return t.id >>> 0;
}
// A team (creatures as stored) to a code. Throws on a team that cannot be written.
function encodeTeamCode(team, name = '', owner = tradeId()) {
  const clean = String(name)
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .slice(0, 12);
  if (!Array.isArray(team) || team.length < 1 || team.length > 6) throw Error('team size');
  const bytes = [TEAM_CODE_VERSION, team.length, ...uint32(owner >>> 0), clean.length];
  for (const ch of clean) bytes.push(ch.charCodeAt(0));
  for (const m of team) {
    const [slot, move] =
        Object.entries(m.learnedMoves || {}).find(([, k]) => TEAM_CODE_TUTOR.includes(k)) || [],
      item = TEAM_CODE_ITEMS.indexOf(m.heldItem),
      batik = m.variant ? Math.max(0, BATIK_KEYS.indexOf(batikFor(m))) : 0;
    bytes.push(
      (m.id >> 8) & 255,
      m.id & 255,
      Math.max(1, Math.min(LEVEL_CAP, m.level)),
      item + 1,
      move ? TEAM_CODE_TUTOR.indexOf(move) + 1 : 0,
      (m.variant ? 1 : 0) | (batik << 1) | ((move ? Number(slot) & 7 : 0) << 4),
    );
  }
  return TEAM_CODE_PREFIX + toBase64url([...bytes, ...uint32(teamCodeChecksum(bytes))]);
}
// The lowest level a species can have: an evolved form starts at its evolution level.
function lowestLevel(id) {
  const from = SPECIES[id].from;
  return from !== undefined && EVOLUTIONS[from]?.to === id ? EVOLUTIONS[from].level : 1;
}
// A code to { id, owner, name, team }, or { error } with the reason (teamCode.error.<reason>).
// Spaces and line breaks from copying are ignored; nothing else is forgiven.
function decodeTeamCode(text) {
  if (typeof text !== 'string') return { error: 'format' };
  const raw = text.replace(/\s+/g, '');
  if (!raw) return { error: 'empty' };
  if (raw.length > TEAM_CODE_MAX) return { error: 'format' };
  if (!raw.startsWith('WG') || raw[3] !== '.') return { error: 'format' };
  if (raw.slice(0, 4) !== TEAM_CODE_PREFIX) return { error: 'version' };
  const bytes = fromBase64url(raw.slice(4));
  if (!bytes || bytes.length < 7 + 6 + 4) return { error: 'format' };
  const body = bytes.slice(0, -4);
  if (readUint32(bytes, bytes.length - 4) !== teamCodeChecksum(body)) return { error: 'checksum' };
  if (body[0] !== TEAM_CODE_VERSION) return { error: 'version' };
  const count = body[1],
    owner = readUint32(body, 2),
    nameLength = body[6];
  if (count < 1 || count > 6 || nameLength > 12 || body.length !== 7 + nameLength + count * 6)
    return { error: 'invalid' };
  const name = String.fromCharCode(...body.slice(7, 7 + nameLength));
  if (!TEAM_CODE_NAME.test(name)) return { error: 'invalid' };
  const team = [];
  for (let i = 0, at = 7 + nameLength; i < count; i++, at += 6) {
    const id = (body[at] << 8) | body[at + 1],
      [level, item, move, flags] = body.slice(at + 2, at + 6);
    if (!SPECIES[id] || !KITS[SPECIES[id].from ?? id]) return { error: 'invalid' };
    if (level < lowestLevel(id) || level > LEVEL_CAP) return { error: 'level' };
    if (item > TEAM_CODE_ITEMS.length || move > TEAM_CODE_TUTOR.length || flags & 0x80)
      return { error: 'invalid' };
    const variant = !!(flags & 1),
      batik = (flags >> 1) & 7,
      slot = (flags >> 4) & 7;
    if ((!variant && batik) || batik >= BATIK_KEYS.length) return { error: 'invalid' };
    if ((!move && slot) || (move && slot >= kit(id, { level }).length)) return { error: 'invalid' };
    team.push({
      id,
      level,
      heldItem: item ? TEAM_CODE_ITEMS[item - 1] : null,
      ...(move ? { learnedMoves: { [slot]: TEAM_CODE_TUTOR[move - 1] } } : {}),
      ...(variant ? { variant: true, batik: BATIK_KEYS[batik] } : {}),
    });
  }
  return { raw, owner, name, team };
}

// --- Trades.
const highestLevel = () => Math.max(0, ...[...state.team, ...(state.storage || [])].map(m => m.level));
// Why this creature from this code cannot be received now, or '' when it can.
function tradeBlock(code, i) {
  const t = tradeState(),
    m = code?.team?.[i];
  if (!m) return 'invalid';
  if (!state.team.length) return 'team';
  if (code.owner === tradeId()) return 'own';
  if (t.used.includes(code.raw)) return 'used';
  if (SPECIES[m.id].legendary) return 'legend';
  if (m.level > highestLevel()) return 'level';
  if (t.day === dayNumber() && t.today >= TRADE_DAILY_LIMIT) return 'limit';
  return '';
}
// Receives creature `i` of a code: it joins the team (or the daycare when the team is full)
// without its held gear, which stays with the sender.
function receiveTrade(code, i) {
  if (tradeBlock(code, i)) return false;
  const t = tradeState(),
    m = code.team[i],
    mon = {
      ...makeMon(m.id, m.level),
      ...(m.learnedMoves ? { learnedMoves: { ...m.learnedMoves } } : {}),
      ...(m.variant ? { variant: true, batik: m.batik } : {}),
    },
    reserve = state.team.length >= 6;
  (reserve ? (state.storage ??= []) : state.team).push(mon);
  if (!state.seen.includes(m.id)) state.seen.push(m.id);
  state.met ??= [];
  if (!state.met.includes(m.id)) state.met.push(m.id);
  if (t.day !== dayNumber()) {
    t.day = dayNumber();
    t.today = 0;
  }
  t.today++;
  t.received++;
  t.used.push(code.raw);
  if (t.used.length > TRADE_MEMORY) t.used.splice(0, t.used.length - TRADE_MEMORY);
  checkDexMilestones();
  update();
  save();
  return reserve ? 'storage' : 'team';
}

// --- Ghost teams.
function ghostGuest(code) {
  return {
    kind: 'ghost',
    name: I18N.t('teamCode.ghostName', { name: code.name || I18N.t('common.resident') }),
    portrait: TOWER_PORTRAITS[code.owner % TOWER_PORTRAITS.length],
    style: ['status', 'guard', 'aggressive'][code.owner % 3],
    potions: 1,
    noItems: false,
    team: code.team.map(m => ({
      sid: m.id,
      lv: m.level,
      item: m.heldItem,
      variant: m.variant,
      batik: m.batik,
      learnedMoves: m.learnedMoves,
    })),
  };
}
function ghostBattle(code) {
  if (battle || locked || !code?.team || !state.team.some(m => m.hp > 0)) return false;
  requestTowerCast();
  startGuestBattle(ghostGuest(code));
  return !!battle;
}
function ghostBattleOver(b, won) {
  const t = tradeState();
  if (won) t.ghostWins++;
  save();
  modal(
    `<h2>${I18N.t(won ? 'battle.win.guest' : 'teamCode.ghostLost', { name: b.guest.name })}</h2><p>${I18N.t(won ? 'teamCode.ghostWonBody' : 'teamCode.ghostLostBody')}</p>${won ? victoryProgress(b) : ''}${closeButton()}`,
    'ghost-result',
  );
}

// --- The menu: the player's own code, and a box for someone else's.
let pendingTeamCode = null;
function teamCodeMenu(message = '') {
  if (battle || locked || modalKind === 'starter') return;
  const t = tradeState();
  let own = '';
  try {
    own = state.team.length ? encodeTeamCode(state.team, t.name) : '';
  } catch {}
  modal(
    `<h2>${I18N.t('teamCode.title')}</h2><p>${I18N.t('teamCode.intro')}</p>${message}<section class="team-code-panel"><h3>${I18N.t('teamCode.yours')}</h3>${
      own
        ? `<label>${I18N.t('teamCode.nameLabel')} <input id="teamCodeName" maxlength="12" value="${t.name}" autocomplete="off" spellcheck="false"></label><textarea id="teamCodeOwn" class="team-code-text" readonly rows="2">${own}</textarea><div class="actions"><button class="secondary" data-code="rename">${I18N.t('teamCode.rename')}</button><button class="action" data-code="copy">${I18N.t('teamCode.copy')}</button></div>`
        : `<p>${I18N.t('teamCode.noTeam')}</p>`
    }</section><section class="team-code-panel"><h3>${I18N.t('teamCode.enter')}</h3><textarea id="teamCodeInput" class="team-code-text" rows="2" maxlength="${TEAM_CODE_MAX + 40}" placeholder="WG1.…" autocomplete="off" spellcheck="false"></textarea><div class="actions"><button class="action" data-code="check">${I18N.t('teamCode.check')}</button></div><p class="story-hint">${I18N.t('teamCode.rules', { n: TRADE_DAILY_LIMIT })}</p></section>${closeButton()}`,
    'team-code',
  );
}
// A code someone entered: their team, a ghost battle, and what may be received.
function reviewTeamCode(text) {
  const code = decodeTeamCode(text);
  if (code.error) {
    pendingTeamCode = null;
    teamCodeMenu(`<p class="save-notice" role="alert">${I18N.t(`teamCode.error.${code.error}`)}</p>`);
    return code;
  }
  pendingTeamCode = code;
  modal(
    `<h2>${I18N.t('teamCode.reviewTitle', { name: code.name || I18N.t('common.resident') })}</h2><p>${I18N.t('teamCode.reviewBody')}</p><div class="team-list">${code.team
      .map((m, i) => {
        const block = tradeBlock(code, i);
        return `<section class="team-card">${monArt(m)}<div class="meta"><strong>${monName(m)}, Lv.${m.level}</strong>${batikTag(m)}<p>${typeLabel(m.id)}${LEAGUE_ITEMS[m.heldItem] ? ', ' + I18N.t('battle.heldItem', { item: LEAGUE_ITEMS[m.heldItem].name }) : ''}</p>${block ? `<small>${I18N.t(`teamCode.block.${block}`)}</small>` : ''}</div><div class="team-member-actions"><button data-code="trade" data-id="${i}" ${block ? 'disabled' : ''}>${I18N.t('teamCode.receive')}</button></div></section>`;
      })
      .join(
        '',
      )}</div><p class="story-hint">${I18N.t('teamCode.tradeNote')}</p><div class="actions"><button class="action" data-code="ghost" ${state.team.some(m => m.hp > 0) ? '' : 'disabled'}>${I18N.t('teamCode.battle')}</button><button class="secondary" data-code="menu">${I18N.t('common.back')}</button></div>`,
    'team-code-review',
  );
  return code;
}
function confirmTrade(i) {
  if (modalKind !== 'team-code-review' || !pendingTeamCode) return false;
  const code = pendingTeamCode,
    where = receiveTrade(code, i);
  if (!where) return false;
  const m = code.team[i];
  pendingTeamCode = null;
  modal(
    `<div class="portrait-head">${monArt(m)}<div><h2>${I18N.t('battle.toast.joined', { name: SPECIES[m.id].name })}</h2>${batikTag(m)}</div></div><p>${I18N.t(where === 'storage' ? 'teamCode.receivedStorage' : 'teamCode.receivedTeam')}</p>${closeButton()}`,
    'team-code-done',
  );
  return true;
}
function copyTeamCode() {
  const field = $('teamCodeOwn'),
    text = field?.value || field?.textContent || '';
  if (!text) return;
  const done = () => toast(I18N.t('teamCode.copied'));
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText)
      navigator.clipboard.writeText(text).then(done, () => {
        field.select?.();
        toast(I18N.t('teamCode.copyManual'));
      });
    else {
      field.select?.();
      toast(I18N.t('teamCode.copyManual'));
    }
  } catch {
    toast(I18N.t('teamCode.copyManual'));
  }
}
onClick(e => {
  const b = e.target.closest('[data-code]');
  if (!b || b.disabled) return;
  switch (b.dataset.code) {
    case 'menu':
      teamCodeMenu();
      break;
    case 'copy':
      copyTeamCode();
      break;
    case 'rename':
      tradeState().name = String($('teamCodeName')?.value || '')
        .replace(/[^A-Za-z0-9 ._-]/g, '')
        .slice(0, 12);
      save();
      teamCodeMenu();
      break;
    case 'check':
      reviewTeamCode(String($('teamCodeInput')?.value || ''));
      break;
    case 'ghost':
      if (modalKind === 'team-code-review' && pendingTeamCode) ghostBattle(pendingTeamCode);
      break;
    case 'trade':
      confirmTrade(Number(b.dataset.id));
      break;
  }
});
