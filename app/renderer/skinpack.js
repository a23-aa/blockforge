// Готовые скины: рисуются кодом (оригинальные персонажи, без чужих материалов).
(function () {
  const F = (u, v, w, h, d) => ({ top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h] });
  const PARTS = {
    head: [0, 0, 8, 8, 8], body: [16, 16, 8, 12, 4], rarm: [40, 16, 4, 12, 4], larm: [32, 48, 4, 12, 4], rleg: [0, 16, 4, 12, 4], lleg: [16, 48, 4, 12, 4],
  };
  const OVER = { head: [32, 0], body: [16, 32], rarm: [40, 32], larm: [48, 48], rleg: [0, 32], lleg: [0, 48] };

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
    return '#' + [16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('');
  }
  const hs = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 255) / 255; };

  // функция fn(ix, iy, face) возвращает цвет или null
  function paint(c, part, over, fn) {
    const [u, v, w, h, d] = PARTS[part], [ou, ov] = OVER[part];
    const fc = F(over ? ou : u, over ? ov : v, w, h, d);
    for (const face in fc) {
      const [x, y, fw, fh] = fc[face];
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        let col = fn(i, j, face, fw, fh);
        if (!col) continue;
        if (!over) col = shade(col, 0.95 + hs(x + i, y + j) * 0.1);
        c.fillStyle = col; c.fillRect(x + i, y + j, 1, 1);
      }
    }
  }

  const SKIN = ['#f1c8a0', '#e0ac7c', '#c68a5c', '#8d5a3b'];

  function make(cfg) {
    return (c) => {
      const sk = cfg.skin || SKIN[0];
      // голова
      paint(c, 'head', false, (i, j, f) => {
        if (f === 'front') {
          if (cfg.hair && j < (cfg.fringe || 2) && !(cfg.hairStyle === 'bald')) return cfg.hair;
          if (j === 4 && (i === 1 || i === 2 || i === 5 || i === 6)) return i === 1 || i === 5 ? '#ffffff' : (cfg.eyes || '#2a3b8f');
          if (j === 4 && (i === 2 || i === 6) && false) return null;
          if (j === 6 && (i === 3 || i === 4)) return shade(sk, 0.7);
          return sk;
        }
        if (f === 'top' || f === 'back') return cfg.hair && cfg.hairStyle !== 'bald' ? cfg.hair : sk;
        if (cfg.hair && cfg.hairStyle !== 'bald' && (j < 2 || (cfg.hairStyle === 'long' && j < 7))) return cfg.hair;
        return sk;
      });
      // тело
      paint(c, 'body', false, (i, j, f) => cfg.body(i, j, f));
      for (const a of ['rarm', 'larm']) paint(c, a, false, (i, j, f) => (j < (cfg.sleeve === undefined ? 4 : cfg.sleeve) ? (cfg.armTop ? cfg.armTop(i, j, f) : cfg.body(i, j, f)) : cfg.glove && j > 9 ? cfg.glove : sk));
      for (const l of ['rleg', 'lleg']) paint(c, l, false, (i, j, f) => (j >= 10 ? cfg.shoes || '#3b2a20' : cfg.legs(i, j, f)));
      // детали поверх
      if (cfg.extra) cfg.extra(c, paint, sk);
    };
  }

  const solid = (c) => () => c;
  const DEFS = [
    { id: 'knight', name: 'Рыцарь', cfg: { hair: '#5a3a22', body: (i, j) => (j === 6 && i < 8 ? '#6b6f7a' : (i + j) % 7 === 0 ? '#aeb4c0' : '#9aa1ae'), armTop: () => '#8a909c', sleeve: 12, glove: '#6b6f7a', legs: solid('#7e8490'), shoes: '#4a4e57',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'front' ? (j === 4 ? null : j === 3 ? '#4a4e57' : '#b7bcc7') : '#b7bcc7')); p(c, 'head', true, (i, j, f) => (f === 'top' && i > 2 && i < 5 ? '#d83b3b' : null)); } } },
    { id: 'ninja', name: 'Ниндзя', cfg: { hair: '#1d1d24', body: (i, j) => (j === 6 ? '#b3202a' : '#22232b'), legs: solid('#22232b'), shoes: '#111116', glove: '#22232b', sleeve: 12, armTop: () => '#22232b',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'front' ? (j >= 3 && j <= 4 ? null : '#22232b') : '#22232b')); p(c, 'head', true, (i, j, f) => (j === 2 && f !== 'bottom' ? '#c8212b' : null)); } } },
    { id: 'astro', name: 'Космонавт', cfg: { hair: '#2b2b2b', body: (i, j) => (j === 5 && i > 1 && i < 6 ? '#3aa0ff' : j === 7 && i > 2 && i < 5 ? '#ff6a3a' : '#f2f4f8'), legs: solid('#e6e9f0'), shoes: '#9aa2b3', glove: '#9aa2b3', sleeve: 12, armTop: () => '#f2f4f8',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'front' ? (j >= 1 && j <= 6 && i >= 1 && i <= 6 ? 'rgba(255,190,60,0.92)' : '#f2f4f8') : '#f2f4f8')); } } },
    { id: 'pirate', name: 'Пират', cfg: { hair: '#2b1b12', skin: SKIN[1], body: (i, j) => (j % 2 === 0 ? '#f4f0e6' : '#2a4a9a'), legs: solid('#3a2a20'), shoes: '#1a1210', glove: undefined, sleeve: 5, armTop: (i, j) => (j % 2 === 0 ? '#f4f0e6' : '#2a4a9a'),
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'top' || (j < 2 && f !== 'bottom') ? '#c8212b' : f === 'front' && j === 4 && i === 2 ? '#111' : null)); p(c, 'body', true, (i, j, f) => (j === 6 && f !== 'top' && f !== 'bottom' ? '#5a3a1a' : null)); } } },
    { id: 'wizard', name: 'Волшебник', cfg: { hair: '#d9d9e6', body: (i, j) => (j === 6 ? '#ffd23c' : '#5b3fb8'), legs: solid('#4a3399'), shoes: '#2a1a5a', sleeve: 12, armTop: () => '#5b3fb8', glove: '#5b3fb8',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'top' || (j < 2 && f !== 'bottom') ? '#5b3fb8' : f === 'front' && j >= 6 && i >= 1 && i <= 6 ? '#e8e8f2' : null)); p(c, 'head', true, (i, j, f) => (j === 1 && f !== 'top' && f !== 'bottom' ? '#ffd23c' : null)); p(c, 'body', true, (i, j, f) => (j > 7 && f !== 'top' && f !== 'bottom' ? '#4a3399' : null)); } } },
    { id: 'chef', name: 'Повар', cfg: { hair: '#4a2f1d', body: (i, j) => (i === 3 || i === 4 ? (j % 3 === 1 ? '#c9ccd6' : '#ffffff') : '#ffffff'), legs: (i, j) => ((i + j) % 4 === 0 ? '#2b2b33' : '#4a4a55'), shoes: '#222', sleeve: 12, armTop: () => '#ffffff', glove: '#ffffff',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'top' || (j < 3 && f !== 'bottom') ? '#ffffff' : null)); } } },
    { id: 'farmer', name: 'Фермер', cfg: { hair: '#c9902b', skin: SKIN[0], body: (i, j) => (j > 3 && i > 0 && i < 7 ? '#3d6fb5' : '#c0392b'), legs: solid('#3d6fb5'), shoes: '#5a3a20', sleeve: 5, armTop: () => '#c0392b',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'top' ? '#d9b04a' : j < 2 && f !== 'bottom' ? (f === 'front' && j === 1 ? '#8a5a1a' : '#d9b04a') : null)); p(c, 'body', true, (i, j, f) => (f === 'front' && j === 6 && (i === 2 || i === 5) ? '#ffd23c' : null)); } } },
    { id: 'robot', name: 'Робот', cfg: { hair: undefined, hairStyle: 'bald', skin: '#9aa6b8', eyes: '#ff3030', body: (i, j) => (j === 3 && i > 1 && i < 6 ? '#ff3030' : (i === 0 || i === 7 || j === 11) ? '#5a6577' : '#7b889c'), legs: solid('#69758a'), shoes: '#3a4252', sleeve: 12, armTop: () => '#7b889c', glove: '#4a5568',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'top' && (i === 3 || i === 4) && (j === 3 || j === 4) ? '#ff3030' : f === 'front' && j === 4 ? null : null)); p(c, 'head', false, (i, j, f) => (f === 'front' && j === 4 ? (i >= 1 && i <= 6 ? '#ff3030' : '#9aa6b8') : f === 'front' && j === 6 ? '#3a4252' : '#9aa6b8')); } } },
    { id: 'elf', name: 'Лесной эльф', cfg: { hair: '#e7d27a', hairStyle: 'long', skin: SKIN[0], eyes: '#2aa84a', body: (i, j) => (j === 6 ? '#8a5a2b' : (i + j) % 5 === 0 ? '#2f7d3a' : '#3a9a48'), legs: solid('#6b4a2b'), shoes: '#4a3220', sleeve: 5, armTop: () => '#3a9a48',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (j === 0 && f !== 'bottom' ? '#2f7d3a' : null)); } } },
    { id: 'hacker', name: 'Хакер', cfg: { hair: '#1b1b22', body: (i, j) => (i === 3 && j < 3 ? '#00e676' : '#2b2b36'), legs: solid('#17171f'), shoes: '#e8e8e8', sleeve: 12, armTop: () => '#2b2b36', glove: '#2b2b36',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'front' ? (j <= 1 || (j >= 2 && (i === 0 || i === 7)) ? '#2b2b36' : null) : f === 'bottom' ? null : '#2b2b36')); p(c, 'head', false, (i, j, f) => (f === 'front' && j === 4 && (i === 2 || i === 6) ? '#00e676' : null)); } } },
    { id: 'cat', name: 'Котик', cfg: { hair: '#e8892b', hairStyle: 'short', skin: '#f4a54a', eyes: '#3a8a3a', body: (i, j) => (j > 5 && i % 2 === 0 ? '#f7d08a' : (j % 3 === 0 ? '#c9701c' : '#f4a54a')), legs: solid('#e8892b'), shoes: '#f7d08a', sleeve: 12, armTop: () => '#f4a54a', glove: '#f7d08a',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => (f === 'top' && (i === 0 || i === 7) && j < 2 ? '#e8892b' : f === 'front' && j === 0 && (i === 0 || i === 7) ? '#e8892b' : f === 'front' && j === 6 && (i === 0 || i === 1 || i === 6 || i === 7) ? '#ffffff' : null)); } } },
    { id: 'king', name: 'Король', cfg: { hair: '#6b4a2b', body: (i, j) => (j < 2 ? '#f4f0e6' : (i + j) % 6 === 0 ? '#ffd23c' : '#b3202a'), legs: solid('#2a2a55'), shoes: '#ffd23c', sleeve: 12, armTop: () => '#b3202a', glove: '#f1c8a0',
      extra: (c, p) => { p(c, 'head', true, (i, j, f) => ((f === 'top' || (j === 0 && f !== 'bottom')) ? '#ffd23c' : j === 1 && f !== 'top' && f !== 'bottom' && i % 2 === 0 ? '#ffd23c' : f === 'front' && j >= 6 && i >= 1 && i <= 6 ? '#6b4a2b' : null)); } } },
  ];

  window.SKINPACK = DEFS.map((d) => ({
    id: d.id, name: d.name,
    draw(ctx) { ctx.clearRect(0, 0, 64, 64); make(d.cfg)(ctx); },
  }));

  // Маленькая картинка спереди для карточки
  window.skinThumb = function (srcCanvas, scale) {
    const s = scale || 4, c = document.createElement('canvas');
    c.width = 16 * s; c.height = 32 * s;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const blit = (sx, sy, w, h, dx, dy) => x.drawImage(srcCanvas, sx, sy, w, h, dx * s, dy * s, w * s, h * s);
    blit(44, 20, 4, 12, 0, 8); blit(36, 52, 4, 12, 12, 8); blit(4, 20, 4, 12, 4, 20); blit(20, 52, 4, 12, 8, 20); blit(20, 20, 8, 12, 4, 8); blit(8, 8, 8, 8, 4, 0);
    blit(44, 36, 4, 12, 0, 8); blit(52, 52, 4, 12, 12, 8); blit(4, 36, 4, 12, 4, 20); blit(4, 52, 4, 12, 8, 20); blit(20, 36, 8, 12, 4, 8); blit(40, 8, 8, 8, 4, 0);
    return c;
  };
})();
