/* Translation at the edge of the page. Screens are written in Indonesian; tr(),
   translateHTML() and translateDOM() look each rendered string up in the catalog.
   New text should use I18N.t(key, parameters) with an entry in i18n/id.json and en.json. */
const language = I18N.locale;
const tr = value => I18N.text(value),
  translateHTML = html => I18N.html(html);
function translateDOM(root) {
  if (language === 'id' || !document.createTreeWalker || !root) return;
  const walk = document.createTreeWalker(root, 4);
  let node;
  while ((node = walk.nextNode())) {
    if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue;
    const next = tr(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  const labelled = [...(root.querySelectorAll?.('[title],[aria-label],[placeholder]') || [])];
  if (root.matches?.('[title],[aria-label],[placeholder]')) labelled.push(root);
  for (const el of labelled)
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute(attr);
      if (v && tr(v) !== v) el.setAttribute(attr, tr(v));
    }
}
if (language !== 'id') {
  document.documentElement?.setAttribute('lang', language);
  // Text that scripts put on the page later is translated where it changed,
  // not by walking the whole document again.
  if (typeof MutationObserver !== 'undefined') {
    const changed = new Set();
    let queued = false;
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') changed.add(record.target.parentElement);
        else
          for (const node of record.addedNodes) changed.add(node.nodeType === 1 ? node : node.parentElement);
      }
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const roots = [...changed];
        changed.clear();
        for (const root of roots) if (root?.isConnected) translateDOM(root);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}
