'use strict';
// Translation. The game is written in English; another language is a dictionary of
// whole strings (exact) plus regex patterns for strings with numbers or names in them.
// Text is translated where it reaches the screen: when an overlay opens (every text node
// inside it), in HUD updates and in toasts. English originals are remembered per text
// node, so switching language back restores them.
//
// Language files register themselves in LANGS: LANGS.id = {name, exact: {...}, patterns: [[/^...$/, '...'], ...]}.

const LANGS = {};

const I18N = {
  lang: 'en',
  originals: new WeakMap(),

  set(lang) {
    this.lang = LANGS[lang] ? lang : 'en';
    document.documentElement.lang = this.lang;
    this.localize(document.body);
  },

  // Translates one string; unknown strings pass through unchanged.
  tr(s) {
    if (this.lang === 'en' || !s) return s;
    const d = LANGS[this.lang], k = String(s).trim();
    if (!k) return s;
    const hit = d.exact[k];
    if (hit !== undefined) return String(s).replace(k, hit);
    for (const [re, rep] of d.patterns) if (re.test(k)) return String(s).replace(k, k.replace(re, rep));
    return s;
  },

  // Translates every text node under root (and placeholder-free button titles).
  localize(root) {
    if (!root || (this.lang === 'en' && !this.touched)) return;
    this.touched = true;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      // Each node remembers its English text and what we last showed. If the code has
      // since written new text into it, that new text is the English original.
      let rec = this.originals.get(n);
      if (!rec || n.nodeValue !== rec.shown) { rec = {orig: n.nodeValue}; this.originals.set(n, rec); }
      rec.shown = this.lang === 'en' ? rec.orig : this.tr(rec.orig);
      if (n.nodeValue !== rec.shown) n.nodeValue = rec.shown;
    }
  },
};
const tr = s => I18N.tr(s);
