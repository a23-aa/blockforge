/* Первый запуск: регистрация / вход (как в TLauncher), либо игра без аккаунта */
/* global state, actions, call, toast, $, esc, render, go, passScore, passHint, PASS_LABEL, PASS_COLOR */
(function () {
  const isGuest = () => { try { return localStorage.getItem('guest') === '1'; } catch { return false; } };
  const setGuest = (v) => { try { v ? localStorage.setItem('guest', '1') : localStorage.removeItem('guest'); } catch {} };
  let mode = 'reg', err = '', busy = false, nick = '';

  function close() { const w = $('#welcome'); if (w) w.remove(); }

  async function finish(session) {
    state.session = session; state.fr.data = null; setGuest(false);
    try {
      const a = await call('accounts:addOffline', session.nick); // игровой профиль с тем же ником
      state.accounts = a.accounts; state.selectedAccount = a.selected;
    } catch (e) { /* ник мог не подойти под правила игры */ }
    close(); toast('Добро пожаловать, ' + session.nick + '! Твой ID: ' + session.id); render();
  }

  function draw() {
    let w = $('#welcome');
    if (!w) { w = document.createElement('div'); w.id = 'welcome'; document.body.appendChild(w); }
    w.innerHTML = `<div class="wl-art" id="wlArt"></div>
      <div class="wl-card">
        <div class="wl-brand"><img src="logo.svg" alt=""><span>BlockForge</span></div>
        <h1>${mode === 'reg' ? 'Создай аккаунт' : 'С возвращением'}</h1>
        <p class="muted">${mode === 'reg' ? 'Один аккаунт для друзей, чатов и приглашений. Придумай ник и пароль.' : 'Войди по нику или ID и паролю.'}</p>
        <div class="chips"><span class="chip ${mode === 'reg' ? 'on' : ''}" data-wl="reg">Регистрация</span><span class="chip ${mode === 'login' ? 'on' : ''}" data-wl="login">Вход</span></div>
        <label class="f">${mode === 'reg' ? 'Ник (3–16, латиница, цифры, _)' : 'Ник или ID'}<input type="text" id="wlNick" maxlength="16" value="${esc(nick)}" autocomplete="username"></label>
        <label class="f">Пароль<input type="password" id="wlPass" autocomplete="${mode === 'reg' ? 'new-password' : 'current-password'}"></label>
        ${mode === 'reg' ? `<div class="pmeter"><div class="pbar"><i id="wpFill"></i></div><b id="wpLabel"></b></div><div class="muted" id="wpHint" style="font-size:12.5px"></div>
        <label class="f">Повтори пароль<input type="password" id="wlPass2" autocomplete="new-password"></label>` : ''}
        <div class="warn err" id="wlErr" ${err ? '' : 'style="display:none"'}>${esc(err)}</div>
        <button class="btn neon big" id="wlGo" data-wl="go" ${busy ? 'disabled' : ''}>${busy ? 'Подожди…' : mode === 'reg' ? 'Создать аккаунт' : 'Войти'}</button>
        <div class="wl-or"><span>или</span></div>
        <div class="row wrap" style="gap:10px"><button class="btn" data-wl="ms">${window.ICON('users')}Войти через Microsoft</button><button class="btn" data-wl="guest">Играть без аккаунта</button></div>
        <div class="muted" style="font-size:12px">Без аккаунта BlockForge и без Microsoft друзья и чаты недоступны, остальное работает.</div>
      </div>`;
    const art = $('#wlArt');
    if (window.mcIsland) setTimeout(() => { try { const r = window.mcIsland('home', true, 3); art.innerHTML = `<div class="lay l0"><img src="${r.bg}" alt=""></div><div class="lay l1 fl"><img src="${r.isl}" alt=""></div><div class="lay l2"><img src="${r.cl}" alt=""></div>`; } catch {} }, 30);
    const pw = $('#wlPass');
    const upd = () => {
      if (mode !== 'reg') return;
      const n = $('#wlNick').value, s = passScore(pw.value, n);
      $('#wpFill').style.width = pw.value ? (s + 1) * 20 + '%' : '0'; $('#wpFill').style.background = PASS_COLOR[s];
      $('#wpLabel').textContent = pw.value ? PASS_LABEL[s] : ''; $('#wpHint').textContent = passHint(pw.value, n);
    };
    pw.addEventListener('input', upd); $('#wlNick').addEventListener('input', upd); upd();
    w.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
    $('#wlNick').focus();
  }

  async function submit() {
    if (busy) return;
    nick = $('#wlNick').value.trim();
    const p = $('#wlPass').value;
    if (mode === 'reg') {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) { err = 'Ник: 3–16 символов, латиница, цифры и _'; return draw(); }
      if ($('#wlPass2').value !== p) { err = 'Пароли не совпадают'; return draw(); }
      if (passScore(p, nick) < 2) { err = passHint(p, nick); return draw(); }
    } else if (!nick || !p) { err = 'Введи ник и пароль'; return draw(); }
    busy = true; err = ''; draw();
    try {
      const s = mode === 'reg' ? await call('social:register', nick, p) : await call('social:login', nick, p);
      busy = false; await finish(s);
    } catch (e) { busy = false; err = e.message; draw(); }
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-wl]'); if (!t) return;
    const a = t.dataset.wl;
    if (a === 'reg' || a === 'login') { mode = a; err = ''; nick = $('#wlNick') ? $('#wlNick').value : nick; draw(); }
    else if (a === 'go') submit();
    else if (a === 'guest') { setGuest(true); close(); render(); }
    else if (a === 'ms') { setGuest(true); close(); go('accounts'); actions.msLogin(); }
  });

  // показать при старте, когда состояние загружено
  let tries = 0;
  (function wait() {
    if (state.config && state.config.ram !== undefined) { if (!state.session && !isGuest()) draw(); return; }
    if (++tries < 60) setTimeout(wait, 150);
  })();

  // повторно позвать окно регистрации (например, с вкладки «Друзья»)
  window.showWelcome = () => { setGuest(false); mode = 'reg'; draw(); };
})();
