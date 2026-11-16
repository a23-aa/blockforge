const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const UA = 'BlockForge/1.0 (minecraft launcher)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function netError(e, url) {
  let host = url;
  try { host = new URL(url).host; } catch {}
  const code = (e && e.cause && e.cause.code) || (e && e.code) || '';
  return new Error(`Нет соединения с ${host}${code ? ' (' + code + ')' : ''}. Проверь интернет. Если сайт заблокирован провайдером, включи VPN и повтори.`);
}
const isNet = (e) => e && (e.message === 'fetch failed' || (e.cause && e.cause.code) || e.name === 'TimeoutError');

async function fetchJson(url, opts = {}) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(25000) });
      if (r.status === 429 || r.status >= 500) { last = new Error(`Сервер ответил ${r.status} — ${url}`); await sleep(800 * (i + 1)); continue; }
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} — ${url}`), { http: r.status });
      return await r.json();
    } catch (e) {
      if (e.http) throw e;
      last = isNet(e) ? netError(e, url) : e;
      await sleep(600 * (i + 1));
    }
  }
  throw last;
}

async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} — ${url}`), { http: r.status });
    return await r.text();
  } catch (e) {
    throw e.http ? e : isNet(e) ? netError(e, url) : e;
  }
}

// Скачивает файл. Если файл уже есть и размер совпадает — пропускает.
async function download(url, dest, { size, sha1, retries = 3 } = {}) {
  try {
    const st = await fsp.stat(dest);
    if (st.isFile() && st.size > 0 && (size === undefined || st.size === size)) return false;
  } catch {}
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (sha1) {
        const h = crypto.createHash('sha1').update(buf).digest('hex');
        if (h !== sha1) throw new Error('контрольная сумма не совпала');
      }
      const tmp = dest + '.part';
      await fsp.writeFile(tmp, buf);
      await fsp.rename(tmp, dest);
      return true;
    } catch (e) {
      lastErr = isNet(e) ? netError(e, url) : e;
      await sleep(500 * (i + 1));
    }
  }
  if (lastErr.message.startsWith('Нет соединения')) throw lastErr;
  throw new Error(`Не удалось скачать ${url}: ${lastErr.message}`);
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

module.exports = { UA, fetchJson, fetchText, download, pool, sleep };
