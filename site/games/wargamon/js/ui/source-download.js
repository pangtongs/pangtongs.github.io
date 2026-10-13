/* Export the current source assets on demand without shipping a second copy. */
function makeSourceZip(entries) {
  const encoder = new TextEncoder(),
    table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const chunks = [],
    directory = [];
  let offset = 0,
    centralSize = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path),
      data = entry.data instanceof Uint8Array ? entry.data : encoder.encode(entry.data);
    let crc = 0xffffffff;
    for (const b of data) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const central = new Uint8Array(46 + name.length),
      d = new DataView(central.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 0x21, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    central.set(name, 46);
    chunks.push(header, data);
    directory.push(central);
    offset += header.length + data.length;
    centralSize += central.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
if (typeof module !== 'undefined') module.exports = { makeSourceZip };
if (typeof document !== 'undefined')
  document.getElementById('downloadSource').addEventListener('click', async () => {
    const button = document.getElementById('downloadSource'),
      status = document.getElementById('downloadStatus');
    button.disabled = true;
    try {
      status.textContent = 'Menyiapkan daftar source…';
      const manifestResponse = await fetch('source-manifest.json', {
        credentials: 'same-origin',
        cache: 'no-cache',
      });
      if (!manifestResponse.ok) throw Error('Manifest unavailable');
      const manifestText = await manifestResponse.text(),
        manifest = JSON.parse(manifestText),
        entries = [];
      for (const [i, file] of manifest.files.entries()) {
        status.textContent = `Mengunduh ${i + 1}/${manifest.files.length}: ${file.path.split('/').pop()}`;
        if (file.text !== undefined) {
          entries.push({ path: file.path, data: file.text });
          continue;
        }
        const response = await fetch(file.url, { credentials: 'same-origin', cache: 'no-cache' });
        if (!response.ok) throw Error(file.path);
        entries.push({ path: file.path, data: new Uint8Array(await response.arrayBuffer()) });
      }
      entries.push({ path: 'wargamon/web/source-manifest.json', data: manifestText });
      status.textContent = 'Menyusun ZIP…';
      const url = URL.createObjectURL(makeSourceZip(entries)),
        a = document.createElement('a');
      a.href = url;
      a.download = 'wargamon-source.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'ZIP lengkap siap. Ekstrak, lalu ikuti README.md.';
    } catch {
      status.textContent = 'Unduhan terputus. Source belum lengkap; tekan Unduh untuk mencoba lagi.';
    } finally {
      button.disabled = false;
    }
  });
