/* Язык интерфейса: весь текст лаунчера переводится на выбранный язык.
   Не переводятся: название BlockForge, ники, названия сборок и серверов, текст чатов.
   Английский — готовый словарь; остальные языки — автоперевод (MyMemory) с запоминанием. */
/* global state, call, toast, $, $$ */
(function () {
  const LANGS = { ru: ['RU', 'Русский'], en: ['EN', 'English'], uk: ['UK', 'Українська'], de: ['DE', 'Deutsch'], es: ['ES', 'Español'], fr: ['FR', 'Français'], pt: ['PT', 'Português'], pl: ['PL', 'Polski'], tr: ['TR', 'Türkçe'], zh: ['ZH', '中文'] };
  const CYR = /[А-Яа-яЁё]/;
  const NUM = /\d+(?:[.,:]\d+)*/g;
  const SKIP = 'SCRIPT,STYLE,TEXTAREA,INPUT,PRE,CANVAS,.msgs,.no-tr,#prev';

  let lang = 'ru';
  try { lang = localStorage.getItem('lang') || 'ru'; } catch {}
  if (!LANGS[lang]) lang = 'ru';

  // словарь с нормализованными ключами
  const DICT = {};
  const normNum = (s) => s.replace(NUM, '{n}');
  for (const [k, v] of Object.entries(window.I18N_EN || {})) DICT[normNum(k)] = normNum(v);

  let cache = {};
  const loadCache = () => { try { cache = JSON.parse(localStorage.getItem('i18n:' + lang) || '{}'); } catch { cache = {}; } };
  const saveCache = () => { try { localStorage.setItem('i18n:' + lang, JSON.stringify(cache)); } catch {} };

  const orig = new WeakMap(); // узел -> исходный русский текст
  const origAttr = new WeakMap(); // элемент -> {attr: русский}
  let busy = false;

  // имена, которые переводить нельзя (ники, названия сборок и серверов)
  function protectedNames() {
    const out = new Set(['BlockForge']);
    const add = (x) => { if (x && String(x).length > 1) out.add(String(x)); };
    try {
      if (state.session) add(state.session.nick);
      (state.accounts || []).forEach((a) => add(a.name));
      (state.instances || []).forEach((i) => add(i.name));
      (state.servers || []).forEach((s) => add(s.name));
      add(state.config && state.config.serverName);
      const d = state.fr && state.fr.data;
      if (d) [...d.friends, ...d.incoming, ...d.outgoing].forEach((f) => add(f.nick));
      (window.SKINPACK || []).forEach((s) => add(s.name));
    } catch {}
    return [...out].filter((n) => CYR.test(n) || n === 'BlockForge').sort((a, b) => b.length - a.length);
  }

  // text -> {key, nums, names}
  function prepare(text, names) {
    const ns = [], ps = [];
    let t = text;
    for (const n of names) {
      if (n === 'BlockForge' || !t.includes(n)) continue;
      t = t.split(n).join('\u0001' + ps.length + '\u0002'); ps.push(n);
    }
    t = t.replace(NUM, (m) => { ns.push(m); return '{n}'; });
    return { key: t, nums: ns, names: ps };
  }
  function restore(t, p) {
    let i = 0;
    t = t.replace(/\{n\}/g, () => (i < p.nums.length ? p.nums[i++] : '{n}'));
    return t.replace(/\u0001(\d+)\u0002/g, (_, k) => p.names[+k] || '');
  }

  // MT-очередь
  const queue = new Map(); // key -> Set(callbacks)
  let running = false, pauseUntil = 0, warned = false;
  async function pump() {
    if (running) return; running = true;
    while (queue.size) {
      if (Date.now() < pauseUntil) break;
      const [key] = queue.keys();
      const waiters = queue.get(key); queue.delete(key);
      const safe = key.replace(/\u0001(\d+)\u0002/g, 'ZQ$1Z'); // защищённые имена
      try {
        let r = await call('tr:translate', safe, 'ru', lang === 'zh' ? 'zh-CN' : lang);
        r = r.replace(/ZQ(\d+)Z/g, '\u0001$1\u0002');
        cache[key] = r; saveCache();
        waiters.forEach((f) => f());
      } catch (e) {
        pauseUntil = Date.now() + 120000;
        if (!warned) { warned = true; toast('Автоперевод временно недоступен. Часть текста останется на русском.', 'err'); }
        queue.set(key, waiters);
        break;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    running = false;
    if (queue.size && Date.now() < pauseUntil) setTimeout(pump, pauseUntil - Date.now() + 100);
  }

  function lookup(text, onLater) {
    const names = protectedNames();
    const p = prepare(text, names);
    if (!/[А-Яа-яЁё]/.test(p.key.replace(/\u0001\d+\u0002/g, ''))) return null; // после защиты кириллицы не осталось
    let res = lang === 'en' ? DICT[p.key] : undefined;
    if (res === undefined) res = cache[p.key];
    if (res !== undefined) return restore(res, p);
    if ((p.key.match(/[А-Яа-яЁё]/g) || []).length <= 3) return null; // единицы вроде «МБ» только по словарю
    if (lang !== 'ru' && onLater) {
      if (!queue.has(p.key)) queue.set(p.key, new Set());
      queue.get(p.key).add(onLater);
      pump();
    }
    return null;
  }

  const skipEl = (el) => !el || el.closest(SKIP);
  let pending = null;
  const later = () => { clearTimeout(pending); pending = setTimeout(() => apply(document.body), 80); };

  function tr(text) {
    const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m[2]) return null;
    const r = lookup(m[2], later);
    return r === null ? null : m[1] + r + m[3];
  }

  function apply(root) {
    if (busy) return; busy = true;
    try {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = []; let n;
      while ((n = w.nextNode())) nodes.push(n);
      for (const node of nodes) {
        const o = orig.get(node);
        if (o !== undefined && node.nodeValue !== o && lang === 'ru') { node.nodeValue = o; orig.delete(node); continue; }
        if (lang === 'ru') continue;
        if (skipEl(node.parentElement)) continue;
        const src = o !== undefined ? o : node.nodeValue;
        if (!CYR.test(src)) continue;
        const t = tr(src);
        if (t !== null) { if (o === undefined) orig.set(node, src); node.nodeValue = t; }
      }
      const els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title]') : [];
      for (const el of els) {
        if (skipEl(el)) continue;
        for (const a of ['placeholder', 'title']) {
          const cur = el.getAttribute(a); if (cur === null) continue;
          const store = origAttr.get(el) || {};
          const src = store[a] !== undefined ? store[a] : cur;
          if (lang === 'ru') { if (store[a] !== undefined) { el.setAttribute(a, store[a]); delete store[a]; } continue; }
          if (!CYR.test(src)) continue;
          const t = tr(src);
          if (t !== null) { store[a] = src; origAttr.set(el, store); el.setAttribute(a, t); }
        }
      }
    } finally { busy = false; }
  }

  // новые узлы
  const mo = new MutationObserver((recs) => {
    if (busy || lang === 'ru') return;
    let need = false;
    for (const r of recs) { if (r.addedNodes.length || r.type === 'characterData') { need = true; break; } }
    if (need) { clearTimeout(pending); pending = setTimeout(() => apply(document.body), 30); }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  function set(code) {
    if (!LANGS[code]) return;
    // вернуть русский текст перед переключением
    const saved = lang; lang = 'ru'; apply(document.body); lang = saved;
    lang = code;
    try { localStorage.setItem('lang', code); } catch {}
    document.documentElement.lang = code;
    warned = false; pauseUntil = 0; loadCache();
    syncBtn();
    if (typeof render === 'function') render();
    apply(document.body);
  }

  /* ---------- кнопка выбора языка в шапке ---------- */
  function syncBtn() { const b = $('#langBtn'); if (b) b.querySelector('span').textContent = LANGS[lang][0]; }
  function buildBtn() {
    const box = $('.tb-btns'); if (!box) return;
    const b = document.createElement('button');
    b.id = 'langBtn'; b.className = 'lang-btn'; b.title = 'Язык интерфейса';
    b.innerHTML = window.ICON('globe') + '<span></span>';
    box.insertBefore(b, box.firstChild);
    const menu = document.createElement('div');
    menu.id = 'langMenu'; menu.className = 'lang-menu hidden';
    menu.innerHTML = Object.entries(LANGS).map(([k, [, n]]) => `<div class="lang-item no-tr" data-lang="${k}">${n}</div>`).join('');
    document.body.appendChild(menu);
    b.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
    menu.addEventListener('click', (e) => { const it = e.target.closest('[data-lang]'); if (it) { menu.classList.add('hidden'); set(it.dataset.lang); } });
    document.addEventListener('click', () => menu.classList.add('hidden'));
    syncBtn();
  }

  window.I18N = { set, get: () => lang, LANGS, apply: () => apply(document.body) };
  loadCache();
  buildBtn();
  document.documentElement.lang = lang;
  if (lang !== 'ru') apply(document.body);
})();
