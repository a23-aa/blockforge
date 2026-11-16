// BlockForge — сервер аккаунтов и друзей. Без зависимостей, нужен только Node.js 18+.
// Запуск: node server.js   (порт 3000, или переменная PORT). Данные: data.json рядом.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA = process.env.DATA_FILE || path.join(__dirname, 'data.json');

let db = { users: {}, tokens: {}, nextId: 0, chats: {}, msgSeq: 0, codes: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA, 'utf8')) }; } catch {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA);
  }, 200);
}

/* ---------- пароль ---------- */
const COMMON = new Set(['password', '12345678', '123456789', 'qwerty123', 'qwertyui', '11111111', 'password1', 'iloveyou', 'minecraft', 'minecraft1', '1q2w3e4r', 'qwertyuiop', 'abc12345', '87654321', 'йцукенгш']);
// 0 очень слабый, 1 слабый, 2 средний, 3 хороший, 4 надёжный
function passScore(p, nick) {
  p = String(p || '');
  if (p.length < 8) return 0;
  const low = p.toLowerCase();
  if (COMMON.has(low) || (nick && low.includes(String(nick).toLowerCase()))) return 0;
  if (/^(.)\1+$/.test(p)) return 0;
  let kinds = 0;
  if (/[a-zа-яё]/.test(p)) kinds++;
  if (/[A-ZА-ЯЁ]/.test(p)) kinds++;
  if (/\d/.test(p)) kinds++;
  if (/[^A-Za-zА-Яа-яЁё0-9]/.test(p)) kinds++;
  let s = kinds + (p.length >= 12 ? 1 : 0) + (p.length >= 16 ? 1 : 0) - 1;
  if (/^\d+$/.test(p) || /(0123|1234|2345|3456|abcd|qwer|asdf)/i.test(p)) s -= 1;
  return Math.max(0, Math.min(4, s));
}

function hashPass(p, salt) { return crypto.scryptSync(p, salt, 32).toString('hex'); }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------- защита от перебора ---------- */
const fails = new Map(); // ip -> [timestamps]
function tooMany(ip) {
  const now = Date.now(), a = (fails.get(ip) || []).filter((t) => now - t < 600000);
  fails.set(ip, a);
  return a.length >= 10;
}
function addFail(ip) { const a = fails.get(ip) || []; a.push(Date.now()); fails.set(ip, a); }

/* ---------- помощники ---------- */
const ONLINE_MS = 90000;
const pub = (u) => ({ id: u.id, nick: u.nick, online: Date.now() - (u.seen || 0) < ONLINE_MS, playing: Date.now() - (u.seen || 0) < ONLINE_MS ? u.playing || '' : '' });
const byNick = (n) => Object.values(db.users).find((u) => u.nick.toLowerCase() === String(n).toLowerCase());

function newId() {
  for (let i = 0; i < 50; i++) {
    const id = String(10000000 + crypto.randomInt(0, 89999999));
    if (!db.users[id]) return id;
  }
  throw new Error('Не удалось выдать ID');
}

function auth(req) {
  const h = String(req.headers.authorization || '');
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const id = t && db.tokens[sha(t)];
  const u = id && db.users[id];
  if (!u) return null;
  u.seen = Date.now();
  return u;
}

function readBody(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 10000) { rej(new Error('Слишком большой запрос')); req.destroy(); } });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { rej(new Error('Некорректный JSON')); } });
    req.on('error', rej);
  });
}

class HttpErr extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function issue(u) {
  const token = crypto.randomBytes(32).toString('hex');
  db.tokens[sha(token)] = u.id;
  save();
  return { id: u.id, nick: u.nick, token, ...premView(u) };
}

/* ---------- Премиум: подписка по времени, коды активации ---------- */
const DAY = 86400000;
const isPrem = (u) => (u.premiumUntil || 0) > Date.now();
const premView = (u) => ({ premium: isPrem(u), premiumUntil: u.premiumUntil || 0 });
function addDays(u, days) { u.premiumUntil = Math.max(u.premiumUntil || 0, Date.now()) + days * DAY; }
function needPrem(req) { const u = need(req); if (!isPrem(u)) throw new HttpErr(402, 'Это функция Премиума. Подключи Премиум в лаунчере.'); return u; }
function adminOnly(req) {
  const key = String(process.env.ADMIN_KEY || ''), got = String(req.headers['x-admin-key'] || '');
  if (key.length < 12) throw new HttpErr(403, 'Админ-ключ не задан на сервере (переменная ADMIN_KEY, минимум 12 символов)');
  const a = crypto.createHash('sha256').update(key).digest(), b = crypto.createHash('sha256').update(got).digest();
  if (!crypto.timingSafeEqual(a, b)) throw new HttpErr(403, 'Неверный админ-ключ');
}
function makeCode() { const r = crypto.randomBytes(9).toString('hex').toUpperCase(); return 'BF-' + r.slice(0, 4) + '-' + r.slice(4, 8) + '-' + r.slice(8, 12); }

/* ---------- маршруты ---------- */
/* ---------- чаты ---------- */
const chatKey = (a, b) => (b === 'global' ? 'global' : [a, b].sort().join(':'));
const lastRead = (u) => (u.read = u.read || {});
const sentAt = new Map(); // id -> время последнего сообщения (анти-спам)
function addMsg(key, m) {
  const arr = (db.chats[key] = db.chats[key] || []);
  arr.push({ n: ++db.msgSeq, ...m, t: Date.now() });
  if (arr.length > 200) arr.splice(0, arr.length - 200);
}
function unreadFor(u, fid) {
  const key = chatKey(u.id, fid), after = lastRead(u)[key] || 0;
  return (db.chats[key] || []).filter((m) => m.from === fid && m.n > after).length;
}
function lastInvite(u) {
  // последнее непрочитанное приглашение от друга за 10 минут
  const out = [];
  for (const fid of u.friends) {
    const key = chatKey(u.id, fid), after = lastRead(u)[key] || 0;
    for (const m of db.chats[key] || []) if (m.kind === 'invite' && m.from === fid && m.n > after && Date.now() - m.t < 600000) out.push({ from: pub(db.users[fid]), server: m.server, n: m.n });
  }
  return out;
}

const routes = {
  'GET /api/health': async () => ({ ok: true, name: 'BlockForge', users: Object.keys(db.users).length }),

  'POST /api/register': async (req, b, ip) => {
    const nick = String(b.nick || '').trim(), pass = String(b.password || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) throw new HttpErr(400, 'Ник: 3–16 символов, латиница, цифры и _');
    if (byNick(nick)) throw new HttpErr(409, 'Этот ник уже занят');
    if (pass.length > 100) throw new HttpErr(400, 'Пароль слишком длинный');
    if (passScore(pass, nick) < 2) throw new HttpErr(400, 'Пароль слишком простой. Минимум 8 символов, добавь заглавные буквы, цифры или символы.');
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { id: newId(), nick, salt, hash: hashPass(pass, salt), created: Date.now(), friends: [], incoming: [], outgoing: [], seen: Date.now(), playing: '' };
    db.users[u.id] = u;
    return issue(u);
  },

  'POST /api/login': async (req, b, ip) => {
    if (tooMany(ip)) throw new HttpErr(429, 'Слишком много попыток. Подожди 10 минут.');
    const key = String(b.login || '').trim();
    const u = /^\d{8}$/.test(key) ? db.users[key] : byNick(key);
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPass(String(b.password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) { addFail(ip); throw new HttpErr(401, 'Неверный ник/ID или пароль'); }
    return issue(u);
  },

  'POST /api/logout': async (req) => {
    const h = String(req.headers.authorization || '').slice(7);
    delete db.tokens[sha(h)]; save();
    return { ok: true };
  },

  'GET /api/me': async (req) => { const u = need(req); return { id: u.id, nick: u.nick, ...premView(u) }; },

  'POST /api/redeem': async (req, b, ip) => {
    const u = need(req);
    if (tooMany(ip)) throw new HttpErr(429, 'Слишком много попыток. Подожди 10 минут.');
    const code = String(b.code || '').trim().toUpperCase().replace(/\s+/g, ''), c = db.codes[code];
    if (!c) { addFail(ip); throw new HttpErr(404, 'Такого кода нет. Проверь, что ввёл его без ошибок.'); }
    if (c.usedBy) throw new HttpErr(409, 'Этот код уже использован');
    c.usedBy = u.id; c.usedAt = Date.now();
    addDays(u, c.days); save();
    return { ok: true, days: c.days, ...premView(u) };
  },

  // для владельца: создать коды (X-Admin-Key), выдать Премиум напрямую
  'POST /api/admin/codes': async (req, b) => {
    adminOnly(req);
    const days = Math.max(1, Math.min(3650, Number(b.days) || 30)), count = Math.max(1, Math.min(100, Number(b.count) || 1));
    const out = [];
    for (let i = 0; i < count; i++) { const c = makeCode(); db.codes[c] = { days, created: Date.now(), usedBy: null }; out.push(c); }
    save();
    return { codes: out, days };
  },
  'POST /api/admin/user': async (req, b) => {
    adminOnly(req);
    const u = db.users[String(b.id || '')];
    if (!u) throw new HttpErr(404, 'Игрока с таким ID нет');
    return { id: u.id, nick: u.nick, ...premView(u) };
  },
  'POST /api/admin/grant': async (req, b) => {
    adminOnly(req);
    const u = db.users[String(b.id || '')] || byNick(b.nick || '');
    if (!u) throw new HttpErr(404, 'Игрок не найден');
    addDays(u, Math.max(-3650, Math.min(3650, Number(b.days) || 30))); save();
    return { id: u.id, nick: u.nick, ...premView(u) };
  },

  'POST /api/status': async (req, b) => {
    const u = needPrem(req);
    u.playing = String(b.playing || '').slice(0, 60);
    return { ok: true };
  },

  'GET /api/friends': async (req) => {
    const u = needPrem(req);
    const m = (ids) => ids.map((i) => db.users[i]).filter(Boolean).map(pub);
    const friends = m(u.friends).map((f) => ({ ...f, unread: unreadFor(u, f.id) })).sort((a, b) => Number(b.online) - Number(a.online) || a.nick.localeCompare(b.nick));
    save();
    const gl = (db.chats.global || []).filter((x) => x.n > (lastRead(u).global || 0) && x.from !== u.id).length;
    return { friends, incoming: m(u.incoming), outgoing: m(u.outgoing), invites: lastInvite(u), globalUnread: gl };
  },

  'GET /api/chat': async (req, b, ip, url) => {
    const u = needPrem(req), w = String(url.searchParams.get('with') || '');
    if (w !== 'global' && !u.friends.includes(w)) throw new HttpErr(403, 'Чат доступен только с друзьями');
    const key = chatKey(u.id, w), after = Number(url.searchParams.get('after')) || 0;
    const msgs = (db.chats[key] || []).filter((m) => m.n > after).map((m) => ({ n: m.n, from: m.from, nick: db.users[m.from] ? db.users[m.from].nick : '?', text: m.text, kind: m.kind || '', server: m.server || '', t: m.t }));
    const arr = db.chats[key] || [];
    if (arr.length) { lastRead(u)[key] = arr[arr.length - 1].n; save(); }
    return { msgs };
  },

  'POST /api/chat/send': async (req, b) => {
    const u = needPrem(req), to = String(b.to || ''), text = String(b.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
    if (to !== 'global' && !u.friends.includes(to)) throw new HttpErr(403, 'Чат доступен только с друзьями');
    const kind = b.kind === 'invite' ? 'invite' : '';
    if (!text && !kind) throw new HttpErr(400, 'Пустое сообщение');
    const now = Date.now();
    if (now - (sentAt.get(u.id) || 0) < 700) throw new HttpErr(429, 'Не так быстро');
    sentAt.set(u.id, now);
    addMsg(chatKey(u.id, to), { from: u.id, text: kind ? text || 'Го играть!' : text, kind, server: kind ? String(b.server || '').slice(0, 100) : '' });
    save();
    return { ok: true };
  },

  'POST /api/friends/add': async (req, b) => {
    const u = needPrem(req), id = String(b.id || '').trim();
    if (!/^\d{8}$/.test(id)) throw new HttpErr(400, 'ID — это 8 цифр');
    const t = db.users[id];
    if (!t) throw new HttpErr(404, 'Игрок с таким ID не найден');
    if (t.id === u.id) throw new HttpErr(400, 'Это твой собственный ID');
    if (u.friends.includes(id)) throw new HttpErr(409, 'Вы уже друзья');
    if (u.incoming.includes(id)) { link(u, t); save(); return { status: 'friends', user: pub(t) }; } // встречная заявка = дружба
    if (!u.outgoing.includes(id)) { u.outgoing.push(id); t.incoming.push(u.id); }
    save();
    return { status: 'sent', user: pub(t) };
  },

  'POST /api/friends/accept': async (req, b) => {
    const u = needPrem(req), id = String(b.id || '');
    if (!u.incoming.includes(id)) throw new HttpErr(404, 'Заявки нет');
    link(u, db.users[id]); save();
    return { ok: true };
  },

  'POST /api/friends/decline': async (req, b) => {
    const u = needPrem(req), id = String(b.id || ''), t = db.users[id];
    u.incoming = u.incoming.filter((x) => x !== id);
    if (t) t.outgoing = t.outgoing.filter((x) => x !== u.id);
    save();
    return { ok: true };
  },

  'POST /api/friends/remove': async (req, b) => {
    const u = needPrem(req), id = String(b.id || ''), t = db.users[id];
    const rm = (x, y) => { x.friends = x.friends.filter((i) => i !== y); x.outgoing = x.outgoing.filter((i) => i !== y); x.incoming = x.incoming.filter((i) => i !== y); };
    rm(u, id); if (t) rm(t, u.id);
    save();
    return { ok: true };
  },
};

function need(req) { const u = auth(req); if (!u) throw new HttpErr(401, 'Нужно войти'); return u; }
function link(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    x.incoming = x.incoming.filter((i) => i !== y.id);
    x.outgoing = x.outgoing.filter((i) => i !== y.id);
    if (!x.friends.includes(y.id)) x.friends.push(y.id);
  }
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    const url = new URL(req.url, 'http://x');
    const fn = routes[req.method + ' ' + url.pathname];
    if (!fn) return send(404, { error: 'Не найдено' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const body = req.method === 'POST' ? await readBody(req) : {};
    send(200, await fn(req, body, ip, url));
  } catch (e) {
    send(e.code || 500, { error: e.code ? e.message : 'Ошибка сервера' });
    if (!e.code) console.error(e);
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log('BlockForge API запущен на порту ' + PORT));
  process.on('SIGINT', () => { try { fs.writeFileSync(DATA, JSON.stringify(db)); } catch {} process.exit(0); });
}
function start(port, host) {
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(port, host || '127.0.0.1', () => { server.removeListener('error', rej); res(server); });
  });
}
module.exports = { server, passScore, start };
