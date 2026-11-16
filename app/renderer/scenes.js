'use strict';
/* Сцены из блоков в стиле Minecraft. Текстуры 16x16 генерируются кодом (оригинальные, не из игры). */
(function () {
  const BS = 16;
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  function prng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { const A = hex2(a), B = hex2(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  /* ---------- текстуры ---------- */
  const DIRT = ['#79553a', '#6b4a30', '#8a6243', '#5d3f28'];
  const GRASS = ['#4f8a2f', '#5d9b3a', '#6bb046', '#4a7f2b'];
  const SNOW = ['#f6faff', '#e9f1fa', '#ffffff', '#dfe9f5'];
  const GEN = {
    dirt: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(DIRT)); },
    grass_side: (p, pick, R) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        let c = pick(DIRT);
        if (j < 3 || (j === 3 && R() < 0.6) || (j === 4 && R() < 0.25) || (j === 5 && R() < 0.1)) c = pick(GRASS);
        p(i, j, c);
      }
    },
    snow_side: (p, pick, R) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        let c = pick(DIRT);
        if (j < 3 || (j === 3 && R() < 0.6) || (j === 4 && R() < 0.3)) c = pick(SNOW);
        p(i, j, c);
      }
    },
    snow: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(SNOW)); },
    stone: (p, pick, R) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, R() < 0.08 ? '#5f5f5f' : pick(['#7d7d7d', '#858585', '#8e8e8e', '#767676']));
    },
    sand: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(['#dbcf9a', '#d4c78e', '#e3d8a8', '#cfc184'])); },
    water: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(['#2d5fd4', '#3469e0', '#2a58c8', '#3a72ea'])); },
    lava: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(['#ff7a10', '#ff9a1a', '#e85a00', '#ffb02a', '#ffd23c'])); },
    log: (p, pick) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, i % 4 === 0 ? '#4d381f' : pick(['#6b5230', '#765a34', '#5f4729', '#7a5c36']));
    },
    leaves: (p, pick, R) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, R() < 0.14 ? '#173f10' : pick(['#2e7d22', '#3a8f2b', '#276b1c', '#44a334']));
    },
    planks: (p, pick) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, j % 4 === 3 ? '#7a5a2f' : pick(['#a07a46', '#a98450', '#98733f', '#b08a55']));
    },
    darkplanks: (p, pick) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, j % 4 === 3 ? '#2b1c10' : pick(['#4a3320', '#43301d', '#523927', '#3d2a19']));
    },
    door: (p, pick) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, (i === 0 || i === 15) ? '#2b1c10' : pick(['#5a3d24', '#52371f', '#634329']));
      p(11, 8, '#d9b25a'); p(11, 9, '#d9b25a');
    },
    window: (p) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const edge = i < 2 || i > 13 || j < 2 || j > 13 || i === 7 || i === 8 || j === 7 || j === 8;
        p(i, j, edge ? '#6b4a2e' : (i + j) % 7 === 0 ? '#fff0b8' : '#ffc860');
      }
    },
    netherrack: (p, pick, R) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, R() < 0.07 ? '#a04846' : pick(['#7a2e2e', '#6b2525', '#8c3a37', '#5a1d1d', '#7a2e2e']));
    },
    glowstone: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(['#e6b358', '#f4d273', '#c48a38', '#ffe9a6', '#f0c565'])); },
    grass_top: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(GRASS)); },
    log_top: (p) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const d = Math.max(Math.abs(i - 7.5), Math.abs(j - 7.5));
        p(i, j, d > 6.5 ? '#5f4729' : d > 4.5 ? '#a98450' : d > 2.5 ? '#8a6a3c' : '#a98450');
      }
    },
    cherry: (p, pick, R) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, R() < 0.1 ? '#c75d8f' : pick(['#f4a6c9', '#ee8fb8', '#ffc2dc', '#e57aa8'])); },
    cloud: (p, pick) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) p(i, j, pick(['#ffffff', '#f6f9fd', '#eaf1fa'])); },
  };
  const TEX = {};
  function tex(name) {
    if (TEX[name]) return TEX[name];
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d');
    const R = prng(hash(name));
    const p = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    const pick = (a) => a[(R() * a.length) | 0];
    GEN[name](p, pick, R);
    return (TEX[name] = c);
  }

  /* ---------- темы ---------- */
  const THEMES = {
    home: { sky: ['#2b1a5e', '#7d3f9c', '#ff8f6b', '#ffc987'], stars: 0.6, sun: '#ffe7a8', glow: '#ffb070', sunX: 0.72, sunY: 0.5, fog: '#b86a9c', farBase: 7, farAmp: [2.4, 1.4, 0.7], snowAt: 10, midBase: 5.6, base: 4.4, amp: 0.8, lake: { x: 0.28, w: 0.1, level: 3 }, trees: 5, cloud: '#ffd2bf', cloudA: 0.75 },
    vanilla: { sky: ['#4a97ff', '#78b8ff', '#aedcff', '#dff3ff'], sun: '#fff6c0', glow: '#fff0a0', sunX: 0.8, sunY: 0.22, fog: '#c6e4ff', farBase: 7, farAmp: [2, 1.2, 0.6], snowAt: 8.5, midBase: 5.6, base: 4.6, amp: 0.8, lake: { x: 0.52, w: 0.1, level: 3 }, trees: 5, cloud: '#ffffff', cloudA: 0.92 },
    fps: { sky: ['#2a0707', '#4d0e0e', '#8a2012'], nether: true, fog: '#9a1c10', farBase: 6.5, farAmp: [2, 1.2, 0.6], midBase: 4.8, base: 3.2, amp: 1, lake: { x: 0.55, w: 0.28, level: 3 } },
    visual: { sky: ['#1a1659', '#6e2fa0', '#ff6f91', '#ffb76b', '#ffd9a0'], stars: 0.35, sun: '#fff0c0', glow: '#ffb27a', sunX: 0.56, sunY: 0.5, fog: '#ff9a7a', farBase: 6.5, farAmp: [1, 0.6, 0.3], midBase: 5.2, base: 1.5, island: { x: 0.3, w: 0.12, low: 1.5, high: 5, level: 4 }, trees: 2, reflect: true, cloud: '#ffc3d0', cloudA: 0.75 },
    survival: { sky: ['#050a1f', '#0b1d46', '#173a75'], stars: 1, sun: '#eef3ff', glow: '#9cc3ff', sunX: 0.84, sunY: 0.2, fog: '#27447f', farBase: 7, farAmp: [2, 1.2, 0.6], snowAt: 9.5, midBase: 5, base: 3.4, amp: 0.4, night: 0.36, cabin: { x: 0.38 }, trees: 3, cloud: '#6f95d6', cloudA: 0.5 },
  };

  const cache = {};
  function build(name, cols, rows, seed) {
    const T0 = THEMES[name] || THEMES.home;
    const k = rows / 13;
    const T = {
      ...T0, farBase: T0.farBase * k, farAmp: T0.farAmp.map((v) => v * k), midBase: T0.midBase * k, base: (T0.base || 0) * k, amp: (T0.amp || 0) * k,
      snowAt: T0.snowAt && T0.snowAt * k,
      lake: T0.lake && { ...T0.lake, level: Math.round(T0.lake.level * k) },
      island: T0.island && { ...T0.island, low: T0.island.low * k, high: T0.island.high * k, level: Math.round(T0.island.level * k) },
      trees: Math.round((T0.trees || 0) * cols / 24),
    };
    const R = prng(seed * 131 + hash(name));
    const W = cols * BS, H = rows * BS;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
    const [c, x] = mk();
    const tile = (cx, n, tx, ty) => cx.drawImage(tex(n), Math.round(tx), Math.round(ty));

    // небо
    const bands = Math.ceil(H / 4);
    for (let b = 0; b < bands; b++) {
      const t = Math.min(1, (b * 4) / (H * 0.9)), pos = t * (T.sky.length - 1), i = Math.min(T.sky.length - 2, Math.floor(pos));
      x.fillStyle = mix(T.sky[i], T.sky[i + 1], pos - i);
      x.fillRect(0, b * 4, W, 4);
    }
    if (T.stars) {
      x.fillStyle = '#fff';
      for (let i = 0; i < cols * 3 * T.stars; i++) { x.globalAlpha = 0.5 + R() * 0.5; x.fillRect(Math.floor(R() * W), Math.floor(R() * H * 0.5), 2, 2); }
      x.globalAlpha = 1;
    }
    if (T.sun) {
      const sx = W * T.sunX, sy = H * T.sunY, s = BS * (rows > 20 ? 3 : 2);
      x.fillStyle = T.glow;
      [3, 2, 1].forEach((k) => { x.globalAlpha = 0.1 * (4 - k) * 0.8; const q = s + k * BS * 1.1; x.fillRect(sx - q / 2, sy - q / 2, q, q); });
      x.globalAlpha = 1; x.fillStyle = T.sun; x.fillRect(sx - s / 2, sy - s / 2, s, s);
    }

    // дальние слои
    const layer = (base, amps, fogA, topTile, bodyTile, snowAt) => {
      const [lc, lx] = mk(); const ph = [R() * 6.3, R() * 6.3, R() * 6.3];
      for (let i = 0; i < cols; i++) {
        const h = Math.max(1, Math.round(base + amps[0] * Math.sin(i * 0.28 + ph[0]) + amps[1] * Math.sin(i * 0.7 + ph[1]) + amps[2] * Math.sin(i * 1.3 + ph[2])));
        for (let r = 0; r < h; r++) {
          const top = r === h - 1;
          const n = top ? (snowAt && h >= snowAt ? 'snow' : topTile) : bodyTile;
          tile(lx, n, i * BS, H - (r + 1) * BS);
        }
      }
      lx.globalCompositeOperation = 'source-atop'; lx.globalAlpha = fogA; lx.fillStyle = T.fog; lx.fillRect(0, 0, W, H);
      x.drawImage(lc, 0, 0);
    };
    const nether = !!T.nether;
    layer(T.farBase, T.farAmp, 0.6, nether ? 'netherrack' : 'stone', nether ? 'netherrack' : 'stone', T.snowAt);
    layer(T.midBase, [1.1 * k, 0.7 * k, 0.4 * k], 0.32, nether ? 'netherrack' : 'grass_side', nether ? 'netherrack' : 'stone', null);

    // ближний рельеф
    const hs = [], ph = [R() * 6.3, R() * 6.3];
    for (let i = 0; i < cols; i++) {
      let h = Math.round(T.base + (T.amp || 0) * Math.sin(i * 0.33 + ph[0]) + (T.amp || 0) * 0.5 * Math.sin(i * 0.9 + ph[1]));
      if (T.island) {
        const g = Math.exp(-Math.pow((i - cols * T.island.x) / (cols * T.island.w), 2));
        h = Math.round(T.island.low + g * T.island.high);
      }
      if (T.lake) {
        const d = Math.abs(i - cols * T.lake.x) / (cols * T.lake.w);
        if (d < 1) h = Math.min(h, T.lake.level - 1 - Math.round((1 - d) * 1.5));
      }
      hs.push(Math.max(1, h));
    }
    let cx = -99;
    if (T.cabin) { cx = Math.round(cols * T.cabin.x); const gh = hs[cx + 2]; for (let k = 0; k < 5; k++) hs[cx + k] = gh; }
    const wl = (T.lake && T.lake.level) || (T.island && T.island.level) || 0;
    const liquid = nether ? 'lava' : 'water';
    for (let i = 0; i < cols; i++) {
      const h = hs[i], nearW = wl && h <= wl && !nether;
      for (let r = 0; r < h; r++) {
        const top = r === h - 1;
        let n;
        if (nether) n = 'netherrack';
        else if (nearW && r >= h - 2) n = 'sand';
        else if (top) n = 'grass_side';
        else if (r >= h - 3) n = 'dirt';
        else n = 'stone';
        tile(x, n, i * BS, H - (r + 1) * BS);
      }
      for (let r = h; r < wl; r++) {
        tile(x, liquid, i * BS, H - (r + 1) * BS);
        if (!nether && r === wl - 1) { x.globalAlpha = 0.18; x.fillStyle = '#fff'; x.fillRect(i * BS, H - (r + 1) * BS, BS, BS); x.globalAlpha = 1; }
      }
    }
    if (T.reflect) {
      const sx = W * T.sunX;
      x.fillStyle = T.glow;
      for (let k = 0; k < 4; k++) { x.globalAlpha = 0.34 - k * 0.06; const w = BS * (2.6 - k * 0.5); x.fillRect(sx - w / 2, H - wl * BS + k * 5 + 1, w, 3); }
      x.globalAlpha = 1;
    }

    // потолок и светокамень (Незер)
    if (nether) {
      const p2 = R() * 6;
      for (let i = 0; i < cols; i++) {
        const ch = Math.round((2 + Math.sin(i * 0.5 + p2) * 0.7 + R() * 0.8) * k);
        for (let r = 0; r < ch; r++) tile(x, 'netherrack', i * BS, r * BS);
        if (R() < 0.22) { const n = Math.round((1 + ((R() * 2) | 0)) * k); for (let r = 0; r < n; r++) tile(x, 'glowstone', i * BS, (ch + r) * BS); }
      }
      x.fillStyle = '#ff6a00'; x.globalAlpha = 0.14; x.fillRect(0, H * 0.45, W, H * 0.55); x.globalAlpha = 1;
    }

    // дома и деревья
    if (T.cabin) {
      const gy = H - hs[cx + 2] * BS;
      for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 3; dy++) tile(x, 'planks', (cx + dx) * BS, gy - (dy + 1) * BS);
      for (let dx = -1; dx <= 5; dx++) tile(x, 'darkplanks', (cx + dx) * BS, gy - 4 * BS);
      for (let dx = 0; dx <= 4; dx++) tile(x, 'darkplanks', (cx + dx) * BS, gy - 5 * BS);
      for (let dx = 1; dx <= 3; dx++) tile(x, 'darkplanks', (cx + dx) * BS, gy - 6 * BS);
      tile(x, 'door', (cx + 1) * BS, gy - BS); tile(x, 'door', (cx + 1) * BS, gy - 2 * BS);
    }
    if (T.trees) {
      const th = rows > 10 ? 4 : 3;
      const spots = [];
      for (let t = 0; t < T.trees * 6 && spots.length < T.trees; t++) {
        const i = 1 + ((R() * (cols - 2)) | 0);
        if (hs[i] <= wl + 1 || spots.some((s) => Math.abs(s - i) < 4) || (T.cabin && i >= cx - 2 && i <= cx + 9)) continue;
        spots.push(i);
      }
      spots.forEach((i) => {
        const by = H - hs[i] * BS;
        [{ dy: th - 2, w: 2 }, { dy: th - 1, w: 2 }, { dy: th, w: 1 }, { dy: th + 1, w: 1 }].forEach((row) => {
          for (let dx = -row.w; dx <= row.w; dx++) {
            if (Math.abs(dx) === row.w && (row.dy === th + 1 || (row.w === 2 && R() < 0.4))) continue;
            tile(x, 'leaves', (i + dx) * BS, by - (row.dy + 1) * BS);
          }
        });
        for (let k = 0; k < th; k++) tile(x, 'log', i * BS, by - (k + 1) * BS);
      });
    }

    // ночь и свет
    if (T.night) {
      x.globalAlpha = T.night; x.fillStyle = '#070d2e'; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
      const glow = (gx, gy2, rad, col) => {
        const g = x.createRadialGradient(gx, gy2, 0, gx, gy2, rad);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,170,60,0)');
        x.fillStyle = g; x.fillRect(gx - rad, gy2 - rad, rad * 2, rad * 2);
      };
      const gy = H - hs[cx + 2] * BS;
      glow((cx + 3.5) * BS, gy - 1.5 * BS, BS * 3.2, 'rgba(255,200,90,.45)');
      tile(x, 'window', (cx + 3) * BS, gy - 2 * BS);
      const tx = (cx - 1) * BS, ty = H - hs[Math.max(0, cx - 1)] * BS;
      glow(tx + 8, ty - 12, BS * 3.6, 'rgba(255,190,80,.6)');
      x.fillStyle = '#8a5a2b'; x.fillRect(tx + 7, ty - 11, 2, 11);
      x.fillStyle = '#ffd23c'; x.fillRect(tx + 6, ty - 15, 4, 4);
      x.fillStyle = '#fff6c0'; x.fillRect(tx + 7, ty - 14, 2, 2);
      const fx = (cx + 8) * BS, fy = H - hs[Math.min(cols - 1, cx + 8)] * BS;
      if (cx + 8 < cols) {
        glow(fx + 8, fy - 10, BS * 4.2, 'rgba(255,150,40,.6)');
        x.fillStyle = '#5a3a22'; x.fillRect(fx + 1, fy - 5, 14, 5);
        x.fillStyle = '#7a4e2c'; x.fillRect(fx + 3, fy - 9, 10, 4);
        x.fillStyle = '#ff8a1f'; x.fillRect(fx + 5, fy - 17, 6, 9);
        x.fillStyle = '#ffe066'; x.fillRect(fx + 6, fy - 14, 4, 6);
      }
    }

    // облака отдельным слоем
    const [cc, cxx] = mk();
    if (T.cloud) {
      cxx.globalAlpha = T.cloudA; cxx.fillStyle = T.cloud;
      const n = Math.round(cols / 5) + 1;
      for (let k = 0; k < n; k++) {
        const px = R() * W, py = BS * (0.8 + R() * 2.2), L = BS * (3 + R() * 4);
        cxx.fillRect(px, py, L, BS * 0.7); cxx.fillRect(px + BS * 0.8, py - BS * 0.55, L * 0.55, BS * 0.6);
      }
    }
    return { bg: c.toDataURL('image/png'), cl: cc.toDataURL('image/png') };
  }

  window.mcTex = tex;
  window.mcScene = (name, cols, rows, seed) => {
    const k = [name, cols, rows, seed].join('|');
    return cache[k] || (cache[k] = build(name, cols, rows, seed));
  };
})();
