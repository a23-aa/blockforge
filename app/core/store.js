const fs = require('fs');
const path = require('path');
const os = require('os');

let dir = '';
let safe = null;

function init(userData, safeStorage) {
  dir = userData;
  safe = safeStorage || null;
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(f, def) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return def; }
}
function writeJson(f, d) {
  fs.writeFileSync(path.join(dir, f), JSON.stringify(d, null, 2));
}

function defaults() {
  const totalMb = Math.floor(os.totalmem() / 1048576);
  const ram = Math.min(4096, Math.max(2048, Math.floor(totalMb / 2 / 512) * 512));
  return { ram, javaPath: '', msClientId: '', buyUrl: '', serverName: '', serverAddr: '', apiUrl: 'http://127.0.0.1:3000', afterLaunch: 'hide', ownerMode: false, trTarget: 'en' };
}

function getConfig() { return { ...defaults(), ...readJson('config.json', {}) }; }
function setConfig(patch) {
  const c = { ...getConfig(), ...patch };
  writeJson('config.json', c);
  return c;
}

function getInstances() { return readJson('instances.json', []); }
function saveInstances(list) { writeJson('instances.json', list); }

// Аккаунты (токены) шифруются средствами ОС (DPAPI на Windows), если доступно.
function getAccounts() {
  const f = path.join(dir, 'accounts.bin');
  try {
    const raw = fs.readFileSync(f);
    const text = safe && safe.isEncryptionAvailable() ? safe.decryptString(raw) : raw.toString('utf8');
    const j = JSON.parse(text);
    return { accounts: j.accounts || [], selected: j.selected || null };
  } catch {
    return { accounts: [], selected: null };
  }
}
function saveAccounts(data) {
  const s = JSON.stringify(data);
  const buf = safe && safe.isEncryptionAvailable() ? safe.encryptString(s) : Buffer.from(s, 'utf8');
  fs.writeFileSync(path.join(dir, 'accounts.bin'), buf);
}

// сессия аккаунта BlockForge (токен) — тоже шифруется
function getSession() {
  try {
    const raw = fs.readFileSync(path.join(dir, 'session.bin'));
    return JSON.parse(safe && safe.isEncryptionAvailable() ? safe.decryptString(raw) : raw.toString('utf8'));
  } catch { return null; }
}
function saveSession(sess) {
  const f = path.join(dir, 'session.bin');
  if (!sess) { try { fs.unlinkSync(f); } catch {} return; }
  const s = JSON.stringify(sess);
  fs.writeFileSync(f, safe && safe.isEncryptionAvailable() ? safe.encryptString(s) : Buffer.from(s, 'utf8'));
}

module.exports = { getSession, saveSession, init, getConfig, setConfig, getInstances, saveInstances, getAccounts, saveAccounts };
