const crypto = require('crypto');
const { UA, sleep } = require('./util');

const TENANT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';

function offlineUuid(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  return h.toString('hex');
}

async function form(url, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams(params),
  });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}

async function postJson(url, body, headers = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, ...headers },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.body = j; e.status = r.status; throw e; }
  return j;
}

async function beginDevice(clientId) {
  const { ok, json } = await form(`${TENANT}/devicecode`, { client_id: clientId, scope: SCOPE });
  if (!ok) throw new Error(json.error_description || 'Не удалось начать вход. Проверь Client ID.');
  return json;
}

async function pollDevice(clientId, dev, cancel) {
  const end = Date.now() + dev.expires_in * 1000;
  let iv = (dev.interval || 5) * 1000;
  while (Date.now() < end) {
    if (cancel.cancelled) throw new Error('Вход отменён');
    await sleep(iv);
    if (cancel.cancelled) throw new Error('Вход отменён');
    const { ok, json } = await form(`${TENANT}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: dev.device_code,
    });
    if (ok) return json;
    if (json.error === 'authorization_pending') continue;
    if (json.error === 'slow_down') { iv += 5000; continue; }
    throw new Error(json.error_description || json.error || 'Ошибка входа');
  }
  throw new Error('Время ожидания входа истекло');
}

async function refreshMs(clientId, refreshToken) {
  const { ok, json } = await form(`${TENANT}/token`, {
    grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, scope: SCOPE,
  });
  if (!ok) throw new Error('Сессия Microsoft истекла — войди заново');
  return json;
}

const XERR = {
  2148916233: 'У этого аккаунта Microsoft нет профиля Xbox. Создай его на xbox.com.',
  2148916235: 'Xbox Live недоступен в твоей стране.',
  2148916238: 'Детский аккаунт: нужно добавить его в семейную группу взрослым.',
};

// access_token Microsoft -> токен Minecraft + профиль
async function msToMinecraft(msAccessToken) {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + msAccessToken },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });
  let xsts;
  try {
    xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    });
  } catch (e) {
    const code = e.body && e.body.XErr;
    if (code && XERR[code]) throw new Error(XERR[code]);
    throw e;
  }
  const uhs = xsts.DisplayClaims.xui[0].uhs;
  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`,
  });
  const pr = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: 'Bearer ' + mc.access_token, 'User-Agent': UA },
  });
  if (pr.status === 404) throw new Error('На этом аккаунте нет Minecraft Java Edition.');
  if (!pr.ok) throw new Error('Не удалось получить профиль Minecraft (HTTP ' + pr.status + ')');
  const prof = await pr.json();
  return {
    mcToken: mc.access_token,
    mcExpires: Date.now() + (mc.expires_in || 86400) * 1000,
    name: prof.name,
    uuid: prof.id,
  };
}

async function loginFromMsTokens(tokens) {
  const mc = await msToMinecraft(tokens.access_token);
  return { id: 'ms-' + mc.uuid, type: 'microsoft', name: mc.name, uuid: mc.uuid, mcToken: mc.mcToken, mcExpires: mc.mcExpires, msRefresh: tokens.refresh_token };
}

// Обновляет токен аккаунта при необходимости, возвращает актуальный аккаунт
async function ensureFresh(account, clientId) {
  if (account.type !== 'microsoft') return account;
  if (account.mcExpires && account.mcExpires - Date.now() > 120000) return account;
  if (!clientId) throw new Error('Укажи Client ID Microsoft в настройках');
  const tokens = await refreshMs(clientId, account.msRefresh);
  const fresh = await loginFromMsTokens(tokens);
  return { ...account, ...fresh, msRefresh: tokens.refresh_token || account.msRefresh };
}

module.exports = { offlineUuid, beginDevice, pollDevice, loginFromMsTokens, ensureFresh };
