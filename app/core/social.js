// Клиент сервера аккаунтов BlockForge (регистрация, вход, друзья).
const store = require('./store');
const { UA } = require('./util');

function base() {
  const u = String(store.getConfig().apiUrl || '').trim().replace(/\/+$/, '').replace('//localhost', '//127.0.0.1');
  if (!/^https?:\/\//i.test(u)) throw new Error('Укажи адрес сервера аккаунтов в Настройках');
  return u;
}

async function req(method, p, body, auth = true) {
  const headers = { 'Content-Type': 'application/json', 'User-Agent': UA };
  if (auth) {
    const s = store.getSession();
    if (!s) throw new Error('Сначала войди в аккаунт BlockForge');
    headers.Authorization = 'Bearer ' + s.token;
  }
  let r;
  try {
    r = await fetch(base() + p, { method, headers, body: method === 'POST' ? JSON.stringify(body || {}) : undefined, signal: AbortSignal.timeout(10000) });
  } catch (e) {
    const code = (e && e.cause && (e.cause.code || e.cause.message)) || (e && e.name) || 'ошибка';
    throw new Error('Не удалось связаться с сервером аккаунтов ' + base() + ' (' + code + '). Проверь адрес в Настройках и что сервер запущен.');
  }
  let j = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401 && auth) store.saveSession(null);
  if (!r.ok) throw new Error(j.error || 'Ошибка сервера (' + r.status + ')');
  return j;
}

const view = () => { const s = store.getSession(); return s ? { id: s.id, nick: s.nick, premium: (s.premiumUntil || 0) > Date.now(), premiumUntil: s.premiumUntil || 0 } : null; };
function keepPremium(j) { const s = store.getSession(); if (s && j && typeof j.premiumUntil === 'number') { s.premiumUntil = j.premiumUntil; store.saveSession(s); } }

module.exports = {
  view,
  async register(nick, password) { const j = await req('POST', '/api/register', { nick, password }, false); store.saveSession(j); return view(); },
  async login(login, password) { const j = await req('POST', '/api/login', { login, password }, false); store.saveSession(j); return view(); },
  async logout() { try { await req('POST', '/api/logout'); } catch {} store.saveSession(null); return null; },
  async refresh() { const j = await req('GET', '/api/me'); keepPremium(j); return view(); },
  async redeem(code) { const j = await req('POST', '/api/redeem', { code }); keepPremium(j); return { ...view(), days: j.days }; },
  friends: () => req('GET', '/api/friends'),
  add: (id) => req('POST', '/api/friends/add', { id }),
  accept: (id) => req('POST', '/api/friends/accept', { id }),
  decline: (id) => req('POST', '/api/friends/decline', { id }),
  remove: (id) => req('POST', '/api/friends/remove', { id }),
  chat: (w, after) => req('GET', '/api/chat?with=' + encodeURIComponent(w) + '&after=' + (Number(after) || 0)),
  send: (to, text, kind, server) => req('POST', '/api/chat/send', { to, text, kind, server }),
  status: (playing) => req('POST', '/api/status', { playing: playing || '' }).catch(() => {}),
};
