// Свой Minecraft-сервер на этом компьютере (Paper). Режим online-mode=false, чтобы заходили и с пиратских аккаунтов.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const MC = require('./minecraft');
const { fetchJson, download } = require('./util');

const MODES = {
  survival: { 'spawn-protection': 16, difficulty: 'normal', pvp: 'true', gamemode: 'survival', 'allow-flight': 'false', 'force-gamemode': 'false', 'spawn-monsters': 'true', 'spawn-animals': 'true' },
  anarchy: { 'spawn-protection': 0, difficulty: 'hard', pvp: 'true', gamemode: 'survival', 'allow-flight': 'true', 'view-distance': 10, 'force-gamemode': 'false', 'spawn-monsters': 'true', 'spawn-animals': 'true' },
  minigames: { 'spawn-protection': 0, difficulty: 'normal', pvp: 'false', gamemode: 'adventure', 'force-gamemode': 'true', 'allow-flight': 'true', 'spawn-monsters': 'false', 'spawn-animals': 'false' },
};
const MAPI = 'https://api.modrinth.com/v2';

let proc = null;
let startedVersion = '';
const dir = () => P.p('myserver');

function setProps(file, patch) {
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch {}
  const left = { ...patch };
  lines = lines.map((l) => {
    const m = l.match(/^([^#=\s][^=]*)=/);
    if (m && m[1] in left) { const v = left[m[1]]; delete left[m[1]]; return m[1] + '=' + v; }
    return l;
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const k in left) lines.push(k + '=' + left[k]);
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

async function paperUrl(version) {
  const builds = await fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds`);
  const b = (Array.isArray(builds) ? builds : []).find((x) => x.channel === 'STABLE' && x.downloads && x.downloads['server:default']);
  if (!b) throw new Error('Для Minecraft ' + version + ' пока нет стабильной сборки Paper. Выбери версию поновее.');
  const d = b.downloads['server:default'];
  return { url: d.url, build: b.id, size: d.size, sha256: d.checksums && d.checksums.sha256 };
}

async function paperVersions() {
  const j = await fetchJson('https://fill.papermc.io/v3/projects/paper');
  const out = [];
  for (const g of Object.values(j.versions || {})) out.push(...g);
  return out; // новые первыми
}

function localIps() {
  const r = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) r.push(n.address);
  return r;
}

function status() {
  const meta = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir(), 'meta.json'), 'utf8')); } catch { return null; } })();
  return { running: !!proc, version: startedVersion || (meta && meta.version) || '', installed: meta, ips: localIps(), dir: dir() };
}

async function start(opts, hooks) {
  if (proc) throw new Error('Сервер уже запущен');
  const { log, progress, javaPath } = hooks;
  if (!opts.eula) throw new Error('Нужно принять условия Minecraft EULA (галочка)');
  const version = String(opts.version || '');
  if (!version) throw new Error('Выбери версию сервера');
  fs.mkdirSync(dir(), { recursive: true });
  const jar = path.join(dir(), 'paper.jar'), metaF = path.join(dir(), 'meta.json');
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(metaF, 'utf8')); } catch {}
  if (!fs.existsSync(jar) || !meta || meta.version !== version) {
    progress({ text: 'Скачиваю сервер Paper ' + version, pct: 10 });
    const info = await paperUrl(version);
    try { fs.unlinkSync(jar); } catch {}
    await download(info.url, jar, { size: info.size });
    fs.writeFileSync(metaF, JSON.stringify({ version, build: info.build }));
  }
  const vm = await MC.installVanillaMeta(version);
  const comp = (vm.javaVersion && vm.javaVersion.component) || 'java-runtime-gamma';
  const javaExe = javaPath || (await MC.ensureJava(comp, progress));

  fs.writeFileSync(path.join(dir(), 'eula.txt'), 'eula=true\n');
  setProps(path.join(dir(), 'server.properties'), {
    'online-mode': 'false',
    'motd': String(opts.name || 'BlockForge Server').replace(/[\r\n=]/g, ' ').slice(0, 60),
    'max-players': String(Math.max(1, Math.min(500, Number(opts.maxPlayers) || 20))),
    'server-port': '25565',
    ...(MODES[opts.mode] || MODES.survival),
  });
  const ram = Math.max(1024, Number(opts.ram) || 2048);
  progress({ text: 'Запускаю сервер', pct: 100 });
  startedVersion = version;
  proc = spawn(javaExe, [`-Xmx${ram}M`, `-Xms${Math.min(1024, ram)}M`, '-jar', 'paper.jar', 'nogui'], { cwd: dir(), windowsHide: true });
  const out = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => log(l));
  proc.stdout.on('data', out);
  proc.stderr.on('data', out);
  proc.on('error', (e) => { log('Ошибка запуска сервера: ' + e.message); proc = null; hooks.onExit(-1); });
  proc.on('close', (code) => { proc = null; hooks.onExit(code); });
  return status();
}

function command(cmd) {
  if (!proc) throw new Error('Сервер не запущен');
  proc.stdin.write(String(cmd).replace(/[\r\n]/g, ' ') + '\n');
  return true;
}

function stop() {
  if (!proc) return true;
  const p = proc;
  try { p.stdin.write('stop\n'); } catch {}
  setTimeout(() => { try { p.kill(); } catch {} }, 25000);
  return true;
}

/* ---------- плагины сервера (Modrinth) ---------- */
const pluginsDir = () => path.join(dir(), 'plugins');
async function pluginSearch(query, version) {
  const facets = [['project_type:plugin']];
  if (version) facets.push([`versions:${version}`]);
  const r = await fetchJson(`${MAPI}/search?query=${encodeURIComponent(query || '')}&limit=15&index=${query ? 'relevance' : 'downloads'}&facets=${encodeURIComponent(JSON.stringify(facets))}`);
  return r.hits.map((h) => ({ id: h.project_id, title: h.title, description: h.description, downloads: h.downloads, author: h.author }));
}
async function pluginInstall(projectId, version) {
  const params = new URLSearchParams({ game_versions: JSON.stringify([version]), loaders: JSON.stringify(['paper', 'spigot', 'bukkit', 'purpur']) });
  const vers = await fetchJson(`${MAPI}/project/${projectId}/version?${params}`);
  if (!vers.length) throw new Error('Нет версии этого плагина под Minecraft ' + version + '. Попробуй другую версию сервера.');
  const f = vers[0].files.find((x) => x.primary) || vers[0].files[0];
  if (!f) throw new Error('У плагина нет файлов');
  await download(f.url, path.join(pluginsDir(), f.filename), { size: f.size });
  return f.filename;
}
function pluginList() {
  try { return fs.readdirSync(pluginsDir()).filter((f) => /\.jar(\.disabled)?$/i.test(f)); } catch { return []; }
}
function pluginRemove(f) {
  if (f !== path.basename(f)) throw new Error('Некорректное имя файла');
  fs.rmSync(path.join(pluginsDir(), f), { force: true });
  return true;
}

module.exports = { pluginSearch, pluginInstall, pluginList, pluginRemove, MODES, start, stop, command, status, paperVersions, setProps };
