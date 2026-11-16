const fs = require('fs');
const path = require('path');
const os = require('os');
const P = require('./paths');
const { fetchJson, download, pool } = require('./util');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const JAVA_ALL_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const LIB_BASE = 'https://libraries.minecraft.net/';

/* ---------- манифест версий ---------- */
let manifestCache = null;
async function getManifest() {
  if (manifestCache) return manifestCache;
  const file = P.p('cache', 'manifest.json');
  try {
    manifestCache = await fetchJson(MANIFEST_URL);
    fs.writeFileSync(file, JSON.stringify(manifestCache));
  } catch (e) {
    try { manifestCache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw e; }
  }
  return manifestCache;
}

function versionJsonPath(id) { return P.p('versions', id, id + '.json'); }
function readVersionJson(id) { return JSON.parse(fs.readFileSync(versionJsonPath(id), 'utf8')); }

async function installVanillaMeta(id) {
  const jf = versionJsonPath(id);
  if (fs.existsSync(jf)) return readVersionJson(id);
  const m = await getManifest();
  const e = m.versions.find((v) => v.id === id);
  if (!e) throw new Error('Версия не найдена: ' + id);
  const json = await fetchJson(e.url);
  fs.mkdirSync(path.dirname(jf), { recursive: true });
  fs.writeFileSync(jf, JSON.stringify(json));
  return json;
}

/* ---------- правила (rules) ---------- */
function archName() {
  return process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'x86' : 'x64';
}

function ruleOk(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== 'windows') match = false;
      if (r.os.arch && r.os.arch !== archName()) match = false;
      if (r.os.version) {
        try { if (!new RegExp(r.os.version).test(os.release())) match = false; } catch { match = false; }
      }
    }
    if (r.features) {
      for (const [k, v] of Object.entries(r.features)) {
        if (!!features[k] !== !!v) match = false;
      }
    }
    if (match) allowed = r.action === 'allow';
  }
  return allowed;
}

/* ---------- слияние версий (inheritsFrom) ---------- */
function libKey(lib) {
  const [g, a, , c] = String(lib.name).split(':');
  return `${g}:${a}${c ? ':' + c : ''}`;
}
function dedupeLibs(list) {
  const seen = new Set();
  const out = [];
  for (const l of list) {
    const k = libKey(l);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

function resolveVersion(id) {
  const v = readVersionJson(id);
  if (!v.inheritsFrom) {
    v.jarId = v.jar || id;
    return v;
  }
  const parent = resolveVersion(v.inheritsFrom);
  const m = { ...parent, ...v };
  m.libraries = dedupeLibs([...(v.libraries || []), ...(parent.libraries || [])]);
  if (parent.arguments || v.arguments) {
    m.arguments = {
      game: [...(parent.arguments?.game || []), ...(v.arguments?.game || [])],
      jvm: [...(parent.arguments?.jvm || []), ...(v.arguments?.jvm || [])],
    };
  }
  if (!v.minecraftArguments && parent.minecraftArguments) m.minecraftArguments = parent.minecraftArguments;
  m.assetIndex = v.assetIndex || parent.assetIndex;
  m.assets = v.assets || parent.assets;
  m.javaVersion = v.javaVersion || parent.javaVersion;
  m.downloads = parent.downloads || v.downloads;
  m.logging = v.logging || parent.logging;
  m.id = v.id;
  m.jarId = v.jar || parent.jarId;
  delete m.inheritsFrom;
  return m;
}

/* ---------- библиотеки ---------- */
function mavenPath(name) {
  let ext = 'jar';
  let n = name;
  if (n.includes('@')) { [n, ext] = n.split('@'); }
  const [g, a, v, c] = n.split(':');
  const file = `${a}-${v}${c ? '-' + c : ''}.${ext}`;
  return `${g.replace(/\./g, '/')}/${a}/${v}/${file}`;
}

function libraryFiles(lib) {
  if (!ruleOk(lib.rules)) return [];
  const out = [];
  const d = lib.downloads;
  if (d && d.artifact) {
    out.push({ path: d.artifact.path || mavenPath(lib.name), url: d.artifact.url, sha1: d.artifact.sha1, size: d.artifact.size, cp: true });
  } else if (!d) {
    const pp = mavenPath(lib.name);
    out.push({ path: pp, url: (lib.url || LIB_BASE) + pp, cp: true });
  }
  if (lib.natives && lib.natives.windows) {
    const cls = lib.natives.windows.replace('${arch}', process.arch === 'ia32' ? '32' : '64');
    const a = d && d.classifiers && d.classifiers[cls];
    if (a) {
      out.push({ path: a.path, url: a.url, sha1: a.sha1, size: a.size, native: true, exclude: (lib.extract && lib.extract.exclude) || [] });
    }
  }
  return out;
}

/* ---------- установка файлов игры ---------- */
async function prepare(versionId, progress = () => {}) {
  const v = resolveVersion(versionId);

  // быстрый путь: всё уже скачано и проверено раньше — не трогаем ~4000 файлов
  const ready = P.p('versions', versionId, '.ready');
  const jar0 = P.p('versions', v.jarId, v.jarId + '.jar');
  if (fs.existsSync(ready) && fs.existsSync(jar0)) return v;

  // клиентский jar
  const jarFile = P.p('versions', v.jarId, v.jarId + '.jar');
  if (!fs.existsSync(jarFile)) {
    const c = v.downloads && v.downloads.client;
    if (!c) throw new Error('Нет клиентского jar для ' + v.jarId);
    progress({ text: 'Скачиваю клиент игры', pct: 0 });
    await download(c.url, jarFile, { size: c.size, sha1: c.sha1 });
  }

  // библиотеки
  const files = [];
  for (const lib of v.libraries) files.push(...libraryFiles(lib));
  let done = 0;
  progress({ text: 'Библиотеки', pct: 0 });
  await pool(files, 24, async (f) => {
    const dest = P.p('libraries', f.path);
    if (!f.url) {
      if (!fs.existsSync(dest)) throw new Error('Не найдена библиотека (её должен создать установщик): ' + f.path);
    } else {
      await download(f.url, dest, { size: f.size, sha1: f.sha1 });
    }
    done++;
    progress({ text: `Библиотеки ${done}/${files.length}`, pct: Math.round((done / files.length) * 100) });
  });

  // индекс и ассеты
  if (v.assetIndex) {
    const idx = v.assetIndex;
    const idxFile = P.p('assets', 'indexes', idx.id + '.json');
    await download(idx.url, idxFile, { size: idx.size, sha1: idx.sha1 });
    const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
    const objs = Object.values(index.objects || {});
    let adone = 0;
    progress({ text: 'Ресурсы игры', pct: 0 });
    await pool(objs, 48, async (o) => {
      const h = o.hash;
      await download(`https://resources.download.minecraft.net/${h.slice(0, 2)}/${h}`, P.p('assets', 'objects', h.slice(0, 2), h), { size: o.size });
      adone++;
      if (adone % 20 === 0 || adone === objs.length) {
        progress({ text: `Ресурсы ${adone}/${objs.length}`, pct: Math.round((adone / objs.length) * 100) });
      }
    });
  }

  // конфиг логирования (защита от Log4Shell на старых версиях)
  const lc = v.logging && v.logging.client && v.logging.client.file;
  if (lc) {
    await download(lc.url, P.p('assets', 'log_configs', lc.id), { size: lc.size, sha1: lc.sha1 });
  }
  try { fs.mkdirSync(path.dirname(ready), { recursive: true }); fs.writeFileSync(ready, String(Date.now())); } catch {}
  return v;
}

function extractNatives(v, dir) {
  const stamp = path.join(dir, '.done');
  if (fs.existsSync(stamp)) return;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const lib of v.libraries) {
    for (const f of libraryFiles(lib)) {
      if (!f.native) continue;
      const AdmZip = require('adm-zip'); const zip = new AdmZip(P.p('libraries', f.path));
      for (const e of zip.getEntries()) {
        if (e.isDirectory) continue;
        const n = e.entryName;
        if (n.startsWith('META-INF') || (f.exclude || []).some((x) => n.startsWith(x))) continue;
        fs.writeFileSync(path.join(dir, path.basename(n)), e.getData());
      }
    }
  }
  fs.writeFileSync(stamp, '1');
}

function buildClasspath(v) {
  const seen = new Set();
  const list = [];
  for (const lib of v.libraries) {
    for (const f of libraryFiles(lib)) {
      if (!f.cp) continue;
      const full = P.p('libraries', f.path);
      if (seen.has(full)) continue;
      seen.add(full);
      list.push(full);
    }
  }
  list.push(P.p('versions', v.jarId, v.jarId + '.jar'));
  return list;
}

// Старые версии (до 1.6): ресурсы копируются в виртуальную папку / в папку игры
function prepareLegacyAssets(v, gameDir) {
  const assetsRoot = P.p('assets');
  if (!v.assetIndex) return assetsRoot;
  const idx = JSON.parse(fs.readFileSync(P.p('assets', 'indexes', v.assetIndex.id + '.json'), 'utf8'));
  if (!idx.virtual && !idx.map_to_resources) return assetsRoot;
  const dest = idx.map_to_resources ? path.join(gameDir, 'resources') : P.p('assets', 'virtual', v.assetIndex.id);
  for (const [name, o] of Object.entries(idx.objects)) {
    const src = P.p('assets', 'objects', o.hash.slice(0, 2), o.hash);
    const out = path.join(dest, name);
    if (!fs.existsSync(out)) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(src, out);
    }
  }
  return idx.virtual ? P.p('assets', 'virtual', v.assetIndex.id) : assetsRoot;
}

/* ---------- Java ---------- */
async function ensureJava(component, progress = () => {}) {
  const dir = P.p('runtime', component);
  const exe = path.join(dir, 'bin', 'java.exe');
  const ok = path.join(dir, '.ok');
  if (fs.existsSync(exe) && fs.existsSync(ok)) return exe;

  progress({ text: 'Скачиваю Java (' + component + ')', pct: 0 });
  const all = await fetchJson(JAVA_ALL_URL);
  const plat = process.arch === 'ia32' ? 'windows-x86' : process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  const entry = (all[plat] && all[plat][component] && all[plat][component][0]) || (all['windows-x64'][component] && all['windows-x64'][component][0]);
  if (!entry) throw new Error('Нет Java-рантайма ' + component + ' для Windows');
  const man = await fetchJson(entry.manifest.url);
  const entries = Object.entries(man.files);
  for (const [name, f] of entries) {
    if (f.type === 'directory') fs.mkdirSync(path.join(dir, name), { recursive: true });
  }
  const files = entries.filter(([, f]) => f.type === 'file');
  let done = 0;
  await pool(files, 16, async ([name, f]) => {
    const raw = f.downloads.raw;
    await download(raw.url, path.join(dir, name), { size: raw.size, sha1: raw.sha1 });
    done++;
    if (done % 10 === 0 || done === files.length) {
      progress({ text: `Java ${done}/${files.length}`, pct: Math.round((done / files.length) * 100) });
    }
  });
  fs.writeFileSync(ok, 'ok');
  return exe;
}

/* ---------- аргументы запуска ---------- */
function substitute(s, vars) {
  return s.replace(/\$\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function collectArgs(list, features = {}) {
  const out = [];
  for (const a of list || []) {
    if (typeof a === 'string') out.push(a);
    else if (ruleOk(a.rules, features)) {
      if (Array.isArray(a.value)) out.push(...a.value);
      else out.push(a.value);
    }
  }
  return out;
}

function buildArgs(v, ctx) {
  const vars = {
    auth_player_name: ctx.name,
    version_name: v.id,
    game_directory: ctx.gameDir,
    assets_root: ctx.assetsRoot,
    game_assets: ctx.assetsRoot,
    assets_index_name: (v.assetIndex && v.assetIndex.id) || v.assets || 'legacy',
    auth_uuid: ctx.uuid,
    auth_access_token: ctx.token,
    auth_session: `token:${ctx.token}:${ctx.uuid}`,
    clientid: '',
    auth_xuid: '',
    user_type: ctx.userType,
    user_properties: '{}',
    version_type: v.type || 'release',
    natives_directory: ctx.natives,
    launcher_name: 'BlockForge',
    launcher_version: '1.0',
    classpath: ctx.classpath.join(';'),
    classpath_separator: ';',
    library_directory: P.p('libraries'),
  };

  let jvm;
  let game;
  if (v.arguments) {
    jvm = collectArgs(v.arguments.jvm);
    game = collectArgs(v.arguments.game);
  } else {
    jvm = ['-Djava.library.path=${natives_directory}', '-Dminecraft.launcher.brand=${launcher_name}', '-Dminecraft.launcher.version=${launcher_version}', '-cp', '${classpath}'];
    game = String(v.minecraftArguments || '').split(' ').filter(Boolean);
  }
  if (!jvm.includes('-cp') && !jvm.includes('-classpath')) jvm.push('-cp', '${classpath}');
  if (!jvm.some((a) => String(a).startsWith('-Djava.library.path'))) jvm.unshift('-Djava.library.path=${natives_directory}');

  const lc = v.logging && v.logging.client;
  if (lc && lc.argument && lc.file) {
    jvm.push(lc.argument.replace('${path}', P.p('assets', 'log_configs', lc.file.id)));
  }

  return {
    jvm: jvm.map((a) => substitute(String(a), vars)),
    game: game.map((a) => substitute(String(a), vars)),
    mainClass: v.mainClass,
  };
}

module.exports = {
  getManifest, installVanillaMeta, resolveVersion, versionJsonPath, prepare, extractNatives,
  buildClasspath, prepareLegacyAssets, ensureJava, buildArgs, ruleOk, libraryFiles, mavenPath, dedupeLibs, collectArgs,
};
