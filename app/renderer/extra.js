/* Друзья и аккаунт BlockForge, переводчик, свой сервер */
/* global state, pages, actions, call, toast, fail, esc, $, render, curAccount */

/* ---------- сложность пароля (та же логика, что на сервере) ---------- */
const COMMON_PASS = ['password', '12345678', '123456789', 'qwerty123', 'qwertyui', '11111111', 'password1', 'iloveyou', 'minecraft', 'minecraft1', '1q2w3e4r', 'qwertyuiop', 'abc12345', '87654321'];
function passScore(p, nick) {
  p = String(p || '');
  if (p.length < 8) return 0;
  const low = p.toLowerCase();
  if (COMMON_PASS.includes(low) || (nick && low.includes(String(nick).toLowerCase())) || /^(.)\1+$/.test(p)) return 0;
  let kinds = 0;
  if (/[a-zа-яё]/.test(p)) kinds++;
  if (/[A-ZА-ЯЁ]/.test(p)) kinds++;
  if (/\d/.test(p)) kinds++;
  if (/[^A-Za-zА-Яа-яЁё0-9]/.test(p)) kinds++;
  let s = kinds + (p.length >= 12 ? 1 : 0) + (p.length >= 16 ? 1 : 0) - 1;
  if (/^\d+$/.test(p) || /(0123|1234|2345|3456|abcd|qwer|asdf)/i.test(p)) s -= 1;
  return Math.max(0, Math.min(4, s));
}
const PASS_LABEL = ['Очень простой', 'Простой', 'Средний', 'Хороший', 'Надёжный'];
const PASS_COLOR = ['#ff4d4d', '#ff9a3c', '#ffd23c', '#7ed957', '#2fbf5b'];

function passHint(p, nick) {
  if (!p) return 'Минимум 8 символов. Добавь заглавные буквы, цифры и символы.';
  if (p.length < 8) return 'Слишком короткий: нужно минимум 8 символов';
  const s = passScore(p, nick);
  if (s < 2) return 'Слишком простой: добавь заглавные буквы, цифры или символы, не используй ник и популярные пароли';
  return s < 4 ? 'Можно сделать надёжнее: длиннее и с символами' : 'Отличный пароль';
}

/* ---------- друзья ---------- */
state.fr = { mode: 'reg', data: null, err: '', loading: false, timer: null };
state.session = state.session || null;

async function loadFriends(quiet) {
  if (!state.session) return;
  try { state.fr.data = await call('social:friends'); state.fr.err = ''; } catch (e) {
    state.fr.err = e.message;
    if (/войди/i.test(e.message) || /Нужно войти/.test(e.message)) { state.session = null; }
  }
  if (state.page === 'friends' && !document.activeElement.matches('input')) render();
  else if (state.page === 'friends' && !quiet) render();
}

pages.friends = (v) => {
  clearInterval(state.fr.timer);
  const f = state.fr, ss = state.session;
  if (!ss) {
    const acc = curAccount();
    v.innerHTML = `<div class="page"><h1>Друзья</h1>
      <div class="glass pad" style="max-width:520px;display:flex;flex-direction:column;gap:14px">
        <div class="chips"><span class="chip ${f.mode === 'reg' ? 'on' : ''}" data-act="frMode" data-v="reg">Регистрация</span><span class="chip ${f.mode === 'login' ? 'on' : ''}" data-act="frMode" data-v="login">Вход</span></div>
        ${f.mode === 'reg' ? `
        <p class="muted" style="font-size:13px">Придумай ник и пароль. Ты получишь свой личный ID (8 цифр): по нему друзья смогут тебя добавить. Без пароля в твой аккаунт никто не зайдёт.</p>
        <label class="f">Ник (3–16, латиница, цифры, _)<input type="text" id="frNick" maxlength="16" value="${esc(f.nick || (acc && acc.name) || '')}"></label>
        <label class="f">Пароль<input type="password" id="frPass" autocomplete="new-password"></label>
        <div class="pmeter"><div class="pbar"><i id="pFill"></i></div><b id="pLabel"></b></div>
        <div class="muted" id="pHint" style="font-size:12.5px"></div>
        <label class="f">Повтори пароль<input type="password" id="frPass2" autocomplete="new-password"></label>
        <button class="btn neon" data-act="frRegister">Создать аккаунт</button>` : `
        <label class="f">Ник или ID<input type="text" id="frLogin"></label>
        <label class="f">Пароль<input type="password" id="frPass" autocomplete="current-password"></label>
        <button class="btn neon" data-act="frLogin">Войти</button>`}
        <div class="warn err" id="frErr" ${f.err ? '' : 'style="display:none"'}>${esc(f.err)}</div>
        <div class="muted" style="font-size:12px">Сервер аккаунтов: ${esc(state.config.apiUrl || 'не задан')} (меняется в Настройках)</div>
      </div></div>`;
    const pw = $('#frPass');
    if (pw && f.mode === 'reg') {
      const upd = () => {
        const nick = $('#frNick').value, s = passScore(pw.value, nick);
        $('#pFill').style.width = pw.value ? (s + 1) * 20 + '%' : '0';
        $('#pFill').style.background = PASS_COLOR[s];
        $('#pLabel').textContent = pw.value ? PASS_LABEL[s] : '';
        $('#pHint').textContent = passHint(pw.value, nick);
      };
      pw.addEventListener('input', upd); $('#frNick').addEventListener('input', upd); upd();
    }
    return;
  }
  const d = f.data;
  const row = (u, btns) => `<div class="glass mod"><div class="info"><b>${esc(u.nick)}</b><span>ID ${esc(u.id)}</span>${u.online !== undefined ? `<span><span class="dot ${u.online ? 'on' : 'off'}"></span>${u.online ? (u.playing ? 'играет: ' + esc(u.playing) : 'в сети') : 'не в сети'}</span>` : ''}</div>${btns}</div>`;
  v.innerHTML = `<div class="page"><div class="row between wrap"><h1>Друзья</h1><button class="btn" data-act="frLogout">Выйти из аккаунта</button></div>
    <div class="glass pad row wrap" style="gap:18px;background:#fff3b8">
      <div style="flex:1;min-width:200px"><div class="muted" style="font-size:12px;font-weight:900">ТВОЙ ID — отправь его другу</div>
        <div class="myid">${esc(ss.id)}</div><div><b>${esc(ss.nick)}</b></div></div>
      <button class="btn" data-act="frCopy">Скопировать ID</button>
    </div>
    <div class="glass pad row wrap" style="gap:10px"><input type="text" id="frAddId" placeholder="ID друга (8 цифр)" maxlength="8" inputmode="numeric" style="flex:1;min-width:180px"><button class="btn neon" data-act="frAdd">Добавить в друзья</button></div>
    <div class="warn err" ${f.err ? '' : 'style="display:none"'}>${esc(f.err)}</div>
    ${d && d.incoming.length ? `<h3 style="color:#fff;-webkit-text-stroke:5px var(--ink);paint-order:stroke fill">Заявки в друзья</h3><div class="list">${d.incoming.map((u) => row(u, `<button class="btn sm neon" data-act="frAccept" data-id="${u.id}">Принять</button><button class="btn sm danger" data-act="frDecline" data-id="${u.id}">Отклонить</button>`)).join('')}</div>` : ''}
    <h3 style="color:#fff;-webkit-text-stroke:5px var(--ink);paint-order:stroke fill">Мои друзья${d ? ' (' + d.friends.length + ')' : ''}</h3>
    <div class="list">${!d ? '<div class="glass empty">Загружаю…</div>' : d.friends.length ? d.friends.map((u) => row(u, `<button class="btn sm danger" data-act="frRemove" data-id="${u.id}">Удалить</button>`)).join('') : '<div class="glass empty">Пока никого. Добавь друга по ID — или отправь ему свой.</div>'}</div>
    ${d && d.outgoing.length ? `<div class="muted" style="font-size:12.5px;color:#fff">Ждут ответа: ${d.outgoing.map((u) => esc(u.nick) + ' (' + esc(u.id) + ')').join(', ')}</div>` : ''}
  </div>`;
  if (!d) loadFriends(true);
  state.fr.timer = setInterval(() => { if (state.page !== 'friends') clearInterval(state.fr.timer); else loadFriends(true); }, 20000);
};

const frDo = async (fn, okMsg) => {
  try { state.fr.err = ''; const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); } catch (e) { state.fr.err = e.message; toast(e.message, 'err'); }
};
Object.assign(actions, {
  frMode: (el) => { state.fr.mode = el.dataset.v; state.fr.err = ''; render(); },
  frRegister: async () => {
    const nick = $('#frNick').value.trim(), p = $('#frPass').value;
    state.fr.nick = nick;
    if ($('#frPass2').value !== p) { state.fr.err = 'Пароли не совпадают'; return render(); }
    if (passScore(p, nick) < 2) { state.fr.err = passHint(p, nick); return render(); }
    await frDo(async () => { state.session = await call('social:register', nick, p); state.fr.data = null; }, () => 'Аккаунт создан! Твой ID: ' + state.session.id);
    render();
  },
  frLogin: async () => {
    await frDo(async () => { state.session = await call('social:login', $('#frLogin').value.trim(), $('#frPass').value); state.fr.data = null; }, 'Добро пожаловать!');
    render();
  },
  frLogout: async () => { await call('social:logout'); state.session = null; state.fr.data = null; render(); },
  frCopy: () => { try { navigator.clipboard.writeText(state.session.id); toast('ID скопирован'); } catch { toast('Выдели и скопируй ID вручную', 'err'); } },
  frAdd: async () => {
    const id = $('#frAddId').value.trim();
    await frDo(async () => { const r = await call('social:add', id); await loadFriends(true); return r; }, (r) => (r.status === 'friends' ? 'Теперь вы друзья с ' + r.user.nick + '!' : 'Заявка отправлена игроку ' + r.user.nick));
    render();
  },
  frAccept: async (el) => { await frDo(async () => { await call('social:accept', el.dataset.id); await loadFriends(true); }, 'Друг добавлен'); render(); },
  frDecline: async (el) => { await frDo(async () => { await call('social:decline', el.dataset.id); await loadFriends(true); }); render(); },
  frRemove: async (el) => { if (!confirm('Удалить из друзей?')) return; await frDo(async () => { await call('social:remove', el.dataset.id); await loadFriends(true); }); render(); },
});

/* ---------- переводчик ---------- */
state.tr = { from: 'auto', to: null, src: '', out: '', busy: false };
pages.translate = (v) => {
  const t = state.tr, langs = state.langs || {};
  t.to = t.to || state.config.trTarget || 'en';
  const opts = (sel, auto) => (auto ? `<option value="auto" ${sel === 'auto' ? 'selected' : ''}>Определить язык</option>` : '') + Object.entries(langs).map(([k, n]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(n)}</option>`).join('');
  v.innerHTML = `<div class="page"><h1>Переводчик</h1>
    <div class="glass pad" style="display:flex;flex-direction:column;gap:12px;max-width:820px">
      <div class="row wrap"><select id="trFrom" style="flex:1;min-width:150px">${opts(t.from, true)}</select>
        <button class="btn" data-act="trSwap" title="Поменять местами">${ICON('swap')}</button>
        <select id="trTo" style="flex:1;min-width:150px">${opts(t.to, false)}</select></div>
      <textarea id="trSrc" rows="6" maxlength="2000" placeholder="Введи текст (до 2000 символов). Ctrl+Enter — перевести">${esc(t.src)}</textarea>
      <div class="row"><button class="btn neon" data-act="trGo" id="trGoBtn">Перевести</button><span class="muted" style="font-size:12px">Перевод через сервис MyMemory, нужен интернет</span></div>
      <textarea id="trOut" rows="6" readonly placeholder="Здесь появится перевод">${esc(t.out)}</textarea>
      <div class="row"><button class="btn" data-act="trCopy">Скопировать перевод</button></div>
    </div></div>`;
  $('#trSrc').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) actions.trGo(); });
  $('#trSrc').addEventListener('input', (e) => { t.src = e.target.value; });
  $('#trFrom').addEventListener('change', (e) => { t.from = e.target.value; });
  $('#trTo').addEventListener('change', (e) => { t.to = e.target.value; call('config:set', { trTarget: t.to }).catch(() => {}); });
};
Object.assign(actions, {
  trSwap: () => { const t = state.tr; if (t.from === 'auto') return toast('Выбери язык оригинала, чтобы поменять местами'); [t.from, t.to] = [t.to, t.from]; t.src = t.out || t.src; t.out = ''; render(); },
  trGo: async () => {
    const t = state.tr, b = $('#trGoBtn');
    t.src = $('#trSrc').value;
    if (!t.src.trim() || t.busy) return;
    t.busy = true; b.disabled = true; b.textContent = 'Перевожу…';
    try { t.out = await call('tr:translate', t.src, t.from, t.to); $('#trOut').value = t.out; } catch (e) { fail(e); }
    t.busy = false; b.disabled = false; b.textContent = 'Перевести';
  },
  trCopy: () => { try { navigator.clipboard.writeText($('#trOut').value); toast('Скопировано'); } catch { toast('Не удалось скопировать', 'err'); } },
});

/* ---------- свой сервер на этом ПК ---------- */
state.srv = { mode: 'survival', plugins: null, pq: '', pres: null, st: null, versions: null, logs: [], busy: false, ver: '', ram: 2048, maxp: 20, eula: false };
pages.myserver = (v) => {
  v.innerHTML = '<div class="page"><h1>Свой сервер</h1></div>';
  const s = state.srv, page = v.querySelector('.page');
  const run = s.st && s.st.running;
  const ips = (s.st && s.st.ips) || [];
  const box = document.createElement('div');
  box.className = 'glass pad';
  box.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  box.innerHTML = `<div class="row between wrap"><h3>${ICON('server')} Мой сервер на этом компьютере</h3><span class="muted" style="font-size:12.5px"><span class="dot ${run ? 'on' : 'off'}"></span>${run ? 'работает' : 'остановлен'}</span></div>
    <div class="muted" style="font-size:12.5px">Лаунчер сам скачает и запустит сервер Paper. Заходить можно и с пиратских аккаунтов (online-mode выключен). Компьютер должен быть включён, пока играют.</div>
    <div class="row wrap" style="gap:10px">
      <label class="f" style="flex:1;min-width:130px">Версия<select id="srvVer">${(s.versions || []).map((x) => `<option ${((s.ver || (s.versions || [])[0]) === x) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="f" style="width:110px">Память, МБ<input type="number" id="srvRam" value="${s.ram}" min="1024" step="512"></label>
      <label class="f" style="width:110px">Игроков<input type="number" id="srvMax" value="${s.maxp}" min="1" max="500"></label>
    </div>
    <label class="f">Режим сервера<select id="srvMode"><option value="survival" ${s.mode === 'survival' ? 'selected' : ''}>Выживание</option><option value="anarchy" ${s.mode === 'anarchy' ? 'selected' : ''}>Анархия (без защиты спавна, сложность «сложно»)</option><option value="minigames" ${s.mode === 'minigames' ? 'selected' : ''}>Мини-игры / лобби (BedWars, SkyWars…)</option></select></label>
    <label class="row" style="gap:8px;font-weight:800"><input type="checkbox" id="srvEula" ${s.eula ? 'checked' : ''}> Я принимаю условия <a href="#" data-act="openEula" style="color:var(--purple)">Minecraft EULA</a></label>
    <div class="row wrap">${run ? '<button class="btn danger" data-act="srvStop">Остановить сервер</button>' : `<button class="btn neon" data-act="srvStart" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Запускаю…' : 'Установить и запустить'}</button>`}
      <button class="btn" data-act="srvMine">Сделать «моим сервером» на главной</button><button class="btn" data-act="srvFolder">Папка сервера</button></div>
    <div class="muted" style="font-size:12.5px">Адрес для игры на этом ПК: <b>localhost</b>. В домашней сети: ${ips.length ? ips.map((i) => '<b>' + esc(i) + ':25565</b>').join(', ') : 'нет подключения'}.
      Чтобы заходили из интернета, пробрось порт <b>25565</b> на роутере или используй бесплатный туннель (например playit.gg) и впиши выданный адрес в Настройках.</div>
    <pre class="srvlog" id="srvLog">${esc(s.logs.slice(-120).join('\n'))}</pre>
    <div class="row"><input type="text" id="srvCmd" placeholder="Команда сервера, например: op ТвойНик" ${run ? '' : 'disabled'}><button class="btn sm" data-act="srvSend" ${run ? '' : 'disabled'}>Отправить</button></div>`;
  page.appendChild(box);
  const pb = document.createElement('div');
  pb.className = 'glass pad';
  pb.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  const quick = [['BedWars', 'BedWars'], ['SkyWars', 'SkyWars'], ['Лобби', 'lobby'], ['Привилегии', 'LuckPerms'], ['Команды /spawn /home', 'Essentials'], ['Скины для офлайн', 'SkinsRestorer'], ['Вход по паролю', 'AuthMe']];
  pb.innerHTML = `<h3>${ICON('puzzle')} Плагины сервера (мини-игры, правила, привилегии)</h3>
    <div class="muted" style="font-size:12.5px">BedWars, SkyWars и другие режимы работают через плагины. Выбери версию сервера выше, найди плагин и нажми «Поставить». Арены и карты потом настраиваются командами плагина. Важно: на сервере без проверки лицензии поставь плагин входа по паролю, иначе под твоим ником может зайти кто угодно.</div>
    <div class="chips">${quick.map(([n, q]) => `<span class="chip" data-act="plQuick" data-q="${esc(q)}">${esc(n)}</span>`).join('')}</div>
    <div class="row"><input type="text" id="plQ" placeholder="Поиск плагина" value="${esc(s.pq)}"><button class="btn sm neon" data-act="plSearch">Найти</button></div>
    <div class="list" id="plRes">${(s.pres || []).map((h) => `<div class="glass mod"><div class="info"><b>${esc(h.title)}</b><span>${esc(h.description)}</span></div><button class="btn sm neon" data-act="plInstall" data-id="${esc(h.id)}">Поставить</button></div>`).join('')}</div>
    <h3>Установлено</h3>
    <div class="list">${(s.plugins || []).length ? s.plugins.map((f) => `<div class="glass mod"><div class="info"><b>${esc(f)}</b></div><button class="btn sm danger" data-act="plRemove" data-f="${esc(f)}">Удалить</button></div>`).join('') : '<div class="muted" style="font-size:12.5px">Пока пусто</div>'}</div>`;
  page.appendChild(pb);
  const pq = $('#plQ'); if (pq) pq.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.plSearch(); });
  if (s.plugins === null) call('srv:plugins').then((r) => { s.plugins = r; if (state.page === 'myserver') render(); }).catch(() => { s.plugins = []; });
  const lg = $('#srvLog'); if (lg) lg.scrollTop = lg.scrollHeight;
  const rd = () => { s.ver = $('#srvVer') ? $('#srvVer').value : s.ver; s.ram = Number($('#srvRam').value) || 2048; s.maxp = Number($('#srvMax').value) || 20; s.eula = $('#srvEula').checked; s.mode = $('#srvMode').value; };
  ['srvVer', 'srvRam', 'srvMax', 'srvEula', 'srvMode'].forEach((id) => { const e = $('#' + id); if (e) e.addEventListener('change', rd); });
  const cmd = $('#srvCmd'); if (cmd) cmd.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.srvSend(); });
  if (!s.loaded) {
    s.loaded = true;
    call('srv:status').then((r) => { s.st = r; if (state.page === 'myserver') render(); }).catch(() => {});
    call('srv:versions').then((r) => { s.versions = r; if (state.page === 'myserver') render(); }).catch(() => { s.loaded = false; });
  }
};
window.api.on('srv-log', (l) => {
  const s = state.srv; s.logs.push(l); if (s.logs.length > 400) s.logs.splice(0, 100);
  const el = $('#srvLog'); if (el) { el.textContent += (el.textContent ? '\n' : '') + l; el.scrollTop = el.scrollHeight; }
});
window.api.on('srv-state', (x) => { state.srv.st = { ...(state.srv.st || {}), running: x.running }; state.srv.busy = false; if (state.page === 'myserver') render(); });
Object.assign(actions, {
  openEula: (el, e) => { if (e) e.preventDefault(); call('app:openUrl', 'https://aka.ms/MinecraftEULA'); },
  srvStart: async () => {
    const s = state.srv;
    s.ver = $('#srvVer').value; s.ram = Number($('#srvRam').value) || 2048; s.maxp = Number($('#srvMax').value) || 20; s.eula = $('#srvEula').checked; s.mode = $('#srvMode').value;
    if (!s.ver) return toast('Подожди, загружается список версий', 'err');
    if (!s.eula) return toast('Поставь галочку про EULA', 'err');
    s.busy = true; s.logs = []; render();
    try { s.st = await call('srv:start', { version: s.ver, ram: s.ram, maxPlayers: s.maxp, mode: s.mode, eula: true, name: state.config.serverName || 'BlockForge Server' }); } catch (e) { fail(e); }
    s.busy = false; render();
  },
  srvStop: () => call('srv:stop').then(() => toast('Останавливаю сервер…')).catch(fail),
  srvSend: () => { const i = $('#srvCmd'); if (!i || !i.value.trim()) return; call('srv:cmd', i.value).catch(fail); i.value = ''; },
  srvFolder: () => call('srv:openFolder').catch(fail),
  srvMine: async () => {
    try { state.config = await call('config:set', { serverAddr: 'localhost:25565', serverName: state.config.serverName || 'Мой сервер' }); state.myServerPinged = false; state.myServerStatus = null; toast('Теперь это твой сервер на главной'); } catch (e) { fail(e); }
  },
});

const srvVer = () => state.srv.ver || (state.srv.versions || [])[0] || '';
Object.assign(actions, {
  plQuick: (el) => { $('#plQ').value = el.dataset.q; actions.plSearch(); },
  plSearch: async () => {
    const s = state.srv; s.pq = $('#plQ').value.trim();
    try { s.pres = await call('srv:pluginSearch', s.pq, srvVer()); if (!s.pres.length) toast('Ничего не найдено под эту версию. Попробуй другую версию сервера или другой запрос.', 'err'); } catch (e) { fail(e); }
    render();
  },
  plInstall: async (el) => {
    el.disabled = true; el.textContent = '…';
    try { const f = await call('srv:pluginInstall', el.dataset.id, srvVer()); toast('Поставлен: ' + f + '. Перезапусти сервер.'); state.srv.plugins = await call('srv:plugins'); } catch (e) { fail(e); }
    render();
  },
  plRemove: async (el) => { if (!confirm('Удалить плагин?')) return; try { await call('srv:pluginRemove', el.dataset.f); state.srv.plugins = await call('srv:plugins'); } catch (e) { fail(e); } render(); },
});
