/* Премиум: что платно, окно покупки, ввод кода, замки на вкладках, настройки Java */
/* global state, actions, call, toast, $, $$, esc, render, go, ICON, openModal, closeModal, GROUPS, PAGE_GROUP, drawProfile, hydrateArt, pages, fail */
(function () {
  const PERKS = [
    ['mods', 'puzzle', 'Моды и загрузчики', 'Fabric, Quilt, Forge, NeoForge и каталог Modrinth: моды, шейдеры, ресурспаки'],
    ['skins', 'shirt', 'Скины', 'Готовые скины, редактор и загрузка своего PNG'],
    ['friends', 'users', 'Друзья и чаты', 'Друзья по ID, личные чаты и приглашения играть'],
    ['myserver', 'server', 'Свой сервер', 'Выживание, анархия, мини-игры и плагины в пару кликов'],
    ['instances', 'grid', 'Много сборок', 'Сколько угодно профилей игры (бесплатно одна сборка)'],
    ['language', 'globe', 'Язык интерфейса', 'Весь лаунчер на другом языке'],
  ];
  const LOCKED = { mods: 'mods', skins: 'skins', friends: 'friends', chat: 'friends', myserver: 'myserver' };
  const NAV_LOCK = { mods: 'mods', skins: 'skins', friends: 'friends' };
  const isPrem = () => !!(state.session && state.session.premium);
  window.isPremium = isPrem;
  const fmt = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const perksHtml = (hl) => `<ul class="perks">${PERKS.map(([k, ic, t, d]) => `<li class="${k === hl ? 'hl' : ''}"><span class="pi">${ICON(ic)}</span><span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ul>`;

  function buyBlock() {
    if (!state.session) {
      return `<div class="buy"><p class="muted">Премиум привязывается к аккаунту BlockForge. Сначала создай аккаунт или войди.</p>
        <button class="btn neon" data-act="needAccount">Создать аккаунт / войти</button></div>`;
    }
    return `<div class="buy">
      <div class="price-row"><span class="price">$1</span><span class="muted">в месяц</span></div>
      <button class="btn neon big" data-act="buyPremium">${ICON('crown')}Купить Премиум</button>
      <div class="code-row"><input type="text" id="premCode" placeholder="Есть код? BF-XXXX-XXXX-XXXX" maxlength="24" autocomplete="off"><button class="btn" data-act="redeemCode">Активировать</button></div>
    </div>`;
  }

  function premiumCard() {
    if (isPrem()) {
      return `<div class="prem on"><div class="pcrown">${ICON('crown')}</div><div><h2>Премиум активен</h2><p class="muted">Действует до ${fmt(state.session.premiumUntil).replace(/\.$/, '')}. Спасибо, что поддерживаешь BlockForge!</p></div>
        <div class="code-row"><input type="text" id="premCode" placeholder="Продлить кодом: BF-XXXX-XXXX-XXXX" maxlength="24" autocomplete="off"><button class="btn" data-act="redeemCode">Активировать</button></div></div>`;
    }
    return `<div class="prem"><div><h2>${ICON('crown')}Премиум</h2><p class="muted">Бесплатно можно играть в обычный Minecraft. Всё остальное открывает Премиум.</p>${perksHtml()}</div>${buyBlock()}</div>`;
  }
  premiumCardFn = premiumCard;

  function lockCard(feat) {
    const p = PERKS.find((x) => x[0] === feat) || PERKS[0];
    return `<div class="lockview glass"><div class="lock-ic">${ICON('lock')}</div>
      <h1>${p[2]}: функция Премиума</h1><p class="muted">${p[3]}.</p>
      <div class="lock-grid">${perksHtml(feat)}${buyBlock()}</div></div>`;
  }

  function paywall(feat) {
    openModal(`<div class="paywall"><button class="btn icon x" data-act="closePaywall" aria-label="Закрыть">×</button>${lockCard(feat)}</div>`);
    const d = $('#modal .dialog'); if (d) d.classList.add('wide');
  }
  window.openPaywall = paywall;

  /* ---------- замки: подмена render ---------- */
  const baseRender = render;
  render = function () {
    const feat = LOCKED[state.page];
    if (!feat || isPrem()) { baseRender(); decorate(); return; }
    const v = $('#view'); v.innerHTML = ''; drawProfile();
    const g = PAGE_GROUP[state.page] && GROUPS[PAGE_GROUP[state.page]];
    const tabs = g ? `<div class="tabs">${g.tabs.filter((t) => t[2] !== 'owner' || (state.config && state.config.ownerMode) || state.page === t[0]).map(([id, n]) => `<span class="tab ${id === state.page ? 'on' : ''}" data-page="${id}">${esc(n)}${LOCKED[id] ? ICON('lock', 'tl') : ''}</span>`).join('')}</div>` : '';
    v.innerHTML = `<div class="page">${tabs}${lockCard(feat)}</div>`;
    decorate();
    if (typeof hydrateArt === 'function') hydrateArt();
  };
  function decorate() {
    $$('.nav-item').forEach((n) => {
      const f = NAV_LOCK[n.dataset.page]; let l = n.querySelector('.nl');
      if (f && !isPrem()) { if (!l) { l = document.createElement('i'); l.className = 'nl'; l.innerHTML = ICON('lock'); n.appendChild(l); } } else if (l) l.remove();
    });
    let b = $('#premBtn');
    if (!b) { b = document.createElement('button'); b.id = 'premBtn'; b.dataset.act = 'openPrem'; const pr = $('#profile'); pr.parentNode.insertBefore(b, pr); }
    b.className = 'prem-btn' + (isPrem() ? ' on' : '');
    b.innerHTML = ICON('crown') + (isPrem() ? '<span><b>Премиум</b><small>до ' + new Date(state.session.premiumUntil).toLocaleDateString('ru-RU') + '</small></span>' : '<span><b>Получить Премиум</b><small>$1 в месяц</small></span>');
  }

  /* ---------- действия ---------- */
  const A = {
    openPrem: () => { go('settings'); setTimeout(() => { const c = $('#premCard'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }, 50); },
    closePaywall: () => closeModal(),
    needAccount: () => { closeModal(); if (window.showWelcome) window.showWelcome(); },
    buyPremium: async () => {
      if (state.buyUrl) { try { await call('app:openUrl', state.buyUrl); toast('После оплаты придёт код. Введи его здесь и нажми «Активировать».'); } catch (e) { fail(e); } return; }
      toast('Приём оплаты скоро откроется. Если у тебя уже есть код, введи его ниже.', 'ok');
    },
    redeemCode: async () => {
      const code = ($('#premCode') || {}).value || '';
      if (!code.trim()) return toast('Введи код', 'err');
      try {
        const r = await call('social:redeem', code);
        state.session = { id: r.id, nick: r.nick, premium: r.premium, premiumUntil: r.premiumUntil };
        closeModal(); toast('Премиум включён до ' + fmt(r.premiumUntil).replace(/\.$/, '') + '. Приятной игры!'); render();
      } catch (e) { toast(e.message, 'err'); }
    },
    ramSet: (el) => { $('#ram').value = el.dataset.v; $('#ramVal').textContent = el.dataset.v + ' МБ'; $$('.chips .chip[data-act=ramSet]').forEach((c) => c.classList.toggle('on', c === el)); },
    javaUse: async (el) => {
      try { state.config = await call('config:set', { javaPath: el.dataset.path }); const h = $('#javaPath'); if (h) h.value = state.config.javaPath; $$('.opt').forEach((o) => o.classList.toggle('on', o.contains(el))); toast(el.dataset.path ? 'Java выбрана' : 'Java: автоматически'); } catch (e) { fail(e); }
    },
    javaPick: async () => {
      try {
        const r = await call('java:pick'); if (!r) return;
        state.config = await call('config:set', { javaPath: r.path }); state.java = null; toast('Выбрана Java ' + r.major); render();
      } catch (e) { fail(e); }
    },
    javaTest: async () => {
      const m = $('#javaMsg'); m.textContent = 'Проверяю…';
      const r = await call('java:test', state.config.javaPath).catch((e) => ({ ok: false, error: e.message }));
      m.textContent = r.ok ? 'Работает: Java ' + r.major + ' (' + r.version + ')' : 'Не работает: ' + r.error;
    },
    javaRescan: () => { state.java = null; render(); },
    javaDl: async (el) => {
      el.disabled = true; el.textContent = 'Скачиваю…';
      try { await call('java:download', el.dataset.c); toast('Java скачана'); state.java = null; render(); } catch (e) { fail(e); el.disabled = false; el.textContent = 'Скачать'; }
    },
  };
  Object.assign(actions, A);

  // выбор загрузчика при создании сборки открывает окно покупки без лишних запросов
  const origLoader = actions.cLoader;
  actions.cLoader = (el, e) => { if (el.dataset.v !== 'vanilla' && !isPrem()) return paywall('mods'); return origLoader(el, e); };
  const origNew = actions.newInstance;
  actions.newInstance = (el, e) => { if (state.instances.length >= 1 && !isPrem()) return paywall('instances'); return origNew(el, e); };

  // ошибки «нужен Премиум» из лаунчера и сервера превращаем в окно покупки
  const baseFail = fail;
  fail = function (e) {
    const msg = (e && e.message) || String(e);
    if (/Премиум/.test(msg)) { const f = PERKS.find((p) => msg.includes(p[2])); return paywall(f ? f[0] : 'mods'); }
    return baseFail(e);
  };

  // язык интерфейса: только для Премиума
  document.addEventListener('click', (e) => {
    if (e.target.closest('#langBtn') && !isPrem()) { e.stopPropagation(); e.preventDefault(); paywall('language'); }
  }, true);

  window.api.on('session', (s) => { state.session = s; if (typeof drawProfile === 'function') drawProfile(); decorate(); if (['settings'].includes(state.page) || LOCKED[state.page]) render(); });

  let tries = 0;
  (function wait() { if (state.config && state.config.ram !== undefined) { state.buyUrl = state.buyUrl || state.config.buyUrl || ''; render(); return; } if (++tries < 60) setTimeout(wait, 150); })();
})();
