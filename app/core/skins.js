const { fetchJson, UA } = require('./util');

// Скин игрока по нику (официальные API Mojang)
async function fetchByName(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Некорректный ник');
  let p;
  try { p = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${name}`); } catch (e) {
    if (e.http === 404 || e.http === 204) throw new Error('Игрок с таким ником не найден');
    throw e;
  }
  if (!p || !p.id) throw new Error('Игрок с таким ником не найден');
  const prof = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${p.id}`);
  const prop = (prof.properties || []).find((x) => x.name === 'textures');
  if (!prop) throw new Error('У игрока нет скина');
  const tex = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
  const skin = tex.textures && tex.textures.SKIN;
  if (!skin) throw new Error('У игрока стандартный скин (своего нет)');
  const u = new URL(skin.url);
  if (u.hostname !== 'textures.minecraft.net') throw new Error('Подозрительный адрес скина');
  const r = await fetch(skin.url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('Не удалось скачать скин (HTTP ' + r.status + ')');
  const buf = Buffer.from(await r.arrayBuffer());
  return { name: prof.name, slim: !!(skin.metadata && skin.metadata.model === 'slim'), data: 'data:image/png;base64,' + buf.toString('base64') };
}

// Загрузка скина в лицензионный аккаунт
async function upload(mcToken, dataUrl, slim) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Нужен PNG-файл');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.length > 200000) throw new Error('Странный размер файла скина');
  const fd = new FormData();
  fd.append('variant', slim ? 'slim' : 'classic');
  fd.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png');
  const r = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST', headers: { Authorization: 'Bearer ' + mcToken, 'User-Agent': UA }, body: fd,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Mojang не принял скин (HTTP ${r.status}). ${t.slice(0, 140)}`);
  }
  return true;
}

module.exports = { fetchByName, upload };
