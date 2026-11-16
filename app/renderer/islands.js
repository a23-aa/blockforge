'use strict';
/* Парящие острова из блоков (изометрия) в мультяшном стиле с обводкой. Всё рисуется кодом. */
(function () {
  const INK = '#2b2250';
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

  const KIND = {
    grass: ['grass_top', 'grass_side'], dirt: ['dirt'], stone: ['stone'], sand: ['sand'], water: ['water'], lava: ['lava'],
    netherrack: ['netherrack'], glowstone: ['glowstone'], log: ['log_top', 'log'], leaves: ['leaves'], cherry: ['cherry'],
    planks: ['planks'], dark: ['darkplanks'], window: ['planks', 'window'], door: ['planks', 'door'],
  };
  const ALPHA = { water: 0.9 };
  const tex = (n) => window.mcTex(n);

  function cube(ctx, kind, cx, cy, e, o) {
    const k = e / 16, K = KIND[kind] || KIND.stone, top = tex(K[0]), side = tex(K[1] || K[0]);
    ctx.globalAlpha = ALPHA[kind] || 1;
    const x = 0.6; // небольшой нахлёст, чтобы не было щелей между гранями
    if (o.top) { ctx.setTransform(k, k / 2, -k, k / 2, cx, cy - x); ctx.drawImage(top, 0, 0, 16, 16, -x / k, 0, 16 + x / k, 16 + x / k); }
    if (o.left) { ctx.setTransform(k, k / 2, 0, k, cx - e, cy + e / 2); ctx.drawImage(side, 0, 0); ctx.fillStyle = 'rgba(30,20,70,.2)'; ctx.fillRect(0, 0, 16, 16); }
    if (o.right) { ctx.setTransform(k, -k / 2, 0, k, cx, cy + e); ctx.drawImage(side, 0, 0); ctx.fillStyle = 'rgba(30,20,70,.4)'; ctx.fillRect(0, 0, 16, 16); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  }

  function genIsland(R, r, K) {
    const B = new Map(), key = (x, y, z) => x + ',' + y + ',' + z, top = {}, cols = [];
    const has = (x, y, z) => B.has(key(x, y, z)), set = (x, y, z, k) => B.set(key(x, y, z), k);
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const d = Math.hypot(x / (r + 0.4), z / (r * 0.92 + 0.4)) + (R() - 0.5) * 0.3;
      if (d > 1) continue;
      const depth = Math.max(1, Math.round((1 - d) * r * 1.3));
      for (let y = 0; y > -depth; y--) set(x, y, z, y === 0 ? K.top : y >= -2 ? K.sub : K.deep);
      if (depth > 2 && R() < 0.3) B.delete(key(x, -depth + 1, z));
      cols.push({ x, z, d }); top[x + ',' + z] = 0;
    }
    cols.forEach((c) => { if (c.d < 0.55 && R() < 0.22) { set(c.x, 0, c.z, K.sub); set(c.x, 1, c.z, K.top); top[c.x + ',' + c.z] = 1; } });
    return { B, key, has, set, top, cols, r };
  }

  function addTrees(I, R, K, n, avoid) {
    const spots = [], cand = I.cols.filter((c) => c.d < 0.72).sort(() => R() - 0.5);
    for (const c of cand) {
      if (spots.length >= n) break;
      const s = I.top[c.x + ',' + c.z];
      if (I.B.get(I.key(c.x, s, c.z)) !== K.top) continue;
      if (spots.some((q) => Math.abs(q.x - c.x) + Math.abs(q.z - c.z) < 4) || (avoid && avoid(c))) continue;
      spots.push(c);
      const h = 3 + (R() < 0.5 ? 1 : 0);
      for (let k = 1; k <= h; k++) I.set(c.x, s + k, c.z, 'log');
      [[h - 1, 2], [h, 2], [h + 1, 1], [h + 2, 0]].forEach(([dy, rad]) => {
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          const corner = Math.abs(dx) === rad && Math.abs(dz) === rad && rad > 0;
          if (corner && R() < (rad === 2 ? 0.55 : 0.4)) continue;
          if (dx === 0 && dz === 0 && dy <= h) continue;
          const x = c.x + dx, y = s + dy, z = c.z + dz;
          if (!I.has(x, y, z)) I.set(x, y, z, K.leaf);
        }
      });
    }
    return spots;
  }

  function addCabin(I) {
    const ok = (c) => { for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) { if (I.top[(c.x + dx) + ',' + (c.z + dz)] !== 0 || !I.has(c.x + dx, 0, c.z + dz)) return false; } return true; };
    const c = I.cols.filter(ok).sort((a, b) => a.d - b.d)[0];
    if (!c) return null;
    const x0 = c.x, z0 = c.z;
    for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) { I.set(x0 + dx, 1, z0 + dz, 'planks'); I.set(x0 + dx, 2, z0 + dz, 'planks'); I.set(x0 + dx, 3, z0 + dz, 'dark'); }
    I.set(x0 + 1, 1, z0 + 2, 'window'); I.set(x0 + 2, 1, z0 + 1, 'door'); I.set(x0 + 2, 2, z0 + 1, 'door');
    I.set(x0 + 1, 4, z0 + 1, 'dark');
    return { x0, z0 };
  }

  function addPond(I, R, kind, avoid) {
    const cand = I.cols.filter((c) => c.d < 0.5 && I.top[c.x + ',' + c.z] === 0 && !I.has(c.x, 1, c.z) && !(avoid && avoid(c)));
    if (!cand.length) return;
    const c = cand[(R() * cand.length) | 0];
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => { const x = c.x + a, z = c.z + b; if (I.has(x, 0, z) && !I.has(x, 1, z) && !(avoid && avoid({ x, z }))) I.set(x, 0, z, kind); });
  }

  function addFall(I, kind) {
    let xe = -99;
    for (const c of I.cols) if (c.z === 0 && c.x > xe) xe = c.x;
    if (xe < -90) return;
    I.set(xe, 0, 0, kind);
    for (let y = 0; y >= -9; y--) if (!I.has(xe + 1, y, 0)) I.set(xe + 1, y, 0, kind);
  }

  function render(ctx, I, ox, oy, e) {
    const list = [];
    I.B.forEach((kind, k) => { const [x, y, z] = k.split(',').map(Number); list.push([x, y, z, kind]); });
    list.sort((a, b) => (a[0] + a[2]) - (b[0] + b[2]) || a[1] - b[1]);
    for (const [x, y, z, kind] of list) {
      cube(ctx, kind, ox + (x - z) * e, oy + (x + z) * e / 2 - y * e, e, { top: !I.has(x, y + 1, z), left: !I.has(x, y, z + 1), right: !I.has(x + 1, y, z) });
    }
    return (x, y, z) => [ox + (x - z) * e, oy + (x + z) * e / 2 - y * e + e / 2]; // центр верхней грани
  }

  function outline(src, W, H, t, color) {
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const sil = mk(), s = sil.getContext('2d');
    s.drawImage(src, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = color; s.fillRect(0, 0, W, H);
    const out = mk(), o = out.getContext('2d');
    for (let a = 0; a < 16; a++) { const g = (a / 16) * Math.PI * 2; o.drawImage(sil, Math.cos(g) * t, Math.sin(g) * t); }
    o.drawImage(src, 0, 0);
    return out;
  }

  const SC = {
    home: { sky: ['#2fa8ff', '#6cc8ff', '#bff0ff'], sun: '#ffe14a', sunX: 0.9, sunY: 0.2, fog: '#9fdcff', K: { top: 'grass', sub: 'dirt', deep: 'stone', leaf: 'leaves' }, trees: 3, pond: 'water', fall: 'water' },
    vanilla: { sky: ['#2fa8ff', '#6cc8ff', '#bff0ff'], sun: '#ffe14a', sunX: 0.82, sunY: 0.2, fog: '#9fdcff', K: { top: 'grass', sub: 'dirt', deep: 'stone', leaf: 'leaves' }, trees: 2, pond: 'water', fall: 'water' },
    fps: { sky: ['#5c0d0d', '#c8321a', '#ff9a2e'], stars: 0, fog: '#d8561e', K: { top: 'netherrack', sub: 'netherrack', deep: 'netherrack' }, trees: 0, pond: 'lava', fall: 'lava', glow: 3, nether: true, cloud: '#ffb070' },
    visual: { sky: ['#5b2fc4', '#ff5fa8', '#ffc36b'], stars: 0.4, sun: '#fff1a8', sunX: 0.5, sunY: 0.62, fog: '#ff9ac0', K: { top: 'grass', sub: 'dirt', deep: 'stone', leaf: 'cherry' }, trees: 2, pond: 'water', fall: 'water', cloud: '#ffd0e4' },
    survival: { sky: ['#14124f', '#2b3fa6', '#5a78d8'], stars: 1, moon: true, sunX: 0.84, sunY: 0.2, fog: '#4a62c0', K: { top: 'grass', sub: 'dirt', deep: 'stone', leaf: 'leaves' }, trees: 1, cabin: true, night: 0.34, cloud: '#9db4ee' },
  };
  const LAYOUT = {
    card: { W: 450, H: 240, main: { fx: 0.5, fy: 0.47, r: 4, e: 13 }, extra: [{ fx: 0.13, fy: 0.74, r: 1, e: 8 }, { fx: 0.9, fy: 0.2, r: 1, e: 7 }], dist: 2, clouds: 2, line: 2.6 },
    banner: { W: 960, H: 520, main: { fx: 0.76, fy: 0.47, r: 5, e: 24 }, extra: [{ fx: 0.43, fy: 0.76, r: 2, e: 13 }, { fx: 0.95, fy: 0.15, r: 2, e: 10 }, { fx: 0.56, fy: 0.14, r: 1, e: 8 }], dist: 3, clouds: 4, line: 4 },
  };

  function sparkle(x, c, px, py, s) {
    x.fillStyle = c; x.beginPath();
    x.moveTo(px, py - s); x.lineTo(px + s * 0.28, py - s * 0.28); x.lineTo(px + s, py); x.lineTo(px + s * 0.28, py + s * 0.28);
    x.lineTo(px, py + s); x.lineTo(px - s * 0.28, py + s * 0.28); x.lineTo(px - s, py); x.lineTo(px - s * 0.28, py - s * 0.28); x.closePath(); x.fill();
  }

  function build(name, big, seed) {
    const T = SC[name] || SC.home, L = big ? LAYOUT.banner : LAYOUT.card, W = L.W, H = L.H;
    const R = prng(seed * 131 + hash(name));
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; return [c, x]; };

    // небо
    const [bg, bx] = mk();
    for (let b = 0; b < Math.ceil(H / 3); b++) {
      const t = Math.min(1, (b * 3) / (H * 0.95)), pos = t * (T.sky.length - 1), i = Math.min(T.sky.length - 2, Math.floor(pos));
      bx.fillStyle = mix(T.sky[i], T.sky[i + 1], pos - i); bx.fillRect(0, b * 3, W, 3);
    }
    if (T.stars) for (let i = 0; i < (big ? 46 : 20) * T.stars; i++) sparkle(bx, 'rgba(255,255,255,.9)', R() * W, R() * H * 0.6, (big ? 5 : 3) * (0.5 + R()));
    if (T.sunX && !T.nether) {
      const sx = W * T.sunX, sy = H * T.sunY, sr = H * 0.085;
      const g = bx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3.2);
      g.addColorStop(0, T.moon ? 'rgba(170,200,255,.5)' : 'rgba(255,230,120,.65)'); g.addColorStop(1, 'rgba(255,230,120,0)');
      bx.fillStyle = g; bx.fillRect(0, 0, W, H);
      bx.lineWidth = L.line * 1.2; bx.strokeStyle = INK; bx.fillStyle = T.moon ? '#eef3ff' : T.sun;
      bx.beginPath(); bx.arc(sx, sy, sr, 0, 7); bx.fill(); bx.stroke();
      if (T.moon) { bx.fillStyle = '#c9d6f5'; [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.1, 0.35, 0.12]].forEach(([a, b, c]) => { bx.beginPath(); bx.arc(sx + a * sr, sy + b * sr, c * sr, 0, 7); bx.fill(); }); }
    }
    if (T.nether) {
      const g = bx.createLinearGradient(0, H * 0.5, 0, H); g.addColorStop(0, 'rgba(255,120,20,0)'); g.addColorStop(1, 'rgba(255,150,30,.5)');
      bx.fillStyle = g; bx.fillRect(0, 0, W, H);
    }

    // далёкие острова в дымке
    for (let k = 0; k < L.dist; k++) {
      const [dc, dx] = mk(), I = genIsland(R, 2, T.K), e = big ? 10 : 6;
      render(dx, I, W * (0.12 + R() * 0.76), H * (0.14 + R() * 0.4), e);
      dx.globalCompositeOperation = 'source-atop'; dx.globalAlpha = 0.62; dx.fillStyle = T.fog; dx.fillRect(0, 0, W, H);
      bx.drawImage(dc, 0, 0);
    }

    // главный остров
    const [il, ix] = mk();
    const isles = [...L.extra].sort((a, b) => a.e - b.e).map((o) => ({ ...o, small: true }));
    isles.push({ ...L.main, small: false });
    let mainInfo = null;
    isles.forEach((o) => {
      const I = genIsland(R, o.r, T.K);
      let cabin = null;
      if (!o.small) {
        if (T.cabin) cabin = addCabin(I);
        const avoid = cabin ? (c) => c.x >= cabin.x0 - 1 && c.x <= cabin.x0 + 4 && c.z >= cabin.z0 - 1 && c.z <= cabin.z0 + 4 : null;
        if (T.pond) addPond(I, R, T.pond, avoid);
        if (T.trees) addTrees(I, R, T.K, T.trees, avoid);
        if (T.fall) addFall(I, T.fall);
        if (T.glow) for (let g = 0; g < T.glow; g++) { const c = I.cols[(R() * I.cols.length) | 0]; const y = I.top[c.x + ',' + c.z]; if (!I.has(c.x, y + 1, c.z) && I.B.get(I.key(c.x, y, c.z)) === T.K.top) I.set(c.x, y + 1, c.z, 'glowstone'); }
      } else if (o.r >= 2 && T.trees) addTrees(I, R, T.K, 1);
      const sc = render(ix, I, W * o.fx, H * o.fy, o.e);
      if (!o.small) mainInfo = { I, sc, e: o.e, cabin };
    });
    if (T.night) { ix.globalCompositeOperation = 'source-atop'; ix.globalAlpha = T.night; ix.fillStyle = '#0a0f3a'; ix.fillRect(0, 0, W, H); ix.globalAlpha = 1; ix.globalCompositeOperation = 'source-over'; }
    const fin = outline(il, W, H, L.line, INK), fx = fin.getContext('2d');
    if (mainInfo && mainInfo.cabin) {
      const { I, sc, e, cabin } = mainInfo, glow = (gx, gy, rad, c) => { const g = fx.createRadialGradient(gx, gy, 0, gx, gy, rad); g.addColorStop(0, c); g.addColorStop(1, 'rgba(255,170,60,0)'); fx.fillStyle = g; fx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2); };
      const [wx, wy] = sc(cabin.x0 + 1, 1, cabin.z0 + 2);
      glow(wx, wy, e * 3.2, 'rgba(255,205,100,.55)');
      if (I.has(cabin.x0 + 3, 0, cabin.z0 + 1)) {
        const [tx, ty] = sc(cabin.x0 + 3, 0, cabin.z0 + 1), w = e * 0.14, h = e * 0.75, f = e * 0.26;
        glow(tx, ty - h, e * 3.6, 'rgba(255,190,80,.65)');
        fx.fillStyle = INK; fx.fillRect(tx - w / 2 - 1.5, ty - h - 1.5, w + 3, h + 3);
        fx.fillStyle = '#8a5a2b'; fx.fillRect(tx - w / 2, ty - h, w, h);
        fx.fillStyle = INK; fx.fillRect(tx - f / 2 - 1.5, ty - h - f - 1.5, f + 3, f + 3);
        fx.fillStyle = '#ffd23c'; fx.fillRect(tx - f / 2, ty - h - f, f, f);
        fx.fillStyle = '#fff6c0'; fx.fillRect(tx - f / 4, ty - h - f * 0.8, f / 2, f / 2);
      }
    }

    // пухлые облака
    const [cl, cx] = mk();
    const puff = (px, py, s) => { [[0, 0, 1], [0.9, 0.15, 0.8], [-0.9, 0.2, 0.75], [0.35, -0.5, 0.75], [-0.4, -0.35, 0.65]].forEach(([a, b, c]) => { cx.beginPath(); cx.arc(px + a * s, py + b * s, c * s * 0.62, 0, 7); cx.fill(); }); cx.fillRect(px - s * 1.3, py + s * 0.1, s * 2.6, s * 0.5); };
    cx.fillStyle = T.cloud || '#ffffff';
    for (let k = 0; k < L.clouds; k++) puff(W * (0.05 + (k + R() * 0.7) / L.clouds * 0.9), H * (0.1 + R() * 0.55), (big ? 34 : 20) * (0.7 + R() * 0.6));
    const cfin = outline(cl, W, H, L.line * 0.8, INK);
    return { bg: bg.toDataURL('image/png'), isl: fin.toDataURL('image/png'), cl: cfin.toDataURL('image/png') };
  }

  const cache = {};
  window.mcIsland = (name, big, seed) => { const k = name + '|' + big + '|' + seed; return cache[k] || (cache[k] = build(name, big, seed)); };
})();
