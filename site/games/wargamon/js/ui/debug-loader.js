/* The debug tools and the walking-area editor are loaded only for ?debug (area-jalan.html
   opens ./?debug&floor=…). index.html names them as <script data-debug-src>, which loads
   nothing for a player and keeps them out of the offline shell. Written here, while the
   page is still being read, they run in order right after this script and before boot.js. */
if (DEBUG)
  for (const script of document.querySelectorAll('script[data-debug-src]'))
    document.write(`<script src="${script.dataset.debugSrc}"></script>`);
