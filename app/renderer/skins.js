'use strict';
/* Редактор скинов: холст 64x64, 3D-предпросмотр, импорт по нику, загрузка в аккаунт, библиотека. */
(function () {
  const SK = {
    skin: null, ctx: null, view: null, vctx: null, tool: 'pencil', color: '#3b82d6', size: 1, slim: false,
    overlay: true, grid: true, undo: [], redo: [], yaw: -0.55, pitch: 0.22, drag: null, auto: true,
    name: 'Мой скин', recent: [], lib: [], inited: false, raf: 0, status: '',
  };
  const SWATCH = ['#000000', '#3a3a3a', '#7f7f7f', '#c9c9c9', '#ffffff', '#7a4a2a', '#4a2f1b', '#e0ac86', '#f2c9a5', '#b3462f', '#ff5470', '#ff9b3d', '#ffd23c', '#f5e39a', '#4cd964', '#2f8f3a', '#1d5a3a', '#3fb2ff', '#3b82d6', '#2a3a8f', '#7b5cff', '#c07aff', '#ff7ac6', '#8a1f6f'];

  const box = (u, v, w, h, d) => ({
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h],
  });
  const parts = (slim) => {
    const aw = slim ? 3 : 4;
    return [
      { n: 'Голова', u: 0, v: 0, w: 8, h: 8, d: 8, b: [-4, 4, 24, 32, -4, 4] },
      { n: 'Тело', u: 16, v: 16, w: 8, h: 12, d: 4, b: [-4, 4, 12, 24, -2, 2] },
      { n: 'Правая рука', u: 40, v: 16, w: aw, h: 12, d: 4, b: [-4 - aw, -4, 12, 24, -2, 2] },
      { n: 'Левая рука', u: 32, v: 48, w: aw, h: 12, d: 4, b: [4, 4 + aw, 12, 24, -2, 2] },
      { n: 'Правая нога', u: 0, v: 16, w: 4, h: 12, d: 4, b: [-4, 0, 0, 12, -2, 2] },
      { n: 'Левая нога', u: 16, v: 48, w: 4, h: 12, d: 4, b: [0, 4, 0, 12, -2, 2] },
      { n: 'Голова (внешний слой)', u: 32, v: 0, w: 8, h: 8, d: 8, b: [-4, 4, 24, 32, -4, 4], o: true },
      { n: 'Тело (внешний слой)', u: 16, v: 32, w: 8, h: 12, d: 4, b: [-4, 4, 12, 24, -2, 2], o: true },
      { n: 'Правая рука (внешний слой)', u: 40, v: 32, w: aw, h: 12, d: 4, b: [-4 - aw, -4, 12, 24, -2, 2], o: true },
      { n: 'Левая рука (внешний слой)', u: 48, v: 48, w: aw, h: 12, d: 4, b: [4, 4 + aw, 12, 24, -2, 2], o: true },
      { n: 'Правая нога (внешний слой)', u: 0, v: 32, w: 4, h: 12, d: 4, b: [-4, 0, 0, 12, -2, 2], o: true },
      { n: 'Левая нога (внешний слой)', u: 0, v: 48, w: 4, h: 12, d: 4, b: [0, 4, 0, 12, -2, 2], o: true },
    ];
  };
  const FACE_RU = { top: 'верх', bottom: 'низ', right: 'правая сторона', front: 'перед', left: 'левая сторона', back: 'спина' };
  function labelAt(x, y) {
    const ps = parts(SK.slim).slice().sort((a, b) => (b.o ? 1 : 0) - (a.o ? 1 : 0));
    for (const p of ps) {
      const f = box(p.u, p.v, p.w, p.h, p.d);
      for (const k in f) { const r = f[k]; if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return p.n + ' · ' + FACE_RU[k]; }
    }
    return '';
  }
  const OVERLAY_RECTS = [[32, 0, 32, 16], [16, 32, 24, 16], [40, 32, 16, 16], [48, 48, 16, 16], [0, 32, 16, 16], [0, 48, 16, 16]];

  /* ---------- шаблоны ---------- */
  function paintBox(c, u, v, w, h, d, col) {
    const f = box(u, v, w, h, d);
    for (const k in f) { c.fillStyle = typeof col === 'string' ? col : (col[k] || col.all); c.fillRect(...f[k]); }
  }
  function rowsOf(c, u, v, w, h, d, from, to, col) {
    const f = box(u, v, w, h, d);
    ['right', 'front', 'left', 'back'].forEach((k) => { const r = f[k]; c.fillStyle = col; c.fillRect(r[0], r[1] + from, r[2], to - from); });
  }
  function template(kind) {
    const c = SK.ctx;
    c.clearRect(0, 0, 64, 64);
    if (kind === 'blank') return;
    const skin = '#e0ac86', hair = '#4a2f1b', shirt = '#3b82d6', pants = '#323a8f', shoe = '#2b2b2b';
    paintBox(c, 0, 0, 8, 8, 8, skin);
    c.fillStyle = hair; const h = box(0, 0, 8, 8, 8);
    c.fillRect(...h.top); c.fillRect(...h.back);
    [h.right, h.left].forEach((r) => c.fillRect(r[0], r[1], r[2], 3));
    c.fillRect(h.front[0], h.front[1], 8, 2); c.fillRect(h.front[0], h.front[1] + 2, 1, 2); c.fillRect(h.front[0] + 7, h.front[1] + 2, 1, 2);
    const fx = h.front[0], fy = h.front[1];
    c.fillStyle = '#fff'; c.fillRect(fx + 1, fy + 4, 2, 1); c.fillRect(fx + 5, fy + 4, 2, 1);
    c.fillStyle = '#3b4cc0'; c.fillRect(fx + 2, fy + 4, 1, 1); c.fillRect(fx + 5, fy + 4, 1, 1);
    c.fillStyle = '#a8573d'; c.fillRect(fx + 3, fy + 6, 2, 1);
    paintBox(c, 16, 16, 8, 12, 4, shirt);
    const aw = SK.slim ? 3 : 4;
    paintBox(c, 40, 16, aw, 12, 4, shirt); rowsOf(c, 40, 16, aw, 12, 4, 4, 12, skin);
    paintBox(c, 32, 48, aw, 12, 4, shirt); rowsOf(c, 32, 48, aw, 12, 4, 4, 12, skin);
    paintBox(c, 0, 16, 4, 12, 4, pants); rowsOf(c, 0, 16, 4, 12, 4, 9, 12, shoe);
    paintBox(c, 16, 48, 4, 12, 4, pants); rowsOf(c, 16, 48, 4, 12, 4, 9, 12, shoe);
    c.fillStyle = '#ffd23c'; const b = box(16, 16, 8, 12, 4).front; c.fillRect(b[0] + 3, b[1] + 3, 2, 2);
  }

  /* ---------- сохранение/состояние ---------- */
  function snapshot() { SK.undo.push(SK.ctx.getImageData(0, 0, 64, 64)); if (SK.undo.length > 40) SK.undo.shift(); SK.redo = []; }
  function undo() { if (!SK.undo.length) return; SK.redo.push(SK.ctx.getImageData(0, 0, 64, 64)); SK.ctx.putImageData(SK.undo.pop(), 0, 0); changed(false); }
  function redo() { if (!SK.redo.length) return; SK.undo.push(SK.ctx.getImageData(0, 0, 64, 64)); SK.ctx.putImageData(SK.redo.pop(), 0, 0); changed(false); }
  function persist() { try { localStorage.setItem('skinCurrent', JSON.stringify({ d: SK.skin.toDataURL(), slim: SK.slim })); } catch {} }
  function changed(save = true) { redraw(); if (save) persist(); }
  function loadLib() { try { SK.lib = JSON.parse(localStorage.getItem('skinLib') || '[]'); } catch { SK.lib = []; } }
  function saveLib() { try { localStorage.setItem('skinLib', JSON.stringify(SK.lib)); } catch { toast('Не хватило места для сохранения', 'err'); } }

  function init() {
    if (SK.inited) return;
    SK.inited = true;
    SK.skin = document.createElement('canvas'); SK.skin.width = SK.skin.height = 64;
    SK.ctx = SK.skin.getContext('2d', { willReadFrequently: true });
    loadLib();
    let restored = false;
    try {
      const j = JSON.parse(localStorage.getItem('skinCurrent') || 'null');
      if (j && j.d) { SK.slim = !!j.slim; const img = new Image(); img.onload = () => { SK.ctx.drawImage(img, 0, 0); redraw(); }; img.src = j.d; restored = true; }
    } catch {}
    if (!restored) template('basic');
    document.addEventListener('keydown', (e) => {
      if (state.page !== 'skins' || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y')) { e.preventDefault(); redo(); }
    });
  }

  /* ---------- 2D-холст ---------- */
  function redraw() {
    if (!SK.view) return;
    const c = SK.vctx;
    c.clearRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { c.fillStyle = (x + y) % 2 ? '#e9e4f7' : '#ffffff'; c.fillRect(x, y, 1, 1); }
    c.drawImage(SK.skin, 0, 0);
    if (!SK.overlay) OVERLAY_RECTS.forEach(([x, y, w, h]) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { c.fillStyle = (i + j) % 2 ? '#e9e4f7' : '#ffffff'; c.fillRect(i, j, 1, 1); } });
  }
  const hexToRgba = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

  function paintAt(x, y) {
    const c = SK.ctx, s = SK.size, o = (s - 1) >> 1;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) {
      const px = x + dx - o, py = y + dy - o;
      if (px < 0 || py < 0 || px > 63 || py > 63) continue;
      if (SK.tool === 'eraser') c.clearRect(px, py, 1, 1);
      else { c.clearRect(px, py, 1, 1); c.fillStyle = SK.color; c.fillRect(px, py, 1, 1); }
    }
  }
  function flood(x, y) {
    const img = SK.ctx.getImageData(0, 0, 64, 64), d = img.data, at = (a, b) => (b * 64 + a) * 4;
    const t = [d[at(x, y)], d[at(x, y) + 1], d[at(x, y) + 2], d[at(x, y) + 3]], f = hexToRgba(SK.color);
    if (t.every((v, i) => v === f[i])) return;
    const same = (i) => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
    const st = [[x, y]];
    while (st.length) {
      const [a, b] = st.pop();
      if (a < 0 || b < 0 || a > 63 || b > 63) continue;
      const i = at(a, b);
      if (!same(i)) continue;
      d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2]; d[i + 3] = 255;
      st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    SK.ctx.putImageData(img, 0, 0);
  }
  function pick(x, y) {
    const d = SK.ctx.getImageData(x, y, 1, 1).data;
    if (d[3] === 0) return toast('Здесь прозрачно', 'err');
    setColor(toHex(d[0], d[1], d[2]));
    SK.tool = 'pencil'; syncTools();
  }
  function setColor(h) {
    SK.color = h;
    const i = $('#skColor'); if (i) i.value = h;
    SK.recent = [h, ...SK.recent.filter((x) => x !== h)].slice(0, 8);
    const r = $('#skRecent'); if (r) r.innerHTML = swatches(SK.recent);
  }
  const swatches = (list) => list.map((c) => `<i data-act="skSwatch" data-c="${c}" style="background:${c}" title="${c}"></i>`).join('');
  function syncTools() {
    $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === SK.tool));
    $$('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === SK.size));
    const g = $('.sk-canvas'); if (g) g.classList.toggle('nogrid', !SK.grid);
    $$('[data-model]').forEach((b) => b.classList.toggle('on', (b.dataset.model === 'slim') === SK.slim));
    const ov = $('#skOv'); if (ov) ov.classList.toggle('on', SK.overlay);
    const gr = $('#skGrid'); if (gr) gr.classList.toggle('on', SK.grid);
  }

  /* ---------- 3D-предпросмотр (ортографическая проекция, аффинные грани) ---------- */
  function render3d() {
    const cv = $('#prev');
    if (!cv) { SK.raf = 0; return; }
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    if (SK.auto && !SK.drag) SK.yaw += 0.012;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    const sc = H / 40, cx = W / 2, cy = H / 2 + 2;
    c.fillStyle = 'rgba(43,34,80,.22)'; c.beginPath(); c.ellipse(cx, cy + 16 * sc * Math.cos(SK.pitch) + 6, 7 * sc, 2 * sc, 0, 0, 7); c.fill();
    const cyw = Math.cos(SK.yaw), syw = Math.sin(SK.yaw), cp = Math.cos(SK.pitch), sp = Math.sin(SK.pitch);
    const P = (x, y, z) => {
      y -= 16;
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    };
    const faces = [];
    parts(SK.slim).forEach((p) => {
      if (p.o && !SK.overlay) return;
      let [x0, x1, y0, y1, z0, z1] = p.b;
      if (p.o) { x0 -= 0.5; y0 -= 0.5; z0 -= 0.5; x1 += 0.5; y1 += 0.5; z1 += 0.5; }
      const F = box(p.u, p.v, p.w, p.h, p.d);
      const defs = {
        front: [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1]], back: [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0]],
        right: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0]], left: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1]],
        top: [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1]], bottom: [[x0, y0, z1], [x1, y0, z1], [x0, y0, z0]],
      };
      for (const k in defs) {
        const [a, b, d] = defs[k].map((q) => P(...q));
        const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - a[0], vy = d[1] - a[1];
        if (ux * vy - uy * vx >= 0) continue; // обратная грань
        faces.push({ z: (a[2] + b[2] + d[2]) / 3 + (p.o ? 0.01 : 0), a, b, d, r: F[k] });
      }
    });
    faces.sort((f, g) => f.z - g.z);
    c.imageSmoothingEnabled = false;
    for (const f of faces) {
      const [sx, sy, sw, sh] = f.r;
      const ux = ((f.b[0] - f.a[0]) * sc) / sw, uy = (-(f.b[1] - f.a[1]) * sc) / sw, vx = ((f.d[0] - f.a[0]) * sc) / sh, vy = (-(f.d[1] - f.a[1]) * sc) / sh;
      c.setTransform(ux, uy, vx, vy, cx + f.a[0] * sc, cy - f.a[1] * sc);
      c.drawImage(SK.skin, sx, sy, sw, sh, 0, 0, sw + 0.02, sh + 0.02);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    SK.raf = requestAnimationFrame(render3d);
  }

  /* ---------- готовые скины ---------- */
  const thumbs = {};
  function thumbUrl(sk) {
    if (thumbs[sk.id]) return thumbs[sk.id];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    sk.draw(c.getContext('2d'));
    return (thumbs[sk.id] = window.skinThumb(c, 5).toDataURL());
  }
  function packHtml() {
    let act = ''; try { act = localStorage.getItem('skinActive') || ''; } catch {}
    return window.SKINPACK.map((sk) => `<div class="pk ${act === sk.id ? 'on' : ''}"><img src="${thumbUrl(sk)}" alt=""><b>${esc(sk.name)}</b>
      <button class="btn sm ${act === sk.id ? '' : 'neon'}" data-act="skWear" data-id="${sk.id}">${act === sk.id ? ICON('check') + 'Надет' : 'Надеть'}</button></div>`).join('');
  }

  /* ---------- страница ---------- */
  pages.skins = (v) => {
    init();
    cancelAnimationFrame(SK.raf);
    v.innerHTML = `<div class="page">
      <div class="row between wrap"><h1>Редактор скинов</h1>
        <div class="row wrap">
          <button class="btn" data-act="skImport">Открыть PNG</button>
          <button class="btn" data-act="skExport">Скачать PNG</button>
          <button class="btn neon" data-act="skApply">Применить к аккаунту</button>
        </div></div>
      <div class="glass pad drop" id="skDrop"><div class="drop-ic">${ICON('pen', 'xl')}</div>
        <div class="drop-t"><b>Загрузи скин с компьютера</b><span>Перетащи сюда PNG-файл (64×64) или нажми кнопку. Скин сразу станет активным и появится в игре.</span></div>
        <button class="btn neon" data-act="skUpload">Выбрать файл</button></div>
      <div class="glass pad pack"><div class="row between"><h3>Готовые скины — выбери и надень в один клик</h3><span class="muted" style="font-size:12px">Потом можно доработать в редакторе ниже</span></div>
        <div class="pack-row">${packHtml()}</div></div>
      <div class="sk-wrap">
        <div class="glass sk-tools">
          <button class="btn" data-tool="pencil" data-act="skTool" title="Карандаш">${ICON('pen')}</button>
          <button class="btn" data-tool="eraser" data-act="skTool" title="Ластик">${ICON('eraser')}</button>
          <button class="btn" data-tool="fill" data-act="skTool" title="Заливка">${ICON('bucket')}</button>
          <button class="btn" data-tool="picker" data-act="skTool" title="Пипетка">${ICON('drop')}</button>
          <div class="sk-sep"></div>
          <button class="btn" data-size="1" data-act="skSize" title="Кисть 1 px">1</button>
          <button class="btn" data-size="2" data-act="skSize" title="Кисть 2 px">2</button>
          <button class="btn" data-size="3" data-act="skSize" title="Кисть 3 px">3</button>
          <div class="sk-sep"></div>
          <button class="btn" data-act="skUndo" title="Отменить (Ctrl+Z)">${ICON('undo')}</button>
          <button class="btn" data-act="skRedo" title="Вернуть (Ctrl+Y)">${ICON('redo')}</button>
          <button class="btn" id="skOv" data-act="skOverlay" title="Показать внешний слой (шляпа, куртка)">${ICON('shirt')}</button>
          <button class="btn" id="skGrid" data-act="skGrid" title="Сетка">${ICON('grid')}</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="sk-canvas"><canvas id="skEdit" width="64" height="64"></canvas><div class="grid-ov"></div></div>
          <div class="sk-status" id="skStatus">Наведи на холст, чтобы увидеть часть тела</div>
        </div>
        <div class="sk-side">
          <div class="glass pad" style="display:flex;flex-direction:column;gap:10px">
            <canvas id="prev" width="560" height="620"></canvas>
            <div class="row between"><div class="chips"><span class="chip" data-model="classic" data-act="skModel">Классика</span><span class="chip" data-model="slim" data-act="skModel">Тонкие руки</span></div>
              <button class="btn sm" data-act="skSpin">${ICON('spin')}</button></div>
            <div class="muted" style="font-size:12px">Тяни мышкой, чтобы повернуть модель</div>
          </div>
          <div class="glass pad" style="display:flex;flex-direction:column;gap:10px">
            <div class="row"><input type="color" id="skColor" value="${SK.color}"><div class="sw" id="skRecent">${swatches(SK.recent)}</div></div>
            <div class="sw">${swatches(SWATCH)}</div>
          </div>
        </div>
        <div class="glass pad sk-lib" style="display:flex;flex-direction:column;gap:12px">
          <h3>Шаблоны и импорт</h3>
          <div class="row wrap"><button class="btn sm" data-act="skTpl" data-v="basic">Базовый</button><button class="btn sm danger" data-act="skTpl" data-v="blank">Пустой</button></div>
          <div class="row"><input type="text" id="skNick" placeholder="Взять скин по нику (лицензия)" maxlength="16"><button class="btn sm neon" data-act="skNickGo">Найти</button></div>
          <h3>Моя библиотека</h3>
          <div class="row"><input type="text" id="skName" placeholder="Название скина" value="${esc(SK.name)}"><button class="btn sm neon" data-act="skSave">Сохранить</button></div>
          <div class="lib" id="skLib"></div>
        </div>
        <input type="file" id="skFile" accept="image/png" class="hidden">
      </div>
    </div>`;
    SK.view = $('#skEdit'); SK.vctx = SK.view.getContext('2d');
    redraw(); syncTools(); drawLib();
    $('#skColor').addEventListener('input', (e) => { SK.color = e.target.value; });
    $('#skColor').addEventListener('change', (e) => setColor(e.target.value));
    $('#skFile').addEventListener('change', onFile);
    const dz = $('#skDrop');
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) readSkinFile(f, true); });
    const cv = SK.view;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * 64), Math.floor(((e.clientY - r.top) / r.height) * 64)]; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      if (x < 0 || y < 0 || x > 63 || y > 63) return;
      if (SK.tool === 'picker') return pick(x, y);
      snapshot();
      if (SK.tool === 'fill') { flood(x, y); changed(); return; }
      cv.setPointerCapture(e.pointerId); SK.painting = true; paintAt(x, y); redraw();
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      const st = $('#skStatus'); if (st) st.textContent = x >= 0 && y >= 0 && x < 64 && y < 64 ? `x ${x}, y ${y} — ${labelAt(x, y) || 'пустая область'}` : '';
      if (SK.painting) { paintAt(x, y); redraw(); }
    });
    const end = () => { if (SK.painting) { SK.painting = false; changed(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const pv = $('#prev');
    pv.addEventListener('pointerdown', (e) => { pv.setPointerCapture(e.pointerId); SK.drag = { x: e.clientX, y: e.clientY }; });
    pv.addEventListener('pointermove', (e) => {
      if (!SK.drag) return;
      SK.yaw += (e.clientX - SK.drag.x) * 0.012; SK.pitch = Math.max(-1.2, Math.min(1.2, SK.pitch + (e.clientY - SK.drag.y) * 0.01));
      SK.drag = { x: e.clientX, y: e.clientY };
    });
    pv.addEventListener('pointerup', () => { SK.drag = null; });
    render3d();
  };

  function drawLib() {
    const box2 = $('#skLib'); if (!box2) return;
    if (!SK.lib.length) { box2.innerHTML = '<div class="muted" style="grid-column:1/-1">Пока пусто. Сохрани свой первый скин.</div>'; return; }
    box2.innerHTML = SK.lib.map((s) => `<div class="it" data-act="skLoad" data-id="${esc(s.id)}" title="${esc(s.name)}"><canvas width="64" height="64" data-d="${s.id}"></canvas><div>${esc(s.name.slice(0, 10))}</div><u data-act="skDel" data-id="${esc(s.id)}">×</u></div>`).join('');
    $$('#skLib canvas').forEach((cv) => {
      const s = SK.lib.find((x) => x.id === cv.dataset.d); if (!s) return;
      const img = new Image(); img.onload = () => { const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64); }; img.src = s.data;
    });
  }

  function loadImage(src, slim) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w !== 64 || (h !== 64 && h !== 32)) return rej(new Error('Скин должен быть PNG размером 64×64 (или старый 64×32)'));
        snapshot();
        const c = SK.ctx; c.clearRect(0, 0, 64, 64); c.drawImage(img, 0, 0);
        if (h === 32) { // старый формат: левые части = отражённые правые
          const flip = (sx, sy, dx, dy, aw) => {
            const S = box(sx, sy, aw, 12, 4), D = box(dx, dy, aw, 12, 4), map = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };
            for (const k in D) { const [rx, ry, rw, rh] = S[map[k]], [tx, ty] = D[k]; c.save(); c.translate(tx + rw, ty); c.scale(-1, 1); c.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh); c.restore(); }
          };
          flip(0, 16, 16, 48, 4); flip(40, 16, 32, 48, 4);
        }
        if (slim !== undefined) SK.slim = !!slim;
        changed(); syncTools(); res();
      };
      img.onerror = () => rej(new Error('Не удалось открыть изображение'));
      img.src = src;
    });
  }
  // activate=true: скин сразу надевается (в аккаунт Microsoft или в ресурспак для офлайн-аккаунта)
  function readSkinFile(f, activate) {
    if (!/png$/i.test(f.type) && !/\.png$/i.test(f.name)) return toast('Нужен файл PNG', 'err');
    const fr = new FileReader();
    fr.onload = () => loadImage(fr.result).then(async () => {
      const name = f.name.replace(/\.png$/i, '').slice(0, 30) || 'Мой скин';
      SK.name = name; const nm = $('#skName'); if (nm) nm.value = name;
      if (!activate) return toast('Скин загружен');
      SK.lib.unshift({ id: 'k' + Date.now().toString(36), name, slim: SK.slim, data: SK.skin.toDataURL() }); SK.lib = SK.lib.slice(0, 40); saveLib(); drawLib();
      try { localStorage.setItem('skinActive', 'file'); } catch {}
      const row = $('.pack-row'); if (row) row.innerHTML = packHtml();
      try {
        const r = await call('skins:upload', SK.skin.toDataURL('image/png'), SK.slim);
        toast(r === 'LOCAL' ? 'Скин «' + name + '» загружен и надет. Ты увидишь его в игре после следующего запуска.' : 'Скин «' + name + '» загружен и отправлен в твой аккаунт Minecraft!');
      } catch (e) { fail(e); }
    }).catch(fail);
    fr.readAsDataURL(f);
  }
  function onFile(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (f) readSkinFile(f, e.target.dataset.activate === '1');
  }

  /* ---------- действия ---------- */
  Object.assign(actions, {
    skTool: (el) => { SK.tool = el.dataset.tool; syncTools(); },
    skSize: (el) => { SK.size = Number(el.dataset.size); syncTools(); },
    skUndo: undo, skRedo: redo,
    skOverlay: () => { SK.overlay = !SK.overlay; syncTools(); redraw(); },
    skGrid: () => { SK.grid = !SK.grid; syncTools(); },
    skSwatch: (el) => setColor(el.dataset.c),
    skModel: (el) => { SK.slim = el.dataset.model === 'slim'; syncTools(); persist(); },
    skSpin: () => { SK.auto = !SK.auto; toast(SK.auto ? 'Вращение включено' : 'Вращение выключено'); },
    skTpl: (el) => { if (el.dataset.v === 'blank' && !confirm('Очистить весь скин?')) return; snapshot(); template(el.dataset.v); changed(); },
    skWear: async (el) => {
      const sk = window.SKINPACK.find((x) => x.id === el.dataset.id); if (!sk) return;
      snapshot(); SK.slim = false; sk.draw(SK.ctx); changed();
      try { localStorage.setItem('skinActive', sk.id); } catch {}
      const row = $('.pack-row'); if (row) row.innerHTML = packHtml();
      const nm = $('#skName'); if (nm) nm.value = sk.name;
      const acc = typeof curAccount === 'function' ? curAccount() : null;
      if (acc && acc.type === 'microsoft') {
        try { await call('skins:upload', SK.skin.toDataURL('image/png'), false); toast('Скин «' + sk.name + '» надет и отправлен в твой аккаунт Minecraft!'); } catch (e) { fail(e); }
      } else {
        try { await call('skins:setLocal', SK.skin.toDataURL('image/png')); toast('Скин «' + sk.name + '» надет. Увидишь его в игре после следующего запуска. Другие игроки на сервере увидят его только при входе через Microsoft.'); } catch (e) { fail(e); }
      }
    },
    skImport: () => { $('#skFile').dataset.activate = '0'; $('#skFile').click(); },
    skUpload: () => { $('#skFile').dataset.activate = '1'; $('#skFile').click(); },
    skExport: () => {
      SK.skin.toBlob((b) => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (($('#skName') || {}).value || 'skin').replace(/[^\w\-а-яё ]+/gi, '_') + '.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    },
    skNickGo: async (el) => {
      const n = $('#skNick').value.trim();
      if (!n) return toast('Введи ник', 'err');
      el.disabled = true; el.textContent = '…';
      try { const r = await call('skins:fetch', n); await loadImage(r.data, r.slim); $('#skName').value = r.name; toast('Скин игрока ' + r.name + ' загружен'); } catch (e) { fail(e); }
      el.disabled = false; el.textContent = 'Найти';
    },
    skSave: () => {
      const name = ($('#skName').value || 'Мой скин').trim().slice(0, 30); SK.name = name;
      SK.lib.unshift({ id: 'k' + Date.now().toString(36), name, slim: SK.slim, data: SK.skin.toDataURL() });
      SK.lib = SK.lib.slice(0, 40); saveLib(); drawLib(); toast('Сохранено в библиотеку');
    },
    skLoad: (el, ev) => {
      if (ev && ev.target.closest('[data-act=skDel]')) return;
      const s = SK.lib.find((x) => x.id === el.dataset.id); if (s) loadImage(s.data, s.slim).then(() => { $('#skName').value = s.name; }).catch(fail);
    },
    skDel: (el, ev) => {
      if (ev) ev.stopPropagation();
      if (!confirm('Удалить скин из библиотеки?')) return;
      SK.lib = SK.lib.filter((x) => x.id !== el.dataset.id); saveLib(); drawLib();
    },
    skApply: async (el) => {
      el.disabled = true; el.textContent = 'Отправляю…';
      try {
        const r = await call('skins:upload', SK.skin.toDataURL('image/png'), SK.slim);
        toast(r === 'LOCAL' ? 'Скин сохранён. Ты увидишь его в игре после следующего запуска (другим игрокам он виден только при входе через Microsoft).' : 'Скин применён! Он появится в игре и на серверах после перезахода.');
      } catch (e) {
        if (e.message === 'OFFLINE') toast('Офлайн-аккаунт не может сменить скин на серверах Mojang. Войди через Microsoft (вкладка «Аккаунты») или скачай PNG и поставь через плагин скинов на сервере.', 'err');
        else fail(e);
      }
      el.disabled = false; el.textContent = 'Применить к аккаунту';
    },
  });
})();
