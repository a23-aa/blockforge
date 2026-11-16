const MC = require('./minecraft');
const Loaders = require('./loaders');
const { fetchJson } = require('./util');

const PRESETS = [
  { id: 'vanilla', name: 'Чистая игра', tag: 'Классика', kind: 'gold', loader: 'vanilla', mods: [], desc: 'Обычный Minecraft без модов' },
  { id: 'fps', name: 'Оптимизация', tag: 'FPS', kind: 'green', loader: 'fabric', mods: ['sodium', 'lithium', 'ferrite-core', 'entityculling'], desc: 'Fabric + Sodium, Lithium и другие моды для высокого FPS' },
  { id: 'visual', name: 'Красота', tag: 'Графика', kind: 'violet', loader: 'fabric', mods: ['sodium', 'iris', 'lithium'], desc: 'Fabric + Iris для шейдеров' },
  { id: 'survival', name: 'Удобство', tag: 'Выживание', kind: 'blue', loader: 'fabric', mods: ['xaeros-minimap', 'appleskin', 'mouse-tweaks', 'jade'], desc: 'Мини-карта и полезные подсказки для выживания' },
];

function list() {
  return PRESETS.map(({ mods, ...r }) => ({ ...r, modCount: mods.length }));
}
function get(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error('Сборка не найдена');
  return p;
}

async function hasMod(slug, mc, loader) {
  try {
    const q = new URLSearchParams({ game_versions: JSON.stringify([mc]), loaders: JSON.stringify([loader]) });
    const v = await fetchJson(`https://api.modrinth.com/v2/project/${slug}/version?${q}`);
    return v.length > 0;
  } catch { return false; }
}

// Находит свежую версию игры, под которую есть загрузчик и все моды набора
async function pick(p) {
  const m = await MC.getManifest();
  const releases = m.versions.filter((v) => v.type === 'release').slice(0, 10);
  if (p.loader === 'vanilla') return { mc: releases[0].id, lv: null };
  for (const r of releases) {
    let lv = null;
    try {
      const l = await Loaders.listVersions(p.loader, r.id);
      const s = l.find((x) => x.stable) || l[0];
      lv = s && s.id;
    } catch {}
    if (!lv) continue;
    const ok = await Promise.all(p.mods.map((s) => hasMod(s, r.id, p.loader)));
    if (ok.every(Boolean)) return { mc: r.id, lv };
  }
  throw new Error('Не удалось подобрать версию игры для этого набора');
}

module.exports = { list, get, pick };
