const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const P = require('./core/paths');
const store = require('./core/store');
const MC = require('./core/minecraft');
const Loaders = require('./core/loaders');
const Mods = require('./core/mods');
const Auth = require('./core/auth');
const Presets = require('./core/presets');
const Skins = require('./core/skins');
const Social = require('./core/social');
const Premium = require('./core/premium');
const Java = require('./core/java');
const Translate = require('./core/translate');
const LocalServer = require('./core/localserver');
const { ping } = require('./core/ping');
const { launch } = require('./core/launch');

let win = null;
const running = new Map(); // instanceId -> child
let msCancel = null;
let launching = false;
let playingNow = '';
let hideTimer = null;
let hidden = false;
function hideLauncher() { if (win && !win.isDestroyed() && !hidden) { hidden = true; clearTimeout(hideTimer); win.hide(); } }
function showLauncher() { clearTimeout(hideTimer); if (win && !win.isDestroyed()) { if (hidden) { hidden = false; win.show(); } if (win.isMinimized()) win.restore(); win.focus(); } }

function send(ev, data) {
  if (win && !win.isDestroyed()) win.webContents.send(ev, data);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#3fb2ff',
    title: 'BlockForge',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('maximize', () => send('win-state', { maximized: true }));
  win.on('unmaximize', () => send('win-state', { maximized: false }));
}

const gate = app.requestSingleInstanceLock();
if (!gate) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    store.init(app.getPath('userData'), safeStorage);
    P.init(path.join(app.getPath('userData'), 'minecraft'));
    createWindow();
    // если адрес сервера аккаунтов — этот же компьютер, поднимаем встроенный сервер (внешний запущенный не мешает)
    try {
      const u = new URL(store.getConfig().apiUrl.replace('//localhost', '//127.0.0.1'));
      if (u.hostname === '127.0.0.1') {
        process.env.DATA_FILE = path.join(app.getPath('userData'), 'accounts-server.json');
        require('./server-api/server').start(Number(u.port) || 3000).catch(() => {});
      }
    } catch (e) { /* адрес не задан */ }
    setInterval(async () => {
      if (!store.getSession()) return;
      try { const before = Premium.isPremium(); await Social.refresh(); if (before !== Premium.isPremium()) send('session', Social.view()); } catch {}
      if (Premium.isPremium()) Social.status(playingNow);
    }, 45000);
    setTimeout(() => { if (store.getSession()) Social.refresh().then(() => send('session', Social.view())).catch(() => {}); }, 2000);
  });
  app.on('window-all-closed', () => {
    for (const c of running.values()) { try { c.kill(); } catch {} }
    try { LocalServer.stop(); } catch {}
    app.quit();
  });
}

ipcMain.on('win', (_e, action) => {
  if (!win) return;
  if (action === 'min') win.minimize();
  else if (action === 'max') (win.isMaximized() ? win.unmaximize() : win.maximize());
  else if (action === 'close') win.close();
});

/* ---------- помощники ---------- */
function accountsView() {
  const a = store.getAccounts();
  return {
    accounts: a.accounts.map((x) => ({ id: x.id, type: x.type, name: x.name, uuid: x.uuid })),
    selected: a.selected,
  };
}

function findInstance(id) {
  const inst = store.getInstances().find((i) => i.id === id);
  if (!inst) throw new Error('Сборка не найдена');
  return inst;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9а-я]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'build';
}

function createInstance(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Введи название сборки');
  if (!data.mcVersion) throw new Error('Выбери версию Minecraft');
  const loader = data.loader || 'vanilla';
  if (loader !== 'vanilla') Premium.need('mods');
  if (store.getInstances().length >= 1) Premium.need('instances');
  if (loader !== 'vanilla' && !data.loaderVersion) throw new Error('Выбери версию загрузчика');
  const inst = {
    id: slug(name) + '-' + Date.now().toString(36),
    name,
    mcVersion: data.mcVersion,
    loader,
    loaderVersion: loader === 'vanilla' ? null : data.loaderVersion,
    versionId: null,
    ram: Number(data.ram) || store.getConfig().ram,
    jvmArgs: '',
    created: Date.now(),
    lastPlayed: null,
  };
  fs.mkdirSync(path.join(P.p('instances', inst.id), 'mods'), { recursive: true });
  const list = store.getInstances();
  list.push(inst);
  store.saveInstances(list);
  return inst;
}

function makeProgress() {
  let last = 0;
  return (p) => {
    const now = Date.now();
    if (now - last < 80 && p.pct !== 100 && p.pct !== 0) return;
    last = now;
    send('progress', p);
  };
}

/* ---------- обработчики ---------- */
const handlers = {
  'state:get': () => ({
    config: store.getConfig(),
    instances: store.getInstances(),
    accounts: accountsView(),
    dataDir: P.root,
    running: [...running.keys()],
    session: Social.view(),
    paid: Premium.PAID,
    buyUrl: store.getConfig().buyUrl || '',
    langs: Translate.LANGS,
  }),

  'versions:list': async () => {
    const m = await MC.getManifest();
    return {
      latest: m.latest.release,
      versions: m.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })),
    };
  },

  'loaders:versions': (loader, mc) => Loaders.listVersions(loader, mc),

  'instances:create': (data) => createInstance(data),

  'presets:list': () => Presets.list(),
  'presets:create': async (pid) => {
    const p = Presets.get(pid);
    const { mc, lv } = await Presets.pick(p);
    const inst = createInstance({ name: p.name, mcVersion: mc, loader: p.loader, loaderVersion: lv });
    const warnings = [];
    const seen = new Set();
    for (const m of p.mods) {
      try { await Mods.installProject(m, inst, 'mod', seen, warnings); } catch (e) { warnings.push(`${m}: ${e.message}`); }
    }
    return { inst, warnings };
  },

  'instances:setLoader': async (id, loader) => {
    if (running.has(id)) throw new Error('Сначала останови игру');
    const names = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
    const list = store.getInstances();
    const i = list.find((x) => x.id === id);
    if (!i) throw new Error('Сборка не найдена');
    if (loader === 'vanilla') { i.loader = 'vanilla'; i.loaderVersion = null; i.versionId = null; store.saveInstances(list); return i; }
    if (!names[loader]) throw new Error('Неизвестный загрузчик');
    const vs = await Loaders.listVersions(loader, i.mcVersion);
    const pick = vs.find((x) => x.stable) || vs[0];
    if (!pick) throw new Error(`Для Minecraft ${i.mcVersion} нет ${names[loader]}. Выбери другую версию игры или другой загрузчик.`);
    i.loader = loader; i.loaderVersion = pick.id; i.versionId = null;
    store.saveInstances(list);
    return i;
  },

  'mods:addFiles': async (instId, type) => {
    const inst = findInstance(instId);
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Файлы .jar / .zip', extensions: ['jar', 'zip'] }] });
    if (r.canceled) return [];
    const dir = Mods.dirFor(inst, type || 'mod');
    fs.mkdirSync(dir, { recursive: true });
    return r.filePaths.map((f) => { const n = path.basename(f); fs.copyFileSync(f, path.join(dir, n)); return n; });
  },
  'mods:openFolder': (instId, type) => {
    const dir = Mods.dirFor(findInstance(instId), type || 'mod');
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  },
  'mods:update': (instId, type) => Mods.updateAll(findInstance(instId), type || 'mod'),

  'skins:fetch': (name) => Skins.fetchByName(name),
  'skins:setLocal': (dataUrl) => { require('./core/localskin').save(dataUrl); return true; },
  'skins:upload': async (dataUrl, slim) => {
    const data = store.getAccounts();
    const account = data.accounts.find((a) => a.id === data.selected);
    if (!account) throw new Error('Сначала добавь аккаунт');
    if (account.type !== 'microsoft') { require('./core/localskin').save(dataUrl); return 'LOCAL'; }
    const fresh = await Auth.ensureFresh(account, store.getConfig().msClientId);
    await Skins.upload(fresh.mcToken, dataUrl, slim);
    const idx = data.accounts.findIndex((a) => a.id === fresh.id);
    if (idx >= 0) { data.accounts[idx] = fresh; store.saveAccounts(data); }
    return true;
  },

  'servers:ping': (address) => ping(address),

  'instances:update': (id, patch) => {
    const list = store.getInstances();
    const i = list.find((x) => x.id === id);
    if (!i) throw new Error('Сборка не найдена');
    if (patch.name !== undefined && String(patch.name).trim()) i.name = String(patch.name).trim();
    if (patch.ram !== undefined) i.ram = Math.max(512, Number(patch.ram) || i.ram);
    if (patch.jvmArgs !== undefined) i.jvmArgs = String(patch.jvmArgs);
    store.saveInstances(list);
    return i;
  },

  'instances:delete': (id) => {
    if (running.has(id)) throw new Error('Сначала останови игру');
    store.saveInstances(store.getInstances().filter((x) => x.id !== id));
    fs.rmSync(P.p('instances', id), { recursive: true, force: true });
    return true;
  },

  'instances:open': (id) => {
    findInstance(id);
    return shell.openPath(P.p('instances', id));
  },

  /* Java */
  'java:list': () => Java.list(),
  'java:test': (p) => Java.test(String(p || '')),
  'java:pick': async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Выбери java.exe', properties: ['openFile'], filters: [{ name: 'Java', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const t = await Java.test(r.filePaths[0]);
    if (!t.ok) throw new Error('Это не Java: ' + t.error);
    return { path: r.filePaths[0], major: t.major, version: t.version };
  },
  'java:download': (component) => Java.download(component, makeProgress()),

  'app:openData': () => shell.openPath(P.root),
  'app:openUrl': (url) => {
    if (!/^https:\/\//.test(url)) throw new Error('Только https');
    return shell.openExternal(url);
  },

  'config:set': (patch) => {
    const p = {};
    if (patch.ram !== undefined) p.ram = Math.max(512, Number(patch.ram) || 4096);
    if (patch.javaPath !== undefined) p.javaPath = String(patch.javaPath).trim();
    if (patch.buyUrl !== undefined) p.buyUrl = /^https:\/\//.test(String(patch.buyUrl).trim()) ? String(patch.buyUrl).trim().slice(0, 300) : '';
    if (patch.msClientId !== undefined) p.msClientId = String(patch.msClientId).trim();
    if (patch.serverName !== undefined) p.serverName = String(patch.serverName).trim().slice(0, 40);
    if (patch.apiUrl !== undefined) p.apiUrl = String(patch.apiUrl).trim().slice(0, 200);
    if (patch.afterLaunch !== undefined) p.afterLaunch = patch.afterLaunch === 'keep' ? 'keep' : 'hide';
    if (patch.ownerMode !== undefined) p.ownerMode = !!patch.ownerMode;
    if (patch.trTarget !== undefined) p.trTarget = String(patch.trTarget).slice(0, 5);
    if (patch.serverAddr !== undefined) p.serverAddr = String(patch.serverAddr).trim().slice(0, 100);
    return store.setConfig(p);
  },

  /* аккаунты */
  'accounts:addOffline': (name) => {
    name = String(name || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Ник: 3–16 символов, латиница, цифры и _');
    const data = store.getAccounts();
    const uuid = Auth.offlineUuid(name);
    const id = 'off-' + uuid;
    if (!data.accounts.find((a) => a.id === id)) data.accounts.push({ id, type: 'offline', name, uuid });
    data.selected = id;
    store.saveAccounts(data);
    return accountsView();
  },

  'accounts:select': (id) => {
    const data = store.getAccounts();
    if (data.accounts.find((a) => a.id === id)) { data.selected = id; store.saveAccounts(data); }
    return accountsView();
  },

  'accounts:remove': (id) => {
    const data = store.getAccounts();
    data.accounts = data.accounts.filter((a) => a.id !== id);
    if (data.selected === id) data.selected = data.accounts[0] ? data.accounts[0].id : null;
    store.saveAccounts(data);
    return accountsView();
  },

  'auth:ms': async () => {
    const clientId = store.getConfig().msClientId;
    if (!clientId) throw new Error('Для входа через Microsoft укажи Client ID в «Настройках» (инструкция в README).');
    if (msCancel) msCancel.cancelled = true;
    const cancel = { cancelled: false };
    msCancel = cancel;
    const dev = await Auth.beginDevice(clientId);
    send('ms-code', { code: dev.user_code, url: dev.verification_uri });
    shell.openExternal(dev.verification_uri);
    try {
      const tokens = await Auth.pollDevice(clientId, dev, cancel);
      const acc = await Auth.loginFromMsTokens(tokens);
      const data = store.getAccounts();
      data.accounts = data.accounts.filter((a) => a.id !== acc.id);
      data.accounts.push(acc);
      data.selected = acc.id;
      store.saveAccounts(data);
      return accountsView();
    } finally {
      if (msCancel === cancel) msCancel = null;
    }
  },

  'auth:msCancel': () => { if (msCancel) msCancel.cancelled = true; return true; },

  /* запуск */
  'game:launch': async (id, server) => {
    if (launching) throw new Error('Уже идёт подготовка к запуску');
    if (running.has(id)) throw new Error('Игра уже запущена');
    launching = true;
    try {
      const inst = findInstance(id);
      if (inst.loader && inst.loader !== 'vanilla') Premium.need('mods');
      const data = store.getAccounts();
      const account = data.accounts.find((a) => a.id === data.selected);
      const config = store.getConfig();
      const progress = makeProgress();
      const hide = config.afterLaunch !== 'keep';
      const log = (l) => {
        send('log', l);
        if (hide && /Setting user:|Backend library|Created: \d+x\d+|OpenAL initialized|Sound engine started/.test(l)) hideLauncher();
      };
      playingNow = server && server.host ? server.host + (server.port && server.port !== 25565 ? ':' + server.port : '') : inst.name;
      send('log', `=== ${inst.name} (${inst.mcVersion}${inst.loader !== 'vanilla' ? ', ' + inst.loader : ''}) ===`);
      const res = await launch(inst, account, config, {
        progress, log,
        onExit: (code) => {
          running.delete(id);
          playingNow = '';
          showLauncher();
          send('game-state', { id, running: false, code });
          send('log', `Игра закрыта (код ${code})`);
        },
      }, server);
      running.set(id, res.child);

      // сохраняем versionId, обновлённый токен и время запуска
      const list = store.getInstances();
      const i = list.find((x) => x.id === id);
      if (i) { i.versionId = res.versionId; i.lastPlayed = Date.now(); store.saveInstances(list); }
      if (res.account && res.account.type === 'microsoft') {
        const d = store.getAccounts();
        const idx = d.accounts.findIndex((a) => a.id === res.account.id);
        if (idx >= 0) { d.accounts[idx] = res.account; store.saveAccounts(d); }
      }
      if (hide) hideTimer = setTimeout(hideLauncher, 30000); // запасной вариант, если в логе нет маркера
      send('game-state', { id, running: true });
      send('progress', { text: 'Игра запущена', pct: 100 });
      return { pid: res.child.pid };
    } catch (e) {
      playingNow = '';
      showLauncher();
      throw e;
    } finally {
      launching = false;
    }
  },

  'game:stop': (id) => {
    const c = running.get(id);
    if (c) c.kill();
    return true;
  },

  /* аккаунт BlockForge и друзья */
  'social:register': (n, p) => Social.register(n, p),
  'social:login': (l, p) => Social.login(l, p),
  'social:logout': () => Social.logout(),
  'social:refresh': () => Social.refresh(),
  'social:redeem': (code) => Social.redeem(code),
  'social:friends': () => Social.friends(),
  'social:chat': (w, after) => Social.chat(w, after),
  'social:send': (to, text, kind, server) => Social.send(to, text, kind, server),
  'social:add': (id) => Social.add(id),
  'social:accept': (id) => Social.accept(id),
  'social:decline': (id) => Social.decline(id),
  'social:remove': (id) => Social.remove(id),

  /* переводчик */
  'tr:translate': (text, from, to) => Translate.translate(text, from, to),

  /* свой сервер */
  'srv:status': () => LocalServer.status(),
  'srv:versions': async () => (await LocalServer.paperVersions()).slice(0, 25),
  'srv:start': (opts) => LocalServer.start(opts, {
    javaPath: store.getConfig().javaPath,
    log: (l) => send('srv-log', l),
    progress: makeProgress(),
    onExit: (code) => { send('srv-log', 'Сервер остановлен (код ' + code + ')'); send('srv-state', { running: false }); },
  }).then((r) => { send('srv-state', { running: true }); return r; }),
  'srv:plugins': () => LocalServer.pluginList(),
  'srv:pluginSearch': (q, v) => LocalServer.pluginSearch(q, v),
  'srv:pluginInstall': (id, v) => LocalServer.pluginInstall(id, v),
  'srv:pluginRemove': (f) => LocalServer.pluginRemove(f),
  'srv:stop': () => LocalServer.stop(),
  'srv:openFolder': () => { const d = LocalServer.status().dir; fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); },
  'srv:cmd': (c) => LocalServer.command(c),

  /* моды */
  'mods:search': (instId, query, type, offset) => Mods.search({ query, inst: instId ? findInstance(instId) : null, type, offset }),
  'mods:install': async (instId, projectId, type) => {
    const warnings = [];
    const files = await Mods.installProject(projectId, findInstance(instId), type || 'mod', new Set(), warnings);
    return { files, warnings };
  },
  'mods:list': (instId, type) => Mods.list(findInstance(instId), type),
  'mods:toggle': (instId, file, type) => Mods.toggle(findInstance(instId), file, type),
  'mods:remove': (instId, file, type) => Mods.remove(findInstance(instId), file, type),
};

ipcMain.handle('rpc', async (_e, name, args) => {
  try {
    const fn = handlers[name];
    if (!fn) throw new Error('Неизвестная команда: ' + name);
    if (Premium.GATES[name]) Premium.need(Premium.GATES[name]);
    return { ok: true, data: await fn(...(args || [])) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});
