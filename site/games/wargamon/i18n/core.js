/* Keyed catalogs and named interpolation. Locale never changes combat/save data. */
const I18N = (() => {
  const catalogs = globalThis.WARGAMON_MESSAGES || {};
  const metadata = globalThis.WARGAMON_LOCALES || {};
  const supported = Object.keys(catalogs);
  let locale = 'id';
  try {
    const saved = localStorage.getItem('wargamon-language');
    if (supported.includes(saved)) locale = saved;
  } catch {}

  const index = new Map();
  const folded = new Map();
  const templates = [];
  const missing = new Set();
  const textCache = new Map();
  const interpolate = (message, params) =>
    message.replace(/\{(\w+)\}/g, (token, key) => (Object.hasOwn(params, key) ? String(params[key]) : token));

  function t(key, params = {}) {
    const message = catalogs[locale]?.[key] ?? catalogs.id?.[key];
    if (message === undefined) {
      missing.add(key);
      return key;
    }
    return interpolate(message, params);
  }

  function compile() {
    textCache.clear();
    index.clear();
    folded.clear();
    templates.length = 0;
    for (const [key, value] of Object.entries(catalogs.id || {})) {
      index.set(value, key);
      folded.set(value.toLowerCase(), key);
      if (!/\{\w+\}/.test(value)) continue;
      const names = [];
      const source = value
        .split(/(\{\w+\})/)
        .map(part => {
          if (!/^\{\w+\}$/.test(part)) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const name = part.slice(1, -1);
          names.push(name);
          // Numeric placeholders must not swallow whole sentences or quoted dialogue.
          return /^(n|total|moves|shots|goals|target|stored|level)$/.test(name) ? '([0-9.,]+)' : '(.+?)';
        })
        .join('');
      const literal = value.replace(/\{\w+\}/g, '').length;
      templates.push({ key, names, literal, rx: new RegExp('^' + source + '$') });
    }
    // The template with the most fixed text is tried first, so a short generic template cannot
    // take a sentence that a longer template describes exactly.
    templates.sort((a, b) => b.literal - a.literal);
  }

  // Compatibility boundary for legacy renderers. New UI should call t(key, params).
  function text(value) {
    if (locale === 'id' || typeof value !== 'string') return value;
    if (textCache.has(value)) return textCache.get(value);
    const result = translateText(value);
    if (textCache.size >= 2048) textCache.delete(textCache.keys().next().value);
    textCache.set(value, result);
    return result;
  }

  function translateText(value) {
    if (locale === 'id' || typeof value !== 'string') return value;
    const s = value.trim();
    if (!s) return value;
    const start = value.indexOf(s);
    const key = index.get(s) || folded.get(s.toLowerCase());
    let result;
    if (key) result = s === s.toUpperCase() ? t(key).toUpperCase() : t(key);
    else
      for (const template of templates) {
        const match = template.rx.exec(s);
        if (!match) continue;
        const params = Object.fromEntries(template.names.map((name, i) => [name, text(match[i + 1])]));
        result = t(template.key, params);
        break;
      }
    if (result === undefined && /^[“‘].*[”’]$/.test(s)) result = s[0] + text(s.slice(1, -1)) + s.at(-1);
    if (result === undefined && /^[^\p{L}\p{N}]+\p{L}/u.test(s)) {
      const lead = s.match(/^[^\p{L}\p{N}]+/u)[0];
      result = lead + text(s.slice(lead.length));
    }
    for (const separator of [' / ', ' · ']) {
      if (result === undefined && s.includes(separator))
        result = s.split(separator).map(text).join(separator);
    }
    if (result === undefined && /[→←✓]$/.test(s)) {
      const suffix = s.match(/\s*[→←✓]$/)[0];
      result = text(s.slice(0, -suffix.length)) + suffix;
    }
    if (result === undefined) {
      const sentences = s.split(/(?<=[.!?])\s+(?!\d)/);
      if (sentences.length > 1) result = sentences.map(text).join(' ');
    }
    if (result === undefined && /[.!?]$/.test(s)) result = text(s.slice(0, -1)) + s.at(-1);
    for (const separator of [': ', ', ']) {
      if (result === undefined && s.includes(separator))
        result = s.split(separator).map(text).join(separator);
    }
    if (result === undefined) {
      missing.add(s);
      result = s;
    }
    return value.slice(0, start) + result + value.slice(start + s.length);
  }

  function html(markup) {
    if (locale === 'id') return markup;
    return markup
      .replace(/>([^<>]+)</g, (_, s) => '>' + text(s) + '<')
      .replace(
        /\b(title|aria-label|placeholder)="([^"]*)"/g,
        (_, attr, s) => attr + '="' + text(s).replaceAll('"', '&quot;') + '"',
      );
  }

  function options() {
    return supported
      .map(
        code =>
          `<option value="${code}" ${code === locale ? 'selected' : ''}>${metadata[code]?.label || code}</option>`,
      )
      .join('');
  }

  function setLocale(next) {
    if (!supported.includes(next)) return;
    localStorage.setItem('wargamon-language', next);
    location.reload();
  }

  compile();
  return {
    get locale() {
      return locale;
    },
    t,
    text,
    html,
    compile,
    options,
    setLocale,
    missing,
    catalogs,
  };
})();
