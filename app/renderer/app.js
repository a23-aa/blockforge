'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  page: 'home',
  presets: null,
  servers: (() => { try { return JSON.parse(localStorage.getItem('servers') || '[]'); } catch { return []; } })(),
  serverStatus: {},
  config: {},
  instances: [],
  accounts: [],
  selectedAccount: null,
  selectedInstance: localStorage.getItem('selInst') || null,
  dataDir: '',
  running: new Set(),
  versions: null,
  latest: null,
  logs: [],
  progress: { text: '', pct: 0 },
  busy: false,
  msCode: null,
  mods: { inst: null, tab: 'browse', type: 'mod', query: '', results: null, loading: false },
};

async function call(name, ...args) {
  const r = await window.api.call(name, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 7000 : 3500);
}

function fail(e) { toast(e.message || String(e), 'err'); }

const LOADERS = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

function curInstance() {
  return state.instances.find((i) => i.id === state.selectedInstance) || state.instances[0] || null;
}
function curAccount() {
  return state.accounts.find((a) => a.id === state.selectedAccount) || null;
}

/* ---------- окно ---------- */
$$('[data-win]').forEach((b) => b.addEventListener('click', () => window.api.win(b.dataset.win)));
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-page]');
  if (el) go(el.dataset.page);
});

function go(page) {
  state.page = page;
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  render();
}

function drawProfile() {
  const a = curAccount();
  const p = $('#profile');
  p.classList.toggle('off', !a || a.type !== 'microsoft');
  p.innerHTML = a
    ? `<div class="avatar">${esc(a.name[0].toUpperCase())}</div><div><b>${esc(a.name)}</b><small>${state.session ? 'ID ' + esc(state.session.id) : a.type === 'microsoft' ? 'Microsoft' : 'Офлайн'}</small></div>`
    : `<div class="avatar">?</div><div><b>Войти</b><small>Нет аккаунта</small></div>`;
}

function render() {
  const v = $('#view');
  v.innerHTML = '';
  drawProfile();
  pages[state.page](v);
  hydrateArt();
}

/* ---------- картинки: парящие острова (см. islands.js) ---------- */
function art(name, w, h, seed) {
  const big = w > 500;
  return `<div class="art" data-art="${esc(name)}|${big ? 1 : 0}|${esc(String(seed))}"></div>`;
}
// острова рисуются по одному в свободное время, чтобы окно открывалось мгновенно
let hydrating = false;
function hydrateArt() {
  if (hydrating) return;
  hydrating = true;
  const step = () => {
    const el = document.querySelector('.art[data-art]');
    if (!el) { hydrating = false; return; }
    const [name, big, seed] = el.dataset.art.split('|');
    el.removeAttribute('data-art');
    try {
      const r = window.mcIsland(name, big === '1', seed);
      el.innerHTML = `<div class="lay l0"><img src="${r.bg}" alt=""></div><div class="lay l1 fl"><img src="${r.isl}" alt=""></div><div class="lay l2"><img src="${r.cl}" alt=""></div>`;
      el.classList.add('ready');
    } catch (e) {}
    setTimeout(step, 0);
  };
  requestAnimationFrame(step);
}
const LOGO = '<img src="logo.svg" alt="">';

/* ---------- события из main ---------- */
window.api.on('progress', (p) => {
  state.progress = p;
  const bar = $('#bar');
  if (bar) bar.style.width = (p.pct || 0) + '%';
  const t = $('#ptext');
  if (t) t.textContent = p.text || '';
});
window.api.on('log', (l) => {
  state.logs.push(l);
  if (state.logs.length > 600) state.logs.splice(0, 100);
});
function skinName() {
  let id = ''; try { id = localStorage.getItem('skinActive') || ''; } catch {}
  const sk = (window.SKINPACK || []).find((x) => x.id === id);
  return sk ? sk.name : 'свой / стандартный';
}
window.api.on('game-state', (g) => {
  if (g.running) state.running.add(g.id); else state.running.delete(g.id);
  if (state.page === 'play') render();
});
window.api.on('ms-code', (c) => {
  state.msCode = c;
  if (state.page === 'accounts') render();
});

/* ---------- страницы ---------- */
const pages = {};
let premiumCardFn = () => '';
const premiumCard = () => premiumCardFn();

function lastInstance() {
  const played = state.instances.filter((i) => i.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);
  return played[0] || curInstance();
}

function myServerCard() {
  const c = state.config;
  if (!c.serverAddr) return '';
  const st = state.myServerStatus;
  const info = !st ? '<span class="dot"></span>проверяю…' : st.err ? '<span class="dot off"></span>сервер недоступен' : `<span class="dot on"></span>${st.online}/${st.max} игроков · ${st.ms} мс`;
  return `<div class="panel pad" style="display:flex;flex-direction:column;gap:10px;background:#fff3b0">
    <h3>${ICON('star')} ${esc(c.serverName || 'Наш сервер')}</h3><div class="muted">${esc(c.serverAddr)}</div><div>${info}</div>
    <button class="btn green" data-act="playMyServer">${ICON('play')}Зайти на сервер</button></div>`;
}

pages.home = (v) => {
  const inst = lastInstance();
  if (state.config.serverAddr && !state.myServerPinged) {
    state.myServerPinged = true;
    call('servers:ping', state.config.serverAddr).then((r) => { state.myServerStatus = r; }).catch(() => { state.myServerStatus = { err: true }; }).then(() => { if (state.page === 'home') render(); });
  }
  if (state.presets === null) {
    state.presets = [];
    call('presets:list').then((l) => { state.presets = l; if (state.page === 'home') render(); }).catch(() => {});
  }
  if (!state.versions && !state.versionsLoading) {
    state.versionsLoading = true;
    call('versions:list').then((r) => { state.versions = r.versions; state.latest = r.latest; if (state.page === 'home') render(); }).catch(() => {});
  }
  const news = (state.versions || []).slice(0, 3);
  v.innerHTML = `<div class="home">
    <div class="home-main">
      <div class="banner">${art('home', 900, 300, 1)}
        <div class="banner-text">
          <h1>Добро пожаловать<br>в BlockForge!</h1>
          <p>Выбирай сборку, запускай игру и отправляйся навстречу приключениям.</p>
          <button class="btn neon big" data-act="homePlay">${ICON('play')}Играть</button>
        </div>
      </div>
      <div class="row between"><h2>Популярные сборки</h2><span class="link" data-page="instances">Мои сборки ${ICON('arrow')}</span></div>
      <div class="presets">${state.presets.map((p, i) => `
        <div class="preset" data-act="createPreset" data-id="${esc(p.id)}">
          <div class="pic">${art(p.id, 240, 120, i + 10)}<span class="go">${ICON('plus')} Создать</span></div>
          <div class="pb"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small><span class="tag ${esc(p.kind)}">${esc(p.tag)}</span></div>
        </div>`).join('') || '<div class="muted">Загрузка…</div>'}</div>
    </div>
    <div class="home-side">
      ${myServerCard()}
      <div class="panel pad" style="display:flex;flex-direction:column;gap:14px">
        <h3>Последний запуск</h3>
        ${inst ? `<div class="last"><div class="cube">${LOGO}</div><div><b>${esc(inst.name)}</b><div class="muted">${esc(inst.mcVersion)} · ${esc(LOADERS[inst.loader] || inst.loader)}</div></div></div>
        <div class="row"><button class="btn green" data-act="lastPlay">${ICON('play')}Играть</button><button class="btn icon" data-act="editInstance" data-id="${esc(inst.id)}" title="Настройки сборки">${ICON('gear')}</button></div>`
          : `<div class="muted">Сборок пока нет. Выбери одну из готовых слева или создай свою.</div><button class="btn neon" data-act="newInstance">Создать сборку</button>`}
      </div>
      <div class="panel pad" style="display:flex;flex-direction:column;gap:12px">
        <h3>Новости Minecraft</h3>
        ${news.length ? news.map((n) => `<div class="news-item"><div class="nico">${n.type === 'release' ? ICON('star') : ICON('flag')}</div><div><b>${n.type === 'release' ? 'Вышла версия' : 'Новый снапшот'} ${esc(n.id)}</b><small>${new Date(n.releaseTime).toLocaleDateString('ru-RU')}</small></div></div>`).join('') : '<div class="muted">Загрузка…</div>'}
      </div>
    </div>
  </div>`;
};

pages.servers = (v) => {
  const inst = curInstance();
  v.innerHTML = `<div class="page">
    <div class="row between wrap"><h1>Серверы</h1><button class="btn" data-act="pingAll">Обновить</button></div>
    <div class="glass pad row wrap" style="gap:10px">
      <input type="text" id="srvName" placeholder="Название" style="flex:1;min-width:150px">
      <input type="text" id="srvAddr" placeholder="Адрес, например play.example.com:25565" style="flex:2;min-width:220px">
      <button class="btn neon" data-act="addServer">Добавить</button>
    </div>
    <div class="muted" style="font-size:12.5px">Запуск идёт со сборкой: <b>${inst ? esc(inst.name) + ' (' + esc(inst.mcVersion) + ')' : 'не выбрана'}</b>. Версия сборки должна подходить серверу.</div>
    <div class="list">${state.servers.length ? state.servers.map((s) => {
      const st = state.serverStatus[s.id];
      const info = !st ? '<span class="dot"></span>проверяю…' : st.err ? `<span class="dot off"></span>недоступен` : `<span class="dot on"></span>${st.online}/${st.max} игроков · ${st.ms} мс · ${esc(st.version)}`;
      return `<div class="glass mod"><div class="info"><b>${esc(s.name)}</b><span>${esc(s.addr)}</span><span>${info}</span></div>
        <button class="btn sm neon" data-act="serverPlay" data-id="${esc(s.id)}">Играть</button>
        <button class="btn sm danger" data-act="removeServer" data-id="${esc(s.id)}">Удалить</button></div>`;
    }).join('') : '<div class="glass empty">Добавь свой любимый сервер, и можно заходить на него одной кнопкой.</div>'}</div>
  </div>`;
  if (!state.serversPinged) { state.serversPinged = true; pingServers(); }
};

function pingServers() {
  state.servers.forEach((s) => {
    call('servers:ping', s.addr)
      .then((r) => { state.serverStatus[s.id] = r; })
      .catch(() => { state.serverStatus[s.id] = { err: true }; })
      .then(() => { if (state.page === 'servers') render(); });
  });
}

pages.friends = (v) => {
  v.innerHTML = `<div class="page"><h1>Друзья</h1>
    <div class="glass empty" style="margin:auto;max-width:520px"><div>${ICON('users','xl')}</div>
    <h2 style="margin:10px 0">Скоро</h2>
    <p>Список друзей и «кто онлайн» потребуют своего сервера, это следующий этап. Пока для игры вместе используй вкладку «Серверы».</p></div></div>`;
};

pages.play = (v) => {
  const inst = curInstance();
  const acc = curAccount();
  if (!inst) {
    v.innerHTML = `<div class="page"><div class="glass empty" style="margin:auto;max-width:520px">
      <h1>Добро пожаловать</h1><p style="margin:12px 0 22px">Создай первую сборку — выбери версию Minecraft и, если нужно, загрузчик модов.</p>
      <button class="btn neon" data-act="newInstance">Создать сборку</button></div></div>`;
    return;
  }
  const isRun = state.running.has(inst.id);
  v.innerHTML = `<div class="page">
    <div class="glass hero">
      <div class="row between">
        <div>
          <h1>${esc(inst.name)}</h1>
          <div style="margin-top:8px"><span class="tag">${esc(inst.mcVersion)}</span><span class="tag l">${esc(LOADERS[inst.loader] || inst.loader)}${inst.loaderVersion ? ' ' + esc(String(inst.loaderVersion).replace(inst.mcVersion + '-', '')) : ''}</span><span class="tag">${inst.ram} МБ</span></div>
        </div>
        <select id="instSel" class="hero-sel">${state.instances.map((i) => `<option value="${esc(i.id)}" ${i.id === inst.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
      </div>
      <div class="grow" style="flex:1"></div>
      <div class="progress"><div class="bar"><i id="bar" style="width:${state.progress.pct || 0}%"></i></div><span id="ptext" class="muted">${esc(state.progress.text || 'Готов к запуску')}</span></div>
      <div class="row between wrap">
        <div class="acc-chip" data-act="goAccounts">${acc ? `<div class="avatar">${esc(acc.name[0].toUpperCase())}</div><div><b>${esc(acc.name)}</b><div class="muted" style="font-size:12px">${acc.type === 'microsoft' ? 'Microsoft' : 'Офлайн'}</div></div>` : `<div class="avatar">?</div><div class="muted">Добавь аккаунт</div>`}</div>
        <div class="row">
          ${isRun ? `<button class="btn danger" data-act="stop">Остановить</button>` : ''}
          <button id="play" class="play" data-act="play" ${isRun || state.busy ? 'disabled' : ''}>${isRun ? 'ЗАПУЩЕНО' : state.busy ? 'ПОДГОТОВКА…' : 'ИГРАТЬ'}</button>
        </div>
      </div>
    </div>
    ${/^Ошибка/.test(state.progress.text || '') ? `<div class="warn err"><b>Не удалось запустить игру.</b> ${esc(state.progress.text)}<div style="margin-top:8px"><button class="btn sm" data-act="showDetails">Подробности для разработчика</button></div></div>` : ''}
    <div class="stats">
      <div class="glass stat"><small>Версия игры</small><b>${esc(inst.mcVersion)}</b></div>
      <div class="glass stat"><small>Загрузчик</small><b>${esc(LOADERS[inst.loader] || inst.loader)}</b></div>
      <div class="glass stat"><small>Память</small><b>${inst.ram} МБ</b></div>
      <div class="glass stat"><small>Мой скин</small><b>${esc(skinName())}</b></div>
    </div>
  </div>`;
  $('#instSel').addEventListener('change', (e) => {
    state.selectedInstance = e.target.value;
    localStorage.setItem('selInst', state.selectedInstance);
    render();
  });
};

pages.instances = (v) => {
  v.innerHTML = `<div class="page">
    <div class="row between"><h1>Сборки</h1><button class="btn neon" data-act="newInstance">+ Новая сборка</button></div>
    ${state.instances.length ? `<div class="grid">${state.instances.map((i) => `
      <div class="glass card ${i.id === (curInstance() || {}).id ? 'sel' : ''}">
        <div class="ipic">${art(i.loader === 'vanilla' ? 'home' : i.loader, 320, 96, i.name.length + 3)}</div>
        <div class="row between"><h2>${esc(i.name)}</h2></div>
        <div><span class="tag">${esc(i.mcVersion)}</span><span class="tag l">${esc(LOADERS[i.loader] || i.loader)}</span></div>
        <div class="muted" style="font-size:12.5px">Память: ${i.ram} МБ${i.lastPlayed ? ' · играл ' + new Date(i.lastPlayed).toLocaleDateString('ru-RU') : ''}</div>
        <div class="row wrap">
          <button class="btn sm neon" data-act="selectPlay" data-id="${esc(i.id)}">Выбрать</button>
          <button class="btn sm" data-act="openFolder" data-id="${esc(i.id)}">Папка</button>
          <button class="btn sm" data-act="editInstance" data-id="${esc(i.id)}">Настроить</button>
          <button class="btn sm danger" data-act="deleteInstance" data-id="${esc(i.id)}">Удалить</button>
        </div>
      </div>`).join('')}</div>` : `<div class="glass empty">Пока нет ни одной сборки.</div>`}
  </div>`;
};

pages.accounts = (v) => {
  v.innerHTML = `<div class="page">
    <h1>Аккаунты</h1>
    <div class="grid">
      <div class="glass card">
        <h2>Офлайн</h2>
        <p class="muted">Играй с любым ником без входа (на серверах с лицензионной проверкой работать не будет).</p>
        <input type="text" id="offName" placeholder="Ник (3–16 символов)" maxlength="16">
        <button class="btn neon" data-act="addOffline">Добавить</button>
      </div>
      <div class="glass card">
        <h2>Microsoft</h2>
        <p class="muted">Лицензионный вход. Нужен Client ID (см. Настройки и README).</p>
        ${state.msCode ? `<div class="codebox"><div class="muted">Введи код на странице входа:</div><div class="code">${esc(state.msCode.code)}</div><div class="muted" style="font-size:12px">${esc(state.msCode.url)}</div></div><button class="btn danger" data-act="msCancel">Отмена</button>` : `<button class="btn neon" data-act="msLogin">Войти через Microsoft</button>`}
      </div>
    </div>
    <h2>Список</h2>
    <div class="list">${state.accounts.length ? state.accounts.map((a) => `
      <div class="glass mod">
        <div class="avatar" style="width:44px;height:44px">${esc(a.name[0].toUpperCase())}</div>
        <div class="info"><b>${esc(a.name)}</b><span>${a.type === 'microsoft' ? 'Microsoft' : 'Офлайн'}</span></div>
        ${a.id === state.selectedAccount ? '<span class="tag">Выбран</span>' : `<button class="btn sm" data-act="selectAccount" data-id="${esc(a.id)}">Выбрать</button>`}
        <button class="btn sm danger" data-act="removeAccount" data-id="${esc(a.id)}">Удалить</button>
      </div>`).join('') : '<div class="glass empty">Аккаунтов нет.</div>'}</div>
  </div>`;
};

pages.settings = (v) => {
  const c = state.config;
  if (!state.java && !state.javaLoading) {
    state.javaLoading = true;
    call('java:list').then((j) => { state.java = j; }).catch(() => { state.java = { installed: [], system: [] }; }).then(() => { state.javaLoading = false; if (state.page === 'settings' && !document.activeElement.matches('input')) render(); });
  }
  const j = state.java;
  const cur = c.javaPath || '';
  const known = j ? j.system.some((x) => x.path === cur) : false;
  const radio = (val, title, sub, on) => `<label class="opt ${on ? 'on' : ''}"><input type="radio" name="jv" ${on ? 'checked' : ''} data-act="javaUse" data-path="${esc(val)}"><span><b>${title}</b><small>${sub}</small></span></label>`;
  const ram = Number(c.ram) || 4096;
  v.innerHTML = `<div class="page settings">
    <h1>Настройки</h1>
    <div class="s-grid">
      <section class="glass s-card s-wide" id="premCard">${premiumCard()}</section>

      <section class="glass s-card">
        <h2>${ICON('gear')}Игра</h2>
        <label class="f">Память для новых сборок: <b id="ramVal" class="hl">${ram} МБ</b>
          <input type="range" id="ram" min="1024" max="16384" step="512" value="${ram}"></label>
        <div class="chips">${[2048, 4096, 6144, 8192].map((n) => `<button class="chip ${ram === n ? 'on' : ''}" data-act="ramSet" data-v="${n}">${n / 1024} ГБ</button>`).join('')}</div>
        <p class="muted small">Для обычной игры хватает 2–4 ГБ, для модов обычно 4–8 ГБ. Больше, чем есть свободной памяти, ставить не стоит.</p>
        <label class="f">Когда игра запустилась, лаунчер
          <select id="afterLaunch"><option value="hide" ${c.afterLaunch !== 'keep' ? 'selected' : ''}>скрывается и возвращается после выхода</option><option value="keep" ${c.afterLaunch === 'keep' ? 'selected' : ''}>остаётся на экране</option></select></label>
      </section>

      <section class="glass s-card">
        <h2>${ICON('server')}Java</h2>
        <p class="muted small">Java нужна, чтобы запустить Minecraft. Проще всего оставить автоматический выбор: лаунчер сам скачает нужную версию.</p>
        <div class="opts">
          ${radio('', 'Автоматически', 'Лаунчер скачает нужную Java сам (рекомендуется)', !cur)}
          ${j ? j.system.map((x) => radio(x.path, 'Java ' + x.major + ' <i class="tag l">' + esc(x.version) + '</i>', esc(x.path), cur === x.path)).join('') : '<div class="muted small">Ищу установленную Java…</div>'}
          ${cur && j && !known ? radio(cur, 'Свой файл', esc(cur), true) : ''}
        </div>
        <div class="row wrap"><button class="btn sm" data-act="javaPick">Выбрать java.exe…</button>${cur ? '<button class="btn sm" data-act="javaTest">Проверить выбранную</button>' : ''}<button class="btn sm" data-act="javaRescan">Найти заново</button></div>
        <div id="javaMsg" class="muted small"></div>
        <h3 style="margin-top:6px">Скачать Java</h3>
        <div class="jlist">${j ? j.installed.map((x) => `<div class="jrow"><div><b>Java ${x.major}</b><small>${esc(x.hint)}</small></div>${x.installed ? `<span class="tag ok">${ICON('check')}Скачана</span>` : `<button class="btn sm neon" data-act="javaDl" data-c="${esc(x.component)}">Скачать</button>`}</div>`).join('') : ''}</div>
        <div class="progress"><div class="bar"><i id="bar" style="width:0"></i></div><span id="ptext" class="muted small">Скачивается только та Java, которой у тебя ещё нет</span></div>
      </section>

      <section class="glass s-card s-wide">
        <details ${c.ownerMode ? 'open' : ''}><summary>Дополнительно</summary>
          <div class="s-adv">
            <label class="f">Адрес сервера аккаунтов и друзей<input type="text" id="apiUrl" value="${esc(c.apiUrl)}" placeholder="https://..."></label>
            <label class="f">Microsoft Client ID (для входа через Microsoft)<input type="text" id="msClientId" value="${esc(c.msClientId)}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label>
            <label class="row" style="gap:8px;font-weight:800"><input type="checkbox" id="ownerMode" ${c.ownerMode ? 'checked' : ''}> Я владелец сервера (показать вкладку «Свой сервер»)</label>
            <label class="f">Название вашего сервера (на главной)<input type="text" id="serverName" value="${esc(c.serverName)}" placeholder="Например: Мой лучший сервер"></label>
            <label class="f">Адрес вашего сервера<input type="text" id="serverAddr" value="${esc(c.serverAddr)}" placeholder="play.example.com:25565"></label>
            <input type="hidden" id="javaPath" value="${esc(cur)}">
          </div>
        </details>
      </section>
    </div>
    <div class="s-bar"><button class="btn neon" data-act="saveSettings">Сохранить</button><button class="btn" data-act="openData">Открыть папку данных</button><span class="muted small">Данные: ${esc(state.dataDir)}</span></div>
  </div>`;
  $('#ram').addEventListener('input', (e) => { $('#ramVal').textContent = e.target.value + ' МБ'; });
};

function modsWarn(inst, m) {
  if (!inst || inst.loader !== 'vanilla' || m.type !== 'mod') return '';
  return `<div class="warn"><b>${ICON('warn')} В этой сборке нет загрузчика модов (Vanilla), моды в ней не запустятся.</b>
    <span>Поставь загрузчик, и моды заработают. Для большинства современных модов подходит Fabric.</span>
    <div class="chips">${['fabric', 'forge', 'neoforge', 'quilt'].map((k) => `<button class="btn sm ${k === 'fabric' ? 'neon' : ''}" data-act="setLoader" data-v="${k}">Поставить ${LOADERS[k]}</button>`).join('')}</div></div>`;
}

pages.mods = (v) => {
  const m = state.mods;
  if (!state.instances.length) {
    v.innerHTML = `<div class="page"><h1>Моды</h1><div class="glass empty">Сначала создай сборку.</div></div>`;
    return;
  }
  if (!m.inst || !state.instances.find((i) => i.id === m.inst)) m.inst = (curInstance() || {}).id;
  const inst = state.instances.find((i) => i.id === m.inst);
  const types = { mod: 'Моды', resourcepack: 'Ресурспаки', shader: 'Шейдеры' };
  v.innerHTML = `<div class="page">
    <div class="row between wrap"><h1>Моды</h1>
      <select id="modInst" style="width:260px">${state.instances.map((i) => `<option value="${esc(i.id)}" ${i.id === m.inst ? 'selected' : ''}>${esc(i.name)} — ${esc(i.mcVersion)} ${esc(LOADERS[i.loader])}</option>`).join('')}</select></div>
    ${modsWarn(inst, m)}
    <div class="row wrap">
      <div class="chips">
        <span class="chip ${m.tab === 'browse' ? 'on' : ''}" data-act="modTab" data-v="browse">Каталог Modrinth</span>
        <span class="chip ${m.tab === 'installed' ? 'on' : ''}" data-act="modTab" data-v="installed">Установлено</span>
      </div>
      <div class="chips">${Object.entries(types).map(([k, n]) => `<span class="chip ${m.type === k ? 'on' : ''}" data-act="modType" data-v="${k}">${n}</span>`).join('')}</div>
      <div class="chips" style="margin-left:auto">
        <button class="btn sm" data-act="modAddFiles">${ICON('plus')}Свой файл</button>
        <button class="btn sm" data-act="modOpenFolder">Папка</button>
        ${m.tab === 'installed' ? '<button class="btn sm neon" data-act="modUpdate">Обновить всё</button>' : ''}
      </div>
    </div>
    ${m.tab === 'browse' ? `<input type="text" id="modQ" placeholder="Поиск: sodium, jei, create…" value="${esc(m.query)}">` : ''}
    <div id="modList" class="list"></div>
  </div>`;
  $('#modInst').addEventListener('change', (e) => { m.inst = e.target.value; m.results = null; render(); });
  if (m.tab === 'browse') {
    let t;
    $('#modQ').addEventListener('input', (e) => {
      m.query = e.target.value;
      clearTimeout(t);
      t = setTimeout(() => loadMods(), 450);
    });
    if (m.results === null) loadMods(); else drawMods();
  } else {
    drawInstalled();
  }
  void inst;
};

async function loadMods() {
  const m = state.mods;
  m.loading = true;
  const box = $('#modList');
  if (box) box.innerHTML = '<div class="glass empty">Загрузка…</div>';
  m.error = null;
  try {
    m.results = await call('mods:search', m.inst, m.query, m.type, 0);
  } catch (e) { m.results = []; m.error = e.message; }
  m.loading = false;
  if (state.page === 'mods' && m.tab === 'browse') drawMods();
}

function drawMods() {
  const box = $('#modList');
  if (!box) return;
  const r = state.mods.results || [];
  if (state.mods.error) {
    box.innerHTML = `<div class="warn err"><b>Не удалось загрузить каталог</b><span>${esc(state.mods.error)}</span><div><button class="btn sm" data-act="modRetry">Повторить</button></div></div>`;
    return;
  }
  box.innerHTML = r.length ? r.map((p) => `
    <div class="glass mod">
      ${p.icon ? `<img src="${esc(p.icon)}" alt="">` : '<div class="ph"></div>'}
      <div class="info"><b>${esc(p.title)}</b><span>${esc(p.description)}</span><span>${esc(p.author)} · ${Number(p.downloads).toLocaleString('ru-RU')} загрузок</span></div>
      <button class="btn sm neon" data-act="installMod" data-id="${esc(p.id)}">Установить</button>
    </div>`).join('') : '<div class="glass empty">Ничего не найдено для этой версии и загрузчика.</div>';
}

async function drawInstalled() {
  const box = $('#modList');
  const m = state.mods;
  try {
    const l = await call('mods:list', m.inst, m.type);
    box.innerHTML = l.length ? l.map((f) => `
      <div class="glass mod">
        <div class="info"><b>${esc(f.file.replace(/\.disabled$/, ''))}</b><span>${(f.size / 1048576).toFixed(2)} МБ · ${f.enabled ? 'включён' : 'выключен'}</span></div>
        <button class="btn sm" data-act="toggleMod" data-f="${esc(f.file)}">${f.enabled ? 'Выключить' : 'Включить'}</button>
        <button class="btn sm danger" data-act="removeMod" data-f="${esc(f.file)}">Удалить</button>
      </div>`).join('') : '<div class="glass empty">Здесь пока пусто.</div>';
  } catch (e) { fail(e); }
}

/* ---------- модальное окно создания / настройки ---------- */
function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="glass dialog">${html}</div>`;
  m.classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

const create = { loader: 'vanilla', filter: 'release', loaderVersions: [] };

async function openCreate() {
  create.loader = 'fabric';
  create.filter = 'release';
  create.loaderVersions = [];
  openModal(`<h2>Новая сборка</h2><div class="muted">Загружаю версии…</div>`);
  try {
    if (!state.versions) {
      const r = await call('versions:list');
      state.versions = r.versions;
      state.latest = r.latest;
    }
  } catch (e) { closeModal(); return fail(e); }
  drawCreate();
}

function versionOptions() {
  const f = create.filter;
  const ok = (t) => f === 'release' ? t === 'release' : f === 'snapshot' ? t === 'snapshot' : t === 'old_beta' || t === 'old_alpha';
  return state.versions.filter((v) => ok(v.type));
}

function drawCreate() {
  const vs = versionOptions();
  const sel = $('#cMc') ? $('#cMc').value : '';
  const name = $('#cName') ? $('#cName').value : '';
  const ram = $('#cRam') ? $('#cRam').value : state.config.ram;
  const chosen = vs.find((v) => v.id === sel) ? sel : (create.filter === 'release' ? state.latest : (vs[0] || {}).id);
  openModal(`
    <h2>Новая сборка</h2>
    <label class="f">Название<input type="text" id="cName" value="${esc(name)}" placeholder="Моя сборка"></label>
    <div class="chips">${[['release', 'Релизы'], ['snapshot', 'Снапшоты'], ['old', 'Старые (beta/alpha)']].map(([k, n]) => `<span class="chip ${create.filter === k ? 'on' : ''}" data-act="cFilter" data-v="${k}">${n}</span>`).join('')}</div>
    <label class="f">Версия Minecraft<select id="cMc">${vs.map((v) => `<option value="${esc(v.id)}" ${v.id === chosen ? 'selected' : ''}>${esc(v.id)}</option>`).join('')}</select></label>
    <div class="f" style="gap:8px">Загрузчик модов <span class="muted" style="font-weight:700">(Vanilla — без модов)</span>
      <div class="chips">${Object.entries(LOADERS).map(([k, n]) => `<span class="chip ${create.loader === k ? 'on' : ''}" data-act="cLoader" data-v="${k}">${n}</span>`).join('')}</div></div>
    <label class="f ${create.loader === 'vanilla' ? 'hidden' : ''}">Версия загрузчика<select id="cLv"><option>Загрузка…</option></select></label>
    <label class="f">Память: <b id="cRamV" style="color:var(--purple-d)">${ram} МБ</b><input type="range" id="cRam" min="1024" max="16384" step="512" value="${ram}"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Отмена</button><button class="btn neon" data-act="doCreate">Создать</button></div>`);
  $('#cRam').addEventListener('input', (e) => { $('#cRamV').textContent = e.target.value + ' МБ'; });
  $('#cMc').addEventListener('change', loadLoaderVersions);
  if (create.loader !== 'vanilla') loadLoaderVersions();
}

async function loadLoaderVersions() {
  if (create.loader === 'vanilla') return;
  const sel = $('#cLv');
  if (!sel) return;
  sel.innerHTML = '<option>Загрузка…</option>';
  try {
    const list = await call('loaders:versions', create.loader, $('#cMc').value);
    create.loaderVersions = list;
    const first = list.find((x) => x.stable) || list[0];
    sel.innerHTML = list.length
      ? list.map((x) => `<option value="${esc(x.id)}" ${first && x.id === first.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')
      : '<option value="">Нет версий для этой версии игры</option>';
  } catch (e) { sel.innerHTML = '<option value="">Ошибка загрузки</option>'; fail(e); }
}

function openEdit(id) {
  const i = state.instances.find((x) => x.id === id);
  if (!i) return;
  openModal(`<h2>Настройки сборки</h2>
    <label class="f">Название<input type="text" id="eName" value="${esc(i.name)}"></label>
    <label class="f">Память: <b id="eRamV" style="color:var(--purple-d)">${i.ram} МБ</b><input type="range" id="eRam" min="1024" max="16384" step="512" value="${i.ram}"></label>
    <label class="f">Доп. аргументы JVM<input type="text" id="eJvm" value="${esc(i.jvmArgs || '')}" placeholder="-XX:+UseG1GC"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Отмена</button><button class="btn neon" data-act="saveEdit" data-id="${esc(id)}">Сохранить</button></div>`);
  $('#eRam').addEventListener('input', (e) => { $('#eRamV').textContent = e.target.value + ' МБ'; });
}

/* ---------- действия ---------- */
async function refreshState() {
  const s = await call('state:get');
  state.config = s.config;
  state.instances = s.instances;
  state.accounts = s.accounts.accounts;
  state.selectedAccount = s.accounts.selected;
  state.dataDir = s.dataDir;
  state.running = new Set(s.running);
  state.session = s.session || null;
  state.buyUrl = s.buyUrl || '';
  state.langs = s.langs || {};
}

const actions = {
  closeModal,
  newInstance: openCreate,
  goAccounts: () => go('accounts'),

  cFilter: (el) => { create.filter = el.dataset.v; drawCreate(); },
  cLoader: (el) => { create.loader = el.dataset.v; drawCreate(); },

  doCreate: async () => {
    try {
      const inst = await call('instances:create', {
        name: $('#cName').value || 'Minecraft ' + $('#cMc').value,
        mcVersion: $('#cMc').value,
        loader: create.loader,
        loaderVersion: create.loader === 'vanilla' ? null : ($('#cLv') || {}).value,
        ram: $('#cRam').value,
      });
      await refreshState();
      state.selectedInstance = inst.id;
      localStorage.setItem('selInst', inst.id);
      closeModal();
      toast('Сборка создана');
      go('play');
    } catch (e) { fail(e); }
  },

  selectPlay: (el) => { state.selectedInstance = el.dataset.id; localStorage.setItem('selInst', el.dataset.id); go('play'); },
  openFolder: (el) => call('instances:open', el.dataset.id).catch(fail),
  editInstance: (el) => openEdit(el.dataset.id),
  saveEdit: async (el) => {
    try {
      await call('instances:update', el.dataset.id, { name: $('#eName').value, ram: $('#eRam').value, jvmArgs: $('#eJvm').value });
      await refreshState(); closeModal(); render();
    } catch (e) { fail(e); }
  },
  deleteInstance: async (el) => {
    const i = state.instances.find((x) => x.id === el.dataset.id);
    if (!i || !confirm(`Удалить сборку «${i.name}» вместе с её миром и модами?`)) return;
    try { await call('instances:delete', i.id); await refreshState(); render(); } catch (e) { fail(e); }
  },

  homePlay: () => {
    if (!curInstance()) return openCreate();
    go('play');
    actions.play();
  },
  lastPlay: () => {
    const i = lastInstance();
    if (!i) return openCreate();
    state.selectedInstance = i.id;
    localStorage.setItem('selInst', i.id);
    go('play');
    actions.play();
  },
  createPreset: async (el) => {
    if (state.creating) return toast('Подожди, сборка ещё создаётся…', 'err');
    state.creating = true;
    toast('Создаю сборку и ставлю моды, это займёт минуту…');
    try {
      const r = await call('presets:create', el.dataset.id);
      await refreshState();
      state.selectedInstance = r.inst.id;
      localStorage.setItem('selInst', r.inst.id);
      toast(`Готово: ${r.inst.name} (${r.inst.mcVersion})`);
      r.warnings.forEach((w) => toast(w, 'err'));
      render();
    } catch (e) { fail(e); }
    state.creating = false;
  },
  addServer: () => {
    const name = $('#srvName').value.trim();
    const addr = $('#srvAddr').value.trim();
    if (!addr) return toast('Введи адрес сервера', 'err');
    const s = { id: 's' + Date.now().toString(36), name: name || addr, addr };
    state.servers.push(s);
    localStorage.setItem('servers', JSON.stringify(state.servers));
    state.serversPinged = false;
    render();
  },
  removeServer: (el) => {
    state.servers = state.servers.filter((s) => s.id !== el.dataset.id);
    localStorage.setItem('servers', JSON.stringify(state.servers));
    render();
  },
  pingAll: () => { state.serverStatus = {}; state.serversPinged = false; render(); },
  serverPlay: (el) => {
    const s = state.servers.find((x) => x.id === el.dataset.id);
    if (!s) return;
    const m = s.addr.match(/^(.+?)(?::(\d{1,5}))?$/);
    state.pendingServer = { host: m[1], port: m[2] ? Number(m[2]) : 25565 };
    go('play');
    actions.play();
  },

  play: async () => {
    const inst = curInstance();
    if (!inst) return;
    const server = state.pendingServer || null;
    state.pendingServer = null;
    if (!curAccount()) { toast('Сначала добавь аккаунт', 'err'); return go('accounts'); }
    state.busy = true;
    state.logs = [];
    state.progress = { text: 'Начинаю…', pct: 0 };
    render();
    try {
      await call('game:launch', inst.id, server);
      await refreshState();
    } catch (e) { fail(e); state.progress = { text: 'Ошибка: ' + e.message, pct: 0 }; }
    state.busy = false;
    if (state.page === 'play') render();
  },
  showDetails: () => openModal(`<h2>Подробности</h2><pre class="srvlog" style="height:320px">${esc(state.logs.slice(-200).join('\n'))}</pre><div class="row"><button class="btn" data-act="closeModal">Закрыть</button></div>`),
  stop: () => call('game:stop', (curInstance() || {}).id).catch(fail),

  addOffline: async () => {
    try {
      const a = await call('accounts:addOffline', $('#offName').value);
      state.accounts = a.accounts; state.selectedAccount = a.selected; render();
    } catch (e) { fail(e); }
  },
  msLogin: async () => {
    try {
      const p = call('auth:ms');
      render();
      const a = await p;
      state.accounts = a.accounts; state.selectedAccount = a.selected; state.msCode = null;
      toast('Вход выполнен'); render();
    } catch (e) { state.msCode = null; fail(e); render(); }
  },
  msCancel: async () => { await call('auth:msCancel'); state.msCode = null; render(); },
  selectAccount: async (el) => { const a = await call('accounts:select', el.dataset.id); state.accounts = a.accounts; state.selectedAccount = a.selected; render(); },
  removeAccount: async (el) => { const a = await call('accounts:remove', el.dataset.id); state.accounts = a.accounts; state.selectedAccount = a.selected; render(); },

  saveSettings: async () => {
    try {
      state.config = await call('config:set', { ram: $('#ram').value, javaPath: $('#javaPath').value, msClientId: $('#msClientId').value, serverName: $('#serverName').value, serverAddr: $('#serverAddr').value, afterLaunch: $('#afterLaunch').value, ownerMode: $('#ownerMode').checked, apiUrl: $('#apiUrl').value });
      state.myServerPinged = false; state.myServerStatus = null;
      toast('Сохранено'); render();
    } catch (e) { fail(e); }
  },
  openData: () => call('app:openData'),

  setLoader: async (el) => {
    const m = state.mods;
    el.disabled = true;
    toast('Ставлю ' + LOADERS[el.dataset.v] + '…');
    try {
      await call('instances:setLoader', m.inst, el.dataset.v);
      await refreshState();
      m.results = null;
      toast(LOADERS[el.dataset.v] + ' установлен. Теперь можно ставить моды!');
      render();
    } catch (e) { el.disabled = false; fail(e); }
  },
  modRetry: () => { state.mods.results = null; render(); },
  modAddFiles: async () => {
    try {
      const r = await call('mods:addFiles', state.mods.inst, state.mods.type);
      if (r.length) { toast('Добавлено: ' + r.join(', ')); if (state.mods.tab === 'installed') drawInstalled(); }
    } catch (e) { fail(e); }
  },
  modOpenFolder: () => call('mods:openFolder', state.mods.inst, state.mods.type).catch(fail),
  modUpdate: async (el) => {
    el.disabled = true; el.textContent = 'Проверяю…';
    try {
      const r = await call('mods:update', state.mods.inst, state.mods.type);
      toast(r.updated.length ? 'Обновлено: ' + r.updated.join(', ') : `Всё актуально (проверено файлов: ${r.checked})`);
      drawInstalled();
    } catch (e) { fail(e); }
    el.disabled = false; el.textContent = 'Обновить всё';
  },
  playMyServer: () => {
    const m = String(state.config.serverAddr).match(/^(.+?)(?::(\d{1,5}))?$/);
    if (!m) return;
    if (!curInstance()) return openCreate();
    state.pendingServer = { host: m[1], port: m[2] ? Number(m[2]) : 25565 };
    go('play');
    actions.play();
  },
  modTab: (el) => { state.mods.tab = el.dataset.v; render(); },
  modType: (el) => { state.mods.type = el.dataset.v; state.mods.results = null; render(); },
  installMod: async (el) => {
    const mi = state.instances.find((i) => i.id === state.mods.inst);
    if (mi && mi.loader === 'vanilla' && state.mods.type === 'mod') return toast('В Vanilla моды не работают. Нажми «Поставить Fabric» вверху страницы.', 'err');
    el.disabled = true; el.textContent = '…';
    try {
      const r = await call('mods:install', state.mods.inst, el.dataset.id, state.mods.type);
      el.textContent = 'Готово';
      toast('Установлено: ' + r.files.join(', '));
      r.warnings.forEach((w) => toast(w, 'err'));
    } catch (e) { el.disabled = false; el.textContent = 'Установить'; fail(e); }
  },
  toggleMod: async (el) => { try { await call('mods:toggle', state.mods.inst, el.dataset.f, state.mods.type); drawInstalled(); } catch (e) { fail(e); } },
  removeMod: async (el) => {
    if (!confirm('Удалить файл?')) return;
    try { await call('mods:remove', state.mods.inst, el.dataset.f, state.mods.type); drawInstalled(); } catch (e) { fail(e); }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});

/* ---------- старт ---------- */
(async function init() {
  try {
    await refreshState();
  } catch (e) { fail(e); }
  render();
})();

/* ---------- параллакс при наведении ---------- */
document.addEventListener('mousemove', (e) => {
  const t = e.target.closest && e.target.closest('.banner, .preset');
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
  t.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
});
document.addEventListener('mouseout', (e) => {
  const t = e.target.closest && e.target.closest('.banner, .preset');
  if (t && !t.contains(e.relatedTarget)) { t.style.setProperty('--mx', 0); t.style.setProperty('--my', 0); }
});
