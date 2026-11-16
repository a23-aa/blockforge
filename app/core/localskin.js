// Скин для офлайн-аккаунта: лаунчер собирает маленький ресурспак, который заменяет стандартные скины.
// Так твой скин виден тебе самому в одиночной игре и на любом сервере (другие игроки видят свои скины).
const fs = require('fs');
const path = require('path');
const P = require('./paths');

const PACK = 'BlockForgeSkin.zip';
const NAMES = ['steve', 'alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'sunny', 'zuri'];

function file() { return P.p('local-skin.png'); }
function has() { return fs.existsSync(file()); }

function save(dataUrl) {
  const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Нужен PNG-скин');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 200000) throw new Error('Файл скина слишком большой');
  fs.writeFileSync(file(), buf);
}
function clear() { try { fs.unlinkSync(file()); } catch {} }

// версия игры -> pack_format
function packFormat(v) {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(String(v));
  if (!m) return 64;
  const mi = Number(m[1]), pa = Number(m[2] || 0);
  if (mi <= 16) return 6;
  if (mi === 17) return 7;
  if (mi === 18) return 8;
  if (mi === 19) return pa >= 4 ? 13 : pa === 3 ? 12 : 9;
  if (mi === 20) return pa >= 5 ? 32 : pa >= 3 ? 22 : pa === 2 ? 18 : 15;
  if (mi === 21) return pa >= 7 ? 64 : pa === 6 ? 63 : pa === 5 ? 55 : pa === 4 ? 46 : pa >= 2 ? 42 : 34;
  return 64;
}

// минимальная запись zip (без сжатия), чтобы не зависеть от сторонних пакетов
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(entries) {
  const locals = [], central = [];
  let off = 0;
  for (const [name, data] of entries) {
    const nm = Buffer.from(name, 'utf8'), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

function buildPack(gameDir, mcVersion) {
  const png = fs.readFileSync(file());
  const fmt = packFormat(mcVersion);
  const entries = [['pack.mcmeta', Buffer.from(JSON.stringify({ pack: { pack_format: fmt, supported_formats: { min_inclusive: 1, max_inclusive: 999 }, description: 'BlockForge: твой скин' } }))]];
  for (const n of NAMES) {
    entries.push([`assets/minecraft/textures/entity/player/wide/${n}.png`, png]);
    entries.push([`assets/minecraft/textures/entity/player/slim/${n}.png`, png]);
  }
  entries.push(['assets/minecraft/textures/entity/steve.png', png], ['assets/minecraft/textures/entity/alex.png', png]); // до 1.19.3
  const dir = path.join(gameDir, 'resourcepacks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PACK), makeZip(entries));
}

function setOptions(gameDir, on) {
  const f = path.join(gameDir, 'options.txt'), entry = 'file/' + PACK;
  let lines = [];
  try { lines = fs.readFileSync(f, 'utf8').split(/\r?\n/); } catch {}
  let found = false;
  lines = lines.map((l) => {
    if (!l.startsWith('resourcePacks:')) return l;
    found = true;
    let arr = [];
    try { arr = JSON.parse(l.slice('resourcePacks:'.length)); } catch { arr = ['vanilla']; }
    arr = arr.filter((x) => x !== entry);
    if (on) arr.push(entry);
    return 'resourcePacks:' + JSON.stringify(arr);
  });
  if (!found && on) lines.unshift('resourcePacks:' + JSON.stringify(['vanilla', entry]));
  fs.writeFileSync(f, lines.filter((l, i, a) => l !== '' || i < a.length - 1).join('\n') + '\n');
}

// вызывается перед запуском игры
function apply(gameDir, mcVersion, account) {
  try {
    if (account && account.type === 'offline' && has()) { buildPack(gameDir, mcVersion); setOptions(gameDir, true); return true; }
    if (fs.existsSync(path.join(gameDir, 'resourcepacks', PACK))) { fs.rmSync(path.join(gameDir, 'resourcepacks', PACK), { force: true }); setOptions(gameDir, false); }
  } catch (e) { /* скин не критичен для запуска */ }
  return false;
}

module.exports = { save, clear, has, apply, packFormat };
