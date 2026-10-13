/* Development-only artwork editor; ChatGPT Plus uses a manual image round trip. */
(() => {
  const $ = id => document.getElementById(id);
  let catalog,
    map,
    original,
    previewImage,
    rect,
    drag,
    edit,
    busy = false;
  const status = (text, error = false) => {
    $('status').textContent = text;
    $('status').classList.toggle('error', error);
  };
  const fileURL = name => `/__editor/art/file?edit=${edit.id}&name=${name}`;
  async function request(data) {
    const response = await fetch('/__editor/art', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Wargamon-Editor': catalog.token },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Editor request failed');
    return result;
  }
  function controls() {
    $('prepare').disabled = busy || !rect || !!edit?.saved;
    $('import').disabled = busy || !edit || !!edit.saved;
    $('preview').disabled = busy || !edit || !!edit.saved || !$('import').files.length;
    $('save').disabled =
      busy || !edit?.candidate || !!edit.saved || !edit.report?.edgeMatched || !$('reviewed').checked;
    $('undo').disabled = busy || !edit?.saved;
    $('map').disabled = busy || !catalog;
    $('sessions').disabled = busy;
    $('reload').disabled = busy;
    $('show').disabled = !previewImage;
    $('reviewed').disabled = busy || !previewImage || !!edit?.saved || !edit?.report?.edgeMatched;
  }
  async function task(callback) {
    if (busy) return;
    busy = true;
    controls();
    try {
      await callback();
    } catch (error) {
      status(error.message, true);
    } finally {
      busy = false;
      controls();
    }
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Map image could not be loaded'));
      image.src = url;
    });
  }
  function paint() {
    if (!original) return;
    const canvas = $('canvas'),
      c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage($('show').checked && previewImage ? previewImage : original, 0, 0);
    const e = catalog.edge;
    c.fillStyle = '#13242bb0';
    c.fillRect(0, 0, map.width, e);
    c.fillRect(0, map.height - e, map.width, e);
    c.fillRect(0, e, e, map.height - e * 2);
    c.fillRect(map.width - e, e, e, map.height - e * 2);
    if (rect) {
      c.strokeStyle = '#ff2950';
      c.lineWidth = 3;
      c.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
    $('selection').textContent = rect
      ? `Selected: ${rect.width} × ${rect.height} pixels at (${rect.x}, ${rect.y}). Original: ${map.width} × ${map.height}.`
      : 'No selection yet.';
    controls();
  }
  function compare() {
    $('comparison').hidden = !previewImage;
    if (!previewImage || !rect) return;
    const x = Math.max(0, rect.x - 32),
      y = Math.max(0, rect.y - 32);
    const w = Math.min(map.width, rect.x + rect.width + 32) - x;
    const h = Math.min(map.height, rect.y + rect.height + 32) - y;
    for (const [id, image] of [
      ['before', original],
      ['after', previewImage],
    ]) {
      const canvas = $(id);
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(image, x, y, w, h, 0, 0, w, h);
    }
  }
  async function chooseMap(key) {
    map = catalog.maps.find(m => m.key === key);
    if (!map) throw new Error('Map unavailable');
    $('map').value = key;
    original = await loadImage('/' + map.image + '?editor=' + map.revision);
    $('canvas').width = map.width;
    $('canvas').height = map.height;
    rect = null;
    edit = null;
    previewImage = null;
    $('show').checked = false;
    $('exports').hidden = true;
    $('import').value = '';
    $('reviewed').checked = false;
    $('comparison').hidden = true;
    $('report').textContent =
      'The whole map is never resized. Review the replacement before saving; a visible seam is still possible.';
    paint();
  }
  async function displayEdit(record) {
    edit = record;
    rect = { x: edit.rect.left, y: edit.rect.top, width: edit.rect.width, height: edit.rect.height };
    $('prompt').value = edit.prompt;
    $('exports').hidden = false;
    $('instructions').value = edit.instructions;
    $('context').href = fileURL('context.png');
    $('reference').href = fileURL('selection.png');
    $('reviewed').checked = false;
    original = await loadImage(fileURL('before.png'));
    if (edit.candidate) {
      previewImage = await loadImage(fileURL('preview.png') + '&v=' + edit.candidate);
      $('show').checked = true;
      $('report').textContent =
        `${edit.report.outside} pixels changed outside. Original map: ${edit.width} × ${edit.height}, lossless. ${edit.report.edgeMatched ? 'Boundary lighting matched.' : 'Old hard-paste preview: import and rebuild it before saving.'}${edit.report.fitted ? ' Only the returned crop was reduced to the original crop size.' : ''} ${(edit.report.warnings || []).join(' ')}`;
    } else {
      previewImage = null;
      $('show').checked = false;
      $('report').textContent = 'Review the replacement before saving; a visible seam is still possible.';
    }
    localStorage.setItem('wargamon-map-art-session', edit.id);
    compare();
    paint();
  }
  async function connect(resume = false) {
    if (!['localhost', '127.0.0.1'].includes(location.hostname))
      throw new Error('Open this editor with the local development server (npm run dev).');
    const response = await fetch('/__editor/art', { cache: 'no-store' });
    if (!response.ok)
      throw new Error('Start the local editor server with npm run dev, then reload this page.');
    catalog = await response.json();
    $('map').replaceChildren(...catalog.maps.map(m => new Option(m.name, m.key)));
    $('sessions').replaceChildren(
      new Option('Choose an edit…', ''),
      ...catalog.edits.map(
        e =>
          new Option(
            `${catalog.maps.find(m => m.key === e.key)?.name}: ${e.prompt}${e.saved ? ' (saved)' : ''}`,
            e.id,
          ),
      ),
    );
    await chooseMap(new URLSearchParams(location.search).get('map') || map?.key || '0');
    const previous =
      resume &&
      (new URLSearchParams(location.search).get('edit') || localStorage.getItem('wargamon-map-art-session'));
    if (previous && catalog.edits.some(e => e.id === previous)) await resumeEdit(previous);
    else status('Ready. Select an area, then describe the change.');
  }
  async function resumeEdit(id) {
    const record = await request({ action: 'resume', id });
    await chooseMap(record.key);
    await displayEdit(record);
    $('sessions').value = id;
    status(
      record.saved
        ? 'This edit is saved. Undo is available if the map has not changed since.'
        : 'Edit restored. Import the image returned by ChatGPT to continue.',
    );
  }
  const point = event => {
    const box = $('canvas').getBoundingClientRect(),
      e = catalog.edge;
    return {
      x: Math.max(
        e,
        Math.min(map.width - e, Math.round(((event.clientX - box.left) / box.width) * map.width)),
      ),
      y: Math.max(
        e,
        Math.min(map.height - e, Math.round(((event.clientY - box.top) / box.height) * map.height)),
      ),
    };
  };
  $('canvas').addEventListener('pointerdown', event => {
    if (busy || !original || edit?.saved || event.button !== 0) return;
    drag = point(event);
    rect = null;
    edit = null;
    previewImage = null;
    $('show').checked = false;
    $('exports').hidden = true;
    $('import').value = '';
    $('sessions').value = '';
    $('reviewed').checked = false;
    $('comparison').hidden = true;
    localStorage.removeItem('wargamon-map-art-session');
    $('canvas').setPointerCapture(event.pointerId);
    paint();
  });
  $('canvas').addEventListener('pointermove', event => {
    if (!drag) return;
    const p = point(event);
    rect = {
      x: Math.min(drag.x, p.x),
      y: Math.min(drag.y, p.y),
      width: Math.abs(p.x - drag.x),
      height: Math.abs(p.y - drag.y),
    };
    paint();
  });
  function endSelection() {
    if (!drag) return;
    drag = null;
    if (!rect || rect.width < 32 || rect.height < 32) {
      rect = null;
      status('Select a box of at least 32 × 32 pixels.', true);
    } else status('Selection ready. Include enough room for the object and its shadow.');
    paint();
  }
  $('canvas').addEventListener('pointerup', endSelection);
  $('canvas').addEventListener('pointercancel', endSelection);
  $('map').addEventListener('change', () =>
    task(async () => {
      await chooseMap($('map').value);
      status('Ready. Drag to select an area.');
    }),
  );
  $('sessions').addEventListener('change', () => {
    if ($('sessions').value) task(() => resumeEdit($('sessions').value));
  });
  $('reload').addEventListener('click', () => task(() => connect(false)));
  $('show').addEventListener('change', paint);
  $('reviewed').addEventListener('change', controls);
  $('prepare').addEventListener('click', () =>
    task(async () => {
      status('Preparing the original crop and protected selection…');
      const record = await request({
        action: 'prepare',
        key: map.key,
        revision: map.revision,
        rect,
        prompt: $('prompt').value,
        padding: Number($('padding').value),
      });
      await displayEdit(record);
      $('sessions').add(new Option(`${map.name}: ${edit.prompt.slice(0, 80)}`, edit.id));
      $('sessions').value = edit.id;
      status(
        'Prepared. Upload both images to ChatGPT and paste the instructions. The original map is unchanged.',
      );
    }),
  );
  $('copy').addEventListener('click', () =>
    task(async () => {
      try {
        await navigator.clipboard.writeText(edit.instructions);
        status('Instructions copied.');
      } catch {
        $('instructions').focus();
        $('instructions').select();
        status('Select and copy the instructions shown above.');
      }
    }),
  );
  $('import').addEventListener('change', () => {
    // A newly selected result must never save an older preview by mistake.
    if (edit) edit.candidate = null;
    previewImage = null;
    $('show').checked = false;
    $('reviewed').checked = false;
    compare();
    paint();
  });
  $('preview').addEventListener('click', () =>
    task(async () => {
      const file = $('import').files[0];
      if (!file) return;
      if (file.size > 24_000_000) throw new Error('Choose an image smaller than 24 MB.');
      status('Matching the patch edges and checking every outside pixel…');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await displayEdit(await request({ action: 'preview', id: edit.id, image: data }));
      status(
        'Pixel protection passed. Check the Before/After close-up; visual matching still needs your review.',
      );
      $('comparison').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  $('save').addEventListener('click', () =>
    task(async () => {
      status('Saving the verified preview and keeping undo backups…');
      await displayEdit(
        await request({
          action: 'save',
          id: edit.id,
          candidate: edit.candidate,
          reviewed: $('reviewed').checked,
        }),
      );
      status(
        'Saved permanently. Click Reload maps for another selection; reload the game to see the artwork.',
      );
    }),
  );
  $('undo').addEventListener('click', () =>
    task(async () => {
      await request({ action: 'undo', id: edit.id });
      localStorage.removeItem('wargamon-map-art-session');
      await connect(false);
      status('Permanent edit undone. Original map restored.');
    }),
  );
  task(() => connect(true));
})();
