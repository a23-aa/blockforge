const net = require('net');

function varint(n) {
  const b = [];
  do { let t = n & 0x7f; n >>>= 7; if (n) t |= 0x80; b.push(t); } while (n);
  return Buffer.from(b);
}
function str(s) { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varint(b.length), b]); }
function readVarint(buf, off) {
  let r = 0, s = 0, i = off;
  for (;;) {
    if (i >= buf.length) return null;
    const b = buf[i++];
    r |= (b & 0x7f) << s;
    if (!(b & 0x80)) break;
    s += 7;
    if (s > 35) throw new Error('bad varint');
  }
  return { v: r, n: i - off };
}

function parseAddress(a) {
  a = String(a || '').trim();
  const m = a.match(/^(.+?)(?::(\d{1,5}))?$/);
  if (!m || !m[1]) throw new Error('Некорректный адрес');
  return { host: m[1], port: m[2] ? Number(m[2]) : 25565 };
}

// Minecraft Server List Ping
function ping(address, timeout = 4000) {
  const { host, port } = parseAddress(address);
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const s = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let finished = false;
    const done = (fn, v) => { if (finished) return; finished = true; s.destroy(); fn(v); };
    s.setTimeout(timeout, () => done(reject, new Error('Нет ответа')));
    s.on('error', (e) => done(reject, e));
    s.on('connect', () => {
      const p = Buffer.alloc(2); p.writeUInt16BE(port);
      const hs = Buffer.concat([varint(0), varint(765), str(host), p, varint(1)]);
      s.write(Buffer.concat([varint(hs.length), hs]));
      s.write(Buffer.from([1, 0]));
    });
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      try {
        const l = readVarint(buf, 0);
        if (!l || buf.length < l.n + l.v) return;
        const id = readVarint(buf, l.n);
        const sl = readVarint(buf, l.n + id.n);
        if (!sl) return;
        const start = l.n + id.n + sl.n;
        if (buf.length < start + sl.v) return;
        const j = JSON.parse(buf.slice(start, start + sl.v).toString('utf8'));
        done(resolve, {
          online: (j.players && j.players.online) || 0,
          max: (j.players && j.players.max) || 0,
          version: (j.version && j.version.name) || '',
          ms: Date.now() - t0,
        });
      } catch (e) { done(reject, e); }
    });
  });
}

module.exports = { ping, parseAddress };
