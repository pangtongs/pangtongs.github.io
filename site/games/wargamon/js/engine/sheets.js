/* Character sheets: cutting a grid of people out of one image and registering each as
   a portrait. Every portrait rule goes into one shared stylesheet. */
let castStyleSheet = null;
function addCastRule(rule) {
  if (!castStyleSheet && document.createElement) {
    const style = document.createElement('style');
    style.id = 'cast-portraits';
    document.head.appendChild(style);
    castStyleSheet = style;
  }
  if (!castStyleSheet) return;
  if (castStyleSheet.sheet?.insertRule)
    castStyleSheet.sheet.insertRule(rule, castStyleSheet.sheet.cssRules.length);
  else castStyleSheet.textContent += rule;
}
// The cells of an evenly divided sheet, left to right, top row first.
function cutGrid(image, cols, rows) {
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const c = document.createElement('canvas');
    c.width = image.naturalWidth / cols;
    c.height = image.naturalHeight / rows;
    c.getContext('2d').drawImage(
      image,
      (i % cols) * c.width,
      Math.floor(i / cols) * c.height,
      c.width,
      c.height,
      0,
      0,
      c.width,
      c.height,
    );
    cells.push(c);
  }
  return cells;
}
// One person as portrait `id`: its bounds for the map and a `.castN` rule for dialogs.
// `alphaFloor` clears faint halo pixels left by some generated sheets.
function registerCast(id, canvas, { isolate = isolateSprite, alphaFloor = 0, css = '' } = {}) {
  if (alphaFloor) {
    const cc = canvas.getContext('2d'),
      pixels = cc.getImageData(0, 0, canvas.width, canvas.height);
    for (let k = 3; k < pixels.data.length; k += 4) if (pixels.data[k] < alphaFloor) pixels.data[k] = 0;
    cc.putImageData(pixels, 0, 0);
  }
  castCells.set(id, { canvas, bounds: isolate(canvas) });
  addCastRule(
    `.trainer-sprite.cast${id}{background-image:url(${canvas.toDataURL()});background-size:contain;background-position:center;background-repeat:no-repeat;${css}}`,
  );
}
function registerCastSheet(image, cols, rows, firstId, options) {
  cutGrid(image, cols, rows).forEach((canvas, i) => registerCast(firstId + i, canvas, options));
}
