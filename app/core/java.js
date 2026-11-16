// Java: поиск установленных версий, проверка, скачивание нужной (то, что использует сам Minecraft).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const P = require('./paths');
const MC = require('./minecraft');

// компоненты Java из Mojang и для каких версий игры они нужны
const COMPONENTS = {
  'jre-legacy': { major: 8, hint: 'Minecraft до 1.16' },
  'java-runtime-alpha': { major: 16, hint: 'Minecraft 1.17' },
  'java-runtime-gamma': { major: 17, hint: 'Minecraft 1.18 – 1.20.4' },
  'java-runtime-delta': { major: 21, hint: 'Minecraft 1.20.5 и новее' },
};
const EXE = process.platform === 'win32' ? 'java.exe' : 'java';

function parseMajor(text) {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(text) || /openjdk (\d+)/.exec(text);
  if (!m) return 0;
  return m[1] === '1' ? Number(m[2] || 8) : Number(m[1]);
}

function test(exe) {
  return new Promise((res) => {
    if (!exe || !fs.existsSync(exe)) return res({ ok: false, error: 'Файл не найден' });
    execFile(exe, ['-version'], { timeout: 8000, windowsHide: true }, (err, so, se) => {
      const out = String(se || '') + String(so || '');
      const major = parseMajor(out);
      if (!major) return res({ ok: false, error: 'Это не похоже на Java' });
      const v = /version "([^"]+)"/.exec(out);
      res({ ok: true, major, version: v ? v[1] : String(major), is64: /64-Bit/i.test(out) });
    });
  });
}

function candidates() {
  const found = new Set();
  const add = (p) => { try { if (p && fs.existsSync(p)) found.add(path.normalize(p)); } catch {} };
  if (process.env.JAVA_HOME) add(path.join(process.env.JAVA_HOME, 'bin', EXE));
  for (const d of String(process.env.PATH || '').split(path.delimiter)) if (d) add(path.join(d, EXE));
  const roots = [];
  for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean)) {
    for (const v of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto', 'Semeru', 'AdoptOpenJDK']) roots.push(path.join(pf, v));
  }
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Eclipse Adoptium'));
  roots.push(path.join(process.env.APPDATA || '', '.minecraft', 'runtime'));
  for (const r of roots) {
    let list = [];
    try { list = fs.readdirSync(r); } catch { continue; }
    for (const d of list) add(path.join(r, d, 'bin', EXE));
  }
  return [...found];
}

// установленные лаунчером и найденные в системе
async function list() {
  const installed = [];
  for (const [component, info] of Object.entries(COMPONENTS)) {
    const dir = P.p('runtime', component);
    const exe = path.join(dir, 'bin', EXE);
    installed.push({ component, major: info.major, hint: info.hint, installed: fs.existsSync(exe) && fs.existsSync(path.join(dir, '.ok')), path: exe });
  }
  const system = [];
  const seenReal = new Set();
  for (const exe of candidates()) {
    let real = exe; try { real = fs.realpathSync(exe); } catch {}
    if (seenReal.has(real.toLowerCase())) continue;
    seenReal.add(real.toLowerCase());
    const t = await test(exe);
    if (t.ok) system.push({ path: exe, major: t.major, version: t.version });
  }
  return { installed, system };
}

async function download(component, progress) {
  if (!COMPONENTS[component]) throw new Error('Неизвестная версия Java');
  const exe = await MC.ensureJava(component, progress);
  return { path: exe };
}

module.exports = { COMPONENTS, test, list, download, parseMajor };
