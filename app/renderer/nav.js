/* Группы вкладок (меню короче), чаты и приглашения */
/* global state, pages, actions, call, toast, fail, esc, $, $$, render, curInstance, curAccount */

/* ---------- вкладки внутри разделов ---------- */
const GROUPS = {
  play: { nav: 'play', tabs: [['play', 'Играть'], ['instances', 'Мои сборки'], ['servers', 'Серверы']] },
  friends: { nav: 'friends', tabs: [['friends', 'Друзья'], ['chat', 'Чаты']] },
  settings: { nav: 'settings', tabs: [['settings', 'Основное'], ['myserver', 'Свой сервер', 'owner']] },
};
const PAGE_GROUP = {};
for (const [g, d] of Object.entries(GROUPS)) for (const [p] of d.tabs) PAGE_GROUP[p] = g;

for (const p of Object.keys(PAGE_GROUP)) {
  const orig = pages[p];
  const g = GROUPS[PAGE_GROUP[p]];
  pages[p] = (v) => {
    const badge = (id) => (id === 'chat' && state.unread ? `<i class="bdg">${state.unread}</i>` : '');
    v.innerHTML = `<div class="tabs">${g.tabs.filter((t) => t[2] !== 'owner' || (state.config && state.config.ownerMode) || p === t[0]).map(([id, n]) => `<span class="tab ${id === p ? 'on' : ''}" data-page="${id}">${esc(n)}${badge(id)}</span>`).join('')}</div><div class="embed" id="embed"></div>`;
    orig($('#embed'));
  };
}
// подсветка пункта меню по группе
go = function (page) {
  state.page = page;
  const nav = PAGE_GROUP[page] ? GROUPS[PAGE_GROUP[page]].nav : page;
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === nav));
  render();
};

/* ---------- приглашение и значки ---------- */
state.unread = 0;
function setBadge() {
  const b = $('.nav-item[data-page=friends]');
  if (!b) return;
  let i = b.querySelector('.bdg');
  if (state.unread) { if (!i) { i = document.createElement('i'); i.className = 'bdg'; b.appendChild(i); } i.textContent = state.unread; } else if (i) i.remove();
}
let seenInvite = 0;
async function pollSocial() {
  if (!state.session) { if (state.unread) { state.unread = 0; setBadge(); } return; }
  try {
    const d = await call('social:friends');
    state.fr.data = d;
    state.unread = d.friends.reduce((a, f) => a + (f.unread || 0), 0) + (d.globalUnread || 0) + d.incoming.length;
    setBadge();
    for (const inv of d.invites || []) {
      if (inv.n > seenInvite) { seenInvite = inv.n; toast(inv.from.nick + ' зовёт тебя играть! Открой «Друзья».'); }
    }
    if (state.page === 'friends' && !document.activeElement.matches('input')) render();
  } catch (e) { /* сервер аккаунтов может быть недоступен */ }
}
setInterval(pollSocial, 15000);
setTimeout(pollSocial, 3000);

const origFriends = pages.friends;
pages.friends = (v) => {
  origFriends(v);
  const d = state.fr.data, page = v.querySelector('.page');
  if (!state.session || !page || !d) return;
  // кнопка «Позвать играть» и «Написать» у каждого друга
  page.querySelectorAll('[data-act=frRemove]').forEach((b) => {
    const id = b.dataset.id;
    b.insertAdjacentHTML('beforebegin', `<button class="btn sm neon" data-act="frInvite" data-id="${id}">${ICON('pad')}Позвать играть</button><button class="btn sm" data-act="frChat" data-id="${id}" title="Написать">${ICON('chat')}</button>`);
  });
  // приглашения
  if (d.invites && d.invites.length) {
    const box = document.createElement('div');
    box.innerHTML = d.invites.map((i) => `<div class="glass pad invite"><div><b>${ICON('pad')} ${esc(i.from.nick)} зовёт тебя играть</b><div class="muted" style="font-size:12.5px">${i.server ? 'Сервер: ' + esc(i.server) : 'Адрес не указан'}</div></div>
      ${i.server ? `<button class="btn neon" data-act="joinInvite" data-server="${esc(i.server)}" data-from="${esc(i.from.id)}">Присоединиться</button>` : ''}</div>`).join('');
    page.insertBefore(box, page.children[1] || null);
  }
};

function parseAddr(a) { const m = String(a).match(/^(.+?)(?::(\d{1,5}))?$/); return { host: m[1], port: m[2] ? Number(m[2]) : 25565 }; }

Object.assign(actions, {
  frInvite: async (el) => {
    const addr = state.config.serverAddr;
    if (!addr) return toast('Сначала укажи адрес своего сервера: Настройки, вкладка «Основное»', 'err');
    try { await call('social:send', el.dataset.id, 'Го играть!', 'invite', addr); toast('Приглашение отправлено'); } catch (e) { fail(e); }
  },
  frChat: (el) => { state.chat.with = el.dataset.id; go('chat'); },
  joinInvite: async (el) => {
    try { await call('social:chat', el.dataset.from, 0); } catch {}
    state.pendingServer = parseAddr(el.dataset.server);
    go('play'); actions.play();
  },
});

/* ---------- чаты ---------- */
state.chat = { with: 'global', msgs: [], last: 0, timer: null };
async function pullChat(full) {
  const c = state.chat;
  if (state.page !== 'chat') { clearInterval(c.timer); return; }
  const w = c.with;
  try {
    const r = await call('social:chat', w, full ? 0 : c.last);
    if (w !== c.with) return;
    if (full) c.msgs = [];
    if (r.msgs.length) { c.msgs.push(...r.msgs); c.last = r.msgs[r.msgs.length - 1].n; drawMsgs(); }
    else if (full) drawMsgs();
  } catch (e) { const el = $('#chMsgs'); if (el && full) el.innerHTML = `<div class="warn err">${esc(e.message)}</div>`; }
}
function msgHtml(m) {
  const mine = state.session && m.from === state.session.id;
  const t = new Date(m.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const body = m.kind === 'invite'
    ? `${ICON('pad')} ${mine ? 'Ты позвал играть' : 'Зовёт играть'}${m.server ? ': <b>' + esc(m.server) + '</b>' : ''}${!mine && m.server ? `<br><button class="btn sm neon" data-act="joinInvite" data-server="${esc(m.server)}" data-from="${esc(m.from)}">Присоединиться</button>` : ''}`
    : esc(m.text);
  return `<div class="msg ${mine ? 'me' : ''}"><small>${mine ? 'Ты' : esc(m.nick)} · ${t}</small><div>${body}</div></div>`;
}
function drawMsgs() {
  const el = $('#chMsgs'); if (!el) return;
  const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
  el.innerHTML = state.chat.msgs.length ? state.chat.msgs.map(msgHtml).join('') : '<div class="muted" style="text-align:center;margin:auto">Сообщений пока нет. Напиши первым!</div>';
  if (stick) el.scrollTop = el.scrollHeight;
}
pages.chat = (v) => {
  const c = state.chat;
  clearInterval(c.timer);
  if (!state.session) {
    v.innerHTML = `<div class="page"><h1>Чаты</h1><div class="glass empty" style="max-width:520px"><p>Чтобы писать игрокам, зарегистрируйся или войди во вкладке «Друзья».</p><button class="btn neon" data-page="friends">Открыть «Друзья»</button></div></div>`;
    return;
  }
  const friends = (state.fr.data && state.fr.data.friends) || [];
  if (c.with !== 'global' && !friends.find((f) => f.id === c.with)) c.with = 'global';
  const row = (id, name, sub, un) => `<div class="conv ${c.with === id ? 'on' : ''}" data-act="chOpen" data-id="${esc(id)}"><b>${name}</b><small>${esc(sub)}</small>${un ? `<i class="bdg">${un}</i>` : ''}</div>`;
  v.innerHTML = `<div class="page"><h1>Чаты</h1>
    <div class="chat"><div class="glass conv-list">${row('global', ICON('globe') + ' Общий чат', 'Все игроки BlockForge', (state.fr.data && state.fr.data.globalUnread) || 0)}${friends.map((f) => row(f.id, esc(f.nick), f.online ? (f.playing ? 'играет: ' + f.playing : 'в сети') : 'не в сети', f.unread)).join('') || '<div class="muted" style="padding:10px;font-size:12.5px">Добавь друзей, чтобы писать им лично.</div>'}</div>
      <div class="glass chat-box"><div class="msgs" id="chMsgs"></div>
        <div class="row"><input type="text" id="chText" maxlength="300" placeholder="Сообщение…"><button class="btn neon" data-act="chSend">Отправить</button></div></div></div></div>`;
  c.last = 0; c.msgs = [];
  pullChat(true);
  c.timer = setInterval(() => pullChat(false), 3000);
  $('#chText').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.chSend(); });
};
Object.assign(actions, {
  chOpen: (el) => { state.chat.with = el.dataset.id; render(); },
  chSend: async () => {
    const i = $('#chText'), t = i.value.trim(); if (!t) return;
    i.value = '';
    try { await call('social:send', state.chat.with, t); await pullChat(false); } catch (e) { fail(e); i.value = t; }
  },
});
